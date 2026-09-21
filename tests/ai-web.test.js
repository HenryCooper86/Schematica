import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebReader, urlsInMessage, WEB_TEXT_LIMIT } from '../src/ai/web.js';
import { linkedText } from '../src/ui/linked-text.js';
import { newDoc, Store } from '../src/state.js';
import { createExecutor } from '../src/ai/tools.js';
import { runRequest, runSingleShot } from '../src/ai/agent.js';
import { perRequestSystem } from '../src/ai/prompt.js';
const source={url:'https://example.com/docs',contentType:'text/plain',encoding:'text',content:'SOURCE_MARKER power=3.3V',fetchedAt:'2026-09-21T00:00:00Z'};

test('source reader returns provenance, uses no provider secrets, caches and caps sources',async()=>{
  const seen=[];
  const read=createWebReader({backend:true,fetchImpl:async(url,options)=>{seen.push({url,options});return Response.json(source);}});
  const result=await read(source.url);
  assert.equal(result.isError,false); assert.equal(JSON.parse(result.text).text,source.content);
  assert.equal(JSON.parse(result.text).partial,false);
  assert.equal(seen[0].url,'/api/web');
  assert.deepEqual(JSON.parse(seen[0].options.body),{url:source.url});
  assert.equal(seen[0].options.headers.authorization,undefined);
  assert.equal((await read(source.url)).text,result.text); assert.equal(seen.length,1);
  for(let i=0;i<3;i++) assert.equal((await read(source.url+'?q='+i)).isError,false);
  assert.equal((await read(source.url+'?last')).isError,true); assert.equal(seen.length,4);
  assert.ok(!result.historyText.includes('SOURCE_MARKER'));
});
test('static edition and upstream failures give actionable errors',async()=>{
  assert.match((await createWebReader({backend:false})(source.url)).text,/Node-backed/);
  const read=createWebReader({backend:true,fetchImpl:async()=>Response.json({error:{message:'Source returned HTTP 403'}},{status:502})});
  assert.match((await read(source.url)).text,/HTTP 403/);
  assert.match(perRequestSystem({webAccess:false}),/unavailable on this static site/);
  assert.match(perRequestSystem({webAccess:true}),/available through read_url/);
});
test('long extracted text is marked partial and PDFs use the parser with cancellation',async()=>{
  const controller=new AbortController();let parserSignal;
  const read=createWebReader({backend:true,fetchImpl:async()=>Response.json({...source,encoding:'base64',content:'JVBERg=='}),
    parsePdf:async(bytes,signal)=>{assert.equal(bytes,'JVBERg==');parserSignal=signal;return {text:'x'.repeat(WEB_TEXT_LIMIT+10),warnings:['First 100 pages only']};}});
  const result=JSON.parse((await read(source.url,{signal:controller.signal})).text);
  assert.equal(result.partial,true); assert.equal(result.text.length,WEB_TEXT_LIMIT); assert.ok(parserSignal);
  controller.abort(); await assert.rejects(read(source.url,{signal:controller.signal}));
});
test('message URL extraction and source links keep HTML inert',()=>{
  assert.deepEqual(urlsInMessage('Read [spec](https://example.com/a(b)) and https://example.com/a(b).'),['https://example.com/a(b)']);
  const html=linkedText('<img onerror=x> Source: https://example.com/a?x=1&y=2. javascript:alert(1)');
  assert.match(html,/&lt;img/); assert.match(html,/href="https:\/\/example.com\/a\?x=1&amp;y=2"/);
  assert.ok(!html.includes('<img')); assert.ok(!linkedText('https://user:pass@example.com').includes('<a'));
});
test('async tool results reach the next round but raw web text stays out of saved history',async()=>{
  const seen=[]; let rounds=0;
  const store=new Store(newDoc());
  const read=createWebReader({backend:true,fetchImpl:async()=>Response.json(source)});
  const executor=createExecutor({getDoc:()=>store.doc,commit:fn=>store.mutate(fn),readUrl:read});
  const provider={chat:async({messages})=>{seen.push(structuredClone(messages));return rounds++===0 ? {stop:'tool_use',toolCalls:[{id:'web',name:'read_url',input:{url:source.url}}]} : {stop:'end',text:'Read the linked source.'};}};
  const result=await runRequest({provider,executor,store,system:[],userText:'Read '+source.url,boardText:''});
  assert.equal(result.error,undefined);assert.ok(JSON.stringify(seen[1]).includes('SOURCE_MARKER'));
  assert.ok(!JSON.stringify(result.messages).includes('SOURCE_MARKER'));
  assert.ok(JSON.stringify(result.messages).includes('Source text omitted'));
  assert.equal(store.undoStack.length,0);
});
test('single-shot provider receives supplied URLs before generation without retaining source payload',async()=>{
  let request;
  const executor=createExecutor({getDoc:()=>newDoc(),commit:()=>{},readUrl:createWebReader({backend:true,fetchImpl:async()=>Response.json(source)})});
  const result=await runSingleShot({executor,provider:{chat:async input=>{request=input;return {stop:'end',text:'{"summary":"Read","ops":[]}'};}},system:[],userText:'Use '+source.url,boardText:''});
  assert.equal(result.error,undefined);
  assert.ok(JSON.stringify(request.messages).includes('SOURCE_MARKER'));
  assert.ok(!JSON.stringify(result.messages).includes('SOURCE_MARKER'));
});
test('Stop during URL reading prevents subsequent edit calls in the same reply',async()=>{
  const controller=new AbortController(),store=new Store(newDoc());
  const executor=createExecutor({getDoc:()=>store.doc,commit:fn=>store.mutate(fn),readUrl:async()=>{controller.abort();return {text:'Late data'};}});
  const provider={chat:async()=>({stop:'tool_use',toolCalls:[{id:'url',name:'read_url',input:{url:source.url}},{id:'edit',name:'apply_edits',input:{ops:[{op:'set_title',title:'Should not apply'}]}}]})};
  const result=await runRequest({provider,executor,store,signal:controller.signal,system:[],userText:'read',boardText:''});
  assert.equal(result.stop,'aborted');assert.equal(store.doc.title,newDoc().title);assert.equal(store.undoStack.length,0);
});
