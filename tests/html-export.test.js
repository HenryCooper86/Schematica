import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHTML } from '../src/html-export.js';
import { EXAMPLES } from '../src/examples.js';
import { nodeHaystack, searchBoard } from '../src/explore.js';
import { nextStoryPosition } from '../src/journey.js';
import { initI18n, setLang } from '../src/i18n.js';

const boardData = (html) => JSON.parse(html.match(/<script id="board-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);

// The viewer ships as source text, so a test can lift one function out of it
// and run it against stubs — the same code the download runs.
function offlineAdvance(html, steps) {
  const src = html.match(/function advance\(delta\) \{[\s\S]*?\n  \}/)[0];
  const chapters = { value: '' };
  const chose = [];
  const make = new Function('data', 'chapters', 'nextPosition', 'chapter', `
    let stopIndex = -1;
    ${src}
    return advance;
  `);
  return { advance: make({ steps }, chapters, nextStoryPosition, () => chose.push(chapters.value)), chapters, chose };
}

test('offline export embeds a full board and working script without external assets', () => {
  const doc = structuredClone(EXAMPLES[0].doc);
  const html = buildHTML(doc);
  const data = JSON.parse(html.match(/<script id="board-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data.doc, doc);
  assert.equal(data.nodes.length, doc.nodes.length);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|fetch\(/);
  const script = html.match(/<script>\(([\s\S]*)<\/script>/)[1];
  assert.doesNotThrow(() => new Function('(' + script));
});

test('hostile board strings cannot end the embedded JSON script or introduce markup', () => {
  const doc = structuredClone(EXAMPLES[0].doc);
  doc.title = '</script><script>alert(1)</script>';
  doc.nodes[0].label = '<img src=x onerror=alert(1)>';
  const html = buildHTML(doc);
  assert.equal((html.match(/<script/g) || []).length, 2);
  assert.doesNotMatch(html, /<img src=x/);
  const data = JSON.parse(html.match(/<script id="board-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.doc.title, doc.title);
});

test('with no chapter chosen, stepping back does nothing and stepping forward starts the story', () => {
  const doc = structuredClone(EXAMPLES[0].doc);
  doc.journey = [{ id: 'j1', label: 'One', caption: '', ids: [], stops: [] }, { id: 'j2', label: 'Two', caption: '', ids: [], stops: [] }];
  const html = buildHTML(doc);
  const steps = boardData(html).steps;
  assert.equal(steps.length, 2);

  const back = offlineAdvance(html, steps);
  assert.equal(back.advance(-1), false, 'Previous from nowhere goes nowhere');
  assert.equal(back.chapters.value, '', 'and does not jump to the first chapter');
  assert.deepEqual(back.chose, []);

  const fwd = offlineAdvance(html, steps);
  assert.equal(fwd.advance(1), true);
  assert.equal(fwd.chapters.value, 'j1', 'Next from nowhere starts at the first chapter');
  assert.deepEqual(fwd.chose, ['j1']);
  assert.equal(fwd.advance(1), true);
  assert.equal(fwd.chapters.value, 'j2');

  const none = offlineAdvance(html, []);
  assert.equal(none.advance(1), false, 'a board with no journey never starts');
  assert.equal(none.advance(-1), false);
});

test('the offline search text is the board search text, translated at export time', () => {
  initI18n({ storage: null });
  const doc = structuredClone(EXAMPLES[0].doc);
  const en = boardData(buildHTML(doc));
  assert.deepEqual(en.nodes.map((n) => n.search), doc.nodes.map((n) => nodeHaystack(n)));
  const mcu = doc.nodes.find((n) => n.kind === 'mcu');
  assert.ok(mcu, 'the example board has an MCU');
  const hay = en.nodes.find((n) => n.id === mcu.id).search;
  for (const word of ['mcu', 'compute', 'i2c']) {
    assert.ok(hay.includes(word), `${word} is searchable offline: ${hay}`);
  }
  // Every word the app's own search would match must match offline too.
  const offline = (q) => en.nodes.filter((n) => q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => n.search.includes(w))).map((n) => n.id);
  for (const query of ['mcu', 'compute', 'i2c', 'power']) {
    assert.deepEqual(offline(query), searchBoard(doc, query).map((n) => n.id), query);
  }
  setLang('zh');
  try {
    const zh = boardData(buildHTML(doc));
    const zhHay = zh.nodes.find((n) => n.id === mcu.id).search;
    assert.ok(zhHay.includes('微控制器'), zhHay);
    assert.ok(zhHay.includes('计算'), 'the translated category name travels with the file');
    assert.deepEqual(zh.nodes.map((n) => n.search), doc.nodes.map((n) => nodeHaystack(n)));
  } finally {
    setLang('en');
  }
});

test('the exported page declares the app language as a BCP 47 tag', () => {
  initI18n({ storage: null });
  const doc = structuredClone(EXAMPLES[0].doc);
  assert.match(buildHTML(doc), /^<!doctype html><html lang="en">/);
  setLang('zh');
  try {
    assert.match(buildHTML(doc), /^<!doctype html><html lang="zh-CN">/, 'zh alone is not a valid tag for Simplified Chinese');
  } finally {
    setLang('en');
  }
});
