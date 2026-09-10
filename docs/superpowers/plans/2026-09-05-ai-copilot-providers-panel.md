# AI Copilot Providers and Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the engine from `2026-09-05-ai-copilot-engine.md` in front of the user: provider adapters over plain `fetch` (Anthropic, OpenAI-compatible, Ollama), settings with key handling, the single-shot fallback, the floating assistant panel, the Fix button on design-rule findings, and browser checks driven by a fake provider so CI needs no key.

**Architecture:** Each adapter turns the engine's internal message format into one wire format and back, streaming through shared SSE and NDJSON parsers. `settings.js` owns provider configuration and the key, over an injectable storage. `assistant-ui.js` is the only DOM module: it builds the panel once, calls `runRequest` (or `runSingleShot`) with the store as the batch, and turns the result into highlight, camera, undo chip, and thread. The smoke test's own HTTP server gains `/fake/v1/messages`, a scripted Anthropic look-alike.

**Tech Stack:** Vanilla ES modules, no dependencies, no build step. `fetch` + `ReadableStream` + `TextDecoder` for streaming. Node 22 `node --test`; the CDP smoke test in `tests/e2e/smoke.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-05-ai-copilot-design.md`

**Depends on:** every task of `2026-09-05-ai-copilot-engine.md` (its exports are named in each task's Interfaces block).

## Global Constraints

- No dependencies, no build step, no server; the SDK is not used (plain `fetch`), a deliberate spec decision.
- Pure modules (`settings.js`, `providers/*.js`, the single-shot code in `agent.js`) import nothing from the DOM; `fetch` is injected (`fetchImpl`) so tests run without network.
- Default model `claude-opus-5`, `thinking: { type: "adaptive" }`, `output_config: { effort }` with effort `low`|`medium`|`high` (default `medium`), `max_tokens: 16000`, streaming always.
- Anthropic requests carry `anthropic-version: 2023-06-01` and `anthropic-dangerous-direct-browser-access: true`; the first system block carries `cache_control: { type: "ephemeral" }`.
- The key is stored under `schematica.ai.key.<provider>` only while "remember on this device" is ticked; settings under `schematica.ai.settings`; the thread under `schematica.ai.thread`. Nothing of this enters the document, autosave, share links, or exports.
- Never `console.warn`/`console.error` in app code (the smoke test treats console warnings as failures); user-facing notices go through `toast` or the panel.
- Design tokens from `css/style.css :root`; dark surfaces only; panels live inside `#canvas-wrap` with absolute positioning; text in panels escaped with `escAttr`.
- Commit messages `area: sentence`, lowercase, NO `Co-Authored-By` or `Claude-Session` trailers.
- `npm test` and `npm run e2e` must both pass before every commit that touches `src/`.

---

### Task 1: Stream parsers

**Files:**
- Create: `src/ai/providers/stream.js`
- Test: `tests/ai-stream.test.js`

**Interfaces:**
- Produces: `sseParser(onEvent)` returning `{ push(text), end() }` where `onEvent({ event, data })` gets `data` parsed as JSON when it parses and the raw string otherwise; `ndjsonParser(onLine)` returning `{ push(text), end() }` with `onLine(object)`; `readStream(response, parser)` which drains `response.body` through a `TextDecoder` into `parser.push` and calls `parser.end()`.

- [ ] **Step 1: Write the failing tests**

Create `tests/ai-stream.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sseParser, ndjsonParser, readStream } from '../src/ai/providers/stream.js';

test('sse events survive chunk boundaries, CRLF, comments, and multi-line data', () => {
  const got = [];
  const p = sseParser((e) => got.push(e));
  p.push('event: message_start\r\ndata: {"a":1}\r\n\r\n: keep-alive\n\nevent: content_block_delta\ndata: {"b":');
  p.push('2}\n\ndata: line one\ndata: line two\n\ndata: [DONE]');
  p.end();
  assert.deepEqual(got, [
    { event: 'message_start', data: { a: 1 } },
    { event: 'content_block_delta', data: { b: 2 } },
    { event: null, data: 'line one\nline two' },
    { event: null, data: '[DONE]' },
  ]);
});

test('ndjson lines survive chunk boundaries and skip blanks', () => {
  const got = [];
  const p = ndjsonParser((o) => got.push(o));
  p.push('{"x":1}\n{"x":');
  p.push('2}\n\n{"x":3}');
  p.end();
  assert.deepEqual(got, [{ x: 1 }, { x: 2 }, { x: 3 }]);
});

test('readStream drains a Response body into the parser', async () => {
  const body = new ReadableStream({
    start(c) {
      const enc = new TextEncoder();
      c.enqueue(enc.encode('data: {"n":1}\n\ndata: {"n"'));
      c.enqueue(enc.encode(':2}\n\n'));
      c.close();
    },
  });
  const got = [];
  await readStream(new Response(body), sseParser((e) => got.push(e.data.n)));
  assert.deepEqual(got, [1, 2]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/ai-stream.test.js`
Expected: FAIL, `Cannot find module '../src/ai/providers/stream.js'`.

- [ ] **Step 3: Create the parsers**

Create `src/ai/providers/stream.js`:

```js
// Streaming helpers shared by the adapters: server-sent events (Anthropic,
// OpenAI-compatible) and newline-delimited JSON (Ollama). Both accept text in
// any chunking and dispatch complete records only.

function parseData(text) {
  try { return JSON.parse(text); } catch { return text; }
}

export function sseParser(onEvent) {
  let buffer = '';
  let event = null;
  let data = [];
  const flush = () => {
    if (data.length) onEvent({ event, data: parseData(data.join('\n')) });
    event = null;
    data = [];
  };
  const line = (l) => {
    if (l === '') { flush(); return; }
    if (l.startsWith(':')) return;
    const i = l.indexOf(':');
    const field = i < 0 ? l : l.slice(0, i);
    const value = i < 0 ? '' : l.slice(i + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  };
  return {
    push(text) {
      buffer += text;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        line(buffer.slice(0, nl).replace(/\r$/, ''));
        buffer = buffer.slice(nl + 1);
      }
    },
    end() {
      if (buffer) line(buffer.replace(/\r$/, ''));
      buffer = '';
      flush();
    },
  };
}

export function ndjsonParser(onLine) {
  let buffer = '';
  const line = (l) => {
    const t = l.trim();
    if (t) onLine(JSON.parse(t));
  };
  return {
    push(text) {
      buffer += text;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        line(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    },
    end() {
      if (buffer.trim()) line(buffer);
      buffer = '';
    },
  };
}

export async function readStream(response, parser) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.push(decoder.decode());
  parser.end();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/ai-stream.test.js && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ai/providers/stream.js tests/ai-stream.test.js
git commit -m "ai: sse and ndjson stream parsers"
```

---

### Task 2: Settings and key storage

**Files:**
- Create: `src/ai/settings.js`
- Test: `tests/ai-settings.test.js`

**Interfaces:**
- Produces: `PROVIDERS` (`{ anthropic, openai, ollama }` each `{ name, baseUrl, model, needsKey }`), `EFFORTS = ['low', 'medium', 'high']`, `PRICES`, `estimateCost(model, usage): number|null`, `SETTINGS_KEY`, `keyStorageKey(provider)`, `THREAD_KEY`, `createSettings(storage)` returning `{ get(), set(patch), getKey(), setKey(key, remember), forgetKey(), configured() }`. Settings shape: `{ provider, model, baseUrl, effort, remember, tools }` where `tools` is `true`, `false`, or `null` (untested).

- [ ] **Step 1: Write the failing tests**

Create `tests/ai-settings.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettings, PROVIDERS, estimateCost, keyStorageKey, SETTINGS_KEY } from '../src/ai/settings.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

test('defaults come from the provider table and merge with what is stored', () => {
  const s = createSettings(fakeStorage());
  assert.deepEqual(s.get(), { provider: 'anthropic', model: 'claude-opus-5', baseUrl: 'https://api.anthropic.com', effort: 'medium', remember: false, tools: null });
  s.set({ provider: 'ollama', model: 'llama3.1' });
  assert.equal(s.get().baseUrl, PROVIDERS.ollama.baseUrl, 'base url follows the provider until set');
  s.set({ baseUrl: 'http://box:11434' });
  assert.equal(s.get().baseUrl, 'http://box:11434');
  s.set({ provider: 'openai' });
  assert.equal(s.get().baseUrl, 'http://box:11434', 'an explicit base url is kept when the provider changes');
});

test('the key is stored only when remembered, and forgotten on request', () => {
  const st = fakeStorage();
  const s = createSettings(st);
  s.setKey('sk-1', false);
  assert.equal(s.getKey(), 'sk-1');
  assert.equal(st.getItem(keyStorageKey('anthropic')), null, 'not persisted');
  s.setKey('sk-2', true);
  assert.equal(st.getItem(keyStorageKey('anthropic')), 'sk-2');
  assert.equal(s.get().remember, true);
  s.setKey('sk-3', false);
  assert.equal(st.getItem(keyStorageKey('anthropic')), null, 'unticking removes the stored key');
  assert.equal(s.getKey(), 'sk-3');
  s.forgetKey();
  assert.equal(s.getKey(), '');
  const fresh = createSettings(st);
  assert.equal(fresh.getKey(), '', 'gone after a reload too');
});

test('configured means a model and, where needed, a key', () => {
  const s = createSettings(fakeStorage());
  assert.equal(s.configured(), false, 'no key yet');
  s.setKey('sk', false);
  assert.equal(s.configured(), true);
  s.set({ provider: 'ollama' });
  assert.equal(s.configured(), false, 'ollama needs a model');
  s.set({ model: 'llama3.1' });
  assert.equal(s.configured(), true, 'and no key');
});

test('settings persist as JSON and survive a corrupt entry', () => {
  const st = fakeStorage();
  createSettings(st).set({ effort: 'high' });
  assert.equal(JSON.parse(st.getItem(SETTINGS_KEY)).effort, 'high');
  st.setItem(SETTINGS_KEY, '{nope');
  assert.equal(createSettings(st).get().effort, 'medium');
});

test('cost estimates use the price table per million tokens', () => {
  const cost = estimateCost('claude-opus-5', { input: 1_000_000, output: 100_000, cacheRead: 2_000_000, cacheWrite: 0 });
  assert.equal(cost, 5 + 2.5 + 1);
  assert.equal(estimateCost('mystery-model', { input: 10, output: 10, cacheRead: 0, cacheWrite: 0 }), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/ai-settings.test.js`
Expected: FAIL, `Cannot find module '../src/ai/settings.js'`.

- [ ] **Step 3: Create settings**

Create `src/ai/settings.js`:

```js
// Provider settings and the key. Storage is injected (localStorage in the
// browser, a Map in tests) and every access is guarded: storage may be
// blocked. The key lives in memory unless "remember" is ticked, and never
// touches the document, autosave, share links, or exports.

export const PROVIDERS = {
  anthropic: { name: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com', model: 'claude-opus-5', needsKey: true },
  openai: { name: 'OpenAI-compatible', baseUrl: 'https://api.openai.com/v1', model: '', needsKey: true },
  ollama: { name: 'Ollama (local)', baseUrl: 'http://localhost:11434', model: '', needsKey: false },
};
export const EFFORTS = ['low', 'medium', 'high'];
export const SETTINGS_KEY = 'schematica.ai.settings';
export const THREAD_KEY = 'schematica.ai.thread';
export const keyStorageKey = (provider) => `schematica.ai.key.${provider}`;

// Dollars per million tokens. An estimate: the panel labels it as one.
export const PRICES = {
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

export function estimateCost(model, usage) {
  const p = PRICES[model];
  if (!p) return null;
  return (usage.input * p.input + usage.output * p.output + usage.cacheRead * p.cacheRead + usage.cacheWrite * p.cacheWrite) / 1e6;
}

const DEFAULTS = { provider: 'anthropic', model: '', baseUrl: '', effort: 'medium', remember: false, tools: null };

export function createSettings(storage) {
  const read = (k) => { try { return storage.getItem(k); } catch { return null; } };
  const write = (k, v) => { try { storage.setItem(k, v); } catch { /* blocked storage: the session still works */ } };
  const remove = (k) => { try { storage.removeItem(k); } catch { /* same */ } };

  // Read on every call: a test may seed storage after the page loaded, and
  // another tab may have changed it.
  const readStored = () => { try { return JSON.parse(read(SETTINGS_KEY) || '{}') || {}; } catch { return {}; } };
  const memoryKeys = {};

  function get() {
    const s = { ...DEFAULTS, ...readStored() };
    const p = PROVIDERS[s.provider] || PROVIDERS.anthropic;
    if (!PROVIDERS[s.provider]) s.provider = 'anthropic';
    if (!s.model) s.model = p.model;
    if (!s.baseUrl) s.baseUrl = p.baseUrl;
    if (!EFFORTS.includes(s.effort)) s.effort = 'medium';
    return s;
  }

  function set(patch) {
    write(SETTINGS_KEY, JSON.stringify({ ...readStored(), ...patch }));
  }

  function getKey() {
    const provider = get().provider;
    if (memoryKeys[provider] !== undefined) return memoryKeys[provider];
    return get().remember ? (read(keyStorageKey(provider)) || '') : '';
  }

  function setKey(key, remember) {
    const provider = get().provider;
    memoryKeys[provider] = key;
    set({ remember: !!remember });
    if (remember && key) write(keyStorageKey(provider), key);
    else remove(keyStorageKey(provider));
  }

  function forgetKey() {
    const provider = get().provider;
    memoryKeys[provider] = '';
    remove(keyStorageKey(provider));
  }

  function configured() {
    const s = get();
    if (!s.model) return false;
    return !PROVIDERS[s.provider].needsKey || !!getKey();
  }

  return { get, set, getKey, setKey, forgetKey, configured };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/ai-settings.test.js && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ai/settings.js tests/ai-settings.test.js
git commit -m "ai: provider settings and key storage"
```

---

### Task 3: Anthropic adapter

**Files:**
- Create: `src/ai/providers/anthropic.js`
- Create: `src/ai/providers/errors.js`
- Test: `tests/ai-anthropic.test.js`

**Interfaces:**
- Consumes: `sseParser`, `readStream` from Task 1; the internal message format from the engine plan (`{ role, content: Block[], raw? }`).
- Produces: `errors.js`: `class ProviderError extends Error { code, status, hint }` with codes `auth`, `rate`, `network`, `model`, `context`, `refusal`, `request`, and `mapHttpError(status, body, provider)`. `anthropic.js`: `toAnthropicRequest({ model, effort, system, messages, tools })`, `anthropicMessages(messages)`, `createAnthropicAccumulator(onText)` returning `{ push(event), result() }`, and `anthropicProvider({ baseUrl, apiKey, model, effort, fetchImpl })` returning `{ chat({ system, messages, tools, signal, onText }) }` resolving to `{ text, toolCalls, usage, stop, raw }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/ai-anthropic.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { toAnthropicRequest, createAnthropicAccumulator, anthropicProvider } from '../src/ai/providers/anthropic.js';
import { ProviderError } from '../src/ai/providers/errors.js';

const TOOLS = [
  { name: 'get_board', description: 'd', input_schema: { type: 'object', properties: {}, additionalProperties: false }, strict: true },
  { name: 'apply_edits', description: 'e', input_schema: { type: 'object', properties: { ops: { type: 'array' } }, required: ['ops'] } },
];
const SYSTEM = ['STABLE', 'PER'];

test('the request body carries streaming, adaptive thinking, effort, cached system, strict tools', () => {
  const body = toAnthropicRequest({ model: 'claude-opus-5', effort: 'high', system: SYSTEM, messages: [
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
  ], tools: TOOLS });
  assert.equal(body.model, 'claude-opus-5');
  assert.equal(body.stream, true);
  assert.equal(body.max_tokens, 16000);
  assert.deepEqual(body.thinking, { type: 'adaptive' });
  assert.deepEqual(body.output_config, { effort: 'high' });
  assert.deepEqual(body.system, [
    { type: 'text', text: 'STABLE', cache_control: { type: 'ephemeral' } },
    { type: 'text', text: 'PER' },
  ]);
  assert.deepEqual(body.tools[0], { name: 'get_board', description: 'd', input_schema: TOOLS[0].input_schema, strict: true });
  assert.deepEqual(body.tools[1], { name: 'apply_edits', description: 'e', input_schema: TOOLS[1].input_schema });
  assert.deepEqual(body.messages, [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]);
});

test('assistant turns replay their raw blocks and tool results map to tool_result', () => {
  const raw = [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 'c1', name: 'get_board', input: {} }];
  const body = toAnthropicRequest({ model: 'm', effort: 'low', system: SYSTEM, tools: TOOLS, messages: [
    { role: 'user', content: [{ type: 'text', text: 'q' }] },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'get_board', input: {} }], raw },
    { role: 'user', content: [{ type: 'tool_result', id: 'c1', text: 'board', isError: false }] },
    { role: 'assistant', content: [{ type: 'text', text: 'a' }, { type: 'tool_use', id: 'c2', name: 'apply_edits', input: { ops: [] } }] },
    { role: 'user', content: [{ type: 'tool_result', id: 'c2', text: 'bad', isError: true }] },
  ] });
  assert.deepEqual(body.messages[1].content, raw, 'raw blocks with signatures go back verbatim');
  assert.deepEqual(body.messages[2].content, [{ type: 'tool_result', tool_use_id: 'c1', content: 'board' }]);
  assert.deepEqual(body.messages[3].content, [{ type: 'text', text: 'a' }, { type: 'tool_use', id: 'c2', name: 'apply_edits', input: { ops: [] } }]);
  assert.deepEqual(body.messages[4].content, [{ type: 'tool_result', tool_use_id: 'c2', content: 'bad', is_error: true }]);
});

test('the accumulator assembles text, tool input json, usage, and the stop reason', () => {
  const chunks = [];
  const acc = createAnthropicAccumulator((t) => chunks.push(t));
  const ev = (event, data) => acc.push({ event, data });
  ev('message_start', { type: 'message_start', message: { usage: { input_tokens: 100, cache_read_input_tokens: 40, cache_creation_input_tokens: 10 } } });
  ev('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '' } });
  ev('content_block_delta', { index: 0, delta: { type: 'signature_delta', signature: 'SIG' } });
  ev('content_block_stop', { index: 0 });
  ev('content_block_start', { index: 1, content_block: { type: 'text', text: '' } });
  ev('content_block_delta', { index: 1, delta: { type: 'text_delta', text: 'Buil' } });
  ev('content_block_delta', { index: 1, delta: { type: 'text_delta', text: 'ding.' } });
  ev('content_block_stop', { index: 1 });
  ev('content_block_start', { index: 2, content_block: { type: 'tool_use', id: 'c1', name: 'apply_edits', input: {} } });
  ev('content_block_delta', { index: 2, delta: { type: 'input_json_delta', partial_json: '{"ops":[{"op":"set_ti' } });
  ev('content_block_delta', { index: 2, delta: { type: 'input_json_delta', partial_json: 'tle","title":"X"}]}' } });
  ev('content_block_stop', { index: 2 });
  ev('message_delta', { delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 33 } });
  ev('message_stop', {});
  const r = acc.result();
  assert.equal(r.text, 'Building.');
  assert.deepEqual(chunks, ['Buil', 'ding.']);
  assert.deepEqual(r.toolCalls, [{ id: 'c1', name: 'apply_edits', input: { ops: [{ op: 'set_title', title: 'X' }] } }]);
  assert.deepEqual(r.usage, { input: 100, output: 33, cacheRead: 40, cacheWrite: 10 });
  assert.equal(r.stop, 'tool_use');
  assert.deepEqual(r.raw[0], { type: 'thinking', thinking: '', signature: 'SIG' });
  assert.deepEqual(r.raw[2], { type: 'tool_use', id: 'c1', name: 'apply_edits', input: { ops: [{ op: 'set_title', title: 'X' }] } });
});

test('stop reasons map and an empty tool input parses as an empty object', () => {
  const acc = createAnthropicAccumulator(() => {});
  acc.push({ event: 'content_block_start', data: { index: 0, content_block: { type: 'tool_use', id: 'c', name: 'get_board', input: {} } } });
  acc.push({ event: 'content_block_stop', data: { index: 0 } });
  acc.push({ event: 'message_delta', data: { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } } });
  const r = acc.result();
  assert.deepEqual(r.toolCalls[0].input, {});
  assert.equal(r.stop, 'end');
  for (const [wire, ours] of [['max_tokens', 'max_tokens'], ['refusal', 'refusal'], ['stop_sequence', 'end']]) {
    const a = createAnthropicAccumulator(() => {});
    a.push({ event: 'message_delta', data: { delta: { stop_reason: wire }, usage: {} } });
    assert.equal(a.result().stop, ours);
  }
});

function sse(events) {
  const text = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
  return new Response(new Blob([text]).stream(), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

test('the provider posts to /v1/messages with the browser headers and streams the reply', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    return sse([
      ['message_start', { message: { usage: { input_tokens: 5 } } }],
      ['content_block_start', { index: 0, content_block: { type: 'text', text: '' } }],
      ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'ok' } }],
      ['content_block_stop', { index: 0 }],
      ['message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } }],
      ['message_stop', {}],
    ]);
  };
  const p = anthropicProvider({ baseUrl: 'https://api.anthropic.com/', apiKey: 'sk-x', model: 'claude-opus-5', effort: 'medium', fetchImpl });
  const r = await p.chat({ system: SYSTEM, messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], tools: TOOLS });
  assert.equal(seen[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.headers['x-api-key'], 'sk-x');
  assert.equal(seen[0].init.headers['anthropic-version'], '2023-06-01');
  assert.equal(seen[0].init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(JSON.parse(seen[0].init.body).model, 'claude-opus-5');
  assert.equal(r.text, 'ok');
  assert.equal(r.stop, 'end');
  assert.deepEqual(r.usage, { input: 5, output: 2, cacheRead: 0, cacheWrite: 0 });
});

test('http errors become ProviderErrors with a code, and 429 retries once', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return new Response('{"error":{"message":"slow down"}}', { status: 429, headers: { 'retry-after': '0' } });
    return new Response('{"error":{"type":"authentication_error","message":"bad key"}}', { status: 401 });
  };
  const p = anthropicProvider({ baseUrl: 'https://api.anthropic.com', apiKey: 'sk', model: 'm', effort: 'low', fetchImpl });
  await assert.rejects(
    () => p.chat({ system: SYSTEM, messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }], tools: [] }),
    (err) => err instanceof ProviderError && err.code === 'auth' && err.status === 401 && /bad key/.test(err.message),
  );
  assert.equal(calls, 2, 'the 429 was retried once');
  const down = anthropicProvider({ baseUrl: 'https://x', apiKey: 'sk', model: 'm', effort: 'low', fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(() => down.chat({ system: SYSTEM, messages: [], tools: [] }), (err) => err.code === 'network');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/ai-anthropic.test.js`
Expected: FAIL, `Cannot find module '../src/ai/providers/anthropic.js'`.

- [ ] **Step 3: Create the error helper and the adapter**

Create `src/ai/providers/errors.js`:

```js
// One error shape for every provider, with a short code the panel maps to a
// message: auth, rate, network, model, context, refusal, request.
export class ProviderError extends Error {
  constructor(message, { code = 'request', status = 0, hint = '' } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
    this.hint = hint;
  }
}

export function mapHttpError(status, body, provider) {
  let message = `${provider} returned HTTP ${status}`;
  try {
    const j = typeof body === 'string' ? JSON.parse(body) : body;
    message = j?.error?.message || j?.message || j?.error || message;
    if (typeof message !== 'string') message = JSON.stringify(message);
  } catch { if (typeof body === 'string' && body.trim()) message = body.slice(0, 200); }
  let code = 'request';
  if (status === 401 || status === 403) code = 'auth';
  else if (status === 429) code = 'rate';
  else if (status === 404) code = 'model';
  else if (status === 400 && /context|too long|too many tokens|maximum context|max_tokens/i.test(message)) code = 'context';
  return new ProviderError(message, { code, status });
}

// A fetch that threw: the network, CORS, or a blocked origin.
export function networkError(provider, err) {
  const hint = provider === 'ollama'
    ? 'For browser access Ollama must allow this origin: set OLLAMA_ORIGINS to include it (or "*") and restart Ollama.'
    : '';
  return new ProviderError(`Could not reach ${provider}: ${err?.message || err}`, { code: 'network', hint });
}
```

Create `src/ai/providers/anthropic.js`:

```js
// The Anthropic Messages API over fetch, streaming. Thinking is adaptive;
// the assistant's raw blocks (thinking with its signature, text, tool_use)
// are replayed verbatim on later turns, as the API requires.
import { sseParser, readStream } from './stream.js';
import { ProviderError, mapHttpError, networkError } from './errors.js';

const VERSION = '2023-06-01';
const MAX_TOKENS = 16000;
const STOP = { end_turn: 'end', tool_use: 'tool_use', max_tokens: 'max_tokens', refusal: 'refusal', stop_sequence: 'end' };

export function anthropicMessages(messages) {
  return messages.map((m) => {
    if (m.role === 'assistant' && Array.isArray(m.raw) && m.raw.length) return { role: 'assistant', content: m.raw };
    const content = m.content.map((b) => {
      if (b.type === 'text') return { type: 'text', text: b.text };
      if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
      const r = { type: 'tool_result', tool_use_id: b.id, content: b.text };
      if (b.isError) r.is_error = true;
      return r;
    });
    return { role: m.role, content };
  });
}

export function toAnthropicRequest({ model, effort, system, messages, tools }) {
  return {
    model,
    max_tokens: MAX_TOKENS,
    stream: true,
    thinking: { type: 'adaptive' },
    output_config: { effort },
    system: [
      { type: 'text', text: system[0], cache_control: { type: 'ephemeral' } },
      { type: 'text', text: system[1] || '' },
    ],
    tools: tools.map((t) => {
      const w = { name: t.name, description: t.description, input_schema: t.input_schema };
      if (t.strict) w.strict = true;
      return w;
    }),
    messages: anthropicMessages(messages),
  };
}

// Folds the event stream into blocks; result() gives the internal reply.
export function createAnthropicAccumulator(onText) {
  const blocks = [];
  const partial = [];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let stopReason = null;
  let failure = null;
  return {
    push({ event, data }) {
      const type = event || data?.type;
      if (type === 'message_start') {
        const u = data.message?.usage || {};
        usage.input = u.input_tokens || 0;
        usage.cacheRead = u.cache_read_input_tokens || 0;
        usage.cacheWrite = u.cache_creation_input_tokens || 0;
      } else if (type === 'content_block_start') {
        const b = { ...data.content_block };
        if (b.type === 'text') b.text = b.text || '';
        if (b.type === 'thinking') b.thinking = b.thinking || '';
        blocks[data.index] = b;
        partial[data.index] = '';
      } else if (type === 'content_block_delta') {
        const b = blocks[data.index];
        const d = data.delta || {};
        if (!b) return;
        if (d.type === 'text_delta') { b.text += d.text; onText?.(d.text); }
        else if (d.type === 'input_json_delta') partial[data.index] += d.partial_json;
        else if (d.type === 'thinking_delta') b.thinking += d.thinking;
        else if (d.type === 'signature_delta') b.signature = d.signature;
      } else if (type === 'content_block_stop') {
        const b = blocks[data.index];
        if (b?.type === 'tool_use') {
          const json = partial[data.index];
          b.input = json.trim() ? JSON.parse(json) : (b.input || {});
        }
      } else if (type === 'message_delta') {
        stopReason = data.delta?.stop_reason || stopReason;
        usage.output = data.usage?.output_tokens ?? usage.output;
      } else if (type === 'error') {
        failure = new ProviderError(data.error?.message || 'stream error', { code: 'request' });
      }
    },
    result() {
      if (failure) throw failure;
      const raw = blocks.filter(Boolean);
      return {
        text: raw.filter((b) => b.type === 'text').map((b) => b.text).join(''),
        toolCalls: raw.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input })),
        usage,
        stop: STOP[stopReason] || 'end',
        raw,
      };
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function anthropicProvider({ baseUrl, apiKey, model, effort, fetchImpl = globalThis.fetch }) {
  const url = `${String(baseUrl).replace(/\/+$/, '')}/v1/messages`;
  async function post(body, signal) {
    try {
      return await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      throw networkError('Anthropic', err);
    }
  }
  return {
    async chat({ system, messages, tools, signal, onText }) {
      const body = toAnthropicRequest({ model, effort, system, messages, tools });
      let res = await post(body, signal);
      if (res.status === 429) {
        const after = Math.min(10, Number(res.headers.get('retry-after')) || 5);
        await sleep(after * 1000);
        res = await post(body, signal);
      }
      if (!res.ok) throw mapHttpError(res.status, await res.text(), 'Anthropic');
      const acc = createAnthropicAccumulator(onText);
      await readStream(res, sseParser((e) => acc.push(e)));
      return acc.result();
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/ai-anthropic.test.js && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ai/providers/errors.js src/ai/providers/anthropic.js tests/ai-anthropic.test.js
git commit -m "ai: anthropic adapter over fetch with streaming and cached system prompt"
```

---

### Task 4: OpenAI-compatible adapter

**Files:**
- Create: `src/ai/providers/openai.js`
- Test: `tests/ai-openai.test.js`

**Interfaces:**
- Consumes: Task 1 parsers, Task 3 errors.
- Produces: `toOpenAIRequest({ model, system, messages, tools })`, `createOpenAIAccumulator(onText)`, `openaiProvider({ baseUrl, apiKey, model, fetchImpl })` with the same `chat` contract as Task 3, and `listOpenAIModels({ baseUrl, apiKey, fetchImpl })` resolving to `string[]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/ai-openai.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { toOpenAIRequest, createOpenAIAccumulator, openaiProvider, listOpenAIModels } from '../src/ai/providers/openai.js';

const TOOLS = [{ name: 'get_board', description: 'd', input_schema: { type: 'object', properties: {} } }];
const SYSTEM = ['STABLE', 'PER'];

test('the request uses chat completions shapes: system message, function tools, streamed usage', () => {
  const body = toOpenAIRequest({ model: 'gpt-x', system: SYSTEM, tools: TOOLS, messages: [
    { role: 'user', content: [{ type: 'text', text: 'q' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'a' }, { type: 'tool_use', id: 'c1', name: 'get_board', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', id: 'c1', text: 'board', isError: false }, { type: 'tool_result', id: 'c2', text: 'x', isError: true }] },
  ] });
  assert.equal(body.model, 'gpt-x');
  assert.equal(body.stream, true);
  assert.deepEqual(body.stream_options, { include_usage: true });
  assert.equal(body.tool_choice, 'auto');
  assert.deepEqual(body.tools, [{ type: 'function', function: { name: 'get_board', description: 'd', parameters: TOOLS[0].input_schema } }]);
  assert.deepEqual(body.messages[0], { role: 'system', content: 'STABLE\n\nPER' });
  assert.deepEqual(body.messages[1], { role: 'user', content: 'q' });
  assert.deepEqual(body.messages[2], { role: 'assistant', content: 'a', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_board', arguments: '{}' } }] });
  assert.deepEqual(body.messages[3], { role: 'tool', tool_call_id: 'c1', content: 'board' });
  assert.deepEqual(body.messages[4], { role: 'tool', tool_call_id: 'c2', content: 'x' });
});

test('the accumulator joins text and tool-call argument fragments and reads usage', () => {
  const chunks = [];
  const acc = createOpenAIAccumulator((t) => chunks.push(t));
  acc.push({ choices: [{ delta: { content: 'Hel' } }] });
  acc.push({ choices: [{ delta: { content: 'lo' } }] });
  acc.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'apply_edits', arguments: '{"ops":' } }] } }] });
  acc.push({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '[]}' } }] } }] });
  acc.push({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
  acc.push({ choices: [], usage: { prompt_tokens: 50, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 20 } } });
  acc.push('[DONE]');
  const r = acc.result();
  assert.equal(r.text, 'Hello');
  assert.deepEqual(chunks, ['Hel', 'lo']);
  assert.deepEqual(r.toolCalls, [{ id: 'call_1', name: 'apply_edits', input: { ops: [] } }]);
  assert.equal(r.stop, 'tool_use');
  assert.deepEqual(r.usage, { input: 30, output: 7, cacheRead: 20, cacheWrite: 0 });
  const a2 = createOpenAIAccumulator(() => {});
  a2.push({ choices: [{ delta: { content: 'x' }, finish_reason: 'length' }] });
  assert.equal(a2.result().stop, 'max_tokens');
});

function sse(objs) {
  const text = objs.map((o) => `data: ${typeof o === 'string' ? o : JSON.stringify(o)}\n\n`).join('');
  return new Response(new Blob([text]).stream(), { status: 200 });
}

test('the provider posts with a bearer token and lists models', async () => {
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    seen.push({ url, init });
    if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'gpt-b' }, { id: 'gpt-a' }] }), { status: 200 });
    return sse([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }, '[DONE]']);
  };
  const p = openaiProvider({ baseUrl: 'https://api.openai.com/v1/', apiKey: 'sk-o', model: 'gpt-x', fetchImpl });
  const r = await p.chat({ system: SYSTEM, messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], tools: TOOLS });
  assert.equal(seen[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(seen[0].init.headers.authorization, 'Bearer sk-o');
  assert.equal(r.text, 'ok');
  assert.equal(r.stop, 'end');
  assert.deepEqual(await listOpenAIModels({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-o', fetchImpl }), ['gpt-a', 'gpt-b']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/ai-openai.test.js`
Expected: FAIL, `Cannot find module '../src/ai/providers/openai.js'`.

- [ ] **Step 3: Create the adapter**

Create `src/ai/providers/openai.js`:

```js
// Chat completions with function calling and streaming: OpenAI, OpenRouter,
// and any endpoint that speaks the same shapes.
import { sseParser, readStream } from './stream.js';
import { mapHttpError, networkError } from './errors.js';

const STOP = { stop: 'end', tool_calls: 'tool_use', length: 'max_tokens', content_filter: 'refusal' };

export function toOpenAIRequest({ model, system, messages, tools }) {
  const out = [{ role: 'system', content: system.filter(Boolean).join('\n\n') }];
  for (const m of messages) {
    if (m.role === 'assistant') {
      const text = m.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const calls = m.content.filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      const msg = { role: 'assistant', content: text || null };
      if (calls.length) msg.tool_calls = calls;
      out.push(msg);
      continue;
    }
    const results = m.content.filter((b) => b.type === 'tool_result');
    if (results.length) {
      for (const r of results) out.push({ role: 'tool', tool_call_id: r.id, content: r.text });
      continue;
    }
    out.push({ role: 'user', content: m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') });
  }
  const body = { model, stream: true, stream_options: { include_usage: true }, messages: out };
  if (tools.length) {
    body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
    body.tool_choice = 'auto';
  }
  return body;
}

export function createOpenAIAccumulator(onText) {
  let text = '';
  const calls = [];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let finish = null;
  return {
    push(chunk) {
      if (chunk === '[DONE]' || typeof chunk !== 'object' || !chunk) return;
      if (chunk.usage) {
        const cached = chunk.usage.prompt_tokens_details?.cached_tokens || 0;
        usage.input = (chunk.usage.prompt_tokens || 0) - cached;
        usage.cacheRead = cached;
        usage.output = chunk.usage.completion_tokens || 0;
      }
      const choice = chunk.choices?.[0];
      if (!choice) return;
      const d = choice.delta || {};
      if (d.content) { text += d.content; onText?.(d.content); }
      for (const tc of d.tool_calls || []) {
        const i = tc.index ?? calls.length;
        calls[i] = calls[i] || { id: '', name: '', args: '' };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function?.name) calls[i].name = tc.function.name;
        if (tc.function?.arguments) calls[i].args += tc.function.arguments;
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    },
    result() {
      const toolCalls = calls.filter(Boolean).map((c, i) => ({
        id: c.id || `call_${i}`, name: c.name, input: c.args.trim() ? JSON.parse(c.args) : {},
      }));
      let stop = STOP[finish] || 'end';
      if (toolCalls.length && stop === 'end') stop = 'tool_use';
      return { text, toolCalls, usage, stop };
    },
  };
}

function headers(apiKey) {
  const h = { 'content-type': 'application/json' };
  if (apiKey) h.authorization = `Bearer ${apiKey}`;
  return h;
}

export function openaiProvider({ baseUrl, apiKey, model, fetchImpl = globalThis.fetch }) {
  const base = String(baseUrl).replace(/\/+$/, '');
  return {
    async chat({ system, messages, tools, signal, onText }) {
      let res;
      try {
        res = await fetchImpl(`${base}/chat/completions`, {
          method: 'POST', headers: headers(apiKey), signal,
          body: JSON.stringify(toOpenAIRequest({ model, system, messages, tools })),
        });
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        throw networkError('the endpoint', err);
      }
      if (!res.ok) throw mapHttpError(res.status, await res.text(), 'The endpoint');
      const acc = createOpenAIAccumulator(onText);
      await readStream(res, sseParser((e) => acc.push(e.data)));
      return acc.result();
    },
  };
}

export async function listOpenAIModels({ baseUrl, apiKey, fetchImpl = globalThis.fetch }) {
  const base = String(baseUrl).replace(/\/+$/, '');
  let res;
  try { res = await fetchImpl(`${base}/models`, { headers: headers(apiKey) }); } catch (err) { throw networkError('the endpoint', err); }
  if (!res.ok) throw mapHttpError(res.status, await res.text(), 'The endpoint');
  const j = await res.json();
  return (j.data || []).map((m) => m.id).filter(Boolean).sort();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/ai-openai.test.js && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ai/providers/openai.js tests/ai-openai.test.js
git commit -m "ai: openai-compatible adapter with function calling"
```

---

### Task 5: Ollama adapter

**Files:**
- Create: `src/ai/providers/ollama.js`
- Test: `tests/ai-ollama.test.js`

**Interfaces:**
- Consumes: Task 1 parsers, Task 3 errors.
- Produces: `toOllamaRequest({ model, system, messages, tools })`, `createOllamaAccumulator(onText)`, `ollamaProvider({ baseUrl, model, fetchImpl })`, `listOllamaModels({ baseUrl, fetchImpl })`.

- [ ] **Step 1: Write the failing tests**

Create `tests/ai-ollama.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { toOllamaRequest, createOllamaAccumulator, ollamaProvider, listOllamaModels } from '../src/ai/providers/ollama.js';

const TOOLS = [{ name: 'get_board', description: 'd', input_schema: { type: 'object', properties: {} } }];
const SYSTEM = ['STABLE', 'PER'];

test('the request uses Ollama chat shapes with object tool arguments', () => {
  const body = toOllamaRequest({ model: 'llama3.1', system: SYSTEM, tools: TOOLS, messages: [
    { role: 'user', content: [{ type: 'text', text: 'q' }] },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'call_0', name: 'get_board', input: { a: 1 } }] },
    { role: 'user', content: [{ type: 'tool_result', id: 'call_0', text: 'board', isError: false }] },
  ] });
  assert.equal(body.model, 'llama3.1');
  assert.equal(body.stream, true);
  assert.deepEqual(body.messages[0], { role: 'system', content: 'STABLE\n\nPER' });
  assert.deepEqual(body.messages[2], { role: 'assistant', content: '', tool_calls: [{ function: { name: 'get_board', arguments: { a: 1 } } }] });
  assert.deepEqual(body.messages[3], { role: 'tool', content: 'board' });
  assert.deepEqual(body.tools[0], { type: 'function', function: { name: 'get_board', description: 'd', parameters: TOOLS[0].input_schema } });
});

test('the accumulator joins streamed lines, mints tool-call ids, and maps done_reason', () => {
  const chunks = [];
  const acc = createOllamaAccumulator((t) => chunks.push(t));
  acc.push({ message: { role: 'assistant', content: 'He' }, done: false });
  acc.push({ message: { role: 'assistant', content: 'y' }, done: false });
  acc.push({ message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'run_checks', arguments: {} } }] }, done: false });
  acc.push({ message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop', prompt_eval_count: 12, eval_count: 4 });
  const r = acc.result();
  assert.equal(r.text, 'Hey');
  assert.deepEqual(chunks, ['He', 'y']);
  assert.deepEqual(r.toolCalls, [{ id: 'call_0', name: 'run_checks', input: {} }]);
  assert.equal(r.stop, 'tool_use', 'tool calls win over done_reason stop');
  assert.deepEqual(r.usage, { input: 12, output: 4, cacheRead: 0, cacheWrite: 0 });
  const a2 = createOllamaAccumulator(() => {});
  a2.push({ message: { content: 'x' }, done: true, done_reason: 'length' });
  assert.equal(a2.result().stop, 'max_tokens');
});

test('the provider posts to /api/chat without a key and lists local models', async () => {
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    seen.push({ url, init });
    if (url.endsWith('/api/tags')) return new Response(JSON.stringify({ models: [{ name: 'llama3.1:8b' }, { name: 'gemma:2b' }] }), { status: 200 });
    const lines = [{ message: { content: 'ok' }, done: false }, { message: { content: '' }, done: true, done_reason: 'stop' }];
    return new Response(new Blob([lines.map((l) => JSON.stringify(l)).join('\n') + '\n']).stream(), { status: 200 });
  };
  const p = ollamaProvider({ baseUrl: 'http://localhost:11434/', model: 'llama3.1', fetchImpl });
  const r = await p.chat({ system: SYSTEM, messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], tools: TOOLS });
  assert.equal(seen[0].url, 'http://localhost:11434/api/chat');
  assert.equal(seen[0].init.headers.authorization, undefined);
  assert.equal(r.text, 'ok');
  assert.deepEqual(await listOllamaModels({ baseUrl: 'http://localhost:11434', fetchImpl }), ['gemma:2b', 'llama3.1:8b']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/ai-ollama.test.js`
Expected: FAIL, `Cannot find module '../src/ai/providers/ollama.js'`.

- [ ] **Step 3: Create the adapter**

Create `src/ai/providers/ollama.js`:

```js
// Ollama's chat endpoint: newline-delimited JSON, tools as function
// definitions, tool-call arguments already parsed. No key. The browser must
// be an allowed origin (OLLAMA_ORIGINS); the settings help says so.
import { ndjsonParser, readStream } from './stream.js';
import { mapHttpError, networkError } from './errors.js';

export function toOllamaRequest({ model, system, messages, tools }) {
  const out = [{ role: 'system', content: system.filter(Boolean).join('\n\n') }];
  for (const m of messages) {
    if (m.role === 'assistant') {
      const text = m.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const calls = m.content.filter((b) => b.type === 'tool_use').map((b) => ({ function: { name: b.name, arguments: b.input ?? {} } }));
      const msg = { role: 'assistant', content: text };
      if (calls.length) msg.tool_calls = calls;
      out.push(msg);
      continue;
    }
    const results = m.content.filter((b) => b.type === 'tool_result');
    if (results.length) {
      for (const r of results) out.push({ role: 'tool', content: r.text });
      continue;
    }
    out.push({ role: 'user', content: m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') });
  }
  const body = { model, stream: true, messages: out };
  if (tools.length) {
    body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  }
  return body;
}

export function createOllamaAccumulator(onText) {
  let text = '';
  const toolCalls = [];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let reason = null;
  return {
    push(line) {
      const m = line.message || {};
      if (m.content) { text += m.content; onText?.(m.content); }
      for (const tc of m.tool_calls || []) {
        toolCalls.push({ id: `call_${toolCalls.length}`, name: tc.function?.name, input: tc.function?.arguments ?? {} });
      }
      if (line.done) {
        reason = line.done_reason || 'stop';
        usage.input = line.prompt_eval_count || 0;
        usage.output = line.eval_count || 0;
      }
    },
    result() {
      let stop = reason === 'length' ? 'max_tokens' : 'end';
      if (toolCalls.length) stop = 'tool_use';
      return { text, toolCalls, usage, stop };
    },
  };
}

export function ollamaProvider({ baseUrl, model, fetchImpl = globalThis.fetch }) {
  const base = String(baseUrl).replace(/\/+$/, '');
  return {
    async chat({ system, messages, tools, signal, onText }) {
      let res;
      try {
        res = await fetchImpl(`${base}/api/chat`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal,
          body: JSON.stringify(toOllamaRequest({ model, system, messages, tools })),
        });
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        throw networkError('ollama', err);
      }
      if (!res.ok) throw mapHttpError(res.status, await res.text(), 'Ollama');
      const acc = createOllamaAccumulator(onText);
      await readStream(res, ndjsonParser((l) => acc.push(l)));
      return acc.result();
    },
  };
}

export async function listOllamaModels({ baseUrl, fetchImpl = globalThis.fetch }) {
  const base = String(baseUrl).replace(/\/+$/, '');
  let res;
  try { res = await fetchImpl(`${base}/api/tags`); } catch (err) { throw networkError('ollama', err); }
  if (!res.ok) throw mapHttpError(res.status, await res.text(), 'Ollama');
  const j = await res.json();
  return (j.models || []).map((m) => m.name).filter(Boolean).sort();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/ai-ollama.test.js && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ai/providers/ollama.js tests/ai-ollama.test.js
git commit -m "ai: ollama adapter"
```

---

### Task 6: Single-shot mode and the provider factory

**Files:**
- Modify: `src/ai/agent.js`
- Create: `src/ai/providers/index.js`
- Test: `tests/ai-agent.test.js`

**Interfaces:**
- Consumes: `runRequest` internals from the engine plan; `anthropicProvider`, `openaiProvider`, `ollamaProvider` from Tasks 3–5; `ProviderError` from Task 3.
- Produces: `extractJson(text): object|null`, `runSingleShot({ provider, executor, system, history, userText, boardText, store, signal, onText, onStatus })` resolving to the same shape as `runRequest`; `makeProvider(settings, key, fetchImpl?)` in `providers/index.js`; `probeTools(provider)` resolving to `true|false`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ai-agent.test.js` (add `runSingleShot, extractJson` to the import from `../src/ai/agent.js`, and `import { makeProvider } from '../src/ai/providers/index.js';`):

```js
test('extractJson finds the object in fenced or chatty text', () => {
  assert.deepEqual(extractJson('```json\n{"summary":"s","ops":[]}\n```'), { summary: 's', ops: [] });
  assert.deepEqual(extractJson('Sure! {"summary":"s","ops":[{"op":"set_title","title":"T"}]} done'), { summary: 's', ops: [{ op: 'set_title', title: 'T' }] });
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson('{"broken":'), null);
});

