// Pure GIF89a encoder: median-cut quantization + LZW. Zero dependencies.

class ByteWriter {
  constructor() { this.arr = []; }
  u8(v) { this.arr.push(v & 0xFF); }
  u16(v) { this.arr.push(v & 0xFF, (v >> 8) & 0xFF); }
  str(s) { for (const ch of s) this.arr.push(ch.charCodeAt(0)); }
  bytes(b) { for (const v of b) this.arr.push(v & 0xFF); }
  toUint8Array() { return Uint8Array.from(this.arr); }
}

class BitWriter {
  constructor() { this.out = []; this.cur = 0; this.nbits = 0; }
  write(value, size) {
    this.cur |= value << this.nbits;
    this.nbits += size;
    while (this.nbits >= 8) {
      this.out.push(this.cur & 0xFF);
      this.cur >>= 8;
      this.nbits -= 8;
    }
  }
  finish() {
    if (this.nbits > 0) this.out.push(this.cur & 0xFF);
    return Uint8Array.from(this.out);
  }
}

export function medianCut(pixels, maxColors = 256) {
  let boxes = [pixels];
  while (boxes.length < maxColors) {
    let bestIdx = -1;
    let bestRange = 0;
    let bestChan = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let mn = 255;
        let mx = 0;
        for (const p of box) {
          if (p[ch] < mn) mn = p[ch];
          if (p[ch] > mx) mx = p[ch];
        }
        if (mx - mn > bestRange) {
          bestRange = mx - mn;
          bestIdx = i;
          bestChan = ch;
        }
      }
    });
    if (bestIdx === -1 || bestRange === 0) break;
    const box = boxes[bestIdx];
    box.sort((a, b) => a[bestChan] - b[bestChan]);
    const mid = box.length >> 1;
    boxes.splice(bestIdx, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.map((box) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const p of box) { r += p[0]; g += p[1]; b += p[2]; }
    const n = box.length || 1;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}

function samplePixels(frames) {
  const picks = frames.length <= 3
    ? frames
    : [frames[0], frames[Math.floor(frames.length / 2)], frames[frames.length - 1]];
  const pixels = [];
  for (const f of picks) {
    const total = f.data.length / 4;
    const step = Math.max(1, Math.floor(total / 10000)) * 4;
    for (let i = 0; i < f.data.length; i += step) {
      pixels.push([f.data[i], f.data[i + 1], f.data[i + 2]]);
    }
  }
  return pixels;
}

function mapToPalette(rgba, palette, lookup) {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    const key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    let idx = lookup.get(key);
    if (idx === undefined) {
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < palette.length; k++) {
        const dr = rgba[i] - palette[k][0];
        const dg = rgba[i + 1] - palette[k][1];
        const db = rgba[i + 2] - palette[k][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = k; }
      }
      idx = best;
      lookup.set(key, idx);
    }
    out[j] = idx;
  }
  return out;
}

function writeLZW(out, indices, minCodeSize) {
  out.u8(minCodeSize);
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  const bits = new BitWriter();
  let dict;
  let next;
  let codeSize;
  const reset = () => {
    dict = new Map();
    next = eoi + 1;
    codeSize = minCodeSize + 1;
  };
  reset();
  bits.write(clear, codeSize);
  let prev = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prev << 12) | k;
    const found = dict.get(key);
    if (found !== undefined) {
      prev = found;
    } else {
      bits.write(prev, codeSize);
      if (next < 4096) {
        dict.set(key, next);
        next++;
        if (next === (1 << codeSize) + 1 && codeSize < 12) codeSize++;
      } else {
        bits.write(clear, codeSize);
        reset();
      }
      prev = k;
    }
  }
  bits.write(prev, codeSize);
  bits.write(eoi, codeSize);
  const data = bits.finish();
  for (let i = 0; i < data.length; i += 255) {
    const chunk = data.subarray(i, Math.min(i + 255, data.length));
    out.u8(chunk.length);
    out.bytes(chunk);
  }
  out.u8(0);
}

export function encodeGIF(frames, { delayMs = 100, loop = true } = {}) {
  if (!frames.length) throw new Error('encodeGIF: no frames');
  const { width, height } = frames[0];
  for (const f of frames) {
    if (f.width !== width || f.height !== height) {
      throw new Error('encodeGIF: frame size mismatch');
    }
  }
  const palette = medianCut(samplePixels(frames), 256);
  const gctBits = Math.max(1, Math.ceil(Math.log2(palette.length)));
  const gctSize = 1 << gctBits;
  const minCodeSize = Math.max(2, gctBits);

  const out = new ByteWriter();
  out.str('GIF89a');
  out.u16(width);
  out.u16(height);
  out.u8(0x80 | ((gctBits - 1) & 0x07));
  out.u8(0);
  out.u8(0);
  for (let i = 0; i < gctSize; i++) {
    const c = palette[i] || [0, 0, 0];
    out.u8(c[0]);
    out.u8(c[1]);
    out.u8(c[2]);
  }
  if (loop) {
    out.bytes([0x21, 0xFF, 0x0B]);
    out.str('NETSCAPE2.0');
    out.bytes([0x03, 0x01, 0x00, 0x00, 0x00]);
  }
  const delay = Math.round(delayMs / 10);
  const lookup = new Map();
  for (const f of frames) {
    out.bytes([0x21, 0xF9, 0x04, 0x04, delay & 0xFF, (delay >> 8) & 0xFF, 0x00, 0x00]);
    out.u8(0x2C);
    out.u16(0);
    out.u16(0);
    out.u16(width);
    out.u16(height);
    out.u8(0);
    writeLZW(out, mapToPalette(f.data, palette, lookup), minCodeSize);
  }
  out.u8(0x3B);
  return out.toUint8Array();
}
