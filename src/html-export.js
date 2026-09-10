import { getTheme } from './theme.js';
import { buildExportSVG, exportBounds } from './export.js';
import { esc } from './render.js';
import { nodeRect } from './geometry.js';
import { resolveStep, resolveStoryStop, storyRelationshipText, nextStoryPosition, readStoryMoment } from './journey.js';
import { createPlayback } from './playback.js';
import { connectionFocus, nodeHaystack } from './explore.js';
import { BUSES, BUS_ORDER } from './buses.js';
import { tr, trd, getLang } from './i18n.js';

// BCP 47 tags for the html lang attribute, as i18n.js writes on the app's own
// document; the export has no document to copy it from.
const HTML_LANG = { en: 'en', zh: 'zh-CN' };

// This function is embedded verbatim. It must depend only on its argument and
// browser APIs, so the downloaded file works offline without modules or assets.
function offlineViewer(data, focusGraph, makePlayback, nextPosition, readMoment) {
  const svg = document.querySelector('svg');
  const search = document.getElementById('search');
  const results = document.getElementById('results');
  const bus = document.getElementById('bus');
  const connections = document.getElementById('connections');
  const chapters = document.getElementById('chapters');
  const caption = document.getElementById('caption');
  let selected = new Set();
  let story = null;
  let stopIndex = -1, current = null, tween = null;
  const playback = makePlayback({ advance: () => advance(1), delay: () => document.getElementById('speed').value,
    changed: playing => { const b = document.getElementById('play'); b.textContent = playing ? data.labels.pause : data.labels.play; b.setAttribute('aria-pressed', String(playing)); } });
  let bounds = { ...data.bounds };
  function paint() {
    const focus = focusGraph(data.doc, { bus: bus.value, connections: connections.value }, selected);
    for (const el of svg.querySelectorAll('.node, .wire')) {
      const matches = story ? story.includes(el.dataset.id) : (el.dataset.type === 'node' ? focus.nodes : focus.wires).has(el.dataset.id);
      el.classList.toggle('current', !!story && el.dataset.id === current);
      el.classList.toggle('muted', (story || focus.active) && !matches);
      el.classList.toggle('focused', (story || focus.active || selected.has(el.dataset.id)) && matches);
    }
  }
  function view(rect) {
    if (tween !== null) { cancelAnimationFrame(tween); tween = null; }
    bounds = { ...rect };
    svg.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`);
  }
  function frame(rect) {
    view({ x: rect.x - 60, y: rect.y - 60, w: rect.w + 120, h: rect.h + 120 });
  }
  function fly(rect) {
    if (tween !== null) cancelAnimationFrame(tween);
    if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) { view(rect); return; }
    const from = {...bounds}, started = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - started) / 600), e = t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
      bounds = Object.fromEntries(['x','y','w','h'].map(k => [k, from[k] + (rect[k]-from[k])*e]));
      svg.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`);
      tween = t < 1 ? requestAnimationFrame(tick) : null;
    }
    tween = requestAnimationFrame(tick);
  }
  function clearStory() {
    playback.pause(); story = null; current = null; stopIndex = -1;
    chapters.value = ''; caption.textContent = '';
    document.getElementById('stop-rail').replaceChildren();
    document.getElementById('relationship').textContent = '';
    document.getElementById('progress').textContent = '';
    document.getElementById('copy-moment').disabled = true;
    document.getElementById('previous').disabled = true;
    document.getElementById('next').disabled = !data.steps.length;
    document.getElementById('play').disabled = !data.steps.length;
    document.querySelectorAll('#chapter-rail button').forEach(b => b.setAttribute('aria-current', 'false'));
    history.replaceState(null, '', location.href.split('#')[0]);
  }
  function choose(id) {
    const node = data.nodes.find(n => n.id === id);
    if (!node) return;
    clearStory(); selected = new Set([id]);
    paint(); frame(node.rect);
  }
  function find() {
    const words = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    results.replaceChildren(new Option(data.labels.results, ''));
    for (const node of data.nodes.filter(n => words.every(w => n.search.includes(w))).slice(0, 100)) results.add(new Option(node.label, node.id));
  }
  function chapter() {
    const step = data.steps.find(s => s.id === chapters.value);
    if (!step) { clearStory(); paint(); return; }
    const ci = data.steps.indexOf(step);
    stopIndex = Math.min(stopIndex, (step.stops?.length || 0) - 1);
    const stop = step.stops?.[stopIndex], target = stop || step;
    selected.clear(); story = target.ids.length ? target.ids : null; current = stop?.node || null;
    caption.textContent = target.caption;
    document.getElementById('relationship').textContent = stop?.relationship || '';
    document.getElementById('progress').textContent = `${ci + 1} / ${data.steps.length} · ${step.label}` + (stop ? ` · ${stopIndex + 1} / ${step.stops.length}` : '');
    document.getElementById('stop-rail').replaceChildren(...(step.stops || []).map((st, i) => {
      const b = document.createElement('button'); b.textContent = `${i + 1}. ${st.label}`;
      b.setAttribute('aria-current', String(i === stopIndex));
      b.onclick = () => { playback.pause(); stopIndex = i; chapter(); }; return b;
    }));
    document.querySelectorAll('#chapter-rail button').forEach((b,i) => b.setAttribute('aria-current', String(i === ci)));
    for (const id of ['chapter-rail','stop-rail']) document.getElementById(id).querySelector('[aria-current="true"]')?.scrollIntoView({block:'nearest', inline:'nearest'});
    document.getElementById('previous').disabled = !nextPosition(data.steps, ci, stopIndex, -1);
    document.getElementById('next').disabled = !nextPosition(data.steps, ci, stopIndex, 1);
    document.getElementById('copy-moment').disabled = false;
    paint();
    const r = svg.getBoundingClientRect();
    const rects = data.nodes.filter(n => target.ids.includes(n.id)).map(n => n.rect);
    let v = target.view;
    if (rects.length) {
      const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y));
      const w = Math.max(...rects.map(r => r.x+r.w))-x, h = Math.max(...rects.map(r => r.y+r.h))-y;
      v = { cx: x+w/2, cy: y+h/2, zoom: Math.max(.2, Math.min(1.5, (r.width-100)/Math.max(1,w), (r.height-100)/Math.max(1,h))) };
    }
    const w = r.width / v.zoom, h = r.height / v.zoom;
    fly({ x: v.cx - w/2, y: v.cy - h/2, w, h });
    const params = new URLSearchParams({step: step.id});
    if (stop) params.set('stop',stop.id);
    if (document.body.classList.contains('presenting')) params.set('present','1');
    history.replaceState(null, '', '#' + params);
  }
  function advance(delta) {
    const ci = data.steps.findIndex(s => s.id === chapters.value);
    // With no chapter chosen, only a step forward starts the story; stepping
    // back from nowhere stays nowhere.
    if (ci < 0) { if (!data.steps.length || delta < 0) return false; chapters.value = data.steps[0].id; stopIndex = -1; chapter(); return true; }
    const pos = nextPosition(data.steps, ci, stopIndex, delta);
    if (!pos) return false;
    chapters.value = data.steps[pos.chapter].id; stopIndex = pos.stop; chapter(); return true;
  }
  function toggleStage() {
    playback.pause();
    document.body.classList.toggle('presenting');
    document.getElementById('present').setAttribute('aria-pressed',String(document.body.classList.contains('presenting')));
    if (chapters.value) chapter(); else view(data.bounds);
  }
  const rail = document.getElementById('chapter-rail');
  rail.replaceChildren(...data.steps.map(step => {
    const b = document.createElement('button'); b.textContent = step.label;
    b.onclick = () => { playback.pause(); chapters.value = step.id; stopIndex = -1; chapter(); }; return b;
  }));
  document.getElementById('play').onclick = () => {
    if (playback.playing) playback.pause();
    else { if (!chapters.value) advance(1); playback.play(); }
  };
  document.getElementById('speed').onchange = () => playback.reschedule();
  document.getElementById('restart').onclick = () => { playback.pause(); chapters.value = data.steps[0]?.id || ''; stopIndex = -1; chapter(); };
  document.getElementById('show-all').onclick = () => { clearStory(); paint(); view(data.bounds); };
  document.getElementById('present').onclick = toggleStage;
  document.getElementById('copy-moment').onclick = async () => {
    playback.pause();
    const local = location.protocol === 'file:' || location.protocol === 'blob:';
    const input = document.getElementById('moment-link'); input.value = local ? location.hash : location.href;
    document.getElementById('moment-help').textContent = local ? data.labels.offlineLink : data.labels.linkHelp;
    document.getElementById('moment-dialog').showModal(); input.focus(); input.select();
    try { await navigator.clipboard.writeText(input.value); } catch { /* visible, selectable fallback */ }
  };
  document.getElementById('moment-close').onclick = () => document.getElementById('moment-dialog').close();
  document.addEventListener('visibilitychange', () => { if (document.hidden) { playback.pause(); if (tween !== null) { cancelAnimationFrame(tween); tween = null; } } });
  window.addEventListener('resize', () => { playback.pause(); if (chapters.value) chapter(); });
  document.addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); playback.pause(); advance(e.key === 'ArrowRight' ? 1 : -1); }
    if (e.code === 'Space') { e.preventDefault(); document.getElementById('play').click(); }
    if (e.key === 'Escape' && document.body.classList.contains('presenting')) toggleStage();
  });
  search.addEventListener('input', find);
  search.addEventListener('keydown', e => { if (e.key === 'Enter' && results.options.length > 1) choose(results.options[1].value); });
  results.addEventListener('change', () => choose(results.value));
  for (const el of [bus, connections]) el.addEventListener('change', () => { clearStory(); paint(); });
  document.getElementById('fit').addEventListener('click', () => { playback.pause(); view(data.bounds); });
  document.getElementById('reset').addEventListener('click', () => {
    clearStory(); selected.clear(); bus.value = ''; connections.value = 'all'; search.value = ''; chapters.value = ''; caption.textContent = '';
    history.replaceState(null, '', location.href.split('#')[0]); find(); paint(); view(data.bounds);
  });
  chapters.addEventListener('change', () => { playback.pause(); stopIndex = -1; chapter(); });
  for (const [id, delta] of [['previous', -1], ['next', 1]]) document.getElementById(id).addEventListener('click', () => { playback.pause(); advance(delta); });
  svg.addEventListener('wheel', e => {
    e.preventDefault(); playback.pause();
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const w = Math.min(data.bounds.w * 10, Math.max(40, bounds.w * factor));
    const h = bounds.h * w / bounds.w;
    view({ x: bounds.x + (bounds.w - w) / 2, y: bounds.y + (bounds.h - h) / 2, w, h });
  }, { passive: false });
  let drag = null, dragged = false;
  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    playback.pause(); if (tween !== null) { cancelAnimationFrame(tween); tween = null; }
    drag = { x: e.clientX, y: e.clientY, bounds: { ...bounds }, node: e.target.closest('.node')?.dataset.id }; dragged = false; svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) < 4) return;
    dragged = true;
    const r = svg.getBoundingClientRect();
    const scale = Math.max(drag.bounds.w / r.width, drag.bounds.h / r.height);
    view({ ...drag.bounds, x: drag.bounds.x - dx * scale, y: drag.bounds.y - dy * scale });
  });
  svg.addEventListener('pointerup', () => { if (!dragged && drag?.node) choose(drag.node); drag = null; });
  svg.addEventListener('pointercancel', () => { drag = null; });
  document.getElementById('download').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data.doc, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'board.schematica.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  find(); view(data.bounds);
  function restoreMoment() {
    playback.pause();
    const params = new URLSearchParams(location.hash.slice(1));
    const moment = readMoment(data.steps, params);
    document.body.classList.toggle('presenting', params.get('present') === '1');
    document.getElementById('present').setAttribute('aria-pressed',String(document.body.classList.contains('presenting')));
    if (moment) { chapters.value = data.steps[moment.chapter].id; stopIndex = moment.stop; chapter(); }
    else { clearStory(); paint(); view(data.bounds); }
  }
  restoreMoment(); window.addEventListener('hashchange',restoreMoment);
}

