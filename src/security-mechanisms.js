// Static source explanations use the same editable parts, wires, notes and
// presentation chapters as the rest of the board. The model supplies semantic
// panels, never executable drawing code or coordinates.
import { validateSecurityAnalysis, SECURITY_ANALYSIS_SCHEMA, SECURITY_EXPLANATION_PLACEMENTS } from './security-analysis.js';
import { applyEdits } from './ai/ops.js';
import { nodeRect, contentBounds, NOTE_W, noteHeight, snap, textUnits } from './geometry.js';
import { resolveStep } from './journey.js';
import { uid } from './state.js';
import { MAX_COORD } from './serialize.js';
import { securityAssetCard } from './security-assets.js';

const ROLES = {
  input: { icon: 'IN', color: '#38bdf8' }, storage: { icon: '[]', color: '#818cf8' },
  pointer: { icon: '->', color: '#c084fc' }, operation: { icon: 'fn', color: '#22d3ee' },
  guard: { icon: '?', color: '#34d399' }, invalid: { icon: '!', color: '#f87171' },
  result: { icon: '=', color: '#fbbf24' }, neutral: { icon: '..', color: '#94a3b8' },
};
const KINDS = { memory: 'Memory / object layout', structure: 'Data / payload structure',
  sequence: 'Interaction sequence', state: 'Object / program states', comparison: 'Before / after comparison',
  attack: 'Illustrated attack scene', parallel: 'Parallel target scenarios' };
const SIDES = ['n', 'e', 's', 'w'];
const SIDE_NAMES = { n: 'top', e: 'right', s: 'bottom', w: 'left' };
const PAD = 28, GAP = 72;
const BASIS_STYLE = { source: null, inference: 'dashed', unknown: 'dotted' };

function referenced(analysis, ids) {
  return ids.map(id => analysis.findings.find(finding => finding.id === id));
}
function basisOf(findings) {
  return findings.some(f => f.basis === 'unknown') ? 'unknown'
    : findings.some(f => f.basis === 'inference') ? 'inference' : 'source';
}
function evidenceText(analysis, findings) {
  return [...new Set(findings.flatMap(f => f.evidence.map(ref => {
    const name = analysis.sources.find(s => s.id === ref.sourceId).name;
    return `${name}: ${ref.startLine}-${ref.endLine}`;
  })))].join('; ');
}
function explanationRefs(explanation) {
  return [...new Set([...explanation.panels.flatMap(panel => panel.items.flatMap(item => item.findingIds)),
    ...explanation.links.flatMap(link => link.findingIds)])];
}

const PLACEMENT_ORDER = SECURITY_EXPLANATION_PLACEMENTS;
const isFigureScene = scene => scene.kind === 'attack' || scene.kind === 'parallel';
const summaryText = (scene, basis) => `${scene.title} [${basis}]\n${KINDS[scene.kind]}\n${scene.detail}\nStatic source reading; not executed. Schematic, not an observed runtime or an ABI/byte-accurate layout.\n[source] cited · [inference] inferred · [unknown] unassessed`;

