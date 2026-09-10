// Read-only board exploration. Endpoint order is not signal direction: hardware
// buses are traversed as undirected connections, only over actual drawn wires.
import { partOf } from './custom.js';
import { CATEGORIES } from './palette.js';
import { BUSES } from './buses.js';
import { trd } from './i18n.js';

// A part carries the category id; the dictionary knows the display name.
const CATEGORY_NAME = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name]));

// Everything a board search can match on one node, in the current language.
// The offline HTML export embeds this text per node, so a search in the
// downloaded file finds the same parts as the search in the app.
export function nodeHaystack(node) {
  const part = partOf(node);
  const category = CATEGORY_NAME[part.category] || part.category;
  return [node.id, node.label, node.sublabel, node.addr, node.rail, node.notes,
    node.kind, part.name, trd(part.name), part.category, category, trd(category),
    ...Object.values(node.fields || {}),
    ...part.ports.flatMap((p) => [p.name, p.bus, BUSES[p.bus]?.name, trd(BUSES[p.bus]?.name)]),
  ].filter(Boolean).join(' ').toLowerCase();
}

export function searchBoard(doc, query) {
  const words = String(query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return doc.nodes.filter((node) => {
    const hay = nodeHaystack(node);
    return words.every((word) => hay.includes(word));
  });
}

export function connectionFocus(doc, { bus = '', connections = 'all' } = {}, selection = new Set()) {
  const ids = new Set(doc.nodes.map((n) => n.id));
  const seeds = new Set([...selection].filter((id) => ids.has(id)));
  const tracing = connections !== 'all' && seeds.size > 0;
  const active = !!bus || tracing;
  const eligible = doc.wires.filter((w) => (!bus || w.bus === bus)
    && ids.has(w.from.node) && ids.has(w.to.node));
  const nodes = new Set(tracing ? seeds : []);
  const wires = new Set();
  if (!active) return { active, nodes: ids, wires: new Set(doc.wires.map((w) => w.id)), tracing };
  if (!tracing || connections === 'neighbors') {
    for (const wire of eligible) {
      if (tracing && !seeds.has(wire.from.node) && !seeds.has(wire.to.node)) continue;
      wires.add(wire.id);
      nodes.add(wire.from.node);
      nodes.add(wire.to.node);
    }
  } else {
    const adjacency = new Map([...ids].map((id) => [id, []]));
    for (const wire of eligible) {
      adjacency.get(wire.from.node).push(wire);
      adjacency.get(wire.to.node).push(wire);
    }
    const queue = [...seeds];
    for (let i = 0; i < queue.length; i++) {
      for (const wire of adjacency.get(queue[i])) {
        wires.add(wire.id);
        for (const id of [wire.from.node, wire.to.node]) {
          if (!nodes.has(id)) { nodes.add(id); queue.push(id); }
        }
      }
    }
  }
  return { active, nodes, wires, tracing };
}

export function readingDepth(mode = 'full', zoom = 1) {
  if (mode !== 'auto') return ['overview', 'normal', 'full'].includes(mode) ? mode : 'full';
  return zoom < 0.65 ? 'overview' : zoom < 1.25 ? 'normal' : 'full';
}
