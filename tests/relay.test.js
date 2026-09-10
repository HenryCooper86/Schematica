import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../relay/worker.js';

const ORIGIN = 'https://henrycooper86.github.io';
const req = (path, init = {}) => new Request(`https://relay.example${path}`, { ...init, headers: { origin: ORIGIN, ...(init.headers || {}) } });
const fakeUpstream = (calls, body = '{"ok":true}', status = 200, headers = { 'content-type': 'application/json', 'set-cookie': 'x=1' }) => async (url, init) => {
  calls.push({ url, method: init.method, headers: Object.fromEntries(init.headers), body: init.body ? await new Response(init.body).text() : null });
  return new Response(body, { status, headers });
};

test('a preflight is answered with the CORS headers the browser asked for', async () => {
  const r = await handle(req('/ollama.com/v1/chat/completions', { method: 'OPTIONS', headers: { 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } }));
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(r.headers.get('access-control-allow-headers'), 'authorization,content-type');
  assert.match(r.headers.get('access-control-allow-methods'), /POST/);
  assert.equal(r.headers.get('access-control-max-age'), '86400');
});

test('a POST is forwarded to the named upstream with only the auth, content-type, and accept headers', async () => {
  const calls = [];
  const r = await handle(req('/ollama.com/v1/chat/completions?x=1', {
    method: 'POST',
    headers: { authorization: 'Bearer k', 'content-type': 'application/json', cookie: 'session=1', referer: 'https://x', 'x-forwarded-for': '1.2.3.4' },
    body: '{"model":"glm-5.3"}',
  }), {}, fakeUpstream(calls));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://ollama.com/v1/chat/completions?x=1');
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].headers, { authorization: 'Bearer k', 'content-type': 'application/json' });
  assert.equal(calls[0].body, '{"model":"glm-5.3"}');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(r.headers.get('content-type'), 'application/json');
  assert.equal(r.headers.get('set-cookie'), null, 'upstream cookies stay upstream');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(await r.text(), '{"ok":true}');
});

test('the upstream status and a streaming body pass through unchanged', async () => {
  const calls = [];
  const chunks = ['{"message":{"content":"a"}}\n', '{"message":{"content":"b"},"done":true}\n'];
  const stream = new ReadableStream({ start(c) { for (const s of chunks) c.enqueue(new TextEncoder().encode(s)); c.close(); } });
  const r = await handle(req('/api.moonshot.ai/v1/chat/completions', { method: 'POST', body: '{}' }), {}, async (url, init) => { calls.push(url); return new Response(stream, { status: 429, headers: { 'content-type': 'text/event-stream', 'retry-after': '3' } }); });
  assert.equal(calls[0], 'https://api.moonshot.ai/v1/chat/completions');
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('retry-after'), '3');
  assert.equal(await r.text(), chunks.join(''));
});

test('unknown upstreams, other methods, and the root are answered by the relay itself, with CORS', async () => {
  const calls = [];
  const bad = await handle(req('/evil.example/steal', { method: 'POST', body: '{}' }), {}, fakeUpstream(calls));
  assert.equal(bad.status, 404);
  assert.equal(calls.length, 0);
  assert.equal(bad.headers.get('access-control-allow-origin'), ORIGIN);
  assert.match((await bad.json()).error, /ollama\.com, api\.moonshot\.ai/);
  const del = await handle(req('/ollama.com/v1/models', { method: 'DELETE' }), {}, fakeUpstream(calls));
  assert.equal(del.status, 405);
  const root = await handle(req('/'), {}, fakeUpstream(calls));
  assert.deepEqual(await root.json(), { relay: 'schematica', upstreams: ['ollama.com', 'api.moonshot.ai'] });
  assert.equal(calls.length, 0);
});

test('UPSTREAMS and ORIGINS narrow what the relay serves', async () => {
  const calls = [];
  const env = { UPSTREAMS: 'ollama.com', ORIGINS: 'https://allowed.example' };
  const other = await handle(req('/ollama.com/v1/models'), env, fakeUpstream(calls));
  assert.equal(other.status, 403, 'a browser origin off the list is refused');
  assert.equal(other.headers.get('access-control-allow-origin'), null);
  const ok = await handle(new Request('https://relay.example/ollama.com/v1/models', { headers: { origin: 'https://allowed.example' } }), env, fakeUpstream(calls));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://allowed.example');
  const curl = await handle(new Request('https://relay.example/ollama.com/v1/models'), env, fakeUpstream(calls));
  assert.equal(curl.status, 200, 'a caller without an Origin (curl, a script) is not a CORS request');
  const kimi = await handle(new Request('https://relay.example/api.moonshot.ai/v1/models'), env, fakeUpstream(calls));
  assert.equal(kimi.status, 404, 'a host outside UPSTREAMS is refused');
  assert.equal(calls.length, 2);
});

test('an upstream that cannot be reached is reported as 502 from the relay', async () => {
  const r = await handle(req('/ollama.com/v1/chat/completions', { method: 'POST', body: '{}' }), {}, async () => { throw new Error('boom'); });
  assert.equal(r.status, 502);
  assert.match((await r.json()).error, /could not reach ollama\.com: boom/);
});
