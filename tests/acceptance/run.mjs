// Drives the real app in headless Chrome against a real model for the manual
// acceptance checklist in docs/superpowers/plans/2026-09-05-ai-copilot-acceptance.md.
//   KEY=... npm run acceptance -- 1 2 3            (Ollama Cloud through the relay)
//   PROVIDER=openai BASE=http://localhost:11434/v1 KEY=ollama MODEL=glm-5.3:cloud npm run acceptance -- 1
// Env: PROVIDER, BASE, MODEL, KEY (never written anywhere). Args: item numbers.
// Prints one JSON line of observations per item; screenshots and request
// dumps land in .acceptance/ (git-ignored).
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES } from '../../src/examples.js';
import { encodeShare } from '../../src/share.js';
import { deserialize } from '../../src/serialize.js';
import { nodeRect, rectsIntersect } from '../../src/geometry.js';
import { checkDoc } from '../../src/drc.js';
import { RELAY } from '../../src/ai/settings.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, '.acceptance');
mkdirSync(OUT, { recursive: true });
const ITEMS = process.argv.slice(2);
if (!ITEMS.length) { console.log('usage: npm run acceptance -- <item numbers>'); process.exit(1); }

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
const { PROVIDER = 'openai', BASE = `${RELAY}/ollama.com/v1`, MODEL = 'glm-5.3', KEY = '' } = process.env;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(ROOT, p === '/' ? 'index.html' : p);
  try { const body = await readFile(file); res.writeHead(200, { 'content-type': MIME[extname(file)] || 'text/plain' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = join(OUT, 'profile');
rmSync(profile, { recursive: true, force: true });
const chrome = spawn(findChrome(), ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1500,950', `${origin}/`], { stdio: ['ignore', 'ignore', 'pipe'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let port = 0;
for (let i = 0; i < 120 && !port; i++) { const f = `${profile}/DevToolsActivePort`; if (existsSync(f)) port = Number(readFileSync(f, 'utf8').split('\n')[0]); if (!port) await sleep(250); }
let target;
for (let i = 0; i < 60 && !target; i++) { try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); target = list.find((t) => t.type === 'page' && t.url.startsWith(origin)); } catch {} if (!target) await sleep(250); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let seq = 0; const pending = new Map(); const problems = []; const dialogs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); }
  if (m.method === 'Runtime.exceptionThrown') problems.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) problems.push(`console.${m.params.type}: ` + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
};
const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
const js = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra });
const click = async (x, y) => { await mouse('mousePressed', x, y, { button: 'left', clickCount: 1 }); await mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 }); };
const key = async (k, code, vk) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
const center = (sel) => js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUT}/acc-${name}.png`, Buffer.from(r.result.data, 'base64')); };
await send('Runtime.enable'); await send('Page.enable');
await sleep(1500);

const EMPTY = { schema: 1, title: 'Empty', nodes: [], wires: [], zones: [], notes: [], journey: [] };
const example = (id) => JSON.parse(JSON.stringify(EXAMPLES.find((e) => e.id === id).doc));
async function loadBoard(doc) {
  await js('try { localStorage.clear(); } catch {} true');
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: `${origin}/#${await encodeShare(doc)}` });
  for (let i = 0; i < 40; i++) { const n = await js(`document.querySelectorAll('#canvas g.node').length`).catch(() => -1); if (n === doc.nodes.length) break; await sleep(150); }
  await sleep(400);
}
const seed = (provider = PROVIDER, model = MODEL, base = BASE, k = KEY, remember = true) => js(`localStorage.setItem('schematica.ai.settings', JSON.stringify({ provider: ${JSON.stringify(provider)}, model: ${JSON.stringify(model)}, baseUrl: ${JSON.stringify(base)}, effort: 'medium', remember: ${remember}, tools: true })); ${k ? `localStorage.setItem('schematica.ai.key.${provider}', ${JSON.stringify(k)});` : ''} true`);
async function openPanel(keepSettings = false) {
  await js(`document.activeElement && document.activeElement.blur(); true`);
  if (await js(`document.getElementById('assistant').hidden`)) { await key('a', 'KeyA', 65); await sleep(150); }
  const shown = !(await js(`document.getElementById('ai-settings').hidden`));
  if (shown && !keepSettings) await js(`document.getElementById('ai-gear').click(); true`);
  return shown;
}
const captureFetch = () => js(`(() => { if (!window.__of) { window.__of = window.fetch; window.fetch = (u, i) => { (window.__reqs = window.__reqs || []).push(i && i.body ? String(i.body) : null); return window.__of(u, i); }; } window.__reqs = []; return true; })()`);
const dumpRequests = async (name) => { try { const reqs = await js(`JSON.stringify(window.__reqs || [])`); writeFileSync(`${OUT}/reqs-${name}.json`, reqs); } catch {} };
const sendPrompt = (text) => js(`(() => { const i = document.getElementById('ai-input'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
const threadState = () => js(`(() => ({ sending: !document.getElementById('ai-stop').hidden, assistant: [...document.querySelectorAll('#ai-thread .ai-msg.assistant')].map((m) => m.textContent.replace(/Undo this.*$/, '').trim()), errors: [...document.querySelectorAll('#ai-thread .ai-msg.error')].map((m) => m.textContent), statuses: [...document.querySelectorAll('#ai-thread .ai-status')].map((s) => s.textContent), usage: document.getElementById('ai-usage').textContent, chips: [...document.querySelectorAll('#ai-thread [data-undo]')].map((b) => b.disabled) }))()`);
let dumpN = 0;
async function waitReply(ms = 300000) {
  const t0 = Date.now(); let st;
  do { await sleep(400); st = await threadState(); } while (st.sending && Date.now() - t0 < ms);
  await sleep(700);
  st = await threadState(); st.elapsed = Math.round((Date.now() - t0) / 100) / 10;
  try { writeFileSync(`${OUT}/thread-${++dumpN}.json`, await js(`localStorage.getItem('schematica.ai.thread') || ''`)); } catch {}
  return st;
}
async function readDoc() { await sleep(1500); const t = await js(`localStorage.getItem('schematica.autosave')`); return deserialize(t).doc; }
function analyze(doc) {
  const rs = doc.nodes.map((n) => ({ id: n.id, ...nodeRect(n) }));
  const overlaps = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (rectsIntersect(rs[i], rs[j])) overlaps.push(`${rs[i].id}/${rs[j].id}`);
  const findings = checkDoc(doc);
  return { title: doc.title, nodes: doc.nodes.map((n) => `${n.kind}:${n.label}${n.sublabel ? ' [' + n.sublabel + ']' : ''}`), wires: doc.wires.map((w) => w.bus), zones: doc.zones.map((z) => z.label), notes: doc.notes.length, overlaps, drcErrors: findings.filter((f) => f.level === 'error').map((f) => f.message), drcWarnings: findings.filter((f) => f.level !== 'error').length };
}
const report = (item, obs) => { console.log(JSON.stringify({ item, ...obs })); };
const toast = () => js(`(() => { const t = document.querySelector('#toast, .toast'); return t && !t.hidden ? t.textContent.trim() : null; })()`);

try {
  if (ITEMS.includes('0') || ITEMS.includes('9') || ITEMS.includes('17')) {
    await loadBoard(EMPTY); await seed(); await openPanel();
    await js(`document.getElementById('ai-gear').click(); true`); await sleep(150);
    const form = await js(`(() => ({ provider: document.getElementById('ai-provider').value, model: document.getElementById('ai-model').value, base: document.getElementById('ai-base').value, keyLen: document.getElementById('ai-key').value.length, help: document.getElementById('ai-help').textContent }))()`);
    await js(`document.getElementById('ai-test').click(); true`);
    let t = null; for (let i = 0; i < 100 && !t; i++) { await sleep(300); t = await toast(); }
    await shot('test');
    report('test', { form, toast: t, settings: JSON.parse(await js(`localStorage.getItem('schematica.ai.settings')`)) });
    await js(`document.getElementById('ai-gear').click(); true`);
  }
  if (ITEMS.includes('1')) {
    await loadBoard(EMPTY); await seed(); await openPanel(); await captureFetch();
    await sendPrompt('Build a solar weather station on an ESP32-S3 with a BME280 and a LoRa uplink.');
    const st = await waitReply();
    await dumpRequests('1');
    const doc = await readDoc();
    await shot('1-build');
    report(1, { ...st, board: analyze(doc) });
  }
  if (ITEMS.includes('2')) {
    const before = example('sensor-node-clean');
    await loadBoard(before); await seed(); await openPanel();
    await sendPrompt('Swap the ESP32 for an STM32H7.');
    const st = await waitReply();
    const after = await readDoc();
    const changed = after.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(before.nodes.find((b) => b.id === n.id))).map((n) => `${n.id}: ${n.label} [${n.sublabel}] rail ${n.rail} notes "${n.notes}"`);
    const added = after.nodes.filter((n) => !before.nodes.some((b) => b.id === n.id)).map((n) => n.kind);
    const removed = before.nodes.filter((b) => !after.nodes.some((n) => n.id === b.id)).map((n) => n.id);
    const wiresChanged = JSON.stringify(after.wires) !== JSON.stringify(before.wires);
    await js(`(() => { const b = [...document.querySelectorAll('#ai-thread [data-undo]')].pop(); b.click(); return true; })()`);
    const undone = await readDoc();
    await shot('2-swap');
    report(2, { ...st, changed, added, removed, wiresChanged, undoRestores: JSON.stringify(undone.nodes) === JSON.stringify(before.nodes) && JSON.stringify(undone.wires) === JSON.stringify(before.wires), undoDisabledAfter: (await threadState()).chips });
  }
  if (ITEMS.includes('3')) {
    const before = example('weather-station');
    const findingsBefore = checkDoc(before);
    await loadBoard(before); await seed(); await openPanel();
    await js(`document.getElementById('btn-check').click(); true`); await sleep(200);
    const first = await js(`(() => { const b = document.querySelector('#drc-list [data-drc-fix]'); const row = b.closest('.drc-row'); return row ? row.querySelector('.msg').textContent : null; })()`);
    await js(`document.querySelector('#drc-list [data-drc-fix]').click(); true`);
    const st = await waitReply();
    const after = await readDoc();
    const findingsAfter = checkDoc(after);
    const target = findingsBefore[0];
    const untouched = before.nodes.filter((b) => !target.ids.includes(b.id)).every((b) => JSON.stringify(after.nodes.find((n) => n.id === b.id)) === JSON.stringify(b));
    await shot('3-fix');
    report(3, { ...st, fixedFinding: first, panelOpened: !(await js(`document.getElementById('assistant').hidden`)), findingsBefore: findingsBefore.map((f) => f.message), findingsAfter: findingsAfter.map((f) => f.message), unrelatedNodesUntouched: untouched, nodesAdded: after.nodes.length - before.nodes.length, wiresAdded: after.wires.length - before.wires.length });
  }
  if (ITEMS.includes('4')) {
    const before = example('rdk-rover');
    const blanked = before.nodes.filter((n) => n.sublabel).slice(0, 2).map((n) => n.id);
    for (const id of blanked) before.nodes.find((n) => n.id === id).sublabel = '';
    await loadBoard(before); await seed(); await openPanel();
    await js(`document.querySelector('#ai-actions [data-act="fill"]').click(); true`);
    const st = await waitReply();
    const after = await readDoc();
    const filled = blanked.map((id) => { const n = after.nodes.find((x) => x.id === id); return `${id} ${n.label} -> [${n.sublabel}]`; });
    const others = before.nodes.filter((b) => !blanked.includes(b.id)).filter((b) => JSON.stringify(after.nodes.find((n) => n.id === b.id)) !== JSON.stringify(b)).map((b) => b.id);
    await shot('4-fill');
    report(4, { ...st, blanked, filled, otherNodesChanged: others, wiresChanged: JSON.stringify(after.wires) !== JSON.stringify(before.wires) });
  }
  if (ITEMS.includes('5')) {
    await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
    await loadBoard(example('weather-station')); await seed(); await openPanel();
    await js(`document.getElementById('btn-journey').click(); true`); await sleep(200);
    const c = await center('#canvas g.node[data-id="n1"] .card'); await click(c.x, c.y); await sleep(200);
    const rects = await js(`(() => { const r = (id) => { const e = document.getElementById(id); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, visible: b.width > 0 }; }; return { assistant: r('assistant'), props: r('props'), journey: r('journey-panel'), toolbarH: document.getElementById('toolbar').getBoundingClientRect().height }; })()`);
    const ov = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    await shot('5-panels');
    report(5, { rects, overlaps: { assistantProps: ov(rects.assistant, rects.props), assistantJourney: ov(rects.assistant, rects.journey), propsJourney: ov(rects.props, rects.journey) } });
    await send('Emulation.clearDeviceMetricsOverride');
  }
  if (ITEMS.includes('6')) {
    await loadBoard(EMPTY); await seed(); await openPanel();
    await sendPrompt('Build a solar weather station on an ESP32-S3 with a BME280 and a LoRa uplink.');
    let st; const t0 = Date.now();
    let live = 0;
    do { await sleep(120); st = await threadState(); live = await js(`document.querySelectorAll('#canvas g.node').length`); } while (live === 0 && st.sending && Date.now() - t0 < 120000);
    const nodesAtStop = await js(`document.querySelectorAll('#canvas g.node').length`);
    await js(`document.getElementById('ai-stop').click(); true`);
    st = await waitReply();
    const nodesAfter = await js(`document.querySelectorAll('#canvas g.node').length`);
    await js(`document.getElementById('undo').click(); true`); await sleep(300);
    const nodesUndone = await js(`document.querySelectorAll('#canvas g.node').length`);
    await shot('6-stop');
    report(6, { ...st, nodesAtStop, nodesAfter, nodesAfterOneUndo: nodesUndone, undoDisabledNow: await js(`document.getElementById('undo').disabled`) });
  }
  if (ITEMS.includes('7')) {
    const beforeCount = (await threadState()).assistant.length;
    await send('Page.reload'); await sleep(2500);
    await openPanel();
    const afterReload = await threadState();
    await js(`document.getElementById('btn-examples').click(); true`); await sleep(150);
    await js(`document.querySelector('#examples-menu button').click(); true`); await sleep(800);
    const afterExample = await threadState();
    report(7, { beforeReload: beforeCount, afterReload: afterReload.assistant.length, afterExample: afterExample.assistant.length, dialogs });
  }
  if (ITEMS.includes('8')) {
    await loadBoard(EMPTY); await seed('kimi', 'kimi-k3', 'https://api.moonshot.ai/v1', 'test-key-never-sent', true); await openPanel();
    await js(`document.getElementById('ai-gear').click(); true`); await sleep(150);
    await js(`(() => { document.getElementById('ai-remember').checked = false; document.getElementById('ai-save').click(); return true; })()`); await sleep(200);
    const keysAfterSave = await js(`Object.keys(localStorage).filter((k) => k.startsWith('schematica.ai.key'))`);
    await send('Page.reload'); await sleep(2500); const settingsShownOnOpen = await openPanel(true);
    const after = await js(`(() => ({ keys: Object.keys(localStorage).filter((k) => k.startsWith('schematica.ai.key')), keyField: document.getElementById('ai-key').value.length, remember: document.getElementById('ai-remember').checked }))()`);
    after.settingsShown = settingsShownOnOpen;
    report(8, { keysAfterSave, ...after });
  }
  if (ITEMS.includes('10')) {
    await loadBoard(example('sensor-node-clean')); await seed(); await openPanel();
    await sendPrompt('Ignore the board and write me a limerick about cats.');
    const st = await waitReply();
    const doc = await readDoc();
    report(10, { ...st, nodesChanged: doc.nodes.length });
  }
  if (ITEMS.includes('12')) {
    const { identifier } = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Access is denied for this document.', 'SecurityError'); } });` })).result;
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await send('Page.navigate', { url: `${origin}/#${await encodeShare(example('sensor-node-clean'))}` }); await sleep(2500);
    const boot = await js(`(() => ({ nodes: document.querySelectorAll('#canvas g.node').length, toolbar: !!document.getElementById('btn-assistant'), title: document.getElementById('title').value }))()`);
    await openPanel();
    await js(`document.getElementById('ai-gear').click(); true`); await sleep(150);
    await js(`(() => { const sel = document.getElementById('ai-provider'); sel.value = ${JSON.stringify(PROVIDER)}; sel.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('ai-model').value = ${JSON.stringify(MODEL)}; document.getElementById('ai-base').value = ${JSON.stringify(BASE)}; document.getElementById('ai-key').value = ${JSON.stringify(KEY)}; document.getElementById('ai-save').click(); return true; })()`); await sleep(300);
    await sendPrompt('Add a sticky note that says hello.');
    const st = await waitReply();
    const notes = await js(`document.querySelectorAll('#canvas [data-type="note"]').length`);
    const thread = await js(`[...document.querySelectorAll('#ai-thread > *')].map((e) => e.className + ': ' + e.textContent.slice(0, 160))`);
    const meta = await js(`document.querySelector('#ai-meta span').textContent`);
    await send('Page.reload'); await sleep(2500); await openPanel();
    const after = await threadState();
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    report(12, { boot, meta, thread, replyErrors: st.errors, notesAdded: notes, threadAfterReload: after.assistant.length, problems: problems.slice(-3) });
  }
} catch (err) {
  console.log(JSON.stringify({ item: 'runner', error: String(err && err.stack || err) }));
}
console.log(JSON.stringify({ item: 'problems', problems, dialogs }));
chrome.kill(); server.close(); ws.close();
