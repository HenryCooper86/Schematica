// Hide or show the right-hand panels (properties, journey) as a whole: the
// toolbar button, the P shortcut, and a remembered choice. Pressing Journey
// while they are hidden brings them back, since that is what the press wants.

const KEY = 'schematica.panels.hidden';

export function initPanelsToggle() {
  const app = document.getElementById('app');
  const btn = document.getElementById('btn-panels');

  function hidden() {
    return app.classList.contains('panels-hidden');
  }

  function set(on) {
    app.classList.toggle('panels-hidden', on);
    btn.classList.toggle('active', !on);
    btn.title = on ? 'Show the right panels (P)' : 'Hide the right panels (P)';
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch { /* storage may be unavailable; the choice holds for this session */ }
  }

  let initial = false;
  try {
    initial = localStorage.getItem(KEY) === '1';
  } catch { /* default to visible */ }
  set(initial);

  btn.addEventListener('click', () => set(!hidden()));

  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.toLowerCase() === 'p') set(!hidden());
  });

  // Opening the journey panel is a request to see a panel.
  document.getElementById('btn-journey').addEventListener('click', () => {
    if (hidden()) set(false);
  }, true);

  return { hidden, set };
}
