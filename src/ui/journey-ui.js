// The journey panel (authored camera steps with captions) and present mode.
import { addStep, updateStep, removeStep, moveStep, tweenView } from '../journey.js';
import { onPress, escAttr } from './press.js';

export function initJourney({ svg, store, tools, render, recorder, propsPanel }) {
  const journeyPanel = document.getElementById('journey-panel');
  const overlay = document.getElementById('present-overlay');
  const presentState = { active: false, index: 0, caption: '', counter: '' };
  let tweenRaf = null;
  let presentedJourney = '';

  // Journey steps store world-space centers so they frame the same content on any
  // viewport — including present mode, where hiding the chrome resizes the canvas.
  function currentCenter() {
    const r = svg.getBoundingClientRect();
    const { zoom } = tools.view;
    return {
      cx: (r.width / 2 - tools.view.x) / zoom,
      cy: (r.height / 2 - tools.view.y) / zoom,
      zoom,
    };
  }

  function centerToView(c) {
    const r = svg.getBoundingClientRect();
    return {
      x: r.width / 2 - c.cx * c.zoom,
      y: r.height / 2 - c.cy * c.zoom,
      zoom: c.zoom,
    };
  }

  function flyTo(target, instant = false) {
    if (tweenRaf) cancelAnimationFrame(tweenRaf);
    // Jump instead of tweening when frames won't run (hidden tab) or the user
    // asked for reduced motion — otherwise the camera would silently never move.
    if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      instant = true;
    }
    if (instant) {
      Object.assign(tools.view, { x: target.x, y: target.y, zoom: target.zoom });
      render('view');
      return;
    }
    const from = { x: tools.view.x, y: tools.view.y, zoom: tools.view.zoom };
    const t0 = performance.now();
    const dur = 600;
    const tick = (now) => {
      const v = tweenView(from, target, (now - t0) / dur);
      Object.assign(tools.view, { x: v.x, y: v.y, zoom: v.zoom });
      render('view');
      if (now - t0 < dur) tweenRaf = requestAnimationFrame(tick);
      else tweenRaf = null;
    };
    tweenRaf = requestAnimationFrame(tick);
  }

  const flyToCenter = (c, instant = false) => flyTo(centerToView(c), instant);

  function renderJourney() {
    if (journeyPanel.hidden) return;
    const ae = document.activeElement;
    if (journeyPanel.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
    const steps = store.doc.journey || [];
    let html = '<h3>Journey</h3>';
    steps.forEach((s, i) => {
      html += `<div class="journey-step" data-step="${escAttr(s.id)}">`
        + `<div class="step-head"><span class="step-num">${i + 1}</span>`
        + `<input type="text" data-jfield="label" value="${escAttr(s.label)}"></div>`
        + `<textarea data-jfield="caption" placeholder="Caption shown while presenting">${escAttr(s.caption)}</textarea>`
        + '<div class="step-actions">'
        + '<button data-jact="go">Go</button>'
        + '<button data-jact="set" title="Update this step to the current view">Set</button>'
        + '<button data-jact="up">&uarr;</button>'
        + '<button data-jact="down">&darr;</button>'
        + '<button data-jact="del">&times;</button>'
        + '</div></div>';
    });
    html += '<div class="journey-actions">'
      + '<button id="journey-add">+ Add step from current view</button>'
      + `<button id="journey-present"${steps.length ? '' : ' disabled'}>&#9654; Present</button>`
      + '</div>';
    journeyPanel.innerHTML = html;
    onPress(document.getElementById('journey-add'), () => {
      addStep(store, currentCenter());
    });
    onPress(document.getElementById('journey-present'), presentEnter);
    journeyPanel.querySelectorAll('[data-jfield]').forEach((input) => {
      input.addEventListener('change', () => {
        const id = input.closest('.journey-step').dataset.step;
        updateStep(store, id, { [input.dataset.jfield]: input.value });
      });
    });
    journeyPanel.querySelectorAll('[data-jact]').forEach((btn) => {
      onPress(btn, () => {
        const id = btn.closest('.journey-step').dataset.step;
        const act = btn.dataset.jact;
        const step = (store.doc.journey || []).find((s) => s.id === id);
        if (!step) return;
        if (act === 'go') flyToCenter(step.view);
        if (act === 'set') updateStep(store, id, { view: currentCenter() });
        if (act === 'up') moveStep(store, id, -1);
        if (act === 'down') moveStep(store, id, 1);
        if (act === 'del') removeStep(store, id);
      });
    });
  }

  document.getElementById('btn-journey').addEventListener('click', (e) => {
    journeyPanel.hidden = !journeyPanel.hidden;
    e.currentTarget.classList.toggle('active', !journeyPanel.hidden);
    renderJourney();
    propsPanel.render();
  });
  store.subscribe(renderJourney);

  // ---- Present mode ----
  function presentShow() {
    const steps = store.doc.journey || [];
    if (!steps.length) { presentExit(); return; }
    presentedJourney = JSON.stringify(steps);
    presentState.index = Math.min(presentState.index, steps.length - 1);
    const step = steps[presentState.index];
    presentState.caption = step.caption || '';
    presentState.counter = `${presentState.index + 1} / ${steps.length}`;
    document.getElementById('present-caption').textContent = presentState.caption;
    document.getElementById('present-counter').textContent = presentState.counter;
    flyToCenter(step.view);
    recorder.setOverlay(presentState.caption, presentState.counter);
  }

  function presentGo(delta) {
    const steps = store.doc.journey || [];
    const next = presentState.index + delta;
    if (next < 0 || next >= steps.length) return;
    presentState.index = next;
    presentShow();
  }

  function presentKeys(e) {
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (!presentState.active) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); presentGo(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); presentGo(-1); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); presentExit(); }
    else if (/^[a-z]$/i.test(e.key) && !e.metaKey && !e.ctrlKey) {
      // Tool switches and F (fit) would silently move the presented camera.
      // Modifier shortcuts (undo/redo) stay live — presenting re-syncs to them.
      e.stopPropagation();
    }
  }

  function presentEnter() {
    if (!(store.doc.journey || []).length) return;
    presentState.active = true;
    presentState.index = 0;
    document.getElementById('app').classList.add('presenting');
    overlay.hidden = false;
    window.addEventListener('keydown', presentKeys, true);
    presentShow();
  }

  function presentExit() {
    if (tweenRaf) { cancelAnimationFrame(tweenRaf); tweenRaf = null; }
    presentState.active = false;
    presentState.caption = '';
    presentState.counter = '';
    document.getElementById('app').classList.remove('presenting');
    overlay.hidden = true;
    window.removeEventListener('keydown', presentKeys, true);
    recorder.setOverlay('', '');
  }

  document.getElementById('present-prev').addEventListener('click', () => presentGo(-1));
  document.getElementById('present-next').addEventListener('click', () => presentGo(1));
  document.getElementById('present-exit').addEventListener('click', presentExit);

  // While presenting, an undo/redo or edit can change or remove the current
  // step; re-show so the caption, counter, and camera stay truthful (and don't
  // stay baked into recorded frames).
  store.subscribe(() => {
    if (!presentState.active) return;
    const j = JSON.stringify(store.doc.journey || []);
    if (j !== presentedJourney) presentShow();
  });
}
