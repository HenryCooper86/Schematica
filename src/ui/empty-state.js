// The start card on an empty board: a blank canvas otherwise gives no hint
// of where to begin. It lists the ways in (drag a part, the guided
// walkthrough, an example, the assistant) and hides as soon as the board
// has anything on it. It only triggers controls that already exist.
import { escAttr as esc } from './press.js';
import { tr, onLanguageChange } from '../i18n.js';

export function initEmptyState({ store }) {
  const wrap = document.getElementById('canvas-wrap');
  if (!wrap) return;
  const card = document.createElement('section');
  card.id = 'empty-state';
  card.setAttribute('aria-labelledby', 'empty-state-title');
  wrap.append(card);

  const isEmpty = () => {
    const d = store.doc;
    return !d.nodes.length && !(d.zones || []).length && !(d.notes || []).length;
  };
  function paint() {
    card.innerHTML = `<h2 id="empty-state-title">${esc(tr('Start your board'))}</h2>`
      + `<p>${esc(tr('Drag a part from the palette on the left, or start from one of these:'))}</p>`
      + '<div class="empty-actions">'
      + `<button type="button" data-start="guide">${esc(tr('Guided walkthrough'))}</button>`
      + `<button type="button" data-start="examples">${esc(tr('Open an example'))}</button>`
      + `<button type="button" data-start="assistant">${esc(tr('Describe it to the assistant'))}</button>`
      + '</div>';
    card.querySelector('[data-start=guide]').onclick = () => document.dispatchEvent(new CustomEvent('schematica:open-guide'));
    card.querySelector('[data-start=examples]').onclick = (e) => { e.stopPropagation(); document.getElementById('btn-examples')?.click(); };
    card.querySelector('[data-start=assistant]').onclick = () => document.getElementById('btn-assistant')?.click();
  }
  const sync = () => { card.hidden = !isEmpty(); };
  store.subscribe(sync, { documentOnly: true });
  onLanguageChange(paint);
  paint();
  sync();
}
