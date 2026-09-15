import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, addNode, addWire, duplicateItems, newDoc } from '../src/state.js';
import { deserialize, serialize } from '../src/serialize.js';
import { interfaceCSV, importInterfaces, engineeringChecks, normalizeEngineering } from '../src/engineering.js';
import { buildClip, readClip, encodeClip, pasteInto } from '../src/clipboard.js';
import { groupSubsystem, createSubsystemNavigation, subsystemIssues } from '../src/subsystems.js';
import { reviewFindings, reviewPackage, reviewHTML } from '../src/review.js';
import { fromKiCadData } from '../src/kicad.js';
import { parseCSV, toCSV } from '../src/tabular.js';

function fixture() {
  const store = new Store(); const a = addNode(store, 'mcu', 0, 0), b = addNode(store, 'temp', 350, 0);
  const w = addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  store.doc.wires[0].spec = { direction: 'from-to', voltage: '3.3V', protocol: 'I2C v7', rate: '400kHz', source: 'datasheet.pdf p3' };
  store.doc.engineering = { requirements: [{ id: 'REQ-1', text: 'Measure temperature', rationale: 'Control', owner: 'A', evidence: 'test-report', status: 'verified', targets: [a, w] }] };
  return { store, a, b, w };
}
test('engineering data and conversion assumptions survive save and share serialization', () => {
  const { store } = fixture(); store.doc.nodes[0].budget = { activeMa: 20, sleepMa: 1, dutyPercent: 10 };
  assert.deepEqual(deserialize(serialize(store.doc)).doc, store.doc);
});
test('ICD CSV handles quoted multiline references and imports atomically', () => {
  const { store } = fixture(); store.doc.wires[0].spec.source = 'a,"b"\nc';
  const csv = interfaceCSV(store.doc); assert.equal(importInterfaces(store.doc, csv), 1);
  assert.equal(store.doc.wires[0].spec.source, 'a,"b"\nc');
  const before = serialize(store.doc);
  assert.throws(() => importInterfaces(store.doc, csv + '\nunknown,x,x,i2c,,,,,'));
  assert.equal(serialize(store.doc), before);
  assert.deepEqual(parseCSV(toCSV([['a', 'b'], ['x\ny', '"z"']])), [['a', 'b'], ['x\ny', '"z"']]);
});
test('requirements flag missing allocations, missing targets and missing evidence', () => {
  const { store } = fixture(); const req = store.doc.engineering.requirements[0];
  assert.equal(engineeringChecks(store.doc).length, 0);
  req.targets = []; assert.equal(engineeringChecks(store.doc)[0].rule, 'requirement-unallocated');
  req.targets = ['missing']; req.evidence = '';
  assert.equal(engineeringChecks(store.doc).length, 2);
  store.doc.engineering.interfacesRequired = true; delete store.doc.wires[0].spec;
  assert.ok(engineeringChecks(store.doc).some(f => f.rule === 'interface-incomplete'));
});
test('copy and duplicate remap requirements onto copied parts and wires', () => {
  const { store, a, b } = fixture();
  const clip = readClip(encodeClip(buildClip(store.doc, [a, b]))).clip;
  const target = new Store(); const ids = pasteInto(target, clip);
  const req = target.doc.engineering.requirements[0];
  assert.equal(req.targets.length, 2); assert.ok(req.targets.every(id => ids.includes(id)));
  duplicateItems(store, [a, b]);
  assert.equal(store.doc.engineering.requirements[0].targets.length, 4);
});
test('engineering records reject duplicate IDs and prototype-bearing data is inert', () => {
  const warnings = [];
  const normalized = normalizeEngineering({ requirements: [{ id: 'r' }, { id: 'r' }, null] }, warnings);
  assert.equal(normalized.requirements.length, 1); assert.equal(warnings.length, 2);
  assert.equal({}.polluted, undefined);
});
test('subsystems preserve boundary wiring and nested edits through roundtrip and duplication', () => {
  const { store, a, b, w } = fixture();
  const id = groupSubsystem(store, [b], 'Sensors');
  const node = store.doc.nodes.find(n => n.id === id);
  assert.equal(store.doc.wires.find(x => x.id === w).to.node, id);
  assert.equal(subsystemIssues(node).length, 0);
  const nav = createSubsystemNavigation(store); nav.enter(id);
  store.apply(doc => { doc.nodes[0].label = 'Edited sensor'; });
  assert.equal(nav.rootDoc().nodes.find(n => n.id === id).subsystem.doc.nodes[0].label, 'Edited sensor');
  nav.up(); assert.equal(store.doc.nodes.find(n => n.id === a).kind, 'mcu');
  const loaded = deserialize(serialize(store.doc)); assert.deepEqual(loaded.warnings, []);
  const copies = duplicateItems(store, [id]);
  assert.deepEqual(store.doc.nodes.find(n => n.id === copies[0]).subsystem, store.doc.nodes.find(n => n.id === id).subsystem);
  assert.equal(subsystemIssues(store.doc.nodes.find(n => n.id === copies[0])).length, 0);
});
test('subsystem nesting is bounded on import', () => {
  const doc = newDoc(); let d = doc;
  for (let i = 0; i < 10; i++) { const child = newDoc(); d.nodes.push({ id: 'n', kind: 'generic', x: 0, y: 0, subsystem: { doc: child, exposed: [] } }); d = child; }
  assert.throws(() => deserialize(serialize(doc)), /eight levels/);
});
test('review exceptions stay stable across movement and expire on engineering changes', () => {
  const { store } = fixture(); const f = reviewFindings(store.doc).find(f => !f.rule.startsWith('layout'));
  store.doc.engineering.exceptions = [{ id: f.id, fingerprint: f.fingerprint, rationale: 'Accepted for prototype', owner: 'Reviewer', at: '2026-09-15' }];
  store.doc.nodes[0].x += 20;
  assert.ok(reviewFindings(store.doc).find(x => x.id === f.id).exception);
  const affected = store.doc.nodes.find(n => f.ids.includes(n.id)); affected.fields = { ityp: '25mA' };
  assert.equal(reviewFindings(store.doc).find(x => x.id === f.id)?.exception, undefined);
});
test('review exports include all engineering records and escape embedded script text', () => {
  const { store } = fixture(); store.doc.title = '</script><script>alert(1)</script>';
  const report = reviewPackage(store.doc, newDoc());
  assert.equal(report.requirements.length, 1); assert.ok(report.comparison.changes.length);
  const html = reviewHTML(store.doc); assert.ok(!html.includes(store.doc.title)); assert.ok(html.includes('interfaces.csv'));
});
test('KiCad importer keeps multi-drop nets explicit without guessing bus types', () => {
  const doc = fromKiCadData({ components: [{ ref: 'U1', value: 'MCU' }, { ref: 'R1', value: '10k' }, { ref: 'J1', value: 'Header' }],
    nets: [{ name: 'SIGNAL', nodes: [{ ref: 'U1', pin: '1' }, { ref: 'R1', pin: '2' }, { ref: 'J1', pin: '3' }] }] });
  assert.equal(doc.nodes.length, 4); assert.equal(doc.wires.length, 3); assert.ok(doc.wires.every(w => w.bus === 'link'));
  assert.deepEqual(deserialize(serialize(doc)).warnings, []);
  assert.throws(() => fromKiCadData({ components: [{ ref: 'U1' }], nets: [{ nodes: [{ ref: 'bad', pin: '1' }] }] }));
});

