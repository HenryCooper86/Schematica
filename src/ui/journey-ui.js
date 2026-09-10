// The journey panel (authored camera steps with captions) and present mode.
import { addStep, updateStep, removeStep, moveStep, tweenView, selectedTargets, resolveStep, addStops, nextStoryPosition, resolveStoryStop, storyRelationshipText, readStoryMoment } from '../journey.js';
import { encodeShare } from '../share.js';
import { createPlayback } from '../playback.js';
import { onPress, escAttr, keepFocus } from './press.js';
import { panelHeader, bindCollapsible } from './collapsible.js';
import { tr, onLanguageChange } from '../i18n.js';

export function initJourney({ svg, store, tools, render, recorder, propsPanel }) {
  const journeyPanel = document.getElementById('journey-panel');
  const overlay = document.getElementById('present-overlay');
  const presentState = { active: false, index: 0, stop: -1, caption: '', counter: '' };
  let tweenRaf = null;
  let presentedJourney = '';
  const playback = createPlayback({
    advance: () => presentGo(1),
    delay: () => document.getElementById('present-speed').value,
    changed: playing => {
      const button = document.getElementById('present-play');
      button.textContent = playing ? tr('Pause') : tr('Play');
      button.setAttribute('aria-pressed', String(playing));
    },
  });

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
      y: (r.height - (presentState.active ? overlay.offsetHeight + 24 : 0)) / 2 - c.cy * c.zoom,
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

  function goToStep(step, stop = -1) {
    const r = svg.getBoundingClientRect();
    const resolved = resolveStoryStop(store.doc, step, stop, { width: r.width, height: r.height - (presentState.active ? overlay.offsetHeight + 24 : 0) });
    tools.ui.story = resolved.ids.size ? resolved.ids : null;
    tools.ui.storyCurrent = step.stops?.[stop]?.node || null;
    render();
    flyToCenter(resolved.view);
  }

  function renderJourney() {
    if (journeyPanel.hidden) return;
    const ae = document.activeElement;
    if (journeyPanel.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
    // The rebuild below replaces every node in the panel, which drops keyboard
    // focus; put it back on the same control afterwards.
    const refocus = keepFocus(journeyPanel);
    const steps = store.doc.journey || [];
    let html = panelHeader(tr('Journey'), 'journey');
    steps.forEach((s, i) => {
      html += `<div class="journey-step" data-step="${escAttr(s.id)}">`
        + `<div class="step-head"><span class="step-num">${i + 1}</span>`
        + `<input type="text" data-jfield="label" value="${escAttr(s.label)}"></div>`
        + `<textarea data-jfield="caption" placeholder="${escAttr(tr('Caption shown while presenting'))}">${escAttr(s.caption)}</textarea>`
        + (s.targets ? `<small>${escAttr(resolveStep(store.doc, s).missing ? tr('Some linked items are missing; the saved view is the fallback.') : tr('Linked to parts and wires'))}</small>` : '')
        + (s.stops || []).map((stop, si) => `<div class="journey-stop" data-stop="${si}"><strong>${si + 1}. ${escAttr(store.doc.nodes.find(n => n.id === stop.node)?.label || tr('Missing part'))}</strong><textarea data-stop-caption placeholder="${escAttr(tr('Stop caption'))}">${escAttr(stop.caption)}</textarea><button data-stop-action="up" aria-label="${escAttr(tr('Move stop up'))}">↑</button><button data-stop-action="down" aria-label="${escAttr(tr('Move stop down'))}">↓</button><button data-stop-action="remove" aria-label="${escAttr(tr('Remove stop'))}">×</button></div>`).join('')
        + '<div class="step-actions">'
        + `<button data-jact="stops"${store.doc.nodes.some(n => store.selection.has(n.id)) ? '' : ' disabled'}>${escAttr(tr('Add selected parts as stops'))}</button>`
        + `<button data-jact="go">${escAttr(tr('Go'))}</button>`
        + `<button data-jact="set" title="${escAttr(tr('Update this step to the current view'))}">${escAttr(tr('Set'))}</button>`
        + `<button data-jact="link"${selectedTargets(store.doc, store.selection) ? '' : ' disabled'}>${escAttr(tr('Link selection'))}</button>`
        + (s.targets ? `<button data-jact="unlink">${escAttr((s.stops?.length ? tr('Use stops for overview') : tr('Camera only')))}</button>` : '')
        + `<button data-jact="up" aria-label="${escAttr(tr('Move step up'))}">&uarr;</button>`
        + `<button data-jact="down" aria-label="${escAttr(tr('Move step down'))}">&darr;</button>`
        + `<button data-jact="del" aria-label="${escAttr(tr('Delete step'))}">&times;</button>`
        + '</div></div>';
    });
    html += '<div class="journey-actions">'
      + `<button id="journey-add">${escAttr(tr('+ Add step from current view'))}</button>`
      + `<button id="journey-present"${steps.length ? '' : ' disabled'}>&#9654; ${escAttr(tr('Present'))}</button>`
      + '</div>';
    journeyPanel.innerHTML = html;
    bindCollapsible(journeyPanel, 'journey');
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
    journeyPanel.querySelectorAll('[data-stop-caption], [data-stop-action]').forEach(el => {
      el.addEventListener(el.tagName === 'TEXTAREA' ? 'change' : 'click', () => {
        const id = el.closest('.journey-step').dataset.step;
        const i = Number(el.closest('.journey-stop').dataset.stop);
        const step = store.doc.journey.find(s => s.id === id);
        const stops = structuredClone(step.stops || []);
        if (!stops[i]) return;
        if (el.tagName === 'TEXTAREA') stops[i].caption = el.value;
        else if (el.dataset.stopAction === 'remove') stops.splice(i, 1);
        else {
          const j = i + (el.dataset.stopAction === 'up' ? -1 : 1);
          if (j < 0 || j >= stops.length) return;
          [stops[i], stops[j]] = [stops[j], stops[i]];
        }
        updateStep(store, id, { stops });
      });
    });
    journeyPanel.querySelectorAll('[data-jact]').forEach((btn) => {
      onPress(btn, () => {
        const id = btn.closest('.journey-step').dataset.step;
        const act = btn.dataset.jact;
        const step = (store.doc.journey || []).find((s) => s.id === id);
        if (!step) return;
        if (act === 'stops') addStops(store, id, store.selection);
        if (act === 'go') goToStep(step);
        if (act === 'link') updateStep(store, id, { targets: selectedTargets(store.doc, store.selection) });
        if (act === 'unlink') { updateStep(store, id, { targets: null }); tools.ui.story = null; render(); }
        if (act === 'set') updateStep(store, id, { view: currentCenter() });
        if (act === 'up') moveStep(store, id, -1);
        if (act === 'down') moveStep(store, id, 1);
        if (act === 'del') removeStep(store, id);
      });
    });
    refocus();
  }

  document.getElementById('btn-journey').addEventListener('click', (e) => {
    journeyPanel.hidden = !journeyPanel.hidden;
    e.currentTarget.classList.toggle('active', !journeyPanel.hidden);
    e.currentTarget.setAttribute('aria-pressed', String(!journeyPanel.hidden));
    renderJourney();
    propsPanel.render();
  });
  store.subscribe(renderJourney);
  svg.addEventListener('pointerdown', () => { if (!presentState.active && tools.ui.story) { tools.ui.story = null; render(); } });
  let generation = store.generation;
  store.subscribe(() => { if (generation !== store.generation) { generation = store.generation; tools.ui.story = null; if (presentState.active) presentExit(); else render(); } });
  onLanguageChange(() => { renderJourney(); if (presentState.active) presentShow(); });

  // ---- Present mode ----
  function presentShow() {
    presentState.showingAll = false;
    document.getElementById('present-copy').disabled = false;
    const steps = store.doc.journey || [];
    if (!steps.length) { presentExit(); return; }
    presentedJourney = JSON.stringify(steps);
    presentState.index = Math.min(presentState.index, steps.length - 1);
    const step = steps[presentState.index];
    presentState.chapterId = step.id;
    presentState.stop = Math.min(presentState.stop, (step.stops?.length || 0) - 1);
    const stop = step.stops?.[presentState.stop];
    presentState.stopId = stop?.id;
    const node = stop && store.doc.nodes.find(n => n.id === stop.node);
    document.getElementById('present-relationship').textContent = stop ? storyRelationshipText(store.doc, step, presentState.stop) : '';
    presentState.caption = stop ? (stop.caption || step.caption || '') : (step.caption || '');
    if (stop && !node) presentState.caption = tr('Missing part') + ': ' + stop.node + '. ' + presentState.caption;
    const stopsRail = document.getElementById('present-stops');
    stopsRail.replaceChildren(...(step.stops || []).map((s, i) => {
      const b = document.createElement('button');
      b.textContent = `${i + 1}. ${store.doc.nodes.find(n => n.id === s.node)?.label || tr('Missing part')}`;
      b.setAttribute('aria-current', String(i === presentState.stop));
      b.onclick = () => { playback.pause(); presentState.stop = i; presentShow(); };
      return b;
    }));
    presentState.counter = `${presentState.index + 1} / ${steps.length}` + (stop ? ` · ${presentState.stop + 1} / ${step.stops.length}` : '');
    document.getElementById('present-caption').textContent = presentState.caption;
    document.getElementById('present-counter').textContent = presentState.counter;
    document.getElementById('present-title').textContent = step.label;
    const rail = document.getElementById('present-chapters');
    rail.replaceChildren(...steps.map((s, i) => {
      const button = document.createElement('button');
      button.textContent = `${i + 1}. ${s.label}`;
      button.setAttribute('aria-current', String(i === presentState.index));
      button.onclick = () => { playback.pause(); presentState.index = i; presentState.stop = -1; presentShow(); };
      return button;
    }));
    for (const nav of [rail, stopsRail]) nav.querySelector('[aria-current="true"]')?.scrollIntoView({block:'nearest', inline:'nearest'});
    document.getElementById('present-prev').disabled = !nextStoryPosition(steps, presentState.index, presentState.stop, -1);
    document.getElementById('present-next').disabled = !nextStoryPosition(steps, presentState.index, presentState.stop, 1);
    goToStep(step, presentState.stop);
    recorder.setOverlay(presentState.caption, presentState.counter);
  }

  function presentGo(delta) {
    const steps = store.doc.journey || [];
    const next = nextStoryPosition(steps, presentState.index, presentState.stop, delta);
    if (!next) return false;
    presentState.index = next.chapter;
    presentState.stop = next.stop;
    presentShow();
    return true;
  }

  function presentKeys(e) {
    if (document.querySelector('dialog[open]')) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (!presentState.active) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); playback.pause(); presentGo(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); playback.pause(); presentGo(-1); }
    else if (e.code === 'Space') { e.stopPropagation(); if (e.target?.tagName !== 'BUTTON') { e.preventDefault(); togglePlay(); } }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); presentExit(); }
    else if (!e.metaKey && !e.ctrlKey) {
      // Tool switches and F (fit) would silently move the presented camera.
      // Modifier shortcuts (undo/redo) stay live — presenting re-syncs to them.
      e.stopPropagation();
    }
  }

  function presentEnter() {
    if (!(store.doc.journey || []).length) return;
    presentState.active = true;
    tools.ui.presenting = true;
    presentState.index = 0;
    presentState.stop = -1;
    document.getElementById('app').classList.add('presenting');
    overlay.hidden = false;
    window.addEventListener('keydown', presentKeys, true);
    presentShow();
  }

  function presentExit() {
    playback.pause();
    if (tweenRaf) { cancelAnimationFrame(tweenRaf); tweenRaf = null; }
    presentState.active = false;
    tools.ui.presenting = false;
    presentState.caption = '';
    presentState.counter = '';
    document.getElementById('app').classList.remove('presenting');
    overlay.hidden = true;
    window.removeEventListener('keydown', presentKeys, true);
    recorder.setOverlay('', '');
    tools.ui.story = null;
    render();
  }

  document.getElementById('present-prev').addEventListener('click', () => { playback.pause(); presentGo(-1); });
  document.getElementById('present-next').addEventListener('click', () => { playback.pause(); presentGo(1); });
  document.getElementById('present-exit').addEventListener('click', presentExit);
  function togglePlay() { if (playback.playing) playback.pause(); else { if (presentState.showingAll) presentShow(); playback.play(); } }
  document.getElementById('present-play').addEventListener('click', togglePlay);
  document.getElementById('present-speed').addEventListener('change', () => playback.reschedule());
  document.getElementById('present-restart').addEventListener('click', () => { playback.pause(); presentState.index = 0; presentState.stop = -1; presentShow(); });
  function showAll() {
    playback.pause();
    goToStep({ view: currentCenter(), targets: { nodes: store.doc.nodes.map(n => n.id), wires: store.doc.wires.map(w => w.id) } });
    tools.ui.story = null; render();
    presentState.showingAll = true;
    document.getElementById('present-title').textContent = store.doc.title;
    for (const id of ['present-caption','present-relationship','present-counter']) document.getElementById(id).textContent = '';
    overlay.querySelectorAll('[aria-current]').forEach(b => b.setAttribute('aria-current', 'false'));
    recorder.setOverlay('', '');
    document.getElementById('present-copy').disabled = true;
  }
  document.getElementById('present-all').addEventListener('click', showAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) playback.pause(); });
  window.addEventListener('resize', () => { if (presentState.active) { playback.pause(); if (presentState.showingAll) showAll(); else presentShow(); } });
  const linkDialog = document.getElementById('story-link-dialog');
  document.getElementById('story-link-close').onclick = () => linkDialog.close();
  document.getElementById('present-copy').addEventListener('click', async () => {
    playback.pause();
    const step = store.doc.journey[presentState.index];
    const stop = step?.stops?.[presentState.stop];
    const snapshot = structuredClone(store.doc);
    const params = new URLSearchParams({ step: step.id, present: '1' });
    if (stop) params.set('stop', stop.id);
    const fragment = await encodeShare(snapshot);
    const url = `${location.origin}${location.pathname}#${fragment}&${params}`;
    const input = document.getElementById('story-link-value');
    input.value = url;
    linkDialog.showModal(); input.focus(); input.select();
    try { await navigator.clipboard.writeText(url); } catch { /* selectable link is the clipboard fallback */ }
  });



  // While presenting, an undo/redo or edit can change or remove the current
  // step; re-show so the caption, counter, and camera stay truthful (and don't
  // stay baked into recorded frames).
  store.subscribe(() => {
    if (!presentState.active) return;
    if (presentState.showingAll) { showAll(); return; }
    const steps = store.doc.journey || [];
    const j = JSON.stringify(steps);
    if (j !== presentedJourney) {
      playback.pause();
      const i = steps.findIndex(s => s.id === presentState.chapterId);
      if (i < 0) { presentExit(); return; }
      presentState.index = i;
      presentState.stop = (steps[i].stops || []).findIndex(s => s.id === presentState.stopId);
    }
    if (store.doc.journey?.[presentState.index]?.targets || store.doc.journey?.[presentState.index]?.stops) { presentShow(); return; }
    if (j !== presentedJourney) presentShow();
  });
  return { openMoment(params) {
    const moment = readStoryMoment(store.doc.journey || [], params);
    if (!moment) return;
    presentEnter();
    presentState.index = moment.chapter; presentState.stop = moment.stop;
    presentShow();
  } };

}
