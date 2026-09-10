import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snap, nodeRect, nodeSize, nodeMeta, portPosition, wireGeom, wireGeomToPoint, curvePoint, wireLanes, WIRE_FAN,
  rectContains, rectsIntersect, normRect, wrapText, noteHeight, NOTE_W, contentBounds, textUnits,
} from '../src/geometry.js';
import { EXAMPLE_OVERLAYS_ZH } from '../src/examples.js';

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
  assert.ok(rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5 }));
  assert.ok(!rectContains({ x: 0, y: 0, w: 10, h: 10 }, { x: 15, y: 5 }));
  assert.ok(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }));
  assert.ok(!rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 }));
  assert.deepEqual(normRect(10, 10, 0, 5), { x: 0, y: 5, w: 10, h: 5 });
});

// net_draw card sizing: 104x74 at minimum, wider for long labels (capped at
// 240), 12.5px taller per meta line. Stored sizes are gone; nodeRect derives.
test('nodeSize follows the content like net_draw', () => {
  assert.deepEqual(nodeSize({ label: 'MCU' }), { w: 104, h: 74 });
  assert.deepEqual(nodeSize({ label: 'MCU', sublabel: 'ESP32-S3', addr: '0x76' }), { w: 104, h: 99 });
  assert.deepEqual(nodeSize({ label: 'MCU', sublabel: 'a', addr: 'b', rail: 'c' }), { w: 104, h: 111.5 });
  assert.equal(nodeSize({ label: 'Flight controller unit' }).w, 22 * 6.8 + 24, 'label widens the card');
  assert.equal(nodeSize({ label: 'x', sublabel: 'y'.repeat(20) }).w, 20 * 5.9 + 26, 'meta lines widen it too');
  assert.equal(nodeSize({ label: 'x'.repeat(80) }).w, 240, 'width is capped');
  assert.deepEqual(nodeMeta({ label: 'a', sublabel: ' ', addr: '0x1', rail: '' }), [{ field: 'addr', text: '0x1' }], 'blank meta lines are skipped');
  assert.deepEqual(nodeRect({ x: 10, y: 20, label: 'MCU' }), { x: 10, y: 20, w: 104, h: 74 });
});

test('wrapText wraps at maxChars and never returns empty', () => {
  assert.deepEqual(wrapText('short'), ['short']);
  const lines = wrapText('one two three four five six seven eight nine ten', 12);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(l.length <= 12 || !l.includes(' '));
  assert.deepEqual(wrapText(''), ['']);
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

// Process-flow shapes size like net_draw's: label-driven widths within 96–290,
// fixed heights per shape, and a square connector.
test('nodeSize sizes process-flow shapes like net_draw', () => {
  assert.deepEqual(nodeSize({ kind: 'process', label: 'Process' }), { w: 96, h: 54 });
  assert.deepEqual(nodeSize({ kind: 'decision', label: 'Decision?' }), { w: 137.5, h: 76 });
  assert.deepEqual(nodeSize({ kind: 'dataio', label: 'Data / I-O' }), { w: 140, h: 54 });
  assert.deepEqual(nodeSize({ kind: 'document', label: 'Document' }), { w: 100, h: 62 });
  assert.deepEqual(nodeSize({ kind: 'connector', label: 'A' }), { w: 46, h: 46 });
  assert.equal(nodeSize({ kind: 'process', label: 'x'.repeat(80) }).w, 290, 'capped');
  assert.deepEqual(nodeSize({ kind: 'process', label: 'Process', sublabel: 'ignored', addr: 'too' }), { w: 96, h: 54 }, 'shapes carry no meta lines');
  assert.deepEqual(nodeSize({ kind: 'router', label: 'Core Router', fields: { ip: '10.0.0.1' } }), { w: 104, h: 86.5 }, 'network devices are ordinary cards sized by their fields');
  assert.deepEqual(nodeSize({ kind: 'router', label: 'Core Router', addr: '10.0.0.1' }), { w: 104, h: 74 }, 'the hardware address is not one of their lines');
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
