import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, SIDES, PATH_RE, initials, portsWithOffsets, normalizePart, partOf, mergePortIds, mergeFieldIds, draftProblems, optionList, definitionFrom, siblings, applyDefinition, sideLabel } from '../src/custom.js';
import { PARTS } from '../src/palette.js';
import { nodePart } from '../src/rdk/profiles.js';
import { initI18n, setLang } from '../src/i18n.js';

const DEF = {
  name: 'Motor driver x4', category: 'actuators', accent: null, icon: { kind: 'motor' },
  ports: [
    { id: 'p1', name: 'VCC', side: 'top', bus: 'power', required: true },
    { id: 'p2', name: 'GND', side: 'top', bus: 'gnd', required: true },
    { id: 'p3', name: 'CAN', side: 'left', bus: 'can', required: false },
    { id: 'p4', name: 'M1', side: 'right', bus: 'pwm', required: false },
    { id: 'p5', name: 'M2', side: 'right', bus: 'pwm', required: false },
  ],
  fields: [{ id: 'f1', label: 'Channels' }, { id: 'f2', label: 'Drive', options: ['brushed', 'brushless', 'stepper'] }],
};

test('limits match the spec and sides are the four card edges', () => {
  assert.equal(LIMITS.name, 60);
  assert.equal(LIMITS.ports, 24);
  assert.equal(LIMITS.portName, 12);
  assert.equal(LIMITS.fields, 8);
  assert.equal(LIMITS.options, 20);
  assert.equal(LIMITS.option, 40);
  assert.equal(LIMITS.path, 2000);
  assert.equal(LIMITS.library, 200);
  assert.deepEqual(SIDES, ['left', 'right', 'top', 'bottom']);
  assert.ok(PATH_RE.test('M4 4h8v8H4z M6 1v3'));
  assert.ok(!PATH_RE.test('M4 4<script>'));
});

test('initials take the first letters of the first two words', () => {
  assert.equal(initials('Motor driver x4'), 'MD');
  assert.equal(initials('MCU'), 'MC');
  assert.equal(initials('x'), 'X');
  assert.equal(initials(''), '?');
});

test('ports on one side are spaced evenly in list order and keep their order', () => {
  const out = portsWithOffsets(DEF.ports);
  assert.deepEqual(out.map((p) => p.id), ['p1', 'p2', 'p3', 'p4', 'p5']);
  assert.deepEqual(out.map((p) => p.offset), [0.333, 0.667, 0.5, 0.333, 0.667]);
  assert.deepEqual(portsWithOffsets([]), []);
});

test('a complete definition round-trips unchanged with no warnings', () => {
  const { part, warnings } = normalizePart(DEF);
  assert.deepEqual(warnings, []);
  assert.deepEqual(part, DEF);
  assert.notEqual(part, DEF, 'a fresh object');
  const withLib = normalizePart({ ...DEF, lib: 'lp1abc' }).part;
  assert.equal(withLib.lib, 'lp1abc');
  assert.deepEqual(Object.keys(withLib)[0], 'lib');
});

test('an unusable definition is null with a reason', () => {
  assert.equal(normalizePart(null).part, null);
  assert.equal(normalizePart([]).part, null);
  assert.equal(normalizePart({}).part, null);
  assert.match(normalizePart({ name: '   ' }).warnings[0], /no name/);
});

