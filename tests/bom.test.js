import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBOM, bomCSV, bomMarkdown, bomTotalMa, bomSummary } from '../src/bom.js';
import { initI18n, setLang } from '../src/i18n.js';

const node = (id, kind, label, sublabel, extra = {}) => ({
  id, kind, x: 0, y: 0, label, sublabel, color: null,
  addr: '', rail: '', notes: '', status: null, flags: [], ...extra,
});

function sampleDoc() {
  return {
    schema: 1,
    title: 'T',
    nodes: [
      node('n1', 'servo', 'Base servo', 'MG996R', { rail: '5V' }),
      node('n2', 'servo', 'Elbow servo', 'MG996R', { rail: '5V', flags: ['power'] }),
      node('n3', 'mcu', 'Brain', 'STM32F4', { addr: 'CAN 0x10', status: 'tested', notes: 'has "quotes", commas' }),
      node('n4', 'temp', 'Temp', 'BME280', { addr: '0x76' }),
    ],
    wires: [], zones: [], notes: [], journey: [],
  };
}

test('buildBOM groups by kind + part number with quantities and collected metadata', () => {
  const rows = buildBOM(sampleDoc());
  assert.equal(rows.length, 3);
  const servos = rows.find((r) => r.sublabel === 'MG996R');
  assert.equal(servos.qty, 2);
  assert.deepEqual(servos.refs, ['Base servo', 'Elbow servo']);
  assert.deepEqual(servos.rails, ['5V']);
  assert.deepEqual(servos.flags, ['power']);
  const mcu = rows.find((r) => r.sublabel === 'STM32F4');
  assert.equal(mcu.qty, 1);
  assert.deepEqual(mcu.addrs, ['CAN 0x10']);
  assert.deepEqual(mcu.statuses, ['tested']);
});

test('buildBOM output is sorted and empty doc yields empty list', () => {
  const rows = buildBOM(sampleDoc());
  const names = rows.map((r) => r.part);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  assert.deepEqual(buildBOM({ nodes: [], wires: [], zones: [], notes: [], journey: [] }), []);
});

test('bomCSV escapes quotes, commas, and newlines correctly', () => {
  const csv = bomCSV(buildBOM(sampleDoc()));
  const lines = csv.split('\n');
  assert.equal(lines[0], 'Part,Part number,Qty,Refs,Addresses,Rails,Typ. current,Status,Flags,Notes');
  assert.equal(lines.length, 4, 'no board total row while nothing declares a current');
  assert.ok(csv.includes('"has ""quotes"", commas"'), 'quoted cell with doubled quotes');
  assert.ok(csv.includes('Base servo; Elbow servo'));
});

test('bomCSV neutralises cells a spreadsheet would run as a formula', () => {
  const doc = sampleDoc();
  // Every leading character a spreadsheet treats as "this is a formula",
  // including the two whitespace ones that hide behind a leading blank.
  const hostile = ['=1+1', '+1', '-1', '@SUM(A1)', '\tcmd', '\rcmd', '=HYPERLINK("http://x","go")'];
  doc.nodes = hostile.map((label, i) => node(`n${i}`, 'servo', label, `S${i}`));
  const lines = bomCSV(buildBOM(doc)).split('\n').slice(1);
  assert.equal(lines.length, hostile.length);
  for (const line of lines) {
    const cell = line.split(',')[3]; // Refs, where the label lands
    assert.ok(cell.startsWith(`"'`), `neutralised and quoted: ${line}`);
  }
  assert.ok(lines.some((l) => l.includes(`"'=HYPERLINK(""http://x"",""go"")"`)), 'quotes are still doubled inside a neutralised cell');
  // An ordinary cell is untouched: no stray apostrophes, no needless quoting.
  const plain = bomCSV(buildBOM(sampleDoc()));
  assert.ok(plain.includes('Base servo; Elbow servo'));
  assert.ok(!plain.includes("'"), plain);
  assert.ok(plain.includes('"has ""quotes"", commas"'), 'ordinary quoting is unchanged');
});

test('bomMarkdown renders a table and escapes pipes', () => {
  const doc = sampleDoc();
  doc.nodes[3].label = 'A|B';
  const md = bomMarkdown(buildBOM(doc));
  const lines = md.split('\n');
  assert.ok(lines[0].startsWith('| Part |'));
  assert.ok(lines[1].startsWith('|---'));
  assert.equal(lines.length, 2 + 3);
  assert.ok(md.includes('A\\|B'));
});

