# Custom Parts Editor and Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users define, edit, and reuse custom parts: a part editor dialog with live preview, a "My parts" library group in the palette with export and import, Edit and Customize from the properties panel, and the assistant wired to the library.

**Architecture:** `src/library.js` keeps templates in localStorage with an in-memory fallback, storage injected. `src/custom.js` gains the pure helpers the UI needs (draft validation, a definition from a built-in part, applying a definition to a node). `src/ui/part-editor.js` is the dialog; `src/ui/badge.js` draws a part's badge for both the palette and the editor. The palette grows a "My parts" group; the properties panel grows two buttons; `main.js` wires the library and editor into the palette, the properties panel, and the assistant.

**Tech Stack:** Static ES modules, no build step, no dependencies. `node --test` for pure modules; `npm run e2e` (headless Chrome over the DevTools Protocol) for the dialog and palette.

**Spec:** `docs/superpowers/specs/2026-09-07-custom-parts-design.md`

**Prerequisite:** `docs/superpowers/plans/2026-09-07-custom-parts-engine.md` executed and merged (it provides `normalizePart`, `partOf`, `addNode(store, kind, x, y, part)`, `filterTemplates`, `createExecutor({ library })`, and custom nodes that load, size, render, and check).

## Global Constraints

- No new runtime dependencies; no build step.
- Limits, verbatim from the spec: name 60, ports 24, port name 12, fields 8, choices per field 20 (each 40 chars), path 2000, library templates 200. All live in `LIMITS` from `src/custom.js`; never restate a number.
- The library key is `schematica.parts`; the export file is `{ "schematicaParts": 1, "parts": [...] }`, downloaded as `my-parts.schematica-parts.json`.
- Saving from the editor is one `store.apply` (one undo step). Library changes are not undoable except delete, which the toast's Undo re-saves.
- The dark UI language: reuse the tokens in `css/style.css` `:root`, the `.rec-card` dialog card, `.swatches`, `.chips`, `.dialog-check`, `.rec-buttons`. No new colours outside those tokens except the existing danger red.
- The existing browser check "palette search "rdk" shows … under a single Robotics heading" counts visible `#palette h3` elements; the My parts heading must hide when a search matches none of its items.
- Commits carry **no** `Co-Authored-By` or `Claude-Session` trailers.
- `npm test` before every commit; `npm run e2e` in the last task.

## File map

| File | Responsibility |
|---|---|
| `src/library.js` (new) | `createLibrary(storage)` → `{ list, get, save, remove, importJSON, exportJSON, subscribe }` |
| `src/custom.js` | add `draftProblems`, `optionList`, `definitionFrom`, `siblings`, `applyDefinition` |
| `src/ui/badge.js` (new) | `badgeColor(part)`, `badgeHTML(part, color)` |
| `src/ui/part-editor.js` (new) | `initPartEditor({ store, library, svg, tools })` → `{ open({ def, nodeId?, templateId?, mode }) }` |
| `src/ui/palette-ui.js` | My parts group, On this board, drop of templates, search over templates, `data-kind` on items |
| `src/ui/props.js` | `createPropsPanel({ store, editor })`; Edit part… / Customize… buttons |
| `src/ui/assistant-ui.js` | `initAssistant({ …, library })` passes it to the executor |
| `src/main.js` | creates the library and editor, passes them on |
| `index.html` | `#part-dialog`, `#parts-file-input` |
| `css/style.css` | dialog registration, editor layout, My parts group |
| `README.md` | Custom parts row and paragraph; layout line |
| `tests/library.test.js` (new), `tests/custom.test.js`, `tests/e2e/smoke.mjs` |

---

### Task 1: The library module

**Files:**
- Create: `src/library.js`
- Test: `tests/library.test.js`

**Interfaces:**
- Consumes: `normalizePart`, `LIMITS` from `src/custom.js`; `uid` from `src/state.js`.
- Produces: `createLibrary(storage)` where `storage` is a `localStorage`-like object or null. Templates are `{ id, name, category, accent, icon, ports, fields, updated }` (a normalized definition without `lib`, plus `id` and `updated`).
  - `list(): template[]` (clones), `get(id): template | null` (clone)
  - `save(def, id = null): id` — creates or replaces; throws `Error` when full or nameless
  - `remove(id): template | null`
  - `importJSON(text): { added, replaced, warnings }` — throws on a non-parts file
  - `exportJSON(): string`
  - `subscribe(fn): unsubscribe`

- [ ] **Step 1: Write the failing tests**

```js
// tests/library.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibrary, LIBRARY_KEY, EXPORT_MARK } from '../src/library.js';
import { LIMITS } from '../src/custom.js';

function mapStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, map: m };
}

const DEF = { name: 'Motor driver x4', category: 'actuators', ports: [{ name: 'CAN', side: 'left', bus: 'can' }] };

test('save adds a normalized template with an id and a timestamp; list and get return clones', () => {
  const storage = mapStorage();
  const lib = createLibrary(storage);
  assert.deepEqual(lib.list(), []);
  const id = lib.save({ ...DEF, lib: 'ignored' });
  assert.match(id, /^lp[0-9a-z]{12}$/);
  const [t] = lib.list();
  assert.equal(t.id, id);
  assert.equal(t.name, 'Motor driver x4');
  assert.equal(t.ports[0].id, 'p1');
  assert.equal('lib' in t, false, 'a template never carries lib');
  assert.match(t.updated, /^\d{4}-\d{2}-\d{2}T/);
  t.name = 'mutated';
  assert.equal(lib.get(id).name, 'Motor driver x4', 'clones');
  assert.equal(lib.get('nope'), null);
  assert.ok(storage.map.get(LIBRARY_KEY).includes('"version":1'));
});

test('save with an id replaces, or creates under that id; remove returns the entry; subscribers hear every change', () => {
  const lib = createLibrary(mapStorage());
  let calls = 0;
  const off = lib.subscribe(() => { calls += 1; });
  const id = lib.save(DEF);
  assert.equal(lib.save({ ...DEF, name: 'Renamed' }, id), id);
  assert.equal(lib.list().length, 1);
  assert.equal(lib.get(id).name, 'Renamed');
  assert.equal(lib.save(DEF, 'lp-given'), 'lp-given', 'an unknown id is created as given');
  const gone = lib.remove(id);
  assert.equal(gone.name, 'Renamed');
  assert.equal(lib.remove(id), null);
  assert.deepEqual(lib.list().map((t) => t.id), ['lp-given']);
  assert.equal(calls, 4);
  off();
  lib.save(DEF);
  assert.equal(calls, 4);
});

test('save refuses a nameless definition and a full library', () => {
  const lib = createLibrary(mapStorage());
  assert.throws(() => lib.save({ name: '' }), /no name/);
  for (let i = 0; i < LIMITS.library; i++) lib.save({ ...DEF, name: `P${i}` });
  assert.throws(() => lib.save(DEF), /full/);
  assert.equal(lib.list().length, LIMITS.library);
  assert.doesNotThrow(() => lib.save({ ...DEF, name: 'replace' }, lib.list()[0].id), 'replacing never needs room');
});

test('corrupt or foreign storage reads as empty; blocked storage falls back to memory', () => {
  const corrupt = mapStorage();
  corrupt.setItem(LIBRARY_KEY, '{nope');
  assert.deepEqual(createLibrary(corrupt).list(), []);
  const foreign = mapStorage();
  foreign.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, parts: [{ id: 'bad id', name: 'x' }, { id: 'ok', name: 'Ok' }, { id: 'ok', name: 'Dup' }, 'junk'] }));
  assert.deepEqual(createLibrary(foreign).list().map((t) => [t.id, t.name]), [['ok', 'Ok']], 'bad ids, duplicates, and junk are skipped');
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const lib = createLibrary(blocked);
  const id = lib.save(DEF);
  assert.equal(lib.get(id).name, 'Motor driver x4', 'lives in memory for the session');
  const none = createLibrary(null);
  none.save(DEF);
  assert.equal(none.list().length, 1);
});

test('export and import round-trip; import merges by id, adds the rest, skips junk with warnings', () => {
  const a = createLibrary(mapStorage());
  const id = a.save(DEF);
  a.save({ ...DEF, name: 'Fan' });
  const text = a.exportJSON();
  const parsed = JSON.parse(text);
  assert.equal(parsed[EXPORT_MARK], 1);
  assert.equal(parsed.parts.length, 2);
  const b = createLibrary(mapStorage());
  b.save({ ...DEF, name: 'Old driver' }, id);
  b.save({ ...DEF, name: 'Mine' });
  const res = b.importJSON(text);
  assert.deepEqual([res.added, res.replaced], [1, 1]);
  assert.equal(b.get(id).name, 'Motor driver x4', 'same id replaced');
  assert.equal(b.list().length, 3);
  const junk = b.importJSON(JSON.stringify({ schematicaParts: 1, parts: [{ name: '' }, { id: 'z', name: 'Z', ports: [{ name: 'X', side: 'nowhere', bus: 'gpio' }] }] }));
  assert.deepEqual([junk.added, junk.replaced], [1, 0]);
  assert.ok(junk.warnings.some((w) => /Entry 1/.test(w)));
  assert.ok(junk.warnings.some((w) => /Entry 2/.test(w) && /no name or side/.test(w)));
  assert.throws(() => b.importJSON('{nope'), /could not parse/);
  assert.throws(() => b.importJSON('{"parts": 5}'), /Not a parts file/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/library.test.js`
Expected: FAIL — cannot find `src/library.js`.

- [ ] **Step 3: Write `src/library.js`**

