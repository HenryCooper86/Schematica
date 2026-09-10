import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES, localizedExample, EXAMPLE_OVERLAYS_ZH } from '../src/examples.js';
import { serialize, deserialize } from '../src/serialize.js';

const CJK = /[一-鿿]/;
const byId = (id) => EXAMPLES.find((e) => e.id === id);

test('English returns the very same example object, untouched', () => {
  const ex = byId('weather-station');
  assert.equal(localizedExample(ex), ex);
  assert.equal(localizedExample(ex, 'en'), ex);
  assert.equal(localizedExample(ex, 'fr'), ex, 'an unknown language is English');
});

test('Chinese returns a copy with the overlay applied and the source untouched', () => {
  const ex = byId('weather-station');
  const before = JSON.stringify(ex);
  const zh = localizedExample(ex, 'zh');
  assert.notEqual(zh, ex);
  assert.notEqual(zh.doc, ex.doc);
  assert.equal(JSON.stringify(ex), before, 'no mutation');
  assert.equal(zh.id, 'weather-station');
  assert.equal(zh.group, ex.group);
  assert.equal(zh.name, '气象站');
  assert.equal(zh.doc.title, '气象站');
  const mcu = zh.doc.nodes.find((n) => n.id === 'n5');
  assert.equal(mcu.label, '微控制器');
  assert.match(mcu.notes, CJK);
  assert.equal(mcu.sublabel, 'ESP32-S3', 'part numbers never translate');
  assert.equal(zh.doc.zones[0].label, '电源');
  assert.match(zh.doc.notes[0].text, CJK);
  assert.equal(zh.doc.journey[0].label, '供电路径');
  assert.match(zh.doc.journey[0].caption, CJK);
});

test('a Chinese copy keeps every non-text field and round-trips through the serializer', () => {
  const ex = byId('weather-station');
  const zh = localizedExample(ex, 'zh');
  const strip = (doc) => ({
    ...doc,
    title: '',
    nodes: doc.nodes.map((n) => ({ ...n, label: '', notes: '' })),
    zones: doc.zones.map((z) => ({ ...z, label: '', lanes: undefined })),
    notes: doc.notes.map((t) => ({ ...t, text: '' })),
    journey: doc.journey.map((j) => ({ ...j, label: '', caption: '', ...(j.stops ? {stops: j.stops.map(s => ({...s,caption:''}))} : {}) })),
    wires: doc.wires.map((w) => ({ ...w, label: '' })),
  });
  assert.deepEqual(strip(zh.doc), strip(ex.doc));
  const { doc, warnings } = deserialize(serialize(zh.doc));
  assert.deepEqual(warnings, []);
  assert.deepEqual(doc, zh.doc);
});

// Every overlay that exists is complete for its board and points only at
// real ids. Task 8 adds the assertion that every board has an overlay.
for (const [id, overlay] of Object.entries(EXAMPLE_OVERLAYS_ZH)) {
  test(`overlay ${id} is complete, valid, and Chinese`, () => {
    const ex = byId(id);
    assert.ok(ex, `overlay for unknown example "${id}"`);
    const { doc } = ex;
    const chinese = (value, where) => {
      assert.equal(typeof value, 'string', where);
      assert.ok(value.trim().length > 0, `${where} is empty`);
      assert.match(value, CJK, `${where} has no Chinese: ${value}`);
    };
    chinese(overlay.name, `${id}.name`);
    chinese(overlay.title, `${id}.title`);
    for (const n of doc.nodes) {
      const o = overlay.nodes?.[n.id];
      if (n.label) { assert.ok(o?.label !== undefined, `${id}.nodes.${n.id}.label missing`); chinese(o.label, `${id}.nodes.${n.id}.label`); }
      if (n.notes) { assert.ok(o?.notes !== undefined, `${id}.nodes.${n.id}.notes missing`); chinese(o.notes, `${id}.nodes.${n.id}.notes`); }
    }
    for (const z of doc.zones) {
      const o = overlay.zones?.[z.id];
      assert.ok(o?.label !== undefined, `${id}.zones.${z.id}.label missing`);
      chinese(o.label, `${id}.zones.${z.id}.label`);
      if (z.lanes) {
        assert.ok(Array.isArray(o.lanes) && o.lanes.length === z.lanes.length, `${id}.zones.${z.id}.lanes must have ${z.lanes.length} entries`);
        o.lanes.forEach((lane, i) => chinese(lane, `${id}.zones.${z.id}.lanes[${i}]`));
      } else {
        assert.equal(o.lanes, undefined, `${id}.zones.${z.id} has lanes but the zone is not a swimlane`);
      }
    }
    for (const t of doc.notes) chinese(overlay.notes?.[t.id], `${id}.notes.${t.id}`);
    for (const j of doc.journey) {
      const o = overlay.journey?.[j.id];
      chinese(o?.label, `${id}.journey.${j.id}.label`);
      chinese(o?.caption, `${id}.journey.${j.id}.caption`);
    }
    // No entry may point at an id or a field the board does not have.
    const nodeIds = new Set(doc.nodes.map((n) => n.id));
    for (const [nid, o] of Object.entries(overlay.nodes || {})) {
      assert.ok(nodeIds.has(nid), `${id}.nodes.${nid} is not on the board`);
      for (const k of Object.keys(o)) assert.ok(['label', 'notes'].includes(k), `${id}.nodes.${nid}.${k} is not translatable`);
    }
    const zoneIds = new Set(doc.zones.map((z) => z.id));
    for (const [zid, o] of Object.entries(overlay.zones || {})) {
      assert.ok(zoneIds.has(zid), `${id}.zones.${zid} is not on the board`);
      for (const k of Object.keys(o)) assert.ok(['label', 'lanes'].includes(k), `${id}.zones.${zid}.${k} is not translatable`);
    }
    const noteIds = new Set(doc.notes.map((t) => t.id));
    for (const tid of Object.keys(overlay.notes || {})) assert.ok(noteIds.has(tid), `${id}.notes.${tid} is not on the board`);
    const stepIds = new Set(doc.journey.map((j) => j.id));
    for (const [jid, o] of Object.entries(overlay.journey || {})) {
      assert.ok(stepIds.has(jid), `${id}.journey.${jid} is not on the board`);
      for (const k of Object.keys(o)) assert.ok(['label', 'caption'].includes(k), `${id}.journey.${jid}.${k} is not translatable`);
    }
    for (const k of Object.keys(overlay)) assert.ok(['name', 'title', 'nodes', 'zones', 'notes', 'journey', 'wires'].includes(k), `${id}.${k} is not an overlay field`);
    // Applying it reaches every translated field.
    const zh = localizedExample(ex, 'zh');
    assert.equal(zh.name, overlay.name);
    assert.equal(zh.doc.title, overlay.title);
  });
}

