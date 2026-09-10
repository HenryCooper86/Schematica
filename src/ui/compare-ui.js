import { compareBoards } from '../compare.js';
import { deserialize } from '../serialize.js';
import { buildExportSVG, download } from '../export.js';
import { tr, onLanguageChange } from '../i18n.js';
import { openModal } from './press.js';

export function initCompare({ store }) {
  const dialog = document.getElementById('compare-dialog');
  const input = document.getElementById('compare-file');
  const status = document.getElementById('compare-status');
  const list = document.getElementById('compare-changes');
  const beforeView = document.getElementById('compare-before');
  const afterView = document.getElementById('compare-after');
  const receipt = document.getElementById('compare-download');
  let baseline = null, report = null, last = '', request = 0;
  const names = () => ({ added: tr('Added'), removed: tr('Removed'), changed: tr('Changed'), rewired: tr('Rewired'), moved: tr('Layout changed') });
  function paint() {
    if (!baseline) return;
    last = JSON.stringify(store.doc);
    report = compareBoards(baseline, store.doc);
    const labels = names();
    status.textContent = report.changes.length ? Object.entries(report.counts).map(([k, n]) => `${labels[k]}: ${n}`).join(' · ') : tr('No differences.');
    beforeView.innerHTML = buildExportSVG(baseline);
    afterView.innerHTML = buildExportSVG(store.doc);
    for (const [pane, excluded] of [[beforeView, 'added'], [afterView, 'removed']]) {
      for (const el of pane.querySelectorAll('[data-id]')) {
        const types = report.changes.filter(c => c.id === el.dataset.id && c.type !== excluded).map(c => c.type);
        for (const type of types) el.classList.add(`delta-${type}`);
      }
    }
    list.replaceChildren();
    for (const change of report.changes) {
      const item = document.createElement('details');
      const head = document.createElement('summary');
      head.textContent = `${labels[change.type]} — ${change.label}`;
      item.append(head);
      const table = document.createElement('table');
      const header = document.createElement('tr');
      for (const text of [tr('Field'), tr('Before'), tr('After')]) { const cell = document.createElement('th'); cell.textContent = text; header.append(cell); }
      table.append(header);
      const fields = change.fields || [{ field: tr('Item'), before: change.before, after: change.after }];
      for (const field of fields) {
        const row = document.createElement('tr');
        for (const value of [field.field, field.before, field.after]) {
          const cell = document.createElement('td');
          cell.textContent = value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
          row.append(cell);
        }
        table.append(row);
      }
      item.append(table);
      item.addEventListener('toggle', () => {
        if (!item.open) return;
        for (const pane of [beforeView, afterView]) for (const el of pane.querySelectorAll('[data-id]')) el.classList.toggle('delta-focus', el.dataset.id === change.id);
      });
      list.append(item);
    }
    receipt.disabled = false;
  }
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const token = ++request;
    baseline = null; report = null; receipt.disabled = true;
    list.replaceChildren(); beforeView.replaceChildren(); afterView.replaceChildren();
    document.getElementById('compare-warning').textContent = '';
    status.textContent = '';
    try {
      if (file.size > 16 * 1024 * 1024) throw new Error(tr('Board file exceeds 16 MiB.'));
      const text = await file.text();
      if (token !== request) return;
      const loaded = deserialize(text);
      baseline = loaded.doc;
      document.getElementById('compare-warning').textContent = loaded.warnings.join('\n');
      paint();
    } catch (err) { if (token === request) status.textContent = err.message; }
  });
  document.getElementById('explore-compare').addEventListener('click', () => { openModal(dialog); paint(); });
  document.getElementById('compare-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('pointerdown', event => { if (event.target === dialog) dialog.close(); });
  receipt.addEventListener('click', () => { if (report) download('board-comparison.json', JSON.stringify(report, null, 2), 'application/json'); });
  store.subscribe(() => { if (dialog.open && baseline && JSON.stringify(store.doc) !== last) paint(); });
  onLanguageChange(() => { if (dialog.open) paint(); });
}
