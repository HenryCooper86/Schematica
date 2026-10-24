import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snap, nodeRect, nodeSize, nodeMeta, portPosition, wireGeom, wireGeomToPoint, curvePoint, wireLanes, WIRE_FAN,
  rectsIntersect, normRect, wrapText, noteHeight, NOTE_W, contentBounds, textUnits, wireLabelRect, SHAPE_LINE_H,
  measureShapeText, measureFigureLabelText, measureFigureMetaText, FIGURE_LABEL_LINE_H, FIGURE_META_LINE_H, FIGURE_LAYOUT,
  zoneLabelLayout, ZONE_LABEL_LINE_H, measureZoneLabelText, zoneRect,
} from '../src/geometry.js';
import { EXAMPLE_OVERLAYS_ZH } from '../src/examples.js';
import { normalizePart, partOf } from '../src/custom.js';

// nodeSize now also returns the wrapped label/meta lines render.js draws, so
// sizing assertions compare only the box; the line fields get their own tests.
const size = (node) => { const s = nodeSize(node); return { w: s.w, h: s.h }; };

for (const side of ['top', 'bottom']) {
  test(`64 supported ${side} ports remain individually spaced on a custom card`, () => {
    const { part } = normalizePart({ name: 'Connector', category: 'system',
      ports: Array.from({ length: 64 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, side, bus: 'gpio' })) });
    const node = { kind: 'custom', part, x: 0, y: 0, label: 'Connector' };
    const rect = nodeRect(node);
    const positions = partOf(node).ports.map(p => portPosition(rect, p).x);
    for (let i = 1; i < positions.length; i++) {
      assert.ok(positions[i] - positions[i - 1] >= 20, 'ports need room around their 10px circles');
    }
  });
}

const CLOSING_PUNCT = new Set([...'。，、；：？！）」』》']);

// The same character classes geometry.js counts as wide, and the same tokens
// it wraps on: a run of non-space, non-CJK characters (a Latin word) is one
// token, every CJK character is its own.
const WIDE_CLASS = '　-〿぀-ヿ㐀-䶿一-鿿가-힯＀-￯';
const tokensOf = (s) => String(s).match(new RegExp(`[${WIDE_CLASS}]|[^\\s${WIDE_CLASS}]+`, 'gu')) || [];

// What wrapping must never do, whatever the text: leave an empty line, start
// a line with closing punctuation (a lone punctuation line included), or put
// a break inside a run of non-wide, non-space characters — tokenizing the
// lines has to give back exactly the source's tokens, in order.
function assertWrapInvariants(source, lines, what) {
  for (const line of lines) {
    assert.ok(line.length > 0, `${what}: empty line in ${JSON.stringify(lines)}`);
    assert.ok(!CLOSING_PUNCT.has(line[0]), `${what}: "${line}" starts with closing punctuation`);
    assert.ok(!(line.length === 1 && CLOSING_PUNCT.has(line)), `${what}: "${line}" is only punctuation`);
  }
  assert.deepEqual(
    lines.flatMap(tokensOf), tokensOf(source),
    `${what}: a line boundary fell inside a word — ${JSON.stringify(lines)}`,
  );
}

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

// net_draw edge geometry: each end sits on the card boundary (5px out) along
// the ray toward the other card's center; the cubic bends along the dominant
// axis only, so a wire always leaves and enters straight.
test('wireGeom anchors on the facing card edges and runs straight between aligned cards', () => {
  const a = { x: 0, y: 0, w: 160, h: 100 };
  const b = { x: 400, y: 0, w: 160, h: 100 };
  const g = wireGeom(a, b);
  assert.deepEqual(g.p1, { x: 165, y: 50 });
  assert.deepEqual(g.p2, { x: 395, y: 50 });
  assert.equal(g.d, 'M 165 50 C 257 50, 303 50, 395 50');
  assert.deepEqual(g.mid, { x: 280, y: 50 });
});

test('wireGeom runs straight between nearly aligned cards on the middle of their shared span', () => {
  // Stacked cards whose centres differ by 10px: a centre ray would tilt.
  const top = { x: 1078, y: 420, w: 128, h: 54 };
  const below = { x: 1078, y: 530, w: 148, h: 54 };
  const g = wireGeom(top, below);
  assert.equal(g.p1.x, g.p2.x, 'a vertical run keeps one x');
  assert.equal(g.p1.x, (1078 + 18 + 1206 - 18) / 2, 'on the middle of the shared span');
  assert.equal(g.p1.y, 474 + 5);
  assert.equal(g.p2.y, 530 - 5);
  // Side by side with offset rows.
  const left = { x: 0, y: 0, w: 100, h: 80 };
  const right = { x: 300, y: 20, w: 100, h: 80 };
  const h = wireGeom(left, right);
  assert.equal(h.p1.y, h.p2.y, 'a horizontal run keeps one y');
  assert.equal(h.p1.y, (38 + 62) / 2);
  // Parallel lanes spread inside the span and stay straight.
  const lanes = [-11, 11].map((o) => wireGeom(left, right, o));
  for (const l of lanes) assert.equal(l.p1.y, l.p2.y);
  assert.notEqual(lanes[0].p1.y, lanes[1].p1.y);
  // Too little shared span: the centre-ray anchors still apply.
  const diag = wireGeom({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 45, w: 100, h: 50 });
  assert.notEqual(diag.p1.y, diag.p2.y);
});

test('wireGeom bends along the dominant axis', () => {
  const a = { x: 0, y: 0, w: 100, h: 50 };
  const below = { x: 0, y: 300, w: 100, h: 50 };
  const g = wireGeom(a, below);
  assert.deepEqual(g.p1, { x: 50, y: 55 }, 'leaves the bottom edge');
  assert.deepEqual(g.p2, { x: 50, y: 295 }, 'enters the top edge');
  assert.equal(g.c1.x, g.p1.x, 'vertical run: control points keep x');
  assert.equal(g.c2.x, g.p2.x);
  const diag = wireGeom(a, { x: 300, y: 60, w: 100, h: 50 });
  assert.equal(diag.c1.y, diag.p1.y, 'horizontal-dominant run: control points keep y');
  assert.ok(diag.p1.x > 100 && diag.p1.x <= 105, 'exits through the right edge');
});

test('wireGeom offset displaces the whole curve sideways for parallel wires', () => {
  const a = { x: 0, y: 0, w: 160, h: 100 };
  const b = { x: 400, y: 0, w: 160, h: 100 };
  const up = wireGeom(a, b, -11);
  const down = wireGeom(a, b, 11);
  assert.deepEqual(up.p1, { x: 165, y: 39 });
  assert.deepEqual(down.p1, { x: 165, y: 61 });
  assert.notEqual(up.d, down.d);
});

