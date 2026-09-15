// Native Safari/Firefox regression checks using W3C WebDriver, with no npm dependencies.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEngineeringChecks } from './engineering.mjs';
import { runPresentationChecks } from './presentation.mjs';
import { runExploreChecks } from './explore.mjs';
import { runPerformance } from './performance.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const browser = process.argv[2] || 'firefox';
if (!['firefox', 'safari'].includes(browser)) throw new Error('Usage: node tests/e2e/cross-browser.mjs firefox|safari');
const output = resolve(process.env.VALIDATION_OUTPUT || join(ROOT, '.acceptance', browser));
await mkdir(output, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
const capture = `<script>window.__validationErrors=[];addEventListener('error',e=>window.__validationErrors.push(e.message||'Resource: '+e.target?.src),true);addEventListener('unhandledrejection',e=>window.__validationErrors.push(String(e.reason)));</script>`;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    const file = resolve(ROOT, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    let body = await readFile(file);
    if (file === join(ROOT, 'index.html')) body = body.toString().replace('<head>', '<head>' + capture);
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const probe = createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r));
const port = probe.address().port; await new Promise(r => probe.close(r));
const driver = spawn(browser === 'safari' ? '/usr/bin/safaridriver' : (process.env.GECKODRIVER_PATH || 'geckodriver'), ['--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
let driverLog = '', session;
driver.on('error', e => { driverLog += e.message; });
for (const stream of [driver.stdout, driver.stderr]) stream.on('data', d => { driverLog = (driverLog + d).slice(-12000); });
const request = async (method, path, body) => {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60000) });
  const data = await r.json();
  if (!r.ok || data.value?.error) throw new Error(data.value?.message || JSON.stringify(data));
  return data.value;
};
const command = (path, body = {}, method = 'POST') => request(method, `/session/${session}${path}`, body);
const report = { browser, created: new Date().toISOString(), checks: [] };
function check(name, passed, detail) {
  report.checks.push({ name, passed: !!passed, ...(detail ? { detail } : {}) });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + JSON.stringify(detail) : ''}`);
  if (!passed) throw new Error(name);
}
const js = async expression => {
  const result = await command('/execute/async', { script: `const done=arguments[arguments.length-1];try{Promise.resolve((0,eval)(arguments[0])).then(value=>done({ok:true,value:value??null}),error=>done({ok:false,error:String(error.stack||error)}))}catch(error){done({ok:false,error:String(error.stack||error)})}`, args: [expression] });
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
const key = async (value, code, keyCode, modifiers = 0) => {
  const keys = { Enter: '\uE007', Escape: '\uE00C', ArrowRight: '\uE014', ArrowLeft: '\uE012', Tab: '\uE004', Backspace: '\uE003', Delete: '\uE017' };
  const valueKey = keys[value] || value;
  const mods = [[1,'\uE00A'],[2,'\uE009'],[4,'\uE03D'],[8,'\uE008']].filter(([mask]) => modifiers & mask).map(([,v]) => v);
  await command('/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [...mods.map(value => ({ type:'keyDown', value })), {type:'keyDown',value:valueKey}, {type:'keyUp',value:valueKey}, ...mods.reverse().map(value => ({type:'keyUp',value}))] }] });
};
const screenshot = async name => writeFile(join(output, name + '.png'), Buffer.from(await request('GET', `/session/${session}/screenshot`), 'base64'));
const load = async () => {
  if (session) {
    const previous = await js('window.__validationErrors || []').catch(() => []); errors.push(...previous);
  }
  await command('/url', { url: origin + '/' });
  await js(`(async()=>{localStorage.clear();const {EXAMPLES}=await import('/src/examples.js');localStorage.setItem('schematica.autosave',JSON.stringify(EXAMPLES.find(e=>e.id==='weather-station').doc));return true})()`);
  await command('/refresh');
  for (let i = 0; i < 100; i++) {
    if (await js(`!!document.getElementById('btn-engineering') && document.querySelectorAll('#canvas .node').length>0`).catch(() => false)) return;
    await sleep(100);
  }
  throw new Error('Editor did not initialize');
};
try {
  let ready = false;
  for (let i=0;i<100;i++) { try { await request('GET','/status'); ready=true; break; } catch { if (driver.exitCode !== null) break; await sleep(100); } }
  if (!ready) throw new Error('Driver did not start: ' + driverLog);
  const capabilities = { browserName: browser, ...(browser === 'firefox' ? { 'moz:firefoxOptions': { args: ['-headless'], ...(process.env.FIREFOX_PATH ? {binary:process.env.FIREFOX_PATH} : {}) } } : {}) };
  const started = await request('POST','/session',{capabilities:{alwaysMatch:capabilities}});
  session = started.sessionId; report.capabilities = started.capabilities;
  await command('/timeouts', { script: 60000, pageLoad: 60000 });
  await command('/window/rect', { width: 1500, height: 950 });
  await load();
  check('editor initializes', await js(`!!document.querySelector('#canvas .node')`));
  report.viewport = await js(`({width:innerWidth,height:innerHeight})`);
  check('toolbar stays within the viewport', await js(`document.getElementById('toolbar').scrollWidth<=innerWidth`));
  await screenshot('editor');
  const dragTarget = await js(`(()=>{const node=document.querySelector('#canvas .node');const r=node.querySelector('.card').getBoundingClientRect();return {id:node.dataset.id,transform:node.getAttribute('transform'),x:Math.round(r.x+r.width/2),y:Math.round(r.y+18)}})()`);
  await command('/actions', { actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerMove', duration: 0, origin: 'viewport', x: dragTarget.x, y: dragTarget.y },
    { type: 'pointerDown', button: 0 },
    { type: 'pointerMove', duration: 250, origin: 'viewport', x: dragTarget.x+60, y: dragTarget.y+30 },
    { type: 'pointerUp', button: 0 }
  ] }] });
  check('native pointer drag moves a part', await js(`document.querySelector('[data-id="${dragTarget.id}"].node').getAttribute('transform')!==${JSON.stringify(dragTarget.transform)}`));
  await js(`document.getElementById('undo').click();true`);
  check('undo restores native pointer movement', await js(`document.querySelector('[data-id="${dragTarget.id}"].node').getAttribute('transform')===${JSON.stringify(dragTarget.transform)}`));
  // Settle the preceding drag/undo autosave before measuring read-only exploration.
  await js(`window.dispatchEvent(new Event('pagehide'));true`);
  await runExploreChecks({ js, key, check, sleep });
  await load();
  await runEngineeringChecks({ js, key, check, sleep });
  await screenshot('engineering-board');
  await js(`window.dispatchEvent(new Event('pagehide'));true`);
  const saved = await js(`localStorage.getItem('schematica.autosave')`);
  await command('/refresh'); await sleep(250);
  check('reload recovers the saved architecture', await js(`localStorage.getItem('schematica.autosave')===${JSON.stringify(saved)}&&document.querySelectorAll('#canvas .node').length===1`));
  if (process.env.KICAD_MANIFEST) {
    const { runKiCadChecks } = await import('./kicad.mjs');
    report.kicad = await runKiCadChecks({ js, check, manifest: JSON.parse(await readFile(process.env.KICAD_MANIFEST, 'utf8')) });
  }
  await load();
  report.performance = await runPerformance({ js });
  await runPresentationChecks({ js, key, check, sleep });
  await screenshot('presentation');
  errors.push(...await js('window.__validationErrors || []'));
  check('no captured browser errors or unhandled rejections', errors.length === 0, errors);
  report.passed = true;
} catch (error) {
  report.passed = false; report.error = String(error.stack || error);
  if (session) await screenshot('failure').catch(() => {});
  console.error(report.error); process.exitCode = 1;
} finally {
  report.errors = errors;
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(output, 'driver.log'), driverLog);
  if (session) await request('DELETE', `/session/${session}`).catch(() => {});
  driver.kill(); server.close();
  console.log(`${report.checks.filter(c=>c.passed).length}/${report.checks.length} checks passed; ${join(output, 'report.json')}`);
}