test('single-shot mode parses one JSON reply, applies its ops, and repairs bad JSON once', async () => {
  const { store, executor, provider } = setup([
    { text: 'here you go {"summary": "Titled.", "ops": [{"op":"set_title","title":"Rover"}]}', stop: 'end' },
  ]);
  const res = await runSingleShot({ provider, executor, store, system: SYSTEM, history: [], userText: 'name it rover', boardText: 'b' });
  assert.equal(res.error, undefined);
  assert.equal(res.text, 'Titled.');
  assert.equal(res.applied, 1);
  assert.equal(store.doc.title, 'Rover');
  assert.equal(provider.calls[0].tools.length, 0, 'no tools are offered');
  assert.equal(store.undoStack.length, 1);

  const bad = setup([
    { text: 'not json', stop: 'end' },
    { text: '{"summary":"Fixed.","ops":[]}', stop: 'end' },
  ]);
  const r2 = await runSingleShot({ provider: bad.provider, executor: bad.executor, store: bad.store, system: SYSTEM, history: [], userText: 'x', boardText: 'b' });
  assert.equal(bad.provider.calls.length, 2, 'one repair round');
  assert.match(bad.provider.calls[1].messages.at(-1).content[0].text, /not valid JSON/);
  assert.equal(r2.text, 'Fixed.');
  assert.equal(r2.applied, 0);

  const hopeless = setup([{ text: 'nope', stop: 'end' }, { text: 'still nope', stop: 'end' }]);
  const r3 = await runSingleShot({ provider: hopeless.provider, executor: hopeless.executor, store: hopeless.store, system: SYSTEM, history: [], userText: 'x', boardText: 'b' });
  assert.match(r3.error.message, /did not return a valid plan/);
});

