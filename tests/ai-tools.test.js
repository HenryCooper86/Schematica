import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, createExecutor, statusLine } from '../src/ai/tools.js';
import { newDoc } from '../src/state.js';
import { EXAMPLES } from '../src/examples.js';
import { initI18n, setLang } from '../src/i18n.js';

function plain(doc) {
  return createExecutor({ getDoc: () => doc, commit: (fn) => fn(doc), selection: () => ['n5'] });
}

test('seven tools with the expected names and strict flags', () => {
  assert.deepEqual(TOOLS.map((t) => t.name), ['rdk_reference', 'search_parts', 'get_board', 'run_checks', 'list_presets', 'apply_edits', 'arrange']);
  for (const t of TOOLS) {
    assert.equal(typeof t.description, 'string');
    assert.equal(t.input_schema.type, 'object');
    if (t.name !== 'apply_edits') {
      assert.equal(t.strict, true, t.name);
      assert.equal(t.input_schema.additionalProperties, false, t.name);
    } else {
      assert.equal(t.strict, undefined);
    }
  }
});

test('search_parts lists kinds with ports and says when nothing matches', () => {
  const ex = plain(newDoc('T'));
  const hit = ex.run('search_parts', { query: 'rdk' });
  assert.equal(hit.isError, false);
  assert.match(hit.text, /^aisbc  AI SBC/m);
  const miss = ex.run('search_parts', { query: 'zzzz' });
  assert.match(miss.text, /No kinds match/);
});

test('get_board and run_checks read the current document', () => {
  const doc = structuredClone(EXAMPLES.find((e) => e.id === 'weather-station').doc);
  const ex = plain(doc);
  const board = ex.run('get_board', {});
  assert.match(board.text, /^board "Weather Station"/);
  assert.match(board.text, /selected: n5/);
  const checks = ex.run('run_checks', {});
  assert.match(checks.text, /^(error|warning) [\w-]+ ".+" ids: /m);
  const clean = plain(structuredClone(EXAMPLES.find((e) => e.id === 'sensor-node-clean').doc)).run('run_checks', {});
  assert.match(clean.text, /passes every check/);
});

test('list_presets shows part numbers or says there are none', () => {
  const ex = plain(newDoc('T'));
  assert.match(ex.run('list_presets', { kind: 'aisbc' }).text, /pn=RDK X5/);
  assert.match(ex.run('list_presets', { kind: 'temp' }).text, /No presets for temp/);
  assert.equal(ex.run('list_presets', { kind: 'nope' }).isError, true);
});

test('apply_edits applies, places, reports refs and changes, and records touched ids', () => {
  const doc = newDoc('T');
  const ex = plain(doc);
  const res = ex.run('apply_edits', { ops: [
    { op: 'add_part', ref: 'mcu', kind: 'mcu' },
    { op: 'add_part', ref: 'bme', kind: 'temp', addr: '0x76' },
    { op: 'connect', from: { node: 'mcu' }, to: { node: 'bme' }, bus: 'i2c' },
  ] });
  assert.equal(res.isError, false, res.text);
  assert.match(res.text, /^Applied 3 change\(s\)\./);
  assert.match(res.text, /refs: mcu=n\w+ bme=n\w+/);
  assert.equal(doc.nodes.length, 2);
  assert.ok(doc.nodes[1].x > doc.nodes[0].x, 'placed: the sensor sits right of the MCU');
  assert.equal(ex.touched.size, 3);
  ex.resetTouched();
  assert.equal(ex.touched.size, 0);
});