test('wireGeomToPoint ends exactly at the cursor', () => {
  const a = { x: 0, y: 0, w: 160, h: 100 };
  const g = wireGeomToPoint(a, { x: 500, y: 50 });
  assert.deepEqual(g.p1, { x: 165, y: 50 });
  assert.deepEqual(g.p2, { x: 500, y: 50 });
});

test('curvePoint walks the cubic from p1 to p2 through mid', () => {
  const g = wireGeom({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 200, w: 100, h: 50 });
  assert.deepEqual(curvePoint(g, 0), g.p1);
  assert.deepEqual(curvePoint(g, 1), g.p2);
  assert.deepEqual(curvePoint(g, 0.5), g.mid);
});

test('wireLanes fans wires that share a node pair and centers the fan', () => {
  const wires = [
    { id: 'w1', from: { node: 'a' }, to: { node: 'b' } },
    { id: 'w2', from: { node: 'b' }, to: { node: 'a' } },
    { id: 'w3', from: { node: 'a' }, to: { node: 'c' } },
    { id: 'w4', from: { node: 'a' }, to: { node: 'b' } },
  ];
  const lanes = wireLanes(wires);
  assert.equal(lanes.get('w3'), 0, 'a lone wire runs down the middle');
  assert.deepEqual([lanes.get('w1'), lanes.get('w2'), lanes.get('w4')], [-WIRE_FAN, 0, WIRE_FAN]);
});

test('rect helpers', () => {
  assert.ok(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }));
  assert.ok(!rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 }));
  assert.deepEqual(normRect(10, 10, 0, 5), { x: 0, y: 5, w: 10, h: 5 });
});

// net_draw card sizing: 104x74 at minimum, wider for long labels (capped at
// 240), 12.5px taller per meta line. Stored sizes are gone; nodeRect derives.
test('nodeSize follows the content like net_draw', () => {
  assert.deepEqual(size({ label: 'MCU' }), { w: 104, h: 74 });
  assert.deepEqual(size({ label: 'MCU', sublabel: 'ESP32-S3', addr: '0x76' }), { w: 104, h: 99 });
  assert.deepEqual(size({ label: 'MCU', sublabel: 'a', addr: 'b', rail: 'c' }), { w: 104, h: 111.5 });
  assert.equal(size({ label: 'Flight controller unit' }).w, 22 * 6.8 + 24, 'label widens the card');
  assert.equal(size({ label: 'x', sublabel: 'y'.repeat(20) }).w, 20 * 5.9 + 26, 'meta lines widen it too');
  assert.equal(size({ label: 'x'.repeat(80) }).w, 240, 'width is capped');
  assert.deepEqual(nodeMeta({ label: 'a', sublabel: ' ', addr: '0x1', rail: '' }), [{ field: 'addr', text: '0x1' }], 'blank meta lines are skipped');
  assert.deepEqual(nodeRect({ x: 10, y: 20, label: 'MCU' }), { x: 10, y: 20, w: 104, h: 74 });
});

// A long title wraps inside the 240px cap instead of spilling out: the width
// stays capped, the card grows taller per wrapped line, and every wrapped
// line fits the label's text area (24px padding, 6.8px per text unit).
test('a long title wraps within the width cap and grows the card taller', () => {
  const text = 'CVE-2026-31431 in-place AF_ALG AEAD leads to file corruption and root privilege escalation';
  const s = nodeSize({ label: text });
  assert.equal(s.w, 240, 'width stays capped');
  assert.ok(s.h > 74, 'the card grows taller for the extra lines');
  assert.ok(s.labelLines.length > 1, 'the title wraps onto more than one line');
  assert.equal(s.labelLines.join(' '), text, 'full semantic text preserved');
  for (const line of s.labelLines) assert.ok(textUnits(line) * 6.8 <= 240 - 24, `"${line}" fits the label area`);
});

test('a long unbroken identifier and a long CJK run wrap without losing characters', () => {
  const idText = 'SUPERCALIFRAGILISTICEXPIALIDOCIOUS'.repeat(2);
  const id = nodeSize({ label: idText });
  assert.ok(id.labelLines.length > 1);
  assert.equal(id.labelLines.join(''), idText, 'identifier preserved');
  for (const line of id.labelLines) assert.ok(textUnits(line) * 6.8 <= 240 - 24, `"${line}" fits`);

  const cjkText = '安全漏洞：原地操作使用不同的内存映射导致文件损坏并获得root权限'.repeat(2);
  const cjk = nodeSize({ label: cjkText });
  assert.ok(cjk.labelLines.length > 1, 'a long CJK title wraps too');
  assert.equal(cjk.labelLines.join(''), cjkText, 'CJK characters preserved');
  for (const line of cjk.labelLines) assert.ok(textUnits(line) * 6.8 <= 240 - 24, `"${line}" fits`);
});

test('long meta lines wrap too and push the card taller', () => {
  const s = nodeSize({ label: 'V', sublabel: 'x'.repeat(50) });
  assert.equal(s.w, 240, 'capped by the long sublabel');
  const sub = s.metaLines.find((m) => m.field === 'sublabel');
  assert.ok(sub.lines.length > 1, 'the sublabel wraps');
  assert.equal(sub.lines.join(''), 'x'.repeat(50), 'full meta text preserved');
  for (const line of sub.lines) assert.ok(textUnits(line) * 5.9 <= 240 - 26, `"${line}" fits the meta area`);
  assert.ok(s.h >= 74 + 2 * 12.5, 'wrapped meta lines add height');
});

test('a wrapped label keeps its ports on the resulting taller card', () => {
  const part = { name: 'C', category: 'misc', accent: null, icon: { text: 'C' }, ports: [{ id: 'p', name: 'P', side: 'left', bus: 'gpio', required: false }], fields: [] };
  const node = { kind: 'custom', label: 'a'.repeat(80), part, x: 0, y: 0 };
  const s = nodeSize(node);
  assert.ok(s.h > 74, 'the wrapped label grows the card');
  const rect = nodeRect(node);
  const pos = portPosition(rect, { side: 'left', offset: 0.5 });
  assert.equal(pos.y, rect.y + rect.h * 0.5, 'ports track the grown height');
});

test('a long wire label wraps into a bounded multiline pill with the full text', () => {
  const geo = wireGeom({ x: 0, y: 0, w: 104, h: 74 }, { x: 600, y: 0, w: 104, h: 74 });
  const text = 'in-place operation with different mappings leads to file corruption and root privilege escalation (per Red Hat) [source]';
  const label = wireLabelRect({ bus: 'gpio', label: text }, geo, 0, []);
  assert.ok(label.w <= 220, `pill bounded at ${label.w}`);
  assert.ok(label.lines.length > 1, 'the description wraps');
  assert.equal(label.lines.join(' '), text, 'full semantic text preserved');
  assert.ok(label.h > 20, 'a wrapped pill is taller than a single line');
  assert.ok(Math.abs((label.y + label.h / 2) - label.at.y) < 1e-9, 'the pill stays centered on its anchor point');
});

