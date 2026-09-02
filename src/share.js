// Share links: the whole document deflated into a URL fragment. Zero dependencies.
// Fragment schemes: "d=<base64url deflate-raw>" (compressed) or "j=<base64url>" (raw fallback).

function toBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function encodeShare(doc) {
  const input = new TextEncoder().encode(JSON.stringify(doc));
  if (typeof CompressionStream === 'function') {
    const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    return `d=${toBase64Url(bytes)}`;
  }
  return `j=${toBase64Url(input)}`;
}

export async function decodeShare(fragment) {
  const m = /^#?([dj])=([A-Za-z0-9_-]+)$/.exec(fragment);
  if (!m) throw new Error('Not a Schematica share link.');
  const bytes = fromBase64Url(m[2]);
  if (m[1] === 'j') return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}