test('name, category, accent, and icon fall back with warnings', () => {
  const long = normalizePart({ name: 'x'.repeat(100) }).part;
  assert.equal(long.name.length, LIMITS.name);
  const cat = normalizePart({ name: 'A', category: 'toys' });
  assert.equal(cat.part.category, 'misc');
  assert.match(cat.warnings[0], /Unknown category "toys"/);
  assert.equal(normalizePart({ name: 'A' }).part.category, 'misc');
  assert.deepEqual(normalizePart({ name: 'A' }).warnings, [], 'a missing category is the default, not a warning');
  const acc = normalizePart({ name: 'A', accent: 'red' });
  assert.equal(acc.part.accent, null);
  assert.match(acc.warnings[0], /invalid accent/);
  assert.equal(normalizePart({ name: 'A', accent: '#f87171' }).part.accent, '#f87171');
  // Icons: a built-in kind, initials, a path; anything else is initials.
  assert.deepEqual(normalizePart({ name: 'Ab Cd', icon: { kind: 'mcu' } }).part.icon, { kind: 'mcu' });
  assert.deepEqual(normalizePart({ name: 'Ab Cd', icon: { text: ' md ' } }).part.icon, { text: 'md' });
  assert.deepEqual(normalizePart({ name: 'Ab Cd', icon: { path: 'M1 1h2' } }).part.icon, { path: 'M1 1h2' });
  assert.deepEqual(normalizePart({ name: 'Ab Cd' }).part.icon, { text: 'AC' });
  const bad = normalizePart({ name: 'Ab Cd', icon: { kind: 'nope' } });
  assert.deepEqual(bad.part.icon, { text: 'AC' });
  assert.match(bad.warnings[0], /Icon/);
  assert.deepEqual(normalizePart({ name: 'Ab', icon: { text: 'ABCD' } }).part.icon, { text: 'AB' }, 'over-long initials fall back');
  assert.deepEqual(normalizePart({ name: 'Ab', icon: { path: 'x1' } }).part.icon, { text: 'AB' }, 'a path must start with M');
});

test('an icon that is not an icon object warns instead of silently becoming initials', () => {
  // A parts file written by hand often says icon: "mcu"; it must say why it
  // did not take, exactly as an unusable object does.
  for (const icon of ['mcu', 'M1 1h2', 42, true, ['mcu'], {}]) {
    const res = normalizePart({ name: 'Ab Cd', icon });
    assert.deepEqual(res.part.icon, { text: 'AC' }, `icon ${JSON.stringify(icon)} falls back to initials`);
    assert.match(res.warnings[0] || '', /Icon on "Ab Cd" was not usable/, `icon ${JSON.stringify(icon)} warns`);
  }
  for (const icon of [undefined, null]) {
    const res = normalizePart({ name: 'Ab Cd', icon });
    assert.deepEqual(res.part.icon, { text: 'AC' });
    assert.deepEqual(res.warnings, [], 'no icon at all is the default, not a warning');
  }
});

test('ports: ids are generated and unique, bad entries drop, buses fall back, same-side duplicates drop', () => {
  const res = normalizePart({
    name: 'P',
    ports: [
      { name: 'VCC', side: 'left', bus: 'power' },
      { name: 'vcc', side: 'left', bus: 'gnd' },
      { name: 'VCC', side: 'right', bus: 'power' },
      { name: '', side: 'left', bus: 'i2c' },
      { name: 'X', side: 'middle', bus: 'i2c' },
      { name: 'Y', side: 'bottom', bus: 'warp' },
      { id: 'p1', name: 'Z', side: 'top', bus: 'spi', required: true },
      { id: 'a b', name: 'Q', side: 'top', bus: 'spi' },
    ],
  });
  const ports = res.part.ports;
  assert.deepEqual(ports.map((p) => p.name), ['VCC', 'VCC', 'Y', 'Z', 'Q']);
  assert.deepEqual(ports.map((p) => p.id), ['p2', 'p3', 'p4', 'p1', 'p5'], 'explicit p1 is reserved for Z first; generated ids fill in around it');
  assert.equal(ports[2].bus, 'gpio');
  assert.equal(ports[3].required, true);
  assert.equal(ports[0].required, false);
  assert.ok(res.warnings.some((w) => /duplicate port "vcc"/i.test(w)));
  assert.ok(res.warnings.some((w) => /no name or side/.test(w)));
  assert.ok(res.warnings.some((w) => /unknown bus "warp"/.test(w)));
  assert.equal(res.warnings.filter((w) => /no name or side/.test(w)).length, 2);
  const many = normalizePart({ name: 'P', ports: Array.from({ length: 30 }, (_, i) => ({ name: `P${i}`, side: 'left', bus: 'gpio' })) });
  assert.equal(many.part.ports.length, LIMITS.ports);
  assert.ok(many.warnings.some((w) => /first 24 ports/.test(w)));
  assert.equal(normalizePart({ name: 'P', ports: [{ name: 'ABCDEFGHIJKLMNOP', side: 'left', bus: 'gpio' }] }).part.ports[0].name.length, LIMITS.portName);
  assert.deepEqual(normalizePart({ name: 'P', ports: 'nope' }).part.ports, []);
});

