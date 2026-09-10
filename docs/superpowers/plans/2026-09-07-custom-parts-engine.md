# Custom Parts Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Custom nodes (`kind: "custom"` carrying an inline `part` definition) load, resolve, size, render, check, count in the BOM, search, and can be created and edited by the assistant, with no editor UI yet.

**Architecture:** One new module, `src/custom.js`, owns the validator (`normalizePart`) and the resolver (`partOf`). Every place that resolved a node by `getPart(node.kind)` switches to `partOf(node)`; the RDK wrapper `nodePart` funnels checks, wiring, and rendering through it, so most consumers change nothing. The file format goes to schema 2 with a no-op migration. The assistant's `add_part` and `update_part` gain a `custom` definition validated by the same function.

**Tech Stack:** Static ES modules, no build step, no dependencies. Tests with Node's built-in runner (`node --test`), browser smoke test over the Chrome DevTools Protocol (`npm run e2e`).

**Spec:** `docs/superpowers/specs/2026-09-07-custom-parts-design.md`

## Global Constraints

- No new runtime dependencies; no build step. Everything is plain ES modules served statically.
- Limits, verbatim from the spec: name 60, ports 24, port name 12, fields 8, choices per field 20 (each 40 chars), path 2000, library templates 200.
- Built-in parts keep their current card sizes. `tests/examples.test.js` round-trips every example and asserts zone containment; those must stay green.
- Custom port offsets are never stored: ports on one side sit at `(i+1)/(n+1)` in list order.
- Commits carry **no** `Co-Authored-By` or `Claude-Session` trailers (repo rule; the sole contributor is HenryCooper86).
- Run `npm test` before every commit. The final task also runs `npm run e2e` (needs Chrome; `CHROME_PATH` overrides).
- Baseline on main before this plan: 375 unit tests, 94 e2e checks, all passing.

## File map

| File | Responsibility |
|---|---|
| `src/custom.js` (new) | `LIMITS`, `SIDES`, `PATH_RE`, `initials`, `portsWithOffsets`, `normalizePart`, `partOf`, `mergePortIds`, `mergeFieldIds` |
| `src/rdk/profiles.js` | `nodePart`/`displayPart` resolve through `partOf`; `knownPorts(node)` takes a node |
| `src/geometry.js` | `nodeMeta`/`nodeSize` through `partOf`; custom cards grow with ports per side |
| `src/render.js` | Badge draws initials for `part.text` |
| `src/serialize.js` | Validates `part` on custom nodes; `MIGRATIONS[1]` no-op; `knownPorts(node)` |
| `src/state.js` | `SCHEMA_VERSION = 2`; `addNode(store, kind, x, y, part)` |
| `src/examples.js`, `src/rdk/examples.js` | `schema: 2` |
| `src/drc.js` | Required custom ports → `unconnected-power` / `unconnected-port` |
| `src/bom.js` | Custom rows group by template or name |
| `src/search.js` | `templateHaystack`, `filterTemplates(query, templates)` |
| `src/ai/layout.js` | Category through `partOf` |
| `src/ai/context.js` | `nodeLine` lists custom ports; `templateLine` |
| `src/ai/ops.js` | `rewireNode` helper; `add_part` custom/template; `update_part` custom; schema; `applyEdits(doc, ops, { library })` |
| `src/ai/tools.js` | Executor takes `library`; `search_parts` lists templates; descriptions |
| `src/ai/prompt.js` | Custom-part rule; single-shot mention |
| `src/ui/props.js` | Header and fields through `partOf` (no buttons yet; plan 2) |
| `tests/custom.test.js` (new), plus additions to geometry, render, serialize, state, drc, bom, search, ai-context, ai-ops, ai-tools, e2e smoke |

Library interface used by the assistant (plan 2 implements the module; this plan only consumes the shape): `{ list(): template[], get(id): template | null }` where a template is a normalized definition plus `id` and `updated`.

---

### Task 1: `normalizePart`, `partOf`, and helpers

**Files:**
- Create: `src/custom.js`
- Test: `tests/custom.test.js`

**Interfaces:**
- Consumes: `PARTS`, `CATEGORIES`, `getPart` from `src/palette.js`; `BUSES` from `src/buses.js`.
- Produces:
  - `LIMITS` object, `SIDES` array, `PATH_RE` regex.
  - `initials(name: string): string` (1–2 uppercase chars).
  - `portsWithOffsets(ports): port[]` — same order, each with `offset`.
  - `normalizePart(raw): { part: Definition | null, warnings: string[] }` where `Definition = { lib?, name, category, accent, icon, ports: [{ id, name, side, bus, required }], fields: [{ id, label, options?, placeholder? }] }`.
  - `partOf(node): Part` — a catalogue-shaped part (`kind`, `name`, `category`, `accent`, `icon` | `glyph` | `text`, `ports` with offsets, `fields` or undefined, `custom: true`, `lib`) for custom nodes; `getPart(node.kind)` otherwise.

- [ ] **Step 1: Write the failing tests**

```js
// tests/custom.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, SIDES, PATH_RE, initials, portsWithOffsets, normalizePart, partOf } from '../src/custom.js';
import { PARTS } from '../src/palette.js';

const DEF = {
  name: 'Motor driver x4', category: 'actuators', accent: null, icon: { kind: 'motor' },
  ports: [
    { id: 'p1', name: 'VCC', side: 'top', bus: 'power', required: true },
    { id: 'p2', name: 'GND', side: 'top', bus: 'gnd', required: true },
    { id: 'p3', name: 'CAN', side: 'left', bus: 'can', required: false },
    { id: 'p4', name: 'M1', side: 'right', bus: 'pwm', required: false },
    { id: 'p5', name: 'M2', side: 'right', bus: 'pwm', required: false },
  ],
  fields: [{ id: 'f1', label: 'Channels' }, { id: 'f2', label: 'Drive', options: ['brushed', 'brushless', 'stepper'] }],
};

test('limits match the spec and sides are the four card edges', () => {
  assert.equal(LIMITS.name, 60);
  assert.equal(LIMITS.ports, 24);
  assert.equal(LIMITS.portName, 12);
  assert.equal(LIMITS.fields, 8);
  assert.equal(LIMITS.options, 20);
  assert.equal(LIMITS.option, 40);
  assert.equal(LIMITS.path, 2000);
  assert.equal(LIMITS.library, 200);
  assert.deepEqual(SIDES, ['left', 'right', 'top', 'bottom']);
  assert.ok(PATH_RE.test('M4 4h8v8H4z M6 1v3'));
  assert.ok(!PATH_RE.test('M4 4<script>'));
});

test('initials take the first letters of the first two words', () => {
  assert.equal(initials('Motor driver x4'), 'MD');
  assert.equal(initials('MCU'), 'MC');
  assert.equal(initials('x'), 'X');
  assert.equal(initials(''), '?');
});

test('ports on one side are spaced evenly in list order and keep their order', () => {
  const out = portsWithOffsets(DEF.ports);
  assert.deepEqual(out.map((p) => p.id), ['p1', 'p2', 'p3', 'p4', 'p5']);
  assert.deepEqual(out.map((p) => p.offset), [0.333, 0.667, 0.5, 0.333, 0.667]);
  assert.deepEqual(portsWithOffsets([]), []);
});

test('a complete definition round-trips unchanged with no warnings', () => {
  const { part, warnings } = normalizePart(DEF);
  assert.deepEqual(warnings, []);
  assert.deepEqual(part, DEF);
  assert.notEqual(part, DEF, 'a fresh object');
  const withLib = normalizePart({ ...DEF, lib: 'lp1abc' }).part;
  assert.equal(withLib.lib, 'lp1abc');
  assert.deepEqual(Object.keys(withLib)[0], 'lib');
});

test('an unusable definition is null with a reason', () => {
  assert.equal(normalizePart(null).part, null);
  assert.equal(normalizePart([]).part, null);
  assert.equal(normalizePart({}).part, null);
  assert.match(normalizePart({ name: '   ' }).warnings[0], /no name/);
});

test('name, category, accent, and icon fall back with warnings', () => {
  const long = normalizePart({ name: 'x'.repeat(100) }).part;
  assert.equal(long.name.length, LIMITS.name);
  const cat = normalizePart({ name: 'A', category: 'toys' });
  assert.equal(cat.part.category, 'misc');
  assert.match(cat.warnings[0], /Unknown category "toys"/);
  assert.equal(normalizePart({ name: 'A' }).part.category, 'misc');
  assert.deepEqual(normalizePart({ name: 'A' }).warnings, [], 'a missing category is the default, not a warning');
  const acc = normalizePart({ name: 'A', accent: 'red' });
  assert.equal(acc.part.accent, null);
  assert.match(acc.warnings[0], /invalid accent/);
  assert.equal(normalizePart({ name: 'A', accent: '#f87171' }).part.accent, '#f87171');
  // Icons: a built-in kind, initials, a path; anything else is initials.
  assert.deepEqual(normalizePart({ name: 'Ab Cd', icon: { kind: 'mcu' } }).part.icon, { kind: 'mcu' });
  assert.deepEqual(normalizePart({ name: 'Ab Cd', icon: { text: ' md ' } }).part.icon, { text: 'md' });
  assert.deepEqual(normalizePart({ name: 'Ab Cd', icon: { path: 'M1 1h2' } }).part.icon, { path: 'M1 1h2' });
  assert.deepEqual(normalizePart({ name: 'Ab Cd' }).part.icon, { text: 'AC' });
  const bad = normalizePart({ name: 'Ab Cd', icon: { kind: 'nope' } });
  assert.deepEqual(bad.part.icon, { text: 'AC' });
  assert.match(bad.warnings[0], /Icon/);
  assert.deepEqual(normalizePart({ name: 'Ab', icon: { text: 'ABCD' } }).part.icon, { text: 'AB' }, 'over-long initials fall back');
  assert.deepEqual(normalizePart({ name: 'Ab', icon: { path: 'x1' } }).part.icon, { text: 'AB' }, 'a path must start with M');
});

test('ports: ids are generated and unique, bad entries drop, buses fall back, same-side duplicates drop', () => {
  const res = normalizePart({
    name: 'P',
    ports: [
      { name: 'VCC', side: 'left', bus: 'power' },
      { name: 'vcc', side: 'left', bus: 'gnd' },
      { name: 'VCC', side: 'right', bus: 'power' },
      { name: '', side: 'left', bus: 'i2c' },
      { name: 'X', side: 'middle', bus: 'i2c' },
      { name: 'Y', side: 'bottom', bus: 'warp' },
      { id: 'p1', name: 'Z', side: 'top', bus: 'spi', required: true },
      { id: 'a b', name: 'Q', side: 'top', bus: 'spi' },
    ],
  });
  const ports = res.part.ports;
  assert.deepEqual(ports.map((p) => p.name), ['VCC', 'VCC', 'Y', 'Z', 'Q']);
  assert.deepEqual(ports.map((p) => p.id), ['p1', 'p2', 'p3', 'p4', 'p5'], 'explicit p1 collides with the generated one and is regenerated');
  assert.equal(ports[2].bus, 'gpio');
  assert.equal(ports[3].required, true);
  assert.equal(ports[0].required, false);
  assert.ok(res.warnings.some((w) => /duplicate port "vcc"/i.test(w)));
  assert.ok(res.warnings.some((w) => /no name or side/.test(w)));
  assert.ok(res.warnings.some((w) => /unknown bus "warp"/.test(w)));
  assert.equal(res.warnings.filter((w) => /no name or side/.test(w)).length, 2);
  const many = normalizePart({ name: 'P', ports: Array.from({ length: 30 }, (_, i) => ({ name: `P${i}`, side: 'left', bus: 'gpio' })) });
  assert.equal(many.part.ports.length, LIMITS.ports);
  assert.ok(many.warnings.some((w) => /first 24 ports/.test(w)));
  assert.equal(normalizePart({ name: 'P', ports: [{ name: 'ABCDEFGHIJKLMNOP', side: 'left', bus: 'gpio' }] }).part.ports[0].name.length, LIMITS.portName);
  assert.deepEqual(normalizePart({ name: 'P', ports: 'nope' }).part.ports, []);
});

test('fields: labels required, choices need two or more, ids generated', () => {
  const res = normalizePart({
    name: 'F',
    fields: [
      { label: 'Channels' },
      { label: '', options: ['a', 'b'] },
      { label: 'Drive', options: ['brushed', ' brushed ', 'stepper', ''] },
      { label: 'Lonely', options: ['one'] },
      { id: 'f9', label: 'Keep', placeholder: 'e.g. 4' },
    ],
  });
  const fields = res.part.fields;
  assert.deepEqual(fields.map((f) => f.id), ['f1', 'f2', 'f3', 'f9']);
  assert.deepEqual(fields[1].options, ['brushed', 'stepper']);
  assert.equal(fields[2].options, undefined);
  assert.equal(fields[3].placeholder, 'e.g. 4');
  assert.ok(res.warnings.some((w) => /no label/.test(w)));
  assert.ok(res.warnings.some((w) => /at least two choices/.test(w)));
  const many = normalizePart({ name: 'F', fields: Array.from({ length: 10 }, (_, i) => ({ label: `L${i}` })) });
  assert.equal(many.part.fields.length, LIMITS.fields);
});

test('partOf resolves a custom node to a catalogue-shaped part and memoizes it', () => {
  const node = { id: 'n1', kind: 'custom', part: DEF, label: 'MD' };
  const part = partOf(node);
  assert.equal(part.kind, 'custom');
  assert.equal(part.custom, true);
  assert.equal(part.name, 'Motor driver x4');
  assert.equal(part.category, 'actuators');
  assert.equal(part.icon, PARTS.motor.icon, 'a kind icon is the built-in path');
  assert.equal(part.glyph, undefined);
  assert.equal(part.ports.length, 5);
  assert.equal(part.ports[0].offset, 0.333);
  assert.deepEqual(part.fields, DEF.fields);
  assert.equal(partOf(node), part, 'same definition object, same part');
  assert.notEqual(partOf({ ...node, part: structuredClone(DEF) }), part, 'a clone resolves afresh');
});

test('partOf draws initials, paths, and glyph kinds, and hides an empty field list', () => {
  const text = partOf({ kind: 'custom', part: { name: 'Ab Cd', category: 'misc', accent: null, icon: { text: 'ZZ' }, ports: [], fields: [] } });
  assert.equal(text.text, 'ZZ');
  assert.equal(text.icon, undefined);
  assert.equal(text.fields, undefined, 'no fields means no schema section');
  const path = partOf({ kind: 'custom', part: { name: 'P', category: 'misc', accent: null, icon: { path: 'M1 1h2' }, ports: [], fields: [] } });
  assert.equal(path.icon, 'M1 1h2');
  const glyph = partOf({ kind: 'custom', part: { name: 'R', category: 'network', accent: '#123456', icon: { kind: 'router' }, ports: [], fields: [] } });
  assert.equal(glyph.glyph, PARTS.router.glyph);
  assert.equal(glyph.accent, '#123456');
  const noIcon = partOf({ kind: 'custom', part: { name: 'Ab Cd', category: 'misc', accent: null, ports: [], fields: [] } });
  assert.equal(noIcon.text, 'AC', 'a definition with no icon shows initials');
});

test('partOf falls through to the catalogue for built-in nodes and broken custom nodes', () => {
  assert.equal(partOf({ kind: 'mcu' }), PARTS.mcu);
  assert.equal(partOf({ kind: 'custom' }), PARTS.generic, 'custom without a definition is the generic box');
  assert.equal(partOf({ kind: 'nope' }), PARTS.generic);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/custom.test.js`
