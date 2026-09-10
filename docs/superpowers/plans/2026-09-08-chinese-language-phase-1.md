# Simplified Chinese Interface, Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A live English/Chinese switch in the toolbar that translates every interface string, palette and bus name, preset note, checker message and the exported RDK guide into Simplified Chinese, remembered per device, English by default, with the copilot answering in Chinese when the interface is Chinese.

**Architecture:** One pure module `src/i18n.js` exports `tr(text, vars)`, keyed by the English string, backed by a single dictionary `src/i18n/zh.js`; a missing entry returns the English text. A DOM walker in `src/ui/i18n-dom.js` re-translates the static markup in place; every panel that renders text wraps its strings in `tr` and subscribes to `onLanguageChange` to redraw. Data tables (palette, buses, presets, catalogue) stay English at rest and are translated where displayed. A coverage test extracts every `tr(` literal, every static text node and attribute in `index.html`, and every data-table string, and proves the dictionary complete and orphan-free.

**Tech Stack:** Static ES modules, no build step, no dependencies. Unit tests with Node's built-in runner (`node --test`); browser smoke test over the Chrome DevTools Protocol (`npm run e2e`).

**Spec:** `docs/superpowers/specs/2026-09-08-chinese-language-design.md` (phase 1 is everything except the "Example boards (phase 2)" section).

## Global Constraints

- No new runtime dependencies; no build step; plain ES modules served statically.
- The translation function is `tr`, never `t` (fourteen modules already use `t` as a local variable). Import it as `import { tr } from '../i18n.js'` (adjust the relative path per file).
- A `tr` call's first argument is always **one single-line string literal** (`'...'`, `"..."`, or a backtick literal with no `${}`), never an expression or a variable. Interpolation goes through `{name}` placeholders and a `vars` object.
- English stays the default: `getLang()` returns `'en'` unless storage holds exactly `'zh'`. Nothing reads the browser locale.
- Storage key, verbatim: `schematica.lang`. Values: `'en'` | `'zh'`.
- The `html` element's `lang` attribute is `zh-CN` in Chinese and `en` in English.
- Data tables are never rewritten: `src/palette.js`, `src/buses.js`, `src/presets.js`, `src/rdk/catalogue.js` keep English text; the displaying code calls `tr`.
- Wire pill codes (`BUSES[x].short`), port names (VCC, CSI1, CAM1...), status tags on cards (PROTO, TESTED...), part kinds, ids, part numbers and preset sublabels are never translated.
- Latin terms that stay Latin in Chinese get an explicit identity entry in the dictionary (BOM, PNG, SVG, PDF, CSV, GIF, OK, EN).
- Official Chinese vendor names in prose: 地平线 (Horizon), 征程 (Journey), 地瓜机器人 (D-Robotics). Part numbers stay as typed.
- Terminology, fixed by the spec: board 板图, part 部件, wire 连线, bus 总线, port 端口, pin 引脚, zone 区域, swimlane 泳道, note 便签, journey 导览, step 步骤, present 演示, design rule check 设计规则检查, bill of materials 物料清单 (button text stays BOM), preset 预设, part number 型号, custom part 自定义部件, My parts 我的部件, assistant 助手, error 错误, warning 警告, rail 电压轨, address 地址, unverified 未经验证.
- Every English board keeps its exact geometry: `textUnits` of pure ASCII equals `.length`. `tests/examples.test.js` zone containment is the regression guard and must stay green.
- Commits carry **no** `Co-Authored-By` or `Claude-Session` trailers (repo rule; the sole contributor is HenryCooper86).
- Run `npm test` before every commit. Tasks 3 and 14 also run `npm run e2e` (needs Chrome; `CHROME_PATH` overrides).
- Baseline on main before this plan: 433 unit tests, 142 e2e checks, all passing.
- Unit tests that call `setLang('zh')` must restore `setLang('en')` in a `finally` so test order cannot leak language.

## File map

| File | Responsibility |
|---|---|
| `src/i18n.js` (new) | `LANGS`, `STORAGE_KEY`, `initI18n({ storage })`, `getLang`, `setLang`, `onLanguageChange`, `tr` |
| `src/i18n/zh.js` (new) | `export default { 'English key': '中文' }`, grouped by surface |
| `src/ui/i18n-dom.js` (new) | `translateStatic(root)`; `initLanguageSwitch(button)` |
| `src/geometry.js` | `textUnits(s)`; `nodeSize`/`shapeSize` use it |
| `index.html` | hint-bar spans, Examples arrow span, `#btn-lang` |
| `src/main.js` | `initI18n`, `translateStatic()` before panels, `initLanguageSwitch`, SVG re-render on change |
| `src/ui/dialogs.js`, `src/ui/examples-menu.js`, `src/ui/palette-ui.js`, `src/ui/legend.js`, `src/ui/props.js`, `src/ui/rdk-details.js`, `src/ui/part-editor.js`, `src/ui/journey-ui.js`, `src/ui/recording-ui.js`, `src/ui/panels.js`, `src/ui/collapsible.js`, `src/ui/press.js`, `src/ui/assistant-ui.js`, `src/ui/assistant-documents.js` | strings through `tr`; `onLanguageChange` redraw |
| `src/state.js`, `src/search.js`, `src/render.js`, `src/bom.js` | default labels, bilingual search haystack, flag labels, BOM headers |
| `src/drc.js`, `src/rdk/checks.js`, `src/rdk/guide.js` | messages and guide text through `tr` |
| `src/ai/prompt.js`, `src/ui/assistant-ui.js` | `perRequestSystem({ ..., language })`; caller passes `getLang()` |
| `tests/i18n.test.js` (new), `tests/i18n-coverage.test.js` (new), `tests/geometry.test.js`, `tests/drc.test.js`, `tests/rdk-checks.test.js`, `tests/ai-context.test.js`, `tests/e2e/smoke.mjs` | verification |
| `README.md` | an "Interface language" row |

---

### Task 1: The i18n core

**Files:**
- Create: `src/i18n.js`
- Create: `src/i18n/zh.js`
- Test: `tests/i18n.test.js`

**Interfaces:**
- Produces: `LANGS = ['en', 'zh']`, `STORAGE_KEY = 'schematica.lang'`, `initI18n({ storage })`, `getLang(): 'en'|'zh'`, `setLang(lang): void`, `onLanguageChange(fn): () => void`, `tr(text, vars?): string`, `trd(value): string` (the same lookup for a data-table value, no placeholders). Every later task imports `tr`, uses `trd` for data values, and, for redraws, `onLanguageChange`.
- The dictionary module exports a default plain object; later tasks append entries to it under a comment per surface.

- [ ] **Step 1: Write the failing tests**

Create `tests/i18n.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGS, STORAGE_KEY, initI18n, getLang, setLang, onLanguageChange, tr, trd } from '../src/i18n.js';
import zh from '../src/i18n/zh.js';

// A Map-backed stand-in for localStorage.
const fakeStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
};

test('languages and storage key are fixed', () => {
  assert.deepEqual(LANGS, ['en', 'zh']);
  assert.equal(STORAGE_KEY, 'schematica.lang');
});

test('English is the default for absent, junk, or missing storage', () => {
  initI18n({ storage: fakeStorage() });
  assert.equal(getLang(), 'en');
  initI18n({ storage: fakeStorage({ [STORAGE_KEY]: 'fr' }) });
  assert.equal(getLang(), 'en');
  initI18n({ storage: null });
  assert.equal(getLang(), 'en');
});

test('a stored zh is honoured', () => {
  initI18n({ storage: fakeStorage({ [STORAGE_KEY]: 'zh' }) });
  try {
    assert.equal(getLang(), 'zh');
  } finally {
    initI18n({ storage: fakeStorage() });
  }
});

test('tr passes English through and fills placeholders', () => {
  initI18n({ storage: fakeStorage() });
  assert.equal(tr('Load an example board'), 'Load an example board');
  assert.equal(tr('{part} added to My parts.', { part: 'MCU' }), 'MCU added to My parts.');
  assert.equal(tr('{a} and {a}', { a: 'x' }), 'x and x');
  assert.equal(tr('{missing} stays', {}), '{missing} stays');
  assert.equal(tr(42), '42');
  assert.equal(tr(null), '');
});

test('tr looks up Chinese and falls back to English on a missing key', () => {
  initI18n({ storage: fakeStorage() });
  setLang('zh');
  try {
    assert.equal(tr('Cancel'), zh['Cancel']);
    assert.notEqual(zh['Cancel'], 'Cancel', 'the dictionary has a real entry for Cancel');
    assert.equal(tr('this key does not exist anywhere'), 'this key does not exist anywhere');
    assert.equal(tr('{part} added to My parts.', { part: 'MCU' }), zh['{part} added to My parts.'].replace('{part}', 'MCU'));
  } finally {
    setLang('en');
  }
});

test('trd translates a data value without touching braces', () => {
  initI18n({ storage: fakeStorage() });
  setLang('zh');
  try {
    assert.equal(trd('Compute'), zh['Compute']);
    assert.equal(trd('{not a placeholder}'), '{not a placeholder}');
    assert.equal(trd('unknown data value'), 'unknown data value');
  } finally {
    setLang('en');
  }
});

test('setLang validates, persists, notifies once, and ignores a repeat', () => {
  const storage = fakeStorage();
  initI18n({ storage });
  const seen = [];
  const off = onLanguageChange((lang) => seen.push(lang));
  try {
    setLang('zh');
    assert.equal(getLang(), 'zh');
    assert.equal(storage.getItem(STORAGE_KEY), 'zh');
    setLang('zh');
    assert.deepEqual(seen, ['zh'], 'a repeat is a no-op');
    assert.throws(() => setLang('fr'), /unknown language/);
    assert.equal(getLang(), 'zh');
    setLang('en');
    assert.deepEqual(seen, ['zh', 'en']);
    off();
    setLang('zh');
    assert.deepEqual(seen, ['zh', 'en'], 'unsubscribed');
  } finally {
    setLang('en');
  }
});

test('setLang survives a storage that throws', () => {
  initI18n({ storage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } });
  try {
    assert.equal(getLang(), 'en');
    setLang('zh');
    assert.equal(getLang(), 'zh');
  } finally {
    initI18n({ storage: fakeStorage() });
  }
});

test('the dictionary is a plain object of non-empty strings', () => {
  assert.equal(Object.getPrototypeOf(zh), Object.prototype);
  for (const [k, v] of Object.entries(zh)) {
    assert.equal(typeof v, 'string', k);
    assert.ok(v.trim().length > 0, `empty value for ${k}`);
    // Keys are exact source strings: some begin with a space or a newline.
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/i18n.test.js`
Expected: FAIL, `Cannot find module '.../src/i18n.js'`.

- [ ] **Step 3: Write the core and a seed dictionary**

Create `src/i18n.js`:

```js
// Interface language. English is the source of truth: every key is the
// English string itself, and a missing Chinese entry shows English.
// Pure: no DOM. `initI18n` binds the storage; a document, when there is
// one, gets its `lang` attribute updated by setLang.
import zh from './i18n/zh.js';

export const LANGS = ['en', 'zh'];
export const STORAGE_KEY = 'schematica.lang';
const DICTS = { zh };
const HTML_LANG = { en: 'en', zh: 'zh-CN' };

let storage;
let lang = null; // resolved lazily on first getLang()
const listeners = new Set();

function defaultStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function initI18n({ storage: s = defaultStorage() } = {}) {
  storage = s;
  lang = null;
}

export function getLang() {
  if (lang === null) {
    if (storage === undefined) storage = defaultStorage();
    let stored = null;
    try { stored = storage?.getItem(STORAGE_KEY) ?? null; } catch { stored = null; }
    lang = stored === 'zh' ? 'zh' : 'en';
    applyHtmlLang();
  }
  return lang;
}

function applyHtmlLang() {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = HTML_LANG[lang];
  }
}

export function setLang(next) {
  if (!LANGS.includes(next)) throw new Error(`unknown language "${next}"`);
  if (getLang() === next) return;
  lang = next;
  try { storage?.setItem(STORAGE_KEY, next); } catch { /* blocked storage: the choice lives for this page */ }
  applyHtmlLang();
  for (const fn of [...listeners]) fn(next);
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// tr('{part} added to My parts.', { part }) -> looked up, then filled.
// A placeholder without a value is left as written so a test can see it.
export function tr(text, vars) {
  const key = text == null ? '' : String(text);
  const current = getLang();
  const hit = current === 'en' ? undefined : DICTS[current]?.[key];
  const out = typeof hit === 'string' ? hit : key;
  if (!vars) return out;
  return out.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

// The same lookup for a value read from a data table (a part name, a bus
// name, a preset note), with no placeholder filling. Named separately so the
// coverage test can require that every `tr(` call takes a literal while
// data goes through `trd(`.
export function trd(value) {
  return tr(value);
}
```

Create `src/i18n/zh.js` with the seed the tests need plus the terminology that every later task builds on:

```js
// Simplified Chinese. Keys are the English source strings; placeholders keep
// their English names. Grouped by the surface that shows them. Identity
// entries mark Latin terms that stay Latin on purpose.
export default {
  // ---- shared words ----
  'Cancel': '取消',
  'Close': '关闭',
  'Save': '保存',
  'Undo': '撤销',
  'OK': 'OK',
  'BOM': 'BOM',
  'PNG': 'PNG',
  'SVG': 'SVG',
  'PDF': 'PDF',
  'CSV': 'CSV',
  'EN': 'EN',
  'Compute': '计算',
  '{part} added to My parts.': '{part} 已加入“我的部件”。',
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/i18n.test.js`
Expected: 9 passing.

- [ ] **Step 5: Commit**

```bash
git add src/i18n.js src/i18n/zh.js tests/i18n.test.js
git commit -m "i18n: core tr(), language storage, and the seed dictionary"
```

---

### Task 2: CJK-aware card widths

**Files:**
- Modify: `src/geometry.js:10-80` (`nodeMeta`, `shapeSize`, `nodeSize`)
- Test: `tests/geometry.test.js`

**Interfaces:**
- Produces: `textUnits(s): number` exported from `src/geometry.js`. `nodeSize` and `shapeSize` use it in place of `.length`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/geometry.test.js` (add `textUnits` to the existing import list from `../src/geometry.js`):

```js
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('textUnits counts CJK, fullwidth and kana as 1.9 and everything else as 1', () => {
  assert.equal(textUnits('MCU'), 3);
  assert.equal(textUnits(''), 0);
  near(textUnits('电池'), 3.8);
  near(textUnits('（PWR）'), 1.9 * 2 + 3);
  near(textUnits('カメラ'), 5.7);
  near(textUnits('한글'), 3.8);
  near(textUnits('X5 主控'), 3 + 3.8);
  assert.equal(textUnits(null), 0);
});

test('a Chinese label makes a wider card than a Latin label of similar length', () => {
  const base = { kind: 'mcu', sublabel: '', addr: '', rail: '' };
  const latin = nodeSize({ ...base, label: 'Motor driver' });
  const cjk = nodeSize({ ...base, label: '机器人主控制器驱动模块' });
  assert.equal(latin.w, 105.6, 'twelve Latin characters: 12 * 6.8 + 24, unchanged by this task');
  assert.ok(cjk.w > latin.w, `${cjk.w} > ${latin.w}`);
  assert.ok(cjk.w <= 240);
  assert.equal(cjk.h, latin.h, 'height does not depend on script');
});

test('Chinese meta lines widen the card too', () => {
  const base = { kind: 'mcu', label: 'M', addr: '', rail: '' };
  const latin = nodeSize({ ...base, sublabel: 'Cortex-M4 driver' });
  const cjk = nodeSize({ ...base, sublabel: '驱动微控制器型号说明' });
  assert.equal(latin.w, 120.4, 'sixteen Latin characters: 16 * 5.9 + 26');
  assert.ok(cjk.w > latin.w, `${cjk.w} > ${latin.w}`);
});

test('Chinese flow-shape labels widen the shape', () => {
  const latin = nodeSize({ kind: 'process', label: 'Verify signature' });
  const cjk = nodeSize({ kind: 'process', label: '验证签名并记录结果' });
  assert.equal(latin.w, 156, 'sixteen Latin characters: 16 * 7 + 44');
  assert.ok(cjk.w > latin.w, `${cjk.w} > ${latin.w}`);
  assert.equal(cjk.h, latin.h);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/geometry.test.js`
Expected: FAIL, `textUnits is not a function` (the import resolves to undefined).

- [ ] **Step 3: Implement `textUnits` and use it**

In `src/geometry.js`, after `const PORT_GAP_X = 22;` add:

```js
// Width units of a string for card sizing. The card formulas were tuned for
// Latin text at 5.9–7px per character; a CJK glyph is about 1.9 times that.
// Pure ASCII returns `.length`, so every English board keeps its geometry.
const WIDE = /[　-〿぀-ヿ㐀-䶿一-鿿가-힯＀-￯]/u;
export function textUnits(s) {
  let n = 0;
  for (const ch of String(s ?? '')) n += WIDE.test(ch) ? 1.9 : 1;
  return n;
}
```

In `shapeSize`, replace `const L = label.length;` with `const L = textUnits(label);`.

In `nodeSize`, replace
```js
    String(node.label ?? '').length * 6.8 + 24,
    ...meta.map((m) => m.text.length * 5.9 + 26),
```
with
```js
    textUnits(node.label) * 6.8 + 24,
    ...meta.map((m) => textUnits(m.text) * 5.9 + 26),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all green, including `tests/examples.test.js` zone containment (English geometry unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/geometry.js tests/geometry.test.js
git commit -m "geometry: size cards by text units so CJK labels fit"
```

---

### Task 3: Static markup walker, the toolbar switch, and main wiring

**Files:**
- Create: `src/ui/i18n-dom.js`
- Modify: `index.html:85` (Examples button), `index.html:102-107` (hint bar), `index.html:88` (add `#btn-lang` after `#btn-bom`)
- Modify: `src/main.js:1-20` (imports), `src/main.js:195-206` (wiring)
- Modify: `src/i18n/zh.js` (every static string in `index.html`)
- Test: `tests/e2e/smoke.mjs` (three checks)

**Interfaces:**
- Consumes: `tr`, `getLang`, `setLang`, `onLanguageChange`, `initI18n` from Task 1.
- Produces: `translateStatic(root = document)` and `initLanguageSwitch(button)` from `src/ui/i18n-dom.js`. Task 7 (part editor) calls `translateStatic(dialog)`.

- [ ] **Step 1: Rewrite the static markup so keys are clean phrases**

In `index.html` replace line 85:

```html
        <button id="btn-examples" title="Load an example board">Examples &#9662;</button>
```
with
```html
        <button id="btn-examples" title="Load an example board">Examples <span aria-hidden="true">&#9662;</span></button>
```

Directly after the `#btn-bom` line (line 88) add the switch:

```html
        <button id="btn-lang" data-i18n="off" title="Switch language" aria-label="Switch language">中文</button>
```

Replace the hint bar (lines 102–107) with one span per phrase:

```html
      <div id="hintbar" aria-hidden="true">
        <kbd>V</kbd> <span>select</span> &middot; <kbd>C</kbd> <span>wire</span> &middot; <kbd>Z</kbd> <span>zone</span> &middot; <kbd>L</kbd> <span>lane</span>
        &middot; <kbd>N</kbd> <span>note</span> &middot; <kbd>H</kbd> <span>pan</span> &middot; <kbd>F</kbd> <span>fit</span> &middot; <kbd>B</kbd> <span>palette</span> &middot; <kbd>P</kbd> <span>panels</span> &middot; <kbd>A</kbd> <span>assistant</span>
        &middot; <span>drag ports to link</span> &middot; <span>double-click rename</span>
        &middot; <kbd>Del</kbd> <span>delete</span> &middot; <kbd>Space</kbd><span>+drag pan</span>
      </div>
```

- [ ] **Step 2: Write the walker and the switch**

Create `src/ui/i18n-dom.js`:

```js
// Translates the static markup in place. Each text node's and attribute's
// original English is remembered on first visit, so switching back and
// forth is lossless. Only the listed roots are visited: the self-rendering
// panels (props, journey, assistant, legend, examples menu, toast, palette
// body) redraw themselves through onLanguageChange.
import { trd, getLang, setLang, onLanguageChange } from '../i18n.js';

const ROOTS = ['#toolbar', '#palette-search', '#hintbar', '#present-nav', 'dialog'];
const ATTRS = ['title', 'placeholder', 'aria-label'];
const LETTER = /[A-Za-z]/;
const originals = new WeakMap(); // node -> { text } | { attrs: { name: original } }

function translateText(node) {
  const raw = node.nodeValue;
  const trimmed = raw.trim();
  if (!LETTER.test(trimmed)) return;
  let rec = originals.get(node);
  if (!rec) {
    rec = { text: trimmed };
    originals.set(node, rec);
  }
  const lead = raw.slice(0, raw.indexOf(trimmed));
  const tail = raw.slice(raw.indexOf(trimmed) + trimmed.length);
  node.nodeValue = lead + trd(rec.text) + tail;
}

function translateAttrs(el) {
  let rec = originals.get(el);
  if (!rec) {
    rec = { attrs: {} };
    for (const a of ATTRS) if (el.hasAttribute(a) && LETTER.test(el.getAttribute(a))) rec.attrs[a] = el.getAttribute(a);
    originals.set(el, rec);
  }
  for (const [a, original] of Object.entries(rec.attrs)) el.setAttribute(a, trd(original));
}

function walk(el, textOff) {
  if (el.nodeType !== 1) return;
  translateAttrs(el);
  const off = textOff || el.getAttribute('data-i18n') === 'off';
  for (const child of [...el.childNodes]) {
    if (child.nodeType === 3) {
      if (!off) translateText(child);
    } else if (child.nodeType === 1 && !['INPUT', 'TEXTAREA', 'SCRIPT', 'STYLE', 'SVG', 'svg', 'KBD', 'CODE'].includes(child.tagName)) {
      walk(child, off);
    } else if (child.nodeType === 1) {
      translateAttrs(child); // inputs keep their value but translate placeholder/title/aria-label
    }
  }
}

export function translateStatic(root = document) {
  for (const sel of ROOTS) {
    for (const el of root.querySelectorAll(sel)) walk(el, false);
  }
  if (root !== document && root.nodeType === 1) walk(root, false);
}

// The toolbar switch shows the language it would switch to.
export function initLanguageSwitch(button) {
  const paint = () => { button.textContent = getLang() === 'zh' ? 'EN' : '中文'; };
  button.addEventListener('click', () => setLang(getLang() === 'zh' ? 'en' : 'zh'));
  onLanguageChange(() => { translateStatic(); paint(); });
  paint();
}
```

- [ ] **Step 3: Wire it in `src/main.js`**

Add the imports next to the other `./ui/` imports:

```js
import { initI18n } from './i18n.js';
import { onLanguageChange } from './i18n.js';
import { translateStatic, initLanguageSwitch } from './ui/i18n-dom.js';
```

Immediately after `const svg = document.getElementById('canvas');` (line 21) add:

```js
// Bind the language before anything renders; storage may be blocked.
let langStorage = null;
try { langStorage = window.localStorage; } catch { langStorage = null; }
initI18n({ storage: langStorage });
translateStatic();
```

After `initAssistant({ store, tools, render, svg, library });` (line 204) add:

```js
initLanguageSwitch(document.getElementById('btn-lang'));
// Flag tooltips are drawn into the SVG, so the canvas redraws on a switch.
onLanguageChange(() => render());
```

- [ ] **Step 4: Add every static string of `index.html` to the dictionary**

Append to `src/i18n/zh.js` inside the object:

```js
  // ---- index.html: toolbar ----
  'Board title': '板图标题',
  'Tools': '工具',
  'Select / move (V)': '选择 / 移动 (V)',
  'Draw wire (C)': '绘制连线 (C)',
  'Draw zone (Z)': '绘制区域 (Z)',
  'Draw swimlane (L)': '绘制泳道 (L)',
  'Add note (N)': '添加便签 (N)',
  'Pan (H, or hold Space)': '平移 (H，或按住空格)',
  'Undo (Ctrl/Cmd-Z)': '撤销 (Ctrl/Cmd-Z)',
  'Redo (Ctrl/Cmd-Shift-Z)': '重做 (Ctrl/Cmd-Shift-Z)',
  'Zoom out': '缩小',
  'Reset zoom': '重置缩放',
  'Zoom in': '放大',
  'Fit diagram (F)': '适应视图 (F)',
  'Toggle fullscreen': '切换全屏',
  'Grid dots': '网格点',
  'Snap to grid + swimlane lanes': '吸附到网格和泳道',
  'Signal-flow animation': '信号流动画',
  'Bus legend': '总线图例',
  'Journey steps + presenting': '导览步骤与演示',
  'Assistant (A)': '助手 (A)',
  'Hide the parts palette (B)': '隐藏部件面板 (B)',
  'Hide the right panels (P)': '隐藏右侧面板 (P)',
  'Record the canvas': '录制画布',
  'Rec': '录制',
  'Export PNG, SVG, PDF, or a seamless loop GIF': '导出 PNG、SVG、PDF 或无缝循环 GIF',
  'Export': '导出',
  'Save — download .schematica.json': '保存 — 下载 .schematica.json',
  'Open a .schematica.json file': '打开 .schematica.json 文件',
  'Load an example board': '加载示例板图',
  'Examples': '示例',
  'Run design rule checks': '运行设计规则检查',
  'Bill of materials': '物料清单',
  'Switch language': '切换语言',
  'Copy a share link': '复制分享链接',
  'New — clear the board': '新建 — 清空板图',
  'Delete selection (Del)': '删除所选 (Del)',
  // ---- index.html: palette search, hint bar, present ----
  'Search parts, buses, vendors': '搜索部件、总线、厂商',
  'Search parts': '搜索部件',
  'select': '选择',
  'wire': '连线',
  'zone': '区域',
  'lane': '泳道',
  'note': '便签',
  'pan': '平移',
  'fit': '适应',
  'palette': '部件面板',
  'panels': '面板',
  'assistant': '助手',
  'drag ports to link': '拖动端口连线',
  'double-click rename': '双击重命名',
  'delete': '删除',
  '+drag pan': '+拖动平移',
  'Previous (Left arrow)': '上一步（左方向键）',
  'Next (Right arrow)': '下一步（右方向键）',
  'Exit (Esc)': '退出 (Esc)',
  // ---- index.html: part editor dialog ----
  'New part': '新建部件',
  'Name': '名称',
  'Category': '类别',
  'Accent': '强调色',
  'Icon': '图标',
  'Built-in': '内置',
  'Initials': '首字母',
  'SVG path': 'SVG 路径',
  'e.g. MD': '例如 MD',
  'A 16-unit path, e.g. M4 4h8v8H4z': '16 单位路径，例如 M4 4h8v8H4z',
  'Ports': '端口',
  '+ Add port': '+ 添加端口',
  'Fields': '字段',
  '+ Add field': '+ 添加字段',
  'Preview': '预览',
  'Card preview': '卡片预览',
  'Save to library': '保存到库',
  // ---- index.html: record dialog ----
  'Record diagram': '录制图表',
  'Captures the canvas live while you present — pan, zoom, select, connect. Journey captions are included.': '演示时实时捕获画布 — 平移、缩放、选择、连线。包含导览字幕。',
  'Format': '格式',
  'Audio': '音频',
  'No audio': '无音频',
  'Microphone narration': '麦克风旁白',
  'Music file': '音乐文件',
  'Start recording': '开始录制',
  // ---- index.html: export dialog ----
  'Export image': '导出图像',
  'Cropped to the diagram plus a margin. PNG renders at the pixel size below.': '裁剪到图表加边距。PNG 按下方像素尺寸渲染。',
  'Width': '宽度',
  'Height': '高度',
  'px': 'px',
  'Lock aspect ratio': '锁定宽高比',
  'Transparent background': '透明背景',
  '(PNG/SVG only)': '（仅 PNG/SVG）',
  'A seamless 6-second loop of the flow animations': '流动画的无缝 6 秒循环',
  'Loop GIF': '循环 GIF',
  // ---- index.html: DRC and BOM dialogs ----
  'Design rule check': '设计规则检查',
  'I2C address conflicts, unconnected power pins, floating parts, bus mismatches, and lifecycle risks.': 'I2C 地址冲突、未连接的电源引脚、悬空部件、总线不匹配以及生命周期风险。',
  'Grouped by part number. Quantities, references, addresses, rails, status, and flags come straight from the board.': '按型号分组。数量、位号、地址、电压轨、状态和标记直接来自板图。',
  'Download CSV': '下载 CSV',
  'Copy Markdown': '复制 Markdown',
```

- [ ] **Step 5: Add the browser checks**

In `tests/e2e/smoke.mjs`, directly after the `check('Escape closes the Examples menu', ...)` line (around line 755), add:

```js
  // ---- Interface language: the switch translates, persists, and reverts ----
  await js(`document.getElementById('btn-lang').click(); true`);
  await sleep(100);
  const zh = await js(`(() => ({ lang: document.documentElement.lang, examples: document.getElementById('btn-examples').textContent.trim(), btn: document.getElementById('btn-lang').textContent, search: document.getElementById('palette-search').placeholder, hint: document.querySelector('#hintbar span').textContent, stored: localStorage.getItem('schematica.lang') }))()`);
  check('the language switch turns the toolbar Chinese and remembers it', zh.lang === 'zh-CN' && zh.examples.startsWith('示例') && zh.btn === 'EN' && zh.search === '搜索部件、总线、厂商' && zh.hint === '选择' && zh.stored === 'zh', JSON.stringify(zh));
  await send('Page.reload', { ignoreCache: true });
  await waitFor(`document.readyState === 'complete' && !!document.getElementById('btn-lang')`);
  await sleep(300);
  const afterReload = await js(`(() => ({ lang: document.documentElement.lang, examples: document.getElementById('btn-examples').textContent.trim() }))()`);
  check('Chinese survives a reload', afterReload.lang === 'zh-CN' && afterReload.examples.startsWith('示例'), JSON.stringify(afterReload));
  await js(`document.getElementById('btn-lang').click(); true`);
  await sleep(100);
  const en = await js(`(() => ({ lang: document.documentElement.lang, examples: document.getElementById('btn-examples').textContent.trim(), btn: document.getElementById('btn-lang').textContent, stored: localStorage.getItem('schematica.lang') }))()`);
  check('the switch goes back to English and stores en', en.lang === 'en' && en.examples.startsWith('Examples') && en.btn === '中文' && en.stored === 'en', JSON.stringify(en));
```

`waitFor` already exists in `tests/e2e/documents.mjs`; if `smoke.mjs` does not export or define one, add next to `sleep`:

```js
const waitFor = async (expr, tries = 60) => {
  for (let i = 0; i < tries; i++) {
    if (await js(expr).catch(() => false)) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${expr}`);
};
```

Update the two assertions that count checks if any exist (none do today; the runner prints `N/N checks passed`).

- [ ] **Step 6: Run the unit tests and the browser suite**

Run: `npm test && npm run e2e`
Expected: unit tests green; e2e prints `145/145 checks passed` with `no console errors or exceptions`. The Examples-menu check that reads `Examples &#9662;` still passes because it inspects the menu, not the button text.

- [ ] **Step 7: Commit**

```bash
git add index.html src/ui/i18n-dom.js src/main.js src/i18n/zh.js tests/e2e/smoke.mjs
git commit -m "i18n: translate the static markup in place and add the toolbar switch"
```

---

### Task 4: Dialogs, examples menu, legend, bus popover, BOM export, main toasts

**Files:**
- Modify: `src/ui/dialogs.js` (lines 21, 63, 75, 86, 117, 119, 131–200, 208, 210, 224)
- Modify: `src/ui/examples-menu.js:22-31`
- Modify: `src/ui/legend.js`
- Modify: `src/tools.js:564-570`
- Modify: `src/main.js:150, 189, 227-233`
- Modify: `src/bom.js:47-62`
- Modify: `src/i18n/zh.js`
- Test: `tests/bom.test.js` (existing assertions stay green in English)

**Interfaces:**
- Consumes: `tr`, `onLanguageChange` (Task 1).
- Produces: `renderBOM()`/`renderDRC()` inside `initDialogs`; `EXAMPLE_GROUPS` headings through `trd`. Data-table values (`trd(part.name)`, `trd(BUSES[b].name)`) use `trd` from Task 1; the coverage test (Task 12) requires `tr(` to take a literal and ignores `trd(`.

- [ ] **Step 1: Confirm the data lookup exists**

`trd` and its test shipped in Task 1; `node --test tests/i18n.test.js` is green before this task starts.

- [ ] **Step 2: Dialogs**

In `src/ui/dialogs.js` add `import { tr, onLanguageChange } from '../i18n.js';` and make these replacements:

| Line | Before | After |
|---|---|---|
| 21 | `confirm('Clear the board? Anything not saved to a file is lost.')` | `confirm(tr('Clear the board? Anything not saved to a file is lost.'))` |
| 63 | `toast('PNG export failed in this browser. The SVG export still works.')` | `toast(tr('PNG export failed in this browser. The SVG export still works.'))` |
| 75 | `toast('PDF export failed in this browser. PNG and SVG still work.')` | `toast(tr('PDF export failed in this browser. PNG and SVG still work.'))` |
| 86 | `toast('Rendering the seamless loop GIF…')` | `toast(tr('Rendering the seamless loop GIF…'))` |
| 117 | `toast('Seamless loop GIF saved.')` | `toast(tr('Seamless loop GIF saved.'))` |
| 119 | `toast('Loop GIF export failed in this browser.')` | `toast(tr('Loop GIF export failed in this browser.'))` |
| 155 | `toast('Markdown table copied to clipboard.')` | `toast(tr('Markdown table copied to clipboard.'))` |
| 156 | `toast('Could not access the clipboard - use Download CSV instead.')` | `toast(tr('Could not access the clipboard - use Download CSV instead.'))` |
| 208 | `` toast(`Share link copied to clipboard (${url.length.toLocaleString()} characters).`) `` | `toast(tr('Share link copied to clipboard ({n} characters).', { n: url.length.toLocaleString() }))` |
| 210 | `toast('Could not copy the share link - your browser blocked clipboard access.')` | `toast(tr('Could not copy the share link - your browser blocked clipboard access.'))` |
| 224 | `` toast(`Opened with warnings:\n\n${warnings.join('\n')}`) `` | `toast(tr('Opened with warnings:\n\n{list}', { list: warnings.join('\n') }))` |

Replace the BOM click handler body (lines 133–147) with a named builder and keep the click wiring:

```js
  function renderBOM() {
    const bomRows = buildBOM(store.doc);
    const body = bomRows.map((r) => (
      `<tr><td>${esc(r.part)}</td><td>${esc(r.sublabel)}</td><td>${r.qty}</td>`
      + `<td class="wrap">${esc(r.refs.join(', '))}</td><td>${esc(r.addrs.join(', '))}</td>`
      + `<td>${esc(r.rails.join(', '))}</td><td>${esc(r.statuses.join(', '))}</td>`
      + `<td>${esc(r.flags.join(', '))}</td><td class="wrap">${esc(r.notes.join('; '))}</td></tr>`
    )).join('');
    const head = [tr('Part'), tr('Part number'), tr('Qty'), tr('Refs'), tr('Addresses'), tr('Rails'), tr('Status'), tr('Flags'), tr('Notes')]
      .map((h) => `<th>${esc(h)}</th>`).join('');
    document.getElementById('bom-table').innerHTML = bomRows.length
      ? `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
      : `<p style="padding:12px">${esc(tr('The board is empty - add some parts first.'))}</p>`;
  }
  document.getElementById('btn-bom').addEventListener('click', () => {
    renderBOM();
    openModal(bomDialog);
  });
```

Replace the DRC click handler body (lines 168–193) the same way:

```js
  const levelLabel = (level) => (level === 'error' ? tr('ERROR') : tr('WARNING'));
  function renderDRC() {
    const findings = checkDoc(store.doc);
    const list = document.getElementById('drc-list');
    if (!findings.length) {
      list.innerHTML = `<p class="drc-clean">${esc(tr('No issues found - the board passes every check.'))}</p>`;
      return;
    }
    list.innerHTML = findings.map((f, i) => (
      `<div class="drc-row"><span class="drc-level ${f.level}">${esc(levelLabel(f.level))}</span>`
      + `<span class="msg">${esc(f.message)}</span>`
      + `<button data-drc="${i}">${esc(tr('Select'))}</button><button data-drc-fix="${i}">${esc(tr('Fix'))}</button></div>`
    )).join('');
    list.querySelectorAll('[data-drc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.setSelection(findings[Number(btn.dataset.drc)].ids);
        drcDialog.close();
      });
    });
    // Fix hands the finding to the assistant panel, which owns the request.
    list.querySelectorAll('[data-drc-fix]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const finding = findings[Number(btn.dataset.drcFix)];
        drcDialog.close();
        document.dispatchEvent(new CustomEvent('schematica:fix-finding', { detail: finding }));
      });
    });
  }
  document.getElementById('btn-check').addEventListener('click', () => {
    renderDRC();
    openModal(drcDialog);
  });
```

After the DRC `pointerdown` listener (the end of the DRC section, before `// ---- Share link ----`) add:

```js
  onLanguageChange(() => {
    if (bomDialog.open) renderBOM();
    if (drcDialog.open) renderDRC();
  });
```

(`checkDoc` messages become Chinese in Task 10; this hook already re-renders them.)

- [ ] **Step 3: Examples menu group headings**

In `src/ui/examples-menu.js` add `import { tr } from '../i18n.js';` and change the heading render (line 22) from `escAttr(group)` to `escAttr(trd(group))` (a data value, so `trd`; add `trd` to the import). `EXAMPLE_GROUPS` stays `['Embedded', 'Vehicle', 'Security']` (the `group` field on each example is data; the coverage test picks the three headings up from `EXAMPLE_GROUPS`, see Task 12). The confirm on line 28 becomes:

```js
        if (!confirm(tr('Load "{name}"? Anything not saved to a file is lost.', { name: ex.name }))) return;
```

and line 31 becomes `if (warnings.length) toast(tr('Example loaded with warnings:\n\n{list}', { list: warnings.join('\n') }));`. Example names stay English in phase 1.

- [ ] **Step 4: Legend and bus popover**

Replace `src/ui/legend.js` with:

```js
// The bus legend: a floating list of bus codes and names. The chip on a
// wire's pill names the bus by code, so the legend maps codes to names.
import { BUSES, BUS_ORDER } from '../buses.js';
import { tr, trd, onLanguageChange } from '../i18n.js';
import { escAttr as esc } from './press.js';

export function initLegend() {
  const legend = document.getElementById('legend');
  function renderLegend() {
    legend.innerHTML = `<h3>${esc(tr('Buses'))}</h3>` + BUS_ORDER.map((id) => {
      const b = BUSES[id];
      return `<div class="legend-row"><span class="bus-chip">${esc(b.short)}</span><span>${esc(trd(b.name))}</span></div>`;
    }).join('');
  }
  renderLegend();
  document.getElementById('btn-legend').addEventListener('click', (e) => {
    legend.hidden = !legend.hidden;
    e.currentTarget.classList.toggle('active', !legend.hidden);
  });
  onLanguageChange(renderLegend);
}
```

Keep whatever the current file does in its click handler if it differs from the above (read it first; only the render moves into `renderLegend`).

In `src/tools.js` add `import { trd } from './i18n.js';` and on line 569 change `${esc(b.name)}` to `${esc(trd(b.name))}`. The popover is rebuilt on every open, so no hook.

- [ ] **Step 5: BOM exports and main toasts**

In `src/bom.js` add `import { tr } from './i18n.js';` and replace the two header literals:

```js
const headers = () => [tr('Part'), tr('Part number'), tr('Qty'), tr('Refs'), tr('Addresses'), tr('Rails'), tr('Status'), tr('Flags'), tr('Notes')];
```

`bomCSV` line 48 becomes `const lines = [headers().map(csvCell).join(',')];` (keep whatever variable name the file uses for the header line) and `bomMarkdown` line 61 becomes `` `| ${headers().join(' | ')} |` ``. `tests/bom.test.js` asserts the English header text and stays green because the default language is English.

In `src/main.js` add `import { tr } from './i18n.js';` and change:

| Line | After |
|---|---|
| 150 | `toast(tr('Autosave failed: this browser\'s storage is full or blocked. Save the board to a file to keep it.'))` |
| 189 | `doc.title = titleInput.value.trim() \|\| tr('Untitled Board');` |
| 227 | `const notes = warnings.length ? tr('\n\nLoaded with warnings:\n{list}', { list: warnings.join('\n') }) : '';` |
| 229–230 | `toast(tr('Loaded the shared board "{title}". Your previous board is kept as a backup.{notes}', { title: doc.title, notes }), { action: { label: tr('Restore my board'), run: () => store.replaceDoc(prev) } });` |
| 233 | `toast(tr('Shared board loaded with warnings:\n\n{list}', { list: warnings.join('\n') }));` |

- [ ] **Step 6: Dictionary entries for this task**

Append to `src/i18n/zh.js`:

```js
  // ---- dialogs, menu, legend, BOM, main ----
  'Clear the board? Anything not saved to a file is lost.': '清空板图？未保存到文件的内容将丢失。',
  'PNG export failed in this browser. The SVG export still works.': '此浏览器无法导出 PNG。SVG 导出仍可用。',
  'PDF export failed in this browser. PNG and SVG still work.': '此浏览器无法导出 PDF。PNG 和 SVG 仍可用。',
  'Rendering the seamless loop GIF…': '正在渲染无缝循环 GIF…',
  'Seamless loop GIF saved.': '无缝循环 GIF 已保存。',
  'Loop GIF export failed in this browser.': '此浏览器无法导出循环 GIF。',
  'Markdown table copied to clipboard.': 'Markdown 表格已复制到剪贴板。',
  'Could not access the clipboard - use Download CSV instead.': '无法访问剪贴板 — 请改用“下载 CSV”。',
  'Share link copied to clipboard ({n} characters).': '分享链接已复制到剪贴板（{n} 个字符）。',
  'Could not copy the share link - your browser blocked clipboard access.': '无法复制分享链接 — 浏览器阻止了剪贴板访问。',
  'Opened with warnings:\n\n{list}': '打开时有警告：\n\n{list}',
  'Part': '部件',
  'Part number': '型号',
  'Qty': '数量',
  'Refs': '位号',
  'Addresses': '地址',
  'Rails': '电压轨',
  'Status': '状态',
  'Flags': '标记',
  'Notes': '备注',
  'The board is empty - add some parts first.': '板图为空 — 请先添加部件。',
  'ERROR': '错误',
  'WARNING': '警告',
  'No issues found - the board passes every check.': '未发现问题 — 板图通过了所有检查。',
  'Select': '选中',
  'Fix': '修复',
  'Load "{name}"? Anything not saved to a file is lost.': '加载“{name}”？未保存到文件的内容将丢失。',
  'Example loaded with warnings:\n\n{list}': '示例加载时有警告：\n\n{list}',
  'Embedded': '嵌入式',
  'Vehicle': '车辆',
  'Security': '安全',
  'Buses': '总线',
  'Autosave failed: this browser\'s storage is full or blocked. Save the board to a file to keep it.': '自动保存失败：浏览器存储已满或被阻止。请将板图保存为文件。',
  'Untitled Board': '未命名板图',
  '\n\nLoaded with warnings:\n{list}': '\n\n加载时有警告：\n{list}',
  'Loaded the shared board "{title}". Your previous board is kept as a backup.{notes}': '已加载分享的板图“{title}”。您之前的板图已作为备份保留。{notes}',
  'Restore my board': '恢复我的板图',
  'Shared board loaded with warnings:\n\n{list}': '分享的板图加载时有警告：\n\n{list}',
  // ---- buses (BUSES[x].name; codes stay) ----
  'Power': '电源',
  'Ground': '地',
  'I2C': 'I2C',
  'SPI': 'SPI',
  'UART': 'UART',
  'CAN': 'CAN',
  'USB': 'USB',
  'Ethernet': '以太网',
  'GPIO': 'GPIO',
  'PWM': 'PWM',
  'ADC / analog': 'ADC / 模拟',
  'RF': '射频',
  'MIPI CSI-2': 'MIPI CSI-2',
  'GMSL / FPD-Link': 'GMSL / FPD-Link',
  'CAN FD': 'CAN FD',
  'Automotive Ethernet (T1)': '车载以太网 (T1)',
  'RS-485 / serial servo': 'RS-485 / 串行舵机',
  'Flow': '流程',
  'Link / relationship': '链接 / 关系',
```

- [ ] **Step 7: Run the tests and commit**

Run: `npm test`
Expected: green (English output unchanged).

```bash
git add src/ui/dialogs.js src/ui/examples-menu.js src/ui/legend.js src/tools.js src/main.js src/bom.js src/i18n/zh.js
git commit -m "i18n: dialogs, examples menu, legend, bus popover, BOM headers, and main toasts"
```

---

