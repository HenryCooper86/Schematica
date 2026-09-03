// Browser smoke test: serves the repo, drives a headless Chrome over the
// DevTools Protocol, and checks the interactions unit tests cannot reach
// (hover-revealed ports, dragging a wire, panning, renaming, zone resizing,
// presets, palette search). Zero dependencies: Node's http, fetch, and
// WebSocket. Run with `npm run e2e`; CHROME_PATH overrides the browser.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES } from '../../src/examples.js';
import { encodeShare } from '../../src/share.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(mac)) return mac;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium']) {
    const r = spawnSync('which', [name], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  throw new Error('No Chrome found; set CHROME_PATH');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- static server ----
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = join(ROOT, path === '/' ? 'index.html' : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const url = `${origin}/#${await encodeShare(EXAMPLES.find((e) => e.id === 'weather-station').doc)}`;

// ---- browser ----
const port = 9300 + Math.floor(Math.random() * 500);
const profile = join(ROOT, '.e2e-profile');
const chrome = spawn(findChrome(), [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  ...(process.env.CI ? ['--no-sandbox'] : []),
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1500,950', url,
], { stdio: 'ignore' });

let target;
for (let i = 0; i < 60 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find((t) => t.type === 'page' && t.url.startsWith(origin));
  } catch { /* not up yet */ }
  if (!target) await sleep(250);
}
if (!target) {
  chrome.kill();
  server.close();
  throw new Error('Chrome did not expose the page');
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let seq = 0;
const pending = new Map();
const problems = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') {
    problems.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
    problems.push(`console.${m.params.type}: ` + m.params.args.map((a) => a.value ?? a.description).join(' '));
  }
};
const send = (method, params = {}) => new Promise((r) => {
  const id = ++seq;
  pending.set(id, r);
  ws.send(JSON.stringify({ id, method, params }));
});
const js = async (expr) => {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (res.result.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description || 'eval failed');
  return res.result.result.value;
};
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra });
const click = async (x, y) => {
  await mouse('mousePressed', x, y, { button: 'left', clickCount: 1 });
  await mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 });
};
const drag = async (x0, y0, x1, y1, button = 'left') => {
  await mouse('mouseMoved', x0, y0);
  await mouse('mousePressed', x0, y0, { button, clickCount: 1 });
  for (let i = 1; i <= 6; i++) {
    await mouse('mouseMoved', x0 + ((x1 - x0) * i) / 6, y0 + ((y1 - y0) * i) / 6, { button });
    await sleep(20);
  }
  await mouse('mouseReleased', x1, y1, { button, clickCount: 1 });
};
const key = async (k, code, vk, mods = 0) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
};
const center = (sel) => js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);

await send('Runtime.enable');
await sleep(1500);

const results = [];
let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}

