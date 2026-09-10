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
    menu.style.left = `${Math.min(r.left, window.innerWidth - 230)}px`;
    menu.style.top = `${r.bottom + 6}px`;
    menu.hidden = false;
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

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) close();
  });
}
