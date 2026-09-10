import test from 'node:test';
import assert from 'node:assert/strict';
import { boardText, quote, catalogueText, partLine, nodeLine, templateLine } from '../src/ai/context.js';
import { EXAMPLES } from '../src/examples.js';
import { checkDoc } from '../src/drc.js';
import { PARTS } from '../src/palette.js';
import { BUSES } from '../src/buses.js';
import { stableSystem, perRequestSystem, ROLE_RULES, SINGLE_SHOT_RULES, LANGUAGE_RULES } from '../src/ai/prompt.js';
import { initI18n, setLang } from '../src/i18n.js';

const example = (id) => structuredClone(EXAMPLES.find((e) => e.id === id).doc);

test('quote escapes quotes, backslashes, and newlines', () => {
  assert.equal(quote('a "b" \\ c\nd'), '"a \\"b\\" \\\\ c\\nd"');
});

test('board text has one line per item and carries every id', () => {
  const doc = example('weather-station');
  const text = boardText(doc);
  const lines = text.split('\n');
  assert.equal(lines[0], 'board "Weather Station"');
  assert.ok(lines.includes('zone z1 "Power" members: n1 n2 n3 n4'), text);
  assert.ok(lines.includes('node n5 mcu "MCU" pn=ESP32-S3 rail=3.3V status=production ityp=100mA ipeak=355mA notes="Deep sleep between readings; wake every 10 min."'), text);
  assert.ok(lines.includes('node n6 temp "Temp sensor" pn=BME280 addr=0x76 rail=3.3V status=production ityp=3.6uA ipeak=0.72mA'), text);
  assert.ok(lines.includes('wire w6 i2c n5.i2c -- n6.i2c'), text);
  assert.ok(lines.includes('wire w4 power n4.out -- n5.vcc "3V3"'), text);
  assert.ok(lines.includes('note t1 "All logic runs on the 3.3V rail"'), text);
  for (const item of [...doc.nodes, ...doc.wires, ...doc.zones, ...doc.notes]) {
    assert.ok(lines.some((l) => l.split(' ')[1] === item.id), `${item.id} present`);
  }
  assert.ok(!text.includes('selected:'));
  assert.ok(!text.includes('checks:'));
});

test('arrows, styles, flow, schema fields, and disposition are rendered', () => {
  const doc = example('adas-security');
  const text = boardText(doc);
  assert.match(text, /wire \w+ link \w+\.\w+ -> \w+\.\w+ "spoofs"/);
  assert.match(text, /disposition=adversary/);
  assert.match(text, /severity=high|severity=critical/);
  assert.match(text, / style=dashed/);
});

test('selection and findings lines appear only when there is something to say', () => {
  const doc = example('weather-station');
  const findings = checkDoc(doc);
  assert.ok(findings.length > 0);
  const text = boardText(doc, { selection: ['n5', 'w6'], findings });
  assert.ok(text.split('\n').includes('selected: n5 w6'), text);
  const checks = text.split('\n').filter((l) => l.startsWith('checks: '));
  assert.equal(checks.length, findings.length);
  assert.match(checks[0], /^checks: (error|warning) [\w-]+ ".+" \w+/);
});

test('every example renders without throwing and stays stable', () => {
  for (const ex of EXAMPLES) {
    const a = boardText(ex.doc);
    const b = boardText(structuredClone(ex.doc));
    assert.equal(a, b, ex.id);
    assert.ok(a.length < 20000, `${ex.id} under 20k characters: ${a.length}`);
  }
});

test('partLine shows kind, name, ports with buses, and schema fields', () => {
  assert.equal(partLine(PARTS.crystal), 'crystal  Crystal  ports: osc(gpio)');
  // A hardware part's schema fields are its power-budget currents.
  assert.equal(partLine(PARTS.temp), 'temp  Temp sensor  ports: vcc(power), gnd(gnd), i2c(i2c)  fields: ityp, ipeak');
  assert.match(partLine(PARTS.threatactor), /^threatactor  .+  ports: .+  fields: .*severity\[info\|low\|medium\|high\|critical\].*  \[threat\]$/);
});

