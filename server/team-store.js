import {mkdir,open,readFile,realpath,rename,stat,unlink,lstat} from 'node:fs/promises';
import {resolve,sep,join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
export const MAX_STORE_BYTES=64*1024*1024;
export function teamError(status,message){return Object.assign(new Error(message),{status});}
export async function privatePath(path,root,{directory=false}={}){
 const candidate=resolve(path),base=await realpath(root);
 if(candidate===base||candidate.startsWith(base+sep))throw Error('Team configuration must be outside the repository.');
 if(directory)await mkdir(candidate,{recursive:true,mode:0o700});
 const actual=await realpath(candidate);
 if(actual===base||actual.startsWith(base+sep))throw Error('Team configuration must be outside the repository.');
 return actual;
}
export async function createTeamStore(directory,validate=()=>{},{openFile=open}={}){
 const lockPath=join(directory,'service.lock');const lock=await open(lockPath,'wx',0o600);
 try{await lock.writeFile(JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}));await lock.sync();}catch(e){await lock.close();await unlink(lockPath);throw e;}
 const file=join(directory,'projects.json');let state={version:1,projects:[]};let queue=Promise.resolve();let pending=0;let closed=false;let persistenceFailed=false;let closing;
 try{if(!(await lstat(file)).isFile())throw Error('Invalid team storage file.');const size=(await stat(file)).size;if(size>MAX_STORE_BYTES)throw Error('Team storage exceeds its limit.');state=JSON.parse(await readFile(file,'utf8'));if(state?.version!==1||!Array.isArray(state.projects))throw Error('Invalid team storage.');validate(state);}catch(e){if(e.code!=='ENOENT'){await lock.close();await unlink(lockPath);throw e;}}
 return {
 read(){return structuredClone(state);},
 mutate(fn){if(closed)return Promise.reject(teamError(503,'Team service is closed.'));if(pending>=32)return Promise.reject(teamError(429,'Team service is busy.'));pending++;const next=queue.then(async()=>{if(persistenceFailed)throw teamError(503,'Team persistence requires operator attention.');const draft=structuredClone(state);const result=await fn(draft);const encoded=JSON.stringify(draft);if(Buffer.byteLength(encoded)>MAX_STORE_BYTES)throw teamError(413,'Team storage capacity reached.');const temporary=join(directory,`.projects-${randomUUID()}.tmp`);let handle;
 try{handle=await open(temporary,'wx',0o600);await handle.writeFile(encoded);await handle.sync();await handle.close();handle=null;const folder=await openFile(directory,'r');try{await folder.sync();await rename(temporary,file);state=draft;try{await folder.sync();}catch{persistenceFailed=true;closed=true;throw teamError(503,'Team persistence requires operator attention.');}}finally{await folder.close();}
 // Rename is the commit point. Directory sync completes durability on supported filesystems.
 return structuredClone(result);
 }finally{await handle?.close();await unlink(temporary).catch(()=>{});}});queue=next.catch(()=>{}).finally(()=>{pending--;});return next;},
 close(){if(closing)return closing;closed=true;closing=(async()=>{await queue;await lock.close();await unlink(lockPath);})();return closing;},
 };
}