```js
// The personal library of custom part definitions: the templates the
// palette lists under "My parts". Stored in this browser under one key,
// with an in-memory fallback when storage is blocked (the same tolerance
// the assistant settings have). Storage is injected so tests pass a Map.
import { normalizePart, LIMITS } from './custom.js';
import { uid } from './state.js';

export const LIBRARY_KEY = 'schematica.parts';
export const EXPORT_MARK = 'schematicaParts';
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

export function createLibrary(storage) {
  const read = () => { try { return storage ? storage.getItem(LIBRARY_KEY) : null; } catch { return null; } };
  let memory = null; // the list, once storage has failed us
  const listeners = new Set();

  // Every read re-parses storage (another tab may have written), and every
  // entry goes through the validator, so a foreign or corrupt value can only
  // yield fewer templates, never a broken one.
  function load() {
    if (memory) return memory;
    let parsed = null;
    try { parsed = JSON.parse(read() || 'null'); } catch { parsed = null; }
    const raw = Array.isArray(parsed?.parts) ? parsed.parts : [];
    const out = [];
    for (const entry of raw) {
      const id = typeof entry?.id === 'string' && ID_RE.test(entry.id) ? entry.id : null;
      const { part } = normalizePart(entry);
      if (!id || !part || out.some((t) => t.id === id)) continue;
      delete part.lib;
      out.push({ id, ...part, updated: typeof entry.updated === 'string' ? entry.updated : '' });
    }
    return out.slice(0, LIMITS.library);
  }

  function persist(parts) {
    let stored = false;
    try {
      if (storage) { storage.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, parts })); stored = true; }
    } catch { /* blocked or full: keep the session's copy in memory */ }
    memory = stored ? null : parts;
    for (const fn of listeners) fn();
  }

  const list = () => load().map((t) => structuredClone(t));
  const get = (id) => {
    const t = load().find((x) => x.id === id);
    return t ? structuredClone(t) : null;
  };

  // Saves a definition as a template: under `id` when given (replacing an
  // existing one, or creating it under that id), else as a new one.
  // Returns the id. Throws when the library is full or the part has no name.
  function save(def, id = null) {
    const { part, warnings } = normalizePart(def);
    if (!part) throw new Error(`The part cannot be saved: ${warnings.join(' ')}`);
    delete part.lib;
    const parts = load();
    const at = id ? parts.findIndex((t) => t.id === id) : -1;
    if (at < 0 && parts.length >= LIMITS.library) throw new Error(`My parts is full (${LIMITS.library} templates).`);
    const entry = { id: at >= 0 ? id : (id || uid('lp')), ...part, updated: new Date().toISOString() };
    if (at >= 0) parts[at] = entry;
    else parts.push(entry);
    persist(parts);
    return entry.id;
  }

  function remove(id) {
    const parts = load();
    const at = parts.findIndex((t) => t.id === id);
    if (at < 0) return null;
    const [gone] = parts.splice(at, 1);
    persist(parts);
    return gone;
  }

  const exportJSON = () => JSON.stringify({ [EXPORT_MARK]: 1, parts: load() }, null, 2);

  // Merges a parts file: the same id replaces, a new id adds, an unusable
  // entry is skipped with a warning. Throws when the text is not a parts file.
  function importJSON(text) {
    let raw;
    try { raw = JSON.parse(text); } catch { throw new Error('Not a parts file: could not parse JSON.'); }
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.parts)) {
      throw new Error(`Not a parts file: expected { "${EXPORT_MARK}": 1, "parts": [...] }.`);
    }
    const parts = load();
    const warnings = [];
    let added = 0;
    let replaced = 0;
    raw.parts.forEach((entry, i) => {
      const { part, warnings: w } = normalizePart(entry);
      if (!part) { warnings.push(`Entry ${i + 1}: ${w.join(' ')}`); return; }
      warnings.push(...w.map((x) => `Entry ${i + 1}: ${x}`));
      delete part.lib;
      const id = typeof entry.id === 'string' && ID_RE.test(entry.id) ? entry.id : uid('lp');
      const item = { id, ...part, updated: typeof entry.updated === 'string' ? entry.updated : new Date().toISOString() };
      const at = parts.findIndex((t) => t.id === id);
      if (at >= 0) { parts[at] = item; replaced += 1; }
      else if (parts.length >= LIMITS.library) warnings.push(`Entry ${i + 1}: My parts is full; skipped.`);
      else { parts.push(item); added += 1; }
    });
    persist(parts);
    return { added, replaced, warnings };
  }

  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  return { list, get, save, remove, importJSON, exportJSON, subscribe };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/library.test.js`
Expected: PASS, 5 tests. (`uid` uses the global `crypto`, present in Node 20+.)

- [ ] **Step 5: Commit**

```bash
git add src/library.js tests/library.test.js
git commit -m "feat(custom): personal part library with import and export"
```

---

### Task 2: Pure helpers for the editor — `draftProblems`, `optionList`, `definitionFrom`, `siblings`, `applyDefinition`

**Files:**
- Modify: `src/custom.js` (append)
- Test: `tests/custom.test.js` (append)

**Interfaces:**
- Produces:
  - `optionList(v): string[]` — from a comma-separated string or an array, trimmed, de-duplicated.
  - `draftProblems(raw): string[]` — what blocks Save; `[]` when the draft is fine. `raw.fields[].options` may be a string.
  - `definitionFrom(part): Definition-like` — from a resolved catalogue part (`nodePart(node)`), port ids kept.
  - `siblings(doc, node): node[]` — other custom nodes with the same `lib`.
  - `applyDefinition(doc, nodeId, def): { dropped }` — makes the node custom with `def`, drops wires on missing ports and values of missing fields.

- [ ] **Step 1: Write the failing tests**

Append to `tests/custom.test.js`:

```js
import { draftProblems, optionList, definitionFrom, siblings, applyDefinition } from '../src/custom.js';
import { nodePart } from '../src/rdk/profiles.js';

test('optionList splits, trims, and de-duplicates', () => {
  assert.deepEqual(optionList('a, b ,,b, c'), ['a', 'b', 'c']);
  assert.deepEqual(optionList(['x', ' x ', '']), ['x']);
  assert.deepEqual(optionList(''), []);
  assert.deepEqual(optionList(undefined), []);
});

test('draftProblems names what blocks Save and is empty for a good draft', () => {
  const good = { name: 'Driver', category: 'misc', icon: { text: 'DR' }, ports: [{ name: 'VCC', side: 'top', bus: 'power' }, { name: 'VCC', side: 'left', bus: 'power' }], fields: [{ label: 'Drive', options: 'a, b' }, { label: 'Note', options: '' }] };
  assert.deepEqual(draftProblems(good), []);
  assert.deepEqual(draftProblems({ ...good, name: ' ' }), ['Name is required.']);
  assert.deepEqual(draftProblems({ ...good, name: 'x'.repeat(61) }), [`Name is too long (${LIMITS.name} max).`]);
  assert.deepEqual(draftProblems({ ...good, ports: [{ name: '', side: 'top', bus: 'power' }] }), ['Port 1 needs a name.']);
  assert.deepEqual(draftProblems({ ...good, ports: [{ name: 'io', side: 'top', bus: 'gpio' }, { name: 'IO', side: 'top', bus: 'gpio' }] }), ['Two ports named "IO" on the top.']);
  assert.deepEqual(draftProblems({ ...good, ports: [{ name: 'ABCDEFGHIJKLM', side: 'top', bus: 'gpio' }] }), [`Port "ABCDEFGHIJKLM" name is too long (${LIMITS.portName} max).`]);
  assert.deepEqual(draftProblems({ ...good, icon: { path: 'x' } }), ['Icon path must be SVG path data starting with M.']);
  assert.deepEqual(draftProblems({ ...good, icon: { text: '' } }), [`Initials are 1 to ${LIMITS.text} characters.`]);
  assert.deepEqual(draftProblems({ ...good, fields: [{ label: '', options: '' }] }), ['Field 1 needs a label.']);
  assert.deepEqual(draftProblems({ ...good, fields: [{ label: 'Drive', options: 'only' }] }), ['Field "Drive" needs two or more choices.']);
  assert.deepEqual(draftProblems({ ...good, ports: Array.from({ length: LIMITS.ports + 1 }, (_, i) => ({ name: `P${i}`, side: 'left', bus: 'gpio' })) }), [`Too many ports (${LIMITS.ports} max).`]);
  assert.equal(draftProblems({ name: '', ports: [{ name: '', side: 'top' }], fields: [{ label: '' }] }).length, 3, 'every problem is listed');
});

test('definitionFrom a built-in part keeps port ids, marks supply pins required, and points the icon at the kind', () => {
  const d = definitionFrom(nodePart({ kind: 'mcu' }));
  assert.equal(d.name, 'MCU');
  assert.equal(d.category, 'compute');
  assert.deepEqual(d.icon, { kind: 'mcu' });
  assert.deepEqual(d.ports.map((p) => p.id), PARTS.mcu.ports.map((p) => p.id));
  assert.deepEqual(d.ports.filter((p) => p.required).map((p) => p.id), ['vcc', 'gnd']);
  assert.deepEqual(d.fields, []);
  const t = definitionFrom(nodePart({ kind: 'threatactor' }));
  assert.equal(t.fields.find((f) => f.id === 'severity').options.length, 5, 'schema fields become plain choice fields');
  assert.equal(t.icon.kind, 'threatactor');
  const bat = definitionFrom(nodePart({ kind: 'battery' }));
  assert.deepEqual(bat.ports.filter((p) => p.required), [], 'a supply output is not a required input');
  const { part, warnings } = normalizePart(d);
  assert.deepEqual(warnings, [], 'the definition is valid as is');
  assert.equal(part.ports.length, d.ports.length);
});

test('siblings are the other custom nodes from the same template', () => {
  const mk = (id, lib) => ({ id, kind: 'custom', part: { ...(lib ? { lib } : {}), name: 'X', category: 'misc', accent: null, icon: { text: 'X' }, ports: [], fields: [] } });
  const doc = { nodes: [mk('a', 'lp1'), mk('b', 'lp1'), mk('c', 'lp2'), mk('d', null), { id: 'e', kind: 'mcu' }], wires: [], zones: [], notes: [] };
  assert.deepEqual(siblings(doc, doc.nodes[0]).map((n) => n.id), ['b']);
  assert.deepEqual(siblings(doc, doc.nodes[3]), [], 'a one-off has none');
  assert.deepEqual(siblings(doc, doc.nodes[4]), []);
});

test('applyDefinition converts the node, drops wires on missing ports, prunes field values, and counts', () => {
  const doc = {
    nodes: [
      { id: 'm', kind: 'mcu', x: 0, y: 0, label: 'MCU', sublabel: 'ESP32', color: null, addr: '', rail: '3.3V', notes: '', status: 'tested', flags: ['bug'], fields: { zz: '1' } },
      { id: 't', kind: 'temp', x: 300, y: 0, label: 'T', sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [] },
    ],
    wires: [
      { id: 'w1', bus: 'i2c', from: { node: 'm', port: 'i2c' }, to: { node: 't', port: 'i2c' }, label: '', arrow: null, style: null, flow: null },
      { id: 'w2', bus: 'gnd', from: { node: 't', port: 'gnd' }, to: { node: 'm', port: 'gnd' }, label: '', arrow: null, style: null, flow: null },
    ],
    zones: [], notes: [],
  };
  const def = normalizePart({ ...definitionFrom(nodePart(doc.nodes[0])), ports: [{ id: 'i2c', name: 'I2C', side: 'right', bus: 'i2c' }, { id: 'p1', name: 'EN', side: 'left', bus: 'gpio' }], fields: [{ id: 'f1', label: 'Cores' }] }).part;
  const res = applyDefinition(doc, 'm', def);
  assert.deepEqual(res, { dropped: 1 });
  assert.equal(doc.nodes[0].kind, 'custom');
  assert.equal(doc.nodes[0].part, def);
  assert.deepEqual(doc.wires.map((w) => w.id), ['w1']);
  assert.equal('fields' in doc.nodes[0], false, 'a value for a field that no longer exists is gone');
  assert.equal(doc.nodes[0].sublabel, 'ESP32', 'instance values stay');
  assert.deepEqual(doc.nodes[0].flags, ['bug']);
  assert.deepEqual(applyDefinition(doc, 'nope', def), { dropped: 0 });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/custom.test.js`
