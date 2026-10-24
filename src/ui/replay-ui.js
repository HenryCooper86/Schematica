// Incident replay: plays a reconstructed board's timeline (doc.incident) on
// a clock. Parts and links start dim and light up as the attacker reaches
// them and wear the condition each action leaves them in (compromised,
// infected, ...); a dock shows the clock, actions replayed, the active phase,
// reach, phase activity, a live action stream and volume per day. It reuses
// the presenting layout (toolbar, palette and panels hidden) and never edits
// the board: the conditions are a view overlay that leaves with the replay.
import { replayState, eventIndexAt, incidentSpan, utcLong, utcShort, utcDay, conditionFor } from '../incident-data.js';
import { CONDITIONS } from '../palette.js';
import { contentBounds } from '../geometry.js';
import { escAttr as esc } from './press.js';
import { tr, trd, onLanguageChange } from '../i18n.js';

const SPEEDS = [0.5, 1, 2, 4];
const BASE_MS = 40000; // the whole incident at 1×
const PHASE_COLORS = ['#38bdf8', '#f87171', '#fb923c', '#e879f9', '#a78bfa', '#facc15', '#34d399', '#f472b6', '#22d3ee'];
// An id no item has: a non-empty story set with no match dims everything.
const NOTHING = '\u0000none';