// Composition hints organize a picture; only cited links assert a relation.
// Disjoint target panels remain compatible with native Arrange and selection.
function placeFigureScene(scene, panels, nodeFor, x, y, basis) {
  const parallel = scene.kind === 'parallel';
  const ordered = panels.slice().sort((a, b) => PLACEMENT_ORDER.indexOf(a.panel.placement) - PLACEMENT_ORDER.indexOf(b.panel.placement));
  const dimensions = new Map(panels.flatMap(panel => panel.items.map(({ ref, item }) => [item.id, nodeRect(nodeFor(ref))])));
  const rowIds = parallel ? [...new Set(panels.flatMap(({ items }) => items
    .filter(({ item }) => item.row !== undefined).map(({ item }) => item.row)))].sort((a, b) => a - b) : [];
  const rowHeights = new Map(rowIds.map(row => [row, Math.max(0, ...panels.flatMap(({ panel, items }) =>
    items.filter(({ item }) => item.row === row && (panel.placement !== 'actor' || item.row !== undefined))
      .map(({ item }) => dimensions.get(item.id).h)))]));
  const rowOffsets = new Map();
  let totalRows = 0;
  for (const row of rowIds) { rowOffsets.set(row, totalRows); totalRows += rowHeights.get(row) + 80; }
  totalRows = Math.max(0, totalRows - 80);
  const blocks = ordered.map(({ panel, items }) => {
    const groups = parallel ? [...new Set(items.map(({ item }) => item.row))].map(row => ({
      row, items: items.filter(({ item }) => item.row === row),
    })) : Array.from({ length: Math.ceil(items.length / (panel.placement === 'target' ? 2 : 1)) }, (_, index) => ({
      items: items.slice(index * (panel.placement === 'target' ? 2 : 1), (index + 1) * (panel.placement === 'target' ? 2 : 1)),
    }));
    const rows = groups.map(group => ({ ...group,
      w: group.items.reduce((sum, { item }) => sum + dimensions.get(item.id).w, 0) + Math.max(0, group.items.length - 1) * 48,
      h: Math.max(...group.items.map(({ item }) => dimensions.get(item.id).h)),
    }));
    const shared = parallel && panel.placement === 'actor' ? rows.filter(row => row.row === undefined) : [];
    const assigned = parallel && panel.placement === 'actor' ? rows.filter(row => row.row !== undefined) : [];
    const sharedWidth = Math.max(0, ...shared.map(row => row.w));
    const assignedWidth = Math.max(0, ...assigned.map(row => row.w));
    const splitActors = shared.length > 0 && assigned.length > 0;
    const width = splitActors ? sharedWidth + 48 + assignedWidth
      : Math.max(...rows.map(row => row.w), ['target', 'outcome'].includes(panel.placement) ? textUnits(`${panel.title} · schematic`) * 6.2 + 42 : 0);
    return { panel, rows, w: width + PAD * 2, splitActors, sharedWidth, assignedWidth,
      h: parallel ? Math.max(totalRows, ...shared.map(row => row.h))
        : rows.reduce((sum, row) => sum + row.h, 0) + Math.max(0, rows.length - 1) * 64 };
  });
  const height = Math.max(totalRows, ...blocks.map(block => block.h));
  const bandTop = y + 48 + (height - totalRows) / 2;
  const zones = [];
  for (const block of blocks) {
    let localY = y + 48 + (height - block.h) / 2;
    for (const row of block.rows) {
      const aligned = parallel && row.row !== undefined;
      const rowY = aligned ? bandTop + rowOffsets.get(row.row)
        : parallel ? y + 48 + (height - row.h) / 2 : localY;
      const rowHeight = aligned ? rowHeights.get(row.row) : row.h;
      const regionWidth = block.splitActors ? (aligned ? block.assignedWidth : block.sharedWidth) : block.w - PAD * 2;
      let itemX = x + PAD + (block.splitActors && aligned ? block.sharedWidth + 48 : 0) + (regionWidth - row.w) / 2;
      for (const { ref, item } of row.items) {
        const node = nodeFor(ref), size = dimensions.get(item.id);
        node.x = snap(itemX);
        node.y = snap(rowY + (rowHeight - size.h) / 2);
        itemX += size.w + 48;
      }
      localY += row.h + 64;
    }
    if (['target', 'outcome'].includes(block.panel.placement)) {
      zones.push({ id: uid('z'), x, y, w: block.w, h: height + 48 + PAD,
        label: `${block.panel.title} · schematic`, color: block.panel.placement === 'outcome' ? '#f87171' : '#818cf8' });
    }
    x = snap(x + block.w + GAP);
  }
  const note = { id: uid('t'), x: blocks.length ? nodeFor(ordered[0].items[0].ref).x : x,
    y: snap(y + height + 48 + PAD + 48),
    text: `${scene.title} [${basis}]\nStatic source reading; not executed.\nSchematic scenario, not a verified deployment or outcome.\nFull explanation and citations: Security analysis and scene walkthrough.\n[source] cited · [inference] inferred · [unknown] unassessed` };
  return { zones, note, bottom: note.y + noteHeight(note.text) };
}

function orientFigureWires(work, bindings, refToId, nodesById) {
  const wanted = new Set(bindings.filter(binding => isFigureScene(binding.scene)).map(binding => refToId.get(binding.ref)));
  const lanes = new Map();
  const opposites = { n: 's', e: 'w', s: 'n', w: 'e' };
  for (const wire of work.wires) {
    if (!wanted.has(wire.id)) continue;
    const pair = [wire.from.node, wire.to.node].sort(), key = pair.join('\u0000');
    const a = nodeRect(nodesById.get(pair[0])), b = nodeRect(nodesById.get(pair[1]));
    const dx = b.x + b.w / 2 - a.x - a.w / 2, dy = b.y + b.h / 2 - a.y - a.h / 2;
    const facing = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? ['e', 's', 'n', 'w'] : ['w', 'n', 's', 'e'])
      : (dy >= 0 ? ['s', 'e', 'w', 'n'] : ['n', 'w', 'e', 's']);
    const lane = lanes.get(key) ?? 0;
    lanes.set(key, lane + 1);
    const lo = facing[lane % 4], hi = opposites[facing[Math.floor(lane / 4)]];
    wire.from.port = wire.from.node === pair[0] ? lo : hi;
    wire.to.port = wire.to.node === pair[1] ? hi : lo;
  }
}