test('explicit ids are reserved before generated ones are minted', () => {
  const res = normalizePart({
    name: 'P',
    ports: [
      { name: 'NEW', side: 'left', bus: 'gpio' },
      { id: 'p1', name: 'CAN', side: 'left', bus: 'can' },
    ],
  });
  assert.deepEqual(res.part.ports.map((p) => p.id), ['p2', 'p1'], 'the explicit p1 wins it; the generated id skips over it');
});

test('names and labels trim and collapse internal whitespace, including newlines, to single spaces', () => {
  const part = normalizePart({
    name: 'Motor \n  driver',
    ports: [{ name: 'A\nB', side: 'left', bus: 'gpio' }],
  }).part;
  assert.equal(part.name, 'Motor driver');
  assert.equal(part.ports[0].name, 'A B');
});

test('fields: labels required, choices need two or more, ids generated', () => {
  const res = normalizePart({
    name: 'F',
    fields: [
      { label: 'Channels' },
      { label: '', options: ['a', 'b'] },
      { label: 'Drive', options: ['brushed', ' brushed ', 'stepper', ''] },
      { label: 'Lonely', options: ['one'] },
      { id: 'f9', label: 'Keep', placeholder: 'e.g. 4' },
    ],
  });
  const fields = res.part.fields;
  assert.deepEqual(fields.map((f) => f.id), ['f1', 'f2', 'f3', 'f9']);
  assert.deepEqual(fields[1].options, ['brushed', 'stepper']);
  assert.equal(fields[2].options, undefined);
  assert.equal(fields[3].placeholder, 'e.g. 4');
  assert.ok(res.warnings.some((w) => /no label/.test(w)));
  assert.ok(res.warnings.some((w) => /at least two choices/.test(w)));
  const many = normalizePart({ name: 'F', fields: Array.from({ length: 10 }, (_, i) => ({ label: `L${i}` })) });
  assert.equal(many.part.fields.length, LIMITS.fields);
});

test('partOf resolves a custom node to a catalogue-shaped part and memoizes it', () => {
  const node = { id: 'n1', kind: 'custom', part: DEF, label: 'MD' };
  const part = partOf(node);
  assert.equal(part.kind, 'custom');
  assert.equal(part.custom, true);
  assert.equal(part.name, 'Motor driver x4');
  assert.equal(part.category, 'actuators');
  assert.equal(part.icon, PARTS.motor.icon, 'a kind icon is the built-in path');
  assert.equal(part.glyph, undefined);
  assert.equal(part.ports.length, 5);
  assert.equal(part.ports[0].offset, 0.333);
  assert.deepEqual(part.fields, DEF.fields);
  assert.equal(partOf(node), part, 'same definition object, same part');
  assert.notEqual(partOf({ ...node, part: structuredClone(DEF) }), part, 'a clone resolves afresh');
});

test('partOf draws initials, paths, and glyph kinds, and hides an empty field list', () => {
  const text = partOf({ kind: 'custom', part: { name: 'Ab Cd', category: 'misc', accent: null, icon: { text: 'ZZ' }, ports: [], fields: [] } });
  assert.equal(text.text, 'ZZ');
  assert.equal(text.icon, undefined);
  assert.equal(text.fields, undefined, 'no fields means no schema section');
  const path = partOf({ kind: 'custom', part: { name: 'P', category: 'misc', accent: null, icon: { path: 'M1 1h2' }, ports: [], fields: [] } });
  assert.equal(path.icon, 'M1 1h2');
  const glyph = partOf({ kind: 'custom', part: { name: 'R', category: 'network', accent: '#123456', icon: { kind: 'router' }, ports: [], fields: [] } });
  assert.equal(glyph.glyph, PARTS.router.glyph);
  assert.equal(glyph.accent, '#123456');
  const noIcon = partOf({ kind: 'custom', part: { name: 'Ab Cd', category: 'misc', accent: null, ports: [], fields: [] } });
  assert.equal(noIcon.text, 'AC', 'a definition with no icon shows initials');
});

