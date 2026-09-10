# Simplified Chinese Interface, Phase 2 (Example Boards) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Chinese mode the Examples menu lists the 21 built-in boards by Chinese name and loads them with Chinese labels, notes, zone labels, lane names and journey captions, while the English boards and every existing test stay byte-identical.

**Architecture:** One data file, `src/i18n/examples.zh.js`, holds a per-board overlay keyed by node, zone, note and journey ids. A pure `localizedExample(example, lang)` in `src/examples.js` returns the example unchanged for English and, for Chinese, a deep copy with the overlay applied to `name`, `doc.title`, node `label`/`notes`, zone `label`/`lanes`, note `text`, and journey `label`/`caption`; part numbers, fields, ids, positions and wires are never touched. The examples menu localises before it renders a label, before it confirms, and before it loads. A completeness test proves every text field of every board has a Chinese entry, every entry points at a real id, and every entry actually contains Chinese.

**Tech Stack:** Static ES modules, no build step, no dependencies. Unit tests with Node's built-in runner (`node --test`); browser smoke test over the Chrome DevTools Protocol (`npm run e2e`).

**Spec:** `docs/superpowers/specs/2026-09-08-chinese-language-design.md`, section "Example boards (phase 2)". Phase 1 (everything else) is on main.

## Global Constraints

- No new runtime dependencies; no build step; plain ES modules.
- `src/examples.js`'s `EXAMPLES` array and `src/rdk/examples.js` are never edited: the English boards and every existing test stay byte-identical. `localizedExample` returns the very same object (`===`) for English and never mutates its input.
- Only these fields translate: example `name`, `doc.title`, node `label` and `notes`, zone `label` and `lanes`, note `text`, journey `label` and `caption`. Never `sublabel` (part numbers), `fields`, ids, `kind`, positions, colours, wires, `status`, `flags`.
- Overlay shape, per example id: `{ name, title, nodes: { id: { label?, notes? } }, zones: { id: { label?, lanes? } }, notes: { id: text }, journey: { id: { label?, caption? } } }`. (The spec shows zones as bare strings; this plan amends that to objects so swimlane lanes can travel too — Task 8 records the amendment in the spec.)
- Every overlay string contains at least one CJK character (U+4E00–U+9FFF). Vendor names in prose: 地平线 (Horizon), 征程 (Journey), 地瓜机器人 (D-Robotics); product names such as RDK X5, GS130W, Journey 6M, ESP32-S3, BME280 stay Latin inside sentences. Terminology from the spec: 板图, 部件, 连线, 总线, 端口, 引脚, 区域, 泳道, 便签, 导览, 步骤, 电压轨, 未经验证; full-width Chinese punctuation (，。；：（）) inside Chinese sentences.
- The overlay data file lives under `src/i18n/`, which the phase-1 coverage test skips on purpose; overlays contain no `tr(` calls.
- The examples menu label, the `confirm` text and the loaded document all come from the same `localizedExample` result; localisation happens before `deserialize(serialize(doc))`.
- A board loaded in Chinese is a document: switching the interface back to English does not rewrite it (a browser check asserts this).
- Commits carry **no** `Co-Authored-By` or `Claude-Session` trailers (repo rule; the sole contributor is HenryCooper86).
- Run `npm test` before every commit. Task 2 and Task 8 also run `npm run e2e` (needs Chrome; `CHROME_PATH` overrides).
- Baseline on main before this plan: 472 unit tests, 153 e2e checks, all passing.
- Unit tests that call `setLang('zh')` restore `setLang('en')` in a `finally`.

## File map

| File | Responsibility |
|---|---|
| `src/i18n/examples.zh.js` (new) | `export default { [exampleId]: overlay }` for all 21 boards, one board per task batch |
| `src/examples.js` | `localizedExample(example, lang)`; imports the overlays; `EXAMPLES` untouched |
| `src/ui/examples-menu.js` | menu labels, confirm text and loaded document through `localizedExample(ex, getLang())` |
| `tests/examples-zh.test.js` (new) | semantics of `localizedExample`; per-overlay completeness and validity; (Task 8) every board has an overlay |
| `tests/e2e/smoke.mjs` | one browser check: an example loaded in Chinese |
| `README.md`, spec | Language row wording; zones-as-objects amendment |

---

### Task 1: `localizedExample` and the first overlay

**Files:**
- Create: `src/i18n/examples.zh.js`
- Modify: `src/examples.js` (add one import at the top and one exported function at the bottom)
- Test: `tests/examples-zh.test.js`

**Interfaces:**
- Produces: `localizedExample(example, lang = 'en')` exported from `src/examples.js`; `EXAMPLE_OVERLAYS_ZH` (the default export of `src/i18n/examples.zh.js`, re-exported from `src/examples.js` as a named export so tests can iterate it). Later tasks only append overlays to the data file.

- [ ] **Step 1: Write the failing tests**

Create `tests/examples-zh.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES, localizedExample, EXAMPLE_OVERLAYS_ZH } from '../src/examples.js';
import { serialize, deserialize } from '../src/serialize.js';

const CJK = /[一-鿿]/;
const byId = (id) => EXAMPLES.find((e) => e.id === id);

test('English returns the very same example object, untouched', () => {
  const ex = byId('weather-station');
  assert.equal(localizedExample(ex), ex);
  assert.equal(localizedExample(ex, 'en'), ex);
  assert.equal(localizedExample(ex, 'fr'), ex, 'an unknown language is English');
});

test('Chinese returns a copy with the overlay applied and the source untouched', () => {
  const ex = byId('weather-station');
  const before = JSON.stringify(ex);
  const zh = localizedExample(ex, 'zh');
  assert.notEqual(zh, ex);
  assert.notEqual(zh.doc, ex.doc);
  assert.equal(JSON.stringify(ex), before, 'no mutation');
  assert.equal(zh.id, 'weather-station');
  assert.equal(zh.group, ex.group);
  assert.equal(zh.name, '气象站');
  assert.equal(zh.doc.title, '气象站');
  const mcu = zh.doc.nodes.find((n) => n.id === 'n5');
  assert.equal(mcu.label, '微控制器');
  assert.match(mcu.notes, CJK);
  assert.equal(mcu.sublabel, 'ESP32-S3', 'part numbers never translate');
  assert.equal(zh.doc.zones[0].label, '电源');
  assert.match(zh.doc.notes[0].text, CJK);
  assert.equal(zh.doc.journey[0].label, '供电路径');
  assert.match(zh.doc.journey[0].caption, CJK);
});

test('a Chinese copy keeps every non-text field and round-trips through the serializer', () => {
  const ex = byId('weather-station');
  const zh = localizedExample(ex, 'zh');
  const strip = (doc) => ({
    ...doc,
    title: '',
    nodes: doc.nodes.map((n) => ({ ...n, label: '', notes: '' })),
    zones: doc.zones.map((z) => ({ ...z, label: '', lanes: undefined })),
    notes: doc.notes.map((t) => ({ ...t, text: '' })),
    journey: doc.journey.map((j) => ({ ...j, label: '', caption: '' })),
  });
  assert.deepEqual(strip(zh.doc), strip(ex.doc));
  const { doc, warnings } = deserialize(serialize(zh.doc));
  assert.deepEqual(warnings, []);
  assert.deepEqual(doc, zh.doc);
});

// Every overlay that exists is complete for its board and points only at
// real ids. Task 8 adds the assertion that every board has an overlay.
for (const [id, overlay] of Object.entries(EXAMPLE_OVERLAYS_ZH)) {
  test(`overlay ${id} is complete, valid, and Chinese`, () => {
    const ex = byId(id);
    assert.ok(ex, `overlay for unknown example "${id}"`);
    const { doc } = ex;
    const chinese = (value, where) => {
      assert.equal(typeof value, 'string', where);
      assert.ok(value.trim().length > 0, `${where} is empty`);
      assert.match(value, CJK, `${where} has no Chinese: ${value}`);
    };
    chinese(overlay.name, `${id}.name`);
    chinese(overlay.title, `${id}.title`);
    for (const n of doc.nodes) {
      const o = overlay.nodes?.[n.id];
      if (n.label) { assert.ok(o?.label !== undefined, `${id}.nodes.${n.id}.label missing`); chinese(o.label, `${id}.nodes.${n.id}.label`); }
      if (n.notes) { assert.ok(o?.notes !== undefined, `${id}.nodes.${n.id}.notes missing`); chinese(o.notes, `${id}.nodes.${n.id}.notes`); }
    }
    for (const z of doc.zones) {
      const o = overlay.zones?.[z.id];
      assert.ok(o?.label !== undefined, `${id}.zones.${z.id}.label missing`);
      chinese(o.label, `${id}.zones.${z.id}.label`);
      if (z.lanes) {
        assert.ok(Array.isArray(o.lanes) && o.lanes.length === z.lanes.length, `${id}.zones.${z.id}.lanes must have ${z.lanes.length} entries`);
        o.lanes.forEach((lane, i) => chinese(lane, `${id}.zones.${z.id}.lanes[${i}]`));
      } else {
        assert.equal(o.lanes, undefined, `${id}.zones.${z.id} has lanes but the zone is not a swimlane`);
      }
    }
    for (const t of doc.notes) chinese(overlay.notes?.[t.id], `${id}.notes.${t.id}`);
    for (const j of doc.journey) {
      const o = overlay.journey?.[j.id];
      chinese(o?.label, `${id}.journey.${j.id}.label`);
      chinese(o?.caption, `${id}.journey.${j.id}.caption`);
    }
    // No entry may point at an id or a field the board does not have.
    const nodeIds = new Set(doc.nodes.map((n) => n.id));
    for (const [nid, o] of Object.entries(overlay.nodes || {})) {
      assert.ok(nodeIds.has(nid), `${id}.nodes.${nid} is not on the board`);
      for (const k of Object.keys(o)) assert.ok(['label', 'notes'].includes(k), `${id}.nodes.${nid}.${k} is not translatable`);
    }
    const zoneIds = new Set(doc.zones.map((z) => z.id));
    for (const [zid, o] of Object.entries(overlay.zones || {})) {
      assert.ok(zoneIds.has(zid), `${id}.zones.${zid} is not on the board`);
      for (const k of Object.keys(o)) assert.ok(['label', 'lanes'].includes(k), `${id}.zones.${zid}.${k} is not translatable`);
    }
    const noteIds = new Set(doc.notes.map((t) => t.id));
    for (const tid of Object.keys(overlay.notes || {})) assert.ok(noteIds.has(tid), `${id}.notes.${tid} is not on the board`);
    const stepIds = new Set(doc.journey.map((j) => j.id));
    for (const [jid, o] of Object.entries(overlay.journey || {})) {
      assert.ok(stepIds.has(jid), `${id}.journey.${jid} is not on the board`);
      for (const k of Object.keys(o)) assert.ok(['label', 'caption'].includes(k), `${id}.journey.${jid}.${k} is not translatable`);
    }
    for (const k of Object.keys(overlay)) assert.ok(['name', 'title', 'nodes', 'zones', 'notes', 'journey'].includes(k), `${id}.${k} is not an overlay field`);
    // Applying it reaches every translated field.
    const zh = localizedExample(ex, 'zh');
    assert.equal(zh.name, overlay.name);
    assert.equal(zh.doc.title, overlay.title);
  });
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/examples-zh.test.js`
Expected: FAIL — `localizedExample` and `EXAMPLE_OVERLAYS_ZH` are not exported (`SyntaxError: The requested module ... does not provide an export named ...`).

