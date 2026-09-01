# Schematica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static-site canvas board for drawing embedded-system architecture diagrams — component palette, typed bus wires, zones, notes, pan/zoom, undo, save/load, SVG/PNG export.

**Architecture:** Vanilla ES modules, no build step, no runtime dependencies. A `Store` in `src/state.js` holds the document as the single source of truth; UI events mutate it through action helpers; `src/render.js` redraws layered SVG from the model on every change. Pure modules (`buses`, `palette`, `geometry`, `state`, `serialize`) have zero DOM access and are tested with Node's built-in test runner.

**Tech Stack:** HTML + CSS + vanilla JS (ES modules), SVG rendering, `node:test` for unit tests, `python3 -m http.server` for local serving.

**Spec:** `docs/superpowers/specs/2026-09-01-schematica-design.md`

## Global Constraints

- No runtime dependencies, no bundler, no transpiler. JS loads via `<script type="module">`.
- Node >= 18 required only for tests (`node --test`, `structuredClone`). No `npm install` ever.
- Serve locally with `python3 -m http.server 8000` from the repo root (ES modules don't load from `file://`).
- Schema field is `"schema": 1` exactly.
- Grid snap is 8 px. Visual grid dots every 24 px. Zoom clamps to [0.2, 4].
- Undo stack cap: 100 entries.
- Canvas background `#0a0e17` (also the export background); full dark net_draw-style UI (Task 12, user-directed redesign supersedes the original light canvas).
- All model IDs are strings from `uid(prefix)` — prefixes: `n` nodes, `w` wires, `z` zones, `t` notes.
- localStorage key for autosave: `schematica.autosave`.
- Run all tests with: `npm test` (alias for `node --test tests/`).

---

### Task 1: Scaffold + bus and palette data modules

**Files:**
- Create: `package.json`, `.gitignore`
- Create: `src/buses.js`, `src/palette.js`
- Test: `tests/buses.test.js`, `tests/palette.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `buses.js`: `BUSES: Record<string, {name, short, color, width, dash: string|null}>`, `BUS_ORDER: string[]`, `DEFAULT_BUS = 'gpio'`.
  - `palette.js`: `CATEGORIES: {id, name}[]`, `PARTS: Record<string, {kind, category, name, w, h, ports: {id, name, side, offset, bus}[]}>`, `getPart(kind)` returning `PARTS[kind] ?? PARTS.generic`.

- [ ] **Step 1: Create scaffold files**

`package.json`:

```json
{
  "name": "schematica",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

`.gitignore`:

```
.DS_Store
```

- [ ] **Step 2: Write the failing tests**

`tests/buses.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { BUSES, BUS_ORDER, DEFAULT_BUS } from '../src/buses.js';

test('BUS_ORDER matches BUSES keys exactly', () => {
  assert.deepEqual([...BUS_ORDER].sort(), Object.keys(BUSES).sort());
});

test('every bus is fully defined', () => {
  for (const [id, b] of Object.entries(BUSES)) {
    assert.match(b.color, /^#[0-9a-f]{6}$/i, `${id} color`);
    assert.ok(b.width > 0, `${id} width`);
    assert.ok(typeof b.name === 'string' && b.name, `${id} name`);
    assert.ok(typeof b.short === 'string' && b.short, `${id} short`);
    assert.ok(b.dash === null || typeof b.dash === 'string', `${id} dash`);
  }
});

test('default bus exists', () => {
  assert.ok(BUSES[DEFAULT_BUS]);
});
```

`tests/palette.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, PARTS, getPart } from '../src/palette.js';
import { BUSES } from '../src/buses.js';

const SIDES = ['left', 'right', 'top', 'bottom'];

test('every part is well-formed', () => {
  const catIds = new Set(CATEGORIES.map((c) => c.id));
  for (const [key, part] of Object.entries(PARTS)) {
    assert.equal(part.kind, key, `${key} kind mismatch`);
    assert.ok(catIds.has(part.category), `${key} category`);
    assert.ok(part.w > 0 && part.h > 0, `${key} size`);
    assert.ok(part.name, `${key} name`);
    const ids = new Set();
    for (const port of part.ports) {
      assert.ok(!ids.has(port.id), `${key} duplicate port ${port.id}`);
      ids.add(port.id);
      assert.ok(SIDES.includes(port.side), `${key}.${port.id} side`);
      assert.ok(port.offset >= 0 && port.offset <= 1, `${key}.${port.id} offset`);
      assert.ok(BUSES[port.bus], `${key}.${port.id} unknown bus ${port.bus}`);
      assert.ok(port.name, `${key}.${port.id} name`);
    }
  }
});

test('every category has at least one part', () => {
  for (const c of CATEGORIES) {
    assert.ok(Object.values(PARTS).some((p) => p.category === c.id), c.id);
  }
});

test('getPart falls back to generic for unknown kinds', () => {
  assert.equal(getPart('definitely-not-real'), PARTS.generic);
  assert.equal(getPart('mcu'), PARTS.mcu);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../src/buses.js`

- [ ] **Step 4: Implement `src/buses.js`**

```js
export const BUSES = {
  power: { name: 'Power', short: 'PWR', color: '#dc2626', width: 4, dash: null },
  gnd:   { name: 'Ground', short: 'GND', color: '#111827', width: 4, dash: '8 4' },
  i2c:   { name: 'I2C', short: 'I2C', color: '#0284c7', width: 2, dash: null },
  spi:   { name: 'SPI', short: 'SPI', color: '#7c3aed', width: 2, dash: null },
  uart:  { name: 'UART', short: 'UART', color: '#16a34a', width: 2, dash: null },
  can:   { name: 'CAN', short: 'CAN', color: '#ca8a04', width: 2, dash: null },
  usb:   { name: 'USB', short: 'USB', color: '#db2777', width: 2, dash: null },
  eth:   { name: 'Ethernet', short: 'ETH', color: '#0f766e', width: 2, dash: null },
  gpio:  { name: 'GPIO', short: 'GPIO', color: '#64748b', width: 1.5, dash: null },
  pwm:   { name: 'PWM', short: 'PWM', color: '#f97316', width: 2, dash: '6 4' },
  adc:   { name: 'ADC / analog', short: 'ADC', color: '#92400e', width: 2, dash: '4 3' },
  rf:    { name: 'RF', short: 'RF', color: '#6366f1', width: 2, dash: '1.5 5' },
};

export const BUS_ORDER = ['power', 'gnd', 'i2c', 'spi', 'uart', 'can', 'usb', 'eth', 'gpio', 'pwm', 'adc', 'rf'];

export const DEFAULT_BUS = 'gpio';
```

- [ ] **Step 5: Implement `src/palette.js`**

```js
export const CATEGORIES = [
  { id: 'compute', name: 'Compute' },
  { id: 'sensors', name: 'Sensors' },
  { id: 'actuators', name: 'Actuators' },
  { id: 'power', name: 'Power' },
  { id: 'connectivity', name: 'Connectivity' },
  { id: 'misc', name: 'Storage / Misc' },
];

const p = (id, name, side, offset, bus) => ({ id, name, side, offset, bus });
const pwr = (side = 'left') => [p('vcc', 'VCC', side, 0.3, 'power'), p('gnd', 'GND', side, 0.7, 'gnd')];
const part = (kind, category, name, w, h, ports) => ({ kind, category, name, w, h, ports });

export const PARTS = {
  // Compute
  mcu: part('mcu', 'compute', 'MCU', 160, 100, [
    ...pwr(),
    p('i2c', 'I2C', 'right', 0.2, 'i2c'), p('spi', 'SPI', 'right', 0.4, 'spi'),
    p('uart', 'UART', 'right', 0.6, 'uart'), p('usb', 'USB', 'right', 0.8, 'usb'),
    p('gpio1', 'GPIO', 'bottom', 0.2, 'gpio'), p('gpio2', 'GPIO', 'bottom', 0.4, 'gpio'),
    p('pwm', 'PWM', 'bottom', 0.6, 'pwm'), p('adc', 'ADC', 'bottom', 0.8, 'adc'),
    p('can', 'CAN', 'top', 0.5, 'can'),
  ]),
  sbc: part('sbc', 'compute', 'SoC / SBC', 180, 110, [
    ...pwr(),
    p('eth', 'ETH', 'right', 0.25, 'eth'), p('usb', 'USB', 'right', 0.5, 'usb'),
    p('uart', 'UART', 'right', 0.75, 'uart'),
    p('gpio1', 'GPIO', 'bottom', 0.2, 'gpio'), p('gpio2', 'GPIO', 'bottom', 0.4, 'gpio'),
    p('i2c', 'I2C', 'bottom', 0.6, 'i2c'), p('spi', 'SPI', 'bottom', 0.8, 'spi'),
  ]),
  fpga: part('fpga', 'compute', 'FPGA', 160, 110, [
    ...pwr(),
    p('spi', 'SPI', 'right', 0.25, 'spi'), p('uart', 'UART', 'right', 0.5, 'uart'),
    p('gpio1', 'IO', 'right', 0.75, 'gpio'),
    p('gpio2', 'IO', 'bottom', 0.33, 'gpio'), p('gpio3', 'IO', 'bottom', 0.66, 'gpio'),
  ]),
  dsp: part('dsp', 'compute', 'DSP', 150, 90, [
    ...pwr(),
    p('spi', 'SPI', 'right', 0.33, 'spi'), p('i2c', 'I2C', 'right', 0.66, 'i2c'),
    p('adc1', 'ADC', 'bottom', 0.33, 'adc'), p('adc2', 'ADC', 'bottom', 0.66, 'adc'),
  ]),
  // Sensors
  temp: part('temp', 'sensors', 'Temp sensor', 130, 70, [...pwr(), p('i2c', 'I2C', 'right', 0.5, 'i2c')]),
  imu: part('imu', 'sensors', 'IMU', 130, 70, [...pwr(), p('i2c', 'I2C', 'right', 0.35, 'i2c'), p('spi', 'SPI', 'right', 0.7, 'spi')]),
  gps: part('gps', 'sensors', 'GPS', 130, 70, [...pwr(), p('uart', 'UART', 'right', 0.5, 'uart'), p('ant', 'ANT', 'top', 0.5, 'rf')]),
  camera: part('camera', 'sensors', 'Camera', 140, 80, [...pwr(), p('i2c', 'CTRL', 'right', 0.3, 'i2c'), p('spi', 'DATA', 'right', 0.7, 'spi')]),
  adcin: part('adcin', 'sensors', 'Analog input', 130, 70, [...pwr(), p('out', 'OUT', 'right', 0.5, 'adc')]),
  sensor: part('sensor', 'sensors', 'Sensor', 130, 70, [...pwr(), p('i2c', 'I2C', 'right', 0.35, 'i2c'), p('int', 'INT', 'right', 0.7, 'gpio')]),
  // Actuators (power on top, control on the left)
  motor: part('motor', 'actuators', 'Motor + driver', 150, 80, [...pwr('top'), p('pwm', 'PWM', 'left', 0.5, 'pwm')]),
  servo: part('servo', 'actuators', 'Servo', 130, 70, [...pwr('top'), p('pwm', 'PWM', 'left', 0.5, 'pwm')]),
  relay: part('relay', 'actuators', 'Relay', 130, 70, [...pwr('top'), p('in', 'IN', 'left', 0.5, 'gpio')]),
  led: part('led', 'actuators', 'LED', 110, 60, [...pwr('top'), p('in', 'IN', 'left', 0.5, 'gpio')]),
  display: part('display', 'actuators', 'Display', 150, 80, [...pwr('top'), p('i2c', 'I2C', 'left', 0.35, 'i2c'), p('spi', 'SPI', 'left', 0.7, 'spi')]),
  buzzer: part('buzzer', 'actuators', 'Buzzer', 110, 60, [...pwr('top'), p('in', 'IN', 'left', 0.5, 'pwm')]),
  // Power (outputs on the right)
  battery: part('battery', 'power', 'Battery', 130, 70, [p('out', 'OUT', 'right', 0.35, 'power'), p('gnd', 'GND', 'right', 0.7, 'gnd')]),
  regulator: part('regulator', 'power', 'Regulator', 140, 70, [p('in', 'IN', 'left', 0.5, 'power'), p('out', 'OUT', 'right', 0.35, 'power'), p('gnd', 'GND', 'right', 0.7, 'gnd')]),
  charger: part('charger', 'power', 'Charger', 140, 70, [p('in', 'USB IN', 'left', 0.5, 'usb'), p('out', 'OUT', 'right', 0.35, 'power'), p('gnd', 'GND', 'right', 0.7, 'gnd'), p('bat', 'BAT', 'bottom', 0.5, 'power')]),
  solar: part('solar', 'power', 'Solar panel', 130, 70, [p('out', 'OUT', 'right', 0.5, 'power')]),
  jack: part('jack', 'power', 'Power jack', 120, 60, [p('out', 'OUT', 'right', 0.35, 'power'), p('gnd', 'GND', 'right', 0.7, 'gnd')]),
  // Connectivity
  wifi: part('wifi', 'connectivity', 'WiFi / BLE', 140, 75, [...pwr(), p('uart', 'UART', 'right', 0.3, 'uart'), p('spi', 'SPI', 'right', 0.6, 'spi'), p('ant', 'ANT', 'top', 0.5, 'rf')]),
  lora: part('lora', 'connectivity', 'LoRa', 140, 75, [...pwr(), p('spi', 'SPI', 'right', 0.5, 'spi'), p('ant', 'ANT', 'top', 0.5, 'rf')]),
  cellular: part('cellular', 'connectivity', 'Cellular', 140, 75, [...pwr(), p('uart', 'UART', 'right', 0.5, 'uart'), p('ant', 'ANT', 'top', 0.5, 'rf')]),
  ethphy: part('ethphy', 'connectivity', 'Ethernet PHY', 140, 75, [...pwr(), p('eth', 'ETH', 'right', 0.5, 'eth'), p('mii', 'MII', 'bottom', 0.5, 'gpio')]),
  usbport: part('usbport', 'connectivity', 'USB port', 110, 60, [p('usb', 'USB', 'right', 0.5, 'usb')]),
  cantrx: part('cantrx', 'connectivity', 'CAN transceiver', 140, 70, [...pwr('top'), p('mcu', 'TX/RX', 'left', 0.5, 'can'), p('bus', 'BUS', 'right', 0.5, 'can')]),
  antenna: part('antenna', 'connectivity', 'RF antenna', 100, 60, [p('feed', 'FEED', 'bottom', 0.5, 'rf')]),
  // Storage / Misc
  eeprom: part('eeprom', 'misc', 'EEPROM / Flash', 140, 70, [...pwr(), p('spi', 'SPI', 'right', 0.35, 'spi'), p('i2c', 'I2C', 'right', 0.7, 'i2c')]),
  sdcard: part('sdcard', 'misc', 'SD card', 130, 70, [...pwr(), p('spi', 'SPI', 'right', 0.5, 'spi')]),
  rtc: part('rtc', 'misc', 'RTC', 120, 65, [...pwr(), p('i2c', 'I2C', 'right', 0.5, 'i2c')]),
  crystal: part('crystal', 'misc', 'Crystal', 100, 50, [p('osc', 'OSC', 'right', 0.5, 'gpio')]),
  debug: part('debug', 'misc', 'Debug header', 130, 60, [p('swd', 'SWD', 'right', 0.35, 'gpio'), p('uart', 'UART', 'right', 0.7, 'uart')]),
  ic: part('ic', 'misc', 'Generic IC', 130, 80, [...pwr(), p('io1', 'IO', 'right', 0.35, 'gpio'), p('io2', 'IO', 'right', 0.7, 'gpio')]),
  generic: part('generic', 'misc', 'Custom box', 140, 80, [
    p('top', 'P1', 'top', 0.5, 'gpio'), p('right', 'P2', 'right', 0.5, 'gpio'),
    p('bottom', 'P3', 'bottom', 0.5, 'gpio'), p('left', 'P4', 'left', 0.5, 'gpio'),
  ]),
};

export function getPart(kind) {
  return PARTS[kind] ?? PARTS.generic;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore src/buses.js src/palette.js tests/
git commit -m "feat: scaffold + bus and palette data modules"
```

---

### Task 2: Geometry module

**Files:**
- Create: `src/geometry.js`
- Test: `tests/geometry.test.js`

**Interfaces:**
- Consumes: nothing (pure math).
- Produces:
  - `snap(v, grid=8) -> number`
  - `nodeRect(node) -> {x,y,w,h}`
  - `portPosition(node, portDef) -> {x,y}` (portDef is a palette port `{side, offset}`)
  - `portNormal(side) -> {x,y}` unit outward normal
  - `wirePath(a, sideA, b, sideB) -> string` SVG cubic path
  - `wireMidpoint(a, sideA, b, sideB) -> {x,y}` point at t=0.5
  - `rectContains(r, p) -> boolean`, `rectsIntersect(r1, r2) -> boolean`
  - `normRect(x1,y1,x2,y2) -> {x,y,w,h}`
  - `wrapText(text, maxChars=22) -> string[]`
  - `NOTE_W = 160`, `noteHeight(text) -> number`
  - `contentBounds(doc) -> {x,y,w,h} | null`

- [ ] **Step 1: Write the failing tests**

`tests/geometry.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snap, nodeRect, portPosition, portNormal, wirePath, wireMidpoint,
  rectContains, rectsIntersect, normRect, wrapText, noteHeight, NOTE_W, contentBounds,
} from '../src/geometry.js';

const node = { x: 100, y: 200, w: 160, h: 100 };

test('snap rounds to grid', () => {
  assert.equal(snap(11), 8);
  assert.equal(snap(12), 16);
  assert.equal(snap(-3), 0);
  assert.equal(snap(25, 10), 30);
});

test('portPosition on each side', () => {
  assert.deepEqual(portPosition(node, { side: 'left', offset: 0.5 }), { x: 100, y: 250 });
  assert.deepEqual(portPosition(node, { side: 'right', offset: 0.5 }), { x: 260, y: 250 });
  assert.deepEqual(portPosition(node, { side: 'top', offset: 0.25 }), { x: 140, y: 200 });
  assert.deepEqual(portPosition(node, { side: 'bottom', offset: 1 }), { x: 260, y: 300 });
});

test('portNormal points outward', () => {
  assert.deepEqual(portNormal('left'), { x: -1, y: 0 });
  assert.deepEqual(portNormal('right'), { x: 1, y: 0 });
  assert.deepEqual(portNormal('top'), { x: 0, y: -1 });
  assert.deepEqual(portNormal('bottom'), { x: 0, y: 1 });
});

test('wirePath is a cubic from a to b', () => {
  const d = wirePath({ x: 0, y: 0 }, 'right', { x: 100, y: 0 }, 'left');
  assert.match(d, /^M 0 0 C /);
  assert.match(d, / 100 0$/);
});

test('wireMidpoint of a horizontal symmetric wire sits between endpoints', () => {
  const m = wireMidpoint({ x: 0, y: 0 }, 'right', { x: 100, y: 0 }, 'left');
  assert.equal(m.x, 50);
  assert.equal(m.y, 0);
});

test('rect helpers', () => {
  assert.ok(rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5 }));
  assert.ok(!rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 15, y: 5 }));
  assert.ok(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }));
  assert.ok(!rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 }));
  assert.deepEqual(normRect(10, 10, 0, 5), { x: 0, y: 5, w: 10, h: 5 });
});

test('wrapText wraps at maxChars and never returns empty', () => {
  assert.deepEqual(wrapText('short'), ['short']);
  const lines = wrapText('one two three four five six seven eight nine ten', 12);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(l.length <= 12 || !l.includes(' '));
  assert.deepEqual(wrapText(''), ['']);
});

test('noteHeight grows with lines', () => {
  assert.equal(noteHeight('short'), 32);
  assert.ok(noteHeight('a very long note that definitely wraps onto multiple lines for sure') > 32);
});

test('contentBounds covers nodes, zones, notes; null when empty', () => {
  const doc = {
    nodes: [{ x: 100, y: 100, w: 50, h: 50 }],
    zones: [{ x: 0, y: 0, w: 80, h: 80 }],
    notes: [{ x: 200, y: 10, text: 'hi' }],
    wires: [],
  };
  const b = contentBounds(doc);
  assert.equal(b.x, 0);
  assert.equal(b.y, 0);
  assert.equal(b.w, 200 + NOTE_W);
  assert.ok(b.h >= 150);
  assert.equal(contentBounds({ nodes: [], zones: [], notes: [], wires: [] }), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../src/geometry.js`

- [ ] **Step 3: Implement `src/geometry.js`**

```js
export function snap(v, grid = 8) {
  return Math.round(v / grid) * grid;
}

export function nodeRect(node) {
  return { x: node.x, y: node.y, w: node.w, h: node.h };
}

export function portPosition(node, portDef) {
  const { side, offset } = portDef;
  if (side === 'left') return { x: node.x, y: node.y + node.h * offset };
  if (side === 'right') return { x: node.x + node.w, y: node.y + node.h * offset };
  if (side === 'top') return { x: node.x + node.w * offset, y: node.y };
  return { x: node.x + node.w * offset, y: node.y + node.h };
}

export function portNormal(side) {
  return {
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    top: { x: 0, y: -1 },
    bottom: { x: 0, y: 1 },
  }[side];
}

function controls(a, sideA, b, sideB) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const ext = Math.min(120, Math.max(30, dist * 0.4));
  const na = portNormal(sideA);
  const nb = portNormal(sideB);
  return [
    { x: a.x + na.x * ext, y: a.y + na.y * ext },
    { x: b.x + nb.x * ext, y: b.y + nb.y * ext },
  ];
}

export function wirePath(a, sideA, b, sideB) {
  const [c1, c2] = controls(a, sideA, b, sideB);
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
}

export function wireMidpoint(a, sideA, b, sideB) {
  const [c1, c2] = controls(a, sideA, b, sideB);
  const t = 0.5;
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
  };
}

export function rectContains(r, p) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function rectsIntersect(r1, r2) {
  return r1.x < r2.x + r2.w && r2.x < r1.x + r1.w && r1.y < r2.y + r2.h && r2.y < r1.y + r1.h;
}

export function normRect(x1, y1, x2, y2) {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

export function wrapText(text, maxChars = 22) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line && (line + ' ' + w).length > maxChars) {
      lines.push(line);
      line = w;
    } else {
      line = line ? line + ' ' + w : w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export const NOTE_W = 160;

export function noteHeight(text) {
  return 16 + wrapText(text).length * 16;
}

export function contentBounds(doc) {
  const rects = [
    ...doc.nodes.map(nodeRect),
    ...doc.zones.map((z) => ({ x: z.x, y: z.y, w: z.w, h: z.h })),
    ...doc.notes.map((n) => ({ x: n.x, y: n.y, w: NOTE_W, h: noteHeight(n.text) })),
  ];
  if (!rects.length) return null;
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all tests including Task 1's)

- [ ] **Step 5: Commit**

```bash
git add src/geometry.js tests/geometry.test.js
git commit -m "feat: geometry module (ports, wire paths, rects, text wrap, bounds)"
```

---

### Task 3: State store and actions

**Files:**
- Create: `src/state.js`
- Test: `tests/state.test.js`

**Interfaces:**
- Consumes: `getPart` from `palette.js`.
- Produces:
  - `uid(prefix) -> string`
  - `newDoc(title='Untitled Board') -> doc` (`{schema:1, title, nodes:[], wires:[], zones:[], notes:[]}`)
  - `class Store`: `doc`, `selection: Set<string>`, `subscribe(fn) -> unsubscribe`, `emit()`, `apply(fn)`, `mutate(fn)`, `beginDrag()`, `endDrag()`, `cancelDrag()`, `undo()`, `redo()`, `canUndo()`, `canRedo()`, `replaceDoc(doc)`, `setSelection(ids)`, `toggleSelection(id)`, `clearSelection()`
  - Actions: `addNode(store, kind, x, y) -> id`, `addWire(store, bus, from, to) -> id` (from/to are `{node, port}`), `addZone(store, rect, label='Zone') -> id`, `addNote(store, x, y, text='Note') -> id`, `findItem(doc, id) -> {type, item} | null` (type is `'node'|'wire'|'zone'|'note'`), `updateItem(store, id, props)`, `deleteItems(store, ids)`, `duplicateItems(store, ids) -> newIds`

- [ ] **Step 1: Write the failing tests**

`tests/state.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  uid, newDoc, Store, addNode, addWire, addZone, addNote,
  findItem, updateItem, deleteItems, duplicateItems,
} from '../src/state.js';
import { PARTS } from '../src/palette.js';

test('uid is unique and prefixed', () => {
  const a = uid('n');
  const b = uid('n');
  assert.notEqual(a, b);
  assert.ok(a.startsWith('n'));
});

test('newDoc shape', () => {
  const doc = newDoc('X');
  assert.deepEqual(doc, { schema: 1, title: 'X', nodes: [], wires: [], zones: [], notes: [] });
});

test('addNode uses part defaults', () => {
  const store = new Store();
  const id = addNode(store, 'mcu', 100, 50);
  const node = store.doc.nodes[0];
  assert.equal(node.id, id);
  assert.equal(node.kind, 'mcu');
  assert.equal(node.w, PARTS.mcu.w);
  assert.equal(node.label, 'MCU');
  assert.equal(node.sublabel, '');
});

test('addNode with unknown kind becomes generic', () => {
  const store = new Store();
  addNode(store, 'nope', 0, 0);
  assert.equal(store.doc.nodes[0].kind, 'generic');
});

test('updateItem and findItem', () => {
  const store = new Store();
  const id = addNode(store, 'mcu', 0, 0);
  updateItem(store, id, { label: 'Brain', sublabel: 'STM32' });
  const found = findItem(store.doc, id);
  assert.equal(found.type, 'node');
  assert.equal(found.item.label, 'Brain');
  assert.equal(findItem(store.doc, 'missing'), null);
});

test('undo/redo roundtrip', () => {
  const store = new Store();
  addNode(store, 'mcu', 0, 0);
  assert.equal(store.doc.nodes.length, 1);
  assert.ok(store.canUndo());
  store.undo();
  assert.equal(store.doc.nodes.length, 0);
  assert.ok(store.canRedo());
  store.redo();
  assert.equal(store.doc.nodes.length, 1);
});

test('new apply clears redo stack', () => {
  const store = new Store();
  addNode(store, 'mcu', 0, 0);
  store.undo();
  addNode(store, 'temp', 0, 0);
  assert.ok(!store.canRedo());
});

test('undo stack caps at 100', () => {
  const store = new Store();
  for (let i = 0; i < 120; i++) store.apply((doc) => { doc.title = `t${i}`; });
  assert.equal(store.undoStack.length, 100);
});

test('drag lifecycle creates one undo entry only when changed', () => {
  const store = new Store();
  const id = addNode(store, 'mcu', 0, 0);
  const depth = store.undoStack.length;
  store.beginDrag();
  store.mutate((doc) => { doc.nodes[0].x = 200; });
  store.endDrag();
  assert.equal(store.undoStack.length, depth + 1);
  store.undo();
  assert.equal(store.doc.nodes[0].x, 0);
  // no-op drag adds nothing
  const depth2 = store.undoStack.length;
  store.beginDrag();
  store.endDrag();
  assert.equal(store.undoStack.length, depth2);
  assert.ok(findItem(store.doc, id));
});

test('cancelDrag restores the snapshot', () => {
  const store = new Store();
  addNode(store, 'mcu', 0, 0);
  store.beginDrag();
  store.mutate((doc) => { doc.nodes[0].x = 999; });
  store.cancelDrag();
  assert.equal(store.doc.nodes[0].x, 0);
});

test('deleteItems cascades to attached wires', () => {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  const w = addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  deleteItems(store, [b]);
  assert.equal(store.doc.nodes.length, 1);
  assert.equal(store.doc.wires.length, 0);
  assert.ok(findItem(store.doc, a));
  assert.equal(findItem(store.doc, w), null);
});

test('deleteItems with empty list is a no-op (no undo entry)', () => {
  const store = new Store();
  addNode(store, 'mcu', 0, 0);
  const depth = store.undoStack.length;
  deleteItems(store, []);
  assert.equal(store.undoStack.length, depth);
});

test('duplicateItems clones nodes, remaps internal wires, offsets copies', () => {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  const newIds = duplicateItems(store, [a, b]);
  assert.equal(newIds.length, 2);
  assert.equal(store.doc.nodes.length, 4);
  assert.equal(store.doc.wires.length, 2);
  const clone = store.doc.nodes.find((n) => n.id === newIds[0]);
  assert.equal(clone.x, 16);
  const newWire = store.doc.wires[1];
  assert.ok(newIds.includes(newWire.from.node));
  assert.ok(newIds.includes(newWire.to.node));
});

test('duplicateItems drops wires crossing the selection boundary', () => {
  const store = new Store();
  const a = addNode(store, 'mcu', 0, 0);
  const b = addNode(store, 'temp', 300, 0);
  addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  duplicateItems(store, [a]);
  assert.equal(store.doc.wires.length, 1);
});

test('zones and notes add and duplicate', () => {
  const store = new Store();
  const z = addZone(store, { x: 0, y: 0, w: 100, h: 100 });
  const t = addNote(store, 10, 10, 'hello');
  assert.equal(findItem(store.doc, z).type, 'zone');
  assert.equal(findItem(store.doc, t).type, 'note');
  const ids = duplicateItems(store, [z, t]);
  assert.equal(ids.length, 2);
  assert.equal(store.doc.zones.length, 2);
  assert.equal(store.doc.notes.length, 2);
});

test('selection prunes after undo removes items', () => {
  const store = new Store();
  const id = addNode(store, 'mcu', 0, 0);
  store.setSelection([id]);
  store.undo();
  assert.equal(store.selection.size, 0);
});

test('subscribe fires on emit and unsubscribes', () => {
  const store = new Store();
  let calls = 0;
  const off = store.subscribe(() => calls++);
  addNode(store, 'mcu', 0, 0);
  off();
  addNode(store, 'mcu', 0, 0);
  assert.equal(calls, 1);
});

test('replaceDoc resets history and selection', () => {
  const store = new Store();
  const id = addNode(store, 'mcu', 0, 0);
  store.setSelection([id]);
  store.replaceDoc(newDoc());
  assert.ok(!store.canUndo());
  assert.ok(!store.canRedo());
  assert.equal(store.selection.size, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../src/state.js`

- [ ] **Step 3: Implement `src/state.js`**

```js
import { getPart } from './palette.js';

let counter = 0;

export function uid(prefix = 'id') {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

export function newDoc(title = 'Untitled Board') {
  return { schema: 1, title, nodes: [], wires: [], zones: [], notes: [] };
}

const MAX_UNDO = 100;

export class Store {
  constructor(doc = newDoc()) {
    this.doc = doc;
    this.undoStack = [];
    this.redoStack = [];
    this.selection = new Set();
    this.listeners = new Set();
    this._dragSnap = null;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn();
  }

  _push(snap) {
    this.undoStack.push(snap);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  apply(fn) {
    const snap = structuredClone(this.doc);
    fn(this.doc);
    this._push(snap);
    this.emit();
  }

  mutate(fn) {
    fn(this.doc);
    this.emit();
  }

  beginDrag() {
    this._dragSnap = structuredClone(this.doc);
  }

  endDrag() {
    if (this._dragSnap && JSON.stringify(this._dragSnap) !== JSON.stringify(this.doc)) {
      this._push(this._dragSnap);
    }
    this._dragSnap = null;
    this.emit();
  }

  cancelDrag() {
    if (this._dragSnap) {
      this.doc = this._dragSnap;
      this._dragSnap = null;
      this.emit();
    }
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  undo() {
    if (!this.canUndo()) return;
    this.redoStack.push(structuredClone(this.doc));
    this.doc = this.undoStack.pop();
    this._pruneSelection();
    this.emit();
  }

  redo() {
    if (!this.canRedo()) return;
    this.undoStack.push(structuredClone(this.doc));
    this.doc = this.redoStack.pop();
    this._pruneSelection();
    this.emit();
  }

  replaceDoc(doc) {
    this.doc = doc;
    this.undoStack = [];
    this.redoStack = [];
    this.selection.clear();
    this.emit();
  }

  setSelection(ids) {
    this.selection = new Set(ids);
    this.emit();
  }

  toggleSelection(id) {
    if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
    this.emit();
  }

  clearSelection() {
    if (this.selection.size) {
      this.selection.clear();
      this.emit();
    }
  }

  _pruneSelection() {
    const ids = new Set(
      [...this.doc.nodes, ...this.doc.wires, ...this.doc.zones, ...this.doc.notes].map((i) => i.id),
    );
    for (const id of [...this.selection]) {
      if (!ids.has(id)) this.selection.delete(id);
    }
  }
}

export function addNode(store, kind, x, y) {
  const part = getPart(kind);
  const id = uid('n');
  store.apply((doc) => {
    doc.nodes.push({
      id, kind: part.kind, x, y, w: part.w, h: part.h,
      label: part.name, sublabel: '', color: null,
    });
  });
  return id;
}

export function addWire(store, bus, from, to) {
  const id = uid('w');
  store.apply((doc) => {
    doc.wires.push({ id, bus, from, to, label: '' });
  });
  return id;
}

export function addZone(store, rect, label = 'Zone') {
  const id = uid('z');
  store.apply((doc) => {
    doc.zones.push({ id, x: rect.x, y: rect.y, w: rect.w, h: rect.h, label, color: '#4a90d9' });
  });
  return id;
}

export function addNote(store, x, y, text = 'Note') {
  const id = uid('t');
  store.apply((doc) => {
    doc.notes.push({ id, x, y, text });
  });
  return id;
}

export function findItem(doc, id) {
  for (const [type, arr] of [
    ['node', doc.nodes], ['wire', doc.wires], ['zone', doc.zones], ['note', doc.notes],
  ]) {
    const item = arr.find((i) => i.id === id);
    if (item) return { type, item };
  }
  return null;
}

export function updateItem(store, id, props) {
  store.apply((doc) => {
    const found = findItem(doc, id);
    if (found) Object.assign(found.item, props);
  });
}

export function deleteItems(store, ids) {
  if (!ids.length) return;
  const dead = new Set(ids);
  store.apply((doc) => {
    doc.nodes = doc.nodes.filter((n) => !dead.has(n.id));
    doc.zones = doc.zones.filter((z) => !dead.has(z.id));
    doc.notes = doc.notes.filter((n) => !dead.has(n.id));
    doc.wires = doc.wires.filter(
      (w) => !dead.has(w.id) && !dead.has(w.from.node) && !dead.has(w.to.node),
    );
  });
  for (const id of dead) store.selection.delete(id);
}

export function duplicateItems(store, ids) {
  if (!ids.length) return [];
  const src = new Set(ids);
  const map = new Map();
  const newIds = [];
  store.apply((doc) => {
    for (const n of doc.nodes.filter((n) => src.has(n.id))) {
      const id = uid('n');
      map.set(n.id, id);
      newIds.push(id);
      doc.nodes.push({ ...structuredClone(n), id, x: n.x + 16, y: n.y + 16 });
    }
    for (const z of doc.zones.filter((z) => src.has(z.id))) {
      const id = uid('z');
      newIds.push(id);
      doc.zones.push({ ...structuredClone(z), id, x: z.x + 16, y: z.y + 16 });
    }
    for (const t of doc.notes.filter((t) => src.has(t.id))) {
      const id = uid('t');
      newIds.push(id);
      doc.notes.push({ ...structuredClone(t), id, x: t.x + 16, y: t.y + 16 });
    }
    for (const w of doc.wires.filter((w) => src.has(w.from.node) && src.has(w.to.node))) {
      const id = uid('w');
      newIds.push(id);
      doc.wires.push({
        ...structuredClone(w), id,
        from: { node: map.get(w.from.node), port: w.from.port },
        to: { node: map.get(w.to.node), port: w.to.port },
      });
    }
  });
  return newIds;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add src/state.js tests/state.test.js
git commit -m "feat: document store with undo/redo, selection, and actions"
```

---

### Task 4: Serialization and validation

**Files:**
- Create: `src/serialize.js`
- Test: `tests/serialize.test.js`

**Interfaces:**
- Consumes: `BUSES`, `DEFAULT_BUS` from `buses.js`; `PARTS`, `getPart` from `palette.js`; `newDoc` from `state.js`.
- Produces:
  - `serialize(doc) -> string` (pretty JSON)
  - `deserialize(text) -> {doc, warnings: string[]}`; throws `Error` with a user-readable `.message` on malformed input. Guarantees the returned doc is fully valid: every wire references an existing node+port, every `kind` exists in `PARTS` (fallback `generic`), every `bus` exists in `BUSES` (fallback `gpio`).

- [ ] **Step 1: Write the failing tests**

`tests/serialize.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { serialize, deserialize } from '../src/serialize.js';
import { Store, addNode, addWire, addZone, addNote } from '../src/state.js';

function sampleDoc() {
  const store = new Store();
  const a = addNode(store, 'mcu', 100, 100);
  const b = addNode(store, 'temp', 400, 100);
  addWire(store, 'i2c', { node: a, port: 'i2c' }, { node: b, port: 'i2c' });
  addZone(store, { x: 50, y: 50, w: 500, h: 300 }, 'Board');
  addNote(store, 600, 50, 'remember decoupling caps');
  return store.doc;
}

test('round trip preserves the document', () => {
  const doc = sampleDoc();
  const { doc: back, warnings } = deserialize(serialize(doc));
  assert.deepEqual(back, doc);
  assert.deepEqual(warnings, []);
});

test('invalid JSON throws readable error', () => {
  assert.throws(() => deserialize('{nope'), /could not parse JSON/);
});

test('non-object top level throws', () => {
  assert.throws(() => deserialize('[1,2]'), /must be an object/);
  assert.throws(() => deserialize('"hi"'), /must be an object/);
});

test('non-array collection throws', () => {
  assert.throws(() => deserialize('{"nodes": 5}'), /"nodes" must be an array/);
});

test('missing collections default to empty; bad title falls back', () => {
  const { doc } = deserialize('{"schema": 1, "title": 7}');
  assert.equal(doc.title, 'Untitled Board');
  assert.deepEqual(doc.nodes, []);
  assert.deepEqual(doc.wires, []);
});

test('newer schema warns but loads', () => {
  const { warnings } = deserialize('{"schema": 99}');
  assert.ok(warnings.some((w) => w.includes('newer')));
});

test('unknown kind falls back to generic, keeps label and position', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    schema: 1,
    nodes: [{ id: 'n1', kind: 'quantum-cpu', x: 10, y: 20, label: 'QPU' }],
  }));
  assert.equal(doc.nodes[0].kind, 'generic');
  assert.equal(doc.nodes[0].label, 'QPU');
  assert.equal(doc.nodes[0].x, 10);
  assert.ok(warnings.length === 1);
});

test('node missing position is dropped with warning', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    nodes: [{ id: 'n1', kind: 'mcu' }],
  }));
  assert.equal(doc.nodes.length, 0);
  assert.equal(warnings.length, 1);
});