test('partOf falls through to the catalogue for built-in nodes and broken custom nodes', () => {
  assert.equal(partOf({ kind: 'mcu' }), PARTS.mcu);
  assert.equal(partOf({ kind: 'custom' }), PARTS.generic, 'custom without a definition is the generic box');
  assert.equal(partOf({ kind: 'nope' }), PARTS.generic);
});

test('mergePortIds keeps the ids of ports matched by name, same side first, and mints fresh ids for the rest', () => {
  const old = [
    { id: 'vcc', name: 'VCC', side: 'left', bus: 'power', required: true },
    { id: 'gnd', name: 'GND', side: 'left', bus: 'gnd', required: true },
    { id: 'p3', name: 'IO', side: 'right', bus: 'gpio', required: false },
    { id: 'p4', name: 'IO', side: 'bottom', bus: 'gpio', required: false },
  ];
  const fresh = [
    { id: 'p1', name: 'io', side: 'bottom', bus: 'gpio', required: false },
    { id: 'p2', name: 'GND', side: 'top', bus: 'gnd', required: true },
    { id: 'p3', name: 'EN', side: 'left', bus: 'gpio', required: false },
    { id: 'p4', name: 'IO', side: 'top', bus: 'gpio', required: false },
  ];
  const { ports, kept } = mergePortIds(old, fresh);
  assert.deepEqual(ports.map((p) => p.id), ['p4', 'gnd', 'p5', 'p3'], 'io matches the bottom IO first; the second IO takes the remaining old IO; EN is new');
  assert.deepEqual([...kept].sort(), ['gnd', 'p3', 'p4']);
  assert.ok(!ports.some((p) => p.id === 'vcc'), 'a removed port id never comes back');
  assert.ok(ports.every((p, i) => p.name === fresh[i].name), 'order and names are the new list');
});

test('mergePortIds with no old ports keeps non-sequential given ids', () => {
  const fresh = [
    { id: 'zz', name: 'A', side: 'left', bus: 'gpio', required: false },
    { id: 'yy', name: 'B', side: 'right', bus: 'gpio', required: false },
  ];
  assert.deepEqual(mergePortIds([], fresh).ports, fresh);
});

test('mergePortIds keeps uncontested given ids when old ports exist', () => {
  const old = [{ id: 'a', name: 'A', side: 'left', bus: 'gpio', required: false }];
  const fresh = [
    { id: 'a', name: 'A', side: 'left', bus: 'gpio', required: false },
    { id: 'zzz', name: 'Z', side: 'right', bus: 'gpio', required: false },
  ];
  const { ports } = mergePortIds(old, fresh);
  assert.deepEqual(ports.map((p) => p.id), ['a', 'zzz']);
});

test('mergeFieldIds matches by label and mints ids that no old field had', () => {
  const old = [{ id: 'f1', label: 'Channels' }, { id: 'f2', label: 'Drive', options: ['a', 'b'] }];
  const fresh = [{ id: 'f1', label: 'drive', options: ['a', 'b', 'c'] }, { id: 'f2', label: 'Rating' }];
  const out = mergeFieldIds(old, fresh);
  assert.deepEqual(out.map((f) => f.id), ['f2', 'f3']);
  assert.deepEqual(out[0].options, ['a', 'b', 'c']);
});

test('mergeFieldIds keeps uncontested given ids when old fields exist', () => {
  const old = [{ id: 'f1', label: 'Channels' }];
  const fresh = [
    { id: 'f1', label: 'Channels' },
    { id: 'zzz', label: 'Rating' },
  ];
  const out = mergeFieldIds(old, fresh);
  assert.deepEqual(out.map((f) => f.id), ['f1', 'zzz']);
});