- [ ] **Step 3: Write the data file with the first board**

Create `src/i18n/examples.zh.js`:

```js
// Simplified Chinese overlays for the built-in example boards, keyed by
// example id, then by node / zone / note / journey id. Only text translates:
// labels, notes, zone labels and lane names, note text, journey labels and
// captions. Part numbers (sublabels), fields, ids and geometry never appear
// here. localizedExample() in src/examples.js applies an overlay to a copy.
export default {
  'weather-station': {
    name: '气象站',
    title: '气象站',
    nodes: {
      n1: { label: '太阳能板' },
      n2: { label: '充电器' },
      n3: { label: '电池' },
      n4: { label: '稳压器' },
      n5: { label: '微控制器', notes: '读数之间深度睡眠；每 10 分钟唤醒一次。' },
      n6: { label: '温度传感器' },
      n7: { label: '土壤探头' },
      n8: { label: 'WiFi / 蓝牙' },
    },
    zones: { z1: { label: '电源' }, z2: { label: '传感器舱' } },
    notes: { t1: '所有逻辑都运行在 3.3V 电压轨上' },
    journey: {
      j1: { label: '供电路径', caption: '阳光通过 TP4056 为锂聚合物电池充电；LDO 提供干净的 3.3V 电压轨。' },
      j2: { label: '大脑', caption: 'ESP32-S3 轮询各传感器，并通过 WiFi 将读数上传。' },
      j3: { label: '传感器', caption: 'BME280 共用 I2C 总线；土壤探头直接接入 ADC。' },
    },
  },
};
```

- [ ] **Step 4: Add `localizedExample` to `src/examples.js`**

At the top, after `import { RDK_EXAMPLES } from './rdk/examples.js';`, add:

```js
import EXAMPLE_OVERLAYS_ZH from './i18n/examples.zh.js';
export { EXAMPLE_OVERLAYS_ZH };
```

At the very end of the file, after the `EXAMPLES` array closes, add:

```js
// The example as the interface language shows it. English (or any language
// without an overlay) is the example itself; Chinese is a deep copy with the
// overlay's text applied. Part numbers, fields, ids, geometry and wires are
// never touched, so the copy round-trips like the original.
export function localizedExample(example, lang = 'en') {
  const overlay = lang === 'zh' ? EXAMPLE_OVERLAYS_ZH[example.id] : undefined;
  if (!overlay) return example;
  const doc = structuredClone(example.doc);
  if (overlay.title !== undefined) doc.title = overlay.title;
  for (const n of doc.nodes) {
    const o = overlay.nodes?.[n.id];
    if (!o) continue;
    if (o.label !== undefined) n.label = o.label;
    if (o.notes !== undefined) n.notes = o.notes;
  }
  for (const z of doc.zones) {
    const o = overlay.zones?.[z.id];
    if (!o) continue;
    if (o.label !== undefined) z.label = o.label;
    if (o.lanes !== undefined) z.lanes = [...o.lanes];
  }
  for (const t of doc.notes) {
    const text = overlay.notes?.[t.id];
    if (text !== undefined) t.text = text;
  }
  for (const j of doc.journey) {
    const o = overlay.journey?.[j.id];
    if (!o) continue;
    if (o.label !== undefined) j.label = o.label;
    if (o.caption !== undefined) j.caption = o.caption;
  }
  return { ...example, name: overlay.name ?? example.name, doc };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/examples-zh.test.js` → 4 passing (three semantics tests plus `overlay weather-station …`). Then `npm test` → 472 + 4 passing, output pristine; `tests/examples.test.js` still round-trips the English boards unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/examples.zh.js src/examples.js tests/examples-zh.test.js
git commit -m "i18n: localizedExample applies a Chinese overlay to a copy of an example board"
```

---

### Task 2: The examples menu loads localized boards, with a browser check

**Files:**
- Modify: `src/ui/examples-menu.js:26-38`
- Test: `tests/e2e/smoke.mjs` (one check after "the open assistant switches language and keeps the unsent draft")

**Interfaces:**
- Consumes: `localizedExample` (Task 1), `getLang` from `src/i18n.js`.

- [ ] **Step 1: Rewrite the menu to localise before it renders, confirms and loads**

In `src/ui/examples-menu.js` change the imports to:

```js
import { EXAMPLES, EXAMPLE_GROUPS, localizedExample } from '../examples.js';
import { serialize, deserialize } from '../serialize.js';
import { toast, escAttr } from './press.js';
import { tr, trd, getLang } from '../i18n.js';
```

Replace the menu build and the click handler (the body of the `btn` click listener from `menu.innerHTML = ...` down to the end of the `forEach`) with:

```js
    const shown = EXAMPLES.map((ex) => localizedExample(ex, getLang()));
    menu.innerHTML = EXAMPLE_GROUPS.map((group) => `<div class="menu-group">${escAttr(trd(group))}</div>`
      + shown.filter((ex) => ex.group === group).map((ex) => `<button data-example="${escAttr(ex.id)}">${escAttr(ex.name)}</button>`).join('')).join('');
    const r = btn.getBoundingClientRect();
    menu.style.left = `${Math.min(r.left, window.innerWidth - 230)}px`;
    menu.style.top = `${r.bottom + 6}px`;
    menu.hidden = false;
    menu.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        const ex = shown.find((e2) => e2.id === b.dataset.example);
        close();
        if (!ex) return;
        if (!confirm(tr('Load "{name}"? Anything not saved to a file is lost.', { name: ex.name }))) return;
        const { doc, warnings } = deserialize(serialize(ex.doc));
        store.replaceDoc(doc);
        if (warnings.length) toast(tr('Example loaded with warnings:\n\n{list}', { list: warnings.join('\n') }));
      });
    });