Expected: FAIL — `draftProblems` is not exported.

- [ ] **Step 3: Append to `src/custom.js`**

```js
// ---- Helpers for the part editor and the properties panel ----

// Choices as the editor types them ("a, b, c") or as a list.
export function optionList(v) {
  const arr = Array.isArray(v) ? v : String(v ?? '').split(',');
  return [...new Set(arr.map((o) => str(o)).filter(Boolean))];
}

// What the editor must fix before Save is enabled. Unlike normalizePart,
// which repairs, this reports. The raw draft is the editor's shape:
// `fields[].options` may be a comma-separated string.
export function draftProblems(raw) {
  const problems = [];
  const name = str(raw?.name);
  if (!name) problems.push('Name is required.');
  else if (name.length > LIMITS.name) problems.push(`Name is too long (${LIMITS.name} max).`);
  const ports = Array.isArray(raw?.ports) ? raw.ports : [];
  if (ports.length > LIMITS.ports) problems.push(`Too many ports (${LIMITS.ports} max).`);
  const seen = new Set();
  ports.forEach((p, i) => {
    const pname = str(p?.name);
    if (!pname) { problems.push(`Port ${i + 1} needs a name.`); return; }
    if (pname.length > LIMITS.portName) problems.push(`Port "${pname}" name is too long (${LIMITS.portName} max).`);
    const key = `${p.side}|${pname.toLowerCase()}`;
    if (seen.has(key)) problems.push(`Two ports named "${pname}" on the ${p.side}.`);
    seen.add(key);
  });
  const icon = raw?.icon || {};
  if (icon.path !== undefined) {
    const path = str(icon.path);
    if (!(path && path.length <= LIMITS.path && /^[Mm]/.test(path) && PATH_RE.test(path))) problems.push('Icon path must be SVG path data starting with M.');
  }
  if (icon.text !== undefined) {
    const text = str(icon.text);
    if (!(text.length >= 1 && text.length <= LIMITS.text)) problems.push(`Initials are 1 to ${LIMITS.text} characters.`);
  }
  const fields = Array.isArray(raw?.fields) ? raw.fields : [];
  if (fields.length > LIMITS.fields) problems.push(`Too many fields (${LIMITS.fields} max).`);
  fields.forEach((f, i) => {
    const label = str(f?.label);
    if (!label) { problems.push(`Field ${i + 1} needs a label.`); return; }
    const typed = f.options !== undefined && f.options !== null && String(f.options).trim() !== '';
    if (typed && optionList(f.options).length < 2) problems.push(`Field "${label}" needs two or more choices.`);
  });
  return problems;
}

// A definition to start from when customizing a built-in part: its name,
// category, accent, icon (by kind), ports with their ids kept so wires
// survive, supply pins marked required the way the checks treat them, and
// its schema fields as plain fields. Takes a resolved part (nodePart(node)),
// so an RDK profile's ports come through.
export function definitionFrom(part) {
  const supply = (p) => (p.bus === 'power' || p.bus === 'gnd') && (p.id === 'vcc' || p.id === 'gnd' || p.id.startsWith('vin'));
  return {
    name: part.name,
    category: part.category,
    accent: part.accent || null,
    icon: { kind: part.kind },
    ports: part.ports.filter((p) => !p.unsupported).map((p) => ({
      id: p.id, name: p.name.slice(0, LIMITS.portName), side: p.side, bus: p.bus, required: supply(p),
    })),
    fields: (part.fields || []).map((f) => ({
      id: f.id,
      label: f.label.slice(0, LIMITS.fieldLabel),
      ...(f.options ? { options: [...f.options] } : {}),
      ...(f.placeholder ? { placeholder: f.placeholder } : {}),
    })),
  };
}

// Every other custom node stamped from the same template as `node`.
export function siblings(doc, node) {
  const lib = node?.part?.lib;
  if (!lib || node.kind !== 'custom') return [];
  return doc.nodes.filter((n) => n.id !== node.id && n.kind === 'custom' && n.part?.lib === lib);
}

// Gives a node a normalized definition: it becomes a custom node, wires on
// ports the definition no longer has are dropped, values of fields that no
// longer exist are dropped, everything else on the node stays. Returns how
// many wires went. Callers clone the definition per node so two nodes never
// share one object.
export function applyDefinition(doc, nodeId, def) {
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node) return { dropped: 0 };
  node.kind = 'custom';
  node.part = def;
  const ids = new Set(def.ports.map((p) => p.id));
  const before = doc.wires.length;
  doc.wires = doc.wires.filter((w) => (w.from.node !== nodeId || ids.has(w.from.port))
    && (w.to.node !== nodeId || ids.has(w.to.port)));
  if (node.fields) {
    const known = new Set(def.fields.map((f) => f.id));
    for (const k of Object.keys(node.fields)) if (!known.has(k)) delete node.fields[k];
    if (!Object.keys(node.fields).length) delete node.fields;
  }
  return { dropped: before - doc.wires.length };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/custom.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/custom.js tests/custom.test.js
git commit -m "feat(custom): editor helpers: draft problems, definition from a built-in, apply to a node"
```

---

### Task 3: The part editor dialog, Edit and Customize from the properties panel

**Files:**
- Create: `src/ui/badge.js`, `src/ui/part-editor.js`
- Modify: `index.html` (dialog markup and a hidden file input), `css/style.css`, `src/ui/props.js`, `src/main.js`
- Test: `tests/e2e/smoke.mjs` (Customize scenario)

**Interfaces:**
- Consumes: `createLibrary` (Task 1); `draftProblems`, `optionList`, `definitionFrom`, `siblings`, `applyDefinition`, `initials`, `normalizePart`, `LIMITS`, `SIDES` (engine plan and Task 2); `addNode(store, 'custom', x, y, part)`; `diagramMarkup`, `defsMarkup` from `src/render.js`; `ACCENT_SWATCHES` from `src/ui/props.js`; `openModal`, `toast`, `escAttr` from `src/ui/press.js`.
- Produces:
  - `badgeColor(part): string`, `badgeHTML(part, color?): string` — the palette badge markup for any part object (built-in or resolved custom).
  - `initPartEditor({ store, library, svg, tools }) → { open }` with `open({ def, nodeId = null, templateId = null, mode = 'new' | 'edit' | 'customize' })`.
  - `createPropsPanel({ store, editor })`.

- [ ] **Step 1: `src/ui/badge.js`**

```js
// A part's palette badge: the tinted square with its icon, glyph, or
// initials. Shared by the palette tiles and the part editor's icon grid.
import { CATEGORY_COLORS } from '../palette.js';
import { escAttr } from './press.js';

export function badgeColor(part) {
  return part.accent || CATEGORY_COLORS[part.category] || '#38bdf8';
}

export function badgeHTML(part, color = badgeColor(part)) {
  let inner;
  if (part.glyph) {
    // Glyph markup comes from the catalogue (Lucide icons), never from a file.
    inner = `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"`
      + ` stroke-linejoin="round" style="color:${color}">${part.glyph}</svg>`;
  } else if (part.text) {
    inner = `<b style="color:${color}">${escAttr(part.text)}</b>`;
  } else {
    inner = `<svg viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1.5"`
      + ` stroke-linecap="round" stroke-linejoin="round"><path d="${escAttr(part.icon)}"/></svg>`;
  }
  return `<span class="badge" style="--c:${color}">${inner}</span>`;
}
```

- [ ] **Step 2: Dialog markup in `index.html`**

After `<input type="file" id="file-input" …>` add:

```html
  <input type="file" id="parts-file-input" accept=".json,application/json" hidden>
  <dialog id="part-dialog">
    <div class="rec-card part-card">
      <h3 id="pe-title">New part</h3>
      <div class="pe-grid">
        <div class="pe-main">
          <div class="pe-row">
            <label class="pe-field">Name <input id="pe-name" type="text" maxlength="60" spellcheck="false" autocomplete="off"></label>
            <label class="pe-field">Category <select id="pe-category"></select></label>
          </div>
          <h4>Accent</h4>
          <div class="swatches" id="pe-swatches"></div>
          <h4>Icon</h4>
          <div class="pe-tabs" id="pe-icon-tabs">
            <button type="button" data-tab="kind">Built-in</button>
            <button type="button" data-tab="text">Initials</button>
            <button type="button" data-tab="path">SVG path</button>
          </div>
          <div id="pe-icon-kind" class="pe-icons"></div>
          <input id="pe-icon-text" type="text" maxlength="3" placeholder="e.g. MD" spellcheck="false" hidden>
          <textarea id="pe-icon-path" rows="2" placeholder="A 16-unit path, e.g. M4 4h8v8H4z" spellcheck="false" hidden></textarea>
          <h4>Ports</h4>
          <table class="pe-table"><tbody id="pe-ports"></tbody></table>
          <button type="button" id="pe-port-add" class="pe-add">+ Add port</button>
          <h4>Fields</h4>
          <table class="pe-table"><tbody id="pe-fields"></tbody></table>
          <button type="button" id="pe-field-add" class="pe-add">+ Add field</button>
        </div>
        <div class="pe-side">
          <h4>Preview</h4>
          <svg id="pe-preview" viewBox="-30 -30 164 134" aria-label="Card preview"></svg>
          <ul id="pe-problems" class="pe-problems"></ul>
        </div>
      </div>
      <div class="pe-footer">
        <label class="dialog-check"><input id="pe-save-lib" type="checkbox"> Save to library</label>
        <label class="dialog-check" id="pe-apply-all-row" hidden><input id="pe-apply-all" type="checkbox" checked> <span id="pe-apply-all-label"></span></label>
      </div>
      <div class="rec-buttons">
        <button type="button" id="pe-save">Save</button>
        <button type="button" id="pe-cancel">Cancel</button>
      </div>
    </div>
  </dialog>
```

- [ ] **Step 3: CSS**

In `css/style.css`, add `#part-dialog` to the three shared dialog selector lists (the base block starting `#rec-dialog,`, the `[open]` list, and the `::backdrop` list), and to the `.rec-buttons button` list under `/* ---- Export + BOM dialogs ---- */` (both the base rule and the `:hover` rule). Then append:

