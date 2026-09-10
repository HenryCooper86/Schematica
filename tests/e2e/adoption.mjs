export async function runAdoptionChecks({ js, key, check, sleep }) {
  await js(`for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close(); if (!document.getElementById('explore-panel').hidden) document.getElementById('explore-close').click(); if (!document.getElementById('journey-panel').hidden) document.getElementById('btn-journey').click(); document.getElementById('canvas').focus(); true`);
  await key('/', 'Slash', 191);
  await js(`const q = document.getElementById('board-search'); q.value = 'ESP32'; q.dispatchEvent(new Event('input')); true`);
  await key('Enter', 'Enter', 13);
  await js(`document.getElementById('explore-close').click(); document.getElementById('btn-journey').click(); document.getElementById('journey-add').click(); true`);
  await js(`document.querySelector('.journey-step:nth-last-child(2) [data-jact="link"]').click(); true`);
  check('journey step links to selected parts', await js(`document.querySelector('.journey-step:nth-last-child(2)').textContent.includes('Linked to parts and wires')`));
  await js(`document.querySelector('.journey-step:nth-last-child(2) [data-jact="go"]').click(); true`);
  check('linked journey Go highlights exact targets', await js(`document.querySelector('#canvas .node[data-id="n5"]').classList.contains('story-match') && document.querySelectorAll('#canvas .node.story-match').length === 1`));
  await sleep(650);
  await js(`document.querySelector('.journey-step:nth-last-child(2) [data-jact="unlink"]').click(); true`);
  check('camera-only action removes linked highlighting', await js(`!document.querySelector('#canvas .story-match') && !document.querySelector('.journey-step:nth-last-child(2) [data-jact="unlink"]')`));
  await js(`document.getElementById('undo').click(); document.querySelector('.journey-step:nth-last-child(2) [data-jact="go"]').click(); true`);
  check('undo restores journey targets', await js(`!!document.querySelector('#canvas .story-match')`));
  await js(`document.getElementById('explore-bus').value='power'; document.getElementById('explore-bus').dispatchEvent(new Event('change')); document.getElementById('explore-depth').value='overview'; document.getElementById('explore-depth').dispatchEvent(new Event('change')); true`);
  check('exploration changes clear the previous journey highlight', await js(`!document.querySelector('#canvas .story-match')`));
  await js(`document.getElementById('journey-present').click(); true`);
  check('Present isolates its view from exploration filters and hidden detail', await js(`!document.querySelector('#canvas .explore-muted') && document.querySelector('#canvas .layer-diagram').dataset.depth === 'full'`));
  await js(`document.getElementById('present-exit').click(); document.getElementById('explore-reset').click(); true`);
  check('leaving Present clears story highlighting', await js(`!document.querySelector('#canvas .story-match, #canvas .story-muted')`));

  await js(`document.getElementById('explore-compare').click(); true`);
  await js(`(async () => { const {EXAMPLES} = await import('/src/examples.js'); const prior = structuredClone(EXAMPLES.find(e => e.id === 'weather-station').doc); prior.nodes[0].x -= 50; prior.nodes[0].label = 'Previous label'; const transfer = new DataTransfer(); transfer.items.add(new File([JSON.stringify(prior)], 'earlier.json', {type:'application/json'})); const input = document.getElementById('compare-file'); input.files = transfer.files; input.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(150);
  check('comparison shows before/after previews and distinguishes movement', await js(`document.querySelectorAll('.compare-previews svg').length === 2 && document.getElementById('compare-status').textContent.includes('Layout changed: 1') && document.getElementById('compare-status').textContent.includes('Changed: 1')`));
  check('comparison receipt is available and details show actual changes', await js(`!document.getElementById('compare-download').disabled && document.getElementById('compare-changes').textContent.includes('Previous label')`));
  await js(`document.getElementById('compare-close').click(); true`);

  await js(`(async () => { const {EXAMPLES} = await import('/src/examples.js'); const board = structuredClone(EXAMPLES.find(e => e.id === 'weather-station').doc); board.nodes[0].x = board.nodes[1].x; board.nodes[0].y = board.nodes[1].y; const transfer = new DataTransfer(); transfer.items.add(new File([JSON.stringify(board)], 'overlap.json', {type:'application/json'})); const input = document.getElementById('file-input'); input.files = transfer.files; input.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(150);
  await js(`document.getElementById('btn-check').click(); document.querySelector('[data-check-mode="layout"]').click(); true`);
  check('layout quality tab reports collisions with repair suggestions', await js(`document.getElementById('drc-list').textContent.includes('overlaps') && !!document.querySelector('#drc-list .msg small') && document.querySelector('[data-check-mode="layout"]').getAttribute('aria-pressed') === 'true'`));
  await js(`document.querySelector('#drc-list [data-drc]').click(); true`);
  check('layout finding selects the involved items on the board', await js(`!document.getElementById('drc-dialog').open && document.querySelectorAll('#canvas .node[data-reading-focus]').length === 2`));

  await js(`document.getElementById('appearance').value = 'light'; document.getElementById('appearance').dispatchEvent(new Event('change')); true`);
  check('light appearance updates the canvas and persists only the preference', await js(`document.documentElement.dataset.theme === 'light' && getComputedStyle(document.getElementById('canvas')).backgroundColor === 'rgb(248, 250, 252)' && localStorage.getItem('schematica.theme') === 'light'`));
  await js(`window.__clipboardWrite = navigator.clipboard.write; navigator.clipboard.write = async items => { const blob = await items[0].getType('image/png'); const image = await createImageBitmap(blob); const canvas = document.createElement('canvas'); canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0); window.__copiedPNG = {width:image.width,height:image.height,size:blob.size,pixel:[...ctx.getImageData(0,0,1,1).data]}; image.close(); }; document.getElementById('btn-export').click(); document.getElementById('export-w').value = '64'; document.getElementById('export-h').value = '32'; document.getElementById('export-png-copy').click(); true`);
  await sleep(300);
  check('Copy PNG rasterizes the chosen dimensions and writes an image clipboard item', await js(`window.__copiedPNG?.width === 64 && window.__copiedPNG?.height === 32 && window.__copiedPNG?.size > 0 && JSON.stringify(window.__copiedPNG?.pixel) === '[248,250,252,255]' && !document.getElementById('export-dialog').open`));
  await js(`navigator.clipboard.write = async () => { throw new Error('denied'); }; document.getElementById('btn-export').click(); document.getElementById('export-png-copy').click(); true`);
  await sleep(100);
  check('denied clipboard access retains PNG download as a fallback', await js(`document.getElementById('export-dialog').open && document.getElementById('toast').textContent.includes('Use PNG download instead') && !document.getElementById('export-png-copy').disabled`));
  await js(`navigator.clipboard.write = window.__clipboardWrite; document.getElementById('export-dialog').close(); true`);
  await js(`(async () => { const {buildHTML} = await import('/src/html-export.js'); const {EXAMPLES} = await import('/src/examples.js'); const html = buildHTML(EXAMPLES.find(e => e.id === 'weather-station').doc); location.href = URL.createObjectURL(new Blob([html], {type:'text/html'})); return true; })()`);
  await sleep(450);
  check('offline HTML viewer loads its embedded board', await js(`document.querySelectorAll('svg .node').length === 8 && !!document.getElementById('chapters')`));
  await js(`document.getElementById('search').value = 'ESP32'; document.getElementById('search').dispatchEvent(new Event('input')); document.getElementById('results').value = 'n5'; document.getElementById('results').dispatchEvent(new Event('change')); document.getElementById('bus').value = 'i2c'; document.getElementById('bus').dispatchEvent(new Event('change')); document.getElementById('connections').value = 'neighbors'; document.getElementById('connections').dispatchEvent(new Event('change')); true`);
  check('offline search and bus tracing use embedded connectivity', await js(`document.querySelectorAll('.wire.focused').length === 1 && document.querySelectorAll('.node.focused').length === 2`));

}
