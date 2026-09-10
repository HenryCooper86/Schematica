const THEME_KEY = 'schematica.theme';
let preference = 'dark';
let storage = null;
let media = null;
const listeners = new Set();
export const getThemePreference = () => preference;
export const getTheme = () => preference === 'system' ? (media?.matches ? 'light' : 'dark') : preference;
export const themeBackground = (theme = getTheme()) => theme === 'light' ? '#f8fafc' : '#0a0e17';
export const onThemeChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
function notify() { for (const fn of listeners) fn(getTheme()); }
export function setThemePreference(value) {
  if (!['dark', 'light', 'system'].includes(value)) return;
  preference = value;
  try { storage?.setItem(THEME_KEY, value); } catch { /* session preference still works */ }
  notify();
}
export function initTheme({ storage: target = null, media: query = null } = {}) {
  media?.removeEventListener?.('change', notify);
  storage = target; media = query; preference = 'dark';
  try { const saved = storage?.getItem(THEME_KEY); if (['dark','light','system'].includes(saved)) preference = saved; } catch { /* default */ }
  media?.addEventListener?.('change', notify);
  notify();
}

// Scope every export rule to its SVG root so an inline light export cannot
// recolor another preview or the live editor. Semantic accent colors stay intact.
export function lightSVGStyles(scope) {
  const rules = [
    ['[fill="#0a0e17"]','fill:#f8fafc'],
    ['[stroke="#0a0e17"]','stroke:#f8fafc'],
    ['#gridpat circle','fill:#cbd5e1'],
    ['#cardGrad stop[offset="0"]','stop-color:#fff'],
    ['#cardGrad stop[offset="1"]','stop-color:#e8eef6'],
    ['#nodeShadow feDropShadow','flood-opacity:.12'],
    ['.card[stroke="rgba(148,163,184,0.2)"]','stroke:#b5c1d2'],
    ['text[fill="#cbd5e1"]','fill:#1e293b'],
    ['text[fill="#dbe4f0"]','fill:#1e293b'],
    ['text[fill="#7d8fae"]','fill:#52617a'],
    ['[fill="#0d1526"]','fill:#eef2f7'],
    ['.vis[stroke="#526180"]','stroke:#64748b'],
    ['[fill="#0c1424"]','fill:#f1f5f9'],
    ['[stroke="#24304d"]','stroke:#cbd5e1'],
    ['text[fill="#8fa3c0"]','fill:#334155'],
    ['text[fill="#7dd3fc"]','fill:#0369a1'],
    ['text[fill="#34d399"]','fill:#047857'],
    ['text[fill="#38bdf8"]','fill:#0369a1'],
    ['text[fill="#22d3ee"]','fill:#0e7490'],
    ['text[fill="#fbbf24"]','fill:#92400e'],
    ['text[fill="#f87171"]','fill:#b91c1c'],
    ['text[fill="#a78bfa"]','fill:#6d28d9'],
    ['text[fill="#e879f9"]','fill:#a21caf'],
    ['text[fill="#94a3b8"]','fill:#475569'],
    ['[fill="#1c1710"]','fill:#fffbeb'],
    ['text[fill="#e8c884"]','fill:#78350f'],
  ];
  return rules.map(([selector, declarations])=>`${scope} ${selector}{${declarations}}`).join('\n');
}
export function exportThemeStyles(theme) {
  if (theme === 'light') return lightSVGStyles('svg[data-export-theme="light"]');
  if (theme === 'auto') return `@media(prefers-color-scheme:light){${lightSVGStyles('svg[data-export-theme="auto"]')}}`;
  return '';
}