### Task 5: Palette and bilingual search

**Files:**
- Modify: `src/ui/palette-ui.js` (lines 24, 34–39, 61–62, 68, 103, 122, 166, 134, 174–199)
- Modify: `src/search.js`
- Modify: `src/state.js:169` (default label)
- Modify: `src/i18n/zh.js`
- Test: `tests/search.test.js`, `tests/state.test.js`

**Interfaces:**
- Consumes: `tr`, `trd`, `onLanguageChange`.
- Produces: `partHaystack` includes translated names; `addNode` default label is `trd(...)`.

- [ ] **Step 1: Write the failing search and default-label tests**

Append to `tests/search.test.js`:

```js
import { initI18n, setLang } from '../src/i18n.js';

test('Chinese queries match translated part, category and bus names while English still matches', () => {
  initI18n({ storage: null });
  setLang('zh');
  try {
    assert.ok(filterParts('微控制器').has('mcu'), 'part name');
    assert.ok(filterParts('计算').has('mcu'), 'category name');
    assert.ok(filterParts('以太网').has('ethphy'), 'bus name');
    assert.ok(filterParts('mcu').has('mcu'), 'English kind still matches');
    assert.ok(filterParts('temp sensor').has('temp'), 'English name still matches');
  } finally {
    setLang('en');
  }
});
```

