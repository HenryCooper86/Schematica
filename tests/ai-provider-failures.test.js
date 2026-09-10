import test from 'node:test';
import assert from 'node:assert/strict';
import { openaiProvider } from '../src/ai/providers/openai.js';
import { anthropicProvider } from '../src/ai/providers/anthropic.js';
import { runRequest } from '../src/ai/agent.js';

const args = { system: ['test'], messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], tools: [] };
const sse = (data) => data.map((d) => `data: ${JSON.stringify(d)}\n\n`).join('');
const fixtures = [
  ['OpenAI-compatible', openaiProvider, sse([{ error: { code: 429, message: 'Rate limit exceeded' } }]), sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'apply_edits', arguments: '{"ops":[]}' } }] } }] }])],
  ['Anthropic', anthropicProvider, sse([{ type: 'error', error: { message: 'overloaded' } }]), sse([{ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'c', name: 'apply_edits', input: {} } }, { type: 'content_block_stop', index: 0 }])],
];
for (const [name, factory, errorBody, partialBody] of fixtures) {
  const provider = (body) => factory({ baseUrl: 'https://example.test', model: 'test', fetchImpl: async () => new Response(body) });
  test(`${name}: a streamed error fails instead of returning an empty successful reply`, async () => {
    await assert.rejects(() => provider(errorBody).chat(args), (e) => e.name === 'ProviderError' && /Rate limit|crashed|overloaded/.test(e.message));
  });
  test(`${name}: an interrupted tool stream cannot edit the board`, async () => {
    let edits = 0;
    const result = await runRequest({ provider: provider(partialBody), executor: { touched: new Set(), resetTouched() {}, run() { edits++; return { text: 'ok' }; } }, system: ['test'], userText: 'edit', boardText: '' });
    assert.equal(edits, 0);
    assert.equal(result.error?.code, 'network');
  });
  test(`${name}: a 200 response containing HTML is not a successful connection`, async () => {
    await assert.rejects(() => provider('<html>Login required</html>').chat(args));
  });
}

// Malformed arguments the model can retry: the tool is not run, the call is
// answered with an is_error result, and the turn continues.
for (const [name, factory, bad, done] of [
  ['OpenAI-compatible', openaiProvider,
    sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'apply_edits', arguments: '{"ops":[},' } }] }, finish_reason: 'tool_calls' }] }]),
    sse([{ choices: [{ delta: { content: 'Sorry.' }, finish_reason: 'stop' }] }])],
  ['Anthropic', anthropicProvider,
    sse([{ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'c', name: 'apply_edits', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"ops":[},' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } }]),
    sse([{ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Sorry.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } }])],
]) {
  test(`${name}: unparsable tool arguments are answered with an error result so the model can retry`, async () => {
    const bodies = [];
    let edits = 0;
    const provider = factory({ baseUrl: 'https://example.test', model: 'test', fetchImpl: async (url, init) => {
      bodies.push(JSON.parse(init.body));
      return new Response(bodies.length === 1 ? bad : done);
    } });
    const result = await runRequest({ provider, executor: { touched: new Set(), resetTouched() {}, run() { edits++; return { text: 'ok' }; } }, system: ['test'], userText: 'edit', boardText: '' });
    assert.equal(result.error, undefined);
    assert.equal(edits, 0, 'a call with no arguments is never run');
    assert.equal(bodies.length, 2, 'the turn continued instead of throwing a SyntaxError');
    assert.equal(result.text, 'Sorry.');
    const answer = result.messages.find((m) => m.content.some?.((b) => b.type === 'tool_result'));
    const block = answer.content.find((b) => b.type === 'tool_result');
    assert.equal(block.id, 'c');
    assert.equal(block.isError, true);
    assert.match(block.text, /not valid JSON/);
  });
}

