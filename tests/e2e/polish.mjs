// Form polish: every styled select draws its own chevron inside its padding,
// so the arrow never sits on or past the border, and a select never grows
// wider than the field that holds it. Captures the New part dialog and the
// Assistant settings for the eye. Registered by the main smoke runner;
// POLISH_E2E_ONLY=1 runs it alone.
export async function runPolishChecks({ js, check, sleep, waitFor, capture = async () => {} }) {
  // Each visible styled select: custom appearance, room for the chevron, and
  // a box no wider than its label or parent.
  const audit = (scope) => js(`(() => {
    const out = [];
    for (const s of document.querySelectorAll(${JSON.stringify(scope)} + ' select')) {
      const r = s.getBoundingClientRect(); if (!r.width) continue;
      const cs = getComputedStyle(s);
      const holder = (s.closest('label') || s.parentElement).getBoundingClientRect();
      out.push({ id: s.id || s.name || s.className, appearance: cs.appearance || cs.webkitAppearance, padRight: parseFloat(cs.paddingRight), bg: cs.backgroundImage !== 'none', overflow: Math.round((r.right - holder.right) * 10) / 10 });
    }
    return JSON.stringify(out);
  })()`);
  const good = (rows) => rows.length > 0 && rows.every((r) => r.appearance === 'none' && r.padRight >= 18 && r.bg && r.overflow <= 0.5);

  await js(`for (const d of document.querySelectorAll('dialog[open]')) d.close(); true`);
  await js(`document.getElementById('part-dialog').showModal(); true`);
  await sleep(200);
  let rows = JSON.parse(await audit('#part-dialog'));
  check('the New part dialog selects draw a chevron inside their padding and stay within their field', good(rows), JSON.stringify(rows));
  await capture('polish-new-part-dialog');
  await js(`document.getElementById('part-dialog').close(); true`);

  await js(`(() => { const a = document.getElementById('assistant'); if (a.hidden) document.getElementById('btn-assistant').click(); return true; })()`);
  await waitFor(`!document.getElementById('assistant').hidden && !!document.getElementById('ai-gear')`);
  await js(`(() => { const sheet = document.getElementById('ai-settings'); if (!sheet || sheet.hidden) document.getElementById('ai-gear').click(); return true; })()`);
  await waitFor(`(() => { const s = document.getElementById('ai-settings'); return !!s && !s.hidden && s.getBoundingClientRect().height > 0; })()`);
  rows = JSON.parse(await audit('#ai-settings'));
  check('the Assistant settings selects draw a chevron inside their padding and stay within their field', good(rows), JSON.stringify(rows));
  await capture('polish-assistant-settings');
  await js(`document.getElementById('ai-gear').click(); true`);
  await sleep(150);

  // With the settings sheet away, Build from a source sits under Options &
  // sources with its three buttons visible and reachable.
  await js(`(() => { const o = document.getElementById('ai-options'); if (o && !o.open) o.open = true; return true; })()`);
  await sleep(100);
  const row = JSON.parse(await js(`(() => { const row = document.querySelector('#assistant .ai-build-row'); if (!row) return 'null'; const r = row.getBoundingClientRect(); const panel = document.getElementById('assistant').getBoundingClientRect(); return JSON.stringify({ visible: r.height > 0 && r.width > 0, inside: r.left >= panel.left && r.right <= panel.right + 0.5, buttons: [...row.querySelectorAll('[data-build]')].map((b) => b.getBoundingClientRect().width > 0).length }); })()`));
  check('Build from a source is visible inside the Assistant under Options & sources with three usable buttons', row && row.visible && row.inside && row.buttons === 3, JSON.stringify(row));
  await capture('polish-assistant-build-row');

  // The Build dialogs wear the project's dialog chrome in the light theme too:
  // no browser frame, the card's own shadow, styled fields and buttons.
  await js(`(async () => { const t = await import('/src/theme.js'); t.setThemePreference('light'); return true; })()`);
  await sleep(150);
  const dialogLook = () => js(`(() => {
    const d = document.getElementById('import-dialog'); const cs = getComputedStyle(d);
    const build = d.querySelector('#import-build'), cancel = d.querySelector('#import-cancel');
    const bs = getComputedStyle(build), xs = getComputedStyle(cancel);
    const vw = document.documentElement.clientWidth, dr = d.getBoundingClientRect();
    return JSON.stringify({ open: d.open, frame: cs.borderStyle + '/' + cs.borderWidth, dialogBg: cs.backgroundColor, overlay: Math.round(dr.width) >= vw - 1, buildRadius: bs.borderRadius, cancelRadius: xs.borderRadius, buildAccented: bs.borderColor !== xs.borderColor, theme: document.documentElement.dataset.theme });
  })()`);
  await js(`document.querySelector('#assistant [data-build=cve]').click(); true`);
  await waitFor(`document.getElementById('import-dialog').open`);
  let look = JSON.parse(await dialogLook());
  check('the CVE dialog is the project\'s full-viewport overlay with no browser frame and the project\'s buttons in the light theme', look.open && look.theme === 'light' && /none/.test(look.frame) && /0px/.test(look.frame) && look.dialogBg === 'rgba(4, 6, 12, 0.6)' && look.overlay && look.buildRadius === '8px' && look.cancelRadius === '8px' && look.buildAccented, JSON.stringify(look));
  await capture('polish-build-dialog-cve-light');
  await js(`document.getElementById('import-cancel').click(); true`);
  await js(`document.querySelector('#assistant [data-build=poc]').click(); true`);
  await waitFor(`document.getElementById('import-dialog').open && document.getElementById('import-dialog').dataset.mode === 'poc'`);
  look = JSON.parse(await dialogLook());
  check('the write-up dialog shares that chrome', look.open && /none/.test(look.frame) && look.buildRadius === '8px', JSON.stringify(look));
  await capture('polish-build-dialog-writeup-light');
  await js(`document.getElementById('import-cancel').click(); true`);
  await js(`(async () => { const t = await import('/src/theme.js'); t.setThemePreference('system'); return true; })()`);
  await sleep(100);
}