test('a short wire label keeps its exact single-line pill', () => {
  const geo = wireGeom({ x: 0, y: 0, w: 104, h: 74 }, { x: 600, y: 0, w: 104, h: 74 });
  const label = wireLabelRect({ bus: 'i2c', label: '' }, geo, 0, []);
  assert.equal(label.lines.length, 1);
  assert.equal(label.h, 20);
  assert.equal(label.w, Math.round((textUnits('I2C') * 6.4 + 22) * 100) / 100);
});

test('a wrapped label avoids an obstacle using its full multiline height', () => {
  const geo = wireGeom({ x: 0, y: 0, w: 104, h: 74 }, { x: 600, y: 0, w: 104, h: 74 });
  const obstacle = { x: 200, y: -30, w: 60, h: 100 };
  const label = wireLabelRect({ bus: 'gpio', label: 'a very long description that must wrap into several lines to stay readable' }, geo, 0, [obstacle]);
  assert.ok(label.lines.length > 1);
  assert.equal(rectsIntersect(label, obstacle), false, 'the taller pill slides clear of the obstacle');
});

test('wrapText wraps at maxChars and never returns empty', () => {
  assert.deepEqual(wrapText('short'), ['short']);
  const lines = wrapText('one two three four five six seven eight nine ten', 12);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(l.length <= 12 || !l.includes(' '));
  assert.deepEqual(wrapText(''), ['']);
});

test('long URLs and identifiers wrap within the budget without losing characters', () => {
  for (const text of [
    'https://d-robotics.github.io/rdk_doc/en/Quick_start/accessory/overview/',
    'SUPERCALIFRAGILISTICEXPIALIDOCIOUS'.repeat(3),
    '👩🏽‍🔧'.repeat(15),
  ]) {
    const lines = wrapText(text);
    assert.ok(lines.length > 1);
    assert.equal(lines.join(''), text);
    assert.ok(lines.every(line => textUnits(line) <= 22), JSON.stringify(lines));
    const graphemes = value => [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(value)].map(s => s.segment);
    assert.deepEqual(lines.flatMap(graphemes), graphemes(text), 'wrapping preserves grapheme clusters');
  }
});

test('wrapText breaks CJK text per character, ASCII output unchanged', () => {
  // An English sentence must wrap into exactly the lines the old,
  // whitespace-only-split algorithm produced.
  assert.deepEqual(
    wrapText('Every crossing between levels passes a firewall.'),
    ['Every crossing between', 'levels passes a', 'firewall.'],
  );

  // A Chinese sentence has no spaces between most characters, so the old
  // algorithm (splitting only on whitespace) treated a long run as one
  // unbreakable "word" and never wrapped it. The new tokenizer gives every
  // CJK character its own token, so it still wraps.
  const cjk = '仅为设计：双目占用两个 CSI 接口。软件流程为描述性，未选择运行时。';
  const lines = wrapText(cjk);
  assert.deepEqual(lines, ['仅为设计：双目占用两个', 'CSI 接口。软件流程为描', '述性，未选择运行时。']);
  assert.ok(lines.length > 1, 'a long CJK sentence still wraps into multiple lines');
  for (const line of lines) {
    assert.ok(textUnits(line) <= 22, `"${line}" exceeds the 22-unit width budget`);
    assert.ok(!line.startsWith(' ') && !line.endsWith(' '), `"${line}" has a stray edge space`);
    assert.ok(!CLOSING_PUNCT.has(line[0]), `"${line}" starts with closing punctuation`);
  }
  // No character is dropped: with whitespace normalized away on both sides,
  // rejoining the lines reproduces the source exactly. The one space that
  // lands mid-line (between "CSI" and "接口", both ending up in the same
  // line) survives verbatim; the other original space sits exactly on a
  // line break and is consumed there — the same way a wrapped English
  // sentence never renders the space it broke on.
  assert.equal(lines.join('').replace(/\s+/g, ''), cjk.replace(/\s+/g, ''), 'no character is lost');
  assert.ok(lines.some((l) => l.includes('CSI 接口')), 'a space that lands mid-line is preserved verbatim');

  // A Latin run immediately followed by CJK characters with no whitespace
  // between them in the source never gains a space at that boundary.
  assert.deepEqual(wrapText('ESP32-S3轮询'), ['ESP32-S3轮询']);
});

test('wrapText carries a closing punctuation mark down to join the character before it, never starting a line with one', () => {
  // 11 CJK characters (textUnits 20.9) plus the following "。" (textUnits
  // 1.9 more) lands at 22.8, just over the 22-unit budget: the break falls
  // exactly before the "。". Without the carry rule the next line would
  // start with "。" alone (and, if it were the last token, be a line
  // containing only "。"); with it, the finished line's last character
  // ("一") moves down to join the punctuation instead.
  const prefix = '一二三四五六七八九十一'; // 11 characters
  assert.ok(textUnits(prefix) <= 22 && textUnits(prefix) > 20, textUnits(prefix));
  assert.ok(textUnits(prefix + '。') > 22, 'adding "。" pushes the line over the 22-unit budget');
  const s = prefix + '。这是用来测试换行的更多文字内容确保后续换行仍然正常工作。';
  const lines = wrapText(s);
  assert.equal(lines[0], prefix.slice(0, -1), 'the finished line loses its last character');
  assert.ok(lines[1].startsWith('一。'), 'the next line starts with the carried character followed by the punctuation');
  for (const line of lines) assert.ok(!CLOSING_PUNCT.has(line[0]), `"${line}" starts with closing punctuation`);
  assert.equal(lines.join(''), s, 'no character is lost or duplicated by the carry');
});

