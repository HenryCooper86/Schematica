// Consumer-visible regression coverage for the freely movable floating
// panels (Assistant, Security analysis). Drives real CDP mouse, touch and
// keyboard events and asserts deltas, bounds and invariants — never absolute
// pixel positions, stored strings, or header wording — so the checks track
// behavior, not layout or internals.
export async function runPanelMovementChecks({ js, check, send, key, drag, click, center, mouse, sleep, waitFor }) {
  const ASSISTANT = '#assistant';
  const SECURITY = '#security-panel';

  const pos = (sel) => js(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, hidden: el.hidden, fixed: getComputedStyle(el).position };
  })()`);

  // A point on the header that starts a drag: inside the h3 but not on any
  // button or form control, so the drag handle (not the control) receives it.
  const grip = (sel) => js(`(() => {
    const h = document.querySelector(${JSON.stringify(sel)} + ' h3');
    const r = h.getBoundingClientRect();
    const y = Math.round(r.top + r.height / 2);
    for (let x = Math.round(r.left) + 4; x < r.right - 4; x += 2) {
      const el = document.elementFromPoint(x, y);
      if (el && h.contains(el) && !el.closest('button, input, select, textarea, a, label, summary')) return { x, y };
    }
    return null;
  })()`);

  const openPanel = (btn, sel) => js(`(() => { if (document.querySelector(${JSON.stringify(sel)}).hidden) document.getElementById(${JSON.stringify(btn)}).click(); return !document.querySelector(${JSON.stringify(sel)}).hidden; })()`);
  const closePanel = (btn, sel) => js(`(() => { if (!document.querySelector(${JSON.stringify(sel)}).hidden) document.getElementById(${JSON.stringify(btn)}).click(); return document.querySelector(${JSON.stringify(sel)}).hidden; })()`);
  const canvasTransform = () => js(`document.querySelector('#canvas > g').getAttribute('transform')`);
  const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;
  const vp = await js(`({ w: innerWidth, h: innerHeight })`);

  // ---- Baseline: a malformed stored position must not break the panel ----
  // Reload after writing malformed values so readPos runs against them and
  // falls back to the laid-out default rather than throwing or stranding.
  await js(`(() => { localStorage.setItem('schematica.panel.assistant.pos', '{malformed'); localStorage.setItem('schematica.panel.security.pos', '[]'); return true; })()`);
  await send('Page.reload');
  await waitFor(`!!document.getElementById('btn-assistant') && !!document.getElementById('security-panel') && document.querySelectorAll('#palette .palette-item').length > 0`);
  await openPanel('btn-assistant', ASSISTANT);
  await sleep(150);
  const malformed = await js(`(() => {
    const p = document.getElementById('assistant').getBoundingClientRect();
    const h = document.querySelector('#assistant h3').getBoundingClientRect();
    return { fixed: getComputedStyle(document.getElementById('assistant')).position, inViewport: p.left >= 0 && p.right <= innerWidth + 1 && p.top >= 0 && p.bottom <= innerHeight + 1, headerReachable: h.top >= 0 && h.bottom <= innerHeight + 1 && h.left >= 0 && h.left < innerWidth };
  })()`);
  check('a malformed stored position opens the assistant at a reachable default instead of breaking it', malformed.fixed === 'fixed' && malformed.inViewport && malformed.headerReachable, JSON.stringify(malformed));

  // ---- Dragging the header moves the panel over the palette without pan ----
  const start = await pos(ASSISTANT);
  const t0 = await canvasTransform();
  const g0 = await grip(ASSISTANT);
  const paletteRight = await js(`document.getElementById('palette').getBoundingClientRect().right`);
  await drag(g0.x, g0.y, Math.max(20, Math.round(paletteRight - 80)), g0.y - 80);
  await sleep(150);
  const dragged = await pos(ASSISTANT);
  const t1 = await canvasTransform();
  const crossed = await js(`document.getElementById('assistant').getBoundingClientRect().left < document.getElementById('palette').getBoundingClientRect().right`);
  check('the header drags the panel onto the palette without panning the canvas', dragged.fixed === 'fixed' && dragged.left < start.left - 40 && crossed === true && t0 === t1, JSON.stringify({ dx: Math.round(dragged.left - start.left), crossed, pan: t0 !== t1 }));

  // Bring it back to a fully visible spot for the control and keyboard checks.
  const back = await grip(ASSISTANT);
  await drag(back.x, back.y, Math.round(vp.w * 0.6), Math.round(vp.h * 0.4));
  await sleep(150);

  // ---- Header controls act without dragging the panel ----
  // A first open with no configured provider auto-opens the settings sheet,
  // so the gear toggles it rather than always opening it. The invariant is a
  // state change with the panel unmoved, never a specific direction.
  const beforeGear = await pos(ASSISTANT);
  const settingsBefore = await js(`getComputedStyle(document.getElementById('ai-settings')).display !== 'none'`);
  const gear = await center('#ai-gear');
  await click(gear.x, gear.y);
  await sleep(150);
  const afterGear = await pos(ASSISTANT);
  const settingsAfter = await js(`getComputedStyle(document.getElementById('ai-settings')).display !== 'none'`);
  check('a header button press toggles its sheet without moving the panel', settingsAfter !== settingsBefore && near(afterGear.left, beforeGear.left) && near(afterGear.top, beforeGear.top), JSON.stringify({ dx: Math.round(afterGear.left - beforeGear.left), dy: Math.round(afterGear.top - beforeGear.top), settingsBefore, settingsAfter }));
  await js(`document.getElementById('ai-gear').click(); true`);
  await sleep(120);

  // ---- Pointer ownership: a non-primary mouse button must not drag ----
  const beforeRight = await pos(ASSISTANT);
  const rg = await grip(ASSISTANT);
  await mouse('mouseMoved', rg.x, rg.y);
  await mouse('mousePressed', rg.x, rg.y, { button: 'right', buttons: 2, clickCount: 1 });
  await mouse('mouseMoved', rg.x + 90, rg.y + 40, { button: 'right', buttons: 2 });
  await mouse('mouseReleased', rg.x + 90, rg.y + 40, { button: 'right', clickCount: 1 });
  await sleep(80);
  const afterRight = await pos(ASSISTANT);
  check('a non-primary mouse button on the header does not drag the panel', near(afterRight.left, beforeRight.left) && near(afterRight.top, beforeRight.top), JSON.stringify({ dx: Math.round(afterRight.left - beforeRight.left), dy: Math.round(afterRight.top - beforeRight.top) }));

  // ---- Pointer ownership: a primary touch drag moves the panel too ----
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const tt = await grip(ASSISTANT);
  const beforeTouch = await pos(ASSISTANT);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tt.x, y: tt.y, id: 0, radiusX: 2, radiusY: 2, force: 1 }] });
  for (let i = 1; i <= 5; i++) {
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tt.x + i * 24, y: tt.y + i * 12, id: 0, radiusX: 2, radiusY: 2, force: 1 }] });
    await sleep(30);
  }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await sleep(150);
  const afterTouch = await pos(ASSISTANT);
  check('a primary touch drag moves the panel like a mouse drag', afterTouch.left > beforeTouch.left + 40 && afterTouch.top > beforeTouch.top + 20, JSON.stringify({ dx: Math.round(afterTouch.left - beforeTouch.left), dy: Math.round(afterTouch.top - beforeTouch.top) }));

  // ---- Position survives close and reopen ----
  const placed = await pos(ASSISTANT);
  const closeBtn = await center('#ai-close');
  await click(closeBtn.x, closeBtn.y);
  await sleep(150);
  const closed = await js(`document.getElementById('assistant').hidden`);
  await openPanel('btn-assistant', ASSISTANT);
  await sleep(150);
  const reopened = await pos(ASSISTANT);
  check('the close button hides the panel without moving it, and reopening restores the position', closed === true && near(reopened.left, placed.left) && near(reopened.top, placed.top), JSON.stringify({ placed: { left: Math.round(placed.left), top: Math.round(placed.top) }, reopened: { left: Math.round(reopened.left), top: Math.round(reopened.top) } }));

  // ---- Keyboard nudging: header arrows move, child-button arrows do not ----
  await js(`document.querySelector('#assistant h3').focus(); true`);
  const kb0 = await pos(ASSISTANT);
  await key('ArrowRight', 'ArrowRight', 39);
  await sleep(60);
  const kbRight = await pos(ASSISTANT);
  await key('ArrowDown', 'ArrowDown', 40);
  await sleep(60);
  const kbDown = await pos(ASSISTANT);
  check('arrow keys nudge the focused header by a step', near(kbRight.left - kb0.left, 12) && near(kbDown.top - kbRight.top, 12), JSON.stringify({ dx: Math.round(kbRight.left - kb0.left), dy: Math.round(kbDown.top - kbRight.top) }));

  const beforeChild = await pos(ASSISTANT);
  await js(`document.querySelector('#assistant #ai-gear').focus(); true`);
  await key('ArrowRight', 'ArrowRight', 39);
  await key('ArrowLeft', 'ArrowLeft', 37);
  await sleep(60);
  const afterChild = await pos(ASSISTANT);
  check('arrow keys on a header child button do not move the panel', near(afterChild.left, beforeChild.left) && near(afterChild.top, beforeChild.top), JSON.stringify({ dx: Math.round(afterChild.left - beforeChild.left), dy: Math.round(afterChild.top - beforeChild.top) }));

  // ---- Position survives a language rebuild of the panel chrome ----
  await js(`window.__panelH3 = document.querySelector('#assistant h3'); true`);
  const preLang = await pos(ASSISTANT);
  await js(`(async () => { const { setLang } = await import('/src/i18n.js'); setLang('zh'); })()`);
  await sleep(250);
  const postLang = await pos(ASSISTANT);
  const rebuilt = await js(`document.querySelector('#assistant h3') !== window.__panelH3`);
  check('the assistant keeps its position when a language switch rebuilds its chrome', rebuilt === true && near(postLang.left, preLang.left) && near(postLang.top, preLang.top), JSON.stringify({ rebuilt, dx: Math.round(postLang.left - preLang.left), dy: Math.round(postLang.top - preLang.top) }));
  await js(`(async () => { const { setLang } = await import('/src/i18n.js'); setLang('en'); })()`);
  await sleep(250);

  // ---- Escape mid-gesture cancels the drag; reopening still drags ----
  await openPanel('btn-security', SECURITY);
  await sleep(200);
  const sg = await grip(SECURITY);
  await mouse('mouseMoved', sg.x, sg.y);
  await mouse('mousePressed', sg.x, sg.y, { button: 'left', buttons: 1, clickCount: 1 });
  await sleep(30);
  for (let i = 1; i <= 3; i++) {
    await mouse('mouseMoved', sg.x + i * 30, sg.y + i * 20, { button: 'left', buttons: 1 });
    await sleep(20);
  }
  const midDrag = await js(`document.querySelector('#security-panel h3').classList.contains('dragging')`);
  await key('Escape', 'Escape', 27);
  await sleep(150);
  await mouse('mouseReleased', sg.x + 90, sg.y + 60, { button: 'left', clickCount: 1 });
  await sleep(100);
  const cancelled = await js(`(() => ({ hidden: document.getElementById('security-panel').hidden, dragging: document.querySelector('#security-panel h3').classList.contains('dragging') }))()`);
  await openPanel('btn-security', SECURITY);
  await sleep(200);
  const re0 = await pos(SECURITY);
  const rg2 = await grip(SECURITY);
  await drag(rg2.x, rg2.y, rg2.x + 140, rg2.y + 60);
  await sleep(150);
  const re1 = await pos(SECURITY);
  check('Escape mid-drag closes the panel and cancels the gesture, and a reopened panel still drags', midDrag === true && cancelled.hidden === true && cancelled.dragging === false && re1.left > re0.left + 60, JSON.stringify({ midDrag, cancelled, redrag: Math.round(re1.left - re0.left) }));
  await closePanel('btn-security', SECURITY);

  // ---- Collapsing an edge-clamped panel keeps its header reachable ----
  await openPanel('btn-assistant', ASSISTANT);
  await sleep(150);
  const edgeGrip = await grip(ASSISTANT);
  await drag(edgeGrip.x, edgeGrip.y, -800, edgeGrip.y); // far past the left clamp
  await sleep(150);
  const preCollapse = await pos(ASSISTANT);
  await js(`document.querySelector('#assistant .panel-toggle').click(); true`);
  await sleep(250);
  const collapsed = await js(`(() => { const p = document.getElementById('assistant'); const r = p.getBoundingClientRect(); return { collapsed: p.classList.contains('collapsed'), left: r.left, right: r.right, width: r.width }; })()`);
  const collapsedGrip = await grip(ASSISTANT);
  check('collapsing an edge-clamped panel re-clamps so its header stays reachable', collapsed.collapsed === true && preCollapse.left < -150 && collapsedGrip !== null, JSON.stringify({ preLeft: Math.round(preCollapse.left), collapsed, grip: collapsedGrip }));
  await js(`document.querySelector('#assistant .panel-toggle').click(); true`);
  await sleep(250);
  const expanded = await js(`(() => { const p = document.getElementById('assistant'); const r = p.getBoundingClientRect(); return { collapsed: p.classList.contains('collapsed'), left: r.left, right: r.right, width: r.width }; })()`);
  const expandedGrip = await grip(ASSISTANT);
  check('expanding it again keeps the header reachable', expanded.collapsed === false && expandedGrip !== null, JSON.stringify({ expanded, grip: expandedGrip }));

  // ---- Resizing the window keeps the header reachable ----
  const cornerGrip = await grip(ASSISTANT);
  await drag(cornerGrip.x, cornerGrip.y, vp.w + 400, vp.h + 400);
  await sleep(150);
  await send('Emulation.setDeviceMetricsOverride', { width: 500, height: 400, deviceScaleFactor: 1, mobile: false });
  await sleep(250);
  const afterResize = await js(`(() => {
    const h = document.querySelector('#assistant h3').getBoundingClientRect();
    return { left: h.left, top: h.top, bottom: h.bottom, vw: innerWidth, vh: innerHeight };
  })()`);
  check('shrinking the viewport pulls the panel back so its header stays reachable', afterResize.left >= -1 && afterResize.left <= afterResize.vw - 1 && afterResize.top >= -1 && afterResize.top <= afterResize.vh - 1, JSON.stringify(afterResize));
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(250);

  // ---- Storage blocked: the panel still moves and keeps its spot this session ----
  await js(`(() => { window.__panelSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error('storage blocked'); }; return true; })()`);
  const blocked0 = await pos(ASSISTANT);
  const bg = await grip(ASSISTANT);
  await drag(bg.x, bg.y, bg.x - 150, bg.y - 50);
  await sleep(150);
  const blocked1 = await pos(ASSISTANT);
  await closePanel('btn-assistant', ASSISTANT);
  await openPanel('btn-assistant', ASSISTANT);
  await sleep(150);
  const blocked2 = await pos(ASSISTANT);
  await js(`Storage.prototype.setItem = window.__panelSetItem; delete window.__panelSetItem; true`);
  check('a blocked storage still lets the panel move and keep its position for the session', blocked1.left < blocked0.left - 60 && near(blocked2.left, blocked1.left) && near(blocked2.top, blocked1.top), JSON.stringify({ dx: Math.round(blocked1.left - blocked0.left) }));

  // Leave the app as found: panels closed, English, default viewport.
  await closePanel('btn-assistant', ASSISTANT);
  await closePanel('btn-security', SECURITY);
  await js(`(async () => { const { setLang } = await import('/src/i18n.js'); setLang('en'); })()`);
}
