# Schematica Recording & Journey Implementation Plan (v1.1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add net_draw-style canvas recording (WebM/MP4 with audio, plus animated GIF via a built-in encoder) and Journey (authored camera-tour presentation with captions) to Schematica.

**Architecture:** Three new modules — `src/gif.js` (pure GIF89a encoder), `src/journey.js` (pure step CRUD + tween math), `src/recorder.js` (DOM-bound frame pump + MediaRecorder + audio) — plus UI wiring in `main.js`/`index.html`/`css/style.css` and journey validation in `serialize.js`. Frames are captured by serializing the live SVG and rasterizing per frame; presentation captions are composited onto recorded frames by the recorder.

**Tech Stack:** Vanilla ES modules, zero dependencies, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-01-schematica-recording-journey-design.md` (and the v1 spec it builds on)

## Global Constraints

- No runtime dependencies, no build step. Tests: `npm test` (bare `node --test`).
- All v1 element ids, exports, and behaviors preserved. New element ids: `btn-journey`, `journey-panel`, `btn-rec`, `rec-dialog`, `present-overlay`.
- `doc.journey` is optional in files, always present (possibly `[]`) in memory; `schema` stays `1`.
- Journey zoom clamps to [0.2, 4] on load. Tween duration 600 ms, easeInOutCubic.
- GIF: 10fps (delay 100 ms), frames ≤ 960px wide, auto-stop at 600 frames, NETSCAPE loop forever.
- Video capture canvas: SVG client size × min(devicePixelRatio, 2); `captureStream(30)`.
- All user text entering markup passes `esc()` / `escAttr` as in v1.
- Dark UI tokens from `css/style.css` `:root`; no default browser chrome (style any new scrollables).

---

### Task 1: GIF89a encoder (`src/gif.js`)

**Files:**
- Create: `src/gif.js`
- Test: `tests/gif.test.js`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `encodeGIF(frames, { delayMs = 100, loop = true }) -> Uint8Array` where frames is `[{ data: Uint8ClampedArray|Uint8Array (RGBA), width, height }]`; throws `Error` on empty input or frame-size mismatch. Also exports `medianCut(pixels, maxColors = 256) -> [r,g,b][]` for testing.

- [ ] **Step 1: Write the failing tests**

`tests/gif.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../src/gif.js`

- [ ] **Step 3: Implement `src/gif.js`**

```js
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
        if (next === (1 << codeSize) && codeSize < 12) codeSize++;
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (56 tests: 50 existing + 6 new)

- [ ] **Step 5: Commit**

```bash
git add src/gif.js tests/gif.test.js
git commit -m "feat: zero-dependency GIF89a encoder with median-cut quantizer and LZW"
```

---

### Task 2: Journey model — `src/journey.js`, `newDoc` field, serialization

**Files:**
- Create: `src/journey.js`
- Modify: `src/state.js` (newDoc gains `journey: []`), `src/serialize.js` (validate journey)
- Test: `tests/journey.test.js`; Modify: `tests/state.test.js` (newDoc shape), `tests/serialize.test.js` (journey cases)

**Interfaces:**
- Consumes: `uid`, `Store` from `state.js`.
- Produces (`journey.js`): `addStep(store, view, label?) -> id` (view copied as `{x,y,zoom}`, default label `Step N`, caption `''`), `updateStep(store, id, { view?, label?, caption? })`, `removeStep(store, id)`, `moveStep(store, id, delta)` (no-op when out of range), `easeInOutCubic(t) -> number`, `tweenView(from, to, t) -> {x,y,zoom}` (t clamped to [0,1]).
- `newDoc()` now returns `{ schema: 1, title, nodes: [], wires: [], zones: [], notes: [], journey: [] }`.
- `deserialize` outputs `journey` always (default `[]`); invalid steps dropped with warning; zoom clamped [0.2, 4]; `journey` non-array throws like other collections.

- [ ] **Step 1: Write the failing tests**