```css
/* ---- Part editor ---- */
.part-card { width: 780px; max-width: 94vw; max-height: 92vh; overflow: auto; }
.pe-grid { display: grid; grid-template-columns: 1fr 236px; gap: 18px; }
.pe-row { display: flex; gap: 10px; }
.pe-field { flex: 1; flex-direction: column; align-items: stretch; gap: 4px; padding: 0; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--faint); }
.part-card input[type="text"], .part-card select, .part-card textarea {
  width: 100%; background: var(--bg0); border: 1px solid var(--line); color: var(--text);
  border-radius: 8px; padding: 6px 8px; font-size: 12.5px; font-family: inherit; text-transform: none; letter-spacing: 0;
}
.part-card input:focus, .part-card select:focus, .part-card textarea:focus { outline: none; border-color: var(--accent); }
.part-card textarea { resize: vertical; font-family: var(--mono); font-size: 11.5px; }
.pe-tabs { display: flex; gap: 6px; margin-bottom: 8px; }
.pe-tabs button {
  background: var(--bg2); border: 1px solid var(--line); color: var(--muted); border-radius: 999px;
  padding: 4px 10px; font-size: 11.5px; cursor: pointer; font-family: inherit;
}
.pe-tabs button.active { color: #7dd3fc; border-color: var(--accent); background: var(--accent-dim); }
.pe-icons {
  display: grid; grid-template-columns: repeat(auto-fill, 36px); gap: 4px; max-height: 118px; overflow: auto;
  padding: 4px; border: 1px solid var(--line); border-radius: 8px;
}
.pe-icons button { background: none; border: 1px solid transparent; border-radius: 9px; padding: 0; cursor: pointer; }
.pe-icons button.active, .pe-icons button:hover { border-color: var(--accent); }
.pe-icons .badge, .custom-item .badge {
  display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 9px;
  background: color-mix(in srgb, var(--c) 13%, transparent);
}
.pe-icons .badge svg { width: 18px; height: 18px; }
.badge b { font-size: 11px; font-weight: 700; letter-spacing: 0.5px; font-style: normal; }
.pe-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.pe-table td { padding: 3px; vertical-align: middle; }
.pe-table td:first-child { width: 30%; }
.pe-table .dialog-check { font-size: 11.5px; white-space: nowrap; }
.pe-move { white-space: nowrap; text-align: right; }
.pe-move button {
  background: var(--bg2); border: 1px solid var(--line); color: var(--muted); border-radius: 6px;
  width: 24px; height: 24px; cursor: pointer; font-family: inherit; margin-left: 2px;
}
.pe-move button:hover:not(:disabled) { color: var(--text); border-color: var(--line2); }
.pe-move button:disabled { opacity: 0.35; cursor: default; }
.pe-add {
  margin-top: 6px; background: none; border: 1px dashed var(--line2); color: var(--muted); border-radius: 8px;
  padding: 5px 10px; font-size: 12px; cursor: pointer; font-family: inherit;
}
.pe-add:hover { color: var(--text); border-color: var(--accent); }
#pe-preview { width: 100%; height: 190px; background: var(--bg0); border: 1px solid var(--line); border-radius: 10px; }
#pe-preview .ports { opacity: 1; }
.pe-problems { margin: 8px 0 0; padding-left: 16px; font-size: 11.5px; color: #fca5a5; line-height: 1.5; }
.pe-footer { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px; }
#pe-save:disabled { opacity: 0.45; cursor: default; }
#props button.secondary {
  margin-top: 14px; width: 100%; background: var(--bg2); border: 1px solid var(--line2); color: var(--text);
  border-radius: 8px; padding: 7px 11px; cursor: pointer; font-family: inherit; font-size: 13px;
}
#props button.secondary:hover { border-color: var(--accent); color: #7dd3fc; }
```

- [ ] **Step 4: `src/ui/part-editor.js`**