test('duplicate ids are dropped', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    nodes: [
      { id: 'n1', kind: 'mcu', x: 0, y: 0 },
      { id: 'n1', kind: 'temp', x: 100, y: 0 },
    ],
  }));
  assert.equal(doc.nodes.length, 1);
  assert.equal(doc.nodes[0].kind, 'mcu');
  assert.equal(warnings.length, 1);
});

test('dangling wire is dropped with warning', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    nodes: [{ id: 'n1', kind: 'mcu', x: 0, y: 0 }],
    wires: [
      { id: 'w1', bus: 'i2c', from: { node: 'n1', port: 'i2c' }, to: { node: 'ghost', port: 'i2c' } },
      { id: 'w2', bus: 'i2c', from: { node: 'n1', port: 'no-such-port' }, to: { node: 'n1', port: 'i2c' } },
    ],
  }));
  assert.equal(doc.wires.length, 0);
  assert.equal(warnings.length, 2);
});

test('unknown bus falls back to gpio with warning', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    nodes: [
      { id: 'n1', kind: 'mcu', x: 0, y: 0 },
      { id: 'n2', kind: 'temp', x: 300, y: 0 },
    ],
    wires: [{ id: 'w1', bus: 'hyperbus', from: { node: 'n1', port: 'i2c' }, to: { node: 'n2', port: 'i2c' } }],
  }));
  assert.equal(doc.wires[0].bus, 'gpio');
  assert.ok(warnings.some((w) => w.includes('hyperbus')));
});

