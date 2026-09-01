import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeGIF, medianCut } from '../src/gif.js';

// ---- Spec-faithful GIF structure walker + LZW decoder (test-side referee) ----

function parseGIF(bytes) {
  assert.equal(String.fromCharCode(...bytes.slice(0, 6)), 'GIF89a');
  let pos = 6;
  const width = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
  const height = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
  const packed = bytes[pos]; pos += 3; // packed, bg index, aspect
  assert.ok(packed & 0x80, 'global color table flag must be set');
  const gctBits = (packed & 0x07) + 1;
  const gctSize = 1 << gctBits;
  const gct = [];
  for (let i = 0; i < gctSize; i++) {
    gct.push([bytes[pos], bytes[pos + 1], bytes[pos + 2]]);
    pos += 3;
  }
  const frames = [];
  let hasNetscape = false;
  let delay = 0;
  while (pos < bytes.length) {
    const b = bytes[pos++];
    if (b === 0x3B) {
      return { width, height, gct, gctBits, frames, hasNetscape };
    }
    if (b === 0x21) {
      const label = bytes[pos++];
      if (label === 0xFF) {
        const len = bytes[pos];
        const app = String.fromCharCode(...bytes.slice(pos + 1, pos + 1 + len));
        if (app === 'NETSCAPE2.0') hasNetscape = true;
        pos += 1 + len;
        while (bytes[pos] !== 0) pos += bytes[pos] + 1;
        pos++;
      } else if (label === 0xF9) {
        const len = bytes[pos];
        delay = bytes[pos + 2] | (bytes[pos + 3] << 8);
        pos += 1 + len;
        assert.equal(bytes[pos], 0, 'GCE terminator');
        pos++;
      } else {
        while (bytes[pos] !== 0) pos += bytes[pos] + 1;
        pos++;
      }
    } else if (b === 0x2C) {
      pos += 8; // left, top, width, height
      const ipacked = bytes[pos++];
      assert.equal(ipacked & 0x80, 0, 'no local color table expected');
      const minCodeSize = bytes[pos++];
      const data = [];
      while (bytes[pos] !== 0) {
        const n = bytes[pos++];
        for (let i = 0; i < n; i++) data.push(bytes[pos++]);
      }
      pos++;
      frames.push({ minCodeSize, data: Uint8Array.from(data), delay });
    } else {
      throw new Error(`unexpected block 0x${b.toString(16)} at ${pos - 1}`);
    }
  }
  throw new Error('missing trailer');
}