try {
  // Ports hidden at rest, revealed by CSS on hover without a DOM rebuild.
  const rest = await js(`(() => { const p = document.querySelectorAll('#canvas .ports'); return { count: p.length, opacity: getComputedStyle(p[0]).opacity }; })()`);
  check('ports exist for every card and are hidden at rest', rest.count === 8 && rest.opacity === '0', JSON.stringify(rest));
  const mcu = await center('#canvas g.node[data-id="n5"] .card');
  await js(`window.__card = document.querySelector('#canvas g.node[data-id="n5"] .card'); true`);
  await mouse('mouseMoved', mcu.x, mcu.y);
  await sleep(250);
  const hover = await js(`(() => { const g = document.querySelector('#canvas g.node[data-id="n5"]'); return { on: g.matches(':hover'), opacity: getComputedStyle(g.querySelector('.ports')).opacity, same: window.__card === g.querySelector('.card') }; })()`);
  check('hovering a card reveals its ports without rebuilding the DOM', hover.on && hover.opacity === '1' && hover.same, JSON.stringify(hover));

  // Drag a wire between two matching ports.
  const before = await js(`document.querySelectorAll('#canvas g.wire').length`);
  const from = await center('#canvas .portg[data-node="n5"][data-port="i2c"] .port');
  const to = await center('#canvas .portg[data-node="n6"][data-port="i2c"] .port');
  await drag(from.x, from.y, to.x, to.y);
  await sleep(200);
  const wired = await js(`(() => ({ wires: document.querySelectorAll('#canvas g.wire').length, popover: !document.getElementById('bus-popover').hidden, sel: document.querySelector('#canvas g.wire.sel .vis')?.getAttribute('stroke') }))()`);
  check('dragging port to port adds a selected wire without a bus popover', wired.wires === before + 1 && !wired.popover && wired.sel === '#7dd3fc', JSON.stringify({ before, ...wired }));

  // Panning only moves the camera transform.
  await js(`window.__diag = document.querySelector('#canvas .layer-diagram').firstElementChild; true`);
  const t0 = await js(`document.querySelector('#canvas > g').getAttribute('transform')`);
  await drag(700, 800, 760, 840, 'middle');
  await sleep(100);
  const pan = await js(`({ t: document.querySelector('#canvas > g').getAttribute('transform'), same: window.__diag === document.querySelector('#canvas .layer-diagram').firstElementChild })`);
  check('panning moves the camera without rebuilding the diagram', pan.t !== t0 && pan.same, JSON.stringify({ t0, ...pan }));

  // Double-click renames.
  const label = await center('#canvas g.node[data-id="n5"] text[data-edit="label"]');
  for (const c of [1, 2]) {
    await mouse('mousePressed', label.x, label.y, { button: 'left', clickCount: c });
    await mouse('mouseReleased', label.x, label.y, { button: 'left', clickCount: c });
    await sleep(60);
  }
  await sleep(150);
  const editor = await js(`(() => { const e = document.getElementById('inline-editor'); return { hidden: e.hidden, value: e.value, focused: document.activeElement === e }; })()`);
  check('double-click on a label opens the inline editor', !editor.hidden && editor.value === 'MCU' && editor.focused, JSON.stringify(editor));
  await key('Escape', 'Escape', 27);
  await sleep(100);

  // Arrow keys nudge the selection (the card moved on screen with the pan).
  const mcu2 = await center('#canvas g.node[data-id="n5"] .card');
  await click(mcu2.x, mcu2.y);
  await sleep(100);
  const x0 = await js(`document.querySelector('#canvas g.node[data-id="n5"]').getAttribute('transform')`);
  await key('ArrowRight', 'ArrowRight', 39);
  await key('ArrowDown', 'ArrowDown', 40, 8);
  await sleep(100);
  const x1 = await js(`document.querySelector('#canvas g.node[data-id="n5"]').getAttribute('transform')`);
  const px = (t) => t.match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
  const [ax, ay] = px(x0);
  const [bx, by] = px(x1);
  check('arrow keys nudge by 1px, Shift by a grid step', bx === ax + 1 && by === ay + 8, `${x0} -> ${x1}`);

  // Zone: select by its label, resize by the SE handle, then drag it with its cards.
  const zl = await center('#canvas g.zone[data-id="z1"] text[data-edit="label"]');
  await click(zl.x, zl.y);
  await sleep(150);
  const handles = await js(`document.querySelectorAll('#canvas g.zone[data-id="z1"] [data-zhandle]').length`);
  check('selecting a zone shows four corner handles', handles === 4, String(handles));
  const zone0 = await js(`(() => { const r = document.querySelector('#canvas g.zone[data-id="z1"] rect').getBBox(); return { w: r.width, h: r.height, x: r.x }; })()`);
  const se = await center('#canvas g.zone[data-id="z1"] [data-zhandle="se"]');
  await drag(se.x, se.y, se.x + 48, se.y + 32);
  await sleep(150);
  const zone1 = await js(`(() => { const r = document.querySelector('#canvas g.zone[data-id="z1"] rect').getBBox(); return { w: r.width, h: r.height, x: r.x }; })()`);
  check('dragging a corner handle resizes the zone', zone1.w === zone0.w + 48 && zone1.h === zone0.h + 32 && zone1.x === zone0.x, JSON.stringify({ zone0, zone1 }));
  const solar0 = px(await js(`document.querySelector('#canvas g.node[data-id="n1"]').getAttribute('transform')`));
  const zl2 = await center('#canvas g.zone[data-id="z1"] text[data-edit="label"]');
  await drag(zl2.x, zl2.y, zl2.x + 40, zl2.y);
  await sleep(150);
  const zone2 = await js(`(() => { const r = document.querySelector('#canvas g.zone[data-id="z1"] rect').getBBox(); return { x: r.x }; })()`);
  const solar1 = px(await js(`document.querySelector('#canvas g.node[data-id="n1"]').getAttribute('transform')`));
  check('dragging a zone carries the cards inside it', zone2.x === zone1.x + 40 && solar1[0] === solar0[0] + 40, JSON.stringify({ zone1, zone2, solar0, solar1 }));

  // Presets live on the rover board. A hash-only navigation would not reload
  // the app, and a non-empty autosave would raise a confirm dialog, so clear
  // storage, blank the page, then load the rover share link.
  const roverUrl = `${origin}/#${await encodeShare(EXAMPLES.find((e) => e.id === 'rdk-rover').doc)}`;
  await js('localStorage.clear(); true');
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await send('Page.navigate', { url: roverUrl });
  for (let i = 0; i < 40; i++) {
    const n = await js(`document.querySelectorAll('#canvas g.node').length`).catch(() => 0);
    if (n === 11) break;
    await sleep(150);
  }
  await sleep(300);
  const brain = await center('#canvas g.node[data-id="n3"] .card');
  await click(brain.x, brain.y);
  await sleep(200);
  const dl = await js(`(() => { const inp = document.querySelector('#props input[data-prop="sublabel"]'); const dl = document.getElementById('preset-list'); return { value: inp?.value, options: dl ? [...dl.options].map((o) => o.value) : null }; })()`);
  check('selecting the RDK card offers the D-Robotics presets under Part number', dl.value === 'RDK X5' && dl.options?.includes('RDK S100P'), JSON.stringify(dl));
  await js(`(() => { const inp = document.querySelector('#props input[data-prop="sublabel"]'); inp.value = 'rdk x3'; inp.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(200);
  const applied = await js(`(() => ({ sub: document.querySelector('#props input[data-prop="sublabel"]')?.value, meta: document.querySelector('#canvas g.node[data-id="n3"] text[data-edit="sublabel"]')?.textContent }))()`);
  check('typing a preset in any case sets the canonical part number on the card', applied.sub === 'RDK X3' && applied.meta === 'RDK X3', JSON.stringify(applied));

  // Palette search.
  await js(`(() => { const s = document.getElementById('palette-search'); s.value = 'rdk'; s.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(100);
  // Visibility is judged by computed style, not the attribute: an author
  // display rule can silently defeat the hidden attribute.
  const visible = `(el) => getComputedStyle(el).display !== 'none'`;
  const search = await js(`(() => { const visible = ${visible}; const items = [...document.querySelectorAll('#palette .palette-item')]; const shown = items.filter(visible).map((i) => i.querySelector('.pi-name').textContent); const heads = [...document.querySelectorAll('#palette h3')].filter(visible).map((h) => h.textContent); return { shown, heads }; })()`);
  check('palette search "rdk" shows only the AI SBC and RDK cameras under a single Robotics heading', search.shown.length === 3 && search.shown.includes('AI SBC / robot kit') && search.heads.length === 1 && search.heads[0] === 'Robotics', JSON.stringify(search));
  await js(`(() => { const visible = ${visible}; const s = document.getElementById('palette-search'); s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); return [...document.querySelectorAll('#palette .palette-item')].filter(visible).length; })()`).then((n) => check('clearing the search restores every part', n >= 60, String(n)));
  const collapsed = await js(`(() => { const visible = ${visible}; const h = document.querySelector('#palette h3'); h.click(); const box = h.nextElementSibling; const out = !visible(box); h.click(); return out && visible(box); })()`);
  check('clicking a category heading collapses and re-expands its tiles', collapsed === true, String(collapsed));
} catch (err) {
  failed += 1;
  results.push(`FAIL script error — ${err.message}`);
} finally {
  ws.close();
  chrome.kill();
  server.close();
  spawnSync('rm', ['-rf', profile]);
}

console.log(results.join('\n'));
if (problems.length) {
  failed += 1;
  console.log('PROBLEMS:\n' + problems.join('\n'));
} else {
  console.log('no console errors or exceptions');
}
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
