import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createTeamClient} from '../src/team-client.js';
import {reviewSnapshot} from '../src/review-snapshot.js';
import {newDoc} from '../src/state.js';

test('snapshot identity is key-order independent and rejects repaired boards',()=>{
 const a=newDoc('Snapshot'),b=Object.fromEntries(Object.entries(a).reverse());
 assert.equal(reviewSnapshot(a).canonical,reviewSnapshot(b).canonical);
 b.title='Different';assert.notEqual(reviewSnapshot(a).canonical,reviewSnapshot(b).canonical);
 a.nodes.push({id:'broken',x:NaN,y:0});assert.throws(()=>reviewSnapshot(a));
});
test('client keeps credentials out of URLs/bodies and disconnect rejects an in-flight session',async()=>{
 let release,seen;
 const server=createServer(async(req,res)=>{
  seen={url:req.url,authorization:req.headers.authorization,client:req.headers['x-schematica-client']};
  if(req.url.endsWith('/slow'))await new Promise(r=>release=r);
  res.setHeader('content-type','application/json');res.end(JSON.stringify({user:{id:'editor',name:'Editor'}}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const client=createTeamClient({baseUrl:`http://127.0.0.1:${server.address().port}/api/team`});
  client.setToken('private-test-token');await client.request('/me');
  assert.deepEqual(seen,{url:'/api/team/me',authorization:'Bearer private-test-token',client:'1'});
  const pending=client.request('/slow');const rejected=assert.rejects(pending);
  while(!release)await new Promise(r=>setTimeout(r,1));
  client.disconnect();release();await rejected;
  assert.equal(client.connected,false);
  await assert.rejects(client.request('/me'),/Connect/);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('failed mutation exposes conflict status without a silent retry',async()=>{
 let calls=0;const server=createServer((req,res)=>{calls++;res.writeHead(409,{'content-type':'application/json'});res.end('{"error":{"message":"Refresh before retrying."}}');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const client=createTeamClient({baseUrl:`http://127.0.0.1:${server.address().port}/api/team`});client.setToken('test');
 await assert.rejects(client.request('/projects/p/revisions',{version:1}),e=>e.status===409&&e.message==='Refresh before retrying.');assert.equal(calls,1);
 }finally{await new Promise(r=>server.close(r));}
});