test('wrapText carries a whole run of adjacent closing punctuation, not just its last mark', () => {
  // Reproduction: a "。，" pair sits right where the break lands. Carrying
  // only the line's literal last character (as fix round 2 did) carries
  // the "。" itself down, so the new line still starts with punctuation
  // ("。，..."). The fix must walk back over the whole trailing run.
  const s = '一二三四五六七八九十。，这是后续填充文字用来确保测试有效并继续换行下去';
  const lines = wrapText(s);
  for (const line of lines) assert.ok(!CLOSING_PUNCT.has(line[0]), `"${line}" starts with closing punctuation`);
  assert.ok(lines.some((l) => l.includes('十。，')), 'the "。，" pair stays attached to "十"');
  assert.equal(lines.join(''), s, 'no character is lost or duplicated by the carry');

  // "）。" adjacency: 10 "一" (textUnits 19) plus "）" (20.9) still fits, but
  // adding "。" reaches 22.8 — over budget — so the break lands exactly
  // before "）。", the run this test is built to land on.
  const prefix10 = '一'.repeat(10);
  assert.ok(textUnits(prefix10 + '）') <= 22);
  assert.ok(textUnits(prefix10 + '）。') > 22, 'adding "）。" pushes the line over the 22-unit budget');
  const s2 = `${prefix10}）。这是后续填充文字用来确保测试有效并继续换行下去`;
  const lines2 = wrapText(s2);
  for (const line of lines2) assert.ok(!CLOSING_PUNCT.has(line[0]), `"${line}" starts with closing punctuation`);
  assert.ok(lines2.some((l) => l.includes('一）。')), 'the "）。" pair travels with the preceding "一"');
  assert.equal(lines2.join(''), s2, 'no character is lost or duplicated by the carry');
});

test('the carry moves whole tokens, so a Latin word before the punctuation travels down intact', () => {
  // The carry pops the trailing punctuation plus one preceding *token*. When
  // that token is a Latin word, slicing the finished line by code point (as
  // fix round 3 did) cut it in half — the shipped rdk-s100-node note broke as
  // "…因此 CS" / "I、UART…". Each case below is built so the break lands
  // exactly on the mark that follows the Latin word.
  const cases = [
    ['某某某某某某', ' ESP32-S3', '。', '后面还有更多文字继续填充'],
    ['所有电源域共用一条', ' GND', '。', '后面还有更多文字继续填充'],
    ['双目相机各占用一路', ' CSI', '、', 'UART 和以太网链路仍未确认'],
  ];
  for (const [head, word, punct, tail] of cases) {
    assert.ok(textUnits(head + word) <= 22, `${head}${word} should still fit the budget`);
    assert.ok(textUnits(head + word + punct) > 22, `${head}${word}${punct} should overflow it`);
    const s = `${head}${word}${punct}${tail}`;
    const lines = wrapText(s);
    assertWrapInvariants(s, lines, s);
    assert.equal(lines[0], head, 'the finished line keeps only the characters before the Latin word');
    assert.ok(
      lines[1].startsWith(word.trim() + punct),
      `the word and its mark start the next line, together: "${lines[1]}"`,
    );
  }
});

test('a generated set of strings with 1-3-mark punctuation runs never wraps to a line starting with punctuation or inside a word', () => {
  // For every length 1..40 and every insertion point after the first token
  // (inserting right at the start just makes the input itself begin with
  // punctuation, which is not a wrapping artifact to fix), drop in a run of
  // 1-3 of each punctuation mark and wrap the result.
  //
  // Three fillers: plain "一" characters, and two that alternate CJK
  // characters with the short Latin runs real boards carry — spaced the way
  // the dictionary writes them ("因此 CSI、"), and unspaced ("ESP32-S3轮询").
  // A Latin run is what the by-code-point carry used to cut in half, so the
  // wrap invariants (which include "no token is split") are checked on every
  // generated case.
  const PUNCTS = ['。', '，', '）'];
  const MIXED = ['一', 'GND', '二', 'CSI', '三', 'ESP32-S3', '四', '五'];
  // Token `i` of a filler, with the separator that precedes it.
  const fillers = [
    (i) => '一',
    (i) => (i && (/[A-Z]/.test(MIXED[i % MIXED.length]) || /[A-Z]/.test(MIXED[(i - 1) % MIXED.length])) ? ' ' : '') + MIXED[i % MIXED.length],
    (i) => MIXED[i % MIXED.length],
  ];
  let cases = 0;
  for (const filler of fillers) {
    for (let len = 1; len <= 40; len++) {
      const pieces = Array.from({ length: len }, (_, i) => filler(i));
      for (let pos = 1; pos <= len; pos++) {
        for (const p of PUNCTS) {
          for (let run = 1; run <= 3; run++) {
            const s = pieces.slice(0, pos).join('') + p.repeat(run) + pieces.slice(pos).join('');
            const lines = wrapText(s);
            cases += 1;
            assertWrapInvariants(s, lines, `generated ${JSON.stringify(s)}`);
          }
        }
      }
    }
  }
  assert.ok(cases > 3000, `only generated ${cases} cases`);

  // The space-free filler additionally reconstructs character for character:
  // with no whitespace in the source, joining the lines gives the source back.
  const base = '一'.repeat(30);
  const s = `${base.slice(0, 12)}。，${base.slice(12)}`;
  assert.equal(wrapText(s).join(''), s, `reconstruction mismatch for ${JSON.stringify(s)}`);
});

test('every shipped Chinese note and journey caption wraps cleanly', () => {
  // Both wraps the app actually performs: a board note through the 22-unit
  // note wrap (render.js), and a journey caption through the 64-unit wrap the
  // recorder lays out its caption with (recorder.js).
  let checked = 0;
  for (const [id, overlay] of Object.entries(EXAMPLE_OVERLAYS_ZH)) {
    for (const [key, text] of Object.entries(overlay.notes || {})) {
      checked += 1;
      assertWrapInvariants(text, wrapText(text), `${id}.notes.${key}`);
    }
    for (const [key, step] of Object.entries(overlay.journey || {})) {
      if (step.caption === undefined) continue;
      checked += 1;
      assertWrapInvariants(step.caption, wrapText(step.caption, 64), `${id}.journey.${key}.caption`);
    }
  }
  assert.ok(checked > 0, 'at least one note was actually checked');
});

test('noteHeight grows with lines', () => {
  assert.equal(noteHeight('short'), 32);
  assert.ok(noteHeight('a very long note that definitely wraps onto multiple lines for sure') > 32);
});

test('contentBounds covers nodes, zones, zone headers and notes; null when empty', () => {
  const doc = {
    nodes: [{ x: 100, y: 100, w: 50, h: 50 }],
    zones: [{ x: 0, y: 0, w: 80, h: 80 }],
    notes: [{ x: 200, y: 10, text: 'hi' }],
    wires: [],
  };
  const b = contentBounds(doc);
  assert.equal(b.x, 0);
  // The zone's header pill rises above its top edge — at least the 9px
  // straddle, more where the caption wraps — and that visible extent
  // (zoneRect) belongs to the board Fit and exports frame.
  assert.equal(b.y, zoneRect(doc.zones[0]).y);
  assert.ok(b.y <= -9);
  assert.equal(b.w, 200 + NOTE_W);
  assert.ok(b.h >= 150);
  assert.equal(contentBounds({ nodes: [], zones: [], notes: [], wires: [] }), null);
  // A swimlane's title lives inside its rectangle, so it adds nothing.
  const lane = contentBounds({
    nodes: [], notes: [], wires: [],
    zones: [{ x: 0, y: 0, w: 320, h: 220, kind: 'swimlane', orient: 'h', lanes: ['A'], label: 'P' }],
  });
  assert.equal(lane.y, 0);
});

