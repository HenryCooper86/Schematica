// Palette search: a part matches when every word of the query appears in its
// name, kind, category, port names and buses, or the names and spec notes of
// the vendor presets attached to it — so "RDK" or "Journey" finds the
// generic part.
import { PARTS, CATEGORIES } from './palette.js';
import { BUSES } from './buses.js';
import { presetsFor } from './presets.js';
import { trd } from './i18n.js';

const CATEGORY_NAME = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name]));
const words = (query) => String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);

export function partHaystack(part) {
  const category = CATEGORY_NAME[part.category] || part.category;
  const bits = [
    part.name, trd(part.name), part.kind, category, trd(category),
    ...part.ports.flatMap((p) => [p.name, BUSES[p.bus]?.name, BUSES[p.bus] && trd(BUSES[p.bus].name), BUSES[p.bus]?.short]),
    ...presetsFor(part.kind).flatMap((p) => [p.name, p.sublabel, p.notes, trd(p.notes)]),
  ];
  return bits.filter(Boolean).join(' ').toLowerCase();
}

export function filterParts(query) {
  const ws = words(query);
  const hits = new Set();
  for (const part of Object.values(PARTS)) {
    const hay = partHaystack(part);
    if (ws.every((w) => hay.includes(w))) hits.add(part.kind);
  }
  return hits;
}

// Library templates (custom part definitions with an id) search the same way.
// The list is passed in so this module stays free of storage.
export function templateHaystack(t) {
  const category = CATEGORY_NAME[t.category] || t.category;
  const bits = [
    t.name, category,
    ...(t.ports || []).flatMap((p) => [p.name, BUSES[p.bus]?.name, BUSES[p.bus]?.short, BUSES[p.bus] && trd(BUSES[p.bus].name)]),
    'custom', 'library', trd(category),
  ];
  return bits.filter(Boolean).join(' ').toLowerCase();
}

export function filterTemplates(query, templates) {
  const ws = words(query);
  return templates.filter((t) => {
    const hay = templateHaystack(t);
    return ws.every((w) => hay.includes(w));
  });
}