test('zones and notes are validated', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    zones: [{ id: 'z1', x: 0, y: 0, w: 100, h: 100 }, { id: 'z2', x: 0, y: 0 }],
    notes: [{ id: 't1', x: 5, y: 5, text: 'hi' }, { id: 't2', text: 'no position' }],
  }));
  assert.equal(doc.zones.length, 1);
  assert.equal(doc.zones[0].label, 'Zone');
  assert.equal(doc.notes.length, 1);
  assert.equal(warnings.length, 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module .../src/serialize.js`

- [ ] **Step 3: Implement `src/serialize.js`**

```js
import { BUSES, DEFAULT_BUS } from './buses.js';
import { PARTS, getPart } from './palette.js';
import { newDoc } from './state.js';

export function serialize(doc) {
  return JSON.stringify(doc, null, 2);
}

export function deserialize(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Not a valid Schematica file: could not parse JSON.');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Not a valid Schematica file: top level must be an object.');
  }
  for (const key of ['nodes', 'wires', 'zones', 'notes']) {
    if (raw[key] !== undefined && !Array.isArray(raw[key])) {
      throw new Error(`Not a valid Schematica file: "${key}" must be an array.`);
    }
  }

  const warnings = [];
  if (typeof raw.schema === 'number' && raw.schema > 1) {
    warnings.push(`File schema ${raw.schema} is newer than this app understands (1); loading best-effort.`);
  }

  const doc = newDoc(typeof raw.title === 'string' && raw.title.trim() ? raw.title : 'Untitled Board');
  const seen = new Set();
  const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
  const validId = (v) => typeof v === 'string' && v.length > 0;

  for (const n of raw.nodes ?? []) {
    if (!n || !validId(n.id) || !Number.isFinite(n.x) || !Number.isFinite(n.y)) {
      warnings.push('Dropped a node with a missing id or position.');
      continue;
    }
    if (seen.has(n.id)) {
      warnings.push(`Dropped duplicate id "${n.id}".`);
      continue;
    }
    seen.add(n.id);
    let kind = typeof n.kind === 'string' ? n.kind : 'generic';
    if (!PARTS[kind]) {
      warnings.push(`Unknown part "${kind}" became a custom box.`);
      kind = 'generic';
    }
    const part = PARTS[kind];
    doc.nodes.push({
      id: n.id, kind, x: n.x, y: n.y,
      w: num(n.w, part.w), h: num(n.h, part.h),
      label: typeof n.label === 'string' ? n.label : part.name,
      sublabel: typeof n.sublabel === 'string' ? n.sublabel : '',
      color: typeof n.color === 'string' ? n.color : null,
    });
  }

  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]));
  const hasPort = (ref) => {
    if (!ref || typeof ref !== 'object') return false;
    const node = nodeById.get(ref.node);
    return !!node && getPart(node.kind).ports.some((p) => p.id === ref.port);
  };

  for (const w of raw.wires ?? []) {
    if (!w || !validId(w.id) || seen.has(w.id) || !hasPort(w.from) || !hasPort(w.to)) {
      warnings.push('Dropped a wire with a bad id or missing endpoint.');
      continue;
    }
    seen.add(w.id);
    let bus = typeof w.bus === 'string' ? w.bus : DEFAULT_BUS;
    if (!BUSES[bus]) {
      warnings.push(`Unknown bus "${bus}" became ${BUSES[DEFAULT_BUS].short}.`);
      bus = DEFAULT_BUS;
    }
    doc.wires.push({
      id: w.id, bus,
      from: { node: w.from.node, port: w.from.port },
      to: { node: w.to.node, port: w.to.port },
      label: typeof w.label === 'string' ? w.label : '',
    });
  }

  for (const z of raw.zones ?? []) {
    if (!z || !validId(z.id) || seen.has(z.id) || !Number.isFinite(z.x) || !Number.isFinite(z.y)
      || !Number.isFinite(z.w) || !Number.isFinite(z.h)) {
      warnings.push('Dropped a zone with a bad id or geometry.');
      continue;
    }
    seen.add(z.id);
    doc.zones.push({
      id: z.id, x: z.x, y: z.y, w: z.w, h: z.h,
      label: typeof z.label === 'string' ? z.label : 'Zone',
      color: typeof z.color === 'string' ? z.color : '#4a90d9',
    });
  }

  for (const t of raw.notes ?? []) {
    if (!t || !validId(t.id) || seen.has(t.id) || !Number.isFinite(t.x) || !Number.isFinite(t.y)) {
      warnings.push('Dropped a note with a bad id or position.');
      continue;
    }
    seen.add(t.id);
    doc.notes.push({ id: t.id, x: t.x, y: t.y, text: typeof t.text === 'string' ? t.text : '' });
  }

  return { doc, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add src/serialize.js tests/serialize.test.js
git commit -m "feat: JSON serialization with validation, fallbacks, and warnings"
```

---

### Task 5: App shell and SVG renderer

**Files:**
- Create: `index.html`, `css/style.css`, `src/render.js`, `src/main.js`

**Interfaces:**
- Consumes: `BUSES` from `buses.js`; `getPart` from `palette.js`; `portPosition`, `wirePath`, `wireMidpoint`, `wrapText`, `noteHeight`, `NOTE_W` from `geometry.js`.
- Produces:
  - `render.js`: `esc(s) -> string` (XML escape), `diagramMarkup(doc, ui={}) -> string` (zones/wires/nodes/notes layer groups; `ui.selection: Set`, `ui.hoverPort: {node,port}|null`), `createRenderer(svg) -> { render(doc, view, ui) }` where `view = {x, y, zoom}` and `ui` adds `marquee: {x,y,w,h}|null`, `wireDraft: {from:{node,port}, cursor:{x,y}}|null`, `grid: boolean`.
  - `index.html` element ids used by later tasks: `canvas` (the `<svg>`), `canvas-wrap`, `palette`, `props`, `toolbar`, `title`, `tool-select`, `tool-wire`, `tool-zone`, `tool-note`, `undo`, `redo`, `zoom-out`, `zoom-in`, `zoom-label`, `zoom-reset`, `btn-grid`, `btn-legend`, `btn-new`, `btn-open`, `btn-save`, `btn-export-svg`, `btn-export-png`, `legend`, `bus-popover`, `inline-editor`, `file-input`.

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Schematica</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div id="app">
    <header id="toolbar">
      <span id="brand">Schematica</span>
      <input id="title" type="text" spellcheck="false" aria-label="Board title">
      <div class="group" role="group" aria-label="Tools">
        <button id="tool-select" data-tool="select" class="tool active" title="Select / move (V)">Select</button>
        <button id="tool-wire" data-tool="wire" class="tool" title="Draw wire (C)">Wire</button>
        <button id="tool-zone" data-tool="zone" class="tool" title="Draw zone (Z)">Zone</button>
        <button id="tool-note" data-tool="note" class="tool" title="Add note (N)">Note</button>
      </div>
      <div class="group">
        <button id="undo" title="Undo (Ctrl/Cmd-Z)" disabled>&#8630;</button>
        <button id="redo" title="Redo (Ctrl/Cmd-Shift-Z)" disabled>&#8631;</button>
      </div>
      <div class="group">
        <button id="zoom-out" title="Zoom out">&minus;</button>
        <button id="zoom-reset" title="Reset zoom"><span id="zoom-label">100%</span></button>
        <button id="zoom-in" title="Zoom in">+</button>
      </div>
      <div class="group">
        <button id="btn-grid" class="active" title="Toggle grid snap + dots">Grid</button>
        <button id="btn-legend" title="Toggle bus legend">Legend</button>
      </div>
      <div class="group push-right">
        <button id="btn-new" title="Clear board">New</button>
        <button id="btn-open" title="Open .schematica.json">Open</button>
        <button id="btn-save" title="Download .schematica.json">Save</button>
        <button id="btn-export-svg" title="Export SVG">SVG</button>
        <button id="btn-export-png" title="Export PNG">PNG</button>
      </div>
    </header>
    <aside id="palette"></aside>
    <main id="canvas-wrap">
      <svg id="canvas">
        <defs>
          <pattern id="gridpat" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#d6d3d1"></circle>
          </pattern>
        </defs>
      </svg>
      <div id="legend" hidden></div>
      <div id="bus-popover" hidden></div>
      <input id="inline-editor" type="text" spellcheck="false" hidden>
    </main>
    <aside id="props" hidden></aside>
  </div>
  <input type="file" id="file-input" accept=".json,application/json" hidden>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `css/style.css`**

```css
* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  color: #e2e8f0;
  background: #0f172a;
}

#app {
  height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
  grid-template-columns: 220px 1fr auto;
  grid-template-areas:
    "toolbar toolbar toolbar"
    "palette canvas props";
}

/* ---- Toolbar ---- */
#toolbar {
  grid-area: toolbar;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
}

#brand { font-weight: 800; letter-spacing: 0.5px; color: #7dd3fc; }

#title {
  background: #0f172a;
  border: 1px solid #334155;
  color: #e2e8f0;
  border-radius: 6px;
  padding: 5px 8px;
  width: 180px;
}

.group { display: flex; gap: 4px; align-items: center; }
.push-right { margin-left: auto; }

#toolbar button {
  background: #0f172a;
  border: 1px solid #334155;
  color: #cbd5e1;
  border-radius: 6px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 13px;
}
#toolbar button:hover:not(:disabled) { border-color: #7dd3fc; color: #f8fafc; }
#toolbar button:disabled { opacity: 0.4; cursor: default; }
#toolbar button.active { background: #0369a1; border-color: #0ea5e9; color: #f0f9ff; }

/* ---- Palette ---- */
#palette {
  grid-area: palette;
  overflow-y: auto;
  background: #1e293b;
  border-right: 1px solid #334155;
  padding: 8px;
}
#palette h3 {
  margin: 10px 4px 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #94a3b8;
  cursor: pointer;
  user-select: none;
}
#palette h3::before { content: "▾ "; }
#palette h3.collapsed::before { content: "▸ "; }
.palette-item {
  display: block;
  width: 100%;
  text-align: left;
  background: #0f172a;
  border: 1px solid #334155;
  color: #e2e8f0;
  border-radius: 6px;
  padding: 6px 8px;
  margin-bottom: 4px;
  cursor: grab;
  font-size: 13px;
}
.palette-item:hover { border-color: #7dd3fc; }

/* ---- Canvas ---- */
#canvas-wrap { grid-area: canvas; position: relative; overflow: hidden; }
#canvas {
  width: 100%;
  height: 100%;
  display: block;
  background: #f7f7f5;
  touch-action: none;
}
#canvas.panning { cursor: grab; }
#canvas.tool-wire .port { cursor: crosshair; }

/* ---- Properties panel ---- */
#props {
  grid-area: props;
  width: 260px;
  background: #1e293b;
  border-left: 1px solid #334155;
  padding: 12px;
  overflow-y: auto;
}
#props h3 { margin: 0 0 10px; font-size: 13px; color: #7dd3fc; }
#props label { display: block; font-size: 11px; color: #94a3b8; margin: 10px 0 3px; }
#props input[type="text"], #props textarea, #props select {
  width: 100%;
  background: #0f172a;
  border: 1px solid #334155;
  color: #e2e8f0;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 13px;
  font-family: inherit;
}
#props textarea { min-height: 70px; resize: vertical; }
#props button {
  margin-top: 12px;
  background: #7f1d1d;
  border: 1px solid #b91c1c;
  color: #fecaca;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
}

/* ---- Legend ---- */
#legend {
  position: absolute;
  right: 12px;
  bottom: 12px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 10px 12px;
  color: #0f172a;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
}
#legend h3 { margin: 0 0 6px; font-size: 12px; }
.legend-row { display: flex; align-items: center; gap: 8px; font-size: 12px; line-height: 1.7; }

/* ---- Bus popover ---- */
#bus-popover {
  position: fixed;
  z-index: 30;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.25);
  max-height: 300px;
  overflow-y: auto;
}
#bus-popover button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 160px;
  background: none;
  border: none;
  border-radius: 5px;
  padding: 5px 8px;
  cursor: pointer;
  font-size: 13px;
  color: #0f172a;
  text-align: left;
}
#bus-popover button:hover { background: #e0f2fe; }
#bus-popover .swatch { width: 20px; height: 4px; border-radius: 2px; flex: none; }