```js
// The custom part editor: a modal dialog that builds or edits a definition
// with a live preview of the card. Opened from the palette (+ New, or a
// template's pencil), from a custom node's properties (Edit part…), and from
// a built-in node's properties (Customize…). A save onto the board is one
// undo step; the library is updated alongside when the box is ticked.
import { CATEGORIES, PARTS } from '../palette.js';
import { BUSES, BUS_ORDER } from '../buses.js';
import {
  LIMITS, SIDES, initials, normalizePart, draftProblems, optionList, applyDefinition, siblings,
} from '../custom.js';
import { addNode, findItem } from '../state.js';
import { snap, nodeSize } from '../geometry.js';
import { diagramMarkup, defsMarkup } from '../render.js';
import { ACCENT_SWATCHES } from './props.js';
import { badgeHTML } from './badge.js';
import { escAttr, toast, openModal } from './press.js';

export function initPartEditor({ store, library, svg, tools }) {
  const dialog = document.getElementById('part-dialog');
  const $ = (id) => document.getElementById(id);
  let draft = null; // the definition being edited, in the editor's shape
  let ctx = null;   // { nodeId, templateId, mode, others }
  let nextPort = 0;
  let nextField = 0;

  $('pe-category').innerHTML = CATEGORIES.map((c) => `<option value="${c.id}">${escAttr(c.name)}</option>`).join('');
  $('pe-icon-kind').innerHTML = Object.values(PARTS).map((p) => (
    `<button type="button" data-kind="${p.kind}" title="${escAttr(p.name)}">${badgeHTML(p)}</button>`
  )).join('');
  $('pe-swatches').innerHTML = ACCENT_SWATCHES.map((c) => (
    `<button type="button" class="swatch" data-swatch="${c}" style="background:${c}" title="${c}"></button>`
  )).join('') + '<button type="button" class="swatch swatch-auto" data-swatch="" title="Category color">Auto</button>';

  // ---- draft <-> definition ----
  // Rows keep their ids (a customized built-in keeps vcc, i2c, …); new rows
  // get p<n>/f<n> past the highest such id already present.
  function toDraft(def) {
    const top = (arr, prefix) => arr.reduce((n, x) => {
      const m = new RegExp(`^${prefix}(\\d+)$`).exec(x.id || '');
      return m ? Math.max(n, Number(m[1])) : n;
    }, 0);
    const d = {
      lib: def.lib || null,
      name: def.name || '',
      category: CATEGORIES.some((c) => c.id === def.category) ? def.category : 'misc',
      accent: def.accent || null,
      icon: def.icon ? { ...def.icon } : { text: '' },
      ports: (def.ports || []).map((p) => ({ id: p.id, name: p.name || '', side: p.side || 'left', bus: p.bus || 'gpio', required: !!p.required })),
      fields: (def.fields || []).map((f) => ({ id: f.id, label: f.label || '', options: (f.options || []).join(', ') })),
    };
    nextPort = top(d.ports, 'p');
    nextField = top(d.fields, 'f');
    return d;
  }
  function freshId(prefix, list, counter) {
    let n = counter;
    let id;
    do { n += 1; id = `${prefix}${n}`; } while (list.some((x) => x.id === id));
    return { id, n };
  }
  function rawDraft() {
    return {
      ...(draft.lib ? { lib: draft.lib } : {}),
      name: draft.name,
      category: draft.category,
      accent: draft.accent,
      icon: draft.icon,
      ports: draft.ports.map((p) => ({ ...p })),
      fields: draft.fields.map((f) => {
        const out = { id: f.id, label: f.label };
        const options = optionList(f.options);
        if (options.length) out.options = options;
        return out;
      }),
    };
  }

  // ---- rows ----
  function portRow(p, i, n) {
    return `<tr data-i="${i}">`
      + `<td><input type="text" data-pname maxlength="${LIMITS.portName}" value="${escAttr(p.name)}" placeholder="Name" spellcheck="false"></td>`
      + `<td><select data-pside>${SIDES.map((s) => `<option value="${s}"${s === p.side ? ' selected' : ''}>${s}</option>`).join('')}</select></td>`
      + `<td><select data-pbus>${BUS_ORDER.map((b) => `<option value="${b}"${b === p.bus ? ' selected' : ''}>${escAttr(BUSES[b].name)}</option>`).join('')}</select></td>`
      + `<td><label class="dialog-check" title="Check reports this port when it is unwired"><input type="checkbox" data-preq${p.required ? ' checked' : ''}> req</label></td>`
      + `<td class="pe-move"><button type="button" data-up title="Move up"${i === 0 ? ' disabled' : ''}>&uarr;</button>`
      + `<button type="button" data-down title="Move down"${i === n - 1 ? ' disabled' : ''}>&darr;</button>`
      + `<button type="button" data-del title="Remove port">&times;</button></td></tr>`;
  }
  function fieldRow(f, i) {
    return `<tr data-i="${i}">`
      + `<td><input type="text" data-flabel maxlength="${LIMITS.fieldLabel}" value="${escAttr(f.label)}" placeholder="Label" spellcheck="false"></td>`
      + `<td colspan="3"><input type="text" data-fopts value="${escAttr(f.options)}" placeholder="Choices, comma separated (blank = free text)" spellcheck="false"></td>`
      + `<td class="pe-move"><button type="button" data-fdel title="Remove field">&times;</button></td></tr>`;
  }
  const renderPorts = () => { $('pe-ports').innerHTML = draft.ports.map((p, i) => portRow(p, i, draft.ports.length)).join(''); };
  const renderFields = () => { $('pe-fields').innerHTML = draft.fields.map((f, i) => fieldRow(f, i)).join(''); };
  function renderIcon() {
    const tab = draft.icon.kind !== undefined ? 'kind' : (draft.icon.path !== undefined ? 'path' : 'text');
    $('pe-icon-tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('pe-icon-kind').hidden = tab !== 'kind';
    $('pe-icon-text').hidden = tab !== 'text';
    $('pe-icon-path').hidden = tab !== 'path';
    $('pe-icon-kind').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.kind === draft.icon.kind));
    if (tab === 'text') $('pe-icon-text').value = draft.icon.text ?? '';
    if (tab === 'path') $('pe-icon-path').value = draft.icon.path ?? '';
  }
  function renderSwatches() {
    $('pe-swatches').querySelectorAll('[data-swatch]').forEach((b) => b.classList.toggle('active', (b.dataset.swatch || null) === draft.accent));
  }
  function renderAll() {
    $('pe-name').value = draft.name;
    $('pe-category').value = draft.category;
    renderSwatches();
    renderIcon();
    renderPorts();
    renderFields();
  }

  // ---- preview and validation, on every change ----
  function refresh() {
    const raw = rawDraft();
    const problems = draftProblems(raw);
    $('pe-problems').innerHTML = problems.map((p) => `<li>${escAttr(p)}</li>`).join('');
    $('pe-save').disabled = problems.length > 0;
    // The preview draws even while the name is still blank.
    const { part } = normalizePart({ ...raw, name: raw.name || 'Part' });
    if (!part) return;
    const node = { id: 'preview', kind: 'custom', x: 0, y: 0, label: part.name, sublabel: '', color: null, addr: '', rail: '', notes: '', status: null, flags: [], part };
    const { w, h } = nodeSize(node);
    const preview = $('pe-preview');
    preview.setAttribute('viewBox', `-30 -30 ${w + 60} ${h + 60}`);
    preview.innerHTML = `<defs>${defsMarkup()}</defs>${diagramMarkup({ nodes: [node], wires: [], zones: [], notes: [] }, {})}`;
  }

  // ---- form events ----
  $('pe-name').addEventListener('input', () => { draft.name = $('pe-name').value; refresh(); });
  $('pe-category').addEventListener('change', () => { draft.category = $('pe-category').value; refresh(); });
  $('pe-swatches').addEventListener('click', (e) => {
    const b = e.target.closest('[data-swatch]');
    if (!b) return;
    draft.accent = b.dataset.swatch || null;
    renderSwatches();
    refresh();
  });
  $('pe-icon-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    const tab = b.dataset.tab;
    if (tab === 'kind') draft.icon = { kind: draft.icon.kind || 'generic' };
    if (tab === 'text') draft.icon = { text: draft.icon.text ?? initials(draft.name) };
    if (tab === 'path') draft.icon = { path: draft.icon.path ?? 'M4 4h8v8H4z' };
    renderIcon();
    refresh();
  });
  $('pe-icon-kind').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    draft.icon = { kind: b.dataset.kind };
    renderIcon();
    refresh();
  });
  $('pe-icon-text').addEventListener('input', () => { draft.icon = { text: $('pe-icon-text').value }; refresh(); });
  $('pe-icon-path').addEventListener('input', () => { draft.icon = { path: $('pe-icon-path').value }; refresh(); });

  const rowIndex = (e) => Number(e.target.closest('tr')?.dataset.i);
  $('pe-ports').addEventListener('input', (e) => {
    const p = draft.ports[rowIndex(e)];
    if (!p) return;
    if (e.target.matches('[data-pname]')) p.name = e.target.value;
    refresh();
  });
  $('pe-ports').addEventListener('change', (e) => {
    const p = draft.ports[rowIndex(e)];
    if (!p) return;
    if (e.target.matches('[data-pside]')) p.side = e.target.value;
    if (e.target.matches('[data-pbus]')) {
      p.bus = e.target.value;
      // A supply pin is required unless the user unticks it afterwards.
      p.required = p.bus === 'power' || p.bus === 'gnd';
      e.target.closest('tr').querySelector('[data-preq]').checked = p.required;
    }
    if (e.target.matches('[data-preq]')) p.required = e.target.checked;
    refresh();
  });
  $('pe-ports').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const i = rowIndex(e);
    if (b.hasAttribute('data-del')) draft.ports.splice(i, 1);
    if (b.hasAttribute('data-up') && i > 0) [draft.ports[i - 1], draft.ports[i]] = [draft.ports[i], draft.ports[i - 1]];
    if (b.hasAttribute('data-down') && i < draft.ports.length - 1) [draft.ports[i + 1], draft.ports[i]] = [draft.ports[i], draft.ports[i + 1]];
    renderPorts();
    refresh();
  });
  $('pe-port-add').addEventListener('click', () => {
    if (draft.ports.length >= LIMITS.ports) { toast(`At most ${LIMITS.ports} ports.`); return; }
    const { id, n } = freshId('p', draft.ports, nextPort);
    nextPort = n;
    draft.ports.push({ id, name: '', side: 'left', bus: 'gpio', required: false });
    renderPorts();
    refresh();
    $('pe-ports').querySelector('tr:last-child [data-pname]').focus();
  });
  $('pe-fields').addEventListener('input', (e) => {
    const f = draft.fields[rowIndex(e)];
    if (!f) return;
    if (e.target.matches('[data-flabel]')) f.label = e.target.value;
    if (e.target.matches('[data-fopts]')) f.options = e.target.value;
    refresh();
  });
  $('pe-fields').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !b.hasAttribute('data-fdel')) return;
    draft.fields.splice(rowIndex(e), 1);
    renderFields();
    refresh();
  });
  $('pe-field-add').addEventListener('click', () => {
    if (draft.fields.length >= LIMITS.fields) { toast(`At most ${LIMITS.fields} fields.`); return; }
    const { id, n } = freshId('f', draft.fields, nextField);
    nextField = n;
    draft.fields.push({ id, label: '', options: '' });
    renderFields();
    refresh();
    $('pe-fields').querySelector('tr:last-child [data-flabel]').focus();
  });

  // ---- open and save ----
  // def: a definition to start from. nodeId: the node being edited or
  // customized. templateId: a library template being edited from the palette.
  // Neither: a new part.
  function open({ def, nodeId = null, templateId = null, mode = 'new' }) {
    draft = toDraft(def);
    if (templateId) draft.lib = templateId;
    const node = nodeId ? findItem(store.doc, nodeId)?.item : null;
    const others = node
      ? siblings(store.doc, node)
      : (templateId ? store.doc.nodes.filter((n) => n.kind === 'custom' && n.part?.lib === templateId) : []);
    ctx = { nodeId, templateId, mode, others: others.map((n) => n.id) };
    $('pe-title').textContent = mode === 'new' ? 'New part' : (mode === 'customize' ? `Customize ${def.name}` : `Edit ${def.name}`);
    $('pe-save-lib').checked = mode === 'new' || !!templateId || !!draft.lib;
    $('pe-save-lib').disabled = mode === 'new' || !!templateId;
    $('pe-apply-all-row').hidden = !others.length;
    $('pe-apply-all').checked = true;
    const n = others.length;
    $('pe-apply-all-label').textContent = nodeId
      ? `Apply to the ${n} other part${n === 1 ? '' : 's'} on this board from this template`
      : `Apply to the ${n} part${n === 1 ? '' : 's'} on this board from this template`;
    renderAll();
    refresh();
    openModal(dialog);
    $('pe-name').focus();
  }

  function save() {
    const raw = rawDraft();
    if (draftProblems(raw).length) return;
    const { part } = normalizePart(raw);
    let libId = draft.lib;
    if ($('pe-save-lib').checked) {
      try { libId = library.save(part, libId); } catch (err) { toast(err.message); return; }
    }
    if (libId) part.lib = libId;
    else delete part.lib;
    const applyAll = !$('pe-apply-all-row').hidden && $('pe-apply-all').checked;
    const targets = [...(ctx.nodeId ? [ctx.nodeId] : []), ...(applyAll ? ctx.others : [])];
    if (targets.length) {
      let dropped = 0;
      store.apply((doc) => {
        for (const id of targets) dropped += applyDefinition(doc, id, structuredClone(part)).dropped;
      });
      const where = targets.length > 1 ? ` on ${targets.length} parts` : '';
      const wires = dropped ? `; ${dropped} wire${dropped === 1 ? '' : 's'} dropped` : '';
      toast(`${part.name} updated${where}${wires}.`);
    } else if (ctx.mode === 'new') {
      // A new part goes to My parts and onto the canvas at the centre of the view.
      const r = svg.getBoundingClientRect();
      const cx = (r.width / 2 - tools.view.x) / tools.view.zoom;
      const cy = (r.height / 2 - tools.view.y) / tools.view.zoom;
      const { w, h } = nodeSize({ kind: 'custom', label: part.name, part });
      const id = addNode(store, 'custom', snap(cx - w / 2), snap(cy - h / 2), part);
      store.setSelection([id]);
      toast(`${part.name} saved to My parts.`);
    } else {
      toast(`${part.name} updated in My parts.`);
    }
    dialog.close();
  }

  $('pe-save').addEventListener('click', save);
  $('pe-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('pointerdown', (e) => { if (e.target === dialog) dialog.close(); });
  // Canvas shortcuts listen on window; a keypress inside the form is the form's.
  dialog.addEventListener('keydown', (e) => e.stopPropagation());

  return { open };
}
```

- [ ] **Step 5: Properties panel buttons**

In `src/ui/props.js`:

- Add imports: `import { partOf, definitionFrom } from '../custom.js';` (replacing the `partOf` import the engine plan added) and `import { nodePart } from '../rdk/profiles.js';`.
- Change the signature to `export function createPropsPanel({ store, editor }) {`.
- In `nodeFields`, before `html += rdkDetails(item, doc);`, add:

```js
  // Custom parts edit their definition; any other card can become one.
  if (part.custom) html += '<button id="props-edit-part" class="secondary">Edit part&hellip;</button>';
  else if (!part.shape) html += '<button id="props-customize" class="secondary">Customize&hellip;</button>';
```

- In `bind(item)`, after the `guide` block, add:

```js
    const editPart = props.querySelector('#props-edit-part');
    if (editPart) onPress(editPart, () => {
      const cur = findItem(store.doc, item.id)?.item;
      if (cur?.part) editor.open({ def: cur.part, nodeId: cur.id, mode: 'edit' });
    });
    const customize = props.querySelector('#props-customize');
    if (customize) onPress(customize, () => {
      const cur = findItem(store.doc, item.id)?.item;
      if (cur) editor.open({ def: definitionFrom(nodePart(cur)), nodeId: cur.id, mode: 'customize' });
    });
```

- [ ] **Step 6: Wire it in `src/main.js`**

Add imports:

```js
import { createLibrary } from './library.js';
import { initPartEditor } from './ui/part-editor.js';
```

Replace `const propsPanel = createPropsPanel({ store });` with:

```js
// The part library lives in localStorage; reading `window.localStorage`
// throws when site data is blocked, so it takes null and lives in memory.
let storage = null;
try { storage = window.localStorage; } catch { storage = null; }
const library = createLibrary(storage);
const editor = initPartEditor({ store, library, svg, tools });
const propsPanel = createPropsPanel({ store, editor });
```

(`tools` is created a few lines above this point already.) Leave `initPalette({ svg, store, tools })` for Task 4 and `initAssistant(…)` for Task 5.

- [ ] **Step 7: Browser check — Customize**

Append to `tests/e2e/smoke.mjs` inside the `try` block, after the `savedMigration` check:

```js
  // ---- Custom parts: Customize a built-in ----
  await loadBoard(weather);
  const mcuCard = await center('#canvas g.node[data-id="n5"] .card');
  await click(mcuCard.x, mcuCard.y);
  await sleep(100);
  const wiresBefore = await js(`document.querySelectorAll('#canvas g.wire').length`);
  await js(`document.getElementById('props-customize').click(); true`);
  await sleep(100);
  const customizeOpen = await js(`(() => ({ open: document.getElementById('part-dialog').open, title: document.getElementById('pe-title').textContent, ports: document.querySelectorAll('#pe-ports tr').length, req: [...document.querySelectorAll('#pe-ports [data-preq]')].filter((c) => c.checked).length, lib: document.getElementById('pe-save-lib').checked, preview: document.querySelectorAll('#pe-preview .portg').length }))()`);
  check('Customize opens the editor prefilled from the MCU: eleven ports, supply pins required, library unticked, preview drawn', customizeOpen.open && customizeOpen.title === 'Customize MCU' && customizeOpen.ports === 11 && customizeOpen.req === 2 && customizeOpen.lib === false && customizeOpen.preview === 11, JSON.stringify(customizeOpen));
  await js(`(() => {
    const fire = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    document.getElementById('pe-port-add').click();
    const name = document.querySelector('#pe-ports tr:last-child [data-pname]');
    name.value = 'EN'; fire(name);
    document.getElementById('pe-save').click();
    return true;
  })()`);
  await sleep(150);
  const customized = await js(`(() => ({ closed: !document.getElementById('part-dialog').open, en: !!document.querySelector('#canvas g.node[data-id="n5"] .portg[data-port="p1"]'), i2c: !!document.querySelector('#canvas g.node[data-id="n5"] .portg[data-port="i2c"]'), wires: document.querySelectorAll('#canvas g.wire').length, invalid: document.querySelectorAll('#canvas g.wire.invalid').length, header: (document.querySelector('#props h3')?.textContent || '').trim(), edit: !!document.getElementById('props-edit-part') }))()`);
  check('saving makes the MCU a custom part with the new port, every wire intact, and an Edit part button', customized.closed && customized.en && customized.i2c && customized.wires === wiresBefore && customized.invalid === 0 && /^MCU/.test(customized.header) && customized.edit, JSON.stringify(customized));
  const undoneCustomize = await js(`(() => { document.getElementById('undo').click(); return { en: !!document.querySelector('#canvas g.node[data-id="n5"] .portg[data-port="p1"]'), customize: !!document.getElementById('props-customize') }; })()`);
  check('one undo restores the built-in MCU', undoneCustomize.en === false && undoneCustomize.customize === true, JSON.stringify(undoneCustomize));
```

- [ ] **Step 8: Run**

Run: `npm test && npm run e2e`
Expected: unit tests unchanged and green; the smoke test reports three more checks passing and `no console errors or exceptions`.

- [ ] **Step 9: Commit**

```bash
git add src/ui/badge.js src/ui/part-editor.js src/ui/props.js src/main.js index.html css/style.css tests/e2e/smoke.mjs
git commit -m "feat(custom): part editor dialog; Edit part and Customize from the properties panel"
```

---

### Task 4: The palette's "My parts" group

**Files:**
- Modify: `src/ui/palette-ui.js` (rewrite), `src/main.js` (`initPalette` call), `css/style.css`
- Test: `tests/e2e/smoke.mjs` (New part scenario)

**Interfaces:**
- Consumes: `createLibrary` (Task 1), `initPartEditor` (Task 3), `badgeHTML` (Task 3), `filterTemplates` (engine plan), `addNode(store, 'custom', x, y, part)`, `download` from `src/export.js`, `toast` with an action.
- Produces: `initPalette({ svg, store, tools, library, editor })`; every catalogue tile carries `data-kind`; template tiles carry `data-template`; ids `#my-parts-group`, `#parts-new`, `#parts-export`, `#parts-import`, `#my-parts`, `#board-parts-head`, `#board-parts`, `#parts-file-input`.

- [ ] **Step 1: Rewrite `src/ui/palette-ui.js`**

```js
// The parts palette: "My parts" (library templates and this board's custom
// parts) first, then the catalogue by category. Search filters both;
// tiles add on click and drag onto the canvas.
import { CATEGORIES, PARTS, getPart } from '../palette.js';
import { partOf } from '../custom.js';
import { addNode } from '../state.js';
import { snap, nodeSize } from '../geometry.js';
import { filterParts, filterTemplates } from '../search.js';
import { download } from '../export.js';
import { escAttr, toast } from './press.js';
import { badgeHTML } from './badge.js';

export function initPalette({ svg, store, tools, library, editor }) {
  const palette = document.getElementById('palette');
  const search = document.getElementById('palette-search');

  const centre = () => {
    const r = svg.getBoundingClientRect();
    return { x: (r.width / 2 - tools.view.x) / tools.view.zoom, y: (r.height / 2 - tools.view.y) / tools.view.zoom };
  };
  // Places a catalogue kind, or a custom definition when `def` is given, with
  // its centre at (x, y), and selects it.
  function place(kind, def, x, y) {
    const probe = def ? { kind: 'custom', label: def.name, part: def } : { kind, label: getPart(kind).defaultLabel || getPart(kind).name };
    const { w, h } = nodeSize(probe);
    const id = addNode(store, def ? 'custom' : kind, snap(x - w / 2), snap(y - h / 2), def);
    store.setSelection([id]);
  }
  const fromTemplate = (t) => ({ ...t, lib: t.id });

  // ---- My parts ----
  const mine = document.createElement('div');
  mine.id = 'my-parts-group';
  mine.innerHTML = '<h3 class="my-parts-head"><span>My parts</span><span class="my-parts-tools">'
    + '<button id="parts-new" type="button" title="Define a new part">+ New</button>'
    + '<button id="parts-export" type="button" title="Download My parts as a file">Export</button>'
    + '<button id="parts-import" type="button" title="Import a parts file">Import</button></span></h3>'
    + '<div class="cat-grid" id="my-parts"></div>'
    + '<h3 id="board-parts-head" class="sub" hidden>On this board</h3><div class="cat-grid" id="board-parts" hidden></div>';
  palette.appendChild(mine);
  const myHead = mine.querySelector('.my-parts-head');
  const myGrid = mine.querySelector('#my-parts');
  const boardHead = mine.querySelector('#board-parts-head');
  const boardGrid = mine.querySelector('#board-parts');
  let myCollapsed = false;
  myHead.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    myCollapsed = !myCollapsed;
    myGrid.hidden = myCollapsed;
    myHead.classList.toggle('collapsed', myCollapsed);
  });

  function templateTile(t) {
    const el = document.createElement('div');
    el.className = 'palette-item custom-item';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.dataset.template = t.id;
    el.draggable = true;
    el.innerHTML = badgeHTML(partOf({ kind: 'custom', part: t })) + `<span class="pi-name">${escAttr(t.name)}</span>`
      + '<span class="pi-tools"><button type="button" data-edit title="Edit part">&#9998;</button>'
      + '<button type="button" data-del title="Remove from My parts">&times;</button></span>';
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/schematica-template', t.id); });
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-edit]')) { editor.open({ def: t, templateId: t.id, mode: 'edit' }); return; }
      if (e.target.closest('[data-del]')) {
        const gone = library.remove(t.id);
        if (gone) toast(`Removed ${gone.name} from My parts.`, { action: { label: 'Undo', run: () => library.save(gone, gone.id) } });
        return;
      }
      const c = centre();
      place('custom', fromTemplate(t), c.x, c.y);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      const c = centre();
      place('custom', fromTemplate(t), c.x, c.y);
    });
    return el;
  }

  // Custom parts on the board whose template is not in the library (or that
  // never had one), one tile per template or name, so a board from someone
  // else can seed My parts.
  function boardParts() {
    const have = new Set(library.list().map((t) => t.id));
    const seen = new Map();
    for (const n of store.doc.nodes) {
      if (n.kind !== 'custom' || !n.part) continue;
      if (n.part.lib && have.has(n.part.lib)) continue;
      const key = n.part.lib || `name:${n.part.name}`;
      if (!seen.has(key)) seen.set(key, n);
    }
    return [...seen.values()];
  }
  function boardTile(n) {
    const el = document.createElement('div');
    el.className = 'palette-item custom-item';
    el.innerHTML = badgeHTML(partOf(n)) + `<span class="pi-name">${escAttr(n.part.name)}</span>`
      + '<button type="button" class="pi-adopt" data-adopt>Add to library</button>';
    el.querySelector('[data-adopt]').addEventListener('click', () => {
      let id;
      try { id = library.save(n.part, n.part.lib || null); } catch (err) { toast(err.message); return; }
      if (!n.part.lib) {
        // Every one-off of this name now belongs to the new template.
        const name = n.part.name;
        store.apply((doc) => {
          for (const m of doc.nodes) {
            if (m.kind === 'custom' && m.part && !m.part.lib && m.part.name === name) m.part = { lib: id, ...m.part };
          }
        });
      }
      toast(`${n.part.name} added to My parts.`);
    });
    return el;
  }

  function renderMine() {
    myGrid.innerHTML = '';
    for (const t of library.list()) myGrid.appendChild(templateTile(t));
    boardGrid.innerHTML = '';
    for (const n of boardParts()) boardGrid.appendChild(boardTile(n));
    applySearch();
  }
  library.subscribe(renderMine);
  let boardKey = null;
  store.subscribe(() => {
    const key = store.doc.nodes.filter((n) => n.kind === 'custom' && n.part).map((n) => `${n.part.lib || ''}:${n.part.name}`).sort().join('|');
    if (key === boardKey) return;
    boardKey = key;
    renderMine();
  });

  mine.querySelector('#parts-new').addEventListener('click', () => {
    editor.open({ def: { name: '', category: 'misc', ports: [], fields: [] }, mode: 'new' });
  });
  mine.querySelector('#parts-export').addEventListener('click', () => {
    download('my-parts.schematica-parts.json', library.exportJSON(), 'application/json');
  });
  const fileInput = document.getElementById('parts-file-input');
  mine.querySelector('#parts-import').addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const res = library.importJSON(await file.text());
      const n = res.added + res.replaced;
      toast(`Imported ${res.added} new and ${res.replaced} updated part${n === 1 ? '' : 's'}.${res.warnings.length ? ` ${res.warnings.length} entr${res.warnings.length === 1 ? 'y' : 'ies'} skipped or adjusted.` : ''}`);
    } catch (err) {
      toast(err.message);
    }
  });

  // ---- Catalogue ----
  const groups = [];
  for (const cat of CATEGORIES) {
    const h = document.createElement('h3');
    h.textContent = cat.name;
    palette.appendChild(h);
    const box = document.createElement('div');
    box.className = 'cat-grid';
    palette.appendChild(box);
    const group = { h, box, collapsed: false, items: [] };
    groups.push(group);
    h.addEventListener('click', () => {
      group.collapsed = !group.collapsed;
      box.hidden = group.collapsed;
      h.classList.toggle('collapsed', group.collapsed);
    });
    for (const part of Object.values(PARTS).filter((p) => p.category === cat.id)) {
      const item = document.createElement('button');
      item.className = 'palette-item';
      item.dataset.kind = part.kind;
      item.innerHTML = badgeHTML(part) + `<span class="pi-name">${escAttr(part.name)}</span>`;
      item.draggable = true;
      item.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/schematica-kind', part.kind); });
      item.addEventListener('click', () => { const c = centre(); place(part.kind, null, c.x, c.y); });
      box.appendChild(item);
      group.items.push({ el: item, kind: part.kind });
    }
  }

  // ---- Search ----
  // Categories with no match fold away; clearing restores the manual
  // collapsed state. The My parts heading hides when nothing of its matches,
  // so a search shows only the headings that have tiles under them.
  function applySearch() {
    const q = search.value.trim();
    const hits = q ? filterParts(q) : null;
    for (const g of groups) {
      let shown = 0;
      for (const { el, kind } of g.items) {
        const on = !hits || hits.has(kind);
        el.hidden = !on;
        if (on) shown += 1;
      }
      g.h.hidden = hits ? shown === 0 : false;
      g.box.hidden = hits ? shown === 0 : g.collapsed;
    }
    const tHits = q ? new Set(filterTemplates(q, library.list()).map((t) => t.id)) : null;
    let shownMine = 0;
    for (const el of myGrid.children) {
      const on = !tHits || tHits.has(el.dataset.template);
      el.hidden = !on;
      if (on) shownMine += 1;
    }
    myHead.hidden = !!q && shownMine === 0;
    myGrid.hidden = q ? shownMine === 0 : myCollapsed;
    const onBoard = boardGrid.children.length > 0 && !q;
    boardHead.hidden = !onBoard;
    boardGrid.hidden = !onBoard;
  }
  search.addEventListener('input', applySearch);
  renderMine();

  // ---- Drop onto the canvas ----
  svg.addEventListener('dragover', (e) => e.preventDefault());
  svg.addEventListener('drop', (e) => {
    e.preventDefault();
    const pt = tools.toWorld(e);
    const tid = e.dataTransfer.getData('text/schematica-template');
    if (tid) {
      const t = library.get(tid);
      if (t) place('custom', fromTemplate(t), pt.x, pt.y);
      return;
    }
    const kind = e.dataTransfer.getData('text/schematica-kind');
    if (kind) place(kind, null, pt.x, pt.y);
  });
}
```

