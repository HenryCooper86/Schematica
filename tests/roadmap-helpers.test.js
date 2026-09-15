import test from 'node:test'; import assert from 'node:assert/strict';
import { Store, addNode } from '../src/state.js';
import { createClipboardCommands } from '../src/ui/clipboard-commands.js';
import { buildClip, encodeClip } from '../src/clipboard.js';
import { sceneIndex } from '../src/scene-index.js';
import { encodeThread, decodeThread, trimHistory } from '../src/ai/session.js';

test('pending clipboard reads cannot paste into a replacement board', async () => {
  const store=new Store(),id=addNode(store,'mcu',0,0);const text=encodeClip(buildClip(store.doc,[id]));let resolve;
  const commands=createClipboardCommands({store,canEditNow:()=>true,notify:()=>{},clipboard:()=>({readText:()=>new Promise(r=>{resolve=r;})})});
  const pending=commands.pasteClipboard();store.replaceDoc(new Store().doc);resolve(text);await pending;
  assert.equal(store.doc.nodes.length,0);
});
test('scene index includes each incident wire once and refreshes geometry after edits', () => {
  const store=new Store(),a=addNode(store,'mcu',0,0),b=addNode(store,'temp',300,0);
  store.doc.wires=[{id:'w',from:{node:a},to:{node:b}}];let index=sceneIndex(store.doc);
  assert.equal(index.incident.get(a).length,1);assert.equal(index.incident.get(b).length,1);
  store.doc.nodes[0].x=100;index=sceneIndex(store.doc);assert.equal(index.rects.get(a).x,100);
});
test('persisted assistant sessions omit undo documents and reject malformed history', () => {
  const encoded=encodeThread([{role:'user',content:[{type:'text',text:'hello'}]}],[{role:'assistant',text:'Done',undoSnap:{secret:'board'}}],{input:4,output:-1});
  const restored=decodeThread(encoded);assert.equal(restored.visible[0].undoSnap,undefined);assert.equal(restored.totals.output,0);
  assert.equal(decodeThread('{invalid'),null);assert.equal(decodeThread('{"history":[],"visible":[{}]}'),null);
  const h=[{role:'user',content:[{type:'text',text:'start'}]},{role:'assistant',content:[{type:'tool_use'}]},{role:'user',content:[{type:'tool_result'}]},{role:'user',content:[{type:'text',text:'next'}]}];
  assert.deepEqual(trimHistory(h,2),[h[3]]);
});