Expected: FAIL — `Cannot find module '.../src/custom.js'`.

- [ ] **Step 3: Write `src/custom.js`**

```js
// Custom parts. A node of kind "custom" carries its own definition in
// `node.part`: name, category, accent, icon, typed ports, and extra fields.
// This module owns the one validator every producer uses (the part editor,
// the file loader, the assistant's edit operations) and the resolver that
// turns a custom node into a catalogue-shaped part for the rest of the app.
// Port offsets are never stored: ports on a side are spaced evenly in list
// order, so reordering the list is the whole positioning story.
import { PARTS, CATEGORIES, getPart } from './palette.js';
import { BUSES } from './buses.js';

export const LIMITS = {
  name: 60, ports: 24, portName: 12, id: 24, fields: 8, fieldLabel: 40,
  options: 20, option: 40, placeholder: 40, path: 2000, text: 3, lib: 40, library: 200,
};
export const SIDES = ['left', 'right', 'top', 'bottom'];
// SVG path data: commands, numbers, separators. Nothing that could close an
// attribute or open a tag survives this.
export const PATH_RE = /^[MmZzLlHhVvCcSsQqTtAa0-9\s,.eE+-]+$/;
const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const ID_RE = /^[A-Za-z0-9_-]+$/;
const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// Up to two letters for a badge with no icon: "Motor driver x4" -> "MD".
export function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const s = words.length >= 2 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return s.toUpperCase();
}

// Ports on one side sit at (i+1)/(n+1) of that edge, in list order. The
// list order is kept so "the first port of a bus" means the same thing here
// as in the definition.
export function portsWithOffsets(ports) {
  const count = {};
  const seen = {};
  for (const p of ports) count[p.side] = (count[p.side] || 0) + 1;
  return ports.map((p) => {
    seen[p.side] = (seen[p.side] || 0) + 1;
    return { ...p, offset: Math.round((seen[p.side] / (count[p.side] + 1)) * 1000) / 1000 };
  });
}

function normalizeIcon(raw, name, warnings) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (typeof raw.kind === 'string' && Object.hasOwn(PARTS, raw.kind)) return { kind: raw.kind };
    const text = str(raw.text);
    if (text && text.length <= LIMITS.text) return { text };
    const path = str(raw.path);
    if (path && path.length <= LIMITS.path && /^[Mm]/.test(path) && PATH_RE.test(path)) return { path };
    warnings.push(`Icon on "${name}" was not usable; using initials.`);
  }
  return { text: initials(name) };
}

// A stable id: the given one when it is a short plain token not yet taken,
// otherwise the next free `<prefix><n>`.
function idAllocator(prefix) {
  const taken = new Set();
  let counter = 0;
  return (wanted) => {
    let id = str(wanted);
    if (!id || id.length > LIMITS.id || !ID_RE.test(id) || taken.has(id)) {
      do { counter += 1; id = `${prefix}${counter}`; } while (taken.has(id));
    }
    taken.add(id);
    return id;
  };
}

function normalizePorts(raw, name, warnings) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) { warnings.push(`Ports on "${name}" must be a list; ignored.`); return []; }
  const ports = [];
  const names = new Set();
  const nextId = idAllocator('p');
  for (const p of raw.slice(0, LIMITS.ports)) {
    const pname = str(p?.name).slice(0, LIMITS.portName);
    const side = SIDES.includes(p?.side) ? p.side : null;
    if (!pname || !side) { warnings.push(`Dropped a port on "${name}" with no name or side.`); continue; }
    const key = `${side}|${pname.toLowerCase()}`;
    if (names.has(key)) { warnings.push(`Dropped duplicate port "${pname}" on the ${side} of "${name}".`); continue; }
    let bus = typeof p.bus === 'string' ? p.bus : '';
    if (!Object.hasOwn(BUSES, bus)) {
      warnings.push(`Port "${pname}" on "${name}" has unknown bus "${bus}"; using GPIO.`);
      bus = 'gpio';
    }
    names.add(key);
    ports.push({ id: nextId(p.id), name: pname, side, bus, required: p.required === true });
  }
  if (raw.length > LIMITS.ports) warnings.push(`"${name}" keeps the first ${LIMITS.ports} ports.`);
  return ports;
}

function normalizeFields(raw, name, warnings) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) { warnings.push(`Fields on "${name}" must be a list; ignored.`); return []; }
  const fields = [];
  const nextId = idAllocator('f');
  for (const f of raw.slice(0, LIMITS.fields)) {
    const label = str(f?.label).slice(0, LIMITS.fieldLabel);
    if (!label) { warnings.push(`Dropped a field on "${name}" with no label.`); continue; }
    const field = { id: nextId(f.id), label };
    if (f.options !== undefined) {
      const options = Array.isArray(f.options)
        ? [...new Set(f.options.map((o) => str(o).slice(0, LIMITS.option)).filter(Boolean))].slice(0, LIMITS.options)
        : [];
      if (options.length >= 2) field.options = options;
      else warnings.push(`Field "${label}" on "${name}" needs at least two choices; it is free text.`);
    }
    const placeholder = str(f.placeholder).slice(0, LIMITS.placeholder);
    if (placeholder) field.placeholder = placeholder;
    fields.push(field);
  }
  if (raw.length > LIMITS.fields) warnings.push(`"${name}" keeps the first ${LIMITS.fields} fields.`);
  return fields;
}

// The one validator. Returns a fresh, clean definition plus warnings for
// everything it changed or dropped, or `part: null` when there is nothing
// usable (no name). Unknown keys are ignored.
export function normalizePart(raw) {
  const warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { part: null, warnings: ['Custom part definition is missing.'] };
  const name = str(raw.name).slice(0, LIMITS.name);
  if (!name) return { part: null, warnings: ['Custom part has no name.'] };
  let category = raw.category;
  if (!CATEGORY_IDS.has(category)) {
    if (category !== undefined) warnings.push(`Unknown category "${category}" on "${name}"; using Storage / Misc.`);
    category = 'misc';
  }
  let accent = null;
  if (typeof raw.accent === 'string' && HEX_COLOR.test(raw.accent)) accent = raw.accent;
  else if (raw.accent != null) warnings.push(`Ignored invalid accent on "${name}".`);
  const lib = str(raw.lib);
  const part = {
    ...(lib && lib.length <= LIMITS.lib && ID_RE.test(lib) ? { lib } : {}),
    name,
    category,
    accent,
    icon: normalizeIcon(raw.icon, name, warnings),
    ports: normalizePorts(raw.ports, name, warnings),
    fields: normalizeFields(raw.fields, name, warnings),
  };
  return { part, warnings };
}

// A custom node resolved to the shape the rest of the app reads from PARTS.
// Memoized on the definition object: render passes pay nothing, and an undo
// snapshot (a fresh object) resolves once more.
const memo = new WeakMap();
export function partOf(node) {
  if (!node || node.kind !== 'custom' || !node.part || typeof node.part !== 'object') return getPart(node?.kind);
  const def = node.part;
  let part = memo.get(def);
  if (!part) {
    part = {
      kind: 'custom',
      custom: true,
      name: def.name,
      category: def.category,
      accent: def.accent ?? null,
      ports: portsWithOffsets(def.ports || []),
      fields: def.fields?.length ? def.fields : undefined,
      lib: def.lib,
    };
    const icon = def.icon || {};
    if (icon.kind && Object.hasOwn(PARTS, icon.kind)) {
      const src = PARTS[icon.kind];
      if (src.glyph) part.glyph = src.glyph;
      else part.icon = src.icon;
    } else if (icon.path) {
      part.icon = icon.path;
    } else {
      part.text = icon.text || initials(def.name);
    }
    memo.set(def, part);
  }
  return part;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/custom.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/custom.js tests/custom.test.js
git commit -m "feat(custom): definition validator and node resolver"
```

