// The DOM-less half of the panel fixes: the selector that finds a control
// again after its panel is rebuilt, and the props label/control pairing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { focusSelector } from '../src/ui/press.js';
import { propField, lockField, alignGroup, clampGap } from '../src/ui/props.js';
import { alignAbility } from '../src/align.js';

// A stand-in for the element chain focusSelector walks: id, data-* attributes,
// and a parent link are all it reads.
function el(spec, ...children) {
  const { id = '', ...rest } = spec;
  const node = {
    id,
    attributes: Object.entries(rest).map(([name, value]) => ({ name, value })),
    parentElement: null,
  };
  for (const c of children) c.parentElement = node;
  return node;
}

test('focusSelector names a control by the data attributes on its way to the panel', () => {
  const button = el({ 'data-jact': 'up' });
  const step = el({ 'data-step': 's1' }, button);
  const panel = el({ id: 'journey-panel' }, step);
  assert.equal(focusSelector(button, panel), '[data-step="s1"] [data-jact="up"]');
});

test('focusSelector prefers an id and stops at the panel', () => {
  const button = el({ id: 'journey-add' });
  const panel = el({ id: 'journey-panel' }, button);
  assert.equal(focusSelector(button, panel), '#journey-add');
});

test('focusSelector returns null for a control nothing identifies', () => {
  const plain = el({ class: 'chip' });
  const panel = el({ id: 'props' }, plain);
  assert.equal(focusSelector(plain, panel), null);
});

test('focusSelector escapes quotes in a data value', () => {
  const input = el({ 'data-prop': 'la"bel' });
  const panel = el({ id: 'props' }, input);
  assert.equal(focusSelector(input, panel), '[data-prop="la\\"bel"]');
});

test('propField gives the control an id its label points at', () => {
  const html = propField('Label', '<input type="text" data-prop="label" value="x">');
  const id = /<label for="([^"]+)">/.exec(html)[1];
  assert.ok(html.includes(`id="${id}"`), html);
  assert.ok(new RegExp(`<input id="${id}" type="text"`).test(html), html);
});

test('propField pairs a select and a textarea the same way', () => {
  for (const inner of ['<select data-field="target"></select>', '<textarea data-prop="notes"></textarea>']) {
    const html = propField('Label', inner);
    const id = /<label for="([^"]+)">/.exec(html)[1];
    assert.ok(html.includes(`id="${id}"`), html);
  }
});

test('propField leaves a label alone when the markup carries no single control', () => {
  const html = propField('Color', '<div class="swatches"><button data-swatch="#fff"></button></div>');
  assert.ok(html.startsWith('<label>'), html);
  assert.ok(!html.includes('for='), html);
});

test('propField escapes the label text it interpolates', () => {
  const html = propField('<img src=x> & "q"', '<input data-prop="label">');
  assert.ok(!html.includes('<img'), html);
  assert.ok(html.includes('&lt;img src=x&gt; &amp; &quot;q&quot;'), html);
});

// The align group is built from an alignAbility() reading, so the markup can
// be checked against a selection without a canvas.
const rect = (id, x, y, extra = {}) => ({ id, x, y, w: 100, h: 60, ...extra });

test('the align group offers six align buttons and two distribute buttons', () => {
  const html = alignGroup(alignAbility([rect('a', 0, 0), rect('b', 300, 0), rect('c', 600, 0)]), 24);
  for (const mode of ['left', 'hcenter', 'right', 'top', 'vmiddle', 'bottom']) {
    assert.ok(html.includes(`data-align="${mode}"`), mode);
  }
  assert.ok(html.includes('data-distribute="x"'), html);
  assert.ok(html.includes('data-distribute="y"'), html);
  assert.equal(html.includes('disabled'), false, 'three cards can do everything');
  assert.ok(/<svg viewBox="0 0 18 18"/.test(html), 'icons follow the inline-SVG style');
});

test('every align button carries a title and a label for a screen reader', () => {
  const html = alignGroup(alignAbility([rect('a', 0, 0), rect('b', 300, 0)]), 24);
  const buttons = html.match(/<button class="align-btn"[^>]*>/g);
  assert.equal(buttons.length, 8);
  for (const b of buttons) {
    assert.match(b, /title="[^"]+"/, b);
    assert.match(b, /aria-label="[^"]+"/, b);
  }
});

test('a selection too small for an action disables its buttons', () => {
  const two = alignGroup(alignAbility([rect('a', 0, 0), rect('b', 300, 0)]), 24);
  assert.equal((two.match(/disabled/g) || []).length, 2, 'both distribute buttons only');
  for (const mode of ['left', 'right']) assert.ok(!new RegExp(`data-align="${mode}"[^>]*disabled`).test(two));
  assert.ok(/data-distribute="x"[^>]*disabled/.test(two), two);
  const one = alignGroup(alignAbility([rect('a', 0, 0)]), 24);
  assert.equal((one.match(/disabled/g) || []).length, 9, 'align, distribute, and tidy are all out');
});

test('the group says when a single locked item is the anchor', () => {
  const anchored = alignGroup(alignAbility([rect('a', 0, 0), rect('b', 300, 0), rect('p', 600, 0, { locked: true })]), 24);
  assert.ok(anchored.includes('align-hint'), anchored);
  const plain = alignGroup(alignAbility([rect('a', 0, 0), rect('b', 300, 0)]), 24);
  assert.equal(plain.includes('align-hint'), false);
  const twoLocked = alignGroup(alignAbility([
    rect('a', 0, 0), rect('b', 300, 0), rect('p', 600, 0, { locked: true }), rect('q', 900, 0, { locked: true }),
  ]), 24);
  assert.equal(twoLocked.includes('align-hint'), false, 'two anchors name no anchor');
});

test('the tidy row shows the current gap and its label points at the field', () => {
  const html = alignGroup(alignAbility([rect('a', 0, 0), rect('b', 300, 0)]), 32);
  assert.ok(html.includes('<label for="props-tidy-gap">'), html);
  assert.ok(html.includes('id="props-tidy-gap"'), html);
  assert.ok(html.includes('value="32"'), html);
});

test('clampGap keeps the field inside its bounds and reads blank as unchanged', () => {
  assert.equal(clampGap('40'), 40);
  assert.equal(clampGap(12.6), 13);
  assert.equal(clampGap(-8), 0);
  assert.equal(clampGap(9000), 400);
  assert.equal(clampGap(''), 24);
  assert.equal(clampGap(null), 24);
  assert.equal(clampGap('abc'), 24);
  assert.equal(clampGap('', 12), 12);
});

test('lockField reads as its own state and reports it to a screen reader', () => {
  const off = lockField({ id: 'n1' });
  assert.ok(off.includes('aria-pressed="false"'), off);
  assert.ok(off.includes('>Unlocked</button>'), off);
  assert.ok(!off.includes('chip active'), off);
  const on = lockField({ id: 'n1', locked: true });
  assert.ok(on.includes('aria-pressed="true"'), on);
  assert.ok(on.includes('chip active'), on);
  assert.ok(on.includes('>Locked</button>'), on);
});