test('single-shot reports rejected edits in the reply instead of failing', async () => {
  const { store, executor, provider } = setup([
    { text: '{"summary":"Tried.","ops":[{"op":"add_part","ref":"a","kind":"nope"}]}', stop: 'end' },
  ]);
  const res = await runSingleShot({ provider, executor, store, system: SYSTEM, history: [], userText: 'x', boardText: 'b' });
  assert.equal(res.applied, 0);
  assert.match(res.text, /Tried\.\n\nThe edits were rejected:\n#0: unknown kind "nope"/);
  assert.equal(store.doc.nodes.length, 0);
});

test('makeProvider builds the adapter the settings name', () => {
  const s = (provider, extra = {}) => ({ provider, model: 'm', baseUrl: 'http://x', effort: 'low', ...extra });
  for (const provider of ['anthropic', 'openai', 'ollama']) {
    const p = makeProvider(s(provider), 'k', async () => new Response('{}', { status: 500 }));
    assert.equal(typeof p.chat, 'function', provider);
  }
  assert.throws(() => makeProvider(s('carrier-pigeon'), 'k'), /unknown provider/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/ai-agent.test.js`
Expected: FAIL, `does not provide an export named 'runSingleShot'`.

- [ ] **Step 3: Add single-shot mode and the factory**

Append to `src/ai/agent.js`:

```js
// The first {...} that parses, fences stripped: models without tool calling
// are asked for one JSON object and tend to wrap it in prose anyway.
export function extractJson(text) {
  const s = String(text ?? '').replace(/```(?:json)?/gi, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

// For a provider whose probe showed no tool calling: one reply carrying
// { summary, ops }, one repair round if it is not JSON, then the ops go
// through apply_edits like any other batch.
export async function runSingleShot({
  provider, executor, system, history = [], userText, boardText,
  store = null, signal = null, onText = null, onStatus = null,
}) {
  const messages = [
    ...history,
    { role: 'user', content: [{ type: 'text', text: `${userText}\n\n---\n${boardText}` }] },
  ];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let text = '';
  let stop = 'end';
  let applied = 0;
  let rounds = 0;
  let error;
  executor.resetTouched();
  store?.beginBatch();
  try {
    let plan = null;
    for (let attempt = 0; attempt < 2 && !plan; attempt++) {
      rounds += 1;
      const res = await provider.chat({ system, messages, tools: [], signal, onText: attempt === 0 ? onText : null });
      addUsage(usage, res.usage);
      messages.push({ role: 'assistant', content: [{ type: 'text', text: res.text }], raw: res.raw });
      stop = res.stop;
      plan = extractJson(res.text);
      if (!plan || !Array.isArray(plan.ops)) {
        plan = null;
        if (attempt === 0) {
          messages.push({ role: 'user', content: [{ type: 'text', text: 'Your reply was not valid JSON. Reply with only the JSON object: {"summary": "...", "ops": [...]}.' }] });
        }
      }
    }
    if (!plan) throw new Error('The model did not return a valid plan.');
    text = String(plan.summary || '').trim();
    if (plan.ops.length) {
      onStatus?.(statusLine('apply_edits', { ops: plan.ops }));
      const r = executor.run('apply_edits', { ops: plan.ops });
      if (r.isError) text += `\n\nThe edits were rejected:\n${r.text.replace(/^Batch rejected, nothing applied:\n/, '')}`;
      else applied += 1;
    }
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) stop = 'aborted';
    else error = err;
  } finally {
    store?.endBatch();
  }
  return { text, messages, touched: new Set(executor.touched), usage, stop, rounds, applied, cutOff: stop === 'aborted', error };
}
```

Create `src/ai/providers/index.js`:

```js
import { anthropicProvider } from './anthropic.js';
import { openaiProvider } from './openai.js';
import { ollamaProvider } from './ollama.js';

export function makeProvider(settings, key, fetchImpl = globalThis.fetch) {
  const { provider, model, baseUrl, effort } = settings;
  if (provider === 'anthropic') return anthropicProvider({ baseUrl, apiKey: key, model, effort, fetchImpl });
  if (provider === 'openai') return openaiProvider({ baseUrl, apiKey: key, model, fetchImpl });
  if (provider === 'ollama') return ollamaProvider({ baseUrl, model, fetchImpl });
  throw new Error(`unknown provider "${provider}"`);
}

// Does this model call tools? Ask it to call one; a model that answers in
// text instead gets the single-shot mode.
export async function probeTools(provider) {
  const res = await provider.chat({
    system: ['You are a test harness. Call the ping tool now and say nothing else.', ''],
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Call ping.' }] }],
    tools: [{ name: 'ping', description: 'Replies pong.', input_schema: { type: 'object', properties: {}, additionalProperties: false }, strict: true }],
  });
  return res.toolCalls.some((c) => c.name === 'ping');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/ai-agent.test.js && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ai/agent.js src/ai/providers/index.js tests/ai-agent.test.js
git commit -m "ai: single-shot mode for models without tools, and the provider factory"
```

---

### Task 7: The assistant panel: markup, styles, toggle, settings

**Files:**
- Create: `src/ui/assistant-ui.js`
- Modify: `index.html` (toolbar button after `#btn-journey`, hint bar, the panel element inside `#canvas-wrap`)
- Modify: `css/style.css`
- Modify: `src/main.js` (boot)
- Test: `tests/e2e/smoke.mjs`

**Interfaces:**
- Consumes: `createSettings`, `PROVIDERS`, `EFFORTS` (Task 2); `makeProvider`, `probeTools` (Task 6); `listOpenAIModels` (Task 4); `listOllamaModels` (Task 5); `panelHeader`, `bindCollapsible` from `src/ui/collapsible.js`; `escAttr`, `toast`, `onPress` from `src/ui/press.js`.
- Produces: `initAssistant({ store, tools, render, svg })` returning `{ open(), close(), toggle(), isOpen(), send(text) }` (send is filled in by Task 8; this task leaves it as a no-op that shows a toast). DOM ids: `#assistant`, `#btn-assistant`, `#ai-settings`, `#ai-provider`, `#ai-model`, `#ai-base`, `#ai-key`, `#ai-remember`, `#ai-effort`, `#ai-test`, `#ai-save`, `#ai-forget`, `#ai-meta`, `#ai-thread`, `#ai-input`, `#ai-send`, `#ai-stop`, `#ai-new`, `#ai-gear`, `#ai-usage`, `#ai-actions`.

- [ ] **Step 1: Write the failing browser checks**

In `tests/e2e/smoke.mjs`, before the final `} catch (err) {` of the main `try`, add:

```js
  // ---- Assistant panel: toggle, fold, settings, key handling ----
  await loadBoard(weather);
  const panelOpen = await js(`(() => { const p = document.getElementById('assistant'); return { exists: !!p, hidden: p && p.hidden, inCanvas: p && p.closest('#canvas-wrap') !== null }; })()`);
  check('the assistant panel exists inside the canvas area and starts hidden', panelOpen.exists && panelOpen.hidden === true && panelOpen.inCanvas, JSON.stringify(panelOpen));
  await key('a', 'KeyA', 65);
  await sleep(100);
  const afterA = await js(`(() => { const p = document.getElementById('assistant'); return { hidden: p.hidden, settingsShown: getComputedStyle(document.getElementById('ai-settings')).display !== 'none', btnActive: document.getElementById('btn-assistant').classList.contains('active') }; })()`);
  check('A opens the panel, and with no key configured the settings form shows', afterA.hidden === false && afterA.settingsShown && afterA.btnActive, JSON.stringify(afterA));
  await js(`(() => { document.getElementById('ai-key').value = 'sk-test-123'; document.getElementById('ai-remember').checked = false; document.getElementById('ai-save').click(); return true; })()`);
  await sleep(100);
  const saved = await js(`(() => ({ stored: localStorage.getItem('schematica.ai.key.anthropic'), settings: JSON.parse(localStorage.getItem('schematica.ai.settings') || '{}'), meta: document.getElementById('ai-meta').textContent, settingsShown: getComputedStyle(document.getElementById('ai-settings')).display !== 'none' }))()`);
  check('a key saved without "remember" stays out of storage and the panel shows the model', saved.stored === null && saved.settings.remember === false && /claude-opus-5/.test(saved.meta) && !saved.settingsShown, JSON.stringify(saved));
  await js(`(() => { document.getElementById('ai-gear').click(); document.getElementById('ai-key').value = 'sk-test-456'; document.getElementById('ai-remember').checked = true; document.getElementById('ai-save').click(); return true; })()`);
  await sleep(100);
  const remembered = await js(`localStorage.getItem('schematica.ai.key.anthropic')`);
  check('ticking "remember" stores the key on this device', remembered === 'sk-test-456', String(remembered));
  await js(`(() => { document.getElementById('ai-gear').click(); document.getElementById('ai-forget').click(); return true; })()`);
  await sleep(100);
  const forgotten = await js(`localStorage.getItem('schematica.ai.key.anthropic')`);
  check('forget clears the stored key', forgotten === null, String(forgotten));
  const foldedAi = await js(`(() => { const p = document.getElementById('assistant'); p.querySelector('.panel-toggle').click(); const out = p.classList.contains('collapsed'); p.querySelector('.panel-toggle').click(); return out; })()`);
  check('the assistant panel folds like the others', foldedAi === true, String(foldedAi));
  await js(`document.activeElement && document.activeElement.blur(); true`);
  await key('a', 'KeyA', 65);
  await sleep(100);
  check('A closes the panel again', (await js(`document.getElementById('assistant').hidden`)) === true);
```

- [ ] **Step 2: Run the smoke test to verify the new checks fail**

Run: `npm run e2e`
Expected: the six new checks FAIL (`exists: false`), everything else still passes.

- [ ] **Step 3: Add the markup, styles, and module**

In `index.html`, after the `#btn-journey` button add:

```html
        <button id="btn-assistant" title="Assistant (A)">
          <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2l1.6 4.4L15 8l-4.4 1.6L9 14l-1.6-4.4L3 8l4.4-1.6z M14.5 12.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/></svg>
        </button>
```

In the hint bar, after `<kbd>P</kbd> panels` add ` &middot; <kbd>A</kbd> assistant`.

Inside `<main id="canvas-wrap">`, after `<aside id="journey-panel" hidden></aside>`, add:

```html
      <aside id="assistant" hidden></aside>
```

In `css/style.css`, after the `#journey-panel h3 { ... }` rule add:

```css
/* ---- Assistant panel: bottom-right, capped so the properties panel above
   stays usable, folding like the others. ---- */
#assistant {
  position: absolute;
  z-index: 21;
  right: 14px;
  bottom: 54px;
  width: 340px;
  max-height: 55%;
  display: flex;
  flex-direction: column;
  background: rgba(13, 18, 32, 0.96);
  border: 1px solid var(--line2);
  border-radius: 14px;
  padding: 14px;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.55);
}
#assistant h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; color: #7dd3fc; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
#assistant.collapsed > :not(h3) { display: none; }
#assistant.collapsed { width: auto; min-width: 168px; padding: 10px 14px; }
#assistant.collapsed h3 { margin: 0; }
#app.panels-hidden #assistant { display: none !important; }
#app.presenting #assistant { display: none; }
#ai-meta { font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
#ai-meta span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-icon-btn { background: none; border: 1px solid transparent; color: var(--muted); border-radius: 6px; padding: 2px 6px; cursor: pointer; font: inherit; font-size: 12px; }
.ai-icon-btn:hover { color: var(--text); border-color: var(--line2); }
#ai-settings { display: flex; flex-direction: column; gap: 8px; font-size: 12px; color: var(--muted); }
#ai-settings label { display: flex; flex-direction: column; gap: 3px; }
#ai-settings label.row { flex-direction: row; align-items: center; gap: 6px; }
#ai-settings input, #ai-settings select { background: var(--bg2); border: 1px solid var(--line); color: var(--text); border-radius: 6px; padding: 5px 8px; font: inherit; font-size: 12.5px; }
#ai-settings input:focus, #ai-settings select:focus { outline: none; border-color: var(--accent); }
#ai-settings .ai-note { font-size: 11px; color: var(--faint); line-height: 1.4; }
#ai-settings .ai-buttons { display: flex; gap: 6px; flex-wrap: wrap; }
#ai-settings button, #ai-actions button, #ai-send, #ai-stop { background: var(--bg2); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 5px 10px; cursor: pointer; font: inherit; font-size: 12px; }
#ai-settings button:hover, #ai-actions button:hover, #ai-send:hover { border-color: var(--accent); }
#ai-save { border-color: var(--accent); }
#ai-thread { flex: 1; min-height: 60px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; font-size: 12.5px; line-height: 1.45; padding-right: 2px; }
.ai-msg { border-radius: 10px; padding: 7px 10px; white-space: pre-wrap; word-break: break-word; user-select: text; -webkit-user-select: text; }
.ai-msg.user { background: var(--accent-dim); color: var(--text); align-self: flex-end; max-width: 92%; }
.ai-msg.assistant { background: var(--bg2); color: var(--text); }
.ai-msg.error { background: #2a1215; color: #fca5a5; border: 1px solid #7f1d1d; }
.ai-status { font-size: 11px; color: var(--faint); padding-left: 4px; }
.ai-chips { display: flex; gap: 6px; margin-top: 6px; }
.ai-chips button { background: none; border: 1px solid var(--line2); color: var(--muted); border-radius: 999px; padding: 2px 9px; font: inherit; font-size: 11px; cursor: pointer; }
.ai-chips button:hover:not(:disabled) { color: var(--text); border-color: var(--accent); }
.ai-chips button:disabled { opacity: 0.4; cursor: default; }
#ai-actions { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0 6px; }
#ai-composer { display: flex; gap: 6px; align-items: flex-end; }
#ai-input { flex: 1; min-height: 38px; max-height: 120px; resize: vertical; background: var(--bg2); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 7px 9px; font: inherit; font-size: 12.5px; }
#ai-input:focus { outline: none; border-color: var(--accent); }
#ai-stop { border-color: #7f1d1d; color: #fca5a5; }
#ai-usage { font-size: 10.5px; color: var(--faint); margin-top: 6px; min-height: 12px; }
```

Create `src/ui/assistant-ui.js`:

```js
// The assistant panel: settings, a message thread, quick actions, and the
// composer. Task 8 fills in send(); this task builds the panel, the toggle,
// and the settings form with its key handling.
import { createSettings, PROVIDERS, EFFORTS } from '../ai/settings.js';
import { makeProvider, probeTools } from '../ai/providers/index.js';
import { listOpenAIModels } from '../ai/providers/openai.js';
import { listOllamaModels } from '../ai/providers/ollama.js';
import { panelHeader, bindCollapsible } from './collapsible.js';
import { escAttr, toast, onPress } from './press.js';

const PRIVACY = 'The board\'s text is sent to the provider you choose. Keys stay in this browser.';
const OLLAMA_HELP = 'For browser access, start Ollama with OLLAMA_ORIGINS including this site\'s origin (or "*").';

export function initAssistant({ store, tools, render, svg }) {
  const panel = document.getElementById('assistant');
  const btn = document.getElementById('btn-assistant');
  const settings = createSettings(localStorage);
  let settingsOpen = false;

  panel.innerHTML = panelHeader('Assistant', 'assistant')
    + '<div id="ai-meta"><span></span>'
    + '<button id="ai-new" class="ai-icon-btn" type="button" title="New thread">&#x21bb;</button>'
    + '<button id="ai-gear" class="ai-icon-btn" type="button" title="Settings" aria-label="Assistant settings">&#x2699;</button></div>'
    + '<form id="ai-settings" hidden>'
    + `<label>Provider<select id="ai-provider">${Object.entries(PROVIDERS).map(([id, p]) => `<option value="${id}">${escAttr(p.name)}</option>`).join('')}</select></label>`
    + '<label>Model<input id="ai-model" type="text" list="ai-models" spellcheck="false" autocomplete="off"><datalist id="ai-models"></datalist></label>'
    + '<label>Base URL<input id="ai-base" type="url" spellcheck="false" autocomplete="off"></label>'
    + '<label>API key<input id="ai-key" type="password" autocomplete="off" placeholder="paste your key"></label>'
    + '<label class="row"><input id="ai-remember" type="checkbox"> Remember the key on this device</label>'
    + `<label>Effort<select id="ai-effort">${EFFORTS.map((e) => `<option value="${e}">${e}</option>`).join('')}</select></label>`
    + `<div class="ai-note">${escAttr(PRIVACY)}</div><div class="ai-note" id="ai-help"></div>`
    + '<div class="ai-buttons"><button id="ai-save" type="submit">Save</button><button id="ai-test" type="button">Test</button>'
    + '<button id="ai-models-btn" type="button">List models</button><button id="ai-forget" type="button">Forget key</button></div>'
    + '</form>'
    + '<div id="ai-thread" role="log" aria-live="polite"></div>'
    + '<div id="ai-actions"><button type="button" data-act="build">Build from a brief</button>'
    + '<button type="button" data-act="fix">Fix checks</button><button type="button" data-act="fill">Fill in details</button></div>'
    + '<div id="ai-composer"><textarea id="ai-input" rows="2" placeholder="Describe a board, or ask for a change" aria-label="Message the assistant"></textarea>'
    + '<button id="ai-send" type="button">Send</button><button id="ai-stop" type="button" hidden>Stop</button></div>'
    + '<div id="ai-usage"></div>';
  bindCollapsible(panel, 'assistant');

  const el = (id) => document.getElementById(id);
  const form = el('ai-settings');
  const meta = panel.querySelector('#ai-meta span');

  function refreshMeta() {
    const s = settings.get();
    meta.textContent = `${PROVIDERS[s.provider].name} · ${s.model || 'no model'}${s.tools === false ? ' · single-shot' : ''}`;
    meta.title = meta.textContent;
  }

  function fillForm() {
    const s = settings.get();
    el('ai-provider').value = s.provider;
    el('ai-model').value = s.model;
    el('ai-base').value = s.baseUrl;
    el('ai-key').value = settings.getKey();
    el('ai-remember').checked = s.remember;
    el('ai-effort').value = s.effort;
    el('ai-key').disabled = !PROVIDERS[s.provider].needsKey;
    el('ai-help').textContent = s.provider === 'ollama' ? OLLAMA_HELP : '';
  }

  function showSettings(on) {
    settingsOpen = on;
    form.hidden = !on;
    if (on) fillForm();
  }

  el('ai-provider').addEventListener('change', () => {
    const provider = el('ai-provider').value;
    settings.set({ provider, model: '', baseUrl: '', tools: null });
    fillForm();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    settings.set({
      provider: el('ai-provider').value,
      model: el('ai-model').value.trim(),
      baseUrl: el('ai-base').value.trim(),
      effort: el('ai-effort').value,
    });
    settings.setKey(el('ai-key').value.trim(), el('ai-remember').checked);
    refreshMeta();
    showSettings(!settings.configured());
    if (settings.configured()) toast('Assistant settings saved.');
  });

  el('ai-forget').addEventListener('click', () => {
    settings.forgetKey();
    el('ai-key').value = '';
    el('ai-remember').checked = false;
    settings.set({ remember: false });
    toast('Key forgotten.');
  });

  el('ai-test').addEventListener('click', async () => {
    const s = { ...settings.get(), provider: el('ai-provider').value, model: el('ai-model').value.trim(), baseUrl: el('ai-base').value.trim() };
    try {
      const ok = await probeTools(makeProvider(s, el('ai-key').value.trim()));
      settings.set({ tools: ok });
      toast(ok ? 'Connected. This model calls tools.' : 'Connected. This model cannot call tools; the assistant will use single-shot mode.');
      refreshMeta();
    } catch (err) {
      toast(`Test failed: ${err.message}${err.hint ? `\n${err.hint}` : ''}`);
    }
  });

  el('ai-models-btn').addEventListener('click', async () => {
    const provider = el('ai-provider').value;
    const baseUrl = el('ai-base').value.trim();
    try {
      const names = provider === 'ollama'
        ? await listOllamaModels({ baseUrl })
        : await listOpenAIModels({ baseUrl, apiKey: el('ai-key').value.trim() });
      el('ai-models').innerHTML = names.map((n) => `<option value="${escAttr(n)}">`).join('');
      toast(names.length ? `${names.length} models listed; pick one in the Model field.` : 'The endpoint listed no models.');
    } catch (err) {
      toast(`Could not list models: ${err.message}${err.hint ? `\n${err.hint}` : ''}`);
    }
  });

  el('ai-gear').addEventListener('click', () => showSettings(!settingsOpen));

  function isOpen() { return !panel.hidden; }
  function open() {
    panel.hidden = false;
    btn.classList.add('active');
    if (!settings.configured()) showSettings(true);
    el('ai-input').focus();
  }
  function close() {
    panel.hidden = true;
    btn.classList.remove('active');
  }
  function toggle() { if (isOpen()) close(); else open(); }
  btn.addEventListener('click', toggle);
  // Like the journey button, opening the assistant is a request to see panels.
  btn.addEventListener('click', () => {
    const app = document.getElementById('app');
    if (app.classList.contains('panels-hidden')) document.getElementById('btn-panels').click();
  }, true);

  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key.toLowerCase() === 'a') toggle();
  });

  refreshMeta();
  const api = { open, close, toggle, isOpen, send: () => toast('The assistant is not wired up yet.'), settings };
  return api;
}
```

In `src/main.js`, add the import `import { initAssistant } from './ui/assistant-ui.js';` and, after `initLayoutToggles();`, add `initAssistant({ store, tools, render, svg });`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npm run e2e`
Expected: unit tests pass; the smoke test reports all checks passed including the six new ones.

- [ ] **Step 5: Commit**

```bash
git add index.html css/style.css src/ui/assistant-ui.js src/main.js tests/e2e/smoke.mjs
git commit -m "assistant: the panel with settings, key handling, toggle, and fold"
```

---

### Task 8: Send, stream, statuses, undo chip, highlight, camera, thread, quick actions, Fix button

**Files:**
- Modify: `src/ui/assistant-ui.js`
- Modify: `src/ui/dialogs.js` (the design-rule list)
- Modify: `tests/e2e/smoke.mjs` (the static server gets the fake endpoint; new scenarios)

**Interfaces:**
- Consumes: `runRequest`, `runSingleShot` from `src/ai/agent.js`; `createExecutor` from `src/ai/tools.js`; `boardText` from `src/ai/context.js`; `stableSystem`, `perRequestSystem` from `src/ai/prompt.js`; `checkDoc` from `src/drc.js`; `estimateCost`, `THREAD_KEY` from settings; `contentBounds`, `nodeRect`, `NOTE_W`, `noteHeight` from `src/geometry.js`; `tools.ui.highlight`, `tools.view`, `tools.zoomFit()`; `store.generation`, `store.undoStack`.
- Produces: a working `send(text)`; the DOM event `schematica:fix-finding` with `detail = finding` dispatched by the design-rule dialog's Fix buttons.

- [ ] **Step 1: Write the failing browser checks**

In `tests/e2e/smoke.mjs`, replace the static server's request handler so it also serves the fake provider. Change the start of the `createServer` callback to:

```js
const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/fake/v1/messages') return fakeAnthropic(req, res);
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
```

and add, above `const server = createServer(...)`:

```js
// A scripted Anthropic look-alike so the assistant runs in CI without a key.
// It answers the first call of a request with one tool call, and any call
// carrying tool results with a short final text.
const fakeSeen = [];
async function fakeAnthropic(req, res) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  const last = body.messages.at(-1);
  const lastText = last.content.map((b) => b.text || '').join(' ');
  fakeSeen.push({ headers: req.headers, lastText, system: body.system, tools: body.tools.map((t) => t.name) });
  const hasResults = last.content.some((b) => b.type === 'tool_result');
  const events = [];
  const ev = (event, data) => events.push(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);
  ev('message_start', { message: { usage: { input_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } });
  if (hasResults) {
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Done. ' } });
    ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'The board is in place.' } });
    ev('content_block_stop', { index: 0 });
    ev('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 8 } });
  } else {
    let ops;
    if (/^Fix this finding/i.test(lastText)) {
      ops = [{ op: 'add_note', ref: 'fx', text: 'Fix acknowledged by the fake assistant' }];
    } else {
      ops = [
        { op: 'set_title', title: 'Fake Build' },
        { op: 'add_part', ref: 'mcu', kind: 'mcu', sublabel: 'ESP32-S3', rail: '3.3V' },
        { op: 'add_part', ref: 'bme', kind: 'temp', sublabel: 'BME280', addr: '0x76', rail: '3.3V' },
        { op: 'add_part', ref: 'bat', kind: 'battery' },
        { op: 'connect', from: { node: 'mcu' }, to: { node: 'bme' }, bus: 'i2c' },
        { op: 'connect', from: { node: 'bat' }, to: { node: 'mcu' }, bus: 'power' },
        { op: 'add_zone', ref: 'pwr', label: 'Power', color: '#f87171', members: ['bat'] },
      ];
    }
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Working…' } });
    ev('content_block_stop', { index: 0 });
    ev('content_block_start', { index: 1, content_block: { type: 'tool_use', id: 'call_1', name: 'apply_edits', input: {} } });
    ev('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ ops }) } });
    ev('content_block_stop', { index: 1 });
    ev('message_delta', { delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 40 } });
  }
  ev('message_stop', {});
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  res.end(events.join(''));
}
```

Then, after the Task 7 checks (before `} catch (err) {`), add:

```js
  // ---- Assistant: build, undo, highlight, Fix button, thread ----
  // An empty board through a share link (loadBoard clears storage, so the
  // settings are seeded afterwards; they are read at send time).
  const EMPTY = { schema: 1, title: 'Empty', nodes: [], wires: [], zones: [], notes: [], journey: [] };
  const seedFake = () => js(`localStorage.setItem('schematica.ai.settings', JSON.stringify({ provider: 'anthropic', model: 'test-model', baseUrl: location.origin + '/fake', effort: 'low', remember: true, tools: true })); localStorage.setItem('schematica.ai.key.anthropic', 'sk-fake'); true`);
  await loadBoard(EMPTY);
  await seedFake();
  check('the board is empty before the build', (await js(`document.querySelectorAll('#canvas g.node').length`)) === 0);
  await key('a', 'KeyA', 65);
  await sleep(100);
  await js(`(() => { const i = document.getElementById('ai-input'); i.value = 'build a small sensor node'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
  let built = null;
  for (let i = 0; i < 40; i++) {
    built = await js(`(() => ({ nodes: document.querySelectorAll('#canvas g.node').length, wires: document.querySelectorAll('#canvas g.wire').length, zones: document.querySelectorAll('#canvas g.zone').length, title: document.getElementById('title').value, done: !!document.querySelector('#ai-thread .ai-msg.assistant') && /Done\\./.test(document.querySelector('#ai-thread .ai-msg.assistant:last-of-type').textContent), sending: !document.getElementById('ai-stop').hidden }))()`);
    if (built.done && !built.sending) break;
    await sleep(150);
  }
  check('a build request through the fake provider produces cards, wires, a zone, and a title', built.nodes === 3 && built.wires === 2 && built.zones === 1 && built.title === 'Fake Build' && built.done, JSON.stringify(built));
  const overlapFree = await js(`(() => { const r = [...document.querySelectorAll('#canvas g.node .card')].map((c) => c.getBoundingClientRect()); for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { if (r[i].left < r[j].right && r[j].left < r[i].right && r[i].top < r[j].bottom && r[j].top < r[i].bottom) return false; } return r.length === 3; })()`);
  check('the placed cards do not overlap', overlapFree === true, String(overlapFree));
  const highlighted = await js(`document.querySelectorAll('#canvas .hl, #canvas .hl-wire').length`);
  check('everything the assistant touched is highlighted', highlighted === 6, String(highlighted));
  const statusLines = await js(`[...document.querySelectorAll('#ai-thread .ai-status')].map((s) => s.textContent)`);
  check('tool activity shows as status lines', statusLines.some((s) => /applying 7 edits/.test(s)), JSON.stringify(statusLines));
  const chip = await js(`(() => { const b = document.querySelector('#ai-thread .ai-chips button[data-undo]'); return { exists: !!b, disabled: b && b.disabled, undoEnabled: !document.getElementById('undo').disabled }; })()`);
  check('the reply carries a live "Undo this" chip', chip.exists && chip.disabled === false && chip.undoEnabled, JSON.stringify(chip));
  await js(`document.querySelector('#ai-thread .ai-chips button[data-undo]').click(); true`);
  await sleep(100);
  const undone = await js(`(() => ({ nodes: document.querySelectorAll('#canvas g.node').length, chipDisabled: document.querySelector('#ai-thread .ai-chips button[data-undo]').disabled }))()`);
  check('one undo removes the whole reply and disables the chip', undone.nodes === 0 && undone.chipDisabled === true, JSON.stringify(undone));
  check('the request carried the browser headers and the cached system block', fakeSeen[0]?.headers['anthropic-dangerous-direct-browser-access'] === 'true' && fakeSeen[0]?.system?.[0]?.cache_control?.type === 'ephemeral' && fakeSeen[0].tools.includes('apply_edits'), JSON.stringify(fakeSeen[0]?.tools));
  const usageLine = await js(`document.getElementById('ai-usage').textContent`);
  check('the usage line reports tokens', /\d+ in/.test(usageLine) && /\d+ out/.test(usageLine), usageLine);

  // The Fix button on a design-rule finding sends it to the assistant.
  await loadBoard(weather);
  await seedFake();
  const notesBefore = await js(`document.querySelectorAll('#canvas [data-type="note"]').length`);
  await js(`document.getElementById('btn-check').click(); true`);
  await sleep(100);
  const fixBtn = await js(`(() => { const b = document.querySelector('#drc-list [data-drc-fix]'); if (!b) return null; b.click(); return true; })()`);
  check('every finding has a Fix button', fixBtn === true, String(fixBtn));
  let fixed = null;
  for (let i = 0; i < 40; i++) {
    fixed = await js(`(() => ({ dialogOpen: document.getElementById('drc-dialog').open === true, panelOpen: !document.getElementById('assistant').hidden, notes: document.querySelectorAll('#canvas [data-type="note"]').length, sending: !document.getElementById('ai-stop').hidden }))()`);
    if (fixed.notes > notesBefore && !fixed.sending) break;
    await sleep(150);
  }
  const fixSeen = fakeSeen.find((f) => /^Fix this finding/.test(f.lastText));
  check('Fix closes the dialog, opens the panel, sends the finding, and the reply applies', fixed.dialogOpen === false && fixed.panelOpen && fixed.notes === notesBefore + 1 && !!fixSeen && /ids:/.test(fixSeen.lastText), JSON.stringify({ ...fixed, sent: fixSeen?.lastText.slice(0, 80) }));

  // The thread survives a reload of the same board (autosave restores it, no
  // hash, so the store's generation stays put) and clears when a share link
  // replaces the board. Neither path shows a confirm().
  const threadCount = await js(`document.querySelectorAll('#ai-thread .ai-msg').length`);
  await sleep(700);
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await send('Page.navigate', { url: `${origin}/` });
  await sleep(1200);
  const restored = await js(`document.querySelectorAll('#ai-thread .ai-msg').length`);
  check('the thread is restored after a reload', restored === threadCount && restored > 0, `${restored} vs ${threadCount}`);
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await send('Page.navigate', { url: `${origin}/#${await encodeShare(drone)}` });
  await sleep(1200);
  const cleared = await js(`(() => ({ title: document.getElementById('title').value, msgs: document.querySelectorAll('#ai-thread .ai-msg').length }))()`);
  check('replacing the board through a share link clears the thread', cleared.title === drone.title && cleared.msgs === 0, JSON.stringify(cleared));
```

- [ ] **Step 2: Run the smoke test to verify the new checks fail**

Run: `npm run e2e`
Expected: the new checks FAIL (no nodes built, no Fix button); the earlier checks still pass.

- [ ] **Step 3: Wire up sending, the thread, the canvas feedback, and the Fix button**

In `src/ui/assistant-ui.js`, add imports:

```js
import { runRequest, runSingleShot } from '../ai/agent.js';
import { createExecutor } from '../ai/tools.js';
import { boardText } from '../ai/context.js';
import { stableSystem, perRequestSystem } from '../ai/prompt.js';
import { estimateCost, THREAD_KEY } from '../ai/settings.js';
import { checkDoc } from '../drc.js';
import { contentBounds, nodeRect, NOTE_W, noteHeight } from '../geometry.js';
import { ProviderError } from '../ai/providers/errors.js';
```

Replace the line `const api = { open, close, toggle, isOpen, send: () => toast('The assistant is not wired up yet.'), settings };` and the `return api;` with the block below (everything else in the module stays):

```js
  // ---- Thread ----
  const thread = el('ai-thread');
  const input = el('ai-input');
  const sendBtn = el('ai-send');
  const stopBtn = el('ai-stop');
  const usageEl = el('ai-usage');
  let history = [];          // provider-facing messages
  let visible = [];          // what the thread shows: { role, text, undoDepth?, touched? }
  let busy = null;           // AbortController while a request runs
  let generation = store.generation;
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const stable = stableSystem();

  function saveThread() {
    try {
      localStorage.setItem(THREAD_KEY, JSON.stringify({ history: history.slice(-40), visible: visible.slice(-80), totals }));
    } catch { /* storage may be blocked; the thread lives for this session */ }
  }
  function loadThread() {
    try {
      const t = JSON.parse(localStorage.getItem(THREAD_KEY) || 'null');
      if (t && Array.isArray(t.history) && Array.isArray(t.visible)) {
        history = t.history;
        visible = t.visible;
        Object.assign(totals, t.totals || {});
      }
    } catch { /* corrupt thread: start fresh */ }
  }
  function clearThread() {
    history = [];
    visible = [];
    for (const k of Object.keys(totals)) totals[k] = 0;
    try { localStorage.removeItem(THREAD_KEY); } catch { /* fine */ }
    renderThread();
    usageEl.textContent = '';
  }

  function chipRow(m, index) {
    if (!m.touched?.length) return '';
    const live = m.undoDepth > 0 && store.undoStack.length === m.undoDepth;
    return `<div class="ai-chips"><button type="button" data-undo="${index}"${live ? '' : ' disabled'}>Undo this</button>`
      + `<button type="button" data-show="${index}">Show changes</button></div>`;
  }

  function renderThread() {
    thread.innerHTML = visible.map((m, i) => {
      if (m.role === 'status') return `<div class="ai-status">${escAttr(m.text)}</div>`;
      return `<div class="ai-msg ${m.role}">${escAttr(m.text)}${m.role === 'assistant' ? chipRow(m, i) : ''}</div>`;
    }).join('');
    thread.querySelectorAll('[data-undo]').forEach((b) => onPress(b, () => { if (!b.disabled) store.undo(); }));
    thread.querySelectorAll('[data-show]').forEach((b) => onPress(b, () => highlight(visible[Number(b.dataset.show)].touched || [])));
    thread.scrollTop = thread.scrollHeight;
  }

  function refreshChips() {
    thread.querySelectorAll('[data-undo]').forEach((b) => {
      const m = visible[Number(b.dataset.undo)];
      b.disabled = !(m?.undoDepth > 0 && store.undoStack.length === m.undoDepth);
    });
  }

  store.subscribe(() => {
    if (store.generation !== generation) {
      generation = store.generation;
      clearThread();
      return;
    }
    refreshChips();
  });

  // ---- Canvas feedback ----
  function highlight(ids) {
    tools.ui.highlight.clear();
    for (const id of ids) tools.ui.highlight.add(id);
    render('overlay');
  }

  function itemRect(id) {
    const doc = store.doc;
    const n = doc.nodes.find((x) => x.id === id);
    if (n) return nodeRect(n);
    const z = doc.zones.find((x) => x.id === id);
    if (z) return { x: z.x, y: z.y, w: z.w, h: z.h };
    const t = doc.notes.find((x) => x.id === id);
    if (t) return { x: t.x, y: t.y, w: NOTE_W, h: noteHeight(t.text) };
    return null;
  }

  // Pan the least that brings the touched items into view; fit if the board
  // was empty when the request started.
  function showTouched(ids, wasEmpty) {
    if (wasEmpty) { tools.zoomFit(); return; }
    const rects = ids.map(itemRect).filter(Boolean);
    if (!rects.length) return;
    const b = contentBounds({ nodes: [], zones: rects, notes: [] });
    const r = svg.getBoundingClientRect();
    const { zoom } = tools.view;
    const M = 40;
    const sx1 = b.x * zoom + tools.view.x;
    const sy1 = b.y * zoom + tools.view.y;
    const sx2 = (b.x + b.w) * zoom + tools.view.x;
    const sy2 = (b.y + b.h) * zoom + tools.view.y;
    let dx = 0;
    let dy = 0;
    if (sx1 < M) dx = M - sx1; else if (sx2 > r.width - M) dx = r.width - M - sx2;
    if (sy1 < M) dy = M - sy1; else if (sy2 > r.height - M) dy = r.height - M - sy2;
    if (dx || dy) { tools.view.x += dx; tools.view.y += dy; render('view'); }
  }

  // ---- Sending ----
  function errorText(err) {
    if (err instanceof ProviderError) {
      const lead = {
        auth: 'The provider rejected the key.',
        rate: 'The provider is rate-limiting requests; try again in a moment.',
        network: 'Could not reach the provider.',
        model: 'The model was not found.',
        context: 'The thread is too long for the model; start a new thread.',
        refusal: 'The model declined this request.',
      }[err.code] || 'The request failed.';
      return `${lead} ${err.message}${err.hint ? `\n${err.hint}` : ''}`;
    }
    return err?.message || String(err);
  }

  function setBusy(on) {
    sendBtn.hidden = on;
    stopBtn.hidden = !on;
    input.disabled = on;
    el('ai-actions').querySelectorAll('button').forEach((b) => { b.disabled = on; });
  }

  function usageText(u, cost) {
    let s = `${u.input.toLocaleString()} in · ${u.output.toLocaleString()} out`;
    if (u.cacheRead) s += ` · ${u.cacheRead.toLocaleString()} cached`;
    if (cost !== null) s += ` · ≈ $${cost.toFixed(cost < 0.01 ? 4 : 2)} (estimate)`;
    return s;
  }

  async function send(text) {
    const userText = String(text ?? '').trim();
    if (!userText || busy) return;
    if (!settings.configured()) { open(); showSettings(true); toast('Add a provider and key first.'); return; }
    const s = settings.get();
    const wasEmpty = !store.doc.nodes.length && !store.doc.zones.length && !store.doc.notes.length;
    const executor = createExecutor({
      getDoc: () => store.doc,
      commit: (fn) => store.mutate(fn),
      selection: () => [...store.selection],
    });
    const board = boardText(store.doc, { selection: [...store.selection], findings: checkDoc(store.doc) });
    const system = [stable, perRequestSystem({ date: new Date().toISOString().slice(0, 10), effort: s.effort, singleShot: s.tools === false })];
    visible.push({ role: 'user', text: userText });
    const reply = { role: 'assistant', text: '' };
    visible.push(reply);
    renderThread();
    busy = new AbortController();
    setBusy(true);
    input.value = '';
    const run = s.tools === false ? runSingleShot : runRequest;
    const res = await run({
      provider: makeProvider(s, settings.getKey()),
      executor, store, system, history, userText, boardText: board, signal: busy.signal,
      onText: (t) => { reply.text += t; renderThread(); },
      onStatus: (line) => { visible.splice(visible.length - 1, 0, { role: 'status', text: line }); renderThread(); },
    });
    busy = null;
    setBusy(false);
    history = res.messages;
    reply.text = res.text || (res.error ? '' : '(no reply)');
    if (res.cutOff) reply.text += `\n\n(${res.stop === 'aborted' ? 'Stopped' : 'Cut off'}; edits made so far are kept.)`;
    if (res.stop === 'max_tokens') reply.text += '\n\n(The reply hit the length limit.)';
    reply.touched = [...res.touched];
    reply.undoDepth = res.touched.size ? store.undoStack.length : 0;
    if (res.error) {
      visible.push({ role: 'error', text: errorText(res.error) });
      if (res.error instanceof ProviderError && (res.error.code === 'auth' || res.error.code === 'model')) showSettings(true);
    }
    for (const k of Object.keys(totals)) totals[k] += res.usage[k] || 0;
    usageEl.textContent = `last: ${usageText(res.usage, s.provider === 'anthropic' ? estimateCost(s.model, res.usage) : null)}`;
    renderThread();
    saveThread();
    if (res.touched.size) {
      highlight(res.touched);
      showTouched([...res.touched], wasEmpty);
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input.value);
    }
  });
  sendBtn.addEventListener('click', () => send(input.value));
  stopBtn.addEventListener('click', () => busy?.abort());
  el('ai-new').addEventListener('click', () => { if (!busy) clearThread(); });

  const ACTIONS = {
    build: () => {
      input.value = 'Build a board for: \nMust have: \nPower: \nConnectivity: ';
      input.focus();
      input.setSelectionRange(19, 19);
    },
    fix: () => {
      const findings = checkDoc(store.doc);
      if (!findings.length) { toast('The board passes every check.'); return; }
      send(`Fix these findings:\n${findings.map((f) => `${f.level} ${f.rule} "${f.message}" ids: ${f.ids.join(' ')}`).join('\n')}`);
    },
    fill: () => send('Fill in blank part numbers, addresses, rails, and notes from the presets. Change nothing else.'),
  };
  el('ai-actions').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => ACTIONS[b.dataset.act]());
  });

  document.addEventListener('schematica:fix-finding', (e) => {
    const f = e.detail;
    open();
    send(`Fix this finding: ${f.level} ${f.rule} "${f.message}" ids: ${f.ids.join(' ')}`);
  });

  loadThread();
  renderThread();
  return { open, close, toggle, isOpen, send, settings };