test('a rejected batch changes nothing and returns the errors as a tool error', () => {
  const doc = newDoc('T');
  const ex = plain(doc);
  const res = ex.run('apply_edits', { ops: [{ op: 'add_part', ref: 'a', kind: 'nope' }] });
  assert.equal(res.isError, true);
  assert.match(res.text, /Batch rejected, nothing applied:\n#0: unknown kind "nope"/);
  assert.equal(doc.nodes.length, 0);
  assert.equal(ex.run('apply_edits', {}).isError, true, 'missing ops');
});

test('arrange lays the board out and refuses swimlane boards', () => {
  const doc = structuredClone(EXAMPLES.find((e) => e.id === 'weather-station').doc);
  const ex = plain(doc);
  const before = JSON.stringify(doc.nodes.map((n) => [n.x, n.y]));
  const res = ex.run('arrange', {});
  assert.equal(res.isError, false);
  assert.notEqual(JSON.stringify(doc.nodes.map((n) => [n.x, n.y])), before);
  assert.equal(ex.touched.size, doc.nodes.length);
  const lanes = structuredClone(EXAMPLES.find((e) => e.id === 'ota-pipeline').doc);
  assert.ok(lanes.zones.some((z) => z.kind === 'swimlane'));
  assert.equal(plain(lanes).run('arrange', {}).isError, true);
});

test('unknown tools are errors and status lines are short', () => {
  const ex = plain(newDoc('T'));
  assert.equal(ex.run('teleport', {}).isError, true);
  assert.equal(statusLine('search_parts', { query: 'lora' }), 'searching parts: lora');
  assert.equal(statusLine('apply_edits', { ops: [{}, {}] }), 'applying 2 edits');
  assert.equal(statusLine('run_checks', {}), 'running checks');
  assert.equal(statusLine('search_parts', null), 'searching parts: ');
  assert.equal(ex.run('constructor', {}).isError, true);
  assert.equal(ex.run('list_presets', { kind: 'constructor' }).isError, true);
});

// Some models stringify the ops array; a JSON string that parses to an array
// is accepted rather than costing a round.
test('apply_edits accepts ops given as a JSON string', () => {
  const doc = { schema: 1, title: '', nodes: [], wires: [], zones: [], notes: [], journey: [] };
  const ex = createExecutor({ getDoc: () => doc, commit: (fn) => fn(doc), selection: () => [] });
  const res = ex.run('apply_edits', { ops: JSON.stringify([{ op: 'add_part', ref: 'm', kind: 'mcu', label: 'MCU' }]) });
  assert.match(res.text, /Applied 1 change/);
  assert.equal(doc.nodes.length, 1);
  const bad = ex.run('apply_edits', { ops: 'not json' });
  assert.match(bad.text, /ops array/);
});

const TEMPLATE = {
  id: 'lp1', updated: '2026-09-07', name: 'Motor driver x4', category: 'actuators', accent: null, icon: { text: 'MD' },
  ports: [{ id: 'p1', name: 'CAN', side: 'left', bus: 'can', required: false }], fields: [],
};
const library = { list: () => [TEMPLATE], get: (id) => (id === 'lp1' ? TEMPLATE : null) };

test('search_parts lists library templates after catalogue kinds when a library is present', () => {
  const doc = newDoc('T');
  const ex = createExecutor({ getDoc: () => doc, commit: (fn) => fn(doc), library });
  const hit = ex.run('search_parts', { query: 'motor driver' });
  assert.match(hit.text, /^motor  Motor \+ driver/m, 'catalogue kinds still listed');
  assert.match(hit.text, /^template lp1  Motor driver x4  ports: p1:CAN\(can\)  \[library\]$/m);
  assert.match(ex.run('search_parts', { query: 'zzzz' }).text, /No kinds match/);
  const bare = plain(newDoc('T')).run('search_parts', { query: 'motor driver' });
  assert.ok(!/template lp1/.test(bare.text), 'no library, no templates');
});

test('apply_edits passes the library through so template adds work', () => {
  const doc = newDoc('T');
  const ex = createExecutor({ getDoc: () => doc, commit: (fn) => fn(doc), library });
  const res = ex.run('apply_edits', { ops: [{ op: 'add_part', ref: 'f', kind: 'custom', template: 'lp1' }] });
  assert.equal(res.isError, false, res.text);
  assert.equal(doc.nodes[0].part.lib, 'lp1');
  assert.ok(ex.touched.has(doc.nodes[0].id));
});

test('tool descriptions mention custom parts where the model needs to know', () => {
  const by = Object.fromEntries(TOOLS.map((t) => [t.name, t.description]));
  assert.match(by.search_parts, /library templates/);
  assert.match(by.apply_edits, /kind custom/);
  assert.match(by.run_checks, /required ports/);
});

test('tool status lines follow the interface language', () => {
  initI18n({ storage: null });
  assert.equal(statusLine('run_checks'), 'running checks');
  setLang('zh');
  try {
    assert.equal(statusLine('run_checks'), '正在运行检查');
    assert.equal(statusLine('search_parts', { query: 'imu' }), '正在搜索部件：imu');
    assert.equal(statusLine('apply_edits', { ops: [1, 2] }), '正在应用 2 项编辑');
  } finally {
    setLang('en');
  }
});
