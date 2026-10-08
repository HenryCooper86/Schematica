import { initTheme, getTheme, getThemePreference, nextThemePreference, cycleThemePreference, onThemeChange, lightSVGStyles } from '../theme.js';
import { tr, onLanguageChange } from '../i18n.js';

const ICONS = {
  light: '<circle cx="9" cy="9" r="3"/><path d="M9 1.5V3 M9 15v1.5 M1.5 9H3 M15 9h1.5 M3.7 3.7l1.1 1.1 M13.2 13.2l1.1 1.1 M3.7 14.3l1.1-1.1 M13.2 4.8l1.1-1.1"/>',
  dark: '<path d="M15 9.8A6.5 6.5 0 0 1 8.2 3a6.5 6.5 0 1 0 6.8 6.8z"/>',
  system: '<rect x="2.5" y="3" width="13" height="9" rx="1.5"/><path d="M9 12v3 M6 15h6"/>',
};

export function initAppearance(storage) {
  const style = document.createElement('style');
  style.textContent = lightSVGStyles('html[data-theme="light"] svg:not([data-export-theme])');
  document.head.append(style);
  const button = document.getElementById('appearance');
  const paint = () => {
    const mode = getThemePreference();
    const labels = { light: tr('Light'), dark: tr('Dark'), system: tr('System') };
    const label = tr('Appearance: {mode}. Switch to {next}.', { mode: labels[mode], next: labels[nextThemePreference()] });
    document.documentElement.dataset.theme = getTheme();
    button.dataset.themeMode = mode;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = `<svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">${ICONS[mode]}</svg>`;
  };
  onThemeChange(paint);
  onLanguageChange(paint);
  initTheme({ storage, media: window.matchMedia('(prefers-color-scheme: light)') });
  button.addEventListener('click', cycleThemePreference);
  paint();
}
