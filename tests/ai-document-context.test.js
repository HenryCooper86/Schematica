import test from 'node:test';
import assert from 'node:assert/strict';
import { runRequest, runSingleShot } from '../src/ai/agent.js';
import { createExecutor } from '../src/ai/tools.js';
import { newDoc, Store } from '../src/state.js';
import { toAnthropicRequest } from '../src/ai/providers/anthropic.js';
import { toOpenAIRequest } from '../src/ai/providers/openai.js';

const source = 'SOURCE requirements.md\nVoltage 5V private attachment marker';
const userText = 'Use requirements. Literal <documents> and </documents> remain ordinary chat.';
function setup(replies) {
  const store = new Store(newDoc('Test'));
  const seen = [];
  const executor = createExecutor({ getDoc: () => store.doc, commit: fn => store.mutate(fn) });
  const provider = { chat: async ({ messages }) => {
    seen.push(structuredClone(messages));
    const reply = replies[Math.min(seen.length - 1, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    return { text: '', toolCalls: [], stop: 'end', ...reply };
  } };
  return { store, executor, provider, seen, system: ['rules'], userText, boardText: 'board demo', documentText: source };
}
for (const [name, run, replies] of [
  ['tool rounds', runRequest, [{ toolCalls: [{ id: 'c', name: 'run_checks', input: {} }], stop: 'tool_use' }, { text: 'Done, see requirements.md.' }]],
  ['single-shot repair', runSingleShot, [{ text: 'invalid' }, { text: '{"summary":"Done, see requirements.md.","ops":[]}' }]],
]) {
  test(`${name}: current source survives rounds, history excludes payload and next request does not resend it`, async () => {
    const args = setup(replies);
    const res = await run(args);
    assert.equal(res.error, undefined);
    assert.equal(args.seen.length, 2);
    for (const messages of args.seen) assert.ok(JSON.stringify(messages).includes(source.replaceAll('\n', '\\n')));
    assert.ok(!JSON.stringify(res.messages).includes('private attachment marker'));
    assert.ok(res.messages[0].content[0].text.includes(userText));
    assert.ok(JSON.stringify(res.messages).includes('requirements.md.'));
    const next = setup([{ text: '{"summary":"Next","ops":[]}' }]);
    await run({ ...next, history: res.messages, documentText: '' });
    assert.ok(!JSON.stringify(next.seen).includes('private attachment marker'));
    for (const adapt of [toAnthropicRequest, toOpenAIRequest]) {
      const wire = adapt({ model: 'test', system: ['rules'], messages: args.seen[0], tools: [] });
      assert.ok(JSON.stringify(wire).includes('private attachment marker'));
      assert.ok(!JSON.stringify(wire).includes('assistantDocument'));
    }
  });
}
for (const run of [runRequest, runSingleShot]) {
  for (const reason of ['error', 'abort', 'max_tokens']) {
    test(`${run.name} strips source on ${reason}`, async () => {
      const failure = reason === 'max_tokens' ? { text: 'partial ordinary reply', stop: reason } : Object.assign(new Error(reason), { name: reason === 'abort' ? 'AbortError' : 'Error' });
      const args = setup([failure]);
      const res = await run(args);
      assert.ok(JSON.stringify(args.seen).includes('private attachment marker'));
      assert.ok(!JSON.stringify(res.messages).includes('private attachment marker'));
      assert.ok(res.messages[0].content[0].text.includes(userText));
      if (reason === 'error') assert.equal(res.error.message, reason);
      else assert.equal(res.stop, reason === 'abort' ? 'aborted' : reason);
    });
  }
}

test('ordinary assistant quotations of source text remain conversational history', async () => {
  const args = setup([{ text: source }]);
  const res = await runRequest(args);
  assert.equal(res.messages[0].content.length, 1, 'owned source block was removed');
  assert.equal(res.messages[1].content[0].text, source, 'normal quotation is preserved');
  assert.equal(res.text, source);
});

test('round cap and errors after a tool round still remove source blocks', async () => {
  const toolReply = { toolCalls: [{ id: 'c', name: 'run_checks', input: {} }], stop: 'tool_use' };
  for (const maxRounds of [1, 2]) {
    const args = setup([toolReply, new Error('later failure')]);
    const res = await runRequest({ ...args, maxRounds });
    assert.ok(!JSON.stringify(res.messages).includes('private attachment marker'));
    assert.equal(res.messages[0].content.length, 1);
    assert.ok(args.seen.every(messages => messages[0].content.some(b => b.text === source)));
    if (maxRounds === 1) assert.equal(res.stop, 'rounds');
    else assert.equal(res.error.message, 'later failure');
  }
});