/* ---- Inline editor ---- */
#inline-editor {
  position: fixed;
  z-index: 40;
  width: 200px;
  background: #ffffff;
  color: #0f172a;
  border: 2px solid #0ea5e9;
  border-radius: 5px;
  padding: 4px 6px;
  font-size: 13px;
  font-family: inherit;
}
```

- [ ] **Step 3: Create `src/render.js`**

```js
import { BUSES } from './buses.js';
import { getPart } from './palette.js';
import {
  portPosition, wirePath, wireMidpoint, wrapText, noteHeight, NOTE_W,
} from './geometry.js';

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const GLYPHS = {
  compute: 'M3 3h10v10H3z M1 5h2 M1 8h2 M1 11h2 M13 5h2 M13 8h2 M13 11h2 M5 1v2 M8 1v2 M11 1v2 M5 13v2 M8 13v2 M11 13v2',
  sensors: 'M1 9 C 3 3, 5 3, 7 9 S 11 15, 13 9',
  actuators: 'M8 2v5 M4 5a6 6 0 1 0 8 0',
  power: 'M7 1 3 9h4l-1 6 5-8H7z',
  connectivity: 'M2 8a8 8 0 0 1 12 0 M4.5 10.5a4.5 4.5 0 0 1 7 0 M7.2 13h1.6',
  misc: 'M3 2h10v3.5H3z M3 6.5h10V10H3z M3 11h10v3H3z',
};

const SELECT_COLOR = '#2563eb';

function nodeMarkup(node, selected, hoverPort) {
  const part = getPart(node.kind);
  const stroke = selected ? SELECT_COLOR : '#334155';
  const fill = node.color || '#ffffff';
  let s = `<g class="node" data-id="${esc(node.id)}" data-type="node">`;
  s += `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="10"`
    + ` fill="${esc(fill)}" stroke="${stroke}" stroke-width="${selected ? 2.5 : 1.5}"/>`;
  s += `<g transform="translate(${node.x + 8},${node.y + 8})" stroke="#64748b" fill="none" stroke-width="1.4">`
    + `<path d="${GLYPHS[part.category] || GLYPHS.misc}"/></g>`;
  const cy = node.y + node.h / 2;
  s += `<text x="${node.x + node.w / 2}" y="${cy - (node.sublabel ? 6 : 0)}" text-anchor="middle"`
    + ` dominant-baseline="middle" font-size="13" font-weight="600" fill="#0f172a" data-edit="label">${esc(node.label)}</text>`;
  if (node.sublabel) {
    s += `<text x="${node.x + node.w / 2}" y="${cy + 12}" text-anchor="middle" dominant-baseline="middle"`
      + ` font-size="11" fill="#475569" data-edit="sublabel">${esc(node.sublabel)}</text>`;
  }
  for (const port of part.ports) {
    const pos = portPosition(node, port);
    const hot = hoverPort && hoverPort.node === node.id && hoverPort.port === port.id;
    s += `<circle class="port" data-node="${esc(node.id)}" data-port="${esc(port.id)}"`
      + ` cx="${pos.x}" cy="${pos.y}" r="${hot ? 6.5 : 4.5}"`
      + ` fill="${hot ? '#dbeafe' : '#ffffff'}" stroke="${hot ? SELECT_COLOR : '#475569'}" stroke-width="1.5"/>`;
    if (hot) {
      const bus = BUSES[port.bus];
      s += `<text x="${pos.x}" y="${pos.y - 10}" text-anchor="middle" font-size="10" font-weight="600"`
        + ` fill="#1e40af" paint-order="stroke" stroke="#ffffff" stroke-width="3" pointer-events="none">`
        + `${esc(port.name)} · ${esc(bus ? bus.short : '')}</text>`;
    }
  }
  s += '</g>';
  return s;
}

function wireMarkup(doc, wire, selected) {
  const from = doc.nodes.find((n) => n.id === wire.from.node);
  const to = doc.nodes.find((n) => n.id === wire.to.node);
  if (!from || !to) return '';
  const pf = getPart(from.kind).ports.find((p) => p.id === wire.from.port);
  const pt = getPart(to.kind).ports.find((p) => p.id === wire.to.port);
  if (!pf || !pt) return '';
  const a = portPosition(from, pf);
  const b = portPosition(to, pt);
  const bus = BUSES[wire.bus] || BUSES.gpio;
  const d = wirePath(a, pf.side, b, pt.side);
  const mid = wireMidpoint(a, pf.side, b, pt.side);
  const label = wire.label || bus.short;
  let s = `<g class="wire" data-id="${esc(wire.id)}" data-type="wire">`;
  s += `<path d="${d}" fill="none" stroke="transparent" stroke-width="12" pointer-events="stroke"/>`;
  if (selected) {
    s += `<path d="${d}" fill="none" stroke="${SELECT_COLOR}" stroke-opacity="0.3"`
      + ` stroke-width="${bus.width + 6}" stroke-linecap="round" pointer-events="none"/>`;
  }
  s += `<path d="${d}" fill="none" stroke="${bus.color}" stroke-width="${bus.width}"`
    + `${bus.dash ? ` stroke-dasharray="${bus.dash}"` : ''} stroke-linecap="round" pointer-events="none"/>`;
  s += `<text x="${mid.x}" y="${mid.y - 6}" text-anchor="middle" font-size="10.5" font-weight="600"`
    + ` fill="${bus.color}" paint-order="stroke" stroke="#f7f7f5" stroke-width="3.5" data-edit="label">${esc(label)}</text>`;
  s += '</g>';
  return s;
}

function zoneMarkup(zone, selected) {
  const color = zone.color || '#4a90d9';
  return `<g class="zone" data-id="${esc(zone.id)}" data-type="zone">`
    + `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="12"`
    + ` fill="${esc(color)}" fill-opacity="0.10" stroke="none" pointer-events="none"/>`
    + `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="12"`
    + ` fill="none" stroke="${esc(color)}" stroke-width="${selected ? 2.5 : 1.5}"`
    + `${selected ? '' : ' stroke-dasharray="7 5"'}/>`
    + `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="12"`
    + ` fill="none" stroke="transparent" stroke-width="12" pointer-events="stroke"/>`
    + `<text x="${zone.x + 12}" y="${zone.y + 20}" font-size="12" font-weight="700"`
    + ` fill="${esc(color)}" data-edit="label">${esc(zone.label)}</text></g>`;
}

function noteMarkup(note, selected) {
  const lines = wrapText(note.text);
  const h = noteHeight(note.text);
  let s = `<g class="note" data-id="${esc(note.id)}" data-type="note">`;
  s += `<rect x="${note.x}" y="${note.y}" width="${NOTE_W}" height="${h}" rx="4"`
    + ` fill="#fef9c3" stroke="${selected ? SELECT_COLOR : '#eab308'}" stroke-width="${selected ? 2 : 1}"/>`;
  lines.forEach((line, i) => {
    s += `<text x="${note.x + 10}" y="${note.y + 20 + i * 16}" font-size="12" fill="#713f12"`
      + `${i === 0 ? ' data-edit="text"' : ''}>${esc(line)}</text>`;
  });
  s += '</g>';
  return s;
}

export function diagramMarkup(doc, ui = {}) {
  const sel = ui.selection || new Set();
  const zones = doc.zones.map((z) => zoneMarkup(z, sel.has(z.id))).join('');
  const wires = doc.wires.map((w) => wireMarkup(doc, w, sel.has(w.id))).join('');
  const nodes = doc.nodes.map((n) => nodeMarkup(n, sel.has(n.id), ui.hoverPort)).join('');
  const notes = doc.notes.map((n) => noteMarkup(n, sel.has(n.id))).join('');
  return `<g class="layer-zones">${zones}</g><g class="layer-wires">${wires}</g>`
    + `<g class="layer-nodes">${nodes}</g><g class="layer-notes">${notes}</g>`;
}

