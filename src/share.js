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

// The largest a decoded board may be. Real boards are tens of kilobytes; the
// cap exists because a few kilobytes of deflated zeros inflate to gigabytes.
export const MAX_SHARE_BYTES = 16 * 1024 * 1024;

const TOO_LARGE = 'This share link is too large to open.';

// Drains a stream into one buffer, giving up as soon as the cap is passed so
// a decompression bomb never gets to allocate its full size.
async function readCapped(stream, max) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new Error(TOO_LARGE);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function decodeShare(fragment) {
  const m = /^#?([dj])=([A-Za-z0-9_-]+)$/.exec(fragment);
  if (!m) throw new Error('Not a Schematica share link.');
  const bytes = fromBase64Url(m[2]);
  if (bytes.byteLength > MAX_SHARE_BYTES) throw new Error(TOO_LARGE);
  if (m[1] === 'j') return new TextDecoder().decode(bytes);
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser cannot decode compressed share links.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(await readCapped(stream, MAX_SHARE_BYTES));
}
