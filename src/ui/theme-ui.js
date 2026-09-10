import { initTheme, getTheme, getThemePreference, setThemePreference, onThemeChange, lightSVGStyles } from '../theme.js';

export function initAppearance(storage) {
  const style = document.createElement('style');
  style.textContent = lightSVGStyles('html[data-theme="light"] svg:not([data-export-theme])');
  document.head.append(style);
  const select = document.getElementById('appearance');
  const paint = () => { document.documentElement.dataset.theme = getTheme(); select.value = getThemePreference(); };
  onThemeChange(paint);
  initTheme({ storage, media: window.matchMedia('(prefers-color-scheme: light)') });
  select.addEventListener('change', () => setThemePreference(select.value));
  paint();
}
