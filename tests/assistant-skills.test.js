import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBlueprint } from '../src/blueprint.js';
import { selectSkills } from '../src/ai/skills.js';
import { perRequestSystem } from '../src/ai/prompt.js';
import { applyEdits } from '../src/ai/ops.js';
import { boardText } from '../src/ai/context.js';
import { createExecutor } from '../src/ai/tools.js';
import { runSingleShot, runRequest } from '../src/ai/agent.js';
import { newDoc, Store } from '../src/state.js';
import { serialize, deserialize } from '../src/serialize.js';
import { createEditPreview } from '../src/ai/preview.js';

const blueprint = { goal: 'Monitor room temperature', audience: 'Engineers', components: ['MCU', 'Sensor'], assumptions: ['Power sizing unverified'] };
const ops = [
  { op: 'set_blueprint', blueprint },
  { op: 'add_part', ref: 'mcu', kind: 'mcu' },
  { op: 'set_presentation', chapters: [{ label: 'Overview', caption: 'The controller', stops: [{ node: 'mcu', caption: 'Read the sensor' }] }] },
];
test('Blueprint validates bounded reference data and survives save/load', () => {
  const doc = newDoc();
  doc.blueprint = validateBlueprint(blueprint);
  assert.deepEqual(deserialize(serialize(doc)).doc.blueprint, doc.blueprint);
  assert.throws(() => validateBlueprint({goal: ''}));
  assert.throws(() => validateBlueprint({goal:'x', components: [null]}));
  assert.throws(() => validateBlueprint({goal:'x', execute:'bad'}));
  assert.throws(() => validateBlueprint({goal:'x', components: Array(51).fill('x')}));
  assert.throws(() => validateBlueprint({goal:'x', components: Array(20).fill('x'.repeat(2000))}));
  const imported = deserialize(JSON.stringify({...doc, blueprint:{goal:42}}));
  assert.equal(imported.doc.blueprint, undefined);
  assert.match(imported.warnings.join(' '), /Blueprint/);
});
test('automatic and explicit skills work in English and Chinese without loading everything', () => {
  assert.deepEqual(selectSkills('Create a presentation').map(s=>s.id), ['presentation']);
  assert.deepEqual(selectSkills('创建蓝图').map(s=>s.id), ['blueprint']);
  assert.deepEqual(selectSkills('hello', 'review').map(s=>s.id), ['review']);
  assert.deepEqual(selectSkills('hello'), []);
  const prompt = perRequestSystem({ date:'2026-09-21', effort:'low', userText:'simplify diagram' });
  assert.match(prompt, /Skill: Diagram simplification/);
  assert.doesNotMatch(prompt, /Skill: Presentation storytelling/);
});
test('Blueprint and story operations share atomic refs and rollback on invalid links', () => {
  const doc = newDoc();
  assert.equal(applyEdits(doc, [...ops, {op:'set_presentation',chapters:[{label:'Bad',stops:[{node:'absent'}]}]}]).ok, false);
  assert.deepEqual(doc, newDoc());
  assert.equal(applyEdits(doc, ops).ok, true);
  assert.equal(doc.journey[0].stops[0].node, doc.nodes[0].id);
  assert.deepEqual(deserialize(serialize(doc)).doc.journey, doc.journey);
  assert.match(boardText(doc), /Monitor room temperature/);
  assert.match(boardText(doc), /Read the sensor/);
});
test('story revision preserves chapter and stop identities and rejects duplicates/unknown IDs', () => {
  const doc = newDoc(); applyEdits(doc, ops);
  const chapter = structuredClone(doc.journey[0]);
  chapter.label = 'Revised';
  assert.equal(applyEdits(doc,[{op:'set_presentation',chapters:[chapter]}]).ok,true);
  assert.equal(doc.journey[0].id,chapter.id);
  assert.equal(doc.journey[0].stops[0].id,chapter.stops[0].id);
  for (const chapters of [[chapter,chapter],[{...chapter,id:'made-up'}],[{...chapter,stops:[...chapter.stops,...chapter.stops]}],[{label:'Empty',stops:[]}]]) {
    const before = serialize(doc);
    assert.equal(applyEdits(doc,[{op:'set_presentation',chapters}]).ok,false);
    assert.equal(serialize(doc),before);
  }
});
test('preview isolates Blueprint/story edits, reports them, applies with undo and rejects stale state', () => {
  const store = new Store(newDoc());
  const preview = createEditPreview(store);
  const executor = createExecutor({getDoc:()=>preview.draft.doc,commit:fn=>preview.draft.apply(fn)});
  assert.equal(executor.run('apply_edits',{ops}).isError,false);
  assert.equal(store.doc.blueprint,undefined);
  assert.ok(preview.summary().comparison.changes.some(c=>c.fields?.some(f=>f.field==='blueprint')));
  assert.ok(preview.summary().comparison.changes.some(c=>c.collection==='journey'));
  preview.apply();
  assert.equal(store.doc.journey.length,1);
  store.undo();
  assert.equal(store.doc.blueprint,undefined);
  assert.equal(store.doc.journey.length,0);
  const stale = createEditPreview(store);
  store.apply(doc=>{doc.title='New';});
  assert.throws(()=>stale.apply(), /board changed/);
});
test('skill tool is read-only and both provider paths can apply new operations', async () => {
  for (const singleShot of [false,true]) {
    const store = new Store(newDoc());
    const executor = createExecutor({getDoc:()=>store.doc,commit:fn=>store.mutate(fn)});
    assert.match(executor.run('read_skill',{skill:'review'}).text,/read-only/);
    assert.equal(executor.run('read_skill',{skill:'unknown'}).isError,true);
    let n=0;
    const provider = {chat:async()=>singleShot ? {text:JSON.stringify({summary:'Created',ops}),stop:'end'} : n++ === 0
      ? {stop:'tool_use',toolCalls:[{id:'call',name:'apply_edits',input:{ops}}]}
      : {stop:'end',text:'Created'}};
    const result = await (singleShot ? runSingleShot : runRequest)({provider,executor,store,system:[],userText:'Create',boardText:''});
    assert.equal(result.error,undefined);
    assert.equal(result.applied,1);
    assert.equal(store.doc.journey.length,1);
    store.undo(); assert.equal(store.doc.blueprint,undefined);
  }
});