test('optionList splits, trims, and de-duplicates', () => {
  assert.deepEqual(optionList('a, b ,,b, c'), ['a', 'b', 'c']);
  assert.deepEqual(optionList(['x', ' x ', '']), ['x']);
  assert.deepEqual(optionList(''), []);
  assert.deepEqual(optionList(undefined), []);
});

test('draftProblems names what blocks Save and is empty for a good draft', () => {
  const good = { name: 'Driver', category: 'misc', icon: { text: 'DR' }, ports: [{ name: 'VCC', side: 'top', bus: 'power' }, { name: 'VCC', side: 'left', bus: 'power' }], fields: [{ label: 'Drive', options: 'a, b' }, { label: 'Note', options: '' }] };
  assert.deepEqual(draftProblems(good), []);
  assert.deepEqual(draftProblems({ ...good, name: ' ' }), ['Name is required.']);
  assert.deepEqual(draftProblems({ ...good, name: 'x'.repeat(61) }), [`Name is too long (${LIMITS.name} max).`]);
  assert.deepEqual(draftProblems({ ...good, ports: [{ name: '', side: 'top', bus: 'power' }] }), ['Port 1 needs a name.']);
  assert.deepEqual(draftProblems({ ...good, ports: [{ name: 'io', side: 'top', bus: 'gpio' }, { name: 'IO', side: 'top', bus: 'gpio' }] }), ['Two ports named "IO" on the top.']);
  assert.deepEqual(draftProblems({ ...good, ports: [{ name: 'ABCDEFGHIJKLM', side: 'top', bus: 'gpio' }] }), [`Port "ABCDEFGHIJKLM" name is too long (${LIMITS.portName} max).`]);
  assert.deepEqual(draftProblems({ ...good, icon: { path: 'x' } }), ['Icon path must be SVG path data starting with M.']);
  assert.deepEqual(draftProblems({ ...good, icon: { text: '' } }), [`Initials are 1 to ${LIMITS.text} characters.`]);
  assert.deepEqual(draftProblems({ ...good, fields: [{ label: '', options: '' }] }), ['Field 1 needs a label.']);
  assert.deepEqual(draftProblems({ ...good, fields: [{ label: 'Drive', options: 'only' }] }), ['Field "Drive" needs two or more choices.']);
  assert.deepEqual(draftProblems({ ...good, fields: [{ label: 'Drive', options: Array.from({ length: LIMITS.options + 1 }, (_, i) => `c${i}`).join(', ') }] }), [`Field "Drive" has too many choices (${LIMITS.options} max).`]);
  assert.deepEqual(draftProblems({ ...good, fields: [{ label: 'Drive', options: `a, ${'x'.repeat(LIMITS.option + 1)}` }] }), [`Field "Drive" has a choice longer than ${LIMITS.option} characters.`]);
  assert.deepEqual(draftProblems({ ...good, ports: Array.from({ length: LIMITS.ports + 1 }, (_, i) => ({ name: `P${i}`, side: 'left', bus: 'gpio' })) }), [`Too many ports (${LIMITS.ports} max).`]);
  assert.equal(draftProblems({ name: '', ports: [{ name: '', side: 'top' }], fields: [{ label: '' }] }).length, 3, 'every problem is listed');
});

test('definitionFrom a built-in part keeps port ids, marks supply pins required, and points the icon at the kind', () => {
  const d = definitionFrom(nodePart({ kind: 'mcu' }));
  assert.equal(d.name, 'MCU');
  assert.equal(d.category, 'compute');
  assert.deepEqual(d.icon, { kind: 'mcu' });
  assert.deepEqual(d.ports.map((p) => p.id), PARTS.mcu.ports.map((p) => p.id));
  assert.deepEqual(d.ports.filter((p) => p.required).map((p) => p.id), ['vcc', 'gnd']);
  // Customizing an MCU carries its power-budget currents into the definition.
  assert.deepEqual(d.fields.map((fd) => fd.id), ['ityp', 'ipeak']);
  assert.deepEqual(definitionFrom(nodePart({ kind: 'crystal' })).fields, [], 'a part with no schema has no fields');
  assert.deepEqual(d.ports.filter((p) => p.id.startsWith('gpio')).map((p) => p.name), ['GPIO', 'GPIO 2']);
  const t = definitionFrom(nodePart({ kind: 'threatactor' }));
  assert.equal(t.fields.find((f) => f.id === 'severity').options.length, 5, 'schema fields become plain choice fields');
  assert.equal(t.icon.kind, 'threatactor');
  const bat = definitionFrom(nodePart({ kind: 'battery' }));
  assert.deepEqual(bat.ports.filter((p) => p.required).map((p) => p.id), ['gnd'], 'a supply output is not required; its ground return is, as the checker says');
  assert.equal(bat.ports.find((p) => p.id === 'out').required, false);
  const { part, warnings } = normalizePart(d);
  assert.deepEqual(warnings, [], 'the definition is valid as is');
  assert.equal(part.ports.length, d.ports.length);
});

