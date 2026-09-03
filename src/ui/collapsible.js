// Fold a floating panel down to its header bar. The state is remembered per
// panel in localStorage so a folded panel stays folded across reloads.
import { onPress } from './press.js';

const KEY = (name) => `schematica.panel.${name}.collapsed`;

export function isCollapsed(name) {
  try {
    return localStorage.getItem(KEY(name)) === '1';
  } catch {
    return false;
  }
}

function remember(name, collapsed) {
  try {
    localStorage.setItem(KEY(name), collapsed ? '1' : '0');
  } catch { /* storage may be unavailable; the panel still folds for this session */ }
}

// The panel's heading with its fold toggle; the panel's own render puts this
// first and then calls bindCollapsible.
export function panelHeader(title, name) {
  const folded = isCollapsed(name);
  return `<h3>${title}<button class="panel-toggle" type="button" data-panel="${name}"`
    + ` title="${folded ? 'Expand panel' : 'Collapse panel'}" aria-expanded="${folded ? 'false' : 'true'}">`
    + `${folded ? '&#9656;' : '&#9662;'}</button></h3>`;
}

export function bindCollapsible(panel, name) {
  panel.classList.toggle('collapsed', isCollapsed(name));
  const btn = panel.querySelector('.panel-toggle');
  if (!btn) return;
  onPress(btn, () => {
    const folded = !panel.classList.contains('collapsed');
    remember(name, folded);
    panel.classList.toggle('collapsed', folded);
    btn.innerHTML = folded ? '&#9656;' : '&#9662;';
    btn.title = folded ? 'Expand panel' : 'Collapse panel';
    btn.setAttribute('aria-expanded', folded ? 'false' : 'true');
  });
}
