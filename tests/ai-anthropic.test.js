import test from 'node:test';
import assert from 'node:assert/strict';
import { toAnthropicRequest, createAnthropicAccumulator, anthropicProvider } from '../src/ai/providers/anthropic.js';
import { ProviderError, MAX_TOOL_INPUT, MAX_STREAM_TEXT } from '../src/ai/providers/errors.js';

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
  assert.equal('tools' in toAnthropicRequest({ model: 'm', effort: 'low', system: SYSTEM, messages: [], tools: [] }), false, 'no tools key when the list is empty');
});

test('haiku 4.5 gets neither adaptive thinking nor an effort, other models get both', () => {
  const haiku = toAnthropicRequest({ model: 'claude-haiku-4-5', effort: 'high', system: SYSTEM, messages: [], tools: [] });
  assert.equal('thinking' in haiku, false, 'haiku rejects adaptive thinking');
  assert.equal('output_config' in haiku, false, 'haiku rejects an effort');
  const opus = toAnthropicRequest({ model: 'claude-opus-5', effort: 'high', system: SYSTEM, messages: [], tools: [] });
  assert.deepEqual(opus.thinking, { type: 'adaptive' });
  assert.deepEqual(opus.output_config, { effort: 'high' });
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

test('empty text never reaches the wire: no blank system block, no blank assistant block', () => {
  const one = toAnthropicRequest({ model: 'm', effort: 'low', system: ['S', ''], tools: [], messages: [] });
  assert.deepEqual(one.system, [{ type: 'text', text: 'S', cache_control: { type: 'ephemeral' } }], 'one block, and it carries the cache breakpoint');
  const built = toAnthropicRequest({ model: 'm', effort: 'low', system: SYSTEM, tools: TOOLS, messages: [
    { role: 'user', content: [{ type: 'text', text: 'q' }] },
    { role: 'assistant', content: [{ type: 'text', text: '' }, { type: 'tool_use', id: 'c1', name: 'get_board', input: {} }] },
  ] });
  assert.deepEqual(built.messages[1].content, [{ type: 'tool_use', id: 'c1', name: 'get_board', input: {} }]);
  const rawed = toAnthropicRequest({ model: 'm', effort: 'low', system: SYSTEM, tools: TOOLS, messages: [
    { role: 'user', content: [{ type: 'text', text: 'q' }] },
    { role: 'assistant', content: [], raw: [{ type: 'text', text: '' }, { type: 'tool_use', id: 'c1', name: 'get_board', input: {} }] },
    { role: 'assistant', content: [{ type: 'text', text: '' }] },
  ] });
  assert.deepEqual(rawed.messages[1].content, [{ type: 'tool_use', id: 'c1', name: 'get_board', input: {} }], 'raw blocks are filtered too');
  assert.equal(rawed.messages.length, 2, 'an assistant turn left with no blocks is dropped');
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

test('a refusal carries its stop details out of the accumulator', () => {
  const acc = createAnthropicAccumulator(() => {});
  acc.push({ event: 'message_delta', data: { delta: { stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: 'nope' } }, usage: { output_tokens: 3 } } });
  const r = acc.result();
  assert.equal(r.stop, 'refusal');
  assert.equal(r.stopDetails.explanation, 'nope');
  assert.equal(r.stopDetails.category, 'cyber');
  const plain = createAnthropicAccumulator(() => {});
  plain.push({ event: 'message_delta', data: { delta: { stop_reason: 'end_turn' }, usage: {} } });
  assert.equal(plain.result().stopDetails, null);
});

test('a tool input past 256 KB fails the reply from push, so accumulation stops there', () => {
  const acc = createAnthropicAccumulator(() => {});
  acc.push({ event: 'content_block_start', data: { index: 0, content_block: { type: 'tool_use', id: 'c', name: 'apply_edits', input: {} } } });
  const isCap = (e) => e instanceof ProviderError && e.code === 'request' && /256 KB/.test(e.message);
  assert.throws(() => acc.push({ event: 'content_block_delta', data: { index: 0, delta: { type: 'input_json_delta', partial_json: '{"ops":[' + '1,'.repeat(MAX_TOOL_INPUT / 2) } } }), isCap);
  assert.throws(() => acc.result(), isCap);
});

test('text and thinking are capped too, and the cap throws out of push', () => {
  const isCap = (e) => e instanceof ProviderError && e.code === 'request' && /2 MB/.test(e.message);
  const big = 'x'.repeat(MAX_STREAM_TEXT + 1);
  const text = createAnthropicAccumulator(() => {});
  text.push({ event: 'content_block_start', data: { index: 0, content_block: { type: 'text', text: '' } } });
  assert.throws(() => text.push({ event: 'content_block_delta', data: { index: 0, delta: { type: 'text_delta', text: big } } }), isCap);
  const thinking = createAnthropicAccumulator(() => {});
  thinking.push({ event: 'content_block_start', data: { index: 0, content_block: { type: 'thinking', thinking: '' } } });
  assert.throws(() => thinking.push({ event: 'content_block_delta', data: { index: 0, delta: { type: 'thinking_delta', thinking: big } } }), isCap);
  assert.throws(() => thinking.result(), isCap);
});

test('a tool call whose JSON never parses is surfaced with input null and an inputError', () => {
  const acc = createAnthropicAccumulator(() => {});
  acc.push({ event: 'content_block_start', data: { index: 0, content_block: { type: 'tool_use', id: 'c1', name: 'apply_edits', input: {} } } });
  acc.push({ event: 'content_block_delta', data: { index: 0, delta: { type: 'input_json_delta', partial_json: '{"ops":[},' } } });
  acc.push({ event: 'content_block_stop', data: { index: 0 } });
  acc.push({ event: 'message_delta', data: { delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 4 } } });
  const r = acc.result();
  assert.equal(r.toolCalls.length, 1);
  assert.equal(r.toolCalls[0].input, null);
  assert.ok(r.toolCalls[0].inputError, 'the parser message is carried for the model');
  assert.equal(r.stop, 'tool_use');
  assert.deepEqual(r.raw[0].input, {}, 'the replayed block keeps an object, as the API requires');
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
  const t0 = Date.now();
  await assert.rejects(
    () => p.chat({ system: SYSTEM, messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }], tools: [] }),
    (err) => err instanceof ProviderError && err.code === 'auth' && err.status === 401 && /bad key/.test(err.message),
  );
  assert.equal(calls, 2, 'the 429 was retried once');
  assert.ok(Date.now() - t0 < 2000, 'retry-after: 0 means an immediate retry');
  const down = anthropicProvider({ baseUrl: 'https://x', apiKey: 'sk', model: 'm', effort: 'low', fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(() => down.chat({ system: SYSTEM, messages: [], tools: [] }), (err) => err.code === 'network');
});

test('a stream that breaks mid-reply is a ProviderError, not a bare TypeError', async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event: message_start\ndata: {"message":{"usage":{}}}\n\n'));
      controller.error(new TypeError('network error'));
    },
  });
  const p = anthropicProvider({ baseUrl: 'https://example.test', apiKey: 'sk', model: 'm', effort: 'low', fetchImpl: async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }) });
  await assert.rejects(
    () => p.chat({ system: SYSTEM, messages: [], tools: [] }),
    (e) => e instanceof ProviderError && e.code === 'network' && /Anthropic/.test(e.message),
  );
});