test('the catalogue lists every kind and every bus, grouped by category', () => {
  const text = catalogueText();
  for (const part of Object.values(PARTS)) assert.ok(text.includes(`\n${part.kind}  `), part.kind);
  for (const id of Object.keys(BUSES)) assert.ok(text.includes(`\n${id}  `), id);
  assert.ok(text.includes('## Compute\n'));
  assert.ok(text.includes('\ni2c  I2C  shared'));
  assert.ok(text.includes('\nspi  SPI  point-to-point'));
  assert.ok(text.includes('\nlink  Link / relationship  untyped'));
  assert.match(text, /\naisbc: .*RDK X5/);
  assert.equal(text, catalogueText(), 'stable across calls so it caches');
});

test('the system prompt is the rules plus the catalogue, and the per-request block is small', () => {
  const stable = stableSystem();
  assert.ok(stable.startsWith(ROLE_RULES));
  assert.ok(stable.includes('# Catalogue\n'));
  const per = perRequestSystem({ date: '2026-09-05', effort: 'medium', singleShot: false });
  assert.match(per, /2026-09-05/);
  assert.ok(!per.includes(SINGLE_SHOT_RULES));
  assert.ok(perRequestSystem({ date: '2026-09-05', effort: 'low', singleShot: true }).includes(SINGLE_SHOT_RULES));
});

test('the rules tell the model how to search and how to name ports on connect', () => {
  assert.match(ROLE_RULES, /by function or bus/);
  assert.match(ROLE_RULES, /both ends or neither/);
});

test('custom nodes list their ports and template so the model can connect by bus', () => {
  const part = {
    lib: 'lp1', name: 'Motor driver x4', category: 'actuators', accent: null, icon: { text: 'MD' },
    ports: [{ id: 'p1', name: 'VCC', side: 'top', bus: 'power', required: true }, { id: 'p2', name: 'CAN', side: 'left', bus: 'can', required: false }],
    fields: [{ id: 'f1', label: 'Channels' }],
  };
  const node = { id: 'c1', kind: 'custom', x: 0, y: 0, label: 'Left driver', sublabel: 'MD-4', color: null, addr: '', rail: '12V', notes: '', status: null, flags: [], part, fields: { f1: '4' } };
  assert.equal(
    nodeLine({ nodes: [node], wires: [], zones: [], notes: [] }, node),
    'node c1 custom "Left driver" custom-ports=p1:VCC(power),p2:CAN(can) template=lp1 pn=MD-4 rail=12V f1=4',
  );
  const bare = { ...node, part: { ...part, lib: undefined, ports: [] } };
  assert.match(nodeLine({ nodes: [bare], wires: [], zones: [], notes: [] }, bare), /custom-ports=- pn=/);
  assert.equal(templateLine({ id: 'lp1', ...part }), 'template lp1  Motor driver x4  ports: p1:VCC(power), p2:CAN(can)  [library]');
});

test('the rules cover custom parts and the single-shot schema names them', () => {
  assert.match(ROLE_RULES, /kind custom/);
  assert.match(ROLE_RULES, /only when no kind fits/);
  assert.match(ROLE_RULES, /say in your reply that you made a custom part/);
  assert.match(ROLE_RULES, /custom-ports/);
  assert.match(SINGLE_SHOT_RULES, /kind custom/);
});

test('the per-request block asks for Chinese only when the interface is Chinese', () => {
  const en = perRequestSystem({ date: '2026-09-08', effort: 'medium', singleShot: false, language: 'en' });
  assert.ok(!/Simplified Chinese/.test(en));
  const zh = perRequestSystem({ date: '2026-09-08', effort: 'medium', singleShot: false, language: 'zh' });
  assert.match(zh, /Reply in Simplified Chinese \(简体中文\)\. Keep ids, part kinds, bus names, tool names, and field values exactly as they are\./);
  assert.ok(zh.startsWith('Today is 2026-09-08. Effort: medium.'));
  assert.equal(perRequestSystem({ date: '2026-09-08', effort: 'low', singleShot: true, language: 'zh' }).includes(SINGLE_SHOT_RULES), true);
});

test('the stable block is byte-identical in Chinese, so provider caching holds', () => {
  initI18n({ storage: null });
  const english = stableSystem();
  setLang('zh');
  try {
    assert.equal(stableSystem(), english);
  } finally {
    setLang('en');
  }
});
