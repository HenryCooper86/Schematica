import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createAppServer, POLICY_CODE } from '../server/index.js';
import { providerFetch } from '../src/ai/providers/transport.js';
import { mapHttpError, POLICY_CODE as CLIENT_POLICY_CODE } from '../src/ai/providers/errors.js';
import { backendBaseUrl, RELAY } from '../src/ai/settings.js';

async function start(t, options = {}) {
  const server = createAppServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (target, init = {}) => fetch(`${origin}/api/ai`, {
    ...init,
    headers: { 'x-schematica-client': '1', 'x-schematica-target': target, origin, ...init.headers },
  });
  return { server, origin, request };
}
const TARGET = 'https://ollama.com/v1/chat/completions';
const POST = { method: 'POST', headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' }, body: '{"model":"test"}' };

test('public deployments accept the configured host and reject spoofed forwarded origins', async (t) => {
  const { origin } = await start(t, { publicOrigin: 'https://schematica.example.com', fetchImpl: async () => Response.json({ data: [] }) });
  const viaProxy = (headers) => new Promise((resolve, reject) => {
    const req = httpRequest(`${origin}/api/ai`, { headers: {
      host: 'schematica.example.com', origin: 'https://schematica.example.com',
      'x-schematica-client': '1', 'x-schematica-target': 'https://ollama.com/v1/models', ...headers,
    } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(await viaProxy({}), 200);
  assert.equal(await viaProxy({ host: 'evil.example', 'x-forwarded-host': 'schematica.example.com' }), 421);
  assert.equal(await viaProxy({ origin: 'https://evil.example', 'x-forwarded-proto': 'https' }), 403);
});

test('backend serves the app and runtime but never deployment files or repository metadata', async (t) => {
  const { origin } = await start(t);
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /src\/main.js/);
  const runtime = await fetch(`${origin}/src/ai/runtime.js`);
  assert.equal(runtime.headers.get('cache-control'), 'no-store');
  assert.match(await runtime.text(), /BACKEND = true/);
  for (const path of ['/server/index.js', '/.env', '/.git/config', '/package.json', '/tests/backend.test.js', '/src/%2e%2e/server/index.js', '/src/%00.js']) {
    assert.equal((await fetch(origin + path)).status, 404, path);
  }
  assert.equal((await fetch(`${origin}/src/main.js`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal((await fetch(`${origin}/src/main.js`, { method: 'HEAD' })).status, 200);
  assert.deepEqual(await (await fetch(`${origin}/healthz`)).json(), { status: 'ok' });
});

test('same-origin transport uses the official Ollama URL and forwards only provider headers', async (t) => {
  let seen;
  const { origin } = await start(t, { fetchImpl: async (url, init) => {
    seen = { url, ...init };
    return new Response('data: first\n\ndata: second\n\n', { headers: { 'content-type': 'text/event-stream', 'set-cookie': 'secret=1' } });
  } });
  const response = await providerFetch(TARGET, { ...POST, headers: { ...POST.headers, cookie: 'browser-session=1', 'x-extra': 'drop' } },
    (url, init) => fetch(origin + url, init), true);
  assert.equal(response.status, 200);
  assert.equal(seen.url, TARGET);
  assert.equal(seen.redirect, 'manual');
  assert.equal(seen.body.toString(), POST.body);
  assert.deepEqual(Object.fromEntries(seen.headers), { authorization: 'Bearer test-key', 'content-type': 'application/json', accept: '*/*' });
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-accel-buffering'), 'no');
  assert.equal(await response.text(), 'data: first\n\ndata: second\n\n');
});

test('model listing and Anthropic headers work through the same backend', async (t) => {
  const seen = [];
  const { request } = await start(t, { fetchImpl: async (url, init) => {
    seen.push({ url, init });
    return Response.json({ data: [{ id: 'test-model' }] });
  } });
  assert.equal((await request('https://ollama.com/v1/models')).status, 200);
  const response = await request('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'test-key', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: '{}',
  });
  assert.equal(response.status, 200);
  assert.equal(seen[0].init.method, 'GET');
  assert.equal(seen[1].init.headers.get('x-api-key'), 'test-key');
  assert.equal(seen[1].init.headers.get('anthropic-version'), '2023-06-01');
  assert.equal(seen[1].init.headers.has('anthropic-dangerous-direct-browser-access'), false);
});

test('rejects cross-origin requests, private targets, redirects, and malformed input before forwarding', async (t) => {
  let calls = 0;
  const { request, origin } = await start(t, { fetchImpl: async () => { calls++; return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }); } });
  for (const target of [
    'http://169.254.169.254/latest/meta-data', 'http://localhost:11434/v1/chat/completions',
    'https://ollama.com.evil.example/v1/chat/completions', 'https://ollama.com/v1/../admin',
    'https://ollama.com/v1/chat/completions?redirect=x', 'https://user:pass@ollama.com/v1/chat/completions',
  ]) {
    const response = await request(target, POST);
    assert.ok([400, 403].includes(response.status), target);
  }
  assert.equal((await request(TARGET, { ...POST, headers: { ...POST.headers, origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request(TARGET, { ...POST, headers: { ...POST.headers, 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await fetch(`${origin}/api/ai`, POST)).status, 403);
  assert.equal((await request(TARGET, { method: 'OPTIONS' })).status, 405);
  assert.equal((await request(TARGET, { ...POST, body: 'not json' })).status, 400);
  assert.equal((await request(TARGET, { ...POST, headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await request(TARGET, { ...POST, headers: { 'content-type': 'application/json' } })).status, 401);
  assert.equal(calls, 0);
  assert.equal((await request(TARGET, POST)).status, 502);
  assert.equal(calls, 1, 'redirect target was not followed');
});

test('upstream auth/rate errors retain status and retry hints; network failures are readable', async (t) => {
  for (const status of [401, 429, 500]) {
    const { request } = await start(t, { fetchImpl: async () => Response.json({ error: { message: 'Provider error' } }, { status, headers: { 'retry-after': '3' } }) });
    const response = await request(TARGET, POST);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('retry-after'), '3');
    assert.equal((await response.json()).error.message, 'Provider error');
  }
  const { request } = await start(t, { fetchImpl: async () => { throw new Error('Do not leak internals or keys'); } });
  const response = await request(TARGET, POST);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /internals/);
});

test('request limits and timeouts free the connection slot', async (t) => {
  let calls = 0;
  const { request } = await start(t, { maxBodyBytes: 30, timeoutMs: 50, maxConcurrent: 1, fetchImpl: async (url, { signal }) => {
    calls++;
    if (calls > 1) return Response.json({ ok: true });
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  assert.equal((await request(TARGET, { ...POST, body: JSON.stringify({ text: 'x'.repeat(40) }) })).status, 413);
  assert.equal(calls, 0);
  const first = request(TARGET, POST);
  // Wait for the upstream to occupy the only slot, not an arbitrary delay.
  while (!calls) await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await request(TARGET, POST)).status, 429);
  assert.equal((await first).status, 504);
  assert.equal((await request(TARGET, POST)).status, 200);
});

test('the server marks its own refusals so the panel does not blame the key', async (t) => {
  const { request, origin } = await start(t, { fetchImpl: async () => Response.json({ ok: true }) });
  assert.equal(POLICY_CODE, CLIENT_POLICY_CODE, 'both sides agree on the code');
  const refusals = [
    await request('https://not-enabled.example/v1/chat/completions', POST),
    await request(TARGET, { ...POST, headers: { ...POST.headers, origin: 'https://evil.example' } }),
  ];
  for (const response of refusals) {
    assert.equal(response.status, 403);
    const body = await response.text();
    assert.equal(JSON.parse(body).error.code, POLICY_CODE);
    const err = mapHttpError(403, body, 'The endpoint');
    assert.equal(err.code, 'request', 'a policy refusal is not an auth failure');
    assert.equal(err.message, JSON.parse(body).error.message, 'the server explains what to do');
  }
  // A provider's own 403 still reads as a rejected key.
  assert.equal(mapHttpError(403, '{"error":{"message":"forbidden"}}', 'The endpoint').code, 'auth');
  assert.equal((await fetch(`${origin}/api/ai`, POST)).status, 403);
});

test('the deadline is idle-only: a slow but continuous stream runs past it', async (t) => {
  let closeUpstream;
  const { request } = await start(t, { timeoutMs: 20_000, idleTimeoutMs: 120, fetchImpl: async () => new Response(new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let sent = 0;
      // Six chunks, each well inside the idle window but past it in total.
      const timer = setInterval(() => {
        controller.enqueue(encoder.encode(`data: chunk${sent}\n\n`));
        if (++sent === 6) { clearInterval(timer); closeUpstream = () => controller.close(); closeUpstream(); }
      }, 40);
    },
  }), { headers: { 'content-type': 'text/event-stream' } }) });
  const response = await request(TARGET, POST);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.equal(body, [0, 1, 2, 3, 4, 5].map((i) => `data: chunk${i}\n\n`).join(''), 'nothing was cut mid-stream');
  assert.equal(typeof closeUpstream, 'function');
});

test('silence past the idle deadline still ends a stream that already started', async (t) => {
  const { request } = await start(t, { timeoutMs: 20_000, idleTimeoutMs: 80, fetchImpl: async (url, { signal }) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: first\n\n'));
      signal.addEventListener('abort', () => controller.error(new Error('idle')), { once: true });
    },
  }), { headers: { 'content-type': 'text/event-stream' } }) });
  const response = await request(TARGET, POST);
  assert.equal(response.status, 200, 'headers were already sent, so the failure shows as a broken stream');
  await assert.rejects(() => response.text());
});

test('streams chunks before upstream completion and aborts upstream when the browser disconnects', async (t) => {
  let upstreamSignal;
  let finish;
  const { request } = await start(t, { fetchImpl: async (url, { signal }) => {
    upstreamSignal = signal;
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('data: first\n\n'));
      finish = () => controller.close();
      signal.addEventListener('abort', () => controller.error(new Error('cancelled')), { once: true });
    } }), { headers: { 'content-type': 'text/event-stream' } });
  } });
  const response = await request(TARGET, POST);
  const reader = response.body.getReader();
  const chunk = await reader.read();
  assert.equal(new TextDecoder().decode(chunk.value), 'data: first\n\n', 'the upstream is still open');
  const aborted = new Promise((resolve) => upstreamSignal.addEventListener('abort', resolve, { once: true }));
  await reader.cancel();
  await aborted;
  assert.equal(upstreamSignal.aborted, true);
  assert.equal(typeof finish, 'function');
});

test('backend migration changes only the old default relay and static transport stays direct', async () => {
  assert.equal(backendBaseUrl(`${RELAY}/ollama.com/v1`, true), 'https://ollama.com/v1');
  assert.equal(backendBaseUrl(`${RELAY}/api.moonshot.ai/v1`, true), 'https://api.moonshot.ai/v1');
  assert.equal(backendBaseUrl(`${RELAY}/ollama.com/v1`, false), `${RELAY}/ollama.com/v1`);
  assert.equal(backendBaseUrl('https://custom.example/v1', true), 'https://custom.example/v1');
  const init = { ...POST };
  await providerFetch(TARGET, init, async (url, passed) => {
    assert.equal(url, TARGET);
    assert.equal(passed, init);
  }, false);
});
