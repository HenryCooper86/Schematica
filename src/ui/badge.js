// A part's palette badge: the tinted square with its icon, glyph, or
// initials. Shared by the palette tiles and the part editor's icon grid.
import { CATEGORY_COLORS } from '../palette.js';
import { escAttr } from './press.js';

export function badgeColor(part) {
  return part.accent || CATEGORY_COLORS[part.category] || '#38bdf8';
}

export function badgeHTML(part, color = badgeColor(part)) {
  let inner;
  if (part.glyph) {
    // Glyph markup comes from the catalogue (Lucide icons), never from a file.
    inner = `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"`
      + ` stroke-linejoin="round" style="color:${color}">${part.glyph}</svg>`;
  } else if (part.text) {
    inner = `<b style="color:${color}">${escAttr(part.text)}</b>`;
  } else {
    inner = `<svg viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1.5"`
      + ` stroke-linecap="round" stroke-linejoin="round"><path d="${escAttr(part.icon)}"/></svg>`;
  }
  return `<span class="badge" style="--c:${color}">${inner}</span>`;
}