function oppositeSide(side) {
  return { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[side];
}

function overlayMarkup(doc, ui) {
  let s = '<g class="layer-overlay" pointer-events="none">';
  if (ui.marquee) {
    const m = ui.marquee;
    s += `<rect x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}"`
      + ` fill="${SELECT_COLOR}" fill-opacity="0.08" stroke="${SELECT_COLOR}" stroke-dasharray="4 3"/>`;
  }
  if (ui.wireDraft) {
    const { from, cursor } = ui.wireDraft;
    const node = doc.nodes.find((n) => n.id === from.node);
    const pd = node ? getPart(node.kind).ports.find((p) => p.id === from.port) : null;
    if (node && pd) {
      const a = portPosition(node, pd);
      s += `<path d="${wirePath(a, pd.side, cursor, oppositeSide(pd.side))}" fill="none"`
        + ` stroke="${SELECT_COLOR}" stroke-width="2" stroke-dasharray="6 4"/>`;
    }
  }
  s += '</g>';
  return s;
}

function gridMarkup() {
  return '<rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#gridpat)" pointer-events="none"/>';
}

export function createRenderer(svg) {
  const NS = 'http://www.w3.org/2000/svg';
  const root = document.createElementNS(NS, 'g');
  svg.appendChild(root);
  return {
    render(doc, view, ui = {}) {
      root.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.zoom})`);
      let inner = '';
      if (ui.grid !== false) inner += gridMarkup();
      inner += diagramMarkup(doc, ui);
      inner += overlayMarkup(doc, ui);
      root.innerHTML = inner;
    },
  };
}
```

- [ ] **Step 4: Create `src/main.js` (temporary demo boot — replaced in Task 6)**

```js
import { createRenderer } from './render.js';

const demoDoc = {
  schema: 1,
  title: 'Demo Board',
  nodes: [
    { id: 'n1', kind: 'mcu', x: 240, y: 160, w: 160, h: 100, label: 'MCU', sublabel: 'STM32F401', color: null },
    { id: 'n2', kind: 'temp', x: 560, y: 120, w: 130, h: 70, label: 'Temp sensor', sublabel: 'BME280', color: null },
    { id: 'n3', kind: 'battery', x: 20, y: 160, w: 130, h: 70, label: 'Battery', sublabel: 'LiPo 3.7V', color: null },
  ],
  wires: [
    { id: 'w1', bus: 'i2c', from: { node: 'n1', port: 'i2c' }, to: { node: 'n2', port: 'i2c' }, label: '' },
    { id: 'w2', bus: 'power', from: { node: 'n3', port: 'out' }, to: { node: 'n1', port: 'vcc' }, label: '' },
  ],
  zones: [{ id: 'z1', x: 540, y: 90, w: 180, h: 130, label: 'Sensor pod', color: '#4a90d9' }],
  notes: [{ id: 't1', x: 250, y: 40, text: 'Demo board - tools arrive in the next task' }],
};

const svg = document.getElementById('canvas');
const renderer = createRenderer(svg);
renderer.render(demoDoc, { x: 40, y: 40, zoom: 1 }, { selection: new Set(['n1']), grid: true });
```

- [ ] **Step 5: Manual verification in the browser**

Run: `python3 -m http.server 8000` (repo root), open `http://localhost:8000`.

Check:
- Toolbar renders across the top with all buttons; palette column (empty) on the left.
- Canvas shows grid dots, a blue-tinted "Sensor pod" zone, three nodes with glyphs, labels, sublabels, and port circles.
- The I2C wire is blue and labeled "I2C"; the power wire is thick red labeled "PWR".
- The MCU has a blue selected outline.
- No console errors.

- [ ] **Step 6: Run tests (regression)**

Run: `npm test`
Expected: PASS — renderer must not break pure modules.

- [ ] **Step 7: Commit**

```bash
git add index.html css/ src/render.js src/main.js
git commit -m "feat: app shell and layered SVG renderer with demo board"
```

---

### Task 6: Core interactions — select, move, marquee, pan, zoom, palette insert, keyboard

**Files:**
- Create: `src/tools.js`
- Modify: `src/main.js` (full rewrite below)

**Interfaces:**
- Consumes: `Store`, `newDoc`, `addNode`, `addNote`, `deleteItems`, `duplicateItems`, `findItem` from `state.js`; `snap`, `normRect`, `rectsIntersect`, `nodeRect`, `NOTE_W`, `noteHeight` from `geometry.js`; `getPart` from `palette.js`; `createRenderer` from `render.js`.
- Produces: `createTools({ svg, store, requestRender, onToolChange }) -> tools` where `tools = { view: {x,y,zoom}, ui: {marquee, wireDraft, hoverPort, grid}, setTool(t), getTool(), zoomBy(factor), zoomReset(), toWorld(evt) }`. Tool names: `'select' | 'wire' | 'zone' | 'note'`.
- Note: in this task, pointerdown on a `.port` element and the full wire/zone/note flows are stubbed to selection behavior; Task 7 adds wires, Task 8 adds zones/notes/editing. The stub branches below are exact and get replaced by exact code in those tasks.

- [ ] **Step 1: Create `src/tools.js`**

```js
import { snap, normRect, rectsIntersect, nodeRect } from './geometry.js';
import { deleteItems, duplicateItems, findItem } from './state.js';

export function createTools({ svg, store, requestRender, onToolChange }) {
  const view = { x: 40, y: 40, zoom: 1 };
  const ui = { marquee: null, wireDraft: null, hoverPort: null, grid: true };
  let tool = 'select';
  let spaceDown = false;
  let drag = null;

  function toWorld(e) {
    const r = svg.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - view.x) / view.zoom,
      y: (e.clientY - r.top - view.y) / view.zoom,
    };
  }

  function setTool(t) {
    tool = t;
    ui.wireDraft = null;
    svg.classList.toggle('tool-wire', t === 'wire');
    onToolChange?.(t);
    requestRender();
  }

  function doSnap(v) {
    return ui.grid ? snap(v) : Math.round(v);
  }

  function zoomAt(cx, cy, factor) {
    const z = Math.min(4, Math.max(0.2, view.zoom * factor));
    const k = z / view.zoom;
    view.x = cx - (cx - view.x) * k;
    view.y = cy - (cy - view.y) * k;
    view.zoom = z;
    requestRender();
  }

  function zoomBy(factor) {
    const r = svg.getBoundingClientRect();
    zoomAt(r.width / 2, r.height / 2, factor);
  }

  function zoomReset() {
    view.x = 40;
    view.y = 40;
    view.zoom = 1;
    requestRender();
  }

  function movableSelection() {
    const orig = new Map();
    for (const id of store.selection) {
      const found = findItem(store.doc, id);
      if (found && found.type !== 'wire') {
        orig.set(id, { x: found.item.x, y: found.item.y });
      }
    }
    return orig;
  }

  function hitMarquee(doc, m) {
    const ids = [];
    for (const n of doc.nodes) if (rectsIntersect(m, nodeRect(n))) ids.push(n.id);
    for (const t of doc.notes) if (rectsIntersect(m, { x: t.x, y: t.y, w: 160, h: 40 })) ids.push(t.id);
    for (const z of doc.zones) {
      const inside = z.x >= m.x && z.y >= m.y && z.x + z.w <= m.x + m.w && z.y + z.h <= m.y + m.h;
      if (inside) ids.push(z.id);
    }
    return ids;
  }

  svg.addEventListener('pointerdown', (e) => {
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const pt = toWorld(e);

    const portEl = e.target.closest('.port');
    if (portEl) {
      // Wire drawing lands in Task 7; until then a port click selects its node.
      store.setSelection([portEl.dataset.node]);
      return;
    }

    if (tool === 'zone' || tool === 'note') {
      // Zone/note creation lands in Task 8; until then these tools do nothing on the canvas.
      return;
    }

    const itemEl = e.target.closest('[data-type]');
    if (itemEl) {
      const id = itemEl.dataset.id;
      if (e.shiftKey) {
        store.toggleSelection(id);
      } else if (!store.selection.has(id)) {
        store.setSelection([id]);
      }
      const found = findItem(store.doc, id);
      if (found && found.type !== 'wire') {
        drag = { mode: 'move', start: pt, orig: movableSelection() };
        store.beginDrag();
        svg.setPointerCapture(e.pointerId);
      }
      requestRender();
      return;
    }

    if (!e.shiftKey) store.clearSelection();
    drag = { mode: 'marquee', start: pt, additive: e.shiftKey };
    svg.setPointerCapture(e.pointerId);
    requestRender();
  });

  svg.addEventListener('pointermove', (e) => {
    const pt = toWorld(e);
    if (!drag) {
      const portEl = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.port');
      const hp = portEl ? { node: portEl.dataset.node, port: portEl.dataset.port } : null;
      const changed = JSON.stringify(hp) !== JSON.stringify(ui.hoverPort);
      if (changed) {
        ui.hoverPort = hp;
        requestRender();
      }
      return;
    }
    if (drag.mode === 'pan') {
      view.x = drag.vx + (e.clientX - drag.sx);
      view.y = drag.vy + (e.clientY - drag.sy);
      requestRender();
      return;
    }
    if (drag.mode === 'marquee' || drag.mode === 'zone') {
      ui.marquee = normRect(drag.start.x, drag.start.y, pt.x, pt.y);
      requestRender();
      return;
    }
    if (drag.mode === 'move') {
      const dx = pt.x - drag.start.x;
      const dy = pt.y - drag.start.y;
      store.mutate((doc) => {
        for (const [id, o] of drag.orig) {
          const found = findItem(doc, id);
          if (found) {
            found.item.x = doSnap(o.x + dx);
            found.item.y = doSnap(o.y + dy);
          }
        }
      });
    }
  });

  svg.addEventListener('pointerup', (e) => {
    if (!drag) return;
    if (drag.mode === 'marquee') {
      const m = ui.marquee;
      ui.marquee = null;
      if (m && (m.w > 2 || m.h > 2)) {
        const hits = hitMarquee(store.doc, m);
        if (drag.additive) {
          for (const id of hits) store.selection.add(id);
          store.setSelection([...store.selection]);
        } else {
          store.setSelection(hits);
        }
      }
    } else if (drag.mode === 'move') {
      store.endDrag();
    }
    drag = null;
    requestRender();
  });

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  function isEditingText(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  window.addEventListener('keydown', (e) => {
    if (isEditingText(e)) return;
    if (e.key === ' ') {
      spaceDown = true;
      svg.classList.add('panning');
      e.preventDefault();
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      const ids = duplicateItems(store, [...store.selection]);
      if (ids.length) store.setSelection(ids);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteItems(store, [...store.selection]);
      return;
    }
    if (e.key === 'Escape') {
      ui.wireDraft = null;
      store.clearSelection();
      requestRender();
      return;
    }
    if (mod) return;
    const k = e.key.toLowerCase();
    if (k === 'v') setTool('select');
    if (k === 'c') setTool('wire');
    if (k === 'z') setTool('zone');
    if (k === 'n') setTool('note');
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === ' ') {
      spaceDown = false;
      svg.classList.remove('panning');
    }
  });

  return { view, ui, setTool, getTool: () => tool, zoomBy, zoomReset, toWorld };
}
```

- [ ] **Step 2: Rewrite `src/main.js`**

```js
import { Store, newDoc, addNode } from './state.js';
import { createRenderer } from './render.js';
import { createTools } from './tools.js';
import { CATEGORIES, PARTS, getPart } from './palette.js';
import { snap } from './geometry.js';

const svg = document.getElementById('canvas');
const store = new Store(newDoc());
const renderer = createRenderer(svg);
const tools = createTools({ svg, store, requestRender: render, onToolChange: updateToolButtons });

function render() {
  renderer.render(store.doc, tools.view, {
    selection: store.selection,
    marquee: tools.ui.marquee,
    wireDraft: tools.ui.wireDraft,
    hoverPort: tools.ui.hoverPort,
    grid: tools.ui.grid,
  });
  document.getElementById('zoom-label').textContent = `${Math.round(tools.view.zoom * 100)}%`;
  document.getElementById('undo').disabled = !store.canUndo();
  document.getElementById('redo').disabled = !store.canRedo();
}

store.subscribe(render);

// ---- Toolbar ----
function updateToolButtons(tool) {
  for (const btn of document.querySelectorAll('#toolbar .tool')) {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  }
}

for (const btn of document.querySelectorAll('#toolbar .tool')) {
  btn.addEventListener('click', () => tools.setTool(btn.dataset.tool));
}

document.getElementById('undo').addEventListener('click', () => store.undo());
document.getElementById('redo').addEventListener('click', () => store.redo());
document.getElementById('zoom-in').addEventListener('click', () => tools.zoomBy(1.2));
document.getElementById('zoom-out').addEventListener('click', () => tools.zoomBy(1 / 1.2));
document.getElementById('zoom-reset').addEventListener('click', () => tools.zoomReset());
document.getElementById('btn-grid').addEventListener('click', (e) => {
  tools.ui.grid = !tools.ui.grid;
  e.currentTarget.classList.toggle('active', tools.ui.grid);
  render();
});

// ---- Palette ----
function buildPalette() {
  const palette = document.getElementById('palette');
  for (const cat of CATEGORIES) {
    const h = document.createElement('h3');
    h.textContent = cat.name;
    palette.appendChild(h);
    const box = document.createElement('div');
    palette.appendChild(box);
    h.addEventListener('click', () => {
      box.hidden = !box.hidden;
      h.classList.toggle('collapsed', box.hidden);
    });
    for (const part of Object.values(PARTS).filter((p) => p.category === cat.id)) {
      const item = document.createElement('button');
      item.className = 'palette-item';
      item.textContent = part.name;
      item.draggable = true;
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/schematica-kind', part.kind);
      });
      item.addEventListener('click', () => {
        const r = svg.getBoundingClientRect();
        const cx = (r.width / 2 - tools.view.x) / tools.view.zoom;
        const cy = (r.height / 2 - tools.view.y) / tools.view.zoom;
        const id = addNode(store, part.kind, snap(cx - part.w / 2), snap(cy - part.h / 2));
        store.setSelection([id]);
      });
      box.appendChild(item);
    }
  }
}

svg.addEventListener('dragover', (e) => e.preventDefault());
svg.addEventListener('drop', (e) => {
  e.preventDefault();
  const kind = e.dataTransfer.getData('text/schematica-kind');
  if (!kind) return;
  const part = getPart(kind);
  const pt = tools.toWorld(e);
  const id = addNode(store, kind, snap(pt.x - part.w / 2), snap(pt.y - part.h / 2));
  store.setSelection([id]);
});

buildPalette();
render();
```

- [ ] **Step 3: Manual verification in the browser**

Serve and reload. Check:
- Palette shows six collapsible categories with all parts; clicking a category header collapses it.
- Click "MCU" → node appears centered, selected. Drag another part from the palette onto the canvas → appears at the drop point.
- Drag a node → moves with 8px snapping; positions persist. Toggling Grid off removes dots and snapping.
- Marquee-drag on empty canvas selects multiple nodes; shift-click adds/removes one; dragging one selected node moves all selected.
- Scroll wheel zooms around the cursor; +/− buttons and % reset work; space-drag and middle-drag pan.
- V/C/Z/N switch the active toolbar button. Delete removes selection. Ctrl/Cmd-Z undoes a move and an add; Ctrl/Cmd-Shift-Z redoes; Ctrl/Cmd-D duplicates offset by 16px.
- Hovering a port grows it and shows its name/bus tooltip.
- No console errors.

- [ ] **Step 4: Run tests (regression)**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools.js src/main.js
git commit -m "feat: select/move/marquee/pan/zoom tools, palette insertion, keyboard shortcuts"
```

---

### Task 7: Wire tool and bus popover

**Files:**
- Modify: `src/tools.js`

**Interfaces:**
- Consumes: `addWire` from `state.js`; `BUSES`, `BUS_ORDER` from `buses.js`; `getPart` from `palette.js`; `esc` from `render.js`; the `#bus-popover` element from `index.html`.
- Produces: dragging from any port (in select or wire tool) draws a live rubber-band; dropping on another port creates a typed wire. If both ports suggest the same bus, it is used silently; otherwise a popover lists suggested buses first, then all buses.

- [ ] **Step 1: Add imports to `src/tools.js`**

Replace the two import lines at the top of `src/tools.js` with:

```js
import { snap, normRect, rectsIntersect, nodeRect } from './geometry.js';
import { addWire, deleteItems, duplicateItems, findItem } from './state.js';
import { BUSES, BUS_ORDER } from './buses.js';
import { getPart } from './palette.js';
import { esc } from './render.js';
```

- [ ] **Step 2: Replace the port stub branch**

In the `pointerdown` handler, replace:

```js
    const portEl = e.target.closest('.port');
    if (portEl) {
      // Wire drawing lands in Task 7; until then a port click selects its node.
      store.setSelection([portEl.dataset.node]);
      return;
    }
```

with:

```js
    const portEl = e.target.closest('.port');
    if (portEl) {
      ui.wireDraft = {
        from: { node: portEl.dataset.node, port: portEl.dataset.port },
        cursor: pt,
      };
      drag = { mode: 'wire' };
      svg.setPointerCapture(e.pointerId);
      requestRender();
      return;
    }
```

- [ ] **Step 3: Handle wire drag in `pointermove`**

In the `pointermove` handler, insert directly after the `if (drag.mode === 'pan') { ... }` block:

```js
    if (drag.mode === 'wire') {
      ui.wireDraft.cursor = pt;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.port');
      ui.hoverPort = el ? { node: el.dataset.node, port: el.dataset.port } : null;
      requestRender();
      return;
    }
```

- [ ] **Step 4: Handle wire drop in `pointerup`**

In the `pointerup` handler, insert directly after `if (!drag) return;`:

```js
    if (drag.mode === 'wire') {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.port');
      const draft = ui.wireDraft;
      ui.wireDraft = null;
      ui.hoverPort = null;
      if (el && draft
        && !(el.dataset.node === draft.from.node && el.dataset.port === draft.from.port)) {
        finishWire(draft.from, { node: el.dataset.node, port: el.dataset.port }, e);
      }
      drag = null;
      requestRender();
      return;
    }
```

- [ ] **Step 5: Add wire finishing and the bus popover**

Add these functions inside `createTools`, before the `return` statement:

```js
  function portBus(ref) {
    const node = store.doc.nodes.find((n) => n.id === ref.node);
    if (!node) return null;
    return getPart(node.kind).ports.find((p) => p.id === ref.port)?.bus ?? null;
  }

  function finishWire(from, to, e) {
    const busFrom = portBus(from);
    const busTo = portBus(to);
    if (busFrom && busFrom === busTo) {
      const id = addWire(store, busFrom, from, to);
      store.setSelection([id]);
      return;
    }
    const suggested = [...new Set([busFrom, busTo].filter(Boolean))];
    openBusPopover(e.clientX, e.clientY, suggested, (bus) => {
      const id = addWire(store, bus, from, to);
      store.setSelection([id]);
    });
  }

  const popover = document.getElementById('bus-popover');

  function closeBusPopover() {
    popover.hidden = true;
    popover.innerHTML = '';
  }

  function openBusPopover(cx, cy, suggested, onPick) {
    const order = [...suggested, ...BUS_ORDER.filter((b) => !suggested.includes(b))];
    popover.innerHTML = order.map((id) => {
      const b = BUSES[id];
      return `<button data-bus="${esc(id)}"><span class="swatch" style="background:${esc(b.color)}"></span>`
        + `${esc(b.name)}${suggested.includes(id) ? ' ★' : ''}</button>`;
    }).join('');
    popover.style.left = `${Math.min(cx, window.innerWidth - 190)}px`;
    popover.style.top = `${Math.min(cy, window.innerHeight - 320)}px`;
    popover.hidden = false;
    popover.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeBusPopover();
        onPick(btn.dataset.bus);
      });
    });
    setTimeout(() => {
      window.addEventListener('pointerdown', function dismiss(ev) {
        if (!popover.contains(ev.target)) {
          closeBusPopover();
          window.removeEventListener('pointerdown', dismiss);
        }
      });
    }, 0);
  }
```

- [ ] **Step 6: Close the popover on Escape**

In the `keydown` handler, replace:

```js
    if (e.key === 'Escape') {
      ui.wireDraft = null;
      store.clearSelection();
      requestRender();
      return;
    }
```

with:

```js
    if (e.key === 'Escape') {
      ui.wireDraft = null;
      closeBusPopover();
      store.clearSelection();
      requestRender();
      return;
    }
```

- [ ] **Step 7: Manual verification in the browser**

Serve and reload. Place an MCU and a Temp sensor. Check:
- Dragging from the MCU's I2C port shows a dashed blue rubber-band following the cursor; target ports highlight when hovered.
- Dropping on the sensor's I2C port instantly creates a blue "I2C" wire (both ports agree, no popover).
- Dragging MCU GPIO → sensor I2C opens the popover with GPIO and I2C starred at the top; picking one creates that wire type.
- Dropping on empty canvas cancels. Escape mid-drag cancels. Escape or outside-click closes the popover.
- Clicking a wire selects it (halo); Delete removes it. Moving a node re-routes its wires live.
- Undo removes the wire; redo restores it.
- No console errors.

- [ ] **Step 8: Run tests (regression)**

Run: `npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/tools.js
git commit -m "feat: wire drawing with typed bus selection popover"
```

---

### Task 8: Zones, notes, inline editing, properties panel

**Files:**
- Modify: `src/tools.js`, `src/main.js`

**Interfaces:**
- Consumes: `addZone`, `addNote`, `updateItem`, `findItem` from `state.js`; `#inline-editor` and `#props` elements.
- Produces: zone tool (drag-rect), note tool (click-to-place), double-click inline label editing on all item types, properties panel bound to the selection. Zone bodies are click-through (border/label select them) so items inside zones stay selectable.

- [ ] **Step 1: Update `src/tools.js` imports**

Replace the `state.js` import line with:

```js
import { addWire, addZone, addNote, updateItem, deleteItems, duplicateItems, findItem } from './state.js';
```

- [ ] **Step 2: Replace the zone/note stub branch**

In the `pointerdown` handler, replace:

```js
    if (tool === 'zone' || tool === 'note') {
      // Zone/note creation lands in Task 8; until then these tools do nothing on the canvas.
      return;
    }
```

with:

```js
    if (tool === 'zone') {
      drag = { mode: 'zone', start: pt };
      ui.marquee = { x: pt.x, y: pt.y, w: 0, h: 0 };
      svg.setPointerCapture(e.pointerId);
      requestRender();
      return;
    }
    if (tool === 'note') {
      const id = addNote(store, doSnap(pt.x), doSnap(pt.y));
      store.setSelection([id]);
      setTool('select');
      return;
    }
```

(The `pointermove` marquee branch already covers `drag.mode === 'zone'`.)

- [ ] **Step 3: Finish zones in `pointerup`**

In the `pointerup` handler, insert directly after the wire-drop block added in Task 7:

```js
    if (drag.mode === 'zone') {
      const m = ui.marquee;
      ui.marquee = null;
      if (m && m.w > 16 && m.h > 16) {
        const id = addZone(store, {
          x: doSnap(m.x), y: doSnap(m.y), w: doSnap(m.w), h: doSnap(m.h),
        });
        store.setSelection([id]);
      }
      setTool('select');
      drag = null;
      requestRender();
      return;
    }
```

- [ ] **Step 4: Add inline editing to `src/tools.js`**

Add inside `createTools`, before the `return` statement:

```js
  const editor = document.getElementById('inline-editor');
  let editing = null; // { id, field }

  function openInlineEditor(id, field, cx, cy) {
    const found = findItem(store.doc, id);
    if (!found) return;
    editing = { id, field };
    editor.value = found.item[field] ?? '';
    editor.style.left = `${Math.min(cx - 100, window.innerWidth - 210)}px`;
    editor.style.top = `${cy - 14}px`;
    editor.hidden = false;
    editor.focus();
    editor.select();
  }

  function commitInlineEditor() {
    if (!editing) return;
    updateItem(store, editing.id, { [editing.field]: editor.value });
    editing = null;
    editor.hidden = true;
  }

  function cancelInlineEditor() {
    editing = null;
    editor.hidden = true;
  }

  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commitInlineEditor();
    if (e.key === 'Escape') cancelInlineEditor();
    e.stopPropagation();
  });
  editor.addEventListener('blur', commitInlineEditor);

  svg.addEventListener('dblclick', (e) => {
    const itemEl = e.target.closest('[data-type]');
    if (!itemEl) return;
    const editEl = e.target.closest('[data-edit]');
    const defaults = { node: 'label', wire: 'label', zone: 'label', note: 'text' };
    const field = editEl?.dataset.edit || defaults[itemEl.dataset.type];
    openInlineEditor(itemEl.dataset.id, field, e.clientX, e.clientY);
  });
```

- [ ] **Step 5: Add the properties panel to `src/main.js`**

Add to the imports in `src/main.js`: `updateItem`, `findItem`, `deleteItems` from `./state.js` and `BUSES, BUS_ORDER` from `./buses.js`, i.e. replace the state import line with:

```js
import { Store, newDoc, addNode, updateItem, findItem, deleteItems } from './state.js';
import { BUSES, BUS_ORDER } from './buses.js';
```

Then add at the bottom of `src/main.js`, before `buildPalette();`:

```js
// ---- Properties panel ----
const props = document.getElementById('props');

function propField(label, inner) {
  return `<label>${label}</label>${inner}`;
}

function renderProps() {
  if (props.contains(document.activeElement)) return;
  const ids = [...store.selection];
  if (!ids.length) {
    props.hidden = true;
    return;
  }
  props.hidden = false;
  if (ids.length > 1) {
    props.innerHTML = `<h3>${ids.length} items selected</h3><button id="props-delete">Delete selection</button>`;
    document.getElementById('props-delete').addEventListener('click', () => {
      deleteItems(store, [...store.selection]);
    });
    return;
  }
  const found = findItem(store.doc, ids[0]);
  if (!found) {
    props.hidden = true;
    return;
  }
  const { type, item } = found;
  const escAttr = (s) => String(s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  let html = `<h3>${type[0].toUpperCase()}${type.slice(1)}</h3>`;
  if (type === 'node') {
    html += propField('Label', `<input type="text" data-prop="label" value="${escAttr(item.label)}">`);
    html += propField('Part number', `<input type="text" data-prop="sublabel" value="${escAttr(item.sublabel)}">`);
    html += propField('Fill color', `<input type="color" data-prop="color" value="${escAttr(item.color || '#ffffff')}">`);
  } else if (type === 'wire') {
    const options = BUS_ORDER.map((b) =>
      `<option value="${b}"${b === item.bus ? ' selected' : ''}>${BUSES[b].name}</option>`).join('');
    html += propField('Bus type', `<select data-prop="bus">${options}</select>`);
    html += propField('Label (blank = bus name)', `<input type="text" data-prop="label" value="${escAttr(item.label)}">`);
  } else if (type === 'zone') {
    html += propField('Label', `<input type="text" data-prop="label" value="${escAttr(item.label)}">`);
    html += propField('Color', `<input type="color" data-prop="color" value="${escAttr(item.color)}">`);
  } else if (type === 'note') {
    html += propField('Text', `<textarea data-prop="text">${escAttr(item.text)}</textarea>`);
  }
  props.innerHTML = html;
  props.querySelectorAll('[data-prop]').forEach((input) => {
    input.addEventListener('change', () => {
      updateItem(store, item.id, { [input.dataset.prop]: input.value });
    });
  });
}
```

Finally, change the `render` function's last line block: after `document.getElementById('redo').disabled = !store.canRedo();` add:

```js
  renderProps();
```

- [ ] **Step 6: Manual verification in the browser**

Serve and reload. Check:
- Z then drag → translucent zone with dashed border appears behind nodes; tool returns to select; zone is selected.
- Clicking inside a zone body hits items or starts a marquee (body is click-through); clicking the zone border or its title selects the zone; dragging the border moves it.
- N then click → sticky note appears; text wraps; long text grows the note.
- Double-click node label → inline editor over the canvas; Enter commits, Escape cancels. Same for sublabel, wire label, zone label, note text.
- Selecting a node shows the panel with label/part-number/color; edits apply on change (blur or Enter). Changing a wire's bus in the panel recolors it live. Multi-select shows the count + working delete button.
- Properties edits are undoable.
- No console errors.

- [ ] **Step 7: Run tests (regression)**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/tools.js src/main.js
git commit -m "feat: zones, notes, inline editing, and properties panel"
```

---

### Task 9: Persistence — autosave, title, New/Open/Save

**Files:**
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `serialize`, `deserialize` from `serialize.js`; `#title`, `#btn-new`, `#btn-open`, `#btn-save`, `#file-input` elements.
- Produces: autosave to localStorage key `schematica.autosave` (300 ms debounce); boot restores it; Save downloads `<safe-title>.schematica.json`; Open validates and reports warnings; New clears after confirm. Also produces `download(filename, data, mime)` — defined in `src/export.js` in Task 10, so in THIS task define it locally in `main.js` exactly as below (Task 10 moves it).

- [ ] **Step 1: Add persistence to `src/main.js`**

Add to imports:

```js
import { serialize, deserialize } from './serialize.js';
```

Replace the store construction line `const store = new Store(newDoc());` with:

```js
function loadAutosave() {
  try {
    const text = localStorage.getItem('schematica.autosave');
    if (!text) return null;
    return deserialize(text).doc;
  } catch (err) {
    console.warn('Discarding unreadable autosave:', err);
    return null;
  }
}

const store = new Store(loadAutosave() || newDoc());
```

Add after `store.subscribe(render);`:

```js
let autosaveTimer = null;
store.subscribe(() => {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      localStorage.setItem('schematica.autosave', serialize(store.doc));
    } catch (err) {
      console.warn('Autosave failed:', err);
    }
  }, 300);
});
```

- [ ] **Step 2: Wire the title input**

Add near the toolbar wiring in `src/main.js`:

```js
const titleInput = document.getElementById('title');
titleInput.value = store.doc.title;
titleInput.addEventListener('change', () => {
  store.apply((doc) => {
    doc.title = titleInput.value.trim() || 'Untitled Board';
  });
  titleInput.value = store.doc.title;
});
store.subscribe(() => {
  if (document.activeElement !== titleInput) titleInput.value = store.doc.title;
});
```

- [ ] **Step 3: Wire New/Open/Save**

Add to `src/main.js`:

```js
function download(filename, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(ext) {
  return `${(store.doc.title || 'schematica').replace(/[^\w-]+/g, '_')}${ext}`;
}

document.getElementById('btn-new').addEventListener('click', () => {
  if (confirm('Clear the board? Anything not saved to a file is lost.')) {
    store.replaceDoc(newDoc());
  }
});

document.getElementById('btn-save').addEventListener('click', () => {
  download(safeName('.schematica.json'), serialize(store.doc), 'application/json');
});

const fileInput = document.getElementById('file-input');
document.getElementById('btn-open').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  try {
    const { doc, warnings } = deserialize(await file.text());
    store.replaceDoc(doc);
    if (warnings.length) alert(`Opened with warnings:\n\n${warnings.join('\n')}`);
  } catch (err) {
    alert(err.message);
  }
});
```

- [ ] **Step 4: Manual verification in the browser**

Check:
- Draw a small board, reload the page → board restores (autosave).
- Edit the title, Save → downloads `<title>.schematica.json`; New (confirm) clears; Open restores the saved file exactly.
- Open a text file containing `{nope` → readable alert, board untouched.
- Hand-edit the saved JSON: change a node's `kind` to `"quantum"`, a wire's `bus` to `"warp"`, point a wire at `"ghost"` node. Open it → alert lists three warnings; unknown part appears as custom box; unknown bus renders as GPIO; dangling wire is gone.
- No console errors.

- [ ] **Step 5: Run tests (regression)**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main.js
git commit -m "feat: localStorage autosave, title, and New/Open/Save round trip"
```

---

### Task 10: Export SVG/PNG and legend

**Files:**
- Create: `src/export.js`
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `diagramMarkup` from `render.js`; `contentBounds` from `geometry.js`.
- Produces: `buildExportSVG(doc) -> string` (standalone SVG, content-cropped + 24px margin, `#f7f7f5` background), `exportPNG(svgString, done, scale=2)` calling `done(blob|null)`, `download(filename, data, mime)` (moved here from `main.js`).

- [ ] **Step 1: Create `src/export.js`**

```js
import { diagramMarkup, CANVAS_BG } from './render.js';
import { contentBounds } from './geometry.js';

const MARGIN = 24;

export function buildExportSVG(doc) {
  const b = contentBounds(doc) || { x: 0, y: 0, w: 400, h: 300 };
  const x = b.x - MARGIN;
  const y = b.y - MARGIN;
  const w = b.w + MARGIN * 2;
  const h = b.h + MARGIN * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}"`
    + ` font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">`
    + `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${CANVAS_BG}"/>`
    + diagramMarkup(doc)
    + '</svg>';
}

export function exportPNG(svgString, done, scale = 2) {
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => done(blob), 'image/png');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    done(null);
  };
  img.src = url;
}