```

(The menu is rebuilt on every open, so it reads `getLang()` fresh each time; no `onLanguageChange` hook is needed.)

- [ ] **Step 2: Add the browser check**

In `tests/e2e/smoke.mjs`, directly after the `check('the open assistant switches language and keeps the unsent draft', ...)` block (and after its clean-up lines that close the assistant), add:

```js
  // ---- An example loaded in Chinese is a Chinese document; switching back does not rewrite it ----
  await js(`document.getElementById('btn-lang').click(); true`);
  await sleep(150);
  await js(`document.getElementById('btn-examples').click(); true`);
  await sleep(100);
  const menuNames = await js(`[...document.querySelectorAll('#examples-menu button')].map((b) => b.textContent)`);
  check('the Examples menu lists boards by Chinese name', menuNames.includes('气象站') && !menuNames.includes('Weather Station'), JSON.stringify(menuNames.slice(0, 4)));
  await js(`(() => { window.__exampleConfirm = window.confirm; window.confirm = () => true; document.querySelector('#examples-menu [data-example="weather-station"]').click(); window.confirm = window.__exampleConfirm; return true; })()`);
  await sleep(300);
  const zhBoard = await js(`(() => { const labels = [...document.querySelectorAll('#canvas g.node text')].map((t) => t.textContent); return { title: document.getElementById('title').value, hasZh: labels.includes('微控制器'), hasPart: labels.includes('ESP32-S3'), hasEn: labels.includes('MCU') }; })()`);
  check('a board loaded in Chinese has Chinese labels and untouched part numbers', zhBoard.title === '气象站' && zhBoard.hasZh && zhBoard.hasPart && !zhBoard.hasEn, JSON.stringify(zhBoard));
  await js(`document.getElementById('btn-lang').click(); true`);
  await sleep(150);
  const afterBack = await js(`(() => ({ title: document.getElementById('title').value, lang: document.documentElement.lang, stillZh: [...document.querySelectorAll('#canvas g.node text')].map((t) => t.textContent).includes('微控制器') }))()`);
  check('switching back to English leaves the loaded Chinese board as it is', afterBack.lang === 'en' && afterBack.title === '气象站' && afterBack.stillZh, JSON.stringify(afterBack));
```

The suite is back in English afterwards; the next section starts with `loadBoard(EMPTY)`, which clears storage and replaces the board.

- [ ] **Step 3: Run both suites**

Run: `npm test` (476 passing) and `npm run e2e`.
Expected: `156/156 checks passed` and `no console errors or exceptions`. If the `confirm` stub leaks (a later check reports a dialog PROBLEM), make sure the restore line runs even when the click throws by wrapping it in `try { … } finally { window.confirm = window.__exampleConfirm; }`.

- [ ] **Step 4: Commit**

```bash
git add src/ui/examples-menu.js tests/e2e/smoke.mjs
git commit -m "i18n: the Examples menu lists and loads boards in the interface language"
```

---

### Task 3: Overlays for the remaining Embedded boards

**Files:**
- Modify: `src/i18n/examples.zh.js` (append five entries inside the default-exported object)
- Test: `tests/examples-zh.test.js` (its per-overlay tests pick each new entry up automatically)

**Interfaces:**
- Consumes: the overlay shape from Task 1. Nothing else changes.

- [ ] **Step 1: Confirm the guard is live**

Run: `node --test tests/examples-zh.test.js` → 4 passing. Temporarily add an entry `'drone-fc': { name: 'x', title: 'x' }` to the data file, run again, and watch `overlay drone-fc …` FAIL with `drone-fc.name has no Chinese`. Remove the temporary entry.

- [ ] **Step 2: Append the five overlays**

Inside the object in `src/i18n/examples.zh.js`, after the `'weather-station'` entry:

```js
  'drone-fc': {
    name: '无人机飞行控制器',
    title: '无人机飞行控制器',
    nodes: {
      n1: { label: '电池' },
      n2: { label: 'BEC 稳压' },
      n3: { label: '飞行控制器', notes: '循环时序关乎安全 — 不要阻塞 PID 任务。' },
      n4: { label: '惯性测量单元' },
      n5: { label: 'GPS 模块' },
      n6: { label: '电机 + 驱动' },
      n7: { label: '云台舵机' },
    },
    zones: { z1: { label: '电源' }, z2: { label: '飞行传感器' }, z3: { label: '执行器' } },
    notes: { t1: 'PID 环路在 F405 上以 8 kHz 运行' },
    journey: {
      j1: { label: '供电', caption: '4S 电池组为 5V BEC 供电，再由它为飞行控制器供电。' },
      j2: { label: '感知', caption: 'IMU 通过 I2C 传输姿态，GPS 通过 UART 报告位置。' },
      j3: { label: '执行', caption: 'PWM 输出驱动电调和云台舵机。' },
    },
  },
  'smart-greenhouse': {
    name: '智能温室（边缘到云）',
    title: '智能温室',
    nodes: {
      n1: { label: '气候传感器' },
      n2: { label: '土壤探头', notes: '靠近水泵时读数有噪声 — 需要滤波。' },
      n3: { label: '电池' },
      n4: { label: '稳压器' },
      n5: { label: '节点微控制器' },
      n6: { label: 'LoRa 模块' },
      n7: { label: '边缘网关' },
      n8: { label: '云 / MQTT' },
      n9: { label: '服务器' },
      n10: { label: '数据库' },
      n11: { label: '移动应用' },
    },
    zones: { z1: { label: '温室节点' }, z2: { label: '后端' } },
    notes: { t1: 'MQTT 主题：greenhouse/#' },
    journey: {
      j1: { label: '温室内', caption: '传感器接入 ESP32-C6；整套系统由磷酸铁锂电池组供电。' },
      j2: { label: '无线传输', caption: '读数经 868 MHz LoRa 跳到边缘网关，再上传至 MQTT 代理。' },
      j3: { label: '送达种植者', caption: '接入 API 存储时序数据；移动应用订阅实时告警。' },
    },
  },
  'robot-arm': {
    name: '机械臂控制器',
    title: '机械臂控制器',
    nodes: {
      n1: { label: '电池' },
      n2: { label: '稳压器' },
      n3: { label: '主机电脑' },
      n4: { label: '运动控制微控制器', notes: '以 1 kHz 进行轨迹插补。' },
      n5: { label: '底座舵机' },
      n6: { label: '肘部舵机' },
      n7: { label: '夹爪电机' },
      n8: { label: '腕部 IMU' },
    },
    zones: { z1: { label: '控制器' }, z2: { label: '机械臂' } },
    notes: { t1: '急停直接切断 5V 电压轨' },
    journey: {
      j1: { label: '指令输入', caption: '主机电脑通过 USB CDC 向运动控制微控制器流式发送路径点。' },
      j2: { label: '运动输出', caption: '三路 PWM 驱动各关节；轨迹以 1 kHz 插补。' },
      j3: { label: '反馈', caption: '腕部 IMU 通过 I2C（地址 0x28）闭合控制回路。' },
    },
  },
  'rover': {
    name: '自主漫游车',
    title: '自主漫游车',
    nodes: {
      n1: { label: '电池' },
      n2: { label: '稳压器' },
      n3: { label: '漫游车微控制器', notes: '里程计与 ToF 测距以 50 Hz 融合。' },
      n4: { label: '驱动步进电机' },
      n5: { label: 'ToF 测距仪' },
      n6: { label: '激光雷达' },
      n7: { label: '碰撞开关' },
    },
    zones: { z1: { label: '电源' }, z2: { label: '驱动' }, z3: { label: '感知' } },
    notes: { t1: '碰撞中断在 2 ms 内停止步进电机' },
    journey: {
      j1: { label: '供电', caption: '2S 电池组和 5V 降压模块为微控制器和驱动步进电机供电。' },
      j2: { label: '驱动', caption: 'STEP 和 DIR 脉冲驱动 NEMA 17；碰撞中断立即停止运动。' },
      j3: { label: '感知', caption: '地址 0x29 的 VL53L0X 负责近距测距；RPLIDAR 通过 UART 流式输出扫描数据。' },
    },
  },
  'sensor-node-clean': {
    name: '传感器节点（DRC 无问题）',
    title: '传感器节点',
    nodes: {
      n1: { label: '电池' },
      n2: { label: '稳压器', notes: '低静态电流 LDO；所有外设都挂在其 3.3V 电压轨上。' },
      n3: { label: '微控制器', notes: '每分钟唤醒一次，采样 BME280，刷新 OLED，闪烁一次。' },
      n4: { label: '温度传感器' },
      n5: { label: 'OLED 屏' },
      n6: { label: '状态 LED' },
    },
    zones: { z1: { label: '电源' }, z2: { label: 'I2C 外设' } },
    notes: { t1: '每个供电引脚都已连线，两个 I2C 地址互不相同：检查不会报告任何问题。' },
    journey: {
      j1: { label: '供电树', caption: '1S 锂聚合物电池为 3.3V LDO 供电；LDO 为其他所有部件提供 VCC 和 GND。' },
      j2: { label: '控制器', caption: 'ESP32-C3 驱动一条 I2C 总线和 GPIO 8 上的状态 LED。' },
      j3: { label: '外设', caption: '地址 0x76 的 BME280 与地址 0x3C 的 SSD1306 共用总线，地址互不冲突。' },
    },
  },