`tests/journey.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/state.js';
import {
  addStep, updateStep, removeStep, moveStep, easeInOutCubic, tweenView,
} from '../src/journey.js';

const view = (x, y, zoom = 1) => ({ x, y, zoom });

test('addStep appends a step with copied view, default label and empty caption', () => {
  const store = new Store();
  const v = view(10, 20, 2);
  const id = addStep(store, v);
  v.x = 999;
  const step = store.doc.journey[0];
  assert.equal(step.id, id);
  assert.equal(step.label, 'Step 1');
  assert.equal(step.caption, '');
  assert.deepEqual(step.view, { x: 10, y: 20, zoom: 2 });
  addStep(store, view(0, 0));
  assert.equal(store.doc.journey[1].label, 'Step 2');
});

test('updateStep changes label, caption, and view independently', () => {
  const store = new Store();
  const id = addStep(store, view(0, 0));
  updateStep(store, id, { label: 'Intro', caption: 'Hello' });
  assert.equal(store.doc.journey[0].label, 'Intro');
  assert.equal(store.doc.journey[0].caption, 'Hello');
  updateStep(store, id, { view: view(5, 6, 0.5) });
  assert.deepEqual(store.doc.journey[0].view, { x: 5, y: 6, zoom: 0.5 });
  assert.equal(store.doc.journey[0].label, 'Intro');
});

test('removeStep and moveStep reorder correctly; out-of-range move is a no-op', () => {
  const store = new Store();
  const a = addStep(store, view(1, 1));
  const b = addStep(store, view(2, 2));
  const c = addStep(store, view(3, 3));
  moveStep(store, c, -1);
  assert.deepEqual(store.doc.journey.map((s) => s.id), [a, c, b]);
  moveStep(store, a, -1);
  assert.deepEqual(store.doc.journey.map((s) => s.id), [a, c, b]);
  removeStep(store, c);
  assert.deepEqual(store.doc.journey.map((s) => s.id), [a, b]);
});

test('journey edits are undoable', () => {
  const store = new Store();
  addStep(store, view(0, 0));
  assert.equal(store.doc.journey.length, 1);
  store.undo();
  assert.equal(store.doc.journey.length, 0);
  store.redo();
  assert.equal(store.doc.journey.length, 1);
});

test('easeInOutCubic endpoints and monotonicity', () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  let prev = -1;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const v = easeInOutCubic(t);
    assert.ok(v >= prev, `not monotonic at ${t}`);
    prev = v;
  }
});

test('tweenView interpolates and clamps t', () => {
  const from = view(0, 0, 1);
  const to = view(100, 200, 3);
  assert.deepEqual(tweenView(from, to, 0), from);
  assert.deepEqual(tweenView(from, to, 1), to);
  const mid = tweenView(from, to, 0.5);
  assert.ok(Math.abs(mid.x - 50) < 1e9 && mid.x > 0 && mid.x < 100);
  assert.deepEqual(tweenView(from, to, -5), from);
  assert.deepEqual(tweenView(from, to, 5), to);
});
```

In `tests/state.test.js`, update the `newDoc shape` test's expected object to include `journey: []`:

```js
  assert.deepEqual(doc, { schema: 1, title: 'X', nodes: [], wires: [], zones: [], notes: [], journey: [] });
```

Append to `tests/serialize.test.js`:

```js
test('journey round-trips; invalid steps dropped; zoom clamped; missing -> []', () => {
  const good = {
    schema: 1,
    journey: [
      { id: 'j1', label: 'Intro', view: { x: 1, y: 2, zoom: 2 }, caption: 'hi' },
      { id: 'j2', view: { x: 0, y: 0, zoom: 99 } },
      { id: 'j3', view: { x: 'nope', y: 0, zoom: 1 } },
      { id: 'j1', view: { x: 0, y: 0, zoom: 1 } },
    ],
  };
  const { doc, warnings } = deserialize(JSON.stringify(good));
  assert.equal(doc.journey.length, 2);
  assert.deepEqual(doc.journey[0], { id: 'j1', label: 'Intro', view: { x: 1, y: 2, zoom: 2 }, caption: 'hi' });
  assert.deepEqual(doc.journey[1], { id: 'j2', label: 'Step', view: { x: 0, y: 0, zoom: 4 }, caption: '' });
  assert.equal(warnings.length, 2);
  const { doc: empty } = deserialize('{"schema":1}');
  assert.deepEqual(empty.journey, []);
  assert.throws(() => deserialize('{"journey": 5}'), /"journey" must be an array/);
  const back = deserialize(serialize(doc));
  assert.deepEqual(back.doc.journey, doc.journey);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — journey module missing, newDoc shape mismatch, serialize journey cases failing.

- [ ] **Step 3: Implement**

`src/journey.js`:

```js
import { uid } from './state.js';

export function addStep(store, view, label) {
  const id = uid('j');
  store.apply((doc) => {
    if (!doc.journey) doc.journey = [];
    doc.journey.push({
      id,
      label: label || `Step ${doc.journey.length + 1}`,
      view: { x: view.x, y: view.y, zoom: view.zoom },
      caption: '',
    });
  });
  return id;
}

export function updateStep(store, id, props) {
  store.apply((doc) => {
    const step = (doc.journey || []).find((s) => s.id === id);
    if (!step) return;
    if (props.view) step.view = { x: props.view.x, y: props.view.y, zoom: props.view.zoom };
    if (props.label !== undefined) step.label = props.label;
    if (props.caption !== undefined) step.caption = props.caption;
  });
}

export function removeStep(store, id) {
  store.apply((doc) => {
    doc.journey = (doc.journey || []).filter((s) => s.id !== id);
  });
}