export function download(filename, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 2: Use it from `src/main.js`**

Delete the local `download` function added in Task 9 and add to imports:

```js
import { buildExportSVG, exportPNG, download } from './export.js';
```

Add the export button wiring:

```js
document.getElementById('btn-export-svg').addEventListener('click', () => {
  download(safeName('.svg'), buildExportSVG(store.doc), 'image/svg+xml');
});

document.getElementById('btn-export-png').addEventListener('click', () => {
  exportPNG(buildExportSVG(store.doc), (blob) => {
    if (blob) download(safeName('.png'), blob);
    else alert('PNG export failed in this browser. The SVG export still works.');
  });
});
```

- [ ] **Step 3: Add the legend**

Add to `src/main.js`:

```js
// ---- Legend ----
function buildLegend() {
  const legend = document.getElementById('legend');
  legend.innerHTML = '<h3>Buses</h3>' + BUS_ORDER.map((id) => {
    const b = BUSES[id];
    const dash = b.dash ? ` stroke-dasharray="${b.dash}"` : '';
    return `<div class="legend-row"><svg width="36" height="10">`
      + `<line x1="2" y1="5" x2="34" y2="5" stroke="${b.color}" stroke-width="${Math.min(b.width, 4)}"${dash} stroke-linecap="round"/>`
      + `</svg><span>${b.name}</span></div>`;
  }).join('');
}

document.getElementById('btn-legend').addEventListener('click', (e) => {
  const legend = document.getElementById('legend');
  legend.hidden = !legend.hidden;
  e.currentTarget.classList.toggle('active', !legend.hidden);
});

buildLegend();
```

- [ ] **Step 4: Manual verification in the browser**

Check:
- Legend button toggles a white card bottom-right listing all 12 buses with correct colors/dashes.
- Draw a board with several bus types, a zone, and a note. Export SVG → file opens in the browser: cropped to content with margin, light background, correct colors, no grid dots, no selection highlights.
- Export PNG → downloads a 2x raster of the same, readable text.
- Empty board exports produce a small blank file rather than throwing.
- No console errors.

- [ ] **Step 5: Run tests (regression)**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/export.js src/main.js
git commit -m "feat: content-cropped SVG/PNG export and bus legend"
```

---

### Task 11: README, GitHub Pages notes, final checklist

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything (documentation + final sweep).
- Produces: user/developer documentation; the spec's success-criteria walkthrough executed end to end.

- [ ] **Step 1: Write `README.md`**

```markdown
# Schematica

A canvas board for drawing embedded-system and hardware architecture
diagrams in the browser. Drag MCUs, sensors, actuators, power and radio
modules onto the canvas and wire them together with typed buses (I2C, SPI,
UART, CAN, USB, power rails, ...). Inspired by
[net_draw](https://mr-r3b00t.github.io/net_draw/), specialized for embedded
hardware.

No build step, no dependencies, no server: static HTML + ES modules + SVG.

## Run it

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Any static file server works. To publish on GitHub Pages: push this repo,
then Settings → Pages → deploy from branch `main`, root folder.

## Use it

| Action | How |
|--------|-----|
| Add a part | Drag it from the palette, or click it |
| Wire two parts | Drag from a port to another port (any tool) |
| Pick the bus type | Automatic when both ports agree; popover otherwise |
| Select / move | `V`, click or drag; marquee on empty canvas; shift-click adds |
| Zone | `Z`, drag a rectangle (select it by its border or title) |
| Sticky note | `N`, click |
| Rename anything | Double-click its text, or use the properties panel |
| Pan / zoom | Space-drag or middle-drag; scroll wheel |
| Undo / redo | `Ctrl/Cmd-Z`, `Ctrl/Cmd-Shift-Z` |
| Duplicate | `Ctrl/Cmd-D` |
| Delete | `Delete` / `Backspace` |
| Save / open | Toolbar — downloads/reads `*.schematica.json` |
| Export | Toolbar — SVG or 2x PNG, cropped to content |

Work is autosaved to the browser's localStorage and restored on reload.

## Develop

Pure logic (state, geometry, palette data, serialization) is dependency-free
and tested with Node's built-in runner:

```bash
npm test   # node --test tests/
```

Layout: `src/state.js` owns the document model + undo; `src/render.js` draws
it into layered SVG; `src/tools.js` is the pointer/keyboard state machine;
`src/serialize.js` validates files; `src/export.js` builds standalone
SVG/PNG. See `docs/superpowers/specs/` for the design spec.
```

- [ ] **Step 2: Full manual walkthrough (spec success criteria)**

Serve fresh (clear localStorage first: DevTools → Application → Local Storage → delete `schematica.autosave`). Then:
1. Drag out an MCU, a temp sensor, an IMU, a battery, a regulator, a WiFi module.
2. Wire: battery→regulator (power), regulator→MCU VCC (power), MCU I2C→temp I2C, MCU I2C→IMU I2C, MCU SPI→WiFi SPI, MCU GND→battery GND (via popover if needed).
3. Zone around the sensors labeled "Sensor pod"; note saying "3.3V rail".
4. Rename the MCU sublabel to "ESP32-S3" via double-click; recolor the zone via the panel.
5. Undo ~5 times, redo ~5 times — board returns to the same state.
6. Save the JSON; reload the page; New; Open the saved file — identical board.
7. Export SVG and PNG; open both — clean, cropped, correct colors, legend colors match wires.
8. Confirm zero console errors throughout.

Fix anything found before committing (upgrade to the systematic-debugging skill if a fix isn't obvious).

- [ ] **Step 3: Run tests one final time**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README with usage, hosting, and development guide"
```

---

### Task 12: NetDraw-style dark redesign (user-directed; execute between Task 9 and Task 10)

**Files:**
- Rewrite: `src/buses.js`, `src/palette.js`, `src/render.js`, `index.html`, `css/style.css`
- Modify: `src/main.js`, `tests/palette.test.js`

**Interfaces:**
- Consumes: everything from Tasks 1-9. All element ids from Task 5 are preserved.
- Produces: `render.js` additionally exports `CANVAS_BG` (Task 10 imports it for the export background). `palette.js` additionally exports `CATEGORY_COLORS: Record<categoryId, hex>` and each part gains an `icon` field (16×16 SVG path string). Everything else keeps its exact existing signature — `diagramMarkup(doc, ui)`, `createRenderer(svg)`, `esc(s)`, `BUSES`/`BUS_ORDER`/`DEFAULT_BUS`, `PARTS`/`CATEGORIES`/`getPart` are unchanged in shape.
- Design tokens: canvas `#0a0e17`, grid dots `#1c2333`, chrome `#0d1220`, cards `#131a2b`, card border `#2c3a5c`, hairline `#1e2942`, text `#e6ebf4`, muted `#8b96ab`, accent `#38bdf8`. Category colors: compute `#818cf8`, sensors `#22d3ee`, actuators `#fbbf24`, power `#f87171`, connectivity `#60a5fa`, misc `#34d399`. Mono stack `ui-monospace, 'SF Mono', Menlo, monospace` for sublabels, wire/zone chips, port tooltips, zoom label, hint bar.
- `node.color` semantics change: it is now an accent-color override for the node's badge/border tint (fill stays the dark card), matching the dark design. The properties panel label changes from "Fill color" to "Accent color".

- [ ] **Step 1: Add the failing palette test**

Append to `tests/palette.test.js` (and change its import line to `import { CATEGORIES, CATEGORY_COLORS, PARTS, getPart } from '../src/palette.js';`):

```js
test('every part has an icon path and every category a color', () => {
  for (const [key, part] of Object.entries(PARTS)) {
    assert.ok(typeof part.icon === 'string' && part.icon.startsWith('M'), `${key} icon`);
  }
  for (const c of CATEGORIES) {
    assert.match(CATEGORY_COLORS[c.id] ?? '', /^#[0-9a-f]{6}$/i, `${c.id} color`);
  }
});
```

Run: `npm test` — expected: FAIL (CATEGORY_COLORS undefined / icons missing).

- [ ] **Step 2: Rewrite `src/buses.js`** (dark-friendly colors; structure unchanged)

```js
export const BUSES = {
  power: { name: 'Power', short: 'PWR', color: '#f87171', width: 3.5, dash: null },
  gnd:   { name: 'Ground', short: 'GND', color: '#cbd5e1', width: 3.5, dash: '8 4' },
  i2c:   { name: 'I2C', short: 'I2C', color: '#38bdf8', width: 2, dash: null },
  spi:   { name: 'SPI', short: 'SPI', color: '#a78bfa', width: 2, dash: null },
  uart:  { name: 'UART', short: 'UART', color: '#4ade80', width: 2, dash: null },
  can:   { name: 'CAN', short: 'CAN', color: '#facc15', width: 2, dash: null },
  usb:   { name: 'USB', short: 'USB', color: '#f472b6', width: 2, dash: null },
  eth:   { name: 'Ethernet', short: 'ETH', color: '#2dd4bf', width: 2, dash: null },
  gpio:  { name: 'GPIO', short: 'GPIO', color: '#7d8ba1', width: 1.5, dash: null },
  pwm:   { name: 'PWM', short: 'PWM', color: '#fb923c', width: 2, dash: '6 4' },
  adc:   { name: 'ADC / analog', short: 'ADC', color: '#e879f9', width: 2, dash: '4 3' },
  rf:    { name: 'RF', short: 'RF', color: '#818cf8', width: 2, dash: '1.5 5' },
};

export const BUS_ORDER = ['power', 'gnd', 'i2c', 'spi', 'uart', 'can', 'usb', 'eth', 'gpio', 'pwm', 'adc', 'rf'];

export const DEFAULT_BUS = 'gpio';
```

- [ ] **Step 3: Rewrite `src/palette.js`** (adds CATEGORY_COLORS + per-part 16×16 icons; part shape gains `icon`)

```js
export const CATEGORIES = [
  { id: 'compute', name: 'Compute' },
  { id: 'sensors', name: 'Sensors' },
  { id: 'actuators', name: 'Actuators' },
  { id: 'power', name: 'Power' },
  { id: 'connectivity', name: 'Connectivity' },
  { id: 'misc', name: 'Storage / Misc' },
];

export const CATEGORY_COLORS = {
  compute: '#818cf8',
  sensors: '#22d3ee',
  actuators: '#fbbf24',
  power: '#f87171',
  connectivity: '#60a5fa',
  misc: '#34d399',
};

const p = (id, name, side, offset, bus) => ({ id, name, side, offset, bus });
const pwr = (side = 'left') => [p('vcc', 'VCC', side, 0.3, 'power'), p('gnd', 'GND', side, 0.7, 'gnd')];
const part = (kind, category, name, w, h, icon, ports) => ({ kind, category, name, w, h, icon, ports });

export const PARTS = {
  // Compute
  mcu: part('mcu', 'compute', 'MCU', 160, 100,
    'M4 4h8v8H4z M6 1v3 M10 1v3 M6 12v3 M10 12v3 M1 6h3 M1 10h3 M12 6h3 M12 10h3', [
    ...pwr(),
    p('i2c', 'I2C', 'right', 0.2, 'i2c'), p('spi', 'SPI', 'right', 0.4, 'spi'),
    p('uart', 'UART', 'right', 0.6, 'uart'), p('usb', 'USB', 'right', 0.8, 'usb'),
    p('gpio1', 'GPIO', 'bottom', 0.2, 'gpio'), p('gpio2', 'GPIO', 'bottom', 0.4, 'gpio'),
    p('pwm', 'PWM', 'bottom', 0.6, 'pwm'), p('adc', 'ADC', 'bottom', 0.8, 'adc'),
    p('can', 'CAN', 'top', 0.5, 'can'),
  ]),
  sbc: part('sbc', 'compute', 'SoC / SBC', 180, 110,
    'M2 3h12v10H2z M4.5 5.5h3v3h-3z M10 5.5h2.5 M10 8h2.5 M4.5 11h7', [
    ...pwr(),
    p('eth', 'ETH', 'right', 0.25, 'eth'), p('usb', 'USB', 'right', 0.5, 'usb'),
    p('uart', 'UART', 'right', 0.75, 'uart'),
    p('gpio1', 'GPIO', 'bottom', 0.2, 'gpio'), p('gpio2', 'GPIO', 'bottom', 0.4, 'gpio'),
    p('i2c', 'I2C', 'bottom', 0.6, 'i2c'), p('spi', 'SPI', 'bottom', 0.8, 'spi'),
  ]),
  fpga: part('fpga', 'compute', 'FPGA', 160, 110,
    'M3 3h10v10H3z M6.3 3v10 M9.6 3v10 M3 6.3h10 M3 9.6h10', [
    ...pwr(),
    p('spi', 'SPI', 'right', 0.25, 'spi'), p('uart', 'UART', 'right', 0.5, 'uart'),
    p('gpio1', 'IO', 'right', 0.75, 'gpio'),
    p('gpio2', 'IO', 'bottom', 0.33, 'gpio'), p('gpio3', 'IO', 'bottom', 0.66, 'gpio'),
  ]),
  dsp: part('dsp', 'compute', 'DSP', 150, 90,
    'M3 3h10v10H3z M5 8h1.5l1-2 1.5 4 1-2H11', [
    ...pwr(),
    p('spi', 'SPI', 'right', 0.33, 'spi'), p('i2c', 'I2C', 'right', 0.66, 'i2c'),
    p('adc1', 'ADC', 'bottom', 0.33, 'adc'), p('adc2', 'ADC', 'bottom', 0.66, 'adc'),
  ]),
  // Sensors
  temp: part('temp', 'sensors', 'Temp sensor', 130, 70,
    'M7 2a1.5 1.5 0 0 1 3 0v7a3 3 0 1 1-3 0z M8.5 6v5',
    [...pwr(), p('i2c', 'I2C', 'right', 0.5, 'i2c')]),
  imu: part('imu', 'sensors', 'IMU', 130, 70,
    'M8 8m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0 M8 1v3 M8 12v3 M1 8h3 M12 8h3',
    [...pwr(), p('i2c', 'I2C', 'right', 0.35, 'i2c'), p('spi', 'SPI', 'right', 0.7, 'spi')]),
  gps: part('gps', 'sensors', 'GPS', 130, 70,
    'M8 15s-5-4.5-5-8a5 5 0 1 1 10 0c0 3.5-5 8-5 8z M8 7m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0',
    [...pwr(), p('uart', 'UART', 'right', 0.5, 'uart'), p('ant', 'ANT', 'top', 0.5, 'rf')]),
  camera: part('camera', 'sensors', 'Camera', 140, 80,
    'M2 5h3l1.5-2h3L11 5h3v8H2z M8 9m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0',
    [...pwr(), p('i2c', 'CTRL', 'right', 0.3, 'i2c'), p('spi', 'DATA', 'right', 0.7, 'spi')]),
  adcin: part('adcin', 'sensors', 'Analog input', 130, 70,
    'M2 11c2-6 4-6 6 0 M8 11h2V8h2V5h2',
    [...pwr(), p('out', 'OUT', 'right', 0.5, 'adc')]),
  sensor: part('sensor', 'sensors', 'Sensor', 130, 70,
    'M8 8m-1.2 0a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0 M4.5 4.5a5 5 0 0 0 0 7 M11.5 4.5a5 5 0 0 1 0 7',
    [...pwr(), p('i2c', 'I2C', 'right', 0.35, 'i2c'), p('int', 'INT', 'right', 0.7, 'gpio')]),
  // Actuators (power on top, control on the left)
  motor: part('motor', 'actuators', 'Motor + driver', 150, 80,
    'M2 6h3V4h6v8H5v-2H2z M11 6h3v4h-3 M6.5 6.5v3 M8.5 6.5v3',
    [...pwr('top'), p('pwm', 'PWM', 'left', 0.5, 'pwm')]),
  servo: part('servo', 'actuators', 'Servo', 130, 70,
    'M2 9h12v4H2z M6 9V5.5a2 2 0 0 1 4 0V9 M8 5.5 11 2.5',
    [...pwr('top'), p('pwm', 'PWM', 'left', 0.5, 'pwm')]),
  relay: part('relay', 'actuators', 'Relay', 130, 70,
    'M1 8h4 M11 8h4 M5 8l5.5-4',
    [...pwr('top'), p('in', 'IN', 'left', 0.5, 'gpio')]),
  led: part('led', 'actuators', 'LED', 110, 60,
    'M5 2h6v6a3 3 0 0 1-6 0z M5 8h6 M6.5 11v3 M9.5 11v3',
    [...pwr('top'), p('in', 'IN', 'left', 0.5, 'gpio')]),
  display: part('display', 'actuators', 'Display', 150, 80,
    'M2 3h12v8H2z M5 13h6 M8 11v2',
    [...pwr('top'), p('i2c', 'I2C', 'left', 0.35, 'i2c'), p('spi', 'SPI', 'left', 0.7, 'spi')]),
  buzzer: part('buzzer', 'actuators', 'Buzzer', 110, 60,
    'M2 6h3l4-3v10l-4-3H2z M11 5a4 4 0 0 1 0 6 M13 3a7 7 0 0 1 0 10',
    [...pwr('top'), p('in', 'IN', 'left', 0.5, 'pwm')]),
  // Power (outputs on the right)
  battery: part('battery', 'power', 'Battery', 130, 70,
    'M2 5h10v6H2z M12 7h2v2h-2 M4 7v2 M6.5 7v2',
    [p('out', 'OUT', 'right', 0.35, 'power'), p('gnd', 'GND', 'right', 0.7, 'gnd')]),
  regulator: part('regulator', 'power', 'Regulator', 140, 70,
    'M4 4h8v8H4z M1 8h3 M12 8h3 M6 8h1l1-2 1 3 1-1',
    [p('in', 'IN', 'left', 0.5, 'power'), p('out', 'OUT', 'right', 0.35, 'power'), p('gnd', 'GND', 'right', 0.7, 'gnd')]),
  charger: part('charger', 'power', 'Charger', 140, 70,
    'M3 3h10v10H3z M8.5 5 6.5 8.5h2L7 11l3-4H8z',
    [p('in', 'USB IN', 'left', 0.5, 'usb'), p('out', 'OUT', 'right', 0.35, 'power'), p('gnd', 'GND', 'right', 0.7, 'gnd'), p('bat', 'BAT', 'bottom', 0.5, 'power')]),
  solar: part('solar', 'power', 'Solar panel', 130, 70,
    'M2 4h12l-2 8H4z M5.5 4l-1 8 M10.5 4l1 8 M2.7 8h10.6',
    [p('out', 'OUT', 'right', 0.5, 'power')]),
  jack: part('jack', 'power', 'Power jack', 120, 60,
    'M2 5h8v6H2z M10 6h4 M10 10h4 M4 5V3',
    [p('out', 'OUT', 'right', 0.35, 'power'), p('gnd', 'GND', 'right', 0.7, 'gnd')]),
  // Connectivity
  wifi: part('wifi', 'connectivity', 'WiFi / BLE', 140, 75,
    'M1.5 6a9 9 0 0 1 13 0 M4 8.8a5.5 5.5 0 0 1 8 0 M6.5 11.5a2.5 2.5 0 0 1 3 0 M8 14h.01',
    [...pwr(), p('uart', 'UART', 'right', 0.3, 'uart'), p('spi', 'SPI', 'right', 0.6, 'spi'), p('ant', 'ANT', 'top', 0.5, 'rf')]),
  lora: part('lora', 'connectivity', 'LoRa', 140, 75,
    'M8 8m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M5 5a4.5 4.5 0 0 0 0 6 M11 5a4.5 4.5 0 0 1 0 6 M3 3a8 8 0 0 0 0 10 M13 3a8 8 0 0 1 0 10',
    [...pwr(), p('spi', 'SPI', 'right', 0.5, 'spi'), p('ant', 'ANT', 'top', 0.5, 'rf')]),
  cellular: part('cellular', 'connectivity', 'Cellular', 140, 75,
    'M2 13v-3 M5.5 13V7 M9 13V4 M12.5 13V1.5',
    [...pwr(), p('uart', 'UART', 'right', 0.5, 'uart'), p('ant', 'ANT', 'top', 0.5, 'rf')]),
  ethphy: part('ethphy', 'connectivity', 'Ethernet PHY', 140, 75,
    'M3 3h10v7H3z M5 10v3 M11 10v3 M5.5 5.5v2 M8 5.5v2 M10.5 5.5v2',
    [...pwr(), p('eth', 'ETH', 'right', 0.5, 'eth'), p('mii', 'MII', 'bottom', 0.5, 'gpio')]),
  usbport: part('usbport', 'connectivity', 'USB port', 110, 60,
    'M8 2v12 M8 11 4.5 9V6.5 M8 9l3.5-2V4.5 M8 2 6.5 4h3z',
    [p('usb', 'USB', 'right', 0.5, 'usb')]),
  cantrx: part('cantrx', 'connectivity', 'CAN transceiver', 140, 70,
    'M1 8h14 M4 8V5h3v3 M9 8v3h3V8',
    [...pwr('top'), p('mcu', 'TX/RX', 'left', 0.5, 'can'), p('bus', 'BUS', 'right', 0.5, 'can')]),
  antenna: part('antenna', 'connectivity', 'RF antenna', 100, 60,
    'M8 15V6 M3 2a7 7 0 0 1 10 0 M5.3 4.2a4 4 0 0 1 5.4 0 M8 6m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
    [p('feed', 'FEED', 'bottom', 0.5, 'rf')]),
  // Storage / Misc
  eeprom: part('eeprom', 'misc', 'EEPROM / Flash', 140, 70,
    'M4 3h8v10H4z M4 6h8 M4 9h8 M2 5h2 M2 8h2 M2 11h2 M12 5h2 M12 8h2 M12 11h2',
    [...pwr(), p('spi', 'SPI', 'right', 0.35, 'spi'), p('i2c', 'I2C', 'right', 0.7, 'i2c')]),
  sdcard: part('sdcard', 'misc', 'SD card', 130, 70,
    'M4 2h6l3 3v9H4z M6 4v2 M8 4v2 M10 4v2',
    [...pwr(), p('spi', 'SPI', 'right', 0.5, 'spi')]),
  rtc: part('rtc', 'misc', 'RTC', 120, 65,
    'M8 8m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0 M8 4.5V8l2.5 1.5',
    [...pwr(), p('i2c', 'I2C', 'right', 0.5, 'i2c')]),
  crystal: part('crystal', 'misc', 'Crystal', 100, 50,
    'M5 4h6v8H5z M3 6v4 M1 8h2 M13 6v4 M13 8h2',
    [p('osc', 'OSC', 'right', 0.5, 'gpio')]),
  debug: part('debug', 'misc', 'Debug header', 130, 60,
    'M3 4h10v8H3z M5.5 6.5h.01 M8 6.5h.01 M10.5 6.5h.01 M5.5 9.5h.01 M8 9.5h.01 M10.5 9.5h.01',
    [p('swd', 'SWD', 'right', 0.35, 'gpio'), p('uart', 'UART', 'right', 0.7, 'uart')]),
  ic: part('ic', 'misc', 'Generic IC', 130, 80,
    'M5 3h6v10H5z M3 5h2 M3 8h2 M3 11h2 M11 5h2 M11 8h2 M11 11h2 M7 3a1 1 0 0 0 2 0',
    [...pwr(), p('io1', 'IO', 'right', 0.35, 'gpio'), p('io2', 'IO', 'right', 0.7, 'gpio')]),
  generic: part('generic', 'misc', 'Custom box', 140, 80,
    'M2 5V2h3 M11 2h3v3 M14 11v3h-3 M5 14H2v-3', [
    p('top', 'P1', 'top', 0.5, 'gpio'), p('right', 'P2', 'right', 0.5, 'gpio'),
    p('bottom', 'P3', 'bottom', 0.5, 'gpio'), p('left', 'P4', 'left', 0.5, 'gpio'),
  ]),
};

export function getPart(kind) {
  return PARTS[kind] ?? PARTS.generic;
}
```

Run: `npm test` — expected: PASS (all, including the new test).

- [ ] **Step 4: Rewrite `src/render.js`**

```js
import { BUSES } from './buses.js';
import { getPart, CATEGORY_COLORS } from './palette.js';
import {
  portPosition, wirePath, wireMidpoint, wrapText, noteHeight, NOTE_W,
} from './geometry.js';

export const CANVAS_BG = '#0a0e17';

const ACCENT = '#38bdf8';
const CARD_BG = '#131a2b';
const CARD_LINE = '#2c3a5c';
const CHIP_BG = '#0d1220';
const TEXT = '#e6ebf4';
const MUTED = '#8b96ab';
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function badgeMarkup(x, y, size, color, icon) {
  const pad = size * 0.2;
  const k = (size - pad * 2) / 16;
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="7" fill="${color}" fill-opacity="0.13"/>`
    + `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="7" fill="none" stroke="${color}" stroke-opacity="0.3"/>`
    + `<g transform="translate(${x + pad} ${y + pad}) scale(${k})" fill="none" stroke="${color}"`
    + ` stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${icon}"/></g>`;
}

function portsMarkup(node, part, hoverPort) {
  let s = '';
  for (const port of part.ports) {
    const pos = portPosition(node, port);
    const hot = hoverPort && hoverPort.node === node.id && hoverPort.port === port.id;
    s += `<circle class="port" data-node="${esc(node.id)}" data-port="${esc(port.id)}"`
      + ` cx="${pos.x}" cy="${pos.y}" r="${hot ? 6 : 4}"`
      + ` fill="${hot ? '#16324a' : CHIP_BG}" stroke="${hot ? ACCENT : '#46587a'}" stroke-width="1.5"/>`;
    if (hot) {
      const bus = BUSES[port.bus];
      s += `<text x="${pos.x}" y="${pos.y - 11}" text-anchor="middle" font-size="9.5" font-weight="600"`
        + ` font-family="${MONO}" fill="#7dd3fc" paint-order="stroke" stroke="${CANVAS_BG}" stroke-width="3"`
        + ` pointer-events="none">${esc(port.name)} · ${esc(bus ? bus.short : '')}</text>`;
    }
  }
  return s;
}

function nodeMarkup(node, selected, hoverPort) {
  const part = getPart(node.kind);
  const color = node.color || CATEGORY_COLORS[part.category] || ACCENT;
  const badge = 26;
  let s = `<g class="node" data-id="${esc(node.id)}" data-type="node">`;
  if (selected) {
    s += `<rect x="${node.x - 3}" y="${node.y - 3}" width="${node.w + 6}" height="${node.h + 6}" rx="15"`
      + ` fill="none" stroke="${ACCENT}" stroke-opacity="0.35" stroke-width="5"/>`;
  }
  s += `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="12"`
    + ` fill="${CARD_BG}" stroke="${selected ? ACCENT : CARD_LINE}" stroke-width="1.5"/>`;
  if (node.h >= 78) {
    s += badgeMarkup(node.x + node.w / 2 - badge / 2, node.y + 10, badge, color, part.icon);
    const ty = node.y + 10 + badge + 16;
    s += `<text x="${node.x + node.w / 2}" y="${ty}" text-anchor="middle" font-size="12.5"`
      + ` font-weight="700" fill="${TEXT}" data-edit="label">${esc(node.label)}</text>`;
    if (node.sublabel) {
      s += `<text x="${node.x + node.w / 2}" y="${ty + 15}" text-anchor="middle" font-size="10"`
        + ` font-family="${MONO}" fill="${MUTED}" data-edit="sublabel">${esc(node.sublabel)}</text>`;
    }
  } else {
    const bx = node.x + 10;
    const by = node.y + node.h / 2 - badge / 2;
    s += badgeMarkup(bx, by, badge, color, part.icon);
    const tx = bx + badge + 9;
    const ty = node.y + node.h / 2 + (node.sublabel ? -3 : 4);
    s += `<text x="${tx}" y="${ty}" font-size="12" font-weight="700" fill="${TEXT}"`
      + ` data-edit="label">${esc(node.label)}</text>`;
    if (node.sublabel) {
      s += `<text x="${tx}" y="${ty + 14}" font-size="9.5" font-family="${MONO}" fill="${MUTED}"`
        + ` data-edit="sublabel">${esc(node.sublabel)}</text>`;
    }
  }
  s += portsMarkup(node, part, hoverPort);
  s += '</g>';
  return s;
}

function chipMarkup(cx, cy, label, color, editField) {
  const w = label.length * 6 + 16;
  return `<rect x="${cx - w / 2}" y="${cy - 9}" width="${w}" height="18" rx="9"`
    + ` fill="${CHIP_BG}" stroke="${color}" stroke-opacity="0.55"/>`
    + `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="9.5"`
    + ` font-weight="600" font-family="${MONO}" fill="${color}"`
    + `${editField ? ` data-edit="${editField}"` : ''}>${esc(label)}</text>`;
}

function wireMarkup(doc, wire, selected) {
  const from = doc.nodes.find((n) => n.id === wire.from.node);
  const to = doc.nodes.find((n) => n.id === wire.to.node);
  if (!from || !to) return '';
  const pf = getPart(from.kind).ports.find((q) => q.id === wire.from.port);
  const pt = getPart(to.kind).ports.find((q) => q.id === wire.to.port);
  if (!pf || !pt) return '';
  const a = portPosition(from, pf);
  const b = portPosition(to, pt);
  const bus = BUSES[wire.bus] || BUSES.gpio;
  const d = wirePath(a, pf.side, b, pt.side);
  const mid = wireMidpoint(a, pf.side, b, pt.side);
  let s = `<g class="wire" data-id="${esc(wire.id)}" data-type="wire">`;
  s += `<path d="${d}" fill="none" stroke="transparent" stroke-width="12" pointer-events="stroke"/>`;
  if (selected) {
    s += `<path d="${d}" fill="none" stroke="${ACCENT}" stroke-opacity="0.3"`
      + ` stroke-width="${bus.width + 5}" stroke-linecap="round" pointer-events="none"/>`;
  }
  s += `<path d="${d}" fill="none" stroke="${bus.color}" stroke-width="${bus.width}"`
    + `${bus.dash ? ` stroke-dasharray="${bus.dash}"` : ''} stroke-linecap="round" pointer-events="none"/>`;
  s += chipMarkup(mid.x, mid.y, wire.label || bus.short, bus.color, 'label');
  s += '</g>';
  return s;
}

function zoneMarkup(zone, selected) {
  const color = zone.color || '#4a90d9';
  let s = `<g class="zone" data-id="${esc(zone.id)}" data-type="zone">`;
  s += `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="14"`
    + ` fill="${esc(color)}" fill-opacity="0.06" stroke="none" pointer-events="none"/>`;
  s += `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="14"`
    + ` fill="none" stroke="${selected ? ACCENT : esc(color)}" stroke-opacity="${selected ? 1 : 0.8}"`
    + ` stroke-width="${selected ? 2 : 1.5}"${selected ? '' : ' stroke-dasharray="6 5"'}/>`;
  s += `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="14"`
    + ` fill="none" stroke="transparent" stroke-width="12" pointer-events="stroke"/>`;
  const label = zone.label || 'Zone';
  const w = label.length * 6.2 + 18;
  s += `<rect x="${zone.x + 12}" y="${zone.y - 9}" width="${w}" height="18" rx="9"`
    + ` fill="${CHIP_BG}" stroke="${esc(color)}" stroke-opacity="0.8"/>`;
  s += `<text x="${zone.x + 12 + w / 2}" y="${zone.y}" text-anchor="middle" dominant-baseline="central"`
    + ` font-size="10" font-weight="700" fill="${esc(color)}" data-edit="label">${esc(label)}</text>`;
  s += '</g>';
  return s;
}

function noteMarkup(note, selected) {
  const lines = wrapText(note.text);
  const h = noteHeight(note.text);
  let s = `<g class="note" data-id="${esc(note.id)}" data-type="note">`;
  s += `<rect x="${note.x}" y="${note.y}" width="${NOTE_W}" height="${h}" rx="8"`
    + ` fill="#1c1710" stroke="${selected ? ACCENT : '#8a6d3b'}" stroke-width="${selected ? 2 : 1}"/>`;
  lines.forEach((line, i) => {
    s += `<text x="${note.x + 10}" y="${note.y + 20 + i * 16}" font-size="11.5" fill="#e8c884"`
      + `${i === 0 ? ' data-edit="text"' : ''}>${esc(line)}</text>`;
  });
  s += '</g>';
  return s;
}

export function diagramMarkup(doc, ui = {}) {
  const sel = ui.selection || new Set();
  const zones = doc.zones.map((z) => zoneMarkup(z, sel.has(z.id))).join('');
  const wires = doc.wires.map((w) => wireMarkup(doc, w, sel.has(w.id))).join('');
  const nodes = doc.nodes.map((n) => nodeMarkup(n, sel.has(n.id), ui.hoverPort)).join('');
  const notes = doc.notes.map((n) => noteMarkup(n, sel.has(n.id))).join('');
  return `<g class="layer-zones">${zones}</g><g class="layer-wires">${wires}</g>`
    + `<g class="layer-nodes">${nodes}</g><g class="layer-notes">${notes}</g>`;
}

function oppositeSide(side) {
  return { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[side];
}

function overlayMarkup(doc, ui) {
  let s = '<g class="layer-overlay" pointer-events="none">';
  if (ui.marquee) {
    const m = ui.marquee;
    s += `<rect x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}"`
      + ` fill="${ACCENT}" fill-opacity="0.08" stroke="${ACCENT}" stroke-dasharray="4 3"/>`;
  }
  if (ui.wireDraft) {
    const { from, cursor } = ui.wireDraft;
    const node = doc.nodes.find((n) => n.id === from.node);
    const pd = node ? getPart(node.kind).ports.find((q) => q.id === from.port) : null;
    if (node && pd) {
      const a = portPosition(node, pd);
      s += `<path d="${wirePath(a, pd.side, cursor, oppositeSide(pd.side))}" fill="none"`
        + ` stroke="${ACCENT}" stroke-width="2" stroke-dasharray="6 4"/>`;
    }
  }
  s += '</g>';
  return s;
}

function gridMarkup() {
  return '<rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#gridpat)" pointer-events="none"/>';
}

export function createRenderer(svg) {
  const NS = 'http://www.w3.org/2000/svg';
  const root = document.createElementNS(NS, 'g');
  svg.appendChild(root);
  return {
    render(doc, view, ui = {}) {
      root.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.zoom})`);
      let inner = '';
      if (ui.grid !== false) inner += gridMarkup();
      inner += diagramMarkup(doc, ui);
      inner += overlayMarkup(doc, ui);
      root.innerHTML = inner;
    },
  };
}
```

Run: `node --check src/render.js` and `npm test` — expected: PASS.

- [ ] **Step 5: Rewrite `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Schematica</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div id="app">
    <header id="toolbar">
      <div id="brand">
        <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 4h8v8H4z M6 1v3 M10 1v3 M6 12v3 M10 12v3 M1 6h3 M1 10h3 M12 6h3 M12 10h3"/>
        </svg>
        <span class="brand-name">Schematica</span>
        <span class="brand-sub">hardware diagrams</span>
      </div>
      <input id="title" type="text" spellcheck="false" aria-label="Board title">
      <div class="group" role="group" aria-label="Tools">
        <button id="tool-select" data-tool="select" class="tool active" title="Select / move (V)">
          <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M5 2l9 6.5-4.6 1L7.5 14z"/></svg>
        </button>
        <button id="tool-wire" data-tool="wire" class="tool" title="Draw wire (C)">
          <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4 14c5 0 5-10 10-10"/><circle cx="4" cy="14" r="1.8"/><circle cx="14" cy="4" r="1.8"/></svg>
        </button>
        <button id="tool-zone" data-tool="zone" class="tool" title="Draw zone (Z)">
          <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 6V3h3 M12 3h3v3 M15 12v3h-3 M6 15H3v-3"/></svg>
        </button>
        <button id="tool-note" data-tool="note" class="tool" title="Add note (N)">
          <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4 3h8l3 3v9H4z M12 3v3h3 M7 9h5 M7 12h4"/></svg>
        </button>
      </div>
      <div class="group">
        <button id="undo" title="Undo (Ctrl/Cmd-Z)" disabled>&#8630;</button>
        <button id="redo" title="Redo (Ctrl/Cmd-Shift-Z)" disabled>&#8631;</button>
      </div>
      <div class="group">
        <button id="zoom-out" title="Zoom out">&minus;</button>
        <button id="zoom-reset" title="Reset zoom"><span id="zoom-label">100%</span></button>
        <button id="zoom-in" title="Zoom in">+</button>
      </div>
      <div class="group">
        <button id="btn-grid" class="active" title="Toggle grid snap + dots">Grid</button>
        <button id="btn-legend" title="Toggle bus legend">Legend</button>
      </div>
      <div class="group push-right">
        <button id="btn-export-png" title="Export PNG">PNG</button>
        <button id="btn-export-svg" title="Export SVG">SVG</button>
        <button id="btn-save" title="Download .schematica.json">Save</button>
        <button id="btn-open" title="Open .schematica.json">Open</button>
        <button id="btn-new" title="Clear board">New</button>
      </div>
    </header>
    <aside id="palette"></aside>
    <main id="canvas-wrap">
      <svg id="canvas">
        <defs>
          <pattern id="gridpat" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1.2" cy="1.2" r="1.2" fill="#1c2333"></circle>
          </pattern>
        </defs>
      </svg>
      <div id="hintbar" aria-hidden="true">
        <kbd>V</kbd> select &middot; <kbd>C</kbd> wire &middot; <kbd>Z</kbd> zone &middot; <kbd>N</kbd> note
        &middot; drag ports to link &middot; double-click rename &middot; <kbd>Del</kbd> delete
        &middot; <kbd>Space</kbd>+drag pan
      </div>
      <div id="legend" hidden></div>
      <div id="bus-popover" hidden></div>
      <input id="inline-editor" type="text" spellcheck="false" hidden>
    </main>
    <aside id="props" hidden></aside>
  </div>
  <input type="file" id="file-input" accept=".json,application/json" hidden>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

- [ ] **Step 6: Rewrite `css/style.css`**

```css
:root {
  --bg0: #0a0e17;
  --bg1: #0d1220;
  --bg2: #131a2b;
  --bg3: #182238;
  --line: #1e2942;
  --line2: #2c3a5c;
  --text: #e6ebf4;
  --muted: #8b96ab;
  --faint: #566179;
  --accent: #38bdf8;
  --accent-dim: #0e2a40;
  --mono: ui-monospace, 'SF Mono', Menlo, monospace;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  color: var(--text);
  background: var(--bg0);
}

#app {
  height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
  grid-template-columns: 248px 1fr auto;
  grid-template-areas:
    "toolbar toolbar toolbar"
    "palette canvas props";
}

/* ---- Toolbar ---- */
#toolbar {
  grid-area: toolbar;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: var(--bg1);
  border-bottom: 1px solid var(--line);
}

#brand { display: flex; align-items: center; gap: 8px; margin-right: 4px; }
.brand-name { font-weight: 800; letter-spacing: 0.2px; font-size: 15px; }
.brand-sub { color: var(--faint); font-size: 11.5px; margin-top: 2px; }

#title {
  background: var(--bg0);
  border: 1px solid var(--line);
  color: var(--text);
  border-radius: 8px;
  padding: 6px 10px;
  width: 170px;
  font-size: 13px;
}
#title:focus { outline: none; border-color: var(--accent); }