test('an export names catalogue parts in the interface language and leaves custom names alone', () => {
  initI18n({ storage: null });
  const custom = { name: 'Battery', category: 'power', accent: null, icon: { text: 'B' }, ports: [], fields: [] };
  const rows = buildBOM({
    schema: 2, title: 'T', wires: [], zones: [], notes: [], journey: [],
    nodes: [node('n1', 'mcu', 'Brain', 'STM32'), node('c1', 'custom', 'Pack', '18650', { part: custom })],
  });
  setLang('zh');
  try {
    const csv = bomCSV(rows).split('\n');
    assert.equal(csv[0], '部件,型号,数量,位号,地址,电压轨,典型电流,状态,标记,备注');
    assert.ok(csv.some((l) => l.startsWith('微控制器,')), bomCSV(rows));
    assert.ok(csv.some((l) => l.startsWith('Battery,')), 'the author\'s own name is not translated');
    const md = bomMarkdown(rows).split('\n');
    assert.ok(md[0].startsWith('| 部件 |'), md[0]);
    assert.ok(md.some((l) => l.startsWith('| 微控制器 |')), bomMarkdown(rows));
    assert.ok(md.some((l) => l.startsWith('| Battery |')), 'the author\'s own name is not translated');
  } finally {
    setLang('en');
  }
  assert.ok(bomCSV(rows).includes('\nMCU,'), 'English is unchanged');
  assert.ok(bomMarkdown(rows).includes('| MCU |'), 'English is unchanged');
});

test('a line carries the typical current of all its copies and the table totals them', () => {
  const doc = {
    schema: 2, title: 'T', wires: [], zones: [], notes: [], journey: [],
    nodes: [
      node('n1', 'servo', 'Base', 'MG996R', { fields: { ityp: '250mA' } }),
      node('n2', 'servo', 'Elbow', 'MG996R', { fields: { ityp: '250mA' } }),
      node('n3', 'mcu', 'Brain', 'STM32F4', { fields: { ipeak: '90mA' } }),
      node('n4', 'temp', 'Temp', 'BME280'),
    ],
  };
  const rows = buildBOM(doc);
  assert.equal(rows.find((r) => r.sublabel === 'MG996R').currentMa, 500, 'two servos are two draws');
  assert.equal(rows.find((r) => r.sublabel === 'STM32F4').currentMa, 90, 'a peak stands in for a missing typical');
  assert.equal(rows.find((r) => r.sublabel === 'BME280').currentMa, null, 'unstated is not zero');
  assert.equal(bomTotalMa(rows), 590);

  const csv = bomCSV(rows).split('\n');
  assert.equal(csv[0].split(',')[6], 'Typ. current');
  assert.equal(csv.find((l) => l.startsWith('Servo,')).split(',')[6], '500 mA');
  assert.equal(csv.at(-1), 'Board total,,,,,,590 mA,,,');
  const md = bomMarkdown(rows).split('\n');
  assert.equal(md[1], '|---|---|---|---|---|---|---|---|---|---|', 'ten columns of dashes');
  assert.equal(md.at(-1), '| Board total |  |  |  |  |  | 590 mA |  |  |  |');
});

test('the summary states the board total and the runtime of a cell that declares one', () => {
  const doc = {
    schema: 2, title: 'T', zones: [], notes: [], journey: [],
    nodes: [
      node('b', 'battery', 'Pack', '18650', { fields: { capacity: '3000mAh' } }),
      node('m', 'mcu', 'Brain', 'ESP32', { fields: { ityp: '150mA' } }),
    ],
    wires: [{ id: 'w1', bus: 'power', from: { node: 'b', port: 'out' }, to: { node: 'm', port: 'vcc' }, label: '', arrow: null, style: null, flow: null }],
  };
  assert.deepEqual(bomSummary(doc), [
    'Declared typical current: 150 mA.',
    'Pack at 3000 mAh: about 20 h at a continuous 150 mA, ignoring duty cycle and efficiency.',
  ]);
  assert.deepEqual(bomSummary({ ...doc, nodes: [node('t', 'temp', 'Temp', 'BME280')], wires: [] }), [],
    'a board that declares nothing says nothing');
});

test('custom nodes group by template, or by name without one, and show the definition name', () => {
  const part = (lib) => ({ ...(lib ? { lib } : {}), name: 'Motor driver x4', category: 'actuators', accent: null, icon: { text: 'MD' }, ports: [], fields: [] });
  const rows = buildBOM({
    schema: 2, title: 'T', wires: [], zones: [], notes: [], journey: [],
    nodes: [
      node('c1', 'custom', 'Left', 'MD-4', { part: part('lp1') }),
      node('c2', 'custom', 'Right', 'MD-4', { part: part('lp1') }),
      node('c3', 'custom', 'Spare', 'MD-4', { part: part(null) }),
      node('m', 'mcu', 'Brain', 'STM32', {}),
    ],
  });
  const md = rows.filter((r) => r.part === 'Motor driver x4');
  assert.equal(md.length, 2, 'template copies group together; the one-off is its own row');
  assert.deepEqual(md.map((r) => r.qty).sort(), [1, 2]);
});