test('every built-in board has a Chinese overlay and localizes to a distinct Chinese name', () => {
  const missing = EXAMPLES.filter((ex) => !EXAMPLE_OVERLAYS_ZH[ex.id]).map((ex) => ex.id);
  assert.deepEqual(missing, []);
  const names = EXAMPLES.map((ex) => localizedExample(ex, 'zh').name);
  assert.equal(new Set(names).size, names.length, 'Chinese menu names are unique');
  for (const name of names) assert.match(name, CJK);
  const stray = Object.keys(EXAMPLE_OVERLAYS_ZH).filter((id) => !EXAMPLES.some((ex) => ex.id === id));
  assert.deepEqual(stray, [], 'no overlay without a board');
});

const WORDY = /[a-z]{3,}/;
const CODE_LIKE = new Set(['isoSPI', '500 kbit/s']);

test('a wire label in the overlay replaces the English label and leaves the wire otherwise untouched', () => {
  const ex = byId('rdk-rover');
  const zh = localizedExample(ex, 'zh');
  const sw1 = zh.doc.wires.find((w) => w.id === 'sw1');
  assert.equal(sw1.label, '逻辑流');
  const { label, ...rest } = sw1;
  const { label: enLabel, ...enRest } = ex.doc.wires.find((w) => w.id === 'sw1');
  assert.deepEqual(rest, enRest);
  assert.equal(enLabel, 'logical flow');
  assert.equal(zh.doc.wires.find((w) => w.id === 'w6').label, 'CSI-2', 'code-like labels stay');
});

test('every word-like wire label on every board has a Chinese entry, and code-like labels have none', () => {
  const missing = [];
  const stray = [];
  for (const ex of EXAMPLES) {
    const wires = EXAMPLE_OVERLAYS_ZH[ex.id]?.wires || {};
    for (const w of ex.doc.wires) {
      const wordy = (WORDY.test(w.label) && !CODE_LIKE.has(w.label)) || w.label === 'yes' || w.label === 'no';
      if (wordy && wires[w.id] === undefined) missing.push(`${ex.id}.${w.id} ${JSON.stringify(w.label)}`);
      if (!wordy && wires[w.id] !== undefined) stray.push(`${ex.id}.${w.id} ${JSON.stringify(w.label)}`);
      if (wires[w.id] !== undefined) assert.match(wires[w.id], CJK, `${ex.id}.${w.id}`);
    }
    for (const id of Object.keys(wires)) assert.ok(ex.doc.wires.some((w) => w.id === id), `${ex.id}.wires.${id} is not on the board`);
  }
  assert.deepEqual(missing, []);
  assert.deepEqual(stray, []);
});

test('guided examples keep stable stops and translate every stop caption', () => {
  for (const id of ['weather-station','ev-bms','secure-boot']) {
    const ex = byId(id), zh = localizedExample(ex, 'zh');
    for (const [i, step] of ex.doc.journey.entries()) {
      assert.ok(step.stops?.length >= 2, `${id}/${step.id} has an authored story`);
      const nodes = new Set(ex.doc.nodes.map(n=>n.id));
      assert.ok(step.stops.every(s=>nodes.has(s.node)), 'every stop resolves');
      assert.deepEqual(zh.doc.journey[i].stops.map(s=>[s.id,s.node]),step.stops.map(s=>[s.id,s.node]));
      for (const stop of zh.doc.journey[i].stops) assert.match(stop.caption,CJK);
    }
    assert.deepEqual(deserialize(serialize(zh.doc)).doc,zh.doc);
  }
});
