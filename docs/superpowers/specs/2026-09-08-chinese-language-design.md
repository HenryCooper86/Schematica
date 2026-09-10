# Schematica Simplified Chinese — Design Spec

**Date:** 2026-09-08
**Status:** Approved in chat on 2026-09-08 (scope, selection, approach, and the
sectioned design); spec pending the user's review

## Summary

Schematica is English only. This release adds **Simplified Chinese as a second
interface language**. English stays the default: the app opens in English on
every device until the user picks 中文 from a toolbar switch, and that choice
is remembered on the device. Switching is live, with no reload and no loss of
undo history.

Everything a user reads translates: the toolbar, menus, dialogs, panels, hint
bar, part editor and assistant chrome; palette part, category and bus names;
vendor preset notes; design-rule and RDK finding messages; the exported RDK
setup guide; and, in a second phase, the labels, notes, zone labels and journey
captions of the 21 example boards. The AI copilot is told to answer in Chinese
when the interface is Chinese.

The mechanism is one function, `tr`, keyed by the English string itself. A
single dictionary maps English to Chinese; anything missing falls back to the
English text; a coverage test proves the dictionary complete and free of
orphans, so a reworded English string fails the build instead of silently
losing its translation.

## Goals

1. A live English/Chinese switch that is remembered per device and defaults to
   English regardless of the browser locale.
2. Every interface string, data-table name, and checker message readable in
   Chinese; English source text untouched at rest.
3. Chinese labels lay out correctly on cards and flow shapes.
4. The copilot replies in Chinese when the interface is Chinese, without
   disturbing the cached stable prompt.
5. A dictionary that cannot drift: complete, orphan-free, enforced by a test.
6. Example boards readable in Chinese (phase 2), with the English boards and
   their tests byte-identical.

## Non-goals (this release)

- Traditional Chinese or any third language. The mechanism supports another
  dictionary later; none ships now.
- Translating user documents. A board is data; switching language never
  rewrites a board's own text. Only the built-in examples carry translations.
- Translating ids, part kinds, bus codes on wire pills (PWR, CSI, T1), part
  numbers and preset sublabels (RDK X5, Journey 6M), tool names, or the
  copilot's stable system prompt and catalogue text.
- Locale-aware numbers, dates, sorting, or right-to-left layout.
- Following the browser language, a `?lang=` URL parameter, or a keyboard
  shortcut for the switch.
- A Chinese README. A door left open, below.

## Decisions

- **English-keyed dictionary.** `tr('Load an example board')` looks up the
  English text; the code keeps saying what it says. No id scheme.
- **The function is `tr`, not `t`.** Fourteen modules already use `t` as a
  local variable (DOM targets, notes, templates); `tr` collides with nothing.
- **Fallback to English, never to a key.** A missing entry shows English.
- **Live switch.** Static markup is re-translated in place; panels that render
  themselves redraw on a language-change event. No reload.
- **Data stays English at rest, translated where shown.** Palette, buses,
  presets, catalogue and checker tables are not rewritten; the code that
  displays them calls `tr`.
- **New content defaults follow the language.** In Chinese a new MCU card,
  zone, note or board gets a Chinese default label. That text then belongs to
  the document like any user-typed text.
- **Official Chinese vendor names in prose**, part numbers as typed: 地平线 for
  Horizon, 征程 for Journey, 地瓜机器人 for D-Robotics inside notes and
  messages; the preset sublabel `Journey 6M` and the catalogue name
  `RDK X5` stay Latin so presets and profiles keep matching.
- **Latin terms that stay Latin are explicit identity entries** (BOM, PNG,
  SVG, PDF, GIF, OK, CAN FD). The coverage test treats an identity entry as
  a deliberate choice, not a gap.
- **Two phases.** Phase 1 is the mechanism, the switch, all chrome and data
  text, the copilot line, and CJK sizing. Phase 2 is the example overlays.
  Each gets its own implementation plan.

## Core: `src/i18n.js`

Pure, no DOM. Exports:

- `LANGS = ['en', 'zh']`, `STORAGE_KEY = 'schematica.lang'`.
- `initI18n({ storage })` binds the storage once (defaults to `localStorage`
  when defined, else an in-memory map); tests pass a fake.
- `getLang()` → `'en' | 'zh'`. Read lazily from the bound storage on
  first call; anything but `'zh'` is `'en'`.
- `setLang(lang)` — validates, stores, sets `document.documentElement.lang`
  to `zh-CN` or `en` when a document exists, notifies listeners. Setting the
  current language again is a no-op.
- `onLanguageChange(fn)` → unsubscribe. Listeners run synchronously in
  registration order.
