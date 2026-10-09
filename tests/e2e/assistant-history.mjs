export async function runAssistantHistoryChecks({ send, js, check, sleep, fakeSeen, capture, origin }) {
  const wait = async expr => {
    for (let i = 0; i < 100; i++) { if (await js(expr).catch(() => false)) return; await sleep(50); }
    throw new Error('History check timed out: ' + expr);
  };
  const open = () => js(`if (document.getElementById('assistant').hidden) document.getElementById('btn-assistant').click(); true`);
  const click = id => js(`document.getElementById(${JSON.stringify(id)}).click(); true`);
  const type = (id, value) => js(`{ const input = document.getElementById(${JSON.stringify(id)}); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input')); } true`);
  const records = `Object.keys(localStorage).filter(k => k.startsWith('schematica.ai.conversation.')).map(k => JSON.parse(localStorage.getItem(k)))`;
  // The preceding team-review suite closes its fixture on about:blank.
  await send('Page.navigate', { url: origin + '/' });
  await wait(`location.origin === ${JSON.stringify(origin)} && document.readyState === 'complete' && !!document.getElementById('ai-input')`);
  // Start with a pre-upgrade transcript; all provider calls stay inside the fixture server.
  await js(`document.getElementById('ai-new').click(); window.dispatchEvent(new Event('pagehide')); for (const k of Object.keys(localStorage)) if (k.startsWith('schematica.ai.conversation.')) localStorage.removeItem(k);
    localStorage.setItem('schematica.ai.thread', JSON.stringify({ history: [], visible: [{role:'user',text:'Review robot wiring'}, {role:'assistant',text:'Check the battery voltage before connecting the motor.',touched:['old-node'],undoSnap:{}}], totals:{input:42,output:12} }));
    localStorage.setItem('schematica.ai.settings', JSON.stringify({provider:'anthropic',model:'test-model',baseUrl:location.origin+'/fake',remember:true,tools:true}));
    localStorage.setItem('schematica.ai.key.anthropic','sk-fake-history'); true`);
  await send('Page.reload');
  await wait(`document.getElementById('ai-thread')?.textContent.includes('Review robot wiring')`);
  await open();
  check('existing conversations migrate into history without obsolete board actions', await js(`localStorage.getItem('schematica.ai.thread') === null && (${records}).length === 1 && !document.querySelector('#ai-thread [data-undo], #ai-thread [data-show]') && document.getElementById('ai-usage').textContent.includes('42')`));
  await type('ai-input', 'Add a fuse to the motor rail');
  await click('ai-new');
  check('New thread saves the previous draft and opens a blank conversation', await js(`document.getElementById('ai-input').value === '' && !document.querySelector('#ai-thread .ai-msg') && (${records})[0].draft === 'Add a fuse to the motor rail'`));
  await type('ai-input', 'Design a weather station');
  await js(`window.dispatchEvent(new Event('pagehide')); true`);
  await send('Page.reload');
  await wait(`document.getElementById('ai-input')?.value === 'Design a weather station'`);
  await open();
  check('drafts survive reload independently of the previous conversation', await js(`(${records}).length === 2 && !document.querySelector('#ai-thread .ai-msg')`));
  const boardBefore = await js(`localStorage.getItem('schematica.autosave')`);
  await click('ai-history-toggle');
  check('history shows searchable sessions with dates and uses the panel space', await js(`document.querySelectorAll('#ai-history-list [data-conversation]').length === 2 && document.querySelectorAll('#ai-history-list time').length === 2 && document.getElementById('ai-foot').getBoundingClientRect().height === 0 && document.getElementById('ai-history').getBoundingClientRect().height > 0`));
  if (capture) await capture('conversation-history');
  await type('ai-history-search', 'battery voltage');
  check('history search finds text inside past replies', await js(`document.querySelectorAll('#ai-history-list [data-conversation]').length === 1 && document.querySelector('#ai-history-list strong').textContent === 'Review robot wiring'`));
  await js(`document.querySelector('#ai-history-list [data-conversation]').click(); true`);
  check('reopening restores transcript and draft without changing the board', await js(`document.getElementById('ai-input').value === 'Add a fuse to the motor rail' && document.getElementById('ai-thread').textContent.includes('battery voltage') && !document.getElementById('ai-resumed-note').hidden && localStorage.getItem('schematica.autosave') === ${JSON.stringify(boardBefore)}`));
  await click('ai-history-toggle');
  await type('ai-history-search', 'weather station');
  await click('btn-lang');
  check('history stays open and retains search when switching languages', await js(`document.getElementById('assistant').classList.contains('history-open') && document.getElementById('ai-history-search').value === 'weather station' && document.getElementById('ai-history').textContent.includes('对话记录')`));
  await click('btn-lang');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  check('history fits the narrow assistant panel', await js(`document.getElementById('ai-history').scrollWidth <= document.getElementById('ai-history').clientWidth + 1 && document.querySelector('#ai-history-list [data-conversation]').getBoundingClientRect().right <= innerWidth`));
  await send('Emulation.clearDeviceMetricsOverride');
  await js(`window.__confirm = window.confirm; window.confirm = () => false; document.querySelector('[data-delete-conversation]').click(); true`);
  check('cancelling deletion preserves the conversation', await js(`(${records}).length === 2`));
  await js(`window.confirm = () => true; document.querySelector('[data-delete-conversation]').click(); window.confirm = window.__confirm; delete window.__confirm; true`);
  check('confirmed deletion removes only the chosen conversation', await js(`(${records}).length === 1 && !document.querySelector('#ai-history-list [data-conversation]')`));
  await click('ai-history-back');
  const beforeRequests = fakeSeen.length;
  await type('ai-input', 'Fix this finding: add a fuse note');
  const blocked = await js(`document.getElementById('ai-send').click(); ({history:document.getElementById('ai-history-toggle').disabled,newThread:document.getElementById('ai-new').disabled})`);
  check('session switching is disabled during an active request', blocked.history && blocked.newThread);
  await wait(`document.getElementById('ai-stop').hidden && document.getElementById('ai-preview-dialog')?.open`);
  const resumed = fakeSeen.slice(beforeRequests).find(r => r.lastText.includes('Fix this finding:'));
  check('a resumed request includes earlier user and assistant text without stale tool blocks', resumed?.body.messages.some(m => m.role === 'user' && m.content.some(b => b.text?.includes('Review robot wiring'))) && resumed.body.messages.some(m => m.role === 'assistant' && m.content.some(b => b.text?.includes('battery voltage'))) && resumed.body.messages.every(m => m.content.every(b => b.type === 'text')));
  check('session switching remains disabled while an edit preview awaits a decision', await js(`document.getElementById('ai-history-toggle').disabled && document.getElementById('ai-new').disabled`));
  await js(`document.getElementById('ai-preview-discard').click(); true`);
  await wait(`!document.getElementById('ai-preview-dialog') && !document.getElementById('ai-history-toggle').disabled`);
  check('resolving the preview unlocks history and preserves the current board', await js(`!document.getElementById('ai-history-toggle').disabled && !document.getElementById('ai-new').disabled && localStorage.getItem('schematica.autosave') === ${JSON.stringify(boardBefore)}`));
  await click('ai-new');
  await send('Page.reload');
  await wait(`!!document.getElementById('ai-input')`);
  check('starting a new conversation stays blank on reload and retains archived messages', await js(`document.getElementById('ai-input').value === '' && !document.querySelector('#ai-thread .ai-msg') && (${records}).length === 1 && (${records})[0].visible.some(m => m.text.includes('Fix this finding:'))`));
}
