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

// Non-blocking notice in the corner of the canvas, in place of alert().
let toastTimer = null;
export function toast(message) {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3600);
}
