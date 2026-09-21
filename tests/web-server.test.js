import test from 'node:test';
import assert from 'node:assert/strict';
import { once, EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createAppServer } from '../server/index.js';
import { fetchPublicSource, isPublicAddress, publicUrl, requestPage } from '../server/web.js';

const publicDNS=async()=>[{address:'93.184.215.14',family:4}];
const page=()=>({status:200,mime:'text/plain',contentType:'text/plain; charset=utf-8',bytes:Buffer.from('Readable source')});
test('URL policy blocks local, special-use, mapped and nonstandard destinations',()=>{
  for(const address of ['127.0.0.1','10.0.0.2','100.100.100.200','169.254.169.254','172.16.0.1','192.168.1.1','0.0.0.0','198.18.0.1','224.0.0.1','255.255.255.255','::1','::','::ffff:8.8.8.8','64:ff9b::808:808','fc00::1','fe80::1','2002:7f00:1::','2001:db8::1']) assert.equal(isPublicAddress(address),false,address);
  for(const address of ['8.8.8.8','93.184.215.14','2606:4700:4700::1111']) assert.equal(isPublicAddress(address),true,address);
  for(const url of ['file:///etc/passwd','ftp://example.com','http://127.1','http://2130706433','http://0x7f000001','http://[::1]','https://user:pass@example.com','https://example.com:444','http://localhost.','http://metadata.internal']) assert.throws(()=>publicUrl(url),undefined,url);
  assert.equal(publicUrl('https://example.com:443/path?q=one#section').href,'https://example.com/path?q=one');
});
test('resolves, pins and revalidates every redirect without forwarding credentials',async()=>{
  const hosts=[], requests=[];
  const result=await fetchPublicSource('https://example.com/start',{
    lookupImpl:async host=>{hosts.push(host);return publicDNS();},
    requestImpl:async(url,address,options)=>{requests.push({url:url.href,address,options});return requests.length===1 ? {status:302,location:'https://docs.example.com/page'} : page();},
  });
  assert.deepEqual(hosts,['example.com','docs.example.com']);
  assert.equal(result.url,'https://docs.example.com/page');
  assert.equal(result.content,'Readable source');
  assert.equal(requests[1].address.address,'93.184.215.14');
  assert.ok(result.fetchedAt);
  await assert.rejects(fetchPublicSource('https://example.com',{lookupImpl:publicDNS,requestImpl:async()=>({status:302,location:'http://169.254.169.254/latest/meta-data/'})}),/public internet/);
  let calls=0;
  await assert.rejects(fetchPublicSource('https://example.com',{lookupImpl:async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}],requestImpl:async()=>{calls++;return page();}}),/private or reserved/);
  assert.equal(calls,0);
});
test('DNS rebinding and redirect cycles never open a private connection',async()=>{
  let lookups=0, requests=0;
  await assert.rejects(fetchPublicSource('https://example.com',{lookupImpl:async()=>[{address:lookups++ ? '127.0.0.1':'8.8.8.8',family:4}],requestImpl:async()=>{requests++;return {status:302,location:'/next'};}}),/private or reserved/);
  assert.equal(requests,1);
  requests=0;
  await assert.rejects(fetchPublicSource('https://example.com',{lookupImpl:publicDNS,requestImpl:async()=>{requests++;return {status:302,location:'/again'};}}),/too many/);
  assert.equal(requests,4);
});
test('cancellation and deadline cover DNS resolution before connecting',async()=>{
  const controller=new AbortController(); let requests=0;
  const pending=fetchPublicSource('https://example.com',{signal:controller.signal,lookupImpl:()=>new Promise(()=>{}),requestImpl:async()=>{requests++;return page();}});
  controller.abort(); await assert.rejects(pending); assert.equal(requests,0);
  // Keep the event loop alive while the unref'ed AbortSignal deadline fires.
  const keep=setTimeout(()=>{},1000);
  try { await assert.rejects(fetchPublicSource('https://example.com',{timeoutMs:5,lookupImpl:()=>new Promise(()=>{})}),/timed out/); }
  finally { clearTimeout(keep); }
});
function mockRequest({body='hello',headers={'content-type':'text/plain'},status=200,onOptions=()=>{}}={}) {
  return (url,options,callback)=>{
    onOptions(url,options);
    const req=new EventEmitter();
    req.end=()=>queueMicrotask(()=>{
      const res=new PassThrough(); res.statusCode=status; res.headers=headers;
      callback(res); if(!res.destroyed) res.end(Buffer.from(body));
    });
    return req;
  };
}
test('HTTP transport pins lookup and bounds streamed content/type/size',async()=>{
  let options;
  const result=await requestPage(new URL('https://example.com'),{address:'8.8.8.8',family:4},{requestImpl:mockRequest({onOptions:(_url,o)=>{options=o;}})});
  assert.equal(result.bytes.toString(),'hello');
  assert.equal(options.agent,false); assert.equal(options.family,4);
  assert.deepEqual(Object.keys(options.headers).sort(),['accept','accept-encoding','user-agent']);
  options.lookup('example.com',{},(error,ip,family)=>{assert.equal(error,null);assert.equal(ip,'8.8.8.8');assert.equal(family,4);});
  options.lookup('example.com',{all:true},(error,addresses)=>{assert.equal(error,null);assert.deepEqual(addresses,[{address:'8.8.8.8',family:4}]);});
  for(const fixture of [{body:'x'.repeat(11)},{headers:{'content-type':'image/png'}},{headers:{'content-type':'text/plain','content-length':'100'}},{status:401}]) {
    await assert.rejects(requestPage(new URL('https://example.com'),{address:'8.8.8.8',family:4},{maxBytes:10,requestImpl:mockRequest(fixture)}));
  }
});
test('PDF bytes are encoded for the existing browser parser',async()=>{
  const result=await fetchPublicSource('https://example.com/manual.pdf',{lookupImpl:publicDNS,requestImpl:async()=>({status:200,mime:'application/pdf',contentType:'application/pdf',bytes:Buffer.from('%PDF-1.4')})});
  assert.equal(result.encoding,'base64'); assert.equal(Buffer.from(result.content,'base64').toString(),'%PDF-1.4');
});
test('web endpoint enforces origin/method/size and forwards only the URL',async t=>{
  let seen;
  const server=createAppServer({webFetch:async(url,options)=>{seen={url,options};return {url,content:'source',contentType:'text/plain',encoding:'text'};}});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const read=(body,extra={})=>fetch(origin+'/api/web',{method:'POST',headers:{'content-type':'application/json','x-schematica-client':'1',origin,...extra},body:JSON.stringify(body)});
  const response=await read({url:'https://example.com'},{authorization:'Bearer private-key',cookie:'session=private'});
  assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(Object.keys(seen.options),['signal']);
  assert.equal(seen.url,'https://example.com');
  assert.equal((await read({url:'https://example.com'},{origin:'https://evil.example'})).status,403);
  assert.equal((await read({url:'https://example.com'},{'x-schematica-client':'0'})).status,403);
  assert.equal((await read({url:'https://example.com',headers:{cookie:'x'}})).status,400);
  assert.equal((await read({url:'x'.repeat(9000)})).status,413);
  assert.equal((await fetch(origin+'/api/web')).status,405);
});
