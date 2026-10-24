// The toolbar's "More" menu: occasional view switches and board actions
// move out of the always-visible row so the everyday tools stand out. The
// existing buttons are moved, not rebuilt, so their handlers, ids, states
// (aria-pressed) and translated titles keep working; each menu row reads
// its label from the button's own title.
import { tr, onLanguageChange } from '../i18n.js';

const GROUPS = [
  // Signal-flow animation and the bus legend stay in the toolbar: animation
  // is how a board shows traffic and the legend is how a viewer reads wires.
  // Fullscreen, the bill of materials and New board stay in the toolbar too.
  ['btn-grid', 'btn-snap', 'btn-palette', 'btn-panels'],
  ['btn-shortcuts'],
];
// Text-only buttons get an icon so every row lines up.
const ICONS = {
  'btn-shortcuts': '<rect x="2" y="4.5" width="14" height="9" rx="1.5"/><path d="M5 7.5h.01 M8 7.5h.01 M11 7.5h.01 M5.5 10.5h7"/>',
};

// Menu rows name the setting, not the next action: a toggle's tooltip says
// "Hide the parts palette", which beside a check mark would read backwards.
const LABELS = {
  'btn-grid': () => tr('Grid dots'),
  'btn-snap': () => tr('Snap to grid'),
  'btn-palette': () => tr('Parts palette (B)'),
  'btn-panels': () => tr('Right panels (P)'),
  'btn-shortcuts': () => tr('Keyboard shortcuts (?)'),
};

export function initToolbarMore() {
  const remove = document.getElementById('btn-remove');
  if (!remove) return;
  const wrap = document.createElement('div');
  wrap.className = 'more-wrap';
  const button = document.createElement('button');
  button.id = 'btn-more';
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'more-menu');
  button.innerHTML = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4 9h.01 M9 9h.01 M14 9h.01" stroke-width="2.4"/></svg>';
  const menu = document.createElement('div');
  menu.id = 'more-menu';
  menu.hidden = true;
  GROUPS.forEach((ids, i) => {
    if (i) menu.append(Object.assign(document.createElement('div'), { className: 'more-sep' }));
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (ICONS[id] && !el.querySelector('svg')) el.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 18 18" aria-hidden="true">${ICONS[id]}</svg>`);
      menu.append(el);
    }
  });
  wrap.append(button, menu);
  remove.before(wrap);

  const label = () => {
    const t = tr('More'); button.title = t; button.setAttribute('aria-label', t);
    for (const [id, text] of Object.entries(LABELS)) document.getElementById(id)?.setAttribute('data-menu-label', text());
  };
  label();
  onLanguageChange(label);

  let dismiss = null;
  function close({ focus = false } = {}) {
    if (menu.hidden) return;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.classList.remove('active');
    if (dismiss) { window.removeEventListener('pointerdown', dismiss, true); dismiss = null; }
    if (focus) button.focus();
  }
  function open() {
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    button.classList.add('active');
    dismiss = (e) => { if (!wrap.contains(e.target)) close(); };
    window.addEventListener('pointerdown', dismiss, true);
  }
  button.addEventListener('click', () => (menu.hidden ? open() : close()));
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (menu.hidden) open(); menu.querySelector('button:not([hidden])')?.focus(); }
  });
  // A chosen item runs its own handler first, then the menu closes. A
  // keyboard activation (detail 0) hands focus back to the More button, or it
  // would stay on a button inside the hidden menu; a pointer leaves it be.
  menu.addEventListener('click', (e) => { if (e.target.closest('button')) setTimeout(() => close({ focus: !e.detail }), 0); });
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('button:not([hidden])')];
    const at = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close({ focus: true }); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(at + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(at - 1 + items.length) % items.length]?.focus(); }
  });
  return { open, close };
}