test('laneSnapPoint pulls the cross-axis onto lane centerlines inside a swimlane', async () => {
  const { laneSnapPoint, LANE_TITLE_H } = await import('../src/geometry.js');
  const doc = {
    zones: [{
      id: 'z1', x: 0, y: 0, w: 300, h: LANE_TITLE_H + 300, label: 'P', color: '#a78bfa',
      kind: 'swimlane', orient: 'h', lanes: ['A', 'B', 'C'],
    }],
  };
  // Lane centerlines at LANE_TITLE_H + 50/150/250.
  const c1 = LANE_TITLE_H + 50;
  assert.deepEqual(laneSnapPoint(doc, 100, c1 + 10), { x: 100, y: c1 }, 'within threshold snaps');
  assert.deepEqual(laneSnapPoint(doc, 100, c1 + 40), { x: 100, y: c1 + 40 }, 'beyond threshold stays');
  assert.deepEqual(laneSnapPoint(doc, 100, LANE_TITLE_H - 4), { x: 100, y: LANE_TITLE_H - 4 }, 'title band never snaps');
  assert.deepEqual(laneSnapPoint(doc, 999, c1 + 10), { x: 999, y: c1 + 10 }, 'outside the swimlane stays');
  doc.zones[0].orient = 'v';
  assert.deepEqual(laneSnapPoint(doc, 58, 200), { x: 50, y: 200 }, 'vertical lanes snap x');
  const plain = { zones: [{ id: 'z2', x: 0, y: 0, w: 300, h: 300, label: 'Z', color: '#4a90d9' }] };
  assert.deepEqual(laneSnapPoint(plain, 100, 100), { x: 100, y: 100 }, 'plain zones never snap');
});

// Zone resize handles (net_draw's corner handles): the corner opposite the
// dragged one stays fixed, sizes never drop below the minimum, and dragging
// past the fixed corner flips the rectangle instead of inverting it.
test('resizeZone keeps the opposite corner fixed and enforces minimum sizes', async () => {
  const { resizeZone } = await import('../src/geometry.js');
  const z = { x: 100, y: 100, w: 200, h: 150 };
  assert.deepEqual(resizeZone(z, 'se', 400, 300), { x: 100, y: 100, w: 300, h: 200 });
  assert.deepEqual(resizeZone(z, 'nw', 50, 60), { x: 50, y: 60, w: 250, h: 190 });
  assert.deepEqual(resizeZone(z, 'ne', 350, 120), { x: 100, y: 120, w: 250, h: 130 });
  assert.deepEqual(resizeZone(z, 'sw', 150, 320), { x: 150, y: 100, w: 150, h: 220 });
  assert.deepEqual(resizeZone(z, 'se', 120, 110), { x: 100, y: 100, w: 90, h: 70 }, 'clamped to the 90x70 minimum');
  assert.deepEqual(resizeZone(z, 'se', 120, 110, { w: 320, h: 220 }), { x: 100, y: 100, w: 320, h: 220 }, 'swimlanes keep their larger minimum');
  const flipped = resizeZone(z, 'se', 20, 30);
  assert.equal(flipped.x + flipped.w, 100, 'dragging past the fixed corner flips around it');
});

test('zoneMembers lists the cards whose center sits inside the zone, plus notes inside it', async () => {
  const { zoneMembers } = await import('../src/geometry.js');
  const doc = {
    nodes: [
      { id: 'in', x: 120, y: 120, label: 'a' },
      { id: 'edge', x: 260, y: 120, label: 'b' },
      { id: 'out', x: 900, y: 900, label: 'c' },
    ],
    notes: [{ id: 't-in', x: 130, y: 200, text: 'x' }, { id: 't-out', x: 700, y: 700, text: 'y' }],
    zones: [],
    wires: [],
  };
  const zone = { x: 100, y: 100, w: 200, h: 200 };
  assert.deepEqual(zoneMembers(doc, zone).sort(), ['in', 't-in'], 'a card whose center (312, 157) lies outside is not carried');
});


// ---- Zone captions ----
// The header pill is bounded by the zone it titles: a caption too long for
// one line wraps (same tokenizer as cards, notes and wire pills), keeps every
// character, and never crosses the zone's side edges — measured in the same
// 10px/700 font the canvas draws (the conservative 1em-per-unit bound outside
// the browser), so a run of wide bold glyphs cannot overflow either. A short
// caption keeps at least net_draw's estimated straddling pill, so existing
// boards never shrink.
const captionFits = (cap) => {
  for (const line of cap.lines) {
    assert.ok(measureZoneLabelText(line) <= cap.width - 18 + 1e-9, `line fits the pill: ${line}`);
  }
};

test('a long zone caption wraps inside the zone, growing upward from a pinned bottom', () => {
  const label = 'Internal network segment · segmented VLAN carrying user traffic [source: network-policy.txt]';
  const zone = { x: 40, y: 200, w: 300, h: 240, label };
  const cap = zoneLabelLayout(zone);
  assert.ok(cap.lines.length > 1, `a 300px zone cannot hold the caption on one line (${cap.lines.length} lines)`);
  assert.equal(cap.lines.join(' '), label, 'the caption is fully retained, never truncated');
  assert.ok(cap.x + cap.width <= zone.w - 12, `pill stays inside the side edges (${cap.x}+${cap.width} ≤ ${zone.w - 12})`);
  assert.equal(cap.height, 18 + (cap.lines.length - 1) * ZONE_LABEL_LINE_H, 'each wrapped line adds its height');
  // Wrapped lines stack above the edge, never below it: members of boards
  // laid out at the historic y+36 gap stay clear without any migration.
  assert.equal(cap.bottom, 9, 'the pill bottom is pinned 9px below zone.y');
  assert.equal(cap.y, 9 - cap.height, 'extra lines extend upward over the edge');
  captionFits(cap);
});

test('a short zone caption keeps at least net_draw\'s single-line straddling pill', () => {
  const label = 'Plant network';
  const cap = zoneLabelLayout({ x: 0, y: 0, w: 300, h: 200, label });
  assert.deepEqual(cap.lines, [label]);
  assert.ok(cap.width >= textUnits(label) * 6.2 + 18 - 1e-9, `never narrower than the estimate (${cap.width})`);
  assert.ok(cap.width >= measureZoneLabelText(label) + 18 - 1e-9, 'never narrower than its measured text');
  assert.ok(cap.width <= 300 - 24, 'bounded by the zone');
  assert.equal(cap.height, 18);
  assert.equal(cap.y, -9);
  assert.equal(cap.bottom, 9);
  const fallback = zoneLabelLayout({ w: 300 });
  assert.deepEqual(fallback.lines, ['Zone'], 'an unnamed zone titles itself');
});

