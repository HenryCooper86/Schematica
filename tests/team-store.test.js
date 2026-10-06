import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,open,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createTeamStore} from '../server/team-store.js';

test('post-rename sync failure blocks mutations already queued, while close drains normal accepted writes',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'schematica-sync-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 let folderSyncs=0;
 const openFile=async(path,...args)=>{
  const handle=await open(path,...args);
  if(path===directory)return {close:()=>handle.close(),sync:async()=>{
   folderSyncs++;
   if(folderSyncs===2)throw Error('Injected final directory fsync failure');
   await handle.sync();
  }};
  return handle;
 };
 const store=await createTeamStore(directory,()=>{},{openFile});
 let secondRan=false;
 const first=store.mutate(state=>{state.projects.push({id:'committed'});return 'first';});
 const second=store.mutate(state=>{secondRan=true;state.projects.push({id:'must-not-commit'});return 'second';});
 const results=await Promise.allSettled([first,second]);
 assert.deepEqual(results.map(result=>result.status),['rejected','rejected']);
 assert.match(results[0].reason.message,/operator attention/);
 assert.match(results[1].reason.message,/operator attention/);
 assert.equal(secondRan,false);
 assert.deepEqual(store.read().projects,[{id:'committed'}]);
 assert.deepEqual(JSON.parse(await readFile(join(directory,'projects.json'),'utf8')).projects,[{id:'committed'}]);
 await store.close();
 const restarted=await createTeamStore(directory);
 const accepted=restarted.mutate(state=>{state.projects.push({id:'drained'});return 'saved';});
 const closing=restarted.close();
 assert.equal(await accepted,'saved');
 await closing;
 assert.deepEqual(JSON.parse(await readFile(join(directory,'projects.json'),'utf8')).projects,[{id:'committed'},{id:'drained'}]);
});