- `tr(text, vars)` — in English returns `text` with `{name}` placeholders
  filled from `vars`; in Chinese looks `text` up in the dictionary first, then
  fills placeholders. A key absent from the dictionary returns the English
  text. A placeholder absent from `vars` is left literally as `{name}` so a
  test can see it. `tr` never throws on non-string input; it stringifies.
- `trd(value)` — the same lookup for a value read from a data table (a part
  name, a bus name, a preset note), with no placeholder filling. `tr(` always
  takes a literal; data goes through `trd(`, so the coverage test can tell
  the two apart.

Conventions the coverage test relies on:

- A `tr` call's first argument is always **one single-line string literal**
  (`'...'`, `"..."`, or a backtick literal with no `${}`), never an
  expression. Interpolation goes through `{name}` placeholders and `vars`.
- Keys are trimmed English phrases with their final punctuation. English
  conjugation gets separate keys (`'{names} is not wired to anything.'` and
  `'{names} are not wired to anything.'` both exist; Chinese maps both to
  one sentence).
- Data-table strings are translated at the point of display, never stored
  translated.

## Dictionary: `src/i18n/zh.js`

`export default { 'English key': '中文', ... }`, grouped by surface with a
comment per group (toolbar, dialogs, palette, buses, presets, checker, RDK,
guide, assistant, examples menu). Phase 1 is roughly 600 entries. Values are
Simplified Chinese; identity entries are allowed for Latin terms. Placeholders
keep their English names inside the Chinese value (`'{part} 已加入“我的部件”。'`).

Terminology, fixed here so every surface agrees:

| English | 中文 |
|---|---|
| board | 板图 |
| part | 部件 |
| wire | 连线 |
| bus | 总线 |
| port / pin | 端口 / 引脚 |
| zone | 区域 |
| swimlane / lane | 泳道 |
| note | 便签 |
| journey / step / present | 导览 / 步骤 / 演示 |
| design rule check | 设计规则检查 |
| bill of materials | 物料清单 (button text stays BOM) |
| preset / part number | 预设 / 型号 |
| custom part / My parts | 自定义部件 / 我的部件 |
| assistant / copilot | 助手 |
| finding: error / warning | 错误 / 警告 |
| rail / address | 电压轨 / 地址 |
| unverified | 未经验证 |

## Static markup: `src/ui/i18n-dom.js`

`translateStatic()` walks the toolbar (`#toolbar`), the palette
search input, the hint bar, the present overlay's nav, and every `<dialog>`
(`part-dialog`, and the recording, export, DRC and BOM dialogs). For each text
node whose trimmed text contains an ASCII letter it remembers the original English
in a `WeakMap` on first visit, then writes `tr(original)` back, preserving the
surrounding whitespace. For each element it does the same for the `title`,
`placeholder` and `aria-label` attributes. Only those roots are visited, so the canvas, the
palette body and the self-rendering containers (`#props`, `#journey-panel`,
`#assistant`, `#legend`, `#examples-menu`, `#bus-popover`, `#toast`) are never
touched; input values are never touched; text nodes under a
`[data-i18n="off"]` element are left alone while its attributes still
translate. The walker records what it translated on the first pass and
replays that list on every change; the part editor rebuilds its own lists.

Markup touch-ups so keys are clean phrases: each hint-bar word becomes its own
`<span>` (`<kbd>V</kbd> <span>select</span>`), separators stay bare text; the
Examples button becomes `Examples <span aria-hidden="true">&#9662;</span>`.
Text nodes without an ASCII letter (separators, `100%`, `+`, entity arrows)
are not keys.

## The switch: `#btn-lang`

One toolbar button in the right-hand group beside Examples. Its text is `中文`
while English is showing and `EN` while Chinese is showing; its title is
`Switch language` / `切换语言` (the title translates like any other). Clicking
calls `setLang` with the other language. The button carries
`data-i18n="off"` so the walker leaves its text alone; the switch module sets
that text itself on init and on every change, while the title translates
through the walker like any other attribute.
The toolbar remains one row.

## Modules that render text

Each module that writes user-facing strings wraps them in `tr` and, where it
holds rendered text, subscribes with `onLanguageChange` inside its own `init`
and redraws. No central list in `main.js`; `main.js` only calls
`translateStatic()` before initialising panels and re-renders the SVG on
change (flag labels are drawn there).