export function buildHTML(doc, options = {}) {
  const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const option = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`;
  const light = (options.theme || getTheme()) === 'light';
  const data = { doc, bounds: exportBounds(doc), labels: { results: tr('Choose a matching part'), play: tr('Play'), pause: tr('Pause'), offlineLink: tr('For an offline file, send the HTML file together with this moment fragment.'), linkHelp: tr('Copy this link to open this chapter and stop.') },
    nodes: doc.nodes.map(n => ({ id: n.id, label: [n.label, n.sublabel].filter(Boolean).join(' — '), rect: nodeRect(n),
      search: nodeHaystack(n) })),
    steps: (doc.journey || []).map(s => { const r = resolveStep(doc, s); return { ...s, view: r.view, ids: [...r.ids], stops: (s.stops || []).map((stop,i) => {
      const result = resolveStoryStop(doc,s,i), node = doc.nodes.find(n => n.id === stop.node);
      return {...stop, label: node?.label || tr('Missing part'), view: result.view, ids: [...result.ids], relationship: storyRelationshipText(doc,s,i), caption: (node ? '' : tr('Missing part') + ': ' + stop.node + '. ') + (stop.caption || s.caption || '')};
    }) }; }) };
  return `<!doctype html><html lang="${HTML_LANG[getLang()] || getLang()}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)}</title><style>
*{box-sizing:border-box}body{margin:0;background:${light ? '#f8fafc' : '#0a0e17'};color:${light ? '#1e293b' : '#e6ebf4'};font:14px system-ui}header{padding:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:${light ? '#e8eef6' : '#131a2b'}}h1{font-size:16px;margin:0 12px 0 0}label{font-size:12px;display:flex;gap:5px;align-items:center}input,select,button{font:inherit;max-width:240px;background:${light ? '#fff' : '#0d1220'};color:inherit;border:1px solid ${light ? '#b5c1d2' : '#2c3a5c'};border-radius:6px;padding:6px}button{cursor:pointer}:focus-visible{outline:2px solid #38bdf8}main{height:calc(100dvh - 150px);min-height:280px}svg{width:100%;height:100%;touch-action:none;user-select:none}.muted{opacity:.2}.wire.focused:not(.invalid) .vis{stroke:#38bdf8;stroke-width:3}.node.focused .card{stroke:#38bdf8;stroke-width:2}.node{cursor:pointer}#caption{padding:12px;white-space:pre-wrap;max-height:120px;overflow:auto}
body{height:100dvh;display:flex;flex-direction:column}main{flex:1;min-height:180px;height:auto}#story-controls{padding:8px 12px;flex-shrink:0}#chapter-rail,#stop-rail{display:flex;gap:6px;overflow:auto;margin:4px 0}#chapter-rail button,#stop-rail button{flex-shrink:0}button[aria-current="true"],.current .card{outline-color:#38bdf8}button[aria-current="true"]{border-color:#38bdf8}button:disabled{opacity:.4;cursor:default}.current .card{stroke-width:3}#caption{padding:4px 0;max-height:80px}#relationship{white-space:pre-wrap;font-size:12px;max-height:60px;overflow:auto}#player{display:flex;align-items:center;gap:6px;flex-wrap:wrap}#progress{font-size:12px}body.presenting header label:not(.story-control),body.presenting #results,body.presenting #fit,body.presenting #reset,body.presenting #download{display:none}dialog{max-width:90vw;background:inherit;color:inherit;border:1px solid #64748b;border-radius:10px}#moment-link{width:70vw;max-width:800px}dialog::backdrop{background:#0008}@media print{header,#story-controls{display:none}main{height:95vh}.muted{opacity:1}.focused .card,.current .card{stroke-width:1}}
</style><header><h1>${esc(doc.title)}</h1>
<label>${esc(tr('Search this board'))}<input id="search" type="search"></label><select id="results" aria-label="${esc(tr('Choose a matching part'))}"></select>
<label>${esc(tr('Bus filter'))}<select id="bus">${option('', tr('All buses'))}${BUS_ORDER.map(id => option(id, BUSES[id].short + ' — ' + trd(BUSES[id].name))).join('')}</select></label>
<label>${esc(tr('Connections'))}<select id="connections">${option('all', tr('All parts'))}${option('neighbors', tr('Immediate neighbors'))}${option('network', tr('Connected network'))}</select></label>
<button id="fit">${esc(tr('Fit diagram'))}</button><button id="reset">${esc(tr('Reset exploration'))}</button><button id="download">${esc(tr('Download board'))}</button>
<label class="story-control">${esc(tr('Journey'))}<select id="chapters">${option('', tr('Choose a journey step'))}${data.steps.map(s => option(s.id, s.label)).join('')}</select></label><button id="present" aria-pressed="false">${esc(tr('Present'))}</button></header>
<main>${buildExportSVG(doc, options)}</main>
<section id="story-controls"${data.steps.length ? '' : ' hidden'}>
<nav id="chapter-rail" aria-label="${esc(tr('Story chapters'))}"></nav><nav id="stop-rail" aria-label="${esc(tr('Story stops'))}"></nav>
<div id="relationship"></div><div id="caption" role="status"></div>
<div id="player"><button id="previous" aria-label="${esc(tr('Previous step'))}">←</button><span id="progress"></span><button id="next" aria-label="${esc(tr('Next step'))}">→</button>
<button id="play">${esc(tr('Play'))}</button><label>${esc(tr('Speed'))}<select id="speed"><option value="8000">0.5×</option><option value="4000" selected>1×</option><option value="2000">2×</option></select></label>
<button id="restart">${esc(tr('Restart'))}</button><button id="show-all">${esc(tr('Show all'))}</button><button id="copy-moment" disabled>${esc(tr('Copy moment'))}</button></div>
</section><dialog id="moment-dialog"><p id="moment-help"></p><input id="moment-link" readonly aria-label="${esc(tr('Story moment link'))}"><button id="moment-close">${esc(tr('Close'))}</button></dialog>
<script id="board-data" type="application/json">${json(data)}</script>
<script>(${offlineViewer.toString()})(JSON.parse(document.getElementById('board-data').textContent), ${connectionFocus.toString()}, ${createPlayback.toString()}, ${nextStoryPosition.toString()}, ${readStoryMoment.toString()});</script></html>`;
}