test('a run of wide bold glyphs cannot overflow the pill', () => {
  const single = zoneLabelLayout({ x: 0, y: 0, w: 300, h: 200, label: 'W'.repeat(10) });
  assert.equal(single.lines.length, 1, 'ten W fit one line');
  captionFits(single);
  assert.ok(single.width > textUnits('W'.repeat(10)) * 6.2 + 18, 'wide glyphs widen the pill past the average estimate');
  const wrapped = zoneLabelLayout({ x: 0, y: 0, w: 300, h: 200, label: 'W'.repeat(60) });
  assert.ok(wrapped.lines.length > 1, 'sixty W wrap');
  assert.equal(wrapped.lines.join(''), 'W'.repeat(60), 'no glyphs lost');
  assert.equal(wrapped.width, 300 - 24);
  captionFits(wrapped);
});

test('CJK captions, unbreakable runs and tiny or locked zones all stay bounded', () => {
  const zh = zoneLabelLayout({ x: 0, y: 0, w: 260, h: 200, label: '按普渡层级划分的工厂网络边界与隔离区' });
  assert.ok(zh.lines.length > 1, 'a CJK caption wraps per character');
  assert.equal(zh.lines.join(''), '按普渡层级划分的工厂网络边界与隔离区', 'no characters lost');
  assert.ok(zh.x + zh.width <= 260 - 12, 'the CJK pill stays inside');
  captionFits(zh);

  const url = zoneLabelLayout({ x: 0, y: 0, w: 200, h: 200, label: 'boundary=https://boundary.example.internal/corporate/trust/edge' });
  assert.equal(url.lines.join(''), 'boundary=https://boundary.example.internal/corporate/trust/edge', 'a long URL breaks without losing characters');
  assert.ok(url.lines.length > 1);
  assert.ok(url.x + url.width <= 200 - 12);
  captionFits(url);

  // The editor's minimum zone: a caption longer than the zone is never cut.
  const tiny = zoneLabelLayout({ x: 0, y: 0, w: 90, h: 70, label: 'DMZ boundary between office and plant networks' });
  assert.equal(tiny.width, 90 - 24);
  // Words wider than the 66px pill break by grapheme rather than truncate.
  assert.equal(tiny.lines.join('').replace(/ /g, ''), 'DMZboundarybetweenofficeandplantnetworks');
  assert.ok(tiny.x + tiny.width <= 90 - 12);
  captionFits(tiny);

  const locked = zoneLabelLayout({ x: 0, y: 0, w: 200, h: 200, label: 'Locked trust boundary', locked: true });
  assert.ok(locked.x + locked.width <= 200 - 24, 'a locked zone keeps the padlock clear of the text');
  captionFits(locked);
});

test('zone caption layout is deterministic for repeated Arrange and Fit', () => {
  const zone = { x: 0, y: 0, w: 320, h: 200, label: 'Trust boundary · internal segmented VLAN [source: policy.txt]' };
  assert.deepEqual(zoneLabelLayout(zone), zoneLabelLayout({ ...zone }));
});

test('sub-minimum saved widths keep the caption inside with full text retained', () => {
  const label = 'DMZ boundary';
  for (const w of [1, 20, 45]) {
    for (const locked of [false, true]) {
      const cap = zoneLabelLayout({ x: 0, y: 0, w, h: 70, label, locked });
      assert.ok(cap.x >= -1e-9 && cap.x + cap.width <= w + 1e-9,
        `the pill fits a ${w}px ${locked ? 'locked' : 'unlocked'} frame (${cap.x}+${cap.width} ≤ ${w})`);
      assert.equal(cap.lines.join('').replace(/ /g, ''), 'DMZboundary', `no character dropped at w=${w}`);
      assert.equal(cap.bottom, 9, 'the bottom stays pinned whatever the width');
      assert.equal(cap.height, 18 + (cap.lines.length - 1) * ZONE_LABEL_LINE_H);
      assert.ok(cap.textWidth > 0 && cap.textWidth <= cap.width + 1e-9, 'the text budget sits inside the pill');
      for (const line of cap.lines) {
        if (measureZoneLabelText(line) > cap.textWidth + 0.5) {
          assert.equal([...line].length, 1, `only a lone indivisible grapheme may exceed the budget: ${line}`);
        }
      }
    }
  }
  // Continuity at the thresholds and unchanged ordinary output above them.
  const long = 'A caption far too long for any of these widths to hold on one line';
  assert.equal(zoneLabelLayout({ x: 0, y: 0, w: 48, h: 70, label: long }).width, 24, 'unlocked: the historic floor at 48px');
  assert.equal(zoneLabelLayout({ x: 0, y: 0, w: 48, h: 70, label: long }).x, 12);
  assert.equal(zoneLabelLayout({ x: 0, y: 0, w: 66, h: 70, label: long, locked: true }).width, 24, 'locked: the historic floor at 66px');
  assert.equal(zoneLabelLayout({ x: 0, y: 0, w: 90, h: 70, label: 'DMZ boundary between office and plant networks' }).width, 90 - 24,
    'an ordinary zone keeps its exact historic pill');
});