test('definitionFrom carries the power-tree markers, so Customize… cannot switch the budget off', () => {
  const reg = definitionFrom(nodePart({ kind: 'regulator' }));
  assert.deepEqual(reg.feeds, ['out']);
  assert.equal(reg.trio, true);
  assert.equal(reg.passes, undefined, 'a regulator carries no rail straight through');
  assert.deepEqual(definitionFrom(nodePart({ kind: 'fuse' })).passes, ['in', 'out']);
  assert.deepEqual(definitionFrom(nodePart({ kind: 'usbport' })).feeds, ['vbus']);
  assert.equal(definitionFrom(nodePart({ kind: 'mcu' })).feeds, undefined, 'a consumer heads no rail');
  // The whole round trip: validated, resolved, and still a supply.
  const { part, warnings } = normalizePart(reg);
  assert.deepEqual(warnings, []);
  assert.deepEqual(part.feeds, ['out']);
  assert.deepEqual(partOf({ kind: 'custom', part }).feeds, ['out']);
  assert.equal(partOf({ kind: 'custom', part }).trio, true);
});

test('normalizePart accepts power markers only where they name the definition\'s own ports', () => {
  const base = { name: 'Buck', category: 'power', ports: [{ id: 'out', name: 'OUT', side: 'right', bus: 'power' }] };
  assert.deepEqual(normalizePart({ ...base, feeds: ['out'] }).part.feeds, ['out']);
  // A hand-edited or hostile file cannot smuggle anything else through into
  // the rail walk: unknown ids, non-strings and duplicates all go.
  const hostile = normalizePart({ ...base, feeds: ['out', 'out', 'nope', { toString: () => 'out' }, 42, null] });
  assert.deepEqual(hostile.part.feeds, ['out']);
  assert.equal(hostile.warnings.length, 1);
  assert.match(hostile.warnings[0], /may only name its own ports/);
  const wrongShape = normalizePart({ ...base, passes: 'out' });
  assert.equal(wrongShape.part.passes, undefined);
  assert.match(wrongShape.warnings[0], /must be a list of port ids/);
  assert.equal(normalizePart({ ...base, feeds: ['nope'] }).part.feeds, undefined, 'nothing left means no marker at all');
  assert.equal(normalizePart({ ...base, trio: 'yes' }).part.trio, undefined, 'only a literal true turns the trio on');
  assert.equal(normalizePart(base).part.feeds, undefined, 'a definition that says nothing about power keeps saying nothing');
});

test('definitionFrom drops a marker whose port did not survive the copy', () => {
  const synth = {
    kind: 'regulator', name: 'X', category: 'power',
    ports: [{ id: 'in', name: 'IN', side: 'left', bus: 'power' }, { id: 'out', name: 'OUT', side: 'right', bus: 'power', unsupported: true }],
    feeds: ['out'], trio: true, fields: [],
  };
  assert.equal(definitionFrom(synth).feeds, undefined, 'the pin it named is not in the definition');
});