- [ ] **Step 2: CSS**

Append to `css/style.css`:

```css
/* ---- My parts (library) ---- */
.my-parts-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.my-parts-tools { display: flex; gap: 4px; }
.my-parts-tools button {
  background: var(--bg2); border: 1px solid var(--line); color: var(--muted); border-radius: 6px;
  padding: 2px 7px; font-size: 10px; letter-spacing: 0; text-transform: none; cursor: pointer; font-family: inherit;
}
.my-parts-tools button:hover { color: var(--text); border-color: var(--accent); }
#palette h3.sub { margin-top: 10px; cursor: default; }
.custom-item { position: relative; }
.custom-item .pi-tools { position: absolute; top: 4px; right: 4px; display: none; gap: 2px; }
.custom-item:hover .pi-tools, .custom-item:focus-within .pi-tools { display: flex; }
.custom-item .pi-tools button {
  width: 20px; height: 20px; border-radius: 6px; background: var(--bg1); border: 1px solid var(--line2);
  color: var(--muted); font-size: 11px; cursor: pointer; padding: 0; line-height: 1; font-family: inherit;
}
.custom-item .pi-tools button:hover { color: var(--text); border-color: var(--accent); }
.pi-adopt {
  margin-top: 2px; background: var(--accent-dim); border: 1px solid var(--accent); color: #7dd3fc;
  border-radius: 6px; padding: 2px 6px; font-size: 10px; cursor: pointer; font-family: inherit;
}
.pi-adopt:hover { background: var(--accent); color: var(--bg0); }
```

- [ ] **Step 3: `src/main.js`**

Change `initPalette({ svg, store, tools });` to `initPalette({ svg, store, tools, library, editor });`.

- [ ] **Step 4: Browser check — New part, place, wire, check, reload, orphan, search**

Append to `tests/e2e/smoke.mjs` inside the `try` block, after the Customize scenario from Task 3:

```js
  // ---- Custom parts: New part, place it, wire it, check it, keep it ----
  await loadBoard(EMPTY);
  await js(`document.querySelector('#palette .palette-item[data-kind="mcu"]').click(); true`);
  await sleep(100);
  await js(`document.getElementById('parts-new').click(); true`);
  await sleep(100);
  const newOpen = await js(`(() => ({ open: document.getElementById('part-dialog').open, focus: document.activeElement?.id, saveOff: document.getElementById('pe-save').disabled, libLocked: document.getElementById('pe-save-lib').checked && document.getElementById('pe-save-lib').disabled }))()`);
  check('+ New opens the editor with the name focused, Save disabled, and Save to library locked on', newOpen.open && newOpen.focus === 'pe-name' && newOpen.saveOff && newOpen.libLocked, JSON.stringify(newOpen));
  const filled = await js(`(() => {
    const fire = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const set = (el, v) => { el.value = v; fire(el); };
    set(document.getElementById('pe-name'), 'Motor driver x4');
    set(document.getElementById('pe-category'), 'actuators');
    const add = (name, side, bus) => { document.getElementById('pe-port-add').click(); const row = document.querySelector('#pe-ports tr:last-child'); set(row.querySelector('[data-pname]'), name); set(row.querySelector('[data-pside]'), side); set(row.querySelector('[data-pbus]'), bus); };
    add('VCC', 'top', 'power'); add('GND', 'top', 'gnd'); add('CAN', 'left', 'can');
    return { rows: document.querySelectorAll('#pe-ports tr').length, req: [...document.querySelectorAll('#pe-ports [data-preq]')].map((c) => c.checked), preview: document.querySelectorAll('#pe-preview .portg').length, initials: [...document.querySelectorAll('#pe-preview text')].some((t) => t.textContent === 'MD'), saveOn: !document.getElementById('pe-save').disabled };
  })()`);
  check('three ports with supply pins required by default, previewed live with initials, and Save enabled', filled.rows === 3 && JSON.stringify(filled.req) === '[true,true,false]' && filled.preview === 3 && filled.initials && filled.saveOn, JSON.stringify(filled));
  await js(`document.getElementById('pe-save').click(); true`);
  await sleep(150);
  const savedPart = await js(`(() => { const lib = JSON.parse(localStorage.getItem('schematica.parts') || '{}'); return { closed: !document.getElementById('part-dialog').open, mine: [...document.querySelectorAll('#my-parts .pi-name')].map((e) => e.textContent), stored: lib.parts?.length, ports: lib.parts?.[0]?.ports?.length, nodes: document.querySelectorAll('#canvas g.node').length, placed: document.querySelectorAll('#canvas .portg[data-port="p3"]').length }; })()`);
  check('Save lists the part under My parts, stores it, and places one on the canvas', savedPart.closed && JSON.stringify(savedPart.mine) === '["Motor driver x4"]' && savedPart.stored === 1 && savedPart.ports === 3 && savedPart.nodes === 2 && savedPart.placed === 1, JSON.stringify(savedPart));
  // The new card sits on top of the MCU at the centre; move it aside, then wire CAN to CAN.
  const mdCard = await center('#canvas g.node:has(.portg[data-port="p3"]) .card');
  await drag(mdCard.x, mdCard.y, mdCard.x + 340, mdCard.y);
  await sleep(150);
  const ids = await js(`({ md: document.querySelector('#canvas g.node:has(.portg[data-port="p3"])').dataset.id, mcu: document.querySelector('#canvas g.node:has(.portg[data-port="can"])').dataset.id })`);
  const fromPort = await center(`#canvas .portg[data-node="${ids.md}"][data-port="p3"] .port`);
  const toPort = await center(`#canvas .portg[data-node="${ids.mcu}"][data-port="can"] .port`);
  await drag(fromPort.x, fromPort.y, toPort.x, toPort.y);
  await sleep(200);
  const wiredCustom = await js(`(() => { const w = document.querySelector('#canvas g.wire'); return { wires: document.querySelectorAll('#canvas g.wire').length, from: w?.dataset.from, to: w?.dataset.to, popover: !document.getElementById('bus-popover').hidden }; })()`);
  check('a wire drags from the custom CAN port to the MCU CAN port with no bus popover', wiredCustom.wires === 1 && wiredCustom.from === `${ids.md}:p3` && wiredCustom.to === `${ids.mcu}:can` && !wiredCustom.popover, JSON.stringify(wiredCustom));
  await js(`document.getElementById('btn-check').click(); true`);
  await sleep(100);
  const drcCustom = await js(`(() => ({ open: document.getElementById('drc-dialog').open, text: document.getElementById('drc-list').textContent }))()`);
  check("Check reports the custom part's unwired VCC and GND pins", drcCustom.open && /Motor driver x4's VCC pin is unconnected/.test(drcCustom.text) && /Motor driver x4's GND pin is unconnected/.test(drcCustom.text), drcCustom.text.slice(0, 200));
  await key('Escape', 'Escape', 27);
  await sleep(700);
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await send('Page.navigate', { url: `${origin}/` });
  await sleep(1200);
  const afterReload = await js(`(() => ({ mine: [...document.querySelectorAll('#my-parts .pi-name')].map((e) => e.textContent), nodes: document.querySelectorAll('#canvas g.node').length, ports: document.querySelectorAll('#canvas .portg[data-port="p3"]').length, onBoardHidden: document.getElementById('board-parts').hidden }))()`);
  check('after a reload My parts still lists the template and the board keeps its custom part', JSON.stringify(afterReload.mine) === '["Motor driver x4"]' && afterReload.nodes === 2 && afterReload.ports === 1 && afterReload.onBoardHidden === true, JSON.stringify(afterReload));
  await js(`document.querySelector('#my-parts .custom-item [data-del]').click(); true`);
  await sleep(100);
  const orphan = await js(`(() => ({ mine: document.querySelectorAll('#my-parts .palette-item').length, onBoard: !document.getElementById('board-parts').hidden, adopt: !!document.querySelector('#board-parts [data-adopt]'), toast: document.getElementById('toast').textContent }))()`);
  check('removing the template offers Undo and lists the orphaned board part under On this board', orphan.mine === 0 && orphan.onBoard && orphan.adopt && /Removed Motor driver x4/.test(orphan.toast) && /Undo/.test(orphan.toast), JSON.stringify(orphan));
  await js(`document.querySelector('#board-parts [data-adopt]').click(); true`);
  await sleep(100);
  const adopted = await js(`(() => ({ mine: [...document.querySelectorAll('#my-parts .pi-name')].map((e) => e.textContent), onBoardHidden: document.getElementById('board-parts').hidden }))()`);
  check('Add to library brings it back under the same template id', JSON.stringify(adopted.mine) === '["Motor driver x4"]' && adopted.onBoardHidden === true, JSON.stringify(adopted));
  const searchedMine = await js(`(() => { const visible = ${visible}; const s = document.getElementById('palette-search'); s.value = 'motor driver x4'; s.dispatchEvent(new Event('input', { bubbles: true })); const out = { mine: [...document.querySelectorAll('#my-parts .palette-item')].filter(visible).length, catalogue: [...document.querySelectorAll('#palette .cat-grid:not(#my-parts):not(#board-parts) .palette-item')].filter(visible).length }; s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); return out; })()`);
  check('palette search finds the template by its full name', searchedMine.mine === 1, JSON.stringify(searchedMine));
