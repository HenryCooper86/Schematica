import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, presetsFor, presetPatch } from '../src/presets.js';
import { PARTS } from '../src/palette.js';

test('every preset group names a real part kind and every preset is complete', () => {
  for (const [kind, list] of Object.entries(PRESETS)) {
    assert.ok(PARTS[kind], `${kind} is not a palette part`);
    assert.ok(list.length > 0, `${kind} has presets`);
    const numbers = new Set();
    for (const p of list) {
      assert.ok(p.name && p.sublabel && typeof p.notes === 'string', `${kind}: ${p.name}`);
      assert.ok(!numbers.has(p.sublabel), `${kind}: duplicate part number ${p.sublabel}`);
      numbers.add(p.sublabel);
    }
  }
});

test('D-Robotics kits live under the AI SBC; Horizon chips and stacks under the automotive parts', () => {
  const names = (kind) => presetsFor(kind).map((p) => p.name).join(' | ');
  assert.match(names('aisbc'), /RDK X5/);
  assert.match(names('aisbc'), /RDK X3/);
  assert.match(names('aisbc'), /RDK S100/);
  assert.match(names('autosoc'), /Journey 6/);
  assert.match(names('adas'), /Horizon Mono/);
  assert.match(names('adas'), /SuperDrive/);
  assert.deepEqual(presetsFor('battery'), [], 'kinds without presets get an empty list');
});

test('presetPatch fills blank rail and notes from the chosen part number, never clobbering typed text', () => {
  const blank = { kind: 'aisbc', sublabel: '', rail: '', notes: '' };
  const patch = presetPatch(blank, 'RDK X5');
  assert.equal(patch.sublabel, 'RDK X5');
  assert.ok(patch.rail, 'rail filled from the preset');
  assert.match(patch.notes, /10 TOPS/);
  const typed = { kind: 'aisbc', sublabel: '', rail: '12V custom', notes: 'my note' };
  assert.deepEqual(presetPatch(typed, 'rdk x5'), { sublabel: 'RDK X5' }, 'matches case-insensitively; keeps user text');
  assert.deepEqual(presetPatch(blank, 'Something else'), { sublabel: 'Something else' }, 'unknown numbers are plain text');
  assert.deepEqual(presetPatch({ kind: 'battery', rail: '', notes: '' }, 'RDK X5'), { sublabel: 'RDK X5' }, 'presets are per kind');
});