export function moveStep(store, id, delta) {
  store.apply((doc) => {
    const arr = doc.journey || [];
    const i = arr.findIndex((s) => s.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= arr.length) return;
    const [step] = arr.splice(i, 1);
    arr.splice(j, 0, step);
  });
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

export function tweenView(from, to, t) {
  const e = easeInOutCubic(Math.min(1, Math.max(0, t)));
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
    zoom: from.zoom + (to.zoom - from.zoom) * e,
  };
}
```

`src/state.js` — change `newDoc` to:

```js
export function newDoc(title = 'Untitled Board') {
  return { schema: 1, title, nodes: [], wires: [], zones: [], notes: [], journey: [] };
}
```

`src/serialize.js` — add `'journey'` to the non-array throw loop:

```js
  for (const key of ['nodes', 'wires', 'zones', 'notes', 'journey']) {
```

and add before `return { doc, warnings };`:

```js
  for (const s of raw.journey ?? []) {
    if (!s || !validId(s.id) || seen.has(s.id) || !s.view
      || !Number.isFinite(s.view.x) || !Number.isFinite(s.view.y) || !Number.isFinite(s.view.zoom)) {
      warnings.push('Dropped a journey step with a bad id or view.');
      continue;
    }
    seen.add(s.id);
    doc.journey.push({
      id: s.id,
      label: typeof s.label === 'string' ? s.label : 'Step',
      view: { x: s.view.x, y: s.view.y, zoom: Math.min(4, Math.max(0.2, s.view.zoom)) },
      caption: typeof s.caption === 'string' ? s.caption : '',
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (63 tests)

- [ ] **Step 5: Commit**

```bash
git add src/journey.js src/state.js src/serialize.js tests/journey.test.js tests/state.test.js tests/serialize.test.js
git commit -m "feat: journey model - steps with camera views, tween math, serialization"
```

---

### Task 3: Journey UI — panel, authoring, Present mode

**Files:**
- Modify: `index.html`, `css/style.css`, `src/main.js`

**Interfaces:**
- Consumes: everything from Task 2; `tools.view` (live mutable `{x,y,zoom}`); `esc` from `render.js` (already imported? NO — main.js does not import esc; the panel uses `escAttr` which stays local); existing `render()`.
- Produces: `#btn-journey` toggle button, `#journey-panel` aside, `#present-overlay` div; a presentation controller with `presentEnter()/presentExit()/presentGo(i)`; `window.__schemPresent` is NOT created (no globals). `renderProps` gains a journey-panel guard. The presentation controller exposes overlay text to the recorder in Task 4 via a module-level `presentState` object in main.js — Task 4 reads `presentState.caption` and `presentState.counter` (empty strings when not presenting).

- [ ] **Step 1: index.html additions**

In the toolbar, after the `btn-legend` button, add:

```html
        <button id="btn-journey" title="Journey steps">Journey</button>
```

In the toolbar right group, before `btn-new`... (no change; Rec arrives in Task 4).

After `<aside id="props" hidden></aside>`, add:

```html
    <aside id="journey-panel" hidden></aside>
```

Inside `#canvas-wrap`, after `#hintbar`, add:

```html
      <div id="present-overlay" hidden>
        <div id="present-caption"></div>
        <div id="present-nav">
          <button id="present-prev" title="Previous (Left arrow)">&lsaquo;</button>
          <span id="present-counter"></span>
          <button id="present-next" title="Next (Right arrow)">&rsaquo;</button>
          <button id="present-exit" title="Exit (Esc)">&times;</button>
        </div>
      </div>
```

- [ ] **Step 2: css/style.css additions** (append before the Scrollbars section)

```css
/* ---- Journey panel ---- */
#journey-panel {
  grid-area: props;
  width: 280px;
  background: var(--bg1);
  border-left: 1px solid var(--line);
  padding: 14px;
  overflow-y: auto;
}
#journey-panel h3 { margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; color: #7dd3fc; }
.journey-step {
  background: var(--bg2);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 10px;
}
.journey-step .step-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.journey-step .step-num { font-family: var(--mono); font-size: 10px; color: var(--faint); flex: none; }
.journey-step input[type="text"] {
  flex: 1;
  min-width: 0;
  background: var(--bg0);
  border: 1px solid var(--line);
  color: var(--text);
  border-radius: 6px;
  padding: 4px 7px;
  font-size: 12.5px;
  font-family: inherit;
}
.journey-step textarea {
  width: 100%;
  background: var(--bg0);
  border: 1px solid var(--line);
  color: var(--text);
  border-radius: 6px;
  padding: 5px 7px;
  font-size: 12px;
  font-family: inherit;
  min-height: 44px;
  resize: vertical;
}
.journey-step .step-actions { display: flex; gap: 4px; margin-top: 6px; }
.journey-step .step-actions button {
  background: var(--bg0);
  border: 1px solid var(--line);
  color: var(--muted);
  border-radius: 6px;
  padding: 3px 8px;
  cursor: pointer;
  font-size: 11.5px;
  font-family: inherit;
}
.journey-step .step-actions button:hover { color: var(--text); border-color: var(--line2); }
.journey-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.journey-actions button {
  background: var(--bg2);
  border: 1px solid var(--line2);
  color: var(--text);
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
}
.journey-actions button:hover:not(:disabled) { border-color: var(--accent); }
.journey-actions button:disabled { opacity: 0.4; cursor: default; }

/* ---- Present mode ---- */
#app.presenting #toolbar,
#app.presenting #palette,
#app.presenting #props,
#app.presenting #journey-panel,
#app.presenting #hintbar,
#app.presenting #legend { display: none; }
#app.presenting { grid-template-columns: 0 1fr 0; grid-template-rows: 0 1fr; }
#present-overlay {
  position: absolute;
  left: 50%;
  bottom: 26px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: 560px;
  width: max-content;
}
#present-caption {
  background: rgba(13, 18, 32, 0.94);
  border: 1px solid var(--line2);
  border-radius: 12px;
  padding: 12px 18px;
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
  text-align: center;
  max-width: 560px;
}
#present-caption:empty { display: none; }
#present-nav {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(13, 18, 32, 0.94);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 5px 10px;
}
#present-nav button {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 17px;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 6px;
  font-family: inherit;
}
#present-nav button:hover { color: var(--text); background: var(--bg3); }
#present-counter { font-family: var(--mono); font-size: 11.5px; color: var(--muted); min-width: 46px; text-align: center; }
```

- [ ] **Step 3: main.js — journey panel + presentation controller**

Add imports:

```js
import { addStep, updateStep, removeStep, moveStep, tweenView } from './journey.js';
```

Add at the top of `renderProps` (first line of the function body, before the focus guard):

```js
  if (!document.getElementById('journey-panel').hidden) {
    props.hidden = true;
    return;
  }
```

Append this block near the legend code:

```js
// ---- Journey ----
const journeyPanel = document.getElementById('journey-panel');
export const presentState = { active: false, index: 0, caption: '', counter: '' };
let tweenRaf = null;

function currentView() {
  return { x: tools.view.x, y: tools.view.y, zoom: tools.view.zoom };
}

function flyTo(target, instant = false) {
  if (tweenRaf) cancelAnimationFrame(tweenRaf);
  if (instant) {
    tools.view.x = target.x;
    tools.view.y = target.y;
    tools.view.zoom = target.zoom;
    render();
    return;
  }
  const from = currentView();
  const t0 = performance.now();
  const dur = 600;
  const tick = (now) => {
    const v = tweenView(from, target, (now - t0) / dur);
    tools.view.x = v.x;
    tools.view.y = v.y;
    tools.view.zoom = v.zoom;
    render();
    if (now - t0 < dur) tweenRaf = requestAnimationFrame(tick);
    else tweenRaf = null;
  };
  tweenRaf = requestAnimationFrame(tick);
}

function renderJourney() {
  if (journeyPanel.hidden) return;
  if (journeyPanel.contains(document.activeElement)) return;
  const steps = store.doc.journey || [];
  const escA = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  let html = '<h3>Journey</h3>';
  steps.forEach((s, i) => {
    html += `<div class="journey-step" data-step="${escA(s.id)}">`
      + `<div class="step-head"><span class="step-num">${i + 1}</span>`
      + `<input type="text" data-jfield="label" value="${escA(s.label)}"></div>`
      + `<textarea data-jfield="caption" placeholder="Caption shown while presenting">${escA(s.caption)}</textarea>`
      + '<div class="step-actions">'
      + '<button data-jact="go">Go</button>'
      + '<button data-jact="set" title="Update this step to the current view">Set</button>'
      + '<button data-jact="up">&uarr;</button>'
      + '<button data-jact="down">&darr;</button>'
      + '<button data-jact="del">&times;</button>'
      + '</div></div>';
  });
  html += '<div class="journey-actions">'
    + '<button id="journey-add">+ Add step from current view</button>'
    + `<button id="journey-present"${steps.length ? '' : ' disabled'}>&#9654; Present</button>`
    + '</div>';
  journeyPanel.innerHTML = html;
  document.getElementById('journey-add').addEventListener('click', () => {
    addStep(store, currentView());
  });
  document.getElementById('journey-present').addEventListener('click', presentEnter);
  journeyPanel.querySelectorAll('[data-jfield]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.closest('.journey-step').dataset.step;
      updateStep(store, id, { [input.dataset.jfield]: input.value });
    });
  });
  journeyPanel.querySelectorAll('[data-jact]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.journey-step').dataset.step;
      const act = btn.dataset.jact;
      const step = (store.doc.journey || []).find((s) => s.id === id);
      if (!step) return;
      if (act === 'go') flyTo(step.view);
      if (act === 'set') updateStep(store, id, { view: currentView() });
      if (act === 'up') moveStep(store, id, -1);
      if (act === 'down') moveStep(store, id, 1);
      if (act === 'del') removeStep(store, id);
    });
  });
}