```

- [ ] **Step 3: Run and commit**

Run: `node --test tests/examples-zh.test.js` → 9 passing (3 semantics + 6 overlays); then `npm test` → all green.

```bash
git add src/i18n/examples.zh.js
git commit -m "i18n(examples): Chinese overlays for the embedded boards"
```

---

### Task 4: Overlays for the vehicle boards

**Files:**
- Modify: `src/i18n/examples.zh.js` (append four entries)
- Test: `tests/examples-zh.test.js`

- [ ] **Step 1: Append the four overlays**

```js
  'can-network': {
    name: 'CAN 总线网络',
    title: 'CAN 总线网络',
    nodes: {
      n1: { label: '发动机 ECU' },
      n2: { label: 'CAN 收发器' },
      n3: { label: '仪表 ECU' },
      n4: { label: 'CAN 收发器' },
      n5: { label: '传感器 ECU' },
      n6: { label: 'CAN 收发器' },
    },
    zones: { z1: { label: '发动机模块' }, z2: { label: '仪表模块' }, z3: { label: '传感器模块' } },
    notes: { t1: '一对双绞线以 500 kbit/s 连接所有模块' },
    journey: {
      j1: { label: '一个模块', caption: '每个 ECU 都通过自己的 MCP2551 收发器进行 CAN 通信。' },
      j2: { label: '总线', caption: '各收发器共用一对差分线 — 黄色的 CAN H/L 主干。' },
      j3: { label: '网络', caption: '三个模块，一条总线：在双绞线任意位置搭接即可新增节点。' },
    },
  },
  'vehicle-can': {
    name: '车载 CAN 主干',
    title: '车载 CAN 主干',
    nodes: {
      n1: { label: '车载蓄电池' },
      n2: { label: '保险丝盒' },
      n3: { label: '轮速传感器' },
      n4: { label: '车身 ECU' },
      n5: { label: 'H 桥' },
      n6: { label: '网关 ECU' },
      n7: { label: 'CAN 收发器' },
      n8: { label: 'CAN 收发器' },
      n9: { label: '雨刮电机' },
      n10: { label: 'OBD-II 接口' },
      n11: { label: 'LIN 收发器' },
      n12: { label: '车门模块' },
    },
    zones: { z1: { label: '配电' }, z2: { label: 'CAN 主干' } },
    notes: { t1: '诊断工具通过 OBD-II 分接点查询每个 ECU' },
    journey: {
      j1: { label: '供电树', caption: '12V 蓄电池为三条带保险丝的支路供电：车身 ECU、H 桥和网关。' },
      j2: { label: '主干', caption: '两个 ECU 通过 TJA1050 收发器在同一对差分线上通信；OBD-II 接口搭接在同一总线上。' },
      j3: { label: '车身控制', caption: '车身 ECU 通过 H 桥驱动雨刮；网关将 CAN 桥接到 LIN，连接车门模块。' },
    },
  },
  'ota-pipeline': {
    name: 'OTA 升级流水线（泳道图）',
    title: 'OTA 升级流水线',
    nodes: {
      n1: { label: '构建服务器' },
      n2: { label: '发布数据库' },
      n3: { label: '升级代理' },
      n4: { label: '边缘网关' },
      n5: { label: 'WiFi 射频模块' },
      n6: { label: '设备微控制器', notes: '刷写前先验证镜像签名。' },
      n7: { label: 'SPI 闪存' },
    },
    zones: { z1: { label: '固件 OTA 流水线', lanes: ['云端', '网关', '设备'] } },
    notes: { t1: '只接受签名镜像 — 微控制器在刷写前进行验证' },
    journey: {
      j1: { label: '三条泳道', caption: '一张泳道图，三个负责方：云端构建，网关中继，设备刷写。' },
      j2: { label: '云端泳道', caption: 'CI 将构建产物存入发布数据库，并发布到 MQTT 代理。' },
      j3: { label: '直达设备', caption: '网关通过无线推送镜像；微控制器校验签名后写入 SPI 闪存。' },
    },
  },
  'ev-bms': {
    name: '电动汽车电池管理（高压 + CAN）',
    title: '电动汽车电池管理',
    nodes: {
      n1: { label: '高压电池包', notes: '九十六节电芯串联；只要 BMS 断开接触器，电池包就与整车隔离。' },
      n2: { label: '烟火保险丝' },
      n3: { label: '主接触器' },
      n4: { label: '预充接触器', notes: '先闭合，让逆变器电容经电阻充电。' },
      n5: { label: '电流传感器' },
      n6: { label: '电芯监测 A' },
      n7: { label: '电芯监测 B' },
      n8: { label: '电池包 NTC' },
      n9: { label: 'BMS 微控制器', notes: 'ASIL-C 锁步核；任一电芯超过 4.25 V 或低于 2.8 V 即断开两个接触器。' },
      n10: { label: 'CAN 收发器' },
      n11: { label: '车载网关' },
      n12: { label: '12 V 转 5 V' },
      n13: { label: '12 V 辅助电池' },
      n14: { label: '绝缘监测' },
    },
    zones: { z1: { label: '高压电池包' }, z2: { label: '低压控制' }, z3: { label: '车辆' } },
    notes: { x1: '预充先闭合；母线电压与电池包一致后主接触器再闭合。任何电芯故障都会断开两者。' },
    journey: {
      j1: { label: '高压电池包', caption: '九十六节电芯、一个烟火保险丝和两个接触器：没有 BMS 的允许，什么都出不了电池包。' },
      j2: { label: '电芯监测', caption: '两个 BQ79616 监测芯片经 isoSPI 菊花链上报每节电芯电压；一个分流器和八个 NTC 覆盖电流与温度。' },
      j3: { label: '控制', caption: '锁步微控制器由 12 V 辅助电压轨供电，驱动两个接触器，并通过 500 kbit/s CAN 与整车通信。' },
      j4: { label: '车辆', caption: '荷电状态、电流限值和故障送达网关；网关从不触及高压侧。' },
    },
  },