test('a cap reached mid-stream stops the reader instead of reading to the end', async () => {
  let pulls = 0;
  const chunk = `event: content_block_delta\ndata: ${JSON.stringify({ index: 0, delta: { type: 'text_delta', text: 'y'.repeat(MAX_STREAM_TEXT + 1) } })}\n\n`;
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(`event: content_block_start\ndata: ${JSON.stringify({ index: 0, content_block: { type: 'text', text: '' } })}\n\n`)); },
    pull(controller) { pulls += 1; controller.enqueue(new TextEncoder().encode(chunk)); },
    cancel() { cancelled = true; },
  });
  const p = anthropicProvider({ baseUrl: 'https://example.test', apiKey: 'sk', model: 'm', effort: 'low', fetchImpl: async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }) });
  await assert.rejects(() => p.chat({ system: SYSTEM, messages: [], tools: [] }), (e) => e instanceof ProviderError && /2 MB/.test(e.message));
  assert.ok(cancelled, 'the reader was cancelled at the cap');
  assert.ok(pulls <= 2, `the stream was not drained (${pulls} pulls)`);
});

test('Stop during rate-limit backoff does not send another request', async () => {
  const controller = new AbortController();
  let calls = 0;
  const p = anthropicProvider({ baseUrl: 'https://example.test', model: 'm', fetchImpl: async () => {
    calls++;
    if (calls === 1) {
      queueMicrotask(() => controller.abort());
      return new Response('{}', { status: 429, headers: { 'retry-after': '0.2' } });
    }
    return sse([['message_delta', { delta: { stop_reason: 'end_turn' } }]]);
  } });
  await assert.rejects(() => p.chat({ system: SYSTEM, messages: [], tools: [], signal: controller.signal }), (e) => e.name === 'AbortError');
  assert.equal(calls, 1);
});