| Module | What translates | On change |
|---|---|---|
| `src/ui/press.js` | `toast` messages come already translated by callers; the Undo action label | — |
| `src/ui/dialogs.js` | export, DRC, BOM, share and file dialogs; confirm prompts; DRC level names | re-render open dialog bodies |
| `src/ui/examples-menu.js` | group headings via `tr`; example names via `localizedExample` (phase 2) | menu is rebuilt on open |
| `src/ui/palette-ui.js` | category headings, part names, My parts header and buttons, tooltips, toasts | rebuild the palette |
| `src/ui/legend.js` | bus names (codes stay) | rebuild |
| `src/ui/props.js` | field labels, placeholders, status and flag names, section titles, guide download button | re-render from the store |
| `src/ui/rdk-details.js` | headings, requirement lines via `tr`, facts | re-render |
| `src/ui/part-editor.js` | dialog headings, tabs, validation messages, side names | rebuilds its own lists |
| `src/ui/journey-ui.js` | panel headings, buttons, counters, default step label | re-render |
| `src/ui/recording-ui.js` | dialog text, states, toasts | re-render |
| `src/ui/panels.js`, `src/ui/collapsible.js` | fold/hide button titles | re-render titles |
| `src/ui/assistant-ui.js`, `src/ui/assistant-documents.js` | header, states, settings labels, composer placeholder, quick actions, source summaries, error toasts | re-render chrome; the thread's stored messages are left as they were written |
| `src/render.js` | node flag labels (`Power hungry`, `Long lead time`, `Safety critical`) | SVG re-render from `main.js` |
| `src/state.js` | default labels: `newDoc(t('Untitled Board'))`, `addNode` uses `tr(defaultLabel or name)` for built-in kinds; custom-part names are never translated, zone `tr('Zone')`, note `tr('Note')`, swimlane and flow-shape defaults | — (defaults are read at creation) |
| `src/search.js` | haystack adds `tr(name)` for part, category, bus names and preset notes, so Chinese queries match while English still does | — |
| `src/bom.js`, BOM dialog | column headers and built-in part names translate in the dialog and the CSV/Markdown exports; custom-part names stay as typed | dialog re-render |
| `src/drc.js` | every message through `tr` with placeholders; rule ids unchanged | findings are recomputed on open |
| `src/rdk/checks.js` | messages and reason strings through `tr`; catalogue requirements through `tr`; source URLs untouched | recomputed |
| `src/rdk/guide.js` | headings, fixed sentences, checklist through `tr`; content and URLs untouched | export is on demand |
| `src/rdk/catalogue.js` | not rewritten; `notes`, `requirements` and source `title` values are translated by the displaying code | — |
| `src/presets.js` | not rewritten; `notes` translated when shown in the datalist tooltip, props and search | — |

Wire pill codes (`BUSES[x].short`) are never translated; the legend translates
`BUSES[x].name`.

## Copilot: `src/ai/prompt.js`

`perRequestSystem({ date, effort, singleShot, language })` appends, when
`language === 'zh'`, one line:

> Reply in Simplified Chinese (简体中文). Keep ids, part kinds, bus names,
> tool names, and field values exactly as they are.

Its caller in `src/ui/assistant-ui.js` passes `getLang()`. `stableSystem()` and the catalogue text are
byte-identical to today, so provider caching is unaffected. Assistant chrome
translates like any panel; stored thread messages are not rewritten.

Checker messages the copilot reads — the `run_checks` tool result, the
board-context findings, and the Fix quick-action prompts — follow the
interface language, while rule ids, part ids and source URLs stay English;
`rdk_reference` stays English because it is reference material.

## Geometry: CJK widths in `src/geometry.js`

`textUnits(s)` sums per code point: CJK Unified Ideographs (U+4E00–U+9FFF),
Extension A (U+3400–U+4DBF), CJK symbols and punctuation (U+3000–U+303F),
kana (U+3040–U+30FF), Hangul syllables (U+AC00–U+D7AF), and halfwidth and
fullwidth forms (U+FF00–U+FFEF) count 1.9; everything else counts 1.
`nodeSize` and `shapeSize` replace `.length` with `textUnits(...)` for the
label and every meta line. For pure Latin text `textUnits` equals `.length`,
so every English board keeps its exact geometry; the existing example
zone-containment tests are the regression guard. Fonts are not changed: the
`lang` attribute lets the browser choose its CJK face; the monospace meta
lines fall back per glyph. If screenshots show a problem, a CJK face is added
to the two font stacks in `css/style.css`. Note wrapping (`wrapText`) breaks
CJK text per character and measures each line in text units rather than
splitting only on whitespace, and zone label pills size by text units rather
than character count, so English output is unchanged and Chinese notes and
pills fit their boxes.

## Example boards (phase 2): `src/i18n/examples.zh.js`

One overlay per example id:

```js
export default {
  'rdk-rover': {
    name: 'RDK X5 漫游车（地瓜机器人）',
    title: 'RDK X5 漫游车',
    nodes: { n1: { label: '电池' }, n3: { label: '机器人主控', notes: '...' } },
    notes: { t1: '...' },
    zones: { z1: { label: '电源' }, zs: { label: 'X5 上的软件 · 未选择运行时' } },
    journey: { j1: { label: '供电与计算', caption: '...' } },
    wires: { sw1: '逻辑流' },
  },
};
```

`localizedExample(example, lang)` in `src/examples.js` (pure) returns the
example unchanged for English and, for Chinese, a copy with the overlay
applied to `name`, `doc.title`, node `label` and `notes`, note `text`, zone
`label` and (for swimlanes) `lanes`, journey `label` and `caption`, and wire
`label` (via `wires: { id: label }`). Sublabels, fields, ids, positions,
endpoints, `arrow`, `style` and `flow` are never touched. Word-like wire
labels translate; code-like labels (bus codes, voltages, pin names) never
do, and the test enforces the split. The examples menu and its loader use
`localizedExample`. The English `EXAMPLES` array and every existing test are
byte-identical. Roughly 500 strings.

## Implementation order

Phase 1, one plan:

1. `src/i18n.js` with unit tests; the dictionary file starts with the
   terminology table and grows with each step.
2. `textUnits` and CJK sizing with unit tests.
3. `translateStatic`, the markup touch-ups, `#btn-lang`, `main.js` wiring;
   a browser check that the switch translates the toolbar and persists.
4. Module strings, one module per commit, in this order: dialogs, examples
   menu, palette, legend, props and rdk-details, part editor, journey,
   recording, panels, assistant.
5. Data tables and messages: state defaults, search, render flags, BOM, DRC,
   RDK checks, guide.
6. Copilot language line.
7. Coverage test, then the remaining browser checks, then the README row.

Phase 2, one plan: the overlay file, `localizedExample`, menu and loader
wiring, the completeness test, a browser check that loads an example in
Chinese, and screenshots of two Chinese boards.

## Testing

Unit (`node --test`):

- `tests/i18n.test.js`: English passthrough with placeholders; Chinese lookup;
  fallback to English on a missing key; literal `{name}` kept when `vars`
  lacks it; `setLang` validates, persists to an injected storage, notifies
  once, and ignores a repeat; `getLang` defaults to English for absent or
  junk storage.
- `tests/i18n-coverage.test.js`: extracts every `tr(` literal from `src`
  (single-line literal rule), every ASCII-letter-bearing text node and every
  `title`, `placeholder` and `aria-label` from `index.html`, and every
  data-table string (part names and default labels, category names, bus
  names, preset notes, status and flag labels, catalogue notes, requirements
  and source titles). Asserts every extracted key is in the dictionary, every
  dictionary key is extracted (no orphans), no value is empty, and no `tr(`
  call uses a computed first argument.
- `tests/geometry.test.js` additions: a Chinese label is wider than a Latin
  label of the same length; ASCII `textUnits` equals `.length`; a mixed
  string counts each class correctly.
- `tests/drc.test.js`, `tests/rdk-checks.test.js`: messages in Chinese under
  `setLang('zh')`, then restored to English.
- `tests/ai-*.test.js`: the per-request block carries the Chinese line only
  when `language` is `zh`; the stable block is unchanged.
- Phase 2, `tests/examples-zh.test.js`: every example has an overlay; every
  overlay id exists on its board; every label, notes, note text, zone label,
  journey label and caption has an entry; `localizedExample` leaves English
  untouched, never mutates the source, and never changes sublabels, fields,
  ids or geometry.

Browser (`tests/e2e/smoke.mjs`), default English preserved since `loadBoard`
clears local storage:

- Click `#btn-lang`: `html[lang]` is `zh-CN`, the Examples button reads
  `示例`, the first palette heading reads `计算`, the button now reads `EN`.
- Reload: still Chinese.
- Open the DRC dialog on a board with findings: a message contains CJK.
- Open the examples menu: group headings are Chinese.
- Click `#btn-lang` again: English everywhere, storage holds `en`.
- Phase 2: load an example in Chinese and assert a node label is Chinese
  while its sublabel is unchanged.

The e2e count of examples is unaffected. Screenshots of a Chinese board are
taken with the headless share-link method to check widths by eye.

## Doors left open

- A Chinese README section, and translating the docs folder.
- A third dictionary (Traditional Chinese, Japanese) is one file plus a
  `LANGS` entry; the coverage test would need to loop languages.
- Following the browser locale on first visit, if the default ever changes.
- Translating a user's own board via the copilot ("translate every label")
  is an assistant feature, not an interface-language feature.
