// The Examples dropdown: loads a built-in board after confirming.
import { EXAMPLES, EXAMPLE_GROUPS, localizedExample } from '../examples.js';
import { serialize, deserialize } from '../serialize.js';
import { toast, escAttr } from './press.js';
import { tr, trd, getLang } from '../i18n.js';

export function initExamplesMenu({ store }) {
  const menu = document.getElementById('examples-menu');
  const btn = document.getElementById('btn-examples');
  let dismiss = null;

  function close() {
    menu.hidden = true;
    menu.innerHTML = '';
    if (dismiss) {
      window.removeEventListener('pointerdown', dismiss);
      dismiss = null;
    }
  }

  btn.addEventListener('click', () => {
    if (!menu.hidden) {
      close();
      return;
    }
    const shown = EXAMPLES.map((ex) => localizedExample(ex, getLang()));
    menu.innerHTML = EXAMPLE_GROUPS.map((group) => `<div class="menu-group">${escAttr(trd(group))}</div>`
      + shown.filter((ex) => ex.group === group).map((ex) => `<button data-example="${escAttr(ex.id)}"><span class="example-name">${escAttr(ex.name)}</span>${ex.doc.journey.some(s => s.stops?.length) ? ` <small>${escAttr(tr('Guided story'))}</small>` : ''}</button>`).join('')).join('');
    const r = btn.getBoundingClientRect();
    menu.hidden = false;
    // Measure the actual translated menu instead of assuming a 230px width.
    const gap = 8;
    const below = Math.max(0, window.innerHeight - r.bottom - gap - 6);
    const above = Math.max(0, r.top - gap - 6);
    const useBelow = below >= Math.min(240, above);
    menu.style.maxHeight = `${Math.max(40, useBelow ? below : above)}px`;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(gap, Math.min(r.left, window.innerWidth - bounds.width - gap))}px`;
    menu.style.top = `${Math.max(gap, useBelow ? r.bottom + 6 : r.top - bounds.height - 6)}px`;
    menu.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        const ex = shown.find((e2) => e2.id === b.dataset.example);
        close();
        if (!ex) return;
        if (!confirm(tr('Load "{name}"? Anything not saved to a file is lost.', { name: ex.name }))) return;
        const { doc, warnings } = deserialize(serialize(ex.doc));
        store.replaceDoc(doc);
        if (warnings.length) toast(tr('Example loaded with warnings:\n\n{list}', { list: warnings.join('\n') }));
      });
    });
    setTimeout(() => {
      dismiss = (ev) => {
        // The button holds a caret span: a press on it targets the span, not
        // the button, and an identity test would close the menu here and let
        // the button's own click reopen it.
        if (!menu.contains(ev.target) && !btn.contains(ev.target)) close();
      };
      window.addEventListener('pointerdown', dismiss);
    }, 0);
  });

  window.addEventListener('resize', close);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) close();
  });
}