```

- [ ] **Step 2: Run and commit**

Run: `node --test tests/examples-zh.test.js` → 13 passing; then `npm test` → all green.

```bash
git add src/i18n/examples.zh.js
git commit -m "i18n(examples): Chinese overlays for the vehicle boards"
```

---

### Task 5: Overlays for the Horizon boards

**Files:**
- Modify: `src/i18n/examples.zh.js` (append three entries)
- Test: `tests/examples-zh.test.js`

Vendor names in these overlays: 地平线 for Horizon, 征程 for Journey. Product designations (Journey 6M, Mono 2, HSD 600, Journey 6P) stay Latin where they name a product; sentences that speak of the chip say 征程 6M and so on, as the phase-1 preset notes do.

- [ ] **Step 1: Append the three overlays**

```js
  'journey-adas': {
    name: '征程 6 ADAS 方案（地平线）',
    title: '征程 6 ADAS 方案',
    nodes: {
      n1: { label: '车载蓄电池' },
      n2: { label: '保险丝盒' },
      n3: { label: 'ADAS 控制器', notes: '地平线征程 6M 域控制器（80 TOPS，100K DMIPS，BPU Nash）：基于摄像头与雷达融合的高速 NOA 和城区通勤 NOA。' },
      n4: { label: '前视摄像头' },
      n5: { label: '左侧摄像头' },
      n6: { label: '右侧摄像头' },
      n7: { label: '后视摄像头' },
      n8: { label: '前雷达' },
      n9: { label: 'T1 交换机' },
      n10: { label: '车载网关' },
      n11: { label: 'OBD-II 接口' },
      n12: { label: '座舱 SoC', notes: '基于地平线征程 6B（10 TOPS）的驾驶员监测；红外摄像头通过 MIPI CSI-2 接入。' },
      n13: { label: 'DMS 摄像头' },
    },
    zones: { z1: { label: '摄像头' }, z2: { label: '计算' }, z3: { label: '车载网络' }, z4: { label: '座舱' }, z5: { label: '电源' } },
    notes: { t1: '征程 6M 运行高速与城区通勤 NOA。座舱由征程 6B 运行驾驶员监测。' },
    journey: {
      j1: { label: '传感器', caption: '四路 GMSL2 摄像头和一个 77 GHz 雷达接入控制器；摄像头通过同轴线取电。' },
      j2: { label: '计算', caption: '征程 6M 域控制器（80 TOPS，BPU Nash）融合摄像头与雷达，实现高速与城区通勤 NOA。' },
      j3: { label: '车载网络', caption: 'T1 以太网交换机连接控制器、网关和座舱 SoC；网关将 CAN FD 桥接到 OBD-II 接口。' },
    },
  },
  'mono2-adas': {
    name: 'Mono 2 前视摄像头 ADAS（地平线）',
    title: 'Mono 2 前视摄像头 ADAS',
    nodes: {
      n1: { label: '车载蓄电池' },
      n2: { label: '保险丝盒' },
      n3: { label: '前视摄像头 ECU', notes: '基于征程 2 的地平线 Mono 2（4 TOPS，BPU Bernoulli，2W）：单路 1.7/2.6MP 前视摄像头 @100/120 度；FCW、LDW、AEB、BSD、ACC、TJA、TSR、ISA。一体机：成像器与 SoC 共用一个外壳；为清晰起见，成像器单独绘制为一张卡片。' },
      n4: { label: '成像器' },
      n5: { label: '车载网关' },
      n6: { label: '制动 ECU' },
      n7: { label: '转向 ECU' },
      n8: { label: '仪表盘' },
      n9: { label: 'OBD-II 接口' },
    },
    zones: { z1: { label: 'Mono 2 一体机' }, z2: { label: '车载网络' }, z3: { label: '底盘与座舱 ECU' }, z4: { label: '电源' } },
    notes: { t1: 'Mono 2 是纯视觉一体机：成像器与征程 2 SoC 共用一个外壳。制动、转向和仪表 ECU 的供电未绘制。' },
    journey: {
      j1: { label: '一个摄像头', caption: '单个 1.7MP 成像器与征程 2（4 TOPS，2W）共用一个外壳；成像器单独绘制为一张卡片以便看清链路。FCW、LDW、AEB、ACC、TJA 和交通标志识别功能在此运行。' },
      j2: { label: '接入整车', caption: '摄像头 ECU 通过 CAN FD 与车载网关通信，网关桥接到底盘 CAN，并在 OBD-II 接口上提供诊断。' },
      j3: { label: '执行', caption: '制动和转向 ECU 通过底盘 CAN 接收 AEB 和车道保持请求；仪表盘显示告警。ECU 供电仍作为通用检查结果保留。' },
    },
  },
  'hsd600-adas': {
    name: 'SuperDrive HSD 600 城区 NOA（地平线）',
    title: 'SuperDrive HSD 600 城区 NOA',
    nodes: {
      n1: { label: '车载蓄电池' },
      n2: { label: '保险丝盒' },
      n3: { label: '域控制器', notes: '基于征程 6P 的地平线 SuperDrive HSD 600（560 TOPS 等效，410K CPU DMIPS，BPU Nash）：11 路摄像头、3 个雷达，可选激光雷达；一段式端到端城区、高速与泊车辅助。' },
      n4: { label: '前视摄像头组', notes: '三个前向摄像头绘制为一组；线束中每个摄像头仍各有自己的同轴线。' },
      n5: { label: '左侧摄像头组' },
      n6: { label: '右侧摄像头组' },
      n7: { label: '后视与泊车' },
      n8: { label: '前雷达' },
      n9: { label: '左角雷达' },
      n10: { label: '右角雷达' },
      n11: { label: 'T1 交换机' },
      n12: { label: '车载网关' },
      n13: { label: 'OBD-II 接口' },
    },
    zones: { z1: { label: '摄像头（11 路）' }, z2: { label: '计算' }, z3: { label: '雷达' }, z4: { label: '车载网络' }, z5: { label: '电源' } },
    notes: { t1: 'HSD 600 传感器配置：11 路摄像头绘制为四组，3 个雷达；可选激光雷达未绘制。摄像头、雷达和交换机的供电未绘制。' },
    journey: {
      j1: { label: '十一路摄像头', caption: '十一路 GMSL2 摄像头以四组接入控制器：前向三路、每侧两路、后视与泊车四路。线束中每个摄像头各有自己的同轴线；分组只是为了让图面易读。' },
      j2: { label: '计算', caption: '征程 6P（560 TOPS 等效，BPU Nash）端到端运行地平线 SuperDrive，覆盖城区、高速和泊车场景。前雷达经 CAN FD 接入，角雷达经 T1 接入。' },
      j3: { label: '车载网络', caption: '1000BASE-T1 交换机连接控制器和角雷达；网关将 CAN FD 桥接到车身 CAN 和 OBD-II 接口。摄像头、雷达和交换机的供电仍作为通用检查结果保留。' },
    },
  },
