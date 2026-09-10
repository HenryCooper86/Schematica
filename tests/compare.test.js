import test from 'node:test';
import assert from 'node:assert/strict';
import { compareBoards } from '../src/compare.js';
import { newDoc } from '../src/state.js';
import { initI18n, setLang } from '../src/i18n.js';

function fixture() {
  const d = newDoc(); d.nodes = [{id:'a',x:0,y:0,label:'A',fields:{rail:'3.3V',pn:'X'}},{id:'b',x:300,y:0,label:'B'}];
  d.wires = [{id:'w',bus:'i2c',from:{node:'a',port:'p'},to:{node:'b',port:'p'}}]; return d;
}
test('movement is separate from rewiring and configuration changes', () => {
  const before = fixture(), after = structuredClone(before);
  after.nodes[0].x = 100; after.nodes[0].fields.rail = '5V'; after.wires[0].to.port = 'q';
  const result = compareBoards(before, after);
  assert.deepEqual(result.counts,{added:0,removed:0,changed:1,rewired:1,moved:1});
  assert.deepEqual(result.changes.find(c=>c.type==='rewired').fields.map(f=>f.field),['to']);
  assert.equal(before.nodes[0].x,0);
});
test('object key order and collection order do not create false differences', () => {
  const a = fixture(), b = structuredClone(a); b.nodes.reverse(); b.nodes[1].fields={pn:'X',rail:'3.3V'};
  assert.equal(compareBoards(a,b).changes.length,0);
});
test('stable IDs preserve rename identity; unrelated IDs become added and removed items', () => {
  const a=fixture(),b=structuredClone(a); b.nodes[0].label='New'; b.nodes[1].id='c';
  const r=compareBoards(a,b); assert.equal(r.counts.changed,1); assert.equal(r.counts.added,1); assert.equal(r.counts.removed,1);
});
test('journey reordering is detected without treating node array order as a change', () => {
  const a=fixture(); a.journey=[{id:'j1',label:'A'},{id:'j2',label:'B'}]; const b=structuredClone(a); b.journey.reverse();
  assert.equal(compareBoards(a,b).changes[0].fields[0].field,'order');
});
test('the journey-order row is labelled in the interface language', () => {
  initI18n({ storage: null });
  const a=fixture(); a.journey=[{id:'j1',label:'A'},{id:'j2',label:'B'}]; const b=structuredClone(a); b.journey.reverse();
  assert.equal(compareBoards(a,b).changes[0].label,'Journey');
  setLang('zh');
  try { assert.equal(compareBoards(a,b).changes[0].label,'导览'); } finally { setLang('en'); }
});