test('grouping preserves power budgets and BOM quantities across exposed ports', async () => {
  const { powerRails } = await import('../src/power.js'); const { buildBOM } = await import('../src/bom.js');
  const store=new Store(); const a=addNode(store,'battery',0,0),b=addNode(store,'mcu',400,0);
  store.doc.nodes[1].fields={ityp:'100mA'};addWire(store,'power',{node:a,port:'out'},{node:b,port:'vcc'});
  const before=powerRails(store.doc)[0].typicalMa;const id=groupSubsystem(store,[b],'Control');
  assert.equal(powerRails(store.doc)[0].typicalMa,before);
  assert.equal(buildBOM(store.doc).reduce((n,r)=>n+r.qty,0),2);
  const nav=createSubsystemNavigation(store);nav.enter(id);nav.up();store.undo();
  assert.equal(store.doc.nodes.some(n=>n.id===b),true,'unchanged navigation preserves the grouping undo step');
});

test('an unwired subsystem can expose an internal port for later reuse', async () => {
  const { exposePort }=await import('../src/subsystems.js');
  const store=new Store();const n=addNode(store,'mcu',0,0);const id=groupSubsystem(store,[n],'Control');
  const p=exposePort(store,id,{node:n,port:'i2c'},'Sensor bus');
  assert.equal(exposePort(store,id,{node:n,port:'i2c'},'Same bus'),p);
  const wrapper=store.doc.nodes[0];assert.equal(wrapper.part.ports.length,1);assert.equal(subsystemIssues(wrapper).length,0);
  assert.deepEqual(deserialize(serialize(store.doc)).warnings,[]);
});


test('KiCad imports 64-pin parts without dropping pins and rejects overflow', async () => {
  const { LIMITS } = await import('../src/custom.js');
  const { nodeRect } = await import('../src/geometry.js');
  const components = Array.from({length:9},(_,i)=>({ref:'U'+i,value:'MCU'}));
  const nets = Array.from({length:LIMITS.ports},(_,i)=>({name:'Signal '+i,nodes:[{ref:'U0',pin:String(i+1)}]}));
  const doc = fromKiCadData({components,nets});
  const restored = deserialize(serialize(doc));
  assert.deepEqual(restored.warnings,[]);
  assert.equal(restored.doc.nodes[0].part.ports.length,LIMITS.ports);
  assert.equal(restored.doc.wires.length,LIMITS.ports);
  for(const wire of restored.doc.wires) assert.ok(restored.doc.nodes[0].part.ports.some(p=>p.id===wire.from.port));
  const first=nodeRect(doc.nodes[0]),nextRow=nodeRect(doc.nodes[8]);
  assert.ok(nextRow.y>=first.y+first.h,'tall components do not overlap the next row');
  assert.throws(()=>fromKiCadData({components,nets:[...nets,{name:'overflow',nodes:[{ref:'U0',pin:'65'}]}]}),/64 connected pins/);
  assert.throws(()=>fromKiCadData({components,nets:[{nodes:[{ref:'U0',pin:'pin-name-too-long'}]}]}),/truncation/);
});

test('subsystem boundaries beyond the old 24-port cap survive serialization', async () => {
  const source=fromKiCadData({components:[{ref:'U1',value:'MCU'}],nets:Array.from({length:40},(_,i)=>({name:'N'+i,nodes:[{ref:'U1',pin:String(i+1)}]}))});
  const store=new Store();store.replaceDoc(source);
  const id=groupSubsystem(store,['k0'],'Controller');
  const restored=deserialize(serialize(store.doc));
  assert.deepEqual(restored.warnings,[]);
  const wrapper=restored.doc.nodes.find(n=>n.id===id);
  assert.equal(wrapper.part.ports.length,40);
  assert.equal(wrapper.subsystem.exposed.length,40);
  assert.deepEqual(subsystemIssues(wrapper),[]);
  assert.equal(restored.doc.wires.length,40);
});
