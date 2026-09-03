// The Examples dropdown: loads a built-in board after confirming.
import { EXAMPLES } from '../examples.js';
import { serialize, deserialize } from '../serialize.js';
import { toast } from './press.js';

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
    menu.innerHTML = EXAMPLES.map((ex) => `<button data-example="${ex.id}">${ex.name}</button>`).join('');
    const r = btn.getBoundingClientRect();
    menu.style.left = `${Math.min(r.left, window.innerWidth - 230)}px`;
    menu.style.top = `${r.bottom + 6}px`;
    menu.hidden = false;
    menu.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        const ex = EXAMPLES.find((e2) => e2.id === b.dataset.example);
        close();
        if (!ex) return;
        if (!confirm(`Load "${ex.name}"? Anything not saved to a file is lost.`)) return;
        const { doc, warnings } = deserialize(serialize(ex.doc));
        store.replaceDoc(doc);
        if (warnings.length) toast(`Example loaded with warnings:\n\n${warnings.join('\n')}`);
      });
    });
    setTimeout(() => {
      dismiss = (ev) => {
        if (!menu.contains(ev.target) && ev.target !== btn) close();
      };
      window.addEventListener('pointerdown', dismiss);
    }, 0);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) close();
  });
}
