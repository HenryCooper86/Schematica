// Hide or show the chrome around the canvas: the left parts palette (B) and
// the right-hand panels (P, properties + journey). Each has a toolbar button
// and a remembered choice; pressing Journey while the right panels are hidden
// brings them back, since that is what the press wants.

function makeToggle({ key, storageKey, className, buttonId, hideTitle, showTitle }) {
  const app = document.getElementById('app');
  const btn = document.getElementById(buttonId);

  const hidden = () => app.classList.contains(className);

  function set(on) {
    app.classList.toggle(className, on);
    btn.classList.toggle('active', !on);
    btn.title = on ? showTitle : hideTitle;
    try {
      localStorage.setItem(storageKey, on ? '1' : '0');
    } catch { /* storage may be unavailable; the choice holds for this session */ }
  }

  let initial = false;
  try {
    initial = localStorage.getItem(storageKey) === '1';
  } catch { /* default to visible */ }
  set(initial);
  btn.addEventListener('click', () => set(!hidden()));
  return { key, hidden, set, toggle: () => set(!hidden()) };
}

export function initLayoutToggles() {
  const palette = makeToggle({
    key: 'b', storageKey: 'schematica.palette.hidden', className: 'palette-hidden', buttonId: 'btn-palette',
    hideTitle: 'Hide the parts palette (B)', showTitle: 'Show the parts palette (B)',
  });
  const panels = makeToggle({
    key: 'p', storageKey: 'schematica.panels.hidden', className: 'panels-hidden', buttonId: 'btn-panels',
    hideTitle: 'Hide the right panels (P)', showTitle: 'Show the right panels (P)',
  });

  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === palette.key) palette.toggle();
    if (k === panels.key) panels.toggle();
  });

  // Opening the journey panel is a request to see a panel.
  document.getElementById('btn-journey').addEventListener('click', () => {
    if (panels.hidden()) panels.set(false);
  }, true);

  return { palette, panels };
}