test('Blueprint and presentation survive share-link encoding and validated import', async () => {
  const { encodeShare, decodeShare } = await import('../src/share.js');
  const doc = newDoc(); applyEdits(doc, ops);
  const roundTrip = deserialize(await decodeShare(await encodeShare(doc)));
  assert.deepEqual(roundTrip.doc.blueprint, doc.blueprint);
  assert.deepEqual(roundTrip.doc.journey, doc.journey);
});
test('revisions preserve omitted captions, legacy cameras and target-only chapters', () => {
  const doc = newDoc(); applyEdits(doc, ops);
  const chapter = doc.journey[0];
  const oldCaption = chapter.caption, stopCaption = chapter.stops[0].caption;
  const oldId = chapter.id, stopId = chapter.stops[0].id;
  assert.equal(applyEdits(doc, [{ op:'set_presentation', chapters:[{
    id:oldId, label:'Updated', stops:[{id:stopId,node:doc.nodes[0].id}],
  }]}]).ok, true);
  assert.equal(doc.journey[0].caption, oldCaption);
  assert.equal(doc.journey[0].stops[0].caption, stopCaption);
  assert.equal(applyEdits(doc,[{op:'set_presentation',chapters:[{label:'Overview',stops:[],targets:{nodes:[doc.nodes[0].id]}}]}]).ok,true);
  const legacy = {...doc.journey[0], view:{cx:200,cy:300,zoom:0.7}};
  delete legacy.targets;
  doc.journey = [legacy];
  assert.equal(applyEdits(doc,[{op:'set_presentation',chapters:[legacy]}]).ok,true);
  assert.deepEqual(doc.journey[0].view,legacy.view);
});
test('story limits and malformed cameras/targets reject the complete batch', () => {
  const doc = newDoc(); applyEdits(doc, ops);
  const chapter = {label:'Test',stops:[{node:doc.nodes[0].id}]};
  for (const chapters of [Array(51).fill(chapter),[{...chapter,stops:Array(101).fill(chapter.stops[0])}],
    [{...chapter,view:{cx:0,cy:0,zoom:Infinity}}],[{...chapter,targets:{wires:['missing']}}],
    [{...chapter,caption:'x'.repeat(4001)}]]) {
    const before = serialize(doc);
    assert.equal(applyEdits(doc,[{op:'set_blueprint',blueprint:{goal:'Should roll back'}},{op:'set_presentation',chapters}]).ok,false);
    assert.equal(serialize(doc),before);
  }
});
