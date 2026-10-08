import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLayout, curveIntersectsRect } from '../src/layout-checks.js';
import { newDoc } from '../src/state.js';
import { createExecutor } from '../src/ai/tools.js';
const node=(id,x,y)=>({id,kind:'mcu',label:id,x,y});
const wire=(id,a,b)=>({id,bus:'i2c',from:{node:a,port:'i2c'},to:{node:b,port:'i2c'}});
test('node overlap reports measured geometry without changing the document',()=>{
  const doc=newDoc();doc.nodes=[node('a',0,0),node('b',50,0)];const before=JSON.stringify(doc);
  const findings=checkLayout(doc);assert.equal(findings[0].rule,'layout/node-overlap');assert.ok(findings[0].evidence.width>0);assert.equal(JSON.stringify(doc),before);
});
test('checks evaluate the visible detour and relocated label',()=>{
  const doc=newDoc();doc.nodes=[node('a',0,0),node('b',600,0),node('c',300,0)];doc.wires=[wire('w','a','b')];
  assert.deepEqual(checkLayout(doc),[]);
});
test('checks still report a card enclosing an endpoint when routing cannot clear it',()=>{
  const doc=newDoc();doc.nodes=[node('a',0,0),node('b',600,0),{...node('c',-60,-20),label:'x'.repeat(40),sublabel:'a',addr:'b',rail:'c'}];doc.wires=[wire('w','a','b')];
  const f=checkLayout(doc);assert.ok(f.some(f=>f.rule==='layout/wire-through-node'&&f.ids.includes('c')));
  assert.ok(f.some(f=>f.rule==='layout/node-overlap'));
});
test('cubic intersection respects curved paths instead of a straight endpoint chord',()=>{
  const geo={p1:{x:0,y:0},c1:{x:0,y:200},c2:{x:200,y:200},p2:{x:200,y:0}};
  assert.equal(curveIntersectsRect(geo,{x:90,y:-5,w:20,h:20}),false);
  assert.equal(curveIntersectsRect(geo,{x:90,y:140,w:20,h:20}),true);
});
test('layout checks are separately available to the assistant and bounded',()=>{
  const doc=newDoc();doc.nodes=Array.from({length:30},(_,i)=>node(String(i),0,0));
  assert.equal(checkLayout(doc).length,200);
  const tool=createExecutor({getDoc:()=>doc,commit:()=>{}});
  const res=JSON.parse(tool.run('run_checks',{include_layout:true}).text);
  assert.equal(res.layout.length,200);assert.ok(res.layout[0].evidence);assert.ok(Array.isArray(res.design));
});