document.getElementById('btn-journey').addEventListener('click', (e) => {
  journeyPanel.hidden = !journeyPanel.hidden;
  e.currentTarget.classList.toggle('active', !journeyPanel.hidden);
  renderJourney();
  renderProps();
});

store.subscribe(renderJourney);

// ---- Present mode ----
const overlay = document.getElementById('present-overlay');

function presentShow() {
  const steps = store.doc.journey || [];
  const step = steps[presentState.index];
  if (!step) { presentExit(); return; }
  presentState.caption = step.caption || '';
  presentState.counter = `${presentState.index + 1} / ${steps.length}`;
  document.getElementById('present-caption').textContent = presentState.caption;
  document.getElementById('present-counter').textContent = presentState.counter;
  flyTo(step.view);
}

function presentGo(delta) {
  const steps = store.doc.journey || [];
  const next = presentState.index + delta;
  if (next < 0 || next >= steps.length) return;
  presentState.index = next;
  presentShow();
}

function presentKeys(e) {
  if (!presentState.active) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); presentGo(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); presentGo(-1); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); presentExit(); }
}

function presentEnter() {
  if (!(store.doc.journey || []).length) return;
  presentState.active = true;
  presentState.index = 0;
  document.getElementById('app').classList.add('presenting');
  overlay.hidden = false;
  window.addEventListener('keydown', presentKeys, true);
  presentShow();
}