Append to `tests/state.test.js` (use the file's existing `Store` import and helpers):

```js
import { initI18n, setLang } from '../src/i18n.js';

test('a part placed in Chinese gets a Chinese default label; in English the English name', () => {
  initI18n({ storage: null });
  const store = new Store(newDoc());
  const en = addNode(store, 'mcu', 0, 0);
  assert.equal(store.doc.nodes.find((n) => n.id === en).label, 'MCU');
  setLang('zh');
  try {
    const cn = addNode(store, 'mcu', 0, 0);
    assert.equal(store.doc.nodes.find((n) => n.id === cn).label, '微控制器');
    const start = addNode(store, 'startend', 0, 0);
    assert.equal(store.doc.nodes.find((n) => n.id === start).label, '开始');
  } finally {
    setLang('en');
  }
});
```

Run: `node --test tests/search.test.js tests/state.test.js` → the new tests FAIL (Chinese queries find nothing; label is `MCU`).

- [ ] **Step 2: Search haystack and default label**

In `src/search.js` add `import { trd } from './i18n.js';` and extend `partHaystack`:

```js
export function partHaystack(part) {
  const category = CATEGORY_NAME[part.category] || part.category;
  const bits = [
    part.name, trd(part.name), part.kind, category, trd(category),
    ...part.ports.flatMap((p) => [p.name, BUSES[p.bus]?.name, BUSES[p.bus] && trd(BUSES[p.bus].name), BUSES[p.bus]?.short]),
    ...presetsFor(part.kind).flatMap((p) => [p.name, p.sublabel, p.notes, trd(p.notes)]),
  ];
  return bits.filter(Boolean).join(' ').toLowerCase();
}
```

In `templateHaystack` add `trd(category)` and `trd(BUSES[p.bus].name)` the same way (custom templates have English category ids; their names are the user's).

In `src/state.js` add `import { trd } from './i18n.js';` and change line 169 to `label: trd(spec.defaultLabel || spec.name), sublabel: '', color: null,`.

- [ ] **Step 3: Palette strings and the redraw hook**

In `src/ui/palette-ui.js` add `import { tr, trd, onLanguageChange } from '../i18n.js';`.

Line 24: `label: getPart(kind).defaultLabel || getPart(kind).name` → `label: trd(getPart(kind).defaultLabel || getPart(kind).name)`.

Replace the header build (lines 34–39) with a function so it can re-run:

```js
  const headerMarkup = () => `<h3 class="my-parts-head"><span>${escAttr(tr('My parts'))}</span><span class="my-parts-tools">`
    + `<button id="parts-new" type="button" title="${escAttr(tr('Define a new part'))}">${escAttr(tr('+ New'))}</button>`
    + `<button id="parts-export" type="button" title="${escAttr(tr('Download My parts as a file'))}">${escAttr(tr('Export'))}</button>`
    + `<button id="parts-import" type="button" title="${escAttr(tr('Import a parts file'))}">${escAttr(tr('Import'))}</button></span></h3>`
    + '<div class="cat-grid" id="my-parts"></div>'
    + `<h3 id="board-parts-head" class="sub" hidden>${escAttr(tr('On this board'))}</h3><div class="cat-grid" id="board-parts" hidden></div>`;
  mine.innerHTML = headerMarkup();
```

Because the three header buttons carry click listeners bound after this line, the hook must not rebuild the header; it relabels in place:

```js
  function relabelHeader() {
    mine.querySelector('.my-parts-head > span').textContent = tr('My parts');
    const b = (id, text, title) => { const el = mine.querySelector(`#${id}`); el.textContent = text; el.title = title; };
    b('parts-new', tr('+ New'), tr('Define a new part'));
    b('parts-export', tr('Export'), tr('Download My parts as a file'));
    b('parts-import', tr('Import'), tr('Import a parts file'));
    mine.querySelector('#board-parts-head').textContent = tr('On this board');
  }
```

Lines 61–62 (template tile): `title="Edit part"` → `title="${escAttr(tr('Edit part'))}"`, `title="Remove from My parts"` → `title="${escAttr(tr('Remove from My parts'))}"`.
Line 68: `` toast(`Removed ${gone.name} from My parts.`, { action: { label: 'Undo', ... } }) `` → `toast(tr('Removed {part} from My parts.', { part: gone.name }), { action: { label: tr('Undo'), run: () => library.save(gone, gone.id) } })`.
Line 103: `Add to library` → `${escAttr(tr('Add to library'))}`.
Line 122: `` toast(`${fresh.part.name} added to My parts.`) `` → `toast(tr('{part} added to My parts.', { part: fresh.part.name }))`.
Line 166 (import summary) becomes:

```js
      const n = res.added + res.replaced;
      let msg = n === 1
        ? tr('Imported {added} new and {replaced} updated part.', { added: res.added, replaced: res.replaced })
        : tr('Imported {added} new and {replaced} updated parts.', { added: res.added, replaced: res.replaced });
      const k = res.warnings.length;
      if (k) msg += ' ' + (k === 1 ? tr('{n} entry skipped or adjusted.', { n: k }) : tr('{n} entries skipped or adjusted.', { n: k }));
      toast(msg);
```

Catalogue (lines 176 and 192): `h.textContent = cat.name;` → `h.textContent = trd(cat.name);` and `escAttr(part.name)` → `escAttr(trd(part.name))`. Store the part on each item record: `group.items.push({ el: item, kind: part.kind, part });` and keep `group.cat = cat` on the group record.

After `library.subscribe(renderMine);` (line 134) add the hook. Because `groups` is declared later in the file (line 173), place the hook **after the catalogue loop** (after line 199):

```js
  onLanguageChange(() => {
    relabelHeader();
    for (const g of groups) {
      g.h.textContent = trd(g.cat.name);
      for (const it of g.items) it.el.querySelector('.pi-name').textContent = trd(it.part.name);
    }
    renderMine();
  });
```

- [ ] **Step 4: Dictionary entries for the palette**

Append to `src/i18n/zh.js`:

```js
  // ---- palette chrome ----
  'My parts': '我的部件',
  'Define a new part': '定义新部件',
  '+ New': '+ 新建',
  'Download My parts as a file': '将“我的部件”下载为文件',
  'Import a parts file': '导入部件文件',
  'Import': '导入',
  'On this board': '本板图中',
  'Edit part': '编辑部件',
  'Remove from My parts': '从“我的部件”移除',
  'Removed {part} from My parts.': '已从“我的部件”移除 {part}。',
  'Add to library': '加入库',
  'Imported {added} new and {replaced} updated part.': '已导入 {added} 个新部件，更新 {replaced} 个。',
  'Imported {added} new and {replaced} updated parts.': '已导入 {added} 个新部件，更新 {replaced} 个。',
  '{n} entry skipped or adjusted.': '{n} 个条目被跳过或调整。',
  '{n} entries skipped or adjusted.': '{n} 个条目被跳过或调整。',
  // ---- categories (CATEGORIES[x].name; 'Compute' is above) ----
  'Sensors': '传感器',
  'Actuators': '执行器',
  'Connectivity': '连接',
  'Robotics': '机器人',
  'Automotive': '汽车',
  'System & Cloud': '系统与云',
  'Network': '网络',
  'Security & Edge': '安全与边缘',
  'Process Flow': '流程',
  'Threats': '威胁',
  'Storage / Misc': '存储 / 其他',
  // ---- part names (PARTS[x].name) and default labels ----
  'MCU': '微控制器',
  'SoC / SBC': 'SoC / 单板机',
  'FPGA': 'FPGA',
  'DSP': 'DSP',
  'Temp sensor': '温度传感器',
  'IMU': '惯性测量单元',
  'GPS': 'GPS',
  'Camera': '摄像头',
  'Analog input': '模拟输入',
  'Sensor': '传感器',
  'Motor + driver': '电机 + 驱动',
  'Servo': '舵机',
  'Relay': '继电器',
  'LED': 'LED',
  'Display': '显示屏',
  'Buzzer': '蜂鸣器',
  'Battery': '电池',
  'Regulator': '稳压器',
  'Charger': '充电器',
  'Solar panel': '太阳能板',
  'Power jack': '电源插座',
  'WiFi / BLE': 'WiFi / 蓝牙',
  'LoRa': 'LoRa',
  'Cellular': '蜂窝网络',
  'Ethernet PHY': '以太网 PHY',
  'USB port': 'USB 接口',
  'CAN transceiver': 'CAN 收发器',
  'RF antenna': '射频天线',
  'Stepper + driver': '步进电机 + 驱动',
  'Encoder': '编码器',
  'LiDAR': '激光雷达',
  'Ultrasonic': '超声波',
  'ToF sensor': 'ToF 传感器',
  'Limit switch': '限位开关',
  'RDK software stage': 'RDK 软件阶段',
  'AI SBC / robot kit': 'AI 单板机 / 机器人套件',
  'MIPI camera': 'MIPI 摄像头',
  'Depth camera': '深度摄像头',
  'Serial servo': '串行舵机',
  'Motor controller': '电机控制器',
  'Vehicle battery': '车载蓄电池',
  'Fuse box': '保险丝盒',
  'OBD-II port': 'OBD-II 接口',
  'LIN transceiver': 'LIN 收发器',
  'H-bridge': 'H 桥',
  'Wheel speed': '轮速',
  'Automotive SoC': '车规 SoC',
  'ADAS controller': 'ADAS 控制器',
  'Front camera': '前视摄像头',
  'mmWave radar': '毫米波雷达',
  'T1 Ethernet switch': 'T1 以太网交换机',
  'Vehicle gateway': '车载网关',
  'Cloud / MQTT': '云 / MQTT',
  'Server': '服务器',
  'Database': '数据库',
  'Edge gateway': '边缘网关',
  'Mobile app': '移动应用',
  'Host PC': '主机电脑',
  'Internet': '互联网',
  'Access point': '接入点',
  'Router': '路由器',
  'Switch': '交换机',
  'ASN': 'ASN',
  'IP Address': 'IP 地址',
  'Firewall': '防火墙',
  'WAF': 'WAF',
  'Proxy Server': '代理服务器',
  'CDN': 'CDN',
  'Load Balancer': '负载均衡器',
  'API Gateway': 'API 网关',
  'Start / End': '开始 / 结束',
  'Start': '开始',
  'Process': '处理',
  'Decision': '判断',
  'Decision?': '判断？',
  'Data / I-O': '数据 / 输入输出',
  'Document': '文档',
  'Subprocess': '子流程',
  'Preparation': '准备',
  'Manual Input': '手动输入',
  'Delay': '延迟',
  'Connector': '连接符',
  'A': 'A',
  'Threat Actor': '威胁行为者',
  'Insider Threat': '内部威胁',
  'Malware': '恶意软件',
  'Ransomware': '勒索软件',
  'Botnet': '僵尸网络',
  'Phishing': '网络钓鱼',
  'C2 Server': 'C2 服务器',
  'Vulnerability': '漏洞',
  'Misconfiguration': '错误配置',
  'Exploit': '漏洞利用',
  'Supply-chain compromise': '供应链攻击',
  'DDoS flood': 'DDoS 洪泛',
  'On-path attacker': '路径中间攻击者',
  'Sensor spoofing': '传感器欺骗',
  'Stolen credentials': '凭证窃取',
  'Data exfiltration': '数据外泄',
  'Physical tampering': '物理篡改',
  'EEPROM / Flash': 'EEPROM / 闪存',
  'SD card': 'SD 卡',
  'RTC': '实时时钟',
  'Crystal': '晶振',
  'Debug header': '调试接口',
  'Generic IC': '通用 IC',
  'Pin header': '排针',
  'Test point': '测试点',
  'Fuse': '保险丝',
  'Custom box': '自定义框',
```

- [ ] **Step 5: Run and commit**

Run: `npm test` → green (the two new tests pass; `tests/palette.test.js` still sees English `defaultLabel` data).

```bash
git add src/ui/palette-ui.js src/search.js src/state.js src/i18n/zh.js tests/search.test.js tests/state.test.js
git commit -m "i18n: palette names and chrome, bilingual search, language-aware default labels"
```

---

### Task 6: Properties panel, RDK details, collapsible headers, layout toggles

**Files:**
- Modify: `src/ui/props.js` (lines 15–23, 37, 62–68, 71–72, 77–100, 107–139, 211, 218, 226, 249–250, 264–271, 278)
- Modify: `src/ui/rdk-details.js` (lines 9, 15, 29, 36, 42, 46)
- Modify: `src/ui/collapsible.js` (lines 27, 40)
- Modify: `src/ui/panels.js` (lines 6–37, 54)
- Modify: `src/presets.js:70-80` (`presetPatch` writes translated notes)
- Modify: `src/i18n/zh.js`
- Test: `tests/presets.test.js`

**Interfaces:**
- Consumes: `tr`, `trd`, `onLanguageChange`.
- Produces: `statusLabels()` and `flagLabels()` in `props.js` (functions, so they translate at call time). `panelHeader` and `bindCollapsible` translate their own titles.

- [ ] **Step 1: Failing test for preset notes**

Append to `tests/presets.test.js`:

```js
import { initI18n, setLang } from '../src/i18n.js';

test('picking a preset in Chinese fills Chinese notes; the sublabel is untouched', () => {
  initI18n({ storage: null });
  setLang('zh');
  try {
    const patch = presetPatch({ kind: 'lidar', rail: '', notes: '' }, 'RPLIDAR A1');
    assert.equal(patch.sublabel, 'RPLIDAR A1');
    assert.equal(patch.rail, '5V');
    assert.match(patch.notes, /[一-鿿]/, 'notes are Chinese');
  } finally {
    setLang('en');
  }
  assert.equal(presetPatch({ kind: 'lidar', rail: '', notes: '' }, 'RPLIDAR A1').notes, '2D 360-degree laser scanner, 12 m range, UART.');
});
```

Run: `node --test tests/presets.test.js` → FAIL (notes are English).

- [ ] **Step 2: Presets write translated notes**

In `src/presets.js` add `import { trd } from './i18n.js';` and change `if (!String(node.notes ?? '').trim() && hit.notes) patch.notes = hit.notes;` to `... patch.notes = trd(hit.notes);`. The `PRESETS` table itself is untouched.

- [ ] **Step 3: Properties panel**

In `src/ui/props.js` add `import { tr, trd, onLanguageChange } from '../i18n.js';`. Replace the two label maps (lines 15–23) with functions and update every use (`STATUS_LABELS[x]` → `statusLabels()[x]`, `FLAG_LABELS[x]` → `flagLabels()[x]`; grep the file for both names):

```js
const statusLabels = () => ({
  planned: tr('Planned'), prototype: tr('Prototype'), tested: tr('Tested'),
  production: tr('Production'), deprecated: tr('Deprecated'),
});
const flagLabels = () => ({
  bug: tr('Bug'), thermal: tr('Thermal'), power: tr('Power hungry'),
  lead: tr('Long lead'), safety: tr('Safety critical'), eol: tr('EOL part'),
});
```

Then wrap, in place, each literal the inventory found (the line numbers refer to the file before edits):

| Line | Before | After |
|---|---|---|
| 37 | `propField('Color', ...)` | `propField(tr('Color'), ...)` |
| 62 | `propField('Part number', ...)` | `propField(tr('Part number'), ...)` |
| 63 | `presets.length ? 'pick a preset or type' : 'e.g. STM32F405'` | `presets.length ? tr('pick a preset or type') : tr('e.g. STM32F405')` |
| 66 | `${escAttr(p.name)}` (datalist option label) | unchanged (vendor product names stay Latin) |
| 71 | `propField('Interface address', ... placeholder="e.g. 0x76, CAN ID 0x120" ...)` | `propField(tr('Interface address'), ... placeholder="${escAttr(tr('e.g. 0x76, CAN ID 0x120'))}" ...)` |
| 72 | `propField('Voltage rail', ... placeholder="e.g. 3.3V" ...)` | `propField(tr('Voltage rail'), ... placeholder="${escAttr(tr('e.g. 3.3V'))}" ...)` |
| 77 | `propField('Label', ...)` | `propField(tr('Label'), ...)` |
| 81 | `propField('Notes', ... placeholder="Free-form notes..." ...)` | `propField(tr('Notes'), ... placeholder="${escAttr(tr('Free-form notes...'))}" ...)` |
| 82 | `propField('Lifecycle', ...)` | `propField(tr('Lifecycle'), ...)` |
| 85 | `propField('Flags', ...)` | `propField(tr('Flags'), ...)` |
| 89 | `propField('Disposition', ...)` | `propField(tr('Disposition'), ...)` and each `d.name` → `trd(d.name)` |
| 93 | `propField('Accent color', ...)` | `propField(tr('Accent color'), ...)` |
| 95 | `title="Category color">Auto` | `title="${escAttr(tr('Category color'))}">${escAttr(tr('Auto'))}` |
| 97 | `Edit part&hellip;` | `${escAttr(tr('Edit part…'))}` |
| 98 | `Customize&hellip;` | `${escAttr(tr('Customize…'))}` |
| 100 | `Delete node` | `${escAttr(tr('Delete node'))}` |
| 106 | `BUSES[b].name` | `trd(BUSES[b].name)` |
| 107 | `propField('Bus type', ...)` | `propField(tr('Bus type'), ...)` |
| 108 | `propField('Label (blank = bus name)', ...)` | `propField(tr('Label (blank = bus name)'), ...)` |
| 109 | `['', 'None'], ['fwd', '&rarr; To'], ['both', '&harr; Both']` | `['', tr('None')], ['fwd', tr('→ To')], ['both', tr('↔ Both')]` (write the arrows as characters, not entities) |
| 110 | `propField('Arrowheads', ...)` | `propField(tr('Arrowheads'), ...)` |
| 114 | `'Solid'`, `'Dashed'`, `'Dotted'`, `'Sneakernet &middot; air gap &#x1F45F;'` | `tr('Solid')`, `tr('Dashed')`, `tr('Dotted')`, `tr('Sneakernet · air gap 👟')` |
| 116 | `propField('Line style', ...)` | `propField(tr('Line style'), ...)` |
| 119 | `'With Animate'`, `'Always'`, `'Never'` | `tr('With Animate')`, `tr('Always')`, `tr('Never')` |
| 120 | `propField('Traffic flow', ...)` | `propField(tr('Traffic flow'), ...)` |
| 123 | `Delete wire` | `${escAttr(tr('Delete wire'))}` |
| 128 | `propField('Title', ...)` | `propField(tr('Title'), ...)` |
| 129 | `'Horizontal lanes'`, `'Vertical lanes'` | `tr('Horizontal lanes')`, `tr('Vertical lanes')` |
| 130 | `propField('Orientation', ...)` | `propField(tr('Orientation'), ...)` |
| 133 | `propField('Lanes', ...)` | `propField(tr('Lanes'), ...)` |
| 135 | `title="Remove lane"` | `title="${escAttr(tr('Remove lane'))}"` |
| 137 | `+ Add lane` | `${escAttr(tr('+ Add lane'))}` |
| 139 | `Delete swimlane (keeps contents)` | `${escAttr(tr('Delete swimlane (keeps contents)'))}` |
| 211 | `` `Lane ${Number(input.dataset.lane) + 1}` `` | `tr('Lane {n}', { n: Number(input.dataset.lane) + 1 })` |
| 218 | `toast('A swimlane needs at least one lane.')` | `toast(tr('A swimlane needs at least one lane.'))` |
| 226 | `` `Lane ${(cur.lanes \|\| []).length + 1}` `` | `tr('Lane {n}', { n: (cur.lanes \|\| []).length + 1 })` |
| 249 | `` panelHeader(`${ids.length} items selected`, 'props') `` | `panelHeader(tr('{n} items selected', { n: ids.length }), 'props')` |
| 250 | `Delete selection` | `${escAttr(tr('Delete selection'))}` |
| 264 | `panelHeader(partOf(item).name, 'props')` | `panelHeader(trd(partOf(item).name), 'props')` |
| 265 | `panelHeader('Wire', 'props')` | `panelHeader(tr('Wire'), 'props')` |
| 266 | `panelHeader('Swimlane', 'props')` | `panelHeader(tr('Swimlane'), 'props')` |
| 268 | `panelHeader('Zone', 'props') + propField('Label', ...)` | `panelHeader(tr('Zone'), 'props') + propField(tr('Label'), ...)` |
| 271 | `panelHeader('Note', 'props') + propField('Text', ...)` | `panelHeader(tr('Note'), 'props') + propField(tr('Text'), ...)` |

Schema fields (lines 44–56) show `fd.label`, `fd.placeholder`, and option strings from `src/palette.js` threat schemas: wrap them as `trd(fd.label)`, `trd(fd.placeholder || '')`, and `trd(o)` per option label (option **values** stay as they are). Those schema strings join the data-table extraction in Task 12.

Before `return { render };` (line 278) add `onLanguageChange(() => render());`. The guard that skips a render while focus is in a field passes because clicking the toolbar switch moves focus out of the panel.

- [ ] **Step 4: RDK details, collapsible, panels**

`src/ui/rdk-details.js`: add `import { tr, trd } from '../i18n.js';` and change line 9 `Select a target board` → `${escAttr(tr('Select a target board'))}`; line 15 `` `Missing / non-RDK target: ${current}` `` → `tr('Missing / non-RDK target: {id}', { id: current })`; line 29 both `RDK reference` → `tr('RDK reference')` (escaped where it is an attribute); line 36 `${escAttr(f.level)}: ${escAttr(f.message)}` → `${escAttr(f.level === 'error' ? tr('error') : tr('warning'))}: ${escAttr(f.message)}`; line 42 `${escAttr(s.title)}${s.archived ? ' (archived)' : ''}` → `${escAttr(trd(s.title))}${s.archived ? escAttr(tr(' (archived)')) : ''}`; line 46 `Download setup guide` → `${escAttr(tr('Download setup guide'))}`.

`src/ui/collapsible.js`: add `import { tr } from '../i18n.js';`; lines 27 and 40 become `folded ? tr('Expand panel') : tr('Collapse panel')`.

`src/ui/panels.js`: add `import { tr, onLanguageChange } from '../i18n.js';`. Change `makeToggle` to take the titles as **functions** and resolve them inside `set`:

```js
function makeToggle({ key, storageKey, className, buttonId, hideTitle, showTitle }) {
  ...
  function set(on) {
    app.classList.toggle(className, on);
    btn.classList.toggle('active', !on);
    btn.title = on ? showTitle() : hideTitle();
    ...
```

and the two call sites pass `hideTitle: () => tr('Hide the parts palette (B)'), showTitle: () => tr('Show the parts palette (B)')` and `hideTitle: () => tr('Hide the right panels (P)'), showTitle: () => tr('Show the right panels (P)')`. Before `return { palette, panels };` add:

```js
  onLanguageChange(() => { palette.set(palette.hidden()); panels.set(panels.hidden()); });
```

- [ ] **Step 5: Dictionary entries for this task**

Append to `src/i18n/zh.js`:

```js
  // ---- properties panel ----
  'Planned': '计划中',
  'Prototype': '原型',
  'Tested': '已测试',
  'Production': '量产',
  'Deprecated': '已弃用',
  'Bug': '缺陷',
  'Thermal': '发热',
  'Power hungry': '高功耗',
  'Long lead': '交期长',
  'Safety critical': '安全关键',
  'EOL part': '停产部件',
  'Color': '颜色',
  'pick a preset or type': '选择预设或输入',
  'e.g. STM32F405': '例如 STM32F405',
  'Interface address': '接口地址',
  'e.g. 0x76, CAN ID 0x120': '例如 0x76、CAN ID 0x120',
  'Voltage rail': '电压轨',
  'e.g. 3.3V': '例如 3.3V',
  'Label': '标签',
  'Free-form notes...': '自由备注…',
  'Lifecycle': '生命周期',
  'Disposition': '立场',
  'Accent color': '强调色',
  'Category color': '类别颜色',
  'Auto': '自动',
  'Edit part…': '编辑部件…',
  'Customize…': '自定义…',
  'Delete node': '删除部件',
  'Bus type': '总线类型',
  'Label (blank = bus name)': '标签（留空 = 总线名）',
  'None': '无',
  '→ To': '→ 指向',
  '↔ Both': '↔ 双向',
  'Arrowheads': '箭头',
  'Solid': '实线',
  'Dashed': '虚线',
  'Dotted': '点线',
  'Sneakernet · air gap 👟': '人工传递 · 物理隔离 👟',
  'Line style': '线型',
  'With Animate': '随动画',
  'Always': '始终',
  'Never': '从不',
  'Traffic flow': '流量动画',
  'Delete wire': '删除连线',
  'Title': '标题',
  'Horizontal lanes': '水平泳道',
  'Vertical lanes': '垂直泳道',
  'Orientation': '方向',
  'Lanes': '泳道',
  'Remove lane': '移除泳道',
  '+ Add lane': '+ 添加泳道',
  'Delete swimlane (keeps contents)': '删除泳道（保留内容）',
  'Lane {n}': '泳道 {n}',
  'A swimlane needs at least one lane.': '泳道图至少需要一条泳道。',
  '{n} items selected': '已选中 {n} 项',
  'Delete selection': '删除所选',
  'Wire': '连线',
  'Swimlane': '泳道图',
  'Zone': '区域',
  'Note': '便签',
  'Text': '文本',
  // ---- dispositions (DISPOSITIONS[x].name) ----
  'Friendly': '友好',
  'Partner': '合作方',
  'Neutral': '中立',
  'Unknown': '未知',
  'Suspicious': '可疑',
  'Adversary': '对手',
  'Victim': '受害者',
  // ---- RDK details ----
  'Select a target board': '选择目标板',
  'Missing / non-RDK target: {id}': '缺失或非 RDK 目标：{id}',
  'RDK reference': 'RDK 参考',
  'error': '错误',
  'warning': '警告',
  ' (archived)': '（已归档）',
  'Download setup guide': '下载搭建指南',
  'Expand panel': '展开面板',
  'Collapse panel': '折叠面板',
  'Show the parts palette (B)': '显示部件面板 (B)',
  'Show the right panels (P)': '显示右侧面板 (P)',
  // ---- vendor preset notes (PRESETS[kind][i].notes) ----
  'Raspberry Pi 5: BCM2712; 2x MIPI CSI/DSI, GbE, USB 3, 40-pin header.': 'Raspberry Pi 5：BCM2712；2 路 MIPI CSI/DSI、千兆以太网、USB 3、40 针排针。',
  'NVIDIA Jetson Orin Nano: up to 40 TOPS; 2x MIPI CSI, GbE, USB 3, 40-pin header.': 'NVIDIA Jetson Orin Nano：最高 40 TOPS；2 路 MIPI CSI、千兆以太网、USB 3、40 针排针。',
  'Horizon Journey 6P: 560 TOPS (effective, 1/2 sparsity), 410K CPU DMIPS, BPU Nash; flagship for full-scenario assisted driving (Horizon SuperDrive). ASIL-B(D) compute, ASIL-D MCU.': '地平线征程 6P：560 TOPS（等效，1/2 稀疏）、410K CPU DMIPS、BPU Nash；全场景辅助驾驶旗舰（地平线 SuperDrive）。ASIL-B(D) 计算，ASIL-D MCU。',
  'Horizon Journey 6M: 80 TOPS (6E/M tier), 100K CPU DMIPS, BPU Nash; highway NOA and urban commute NOA, passive-cooled domain controllers.': '地平线征程 6M：80 TOPS（6E/M 档）、100K CPU DMIPS、BPU Nash；高速 NOA 与城区通勤 NOA，被动散热域控制器。',
  'Horizon Journey 6E: 80 TOPS (6E/M tier), 100K CPU DMIPS, BPU Nash; highway NOA and urban commute NOA with a lean sensor set.': '地平线征程 6E：80 TOPS（6E/M 档）、100K CPU DMIPS、BPU Nash；精简传感器配置下的高速 NOA 与城区通勤 NOA。',
  'Horizon Journey 6B: 10+ TOPS, 20K+ CPU DMIPS, BPU Nash; entry-level all-in-one ADAS active safety, driver monitoring, or parking (Horizon Mono 6).': '地平线征程 6B：10+ TOPS、20K+ CPU DMIPS、BPU Nash；入门级一体机 ADAS 主动安全、驾驶员监测或泊车（地平线 Mono 6）。',
  'Horizon Journey 5: 128 TOPS, BPU Bayes; up to 16 HD cameras with multiple 4K streams; urban assisted driving with perception fusion, prediction, and planning.': '地平线征程 5：128 TOPS、BPU Bayes；最多 16 路高清摄像头及多路 4K 视频流；具备感知融合、预测与规划的城区辅助驾驶。',
  'Horizon Journey 3: 5 TOPS, BPU Bernoulli, 2.5W; up to 6 HD cameras and a single 4K stream; 8MP front-view NOA and driving-plus-parking controllers (Horizon Mono 3).': '地平线征程 3：5 TOPS、BPU Bernoulli、2.5W；最多 6 路高清摄像头与一路 4K 视频流；8MP 前视 NOA 及行泊一体控制器（地平线 Mono 3）。',
  'Horizon Journey 2: 4 TOPS, BPU Bernoulli, 2W; 2 HD cameras; front-view L2 ADAS and active safety (Horizon Mono 2).': '地平线征程 2：4 TOPS、BPU Bernoulli、2W；2 路高清摄像头；前视 L2 ADAS 与主动安全（地平线 Mono 2）。',
  'Horizon Mono 2 on Journey 2: single 1.7/2.6MP front camera @100/120 deg; FCW, LDW, AEB, BSD, ACC, TJA, TSR, ISA.': '基于征程 2 的地平线 Mono 2：单路 1.7/2.6MP 前视摄像头 @100/120 度；FCW、LDW、AEB、BSD、ACC、TJA、TSR、ISA。',
  'Horizon Mono 3 on Journey 3: 8MP front camera @120 deg plus optional 4x 2MP @195 deg surround; enhanced L2/L2+ ADAS, 360-degree proactive safety, ICA, APA/RPA parking.': '基于征程 3 的地平线 Mono 3：8MP 前视摄像头 @120 度，可选 4 路 2MP @195 度环视；增强型 L2/L2+ ADAS、360 度主动安全、ICA、APA/RPA 泊车。',
  'Horizon Mono 6 on 1x Journey 6B: 17MP front camera @140 deg, optional 4x 3MP @195 deg surround and 3MP @60 deg, optional 32-channel LiDAR; enhanced L2/L2+ ADAS, 5-star AEB (C-NCAP 27-30, E-NCAP 26-29), ICA, APA/RPA.': '基于单颗征程 6B 的地平线 Mono 6：17MP 前视摄像头 @140 度，可选 4 路 3MP @195 度环视及 3MP @60 度，可选 32 线激光雷达；增强型 L2/L2+ ADAS、五星 AEB（C-NCAP 27-30、E-NCAP 26-29）、ICA、APA/RPA。',
  'Horizon SuperDrive HSD 300 on Journey 6P: 11 cameras, 1 radar, optional LiDAR; one-stage end-to-end assisted driving across urban, highway, and parking (APA, HPA).': '基于征程 6P 的地平线 SuperDrive HSD 300：11 路摄像头、1 个雷达，可选激光雷达；一段式端到端辅助驾驶，覆盖城区、高速与泊车（APA、HPA）。',
  'Horizon SuperDrive HSD 600 on Journey 6P: 11 cameras, 3 radars, optional LiDAR; end-to-end urban, highway, and parking assistance.': '基于征程 6P 的地平线 SuperDrive HSD 600：11 路摄像头、3 个雷达，可选激光雷达；端到端城区、高速与泊车辅助。',
  'Horizon SuperDrive HSD 1200 on Journey 6P: 11 cameras, 3 radars, optional LiDAR; the top HSD sensor package for full-scenario assisted driving.': '基于征程 6P 的地平线 SuperDrive HSD 1200：11 路摄像头、3 个雷达，可选激光雷达；面向全场景辅助驾驶的顶配 HSD 传感器方案。',
  'Stereo depth, RGB, and IMU over USB 3.': '通过 USB 3 提供双目深度、RGB 与 IMU。',
  'Stereo depth and RGB over USB 3.': '通过 USB 3 提供双目深度与 RGB。',
  'TTL/RS-485 serial bus servo, daisy-chainable.': 'TTL/RS-485 串行总线舵机，可菊花链级联。',
  'TTL serial bus servo, daisy-chainable.': 'TTL 串行总线舵机，可菊花链级联。',
  '2D 360-degree laser scanner, 12 m range, UART.': '2D 360 度激光扫描仪，12 m 量程，UART。',
  // ---- RDK catalogue notes (RDK_PRODUCTS[x].notes) ----
  '10 TOPS BPU; two MIPI CSI connectors, USB 3.0, Ethernet, CAN FD and 40-pin GPIO; 5V/5A supply.': '10 TOPS BPU；两个 MIPI CSI 接口、USB 3.0、以太网、CAN FD 和 40 针 GPIO；5V/5A 供电。',
  'One MIPI CSI connector on the development board; USB, Ethernet and 40-pin GPIO; 5V/3A supply. Module carrier interfaces are different.': '开发板上有一个 MIPI CSI 接口；USB、以太网和 40 针 GPIO；5V/3A 供电。模组载板接口不同。',
  'Module for a carrier board; external connectors and system power depend on the carrier.': '用于载板的模组；外部接口与系统供电取决于载板。',
  '80 TOPS; 12GB LPDDR5; 12–20V DC input. Camera signals are provided through J25; camera expansion board required for ribbon cameras.': '80 TOPS；12GB LPDDR5；12–20V 直流输入。摄像头信号经 J25 提供；排线摄像头需要摄像头扩展板。',
  '128 TOPS; 24GB LPDDR5; 12–20V DC input. Camera signals are provided through J25; camera expansion board required for ribbon cameras.': '128 TOPS；24GB LPDDR5；12–20V 直流输入。摄像头信号经 J25 提供；排线摄像头需要摄像头扩展板。',
  'Legacy RS800W camera identity; exact module revision and board compatibility require verification.': '旧版 RS800W 摄像头标识；具体模组版本与板卡兼容性需验证。',
  'Legacy RS400W camera identity; exact module revision and board compatibility require verification.': '旧版 RS400W 摄像头标识；具体模组版本与板卡兼容性需验证。',
  '8MP sensor-module family. A sensor name does not establish vendor module, connector or driver compatibility.': '8MP 传感器模组系列。传感器名称不能确定厂商模组、接口或驱动的兼容性。',
  '12.3MP sensor-module family. A sensor name does not establish vendor module, connector or driver compatibility.': '12.3MP 传感器模组系列。传感器名称不能确定厂商模组、接口或驱动的兼容性。',
  '5MP sensor-module family. A sensor name does not establish vendor module, connector or driver compatibility.': '5MP 传感器模组系列。传感器名称不能确定厂商模组、接口或驱动的兼容性。',
  'Legacy stereo camera identity; confirm the exact module. This name does not identify GS130W or GS130WI.': '旧版双目摄像头标识；请确认具体模组。该名称不能区分 GS130W 与 GS130WI。',
  'Dual SC132GS global-shutter MIPI stereo camera; requires two distinct CSI connections.': '双 SC132GS 全局快门 MIPI 双目摄像头；需要两路独立的 CSI 连接。',
  'Dual SC132GS global-shutter MIPI stereo camera with ICM-42688-P IMU; requires two distinct CSI connections.': '带 ICM-42688-P IMU 的双 SC132GS 全局快门 MIPI 双目摄像头；需要两路独立的 CSI 连接。',
  'Sensor acquisition': '传感器采集',
  'BPU model inference': 'BPU 模型推理',
  'Image/video encoding and decoding': '图像/视频编解码',
  'Web/HDMI visualization': 'Web/HDMI 可视化',
  // ---- RDK catalogue requirements and source titles ----
  'Identify the carrier board before choosing connectors or a power supply.': '选择接口或电源前先确认载板。',
  'Camera expansion board provides two MIPI ribbon connectors; J25 carries three CSI signal sets.': '摄像头扩展板提供两个 MIPI 排线接口；J25 承载三组 CSI 信号。',
  'Connector availability must be checked against the installed expansion boards.': '接口可用性须对照已安装的扩展板核实。',
  'Verify the exact module and adapter against the accessory documentation.': '请对照配件文档核实具体模组与转接板。',
  'Select the documented vendor module and matching cable/adapter for the board.': '请为该板选择文档中列出的厂商模组及配套线缆/转接板。',
  'Two separate MIPI ribbon cables to the same board.': '两根独立的 MIPI 排线接到同一块板。',
  'S100/S100P require the Camera expansion board.': 'S100/S100P 需要摄像头扩展板。',
  'Check the package and example documentation for the selected board and ROS 2 runtime.': '请查阅所选板卡与 ROS 2 运行时对应的软件包及示例文档。',
  'X5 hardware guide': 'X5 硬件指南',
  'RDK X5 product specifications': 'RDK X5 产品规格',
  'X3 hardware guide': 'X3 硬件指南',
  'S100 series hardware guide': 'S100 系列硬件指南',
  'S100 Camera expansion board': 'S100 摄像头扩展板',
  'Accessory list (specific vendor modules)': '配件列表（具体厂商模组）',
  'Stereo camera product overview': '双目摄像头产品概览',
  'Stereo installation guide': '双目摄像头安装指南',
  'TogetheROS.Bot capabilities': 'TogetheROS.Bot 功能',
  'TogetheROS.Bot software components': 'TogetheROS.Bot 软件组件',
```

The threat schema labels, placeholders and option labels in `src/palette.js` (the `fields` arrays on threat parts: severity, actor type, sophistication, and the network/system IP and DNS fields) also need entries; list them by running `node --input-type=module -e "import { PARTS } from './src/palette.js'; const s = new Set(); for (const p of Object.values(PARTS)) for (const f of p.fields || []) { s.add(f.label); if (f.placeholder) s.add(f.placeholder); for (const o of f.options || []) s.add(typeof o === 'string' ? o : o.label); } console.log([...s].join('\n'));"` and translate each (severity levels: info 信息, low 低, medium 中, high 高, critical 严重; STIX actor types and sophistication levels keep their English vocabulary word with a Chinese gloss, e.g. `'nation-state': '国家级 (nation-state)'`). The coverage test in Task 12 fails until every one of them has an entry.

- [ ] **Step 6: Run and commit**

Run: `npm test` → green.

```bash
git add src/ui/props.js src/ui/rdk-details.js src/ui/collapsible.js src/ui/panels.js src/presets.js src/i18n/zh.js tests/presets.test.js
git commit -m "i18n: properties panel, RDK details, panel headers, layout toggles, preset notes"
```

---

### Task 7: Part editor, custom-part problems, file-load warnings

**Files:**
- Modify: `src/ui/part-editor.js` (lines 32–38, 94–109, 119, 139–142, 231, 254, 278–286, 310–323, 334)
- Modify: `src/custom.js` (lines 15, 56–161, 330–369)
- Modify: `src/serialize.js` (lines 46–282)
- Modify: `src/i18n/zh.js`
- Test: `tests/custom.test.js`, `tests/serialize.test.js`

**Interfaces:**
- Consumes: `tr`, `trd`, `onLanguageChange`, `translateStatic(dialog)` (Task 3).
- Produces: `sideLabel(side)` exported from `src/custom.js` (display name of a side; `SIDES` values stay `left|right|top|bottom`).

- [ ] **Step 1: Failing tests**

Append to `tests/custom.test.js`:

```js
import { initI18n, setLang } from '../src/i18n.js';

test('draftProblems and normalizePart warnings come out in Chinese under zh, English otherwise', () => {
  initI18n({ storage: null });
  assert.deepEqual(draftProblems({ name: '' }), ['Name is required.']);
  setLang('zh');
  try {
    assert.deepEqual(draftProblems({ name: '' }), ['名称不能为空。']);
    assert.match(draftProblems({ name: 'x', ports: [{ name: 'A', side: 'left' }, { name: 'a', side: 'left' }] })[0], /左/);
    const { warnings } = normalizePart({ name: 'x', category: 'nope', ports: [] });
    assert.match(warnings[0], /未知类别/);
  } finally {
    setLang('en');
  }
});

test('sideLabel names a side for display and leaves the value alone', () => {
  assert.equal(sideLabel('left'), 'left');
  setLang('zh');
  try { assert.equal(sideLabel('left'), '左'); } finally { setLang('en'); }
  assert.deepEqual(SIDES, ['left', 'right', 'top', 'bottom']);
});
```

Append to `tests/serialize.test.js`:

```js
import { initI18n, setLang } from '../src/i18n.js';

test('deserialize warnings follow the interface language', () => {
  initI18n({ storage: null });
  const text = JSON.stringify({ schema: 2, nodes: [{ id: 'a', kind: 'nope', x: 0, y: 0 }], wires: [], zones: [], notes: [], journey: [] });
  assert.equal(deserialize(text).warnings[0], 'Unknown part "nope" became a custom box.');
  setLang('zh');
  try {
    assert.equal(deserialize(text).warnings[0], '未知部件“nope”已变为自定义框。');
  } finally {
    setLang('en');
  }
});
```

Run: `node --test tests/custom.test.js tests/serialize.test.js` → the new tests FAIL.

- [ ] **Step 2: custom.js**

Add `import { tr } from './i18n.js';` and after `export const SIDES = [...]` add:

```js
// Display name of a side; the side value itself is data.
export function sideLabel(side) {
  return { left: tr('left'), right: tr('right'), top: tr('top'), bottom: tr('bottom') }[side] || String(side);
}
```

Rewrite each warning and problem with `tr` and placeholders. Every literal below is the exact current text with `${x}` turned into `{x}`; `${LIMITS.y}` becomes `{max}`:

| Line | After |
|---|---|
| 56 | `tr('Icon on "{name}" was not usable; using initials.', { name })` |
| 94 | `tr('Ports on "{name}" must be a list; ignored.', { name })` |
| 100 | `tr('Dropped a port on "{name}" with no name or side.', { name })` |
| 102 | `tr('Dropped duplicate port "{port}" on the {side} of "{name}".', { port: pname, side: sideLabel(side), name })` |
| 110 | `tr('Port "{port}" on "{name}" has unknown bus "{bus}"; using GPIO.', { port: pname, name, bus })` |
| 115 | `tr('"{name}" keeps the first {max} ports.', { name, max: LIMITS.ports })` |
| 121 | `tr('Fields on "{name}" must be a list; ignored.', { name })` |
| 125 | `tr('Dropped a field on "{name}" with no label.', { name })` |
| 136 | `tr('Field "{label}" on "{name}" needs at least two choices; it is free text.', { label, name })` |
| 142 | `tr('"{name}" keeps the first {max} fields.', { name, max: LIMITS.fields })` |
| 151 | `tr('Custom part definition is missing.')` |
| 153 | `tr('Custom part has no name.')` |
| 156 | `tr('Unknown category "{category}" on "{name}"; using Storage / Misc.', { category, name })` |
| 161 | `tr('Ignored invalid accent on "{name}".', { name })` |
| 333 | `tr('Name is required.')` |
| 334 | `tr('Name is too long ({max} max).', { max: LIMITS.name })` |
| 336 | `tr('Too many ports ({max} max).', { max: LIMITS.ports })` |
| 340 | `tr('Port {n} needs a name.', { n: i + 1 })` |
| 341 | `tr('Port "{port}" name is too long ({max} max).', { port: pname, max: LIMITS.portName })` |
| 343 | `tr('Two ports named "{port}" on the {side}.', { port: pname, side: sideLabel(p.side) })` |
| 349 | `tr('Icon path must be SVG path data starting with M.')` |
| 353 | `tr('Initials are 1 to {max} characters.', { max: LIMITS.text })` |
| 356 | `tr('Too many fields ({max} max).', { max: LIMITS.fields })` |
| 359 | `tr('Field {n} needs a label.', { n: i + 1 })` |
| 363 | `tr('Field "{label}" needs two or more choices.', { label })` |
| 364 | `tr('Field "{label}" has too many choices ({max} max).', { label, max: LIMITS.options })` |
| 365 | `tr('Field "{label}" has a choice longer than {max} characters.', { label, max: LIMITS.option })` |

Line 394's numeric suffix (`SDA 2`) is a port name, not a phrase; leave it.

- [ ] **Step 3: serialize.js**

Add `import { tr } from './i18n.js';` (note the file already uses `t` as a loop variable; `tr` does not clash). Rewrite every warning and thrown message:

| Line | After |
|---|---|
| 46 | `throw new Error(tr('Not a valid Schematica file: could not parse JSON.'))` |
| 49 | `throw new Error(tr('Not a valid Schematica file: top level must be an object.'))` |
| 53 | `throw new Error(tr('Not a valid Schematica file: "{key}" must be an array.', { key }))` |
| 59 | `tr('File schema {found} is newer than this app understands ({known}); loading best-effort.', { found: raw.schema, known: SCHEMA_VERSION })` |
| 79 | `str(raw.title, tr('Untitled Board'))` (keep the existing `str` helper call shape) |
| 87 | `tr('Dropped a node with a missing id or position.')` |
| 91 | `tr('Dropped duplicate id "{id}".', { id: n.id })` |
| 102 | `tr('Node "{id}": {warning}', { id: n.id, warning: w })` |
| 105 | `tr('Custom part "{id}" had no usable definition and became a custom box.', { id: n.id })` |
| 110 | `tr('Unknown part "{kind}" became a custom box.', { kind })` |
| 117 | `tr('Ignored invalid color on node "{id}".', { id: n.id })` |
| 122 | `tr('Ignored unknown status "{status}" on node "{id}".', { status, id: n.id })` |
| 127 | `tr('Dropped unknown flags on node "{id}".', { id: n.id })` |
| 146 | `tr('Dropped fields on node "{id}": {part} has none.', { id: n.id, part: part.name })` |
| 153 | `tr('Dropped unknown field "{field}" on node "{id}".', { field: k, id: n.id })` |
| 163 | `tr('Ignored unknown disposition "{value}" on node "{id}".', { value: n.disposition, id: n.id })` |
| 195 | `tr('Dropped a wire with a bad id or missing endpoint.')` |
| 200 | `tr('Wire "{id}" was moved onto the custom box\'s generic ports.', { id: w.id })` |
| 204 | `tr('Unknown bus "{bus}" became {code}.', { bus, code: BUSES[DEFAULT_BUS].short })` |
| 221 | `tr('Dropped a zone with a bad id or geometry.')` |
| 227 | `tr('Replaced invalid color on zone "{id}".', { id: z.id })` |
| 231 | `str(z.label, tr('Zone'))` |
| 241 | `tr('Dropped invalid lanes on swimlane "{id}".', { id: z.id })` |
| 243 | `tr('Lane 1')` |
| 250 | `tr('Dropped a note with a bad id or position.')` |
| 263 | `tr('Dropped a journey step with a bad id or view.')` |
| 275 | `str(s.label, tr('Step'))` |
| 281 | `tr('Clamped {n} over-long text field(s) to {max} characters.', { n: clampedText, max: MAX_TEXT })` |
| 282 | `tr('Clamped {n} out-of-range position(s) or size(s).', { n: clampedCoord })` |

Existing English assertions in `tests/serialize.test.js` stay green (default language).

- [ ] **Step 4: part-editor.js**

Add `import { tr, trd, onLanguageChange } from '../i18n.js';` and `import { translateStatic } from './i18n-dom.js';`; import `sideLabel` alongside `SIDES` from `../custom.js`.

Wrap the static build (lines 32–38) in a function and call it once:

```js
  function renderStatic() {
    $('pe-category').innerHTML = CATEGORIES.map((c) => `<option value="${c.id}">${escAttr(trd(c.name))}</option>`).join('');
    $('pe-icon-kind').innerHTML = Object.values(PARTS).map((p) => (
      `<button type="button" data-kind="${p.kind}" title="${escAttr(trd(p.name))}">${badgeHTML(p)}</button>`
    )).join('');
    $('pe-swatches').innerHTML = ACCENT_SWATCHES.map((c) => (
      `<button type="button" class="swatch" data-swatch="${c}" style="background:${c}" title="${c}"></button>`
    )).join('') + `<button type="button" class="swatch swatch-auto" data-swatch="" title="${escAttr(tr('Category color'))}">${escAttr(tr('Auto'))}</button>`;
  }
  renderStatic();
```

If the icon-kind and swatch buttons get their listeners by delegation on the container the rebuild is safe; if listeners are bound per button, rebind them inside `renderStatic` (check lines 150–200 and move the binding into the function).

Row builders (lines 94–109): `placeholder="Name"` → `placeholder="${escAttr(tr('Name'))}"`; side option label `${s}` → `${escAttr(sideLabel(s))}`; bus option `${escAttr(BUSES[b].name)}` → `${escAttr(trd(BUSES[b].name))}`; `title="Check reports this port when it is unwired"` → `title="${escAttr(tr('Check reports this port when it is unwired'))}"`; `> req</label>` → `> ${escAttr(tr('req'))}</label>`; titles `Move up`, `Move down`, `Remove port`, `Remove field` → `${escAttr(tr('...'))}`; `placeholder="Label"` → `${escAttr(tr('Label'))}`; `placeholder="Choices, comma separated (blank = free text)"` → `${escAttr(tr('Choices, comma separated (blank = free text)'))}`.

Line 119 (icon text placeholder inside `renderIcon`): wrap the literal in `tr(...)`. Line 142: `raw.name || 'Part'` → `raw.name || tr('Part')`.
Line 231: `` toast(`At most ${LIMITS.ports} ports.`) `` → `toast(tr('At most {max} ports.', { max: LIMITS.ports }))`; line 254 likewise with `'At most {max} fields.'`.

Extract the title logic (lines 278–286) into `renderTitles()` and call it from `open` and from the hook:

```js
  function renderTitles() {
    if (!ctx) return;
    const { mode, nodeId, others } = ctx;
    const name = draft?.name || '';
    $('pe-title').textContent = mode === 'new' ? tr('New part') : (mode === 'customize' ? tr('Customize {name}', { name }) : tr('Edit {name}', { name }));
    const n = others.length;
    $('pe-apply-all-label').textContent = nodeId
      ? (n === 1 ? tr('Apply to the {n} other part on this board from this template', { n }) : tr('Apply to the {n} other parts on this board from this template', { n }))
      : (n === 1 ? tr('Apply to the {n} part on this board from this template', { n }) : tr('Apply to the {n} parts on this board from this template', { n }));
  }
```

`open` keeps `def.name` for the title: store it as `ctx.name = def.name` and use `ctx.name` in `renderTitles` instead of `draft.name`.

Save toasts (lines 310–323):

```js
      const where = targets.length > 1 ? tr(' on {n} parts', { n: targets.length }) : '';
      const wires = dropped ? (dropped === 1 ? tr('; {n} wire dropped', { n: dropped }) : tr('; {n} wires dropped', { n: dropped })) : '';
      toast(tr('{part} updated{where}{wires}.', { part: part.name, where, wires }));
      ...
      toast(tr('{part} saved to My parts.', { part: part.name }));
      ...
      toast(tr('{part} updated in My parts.', { part: part.name }));
```

Before `return { open };` add:

```js
  onLanguageChange(() => {
    renderStatic();
    translateStatic(dialog);
    if (dialog.open) { renderTitles(); renderAll(); refresh(); }
  });
```

- [ ] **Step 5: Dictionary entries**

Append to `src/i18n/zh.js`:

```js
  // ---- part editor ----
  'left': '左',
  'right': '右',
  'top': '上',
  'bottom': '下',
  'Check reports this port when it is unwired': '此端口未连线时检查器会报告',
  'req': '必需',
  'Move up': '上移',
  'Move down': '下移',
  'Remove port': '移除端口',
  'Choices, comma separated (blank = free text)': '选项，以逗号分隔（留空 = 自由文本）',
  'Remove field': '移除字段',
  'At most {max} ports.': '最多 {max} 个端口。',
  'At most {max} fields.': '最多 {max} 个字段。',
  'Customize {name}': '自定义 {name}',
  'Edit {name}': '编辑 {name}',
  'Apply to the {n} other part on this board from this template': '应用到本板图中使用此模板的另外 {n} 个部件',
  'Apply to the {n} other parts on this board from this template': '应用到本板图中使用此模板的另外 {n} 个部件',
  'Apply to the {n} part on this board from this template': '应用到本板图中使用此模板的 {n} 个部件',
  'Apply to the {n} parts on this board from this template': '应用到本板图中使用此模板的 {n} 个部件',
  ' on {n} parts': '（{n} 个部件）',
  '; {n} wire dropped': '；移除了 {n} 条连线',
  '; {n} wires dropped': '；移除了 {n} 条连线',
  '{part} updated{where}{wires}.': '{part} 已更新{where}{wires}。',
  '{part} saved to My parts.': '{part} 已保存到“我的部件”。',
  '{part} updated in My parts.': '“我的部件”中的 {part} 已更新。',
  // ---- custom part problems and warnings ----
  'Icon on "{name}" was not usable; using initials.': '“{name}”的图标不可用；改用首字母。',
  'Ports on "{name}" must be a list; ignored.': '“{name}”的端口必须是列表；已忽略。',
  'Dropped a port on "{name}" with no name or side.': '已丢弃“{name}”上一个没有名称或方位的端口。',
  'Dropped duplicate port "{port}" on the {side} of "{name}".': '已丢弃“{name}”{side}侧重复的端口“{port}”。',
  'Port "{port}" on "{name}" has unknown bus "{bus}"; using GPIO.': '“{name}”的端口“{port}”使用了未知总线“{bus}”；改用 GPIO。',
  '"{name}" keeps the first {max} ports.': '“{name}”仅保留前 {max} 个端口。',
  'Fields on "{name}" must be a list; ignored.': '“{name}”的字段必须是列表；已忽略。',
  'Dropped a field on "{name}" with no label.': '已丢弃“{name}”上一个没有标签的字段。',
  'Field "{label}" on "{name}" needs at least two choices; it is free text.': '“{name}”的字段“{label}”至少需要两个选项；已改为自由文本。',
  '"{name}" keeps the first {max} fields.': '“{name}”仅保留前 {max} 个字段。',
  'Custom part definition is missing.': '缺少自定义部件定义。',
  'Custom part has no name.': '自定义部件没有名称。',
  'Unknown category "{category}" on "{name}"; using Storage / Misc.': '“{name}”使用了未知类别“{category}”；改用“存储 / 其他”。',
  'Ignored invalid accent on "{name}".': '已忽略“{name}”的无效强调色。',
  'Name is required.': '名称不能为空。',
  'Name is too long ({max} max).': '名称过长（最多 {max} 个字符）。',
  'Too many ports ({max} max).': '端口过多（最多 {max} 个）。',
  'Port {n} needs a name.': '端口 {n} 需要名称。',
  'Port "{port}" name is too long ({max} max).': '端口“{port}”名称过长（最多 {max} 个字符）。',
  'Two ports named "{port}" on the {side}.': '{side}侧有两个名为“{port}”的端口。',
  'Icon path must be SVG path data starting with M.': '图标路径必须是以 M 开头的 SVG 路径数据。',
  'Initials are 1 to {max} characters.': '首字母为 1 到 {max} 个字符。',
  'Too many fields ({max} max).': '字段过多（最多 {max} 个）。',
  'Field {n} needs a label.': '字段 {n} 需要标签。',
  'Field "{label}" needs two or more choices.': '字段“{label}”需要两个或更多选项。',
  'Field "{label}" has too many choices ({max} max).': '字段“{label}”选项过多（最多 {max} 个）。',
  'Field "{label}" has a choice longer than {max} characters.': '字段“{label}”有一个选项超过 {max} 个字符。',
  // ---- file-load warnings ----
  'Not a valid Schematica file: could not parse JSON.': '不是有效的 Schematica 文件：无法解析 JSON。',
  'Not a valid Schematica file: top level must be an object.': '不是有效的 Schematica 文件：顶层必须是对象。',
  'Not a valid Schematica file: "{key}" must be an array.': '不是有效的 Schematica 文件：“{key}”必须是数组。',
  'File schema {found} is newer than this app understands ({known}); loading best-effort.': '文件架构版本 {found} 高于本应用支持的版本（{known}）；尽力加载。',
  'Dropped a node with a missing id or position.': '已丢弃一个缺少 id 或位置的部件。',
  'Dropped duplicate id "{id}".': '已丢弃重复的 id“{id}”。',
  'Node "{id}": {warning}': '部件“{id}”：{warning}',
  'Custom part "{id}" had no usable definition and became a custom box.': '自定义部件“{id}”没有可用定义，已变为自定义框。',
  'Unknown part "{kind}" became a custom box.': '未知部件“{kind}”已变为自定义框。',
  'Ignored invalid color on node "{id}".': '已忽略部件“{id}”的无效颜色。',
  'Ignored unknown status "{status}" on node "{id}".': '已忽略部件“{id}”的未知状态“{status}”。',
  'Dropped unknown flags on node "{id}".': '已丢弃部件“{id}”的未知标记。',
  'Dropped fields on node "{id}": {part} has none.': '已丢弃部件“{id}”的字段：{part} 没有字段。',
  'Dropped unknown field "{field}" on node "{id}".': '已丢弃部件“{id}”的未知字段“{field}”。',
  'Ignored unknown disposition "{value}" on node "{id}".': '已忽略部件“{id}”的未知立场“{value}”。',
  'Dropped a wire with a bad id or missing endpoint.': '已丢弃一条 id 无效或端点缺失的连线。',
  'Wire "{id}" was moved onto the custom box\'s generic ports.': '连线“{id}”已移到自定义框的通用端口上。',
  'Unknown bus "{bus}" became {code}.': '未知总线“{bus}”已变为 {code}。',
  'Dropped a zone with a bad id or geometry.': '已丢弃一个 id 或几何无效的区域。',
  'Replaced invalid color on zone "{id}".': '已替换区域“{id}”的无效颜色。',
  'Dropped invalid lanes on swimlane "{id}".': '已丢弃泳道图“{id}”中的无效泳道。',
  'Lane 1': '泳道 1',
  'Dropped a note with a bad id or position.': '已丢弃一个 id 或位置无效的便签。',
  'Dropped a journey step with a bad id or view.': '已丢弃一个 id 或视图无效的导览步骤。',
  'Step': '步骤',
  'Clamped {n} over-long text field(s) to {max} characters.': '已将 {n} 个过长文本字段截断为 {max} 个字符。',
  'Clamped {n} out-of-range position(s) or size(s).': '已修正 {n} 个超出范围的位置或尺寸。',
```

- [ ] **Step 6: Run and commit**

Run: `npm test` → green.

```bash
git add src/ui/part-editor.js src/custom.js src/serialize.js src/i18n/zh.js tests/custom.test.js tests/serialize.test.js
git commit -m "i18n: part editor, custom-part problems, and file-load warnings"
```

---

### Task 8: Journey panel, recording, default labels for zones, notes and lanes

**Files:**
- Modify: `src/ui/journey-ui.js` (lines 66–83, 117, 127)
- Modify: `src/ui/recording-ui.js` (lines 11, 13, 24, 33, 36, 69, 86)
- Modify: `src/recorder.js` (lines 6–11, 71–74, 141, 221, 228, 240, 257, 299, 302)
- Modify: `src/state.js` (lines 206, 223–227, 233)
- Modify: `src/i18n/zh.js`
- Test: `tests/state.test.js`, `tests/recorder.test.js`

**Interfaces:**
- Consumes: `tr`, `trd`, `onLanguageChange`.
- Produces: `VIDEO_FORMATS` exported from `src/recorder.js` (labels translated by `videoFormats()` at call time).

- [ ] **Step 1: Failing tests**

Append to `tests/state.test.js`:

```js
test('zones, swimlanes and notes get language-aware default text', () => {
  initI18n({ storage: null });
  const store = new Store(newDoc());
  setLang('zh');
  try {
    const z = addZone(store, { x: 0, y: 0, w: 100, h: 100 });
    assert.equal(store.doc.zones.find((x) => x.id === z).label, '区域');
    const s = addSwimlane(store, { x: 0, y: 0, w: 400, h: 300 });
    const lane = store.doc.zones.find((x) => x.id === s);
    assert.equal(lane.label, '处理');
    assert.deepEqual(lane.lanes, ['泳道 1', '泳道 2', '泳道 3']);
    const t = addNote(store, 0, 0);
    assert.equal(store.doc.notes.find((x) => x.id === t).text, '便签');
  } finally {
    setLang('en');
  }
  const z = addZone(store, { x: 0, y: 0, w: 100, h: 100 });
  assert.equal(store.doc.zones.find((x) => x.id === z).label, 'Zone');
});
```

Append to `tests/recorder.test.js` (if the file cannot import `createRecorder` under Node, test `VIDEO_FORMATS` only):

```js
import { VIDEO_FORMATS } from '../src/recorder.js';

test('video format labels are English data', () => {
  assert.deepEqual(VIDEO_FORMATS.map((f) => f.label), ['WebM — VP9', 'WebM — VP8', 'MP4 — H.264', 'MP4 — AV1']);
});
```

Run: `node --test tests/state.test.js tests/recorder.test.js` → FAIL (`VIDEO_FORMATS` not exported; zone label is `Zone`).

- [ ] **Step 2: state.js defaults**

`addZone(store, rect, label = tr('Zone'))` → because a default parameter is evaluated per call this translates at creation time. `addSwimlane`: `label: tr('Process')`, `lanes: [tr('Lane {n}', { n: 1 }), tr('Lane {n}', { n: 2 }), tr('Lane {n}', { n: 3 })]`. `addNote(store, x, y, text = tr('Note'))`. Change the `trd` import added in Task 5 to `import { tr, trd } from './i18n.js';`.

- [ ] **Step 3: recorder.js and recording-ui.js**

`src/recorder.js`: `export const VIDEO_FORMATS = [...]` (export, labels unchanged); add `import { tr, trd } from './i18n.js';`; `videoFormats()` returns `VIDEO_FORMATS.filter(...).map((f) => ({ ...f, label: trd(f.label) }))`. Wrap the seven notices/errors:

| Line | After |
|---|---|
| 141 | `notify(tr('Recording failed: the canvas could not be captured.'))` (keep the existing call shape) |
| 221 | `tr('GIF recording reached the 60-second limit and was saved.')` |
| 228 | `throw new Error(tr('Unknown recording format.'))` |
| 240 | `throw new Error(tr('Microphone access was denied. Recording not started.'))` |
| 257 | `tr('Recording failed inside the browser encoder.')` |
| 299 | `tr('No frames were captured, so no GIF was saved.')` |
| 302 | `tr('GIF encoding failed — nothing was saved.')` |

`src/ui/recording-ui.js`: add `import { tr, onLanguageChange } from '../i18n.js';`; line 11 `label: 'GIF (animated)'` → `label: tr('GIF (animated)')`; line 24 `'Encoding…'` → `tr('Encoding…')`; line 33 `` `<span class="rec-dot"></span>${m}:${sec} Stop` `` → `` `<span class="rec-dot"></span>${m}:${sec} ${escAttr(tr('Stop'))}` ``; line 36 `Rec` → `${escAttr(tr('Rec'))}`; line 69 → `toast(tr('Choose a music file first, or pick a different audio option.'))`. Before `return recorder;`:

```js
  onLanguageChange(() => {
    if (recDialog.open) renderFormats();
    onState(recorder.state());
  });
```

If `recorder.state()` does not exist, keep the last state in a local `let last = { recording: false, encoding: false, elapsed: 0 }` updated at the top of `onState` and call `onState(last)`.

- [ ] **Step 4: journey-ui.js**

Add `import { tr, onLanguageChange } from '../i18n.js';`. In `renderJourney`: `panelHeader('Journey', 'journey')` → `panelHeader(tr('Journey'), 'journey')`; `placeholder="Caption shown while presenting"` → `placeholder="${escAttr(tr('Caption shown while presenting'))}"`; `>Go<` → `>${escAttr(tr('Go'))}<`; `title="Update this step to the current view">Set<` → `title="${escAttr(tr('Update this step to the current view'))}">${escAttr(tr('Set'))}<`; `+ Add step from current view` → `${escAttr(tr('+ Add step from current view'))}`; `&#9654; Present` → `&#9654; ${escAttr(tr('Present'))}`. Line 127: `` `${presentState.index + 1} / ${steps.length}` `` stays (digits and a slash: no letters). After `store.subscribe(renderJourney);` add:

```js
  onLanguageChange(() => { renderJourney(); if (presentState.active) presentShow(); });
```

(If the present state object uses a different flag name than `active`, use that.)

- [ ] **Step 5: Dictionary entries**

Append to `src/i18n/zh.js`:

```js
  // ---- journey, recording, defaults ----
  'Journey': '导览',
  'Caption shown while presenting': '演示时显示的字幕',
  'Go': '前往',
  'Set': '设定',
  'Update this step to the current view': '将此步骤更新为当前视图',
  '+ Add step from current view': '+ 从当前视图添加步骤',
  'Present': '演示',
  'GIF (animated)': 'GIF（动画）',
  'Encoding…': '编码中…',
  'Stop': '停止',
  'Choose a music file first, or pick a different audio option.': '请先选择音乐文件，或改用其他音频选项。',
  'WebM — VP9': 'WebM — VP9',
  'WebM — VP8': 'WebM — VP8',
  'MP4 — H.264': 'MP4 — H.264',
  'MP4 — AV1': 'MP4 — AV1',
  'Recording failed: the canvas could not be captured.': '录制失败：无法捕获画布。',
  'GIF recording reached the 60-second limit and was saved.': 'GIF 录制达到 60 秒上限，已保存。',
  'Unknown recording format.': '未知的录制格式。',
  'Microphone access was denied. Recording not started.': '麦克风访问被拒绝。未开始录制。',
  'Recording failed inside the browser encoder.': '浏览器编码器录制失败。',
  'No frames were captured, so no GIF was saved.': '未捕获到任何帧，未保存 GIF。',
  'GIF encoding failed — nothing was saved.': 'GIF 编码失败 — 未保存任何内容。',
```

(`'Zone'`, `'Note'`, `'Process'`, `'Lane {n}'`, `'Step'` already exist from earlier tasks.)

- [ ] **Step 6: Run and commit**

Run: `npm test` → green.

```bash
git add src/ui/journey-ui.js src/ui/recording-ui.js src/recorder.js src/state.js src/i18n/zh.js tests/state.test.js tests/recorder.test.js
git commit -m "i18n: journey panel, recording, and language-aware zone, lane and note defaults"
```

---

### Task 9: Assistant panel, source documents, and copilot-facing user text

**Files:**
- Modify: `src/ui/assistant-ui.js` (lines 19–20, 46–58, 69–102, 112–119, 154–157, 195, 208, 218, 229–241, 258–263, 319, 394–395, 418, 500–513, 536–538, 562, 596–598, 609, 614, 645, 663)
- Modify: `src/ui/assistant-documents.js` (lines 16–25, 37–40, 57–68, 94, 102, 111, 114–115, 127, 141, 155)
- Modify: `src/ai/tools.js:57-69`, `src/ai/agent.js:155,160`, `src/ai/documents.js` (18 messages), `src/ai/providers/errors.js:18,37,39`, `src/ai/providers/anthropic.js:95,106,111`, `src/ai/providers/openai.js:69,75,76`, `src/ai/providers/index.js:16,28`
- Modify: `src/i18n/zh.js`
- Test: `tests/ai-tools.test.js`, `tests/ai-documents.test.js`

Out of scope, on purpose: `src/ai/ops.js` messages are tool results the model reads (the single-shot rejection path quotes them), `src/ai/context.js` and `src/ai/prompt.js` catalogue and rule text, tool descriptions, and the quick-action prompts sent as user messages (`Fix these findings…`, `Fill in blank part numbers…`). They stay English so the model's instructions never change with the interface. The copilot's reply language is Task 11.

- [ ] **Step 1: Failing tests**

Append to `tests/ai-tools.test.js`:

```js
import { initI18n, setLang } from '../src/i18n.js';

test('tool status lines follow the interface language', () => {
  initI18n({ storage: null });
  assert.equal(statusLine('run_checks'), 'running checks');
  setLang('zh');
  try {
    assert.equal(statusLine('run_checks'), '正在运行检查');
    assert.equal(statusLine('search_parts', { query: 'imu' }), '正在搜索部件：imu');
    assert.equal(statusLine('apply_edits', { ops: [1, 2] }), '正在应用 2 项编辑');
  } finally {
    setLang('en');
  }
});
```

Append to `tests/ai-documents.test.js` (use the file's existing helpers to import an unsupported file):

```js
import { initI18n, setLang } from '../src/i18n.js';

test('document import issues follow the interface language', async () => {
  initI18n({ storage: null });
  setLang('zh');
  try {
    const res = await importDocuments([new File(['x'], 'a.exe')], { existing: [] });
    assert.match(res.issues[0].message, /不支持的格式/);
  } finally {
    setLang('en');
  }
});
```

Run: `node --test tests/ai-tools.test.js tests/ai-documents.test.js` → FAIL.

- [ ] **Step 2: `src/ai` user-facing text**

`src/ai/tools.js` `statusLine`:

```js
    case 'rdk_reference': return tr('reading RDK reference: {query}', { query: i.query ?? '' });
    case 'search_parts': return tr('searching parts: {query}', { query: i.query ?? '' });
    case 'get_board': return tr('reading the board');
    case 'run_checks': return tr('running checks');
    case 'list_presets': return tr('presets for {kind}', { kind: i.kind ?? '' });
    case 'apply_edits': return tr('applying {n} edits', { n: Array.isArray(i.ops) ? i.ops.length : 0 });
    case 'arrange': return tr('arranging the board');
```

`src/ai/agent.js` line 155: `throw new Error(tr('The model did not return a valid plan.'))`; line 160: `` tr('\n\nThe edits were rejected:\n{list}', { list: r.text.replace(/^Batch rejected, nothing applied:\n/, '') }) `` (the stripped prefix is the tool's English result text and stays English).

`src/ai/documents.js`: wrap the 17 messages listed in the inventory (`'Document import cancelled.'`, `'Invalid or oversized relative filename.'`, `'Hidden, private, or dependency paths are skipped.'`, `'Credential files are skipped.'`, `'Unsupported format. Export as text, Markdown, PDF, or DOCX (.doc is not supported).'`, `'File size is unavailable.'`, `'File exceeds the 10 MiB limit.'`, `'Collection is limited to 20 documents.'`, `'Collection exceeds the 40 MiB limit.'`, `'File size changed during reading.'`, `'Duplicate document skipped.'`, `'Not valid UTF-8 text. Export as UTF-8 and retry.'`, `'Binary data cannot be imported as text.'`, `'No readable text found. Image-only PDFs need OCR, which is not supported.'`, `'Partial extraction: only the first 100,000 characters are available.'`, `'Document could not be read.'`, `'Document collection exceeds context limits.'`) in `tr(...)` at the point each is produced. Line 71 becomes `cancelled ? tr('Document import cancelled.') : error.message || tr('Document could not be read.')`.

`src/ai/providers/errors.js`: line 18 `tr('{provider} returned HTTP {status}', { provider, status })`; line 37 `tr('Check that the relay is deployed and reachable, then set Base URL to its URL followed by /ollama.com/v1 or /api.moonshot.ai/v1 for your provider. See relay/README.md.')`; line 39 `tr('Could not reach {provider}: {error}', { provider, error: err?.message || err })`.
`src/ai/providers/anthropic.js`: 95 `tr('A tool call input exceeded 256 KB; split the work into smaller batches.')`, 106 fallback `tr('stream error')`, 111 `tr('The response stream ended before the reply completed. Try again.')`. `src/ai/providers/openai.js`: 69, 75 the same two keys, 76 `tr('The provider failed while streaming the reply.')`. `src/ai/providers/index.js`: 16 `tr('unknown provider "{provider}"', { provider })`, 28 `tr('The connection test did not complete ({stop}); try again.', { stop: res.stop })`. Provider display names passed as arguments (`'Anthropic'`, `'The endpoint'`, `'the endpoint'`) stay as they are.

- [ ] **Step 3: assistant-ui.js**

Add `import { tr, trd, onLanguageChange, getLang } from '../i18n.js';` (`getLang` is used by Task 11).

Turn the constants into functions (lines 19–20, 46–58):

```js
const privacy = () => tr('The board\'s text and API key are sent to your chosen endpoint, through a relay when configured. Keys are saved in this browser only when you choose Remember.');
const intro = () => tr('Describe a board and it builds it; ask for a change and it edits the one you have. Every reply is a single undo step.');
const states = () => ({ unset: tr('Set up'), untested: tr('Untested'), ready: tr('Ready'), single: tr('Single-shot') });
const actionCards = () => [
  { act: 'build', icon: 'build', title: tr('Build from a brief'), desc: tr('Start a board from a short spec') },
  { act: 'fix', icon: 'fix', title: tr('Fix checks'), desc: tr('Resolve the design-rule findings on this board') },
  { act: 'fill', icon: 'fill', title: tr('Fill in details'), desc: tr('Part numbers, addresses, and rails from the presets') },
];
```

Extract the chrome build (lines 69–102) into `renderChrome()`; inside it every literal goes through `tr` (`Assistant`, `Provider settings`, `Provider`, `Model`, `Base URL`, `API key`, `paste your key`, `Show key`, `Remember the key on this device`, `Effort`, `Save`, `Test connection`, `List models`, `Forget key`, `Describe a board, or ask for a change`, `Message the assistant`, `send`, `new line`, `Send (Enter)`, `Send`, `Stop the request`, `Stop`, `New thread`, `Settings`, `Assistant settings`, `Close (A)`, `Close the assistant`), the effort options become `${escAttr(trd(e))}` with `value="${e}"`, the composer hint becomes `` `<kbd>Enter</kbd> ${escAttr(tr('send'))} &middot; <kbd>Shift</kbd>+<kbd>Enter</kbd> ${escAttr(tr('new line'))}` ``, `PRIVACY`/`INTRO`/`ACTION_CARDS` become `privacy()`/`intro()`/`actionCards()`. Because listeners are bound to elements by id after the build, `renderChrome()` must also (re)bind them: move the `addEventListener` calls that target `ai-meta`, `ai-settings`, `ai-key-eye`, `ai-save`, `ai-forget`, `ai-test`, `ai-models-btn`, `ai-send`, `ai-stop`, `ai-new`, `ai-gear`, `ai-close`, the action buttons, and the composer into a `bindChrome()` called at the end of `renderChrome()`, and re-resolve the `el('...')` references (`form`, `meta`, `metaText`, `metaState`, `result`, `thread`, `actions`, `input`, `sendBtn`, `stopBtn`, `usageEl`, and the documents container) inside it with `let` bindings at module-function scope. The documents attachment UI is re-created by calling `attachments.relabel()` (Step 4) rather than re-initialised, so its state survives.

Other lines:

| Line | After |
|---|---|
| 115 | `` metaText.innerHTML = `${escAttr(PROVIDERS[s.provider].name)} · <code>${escAttr(s.model \|\| tr('no model'))}</code>${single ? escAttr(tr(' · single-shot')) : ''}`; `` |
| 118–119 | `metaState.textContent = states()[state]; meta.title = tr('{meta} · {state}. Click for settings.', { meta: metaText.textContent, state: states()[state] });` |
| 154 | `el('ai-key').placeholder = p.needsKey ? tr('paste your key') : tr('no key needed');` |
| 157 | `el('ai-help').textContent = trd(p.help \|\| '');` |
| 195 | `el('ai-key-eye').title = shown ? tr('Hide key') : tr('Show key');` |
| 208 | `toast(tr('Assistant settings saved.'))` and `showResult('warn', tr('Add a model and, for this provider, a key.'))` |
| 218 | `toast(tr('Key forgotten.'))` |
| 229 | `showResult('wait', tr('Connecting to {model}…', { model: s.model \|\| tr('the model') }))` |
| 235 | `const msg = ok ? tr('Connected. This model calls tools.') : tr('Connected. This model cannot call tools; the assistant will use single-shot mode.');` |
| 241 | `` const msg = tr('Test failed: {error}', { error: `${err.message}${err.hint ? `\n${err.hint}` : ''}` }); `` |
| 258 | `const msg = names.length ? tr('{n} models listed; pick one in the Model field.', { n: names.length }) : tr('The endpoint listed no models.');` |
| 263 | `` const msg = tr('Could not list models: {error}', { error: `${err.message}${err.hint ? `\n${err.hint}` : ''}` }); `` |
| 394–395 | `${icon('undo')}${escAttr(tr('Undo this'))}` and `${icon('show')}${escAttr(tr('Show changes'))}` |
| 418 | `aria-label="${escAttr(tr('Thinking'))}"` |
| 502–509 | the `lead` map values through `tr(...)`; the default `tr('The request failed.')`; keep `` `${lead} ${err.message}...` `` |
| 536–538 | `let s = tr('{in} in · {out} out', { in: u.input.toLocaleString(), out: u.output.toLocaleString() }); if (u.cacheRead) s += tr(' · {n} cached', { n: u.cacheRead.toLocaleString() }); if (cost !== null) s += tr(' · ≈ ${cost} (estimate)', { cost: cost.toFixed(cost < 0.01 ? 4 : 2) });` |
| 562 | `` '\n\n' + tr('Sources: {list}', { list: sources.entries.map((e) => tr('{name} ({used}/{total} chars{partial})', { name: e.name, used: e.used.toLocaleString(), total: e.total.toLocaleString(), partial: e.partial ? tr(', partial') : '' })).join('; ') }) `` |
| 596 | `reply.text = res.text \|\| (res.error ? '' : tr('(no reply)'));` |
| 597 | `` reply.text += '\n\n' + tr('({how}; edits made so far are kept.)', { how: res.stop === 'aborted' ? tr('Stopped') : tr('Cut off') }); `` |
| 598 | `reply.text += '\n\n' + tr('(The reply hit the length limit.)');` |
| 609 | `res.stopDetails?.explanation \|\| tr('The model declined this request.')` |
| 614 | `setUsage(tr('last: {last} · thread: {thread}', { last: usageText(res.usage, lastCost), thread: usageText(totals, threadCost) }))` |
| 645 | `toast(tr('The board passes every check.'))` |
| 663 | `setUsage(tr('thread: {thread}', { thread: usageText(totals, null) }))` |

The `Build a board for: \nMust have: \nPower: \nConnectivity: ` composer prefill (line 638) is a prompt the user sends to the model and stays English (its caret offset depends on it).

After the first `refreshMeta();` (line 319) add:

```js
  onLanguageChange(() => {
    renderChrome();
    attachments.relabel();
    refreshMeta();
    if (settingsOpen) fillForm();
    renderThread();
  });
```

`renderThread` re-reads `visible`, so stored messages are untouched; only chips and the thinking row change language.

- [ ] **Step 4: assistant-documents.js**

Add `import { tr } from '../i18n.js';`. Extract the `container.innerHTML = ...` build (lines 16–25) into `renderStatic()` with every literal through `tr` (`Add files`, `Add folder`, `Clear files`, `Cancel import`, `Add source files`, `Add source folder`, `Sources · drop files here`, the memory note). Listeners on the four buttons and the drop zone are bound on `container` after the build; move those `onPress`/`addEventListener` calls into `renderStatic()` too so a rebuild rebinds them (the `dragover`/`drop` listeners on `container` itself bind once). Then:

| Line | After |
|---|---|
| 37 | `dialog.setAttribute('aria-label', tr('Source preview: {name}', { name: doc.name }))` |
| 38 | `` `...<button type="button" data-doc-close>${escAttr(tr('Close preview'))}</button>` `` |
| 40 | `tr('{n} extracted characters. {warnings}', { n: doc.text.length.toLocaleString(), warnings: doc.warnings.join(' ') })` |
| 57–59 | `documents.length ? tr('Sources: {selected}/{total} selected · {used}/{max} context chars', { selected: selected.size, total: documents.length, used: currentContext.totalChars.toLocaleString(), max: LIMITS.contextChars.toLocaleString() }) : tr('Sources · drop files here')` |
| 61–62 | `issues.length ? tr('{n} skipped or interrupted:\n{list}', { n: issues.length, list: issues.map((i) => `${i.name}: ${i.message}`).join('\n') }) : ''` |
| 65 | `e ? tr('Included 1–{used} of {total} characters{partial}', { used: e.used.toLocaleString(), total: e.total.toLocaleString(), partial: e.partial ? tr(' · Partial') : '' }) : tr('{n} characters · Not selected', { n: d.text.length.toLocaleString() })` |
| 68 | `${escAttr(tr('Preview'))}` and `${escAttr(tr('Remove'))}` |
| 94 | `progress = tr('Reading local documents…');` |
| 102 | `progress = tr('Reading {i}/{total}: {name}', { i: index + 1, total, name });` |
| 111 | `progress = controller.signal.aborted ? tr('Import cancelled. Completed files were kept.') : tr('{n} documents ready.', { n: documents.length });` |
| 114–115 | `issues.push({ name: tr('Import'), message: error.message \|\| tr('Could not read documents.') }); progress = tr('Import failed.');` |
| 127 | `progress = tr('Cancelling import…');` |
| 141 | `directoryIssues.push({ name: tr('Folder'), message: tr('Use Add folder to select a directory.') });` |
| 155 | add `relabel() { renderStatic(); render(); }` to the returned object |

- [ ] **Step 5: Dictionary entries**

Append to `src/i18n/zh.js`:

```js
  // ---- assistant panel ----
  'The board\'s text and API key are sent to your chosen endpoint, through a relay when configured. Keys are saved in this browser only when you choose Remember.': '板图文本和 API 密钥会发送到您选择的端点（配置了中继时经中继转发）。仅在您勾选“记住”时密钥才保存在此浏览器中。',
  'Describe a board and it builds it; ask for a change and it edits the one you have. Every reply is a single undo step.': '描述一块板图，它就会搭建出来；提出修改，它就会编辑当前板图。每次回复都是一个撤销步骤。',
  'Set up': '待设置',
  'Untested': '未测试',
  'Ready': '就绪',
  'Single-shot': '单次模式',
  'Build from a brief': '按简述搭建',
  'Start a board from a short spec': '根据简短规格新建板图',
  'Fix checks': '修复检查项',
  'Resolve the design-rule findings on this board': '解决本板图的设计规则问题',
  'Fill in details': '补全细节',
  'Part numbers, addresses, and rails from the presets': '从预设填入型号、地址和电压轨',
  'Assistant': '助手',
  'Provider settings': '服务商设置',
  'Provider': '服务商',
  'Model': '模型',
  'Base URL': '基础 URL',
  'API key': 'API 密钥',
  'paste your key': '粘贴您的密钥',
  'no key needed': '无需密钥',
  'Show key': '显示密钥',
  'Hide key': '隐藏密钥',
  'Remember the key on this device': '在此设备上记住密钥',
  'Effort': '推理强度',
  'low': '低',
  'medium': '中',
  'high': '高',
  'Test connection': '测试连接',
  'List models': '列出模型',
  'Forget key': '忘记密钥',
  'Describe a board, or ask for a change': '描述一块板图，或提出修改',
  'Message the assistant': '向助手发送消息',
  'send': '发送',
  'new line': '换行',
  'Send (Enter)': '发送 (Enter)',
  'Send': '发送',
  'Stop the request': '停止请求',
  'New thread': '新对话',
  'Settings': '设置',
  'Assistant settings': '助手设置',
  'Close (A)': '关闭 (A)',
  'Close the assistant': '关闭助手',
  'no model': '未选模型',
  ' · single-shot': ' · 单次模式',
  '{meta} · {state}. Click for settings.': '{meta} · {state}。点击进入设置。',
  'Assistant settings saved.': '助手设置已保存。',
  'Add a model and, for this provider, a key.': '请填写模型，并为该服务商填写密钥。',
  'Key forgotten.': '已忘记密钥。',
  'Connecting to {model}…': '正在连接 {model}…',
  'the model': '模型',
  'Connected. This model calls tools.': '已连接。该模型可调用工具。',
  'Connected. This model cannot call tools; the assistant will use single-shot mode.': '已连接。该模型无法调用工具；助手将使用单次模式。',
  'Test failed: {error}': '测试失败：{error}',
  '{n} models listed; pick one in the Model field.': '已列出 {n} 个模型；请在“模型”字段中选择。',
  'The endpoint listed no models.': '该端点未列出任何模型。',
  'Could not list models: {error}': '无法列出模型：{error}',
  'Undo this': '撤销此项',
  'Show changes': '显示更改',
  'Thinking': '思考中',
  'The provider rejected the key.': '服务商拒绝了该密钥。',
  'The provider is rate-limiting requests; try again in a moment.': '服务商正在限流；请稍后再试。',
  'Could not reach the provider.': '无法连接服务商。',
  'The model was not found.': '未找到该模型。',
  'The thread is too long for the model; start a new thread.': '对话过长，超出模型限制；请开始新对话。',
  'The model declined this request.': '模型拒绝了此请求。',
  'The request failed.': '请求失败。',
  '{in} in · {out} out': '输入 {in} · 输出 {out}',
  ' · {n} cached': ' · 缓存 {n}',
  ' · ≈ ${cost} (estimate)': ' · 约 ${cost}（估算）',
  'Sources: {list}': '来源：{list}',
  '{name} ({used}/{total} chars{partial})': '{name}（{used}/{total} 字符{partial}）',
  ', partial': '，部分',
  '(no reply)': '（无回复）',
  '({how}; edits made so far are kept.)': '（{how}；已做的编辑保留。）',
  'Stopped': '已停止',
  'Cut off': '被截断',
  '(The reply hit the length limit.)': '（回复达到长度上限。）',
  'last: {last} · thread: {thread}': '本次：{last} · 对话：{thread}',
  'thread: {thread}': '对话：{thread}',
  'The board passes every check.': '板图通过了所有检查。',
  // ---- source documents ----
  'Add files': '添加文件',
  'Add folder': '添加文件夹',
  'Clear files': '清除文件',
  'Cancel import': '取消导入',
  'Add source files': '添加源文件',
  'Add source folder': '添加源文件夹',
  'Sources · drop files here': '来源 · 将文件拖到此处',
  'Files stay in this tab’s memory until reload, New thread, or board replacement. On Send, selected extracted text goes to your chosen AI endpoint, through a relay when configured. Imports stay local.': '文件仅保存在此标签页内存中，直到刷新、新对话或更换板图。发送时，所选的提取文本会发送到您选择的 AI 端点（配置了中继时经中继转发）。导入过程全部在本地完成。',
  'Source preview: {name}': '来源预览：{name}',
  'Close preview': '关闭预览',
  '{n} extracted characters. {warnings}': '已提取 {n} 个字符。{warnings}',
  'Sources: {selected}/{total} selected · {used}/{max} context chars': '来源：已选 {selected}/{total} · 上下文 {used}/{max} 字符',
  '{n} skipped or interrupted:\n{list}': '{n} 个被跳过或中断：\n{list}',
  'Included 1–{used} of {total} characters{partial}': '已包含 {total} 个字符中的 1–{used}{partial}',
  ' · Partial': ' · 部分',
  '{n} characters · Not selected': '{n} 个字符 · 未选择',
  'Remove': '移除',
  'Reading local documents…': '正在读取本地文档…',
  'Reading {i}/{total}: {name}': '正在读取 {i}/{total}：{name}',
  'Import cancelled. Completed files were kept.': '导入已取消。已完成的文件已保留。',
  '{n} documents ready.': '{n} 个文档已就绪。',
  'Could not read documents.': '无法读取文档。',
  'Import failed.': '导入失败。',
  'Cancelling import…': '正在取消导入…',
  'Folder': '文件夹',
  'Use Add folder to select a directory.': '请使用“添加文件夹”选择目录。',
  'Document import cancelled.': '文档导入已取消。',
  'Invalid or oversized relative filename.': '相对文件名无效或过长。',
  'Hidden, private, or dependency paths are skipped.': '隐藏、私有或依赖路径已跳过。',
  'Credential files are skipped.': '凭证文件已跳过。',
  'Unsupported format. Export as text, Markdown, PDF, or DOCX (.doc is not supported).': '不支持的格式。请导出为文本、Markdown、PDF 或 DOCX（不支持 .doc）。',
  'File size is unavailable.': '无法获取文件大小。',
  'File exceeds the 10 MiB limit.': '文件超过 10 MiB 上限。',
  'Collection is limited to 20 documents.': '文档集合最多 20 个文件。',
  'Collection exceeds the 40 MiB limit.': '文档集合超过 40 MiB 上限。',
  'File size changed during reading.': '读取过程中文件大小发生了变化。',
  'Duplicate document skipped.': '重复文档已跳过。',
  'Not valid UTF-8 text. Export as UTF-8 and retry.': '不是有效的 UTF-8 文本。请导出为 UTF-8 后重试。',
  'Binary data cannot be imported as text.': '二进制数据无法作为文本导入。',
  'No readable text found. Image-only PDFs need OCR, which is not supported.': '未找到可读文本。纯图片 PDF 需要 OCR，暂不支持。',
  'Partial extraction: only the first 100,000 characters are available.': '部分提取：仅前 100,000 个字符可用。',
  'Document could not be read.': '无法读取文档。',
  'Document collection exceeds context limits.': '文档集合超出上下文限制。',
  // ---- copilot status lines and provider errors ----
  'reading RDK reference: {query}': '正在查阅 RDK 参考：{query}',
  'searching parts: {query}': '正在搜索部件：{query}',
  'reading the board': '正在读取板图',
  'running checks': '正在运行检查',
  'presets for {kind}': '正在查找 {kind} 的预设',
  'applying {n} edits': '正在应用 {n} 项编辑',
  'arranging the board': '正在整理板图',
  'The model did not return a valid plan.': '模型未返回有效方案。',
  '\n\nThe edits were rejected:\n{list}': '\n\n编辑被拒绝：\n{list}',
  '{provider} returned HTTP {status}': '{provider} 返回了 HTTP {status}',
  'Check that the relay is deployed and reachable, then set Base URL to its URL followed by /ollama.com/v1 or /api.moonshot.ai/v1 for your provider. See relay/README.md.': '请确认中继已部署且可访问，然后将基础 URL 设为中继地址加 /ollama.com/v1 或 /api.moonshot.ai/v1（按服务商选择）。参见 relay/README.md。',
  'Could not reach {provider}: {error}': '无法连接 {provider}：{error}',
  'A tool call input exceeded 256 KB; split the work into smaller batches.': '某次工具调用的输入超过 256 KB；请拆分为更小的批次。',
  'stream error': '流错误',
  'The response stream ended before the reply completed. Try again.': '响应流在回复完成前结束。请重试。',
  'The provider failed while streaming the reply.': '服务商在流式回复时出错。',
  'unknown provider "{provider}"': '未知服务商“{provider}”',
  'The connection test did not complete ({stop}); try again.': '连接测试未完成（{stop}）；请重试。',
  // ---- provider help (PROVIDERS[x].help) ----
  'Keys come from console.anthropic.com. Claude Opus 5 is the default; Sonnet 5 is cheaper, Haiku 4.5 runs without adaptive thinking.': '密钥来自 console.anthropic.com。默认使用 Claude Opus 5；Sonnet 5 更便宜，Haiku 4.5 不使用自适应思考。',
  'One key for hundreds of models; "List models" fetches the catalogue. Keys come from openrouter.ai/keys.': '一个密钥可用数百个模型；“列出模型”会获取目录。密钥来自 openrouter.ai/keys。',
  'Z.AI\'s GLM models over their OpenAI-compatible endpoint. Keys come from z.ai.': '通过 Z.AI 的 OpenAI 兼容端点使用 GLM 模型。密钥来自 z.ai。',
  'Moonshot\'s Kimi models over their OpenAI-compatible endpoint, through the relay because api.moonshot.ai does not answer browser requests. Keys come from platform.kimi.ai.': '通过 Moonshot 的 OpenAI 兼容端点使用 Kimi 模型，并经中继转发，因为 api.moonshot.ai 不响应浏览器请求。密钥来自 platform.kimi.ai。',
```

The OpenAI-compatible provider's help text is a template literal containing `${RELAY}`; the coverage test extracts `PROVIDERS[x].help` **values** at runtime, so its key is the resolved English text:

```js
  'Any chat-completions endpoint with function calling. For Ollama Cloud, use https://schematica-relay.henrycooper86.workers.dev/ollama.com/v1, a key from ollama.com/settings/keys, and a model such as glm-5.3. Local Ollama: http://localhost:11434/v1, key "ollama", with OLLAMA_ORIGINS set to this site\'s origin. "List models" fetches the catalogue.': '任何支持函数调用的 chat-completions 端点。Ollama Cloud 请使用 https://schematica-relay.henrycooper86.workers.dev/ollama.com/v1、来自 ollama.com/settings/keys 的密钥以及 glm-5.3 之类的模型。本地 Ollama：http://localhost:11434/v1，密钥“ollama”，并将 OLLAMA_ORIGINS 设为本站来源。“列出模型”会获取目录。',
```

- [ ] **Step 6: Run and commit**

Run: `npm test` → green.

```bash
git add src/ui/assistant-ui.js src/ui/assistant-documents.js src/ai/tools.js src/ai/agent.js src/ai/documents.js src/ai/providers/errors.js src/ai/providers/anthropic.js src/ai/providers/openai.js src/ai/providers/index.js src/i18n/zh.js tests/ai-tools.test.js tests/ai-documents.test.js
git commit -m "i18n: assistant panel, source documents, status lines, and provider errors"
```

---

### Task 10: Card flag tooltips, design-rule messages, RDK checks, and the setup guide

**Files:**
- Modify: `src/render.js:188,251,258`
- Modify: `src/drc.js` (lines 61, 82, 95, 111, 123)
- Modify: `src/rdk/checks.js` (the `requirements` helper and every `add(...)` message and `reason`)
- Modify: `src/rdk/guide.js` (every fixed string in `profileFacts`, `rdkFacts`, `rdkGuide`)
- Modify: `src/i18n/zh.js`
- Test: `tests/drc.test.js`, `tests/rdk-checks.test.js`, `tests/rdk-guide.test.js`

**Interfaces:**
- Consumes: `tr`, `trd`.
- Produces: `FLAG_META` exported from `src/render.js` (labels are English data, translated at draw time).

- [ ] **Step 1: Failing tests**

Append to `tests/drc.test.js`:

```js
import { initI18n, setLang } from '../src/i18n.js';

test('design-rule messages follow the interface language and keep their rule ids', () => {
  initI18n({ storage: null });
  const doc = { schema: 2, title: '', nodes: [node('a', 'mcu'), node('b', 'temp', { addr: '0x76' }), node('c', 'temp', { addr: '0x76' })], wires: [
    { id: 'w1', bus: 'i2c', from: { node: 'a', port: 'i2c' }, to: { node: 'b', port: 'i2c' }, label: '', arrow: null, style: null, flow: null },
    { id: 'w2', bus: 'i2c', from: { node: 'a', port: 'i2c' }, to: { node: 'c', port: 'i2c' }, label: '', arrow: null, style: null, flow: null },
  ], zones: [], notes: [], journey: [] };
  const en = checkDoc(doc);
  assert.equal(en[0].rule, 'i2c-addr-conflict');
  assert.equal(en[0].message, 'I2C address 0x76 is used by b and c on the same bus.');
  setLang('zh');
  try {
    const zh = checkDoc(doc);
    assert.deepEqual(zh.map((f) => f.rule), en.map((f) => f.rule));
    assert.equal(zh[0].message, 'I2C 地址 0x76 被同一总线上的 b 和 c 同时使用。');
    assert.match(zh.find((f) => f.rule === 'unconnected-power').message, /引脚未连接/);
  } finally {
    setLang('en');
  }
});
```

Append to `tests/rdk-checks.test.js` (reuse the file's `n` helper and an existing X5-plus-third-camera fixture if one exists; otherwise this minimal one):

```js
import { initI18n, setLang } from '../src/i18n.js';

test('RDK messages follow the interface language; rule ids and source URLs do not', () => {
  initI18n({ storage: null });
  const doc = { schema: 2, title: '', nodes: [n('b', 'aisbc', 'RDK X5'), n('c', 'mipicam', 'IMX219')], wires: [
    { id: 'w', bus: 'mipi', from: { node: 'b', port: 'csi1' }, to: { node: 'c', port: 'csi' }, label: '', arrow: null, style: null, flow: null },
  ], zones: [], notes: [], journey: [] };
  const en = checkDoc(doc).filter((f) => f.rule.startsWith('rdk-'));
  setLang('zh');
  try {
    const zh = checkDoc(doc).filter((f) => f.rule.startsWith('rdk-'));
    assert.deepEqual(zh.map((f) => f.rule), en.map((f) => f.rule));
    for (const f of zh) {
      assert.match(f.message, /[一-鿿]/, f.rule);
      assert.match(f.message, /https:\/\/d-robotics\.github\.io\//, 'sources stay');
    }
  } finally {
    setLang('en');
  }
});
```

Append to `tests/rdk-guide.test.js`:

```js
import { initI18n, setLang } from '../src/i18n.js';

test('the setup guide headings follow the interface language while ids and URLs stay', () => {
  initI18n({ storage: null });
  const rover = EXAMPLES.find((e) => e.id === 'rdk-rover').doc;
  setLang('zh');
  try {
    const md = rdkGuide(rover);
    assert.match(md, /^# RDK 搭建指南：/m);
    assert.match(md, /^## 物料清单$/m);
    assert.match(md, /^## 准备清单$/m);
    assert.match(md, /- n3\.csi1 → n5\.csi \(mipi\)/, 'connection lines are ids');
    assert.match(md, /https:\/\/d-robotics\.github\.io\//);
  } finally {
    setLang('en');
  }
  assert.match(rdkGuide(rover), /^## Bill of materials$/m);
});
```

(Import `EXAMPLES` from `../src/examples.js` if the file does not already.) Run the three files → the new tests FAIL.

- [ ] **Step 2: render.js**

`export const FLAG_META = {` (line 188); add `import { trd } from './i18n.js';`; line 251 `<title>${esc(f.label)}</title>` → `<title>${esc(trd(f.label))}</title>`; line 258 `.map((k) => FLAG_META[k].label)` → `.map((k) => trd(FLAG_META[k].label))`. Status tags (`PLANNED`, `PROTO`, …) stay codes.

- [ ] **Step 3: drc.js**

Add `import { tr } from './i18n.js';` and rewrite the five messages:

```js
message: tr('I2C address {addr} is used by {names} on the same bus.', { addr, names: nodes.map((n) => n.label).join(tr(' and ')) }),
```
```js
message: tr('{label}\'s {port} pin is unconnected.', { label: n.label, port: port.name }),
```
```js
message: floating.length === 1
  ? tr('{names} is not wired to anything.', { names: floating.map((n) => n.label).join(', ') })
  : tr('{names} are not wired to anything.', { names: floating.map((n) => n.label).join(', ') }),
```
```js
message: tr('A {bus} wire connects ports that are {a} and {b}.', { bus: w.bus.toUpperCase(), a: String(ends[0]).toUpperCase(), b: String(ends[1]).toUpperCase() }),
```
```js
message: n.status === 'deprecated' ? tr('{label} is marked deprecated.', { label: n.label }) : tr('{label} is flagged end-of-life.', { label: n.label }),
```

- [ ] **Step 4: rdk/checks.js**

Add `import { tr, trd } from '../i18n.js';`. The `requirements` helper translates each catalogue line: `[...new Set(profiles.flatMap((p) => p?.requirements || []))].map(trd).join(' ')`. Then each message:

| Rule | After |
|---|---|
| `rdk-interface` (profile without ports) | `tr('{label}: connector profile is unverified. {requirements} {sources}', { label: n.label, requirements: requirements(p), sources: sources(p) })` |
| `rdk-csi-capacity` | `tr('{label} {port} is shared by multiple camera inputs.', { label: n.label, port: slot.port })` |
| `rdk-stereo-links` error | `tr('{label} requires left and right MIPI links to two distinct supported CSI connectors on the same board. {sources}', { label: n.label, sources: sources(p) })` |
| `rdk-stereo-links` warning | `tr('{label}: stereo connector pair is unverified. {requirements} {sources}', { label: n.label, requirements: requirements(p, ...hosts.map(profileFor)), sources: sources(p, ...hosts.map(profileFor)) })` |
| `rdk-power` | `tr('{label} supply {rail} is outside its documented {min}–{max}V input range. {sources}', { label: n.label, rail: supply.rail, min: p.power.inputMinV, max: p.power.inputMaxV, sources: sources(p) })` |
| `rdk-software` reasons | `tr('Select a target RDK board.')`, `tr('Target board is missing or is not a board.')`, `tr('Package/board compatibility is unverified.')`, `tr('Package is explicitly unsupported on the selected board.')`, `tr('Selected runtime compatibility is unverified.')`, `tr('Selected runtime is outside the documented supported runtimes.')`; message `tr('{label}: {reason} {sources}', { label: n.label, reason, sources: sources(component, board) \|\| 'https://d-robotics.github.io/tros_doc/en/tros/' })` |
| `rdk-interface` (unavailable connector) | `tr('{label}: connector {port} is unavailable on {product}. {sources}', { label: n.label, port: own.port, product: p.name, sources: sources(p) })` |
| `rdk-compatibility` error | `tr('{label} is explicitly unsupported on {product}. {sources}', { label: n.label, product: board.name, sources: sources(p, board) \|\| 'https://d-robotics.github.io/rdk_doc/en/Quick_start/accessory/' })` |
| `rdk-compatibility` warning | `tr('{label} with {host}: compatibility is unverified. {requirements} {sources}', { label: n.label, host: host.label, requirements: requirements(p, board), sources: sources(p, board) \|\| 'https://d-robotics.github.io/rdk_doc/en/Quick_start/accessory/' })` |

Product names (`p.name`, `board.name`) are catalogue identities and stay Latin.

- [ ] **Step 5: rdk/guide.js**

Add `import { tr, trd } from '../i18n.js';`. `profileFacts`:

```js
function profileFacts(p) {
  if (!p) return [tr('Package or product identity is unverified.')];
  const lines = [
    p.name,
    tr('Checked: {date}', { date: p.checkedOn }),
    trd(p.notes),
    p.ports
      ? tr('Ports: {list}', { list: p.ports.map((port) => `${port.id} (${port.bus})`).join(', ') })
      : tr('Ports: unverified; generic drawing ports are not validated connectors'),
  ];
  if (p.power) {
    lines.push(tr('Power: {rail}; input {min}–{max}V{current}{power}{load}', {
      rail: p.power.rail, min: p.power.inputMinV, max: p.power.inputMaxV,
      current: p.power.recommendedCurrentA ? tr('; recommended {a}A', { a: p.power.recommendedCurrentA }) : '',
      power: p.power.recommendedPowerW ? tr('; recommended {w}W', { w: p.power.recommendedPowerW }) : '',
      load: p.power.maxLoadPowerW ? tr('; maximum-load supply {w}W', { w: p.power.maxLoadPowerW }) : '',
    }));
  }
  lines.push(...p.requirements.map(trd));
  if (p.compatibility.boardIds) lines.push(tr('Documented boards: {list}', { list: p.compatibility.boardIds.join(', ') }));
  if (p.compatibility.unsupportedBoardIds.length) lines.push(tr('Unsupported boards: {list}', { list: p.compatibility.unsupportedBoardIds.join(', ') }));
  const peripherals = compatiblePeripherals(p);
  if (peripherals.length) {
    lines.push(tr('Documented peripherals: {list}', { list: peripherals.map((part) => part.name).join(', ') }));
    for (const part of peripherals) lines.push(tr('{name} requirements: {list}', { name: part.name, list: part.requirements.map(trd).join(' ') }));
    lines.push(tr('These documented relationships do not validate other peripherals or replace carrier, adapter and connector requirements.'));
  }
  return lines;
}
```

`referenceText` (read by the copilot's `rdk_reference` tool and by the details panel): keep it as is, English, because its consumer is the model; the details panel shows `rdkFacts`, which is translated. `rdkFacts`: `tr('CSI {port}: {endpoints}', { port: slot.port, endpoints: slot.endpoints.length ? slot.endpoints.map((e) => `${e.node}.${e.port}`).join(', ') : tr('unused') })`.

`rdkGuide`: every fixed line through `tr`:

```js
    tr('# RDK setup guide: {title}', { title: m(doc.title) }),
    '',
    tr('Architecture reference only. Verify the exact hardware revision, adapters, power supply and software documentation before setup. Diagram checks do not certify hardware operation.'),
    '',
    tr('## Bill of materials'),
```
BOM lines: `` `- ${m(n.label)} (${m(n.id)}): ${m(n.kind === 'rdksoftware' ? n.fields?.package || tr('package not selected') : n.sublabel || n.kind)}` `` and `tr('  - Component notes / assumptions: {notes}', { notes: m(n.notes) })`. Then `tr('## Connections')`, `tr('No connections drawn.')`, `tr('## Software mapping')`, the mapping line `tr('- {label}: package {package}; target: {target}; Runtime: {runtime}', { label: m(n.label), package: m(n.fields?.package || tr('not selected')), target: m(target ? `${target.label} (${target.id})` : tr('{id} (missing or non-board target)', { id: n.fields?.target || tr('not selected') })), runtime: m(n.fields?.runtime || tr('not selected (optional component-level assumption)')) })`, `tr('## Diagram notes and assumptions')`, `tr('No diagram notes recorded.')`, `tr('## Findings')`, findings line `` `- ${m(f.level === 'error' ? tr('error') : tr('warning'))} ${f.rule}: ${m(f.message)}` ``, `tr('No current architectural findings. Physical operation still requires verification.')`, `tr('## Preparation checklist')` and the five checklist lines each through `tr(...)` verbatim, `tr('## Official references')`, and the reference line `` `- [${m(trd(s.title))}${s.archived ? m(tr(' (archived)')) : ''}](<...>)` ``. The `m()` escaping stays outside `tr` so placeholders are filled with already-escaped text.

- [ ] **Step 6: Dictionary entries**

Append to `src/i18n/zh.js`:

```js
  // ---- design-rule messages ----
  'I2C address {addr} is used by {names} on the same bus.': 'I2C 地址 {addr} 被同一总线上的 {names} 同时使用。',
  ' and ': ' 和 ',
  '{label}\'s {port} pin is unconnected.': '{label} 的 {port} 引脚未连接。',
  '{names} is not wired to anything.': '{names} 没有连接到任何部件。',
  '{names} are not wired to anything.': '{names} 没有连接到任何部件。',
  'A {bus} wire connects ports that are {a} and {b}.': '一条 {bus} 连线连接了 {a} 和 {b} 端口。',
  '{label} is marked deprecated.': '{label} 已标记为弃用。',
  '{label} is flagged end-of-life.': '{label} 已标记为停产。',
  // ---- RDK checks ----
  '{label}: connector profile is unverified. {requirements} {sources}': '{label}：接口配置未经验证。{requirements} {sources}',
  '{label} {port} is shared by multiple camera inputs.': '{label} 的 {port} 被多个摄像头输入共用。',
  '{label} requires left and right MIPI links to two distinct supported CSI connectors on the same board. {sources}': '{label} 需要左右两路 MIPI 链路分别接到同一块板上两个不同的受支持 CSI 接口。{sources}',
  '{label}: stereo connector pair is unverified. {requirements} {sources}': '{label}：双目接口对未经验证。{requirements} {sources}',
  '{label} supply {rail} is outside its documented {min}–{max}V input range. {sources}': '{label} 的供电 {rail} 超出文档规定的 {min}–{max}V 输入范围。{sources}',
  'Select a target RDK board.': '请选择目标 RDK 板。',
  'Target board is missing or is not a board.': '目标板缺失或不是板卡。',
  'Package/board compatibility is unverified.': '软件包与板卡的兼容性未经验证。',
  'Package is explicitly unsupported on the selected board.': '所选板卡明确不支持该软件包。',
  'Selected runtime compatibility is unverified.': '所选运行时的兼容性未经验证。',
  'Selected runtime is outside the documented supported runtimes.': '所选运行时不在文档列出的受支持运行时之内。',
  '{label}: {reason} {sources}': '{label}：{reason} {sources}',
  '{label}: connector {port} is unavailable on {product}. {sources}': '{label}：{product} 上没有 {port} 接口。{sources}',
  '{label} is explicitly unsupported on {product}. {sources}': '{product} 明确不支持 {label}。{sources}',
  '{label} with {host}: compatibility is unverified. {requirements} {sources}': '{label} 与 {host}：兼容性未经验证。{requirements} {sources}',
  // ---- setup guide ----
  'Package or product identity is unverified.': '软件包或产品身份未经验证。',
  'Checked: {date}': '核查日期：{date}',
  'Ports: {list}': '端口：{list}',
  'Ports: unverified; generic drawing ports are not validated connectors': '端口：未经验证；通用绘图端口不是经验证的接口',
  'Power: {rail}; input {min}–{max}V{current}{power}{load}': '电源：{rail}；输入 {min}–{max}V{current}{power}{load}',
  '; recommended {a}A': '；推荐 {a}A',
  '; recommended {w}W': '；推荐 {w}W',
  '; maximum-load supply {w}W': '；满载供电 {w}W',
  'Documented boards: {list}': '文档列出的板卡：{list}',
  'Unsupported boards: {list}': '不支持的板卡：{list}',
  'Documented peripherals: {list}': '文档列出的外设：{list}',
  '{name} requirements: {list}': '{name} 要求：{list}',
  'These documented relationships do not validate other peripherals or replace carrier, adapter and connector requirements.': '这些文档化的关系不能验证其他外设，也不能替代载板、转接板和接口方面的要求。',
  'CSI {port}: {endpoints}': 'CSI {port}：{endpoints}',
  'unused': '未使用',
  '# RDK setup guide: {title}': '# RDK 搭建指南：{title}',
  'Architecture reference only. Verify the exact hardware revision, adapters, power supply and software documentation before setup. Diagram checks do not certify hardware operation.': '仅作架构参考。搭建前请核实具体硬件版本、转接板、电源和软件文档。图表检查不能证明硬件可正常运行。',
  '## Bill of materials': '## 物料清单',
  'package not selected': '未选择软件包',
  '  - Component notes / assumptions: {notes}': '  - 部件备注 / 假设：{notes}',
  '## Connections': '## 连接',
  'No connections drawn.': '未绘制任何连接。',
  '## Software mapping': '## 软件映射',
  '- {label}: package {package}; target: {target}; Runtime: {runtime}': '- {label}：软件包 {package}；目标：{target}；运行时：{runtime}',
  'not selected': '未选择',
  '{id} (missing or non-board target)': '{id}（目标缺失或不是板卡）',
  'not selected (optional component-level assumption)': '未选择（可选的组件级假设）',
  '## Diagram notes and assumptions': '## 图表备注与假设',
  'No diagram notes recorded.': '未记录图表备注。',
  '## Findings': '## 检查结果',
  'No current architectural findings. Physical operation still requires verification.': '当前没有架构层面的问题。实际运行仍需验证。',
  '## Preparation checklist': '## 准备清单',
  '- Confirm the exact hardware revision and any carrier or expansion board against the official references; resolve unverified connectors and adapter requirements.': '- 对照官方参考资料确认具体硬件版本及所有载板或扩展板；解决未经验证的接口和转接板要求。',
  '- Verify the required cables, connector orientation and separate stereo CSI paths against the documented assembly.': '- 对照文档中的装配方式核实所需线缆、接口方向和独立的双目 CSI 路径。',
  '- Check power voltage, supply capacity, regulation and all return/ground connections; resolve the current findings above.': '- 检查供电电压、供电能力、稳压以及所有回路/接地连接；解决上述当前问题。',
  '- Review each software package, target board and selected runtime in the software mapping against its official documentation. If runtime is not selected, record that decision before setup.': '- 对照官方文档逐一审查软件映射中的每个软件包、目标板和所选运行时。若未选择运行时，请在搭建前记录该决定。',
  '- Create a hardware validation record with the actual board revision, assembly, software/runtime versions, observations and unresolved issues after physical testing. This guide does not establish validation results.': '- 实机测试后，建立硬件验证记录，写明实际板卡版本、装配、软件/运行时版本、观察结果和未解决的问题。本指南不构成验证结果。',
  '## Official references': '## 官方参考',
```

- [ ] **Step 7: Run and commit**

Run: `npm test` → green (`tests/rdk-examples.test.js` asserts rule ids only; English messages unchanged).

```bash
git add src/render.js src/drc.js src/rdk/checks.js src/rdk/guide.js src/i18n/zh.js tests/drc.test.js tests/rdk-checks.test.js tests/rdk-guide.test.js
git commit -m "i18n: flag tooltips, design-rule and RDK messages, and the setup guide"
```

---

### Task 11: The copilot replies in the interface language

**Files:**
- Modify: `src/ai/prompt.js:29-33`
- Modify: `src/ui/assistant-ui.js:560`
- Test: `tests/ai-context.test.js`

**Interfaces:**
- Consumes: `getLang` (Task 1).
- Produces: `perRequestSystem({ date, effort, singleShot, language })`.

- [ ] **Step 1: Failing test**

Append to `tests/ai-context.test.js`:

```js
test('the per-request block asks for Chinese only when the interface is Chinese', () => {
  const en = perRequestSystem({ date: '2026-09-08', effort: 'medium', singleShot: false, language: 'en' });
  assert.ok(!/Simplified Chinese/.test(en));
  const zh = perRequestSystem({ date: '2026-09-08', effort: 'medium', singleShot: false, language: 'zh' });
  assert.match(zh, /Reply in Simplified Chinese \(简体中文\)\. Keep ids, part kinds, bus names, tool names, and field values exactly as they are\./);
  assert.ok(zh.startsWith('Today is 2026-09-08. Effort: medium.'));
  assert.equal(perRequestSystem({ date: '2026-09-08', effort: 'low', singleShot: true, language: 'zh' }).includes(SINGLE_SHOT_RULES), true);
  assert.equal(stableSystem(), stableSystem(), 'the stable block is unchanged by language');
});
```

Run: `node --test tests/ai-context.test.js` → FAIL.

- [ ] **Step 2: Implement**

`src/ai/prompt.js`:

```js
export const LANGUAGE_RULES = {
  zh: 'Reply in Simplified Chinese (简体中文). Keep ids, part kinds, bus names, tool names, and field values exactly as they are.',
};

export function perRequestSystem({ date, effort, singleShot, language = 'en' }) {
  let s = `Today is ${date}. Effort: ${effort}.`;
  if (LANGUAGE_RULES[language]) s += `\n${LANGUAGE_RULES[language]}`;
  if (singleShot) s += `\n\n${SINGLE_SHOT_RULES}`;
  return s;
}
```

`src/ui/assistant-ui.js` line 560: add `language: getLang()` to the object passed to `perRequestSystem` (`getLang` was imported in Task 9).

- [ ] **Step 3: Run and commit**

Run: `npm test` → green.

```bash
git add src/ai/prompt.js src/ui/assistant-ui.js tests/ai-context.test.js
git commit -m "i18n: the copilot answers in Chinese when the interface is Chinese"
```

---

### Task 12: The coverage test

**Files:**
- Create: `tests/i18n-coverage.test.js`
- Modify: `src/i18n/zh.js` (whatever the test reports missing; the schema-field entries below)

**Interfaces:**
- Consumes: every exported data table named in Global Constraints; the `tr(`-literal convention.

- [ ] **Step 1: Write the test**

```js
// Every English string the interface can show must have a Chinese entry, and
// every Chinese entry must still be shown somewhere. Sources of keys:
//  1. tr('literal') calls in src (single-line literal, no ${}).
//  2. Text nodes and title/placeholder/aria-label attributes in index.html.
//  3. The data tables that are translated where displayed (trd).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import zh from '../src/i18n/zh.js';
import { PARTS, CATEGORIES, DISPOSITIONS } from '../src/palette.js';
import { BUSES } from '../src/buses.js';
import { PRESETS } from '../src/presets.js';
import { RDK_PRODUCTS } from '../src/rdk/catalogue.js';
import { VIDEO_FORMATS } from '../src/recorder.js';
import { SIDES } from '../src/custom.js';
import { PROVIDERS, EFFORTS } from '../src/ai/settings.js';
import { EXAMPLE_GROUPS } from '../src/examples.js';
import { FLAG_META } from '../src/render.js';

const ROOT = new URL('../', import.meta.url).pathname;
const SKIP = ['src/i18n.js', 'src/i18n/'];
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js') && !SKIP.some((s) => relative(ROOT, p).startsWith(s))) files.push(p);
  }
})(join(ROOT, 'src'));

const LITERAL = /(?<![\w.$])tr\(\s*(?:'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\\n])*)`)/g;
const COMPUTED = /(?<![\w.$])tr\(\s*(?!['"`])/g;
const unescape = (s) => s.replace(/\\(.)/g, (m, c) => ({ n: '\n', t: '\t' }[c] ?? c));

const keys = new Map(); // English key -> first file that uses it
const computed = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const rel = relative(ROOT, f);
  for (const m of src.matchAll(LITERAL)) {
    const raw = m[1] ?? m[2] ?? m[3];
    if (m[3] !== undefined && raw.includes('${')) { computed.push(`${rel}: tr(\`...\${}\`)`); continue; }
    const key = unescape(raw);
    if (!keys.has(key)) keys.set(key, rel);
  }
  for (const m of src.matchAll(COMPUTED)) {
    const line = src.slice(0, m.index).split('\n').length;
    computed.push(`${rel}:${line}`);
  }
}

// index.html: strip scripts, styles, svg bodies (keep svg attributes) and
// keyboard keys; then take letter-bearing text nodes and the three attributes.
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/(<svg[^>]*>)[\s\S]*?<\/svg>/g, '$1')
  .replace(/<kbd>[^<]*<\/kbd>/g, '');
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', middot: '·', minus: '−', times: '×', lsaquo: '‹', rsaquo: '›', hellip: '…', mdash: '—', ndash: '–', rarr: '→', harr: '↔', nbsp: ' ' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(/^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENTITIES[e] ?? m;
});
const LETTER = /[A-Za-z]/;
for (const m of html.matchAll(/>([^<>]+)</g)) {
  const t = decode(m[1]).trim();
  if (LETTER.test(t) && !keys.has(t)) keys.set(t, 'index.html');
}
for (const m of html.matchAll(/\b(?:title|placeholder|aria-label)="([^"]*)"/g)) {
  const t = decode(m[1]).trim();
  if (LETTER.test(t) && !keys.has(t)) keys.set(t, 'index.html');
}

// Data tables shown through trd().
const data = new Set();
for (const p of Object.values(PARTS)) {
  data.add(p.name);
  if (p.defaultLabel) data.add(p.defaultLabel);
  for (const fd of p.fields || []) {
    data.add(fd.label);
    if (fd.placeholder) data.add(fd.placeholder);
    for (const o of fd.options || []) data.add(typeof o === 'string' ? o : o.label);
  }
}
for (const c of CATEGORIES) data.add(c.name);
for (const d of Object.values(DISPOSITIONS)) data.add(d.name);
for (const b of Object.values(BUSES)) data.add(b.name);
for (const list of Object.values(PRESETS)) for (const p of list) data.add(p.notes);
for (const p of RDK_PRODUCTS) {
  data.add(p.notes);
  for (const r of p.requirements) data.add(r);
  for (const s of p.sources) data.add(s.title);
}
for (const f of VIDEO_FORMATS) data.add(f.label);
for (const s of SIDES) data.add(s);
for (const p of Object.values(PROVIDERS)) data.add(p.help);
for (const e of EFFORTS) data.add(e);
for (const g of EXAMPLE_GROUPS) data.add(g);
for (const f of Object.values(FLAG_META)) data.add(f.label);
for (const d of data) if (!keys.has(d)) keys.set(d, 'data table');

test('every tr( call takes one single-line string literal', () => {
  assert.deepEqual(computed, []);
});

test('every interface string and data-table string has a Chinese entry', () => {
  const missing = [...keys.entries()].filter(([k]) => !Object.prototype.hasOwnProperty.call(zh, k)).map(([k, where]) => `${where}: ${JSON.stringify(k)}`);
  assert.deepEqual(missing, []);
});

test('no Chinese entry is orphaned', () => {
  const orphans = Object.keys(zh).filter((k) => !keys.has(k));
  assert.deepEqual(orphans, []);
});

test('placeholders in a Chinese value all exist in its English key', () => {
  const bad = [];
  for (const [k, v] of Object.entries(zh)) {
    const inKey = new Set([...k.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
    for (const m of v.matchAll(/\{(\w+)\}/g)) if (!inKey.has(m[1])) bad.push(`${k} -> {${m[1]}}`);
  }
  assert.deepEqual(bad, []);
});

test('the extraction saw the surfaces it expects', () => {
  assert.ok(keys.size > 500, `only ${keys.size} keys`);
  assert.equal(keys.get('Load an example board'), 'index.html');
  assert.equal(keys.get('MCU'), 'data table');
  assert.ok([...keys.values()].some((w) => w === 'src/drc.js'));
});
```

- [ ] **Step 2: Run it and add the entries it reports**

Run: `node --test tests/i18n-coverage.test.js`. Expected on first run: "every interface string…" FAILS listing the schema-field strings below plus anything a previous task missed; "no Chinese entry is orphaned" may list keys whose English source was worded differently from the dictionary key (fix the key to match the source, never the source). Add these entries, then fix every remaining item the test names until all five pass:

```js
  // ---- identity: brand ----
  'Schematica': 'Schematica',
  // ---- schema fields: labels ----
  'Package': '软件包',
  'Runtime (optional)': '运行时（可选）',
  'Target RDK board': '目标 RDK 板',
  'IP address': 'IP 地址',
  'DNS name': 'DNS 名称',
  'AS number': 'AS 号',
  'Prefix': '前缀',
  'Type (STIX)': '类型 (STIX)',
  'Sophistication (STIX)': '复杂度 (STIX)',
  'Motivation (STIX)': '动机 (STIX)',
  'Attribution': '归因',
  'Severity': '严重程度',
  'Account used': '使用的账户',
  'Family / variant': '家族 / 变种',
  'Size': '规模',
  'Campaign': '攻击活动',
  'Sender / lure address': '发件人 / 诱饵地址',
  'CVE / reference': 'CVE / 参考',
  'CVSS score': 'CVSS 评分',
  'Affected component': '受影响组件',
  'Control / CWE': '控制项 / CWE',
  'ATT&CK technique': 'ATT&CK 技术',
  'Vector': '攻击向量',
  'Volume': '流量',
  'Position': '位置',
  'Spoofed input': '被欺骗的输入',
  'Credential': '凭证',
  'Channel': '通道',
  'Data at risk': '受威胁的数据',
  'Access point': '接入点',
  // ---- schema fields: placeholders ----
  'e.g. hobot_dnn': '例如 hobot_dnn',
  'Not selected': '未选择',
  'e.g. 10.0.20.11': '例如 10.0.20.11',
  'e.g. web01.corp.local': '例如 web01.corp.local',
  'e.g. AS64500': '例如 AS64500',
  'e.g. 203.0.113.0/24': '例如 203.0.113.0/24',
  'e.g. group / country': '例如 组织 / 国家',
  'e.g. svc-build': '例如 svc-build',
  'e.g. LockBit 3.0': '例如 LockBit 3.0',
  'e.g. Mirai': '例如 Mirai',
  'e.g. 40k bots': '例如 4 万个僵尸节点',
  'e.g. Q3 invoice lure': '例如 三季度发票诱饵',
  'e.g. billing@example.net': '例如 billing@example.net',
  'e.g. 198.51.100.7': '例如 198.51.100.7',
  'e.g. cdn-update.example.net': '例如 cdn-update.example.net',
  'e.g. CVE-2025-1234': '例如 CVE-2025-1234',
  'e.g. 8.1': '例如 8.1',
  'e.g. bootloader': '例如 引导程序',
  'e.g. CWE-284, open debug port': '例如 CWE-284、开放的调试口',
  'e.g. T1190': '例如 T1190',
  'e.g. 40 Gbps': '例如 40 Gbps',
  'e.g. telemetry, keys': '例如 遥测数据、密钥',
  // ---- schema fields: option labels (values stay English) ----
  'activist': '激进分子 (activist)',
  'competitor': '竞争对手 (competitor)',
  'crime-syndicate': '犯罪集团 (crime-syndicate)',
  'criminal': '罪犯 (criminal)',
  'hacker': '黑客 (hacker)',
  'insider-accidental': '无意内部人员 (insider-accidental)',
  'insider-disgruntled': '不满内部人员 (insider-disgruntled)',
  'nation-state': '国家级 (nation-state)',
  'sensationalist': '博眼球者 (sensationalist)',
  'spy': '间谍 (spy)',
  'terrorist': '恐怖分子 (terrorist)',
  'unknown': '未知 (unknown)',
  'none': '无 (none)',
  'minimal': '极低 (minimal)',
  'intermediate': '中等 (intermediate)',
  'advanced': '高级 (advanced)',
  'expert': '专家 (expert)',
  'innovator': '创新者 (innovator)',
  'strategic': '战略级 (strategic)',
  'accidental': '意外 (accidental)',
  'coercion': '胁迫 (coercion)',
  'dominance': '支配 (dominance)',
  'ideology': '意识形态 (ideology)',
  'notoriety': '出名 (notoriety)',
  'organizational-gain': '组织利益 (organizational-gain)',
  'personal-gain': '个人利益 (personal-gain)',
  'personal-satisfaction': '个人满足 (personal-satisfaction)',
  'revenge': '报复 (revenge)',
  'unpredictable': '不可预测 (unpredictable)',
  'info': '信息',
  'critical': '严重',
  'insider-malicious': '恶意内部人员 (insider-malicious)',
  'insider-compromised': '被控内部人员 (insider-compromised)',
  'adware': '广告软件 (adware)',
  'backdoor': '后门 (backdoor)',
  'bot': '僵尸程序 (bot)',
  'bootkit': '引导套件 (bootkit)',
  'ddos': 'DDoS (ddos)',
  'downloader': '下载器 (downloader)',
  'dropper': '投放器 (dropper)',
  'exploit-kit': '漏洞利用套件 (exploit-kit)',
  'keylogger': '键盘记录器 (keylogger)',
  'ransomware': '勒索软件 (ransomware)',
  'remote-access-trojan': '远程访问木马 (remote-access-trojan)',
  'rootkit': 'Rootkit (rootkit)',
  'screen-capture': '屏幕捕获 (screen-capture)',
  'spyware': '间谍软件 (spyware)',
  'trojan': '木马 (trojan)',
  'virus': '病毒 (virus)',
  'webshell': 'Webshell (webshell)',
  'wiper': '擦除器 (wiper)',
  'worm': '蠕虫 (worm)',
  'dependency': '依赖项',
  'build system': '构建系统',
  'firmware image': '固件镜像',
  'vendor access': '供应商访问',
  'hardware implant': '硬件植入',
  'volumetric': '流量型',
  'protocol': '协议型',
  'application': '应用层',
  'amplification': '放大型',
  'LAN': '局域网',
  'Wi-Fi': 'Wi-Fi',
  'cellular': '蜂窝网络',
  'CAN bus': 'CAN 总线',
  'GNSS': 'GNSS',
  'OTA path': 'OTA 路径',
  'camera': '摄像头',
  'radar': '雷达',
  'lidar': '激光雷达',
  'RF key': '射频钥匙',
  'ultrasonic': '超声波',
  'password': '密码',
  'signing key': '签名密钥',
  'certificate': '证书',
  'session token': '会话令牌',
  'SIM / eSIM': 'SIM / eSIM',
  'HTTPS': 'HTTPS',
  'DNS': 'DNS',
  'removable media': '可移动介质',
  'Bluetooth': '蓝牙',
  'debug port': '调试口',
  'ECU housing': 'ECU 外壳',
  'harness': '线束',
  'key fob': '车钥匙',
  'charging port': '充电口',
```

Keys that already exist are not repeated: `low`, `medium`, `high` (efforts and severities share them), `USB`, `CAN`, `API key`, `OBD-II` is new (`'OBD-II': 'OBD-II'`), `'CAN'` is the bus entry. If the test reports a duplicate-looking key with different casing (`'Unknown'` disposition vs `'unknown'` option), both exist on purpose.

- [ ] **Step 3: Run everything and commit**

Run: `npm test` → green, including the five coverage tests.

```bash
git add tests/i18n-coverage.test.js src/i18n/zh.js
git commit -m "i18n: coverage test proves the dictionary complete and orphan-free"
```

---

### Task 13: Browser checks, README, and the final gate

**Files:**
- Modify: `tests/e2e/smoke.mjs` (after the language checks added in Task 3)
- Modify: `README.md:52` (new table row after Examples)

- [ ] **Step 1: Browser checks in Chinese**

Directly after the `check('the switch goes back to English and stores en', ...)` line from Task 3, add:

```js
  // ---- Chinese mode across the panels: palette, checker, menu, a placed part ----
  await loadBoard(EXAMPLES.find((e) => e.id === 'rdk-rover').doc);
  await js(`document.getElementById('btn-lang').click(); true`);
  await sleep(150);
  const palette = await js(`[...document.querySelectorAll('#palette h3')].map((h) => h.textContent.trim())`);
  check('the palette headings are Chinese', palette.includes('我的部件') && palette.includes('计算') && palette.includes('机器人'), JSON.stringify(palette));
  await js(`document.getElementById('btn-check').click(); true`);
  await sleep(150);
  const drc = await js(`(() => { const rows = [...document.querySelectorAll('#drc-list .drc-row')]; return { n: rows.length, level: rows[0]?.querySelector('.drc-level')?.textContent, msg: rows[0]?.querySelector('.msg')?.textContent, buttons: [...(rows[0]?.querySelectorAll('button') || [])].map((b) => b.textContent) }; })()`);
  check('the design-rule dialog reports in Chinese', drc.n > 0 && ['错误', '警告'].includes(drc.level) && /[一-鿿]/.test(drc.msg) && JSON.stringify(drc.buttons) === JSON.stringify(['选中', '修复']), JSON.stringify(drc));
  await js(`document.getElementById('drc-close').click(); true`);
  await sleep(100);
  await js(`document.getElementById('btn-examples').click(); true`);
  await sleep(100);
  const menuZh = await js(`[...document.querySelectorAll('#examples-menu .menu-group')].map((h) => h.textContent)`);
  check('the Examples menu groups are Chinese', JSON.stringify(menuZh) === JSON.stringify(['嵌入式', '车辆', '安全']), JSON.stringify(menuZh));
  await key('Escape', 'Escape', 27);
  await sleep(100);
  const before = await js(`document.querySelectorAll('#canvas g.node').length`);
  await js(`document.querySelector('#palette .palette-item[data-kind="mcu"]').click(); true`);
  await sleep(150);
  const placed = await js(`(() => { const labels = [...document.querySelectorAll('#canvas g.node text')].map((t) => t.textContent); return { n: document.querySelectorAll('#canvas g.node').length, hasZh: labels.includes('微控制器') }; })()`);
  check('a part placed in Chinese mode gets a Chinese default label', placed.n === before + 1 && placed.hasZh, JSON.stringify(placed));
  const props = await js(`(() => { const p = document.getElementById('props'); return { hidden: p.hidden, header: p.querySelector('h3')?.textContent.replace(/[▾▸]/g, '').trim(), labels: [...p.querySelectorAll('label')].map((l) => l.textContent) }; })()`);
  check('the properties panel is Chinese for the new part', props.hidden === false && props.header === '微控制器' && props.labels.includes('型号') && props.labels.includes('电压轨'), JSON.stringify(props));
  await js(`document.getElementById('btn-lang').click(); true`);
  await sleep(150);
  const back = await js(`(() => ({ examples: document.getElementById('btn-examples').textContent.trim(), first: [...document.querySelectorAll('#palette h3')].map((h) => h.textContent.trim()) }))()`);
  check('switching back re-renders the palette in English', back.examples.startsWith('Examples') && back.first.includes('Compute') && back.first.includes('My parts'), JSON.stringify(back));
```

Read `tests/e2e/smoke.mjs` around the palette-click checks that already exist (search for `palette-item`) and copy its way of clicking a tile if it differs from a plain `.click()` (the tile may need a real pointer press through `center` + `click`).

- [ ] **Step 2: README**

After the `| Examples | ... |` row (line 52) insert:

```
| Language | 中文 / EN button in the toolbar — switches the interface, palette, checker messages, and the copilot's replies between English and Simplified Chinese; English by default; remembered on this device; a board's own text is never translated |
```

- [ ] **Step 3: Final gate**

Run: `npm test && npm run e2e`
Expected: every unit test green; e2e prints `151/151 checks passed` (142 baseline + 3 from Task 3 + 6 here) and `no console errors or exceptions`. Then take one screenshot of the rover board in Chinese with the headless share-link method used in this repo (see the memory note on screenshots) and confirm Chinese card labels fit their cards; if a label overflows, raise the CJK factor in `textUnits` from 1.9 to 2.0 and re-run `tests/geometry.test.js`.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/smoke.mjs README.md
git commit -m "i18n: browser checks for Chinese mode and the README row"
```

---

## Phase 2 hand-off

Phase 2 (the example-board overlays, `localizedExample`, their completeness test, and the browser check that loads an example in Chinese) gets its own plan once this one is on main. Nothing in this plan changes `src/examples.js` or `src/rdk/examples.js`.
