import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTS } from '../src/palette.js';
import { PART_HELP } from '../src/guide-parts.js';
import { TOOLBAR_HELP, PALETTE_HELP, PANEL_HELP, ASSISTANT_HELP } from '../src/guide-controls.js';
import { toolbarReference, paletteReference, panelReference } from '../src/guide-reference.js';
import { initI18n, setLang } from '../src/i18n.js';

test('guide covers every catalogue part with explanations in both languages', () => {
  assert.deepEqual(Object.keys(PART_HELP).sort(), Object.keys(PARTS).sort());
  for (const [kind, descriptions] of Object.entries(PART_HELP)) {
    assert.equal(descriptions.length, 2, kind);
    assert.ok(descriptions[0].length > 60, kind);
    assert.match(descriptions[1], /[\u3400-\u9fff]/, kind);
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