export function initReplay({ store, tools, render, svg }) {
  const wrap = document.getElementById('canvas-wrap');
  const app = document.getElementById('app');
  const chip = document.createElement('button');
  chip.id = 'replay-chip';
  chip.type = 'button';
  chip.hidden = true;
  wrap.append(chip);
  const dock = document.createElement('section');
  dock.id = 'replay-dock';
  dock.hidden = true;
  dock.setAttribute('aria-labelledby', 'replay-title');
  wrap.append(dock);

  let active = false, playing = false, speed = 1, clock = 0, raf = null, last = 0, shownIndex = null;
  let incident = null, span = null, colors = new Map();

  const playing0 = () => incident && clock >= span.end;
  const colorOf = (phase) => colors.get(phase) || '#94a3b8';

  function syncChip() {
    const inc = store.doc.incident;
    // A journey presentation uses the same layout; the chip stays out of it
    // so a replay cannot start under, or end, that presentation.
    chip.hidden = active || app.classList.contains('presenting') || !inc?.events?.length;
    chip.innerHTML = `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M6 4.5v9l7-4.5z"/></svg>${esc(tr('Replay incident'))}`;
  }

  function skeleton() {
    const inc = incident;
    const dayCount = span.days.length;
    dock.innerHTML = `<header class="replay-bar">
        <div class="replay-title"><span class="replay-kicker">${esc(tr('Incident replay'))}${inc.title ? ` · ${esc(inc.title)}` : ''}</span>
          <h2 id="replay-title">${esc(tr('Reconstructed from {count} logged actions', { count: replayState(inc, -1).total.toLocaleString() }))}</h2></div>
        <div class="replay-controls">
          <button type="button" data-r="play" class="replay-play" aria-label="${esc(tr('Play'))}"></button>
          <button type="button" data-r="restart">${esc(tr('Restart'))}</button>
          <span class="replay-speeds" role="group" aria-label="${esc(tr('Speed'))}">${SPEEDS.map((s) => `<button type="button" data-speed="${s}" aria-pressed="${s === speed}">${s}×</button>`).join('')}</span>
        </div>
        <div class="replay-clock"><b data-r="time"></b><small data-r="day"></small></div>
        <button type="button" data-r="exit" class="replay-exit" aria-label="${esc(tr('Exit replay'))}" title="${esc(tr('Exit replay'))}">&times;</button>
        <div class="replay-track">
          <div class="replay-ticks">${span.days.map((d, i) => `<span style="left:${pct(Math.max(d, span.start))}%">${esc(utcDay(d))}${dayCount > 1 ? ` · ${esc(tr('Day {n}', { n: i + 1 }))}` : ''}</span>`).join('')}</div>
          <input type="range" data-r="scrub" min="0" max="1000" step="1" value="0" aria-label="${esc(tr('Replay position'))}">
          ${stageBands()}
        </div>
      </header>
      <div class="replay-panels">
        <section class="replay-metrics" aria-label="${esc(tr('Summary'))}">
          <div><small>${esc(tr('Actions replayed'))}</small><b data-r="actions"></b><span data-r="actions-of"></span></div>
          <div><small>${esc(tr('Active phase'))}</small><b data-r="phase"></b><span data-r="stage"></span></div>
          <div><small>${esc(tr('Reach'))}</small><b data-r="reach"></b><span data-r="reach-of"></span></div>
        </section>
        <section class="replay-phases"><h3>${esc(tr('Phase activity'))}</h3><div data-r="phases"></div></section>
        <section class="replay-stream"><h3>${esc(tr('Live action stream'))}</h3><ol data-r="stream" aria-live="polite"></ol></section>
        <section class="replay-days"><h3>${esc(tr('Volume per day'))}</h3><div data-r="days"></div></section>
      </div>
      <p class="replay-note">${esc(tr('Reconstructed from a log. Steps are what the log recorded, not independent proof of execution.'))}</p>`;
    dock.querySelector('[data-r=play]').onclick = () => (playing ? pause() : play());
    dock.querySelector('[data-r=restart]').onclick = () => { pause(); seek(span.start); };
    dock.querySelector('[data-r=exit]').onclick = exit;
    dock.querySelectorAll('[data-speed]').forEach((b) => { b.onclick = () => { speed = Number(b.dataset.speed); dock.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }; });
    const scrub = dock.querySelector('[data-r=scrub]');
    scrub.oninput = () => { pause(); seek(span.start + (span.end - span.start) * (scrub.value / 1000)); };
  }

  const pct = (t) => ((t - span.start) / (span.end - span.start)) * 100;
  const stageLabel = (st) => tr('Stage {n} · {name}', { n: st.n, name: st.name });
  // Each stage as a labelled band under the timeline, from its first to its
  // last logged action.
  function stageBands() {
    const stages = replayState(incident, -1).stages.filter((st) => st.first != null);
    if (!stages.length) return '';
    return `<div class="replay-stages">${stages.map((st) => {
      const left = pct(st.first), width = Math.max(1.5, pct(st.last) - left);
      return `<span data-stage="${esc(st.name)}" style="left:${left}%;width:${width}%" title="${esc(stageLabel(st))}">${esc(stageLabel(st))}</span>`;
    }).join('')}</div>`;
  }
  const q = (r) => dock.querySelector(`[data-r="${r}"]`);

  function paintClock() {
    q('time').textContent = utcLong(clock);
    const day = span.days.findIndex((d, i) => clock >= d && (i === span.days.length - 1 || clock < span.days[i + 1])) + 1;
    q('day').textContent = span.days.length > 1 ? tr('Day {n} of {total}', { n: Math.max(1, day), total: span.days.length }) : utcDay(clock);
    q('scrub').value = String(Math.round(pct(clock) * 10));
    q('scrub').style.setProperty('--p', `${pct(clock)}%`);
    const btn = q('play');
    btn.innerHTML = playing ? '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M6 4.5v9M12 4.5v9"/></svg>' : '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M6 4.5v9l7-4.5z"/></svg>';
    btn.setAttribute('aria-label', playing ? tr('Pause') : tr('Play'));
  }

  function paintState(index) {
    const s = replayState(incident, index);
    q('actions').textContent = s.actions.toLocaleString();
    q('actions-of').textContent = tr('of {total}', { total: s.total.toLocaleString() });
    const phase = q('phase');
    phase.textContent = s.phase || '—';
    phase.style.color = s.phase ? colorOf(s.phase) : '';
    const partCount = new Set(incident.events.flatMap((e) => e.nodes)).size;
    q('reach').textContent = tr('{n} of {total} parts', { n: s.reachedParts, total: partCount });
    q('reach-of').textContent = incident.blast || '';
    q('stage').textContent = s.stage ? stageLabel(s.stage) : '';
    dock.querySelectorAll('[data-stage]').forEach((band) => band.classList.toggle('current', band.dataset.stage === s.stage?.name));
    const max = Math.max(1, ...s.perPhase.map((p) => p.total));
    const phaseRow = (p) => `<div class="replay-phase${p.name === s.phase ? ' current' : ''}${p.count ? '' : ' idle'}">
        <span class="name"><i style="background:${colorOf(p.name)}"></i>${esc(p.name)}</span><b>${p.count.toLocaleString()}</b>
        <span class="bar"><span style="width:${(p.count / max) * 100}%;background:${colorOf(p.name)}"></span></span>
        <small>${p.first != null ? esc(`${utcShort(p.first)} → ${utcShort(p.last)}`) : ''}</small></div>`;
    // With stages, phases sit under the stage they belong to.
    const grouped = s.stages.filter((st) => st.phases.length);
    const loose = s.perPhase.filter((p) => !grouped.some((st) => st.phases.includes(p.name)));
    q('phases').innerHTML = grouped.length
      ? grouped.map((st) => `<h4 class="${st.name === s.stage?.name ? 'current' : ''}">${esc(stageLabel(st))}</h4>`
        + s.perPhase.filter((p) => st.phases.includes(p.name)).map(phaseRow).join('')).join('') + loose.map(phaseRow).join('')
      : s.perPhase.map(phaseRow).join('');
    q('stream').innerHTML = s.stream.length ? s.stream.map((e) => `<li>
        <time>${esc(utcShort(e.ts))}</time>
        <span class="tag" style="color:${colorOf(e.phase)};border-color:${colorOf(e.phase)}">${esc(e.phase)}</span>
        <code>${esc(e.command || e.action)}${e.count > 1 ? ` <small>×${e.count}</small>` : ''}</code>
        ${e.evidence || e.note ? `<p>↳ ${esc(e.evidence || e.note)}</p>` : ''}
        <small class="who">${esc(e.target ? `${e.actor} → ${e.target}` : e.actor)}${conditionChip(e)}</small></li>`).join('')
      : `<li class="empty">${esc(tr('Press play to watch the incident unfold.'))}</li>`;
    const dayMax = Math.max(1, ...s.perDay.map((d) => d.total));
    q('days').innerHTML = s.perDay.map((d) => `<div class="replay-day${clock >= d.ts && clock < d.ts + 86400000 ? ' current' : ''}">
        <b>${d.count.toLocaleString()}</b><span class="col"><span style="height:${(d.count / dayMax) * 100}%"></span></span><small>${esc(utcDay(d.ts))}</small></div>`).join('');
    // The canvas: what has been reached is lit, the rest is dim.
    const lit = new Set([...s.nodes, ...s.wires]);
    tools.ui.story = lit.size ? lit : new Set([NOTHING]);
    tools.ui.storyCurrent = s.current?.nodes.at(-1) || null;
    tools.ui.conditions = s.conditions;
    render();
  }
  // The condition an action leaves its target in, as a small tag after the
  // actor → target line of the stream.
  function conditionChip(e) {
    const c = e.target ? conditionFor(e) : null;
    if (!c) return '';
    return ` <span class="replay-condition" style="color:${CONDITIONS[c].color};border-color:${CONDITIONS[c].color}">${esc(trd(CONDITIONS[c].name))}</span>`;
  }

  function seek(t) {
    clock = Math.min(span.end, Math.max(span.start, t));
    const index = eventIndexAt(incident.events, clock);
    paintClock();
    if (index !== shownIndex) { shownIndex = index; paintState(index); }
  }

  function frame(now) {
    const dt = now - last;
    last = now;
    seek(clock + ((span.end - span.start) / BASE_MS) * speed * dt);
    if (playing0()) { pause(); return; }
    raf = requestAnimationFrame(frame);
  }
  function play() {
    if (playing0()) seek(span.start);
    playing = true;
    last = performance.now();
    paintClock();
    raf = requestAnimationFrame(frame);
  }
  function pause() {
    playing = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (active) paintClock();
  }
  function step(dir) {
    pause();
    const events = incident.events;
    const i = eventIndexAt(events, clock);
    const next = dir > 0 ? events[Math.min(events.length - 1, i + 1)] : events[Math.max(0, i - 1)];
    seek(dir < 0 && i <= 0 ? span.start : next.ts);
  }

  // Fit the board into the canvas above the dock.
  function frameBoard() {
    const r = svg.getBoundingClientRect();
    const b = contentBounds(store.doc);
    if (!b || !b.w || !b.h) return;
    const free = Math.max(160, r.height - dock.offsetHeight - 40);
    const zoom = Math.min(1.4, ((r.width - 64) / b.w), (free - 32) / b.h);
    Object.assign(tools.view, { zoom, x: r.width / 2 - (b.x + b.w / 2) * zoom, y: 16 + free / 2 - (b.y + b.h / 2) * zoom });
    render('view');
  }

  function enter() {
    incident = store.doc.incident;
    if (!incident?.events?.length || active || app.classList.contains('presenting')) return;
    span = incidentSpan(incident);
    // Start a moment before the first logged action, so nothing has
    // happened yet when the replay opens.
    span = { ...span, start: span.start - Math.max(60000, (span.end - span.start) * 0.02) };
    colors = new Map(incident.phases.map((p, i) => [p.name, PHASE_COLORS[i % PHASE_COLORS.length]]));
    active = true;
    shownIndex = null;
    tools.ui.presenting = true;
    app.classList.add('presenting', 'replaying');
    dock.hidden = false;
    skeleton();
    syncChip();
    seek(span.start);
    requestAnimationFrame(frameBoard);
    q('play').focus();
  }
  function exit() {
    if (!active) return;
    pause();
    active = false;
    dock.hidden = true;
    dock.innerHTML = '';
    tools.ui.presenting = false;
    tools.ui.story = null;
    tools.ui.storyCurrent = null;
    tools.ui.conditions = null;
    app.classList.remove('presenting', 'replaying');
    syncChip();
    render();
    chip.focus();
  }

  chip.addEventListener('click', enter);
  window.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    if (!active || e.target.closest?.('input[type=text], textarea')) return;
    const keys = { ' ': () => (playing ? pause() : play()), ArrowRight: () => step(1), ArrowLeft: () => step(-1), Home: () => { pause(); seek(span.start); }, Escape: exit };
    const fn = keys[e.key];
    if (!fn || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    fn();
  }, true);
  window.addEventListener('resize', () => { if (active) frameBoard(); });
  new MutationObserver(syncChip).observe(app, { attributes: true, attributeFilter: ['class'] });
  // A different board ends the replay; an edit to this one keeps it running.
  let generation = store.generation;
  store.subscribe(() => {
    if (store.generation !== generation) { generation = store.generation; exit(); }
    syncChip();
  }, { documentOnly: true });
  onLanguageChange(() => { syncChip(); if (active) { const at = clock; skeleton(); shownIndex = null; seek(at); } });
  syncChip();
  return { enter, exit, isActive: () => active };
}