function presentExit() {
  presentState.active = false;
  presentState.caption = '';
  presentState.counter = '';
  document.getElementById('app').classList.remove('presenting');
  overlay.hidden = true;
  window.removeEventListener('keydown', presentKeys, true);
}

document.getElementById('present-prev').addEventListener('click', () => presentGo(-1));
document.getElementById('present-next').addEventListener('click', () => presentGo(1));
document.getElementById('present-exit').addEventListener('click', presentExit);
```

Note: `export const presentState` — main.js is a module; the export is consumed by nothing yet (Task 4's recorder wiring reads it from within main.js itself, so if the linter of your conscience objects, plain `const` is fine — use plain `const presentState = …`; Task 4 accesses it in the same file).

Use plain `const presentState = { … }` (no export).

- [ ] **Step 4: Verify**

`npm test` (63 pass, regression), `node --check src/main.js`. Browser verification is performed by the controller.

- [ ] **Step 5: Commit**

```bash
git add index.html css/style.css src/main.js
git commit -m "feat: journey authoring panel and present mode with camera tweens"
```

---

### Task 4: Recorder — `src/recorder.js` + Rec dialog

**Files:**
- Create: `src/recorder.js`
- Modify: `index.html`, `css/style.css`, `src/main.js`

**Interfaces:**
- Consumes: `CANVAS_BG` from `render.js`, `wrapText` from `geometry.js`, `encodeGIF` from `gif.js`, `download` from `export.js`.
- Produces: `createRecorder(svg) -> recorder` with:
  - `videoFormats() -> [{ id, label, mime, ext }]` (filtered by `MediaRecorder.isTypeSupported`; empty when unsupported)
  - `async start({ format, audio, musicFile, basename, onState })` — format is a videoFormats() id or `'gif'`; audio `'none'|'mic'|'music'`; throws on mic denial with a readable message; `onState(state)` called on every state change and each elapsed second
  - `stop()` — finalizes and downloads `<basename>.<ext>`
  - `setOverlay(caption, counter)` — both strings; empty clears
  - `state() -> { recording, encoding, elapsed, format }`

- [ ] **Step 1: Create `src/recorder.js`**

```js
import { CANVAS_BG } from './render.js';
import { wrapText } from './geometry.js';
import { encodeGIF } from './gif.js';
import { download } from './export.js';