function lzwDecode(minCodeSize, bytes, pixelCount) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let table;
  const initTable = () => {
    table = [];
    for (let i = 0; i < clear; i++) table.push([i]);
    table.push([], []);
  };
  initTable();
  const out = [];
  let bitPos = 0;
  const readCode = () => {
    let v = 0;
    for (let i = 0; i < codeSize; i++) {
      v |= ((bytes[bitPos >> 3] >> (bitPos & 7)) & 1) << i;
      bitPos++;
    }
    return v;
  };
  let prev = null;
  while (out.length < pixelCount) {
    const code = readCode();
    if (code === clear) {
      initTable();
      codeSize = minCodeSize + 1;
      prev = null;
      continue;
    }
    if (code === eoi) break;
    let entry;
    if (code < table.length && table[code].length) entry = table[code];
    else if (code === table.length && prev) entry = [...prev, prev[0]];
    else throw new Error(`bad LZW code ${code}`);
    out.push(...entry);
    if (prev) {
      table.push([...prev, entry[0]]);
      if (table.length === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    prev = entry;
  }
  return out;
}

// ---- Helpers ----

const C = { K: [10, 14, 23], R: [248, 113, 113], G: [74, 222, 128], B: [56, 189, 248] };

function frameOf(colors, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const c = colors[i % colors.length];
    data[i * 4] = c[0];
    data[i * 4 + 1] = c[1];
    data[i * 4 + 2] = c[2];
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

// ---- Tests ----

test('encodeGIF structure: signature, size, netscape loop, frames, trailer', () => {
  const f1 = frameOf([C.K, C.R, C.G, C.B], 4, 4);
  const f2 = frameOf([C.B, C.G, C.R, C.K], 4, 4);
  const bytes = encodeGIF([f1, f2], { delayMs: 100 });
  const gif = parseGIF(bytes);
  assert.equal(gif.width, 4);
  assert.equal(gif.height, 4);
  assert.ok(gif.hasNetscape);
  assert.equal(gif.frames.length, 2);
  assert.equal(gif.frames[0].delay, 10); // centiseconds
  assert.equal(bytes[bytes.length - 1], 0x3B);
});

test('LZW round trip reproduces exact pixels for <=256-color input', () => {
  const f1 = frameOf([C.K, C.R, C.G, C.B], 4, 4);
  const f2 = frameOf([C.B, C.G, C.R, C.K], 4, 4);
  const bytes = encodeGIF([f1, f2]);
  const gif = parseGIF(bytes);
  for (const [fi, frame] of [f1, f2].entries()) {
    const indices = lzwDecode(gif.frames[fi].minCodeSize, gif.frames[fi].data, 16);
    assert.equal(indices.length, 16);
    for (let i = 0; i < 16; i++) {
      const rgb = gif.gct[indices[i]];
      assert.deepEqual(rgb, [frame.data[i * 4], frame.data[i * 4 + 1], frame.data[i * 4 + 2]], `frame ${fi} px ${i}`);
    }
  }
});

test('single 1x1 single-color frame encodes and decodes', () => {
  const f = frameOf([C.R], 1, 1);
  const gif = parseGIF(encodeGIF([f]));
  const indices = lzwDecode(gif.frames[0].minCodeSize, gif.frames[0].data, 1);
  assert.deepEqual(gif.gct[indices[0]], C.R);
});

test('gradient with >256 colors quantizes without error, palette <= 256', () => {
  const w = 32;
  const data = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = x * 8;
      data[i + 1] = y * 8;
      data[i + 2] = (x + y) * 4;
      data[i + 3] = 255;
    }
  }
  const gif = parseGIF(encodeGIF([{ data, width: w, height: w }]));
  assert.ok(gif.gct.length <= 256);
  const indices = lzwDecode(gif.frames[0].minCodeSize, gif.frames[0].data, w * w);
  assert.equal(indices.length, w * w);
  for (const idx of indices) assert.ok(idx < gif.gct.length);
});

test('medianCut preserves inputs with <=256 distinct colors and caps at maxColors', () => {
  const distinct = [];
  for (let i = 0; i < 200; i++) distinct.push([i, 255 - i, (i * 3) % 256]);
  const palette = medianCut(distinct.map((c) => [...c]), 256);
  assert.ok(palette.length <= 256);
  for (const c of distinct) {
    assert.ok(palette.some((p) => p[0] === c[0] && p[1] === c[1] && p[2] === c[2]), `missing ${c}`);
  }
  const big = [];
  for (let i = 0; i < 1000; i++) big.push([i % 256, (i * 7) % 256, (i * 13) % 256]);
  assert.ok(medianCut(big, 64).length <= 64);
});

test('throws on empty input and mismatched frame sizes', () => {
  assert.throws(() => encodeGIF([]), /no frames/);
  assert.throws(
    () => encodeGIF([frameOf([C.R], 2, 2), frameOf([C.R], 3, 2)]),
    /mismatch/,
  );
});

test('LZW dictionary-full reset round-trips a large noise frame', () => {
  const w = 128;
  const data = new Uint8ClampedArray(w * w * 4);
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed;
  };
  for (let i = 0; i < w * w; i++) {
    data[i * 4] = rand() % 256;
    data[i * 4 + 1] = rand() % 256;
    data[i * 4 + 2] = rand() % 256;
    data[i * 4 + 3] = 255;
  }
  const gif = parseGIF(encodeGIF([{ data, width: w, height: w }]));
  const indices = lzwDecode(gif.frames[0].minCodeSize, gif.frames[0].data, w * w);
  assert.equal(indices.length, w * w);
  for (let i = 0; i < w * w; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const chosen = gif.gct[indices[i]];
    const dc = (r - chosen[0]) ** 2 + (g - chosen[1]) ** 2 + (b - chosen[2]) ** 2;
    let min = Infinity;
    for (const p of gif.gct) {
      const d = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2;
      if (d < min) min = d;
    }
    assert.equal(dc, min, `pixel ${i} not nearest-mapped`);
  }
});
