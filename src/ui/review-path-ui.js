// The Review path panel: Prepare → Check → Resolve → Handoff over the existing
// controls. It never holds workflow state of its own beyond which design
// fingerprint was last checked and exported; everything else is read from the
// board, the checks and the revision list, so it stays true after any edit.
import { reviewPath } from '../review-path.js';
import { designFingerprint } from '../workflows.js';
import { deserialize } from '../serialize.js';
import { reviewHTML } from '../review.js';
import { download } from '../export.js';
import { escAttr as esc, toast, keepFocus } from './press.js';
import { tr, onLanguageChange } from '../i18n.js';

const normalized = doc => deserialize(JSON.stringify(doc)).doc;

export function initReviewPath({ store, navigation, revisions, engineering, connections }) {
  const button = document.createElement('button');
  button.id = 'btn-review-path';
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-controls', 'review-path');
  button.innerHTML = '<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="4" cy="9" r="2"/><circle cx="14" cy="4.5" r="2"/><circle cx="14" cy="13.5" r="2"/><path d="M6 8.3l6-3.2M6 9.7l6 3.2"/></svg>';
  document.getElementById('btn-check').before(button);
  const panel = document.createElement('aside');
  panel.id = 'review-path';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'review-path-heading');
  document.getElementById('canvas-wrap').append(panel);

  let checked = '', exported = '', shownStage = null;
  const marks = new Map();
  const revisionMarks = () => revisions.list().map(r => {
    if (!marks.has(r.id)) { try { marks.set(r.id, designFingerprint(normalized(JSON.parse(r.text)))); } catch { marks.set(r.id, null); } }
    return marks.get(r.id);
  }).filter(Boolean);
  const current = () => {
    const doc = normalized(navigation.rootDoc());
    return { doc, path: reviewPath(doc, { checked, exported, revisions: revisionMarks() }) };
  };
  const label = () => { button.title = tr('Review path'); button.setAttribute('aria-label', tr('Review path')); };
  const intro = id => ({
    prepare: tr('Build the board and declare what you know about each interface. Blank values stay unknown.'),
    check: tr('Checks compare the declarations on this version of the board. Edit anything and they need running again.'),
    resolve: tr('Each finding opens the field or record that settles it. Fix it, or leave it declared as unknown.'),
    handoff: tr('Keep a revision to compare against later, then give your colleague the review package.'),
  })[id];

  function paint() {
    const { path } = current();
    button.setAttribute('aria-pressed', String(!panel.hidden));
    button.classList.toggle('active', !panel.hidden);
    button.dataset.stage = path.complete ? 'complete' : path.current;
    if (panel.hidden) return;
    const restoreFocus = keepFocus(panel);
    const stage = path.stages.find(s => s.id === shownStage) || path.stages.find(s => s.id === path.current);
    const items = stage.items;
    const go = item => item.done || !item.target || ['revision'].includes(item.id) ? '' : `<button type="button" data-go="${esc(item.id)}">${esc(item.target.type === 'check' ? tr('Run checks') : item.target.type === 'package' ? tr('Download') : tr('Go'))}</button>`;
    panel.innerHTML = `<header><h2 id="review-path-heading">${esc(tr('Review path'))}</h2><button id="review-path-close" aria-label="${esc(tr('Close'))}">×</button></header>
      <ol class="path-stages">${path.stages.map((s, i) => `<li><button type="button" data-stage="${s.id}" aria-current="${s.id === stage.id ? 'step' : 'false'}" class="${s.done ? 'done' : s.id === path.current ? 'current' : ''}"><span class="path-index">${s.done ? '✓' : i + 1}</span>${esc(s.name)}${s.done || !s.open ? '' : ` <small>${s.open}</small>`}</button></li>`).join('')}</ol>
      <section aria-live="polite"><p class="path-intro">${esc(intro(stage.id))}</p>
      ${items.length ? `<ul class="path-items">${items.map(item => `<li class="${item.done ? 'done' : ''}${item.level ? ' ' + item.level : ''}"><span><span class="path-mark" aria-hidden="true">${item.done ? '✓' : '○'}</span>${esc(item.label)}${item.detail ? `<small>${esc(item.detail)}</small>` : ''}</span>${go(item)}</li>`).join('')}</ul>` : `<p class="path-empty">${esc(stage.id === 'resolve' ? tr('No open findings on this version.') : '')}</p>`}
      ${stage.id === 'handoff' && !items[0].done ? `<form class="path-revision"><label>${esc(tr('Revision label'))}<input name="label" value="${esc(tr('Review baseline'))}" maxlength="200"></label><button type="submit">${esc(tr('Save revision'))}</button></form>` : ''}
      ${stage.id === 'resolve' && items.length ? `<p class="path-hint">${esc(tr('After a repair, run checks again; the list updates as you save.'))}</p>` : ''}</section>
      <p role="status">${esc(tr('{done} of {total} stages complete', { done: path.stages.filter(s => s.done).length, total: path.stages.length }))} · ${esc(path.complete ? tr('Handed off') : path.ready ? tr('Ready for interface review') : tr('Not ready for interface review'))}</p>`;
    panel.querySelector('#review-path-close').onclick = () => { panel.hidden = true; paint(); button.focus(); };
    panel.querySelectorAll('[data-stage]').forEach(b => b.onclick = () => { shownStage = b.dataset.stage; paint(); panel.querySelector(`[data-stage="${shownStage}"]`)?.focus(); });
    panel.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
      const item = items.find(i => i.id === b.dataset.go);
      try { follow(item.target); } catch (e) { toast(e.message); }
    });
    panel.querySelector('.path-revision')?.addEventListener('submit', event => {
      event.preventDefault();
      const value = new FormData(event.target).get('label').toString().trim() || tr('Review baseline');
      try { revisions.save(navigation.rootDoc(), value, 'review-path'); toast(tr('Revision saved: {label}', { label: value })); }
      catch (e) { toast(e.message); }
      paint();
    });
    restoreFocus();
  }

  function follow(target) {
    const doc = navigation.rootDoc();
    switch (target.type) {
      case 'title': document.getElementById('title').focus(); break;
      case 'palette': { const search = document.getElementById('palette-search'); if (search.closest('#palette')?.hidden) document.getElementById('btn-palette').click(); search.focus(); break; }
      case 'connect': connections.open(); break;
      case 'interface': store.setSelection([target.wire]); engineering.openTab('interfaces', { id: target.wire, field: target.field }); break;
      case 'requirement': engineering.openTab('requirements', { id: target.record, field: 'evidence' }); break;
      case 'select': store.setSelection(target.ids); break;
      case 'check': document.getElementById('btn-check').click(); break;
      case 'package': download('architecture-review.html', reviewHTML(doc), 'text/html'); exported = designFingerprint(normalized(doc)); paint(); break;
      default: break;
    }
  }

  button.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    shownStage = null;
    if (!panel.hidden) { const guide = document.getElementById('first-project'); if (guide) guide.hidden = true; }
    paint();
    if (!panel.hidden) panel.querySelector('[data-stage][aria-current="step"]')?.focus();
  });
  // Any check counts, including the toolbar's own button.
  document.getElementById('btn-check').addEventListener('click', () => { checked = designFingerprint(normalized(navigation.rootDoc())); paint(); });
  document.addEventListener('schematica:review-exported', () => { exported = designFingerprint(normalized(navigation.rootDoc())); paint(); });
  store.subscribe(() => { if (!store.isDragging()) paint(); }, { documentOnly: true });
  revisions.subscribe?.(() => paint());
  onLanguageChange(() => { label(); paint(); });
  label();
  paint();
  return { open() { if (panel.hidden) button.click(); }, isOpen: () => !panel.hidden };
}
