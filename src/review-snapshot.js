import {deserialize} from './serialize.js';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
// Same normalized content on both sides of the optional shared-review boundary.
export function reviewSnapshot(input){
 const encoded=JSON.stringify(input);
 if(new TextEncoder().encode(encoded).length>16*1024*1024)throw Error('Board file exceeds 16 MiB.');
 const {doc:board,warnings}=deserialize(encoded);
 if(warnings.length)throw Error('Repair the board before publishing a shared revision.');
 return {board,canonical:JSON.stringify(canonical(board))};
}
export async function reviewHash(input){
 const {canonical}=reviewSnapshot(input);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
 return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
