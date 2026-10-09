// The public guide shares appearance, translations, and the shortcut table
// with the editor, but never loads or changes a working board.
import { initI18n, onLanguageChange, tr } from './i18n.js';
import { translateStatic, initLanguageSwitch } from './ui/i18n-dom.js';
import { initAppearance } from './ui/theme-ui.js';
import { toolbarReference, paletteReference, paletteControls, panelReference } from './guide-reference.js';
import { SHORTCUT_GROUPS, isMacPlatform, keyLabel } from './shortcuts.js';
import { escAttr as esc } from './ui/press.js';

let storage = null;
try { storage = window.localStorage; } catch { /* the guide works without storage */ }
initI18n({ storage });
translateStatic();
initAppearance(storage);
initLanguageSwitch(document.getElementById('btn-lang'));

const mac = isMacPlatform(navigator);
const shortcuts = document.getElementById('guide-shortcuts');
const search = document.getElementById('guide-part-search');
search.addEventListener('input', () => { document.getElementById('guide-parts-reference').innerHTML = paletteReference(search.value); });
const paint = () => {
  const expanded = [...document.querySelectorAll('.guide-category[open]')].map(el => el.id);
  document.getElementById('guide-toolbar-reference').innerHTML = toolbarReference(mac);
  document.getElementById('guide-palette-controls').innerHTML = paletteControls();
  document.getElementById('guide-parts-reference').innerHTML = paletteReference(search.value);
  for (const id of expanded) { const section = document.getElementById(id); if (section) section.open = true; }
  document.getElementById('guide-panel-reference').innerHTML = panelReference();
  document.title = tr('How to use Schematica');
  shortcuts.innerHTML = SHORTCUT_GROUPS.map(group => `<section class="guide-shortcut-group">
    <h3>${esc(group.title())}</h3><dl>${group.rows.map(row => `<div>
      <dt>${row.keys.map(key => `<kbd>${esc(keyLabel(key, mac))}</kbd>`).join(' ')}</dt>
      <dd>${esc(row.desc())}</dd></div>`).join('')}</dl></section>`).join('');
};
onLanguageChange(paint);
paint();