test('zoneRect frames the caption outset while the frame bottom and sides stay put', () => {
  const label = 'Internal network segment · segmented VLAN carrying user traffic [source: network-policy.txt]';
  const zone = { x: 40, y: 200, w: 300, h: 240, label };
  const cap = zoneLabelLayout(zone);
  assert.ok(cap.lines.length > 1, 'the caption wraps');
  const visual = zoneRect(zone);
  assert.equal(visual.x, zone.x, 'the frame\'s left edge is the visual left edge');
  assert.equal(visual.w, zone.w);
  assert.equal(visual.y, zone.y + cap.y, 'the caption\'s upward outset leads the extent');
  assert.equal(visual.y + visual.h, zone.y + zone.h, 'the frame\'s bottom never moves');
  // A single-line caption still straddles 9px above the edge.
  assert.equal(zoneRect({ x: 0, y: 100, w: 300, h: 200, label: 'Plant network' }).y, 91);
  // A swimlane's title lives inside its frame: the plain rect, whatever the label.
  const lane = { x: 0, y: 0, w: 400, h: 300, kind: 'swimlane', orient: 'h', lanes: ['A'], label: 'A swimlane title far too long for any ordinary zone pill to hold' };
  assert.deepEqual(zoneRect(lane), { x: 0, y: 0, w: 400, h: 300 });
});
// Process-flow shapes size like net_draw's: label-driven widths within 96–290,
// fixed heights per shape, and a square connector.
test('nodeSize sizes process-flow shapes like net_draw', () => {
  assert.deepEqual(size({ kind: 'process', label: 'Process' }), { w: 96, h: 54 });
  assert.deepEqual(size({ kind: 'decision', label: 'Decision?' }), { w: 137.5, h: 76 });
  assert.deepEqual(size({ kind: 'dataio', label: 'Data / I-O' }), { w: 140, h: 54 });
  assert.deepEqual(size({ kind: 'document', label: 'Document' }), { w: 100, h: 62 });
  assert.deepEqual(size({ kind: 'connector', label: 'A' }), { w: 46, h: 46 });
  assert.equal(size({ kind: 'process', label: 'x'.repeat(80) }).w, 290, 'capped');
  assert.deepEqual(size({ kind: 'process', label: 'Process', sublabel: 'ignored', addr: 'too' }), { w: 96, h: 54 }, 'shapes carry no meta lines');
  assert.deepEqual(size({ kind: 'router', label: 'Core Router', fields: { ip: '10.0.0.1' } }), { w: 104, h: 86.5 }, 'network devices are ordinary cards sized by their fields');
  assert.deepEqual(size({ kind: 'router', label: 'Core Router', addr: '10.0.0.1' }), { w: 104, h: 74 }, 'the hardware address is not one of their lines');
});

// A connector's label is an editable arbitrary string (not just the default
// letter), so a long one must wrap and the disc must grow around the block.
// Containment is checked with the same measured width the geometry uses
// (measureShapeText — the 1em-per-unit fallback outside the browser), never
// the average 7px-per-unit estimate, so a run of wide glyphs is not missed.
test('a long connector label wraps inside a grown circle with the full text', () => {
  assert.deepEqual(size({ kind: 'connector', label: 'A' }), { w: 46, h: 46 }, 'a single letter keeps its circle');
  const text = 'Long connector label requiring multiple wrapped lines';
  const s = nodeSize({ kind: 'connector', label: text });
  assert.ok(s.labelLines.length > 1, 'the label wraps');
  assert.equal(s.labelLines.join(' '), text, 'full text preserved');
  assert.equal(s.w, s.h, 'the connector stays round');
  assert.ok(s.w > 46, 'the circle grows to fit the block');
  const r = s.w / 2;
  for (let i = 0; i < s.labelLines.length; i++) {
    const baseline = s.h / 2 + 4.2 + (i - (s.labelLines.length - 1) / 2) * SHAPE_LINE_H;
    for (const y of [baseline - 9, baseline + 3]) {
      const chordHalf = Math.sqrt(Math.max(0, r * r - (y - r) ** 2));
      assert.ok(measureShapeText(s.labelLines[i]) / 2 <= chordHalf, `line ${i} stays inside the disc`);
    }
  }
});

test('a long decision label grows the diamond so every line stays inside the silhouette', () => {
  const text = 'M'.repeat(240);
  const s = nodeSize({ kind: 'decision', label: text });
  assert.ok(s.labelLines.length > 1, 'the label wraps');
  assert.equal(s.labelLines.join(''), text, 'full text preserved');
  assert.equal(s.w, 290, 'width stays capped');
  assert.ok(s.h > 76, 'the diamond grows taller');
  for (let i = 0; i < s.labelLines.length; i++) {
    const baseline = s.h / 2 + 4.2 + (i - (s.labelLines.length - 1) / 2) * SHAPE_LINE_H;
    for (const y of [baseline - 9, baseline + 3]) {
      const avail = s.w / 2 * (1 - 2 * Math.abs(y - s.h / 2) / s.h);
      assert.ok(measureShapeText(s.labelLines[i]) / 2 <= avail, `line ${i} stays inside the diamond`);
    }
  }
});

test('nodeMeta shows a schema part\'s filled fields (never severity) and sizes the card by them', () => {
  assert.deepEqual(
    nodeMeta({ kind: 'threatactor', label: 'APT', fields: { type: 'nation-state', severity: 'high', motivation: 'ideology' } }),
    [{ field: 'fields.type', text: 'nation-state' }, { field: 'fields.motivation', text: 'ideology' }],
  );
  assert.deepEqual(nodeMeta({ kind: 'threatactor', label: 'APT', sublabel: 'ignored' }), [], 'the hardware trio does not apply');
  assert.equal(nodeSize({ kind: 'vulnerability', label: 'V', fields: { cve: 'x'.repeat(30) } }).w, 30 * 5.9 + 26);
  assert.deepEqual(nodeMeta({ kind: 'mcu', label: 'M', sublabel: 'STM32', fields: { severity: 'high' } }), [{ field: 'sublabel', text: 'STM32' }]);
});

test('a network device lists its model, IP, and DNS name and drops the hardware address and rail', () => {
  assert.deepEqual(
    nodeMeta({ kind: 'router', label: 'Core', sublabel: 'CRS326', addr: 'ignored', rail: '48V', fields: { ip: '10.0.0.1', dns: 'core.lan' } }),
    [{ field: 'sublabel', text: 'CRS326' }, { field: 'fields.ip', text: '10.0.0.1' }, { field: 'fields.dns', text: 'core.lan' }],
  );
  assert.deepEqual(nodeMeta({ kind: 'firewall', label: 'FW', sublabel: '', fields: { dns: 'fw.lan' } }), [{ field: 'fields.dns', text: 'fw.lan' }]);
  assert.deepEqual(nodeMeta({ kind: 'malware', label: 'M', sublabel: 'stale', fields: { family: 'Mirai' } }), [{ field: 'fields.family', text: 'Mirai' }], 'threats never show a part number');
});

test('custom cards grow with the ports on their busiest sides; built-in cards do not change', () => {
  const def = (ports) => ({ name: 'C', category: 'misc', accent: null, icon: { text: 'C' }, ports, fields: [] });
  const side = (n, s) => Array.from({ length: n }, (_, i) => ({ id: `${s}${i}`, name: `${s}${i}`, side: s, bus: 'gpio', required: false }));
  assert.deepEqual(size({ kind: 'custom', label: 'C', part: def([]) }), { w: 104, h: 74 });
  assert.deepEqual(size({ kind: 'custom', label: 'C', part: def(side(4, 'left')) }), { w: 104, h: 75 });
  assert.deepEqual(size({ kind: 'custom', label: 'C', part: def(side(8, 'right')) }), { w: 104, h: 135 });
  assert.deepEqual(size({ kind: 'custom', label: 'C', part: def(side(6, 'top')) }), { w: 154, h: 74 });
  assert.equal(size({ kind: 'custom', label: 'C', part: def(side(24, 'bottom')) }).w, 550, 'ports retain their spacing beyond the text width cap');
  assert.deepEqual(size({ kind: 'mcu', label: 'MCU' }), { w: 104, h: 74 }, 'an MCU with nine ports keeps its size');
});