.group {
  display: flex;
  gap: 2px;
  align-items: center;
  background: var(--bg1);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 3px;
}
.push-right { margin-left: auto; }

#toolbar button {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--muted);
  border-radius: 7px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12.5px;
  font-family: inherit;
  line-height: 1;
}
#toolbar button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
#toolbar button:hover:not(:disabled) { color: var(--text); background: var(--bg3); }
#toolbar button:disabled { opacity: 0.35; cursor: default; }
#toolbar button.active { background: var(--accent-dim); color: #7dd3fc; }
#toolbar button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
#zoom-label { font-family: var(--mono); font-size: 11.5px; min-width: 36px; text-align: center; }

/* ---- Palette ---- */
#palette {
  grid-area: palette;
  overflow-y: auto;
  background: var(--bg1);
  border-right: 1px solid var(--line);
  padding: 12px 12px 24px;
}
#palette h3 {
  margin: 16px 2px 8px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1.6px;
  color: var(--faint);
  cursor: pointer;
  user-select: none;
}
#palette h3:first-child { margin-top: 4px; }
#palette h3.collapsed { opacity: 0.6; }
.cat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.palette-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  background: var(--bg2);
  border: 1px solid var(--line);
  color: var(--muted);
  border-radius: 12px;
  padding: 12px 6px 10px;
  cursor: grab;
  font-size: 11.5px;
  font-family: inherit;
  text-align: center;
  line-height: 1.25;
}
.palette-item:hover { border-color: var(--line2); color: var(--text); background: var(--bg3); }
.palette-item:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.palette-item .badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--c) 13%, transparent);
  border: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
}
.palette-item .badge svg { width: 18px; height: 18px; }

