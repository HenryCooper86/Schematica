// Palette search: a part matches when every word of the query appears in its
// name, kind, category, port names and buses, or the names and spec notes of
// the vendor presets attached to it — so "RDK" or "Journey" finds the
// generic part.
import { PARTS, CATEGORIES } from './palette.js';
import { BUSES } from './buses.js';
import { presetsFor } from './presets.js';

const CATEGORY_NAME = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name]));

export function partHaystack(part) {
  const bits = [
    part.name, part.kind, CATEGORY_NAME[part.category] || part.category,
    ...part.ports.flatMap((p) => [p.name, BUSES[p.bus]?.name, BUSES[p.bus]?.short]),
    ...presetsFor(part.kind).flatMap((p) => [p.name, p.sublabel, p.notes]),
  ];
  return bits.filter(Boolean).join(' ').toLowerCase();
}

export function filterParts(query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const hits = new Set();
  for (const part of Object.values(PARTS)) {
    const hay = partHaystack(part);
    if (words.every((w) => hay.includes(w))) hits.add(part.kind);
  }
  return hits;
}