const VIDEO_FORMATS = [
  { id: 'webm-vp9', label: 'WebM — VP9', mime: 'video/webm;codecs=vp9', ext: 'webm' },
  { id: 'webm-vp8', label: 'WebM — VP8', mime: 'video/webm;codecs=vp8', ext: 'webm' },
  { id: 'mp4-h264', label: 'MP4 — H.264', mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
  { id: 'mp4-av1', label: 'MP4 — AV1', mime: 'video/mp4;codecs=av01', ext: 'mp4' },
];

const GIF_FPS = 10;
const GIF_MAX_FRAMES = 600;
const GIF_MAX_WIDTH = 960;

export function createRecorder(svg) {
  let mode = null; // null | 'video' | 'gif'
  let recording = false;
  let encoding = false;
  let startedAt = 0;
  let onState = null;
  let basename = 'schematica';
  let formatId = null;

  let canvas = null;
  let ctx = null;
  let rafId = null;
  let gifTimer = null;
  let elapsedTimer = null;
  let busy = false;
  let failures = 0;

  let mediaRecorder = null;
  let chunks = [];
  let micStream = null;
  let audioCtx = null;

  const gifFrames = [];
  const overlay = { caption: '', counter: '' };

  function notify() {
    onState?.(state());
  }

  function state() {
    return {
      recording,
      encoding,
      elapsed: recording ? Math.floor((performance.now() - startedAt) / 1000) : 0,
      format: formatId,
    };
  }

  function videoFormats() {
    if (typeof MediaRecorder === 'undefined') return [];
    return VIDEO_FORMATS.filter((f) => MediaRecorder.isTypeSupported(f.mime));
  }

  function drawOverlay() {
    if (!overlay.caption && !overlay.counter) return;
    const W = canvas.width;
    const H = canvas.height;
    const scale = W / svg.getBoundingClientRect().width;
    const fs = Math.max(12, 14 * scale);
    ctx.font = `${fs}px system-ui, sans-serif`;
    const lines = overlay.caption ? wrapText(overlay.caption, 64) : [];
    const lineH = fs * 1.5;
    const boxH = (lines.length ? lines.length * lineH + fs : 0) + (overlay.counter ? fs * 1.6 : 0) + fs;
    const boxW = Math.min(W * 0.8, Math.max(220 * scale, ...lines.map((l) => ctx.measureText(l).width + fs * 2), 0));
    const bx = (W - boxW) / 2;
    const by = H - boxH - 20 * scale;
    ctx.fillStyle = 'rgba(13, 18, 32, 0.94)';
    ctx.strokeStyle = '#2c3a5c';
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, 10 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e6ebf4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.fillText(line, W / 2, by + fs * 0.8 + i * lineH);
    });
    if (overlay.counter) {
      ctx.fillStyle = '#8b96ab';
      ctx.font = `${fs * 0.85}px ui-monospace, Menlo, monospace`;
      ctx.fillText(overlay.counter, W / 2, by + boxH - fs * 1.3);
    }
  }

  async function pumpFrame() {
    if (busy || !recording) return;
    busy = true;
    try {
      const rect = svg.getBoundingClientRect();
      const clone = svg.cloneNode(true);
      clone.setAttribute('width', rect.width);
      clone.setAttribute('height', rect.height);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.src = url;
      await img.decode();
      ctx.fillStyle = CANVAS_BG;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      drawOverlay();
      failures = 0;
    } catch (err) {
      failures += 1;
      if (failures >= 3) {
        abort('Recording failed: the canvas could not be captured.');
      }
    }
    busy = false;
  }

  function videoLoop() {
    if (!recording) return;
    pumpFrame();
    rafId = requestAnimationFrame(videoLoop);
  }

  function cleanup() {
    if (rafId) cancelAnimationFrame(rafId);
    if (gifTimer) clearInterval(gifTimer);
    if (elapsedTimer) clearInterval(elapsedTimer);
    rafId = null;
    gifTimer = null;
    elapsedTimer = null;
    if (micStream) {
      for (const t of micStream.getTracks()) t.stop();
      micStream = null;
    }
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
    mediaRecorder = null;
    recording = false;
  }

  function abort(message) {
    const wasRecording = recording;
    recording = false;
    if (mediaRecorder) {
      mediaRecorder.onstop = null; // an aborted recording must not download partial chunks
      chunks = [];
      try { mediaRecorder.stop(); } catch { /* already stopped */ }
    }
    cleanup();
    gifFrames.length = 0;
    mode = null;
    notify();
    if (wasRecording) alert(message);
  }

  async function start(opts) {
    if (recording || encoding) return;
    formatId = opts.format;
    basename = opts.basename || 'schematica';
    onState = opts.onState || null;
    const rect = svg.getBoundingClientRect();
    canvas = document.createElement('canvas');

    if (formatId === 'gif') {
      mode = 'gif';
      const scale = Math.min(1, GIF_MAX_WIDTH / rect.width);
      canvas.width = Math.round(rect.width * scale);
      canvas.height = Math.round(rect.height * scale);
      ctx = canvas.getContext('2d', { willReadFrequently: true });
      gifFrames.length = 0;
      recording = true;
      startedAt = performance.now();
      gifTimer = setInterval(async () => {
        await pumpFrame();
        if (!recording) return;
        gifFrames.push({
          data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
          width: canvas.width,
          height: canvas.height,
        });
        if (gifFrames.length >= GIF_MAX_FRAMES) stop();
      }, 1000 / GIF_FPS);
    } else {
      mode = 'video';
      const fmt = VIDEO_FORMATS.find((f) => f.id === formatId);
      if (!fmt) throw new Error('Unknown recording format.');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(30);
      if (opts.audio === 'mic') {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          throw new Error('Microphone access was denied. Recording not started.');
        }
        stream.addTrack(micStream.getAudioTracks()[0]);
      } else if (opts.audio === 'music' && opts.musicFile) {
        audioCtx = new AudioContext();
        const buf = await audioCtx.decodeAudioData(await opts.musicFile.arrayBuffer());
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const dest = audioCtx.createMediaStreamDestination();
        src.connect(dest);
        src.start();
        stream.addTrack(dest.stream.getAudioTracks()[0]);
      }
      chunks = [];
      mediaRecorder = new MediaRecorder(stream, { mimeType: fmt.mime });
      mediaRecorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mediaRecorder.onerror = () => abort('Recording failed inside the browser encoder.');
      mediaRecorder.onstop = () => {
        if (chunks.length) {
          download(`${basename}.${fmt.ext}`, new Blob(chunks, { type: fmt.mime.split(';')[0] }), fmt.mime);
        }
        chunks = [];
      };
      recording = true;
      startedAt = performance.now();
      mediaRecorder.start(500);
      videoLoop();
    }
    elapsedTimer = setInterval(notify, 1000);
    notify();
  }

  function stop() {
    if (!recording) return;
    recording = false;
    if (mode === 'video') {
      try { mediaRecorder?.stop(); } catch { /* already stopped */ }
      cleanup();
      mode = null;
      notify();
    } else {
      cleanup();
      encoding = true;
      notify();
      setTimeout(() => {
        try {
          if (gifFrames.length) {
            const bytes = encodeGIF(gifFrames, { delayMs: 1000 / GIF_FPS });
            download(`${basename}.gif`, new Blob([bytes], { type: 'image/gif' }), 'image/gif');
          }
        } finally {
          gifFrames.length = 0;
          encoding = false;
          mode = null;
          notify();
        }
      }, 30);
    }
  }

  function setOverlay(caption, counter) {
    overlay.caption = caption || '';
    overlay.counter = counter || '';
  }

  return { videoFormats, start, stop, setOverlay, state };
}
```

- [ ] **Step 2: index.html — Rec button + dialog**

In the toolbar right group, add as the FIRST button of the `.push-right` group (before `btn-export-png`):

```html
        <button id="btn-rec" title="Record the canvas"><span class="rec-dot"></span>Rec</button>