test('definitionFrom renames duplicate ports at the name character limit without losing the digit', () => {
  const maxName = 'A'.repeat(LIMITS.portName); // 12 chars
  const synth = {
    kind: 'mcu', name: 'X', category: 'misc', ports: [
      { id: 'p1', name: maxName, side: 'bottom', bus: 'gpio' },
      { id: 'p2', name: maxName, side: 'bottom', bus: 'gpio' },
    ], fields: [],
  };
  const d = definitionFrom(synth);
  assert.deepEqual(d.ports.map((p) => p.name), ['AAAAAAAAAAAA', 'AAAAAAAAAA 2']);
  const { part, warnings } = normalizePart(d);
  assert.deepEqual(warnings, []);
  assert.equal(part.ports.length, 2);
});

test('siblings are the other custom nodes from the same template', () => {
  const mk = (id, lib) => ({ id, kind: 'custom', part: { ...(lib ? { lib } : {}), name: 'X', category: 'misc', accent: null, icon: { text: 'X' }, ports: [], fields: [] } });
  const doc = { nodes: [mk('a', 'lp1'), mk('b', 'lp1'), mk('c', 'lp2'), mk('d', null), { id: 'e', kind: 'mcu' }], wires: [], zones: [], notes: [] };
  assert.deepEqual(siblings(doc, doc.nodes[0]).map((n) => n.id), ['b']);
  assert.deepEqual(siblings(doc, doc.nodes[3]), [], 'a one-off has none');
  assert.deepEqual(siblings(doc, doc.nodes[4]), []);
});

test('applyDefinition converts the node, drops wires on missing ports, prunes field values, and counts', () => {
  const doc = {
    nodes: [
      { id: 'm', kind: 'mcu', x: 0, y: 0, label: 'MCU', sublabel: 'ESP32', color: null, addr: '', rail: '3.3V', notes: '', status: 'tested', flags: ['bug'], fields: { zz: '1' } },
      { id: 't', kind: 'temp', x: 300, y: 0, label: 'T', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
    ],
    wires: [
      { id: 'w1', bus: 'i2c', from: { node: 'm', port: 'i2c' }, to: { node: 't', port: 'i2c' }, label: '', arrow: null, style: null, flow: null },
      { id: 'w2', bus: 'gnd', from: { node: 't', port: 'gnd' }, to: { node: 'm', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
    ],
    zones: [], notes: [],
  };
  const def = normalizePart({ ...definitionFrom(nodePart(doc.nodes[0])), ports: [{ id: 'i2c', name: 'I2C', side: 'right', bus: 'i2c' }, { id: 'p1', name: 'EN', side: 'left', bus: 'gpio' }], fields: [{ id: 'f1', label: 'Cores' }] }).part;
  const res = applyDefinition(doc, 'm', def);
  assert.deepEqual(res, { dropped: 1 });
  assert.equal(doc.nodes[0].kind, 'custom');
  assert.equal(doc.nodes[0].part, def);
  assert.deepEqual(doc.wires.map((w) => w.id), ['w1']);
  assert.equal('fields' in doc.nodes[0], false, 'a value for a field that no longer exists is gone');
  assert.equal(doc.nodes[0].sublabel, 'ESP32', 'instance values stay');
  assert.deepEqual(doc.nodes[0].flags, ['bug']);
  assert.deepEqual(applyDefinition(doc, 'nope', def), { dropped: 0 });
});

test('draftProblems and normalizePart warnings come out in Chinese under zh, English otherwise', () => {
  initI18n({ storage: null });
  assert.deepEqual(draftProblems({ name: '' }), ['Name is required.']);
  setLang('zh');
  try {
    assert.deepEqual(draftProblems({ name: '' }), ['名称不能为空。']);
    assert.match(draftProblems({ name: 'x', ports: [{ name: 'A', side: 'left' }, { name: 'a', side: 'left' }] })[0], /左/);
    const { warnings } = normalizePart({ name: 'x', category: 'nope', ports: [] });
    assert.match(warnings[0], /未知类别/);
  } finally {
    setLang('en');
  }
});

test('sideLabel names a side for display and leaves the value alone', () => {
  assert.equal(sideLabel('left'), 'left');
  setLang('zh');
  try { assert.equal(sideLabel('left'), '左'); } finally { setLang('en'); }
  assert.deepEqual(SIDES, ['left', 'right', 'top', 'bottom']);
});
