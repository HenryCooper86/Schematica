import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationStore, conversationContext, CONVERSATION_PREFIX, ACTIVE_CONVERSATION_KEY } from '../src/ai/conversations.js';
import { conversationListMarkup } from '../src/ui/assistant-history.js';
const storage = () => { const data = new Map(); return { get length() { return data.size; }, key: i => [...data.keys()][i], getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }; };
const message = text => ({ role: 'user', text });

test('saves and reopens independent conversations and drafts without board or credential data', () => {
  const disk = storage(); const sessions = createConversationStore(disk);
  const first = sessions.save({ visible: [message('Design a sensor board')], draft: 'Add a battery', boardTitle: 'Sensors', apiKey: 'secret', history: ['provider-private'], totals: { input: 24 } });
  const second = sessions.save({ visible: [message('Review robot wiring')], boardTitle: 'Robot' });
  const reloaded = createConversationStore(disk);
  assert.equal(reloaded.list().length, 2);
  assert.equal(reloaded.current().id, second.id);
  reloaded.activate(first.id);
  assert.equal(reloaded.current().draft, 'Add a battery');
  assert.equal(reloaded.current().totals.input, 24);
  assert.doesNotMatch(disk.getItem(CONVERSATION_PREFIX + first.id), /secret|provider-private/);
  assert.equal(reloaded.current().boardTitle, 'Sensors');
});
test('archives the full visible conversation but strips undo snapshots and board-specific actions', () => {
  const sessions = createConversationStore(storage());
  const visible = Array.from({ length: 125 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: String(i), undoSnap: { board: 'private' }, touched: ['node1'] }));
  const record = sessions.save({ visible });
  assert.equal(record.visible.length, 125);
  assert.deepEqual(record.visible[0], { role: 'user', text: '0' });
});
test('migrates the existing single conversation once and keeps a new blank session blank on reload', () => {
  const disk = storage();
  disk.setItem('schematica.ai.thread', JSON.stringify({ visible: [message('Existing conversation')], history: [], totals: {} }));
  const sessions = createConversationStore(disk);
  assert.equal(sessions.current().title, 'Existing conversation');
  assert.equal(disk.getItem('schematica.ai.thread'), null);
  sessions.clearActive();
  const restored = createConversationStore(disk);
  assert.equal(restored.current(), null);
  assert.equal(restored.list().length, 1);
  assert.equal(restored.save({ visible: [], draft: '   ' }), null);
});
test('two tabs retain conversations created by either tab', () => {
  const disk = storage(); const a = createConversationStore(disk), b = createConversationStore(disk);
  const first = a.save({ visible: [message('First')] });
  b.save({ visible: [message('Second')] });
  assert.equal(a.list().length, 2);
  a.save({ ...first, draft: 'Continued' });
  assert.equal(b.list().length, 2);
  assert.equal(b.get(first.id).draft, 'Continued');
});
test('corrupt records do not prevent valid history from opening', () => {
  const disk = storage(); const sessions = createConversationStore(disk);
  sessions.save({ visible: [message('Keep me')] });
  disk.setItem(CONVERSATION_PREFIX + 'broken', '{invalid');
  disk.setItem(CONVERSATION_PREFIX + 'invalid', JSON.stringify({ id: 'invalid', visible: [{}] }));
  assert.equal(createConversationStore(disk).list().length, 1);
});
test('quota failures preserve older history and keep the current draft in memory with a warning', () => {
  const disk = storage(); const sessions = createConversationStore(disk);
  const first = sessions.save({ visible: [message('Saved')] });
  disk.setItem = () => { throw new Error('Quota'); };
  const second = sessions.save({ visible: [message('Unsaved')], draft: 'Keep locally' });
  assert.equal(sessions.failed(), true);
  assert.equal(sessions.get(first.id).title, 'Saved');
  assert.equal(sessions.get(second.id).draft, 'Keep locally');
  assert.equal(sessions.list().length, 2);
});
test('deleting one conversation retains the others and clears its active pointer', () => {
  const disk = storage(); const sessions = createConversationStore(disk);
  const first = sessions.save({ visible: [message('First')] });
  const second = sessions.save({ visible: [message('Second')] });
  assert.equal(sessions.remove(second.id), true);
  assert.equal(disk.getItem(ACTIVE_CONVERSATION_KEY), null);
  assert.deepEqual(sessions.list().map(s => s.id), [first.id]);
});

test('resuming uses bounded text context beginning with a user and excludes status and tool data', () => {
  const visible = Array.from({ length: 101 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: String(i), touched: ['n1'] }));
  const context = conversationContext([...visible, { role: 'status', text: 'Draft discarded' }, { role: 'assistant', text: '' }]);
  assert.ok(context.length <= 40);
  assert.equal(context[0].role, 'user');
  assert.equal(context.at(-1).content[0].text, '100');
  assert.ok(context.every(m => Object.keys(m).join() === 'role,content' && m.content[0].type === 'text'));
});
test('history search matches message bodies, escapes content and tolerates invalid dates', () => {
  const disk = storage();
  disk.setItem(CONVERSATION_PREFIX + 'invalid-date', JSON.stringify({ version: 1, id: 'invalid-date', visible: [message('<script>alert(1)</script>'), { role: 'assistant', text: 'battery wiring' }], updatedAt: 1e100 }));
  const records = createConversationStore(disk).list();
  const markup = conversationListMarkup(records, null, 'battery');
  assert.match(markup, /data-conversation="invalid-date"/);
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;/);
  assert.match(conversationListMarkup(records, null, 'no match'), /No matching conversations/);
});
test('blocked storage keeps sessions in memory and failed deletes preserve their records', () => {
  const sessions = createConversationStore(null);
  const saved = sessions.save({ visible: [message('Retained in memory')] });
  assert.equal(sessions.failed(), true);
  assert.equal(sessions.get(saved.id).title, 'Retained in memory');
  const disk = storage(), persistent = createConversationStore(disk);
  const record = persistent.save({ visible: [message('Retained on disk')] });
  disk.removeItem = () => { throw new Error('Blocked'); };
  assert.equal(persistent.remove(record.id), false);
  assert.equal(persistent.list().length, 1);
});
