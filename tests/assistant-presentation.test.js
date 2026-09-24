import test from 'node:test';
import assert from 'node:assert/strict';

test('assistant thread groups activity, escapes status text, and enables only the current undo', async () => {
  const { threadMarkup } = await import('../src/ui/assistant-thread.js');
  const snapshot = {};
  const visible = [
    { role: 'status', text: '<working>' },
    { role: 'assistant', text: 'Ready', touched: ['n1'], undoSnap: snapshot },
  ];
  const markup = threadMarkup(visible, { busy: false, undoTop: snapshot });
  assert.equal((markup.match(/class="ai-activity"/g) || []).length, 1);
  assert.ok(markup.includes('&lt;working&gt;'));
  assert.match(markup, /data-undo="1"(?! disabled)/);
  assert.match(threadMarkup(visible, { busy: true, undoTop: snapshot }), /data-undo="1" disabled/);
});