```

In `src/ui/dialogs.js`, in the design-rule list rendering, change each row's markup to add a Fix button and bind it:

```js
      list.innerHTML = findings.map((f, i) => (
        `<div class="drc-row"><span class="drc-level ${f.level}">${f.level.toUpperCase()}</span>`
        + `<span class="msg">${esc(f.message)}</span>`
        + `<button data-drc="${i}">Select</button><button data-drc-fix="${i}">Fix</button></div>`
      )).join('');
      list.querySelectorAll('[data-drc]').forEach((btn) => {
        btn.addEventListener('click', () => {
          store.setSelection(findings[Number(btn.dataset.drc)].ids);
          drcDialog.close();
        });
      });
      list.querySelectorAll('[data-drc-fix]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const finding = findings[Number(btn.dataset.drcFix)];
          drcDialog.close();
          document.dispatchEvent(new CustomEvent('schematica:fix-finding', { detail: finding }));
        });
      });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npm run e2e`
Expected: unit tests pass; every smoke check passes, including the build, undo, highlight, Fix, and thread scenarios, with `no console errors or exceptions`.

If "everything the assistant touched is highlighted" reports 7 rather than 6, the fake's `set_title` op is not a touched item (correct) but a zone ring plus three node rings plus two wire glows is 6; check that `remove` is not adding ids and that the `.hl-wire` selector is matched.

- [ ] **Step 5: Commit**

```bash
git add src/ui/assistant-ui.js src/ui/dialogs.js tests/e2e/smoke.mjs
git commit -m "assistant: send, stream, undo chip, highlight, camera, thread, quick actions, and the Fix button"
```

---

### Task 9: README and the manual acceptance checklist

**Files:**
- Modify: `README.md`
- Create: `docs/superpowers/plans/2026-09-05-ai-copilot-acceptance.md`

- [ ] **Step 1: Document the assistant in the README**

In the "Use it" table of `README.md`, after the `Check` row, add:

```markdown
| Assistant | `A` or the sparkle button — describe a board and it builds it, ask for a change and it edits the board, press Fix on a check finding or "Fix checks" and it resolves them, "Fill in details" fills part numbers from presets. Bring your own key: Claude by default, OpenAI-compatible endpoints and local Ollama too. Each reply is one undo step and what it touched glows until your next click. The key stays in this browser (only if you tick remember) and is never part of the board, autosave, or share links |
```

In the "Develop" section, after the sentence about `src/ui/`, add:

```markdown
The assistant lives in `src/ai/`: `ops.js` is the atomic edit-operation batch (the only way the model changes a board), `layout.js` places whatever a batch creates, `context.js` renders the board and the palette catalogue as text for the model, `tools.js` exposes six tools over a `getDoc`/`commit` interface, `agent.js` runs the request loop, `providers/` holds the fetch adapters, and `src/ui/assistant-ui.js` is the panel. The smoke test drives it through a fake provider, so CI needs no key.
```

- [ ] **Step 2: Write the manual acceptance checklist**

Create `docs/superpowers/plans/2026-09-05-ai-copilot-acceptance.md`:

```markdown
# AI Copilot manual acceptance (needs a real key)

