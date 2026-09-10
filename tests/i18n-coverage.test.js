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
import { PROVIDERS, EFFORTS, BACKEND_HELP } from '../src/ai/settings.js';
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
for (const help of Object.values(BACKEND_HELP)) data.add(help);
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