```

- [ ] **Step 2: Run and commit**

Run: `node --test tests/examples-zh.test.js` → 16 passing; then `npm test` → all green.

```bash
git add src/i18n/examples.zh.js
git commit -m "i18n(examples): Chinese overlays for the Horizon boards"
```

---

### Task 6: Overlays for the RDK boards

**Files:**
- Modify: `src/i18n/examples.zh.js` (append four entries)
- Test: `tests/examples-zh.test.js`

The four software-stage cards share one note; define it once as a constant above the object and reuse it. Vendor name: 地瓜机器人 for D-Robotics.

- [ ] **Step 1: Add the shared constant and append the four overlays**

Above `export default {` in `src/i18n/examples.zh.js` add:

```js
// The RDK software-stage cards share this note on every board.
const RDK_STAGE_NOTE = '描述性处理阶段；流程箭头不会部署或执行软件包。运行时及具体示例集成需要验证。';
```

Then append inside the object:

```js
  'rdk-rover': {
    name: 'RDK X5 漫游车（地瓜机器人）',
    title: 'RDK X5 漫游车',
    nodes: {
      n1: { label: '电池' },
      n2: { label: '稳压器' },
      n3: { label: '机器人主控', notes: 'RDK X5；稳压 5V 供电按至少 5A 选型。仅为架构设计；硬件未经测试。' },
      n5: { label: '双目摄像头', notes: '两根 CSI 排线占用 X5 的两个摄像头接口。请按链接的官方指南确认安装与驱动配置。' },
      n7: { label: '激光雷达' },
      n8: { label: '电机控制器' },
      n9: { label: '左电机' },
      n10: { label: '右电机' },
      n11: { label: '惯性测量单元' },
      s1: { label: '传感器采集', notes: RDK_STAGE_NOTE },
      s2: { label: 'BPU 推理', notes: RDK_STAGE_NOTE },
      s3: { label: '图像编解码', notes: RDK_STAGE_NOTE },
      s4: { label: '可视化', notes: RDK_STAGE_NOTE },
    },
    zones: { z1: { label: '电源' }, z2: { label: '感知' }, z3: { label: '执行器' }, zs: { label: 'X5 上的软件 · 未选择运行时' } },
    notes: {
      t1: '仅为设计：双目占用两个 CSI 接口。软件流程为描述性，未选择运行时。',
      t2: '供电细节不完整：传感器供电和电机回路未绘制。通用检查保留这些缺项。',
    },
    journey: {
      j1: { label: '供电与计算', caption: '4S 电池组为 X5 提供额定至少 5A 的稳压 5V 供电。供电与回路细节仍不完整；请查看通用检查结果。' },
      j2: { label: '双目采集', caption: 'GS130W 左右两路 CSI 排线占用 X5 的 CSI1 和 CSI2。未绘制额外的 MIPI 摄像头或未经验证的串行舵机捷径。' },
      j3: { label: '运动概念', caption: '一个概念性的 CAN FD 控制器驱动两个轮子。控制器电气接口、功率参数和实际 CAN 布线需另行验证。' },
      j4: { label: '描述性流水线', caption: '传感器采集、推理、编解码和可视化阶段以 X5 为目标。流程描述的是预期的数据处理，而非启动配置；未选择运行时。' },
    },
  },
  'rdk-perception': {
    name: 'RDK X5 双目感知',
    title: 'RDK X5 双目感知',
    nodes: {
      n1: { label: '电池' },
      n2: { label: '稳压器' },
      n3: { label: '机器人主控', notes: 'RDK X5；稳压 5V 供电按至少 5A 选型。仅为架构设计；硬件未经测试。' },
      n5: { label: '双目摄像头', notes: '两根 CSI 排线占用 X5 的两个摄像头接口。请按链接的官方指南确认安装与驱动配置。' },
      s1: { label: '传感器采集', notes: RDK_STAGE_NOTE },
      s2: { label: 'BPU 推理', notes: RDK_STAGE_NOTE },
      s3: { label: '图像编解码', notes: RDK_STAGE_NOTE },
      s4: { label: '可视化', notes: RDK_STAGE_NOTE },
    },
    zones: { z1: { label: '电源' }, z2: { label: '感知' }, zs: { label: 'X5 上的软件 · 未选择运行时' } },
    notes: {
      t1: '仅为设计：双目占用两个 CSI 接口。软件流程为描述性，未选择运行时。',
      t2: '供电细节不完整：电池回路未绘制。通用检查保留这一缺项；硬件未经测试。',
    },
    journey: {
      j1: { label: '供电与计算', caption: '概念性的 4S 供电和稳压 5V 5A 输出为 X5 供电。电池回路有意省略，仍作为通用检查结果保留。' },
      j2: { label: '双目采集', caption: 'GS130W 左右两路 CSI 排线占用 X5 的 CSI1 和 CSI2。未绘制额外的 MIPI 摄像头或未经验证的串行舵机捷径。' },
      j4: { label: '描述性流水线', caption: '传感器采集、推理、编解码和可视化阶段以 X5 为目标。流程描述的是预期的数据处理，而非启动配置；未选择运行时。' },
    },
  },
  'rdk-x3-robot': {
    name: 'RDK X3 视觉机器人（地瓜机器人）',
    title: 'RDK X3 视觉机器人',
    nodes: {
      n1: { label: '电池' },
      n2: { label: '稳压器' },
      n3: { label: '机器人主控', notes: 'RDK X3；只有一个 MIPI CSI 接口且没有 CAN FD，因此运动控制经由 UART 连接的微控制器完成。稳压 5V 供电按至少 3A 选型。仅为架构设计；硬件未经测试。' },
      n4: { label: '前置摄像头', notes: '单个 X3 CSI 接口上的 IMX219 系列模组。传感器名称不能确定模组、线缆或驱动的兼容性；下单前请选择文档列出的厂商模组和转接板。' },
      n5: { label: '驱动微控制器', notes: '通过 UART 接收来自 X3 的速度指令，并以 PWM 驱动两个轮子。驱动电路和供电未绘制。' },
      n6: { label: '左电机' },
      n7: { label: '右电机' },
      n8: { label: '超声波' },
      n9: { label: '惯性测量单元' },
      s1: { label: '传感器采集', notes: RDK_STAGE_NOTE },
      s2: { label: 'BPU 推理', notes: RDK_STAGE_NOTE },
      s3: { label: '可视化', notes: RDK_STAGE_NOTE },
    },
    zones: { z1: { label: '电源' }, z2: { label: '感知' }, z3: { label: '执行器' }, zs: { label: 'X3 上的软件 · 未选择运行时' } },
    notes: {
      t1: '仅为设计：一个 CSI 接口，没有 CAN FD；由 UART 微控制器驱动轮子。摄像头兼容性是一个未关闭的检查项。',
      t2: '供电细节不完整：微控制器、传感器和电机供电未绘制。通用检查保留这些缺项；硬件未经测试。',
    },
    journey: {
      j1: { label: '供电与计算', caption: '3S 电池组为 X3 提供额定至少 3A 的稳压 5V 供电。微控制器、传感器和电机供电仍未绘制；请查看通用检查结果。' },
      j2: { label: '单摄像头', caption: '一个 IMX219 系列模组占用 X3 唯一的 CSI 接口。目录未确认模组、线缆或驱动的兼容性，因此检查器有意保留该检查项。' },
      j3: { label: '经 UART 的运动控制', caption: 'X3 没有 CAN FD，因此由 Cortex-M4 驱动微控制器通过 UART 接收速度指令并以 PWM 驱动两个轮子。驱动电路和回路需另行验证。' },
      j4: { label: '描述性流水线', caption: '传感器采集、推理和可视化阶段以 X3 为目标。流程描述的是预期的数据处理，而非启动配置；未选择运行时。' },
    },
  },
  'rdk-s100-node': {
    name: 'RDK S100 感知节点（地瓜机器人）',
    title: 'RDK S100 感知节点',
    nodes: {
      n1: { label: '电池', notes: '直接为 S100 供电：其文档标称输入为 12-20V 直流，因此未绘制板级稳压器。' },
      n3: { label: '感知节点', notes: 'RDK S100（80 TOPS，12GB LPDDR5）；由 4S 电池组提供 12-20V 直流输入。摄像头信号经 J25 引入，排线摄像头需要摄像头扩展板。目录中没有经验证的接口图，因此这里的每个接口都是未关闭的检查项。仅为架构设计；硬件未经测试。' },
      n5: { label: '双目摄像头', notes: '带 ICM-42688-P IMU 的双 SC132GS 全局快门双目模组。两根排线经摄像头扩展板接入 S100；请按链接的官方指南确认安装。' },
      n7: { label: '激光雷达' },
      n8: { label: 'GNSS 接收机' },
      n9: { label: 'GNSS 天线' },
      n12: { label: '主机电脑' },
      s1: { label: '传感器采集', notes: RDK_STAGE_NOTE },
      s2: { label: 'BPU 推理', notes: RDK_STAGE_NOTE },
      s3: { label: '图像编解码', notes: RDK_STAGE_NOTE },
      s4: { label: '可视化', notes: RDK_STAGE_NOTE },
    },
    zones: { z1: { label: '电源' }, z2: { label: '感知' }, z3: { label: '定位' }, z4: { label: '上行链路' }, zs: { label: 'S100 上的软件 · 未选择运行时' } },
    notes: {
      t1: '仅为设计：没有经验证的 S100 接口图，因此 CSI、UART 和以太网链路仍是未关闭的检查项。排线摄像头需要摄像头扩展板。',
      t2: '供电细节不完整：传感器供电和回路未绘制。4S 电池组处于 S100 文档标称的 12-20V 输入范围内；硬件未经测试。',
    },
    journey: {
      j1: { label: '电池组直接供电', caption: '4S 电池组直接为 S100 供电，因为其文档标称输入为 12 至 20V；无需板级稳压器。传感器供电和回路仍未绘制，作为通用检查结果保留。' },
      j2: { label: '经扩展板的双目', caption: 'GS130WI 左右两路排线经摄像头扩展板接入 S100。目录中没有经验证的 S100 接口图，因此检查器将该接口对报告为未经验证，而非已通过。' },
      j3: { label: '测距与定位', caption: 'UART 上的 2D 激光雷达和第二路 UART 上的 RTK GNSS 接收机提供距离和位置；天线馈线也已绘出，以免遗漏射频路径。' },
      j4: { label: '上行与流水线', caption: '以太网将结果送往 ROS 2 工作站。采集、推理、编解码和可视化阶段以 S100 为目标；流程为描述性，未选择运行时。' },
    },
  },
```

- [ ] **Step 2: Run and commit**

Run: `node --test tests/examples-zh.test.js` → 20 passing; then `npm test` → all green.

```bash
git add src/i18n/examples.zh.js
git commit -m "i18n(examples): Chinese overlays for the RDK boards"
```

---

### Task 7: Overlays for the security boards

**Files:**
- Modify: `src/i18n/examples.zh.js` (append four entries)
- Test: `tests/examples-zh.test.js`

Threat parts on these boards have empty `sublabel`s and carry their data in `fields`; neither is touched. Flow-shape labels (Start, End, decisions) translate like any label; the shape sizes itself from the text.

- [ ] **Step 1: Append the four overlays**

```js
  'ota-security': {
    name: '车辆 OTA 安全（威胁与流程）',
    title: '车辆 OTA 安全',
    nodes: {
      t1: { label: '恶意工程师', notes: '如果签名密钥被共享，可能推送未签名的构建。' },
      t2: { label: '路径中间攻击者', notes: '试图在 CDN 与车辆之间替换镜像。' },
      t3: { label: '木马镜像', notes: '被篡改的包在设备上通不过签名校验。' },
      c1: { label: '构建服务器', notes: '每个镜像都用 HSM 中的发布密钥签名。' },
      c2: { label: '升级 API' },
      c3: { label: 'Web 应用防火墙' },
      c4: { label: '镜像 CDN' },
      net: { label: '互联网' },
      f1: { label: '开始' },
      f2: { label: '下载镜像' },
      f3: { label: '签名有效？' },
      f4: { label: '刷写 B 槽' },
      f5: { label: '拒绝并上报' },
      f6: { label: '重启并证明' },
      f7: { label: '结束' },
      v1: { label: '车载通信单元', notes: '通过 HTTPS 拉取包，并转发到车载网络。' },
      v2: { label: '车载网关' },
      v3: { label: '设备微控制器', notes: '校验签名，然后写入 B 槽并重启进入。' },
      v4: { label: 'SPI 闪存' },
    },
    zones: { z1: { label: '威胁' }, z2: { label: '构建与交付' }, z3: { label: '升级校验' }, z4: { label: '车辆' } },
    notes: { n1: '只接受签名镜像：被投毒的构建或被篡改的 CDN 副本都会在微控制器上通不过校验。' },
    journey: {
      j1: { label: '交付', caption: '构建服务器为每个镜像签名；镜像经升级 API、Web 应用防火墙和 CDN 到达互联网。' },
      j2: { label: '校验', caption: '设备下载镜像、校验签名、刷写 B 槽并重启进入；签名错误则拒绝并上报。' },
      j3: { label: '威胁', caption: '恶意工程师、路径中间攻击者和木马镜像各针对一个环节；签名校验将三者一并挫败。' },
      j4: { label: '车辆', caption: 'TCU 经 T1 到网关，网关经 CAN FD 到微控制器，微控制器到 SPI 闪存：升级在设备内完成。' },
    },
  },
  'adas-security': {
    name: 'ADAS 安全（威胁与响应）',
    title: 'ADAS 安全',
    nodes: {
      t1: { label: '传感器欺骗者', notes: '针对感知栈的伪造 GNSS 信号和投影图像。' },
      s1: { label: '前视摄像头' },
      s2: { label: '前雷达', notes: '用于合理性检查的独立距离真值。' },
      s3: { label: 'GNSS 接收机' },
      c1: { label: 'ADAS 控制器', notes: '带合理性检查的融合：与雷达不一致的摄像头帧会被丢弃。' },
      c2: { label: 'CAN 入侵检测', notes: 'CAN FD 网段上的速率与合理性规则；丢弃意外的控制帧。' },
      n4: { label: '车机主机', notes: '联网的信息娱乐系统；常见的立足点。' },
      n2: { label: 'T1 交换机' },
      n1: { label: '车载网关', notes: '隔离诊断、信息娱乐和安全三个域。' },
      n5: { label: '制动 ECU', notes: '这里每一种攻击最终瞄准的资产。' },
      n3: { label: 'OBD-II 接口' },
      t3: { label: '信息娱乐远控木马', notes: '从联网车机向车载网络横向渗透。' },
      t4: { label: 'C2 服务器' },
      vu: { label: '未认证的 UDS', notes: '制动 ECU 的诊断重编程在没有种子/密钥交换的情况下接受会话。' },
      t2: { label: 'CAN 注入器', notes: '诊断口上的一个加密狗注入控制帧。' },
      f1: { label: '异常' },
      f2: { label: '隔离域' },
      f3: { label: '安全关键？' },
      f4: { label: '降级至安全模式' },
      f5: { label: '记录并告警 SOC' },
      f6: { label: '结束' },
    },
    zones: { z1: { label: '感知威胁' }, z2: { label: '传感器' }, z3: { label: '计算与控制' }, z4: { label: '车载网络' }, z5: { label: '网络威胁与缺陷' }, z6: { label: '入侵响应' } },
    notes: { x1: '合理性检查、CAN 入侵检测和域隔离：每种威胁都有对应的控制措施。' },
    journey: {
      j1: { label: '感知攻击', caption: '投影图像和伪造 GNSS 到达摄像头和接收机；雷达为控制器提供独立真值来核对它们。' },
      j2: { label: '网络与注入', caption: '网关隔离诊断、信息娱乐和安全域；OBD 加密狗和被感染的车机都无法直接触及制动 ECU。' },
      j3: { label: '控制措施', caption: 'CAN 入侵检测镜像安全网段并丢弃意外的控制帧；ADAS 控制器丢弃与雷达不一致的摄像头帧。' },
      j4: { label: '响应', caption: '出现异常即隔离其所在域；安全关键情形降级至安全模式，其余记录并上报 SOC。' },
    },
  },
  'ot-purdue': {
    name: 'OT 网络分区（普渡模型泳道图）',
    title: 'OT 网络分区',
    nodes: {
      n1: { label: '工程工作站' },
      n2: { label: 'ERP / MES 系统' },
      n3: { label: '边界防火墙' },
      n4: { label: '互联网' },
      n5: { label: 'OT 防火墙', notes: '只有跳板机和历史数据库副本可以穿越。' },
      n6: { label: '跳板机' },
      n7: { label: '历史数据库镜像' },
      n8: { label: '单元交换机' },
      n9: { label: '历史数据库' },
      n10: { label: '人机界面' },
      n11: { label: 'PLC 控制器' },
      n12: { label: '安全光幕' },
      n13: { label: '电机接触器' },
      n14: { label: '输送带电机' },
      n15: { label: '24 V 电源' },
      t1: { label: '勒索软件团伙' },
      t2: { label: '发票诱饵' },
      t3: { label: '复用的供应商 VPN 登录' },
      t4: { label: '直通 L3 的扁平 VLAN' },
    },
    zones: { z1: { label: '按普渡层级划分的工厂网络', lanes: ['企业层 (L4-5)', '隔离区 (L3.5)', '现场运营 (L3)', '控制层 (L0-2)'] } },
    notes: { x1: '层级之间的每一次穿越都经过防火墙。跳板机是从企业侧进入 L3 的唯一路径，而 ERP 读取的是历史数据库镜像，从不直接读取历史数据库。' },
    journey: {
      j1: { label: '四个层级', caption: '企业层、隔离区、现场运营和控制层各占一条泳道；不经防火墙，什么都不能跨泳道。' },
      j2: { label: '隔离区', caption: 'OT 防火墙只放行跳板机和单向的历史数据库副本，其余一律拒绝。' },
      j3: { label: '单元', caption: 'PLC 通过 PROFINET 与单元交换机通信，读取光幕，并经安全转矩关断链保持接触器。' },
      j4: { label: '威胁', caption: '勒索软件团伙钓鱼工程工作站并复用供应商 VPN 密码；扁平 VLAN 会把他们直接送到 PLC。' },
    },
  },
  'secure-boot': {
    name: '安全启动链（流程 + 硬件）',
    title: '安全启动链',
    nodes: {
      f1: { label: '上电' },
      f2: { label: 'ROM 校验引导程序' },
      f3: { label: '签名正确？' },
      f4: { label: '引导程序校验应用' },
      f5: { label: '应用正确？' },
      f6: { label: '运行应用' },
      f7: { label: '停机并闪烁故障' },
      f8: { label: '从另一槽启动' },
      n1: { label: '应用微控制器', notes: '不可变的 ROM 启动、RDP 2 级、TrustZone。公钥哈希存放在 OTP 中。' },
      n2: { label: '安全元件', notes: '设备密钥、证明和防回滚计数器。' },
      n3: { label: 'QSPI 闪存' },
      n4: { label: 'SWD 调试口', notes: '出厂前由 RDP 2 级禁用。' },
      n7: { label: 'LDO 稳压器' },
      n8: { label: '直流输入' },
      n5: { label: '签名 HSM', notes: '保存发布私钥；为镜像和每台设备的证书签名。' },
      n6: { label: '产线配置电脑' },
      t1: { label: '调试口探测' },
      t2: { label: '被篡改的闪存镜像' },
      t3: { label: '回滚到旧引导程序' },
    },
    zones: { z1: { label: '启动流程' }, z2: { label: '设备' }, z3: { label: '工厂配置' } },
    notes: { x1: '每一级在跳转前先校验下一级：ROM、引导程序、应用。错误的签名永远不会运行；坏的槽会回退到另一个槽。' },
    journey: {
      j1: { label: '信任链', caption: 'ROM 校验引导程序，引导程序校验应用；任一校验失败都会中止信任链。' },
      j2: { label: '信任根', caption: 'ROM 信任 OTP 中的哈希，安全元件保存设备密钥和防回滚计数器，闪存承载两个镜像槽。' },
      j3: { label: '产线配置', caption: '离线 HSM 为每个镜像和每台设备的证书签名；DFU 工站只负责转发。' },
      j4: { label: '威胁', caption: '调试口探测遇到 RDP 2 级，被篡改的镜像通不过签名，回滚遇到计数器。' },
    },
  },
```

- [ ] **Step 2: Run and commit**

Run: `node --test tests/examples-zh.test.js` → 24 passing; then `npm test` → all green.

```bash
git add src/i18n/examples.zh.js
git commit -m "i18n(examples): Chinese overlays for the security boards"
```

---

### Task 8: Every board covered, docs aligned, screenshots, final gate

**Files:**
- Modify: `tests/examples-zh.test.js` (one new test)
- Modify: `README.md` (the Language row)
- Modify: `docs/superpowers/specs/2026-09-08-chinese-language-design.md` (the "Example boards (phase 2)" section)
- Test: `npm test`, `npm run e2e`, two screenshots

- [ ] **Step 1: Write the failing test, then make it pass**

Append to `tests/examples-zh.test.js`:

```js
test('every built-in board has a Chinese overlay and localizes to a distinct Chinese name', () => {
  const missing = EXAMPLES.filter((ex) => !EXAMPLE_OVERLAYS_ZH[ex.id]).map((ex) => ex.id);
  assert.deepEqual(missing, []);
  const names = EXAMPLES.map((ex) => localizedExample(ex, 'zh').name);
  assert.equal(new Set(names).size, names.length, 'Chinese menu names are unique');
  for (const name of names) assert.match(name, CJK);
  const stray = Object.keys(EXAMPLE_OVERLAYS_ZH).filter((id) => !EXAMPLES.some((ex) => ex.id === id));
  assert.deepEqual(stray, [], 'no overlay without a board');
});
```

Run: `node --test tests/examples-zh.test.js`. If Tasks 3–7 landed every entry it passes at once (25 passing); if it lists a missing board, that board's overlay was skipped — add it from the task that owns it before continuing.

- [ ] **Step 2: README and spec**

In `README.md` replace the Language row with:

```
| Language | 中文 / EN button in the toolbar — switches the interface, palette, checker messages, the copilot's replies, and the built-in example boards between English and Simplified Chinese; English by default; remembered on this device; your own boards' text is never translated |
```

In the spec's "Example boards (phase 2)" section, replace the code block and the sentence after it so the zone entries are objects:

```js
export default {
  'rdk-rover': {
    name: 'RDK X5 漫游车（地瓜机器人）',
    title: 'RDK X5 漫游车',
    nodes: { n1: { label: '电池' }, n3: { label: '机器人主控', notes: '...' } },
    notes: { t1: '...' },
    zones: { z1: { label: '电源' }, zs: { label: 'X5 上的软件 · 未选择运行时' } },
    journey: { j1: { label: '供电与计算', caption: '...' } },
  },
};
```

and amend the following paragraph to say: `localizedExample(example, lang)` in `src/examples.js` (pure) returns the example unchanged for English and, for Chinese, a copy with the overlay applied to `name`, `doc.title`, node `label` and `notes`, note `text`, zone `label` and (for swimlanes) `lanes`, journey `label` and `caption`. Also replace the stale sentences elsewhere in the spec that describe `translateStatic(root = document)` and `translateStatic(dialog)` (Static markup section and the part-editor row of the module table) with: the walker records what it translated on the first pass and replays that list on every change; the part editor rebuilds its own lists. And update the `state.js` row to say custom-part names are never translated, and the `bom.js` row to say headers and built-in part names translate in the dialog and the exports.

- [ ] **Step 3: Screenshots**

Reuse the CDP capture approach from phase 1 (serve the repo, launch headless Chrome with `--remote-debugging-port=0`, connect over WebSocket): set `localStorage.setItem('schematica.lang','zh')`, then navigate to `${origin}/#${await encodeShare(localizedExample(EXAMPLES.find((e) => e.id === id), 'zh').doc)}` for `id` = `rdk-rover` and `ot-purdue`, wait for the node count, `Page.captureScreenshot` each to `.superpowers/sdd/<plan>/rover-zh.png` and `purdue-zh.png` (git-ignored), and view them. Judge: every Chinese label fits its card or flow shape, the swimlane lane names fit their lanes, nothing is clipped. If a label overflows, shorten that label in the overlay (never change `textUnits`); re-run the unit tests.

- [ ] **Step 4: Final gate and commit**

Run: `npm test` (expect 472 + 25 = 497 passing, pristine) and `npm run e2e` (expect `156/156 checks passed`, `no console errors or exceptions`).

```bash
git add tests/examples-zh.test.js README.md docs/superpowers/specs/2026-09-08-chinese-language-design.md
git commit -m "i18n(examples): every board has an overlay; README and spec aligned"
```

---

### Task 9: Wire labels (plan amendment, added during execution)

Discovered from the rover screenshot: the spec's overlay shape never included wire labels, so 74 English-word labels (`logical flow`, `poisons`, `lure mail`, …) stay English on Chinese boards while code-like labels (`CSI-2`, `5V`, `M1`) rightly stay as they are. This task extends the overlay with `wires: { id: label }`, translates every word-like wire label, and guards the rule.

**Files:**
- Modify: `src/examples.js` (`localizedExample` applies `wires`)
- Modify: `src/i18n/examples.zh.js` (a `wires` map on every board that has word-like labels)
- Modify: `tests/examples-zh.test.js` (semantics; per-overlay validity; the word-like rule)
- Modify: `docs/superpowers/specs/2026-09-08-chinese-language-design.md` (overlay shape gains `wires`)

**Interfaces:**
- Consumes: `localizedExample`, `EXAMPLE_OVERLAYS_ZH`.
- Produces: overlay field `wires: { [wireId]: label }`; `WORDY_WIRE_LABEL = /[a-z]{3,}/` and `CODE_LIKE_WIRE_LABELS = ['isoSPI', '500 kbit/s']` exported from `tests/examples-zh.test.js` are test-local (not exported from src).

- [ ] **Step 1: Failing tests**

Append to `tests/examples-zh.test.js`:

```js
const WORDY = /[a-z]{3,}/;
const CODE_LIKE = new Set(['isoSPI', '500 kbit/s']);

test('a wire label in the overlay replaces the English label and leaves the wire otherwise untouched', () => {
  const ex = byId('rdk-rover');
  const zh = localizedExample(ex, 'zh');
  const sw1 = zh.doc.wires.find((w) => w.id === 'sw1');
  assert.equal(sw1.label, '逻辑流');
  const { label, ...rest } = sw1;
  const { label: enLabel, ...enRest } = ex.doc.wires.find((w) => w.id === 'sw1');
  assert.deepEqual(rest, enRest);
  assert.equal(enLabel, 'logical flow');
  assert.equal(zh.doc.wires.find((w) => w.id === 'w6').label, 'CSI-2', 'code-like labels stay');
});

test('every word-like wire label on every board has a Chinese entry, and code-like labels have none', () => {
  const missing = [];
  const stray = [];
  for (const ex of EXAMPLES) {
    const wires = EXAMPLE_OVERLAYS_ZH[ex.id]?.wires || {};
    for (const w of ex.doc.wires) {
      const wordy = (WORDY.test(w.label) && !CODE_LIKE.has(w.label)) || w.label === 'yes' || w.label === 'no';
      if (wordy && wires[w.id] === undefined) missing.push(`${ex.id}.${w.id} ${JSON.stringify(w.label)}`);
      if (!wordy && wires[w.id] !== undefined) stray.push(`${ex.id}.${w.id} ${JSON.stringify(w.label)}`);
      if (wires[w.id] !== undefined) assert.match(wires[w.id], CJK, `${ex.id}.${w.id}`);
    }
    for (const id of Object.keys(wires)) assert.ok(ex.doc.wires.some((w) => w.id === id), `${ex.id}.wires.${id} is not on the board`);
  }
  assert.deepEqual(missing, []);
  assert.deepEqual(stray, []);
});
```

Also extend the per-overlay validity test's allowed top-level keys to `['name', 'title', 'nodes', 'zones', 'notes', 'journey', 'wires']`, and extend its `strip()` helper in the round-trip test to blank `wires[].label` too (`wires: doc.wires.map((w) => ({ ...w, label: '' }))`).

Run: `node --test tests/examples-zh.test.js` → the two new tests FAIL (no `wires` applied; 74 missing).

- [ ] **Step 2: Apply wire overlays**

In `src/examples.js` `localizedExample`, after the zones loop add:

```js
  for (const w of doc.wires) {
    const label = overlay.wires?.[w.id];
    if (label !== undefined) w.label = label;
  }
```

- [ ] **Step 3: Add the `wires` maps**

Add a `wires` field to each of these overlays in `src/i18n/examples.zh.js` (ids are the wire ids on the board; labels exactly as below). Wires labelled exactly `yes` become `是` and exactly `no` become `否` (find every such wire with a grep of `label: 'no'` / `label: 'yes'` in `src/examples.js` and add each id):

```js
  // smart-greenhouse
  wires: { w11: '推送' },
  // vehicle-can
  wires: { w10: '诊断分接' },
  // ota-pipeline
  wires: { w1: '构建产物', w2: '发布', w3: 'TLS 上行', w4: 'OTA 推送', w5: 'AT 链路', w6: '镜像' },
  // rdk-rover, rdk-perception, rdk-s100-node
  wires: { sw1: '逻辑流', sw2: '逻辑流', sw3: '逻辑流' },
  // rdk-x3-robot
  wires: { sw1: '逻辑流', sw2: '逻辑流' },
  // journey-adas
  wires: { w8: '雷达', w12: '整车 CAN FD' },
  // mono2-adas
  wires: { w4: '成像器', w6: '底盘 CAN' },
  // hsd600-adas
  wires: { w8: '前雷达', w10: '角雷达', w11: '角雷达', w12: '整车 CAN FD' },
  // ota-security (plus every `yes` → '是' and `no` → '否' wire on this board)
  wires: { w4: '签名镜像', w11: '是', w16: '投毒', w17: '篡改', w18: '注入' },
  // adas-security (plus every `yes`/`no` wire)
  wires: { w2: '雷达', w8: '诊断 CAN', w9: '镜像流量', w10: '欺骗', w11: 'GNSS 欺骗', w12: '注入', w13: '感染', w14: '回连', w21: '暴露', w17: '是' },
  // ev-bms (isoSPI and 500 kbit/s stay)
  wires: { w3: '预充', w9: '菊花链', w18: '状态', w21: '电芯采样线', w23: '电芯采样线', w29: '线圈回路', w30: '线圈回路' },
  // ot-purdue
  wires: { w1: 'ERP 客户端', w4: 'IDMZ 通道', w5: '管理访问', w6: '单向复制', w7: 'L3 通道', w9: '历史数据', w13: '受控 400 V', w14: '经跳板机 RDP', w15: '诱饵邮件', w16: 'VPN 登录', w17: '运行', w18: '购买', w19: 'VLAN 间无 ACL' },
  // secure-boot (plus every `yes`/`no` wire)
  wires: { w1: '证明 + 密钥', w2: 'QSPI 镜像', w3: 'SWD（已锁定）', w5: '签名镜像 + 证书', w8: '是', w11: '是', w13: '重试', w14: '探测', w15: '在工站被替换', w16: '计数器阻止' },
```

- [ ] **Step 4: Spec**

In the spec's "Example boards (phase 2)" section add `wires: { id: label }` to the overlay shape and this sentence: word-like wire labels translate; code-like labels (bus codes, voltages, pin names) never do, and the test enforces the split.

- [ ] **Step 5: Run and commit**

Run: `node --test tests/examples-zh.test.js` → all passing (27); `npm test` → all green; `npm run e2e` → `156/156` (the rover e2e checks read node labels, not wire labels).

```bash
git add src/examples.js src/i18n/examples.zh.js tests/examples-zh.test.js docs/superpowers/specs/2026-09-08-chinese-language-design.md
git commit -m "i18n(examples): translate word-like wire labels; code-like labels stay"
```