test('OpenAI-compatible: reaching the length limit with incomplete arguments reports a cutoff', async () => {
  const provider = openaiProvider({ baseUrl: 'https://example.test', model: 'test', fetchImpl: async () => new Response(sse([{ choices: [{ delta: { content: 'Working', tool_calls: [{ index: 0, id: 'c', function: { name: 'apply_edits', arguments: '{"ops":[' } }] }, finish_reason: 'length' }] }])) });
  const result = await provider.chat(args);
  assert.equal(result.stop, 'max_tokens');
  assert.deepEqual(result.toolCalls, []);
});

test('Anthropic: incomplete tool JSON at the length limit reports a cutoff', async () => {
  const provider = anthropicProvider({ baseUrl: 'https://example.test', model: 'test', fetchImpl: async () => new Response(sse([
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'c', name: 'apply_edits', input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"ops":[' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'max_tokens' } },
  ])) });
  const result = await provider.chat(args);
  assert.equal(result.stop, 'max_tokens');
  assert.deepEqual(result.toolCalls, []);
});

for (const [name, factory, first, second, field] of [
  ['Kimi', openaiProvider, sse([{ choices: [{ delta: { reasoning_content: 'Keep this context. ' } }] }, { choices: [{ delta: { reasoning_content: 'And this.', tool_calls: [{ index: 0, id: 'c', function: { name: 'get_board', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }]), sse([{ choices: [{ delta: { content: 'Done' }, finish_reason: 'stop' }] }]), 'reasoning_content'],
]) {
  test(`${name}: the next tool round retains reasoning without showing it as assistant text`, async () => {
    const bodies = [];
    const shown = [];
    const provider = factory({ baseUrl: 'https://example.test', model: 'test', fetchImpl: async (url, init) => { bodies.push(JSON.parse(init.body)); return new Response(bodies.length === 1 ? first : second); } });
    const result = await runRequest({ provider, executor: { touched: new Set(), resetTouched() {}, run() { return { text: 'board' }; } }, system: ['test'], userText: 'read', boardText: '', onText: (text) => shown.push(text) });
    assert.equal(result.error, undefined);
    assert.equal(bodies[1].messages.find((m) => m.role === 'assistant')[field], 'Keep this context. And this.');
    assert.deepEqual(shown, ['Done']);
  });
}

for (const [finish, stop, cutOff] of [['length', 'max_tokens', true], ['content_filter', 'refusal', false]]) {
  test(`single-shot mode cannot apply a ${stop} reply even when its JSON plan is complete`, async () => {
    const { runSingleShot } = await import('../src/ai/agent.js');
    let edits = 0;
    let requests = 0;
    const provider = openaiProvider({ baseUrl: 'https://example.test', model: 'test', fetchImpl: async () => {
      requests++;
      return new Response(sse([{ choices: [{ delta: { content: '{"summary":"Change title","ops":[{"op":"set_title","title":"bad"}]}' }, finish_reason: finish }] }]));
    } });
    const result = await runSingleShot({ provider, executor: { touched: new Set(), resetTouched() {}, run() { edits++; return { text: 'ok' }; } }, system: ['test'], userText: 'edit', boardText: '' });
    assert.equal(edits, 0);
    assert.equal(requests, 1);
    assert.equal(result.stop, stop);
    assert.equal(result.cutOff, cutOff);
    assert.equal(result.error, undefined);
  });
}

for (const provider of ['kimi', 'openai']) {
  test(`${provider}: an unreachable relay explains how to configure a working endpoint`, async () => {
    const { PROVIDERS, RELAY } = await import('../src/ai/settings.js');
    const { makeProvider } = await import('../src/ai/providers/index.js');
    const p = makeProvider({ provider, ...PROVIDERS[provider], ...(provider === 'openai' ? { baseUrl: `${RELAY}/ollama.com/v1` } : {}) }, 'test-key', async () => { throw new TypeError('Failed to fetch'); });
    await assert.rejects(() => p.chat(args), (e) => e.code === 'network' && /relay/i.test(e.hint) && /Base URL/.test(e.hint));
  });
}