```

- [ ] **Step 5: Run**

Run: `npm test && npm run e2e`
Expected: the existing checks "palette search "rdk" … single Robotics heading", "clearing the search restores every part", and "clicking a category heading collapses and re-expands its tiles" still pass (the My parts heading is the first `h3` now and collapses its own grid), plus nine new checks; `no console errors or exceptions`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/palette-ui.js src/main.js css/style.css tests/e2e/smoke.mjs
git commit -m "feat(custom): My parts library group in the palette"
```

---

### Task 5: Assistant reads the library; README; full run

**Files:**
- Modify: `src/ui/assistant-ui.js` (`initAssistant` signature, `createExecutor` call), `src/main.js` (`initAssistant` call), `README.md`

- [ ] **Step 1: Pass the library to the executor**

In `src/ui/assistant-ui.js`: change `export function initAssistant({ store, tools, render, svg }) {` to `export function initAssistant({ store, tools, render, svg, library = null }) {` and the executor construction to:

```js
    const executor = createExecutor({
      getDoc: () => store.doc,
      commit: (fn) => store.mutate(fn),
      selection: () => [...store.selection],
      library,
    });
```

In `src/main.js`: `initAssistant({ store, tools, render, svg, library });`.

- [ ] **Step 2: Browser check — a template add through the fake assistant**

In `tests/e2e/smoke.mjs`, the fake provider's `ops` branches (engine plan Task 13) gain one more before the default `else`:

```js
    } else if (/^Add my template/i.test(lastText)) {
      const id = /lp[0-9a-z-]+/.exec(lastText)?.[0];
      ops = [{ op: 'add_part', ref: 'md', kind: 'custom', template: id }];
    } else {
```

Append to the try block after the Task 4 scenario (My parts holds "Motor driver x4" at this point):

```js
  // The assistant can place a library template by id.
  await seedFake();
  const templateId = await js(`JSON.parse(localStorage.getItem('schematica.parts')).parts[0].id`);
  if (await js(`document.getElementById('assistant').hidden`)) { await key('a', 'KeyA', 65); await sleep(100); }
  await js(`(() => { const i = document.getElementById('ai-input'); i.value = 'Add my template ${templateId}'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
  let fromTemplate = null;
  for (let i = 0; i < 40; i++) {
    fromTemplate = await js(`(() => ({ nodes: document.querySelectorAll('#canvas g.node').length, p3: document.querySelectorAll('#canvas .portg[data-port="p3"]').length, sending: !document.getElementById('ai-stop').hidden }))()`);
    if (fromTemplate.nodes === 3 && !fromTemplate.sending) break;
    await sleep(150);
  }
  check('the assistant adds a part from a library template by id', fromTemplate.nodes === 3 && fromTemplate.p3 === 2, JSON.stringify(fromTemplate));
```

- [ ] **Step 3: README**

In the "Use it" table, after the `| Wire options | … |` row, add:

```
| Custom parts | **+ New** under My parts in the palette defines a part: name, category, accent, an icon (a built-in one, initials, or an SVG path), typed ports on any side, and extra fields. It is saved to My parts (this browser) and placed on the board. **Customize…** on any built-in card starts from its definition, so an MCU with a second CAN port keeps its wires. **Edit part…** on a custom card changes it and, when it came from a template, offers to update its siblings. Export and Import move My parts between machines as a JSON file. Custom parts in a board file travel with it; an older build of the app opens them as custom boxes |
```

After the paragraph that begins "Work is autosaved", add:

```
Custom parts carry their definition inside the board file, so share links and
saved files are self-contained. The library of templates lives in this
browser only; export it to a `.schematica-parts.json` file to move or share
it. Ports marked "req" in the editor are reported by Check when unwired.
```

In the "Develop" layout paragraph, after the sentence ending "`src/export.js` builds standalone SVG/PNG.", add: "`src/custom.js` validates custom part definitions and resolves a custom node to a catalogue-shaped part; `src/library.js` keeps the templates; `src/ui/part-editor.js` is the editor dialog."

- [ ] **Step 4: Run everything**

Run: `npm test && npm run e2e`
Expected: every unit test green; the smoke test ends with `no console errors or exceptions` and all checks passing (baseline 94, plus 1 from the engine plan, 3 from Task 3, 9 from Task 4, 1 here: 108).

- [ ] **Step 5: Commit**

```bash
git add src/ui/assistant-ui.js src/main.js README.md tests/e2e/smoke.mjs
git commit -m "feat(custom): assistant places library templates; document custom parts"
```

---

## Self-review notes

- Spec coverage: library storage, cap, memory fallback, export and import merge (T1); draft validation, Customize source definition, apply with wire and field pruning, siblings (T2); editor layout, three entry points, preview through the real renderer, inline validation, Save to library and apply-to-all rules, one undo step, click-outside and Escape (T3); My parts group with + New, Export, Import, tile edit and delete with Undo, On this board with Add to library, template drag and drop, search over templates, heading collapse (T4); assistant library pass-through, README (T5). The two browser scenarios the spec names are T4 (new part, wire, check, reload) and T3 (customize keeps wires). Inert-while-busy needs nothing new: the palette and properties panel are already made inert by the assistant, and a modal dialog cannot be open when a request starts.
- Names used across tasks: `createLibrary`, `LIBRARY_KEY`, `EXPORT_MARK` (T1); `draftProblems`, `optionList`, `definitionFrom`, `siblings`, `applyDefinition` (T2, used in T3); `badgeHTML`, `badgeColor` (T3, used in T4); `initPartEditor(...).open({ def, nodeId, templateId, mode })` (T3, used in T3 props and T4 palette); `createPropsPanel({ store, editor })` (T3); `initPalette({ svg, store, tools, library, editor })` (T4); `initAssistant({ …, library })` (T5). Element ids: `part-dialog`, `pe-*`, `parts-file-input` (T3); `my-parts-group`, `parts-new`, `parts-export`, `parts-import`, `my-parts`, `board-parts-head`, `board-parts`, `props-edit-part`, `props-customize` (T3–T4).
- Deviation recorded: a **new** part is also placed at the centre of the view on Save (the spec only says it is saved to My parts); it gives immediate feedback and matches what clicking a palette tile does.
- Deviation recorded: Save to library is locked on for + New (the spec said off for a one-off); a + New part lives in My parts by definition, so there is no one-off case for it to default away from.
- Deviation recorded: the My parts heading hides during a search that matches none of its templates (the spec said the header always shows); a search shows only the groups that have tiles under them, and My parts is no exception.

## Carried over from the engine branch (2026-09-08)

Facts the engine plan's execution settled that this plan's tasks rely on:

- **Explicit ids win.** `normalizePart` reserves every valid explicit port/field id first (first occurrence wins) and generates `p<n>`/`f<n>` around them. The editor may therefore keep ids on rows and mint new ones without fear of a collision reshuffling saved wires.
- **Definitions are immutable.** `partOf` memoizes on the `part` object; never mutate `node.part` in place — replace it (`applyDefinition` does; `updateItem(store, id, { part })` would too).
- **Whitespace is collapsed** by the validator (names, port names, labels, options, placeholder), so the editor need not guard against newlines.
- **Every field label reaching the properties panel is escaped** by `propField`; the editor's own markup must escape labels, options, and names the same way (`escAttr`), and the badge helper must escape the icon path.

Deferred minors the final review left for this plan (fix when touching the code, or as a small task at the end):

- `mergePortIds`/`mergeFieldIds` are near-twins; extract a shared `mergeIds(old, fresh, { key, prefer, prefix })` when the editor's apply-to-all lands (its `assigned` set is redundant with the old-id set).
- `add_part` with a catalogue kind silently ignores `custom`/`template`; fail with a pointer instead.
- `rewireNode`'s drop warning says "has no port for their bus" even when the cause is a bus change on a name-matched port or point-to-point contention.
- `update_part` with `custom` does not re-check surviving field values against a field's new `options` (the loader does not either; the props panel prepends a stale value to the select).
- `normalizeIcon` falls through to `text` when both `kind` (invalid) and `text` are given, without a warning.
- `ID_RE` admits `__proto__`/`constructor` as ids; harmless today, a one-line reserved-name check.
- Tests to add: a space-containing port name is quoted in board text; a name-matched port whose bus changed; two point-to-point wires contending for one port; a `part` payload on a non-custom kind is ignored; a custom part's non-required port with id `vcc` stays silent.
- Cosmetic: `nodeSize` filters the port list four times; the BOM key repeats the sublabel suffix; `filterParts` could call the module-level `words()`.

## Deferred after the UI branch (2026-09-08)

Left by the whole-branch review as polish, none user-visible today:

- Palette: keyboard placement rebuilds the tiles and drops focus (remember the focused template id and refocus); the delete toast's Undo is unguarded and re-appends the template at the end; `library.list()` is parsed three times per render (pass the list down); `{ lib: id, ...m.part }` should be `{ ...m.part, lib: id }`; the "clicking a category heading" browser check now exercises the My parts heading (`#palette > h3` would restore the original target).
- Editor: the preview repeats the canvas's SVG `defs` ids; `.pe-field` carries dead flex declarations; `#props button.secondary` sits in the editor CSS block; `normalizePart` warnings are discarded on save; `centre()`/`place()` are duplicated between the editor and the palette.
- Library: `importJSON` persists and notifies on a no-op; an import entry with no id gets a fresh id silently (re-importing a hand-written file adds duplicates); `save(def, '')` mints a fresh id; `updated` is not validated as ISO on foreign storage.
- CSS: `#palette-search + h3` no longer matches anything (retarget to `#my-parts-group > h3`).
- README: the Assistant row does not say the assistant can define custom parts or place library templates.
- Engine carry-overs above remain open.