```

Before `</body>` (after the file input), add:

```html
  <div id="rec-dialog" hidden>
    <div class="rec-card">
      <h3>Record diagram</h3>
      <p>Captures the canvas live while you present — pan, zoom, select, connect. Journey captions are included.</p>
      <h4>Format</h4>
      <div id="rec-formats"></div>
      <h4>Audio</h4>
      <div id="rec-audio">
        <label><input type="radio" name="rec-audio" value="none" checked> No audio</label>
        <label><input type="radio" name="rec-audio" value="mic"> Microphone narration</label>
        <label><input type="radio" name="rec-audio" value="music"> Music file
          <input type="file" id="rec-music" accept="audio/*"></label>
      </div>
      <div class="rec-buttons">
        <button id="rec-start"><span class="rec-dot"></span>Start recording</button>
        <button id="rec-cancel">Cancel</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 3: css/style.css additions** (append near the Journey block)

```css
/* ---- Recording ---- */
.rec-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  margin-right: 6px;
}
#btn-rec.recording { color: #fca5a5; background: #2a1215; }
#btn-rec.recording .rec-dot { animation: rec-blink 1.2s infinite; }
@keyframes rec-blink { 50% { opacity: 0.25; } }
@media (prefers-reduced-motion: reduce) { #btn-rec.recording .rec-dot { animation: none; } }

#rec-dialog {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(4, 6, 12, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}
#rec-dialog[hidden] { display: none; }
.rec-card {
  width: 380px;
  background: var(--bg1);
  border: 1px solid var(--line2);
  border-radius: 14px;
  padding: 18px 20px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6);
}
.rec-card h3 { margin: 0 0 6px; font-size: 15px; }
.rec-card p { margin: 0 0 12px; font-size: 12.5px; color: var(--muted); line-height: 1.5; }
.rec-card h4 { margin: 12px 0 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 1.4px; color: var(--faint); }
.rec-card label { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 4px 0; color: var(--text); }
.rec-card input[type="radio"] { accent-color: var(--accent); }
.rec-card input[type="file"] { font-size: 11px; color: var(--muted); }
#rec-audio.disabled { opacity: 0.4; pointer-events: none; }
.rec-buttons { display: flex; gap: 8px; margin-top: 16px; }
#rec-start {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #7f1d1d;
  border: 1px solid #b91c1c;
  color: #fecaca;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
}
#rec-start:hover { background: #991b1b; }
#rec-cancel {
  background: var(--bg2);
  border: 1px solid var(--line);
  color: var(--muted);
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
}
#rec-cancel:hover { color: var(--text); border-color: var(--line2); }
```

- [ ] **Step 4: main.js — recorder wiring**

Add import:

```js
import { createRecorder } from './recorder.js';
```

Append after the Present mode block:

```js
// ---- Recording ----
const recorder = createRecorder(svg);
const recDialog = document.getElementById('rec-dialog');
const recBtn = document.getElementById('btn-rec');

function recRenderFormats() {
  const formats = [...recorder.videoFormats(), { id: 'gif', label: 'GIF (animated)', ext: 'gif' }];
  document.getElementById('rec-formats').innerHTML = formats.map((f, i) => (
    `<label><input type="radio" name="rec-format" value="${f.id}"${i === 0 ? ' checked' : ''}> ${f.label}</label>`
  )).join('');
  document.querySelectorAll('input[name="rec-format"]').forEach((r) => {
    r.addEventListener('change', () => {
      document.getElementById('rec-audio').classList.toggle('disabled', r.value === 'gif' && r.checked);
    });
  });
}

function recOnState(s) {
  if (s.encoding) {
    recBtn.textContent = 'Encoding…';
    recBtn.disabled = true;
    recBtn.classList.remove('recording');
    return;
  }
  recBtn.disabled = false;
  if (s.recording) {
    const m = Math.floor(s.elapsed / 60);
    const sec = String(s.elapsed % 60).padStart(2, '0');
    recBtn.innerHTML = `<span class="rec-dot"></span>${m}:${sec} Stop`;
    recBtn.classList.add('recording');
  } else {
    recBtn.innerHTML = '<span class="rec-dot"></span>Rec';
    recBtn.classList.remove('recording');
  }
}

recBtn.addEventListener('click', () => {
  if (recorder.state().recording) {
    recorder.stop();
    return;
  }
  if (recorder.state().encoding) return;
  recRenderFormats();
  document.getElementById('rec-audio').classList.remove('disabled');
  recDialog.hidden = false;
});

document.getElementById('rec-cancel').addEventListener('click', () => {
  recDialog.hidden = true;
});
recDialog.addEventListener('pointerdown', (e) => {
  if (e.target === recDialog) recDialog.hidden = true;
});

document.getElementById('rec-start').addEventListener('click', async () => {
  const format = document.querySelector('input[name="rec-format"]:checked')?.value;
  if (!format) return;
  const audio = document.querySelector('input[name="rec-audio"]:checked')?.value || 'none';
  const musicFile = document.getElementById('rec-music').files[0] || null;
  try {
    await recorder.start({
      format,
      audio: format === 'gif' ? 'none' : audio,
      musicFile,
      basename: (store.doc.title || 'schematica').replace(/[^\w-]+/g, '_'),
      onState: recOnState,
    });
    recDialog.hidden = true;
  } catch (err) {
    alert(err.message);
  }
});
```

And inside `presentShow()` (Task 3 code) add as the last line:

```js
  recorder.setOverlay(presentState.caption, presentState.counter);
```

and inside `presentExit()` add as the last line:

```js
  recorder.setOverlay('', '');
```

(Ordering note: the Recording block must be inserted ABOVE the Journey/Present block, or `recorder` referenced in `presentShow` will be in temporal dead zone — place `// ---- Recording ----` BEFORE `// ---- Journey ----` in the file, or simpler: place the recorder block right after the legend code and before the journey block added in Task 3. The implementer arranges so that `const recorder = …` executes before any call to `presentShow()` can happen; since `presentShow` only runs on user clicks, plain script order `journey block first, recording block later` is ALSO safe at runtime — but `node --check` doesn't care either way. Place Recording after Journey and reference is fine because presentShow only executes post-boot.)

- [ ] **Step 5: Verify**

`npm test` (63 pass, regression), `node --check src/recorder.js && node --check src/main.js`. Browser verification is performed by the controller.

- [ ] **Step 6: Commit**

```bash
git add src/recorder.js index.html css/style.css src/main.js
git commit -m "feat: canvas recording - WebM/MP4 with audio, animated GIF, present-mode captions composited"
```

---

### Task 5: README + final walkthrough

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README updates**

In the "Use it" table, add rows after the Export row:

```markdown
| Record | Rec button — WebM/MP4 video (optional mic or music audio) or animated GIF |
| Journey | Journey button — save camera steps with captions; Present plays the tour (arrow keys, Esc) |
```

After the autosave paragraph, add:

```markdown
Journeys are saved inside the `.schematica.json` document. Recording during
Present captures the animated tour with captions burned into the frames.
```

In the Develop section's module list sentence, extend with: `src/gif.js` is a
zero-dependency GIF89a encoder; `src/journey.js` holds journey steps and
camera tween math; `src/recorder.js` drives frame capture and MediaRecorder.

- [ ] **Step 2: Final manual walkthrough (spec success criteria — controller performs)**

1. Author a 3-step journey on a small board (different pans/zooms, captions).
2. Present: camera tweens, captions and counter update, arrows/Esc work, chrome hidden.
3. Record WebM during Present; stop; file downloads and plays with captions visible.
4. Record a GIF of some live editing; stop; Encoding… state appears; GIF downloads and renders (open in a browser tab).
5. Save/reload → journey intact. Undo works across journey edits.
6. Zero console errors from real interactions.

- [ ] **Step 3: Run tests one final time**

Run: `npm test` — expected: PASS (63).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README - recording and journey usage"
```
