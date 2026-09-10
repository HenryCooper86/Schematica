// The keyboard shortcut overlay: a modal <dialog>, so Escape, focus trapping,
// and focus restore come from the browser. Everything it shows is read from
// src/shortcuts.js, which is the only place a shortcut is written down — and
// so is the status-bar hint strip below the canvas, which used to be markup in
// index.html maintained by hand and had fallen behind the table.
import { SHORTCUT_GROUPS, POINTER_HINTS, isMacPlatform, keyLabel, hintKeyLabel } from '../shortcuts.js';
import { escAttr, openModal } from './press.js';
import { onLanguageChange } from '../i18n.js';

function groupMarkup(group, mac) {
  const rows = group.rows.map((row) => (
    `<div class="sc-row"><div class="sc-keys">${row.keys.map((k) => (
      `<kbd>${escAttr(keyLabel(k, mac))}</kbd>`
    )).join('')}</div><span>${escAttr(row.desc())}</span></div>`
  )).join('');
  return `<section class="sc-group"><h4>${escAttr(group.title())}</h4>${rows}</section>`;
}

// The status-bar strip: the rows marked `hint`, in table order, then the two
// pointer hints. Built from the same table as the overlay so a shortcut can
// no longer be added, renamed, or dropped without the strip following.
export function hintStripMarkup(mac) {
  const keyed = SHORTCUT_GROUPS.flatMap((g) => g.rows).filter((row) => row.hint).map((row) => (
    `${row.keys.map((k) => `<kbd>${escAttr(hintKeyLabel(k, mac))}</kbd>`).join('')} <span>${escAttr(row.hint())}</span>`
  ));
  const pointer = POINTER_HINTS.map((text) => `<span>${escAttr(text())}</span>`);
  return [...keyed, ...pointer].join(' &middot; ');
}

export function initShortcuts({ platform = typeof navigator === 'undefined' ? {} : navigator } = {}) {
  const dialog = document.getElementById('shortcuts-dialog');
  const list = document.getElementById('shortcuts-list');
  const hintbar = document.getElementById('hintbar');
  const mac = isMacPlatform(platform);

  function fill() {
    list.innerHTML = SHORTCUT_GROUPS.map((g) => groupMarkup(g, mac)).join('');
  }

  function fillHints() {
    if (hintbar) hintbar.innerHTML = hintStripMarkup(mac);
  }

  function open() {
    fill();
    openModal(dialog);
  }

  document.getElementById('btn-shortcuts').addEventListener('click', open);
  document.getElementById('shortcuts-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('pointerdown', (e) => { if (e.target === dialog) dialog.close(); });

  document.addEventListener('keydown', (e) => {
    // Shift-/ on most layouts, so the modifier flags are not checked beyond
    // ruling out Ctrl/Cmd/Alt. A field being typed in, or any dialog already
    // open (this one included), keeps the key.
    if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    if (e.target.closest('input, textarea, select, [contenteditable="true"]')
      || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    open();
  });

  // The dialog's own markup was in index.html at load, so the static walker
  // translated its heading; the list is built here and re-read on a switch.
  // The strip is built here too, so it opts out of the walker (data-i18n="off"
  // in index.html) and redraws itself instead.
  onLanguageChange(() => { if (dialog.open) fill(); fillHints(); });

  fillHints();
  return { open };
}
