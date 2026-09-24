import { rectsIntersect, nodeRect, NOTE_W, noteHeight, zoneMembers } from './geometry.js';
import { findItem, isLocked } from './state.js';

// A moving selection includes unlocked items carried by its selected zones.
export function movableSelection(doc, selection) {
  const orig = new Map();
  const carried = new Set();
  for (const id of selection) {
    const found = findItem(doc, id);
    if (found && found.type !== 'wire' && !isLocked(found.item)) {
      orig.set(id, { x: found.item.x, y: found.item.y });
    }
  }
  for (const id of [...orig.keys()]) {
    const found = findItem(doc, id);
    if (found?.type !== 'zone') continue;
    for (const mid of zoneMembers(doc, found.item)) {
      if (orig.has(mid)) continue;
      const member = findItem(doc, mid);
      if (!member || isLocked(member.item)) continue;
      orig.set(mid, { x: member.item.x, y: member.item.y });
      carried.add(mid);
    }
  }
  return { orig, carried };
}

export function selectionRects(doc, selection) {
  const rects = [];
  for (const id of selection) {
    const found = findItem(doc, id);
    if (!found || found.type === 'wire') continue;
    const item = found.item;
    const box = found.type === 'node' ? nodeRect(item)
      : found.type === 'note' ? { x: item.x, y: item.y, w: NOTE_W, h: noteHeight(item.text) }
        : { x: item.x, y: item.y, w: item.w, h: item.h };
    rects.push({ id, ...box, locked: isLocked(item) });
  }
  return rects;
}

// Call inside one store.apply, so positions and zone passengers share an undo step.
export function applyMoves(doc, moves, own) {
  const rides = new Map();
  for (const move of moves) {
    const found = findItem(doc, move.id);
    if (found?.type !== 'zone') continue;
    for (const id of zoneMembers(doc, found.item)) {
      if (own.has(id) || rides.has(id)) continue;
      const passenger = findItem(doc, id);
      if (passenger && !isLocked(passenger.item)) {
        rides.set(id, { item: passenger.item, dx: move.x - found.item.x, dy: move.y - found.item.y });
      }
    }
  }
  for (const move of moves) {
    const found = findItem(doc, move.id);
    if (found) Object.assign(found.item, { x: move.x, y: move.y });
  }
  for (const ride of rides.values()) {
    ride.item.x += ride.dx;
    ride.item.y += ride.dy;
  }
}

export function hitMarquee(doc, marquee) {
  const ids = [];
  for (const node of doc.nodes) if (rectsIntersect(marquee, nodeRect(node))) ids.push(node.id);
  for (const note of doc.notes) {
    if (rectsIntersect(marquee, { x: note.x, y: note.y, w: NOTE_W, h: noteHeight(note.text) })) ids.push(note.id);
  }
  for (const zone of doc.zones) {
    const inside = zone.x >= marquee.x && zone.y >= marquee.y
      && zone.x + zone.w <= marquee.x + marquee.w && zone.y + zone.h <= marquee.y + marquee.h;
    if (inside) ids.push(zone.id);
  }
  return ids;
}
