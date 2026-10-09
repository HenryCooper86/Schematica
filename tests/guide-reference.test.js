import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PARTS } from '../src/palette.js';
import { PART_HELP } from '../src/guide-parts.js';
import { TOOLBAR_HELP, PALETTE_HELP, PANEL_HELP, ASSISTANT_HELP } from '../src/guide-controls.js';
import { GUIDE_ICONS } from '../src/guide-icons.js';
import { toolbarReference, paletteReference, panelReference } from '../src/guide-reference.js';
import { initI18n, setLang } from '../src/i18n.js';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('guide covers every catalogue part with explanations in both languages', () => {
  assert.deepEqual(Object.keys(PART_HELP).sort(), Object.keys(PARTS).sort());
  for (const [kind, descriptions] of Object.entries(PART_HELP)) {
    assert.equal(descriptions.length, 2, kind);
    assert.ok(descriptions[0].length > 60, kind);
    assert.match(descriptions[1], /[\u3400-\u9fff]/, kind);
  }
});
test('guide covers every top toolbar control and uses the same SVG shapes', () => {
  const toolbar = read('index.html').split('</header>')[0];
  const keys = [];
  for (const match of toolbar.matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const id = /(?:id|data-tool)="([^"]+)"/.exec(match[2])?.[1];
    if (!id) continue;
    keys.push(id);
    const graphic = /<svg[\s\S]*?<\/svg>/.exec(match[3])?.[0];
    if (graphic) assert.equal(GUIDE_ICONS[id], graphic, id);
  }
  keys.push('btn-engineering');
  assert.deepEqual(TOOLBAR_HELP.map(row => row[0]).sort(), keys.sort());
  assert.ok(read('src/ui/engineering-ui.js').includes(GUIDE_ICONS['btn-engineering']));
  for (const [key, markup] of Object.entries(GUIDE_ICONS)) {
    if (!key.startsWith('align-') && !key.startsWith('theme-')) continue;
    const shape = markup.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    assert.ok(read(key.startsWith('align-') ? 'src/ui/props.js' : 'src/ui/theme-ui.js').includes(shape), key);
  }
});
test('guide control descriptions are bilingual and illustrate their symbols', () => {
  for (const row of [...TOOLBAR_HELP, ...PALETTE_HELP, ...PANEL_HELP, ...ASSISTANT_HELP]) {
    assert.ok(row[3].length > 50, row[1]);
    assert.match(row[2], /[\u3400-\u9fff]/, row[1]);
    assert.match(row[4], /[\u3400-\u9fff]/, row[1]);
  }
});
test('references render catalogue ports, searchable matches and translated content', () => {
  initI18n({ storage: null });
  assert.equal((paletteReference().match(/data-guide-part=/g) || []).length, Object.keys(PARTS).length);
  assert.match(paletteReference('MCU'), /data-guide-part="mcu"/);
  assert.doesNotMatch(paletteReference('MCU'), /data-guide-part="battery"/);
  assert.match(paletteReference('unmatched-xyz'), /No matching parts/);
  assert.match(toolbarReference(true), /⌘\+S/);
  assert.match(toolbarReference(false), /Ctrl\+S/);
  assert.match(panelReference(), /DEPRECATED/);
  setLang('zh');
  assert.match(paletteReference('微控制器'), /data-guide-part="mcu"/);
  assert.match(toolbarReference(false), /选择与移动/);
  assert.match(panelReference(), /助手图标与选项/);
  setLang('en');
});
