// Schematica relay: a Cloudflare Worker that forwards the assistant's
// requests to model APIs that refuse browser calls. ollama.com answers a CORS
// preflight with 405 and api.moonshot.ai with no allow-origin header, so a
// page on GitHub Pages cannot reach them; this worker adds the headers and
// passes everything else through, streaming included.
//
//   https://<worker>/ollama.com/api/chat        -> https://ollama.com/api/chat
//   https://<worker>/api.moonshot.ai/v1/models  -> https://api.moonshot.ai/v1/models
//
// The first path segment names the upstream host and must be on the
// allowlist (UPSTREAMS); the Authorization header is forwarded untouched and
// never logged. ORIGINS restricts which sites may use the relay ("*" allows
// any). Deploy with `npx wrangler deploy` in this directory; see README.md.

const DEFAULT_UPSTREAMS = 'ollama.com,api.moonshot.ai';
const FORWARD_HEADERS = ['authorization', 'content-type', 'accept'];
const RETURN_HEADERS = ['content-type', 'content-length', 'retry-after', 'x-request-id'];

const list = (s, fallback) => String(s ?? fallback).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

// The allow-origin header for this request, or null when the origin is not
// welcome (a non-browser caller sends no Origin and needs none).
function allowOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const allowed = list(env.ORIGINS, '*');
  if (allowed.includes('*') || allowed.includes(origin.toLowerCase())) return origin;
  return undefined;
}

function corsHeaders(request, env) {
  const h = new Headers({ 'cache-control': 'no-store', vary: 'origin' });
  const origin = allowOrigin(request, env);
  if (origin) {
    h.set('access-control-allow-origin', origin);
    h.set('access-control-allow-methods', 'GET, POST, OPTIONS');
    h.set('access-control-allow-headers', request.headers.get('access-control-request-headers') || 'authorization, content-type');
    h.set('access-control-max-age', '86400');
  }
  return h;
}

const json = (status, body, headers) => {
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers });
};

export async function handle(request, env = {}, fetchImpl = globalThis.fetch) {
  const cors = corsHeaders(request, env);
  const origin = allowOrigin(request, env);
  if (origin === undefined) return json(403, { error: 'This relay does not serve that origin.' }, cors);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const url = new URL(request.url);
  const [, host, ...rest] = url.pathname.split('/');
  const upstreams = list(env.UPSTREAMS, DEFAULT_UPSTREAMS);
  if (!host) return json(200, { relay: 'schematica', upstreams }, cors);
  if (!upstreams.includes(host.toLowerCase())) return json(404, { error: `Unknown upstream "${host}"; this relay forwards to ${upstreams.join(', ')}.` }, cors);
  if (request.method !== 'GET' && request.method !== 'POST') return json(405, { error: 'Only GET and POST are relayed.' }, cors);

  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const v = request.headers.get(name);
    if (v) headers.set(name, v);
  }
  let upstream;
  try {
    upstream = await fetchImpl(`https://${host}/${rest.join('/')}${url.search}`, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? request.body : undefined,
      redirect: 'manual',
    });
  } catch (err) {
    return json(502, { error: `The relay could not reach ${host}: ${err?.message || err}` }, cors);
  }
  const out = new Headers(cors);
  for (const name of RETURN_HEADERS) {
    const v = upstream.headers.get(name);
    if (v) out.set(name, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export default {
  fetch: (request, env) => handle(request, env, globalThis.fetch),
};