export function buildSecurityMechanisms(doc, analysis, { walkthrough = true } = {}) {
  const valid = validateSecurityAnalysis(analysis);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw Error('A board document is required.');
  if (!valid.explanations?.length) throw Error('No mechanism explanations were recorded. Reanalyze the retained sources to create illustrated attack scenes, parallel target rows, or memory, structure, sequence, state and comparison panels.');
  const prior = valid.illustrations ?? [];
  if (prior.length >= SECURITY_ANALYSIS_SCHEMA.properties.illustrations.maxItems) throw Error('The illustration record limit is reached. Remove superseded illustrations and reanalyze before building more.');
  // All work, including layout and final contract validation, stays off-board.
  const work = structuredClone(doc);
  for (const key of ['nodes', 'wires', 'zones', 'notes', 'journey']) work[key] ??= [];
  if (walkthrough && work.journey.length + valid.explanations.length > 50) throw Error('The mechanism scenes would exceed 50 presentation chapters. Remove chapters or build without a walkthrough.');
  const occupied = new Set([...work.nodes, ...work.wires, ...work.zones, ...work.notes].map(item => item.id));
  let serial = 0;
  const nextRef = () => {
    let ref;
    do { ref = `mechanism${serial++}`; } while (occupied.has(ref));
    occupied.add(ref);
    return ref;
  };
  const ops = [], scenes = [], bindings = [], itemBindings = [], wireBindings = [];
  const bind = (ref, findingIds) => bindings.push({ ref, findingIds });
  for (const scene of valid.explanations) {
    const panels = [], refs = new Map();
    for (const panel of scene.panels) {
      const items = [];
      for (const item of panel.items) {
        const ref = nextRef(), findings = referenced(valid, item.findingIds);
        const basis = basisOf(findings), role = ROLES[item.role];
        const supportedAsset = basis !== 'unknown' && item.assetKind
          && findings.some(finding => finding.assetKind === item.assetKind && finding.basis !== 'unknown');
        const asset = supportedAsset ? securityAssetCard({ kind: 'component', basis, assetKind: item.assetKind }, { visibleValue: true }) : null;
        ops.push({ op: 'add_part', ref, kind: asset?.kind ?? 'custom',
          label: `${item.label} [${basis}]`, sublabel: item.value,
          notes: `${scene.title} / ${panel.title}\n${item.value}\nStatic reading; not executed. [${basis}]\n`
            + findings.map(f => `${f.title} [${f.basis}]: ${f.detail}`).join('\n').slice(0, 12000)
            + `\nEvidence: ${evidenceText(valid, findings)}`,
          ...(asset && !asset.custom ? {} : { custom: asset?.custom ?? {
            name: item.role, category: 'misc', accent: role.color, icon: { text: role.icon },
            ports: SIDES.map(id => ({ id, name: 'LINK', side: SIDE_NAMES[id], bus: 'link' })),
          } }),
        });
        refs.set(item.id, ref);
        bind(ref, item.findingIds);
        items.push({ ref, item });
        itemBindings.push({ ref, item, scene, panel, basis, findings });
      }
      panels.push({ panel, items });
    }
    // Each pair has sixteen distinct port lanes. Never silently collapse two
    // relationships or manufacture implicit adjacency arrows between cells.
    const lanes = new Map();
    for (const link of scene.links) {
      const from = refs.get(link.from), to = refs.get(link.to);
      const pair = [from, to].sort(), key = pair.join('\u0000');
      const lane = lanes.get(key) ?? 0;
      if (lane >= 16) throw Error('A mechanism item pair supports at most sixteen relationships. Split the scene before illustrating.');
      lanes.set(key, lane + 1);
      const findings = referenced(valid, link.findingIds), basis = basisOf(findings), ref = nextRef();
      const a = ['e', 's', 'n', 'w'][lane % 4], b = ['w', 'n', 's', 'e'][Math.floor(lane / 4)];
      ops.push({ op: 'connect', ref, from: { node: from, port: from === pair[0] ? a : b },
        to: { node: to, port: to === pair[1] ? b : a }, bus: 'link', arrow: 'fwd',
        label: `${link.label} [${basis}]`, style: BASIS_STYLE[basis] });
      bind(ref, link.findingIds);
      wireBindings.push({ ref, scene });
    }
    scenes.push({ scene, panels });
  }
  const addedByFinding = new Map();
  for (const binding of bindings) for (const id of binding.findingIds) {
    if (!addedByFinding.has(id)) addedByFinding.set(id, []);
    addedByFinding.get(id).push(binding.ref);
  }
  const recordCount = [...addedByFinding.values()].reduce((sum, refs) => sum + refs.length, 0);
  if (recordCount > 200) throw Error('These mechanism scenes require more than 200 evidence links. Split the analysis into fewer scenes before illustrating.');
  for (const finding of valid.findings) if (finding.targets.length + (addedByFinding.get(finding.id)?.length ?? 0) > 200) {
    throw Error(`Finding "${finding.id}" would exceed 200 board targets. Remove superseded links or reanalyze before illustrating.`);
  }
  const result = applyEdits(work, ops);
  if (!result.ok) throw Error(`Mechanism illustration rejected; board unchanged: ${result.errors.map(error => error.message).join('; ')}`);
  const refToId = new Map(Object.entries(result.refs));
  const nodesById = new Map(work.nodes.map(node => [node.id, node]));
  const nodeFor = ref => nodesById.get(refToId.get(ref));
  const existing = contentBounds(doc);
  const startX = snap(existing ? Math.max(40, existing.x + existing.w + 160) : 40);
  let y = 40;
  const zones = [], notes = [];
  for (const { scene, panels } of scenes) {
    const sceneFindings = referenced(valid, explanationRefs(scene));
    const sceneBasis = basisOf(sceneFindings);
    if (isFigureScene(scene)) {
      const composition = placeFigureScene(scene, panels, nodeFor, startX, y, sceneBasis);
      zones.push(...composition.zones);
      notes.push(composition.note);
      y = snap(composition.bottom + 120);
      continue;
    }
    const summary = { id: uid('t'), x: startX + PAD, y: y + 52,
      text: summaryText(scene, sceneBasis) };
    notes.push(summary);
    const panelStartX = snap(startX + NOTE_W + PAD * 2);
    const allItems = panels.flatMap(panel => panel.items);
    const sizes = new Map(allItems.map(({ item, ref }) => [item.id, nodeRect(nodeFor(ref))]));
    const sequenceOrder = new Map();
    for (const id of [...scene.links.flatMap(link => [link.from, link.to]), ...allItems.map(({ item }) => item.id)]) {
      if (!sequenceOrder.has(id)) sequenceOrder.set(id, sequenceOrder.size);
    }
    const sequenceStride = Math.max(...[...sizes.values()].map(size => size.h)) + 80;
    const comparisonRows = Array.from({ length: Math.max(...panels.map(panel => panel.items.length)) }, (_, index) =>
      Math.max(...panels.map(panel => panel.items[index] ? sizes.get(panel.items[index].item.id).h : 0)));
    const comparisonWidth = Math.max(...[...sizes.values()].map(size => size.w),
      ...panels.map(({ panel }) => textUnits(`${panel.title} · schematic`) * 6.2 + 42)) + PAD * 2;
    let x = panelStartX, panelY = y + 52, bottom = summary.y + noteHeight(summary.text);
    for (const { panel, items } of panels) {
      const panelX = x;
      let right = panelX, itemY = panelY + 48, rowH = 0;
      for (let index = 0; index < items.length; index++) {
        const { ref, item } = items[index], node = nodeFor(ref), size = sizes.get(item.id);
        if (scene.kind === 'sequence') {
          node.x = panelX + PAD;
          node.y = panelY + 48 + sequenceOrder.get(item.id) * sequenceStride;
        } else if (scene.kind === 'comparison') {
          node.x = panelX + PAD;
          node.y = panelY + 48 + comparisonRows.slice(0, index).reduce((sum, height) => sum + height + 48, 0);
        } else if (scene.kind === 'state') {
          node.x = index ? right + 48 : panelX + PAD;
          node.y = itemY;
        } else {
          if (scene.kind === 'structure' && index % 3 !== 0) node.x = right + 12;
          else {
            if (index) itemY += rowH + (scene.kind === 'memory' ? 12 : 48);
            node.x = panelX + PAD;
            rowH = 0;
          }
          node.y = itemY;
        }
        node.y = snap(node.y);
        node.x = snap(node.x);
        rowH = Math.max(rowH, size.h);
        right = node.x + size.w;
      }
      const panelNodes = items.map(item => nodeFor(item.ref));
      const maxRight = Math.max(...panelNodes.map(node => node.x + nodeRect(node).w));
      const maxBottom = Math.max(...panelNodes.map(node => node.y + nodeRect(node).h));
      const label = `${panel.title} · schematic`;
      const zone = { id: uid('z'), x: panelX, y: panelY,
        w: Math.max(maxRight - panelX + PAD, textUnits(label) * 6.2 + 42, scene.kind === 'comparison' ? comparisonWidth : 0),
        h: maxBottom - panelY + PAD, label, color: '#818cf8' };
      zones.push(zone);
      bottom = Math.max(bottom, zone.y + zone.h);
      if (scene.kind === 'state') panelY = snap(zone.y + zone.h + GAP);
      else x = snap(zone.x + zone.w + GAP);
    }
    y = snap(bottom + 120);
  }
  orientFigureWires(work, wireBindings, refToId, nodesById);
  work.zones.push(...zones);
  work.notes.push(...notes);
  for (const item of [...work.nodes, ...zones, ...notes]) {
    const r = Object.hasOwn(item, 'text') ? { ...item, w: NOTE_W, h: noteHeight(item.text) }
      : Object.hasOwn(item, 'kind') ? nodeRect(item) : item;
    if ([r.x, r.y, r.x + r.w, r.y + r.h].some(n => !Number.isFinite(n) || Math.abs(n) > MAX_COORD)) {
      throw Error('The mechanism illustration does not fit within board coordinates. Move existing content or use a new board.');
    }
  }
  const nodes = itemBindings.map(binding => refToId.get(binding.ref));
  const wires = wireBindings.map(binding => refToId.get(binding.ref));
  let chapter = null;
  if (walkthrough) for (const { scene, panels } of scenes) {
    const members = panels.flatMap(panel => panel.items);
    if (scene.kind === 'sequence') members.sort((a, b) => nodeFor(a.ref).y - nodeFor(b.ref).y);
    if (scene.kind === 'parallel') {
      const actors = new Set(panels.filter(({ panel }) => panel.placement === 'actor').flatMap(({ items }) => items.map(({ ref }) => ref)));
      members.sort((a, b) => Number(actors.has(b.ref)) - Number(actors.has(a.ref))
        || (a.item.row ?? -1) - (b.item.row ?? -1) || nodeFor(a.ref).x - nodeFor(b.ref).x);
    }
    const sceneNodes = members.map(({ ref }) => refToId.get(ref));
    const sceneNodeSet = new Set(sceneNodes);
    const sceneWires = work.wires.filter(wire => sceneNodeSet.has(wire.from.node) && sceneNodeSet.has(wire.to.node)).map(wire => wire.id);
    const sceneBasis = basisOf(referenced(valid, explanationRefs(scene)));
    const next = { id: uid('j'), label: `Security illustration (mechanism): ${scene.title}`,
      caption: `Static source explanation [${sceneBasis}]; no PoC was executed. ${scene.detail}`.slice(0, 4000),
      view: { cx: 0, cy: 0, zoom: 1 }, targets: { nodes: sceneNodes, wires: sceneWires },
      stops: members.map(({ ref, item }) => ({ id: uid('s'), node: refToId.get(ref),
        caption: `${item.label} [${basisOf(referenced(valid, item.findingIds))}]: ${item.value}` })) };
    next.view = resolveStep(work, next).view;
    work.journey.push(next);
    chapter ??= next;
  }
  const records = [], items = Object.create(null);
  const findings = valid.findings.map(finding => {
    const ids = (addedByFinding.get(finding.id) ?? []).map(ref => refToId.get(ref));
    for (const target of ids) records.push({ findingId: finding.id, target });
    if (ids.length) items[finding.id] = ids[0];
    return ids.length ? { ...finding, targets: [...finding.targets, ...ids] } : finding;
  });
  const updated = validateSecurityAnalysis({ ...valid, findings,
    illustrations: [...prior, { view: 'mechanism', chapter: chapter?.id ?? '', items: records }] });
  work.securityAnalysis = updated;
  Object.assign(doc, work);
  return { doc, analysis: updated, targets: { view: 'mechanism', chapter: chapter?.id ?? null,
    nodes, wires, zones: zones.map(zone => zone.id), notes: notes.map(note => note.id), items, boundaryCards: {} } };
}

export function mechanismFindingIds(analysis) {
  return new Set((analysis.explanations ?? []).flatMap(explanationRefs));
}
