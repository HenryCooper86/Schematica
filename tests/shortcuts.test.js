// The overlay's data must describe the keys the app actually handles, so this
// reads both sides: SHORTCUT_GROUPS, and every key literal a keydown handler
// in src/ compares against. The status-bar hint strip is generated from the
// same table, so its generator is checked here as well.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SHORTCUT_GROUPS, POINTER_HINTS, MOD, isMacPlatform, keyLabel, hintKeyLabel } from '../src/shortcuts.js';
import { hintStripMarkup } from '../src/ui/shortcuts-ui.js';

const ROOT = new URL('../', import.meta.url).pathname;

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
})(join(ROOT, 'src'));

// src/html-export.js is not app code: it holds `offlineViewer`, a function
// stringified into the downloaded HTML file, and its keydown handler binds
// keys in a document this app never runs. Scanning it let it answer for keys
// the app itself had dropped — Escape, Enter and the arrows all appear there —
// so it is held out, and 'the offline-viewer template is held out of the scan'
// below fails if that file stops being where the template lives.
const OFFLINE_VIEWER = 'src/html-export.js';
const TEMPLATE_MARK = 'function offlineViewer(';
const rel = (f) => relative(ROOT, f);

// The four shapes a key comparison takes in this codebase:
//   e.key === 'Escape' / e.code === 'Space' / e.key.toLowerCase() === 'z'
//   k === 'v'                       (k is a lowercased e.key)
//   e.key.startsWith('Arrow')
//   key: 'b'                        (panels.js, compared as toggle.key)
const COMPARISONS = [
  /\be\.(?:key|code)(?:\.toLowerCase\(\))?\s*[!=]==\s*'([^']*)'/g,
  /\bk\s*[!=]==\s*'([^']*)'/g,
  /\be\.key(?:\.toLowerCase\(\))?\.startsWith\(\s*'([^']*)'/g,
  /\bkey:\s*'([^']*)'/g,
];

// Key literal -> every file that compares it, sorted. All of them, not just
// the first: one file dropping a handler another file also has must not hide
// behind it, and a failure should name every place worth looking.
const handled = new Map();
for (const f of files) {
  if (rel(f) === OFFLINE_VIEWER) continue;
  const src = readFileSync(f, 'utf8');
  if (!src.includes('keydown')) continue;
  for (const re of COMPARISONS) {
    for (const m of src.matchAll(re)) {
      if (!handled.has(m[1])) handled.set(m[1], new Set());
      handled.get(m[1]).add(rel(f));
    }
  }
}
const where = (k) => [...(handled.get(k) ?? [])].sort();