Run once against Claude Opus 5 before calling the feature done. Tick each
line with the observed result.

1. Blank board, prompt: "Build a solar weather station on an ESP32-S3 with a
   BME280 and a LoRa uplink." Expect: parts, typed wires, at least one zone,
   no overlapping cards, Check reports zero errors, done within eight rounds.
   Observed: __
2. On the Sensor Node example: "Swap the ESP32 for an STM32H7." Expect: one
   node's part number and notes change, nothing else; one undo step reverts.
   Observed: __
3. On the Weather Station example (which has findings): press Check, press
   Fix on the first finding. Expect: the panel opens, the finding is sent, the
   assistant resolves it without touching unrelated items. Observed: __
4. On the RDK X5 Rover example after blanking two part numbers: "Fill in
   details." Expect: blank part numbers filled from presets, nothing else
   changed. Observed: __
5. Open the Journey panel and the properties panel while the assistant is
   open. Expect: no overlap that hides controls at 1400 px width. Observed: __
6. Press Stop mid-request. Expect: the reply says it was stopped, edits so far
   remain as one undo step. Observed: __
7. Reload. Expect: the thread comes back; loading an example clears it.
   Observed: __
8. With "remember" unticked, reload. Expect: the key must be entered again and
   `localStorage` holds no `schematica.ai.key.*`. Observed: __