/* ---- Canvas ---- */
#canvas-wrap { grid-area: canvas; position: relative; overflow: hidden; }
#canvas {
  width: 100%;
  height: 100%;
  display: block;
  background: var(--bg0);
  touch-action: none;
}
#canvas.panning { cursor: grab; }
#canvas.tool-wire .port { cursor: crosshair; }

#hintbar {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  background: rgba(13, 18, 32, 0.9);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 7px 14px;
  color: var(--faint);
  font-size: 11.5px;
  white-space: nowrap;
  pointer-events: none;
}
#hintbar kbd {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--muted);
  background: var(--bg3);
  border: 1px solid var(--line2);
  border-radius: 4px;
  padding: 1px 5px;
}

/* ---- Properties panel ---- */
#props {
  grid-area: props;
  width: 260px;
  background: var(--bg1);
  border-left: 1px solid var(--line);
  padding: 14px;
  overflow-y: auto;
}
#props h3 { margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; color: #7dd3fc; }
#props label { display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--faint); margin: 12px 0 4px; }
#props input[type="text"], #props textarea, #props select {
  width: 100%;
  background: var(--bg0);
  border: 1px solid var(--line);
  color: var(--text);
  border-radius: 8px;
  padding: 7px 9px;
  font-size: 13px;
  font-family: inherit;
}
#props input:focus, #props textarea:focus, #props select:focus { outline: none; border-color: var(--accent); }
#props input[type="color"] { width: 100%; height: 30px; padding: 2px; background: var(--bg0); border: 1px solid var(--line); border-radius: 8px; }
#props textarea { min-height: 70px; resize: vertical; }
#props button {
  margin-top: 14px;
  background: #2a1215;
  border: 1px solid #7f1d1d;
  color: #fca5a5;
  border-radius: 8px;
  padding: 7px 11px;
  cursor: pointer;
  font-family: inherit;
}
#props button:hover { background: #3b1519; }

/* ---- Legend ---- */
#legend {
  position: absolute;
  right: 14px;
  bottom: 14px;
  background: rgba(13, 18, 32, 0.95);
  border: 1px solid var(--line2);
  border-radius: 12px;
  padding: 12px 14px;
  color: var(--text);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}
#legend h3 { margin: 0 0 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 1.6px; color: var(--faint); }
.legend-row { display: flex; align-items: center; gap: 10px; font-size: 11.5px; line-height: 1.9; color: var(--muted); }

/* ---- Bus popover ---- */
#bus-popover {
  position: fixed;
  z-index: 30;
  background: var(--bg1);
  border: 1px solid var(--line2);
  border-radius: 10px;
  padding: 4px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
  max-height: 300px;
  overflow-y: auto;
}
#bus-popover button {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 168px;
  background: none;
  border: none;
  border-radius: 7px;
  padding: 6px 9px;
  cursor: pointer;
  font-size: 12.5px;
  font-family: inherit;
  color: var(--text);
  text-align: left;
}
#bus-popover button:hover { background: var(--bg3); }
#bus-popover .swatch { width: 20px; height: 4px; border-radius: 2px; flex: none; }

/* ---- Inline editor ---- */
#inline-editor {
  position: fixed;
  z-index: 40;
  width: 200px;
  background: var(--bg1);
  color: var(--text);
  border: 2px solid var(--accent);
  border-radius: 7px;
  padding: 5px 8px;
  font-size: 13px;
  font-family: inherit;
}
#inline-editor:focus { outline: none; }

@media (prefers-reduced-motion: no-preference) {
  #toolbar button, .palette-item { transition: background 120ms ease, color 120ms ease, border-color 120ms ease; }
}
```

- [ ] **Step 7: Update `src/main.js`** (three exact edits)

Edit 1 — replace:

```js
import { CATEGORIES, PARTS, getPart } from './palette.js';
```

with:

```js
import { CATEGORIES, CATEGORY_COLORS, PARTS, getPart } from './palette.js';
```

Edit 2 — in `buildPalette`, replace:

```js
    const box = document.createElement('div');
    palette.appendChild(box);
```

with:

```js
    const box = document.createElement('div');
    box.className = 'cat-grid';
    palette.appendChild(box);
```

Edit 3 — in `buildPalette`, replace:

```js
      const item = document.createElement('button');
      item.className = 'palette-item';
      item.textContent = part.name;
```

with:

```js
      const item = document.createElement('button');
      item.className = 'palette-item';
      const color = CATEGORY_COLORS[cat.id];
      item.innerHTML = `<span class="badge" style="--c:${color}">`
        + `<svg viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1.5"`
        + ` stroke-linecap="round" stroke-linejoin="round"><path d="${part.icon}"/></svg></span>`
        + `<span class="pi-name">${part.name}</span>`;
```

Edit 4 — in `renderProps`, replace:

```js
    html += propField('Fill color', `<input type="color" data-prop="color" value="${escAttr(item.color || '#ffffff')}">`);
```

with:

```js
    html += propField('Accent color', `<input type="color" data-prop="color" value="${escAttr(item.color || '#38bdf8')}">`);
```

- [ ] **Step 8: Verify**

Run: `npm test` (all pass, including the new palette test), `node --check src/render.js`, `node --check src/main.js`.
Browser verification is performed by the controller against the reference screenshots.

- [ ] **Step 9: Commit**

```bash
git add src/buses.js src/palette.js src/render.js src/main.js index.html css/style.css tests/palette.test.js
git commit -m "feat: NetDraw-style dark redesign - tinted icon badges, wire chips, pill toolbar"
```
