import { createServer } from 'node:http';
import { realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_BASE_URLS = [
  'https://ollama.com/v1', 'https://api.moonshot.ai/v1',
  'https://api.openai.com/v1', 'https://openrouter.ai/api/v1',
  'https://api.z.ai/api/paas/v4', 'https://api.anthropic.com/v1',
];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
};
const FORWARD_HEADERS = ['authorization', 'content-type', 'accept', 'x-api-key', 'anthropic-version'];

// Refusals the server makes itself (as opposed to a forwarded provider
// reply) carry this code so the browser does not read a 403 as a bad key.
export const POLICY_CODE = 'schematica_policy';
function error(status, message, code) { return Object.assign(new Error(message), { status, code }); }
function json(res, status, message, code) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ error: code ? { message, code } : { message } }));
}

function parseBase(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('AI_BASE_URLS must contain HTTP(S) base URLs without credentials, queries, or fragments.');
  }
  return url.href.replace(/\/+$/, '');
}

// Exact endpoint matches prevent requests to arbitrary paths, internal hosts,
// provider redirects, or a hostname that merely contains an allowed name.
function targetFor(req, allowed) {
  let url;
  try { url = new URL(req.headers['x-schematica-target']); } catch { throw error(400, 'A valid provider URL is required.'); }
  if (url.username || url.password || url.search || url.hash) throw error(400, 'Provider URLs cannot contain credentials, queries, or fragments.');
  const endpoints = req.method === 'GET' ? ['/models'] : ['/chat/completions', '/messages'];
  if (!allowed.some((base) => endpoints.some((suffix) => url.href === base + suffix))) {
    throw error(403, 'This provider endpoint is not enabled on this server. Ask the operator to add its Base URL to AI_BASE_URLS.', POLICY_CODE);
  }
  return url.href;
}

async function readBody(req, limit) {
  const size = Number(req.headers['content-length']);
  if (size > limit) throw error(413, 'The assistant request is too large. Reduce the attached context.');
  const chunks = [];
  let bytes = 0;
  // Do not destroy the socket on an oversized chunk: return a readable 413.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > limit) { req.resume(); throw error(413, 'The assistant request is too large. Reduce the attached context.'); }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  try { JSON.parse(body.toString('utf8')); } catch { throw error(400, 'The assistant request must be valid JSON.'); }
  return body;
}

