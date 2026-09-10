export async function runPresentationChecks({ js, key, check, sleep }) {
  await js(`(async () => { const {EXAMPLES} = await import('/src/examples.js'); const board = structuredClone(EXAMPLES[0].doc); board.journey.forEach(s => delete s.stops); const transfer = new DataTransfer(); transfer.items.add(new File([JSON.stringify(board)], 'legacy.json', {type:'application/json'})); const input = document.getElementById('file-input'); input.files=transfer.files; input.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(150);
  await js(`document.getElementById('btn-journey').click(); document.getElementById('journey-present').click(); true`);
  check('presentation shows named chapters and bounded navigation', await js(`document.querySelectorAll('#present-chapters button').length >= 3 && document.getElementById('present-prev').disabled && !!document.getElementById('present-title').textContent`));
  await js(`document.querySelector('#present-chapters button:last-child').click(); true`);
  check('chapter rail jumps to final chapter', await js(`document.getElementById('present-next').disabled && document.querySelector('#present-chapters button:last-child').getAttribute('aria-current') === 'true'`));
  await js(`document.getElementById('present-restart').click(); document.getElementById('present-play').focus(); true`);
  await key(' ', 'Space', 32);
  check('play starts and pause cancels playback', await js(`document.getElementById('present-play').getAttribute('aria-pressed') === 'true'`));
  await js(`document.getElementById('present-play').click(); document.getElementById('present-all').click(); true`);
  check('show all clears story focus and pauses playback', await js(`!document.querySelector('#canvas .story-muted') && document.getElementById('present-play').getAttribute('aria-pressed') === 'false'`));
  await js(`document.getElementById('present-exit').click(); true`);
  check('presentation exits cleanly', await js(`document.getElementById('present-overlay').hidden && !document.getElementById('app').classList.contains('presenting')`));
  await js(`(async () => { const {EXAMPLES} = await import('/src/examples.js'); const board = structuredClone(EXAMPLES[0].doc); board.journey.forEach(s => delete s.stops); board.journey[0].stops = [{id:'beat-a',node:'n5',caption:'Read sensors'}, {id:'beat-b',node:'n6',caption:'Sample temperature'}]; const transfer = new DataTransfer(); transfer.items.add(new File([JSON.stringify(board)], 'story.json', {type:'application/json'})); const input = document.getElementById('file-input'); input.files=transfer.files; input.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(150);
  check('stop authoring renders ordered parts and captions', await js(`document.querySelectorAll('.journey-stop').length === 2 && document.querySelector('[data-stop-caption]').value === 'Read sensors'`));
  await js(`document.querySelector('[data-stop-action="down"]').click(); true`);
  check('stop reorder changes the first part', await js(`document.querySelector('.journey-stop strong').textContent.includes('Temp sensor')`));
  await js(`document.getElementById('undo').click(); document.getElementById('journey-present').click(); document.querySelector('#present-stops button').click(); true`);
  check('clicking a stop focuses its part and caption', await js(`document.querySelector('#canvas .node[data-id="n5"]').classList.contains('story-match') && document.getElementById('present-caption').textContent === 'Read sensors'`));
  await js(`document.getElementById('present-speed').value='2000'; document.getElementById('present-play').click(); true`);
  await sleep(2150);
  check('timed playback advances to the next stop', await js(`document.querySelector('#present-stops button:last-child').getAttribute('aria-current') === 'true' && document.getElementById('present-caption').textContent === 'Sample temperature'`));
  check('stop transition reveals exact wire, ports and unspecified direction', await js(`document.querySelector('#canvas .wire[data-id="w6"]').classList.contains('story-match') && document.querySelectorAll('#canvas .wire.story-match').length === 1 && document.querySelectorAll('#canvas .portg.story-port').length === 2 && document.getElementById('present-relationship').textContent.includes('Direction unspecified') && document.querySelector('#canvas .node[data-id="n6"]').classList.contains('story-current')`));
  await js(`(() => { const input = document.querySelectorAll('[data-stop-caption]')[1]; input.value='Updated while presenting'; input.dispatchEvent(new Event('change')); return true; })()`);
  check('editing the active stop pauses playback and preserves its identity', await js(`document.getElementById('present-play').getAttribute('aria-pressed') === 'false' && document.getElementById('present-caption').textContent === 'Updated while presenting' && document.querySelector('#present-stops button:last-child').getAttribute('aria-current') === 'true'`));
  await js(`(() => { const input = document.querySelectorAll('[data-stop-caption]')[1]; input.value='Sample temperature'; input.dispatchEvent(new Event('change')); document.getElementById('present-exit').click(); return true; })()`);

  await js(`document.getElementById('journey-present').click(); document.querySelector('#present-stops button:last-child').click(); navigator.clipboard.writeText = async text => { window.__storyLink = text; }; document.getElementById('present-copy').click(); true`);
  await sleep(150);
  check('copy moment includes the board and stable stop ID', await js(`document.getElementById('story-link-dialog').open && window.__storyLink.includes('stop=beat-b') && /#[dj]=/.test(window.__storyLink)`));
  await js(`location.href = window.__storyLink; location.reload(); true`);
  await sleep(700);
  check('shared board restores the exact presentation stop', await js(`!document.getElementById('present-overlay').hidden && document.getElementById('present-caption').textContent === 'Sample temperature' && document.querySelector('#present-stops button:last-child').getAttribute('aria-current') === 'true'`));
  await js(`(async () => { const {buildHTML} = await import('/src/html-export.js'); const {EXAMPLES} = await import('/src/examples.js'); const board = structuredClone(EXAMPLES[0].doc); board.journey.forEach(s => delete s.stops); board.journey[0].stops=[{id:'beat-a',node:'n5',caption:'Read sensors'},{id:'beat-b',node:'n6',caption:'Sample temperature'}]; location.href = URL.createObjectURL(new Blob([buildHTML(board)],{type:'text/html'})) + '#step=' + board.journey[0].id + '&stop=beat-b&present=1'; return true; })()`);
  await sleep(700);
  check('offline HTML restores exact stop with relationship and presentation stage', await js(`document.body.classList.contains('presenting') && document.getElementById('caption').textContent === 'Sample temperature' && document.querySelectorAll('.wire.focused').length === 1 && document.getElementById('relationship').textContent.includes('I2C')`));
  await js(`document.getElementById('restart').click(); document.querySelector('#stop-rail button').click(); document.getElementById('speed').value='2000'; document.getElementById('play').click(); true`);
  await sleep(2150);
  check('offline player advances through authored stops', await js(`document.getElementById('caption').textContent === 'Sample temperature' && location.hash.includes('stop=beat-b')`));
  await js(`document.getElementById('play').click(); document.getElementById('copy-moment').click(); true`);
  check('offline sharing explains file transfer and exposes a moment fragment', await js(`document.getElementById('moment-dialog').open && document.getElementById('moment-link').value.startsWith('#step=') && document.getElementById('moment-help').textContent.includes('send the HTML file')`));
  await js(`document.getElementById('moment-close').click(); document.getElementById('show-all').click(); true`);
  check('offline show all pauses and removes transient highlights', await js(`!document.querySelector('.muted') && document.getElementById('play').getAttribute('aria-pressed') === 'false' && !location.hash`));

}
