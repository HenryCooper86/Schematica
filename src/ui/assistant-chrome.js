import { BACKEND } from '../ai/runtime.js';
import { tr } from '../i18n.js';

export const privacy = () => BACKEND
  ? tr('The board\'s text and API key pass through this website\'s server to your chosen provider. The server does not store your key. Remember saves it only in this browser.')
  : tr('The board\'s text and API key are sent to your chosen endpoint, through a relay when configured. Keys are saved in this browser only when you choose Remember.');
export const intro = () => tr('Describe a board and it builds it; ask for a change and it edits the one you have. Every reply is a single undo step.');

// Lucide icons (ISC, see THIRD_PARTY_NOTICES.md), the same stroke family as
// the toolbar. 24-box paths; the size comes from CSS.
const ICONS = {
  sparkles: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
  newThread: '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 8v6"/><path d="M9 11h6"/>',
  settings: '<path d="M14 17H5"/><path d="M19 7h-9"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  send: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  stop: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  show: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/><path d="m16 16-1.9-1.9"/>',
  build: '<rect width="18" height="7" x="3" y="3" rx="1"/><rect width="9" height="7" x="3" y="14" rx="1"/><rect width="5" height="7" x="16" y="14" rx="1"/>',
  fix: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/>',
  fill: '<path d="M14.364 13.634a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506l4.013-4.009a1 1 0 0 0-3.004-3.004z"/><path d="M14.487 7.858A1 1 0 0 1 14 7V2"/><path d="M20 19.645V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l2.516 2.516"/><path d="M8 18h1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  ok: '<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
};
export const icon = (name) => `<svg class="ai-ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

// What the header's dot says about the provider: the probe result when there
// is one, otherwise whether there is anything to call at all.
export const states = () => ({ unset: tr('Set up'), untested: tr('Untested'), ready: tr('Ready'), single: tr('Single-shot') });

export const actionCards = () => [
  { act: 'blueprint', icon: 'build', title: tr('Plan a Blueprint'), desc: tr('Turn an idea into a reusable project plan') },
  { act: 'flow', icon: 'build', title: tr('Build a flow'), desc: tr('Build from the saved Blueprint') },
  { act: 'presentation', icon: 'show', title: tr('Create a presentation'), desc: tr('Chapters and guided stops from this board') },
  { act: 'simplify', icon: 'eye', title: tr('Simplify the diagram'), desc: tr('Improve clarity while preserving meaning') },
  { act: 'review', icon: 'check', title: tr('Review architecture'), desc: tr('Check the board against its project plan') },
  { act: 'build', icon: 'build', title: tr('Build from a brief'), desc: tr('Start a board from a short spec') },
  { act: 'fix', icon: 'fix', title: tr('Fix checks'), desc: tr('Resolve the design-rule findings on this board') },
  { act: 'fill', icon: 'fill', title: tr('Fill in details'), desc: tr('Part numbers, addresses, and rails from the presets') },
];