export function createAppServer({
  root = ROOT, fetchImpl = globalThis.fetch, baseUrls = DEFAULT_BASE_URLS,
  publicOrigin = '', maxBodyBytes = 8 * 1024 * 1024, timeoutMs = 120_000, idleTimeoutMs = 120_000, maxConcurrent = 16,
} = {}) {
  const allowed = baseUrls.map(parseBase);
  const publicUrl = publicOrigin ? new URL(publicOrigin) : null;
  if (publicUrl && (!['https:', 'http:'].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password
    || publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash)) throw new Error('PUBLIC_ORIGIN must be a website origin, such as https://schematica.example.com.');
  let active = 0;
  const publicRoot = realpath(root);

  const server = createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'same-origin');
    try {
      // Never trust forwarded Host/Origin headers. A public deployment has
      // an explicitly configured origin; local mode accepts loopback hosts.
      const host = req.headers.host;
      const localHosts = ['localhost', '127.0.0.1', '[::1]'].map((h) => `${h}:${req.socket.localPort}`);
      if (publicUrl ? host !== publicUrl.host : !localHosts.includes(host)) throw error(421, 'This host is not configured. Set PUBLIC_ORIGIN for public deployments.');
      const origin = publicUrl?.origin || `http://${host}`;
      const url = new URL(req.url, origin);

      if (url.pathname === '/api/ai') {
        if (!['GET', 'POST'].includes(req.method)) throw error(405, 'Only GET and POST are supported.');
        if (req.headers['x-schematica-client'] !== '1'
          || (req.headers.origin && req.headers.origin !== origin)
          || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) {
          throw error(403, 'Use the assistant from this website. Cross-origin API access is not enabled.', POLICY_CODE);
        }
        const target = targetFor(req, allowed);
        if (req.method === 'POST' && !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw error(415, 'Use application/json for assistant requests.');
        if (req.method === 'POST' && !req.headers.authorization && !req.headers['x-api-key']) throw error(401, 'Enter your provider API key in assistant settings.');
        if (active >= maxConcurrent) { res.setHeader('retry-after', '5'); throw error(429, 'The assistant server is busy. Try again shortly.'); }
        active++;
        const controller = new AbortController();
        let timedOut = false;
        // A total cap covers reading the body and waiting for the provider's
        // headers; once the reply streams, only silence between chunks times
        // out, so a long reply that keeps arriving is never cut mid-stream.
        let timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
        const rearm = () => { clearTimeout(timer); timer = setTimeout(() => { timedOut = true; controller.abort(); }, idleTimeoutMs); };
        const disconnected = () => controller.abort();
        req.on('aborted', disconnected);
        res.on('close', disconnected);
        try {
          const body = req.method === 'POST' ? await readBody(req, maxBodyBytes) : undefined;
          const headers = new Headers();
          for (const name of FORWARD_HEADERS) if (req.headers[name]) headers.set(name, req.headers[name]);
          const upstream = await fetchImpl(target, { method: req.method, headers, body, redirect: 'manual', signal: controller.signal });
          if (upstream.status >= 300 && upstream.status < 400) {
            await upstream.body?.cancel();
            throw error(502, 'The provider redirected the request. Update its Base URL in assistant settings.');
          }
          res.statusCode = upstream.status;
          res.setHeader('cache-control', 'no-store');
          res.setHeader('x-accel-buffering', 'no');
          for (const name of ['content-type', 'retry-after', 'x-request-id']) {
            const value = upstream.headers.get(name);
            if (value) res.setHeader(name, value);
          }
          res.flushHeaders();
          rearm();
          if (upstream.body) {
            const heartbeat = new Transform({ transform(chunk, encoding, callback) { rearm(); callback(null, chunk); } });
            await pipeline(Readable.fromWeb(upstream.body), heartbeat, res);
          } else res.end();
        } catch (err) {
          if (res.headersSent || res.destroyed) { res.destroy(); return; }
          if (err.status) throw err;
          throw error(timedOut ? 504 : 502, timedOut ? 'The provider request timed out. Try again.' : 'The server could not reach the provider. Check its Base URL and try again.');
        } finally {
          clearTimeout(timer);
          req.off('aborted', disconnected);
          res.off('close', disconnected);
          active--;
        }
        return;
      }

      if (!['GET', 'HEAD'].includes(req.method)) throw error(405, 'Only GET and HEAD are supported.');
      if (url.pathname === '/healthz') {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : '{"status":"ok"}');
        return;
      }
      if (url.pathname === '/src/ai/runtime.js') {
        res.writeHead(200, { 'content-type': MIME['.js'], 'cache-control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : 'export const BACKEND = true;\n');
        return;
      }
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { throw error(400, 'Invalid URL.'); }
      if (pathname === '/') pathname = '/index.html';
      // Serve public assets only, never repository metadata, server source,
      // deployment configuration, credentials, tests, or directory listings.
      if ((pathname !== '/index.html' && !/^\/(src|css|vendor)\//.test(pathname))
        || pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some((p) => p.startsWith('.'))
        || !MIME[extname(pathname)]) throw error(404, 'Not found.');
      const base = await publicRoot;
      let path;
      try { path = await realpath(resolve(base, '.' + pathname)); } catch { throw error(404, 'Not found.'); }
      if (!path.startsWith(base + sep) || !(await stat(path)).isFile()) throw error(404, 'Not found.');
      res.writeHead(200, { 'content-type': MIME[extname(pathname)], 'cache-control': 'no-cache' });
      if (req.method === 'HEAD') res.end();
      else await pipeline(createReadStream(path), res);
    } catch (err) {
      if (res.headersSent || res.destroyed) res.destroy();
      else json(res, err.status || 500, err.status ? err.message : 'The server could not complete the request.', err.status ? err.code : undefined);
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const server = createAppServer({
    publicOrigin: process.env.PUBLIC_ORIGIN || '',
    baseUrls: [...DEFAULT_BASE_URLS, ...(process.env.AI_BASE_URLS || '').split(',').map((s) => s.trim()).filter(Boolean)],
  });
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`Schematica listening at ${process.env.PUBLIC_ORIGIN || `http://localhost:${port}`}`));
  const shutdown = () => { server.close(); setTimeout(() => process.exit(0), 10_000).unref(); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
