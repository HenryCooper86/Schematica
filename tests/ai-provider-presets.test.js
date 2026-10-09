import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettings, keyStorageKey } from '../src/ai/settings.js';
import { makeProvider } from '../src/ai/providers/index.js';

// A wrong preset must not send a plan key to the vendor's regular billing route.
const routes = [
  ['deepseek', 'https://api.deepseek.com/chat/completions'],
  ['bigmodel', 'https://open.bigmodel.cn/api/paas/v4/chat/completions'],
  ['bigmodel-coding', 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions'],
  ['zai-coding', 'https://api.z.ai/api/coding/paas/v4/chat/completions'],
  ['kimi-code', 'https://api.kimi.com/coding/v1/chat/completions'],
  ['minimax', 'https://api.minimax.io/v1/chat/completions'],
  ['minimax-token', 'https://api.minimax.io/v1/chat/completions'],
  ['qwen', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions'],
  ['gemini', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'],
  ['groq', 'https://api.groq.com/openai/v1/chat/completions'],
  ['mistral', 'https://api.mistral.ai/v1/chat/completions'],
];
for (const [provider, endpoint] of routes) {
  test(`${provider} sends its own key to its official route and consumes streamed tool calls`, async () => {
    const settings = createSettings(null);
    settings.set({ provider, model: '', baseUrl: '' });
    assert.equal(settings.get().provider, provider);
    settings.setKey(`test-${provider}`, false);
    const p = makeProvider(settings.get(), settings.getKey(), async (url, init) => {
      assert.equal(url, endpoint);
      assert.equal(init.headers.authorization, `Bearer test-${provider}`);
      const request = JSON.parse(init.body);
      assert.ok(request.model);
      assert.equal(request.tools[0].function.name, 'ping');
      if (provider.startsWith('minimax')) assert.equal(request.reasoning_split, true);
      return new Response('data: {"choices":[{"delta":{"reasoning_content":"Inspect the board.","tool_calls":[{"index":0,"id":"call_1","function":{"name":"ping","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n');
    });
    const result = await p.chat({ system: ['Call ping.'], messages: [], tools: [{ name: 'ping', description: 'Ping', input_schema: { type: 'object', properties: {} } }] });
    assert.equal(result.stop, 'tool_use');
    assert.equal(result.toolCalls[0].name, 'ping');
    assert.equal(result.raw.reasoning_content, 'Inspect the board.');
  });
}

for (const [regular, plan] of [['kimi', 'kimi-code'], ['bigmodel', 'bigmodel-coding'], ['zai', 'zai-coding'], ['minimax', 'minimax-token']]) {
  test(`${regular} and ${plan} retain separate remembered keys across reloads`, () => {
    const data = new Map();
    const storage = { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
    let settings = createSettings(storage);
    settings.set({ provider: regular, baseUrl: '', model: '' });
    settings.setKey('regular-secret', true);
    settings.set({ provider: plan, baseUrl: '', model: '' });
    assert.equal(settings.get().provider, plan);
    assert.equal(settings.getKey(), '');
    settings.setKey('plan-secret', true);
    settings = createSettings(storage);
    assert.equal(settings.getKey(), 'plan-secret');
    settings.set({ provider: regular, baseUrl: '', model: '' });
    assert.equal(settings.getKey(), 'regular-secret');
    assert.equal(data.get(keyStorageKey(plan)), 'plan-secret');
  });
}

test('a rejected plan key surfaces the provider error without falling back to regular billing', async () => {
  const settings = createSettings(null);
  settings.set({ provider: 'kimi-code', model: '', baseUrl: '' });
  const seen = [];
  const provider = makeProvider(settings.get(), 'test-plan-key', async url => {
    seen.push(url);
    return Response.json({ error: { message: 'This tool is not supported by your plan.' } }, { status: 403 });
  });
  await assert.rejects(() => provider.chat({ system: [], messages: [], tools: [] }), /not supported/);
  assert.deepEqual(seen, ['https://api.kimi.com/coding/v1/chat/completions']);
});