9. Settings → Ollama with a local model, Test. Expect: either "calls tools" or
   the single-shot notice; a build works in the mode reported. Observed: __
```

- [ ] **Step 3: Run the suites one last time and commit**

Run: `npm test && npm run e2e`
Expected: all green.

```bash
git add README.md docs/superpowers/plans/2026-09-05-ai-copilot-acceptance.md
git commit -m "docs: the assistant in the README and a manual acceptance checklist"
```

---

## Self-review against the spec

- **Providers, keys, cost, errors:** settings shape, defaults, remember/forget (Task 2); Anthropic headers, streaming, adaptive thinking, effort, cached system block, strict tools, 429 retry, raw block replay (Task 3); OpenAI-compatible function calling and streamed usage (Task 4); Ollama NDJSON and origins hint (Task 5); the probe and single-shot mode with one repair round (Task 6); the error table mapped to panel text (Task 8 `errorText`).
- **Panel:** placement inside the canvas area, 340 px, 55% cap, fold, `A` and the toolbar button, `P` hides it (Task 7 CSS `#app.panels-hidden #assistant`); header with provider and model, gear, new thread; thread as a polite live region with streamed text and status lines; Undo this and Show changes chips; composer with Enter/Shift+Enter and Stop; three quick actions; selection carried as the `selected:` line via `boardText`; usage line with the estimate label; first-run settings form with the privacy notice; thread persistence capped at 40 model messages and cleared on `store.generation` change (Task 8).
- **Canvas feedback:** highlight set and cleared on pointerdown (engine plan Task 14 + Task 8 `highlight`); fit when the board was empty, else minimal pan (Task 8 `showTouched`).
- **Fix button:** per finding, closes the dialog, opens the panel, sends the finding (Task 8).
- **Testing:** unit tests for parsers, settings, three adapters, single-shot; browser checks through the fake endpoint covering build, overlap, highlight, status lines, undo chip, headers and cache block, usage line, Fix, thread persistence and clearing, settings and key handling (Tasks 7–8); manual acceptance with a real key (Task 9).
- **Deviations noted:** `arrange` always relays the whole board (engine plan); `strict` only on the four simple tools (engine plan Global Constraints); the reply's "cut off" wording covers both the round cap and Stop.
