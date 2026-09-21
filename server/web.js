import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export const WEB_MAX_BYTES = 2 * 1024 * 1024;
export const WEB_TIMEOUT_MS = 15000;
const denied = new BlockList();
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) denied.addSubnet(address,prefix,'ipv4');
for (const [address, prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]]) denied.addSubnet(address,prefix,'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::',3,'ipv6');
export const webError = (status, message) => Object.assign(new Error(message), { status, code:'schematica_web' });
export function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !denied.check(address,'ipv4');
  // Reject local, mapped IPv4, NAT64 and transition ranges rather than guessing
  // the ultimate endpoint of a translated address.
  return family === 6 && globalV6.check(address,'ipv6') && !denied.check(address,'ipv6');
}
export function publicUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) throw webError(400,'Use a public HTTP(S) URL of at most 4096 characters.');
  let url;
  try { url = new URL(value); } catch { throw webError(400,'Invalid source URL.'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.port) throw webError(400,'Source URLs must use HTTP(S), standard ports, and no embedded credentials.');
  const host = url.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'');
  if (isIP(host) ? !isPublicAddress(host) : !host.includes('.') || /\.(?:localhost|local|internal|lan|home)\.?$/i.test(host)) throw webError(403,'Only public internet sources can be read.');
  url.hash = '';
  return url;
}
function abortable(promise, signal) {
  signal.throwIfAborted();
  return new Promise((resolve,reject) => {
    const aborted = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener('abort',aborted);
    signal.addEventListener('abort',aborted,{once:true});
    Promise.resolve(promise).then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
  });
}

// Resolve and validate every address, then pin this exact connection. The URL's
// hostname remains intact for HTTP Host and TLS certificate/SNI verification.
export function requestPage(url, address, { signal, maxBytes = WEB_MAX_BYTES, requestImpl } = {}) {
  return new Promise((resolve,reject) => {
    const request = requestImpl || (url.protocol === 'https:' ? httpsRequest : httpRequest);
    const req = request(url, {
      method:'GET', agent:false, signal, family:address.family, autoSelectFamily:false,
      lookup: (_host, options, callback) => options.all
        ? callback(null,[address]) : callback(null,address.address,address.family),
      headers:{ accept:'text/html, text/plain, text/markdown, application/json, application/pdf;q=0.9',
        'accept-encoding':'identity', 'user-agent':'Schematica-SourceReader/1.0' },
    }, res => {
      const status = res.statusCode;
      if ([301,302,303,307,308].includes(status)) {
        const location = res.headers.location;
        res.destroy(); resolve({status,location}); return;
      }
      if (status < 200 || status >= 300) { res.destroy(); reject(webError(502,`Source returned HTTP ${status}. It may require login or block automated readers.`)); return; }
      const contentType = String(res.headers['content-type'] || '').toLowerCase();
      const mime = contentType.split(';')[0].trim();
      if (!['text/html','application/xhtml+xml','text/plain','text/markdown','text/x-markdown','text/csv','application/json','application/pdf','application/xml','text/xml'].includes(mime)) {
        res.destroy(); reject(webError(415,'Unsupported source type. Use an HTML page, text, JSON, XML, or a PDF.')); return;
      }
      if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') {
        res.destroy(); reject(webError(415,'The source ignored the uncompressed-content request. Download and attach the document instead.')); return;
      }
      if (Number(res.headers['content-length']) > maxBytes) { res.destroy(); reject(webError(413,'Source exceeds the 2 MiB download limit. Download and attach it instead.')); return; }
      let length=0; const chunks=[];
      res.on('error',reject);
      res.on('aborted',()=>reject(webError(502,'Source download was interrupted.')));
      res.on('data',chunk=>{
        length+=chunk.length;
        if(length>maxBytes){ reject(webError(413,'Source exceeds the 2 MiB download limit. Download and attach it instead.')); res.destroy(); return; }
        chunks.push(chunk);
      });
      res.on('end',()=>resolve({status,contentType,mime,bytes:Buffer.concat(chunks)}));
    });
    req.on('error',reject);
    req.end();
  });
}
export async function fetchPublicSource(value, {signal, lookupImpl=lookup, requestImpl=requestPage, timeoutMs=WEB_TIMEOUT_MS}={}) {
  const timeout=AbortSignal.timeout(timeoutMs);
  const combined=signal ? AbortSignal.any([signal,timeout]) : timeout;
  let url=publicUrl(value);
  try {
    for(let redirect=0;redirect<=3;redirect++) {
      combined.throwIfAborted();
      const host=url.hostname.replace(/^\[|\]$/g,'');
      const addresses=isIP(host) ? [{address:host,family:isIP(host)}]
        : await abortable(lookupImpl(host,{all:true,verbatim:true}),combined);
      if(!addresses.length || addresses.some(a=>!isPublicAddress(a.address))) throw webError(403,'The source resolves to a private or reserved address. Only public internet sources can be read.');
      combined.throwIfAborted();
      const page=await abortable(requestImpl(url,addresses[0],{signal:combined}),combined);
      if(page.status>=300 && page.status<400) {
        if(redirect===3 || !page.location) throw webError(502,'Source redirected too many times or supplied no destination.');
        url=publicUrl(new URL(page.location,url).href); continue;
      }
      return {url:url.href,contentType:page.contentType,encoding:page.mime==='application/pdf' ? 'base64' : 'text',
        content:page.mime==='application/pdf' ? page.bytes.toString('base64') : decodeText(page.bytes,page.contentType),
        bytes:page.bytes.length,fetchedAt:new Date().toISOString()};
    }
  } catch(error) {
    if(signal?.aborted) throw signal.reason;
    if(timeout.aborted) throw webError(504,'Source request timed out after 15 seconds.');
    if(error.status) throw error;
    throw webError(502,'Could not read this public source. Check the URL, or download and attach the document.');
  }
}
function decodeText(bytes,type) {
  const charset=/charset\s*=\s*["']?([^\s;"']+)/i.exec(type)?.[1] || 'utf-8';
  try { return new TextDecoder(charset).decode(bytes); }
  catch { throw webError(415,'Unsupported source text encoding. Download and attach a UTF-8 copy.'); }
}
