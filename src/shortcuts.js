// The one list of keyboard shortcuts. The overlay (src/ui/shortcuts-ui.js)
// renders this and nothing else, the status-bar hint strip is generated from
// the rows marked `hint`, and tests/shortcuts.test.js checks every key named
// here against the keydown comparisons in src/, so they cannot drift.
// Pure: no DOM, no navigator — the platform is passed in.
import { tr } from './i18n.js';

// Tokens a row may carry. A letter is compared lowercase by the handler; the
// named ones are KeyboardEvent.key values, except Mod (Ctrl or Cmd), Shift,
// and Arrows, which stand for a family rather than one key.
export const MOD = 'Mod';

// `desc` is a function so a language switch re-reads it. `hint`, where a row
// has one, is the short label the one-line status-bar strip shows; a row
// without one stays overlay-only, which is what keeps the strip a strip.
export const SHORTCUT_GROUPS = [
  {
    id: 'tools',
    title: () => tr('Tools'),
    rows: [
      { keys: ['V'], desc: () => tr('Select / move'), hint: () => tr('select') },
      { keys: ['C'], desc: () => tr('Draw wire'), hint: () => tr('wire') },
      { keys: ['Z'], desc: () => tr('Draw zone'), hint: () => tr('zone') },
      { keys: ['L'], desc: () => tr('Draw swimlane'), hint: () => tr('lane') },
      { keys: ['N'], desc: () => tr('Add note'), hint: () => tr('note') },
      { keys: ['H'], desc: () => tr('Pan tool'), hint: () => tr('pan') },
    ],
  },
  {
    id: 'selection',
    title: () => tr('Selection'),
    rows: [
      { keys: [MOD, 'A'], desc: () => tr('Select every card, zone, and note') },
      { keys: ['Escape'], desc: () => tr('Clear the selection') },
      { keys: ['Arrows'], desc: () => tr('Nudge the selection by 1px') },
      { keys: ['Shift', 'Arrows'], desc: () => tr('Nudge by a grid step') },
      { keys: [MOD, 'D'], desc: () => tr('Duplicate') },
      { keys: [MOD, 'C'], desc: () => tr('Copy the selection'), hint: () => tr('copy') },
      { keys: [MOD, 'X'], desc: () => tr('Cut the selection'), hint: () => tr('cut') },
      { keys: [MOD, 'V'], desc: () => tr('Paste'), hint: () => tr('paste') },
      { keys: ['K'], desc: () => tr('Lock or unlock the selection'), hint: () => tr('lock') },
      { keys: ['Delete'], desc: () => tr('Delete (locked items are kept)'), hint: () => tr('delete') },
      { keys: ['Backspace'], desc: () => tr('Delete (locked items are kept)') },
    ],
  },
  {
    id: 'view',
    title: () => tr('View'),
    rows: [
      { keys: ['F'], desc: () => tr('Fit the diagram'), hint: () => tr('fit') },
      { keys: ['Space'], desc: () => tr('Hold and drag to pan'), hint: () => tr('+drag pan') },
      { keys: ['/'], desc: () => tr('Explore this board') },
    ],
  },
  {
    id: 'panels',
    title: () => tr('Panels'),
    rows: [
      { keys: ['B'], desc: () => tr('Show or hide the parts palette'), hint: () => tr('palette') },
      { keys: ['P'], desc: () => tr('Show or hide the right panels'), hint: () => tr('panels') },
      { keys: ['A'], desc: () => tr('Show or hide the assistant'), hint: () => tr('assistant') },
      { keys: ['?'], desc: () => tr('This list of shortcuts'), hint: () => tr('all shortcuts') },
    ],
  },
  {
    id: 'editing',
    title: () => tr('Editing'),
    rows: [
      { keys: [MOD, 'Z'], desc: () => tr('Undo') },
      { keys: [MOD, 'Shift', 'Z'], desc: () => tr('Redo') },
      { keys: [MOD, 'Y'], desc: () => tr('Redo') },
      { keys: [MOD, 'S'], desc: () => tr('Save the board to a file') },
      { keys: ['Enter'], desc: () => tr('Commit an inline rename') },
    ],
  },
];

// Two things the strip has always taught that no key performs, so they are
// not shortcut rows: they close the strip as plain text, with no <kbd>.
export const POINTER_HINTS = [
  () => tr('drag ports to link'),
  () => tr('double-click rename'),
];

// Whether to show ⌘ or Ctrl. userAgentData.platform is the modern reading;
// navigator.platform is deprecated but is all older browsers offer, so both
// are accepted and either one saying "mac" is enough.
export function isMacPlatform({ platform = '', userAgentData = null } = {}) {
  const seen = `${userAgentData?.platform ?? ''} ${platform ?? ''}`;
  return /\b(mac|iphone|ipad|ipod)/i.test(seen);
}

// A token as the overlay prints it. Mac keyboards name their keys with signs,
// so Shift becomes ⇧ there and stays a word elsewhere.
export function keyLabel(token, mac) {
  if (token === MOD) return mac ? '⌘' : 'Ctrl';
  if (token === 'Shift') return mac ? '⇧' : 'Shift';
  if (token === 'Arrows') return '← ↑ → ↓';
  if (token === 'Escape') return 'Esc';
  if (token === 'Delete') return mac ? 'Del' : 'Delete';
  return token;
}

// The strip is one line on every platform, so it takes the shortest reading
// of a key that is still unambiguous; the overlay has room for the full word.
export function hintKeyLabel(token, mac) {
  if (token === 'Delete') return 'Del';
  return keyLabel(token, mac);
}
