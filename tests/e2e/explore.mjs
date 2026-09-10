// Exercise the reader controls against the weather-station seed, then restore
// the initial camera and view so the existing editing smoke checks can follow.
export async function runExploreChecks({ js, key, check, sleep }) {
  const select = (id, value) => js(`(() => { const el = document.getElementById(${JSON.stringify(id)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  const fill = (value) => js(`(() => { const el = document.getElementById('board-search'); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const before = await js(`JSON.stringify({ saved: localStorage.getItem('schematica.autosave'), undo: document.getElementById('undo').disabled, geometry: [...document.querySelectorAll('#canvas .node')].map(n => [n.dataset.id, n.getAttribute('transform'), n.querySelector('.card')?.getAttribute('height')]) })`);
  await key('/', 'Slash', 191);
  check('slash opens board search with keyboard focus', await js(`!document.getElementById('explore-panel').hidden && document.activeElement.id === 'board-search'`));
  await fill('ESP32');
  check('search finds actual placed parts', await js(`document.querySelectorAll('#explore-results button').length === 1 && document.querySelector('#explore-results button').dataset.nodeId === 'n5'`));
  await key('Enter', 'Enter', 13);
  check('Enter selects and reveals the search result', await js(`document.querySelector('#canvas .node[data-id="n5"]').hasAttribute('data-reading-focus')`));
  // A narrow canvas may close the panel to make room for the focused part.
  await js(`if (document.getElementById('explore-panel').hidden) document.getElementById('btn-explore').click(); true`);
  await select('explore-bus', 'i2c');
  await select('explore-connections', 'neighbors');
  check('bus filter and immediate-neighbor highlight agree on drawn wires', await js(`(() => {
    const wires = [...document.querySelectorAll('#canvas .wire.explore-match')];
    return wires.length > 0 && wires.every(w => w.textContent.includes('I2C') && (w.dataset.from.startsWith('n5:') || w.dataset.to.startsWith('n5:')))
      && !!document.querySelector('#canvas .node.explore-muted');
  })()`));
  await select('explore-connections', 'network');
  check('connected-network mode highlights a filtered network', await js(`document.querySelectorAll('#canvas .wire.explore-match').length > 0 && document.getElementById('explore-summary').textContent.includes('Connections:')`));
  await select('explore-bus', '');
  await select('explore-connections', 'all');
  await select('explore-depth', 'overview');
  check('overview hides secondary text but keeps selected details and warning tags', await js(`(() => {
    const selected = document.querySelector('#canvas .node[data-id="n5"] [data-detail]');
    const other = document.querySelector('#canvas .node:not([data-reading-focus]) [data-detail]');
    return getComputedStyle(selected).visibility === 'visible' && getComputedStyle(other).visibility === 'hidden';
  })()`));
  await select('explore-depth', 'auto');
  await js(`window.__exploreNode = document.querySelector('#canvas .node'); document.getElementById('zoom-reset').click(); true`);
  check('automatic reading depth changes with zoom without rebuilding the diagram', await js(`(() => {
    for (let i = 0; i < 3; i++) document.getElementById('zoom-out').click();
    return document.querySelector('#canvas .layer-diagram').dataset.depth === 'overview' && window.__exploreNode === document.querySelector('#canvas .node');
  })()`));
  await fill('<img src=x onerror=alert(1)>');
  check('unmatched or hostile search input stays plain text', await js(`document.querySelectorAll('#explore-results button').length === 0 && document.getElementById('explore-status').textContent === 'No matching parts.'`));
  await js(`document.getElementById('btn-lang').click(); true`);
  check('exploration controls translate to Chinese', await js(`document.getElementById('explore-heading').textContent === '探索板图' && document.getElementById('board-search').placeholder.includes('型号') && document.getElementById('explore-status').textContent === '没有匹配的部件。'`));
  await js(`document.getElementById('btn-lang').click(); document.getElementById('explore-reset').click(); true`);
  check('reset clears filters and restores full detail', await js(`!document.querySelector('#canvas .explore-muted, #canvas .explore-match') && document.querySelector('#canvas .layer-diagram').dataset.depth === 'full'`));
  await js(`document.getElementById('board-search').focus(); true`);
  await key('Escape', 'Escape', 27);
  check('Escape closes exploration and returns focus to its button', await js(`document.getElementById('explore-panel').hidden && document.activeElement.id === 'btn-explore'`));
  await key('Escape', 'Escape', 27);
  await js(`document.getElementById('zoom-reset').click(); document.getElementById('canvas').focus(); true`);
  await sleep(350);
  const after = await js(`JSON.stringify({ saved: localStorage.getItem('schematica.autosave'), undo: document.getElementById('undo').disabled, geometry: [...document.querySelectorAll('#canvas .node')].map(n => [n.dataset.id, n.getAttribute('transform'), n.querySelector('.card')?.getAttribute('height')]) })`);
  check('exploring does not edit the document, create undo steps, or change card geometry', before === after);
}
