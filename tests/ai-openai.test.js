import test from 'node:test';
import assert from 'node:assert/strict';
import { toOpenAIRequest, createOpenAIAccumulator, openaiProvider, listOpenAIModels } from '../src/ai/providers/openai.js';
import { MAX_TOOL_INPUT, MAX_STREAM_TEXT, ProviderError } from '../src/ai/providers/errors.js';

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

test('a tool input past 256 KB fails the reply from push, so accumulation stops there', () => {
  const acc = createOpenAIAccumulator(() => {});
  const isCap = (e) => e instanceof ProviderError && e.code === 'request' && /256 KB/.test(e.message);
  assert.throws(() => acc.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'apply_edits', arguments: '{"ops":[' + '1,'.repeat(MAX_TOOL_INPUT / 2) } }] } }] }), isCap);
  assert.throws(() => acc.result(), isCap);
});

test('text and reasoning are capped too, and the cap throws out of push', () => {
  const isCap = (e) => e instanceof ProviderError && e.code === 'request' && /2 MB/.test(e.message);
  const big = 'x'.repeat(MAX_STREAM_TEXT + 1);
  const text = createOpenAIAccumulator(() => {});
  assert.throws(() => text.push({ choices: [{ delta: { content: big } }] }), isCap);
  const reasoning = createOpenAIAccumulator(() => {});
  assert.throws(() => reasoning.push({ choices: [{ delta: { reasoning_content: big } }] }), isCap);
  assert.throws(() => reasoning.result(), isCap);
});

test('a tool call whose arguments never parse is surfaced with input null and an inputError', () => {
  const acc = createOpenAIAccumulator(() => {});
  acc.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'apply_edits', arguments: '{"ops":[},' } }] } }] });
  acc.push({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
  const r = acc.result();
  assert.equal(r.toolCalls.length, 1);
  assert.equal(r.toolCalls[0].input, null);
  assert.ok(r.toolCalls[0].inputError, 'the parser message is carried for the model');
  assert.equal(r.stop, 'tool_use');
});

test('an assistant turn with neither text nor tool calls is not replayed as content: null', () => {
  const body = toOpenAIRequest({ model: 'gpt-x', system: SYSTEM, tools: TOOLS, messages: [
    { role: 'user', content: [{ type: 'text', text: 'q' }] },
    { role: 'assistant', content: [] },
    { role: 'assistant', content: [{ type: 'text', text: '' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'a' }] },
  ] });
  assert.deepEqual(body.messages.map((m) => m.role), ['system', 'user', 'assistant']);
  assert.equal(body.messages[2].content, 'a');
  assert.equal(body.messages.some((m) => m.content === null && !m.tool_calls), false, 'no endpoint gets a null content with nothing else');
});

test('a stream that breaks mid-reply is a ProviderError, not a bare TypeError', async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'));
      controller.error(new TypeError('network error'));
    },
  });
  const p = openaiProvider({ baseUrl: 'https://example.test/v1', apiKey: 'sk', model: 'm', fetchImpl: async () => new Response(body, { status: 200 }) });
  await assert.rejects(
    () => p.chat({ system: SYSTEM, messages: [], tools: [] }),
    (e) => e instanceof ProviderError && e.code === 'network' && /endpoint/.test(e.message),
  );
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

test('migrated Ollama history replays its reasoning through chat completions', () => {
  const body = toOpenAIRequest({ model: 'glm-5.3', system: SYSTEM, tools: TOOLS, messages: [
    { role: 'assistant', content: [{ type: 'tool_use', id: 'call_0', name: 'get_board', input: {} }], raw: { thinking: 'Inspect the board.' } },
    { role: 'user', content: [{ type: 'tool_result', id: 'call_0', text: 'Empty board' }] },
  ] });
  assert.equal(body.messages[1].reasoning_content, 'Inspect the board.');
  assert.equal(body.messages[2].tool_call_id, 'call_0');
});
