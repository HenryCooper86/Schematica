// Shared builder for built-in Security-group teaching boards: an authored
// analysis (retained source text, findings, mechanism explanation scenes)
// rendered through the real buildSecurityIllustration(view "mechanism") so
// the fixture shows exactly what a live analysis produces, plus the id
// pinning pass that keeps the generated board byte-identical on every
// module load — the prerequisite for a complete Chinese overlay.
import { buildSecurityIllustration } from './security-diagrams.js';
import { resolveStep } from './journey.js';

// The renderer mints a random uid for every card, wire, panel zone, summary
// note, scene chapter and stop it appends — right for a live board, wrong for
// a built-in example, whose Chinese overlay names every generated item by id.
// This pass pins each generated id to the authored analysis id it was built
// from — a cell keeps its item id, a link becomes "from>to", a panel zone
// keeps its panel id, the summary note its scene id, the scene chapter
// "<scene>-chapter" and each stop "<chapter>-stop-<n>" — migrating every
// reference with it: wire endpoints, journey targets and stop nodes, the
// appended illustration record, and each finding's accumulated targets.
// Matches are semantic, never positional or id-shaped: a cell is found by its
// label prefix and exact value, a wire by its endpoints and label, a zone or
// note by its text, a chapter by its label — so a renderer whose generated
// shape drifts from the analysis fails loudly here instead of silently
// stranding the overlay.
export function stableBoardIds(built, analysis) {
  const doc = built.doc;
  const rename = new Map();
  const pinned = new Set();
  const claim = (oldId, id) => {
    if (pinned.has(id)) throw new Error(`Security example "${analysis.id}": the generated ids collide on "${id}".`);
    pinned.add(id);
    rename.set(oldId, id);
  };
  const stable = (id) => rename.get(id) ?? id;

  // Cells: each rendered card wears "<item label> [<weakest basis>]" with the
  // item's value as its part number, and item values are unique per analysis.
  const cellByValue = new Map();
  for (const node of doc.nodes) {
    if (cellByValue.has(node.sublabel)) throw new Error(`Security example "${analysis.id}": two generated cells share the value "${node.sublabel}".`);
    cellByValue.set(node.sublabel, node);
  }
  const cellOf = new Map();
  for (const scene of analysis.explanations) for (const panel of scene.panels) for (const item of panel.items) {
    const node = cellByValue.get(item.value);
    if (!node || !node.label.startsWith(`${item.label} [`)) {
      throw new Error(`Security example "${analysis.id}": no generated cell matches the item "${item.id}".`);
    }
    claim(node.id, item.id);
    cellOf.set(item.id, node.id);
  }

  // Links: each wire is found by its endpoints and its label prefix; the
  // "from>to" id gains a counter only when a pair carries parallel links.
  for (const scene of analysis.explanations) {
    const parallel = new Map();
    for (const link of scene.links) {
      const from = cellOf.get(link.from), to = cellOf.get(link.to);
      const wire = from && to && doc.wires.find((w) => w.from.node === from && w.to.node === to
        && w.label.startsWith(`${link.label} [`) && !rename.has(w.id));
      if (!wire) throw new Error(`Security example "${analysis.id}": no generated wire matches the link "${link.from}" -> "${link.to}".`);
      const nth = (parallel.get(`${link.from}>${link.to}`) ?? 0) + 1;
      parallel.set(`${link.from}>${link.to}`, nth);
      claim(wire.id, `${link.from}>${link.to}${nth > 1 ? `-${nth}` : ''}`);
    }
  }

  // Panel zones and scene summary notes match by text; a generated item the
  // analysis does not describe still gets a deterministic positional id, so
  // no renderer change can leak a random id into the fixture.
  const panels = analysis.explanations.flatMap((scene) => scene.panels);
  let strayZone = 0, strayNote = 0;
  for (const zone of doc.zones) {
    const panel = panels.find((p) => !pinned.has(p.id) && zone.label === `${p.title} · schematic`);
    claim(zone.id, panel ? panel.id : `zone-${++strayZone}`);
  }
  for (const note of doc.notes) {
    const scene = analysis.explanations.find((s) => !pinned.has(s.id) && note.text.startsWith(`${s.title} [`));
    claim(note.id, scene ? scene.id : `note-${++strayNote}`);
  }

  // The renderer appends one walkthrough chapter per scene, one stop per cell.
  for (const step of doc.journey) {
    const scene = analysis.explanations.find((s) => !pinned.has(`${s.id}-chapter`)
      && step.label === `Security illustration (mechanism): ${s.title}`);
    if (scene) claim(step.id, `${scene.id}-chapter`);
  }

  // Apply the renames, carrying every reference along.
  for (const node of doc.nodes) node.id = stable(node.id);
  for (const wire of doc.wires) {
    wire.id = stable(wire.id);
    wire.from.node = stable(wire.from.node);
    wire.to.node = stable(wire.to.node);
  }
  for (const zone of doc.zones) zone.id = stable(zone.id);
  for (const note of doc.notes) note.id = stable(note.id);
  for (const step of doc.journey) {
    const chapter = rename.get(step.id);
    if (chapter) for (const [index, stop] of (step.stops ?? []).entries()) claim(stop.id, `${chapter}-stop-${index + 1}`);
    step.id = stable(step.id);
    if (step.targets) {
      step.targets.nodes = step.targets.nodes?.map(stable);
      step.targets.wires = step.targets.wires?.map(stable);
    }
    for (const stop of step.stops ?? []) { stop.id = stable(stop.id); stop.node = stable(stop.node); }
  }
  const saved = doc.securityAnalysis;
  if (saved) {
    for (const record of saved.illustrations ?? []) {
      record.chapter = stable(record.chapter);
      for (const entry of record.items) entry.target = stable(entry.target);
    }
    for (const finding of saved.findings) finding.targets = finding.targets.map(stable);
  }
}

// Builds one example: an empty board with authored overview chapters, then
// the shared renderer appends the rich editable mechanism scene (cards,
// labelled links, panel zones, a summary note and a per-scene walkthrough
// chapter with one stop per cell) and saves the authored analysis with the
// board. The intro chapter views resolve against the generated content, so
// they frame the real illustration, and stableBoardIds pins the generated
// ids so the fixture — and with it the Chinese overlay — is byte-identical
// on every module load.
export function securityExample(id, name, title, analysis, intro) {
  const doc = {
    schema: 4, title, nodes: [], wires: [], zones: [], notes: [],
    journey: intro.map(step => ({ ...step, view: { ...step.view } })),
  };
  const built = buildSecurityIllustration(doc, structuredClone(analysis), { view: 'mechanism', walkthrough: true });
  const [overview, links] = built.doc.journey;
  overview.view = resolveStep(built.doc, { view: overview.view, targets: { nodes: built.targets.nodes } }).view;
  links.view = resolveStep(built.doc, { view: links.view, targets: { wires: built.targets.wires } }).view;
  stableBoardIds(built, analysis);
  return { id, name, group: 'Security', doc: built.doc };
}
