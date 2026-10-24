// The Review path panel: Prepare → Check → Resolve → Handoff over the UART
// walkthrough board with its deliberate rate mismatch. Registered by the main
// smoke runner; REVIEW_PATH_E2E_ONLY=1 runs it alone.
export async function runReviewPathChecks({ js, key, check, sleep, waitFor, capture = async () => {} }) {
  const state = () => js(`(() => { const p = document.getElementById('review-path'); return JSON.stringify({ hidden: p.hidden, current: p.querySelector('[data-stage][aria-current="step"]')?.dataset.stage, done: [...p.querySelectorAll('[data-stage].done')].map(b => b.dataset.stage), items: [...p.querySelectorAll('.path-items li')].map(li => (li.classList.contains('done') ? '✓ ' : '○ ') + li.querySelector('span').textContent.trim().replace(/^[✓○]\s*/, '')), status: p.querySelector('[role=status]')?.textContent, focus: document.activeElement.id || document.activeElement.getAttribute('data-stage') || document.activeElement.name }); })()`);
  // Close whatever is open; start from the UART walkthrough board with a rate mismatch.
  await js(`for (const d of document.querySelectorAll('dialog[open]')) d.close(); if(document.getElementById('first-project').hidden){document.getElementById('btn-examples').click();document.getElementById('examples-guide').click();} true`);
  await js(`document.getElementById('guide-uart').click(); true`);
  await waitFor(`document.querySelectorAll('#canvas .node').length === 5 && !document.getElementById('guide-mismatch').disabled`);
  await js(`document.getElementById('guide-mismatch').click(); true`);
  await sleep(100);
  // A title of its own keeps this version distinct from boards earlier suites
  // already checked, exported or saved as revisions.
  await js(`(() => { const t = document.getElementById('title'); t.value = 'Review path run'; t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(100);

  check('the Review path button sits in the toolbar beside Check and is closed by default', await js(`(() => { const b = document.getElementById('btn-review-path'); return !!b && b.nextElementSibling?.id === 'btn-check' && b.getAttribute('aria-pressed') === 'false' && document.getElementById('review-path').hidden; })()`));
  await js(`document.getElementById('btn-review-path').click(); true`);
  let s = JSON.parse(await state());
  check('opening the path hides the first-project guide and lands on Check with Prepare done', !s.hidden && s.current === 'check' && s.done.includes('prepare') && s.focus === 'check' && await js(`document.getElementById('first-project').hidden`), JSON.stringify(s));
  check('the Check stage offers to run checks on this version', s.items.length === 1 && s.items[0].startsWith('○') && await js(`!!document.querySelector('#review-path [data-go="run"]')`), JSON.stringify(s));

  await js(`document.querySelector('#review-path [data-go="run"]').click(); true`);
  check('Run checks opens the real findings dialog', await js(`document.getElementById('drc-dialog').open && document.getElementById('drc-list').textContent.includes('Required bandwidth exceeds')`));
  await key('Escape', 'Escape', 27);
  await sleep(100);
  s = JSON.parse(await state());
  check('after checking, the path moves to Resolve with the bandwidth finding', s.current === 'resolve' && s.done.includes('check') && s.items.some(i => i.includes('Required bandwidth exceeds endpoint 2 capacity')), JSON.stringify(s));

  await capture('review-path-01-resolve');
  await js(`document.querySelector('#review-path .path-items [data-go]').click(); true`);
  await sleep(100);
  check('Go on a finding opens Interfaces on the failing wire with the mismatched field focused', await js(`document.getElementById('engineering-dialog').open && document.querySelector('#engineering-dialog [name=wire]').value === 'w1' && document.activeElement.name === 'to_rateBps' && document.activeElement.value === '9600'`), await js(`JSON.stringify({open: document.getElementById('engineering-dialog').open, wire: document.querySelector('#engineering-dialog [name=wire]')?.value, focus: document.activeElement.name})`));
  await js(`(() => { const f = document.querySelector('#engineering-dialog [name=to_rateBps]'); f.value='115200'; f.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('#engineering-dialog form').requestSubmit(); return true; })()`);
  await sleep(150);
  await js(`document.getElementById('engineering-dialog').close(); true`);
  await sleep(100);
  s = JSON.parse(await state());
  check('a saved repair invalidates the old check and sends the path back to Check', s.current === 'check' && !s.done.includes('check') && !s.done.includes('resolve'), JSON.stringify(s));

  await js(`document.getElementById('btn-check').click(); true`);
  await key('Escape', 'Escape', 27);
  await sleep(100);
  s = JSON.parse(await state());
  check('the toolbar Check button counts as checking, and a clean board reaches Handoff', s.current === 'handoff' && s.done.includes('resolve') && s.items.length === 2 && s.items.every(i => i.startsWith('○')), JSON.stringify(s));
  check('Handoff offers a labelled revision form and a package download', await js(`!!document.querySelector('#review-path .path-revision [name=label]') && document.querySelector('#review-path .path-revision [name=label]').value === 'Review baseline' && !!document.querySelector('#review-path [data-go="package"]')`));

  await js(`(() => { const f = document.querySelector('#review-path .path-revision'); f.querySelector('[name=label]').value = 'Path baseline'; f.requestSubmit(); return true; })()`);
  await waitFor(`document.querySelector('#review-path .path-items li')?.classList.contains('done')`);
  s = JSON.parse(await state());
  check('saving the revision marks the first Handoff item done and keeps the panel on Handoff', s.current === 'handoff' && s.items[0].startsWith('✓') && s.items[1].startsWith('○') && await js(`document.getElementById('toast').textContent.includes('Path baseline')`), JSON.stringify(s));
  await capture('review-path-02-handoff');
  await js(`document.querySelector('#review-path [data-go="package"]').click(); true`);
  await sleep(150);
  s = JSON.parse(await state());
  check('downloading the package completes the path', s.done.length === 4 && s.status.includes('4 of 4') && s.status.includes('Handed off') && await js(`document.getElementById('btn-review-path').dataset.stage === 'complete'`), JSON.stringify(s));

  await js(`document.querySelector('#review-path [data-stage="resolve"]').click(); true`);
  s = JSON.parse(await state());
  check('any stage can be revisited; Resolve reports no open findings', s.current === 'resolve' && await js(`document.querySelector('#review-path .path-empty').textContent.includes('No open findings')`), JSON.stringify(s));

  await js(`document.getElementById('btn-review-path').focus(); true`);
  await key(' ', 'Space', 32);
  await sleep(50);
  await key(' ', 'Space', 32);
  await sleep(50);
  s = JSON.parse(await state());
  check('the toolbar button toggles the panel with the keyboard and returns to the current stage', !s.hidden && s.current === 'handoff' && s.focus === 'handoff', JSON.stringify(s));
  await js(`document.getElementById('review-path-close').click(); true`);
  check('closing the panel returns focus to its toolbar button', await js(`document.getElementById('review-path').hidden && document.activeElement.id === 'btn-review-path'`));

  // Language: the panel repaints in Chinese.
  await js(`document.getElementById('btn-review-path').click(); document.getElementById('btn-lang').click(); true`);
  await sleep(100);
  check('the panel follows the interface language', await js(`document.getElementById('review-path-heading').textContent === '评审路径' && document.querySelector('#review-path [data-stage="prepare"]').textContent.includes('准备')`));
  await js(`document.getElementById('btn-lang').click(); document.getElementById('review-path-close').click(); true`);
  await sleep(50);
}
