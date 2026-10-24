// The Projects menu: two boards in one browser survive switching, reload and
// a storage event from the other project's slot without mixing. Registered by
// the main smoke runner; PROJECTS_E2E_ONLY=1 runs it alone.
export async function runProjectChecks({ js, key, check, sleep, waitFor, capture = async () => {} }) {
  const ready = () => waitFor(`document.readyState === 'complete' && !!document.getElementById('btn-projects') && !!document.getElementById('assistant')`);
  const menuState = () => js(`(() => { const m = document.getElementById('projects-menu'); return JSON.stringify({ hidden: m.hidden, rows: [...m.querySelectorAll('[data-project]')].map(b => ({ id: b.dataset.project, title: b.querySelector('.example-name').textContent, active: b.getAttribute('aria-checked') === 'true', note: b.querySelector('small').textContent })), removeDisabled: m.querySelector('[data-project-remove]')?.disabled, focus: document.activeElement.dataset?.project }); })()`);
  const setTitle = async title => { await js(`(() => { const t = document.getElementById('title'); t.value = ${JSON.stringify(title)}; t.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await sleep(400); };

  await js(`for (const d of document.querySelectorAll('dialog[open]')) d.close(); true`);
  await setTitle('First project board');
  const firstNodes = await js(`document.querySelectorAll('#canvas .node').length`);
  check('the Projects button sits beside the title with one project and no count badge', await js(`(() => { const b = document.getElementById('btn-projects'); return b.previousElementSibling?.id === 'title' && b.getAttribute('aria-expanded') === 'false' && b.querySelector('.projects-count').textContent === '' && JSON.parse(localStorage.getItem('schematica.projects')).projects.length === 1; })()`));

  await js(`document.getElementById('btn-projects').click(); true`);
  let s = JSON.parse(await menuState());
  check('the menu lists the migrated project "main" as open, with no file backup, and cannot remove the last project', !s.hidden && s.rows.length === 1 && s.rows[0].id === 'main' && s.rows[0].active && s.rows[0].title === 'First project board' && s.rows[0].note.includes('No file backup') && s.removeDisabled === true && s.focus === 'main', JSON.stringify(s));
  await key('Escape', 'Escape', 27);
  check('Escape closes the menu and returns focus to the button', await js(`document.getElementById('projects-menu').hidden && document.activeElement.id === 'btn-projects'`));

  // Saving the board to a file records a backup for this project.
  await js(`(() => { const a = document.createElement('a'); window.__clickA = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {}; document.getElementById('btn-save').click(); HTMLAnchorElement.prototype.click = window.__clickA; return true; })()`);
  await js(`document.getElementById('btn-projects').click(); true`);
  s = JSON.parse(await menuState());
  check('a file save shows as a current backup; an edit makes it stale', s.rows[0].note.includes('Backed up to a file'), JSON.stringify(s));
  await key('Escape', 'Escape', 27);
  await setTitle('First project board (edited)');
  await js(`document.getElementById('btn-projects').click(); true`);
  s = JSON.parse(await menuState());
  check('an edit after the file save is reported as changed since the backup', s.rows[0].note.includes('Changed since the file backup'), JSON.stringify(s));

  // New project: reload onto an empty board in its own slot.
  await js(`document.querySelector('#projects-menu [data-project-new]').click(); true`);
  await sleep(300);
  await ready();
  const registry = JSON.parse(await js(`localStorage.getItem('schematica.projects')`));
  const second = registry.projects.find(p => p.id !== 'main');
  check('New project reloads onto an empty board and becomes the active project', !!second && registry.active === second.id && await js(`document.querySelectorAll('#canvas .node').length === 0 && document.getElementById('title').value === 'Untitled Board' && document.getElementById('btn-projects').querySelector('.projects-count').textContent === '2'`), JSON.stringify(registry));
  await setTitle('Second project board');
  await js(`document.getElementById('btn-examples').click(); window.__confirm = window.confirm; window.confirm = () => true; document.querySelector('#examples-menu [data-example="declared-uart-reference"]').click(); window.confirm = window.__confirm; true`);
  await sleep(500);
  check('the second project autosaves to its own slot and the first slot keeps the first board', await js(`(() => { const reg = JSON.parse(localStorage.getItem('schematica.projects')); const mine = JSON.parse(localStorage.getItem('schematica.autosave.' + reg.active)); const first = JSON.parse(localStorage.getItem('schematica.autosave')); return mine.nodes.length === 5 && first.title === 'First project board (edited)' && first.nodes.length === ${firstNodes}; })()`));
  await js(`document.getElementById('btn-engineering').click(); document.querySelector('#engineering-dialog [data-tab=revisions]').click(); (() => { const f = document.querySelector('#engineering-body form'); f.querySelector('[name=label]').value = 'Second only'; f.requestSubmit(); })(); true`);
  await sleep(300);
  await js(`document.getElementById('engineering-dialog').close(); true`);

  await js(`document.getElementById('btn-projects').click(); true`);
  await capture('projects-01-menu');
  await key('Escape', 'Escape', 27);

  // A storage event on the other project's slot is not a conflict here.
  await js(`window.dispatchEvent(new StorageEvent('storage', { key: 'schematica.autosave', newValue: '{"schema":4,"title":"Edited elsewhere","nodes":[],"wires":[]}', storageArea: localStorage })); true`);
  await sleep(200);
  check('another tab writing the first project\'s slot does not raise a conflict on the second', await js(`!document.getElementById('toast').textContent.includes('Another tab') && document.getElementById('recovery-status').dataset.state !== 'error'`), await js(`document.getElementById('recovery-status').textContent + ' | ' + document.getElementById('toast').textContent`));

  // Switch back: the first board and only its revisions.
  await js(`document.getElementById('btn-projects').click(); document.querySelector('#projects-menu [data-project="main"]').click(); true`);
  await sleep(300);
  await ready();
  await sleep(300);
  check('switching back reloads the first project with its board and title', await js(`document.getElementById('title').value === 'First project board (edited)' && document.querySelectorAll('#canvas .node').length === ${firstNodes} && JSON.parse(localStorage.getItem('schematica.projects')).active === 'main'`), await js(`document.getElementById('title').value + ' ' + document.querySelectorAll('#canvas .node').length`));
  await js(`document.getElementById('btn-engineering').click(); document.querySelector('#engineering-dialog [data-tab=revisions]').click(); true`);
  await sleep(200);
  check('the first project\'s revision list does not show the second project\'s revision', await js(`!document.getElementById('engineering-body').textContent.includes('Second only')`));
  await js(`document.getElementById('engineering-dialog').close(); true`);

  // Remove the second project: its slot goes, the first is untouched.
  await js(`document.getElementById('btn-projects').click(); document.querySelector('#projects-menu [data-project="${second.id}"]').click(); true`);
  await sleep(300);
  await ready();
  await sleep(200);
  await js(`window.__confirm = window.confirm; window.confirm = () => true; document.getElementById('btn-projects').click(); document.querySelector('#projects-menu [data-project-remove]').click(); true`);
  await sleep(600);
  await ready();
  await sleep(200);
  check('removing the open project deletes its slot and reloads onto the remaining one', await js(`(() => { const reg = JSON.parse(localStorage.getItem('schematica.projects')); return reg.projects.length === 1 && reg.active === 'main' && localStorage.getItem('schematica.autosave.' + ${JSON.stringify(second.id)}) === null && document.getElementById('title').value === 'First project board (edited)'; })()`), await js(`localStorage.getItem('schematica.projects')`));
  await js(`window.confirm = window.__confirm || window.confirm; true`);
}