// A bare letter and the same letter under Ctrl/Cmd are two different
// shortcuts, and the scan above cannot tell them apart: C is the wire tool and
// Mod-C is Copy, A is the assistant and Mod-A is Select all. So the modified
// rows are checked separately, against a comparison that reads the modifier in
// the same expression. Two shapes appear in the source:
//   mod && e.key.toLowerCase() === 'z'
//   mod && 'cxv'.includes(e.key.toLowerCase())
const modHandled = new Map(); // letter -> the files that compare it under mod
for (const f of files) {
  if (rel(f) === OFFLINE_VIEWER) continue;
  const src = readFileSync(f, 'utf8');
  if (!src.includes('keydown')) continue;
  const add = (letter) => {
    if (!modHandled.has(letter)) modHandled.set(letter, new Set());
    modHandled.get(letter).add(rel(f));
  };
  for (const m of src.matchAll(/\bmod\s*&&[^\n]*?\.toLowerCase\(\)\s*===\s*'([a-z])'/g)) add(m[1]);
  for (const m of src.matchAll(/\bmod\s*&&\s*'([a-z]+)'\.includes\(/g)) for (const c of m[1]) add(c);
}
const whereMod = (k) => [...(modHandled.get(k.toLowerCase()) ?? [])].sort();

// Modifiers are read as event flags (e.shiftKey, e.metaKey), never compared
// as a key.
const NOT_A_KEY = new Set([MOD, 'Shift']);
const isLetter = (k) => /^[A-Za-z]$/.test(k);
// How an overlay token reaches a comparison. The first entry is the spelling
// the row's own handler uses; the rest are the other spellings that same row
// accounts for, so the reverse check does not call them unlisted: an arrow
// matched on its own rather than by the family prefix, and Space written as
// an e.code instead of an e.key.
const COMPARED_AS = {
  Arrows: ['Arrow', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
  Space: [' ', 'Space'],
};
const comparedAs = (k) => COMPARED_AS[k] ?? [isLetter(k) ? k.toLowerCase() : k];
const rows = SHORTCUT_GROUPS.flatMap((g) => g.rows);

test('the overlay lists every group exactly once, in the documented order', () => {
  assert.deepEqual(SHORTCUT_GROUPS.map((g) => g.id), ['tools', 'selection', 'view', 'panels', 'editing']);
  for (const g of SHORTCUT_GROUPS) {
    assert.ok(g.rows.length, `${g.id} has rows`);
    for (const row of g.rows) {
      assert.ok(row.keys.length, `${g.id} row has keys`);
      assert.equal(typeof row.desc(), 'string');
      assert.ok(row.desc().length, `${g.id} row has a description`);
    }
  }
});

test('every key the overlay lists is compared by a keydown handler in src/', () => {
  const missing = [];
  for (const row of rows) {
    for (const k of row.keys) {
      if (NOT_A_KEY.has(k)) continue;
      const compared = comparedAs(k)[0];
      if (!handled.has(compared)) missing.push(`${row.keys.join('+')} -> ${JSON.stringify(compared)}`);
    }
  }
  assert.deepEqual(missing, [], 'the overlay advertises a key no keydown handler compares');
});

// The reverse, over every key and not only the letters: a binding on Home,
// Tab or + would otherwise be invisible to the overlay and to this test.
test('every key a keydown handler compares is listed in the overlay', () => {
  const covered = new Set(rows.flatMap((r) => r.keys).flatMap(comparedAs));
  const unlisted = [...handled.keys()].filter((k) => !covered.has(k))
    .map((k) => `${JSON.stringify(k)} (${where(k).join(', ')})`);
  assert.deepEqual(unlisted, [], 'a keydown handler compares a key the overlay never mentions: add a row to SHORTCUT_GROUPS, or, if the key is read for something other than a shortcut, note it here with the reason');
});

test('every Ctrl/Cmd row the overlay lists is compared under a modifier', () => {
  const missing = [];
  for (const row of rows) {
    if (!row.keys.includes(MOD)) continue;
    const letter = row.keys.find(isLetter);
    if (!letter) continue;
    if (!whereMod(letter).length) missing.push(`${row.keys.join('+')} -> no "mod && … '${letter.toLowerCase()}'" handler`);
  }
  assert.deepEqual(missing, [], 'the overlay advertises a Ctrl/Cmd shortcut that no handler reads the modifier for');
});

test('the scan found the handlers it expects', () => {
  // The two letters that mean one thing bare and another under Ctrl/Cmd.
  assert.deepEqual(whereMod('a'), ['src/tools.js']);
  assert.ok(where('a').includes('src/ui/assistant-ui.js'), `bare A: saw ${where('a').join(', ')}`);
  assert.deepEqual(whereMod('c'), ['src/tools.js']);
  for (const [key, file] of [
    ['v', 'src/tools.js'], ['k', 'src/tools.js'], ['b', 'src/ui/panels.js'],
    ['a', 'src/ui/assistant-ui.js'], ['?', 'src/ui/shortcuts-ui.js'], ['/', 'src/ui/explore-ui.js'],
  ]) {
    assert.ok(where(key).includes(file), `${key} should be handled in ${file}; saw ${where(key).join(', ') || 'nothing'}`);
  }
  // Every file comparing a key is recorded, not just the first one readdir
  // reaches: Escape is compared in several, and losing one of them must not
  // hide behind the others.
  assert.ok(where('Escape').length >= 3, `Escape seen in ${where('Escape').join(', ')}`);
  for (const f of ['src/tools.js', 'src/ui/journey-ui.js', 'src/ui/explore-ui.js']) {
    assert.ok(where('Escape').includes(f), `Escape should be handled in ${f}; saw ${where('Escape').join(', ')}`);
  }
});

test('the offline-viewer template is held out of the scan', () => {
  const paths = files.map(rel);
  assert.ok(paths.includes(OFFLINE_VIEWER), `${OFFLINE_VIEWER} is gone: the exclusion now covers nothing`);
  const src = readFileSync(join(ROOT, OFFLINE_VIEWER), 'utf8');
  assert.ok(src.includes(TEMPLATE_MARK), `${OFFLINE_VIEWER} no longer holds the offline-viewer template; exclude wherever it moved to`);
  assert.ok(src.includes('keydown'), `${OFFLINE_VIEWER} no longer binds keys, so the exclusion is doing nothing`);
  const strays = paths.filter((p) => p !== OFFLINE_VIEWER && readFileSync(join(ROOT, p), 'utf8').includes(TEMPLATE_MARK));
  assert.deepEqual(strays, [], 'another file embeds a viewer template; the scan would read its keys as the app\'s own');
  for (const [key, seen] of handled) {
    assert.ok(!seen.has(OFFLINE_VIEWER), `${key} was attributed to the held-out ${OFFLINE_VIEWER}`);
  }
});

test('isMacPlatform reads userAgentData first and navigator.platform as a fallback', () => {
  assert.equal(isMacPlatform({ platform: 'MacIntel' }), true);
  assert.equal(isMacPlatform({ platform: 'iPhone' }), true);
  assert.equal(isMacPlatform({ platform: 'Win32' }), false);
  assert.equal(isMacPlatform({ platform: 'Linux x86_64' }), false);
  assert.equal(isMacPlatform({ platform: 'Linux x86_64', userAgentData: { platform: 'macOS' } }), true);
  assert.equal(isMacPlatform({ userAgentData: { platform: 'Windows' } }), false);
  assert.equal(isMacPlatform(), false);
  assert.equal(isMacPlatform({}), false);
});

test('a Linux "x86_64" platform is not mistaken for a Mac', () => {
  // The word boundary matters: "x86_64" contains no key word, but a naive
  // /mac/ test over "MacIntel" and a /ipad/ test must both still hit.
  assert.equal(isMacPlatform({ platform: 'X11; Linux x86_64' }), false);
  assert.equal(isMacPlatform({ platform: 'iPad Simulator' }), true);
});

test('the hint strip is generated from the rows marked hint, in table order', () => {
  const markup = hintStripMarkup(false);
  const items = markup.split(' &middot; ');
  const marked = rows.filter((r) => r.hint);
  assert.equal(items.length, marked.length + POINTER_HINTS.length);
  marked.forEach((row, i) => {
    const keys = row.keys.map((k) => `<kbd>${hintKeyLabel(k, false)}</kbd>`).join('');
    assert.equal(items[i], `${keys} <span>${row.hint()}</span>`);
  });
  POINTER_HINTS.forEach((text, i) => {
    assert.equal(items[marked.length + i], `<span>${text()}</span>`, 'a pointer hint carries no <kbd>');
  });
});

test('the hint strip stays a strip, and shows the shortcuts it always showed', () => {
  const marked = rows.filter((r) => r.hint);
  assert.ok(marked.length < rows.length, 'marking every row would make the strip a wall of text');
  const labels = marked.map((r) => r.hint());
  for (const label of ['select', 'wire', 'zone', 'lane', 'note', 'pan', 'fit',
    'palette', 'panels', 'assistant', 'lock', 'delete', '+drag pan', 'all shortcuts',
    'copy', 'cut', 'paste']) {
    assert.ok(labels.includes(label), `the strip lost "${label}"`);
  }
  // The first item is what the end-to-end language check reads.
  assert.ok(hintStripMarkup(false).startsWith('<kbd>V</kbd> <span>select</span>'));
});

test('the hint strip follows the platform and shortens Delete on both', () => {
  assert.ok(hintStripMarkup(true).includes('<kbd>⌘</kbd><kbd>C</kbd> <span>copy</span>'));
  assert.ok(hintStripMarkup(false).includes('<kbd>Ctrl</kbd><kbd>C</kbd> <span>copy</span>'));
  // The overlay has room for the whole word; the one-line strip does not.
  assert.equal(keyLabel('Delete', false), 'Delete');
  assert.equal(hintKeyLabel('Delete', false), 'Del');
  assert.equal(hintKeyLabel('Delete', true), 'Del');
  assert.ok(hintStripMarkup(false).includes('<kbd>Del</kbd> <span>delete</span>'));
});

test('every hint reads through tr, so a language switch redraws the strip', () => {
  const src = readFileSync(join(ROOT, 'src/shortcuts.js'), 'utf8');
  for (const m of src.matchAll(/hint:\s*(.*)$/gm)) {
    assert.match(m[1], /^\(\) => tr\('/, 'a hint must be a function reading tr(), like desc');
  }
  const ui = readFileSync(join(ROOT, 'src/ui/shortcuts-ui.js'), 'utf8');
  assert.match(ui, /^\s*onLanguageChange\(.*fillHints\(\).*$/m, 'the strip must be rebuilt on a language switch');
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /<div id="hintbar" aria-hidden="true" data-i18n="off"><\/div>/,
    'the strip is generated: it stays empty, hidden from a screen reader, and out of the static translator');
});

test('keyLabel shows the platform modifier and leaves plain keys alone', () => {
  assert.equal(keyLabel(MOD, true), '⌘');
  assert.equal(keyLabel(MOD, false), 'Ctrl');
  assert.equal(keyLabel('Shift', true), '⇧');
  assert.equal(keyLabel('Shift', false), 'Shift');
  assert.equal(keyLabel('Escape', false), 'Esc');
  assert.equal(keyLabel('Arrows', false), '← ↑ → ↓');
  assert.equal(keyLabel('V', false), 'V');
  assert.equal(keyLabel('?', true), '?');
});