---

### Task 2: `mergePortIds` and `mergeFieldIds`

**Files:**
- Modify: `src/custom.js` (append)
- Test: `tests/custom.test.js` (append)

**Interfaces:**
- Produces: `mergePortIds(oldPorts, newPorts): { ports, kept: Set<string> }` and `mergeFieldIds(oldFields, newFields): field[]`. Used by Task 10 (`update_part` with `custom`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/custom.test.js`:

```js
import { mergePortIds, mergeFieldIds } from '../src/custom.js';

test('mergePortIds keeps the ids of ports matched by name, same side first, and mints fresh ids for the rest', () => {
  const old = [
    { id: 'vcc', name: 'VCC', side: 'left', bus: 'power', required: true },
    { id: 'gnd', name: 'GND', side: 'left', bus: 'gnd', required: true },
    { id: 'p3', name: 'IO', side: 'right', bus: 'gpio', required: false },
    { id: 'p4', name: 'IO', side: 'bottom', bus: 'gpio', required: false },
  ];
  const fresh = [
    { id: 'p1', name: 'io', side: 'bottom', bus: 'gpio', required: false },
    { id: 'p2', name: 'GND', side: 'top', bus: 'gnd', required: true },
    { id: 'p3', name: 'EN', side: 'left', bus: 'gpio', required: false },
    { id: 'p4', name: 'IO', side: 'top', bus: 'gpio', required: false },
  ];
  const { ports, kept } = mergePortIds(old, fresh);
  assert.deepEqual(ports.map((p) => p.id), ['p4', 'gnd', 'p5', 'p3'], 'io matches the bottom IO first; the second IO takes the remaining old IO; EN is new');
  assert.deepEqual([...kept].sort(), ['gnd', 'p3', 'p4']);
  assert.ok(!ports.some((p) => p.id === 'vcc'), 'a removed port id never comes back');
  assert.ok(ports.every((p, i) => p.name === fresh[i].name), 'order and names are the new list');
});

test('mergePortIds with no old ports keeps the new ids', () => {
  const fresh = [{ id: 'p1', name: 'A', side: 'left', bus: 'gpio', required: false }];
  assert.deepEqual(mergePortIds([], fresh).ports, fresh);
});

test('mergeFieldIds matches by label and mints ids that no old field had', () => {
  const old = [{ id: 'f1', label: 'Channels' }, { id: 'f2', label: 'Drive', options: ['a', 'b'] }];
  const fresh = [{ id: 'f1', label: 'drive', options: ['a', 'b', 'c'] }, { id: 'f2', label: 'Rating' }];
  const out = mergeFieldIds(old, fresh);
  assert.deepEqual(out.map((f) => f.id), ['f2', 'f3']);
  assert.deepEqual(out[0].options, ['a', 'b', 'c']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/custom.test.js`
Expected: FAIL — `mergePortIds` is not exported.

- [ ] **Step 3: Append to `src/custom.js`**

```js
// When a definition is replaced (the assistant's update_part with `custom`),
// the new ports take the ids of the old ports they stand for, matched by
// name case-insensitively with a same-side match preferred, so wires on
// unchanged ports keep pointing at them. Every other new port gets an id no
// old port ever had, so a stale wire can never land on the wrong pin.
// `kept` is the set of old ids that survived.
export function mergePortIds(oldPorts, newPorts) {
  const free = new Map();
  for (const p of oldPorts) {
    const k = p.name.toLowerCase();
    if (!free.has(k)) free.set(k, []);
    free.get(k).push(p);
  }
  const kept = new Set();
  const matched = newPorts.map((p) => {
    const cands = free.get(p.name.toLowerCase()) || [];
    const i = cands.findIndex((o) => o.side === p.side);
    const old = i >= 0 ? cands.splice(i, 1)[0] : cands.shift();
    if (!old) return null;
    kept.add(old.id);
    return old.id;
  });
  const used = new Set([...oldPorts.map((p) => p.id), ...kept]);
  let counter = 0;
  const fresh = () => {
    let id;
    do { counter += 1; id = `p${counter}`; } while (used.has(id));
    used.add(id);
    return id;
  };
  return { ports: newPorts.map((p, i) => ({ ...p, id: matched[i] ?? fresh() })), kept };
}

// The same for fields, matched by label, so values keyed by field id survive
// a definition change.
export function mergeFieldIds(oldFields, newFields) {
  const free = new Map();
  for (const f of oldFields) {
    const k = f.label.toLowerCase();
    if (!free.has(k)) free.set(k, []);
    free.get(k).push(f);
  }
  const matched = newFields.map((f) => (free.get(f.label.toLowerCase()) || []).shift()?.id ?? null);
  const used = new Set([...oldFields.map((f) => f.id), ...matched.filter(Boolean)]);
  let counter = 0;
  const fresh = () => {
    let id;
    do { counter += 1; id = `f${counter}`; } while (used.has(id));
    used.add(id);
    return id;
  };
  return newFields.map((f, i) => ({ ...f, id: matched[i] ?? fresh() }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/custom.test.js`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/custom.js tests/custom.test.js
git commit -m "feat(custom): merge port and field ids across definition changes"
```

---

### Task 3: Resolve nodes through `partOf` (RDK wrapper, geometry, layout, BOM, props)

**Files:**
- Modify: `src/rdk/profiles.js` (`nodePart`, `knownPorts`, `displayPart`)
- Modify: `src/geometry.js:1-64` (`nodeMeta`, `nodeSize`)
- Modify: `src/ai/layout.js:6,17`
- Modify: `src/bom.js:3-16`
- Modify: `src/ui/props.js:5,71-90,248`
- Test: `tests/geometry.test.js`, `tests/bom.test.js`

**Interfaces:**
- Consumes: `partOf` from Task 1.
- Produces: `knownPorts(node)` (was `knownPorts(kind)`); `nodeSize` grows custom cards; `buildBOM` rows for custom nodes carry `part: <definition name>` and group by `custom:<lib or name>|<sublabel>`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/geometry.test.js`:

```js
test('custom cards grow with the ports on their busiest sides; built-in cards do not change', () => {
  const def = (ports) => ({ name: 'C', category: 'misc', accent: null, icon: { text: 'C' }, ports, fields: [] });
  const side = (n, s) => Array.from({ length: n }, (_, i) => ({ id: `${s}${i}`, name: `${s}${i}`, side: s, bus: 'gpio', required: false }));
  assert.deepEqual(nodeSize({ kind: 'custom', label: 'C', part: def([]) }), { w: 104, h: 74 });
  assert.deepEqual(nodeSize({ kind: 'custom', label: 'C', part: def(side(4, 'left')) }), { w: 104, h: 75 });
  assert.deepEqual(nodeSize({ kind: 'custom', label: 'C', part: def(side(8, 'right')) }), { w: 104, h: 135 });
  assert.deepEqual(nodeSize({ kind: 'custom', label: 'C', part: def(side(6, 'top')) }), { w: 154, h: 74 });
  assert.equal(nodeSize({ kind: 'custom', label: 'C', part: def(side(24, 'bottom')) }).w, 240, 'width stays capped');
  assert.deepEqual(nodeSize({ kind: 'mcu', label: 'MCU' }), { w: 104, h: 74 }, 'an MCU with nine ports keeps its size');
});

test('custom meta lines: part number, address, rail, then field values, three at most', () => {
  const part = { name: 'C', category: 'misc', accent: null, icon: { text: 'C' }, ports: [], fields: [{ id: 'f1', label: 'Channels' }, { id: 'f2', label: 'Drive' }] };
  const node = { kind: 'custom', label: 'C', sublabel: 'MD-4', addr: '', rail: '12V', fields: { f1: '4', f2: 'brushed' }, part };
  assert.deepEqual(nodeMeta(node), [
    { field: 'sublabel', text: 'MD-4' }, { field: 'rail', text: '12V' }, { field: 'fields.f1', text: '4' },
  ]);
});
```

Append to `tests/bom.test.js`:

```js
test('custom nodes group by template, or by name without one, and show the definition name', () => {
  const part = (lib) => ({ ...(lib ? { lib } : {}), name: 'Motor driver x4', category: 'actuators', accent: null, icon: { text: 'MD' }, ports: [], fields: [] });
  const rows = buildBOM({
    schema: 2, title: 'T', wires: [], zones: [], notes: [], journey: [],
    nodes: [
      node('c1', 'custom', 'Left', 'MD-4', { part: part('lp1') }),
      node('c2', 'custom', 'Right', 'MD-4', { part: part('lp1') }),
      node('c3', 'custom', 'Spare', 'MD-4', { part: part(null) }),
      node('m', 'mcu', 'Brain', 'STM32', {}),
    ],
  });
  const md = rows.filter((r) => r.part === 'Motor driver x4');
  assert.equal(md.length, 2, 'template copies group together; the one-off is its own row');
  assert.deepEqual(md.map((r) => r.qty).sort(), [1, 2]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/geometry.test.js tests/bom.test.js`
Expected: FAIL — custom sizes come back as the generic box (`{ w: 104, h: 74 }` for every case) and the BOM names the row "Custom box".

- [ ] **Step 3: Rewrite `src/rdk/profiles.js` top half**

Replace the first two functions (keep `displayPart` but change its `knownPorts` call):

```js
import { partOf } from '../custom.js';
import { RDK_PRODUCTS, profileFor } from './catalogue.js';
export { profileFor } from './catalogue.js';

// The part a node resolves to: its custom definition, or its catalogue part
// with the RDK profile's ports when a vendor preset names one.
export function nodePart(node) {
  const part = partOf(node);
  const profile = part.custom ? null : profileFor(node);
  return profile?.ports ? { ...part, ports: profile.ports } : part;
}

// Every port id a saved wire on this node may legitimately name: the part's
// own ports plus any port of an RDK product of the same kind (a preset switch
// keeps old endpoints as "unsupported" rather than dropping them).
export function knownPorts(node) {
  const part = partOf(node);
  const ports = new Map(part.ports.map((p) => [p.id, p]));
  if (!part.custom) {
    for (const product of RDK_PRODUCTS.filter((p) => p.kind === node.kind)) {
      for (const port of product.ports || []) if (!ports.has(port.id)) ports.set(port.id, port);
    }
  }
  return [...ports.values()];
}
```

In `displayPart`, change `for (const legacy of knownPorts(node.kind))` to `for (const legacy of knownPorts(node))`.

- [ ] **Step 4: Update `src/geometry.js`**

Change the import and the two functions:

```js
import { partOf } from './custom.js';
```

(replace `import { getPart } from './palette.js';`)

```js
export function nodeMeta(node) {
  const part = partOf(node);
  // Mono lines under the label: the part number (threats have none), then a
  // schema part's fields (severity has its own tag), or else the hardware
  // address and rail. A custom part shows all of them. At most three lines.
  const lines = [];
  if (!part.threat) lines.push(['sublabel', node.sublabel]);
  if (part.custom) {
    lines.push(['addr', node.addr], ['rail', node.rail]);
    for (const fd of part.fields || []) lines.push([`fields.${fd.id}`, node.fields?.[fd.id]]);
  } else if (part.fields) {
    for (const fd of part.fields) if (fd.id !== 'severity') lines.push([`fields.${fd.id}`, node.fields?.[fd.id]]);
  } else {
    lines.push(['addr', node.addr], ['rail', node.rail]);
  }
  return lines
    .map(([field, v]) => ({ field, text: String(v ?? '').trim() }))
    .filter((m) => m.text)
    .slice(0, 3);
}
```

Add two constants under `META_LINE_H`:

```js
// Custom cards grow so their port dots stay apart: 15px per port down the
// left or right edge, 22px along the top or bottom. Built-in cards never
// grow this way, so existing boards keep their geometry.
const PORT_GAP_Y = 15;
const PORT_GAP_X = 22;
```

And `nodeSize`:

```js
export function nodeSize(node) {
  const part = partOf(node);
  if (part.shape) return shapeSize(part.shape, String(node.label ?? ''));
  const meta = nodeMeta(node);
  const need = Math.max(
    NODE_W,
    String(node.label ?? '').length * 6.8 + 24,
    ...meta.map((m) => m.text.length * 5.9 + 26),
  );
  let w = Math.min(NODE_MAX_W, need);
  let h = NODE_H + meta.length * META_LINE_H;
  if (part.custom) {
    const on = (side) => part.ports.filter((p) => p.side === side).length;
    h = Math.max(h, PORT_GAP_Y * (Math.max(on('left'), on('right')) + 1));
    w = Math.max(w, Math.min(NODE_MAX_W, PORT_GAP_X * (Math.max(on('top'), on('bottom')) + 1)));
  }
  return { w, h };
}
```

- [ ] **Step 5: Update `src/ai/layout.js`, `src/bom.js`, `src/ui/props.js`**

`src/ai/layout.js`: replace `import { getPart, CATEGORIES } from '../palette.js';` with

```js
import { CATEGORIES } from '../palette.js';
import { partOf } from '../custom.js';
```

and `const category = (node) => getPart(node.kind).category;` with `const category = (node) => partOf(node).category;`.

`src/bom.js`: replace the import with `import { partOf } from './custom.js';` and the first lines of the loop with

```js
    const part = partOf(node);
    // Copies of one library template are one line; a one-off groups by name.
    const key = part.custom ? `custom:${part.lib || part.name}|${node.sublabel}` : `${node.kind}|${node.sublabel}`;
```

`src/ui/props.js`: add `import { partOf } from '../custom.js';`, change `nodeFields` to

```js
function nodeFields(item, doc) {
  const part = partOf(item);
  let html = propField('Label', `<input type="text" data-prop="label" value="${escAttr(item.label)}">`);
  if (!part.threat) html += partNumberField(item);
  if (part.custom) html += addrRailFields(item) + (part.fields ? schemaFields(part, item, doc) : '');
  else html += part.fields ? schemaFields(part, item, doc) : addrRailFields(item);
```

(the rest of the function is unchanged) and in `render()` change `panelHeader(getPart(item.kind).name, 'props')` to `panelHeader(partOf(item).name, 'props')`. Keep the `getPart` import only if something else in the file still uses it (nothing does after this; remove it from the import line, leaving `DISPOSITIONS`).

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS — 375 + 14 + 3 = 392 tests. `tests/examples.test.js` and `tests/rdk-*.test.js` still green (built-in sizes unchanged, RDK profile ports still applied).

- [ ] **Step 7: Commit**

```bash
git add src/rdk/profiles.js src/geometry.js src/ai/layout.js src/bom.js src/ui/props.js tests/geometry.test.js tests/bom.test.js
git commit -m "feat(custom): resolve nodes through partOf; custom cards grow with their ports"
```

---

### Task 4: Badge renders initials

**Files:**
- Modify: `src/render.js:121-135` (`badgeMarkup`)
- Test: `tests/render.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/render.test.js`:

```js
test('custom cards draw initials, a referenced icon, or a path in the badge, and their ports', () => {
  const custom = (id, icon, ports = []) => node(id, 'custom', 0, 0, {
    part: { name: 'Motor driver x4', category: 'actuators', accent: null, icon, ports, fields: [] },
  });
  const doc = {
    ...sampleDoc(),
    nodes: [
      custom('t', { text: 'MD' }, [{ id: 'p1', name: 'VCC', side: 'top', bus: 'power', required: true }]),
      custom('k', { kind: 'motor' }),
      custom('p', { path: 'M1 1h2v2H1z' }),
    ],
    wires: [],
  };
  const markup = diagramMarkup(doc, {});
  const t = nodeGroup(markup, 't');
  assert.match(t, /<text[^>]*font-size="13"[^>]*>MD<\/text>/, 'initials in the badge');
  // Everything before the ports group is the card, badge, label, and tags; none carries a path when initials draw.
  assert.ok(!/<path d="M/.test(t.split('class="ports"')[0]), 'no icon path when initials are used');
  assert.match(t, /data-port="p1"/, 'custom ports render');
  assert.match(t, /VCC · PWR/, 'port label names the port and its bus');
  assert.match(nodeGroup(markup, 'k'), new RegExp(`<path d="${PARTS.motor.icon.slice(0, 12)}`), 'a kind icon draws that part\'s path');
  assert.match(nodeGroup(markup, 'p'), /<path d="M1 1h2v2H1z"\/>/, 'a path icon draws as given');
  assert.match(nodeGroup(markup, 't'), new RegExp(`fill="${CATEGORY_COLORS.actuators}"`), 'accent is the category colour');
});
```

Add `CATEGORY_COLORS` to the palette import at the top of the test file: `import { PARTS, CATEGORY_COLORS } from '../src/palette.js';`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/render.test.js`
Expected: FAIL — no `<text ... >MD</text>` in the badge (the generic path draws instead).

- [ ] **Step 3: Add the initials branch to `badgeMarkup`**

```js
function badgeMarkup(W, color, part) {
  const c = esc(color);
  let s = `<rect x="${W / 2 - 19}" y="8" width="38" height="38" rx="11" fill="${c}" opacity="0.13"/>`;
  if (part.glyph) {
    s += `<g transform="translate(${W / 2 - 13.8} 13.2) scale(1.15)" fill="none" stroke="${c}" stroke-width="1.8"`
      + ` stroke-linecap="round" stroke-linejoin="round" color="${c}">${part.glyph}</g>`;
  } else if (part.text) {
    // A custom part with no icon: up to three letters, centred in the badge.
    s += `<text x="${W / 2}" y="31.8" text-anchor="middle" font-size="13" font-weight="700" fill="${c}"`
      + ` pointer-events="none">${esc(part.text)}</text>`;
  } else {
    s += `<g transform="translate(${W / 2 - 13.8} 13.2) scale(${ICON_SCALE})" fill="none" stroke="${c}"`
      + ` stroke-width="${(1.8 / ICON_SCALE).toFixed(3)}" stroke-linecap="round" stroke-linejoin="round"><path d="${esc(part.icon)}"/></g>`;
  }
  return s;
}
```

Note the `esc()` around `part.icon`: a custom path is user data. `PATH_RE` already keeps it to path characters; escaping is the second lock.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/render.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render.js tests/render.test.js
git commit -m "feat(custom): badge draws initials for icon-less custom parts"
```

---

### Task 5: File format — validate custom nodes, schema 2

**Files:**
- Modify: `src/state.js:19` (`SCHEMA_VERSION`)
- Modify: `src/serialize.js` (imports, `MIGRATIONS`, node loop, `resolvePort`)
- Modify: `src/examples.js`, `src/rdk/examples.js` (`schema: 1` → `schema: 2`)
- Modify: `tests/state.test.js:39-42`
- Test: `tests/serialize.test.js`

**Interfaces:**
- Consumes: `normalizePart`, `partOf` (Task 1); `knownPorts(node)` (Task 3).
- Produces: files with `schema: 2`; custom nodes carry a validated `part`; older files migrate with no change.

- [ ] **Step 1: Write the failing tests**

Append to `tests/serialize.test.js`:

```js
import { LIMITS } from '../src/custom.js';

const CUSTOM = {
  lib: 'lp1', name: 'Motor driver x4', category: 'actuators', accent: null, icon: { text: 'MD' },
  ports: [
    { id: 'p1', name: 'VCC', side: 'top', bus: 'power', required: true },
    { id: 'p2', name: 'CAN', side: 'left', bus: 'can', required: false },
  ],
  fields: [{ id: 'f1', label: 'Channels' }],
};

test('the app writes schema 2 and a schema 1 file upgrades with no change', () => {
  assert.equal(SCHEMA_VERSION, 2);
  const { doc, warnings } = deserialize('{"schema": 1, "title": "Old", "nodes": [{"id": "a", "kind": "mcu", "x": 0, "y": 0}]}');
  assert.deepEqual(warnings, []);
  assert.equal(doc.schema, 2);
  assert.equal(doc.nodes[0].kind, 'mcu');
  // What an older build sees: a schema 2 file left alone by migrateRaw.
  assert.deepEqual(migrateRaw({ schema: 2, title: 'New' }, {}, 1), { schema: 2, title: 'New' });
});

test('a custom node round-trips with its definition, fields, and wires', () => {
  const doc = {
    schema: 2, title: 'C', zones: [], notes: [], journey: [],
    nodes: [
      { id: 'c', kind: 'custom', x: 0, y: 0, label: 'MD', sublabel: 'MD-4', color: null, addr: '', rail: '12V', notes: '', status: null, flags: [], part: CUSTOM, fields: { f1: '4' } },
      { id: 'm', kind: 'mcu', x: 300, y: 0, label: 'MCU', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
    ],
    wires: [{ id: 'w', bus: 'can', from: { node: 'c', port: 'p2' }, to: { node: 'm', port: 'can' }, label: '', arrow: null, style: null, flow: null }],
  };
  const { doc: back, warnings } = deserialize(serialize(doc));
  assert.deepEqual(warnings, []);
  assert.deepEqual(back, doc);
});

test('a custom node with an unusable definition becomes a custom box and keeps its wires on the side ports', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    schema: 2,
    nodes: [
      { id: 'c', kind: 'custom', x: 0, y: 0, part: { name: '' } },
      { id: 'm', kind: 'mcu', x: 300, y: 0 },
    ],
    wires: [{ id: 'w', bus: 'can', from: { node: 'c', port: 'p2' }, to: { node: 'm', port: 'can' } }],
  }));
  assert.equal(doc.nodes[0].kind, 'generic');
  assert.equal('part' in doc.nodes[0], false);
  assert.equal(doc.wires.length, 1);
  assert.equal(doc.wires[0].from.port, 'right');
  assert.ok(warnings.some((w) => /had no usable definition/.test(w)), warnings.join('\n'));
});

test('a dropped custom port drops its wire; unknown field values drop; the definition is cleaned', () => {
  const { doc, warnings } = deserialize(JSON.stringify({
    schema: 2,
    nodes: [
      { id: 'c', kind: 'custom', x: 0, y: 0, part: { ...CUSTOM, ports: [...CUSTOM.ports, { name: 'X', side: 'nowhere', bus: 'i2c' }] }, fields: { f1: '4', zz: 'gone' } },
      { id: 'm', kind: 'mcu', x: 300, y: 0 },
    ],
    wires: [
      { id: 'w1', bus: 'can', from: { node: 'c', port: 'p2' }, to: { node: 'm', port: 'can' } },
      { id: 'w2', bus: 'i2c', from: { node: 'c', port: 'p3' }, to: { node: 'm', port: 'i2c' } },
    ],
  }));
  assert.deepEqual(doc.nodes[0].part.ports.map((p) => p.id), ['p1', 'p2']);
  assert.deepEqual(doc.nodes[0].fields, { f1: '4' });
  assert.deepEqual(doc.wires.map((w) => w.id), ['w1']);
  assert.ok(warnings.some((w) => /no name or side/.test(w)));
  assert.ok(warnings.some((w) => /unknown field "zz"/.test(w)));
  assert.ok(warnings.some((w) => /missing endpoint/.test(w)));
});

test('a custom node keeps its own label and gets the definition name when it has none', () => {
  const { doc } = deserialize(JSON.stringify({ schema: 2, nodes: [{ id: 'c', kind: 'custom', x: 0, y: 0, part: CUSTOM }] }));
  assert.equal(doc.nodes[0].label, 'Motor driver x4');
  assert.equal(doc.nodes[0].part.name.length <= LIMITS.name, true);
});
```

Change `tests/state.test.js` line 41 to use the exported version:

```js
  assert.deepEqual(doc, { schema: SCHEMA_VERSION, title: 'X', nodes: [], wires: [], zones: [], notes: [], journey: [] });
```

and add `SCHEMA_VERSION` to that file's import from `../src/state.js`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/serialize.test.js tests/state.test.js`
Expected: FAIL — `SCHEMA_VERSION` is 1; the custom node becomes a generic box with "Unknown part" warnings.

- [ ] **Step 3: Bump the schema and add the no-op step**

`src/state.js`: `export const SCHEMA_VERSION = 2;`

`src/serialize.js`: replace `export const MIGRATIONS = {};` with

```js
export const MIGRATIONS = {
  // 1 -> 2: custom parts. Nothing in an older file changes shape; the bump
  // exists so an older build warns that the file is newer before it turns
  // custom nodes into generic boxes.
  1: (raw) => raw,
};
```

Every example doc: run

```bash
sed -i '' 's/schema: 1,/schema: 2,/g' src/examples.js src/rdk/examples.js
grep -c "schema: 2" src/examples.js src/rdk/examples.js
```

(the counts must equal the number of example boards in each file; `grep -c "schema: 1"` on both must print 0).

- [ ] **Step 4: Validate custom nodes in `deserialize`**

Change the import lines at the top of `src/serialize.js`:

```js
import { knownPorts } from './rdk/profiles.js';
import { normalizePart, partOf } from './custom.js';
```

Replace the kind/part resolution inside the node loop (from `let kind = typeof n.kind === 'string' ? n.kind : 'generic';` through `const part = PARTS[kind];`) with:

```js
    let kind = typeof n.kind === 'string' ? n.kind : 'generic';
    let def = null; // a custom node's validated definition
    if (typeof n.kind !== 'string') {
      // A missing kind quietly becomes a custom box; its wires may remap too.
      coerced.add(n.id);
    } else if (kind === 'custom') {
      const res = normalizePart(n.part);
      for (const w of res.warnings) warnings.push(`Node "${n.id}": ${w}`);
      if (res.part) def = res.part;
      else {
        warnings.push(`Custom part "${n.id}" had no usable definition and became a custom box.`);
        kind = 'generic';
        coerced.add(n.id);
      }
    } else if (!PARTS[kind]) {
      warnings.push(`Unknown part "${kind}" became a custom box.`);
      kind = 'generic';
      coerced.add(n.id);
    }
    const part = def ? partOf({ kind: 'custom', part: def }) : PARTS[kind];
```

After the `node` object literal (the one ending with `flags,` and `};`), add:

```js
    if (def) node.part = def;
```

In `resolvePort`, change `if (knownPorts(node.kind).some((p) => p.id === port)) {` to `if (knownPorts(node).some((p) => p.id === port)) {`.

The fields block needs no change: `part.fields` is the custom part's field list (or undefined when it has none), so unknown ids drop with the existing warning.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — all previous tests plus 5 new. If `tests/examples.test.js` fails on `deepEqual(doc, ex.doc)`, an example still says `schema: 1`; re-run the `sed` from Step 3.

- [ ] **Step 6: Commit**

```bash
git add src/state.js src/serialize.js src/examples.js src/rdk/examples.js tests/serialize.test.js tests/state.test.js
git commit -m "feat(custom): schema 2 with custom node definitions in files"
```

---

### Task 6: `addNode` accepts a definition

**Files:**
- Modify: `src/state.js` (`addNode`)
- Test: `tests/state.test.js`

**Interfaces:**
- Produces: `addNode(store, kind, x, y, part = null)` — when `part` is given the node is `kind: "custom"` with a normalized copy of the definition and its name as the label. Plan 2's palette drop uses it.

- [ ] **Step 1: Write the failing test**

Append to `tests/state.test.js`:

```js
test('addNode with a definition makes a custom node labelled by its name', () => {
  const store = new Store();
  const def = { name: 'Motor driver x4', category: 'actuators', ports: [{ name: 'VCC', side: 'top', bus: 'power', required: true }] };
  const id = addNode(store, 'custom', 10, 20, def);
  const node = store.doc.nodes[0];
  assert.equal(node.id, id);
  assert.equal(node.kind, 'custom');
  assert.equal(node.label, 'Motor driver x4');
  assert.equal(node.part.ports[0].id, 'p1', 'the definition is normalized');
  assert.notEqual(node.part, def, 'a copy, not the caller\'s object');
  addNode(store, 'custom', 0, 0, { name: '' });
  assert.equal(store.doc.nodes[1].kind, 'generic', 'an unusable definition falls back to the custom box');
  assert.equal('part' in store.doc.nodes[1], false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/state.test.js`
Expected: FAIL — `node.kind` is `generic`.

- [ ] **Step 3: Update `addNode`**

In `src/state.js`, add `import { normalizePart, partOf } from './custom.js';` under the palette import, and replace `addNode`:

```js
export function addNode(store, kind, x, y, part = null) {
  const def = kind === 'custom' && part ? normalizePart(part).part : null;
  // getPart maps an unknown kind (including a bare 'custom') to the generic box.
  const spec = def ? partOf({ kind: 'custom', part: def }) : getPart(kind);
  const id = uid('n');
  store.apply((doc) => {
    const node = {
      id, kind: spec.kind, x, y,
      label: spec.defaultLabel || spec.name, sublabel: '', color: null,
      addr: '', rail: '', notes: '', status: null, flags: [],
    };
    if (def) node.part = def;
    doc.nodes.push(node);
  });
  return id;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state.js tests/state.test.js
git commit -m "feat(custom): addNode takes a part definition"
```

---

### Task 7: Checks — required ports

**Files:**
- Modify: `src/drc.js:67-80` (rule 2)
- Test: `tests/drc.test.js`

**Interfaces:**
- Produces: findings with rule `unconnected-power` (power/gnd) or `unconnected-port` (any other bus) for custom ports flagged `required` with no wire.

- [ ] **Step 1: Write the failing test**

Append to `tests/drc.test.js`:

```js
test('custom parts report unwired required ports by bus; optional ports and built-in heuristics are unchanged', () => {
  const part = {
    name: 'Driver', category: 'actuators', accent: null, icon: { text: 'D' }, fields: [],
    ports: [
      { id: 'p1', name: 'VIN', side: 'top', bus: 'power', required: true },
      { id: 'p2', name: 'GND', side: 'top', bus: 'gnd', required: true },
      { id: 'p3', name: 'EN', side: 'left', bus: 'gpio', required: true },
      { id: 'p4', name: 'OUT', side: 'right', bus: 'power', required: false },
      { id: 'p5', name: 'CAN', side: 'left', bus: 'can', required: false },
    ],
  };
  const d = doc(
    [node('c', 'custom', { part }), node('m', 'mcu')],
    [wire('w1', 'gnd', 'c', 'p2', 'm', 'gnd'), wire('w2', 'can', 'c', 'p5', 'm', 'can')],
  );
  const findings = checkDoc(d).filter((f) => f.ids.includes('c'));
  const power = findings.filter((f) => f.rule === 'unconnected-power');
  const port = findings.filter((f) => f.rule === 'unconnected-port');
  assert.deepEqual(power.map((f) => f.message), ["c's VIN pin is unconnected."]);
  assert.deepEqual(port.map((f) => f.message), ["c's EN pin is unconnected."]);
  assert.equal(port[0].level, 'warning');
  assert.ok(!findings.some((f) => /OUT|CAN|GND/.test(f.message)), 'optional and wired ports are silent');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/drc.test.js`
Expected: FAIL — no findings for `VIN` or `EN`.

- [ ] **Step 3: Replace rule 2 in `src/drc.js`**

```js
  // 2. Unconnected supply pins. Built-in parts: VCC/GND/VIN* consumption pins
  //    by name. Custom parts: every port the definition marks required, on any
  //    bus; power and ground report under the same rule as built-ins.
  for (const n of doc.nodes) {
    const part = nodePart(n);
    for (const port of part.ports) {
      const supply = port.bus === 'power' || port.bus === 'gnd';
      const must = part.custom
        ? port.required === true
        : supply && (port.id === 'vcc' || port.id === 'gnd' || port.id.startsWith('vin'));
      if (must && !wiredPorts.has(`${n.id}|${port.id}`)) {
        findings.push({
          level: 'warning',
          rule: supply ? 'unconnected-power' : 'unconnected-port',
          message: `${n.label}'s ${port.name} pin is unconnected.`,
          ids: [n.id],
        });
      }
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/drc.test.js tests/examples.test.js`
Expected: PASS (the clean example still yields no findings).

- [ ] **Step 5: Commit**

```bash
git add src/drc.js tests/drc.test.js
git commit -m "feat(custom): checks report unwired required ports"
```

---

### Task 8: Search covers library templates

**Files:**
- Modify: `src/search.js`
- Test: `tests/search.test.js`

**Interfaces:**
- Produces: `templateHaystack(template): string` and `filterTemplates(query, templates): template[]` (pure; the caller passes the list). A template is a definition plus `id`.

- [ ] **Step 1: Write the failing test**

Append to `tests/search.test.js`:

```js
import { filterTemplates, templateHaystack } from '../src/search.js';

test('library templates match by name, category, port names, buses, and the words custom and library', () => {
  const templates = [
    { id: 'lp1', name: 'Motor driver x4', category: 'actuators', accent: null, icon: { text: 'MD' }, ports: [{ id: 'p1', name: 'CAN', side: 'left', bus: 'can', required: false }], fields: [] },
    { id: 'lp2', name: 'Fan', category: 'misc', accent: null, icon: { text: 'F' }, ports: [], fields: [] },
  ];
  assert.deepEqual(filterTemplates('motor', templates).map((t) => t.id), ['lp1']);
  assert.deepEqual(filterTemplates('can', templates).map((t) => t.id), ['lp1'], 'a bus name');
  assert.deepEqual(filterTemplates('actuators', templates).map((t) => t.id), ['lp1'], 'a category name');
  assert.deepEqual(filterTemplates('custom', templates).map((t) => t.id), ['lp1', 'lp2']);
  assert.deepEqual(filterTemplates('', templates).length, 2);
  assert.deepEqual(filterTemplates('zzz', templates), []);
  assert.match(templateHaystack(templates[0]), /motor driver x4 actuators can/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/search.test.js`
Expected: FAIL — `filterTemplates` is not exported.

- [ ] **Step 3: Append to `src/search.js`**

```js
const words = (query) => String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);

// Library templates (custom part definitions with an id) search the same way.
// The list is passed in so this module stays free of storage.
export function templateHaystack(t) {
  const bits = [
    t.name, CATEGORY_NAME[t.category] || t.category,
    ...(t.ports || []).flatMap((p) => [p.name, BUSES[p.bus]?.name, BUSES[p.bus]?.short]),
    'custom', 'library',
  ];
  return bits.filter(Boolean).join(' ').toLowerCase();
}

export function filterTemplates(query, templates) {
  const ws = words(query);
  return templates.filter((t) => {
    const hay = templateHaystack(t);
    return ws.every((w) => hay.includes(w));
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/search.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/search.js tests/search.test.js
git commit -m "feat(custom): search library templates"
```

---

### Task 9: Board text lists custom ports; template lines

**Files:**
- Modify: `src/ai/context.js` (`nodeLine`, new `templateLine`)
- Test: `tests/ai-context.test.js`

**Interfaces:**
- Consumes: `partOf` (Task 1).
- Produces: `nodeLine` appends ` custom-ports=<id>:<name>(<bus>),…` and ` template=<lib>` for custom nodes; `templateLine(template): string` → `template <id>  <name>  ports: <id>:<name>(<bus>), …  [library]`.

- [ ] **Step 1: Write the failing test**

Append to `tests/ai-context.test.js`:

```js
import { nodeLine, templateLine } from '../src/ai/context.js';

test('custom nodes list their ports and template so the model can connect by bus', () => {
  const part = {
    lib: 'lp1', name: 'Motor driver x4', category: 'actuators', accent: null, icon: { text: 'MD' },
    ports: [{ id: 'p1', name: 'VCC', side: 'top', bus: 'power', required: true }, { id: 'p2', name: 'CAN', side: 'left', bus: 'can', required: false }],
    fields: [{ id: 'f1', label: 'Channels' }],
  };
  const node = { id: 'c1', kind: 'custom', x: 0, y: 0, label: 'Left driver', sublabel: 'MD-4', color: null, addr: '', rail: '12V', notes: '', status: null, flags: [], part, fields: { f1: '4' } };
  assert.equal(
    nodeLine({ nodes: [node], wires: [], zones: [], notes: [] }, node),
    'node c1 custom "Left driver" custom-ports=p1:VCC(power),p2:CAN(can) template=lp1 pn=MD-4 rail=12V f1=4',
  );
  const bare = { ...node, part: { ...part, lib: undefined, ports: [] } };
  assert.match(nodeLine({ nodes: [bare], wires: [], zones: [], notes: [] }, bare), /custom-ports=- pn=/);
  assert.equal(templateLine({ id: 'lp1', ...part }), 'template lp1  Motor driver x4  ports: p1:VCC(power), p2:CAN(can)  [library]');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/ai-context.test.js`
Expected: FAIL — no `custom-ports=` in the line; `templateLine` is not exported.

- [ ] **Step 3: Update `src/ai/context.js`**

Change the palette import to `import { PARTS, CATEGORIES } from '../palette.js';` and add `import { partOf } from '../custom.js';`.

In `nodeLine`, replace `const part = getPart(node.kind);` with `const part = partOf(node);` and insert after the `rdk-profile` line (before `if (node.sublabel)`):

```js
  if (part.custom) {
    s += ` custom-ports=${part.ports.map((p) => `${p.id}:${p.name}(${p.bus})`).join(',') || '-'}`;
    if (node.part?.lib) s += ` template=${node.part.lib}`;
  }
```

Add after `partLine`:

```js
// A library template in search results, marked so the model knows to use
// add_part with kind custom and template.
export function templateLine(t) {
  const ports = (t.ports || []).map((p) => `${p.id}:${p.name}(${p.bus})`).join(', ');
  return `template ${t.id}  ${t.name}  ports: ${ports || '-'}  [library]`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/ai-context.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/context.js tests/ai-context.test.js
git commit -m "feat(custom): board text lists custom ports and templates"
```

---

### Task 10: Edit operations — `add_part` custom/template, `update_part` custom, `replace_part` from custom

**Files:**
- Modify: `src/ai/ops.js` (imports, `EDIT_SCHEMA`, `makeCtx`, `HANDLERS.add_part`, `HANDLERS.update_part`, `HANDLERS.replace_part`, `applyEdits`)
- Test: `tests/ai-ops.test.js`

**Interfaces:**
- Consumes: `normalizePart`, `partOf`, `mergePortIds`, `mergeFieldIds` (Tasks 1–2).
- Produces: `applyEdits(doc, ops, { library = null } = {})`; ops `add_part { kind: 'custom', custom | template }`, `update_part { custom }`; a private `rewireNode(ctx, node, oldPart, newPart)` shared by `replace_part` and `update_part`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ai-ops.test.js`:

```js
const DEF = {
  name: 'Motor driver x4', category: 'actuators',
  ports: [
    { name: 'VCC', side: 'top', bus: 'power', required: true },
    { name: 'GND', side: 'top', bus: 'gnd', required: true },
    { name: 'CAN', side: 'left', bus: 'can' },
    { name: 'M1', side: 'right', bus: 'pwm' },
  ],
  fields: [{ label: 'Channels' }],
};

test('add_part with kind custom takes an inline definition and wires by bus', () => {
  const doc = newDoc('T');
  const res = applyEdits(doc, [
    { op: 'add_part', ref: 'md', kind: 'custom', custom: DEF, sublabel: 'MD-4', fields: { f1: '4' } },
    { op: 'add_part', ref: 'mcu', kind: 'mcu' },
    { op: 'connect', from: { node: 'md' }, to: { node: 'mcu' }, bus: 'can' },
  ]);
  assert.equal(res.ok, true, JSON.stringify(res));
  const n = doc.nodes[0];
  assert.equal(n.kind, 'custom');
  assert.equal(n.label, 'Motor driver x4');
  assert.equal(n.sublabel, 'MD-4');
  assert.deepEqual(n.part.ports.map((p) => p.id), ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(n.fields, { f1: '4' });
  assert.equal(doc.wires[0].from.port, 'p3');
  assert.equal(doc.wires[0].bus, 'can');
  assert.match(res.changes[0], /^added node n\w+ custom "Motor driver x4" \(ref md\)$/);
});

test('add_part with kind custom rejects bad or missing definitions and needs exactly one source', () => {
  const doc = newDoc('T');
  const bad = [
    [{ op: 'add_part', ref: 'a', kind: 'custom' }, /exactly one of custom/],
    [{ op: 'add_part', ref: 'a', kind: 'custom', custom: DEF, template: 'lp1' }, /exactly one of custom/],
    [{ op: 'add_part', ref: 'a', kind: 'custom', custom: { name: '' } }, /no name/],
    [{ op: 'add_part', ref: 'a', kind: 'custom', template: 'lp1' }, /no library/],
    [{ op: 'add_part', ref: 'a', kind: 'custom', custom: DEF, fields: { zz: '1' } }, /unknown field "zz"/],
  ];
  for (const [op, re] of bad) {
    const res = applyEdits(doc, [op]);
    assert.equal(res.ok, false, JSON.stringify(op));
    assert.match(res.errors[0].message, re);
  }
  assert.equal(doc.nodes.length, 0);
  const warned = applyEdits(doc, [{ op: 'add_part', ref: 'a', kind: 'custom', custom: { ...DEF, ports: [{ name: 'X', side: 'left', bus: 'warp' }] } }]);
  assert.equal(warned.ok, true, JSON.stringify(warned));
  assert.ok(warned.warnings.some((w) => /unknown bus "warp"/.test(w)), 'normalizer warnings reach the tool result');
});

test('add_part from a library template stamps the template id and drops the template bookkeeping', () => {
  const doc = newDoc('T');
  const library = { get: (id) => (id === 'lp1' ? { id: 'lp1', updated: '2026-09-07', ...DEF } : null), list: () => [] };
  const res = applyEdits(doc, [{ op: 'add_part', ref: 'a', kind: 'custom', template: 'lp1' }], { library });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(doc.nodes[0].part.lib, 'lp1');
  assert.equal(doc.nodes[0].part.name, 'Motor driver x4');
  assert.equal('updated' in doc.nodes[0].part, false);
  assert.equal('id' in doc.nodes[0].part, false);
  const miss = applyEdits(doc, [{ op: 'add_part', ref: 'b', kind: 'custom', template: 'nope' }], { library });
  assert.match(miss.errors[0].message, /no library template "nope"/);
});

test('update_part with custom replaces the definition, matches ports by name, and rewires or drops the rest', () => {
  const doc = newDoc('T');
  const setup = applyEdits(doc, [
    { op: 'add_part', ref: 'md', kind: 'custom', custom: DEF, fields: { f1: '4' } },
    { op: 'add_part', ref: 'mcu', kind: 'mcu' },
    { op: 'add_part', ref: 'bat', kind: 'battery' },
    { op: 'connect', from: { node: 'md' }, to: { node: 'mcu' }, bus: 'can' },
    { op: 'connect', from: { node: 'bat' }, to: { node: 'md' }, bus: 'power' },
    { op: 'connect', from: { node: 'md', port: 'p4' }, to: { node: 'mcu', port: 'pwm' }, bus: 'pwm' },
  ]);
  assert.equal(setup.ok, true, JSON.stringify(setup));
  const md = doc.nodes[0];
  const res = applyEdits(doc, [{
    op: 'update_part', id: md.id,
    custom: { ...DEF, ports: [
      { name: 'can', side: 'bottom', bus: 'can' },
      { name: 'VIN', side: 'top', bus: 'power', required: true },
      { name: 'EN', side: 'left', bus: 'gpio' },
    ], fields: [{ label: 'channels' }, { label: 'Drive', options: ['a', 'b'] }] },
  }]);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual(md.part.ports.map((p) => [p.id, p.name]), [['p3', 'can'], ['p5', 'VIN'], ['p6', 'EN']], 'CAN keeps p3 by name; the rest get ids no old port had');
  assert.deepEqual(md.part.fields.map((f) => f.id), ['f1', 'f2'], 'Channels keeps f1 by label');
  assert.deepEqual(md.fields, { f1: '4' });
  const can = doc.wires.find((w) => w.bus === 'can');
  const pwr = doc.wires.find((w) => w.bus === 'power');
  assert.equal(can.from.port, 'p3', 'kept');
  assert.equal(pwr.to.port, 'p5', 'rewired to the new power port');
  assert.equal(doc.wires.some((w) => w.bus === 'pwm'), false, 'the PWM wire had no port to go to');
  assert.match(res.changes[0], /custom \(kept 1, rewired 1, dropped 1\)/);
  assert.ok(res.warnings.some((w) => /removed wires/.test(w)));
  assert.match(applyEdits(doc, [{ op: 'update_part', id: md.id, custom: { name: '' } }]).errors[0].message, /no name/);
});

test('update_part with custom on a built-in part fails; replace_part to custom fails; replace_part from custom works', () => {
  const doc = newDoc('T');
  const setup = applyEdits(doc, [
    { op: 'add_part', ref: 'mcu', kind: 'mcu' },
    { op: 'add_part', ref: 'md', kind: 'custom', custom: DEF },
    { op: 'connect', from: { node: 'md' }, to: { node: 'mcu' }, bus: 'can' },
  ]);
  assert.equal(setup.ok, true, JSON.stringify(setup));
  const [mcu, md] = doc.nodes;
  assert.match(applyEdits(doc, [{ op: 'update_part', id: mcu.id, custom: DEF }]).errors[0].message, /not a custom part/);
  assert.match(applyEdits(doc, [{ op: 'replace_part', id: mcu.id, kind: 'custom', custom: DEF }]).errors[0].message, /use add_part/);
  const res = applyEdits(doc, [{ op: 'replace_part', id: md.id, kind: 'cantrx' }]);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(md.kind, 'cantrx');
  assert.equal('part' in md, false);
  assert.equal(doc.wires.length, 1, 'the CAN wire found a CAN port on the transceiver');
});

test('the schema documents custom and template', () => {
  const props = EDIT_SCHEMA.properties.ops.items.properties;
  assert.equal(props.custom.type, 'object');
  assert.equal(props.template.type, 'string');
  assert.match(props.kind.description, /custom/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/ai-ops.test.js`
Expected: FAIL — `unknown kind "custom"`.

- [ ] **Step 3: Update `src/ai/ops.js`**

Imports: add `import { normalizePart, partOf, mergePortIds, mergeFieldIds } from '../custom.js';` after the palette import.

`EDIT_SCHEMA`: change the `kind` property and add two properties after `fields`:

```js
          kind: { type: 'string', description: 'A palette kind from the catalogue, or custom with a custom definition or template (add_part); a catalogue kind (replace_part)' },
```

```js
          custom: {
            type: 'object',
            description: 'A custom part definition (add_part with kind custom; update_part on a custom node replaces its definition, ports matched by name): { name, category, accent?, icon?: { text } | { kind }, ports: [{ name, side: left|right|top|bottom, bus, required? }], fields?: [{ label, options? }] }. Use only when no catalogue kind fits.',
          },
          template: { type: 'string', description: 'add_part with kind custom: a library template id from search_parts, instead of custom' },
```

`makeCtx`:

```js
function makeCtx(doc, library) {
  return {
    work: structuredClone(doc),
    library: library || null,
    refs: new Map(),
    ...
```

(keep the other fields exactly as they are.)

Add the rewire helper above `HANDLERS.replace_part`:

```js
// Move the wires on `node` from `oldPart`'s ports onto `newPart`'s: a wire
// whose port id survives with the same bus stays, otherwise it goes to
// another port of its bus, or is dropped with a warning. The node must
// already resolve to `newPart`. Returns the counts for the change line.
function rewireNode(ctx, node, oldPart, newPart) {
  let kept = 0;
  let rewired = 0;
  const dropped = [];
  for (const w of ctx.work.wires) {
    for (const end of ['from', 'to']) {
      if (w[end].node !== node.id) continue;
      const oldPort = oldPart.ports.find((p) => p.id === w[end].port);
      const wantBus = oldPort ? oldPort.bus : w.bus;
      if (newPart.ports.some((p) => p.id === w[end].port && p.bus === wantBus)) { kept += 1; continue; }
      let pid = null;
      try { pid = pickPort(ctx.work, node, wantBus); } catch (err) { if (!(err instanceof OpError)) throw err; }
      if (pid) { w[end].port = pid; rewired += 1; } else dropped.push(w.id);
    }
  }
  if (dropped.length) {
    ctx.work.wires = ctx.work.wires.filter((w) => !dropped.includes(w.id));
    ctx.warnings.push(`removed wires ${dropped.join(', ')}: ${newPart.name} has no port for their bus`);
    for (const id of dropped) ctx.touched.add(id);
  }
  return { kept, rewired, dropped: dropped.length };
}

// A definition from the model or a library template, validated; warnings
// go to the result, an unusable definition fails the op.
function customDefinition(ctx, raw, what) {
  const { part, warnings } = normalizePart(raw);
  if (!part) fail(`${what}: ${warnings.join(' ')}`);
  ctx.warnings.push(...warnings);
  return part;
}
```

Replace `HANDLERS.add_part`:

```js
HANDLERS.add_part = (ctx, op) => {
  claimRef(ctx, op.ref, 'add_part');
  let part;
  let def = null;
  if (op.kind === 'custom') {
    if ((op.custom === undefined) === (op.template === undefined)) {
      fail('a custom part needs exactly one of custom (an inline definition) or template (a library id from search_parts)');
    }
    if (op.template !== undefined) {
      if (!ctx.library) fail('no library is available here; give an inline custom definition');
      const t = ctx.library.get(String(op.template));
      if (!t) fail(`no library template "${op.template}"; search_parts lists templates`);
      def = customDefinition(ctx, { ...t, lib: t.id }, 'template');
    } else {
      def = customDefinition(ctx, op.custom, 'custom');
    }
    part = partOf({ kind: 'custom', part: def });
  } else {
    part = Object.hasOwn(PARTS, op.kind) ? PARTS[op.kind] : null;
    if (!part) fail(`unknown kind "${op.kind}"; use search_parts to find kinds, or kind custom with a definition`);
  }
  const near = op.near !== undefined ? findNode(ctx, op.near).id : null;
  const zone = op.in !== undefined ? plainZone(ctx, op.in).id : null;
  const node = {
    id: uid('n'), kind: part.kind, x: 0, y: 0,
    label: part.defaultLabel || part.name, sublabel: '', color: null,
    addr: '', rail: '', notes: '', status: null, flags: [],
  };
  if (def) node.part = def;
  assignPatch(node, nodePatch(ctx, part, op, node));
  ctx.work.nodes.push(node);
  ctx.refs.set(op.ref, node.id);
  ctx.touched.add(node.id);
  ctx.layout.nodes.push(node.id);
  ctx.layout.hints.set(node.id, { near, zone });
  ctx.changes.push(`added node ${node.id} ${node.kind} "${node.label}" (ref ${op.ref})`);
};
```

Replace `HANDLERS.update_part`:

```js
HANDLERS.update_part = (ctx, op) => {
  const node = findNode(ctx, op.id);
  if (op.kind !== undefined) fail('use replace_part to change the kind');
  const changed = [];
  if (op.custom !== undefined) {
    if (node.kind !== 'custom' || !node.part) {
      fail(`${node.id} is a ${node.kind}, not a custom part; add a custom part with add_part, or use the editor's Customize`);
    }
    const fresh = customDefinition(ctx, { ...op.custom, lib: node.part.lib }, 'custom');
    const oldPart = partOf(node);
    node.part = {
      ...fresh,
      ports: mergePortIds(node.part.ports, fresh.ports).ports,
      fields: mergeFieldIds(node.part.fields, fresh.fields),
    };
    const counts = rewireNode(ctx, node, oldPart, partOf(node));
    if (node.fields) {
      const known = new Set(node.part.fields.map((f) => f.id));
      for (const k of Object.keys(node.fields)) if (!known.has(k)) delete node.fields[k];
      if (!Object.keys(node.fields).length) delete node.fields;
    }
    changed.push(`custom (kept ${counts.kept}, rewired ${counts.rewired}, dropped ${counts.dropped})`);
  }
  const patch = nodePatch(ctx, partOf(node), op, node);
  const keys = Object.keys(patch);
  if (!keys.length && !changed.length) fail('update_part changes nothing');
  assignPatch(node, patch);
  ctx.touched.add(node.id);
  ctx.changes.push(`updated node ${node.id} (${[...changed, ...keys].join(', ')})`);
};
```

Replace `HANDLERS.replace_part` up to and including the old wire loop with:

```js
HANDLERS.replace_part = (ctx, op) => {
  const node = findNode(ctx, op.id);
  if (op.kind === 'custom') fail('replace_part cannot make a custom part; use add_part with kind custom, or the editor\'s Customize');
  const part = Object.hasOwn(PARTS, op.kind) ? PARTS[op.kind] : null;
  if (!part) fail(`unknown kind "${op.kind}"; use search_parts to find kinds`);
  if (part.kind === node.kind) fail(`${node.id} is already a ${part.kind}`);
  const oldPart = partOf(node);
  if (node.fields) {
    const schema = new Map((part.fields || []).map((f) => [f.id, f]));
    const kept = {};
    const dropped = [];
    for (const [k, v] of Object.entries(node.fields)) {
      const fd = schema.get(k);
      if (fd && (!fd.options || fd.options.includes(v))) kept[k] = v;
      else dropped.push(k);
    }
    if (dropped.length) ctx.warnings.push(`dropped fields ${dropped.join(', ')} from ${node.id}: ${part.name} has no such fields`);
    if (Object.keys(kept).length) node.fields = kept;
    else delete node.fields;
  }
  node.kind = part.kind;
  delete node.part;
  const counts = rewireNode(ctx, node, oldPart, part);
  ctx.touched.add(node.id);
  ctx.changes.push(`replaced ${node.id} with ${part.kind} (kept ${counts.kept}, rewired ${counts.rewired}, dropped ${counts.dropped})`);
};
```

(The old body's `let kept = 0; … ctx.changes.push(...)` block is what `rewireNode` now does; delete it.)

`applyEdits`: change the signature and the `makeCtx` call:

```js
export function applyEdits(doc, ops, { library = null } = {}) {
  ...
  const ctx = makeCtx(doc, library);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/ai-ops.test.js tests/ai-agent.test.js tests/ai-layout.test.js`
Expected: PASS. The existing `replace_part` test that checks `(kept N, rewired N, dropped N)` must still pass unchanged; the counts line is byte-identical.

- [ ] **Step 5: Commit**

```bash
git add src/ai/ops.js tests/ai-ops.test.js
git commit -m "feat(custom): assistant defines and edits custom parts"
```

---

### Task 11: Executor — library accessor, template search, tool descriptions

**Files:**
- Modify: `src/ai/tools.js` (imports, `TOOLS[search_parts]`, `TOOLS[run_checks]`, `TOOLS[apply_edits]` descriptions, `createExecutor`)
- Test: `tests/ai-tools.test.js`

**Interfaces:**
- Consumes: `filterTemplates` (Task 8), `templateLine` (Task 9), `applyEdits(doc, ops, { library })` (Task 10).
- Produces: `createExecutor({ getDoc, commit, selection, library = null })`. Plan 2 passes the real library from the assistant panel.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ai-tools.test.js`:

```js
const TEMPLATE = {
  id: 'lp1', updated: '2026-09-07', name: 'Motor driver x4', category: 'actuators', accent: null, icon: { text: 'MD' },
  ports: [{ id: 'p1', name: 'CAN', side: 'left', bus: 'can', required: false }], fields: [],
};
const library = { list: () => [TEMPLATE], get: (id) => (id === 'lp1' ? TEMPLATE : null) };

test('search_parts lists library templates after catalogue kinds when a library is present', () => {
  const doc = newDoc('T');
  const ex = createExecutor({ getDoc: () => doc, commit: (fn) => fn(doc), library });
  const hit = ex.run('search_parts', { query: 'motor driver' });
  assert.match(hit.text, /^motor  Motor \+ driver/m, 'catalogue kinds still listed');
  assert.match(hit.text, /^template lp1  Motor driver x4  ports: p1:CAN\(can\)  \[library\]$/m);
  assert.match(ex.run('search_parts', { query: 'zzzz' }).text, /No kinds match/);
  const bare = plain(newDoc('T')).run('search_parts', { query: 'motor driver' });
  assert.ok(!/template lp1/.test(bare.text), 'no library, no templates');
});

test('apply_edits passes the library through so template adds work', () => {
  const doc = newDoc('T');
  const ex = createExecutor({ getDoc: () => doc, commit: (fn) => fn(doc), library });
  const res = ex.run('apply_edits', { ops: [{ op: 'add_part', ref: 'f', kind: 'custom', template: 'lp1' }] });
  assert.equal(res.isError, false, res.text);
  assert.equal(doc.nodes[0].part.lib, 'lp1');
  assert.ok(ex.touched.has(doc.nodes[0].id));
});

test('tool descriptions mention custom parts where the model needs to know', () => {
  const by = Object.fromEntries(TOOLS.map((t) => [t.name, t.description]));
  assert.match(by.search_parts, /library templates/);
  assert.match(by.apply_edits, /kind custom/);
  assert.match(by.run_checks, /required ports/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/ai-tools.test.js`
Expected: FAIL — no `template lp1` line; `part.lib` undefined.

- [ ] **Step 3: Update `src/ai/tools.js`**

Imports: change `import { filterParts } from '../search.js';` to `import { filterParts, filterTemplates } from '../search.js';` and `import { boardText, partLine } from './context.js';` to `import { boardText, partLine, templateLine } from './context.js';`.

Descriptions:

```js
  {
    name: 'search_parts',
    description: 'Find palette kinds by words in their name, category, port names, buses, or vendor presets, plus any library templates (custom parts the user saved). Returns up to 20 kinds and up to 20 templates with their ports.',
    ...
  },
  ...
  {
    name: 'run_checks',
    description: 'Run the design-rule checks on the current board: I2C address conflicts, unconnected power pins and required ports, floating parts, bus mismatches, lifecycle risks. Returns findings with the ids involved.',
    ...
  },
  ...
  {
    name: 'apply_edits',
    description: `Apply up to ${MAX_OPS} edit operations as one atomic batch: add_part, update_part, replace_part, remove, connect, update_wire, add_zone, update_zone, add_note, update_note, set_title. New items carry a ref you choose that later ops may use as an id. Connect by bus; ports are picked for you. add_part with kind custom defines a new part from an inline custom definition or a library template; update_part with custom replaces a custom part's definition. Nothing is applied if any operation fails; the errors say which and why.`,
    input_schema: EDIT_SCHEMA,
  },
```

`createExecutor`:

```js
export function createExecutor({ getDoc, commit, selection = () => [], library = null }) {
```

`search_parts` handler:

```js
    search_parts(input) {
      const query = String(input.query ?? '');
      const kinds = [...filterParts(query)].slice(0, 20);
      const templates = library ? filterTemplates(query, library.list()).slice(0, 20) : [];
      if (!kinds.length && !templates.length) return ok(`No kinds match "${query}". Try broader words, a bus name, or a category.`);
      return ok([...kinds.map((k) => partLine(PARTS[k])), ...templates.map(templateLine)].join('\n'));
    },
```

`apply_edits` handler: change `res = applyEdits(doc, input.ops);` to `res = applyEdits(doc, input.ops, { library });`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/ai-tools.test.js tests/ai-agent.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/tools.js tests/ai-tools.test.js
git commit -m "feat(custom): executor searches templates and passes the library"
```

---

### Task 12: Prompt rules

**Files:**
- Modify: `src/ai/prompt.js` (`ROLE_RULES`, `SINGLE_SHOT_RULES`)
- Test: `tests/ai-context.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/ai-context.test.js`:

```js
test('the rules cover custom parts and the single-shot schema names them', () => {
  assert.match(ROLE_RULES, /kind custom/);
  assert.match(ROLE_RULES, /only when no kind fits/);
  assert.match(ROLE_RULES, /say in your reply that you made a custom part/);
  assert.match(ROLE_RULES, /custom-ports/);
  assert.match(SINGLE_SHOT_RULES, /kind custom/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/ai-context.test.js`
Expected: FAIL on the first `match`.

- [ ] **Step 3: Add the rule**

In `ROLE_RULES`, insert after the line beginning `- Use only kinds from the catalogue.`:

```
- Use a catalogue kind when one fits. Define a custom part (add_part with kind custom and a custom definition: name, category, ports with name, side, and bus, required on supply pins) only when no kind fits or the user asks; take port names and buses from the attached document when there is one; say in your reply that you made a custom part. Custom parts on the board list their ports as custom-ports; connect to them by bus like any other part. update_part with custom replaces a custom part's ports, matched by name, so name the ports you keep exactly as they are.
```

In `SINGLE_SHOT_RULES`, change `Use only catalogue kinds and buses.` to `Use only catalogue kinds and buses, or kind custom with a custom definition when no kind fits.`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/ai-context.test.js tests/ai-agent.test.js`
Expected: PASS (the stable-system test compares the rules against themselves, so the new line is fine).

- [ ] **Step 5: Commit**

```bash
git add src/ai/prompt.js tests/ai-context.test.js
git commit -m "feat(custom): prompt rule for custom parts"
```

---

### Task 13: Browser check through the fake assistant, full suite

**Files:**
- Modify: `tests/e2e/smoke.mjs` (`fakeAnthropic` branch; one scenario after the Fix scenario)

- [ ] **Step 1: Teach the fake provider one more request**

In `fakeAnthropic`, the `ops` selection reads:

```js
    let ops;
    if (/^Fix this finding/i.test(lastText)) {
      ops = [{ op: 'add_note', ref: 'fx', text: 'Fix acknowledged by the fake assistant' }];
    } else {
```

Insert a branch between them:

```js
    } else if (/^Add a custom part/i.test(lastText)) {
      ops = [
        { op: 'add_part', ref: 'md', kind: 'custom', custom: { name: 'Motor driver', category: 'actuators', ports: [
          { name: 'VCC', side: 'top', bus: 'power', required: true },
          { name: 'GND', side: 'top', bus: 'gnd', required: true },
          { name: 'CAN', side: 'left', bus: 'can' },
        ] } },
        { op: 'add_part', ref: 'mcu', kind: 'mcu' },
        { op: 'connect', from: { node: 'md' }, to: { node: 'mcu' }, bus: 'can' },
      ];
    } else {
```

- [ ] **Step 2: Add the scenario**

Directly after the line `check('Fix closes the dialog, opens the panel, sends the finding, and the reply applies', …);` add:

```js
  // A custom part defined by the assistant lands with its ports, its
  // initials in the badge, and a wire picked by bus.
  await loadBoard(EMPTY);
  await seedFake();
  if (await js(`document.getElementById('assistant').hidden`)) { await key('a', 'KeyA', 65); await sleep(100); }
  await js(`(() => { const i = document.getElementById('ai-input'); i.value = 'Add a custom part called Motor driver'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
  let customBuilt = null;
  for (let i = 0; i < 40; i++) {
    customBuilt = await js(`(() => ({
      nodes: document.querySelectorAll('#canvas g.node').length,
      wires: document.querySelectorAll('#canvas g.wire').length,
      ports: [...document.querySelectorAll('#canvas g.node .portg')].map((p) => p.dataset.port),
      initials: [...document.querySelectorAll('#canvas g.node text')].some((t) => t.textContent === 'MD'),
      sending: !document.getElementById('ai-stop').hidden,
    }))()`);
    if (customBuilt.nodes === 2 && !customBuilt.sending) break;
    await sleep(150);
  }
  check('the assistant defines a custom part with ports, draws its initials, and wires it by bus',
    customBuilt.nodes === 2 && customBuilt.wires === 1 && customBuilt.ports.includes('p1') && customBuilt.ports.includes('p3') && customBuilt.initials,
    JSON.stringify(customBuilt));
```

- [ ] **Step 3: Run everything**

Run: `npm test && npm run e2e`
Expected: unit tests all pass (baseline 375 plus this plan's additions); the smoke test prints `95/95 checks passed` and `no console errors or exceptions`. If Chrome is missing, set `CHROME_PATH`.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/smoke.mjs
git commit -m "test(custom): fake assistant adds a custom part"
```

---

## Deviations from the spec, recorded here

- A definition with **no** icon resolves to initials **without** a warning; only an icon that is present but unusable warns. The spec says both warn; a silent default keeps the assistant's tool results free of noise for the common case.
- `update_part` with `custom` also matches **fields** by label (`mergeFieldIds`), so a value keyed by field id survives a definition rewrite. The spec covers ports only; fields follow the same rule for the same reason.

## Self-review notes

- Spec coverage: definition and limits (T1), resolver and memo (T1), merge rules (T2), call sites and sizing (T3), badge (T4), file format and migration (T5), `addNode` for the palette (T6), checks (T7), search (T8), board text and template lines (T9), ops and schema (T10), executor and descriptions (T11), prompt (T12), fake-assistant smoke (T13). BOM grouping in T3. Layout category in T3. Props header and fields in T3 (buttons are plan 2). The editor, library module, palette group, Customize, and the two browser scenarios are plan 2.
- Names used across tasks: `normalizePart`, `partOf`, `portsWithOffsets`, `initials`, `mergePortIds`, `mergeFieldIds`, `LIMITS`, `SIDES`, `PATH_RE` (T1–T2); `knownPorts(node)` (T3, used in T5); `filterTemplates`/`templateHaystack` (T8, used in T11); `templateLine` (T9, used in T11); `applyEdits(doc, ops, { library })` (T10, used in T11); `rewireNode` and `customDefinition` are private to `ops.js`.
