// Shared helpers for the floating panels.

// Panel buttons act on pointerdown. A plain click handler loses the first
// click after editing a field: the blur commits, the store emits, and the
// panel rebuild replaces the button between mousedown and mouseup, so the
// click never lands. Pointerdown fires before the blur; any pending edit is
// committed explicitly first so ordering matches the old click path. The
// click listener stays for keyboard activation, suppressed after a pointer
// press so the same activation can't fire twice.
export function onPress(btn, fn) {
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const ae = document.activeElement;
    if (ae && ae !== btn && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) ae.blur();
    btn._pointerFired = true;
    window.addEventListener('pointerup', () => {
      setTimeout(() => { btn._pointerFired = false; }, 0);
    }, { once: true });
    fn(e);
  });
  btn.addEventListener('click', (e) => {
    if (!btn._pointerFired) fn(e);
  });
}

export function escAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// A selector that finds the same control again after its panel is rebuilt
// through innerHTML: each element from the panel down to the control that
// carries an id or a data-* attribute contributes one step, so a per-step
// button reads `[data-step="s1"] [data-jact="up"]`. Null when nothing on the
// way identifies the control. Pure, so it can be tested without a DOM.
export function focusSelector(el, root) {
  const dataAttr = (node) => [...(node.attributes || [])].find((a) => a.name.startsWith('data-'));
  if (!el || !(el.id || dataAttr(el))) return null;
  const steps = [];
  for (let node = el; node && node !== root; node = node.parentElement) {
    const data = node.id ? null : dataAttr(node);
    if (node.id) steps.unshift(`#${cssIdent(node.id)}`);
    else if (data) steps.unshift(`[${data.name}="${String(data.value).replace(/["\\]/g, '\\$&')}"]`);
  }
  return steps.join(' ');
}
const cssIdent = (s) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&'));

// Rebuilding a panel through innerHTML drops keyboard focus. Call before the
// rebuild; the function it returns puts focus (and a text caret) back on the
// control that matches the remembered selector, when the fresh markup has it.
export function keepFocus(panel) {
  const ae = document.activeElement;
  if (!ae || !panel.contains(ae)) return () => {};
  const sel = focusSelector(ae, panel);
  if (!sel) return () => {};
  const { selectionStart, selectionEnd } = ae;
  return () => {
    const next = panel.querySelector(sel);
    if (!next || next === document.activeElement) return;
    next.focus({ preventScroll: true });
    if (typeof selectionStart === 'number' && typeof next.setSelectionRange === 'function') {
      try { next.setSelectionRange(selectionStart, selectionEnd); } catch { /* not a text control */ }
    }
  };
}

// Non-blocking notice in the corner of the canvas, in place of alert(). An
// optional action ({ label, run }) adds a button and keeps the toast up
// longer, in place of confirm(): the default happens at once and the button
// is the way back.
let toastTimer = null;
export function toast(message, { action = null } = {}) {
  const t = document.getElementById('toast');
  t.textContent = message;
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      clearTimeout(toastTimer);
      t.hidden = true;
      action.run();
    });
    t.append(btn);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 9000 : 3600);
}

// showModal() throws on a dialog that is already open.
export function openModal(dialog) {
  if (!dialog.open) dialog.showModal();
}
