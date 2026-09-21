import { escAttr } from './press.js';
// Preserve plain-text replies while making cited HTTP(S) sources usable.
export function linkedText(value) {
  const text=String(value ?? '');
  let result='', offset=0;
  for(const match of text.matchAll(/https?:\/\/[^\s<>"`]+/gi)) {
    let url=match[0].replace(/[.,;!?:]+$/g,'');
    while(url.endsWith(')') && (url.match(/\)/g)||[]).length>(url.match(/\(/g)||[]).length) url=url.slice(0,-1);
    let valid=false;
    try { const parsed=new URL(url); valid=!parsed.username && !parsed.password; } catch { /* plain text */ }
    result+=escAttr(text.slice(offset,match.index));
    result+=valid ? `<a href="${escAttr(url)}" target="_blank" rel="noopener noreferrer">${escAttr(url)}</a>${escAttr(match[0].slice(url.length))}` : escAttr(match[0]);
    offset=match.index+match[0].length;
  }
  return result+escAttr(text.slice(offset));
}