test('custom meta lines: part number, address, rail, then field values, three at most', () => {
  const part = { name: 'C', category: 'misc', accent: null, icon: { text: 'C' }, ports: [], fields: [{ id: 'f1', label: 'Channels' }, { id: 'f2', label: 'Drive' }] };
  const node = { kind: 'custom', label: 'C', sublabel: 'MD-4', addr: '', rail: '12V', fields: { f1: '4', f2: 'brushed' }, part };
  assert.deepEqual(nodeMeta(node), [
    { field: 'sublabel', text: 'MD-4' }, { field: 'rail', text: '12V' }, { field: 'fields.f1', text: '4' },
  ]);
});

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

// ---- Catalogue figures (security illustration vocabulary) ----
// A figure presents as a large illustrated card: every presentation is far
// past the 104x74 badge-card minimum, width is fixed per presentation so
// composed scenes align, and height grows only as the label/meta lines wrap
// — a line can never exceed the text budget the card reserves. Figures carry
// their own larger typography (13px/600 label, 10.5px mono context), so their
// line heights and measured budgets are the figure metrics, not the badge
// card's.
const FIGURE_MIN_W = { httprequest: 196, servermemory: 136, processcrash: 156 };

test('figure parts size as illustrations at least a badge card', () => {
  for (const [kind, minW] of Object.entries(FIGURE_MIN_W)) {
    const { w, h } = size({ kind, label: 'X' });
    assert.ok(w >= minW && w < minW + 1, `${kind} keeps its fixed presentation width ${w}`);
    assert.ok(w > 104 && h >= 74, `${kind} is at least badge-card size (${w}x${h})`);
  }
  const T = FIGURE_LAYOUT.tile;
  assert.equal(size({ kind: 'servermemory', label: 'X' }).h,
    T.padTop + T.glyph + T.gap + FIGURE_LABEL_LINE_H + T.padBottom,
    'a tile reserves its full pictogram box plus the label block');
});

test('figure labels and meta lines wrap inside the card budget and grow it taller', () => {
  const base = { kind: 'codeexec', sublabel: '', addr: '', rail: '' };
  const short = nodeSize({ ...base, label: 'Execution' });
  const long = nodeSize({ ...base, label: 'Unattributed remote execution with a stolen credential' });
  assert.equal(short.w, long.w, 'width stays the presentation width');
  assert.ok(long.h > short.h, `wrapped lines grow the card (${long.h} > ${short.h})`);
  assert.ok(long.labelLines.length > 1, 'the label wrapped');
  const budget = short.w - 2 * FIGURE_LAYOUT.outcome.padX;
  for (const line of long.labelLines) assert.ok(measureFigureLabelText(line) <= budget, `line fits: ${line}`);
  assert.equal(long.labelLines.join('').replace(/ /g, ''), 'Unattributedremoteexecutionwithastolencredential', 'no text lost');

  const meta = nodeSize({ ...base, label: 'A', sublabel: 'POST /upload.php?debug=1&trace=all&verbose=yes' });
  const sub = meta.metaLines.find((m) => m.field === 'sublabel');
  assert.ok(sub.lines.length > 1, 'meta lines wrap too');
  for (const line of sub.lines) assert.ok(measureFigureMetaText(line) <= budget, `meta line fits: ${line}`);
  assert.equal(sub.lines.join('').replace(/ /g, ''), 'POST/upload.php?debug=1&trace=all&verbose=yes', 'no meta text lost');
  assert.ok(meta.h > nodeSize({ ...base, label: 'A' }).h, 'wrapped meta grows the card');
});

test('a CJK figure label wraps per character and stays inside the budget', () => {
  const s = nodeSize({ kind: 'phpapp', label: '面向请求的应用程序服务器端渲染组件' });
  assert.equal(s.w, FIGURE_LAYOUT.tile.w, 'tile width is fixed');
  assert.ok(s.labelLines.length > 1, 'the CJK run wrapped');
  const budget = FIGURE_LAYOUT.tile.w - 2 * FIGURE_LAYOUT.tile.padX;
  for (const line of s.labelLines) assert.ok(measureFigureLabelText(line) <= budget, `line fits: ${line}`);
  assert.equal(s.labelLines.join(''), '面向请求的应用程序服务器端渲染组件', 'no characters lost');
});

test('a catalogue figure keeps its sublabel even as a threat; a plain threat still hides it', () => {
  const figure = nodeMeta({ kind: 'codeexec', sublabel: 'POST /upload.php', addr: '', rail: '' });
  assert.ok(figure.some((m) => m.field === 'sublabel' && m.text === 'POST /upload.php'),
    'the illustrated outcome shows the stated value');
  const outcome = nodeMeta({ kind: 'processcrash', sublabel: 'child exits', addr: '', rail: '' });
  assert.ok(outcome.some((m) => m.field === 'sublabel'), 'an outcome callout shows the condition');
  const threat = nodeMeta({ kind: 'threatactor', sublabel: 'APT-29', addr: '', rail: '' });
  assert.ok(!threat.some((m) => m.field === 'sublabel'), 'the badge-card threat keeps hiding it');
});

test('every figure part exposes the four logical link ports the wire lanes address', () => {
  for (const kind of ['httprequest', 'payload', 'memorydump', 'servermemory', 'secretstore',
    'memorylimit', 'processcrash', 'codeexec', 'phpapp', 'wordpressapp', 'drupalapp', 'joomlaapp']) {
    const part = partOf({ kind });
    const ports = Object.fromEntries(part.ports.map((p) => [p.id, p]));
    for (const id of ['n', 'e', 's', 'w']) {
      assert.ok(ports[id], `${kind}.${id} exists`);
      assert.equal(ports[id].bus, 'link', `${kind}.${id} is a logical link`);
    }
  }
});


test('nodeRect is a plain rectangle for every figure, outcome cards included', () => {
  const rect = nodeRect({ id: 'c', kind: 'codeexec', x: 10, y: 20, label: 'Code runs' });
  assert.deepEqual(Object.keys(rect).sort(), ['h', 'w', 'x', 'y']);
  assert.deepEqual([rect.x, rect.y, rect.w], [10, 20, 156]);
  const g = wireGeom({ x: 0, y: 0, w: 160, h: 100 }, { ...rect, x: 400, y: 60 });
  assert.equal(g.p2.x, 395, 'a wire entering from the left ends the usual pad short of the card edge');
});
