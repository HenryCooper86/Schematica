// Incident replay: after reconstructing a board + timeline from a log, play it
// back step by step. The panel drives a `createPlayback` timer, highlights the
// current node on the board, centers the camera on it, and shows the active
// phase, progress, and a small live action stream — a lightweight stand-in for
// the reference's full incident timeline.
import { parseIncidentLog, reconstructIncident } from '../incident-replay.js';
import { createPlayback } from '../playback.js';
import { nodeSize } from '../geometry.js';
import { tr } from '../i18n.js';
import { escAttr } from './press.js';
import { esc } from '../render.js';

const SPEEDS = [0.5, 1, 2, 4];

function timeLabel(ts) {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

export function initIncidentReplay({ store, tools, render, svg }) {
  const panel = document.createElement('section');
  panel.id = 'incident-replay-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', tr('Incident replay'));
  panel.hidden = true;
  panel.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:30;width:360px;max-width:calc(100vw - 28px);'
    + 'max-height:62vh;overflow:auto;background:var(--bg1,#101625);color:var(--text,#cbd5e1);'
    + 'border:1px solid var(--line,#334155);border-radius:12px;padding:12px;'
    + 'box-shadow:0 12px 32px rgba(0,0,0,.55);font:12px/1.5 system-ui,-apple-system,sans-serif;';
  document.body.append(panel);

  const btn = (style) => ` style="${style}"`;
  panel.innerHTML = `
    <header style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <strong>${esc(tr('Incident replay'))}</strong>
      <span id="ir-title" style="margin-left:auto;color:var(--muted,#8b9bb4)"></span>
      <button id="ir-close" type="button" aria-label="${escAttr(tr('Close'))}"${btn('background:none;border:0;color:var(--muted,#8b9bb4);font-size:16px;cursor:pointer')}>&times;</button>
    </header>
    <div id="ir-phase" style="color:var(--accent,#7dd3fc);font-weight:600;margin-bottom:4px"></div>
    <input id="ir-scrub" type="range" min="0" max="0" value="0" aria-label="${escAttr(tr('Replay position'))}" style="width:100%;margin:0">
    <div style="display:flex;align-items:center;gap:6px;margin:6px 0">
      <button id="ir-restart" type="button" title="${escAttr(tr('Restart'))}"${btn('background:var(--bg2,#1b2437);border:1px solid var(--line,#334155);color:var(--text,#cbd5e1);border-radius:6px;padding:4px 8px;cursor:pointer')}>&#9198;</button>
      <button id="ir-prev" type="button"${btn('background:var(--bg2,#1b2437);border:1px solid var(--line,#334155);color:var(--text,#cbd5e1);border-radius:6px;padding:4px 8px;cursor:pointer')}>&#9664;</button>
      <button id="ir-play" type="button"${btn('background:var(--accent,#38bdf8);border:1px solid var(--accent,#38bdf8);color:#0a0e17;border-radius:6px;padding:4px 10px;cursor:pointer;font-weight:600')}>${esc(tr('Play'))}</button>
      <button id="ir-next" type="button"${btn('background:var(--bg2,#1b2437);border:1px solid var(--line,#334155);color:var(--text,#cbd5e1);border-radius:6px;padding:4px 8px;cursor:pointer')}>&#9654;</button>
      <label style="margin-left:8px;color:var(--muted,#8b9bb4)">${esc(tr('Speed'))}
        <select id="ir-speed" style="background:var(--bg2,#1b2437);color:var(--text,#cbd5e1);border:1px solid var(--line,#334155);border-radius:6px;padding:3px 4px">
          ${SPEEDS.map((s) => `<option value="${s}"${s === 1 ? ' selected' : ''}>${s}&times;</option>`).join('')}
        </select>
      </label>
      <span id="ir-counter" style="margin-left:auto;color:var(--muted,#8b9bb4)"></span>
    </div>
    <ol id="ir-stream" style="list-style:none;margin:0;padding:0;max-height:180px;overflow:auto"></ol>
  `;

  let state = null; // { title, timeline, phases }
  let index = -1;

  const speed = () => Number(panel.querySelector('#ir-speed').value) || 1;
  const playback = createPlayback({
    advance: () => stepTo(index + 1),
    delay: () => Math.round(1800 / speed()),
    changed: (playing) => {
      panel.querySelector('#ir-play').textContent = playing ? tr('Pause') : tr('Play');
    },
  });

  function centerOn(nodeId) {
    const node = store.doc.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const { w, h } = nodeSize(node);
    const r = svg.getBoundingClientRect();
    const zoom = tools.view.zoom;
    tools.view.x = r.width / 2 - (node.x + w / 2) * zoom;
    tools.view.y = r.height / 2 - (node.y + h / 2) * zoom;
    render('view');
  }

  function renderStream() {
    const list = panel.querySelector('#ir-stream');
    const from = Math.max(0, index - 1);
    const to = Math.min(state.timeline.length, index + 4);
    const rows = state.timeline.slice(from, to).map((step, i) => {
      const global = from + i;
      const active = global === index;
      const label = `${timeLabel(step.ts)} ${step.actor}${step.target ? ` → ${step.target}` : ''} · ${step.action}${step.count > 1 ? ` ×${step.count}` : ''}${step.note ? ` — ${step.note}` : ''}`;
      return `<li style="${active ? 'color:var(--text,#cbd5e1);font-weight:600' : 'color:var(--muted,#8b9bb4)'}">${esc(label)}</li>`;
    }).join('');
    list.innerHTML = rows;
    const activeRow = list.querySelectorAll('li')[index - from];
    activeRow?.scrollIntoView({ block: 'nearest' });
  }

  function renderPhase() {
    const phase = state.timeline[index]?.phase || '';
    const meta = state.phases.find((p) => p.name === phase);
    const range = meta ? `${timeLabel(meta.firstSeen)} → ${timeLabel(meta.lastSeen)} · ${meta.count}` : '';
    panel.querySelector('#ir-phase').textContent = meta ? `${phase} — ${range}` : '';
  }

  function renderState() {
    panel.querySelector('#ir-scrub').max = String(Math.max(0, state.timeline.length - 1));
    panel.querySelector('#ir-scrub').value = String(index);
    panel.querySelector('#ir-counter').textContent = `${index + 1} / ${state.timeline.length}`;
    renderPhase();
    renderStream();
    const step = state.timeline[index];
    if (step && step.node) {
      store.setSelection([step.node]);
      centerOn(step.node);
    }
  }

  function stepTo(next) {
    if (!state || next < 0 || next >= state.timeline.length) return false;
    index = next;
    renderState();
    return true;
  }

  function restart() { playback.pause(); index = -1; stepTo(0); }
  function prev() { playback.pause(); stepTo(index - 1); }
  function next() { playback.pause(); stepTo(index + 1); }
  function toggle() { if (playback.playing) playback.pause(); else { if (index >= state.timeline.length - 1) restart(); playback.play(); } }

  panel.querySelector('#ir-close').addEventListener('click', closePanel);
  panel.querySelector('#ir-play').addEventListener('click', toggle);
  panel.querySelector('#ir-restart').addEventListener('click', restart);
  panel.querySelector('#ir-prev').addEventListener('click', prev);
  panel.querySelector('#ir-next').addEventListener('click', next);
  panel.querySelector('#ir-speed').addEventListener('change', () => playback.reschedule());
  panel.querySelector('#ir-scrub').addEventListener('input', (e) => { playback.pause(); stepTo(Number(e.target.value)); });

  function closePanel() { playback.pause(); panel.hidden = true; }

  async function openIncidentFile(file) {
    try {
      const text = await file.text();
      const parsed = parseIncidentLog(text);
      const reconstructed = reconstructIncident(parsed);
      if (store.replaceDoc(reconstructed.doc) === false) return;
      state = { title: reconstructed.doc.title, timeline: reconstructed.timeline, phases: reconstructed.phases };
      index = -1;
      panel.querySelector('#ir-title').textContent = state.title;
      playback.pause();
      panel.hidden = false;
      stepTo(0);
    } catch (error) {
      // A malformed log leaves the current board untouched.
      const { toast } = await import('./press.js');
      toast(error.message);
    }
  }

  // A one-shot hidden file picker, created on first use.
  let fileInput = null;
  function pickIncidentFile() {
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.id = 'incident-file-input';
      fileInput.type = 'file';
      fileInput.accept = '.json,application/json';
      fileInput.hidden = true;
      document.body.append(fileInput);
      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (file) openIncidentFile(file);
      });
    }
    fileInput.click();
  }

  return { openIncidentFile, pickIncidentFile, closePanel };
}
