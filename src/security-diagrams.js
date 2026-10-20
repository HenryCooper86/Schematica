// Editable illustrations for the security explainer. Everything drawn comes
// from the validated analysis: the view's findings (plus the endpoints of its
// relationships) become native editable cards, metadata findings become
// notes, and trust boundaries become zones that contain exactly the cards
// whose relationships unanimously declare them inside — membership comes
// solely from the contract's boundaryRelation metadata, never from adjacency
// or label wording, and a card also declared outside or crossing (or left
// none/unspecified) is never contained. Every relationship the analysis
// states for the view becomes a wire on the logical flow/link buses — never
// a fabricated physical bus — including boundary relationships, which attach
// to a boundary card because a zone cannot take ports, so inside, outside
// and crossings all keep their stated direction and label.
// The app reads zone membership geometrically (a card inside the rectangle is
// a member), so after placement a pass moves any generated card the zone does
// not contain clear of the zone rectangle: the picture can never show
// containment the analysis did not declare. The builder reuses the
// assistant's own applyEdits + placeNew pipeline, so unrelated board content
// keeps its items and coordinates. Illustrations only append: an earlier
// illustration stays for Undo or manual deletion, each build appends an
// illustration record (view, chapter, per-finding targets) to the analysis so
// walkthroughs can resolve the newest build of a view even when it made no
// chapter, and finding targets accumulate the ids each build actually
// produced (a boundary can gain both its zone and its card), so stale links
// stay detectable instead of being swept. Generated captions always say the
// same thing: the steps were modelled, not executed, and the picture is the
// analysis's reading, not a deployment.
import { validateSecurityAnalysis, SECURITY_ANALYSIS_SCHEMA } from './security-analysis.js';
import { applyEdits, MAX_OPS } from './ai/ops.js';
import { placeNew, COL_GAP, ROW_GAP } from './ai/layout.js';
import { resolveStep } from './journey.js';
import { uid } from './state.js';
import { nodeRect, rectsIntersect, snap, NOTE_W, noteHeight } from './geometry.js';

export const SECURITY_ILLUSTRATION_VIEWS = ['architecture', 'exploit', 'mitigation'];

const VIEW_TITLES = { architecture: 'Architecture', exploit: 'Exploit path', mitigation: 'Mitigation' };
const chapterMark = (view) => `Security illustration (${view}):`;
// Finding kinds that become cards, mapped to palette kinds. Components and
// steps are deliberately plain boxes; only root causes claim the vulnerability
// glyph, and open questions take the decision shape. Every kind mapped here
// carries the four side ports the wire lanes rely on.
const FINDING_PARTS = {
  affected: 'process',
  component: 'process',
  root_cause: 'vulnerability',
  prerequisite: 'preparation',
  step: 'process',
  impact: 'startend',
  mitigation: 'process',
  unknown: 'decision',
};
// Statements about other findings rather than things in their own right.
// A consistency verdict is metadata about the PoC/advisory pair, never a step
// of an exploit flow, so it draws as a note like the other note kinds.
const NOTE_KINDS = new Set(['severity', 'mapping', 'contradiction', 'consistency']);
// Palette kinds whose side ports carry the flow bus; used to pick flow for
// sequence wires and link elsewhere without bus-mismatch warnings.
const FLOW_SIDED = new Set(['process', 'startend', 'preparation', 'decision']);
const BASIS_TEXT = { source: 'source-backed', inference: 'inferred', unknown: 'unknown basis' };
const BASIS_STYLE = { source: null, inference: 'dashed', unknown: 'dotted' };
const TRUST_COLOR = '#f59e0b';
// A boundary with relationships gets a plain card as well as any zone: zones
// cannot take ports, so directed boundary relationships attach to a card.
const BOUNDARY_CARD_KIND = 'process';
const SLOT_MARGIN = 24;
const ILLUSTRATION_RECORD_CAP = SECURITY_ANALYSIS_SCHEMA.properties.illustrations.maxItems;
// A card pair offers sixteen port lanes (4 side ports x 4 side ports); every
// wire names its lane explicitly so parallel and reversed relationships never
// collide on connect's duplicate check.
const SIDES = ['e', 's', 'w', 'n'];
const LANES = SIDES.length * SIDES.length;
const DISCLAIMER = 'Static-analysis illustration: [source] items cite retained source lines, [inference] items are model conclusions, [unknown] items lack evidence. Nothing here was executed, and this is not a confirmed deployment architecture.';

function ensureDoc(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw Error('buildSecurityIllustration needs a board document.');
  }
  for (const key of ['nodes', 'wires', 'zones', 'notes', 'journey']) {
    if (!Array.isArray(doc[key])) doc[key] = [];
  }
  return doc;
}

function countsByView(findings) {
  const counts = { architecture: 0, exploit: 0, mitigation: 0, none: 0 };
  for (const finding of findings) counts[finding.view] += 1;
  return counts;
}

function noFindingsMessage(analysis, view) {
  const counts = countsByView(analysis.findings);
  return `No ${view} findings to illustrate in "${analysis.title}". The analysis carries ${analysis.findings.length} finding(s): `
    + `architecture ${counts.architecture}, exploit ${counts.exploit}, mitigation ${counts.mitigation}, unplaced ${counts.none}. `
    + `Build a view that has findings, or rerun the analysis and ask for ${view} findings.`;
}

function viewTitle(analysis) {
  return analysis.cveId || (analysis.title.length > 80 ? `${analysis.title.slice(0, 77)}...` : analysis.title);
}

function evidenceLines(analysis, finding, limit) {
  const names = new Map(analysis.sources.map((s) => [s.id, s.name]));
  return finding.evidence.slice(0, limit)
    .map((ref) => `${String(names.get(ref.sourceId) ?? ref.sourceId).slice(0, 60)} L${ref.startLine}-L${ref.endLine}`);
}

function noteText(analysis, finding) {
  const head = NOTE_KINDS.has(finding.kind)
    ? `${finding.kind}: ${finding.title} [${finding.basis}]`
    : `${finding.title} [${finding.basis}]`;
  const parts = [head];
  if (finding.detail) parts.push(finding.detail);
  const refs = evidenceLines(analysis, finding, 6);
  if (refs.length) parts.push(`Evidence: ${refs.join('; ')}`);
  return parts.join('\n');
}

function stopCaption(analysis, finding, number) {
  const head = `${number ? `${number}. ` : ''}${finding.title} [${finding.basis}]`;
  const refs = evidenceLines(analysis, finding, 3);
  return refs.length ? `${head} — ${refs.join('; ')}` : head;
}

function walkthroughCaption(view) {
  return `${VIEW_TITLES[view]} walkthrough. ${DISCLAIMER}`;
}

// What the view draws: its own findings plus both endpoints of every
// relationship stated for the view (a relationship's view says where its edge
// belongs, even when an endpoint finding is placed elsewhere). Order is the
// analysis's own order; only the sequence views number the cards.
function planIncluded(analysis, view) {
  const rels = analysis.relationships.filter((r) => r.view === view);
  const endpoints = new Set();
  for (const r of rels) {
    endpoints.add(r.from);
    endpoints.add(r.to);
  }
  const included = analysis.findings.filter((f) => f.view === view || endpoints.has(f.id));
  const cards = included.filter((f) => Object.hasOwn(FINDING_PARTS, f.kind));
  let n = 0;
  const order = new Map();
  for (const finding of cards) order.set(finding.id, view === 'architecture' ? 0 : ++n);
  return { included, cards, order, rels };
}

// The default walkthrough view follows what was actually illustrated, newest
// first: the last illustration record the builder appended, else the newest
// labelled chapter on the board, and only a fresh analysis falls back to the
// finding counts.
function pickView(analysis, doc = null) {
  const records = Array.isArray(analysis.illustrations) ? analysis.illustrations : [];
  for (let i = records.length - 1; i >= 0; i--) {
    const view = records[i]?.view;
    if (SECURITY_ILLUSTRATION_VIEWS.includes(view)) return view;
  }
  const chapters = (doc?.journey || []).filter((c) => typeof c?.label === 'string');
  for (let i = chapters.length - 1; i >= 0; i--) {
    const view = SECURITY_ILLUSTRATION_VIEWS.find((v) => chapters[i].label.startsWith(chapterMark(v)));
    if (view) return view;
  }
  if (analysis.findings.some((f) => f.view === 'exploit')) return 'exploit';
  return SECURITY_ILLUSTRATION_VIEWS.find((view) => analysis.findings.some((f) => f.view === view)) || 'exploit';
}

// Reads the board (never mutates it) and reports what a guided walkthrough of
// `view` shows. Stops resolve against the newest illustration of that view:
// the last illustration record the builder appended, else the newest labelled
// chapter. Only that build's ids count, so a deleted target is reported
// missing instead of quietly falling back to an older build's card or another
// view's card for the same finding.
export function buildSecurityWalkthrough(doc, analysis, options = {}) {
  const valid = validateSecurityAnalysis(analysis);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw Error('buildSecurityWalkthrough needs a board document.');
  }
  const opts = options || {};
  if (opts.view !== undefined && !SECURITY_ILLUSTRATION_VIEWS.includes(opts.view)) {
    throw Error(`Unknown walkthrough view "${opts.view}"; use one of ${SECURITY_ILLUSTRATION_VIEWS.join(', ')}.`);
  }
  const view = opts.view ?? pickView(valid, doc);
  const numbered = view !== 'architecture';
  const { included } = planIncluded(valid, view);
  const nodeIds = new Set((doc.nodes || []).map((n) => n.id));
  const boardIds = new Set([
    ...(doc.nodes || []).map((n) => n.id), ...(doc.wires || []).map((w) => w.id),
    ...(doc.zones || []).map((z) => z.id), ...(doc.notes || []).map((t) => t.id),
  ]);
  const journeyIds = new Set((doc.journey || []).map((c) => c.id));
  const chapters = (doc.journey || [])
    .filter((c) => typeof c.label === 'string' && c.label.startsWith(chapterMark(view)));
  const newestChapter = chapters[chapters.length - 1] ?? null;

  // The newest illustration of this view, as the builder recorded it: items
  // name exactly the board ids that build generated per finding.
  const records = Array.isArray(valid.illustrations) ? valid.illustrations : [];
  let record = null;
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i]?.view === view && Array.isArray(records[i].items)) { record = records[i]; break; }
  }
  const recordItems = new Map(); // finding id -> [board ids this build gave it]
  if (record) {
    for (const item of record.items) {
      if (!item || typeof item.findingId !== 'string' || typeof item.target !== 'string') continue;
      if (!recordItems.has(item.findingId)) recordItems.set(item.findingId, []);
      recordItems.get(item.findingId).push(item.target);
    }
  }
  const chapterNodes = new Set(newestChapter?.targets?.nodes ?? []);

  // What this finding's current illustration points at. With a record, only
  // that record's ids count. Without one (an analysis saved before records
  // existed), the newest labelled chapter scopes card findings to the nodes it
  // framed. With neither a record nor a matching chapter there is no evidence
  // which view any accumulated target belongs to, so nothing is guessed: the
  // findings read as not associated with this view's illustration rather than
  // being pointed at another view's card.
  const targetsOf = (finding) => {
    if (record) return recordItems.get(finding.id) ?? [];
    if (newestChapter) {
      if (Object.hasOwn(FINDING_PARTS, finding.kind)) return finding.targets.filter((id) => chapterNodes.has(id));
      return finding.targets.filter((id) => boardIds.has(id));
    }
    return [];
  };

  const names = new Map(valid.sources.map((s) => [s.id, s.name]));
  let n = 0;
  const stops = [];
  const missing = [];
  for (const finding of included) {
    const live = targetsOf(finding).filter((id) => boardIds.has(id));
    if (!live.length) {
      missing.push({ findingId: finding.id, title: finding.title });
      continue;
    }
    const node = Object.hasOwn(FINDING_PARTS, finding.kind) ? live.find((id) => nodeIds.has(id)) : null;
    if (!node) continue; // illustrated as a zone, a note, or a boundary card: not a walkthrough stop
    if (numbered) n += 1;
    stops.push({
      node,
      findingId: finding.id,
      title: finding.title,
      basis: finding.basis,
      caption: stopCaption(valid, finding, numbered ? n : 0),
      evidence: finding.evidence.map((ref) => ({
        sourceId: ref.sourceId, name: names.get(ref.sourceId) ?? ref.sourceId,
        startLine: ref.startLine, endLine: ref.endLine,
      })),
    });
  }
  const chapter = record
    ? (journeyIds.has(record.chapter) ? record.chapter : null)
    : newestChapter?.id ?? null;
  const summary = {
    view, title: `${VIEW_TITLES[view]}: ${viewTitle(valid)}`,
    caption: walkthroughCaption(view), stops, missing, chapter,
  };
  if (!included.length) summary.empty = noFindingsMessage(valid, view);
  else if (!record && !newestChapter) {
    summary.empty = `No ${view} illustration is associated with this analysis — no illustration record and no ${VIEW_TITLES[view]} chapter names this view's cards, `
      + `and accumulated board links cannot say which view they were drawn for. Findings are reported missing rather than guessed; build the ${view} illustration again.`;
  } else if (!stops.length) summary.empty = 'No walkthrough stops: this view’s findings are illustrated as zones or notes, or their targets are missing.';
  return summary;
}

// Wires this run generated: both endpoints came out of this run's refs and
// the wire is a logical flow/link, so user wiring is never claimed.
function generatedWireIds(doc, refToId) {
  const generated = new Set(Object.values(refToId));
  return doc.wires
    .filter((w) => generated.has(w.from.node) && generated.has(w.to.node) && (w.bus === 'flow' || w.bus === 'link'))
    .map((w) => w.id);
}

// Move only generated items. Obstacles stay fixed during a slot search.
function moveClearOfZone(doc, item, zone, isNote = false) {
  const size = isNote ? { w: NOTE_W, h: noteHeight(item.text) } : nodeRect(item);
  const x = snap(zone.x + zone.w + COL_GAP);
  const step = Math.max(8, snap(size.h + ROW_GAP));
  const obstacles = [
    ...doc.nodes.filter((n) => n.id !== item.id).map(nodeRect),
    ...doc.zones.filter((z) => z.id !== zone.id).map((z) => ({ x: z.x, y: z.y, w: z.w, h: z.h })),
    ...doc.notes.filter((t) => t.id !== item.id).map((t) => ({ x: t.x, y: t.y, w: NOTE_W, h: noteHeight(t.text) })),
  ];
  const free = (y) => !obstacles.some((o) => rectsIntersect(
    { x: x - SLOT_MARGIN, y: y - SLOT_MARGIN, w: size.w + 2 * SLOT_MARGIN, h: size.h + 2 * SLOT_MARGIN }, o));
  for (let slot = 0; slot <= 240; slot++) {
    // Search downwards first, then above the zone, without allocating slots.
    const offset = slot <= 120 ? slot : 120 - slot;
    const y = zone.y + offset * step;
    if (!free(y)) continue;
    item.x = x;
    item.y = y;
    return true;
  }
  return false;
}

// The app decides zone membership geometrically (a card inside the rectangle
// is a member), so the drawn picture must match the declared one: every card
// this build generated that is not a declared member of a generated zone is
// moved clear of that zone's rectangle. Sweeps repeat until stable, since
// moving a card can matter to the next zone.
function keepClearOfZones(doc, nodeIds, noteIds, membersOfZone) {
  const zones = doc.zones.filter((z) => membersOfZone.has(z.id));
  for (let sweep = 0; sweep <= zones.length; sweep++) {
    let moved = false;
    for (const zone of zones) {
      const members = membersOfZone.get(zone.id);
      const rect = { x: zone.x, y: zone.y, w: zone.w, h: zone.h };
      for (const id of nodeIds) {
        if (members.has(id)) continue;
        const node = doc.nodes.find((n) => n.id === id);
        if (!node || !rectsIntersect(nodeRect(node), rect)) continue;
        if (!moveClearOfZone(doc, node, zone)) throw Error('No clear position is available for a security illustration card; the board was left unchanged.');
        moved = true;
      }
      for (const id of noteIds) {
        const note = doc.notes.find((item) => item.id === id);
        if (!note || !rectsIntersect({ x: note.x, y: note.y, w: NOTE_W, h: noteHeight(note.text) }, rect)) continue;
        if (!moveClearOfZone(doc, note, zone, true)) throw Error('No clear position is available for a security illustration note; the board was left unchanged.');
        moved = true;
      }
    }
    if (!moved) return;
  }
  throw Error('Could not place the security illustration without undeclared containment; the board was left unchanged.');
}

// Builds the editable illustration for one view on the board and returns the
// same doc plus the updated analysis and the generated ids. Existing chapters,
// stops, cards and wiring are preserved: the illustration is appended, and a
// finding's targets accumulate what each build actually generated so stale
// links stay visible; a finding that cannot take every link this build would
// add (a boundary can gain both its zone and its card) within the schema's
// 200-target limit refuses the build up front instead of losing evidence.
// Throws (leaving the doc exactly as it was) for an invalid analysis, an
// unknown view, a view with nothing to draw, an analysis already carrying the
// maximum number of illustration records, or relationships too parallel to
// wire.
export function buildSecurityIllustration(doc, analysis, options = {}) {
  const valid = validateSecurityAnalysis(analysis);
  ensureDoc(doc);
  const opts = options || {};
  const view = opts.view === undefined ? 'exploit' : opts.view;
  const walkthrough = opts.walkthrough === undefined ? true : opts.walkthrough === true;
  if (!SECURITY_ILLUSTRATION_VIEWS.includes(view)) {
    throw Error(`Unknown illustration view "${view}"; use one of ${SECURITY_ILLUSTRATION_VIEWS.join(', ')}.`);
  }
  const { included, cards, order, rels } = planIncluded(valid, view);
  if (!included.length) throw Error(noFindingsMessage(valid, view));

  // Boundary membership is consumed from the contract's explicit
  // boundaryRelation metadata only — never inferred from adjacency or label
  // wording. A boundary contains exactly the cards whose relationships with
  // it unanimously declare inside at source or inference basis: a card that
  // is also declared outside or crossing (or left none/unspecified) is never
  // contained, because that contradictory set states no safe placement, and
  // an inside relationship of unknown basis asserts nothing either — it
  // stays a dotted, labelled wire to the boundary card. A zone holding
  // inference-backed members says so in its label, so a source-backed
  // boundary finding can never make inferred membership read as
  // source-established. Every relationship the analysis states is drawn as a
  // directed, labelled wire, declared-inside ones included — the zone adds
  // containment on top, it never replaces the wire.
  const findingById = new Map(valid.findings.map((f) => [f.id, f]));
  const boundaryIds = new Set(included.filter((f) => f.kind === 'boundary').map((f) => f.id));
  const isCardFinding = (id) => {
    const f = findingById.get(id);
    return Boolean(f && Object.hasOwn(FINDING_PARTS, f.kind));
  };
  const BASIS_STRENGTH = { unknown: 0, inference: 1, source: 2 };
  const boundaryPlan = new Map(); // boundary id -> { members, inferredMembership, wired }
  for (const id of boundaryIds) {
    const insideBasis = new Map(); // card id -> weakest basis of its inside relationships
    const nonInsideDeclared = new Set();
    const wired = new Set();
    for (const r of rels) {
      if (r.from !== id && r.to !== id) continue;
      const other = r.from === id ? r.to : r.from;
      if (!isCardFinding(other)) {
        if (boundaryIds.has(other)) wired.add(other); // boundaries wire to each other's cards
        continue;
      }
      wired.add(other);
      if (r.boundaryRelation === 'inside' && !boundaryIds.has(other)) {
        // Containment needs every declaration between this card and the
        // boundary to say inside; the weakest basis decides how strongly it
        // is asserted.
        const strength = BASIS_STRENGTH[r.basis] ?? 0;
        insideBasis.set(other, Math.min(insideBasis.has(other) ? insideBasis.get(other) : Infinity, strength));
      } else {
        nonInsideDeclared.add(other);
      }
    }
    const members = [...insideBasis.entries()]
      .filter(([m, basis]) => !nonInsideDeclared.has(m) && basis > BASIS_STRENGTH.unknown)
      .map(([m]) => m);
    const inferredMembership = [...insideBasis.entries()]
      .some(([m, basis]) => !nonInsideDeclared.has(m) && basis === BASIS_STRENGTH.inference);
    boundaryPlan.set(id, { members, inferredMembership, wired: [...wired] });
  }
  // Shared members do not establish whether domains overlap or nest. The
  // generic placer separates zones and would move a shared card out of one.
  // Keep those domains as boundary cards with their explicit inside wires.
  const membershipCount = new Map();
  for (const plan of boundaryPlan.values()) {
    for (const member of plan.members) membershipCount.set(member, (membershipCount.get(member) || 0) + 1);
  }
  for (const plan of boundaryPlan.values()) {
    if (plan.members.some(member => membershipCount.get(member) > 1)) plan.members = [];
  }
  // A finding may reference at most 200 board targets, and this build adds one
  // link to every included finding — two to a boundary that gets both a zone
  // and a card. Anything that would cross the limit is refused up front with
  // an actionable message rather than silently dropping older evidence links
  // to make room.
  const addsUpTo = (finding) => {
    if (finding.kind !== 'boundary') return 1;
    const plan = boundaryPlan.get(finding.id);
    const adds = (plan.members.length ? 1 : 0) + (plan.wired.length ? 1 : 0);
    return adds || 1; // a boundary nothing relates to still becomes a note
  };
  const full = included.filter((f) => f.targets.length + addsUpTo(f) > 200);
  if (full.length) {
    throw Error(`${full.length} finding(s) cannot take the ${addsUpTo(full[0])} new board link(s) the ${view} view adds within the maximum of 200 board links (for example "${full[0].id}"); `
      + `remove stale links from the analysis first — delete superseded illustrations and the finding targets that point at them — then build again.`);
  }

  // Illustration records are appended per build and never truncated silently:
  // an analysis at the cap refuses the build before anything is drawn.
  const priorRecords = valid.illustrations ?? [];
  if (priorRecords.length >= ILLUSTRATION_RECORD_CAP) {
    throw Error(`this analysis already carries the maximum of ${ILLUSTRATION_RECORD_CAP} illustration records; `
      + `delete superseded illustrations and rerun the analysis before building more`);
  }

  // Refs are minted clear of every id already on the board.
  const takenIds = new Set([
    ...doc.nodes.map((n) => n.id), ...doc.wires.map((w) => w.id),
    ...doc.zones.map((z) => z.id), ...doc.notes.map((t) => t.id),
  ]);
  let refIndex = 0;
  const nextRef = () => {
    let ref;
    do { ref = `sec${refIndex++}`; } while (takenIds.has(ref));
    takenIds.add(ref);
    return ref;
  };

  const ops = [];
  const refFor = new Map(); // finding id -> ref of its generated item
  const kindOf = new Map(); // finding id -> palette kind (cards and boundary cards)
  const boundaryCardRef = new Map(); // boundary finding id -> ref of its extra card, when it also drew a zone
  for (const finding of cards) {
    const ref = nextRef();
    refFor.set(finding.id, ref);
    const kind = FINDING_PARTS[finding.kind];
    kindOf.set(finding.id, kind);
    const number = order.get(finding.id);
    const op = {
      op: 'add_part', ref, kind,
      label: `${number ? `${number}. ` : ''}${finding.title}`,
      sublabel: BASIS_TEXT[finding.basis],
      notes: noteText(valid, finding),
    };
    if (finding.kind === 'root_cause') {
      op.flags = ['bug'];
      if (valid.cveId) op.fields = { cve: valid.cveId };
    }
    ops.push(op);
  }

  // The view's relationships decide zone membership and where metadata notes
  // hang, and they are the only source of wires.
  const neighbors = new Map(); // finding id -> [finding ids]
  for (const r of rels) {
    for (const [a, b] of [[r.from, r.to], [r.to, r.from]]) {
      if (!neighbors.has(a)) neighbors.set(a, []);
      neighbors.get(a).push(b);
    }
  }
  // The ref of the card a wire or a note anchor can attach to: a card
  // finding's own card, or a boundary's card — never its zone.
  const cardRefOf = (id) => {
    if (boundaryIds.has(id)) {
      return boundaryCardRef.get(id) ?? (kindOf.get(id) === BOUNDARY_CARD_KIND ? refFor.get(id) : null);
    }
    return isCardFinding(id) ? refFor.get(id) ?? null : null;
  };

  const zonePlan = new Map(); // zone ref -> [member refs]
  for (const finding of included) {
    if (finding.kind !== 'boundary' && !NOTE_KINDS.has(finding.kind)) continue;
    if (finding.kind === 'boundary') {
      const plan = boundaryPlan.get(finding.id);
      if (plan.members.length) {
        // A trust boundary contains exactly the cards its inside
        // relationships assert; inferred containment says so in the label.
        const ref = nextRef();
        refFor.set(finding.id, ref);
        const members = plan.members.map((id) => refFor.get(id));
        zonePlan.set(ref, members);
        ops.push({
          op: 'add_zone', ref,
          label: `${finding.title} [${finding.basis}]${plan.inferredMembership ? ' — inferred membership' : ''}`,
          color: TRUST_COLOR, members,
        });
        if (plan.wired.length) {
          const cardRef = nextRef();
          boundaryCardRef.set(finding.id, cardRef);
          kindOf.set(finding.id, BOUNDARY_CARD_KIND);
          ops.push({
            op: 'add_part', ref: cardRef, kind: BOUNDARY_CARD_KIND,
            label: finding.title, sublabel: BASIS_TEXT[finding.basis],
            notes: noteText(valid, finding),
            near: plan.wired.map(cardRefOf).find(Boolean),
          });
        }
        continue;
      }
      if (plan.wired.length) {
        // No declared members, so no zone may imply containment: the boundary
        // itself becomes a card its directed relationships wire to.
        const cardRef = nextRef();
        refFor.set(finding.id, cardRef);
        kindOf.set(finding.id, BOUNDARY_CARD_KIND);
        ops.push({
          op: 'add_part', ref: cardRef, kind: BOUNDARY_CARD_KIND,
          label: finding.title, sublabel: BASIS_TEXT[finding.basis],
          notes: noteText(valid, finding),
          near: plan.wired.map(cardRefOf).find(Boolean),
        });
        continue;
      }
      // A boundary nothing card-like relates to is stated as a note.
    }
    const ref = nextRef();
    refFor.set(finding.id, ref);
    const op = { op: 'add_note', ref, text: noteText(valid, finding) };
    const anchor = (neighbors.get(finding.id) || []).find((id) => kindOf.has(id));
    if (anchor) op.near = cardRefOf(anchor);
    ops.push(op);
  }
  const anchorRef = cards.length
    ? refFor.get(cards[0].id)
    : [...kindOf.keys()].map(cardRefOf).find(Boolean);
  if (anchorRef) {
    ops.push({
      op: 'add_note', ref: nextRef(), near: anchorRef,
      text: `${chapterMark(view)} ${VIEW_TITLES[view]} for ${viewTitle(valid)} — ${DISCLAIMER}`,
    });
  }

  // Parallelism check before anything is drawn: a card pair carries at most
  // sixteen wires, so more parallel relationships are refused loudly rather
  // than silently dropped. Every relationship claims a lane, boundary ones
  // included — containment never replaces the wire.
  const pairCounts = new Map();
  for (const r of rels) {
    if (!kindOf.has(r.from) || !kindOf.has(r.to)) continue; // notes and card-less boundaries cannot take wires
    const key = [r.from, r.to].sort().join('\u0000');
    pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
  }
  for (const [key, count] of pairCounts) {
    if (count > LANES) {
      const [a, b] = key.split('\u0000');
      throw Error(`${count} parallel relationships between findings "${a}" and "${b}" exceed the ${LANES} wire lanes one card pair can carry; `
        + `merge or split them in the analysis before illustrating the ${view} view.`);
    }
  }

  // Every wire names its lane explicitly: lane k of a pair uses port
  // SIDES[k % 4] on the lower finding's card and SIDES[Math.floor(k / 4) % 4]
  // on the higher one, mirrored when the relationship runs the other way, so
  // parallel and reversed relationships never share endpoints. A wire's
  // endpoint is the finding's card — for a boundary that drew both a zone
  // and a card, the card, since a zone cannot take ports. Relationships are
  // directional in every view, so every wire carries a forward arrow,
  // boundary relationships included: inside, outside and crossings all keep
  // the direction and label the analysis stated.
  const laneOf = new Map();
  for (const r of rels) {
    if (!kindOf.has(r.from) || !kindOf.has(r.to)) continue;
    const key = [r.from, r.to].sort().join('\u0000');
    const k = laneOf.get(key) || 0;
    laneOf.set(key, k + 1);
    const [lo, hi] = key.split('\u0000');
    const portLo = SIDES[k % SIDES.length];
    const portHi = SIDES[Math.floor(k / SIDES.length) % SIDES.length];
    const bothFlow = FLOW_SIDED.has(kindOf.get(r.from)) && FLOW_SIDED.has(kindOf.get(r.to));
    ops.push({
      op: 'connect',
      from: { node: cardRefOf(r.from), port: r.from === lo ? portLo : portHi },
      to: { node: cardRefOf(r.to), port: r.to === lo ? portLo : portHi },
      bus: view === 'architecture' || !bothFlow ? 'link' : 'flow',
      arrow: 'fwd',
      label: `${r.label} [${r.basis}]`,
      style: BASIS_STYLE[r.basis] ?? null,
    });
  }
  // Apply. One atomic batch when everything fits; otherwise the ops are
  // chunked and every later chunk's refs are translated to real ids first, so
  // a chunk boundary never breaks a reference. Any failure restores the
  // document untouched.
  const snapshot = structuredClone(doc);
  let refToId = {};
  const translate = (op) => {
    if (op.op === 'add_zone') return { ...op, members: op.members.map((r) => refToId[r] ?? r) };
    if (op.near !== undefined) return { ...op, near: refToId[op.near] ?? op.near };
    if (op.op === 'connect') {
      return {
        ...op,
        from: { ...op.from, node: refToId[op.from.node] ?? op.from.node },
        to: { ...op.to, node: refToId[op.to.node] ?? op.to.node },
      };
    }
    return op;
  };
  const runBatch = (batch) => {
    const res = applyEdits(doc, batch);
    if (!res.ok) {
      Object.assign(doc, snapshot);
      throw Error(`Security illustration rejected, board unchanged: ${res.errors.map((e) => `#${e.index}: ${e.message}`).join('; ')}`);
    }
    refToId = { ...refToId, ...res.refs };
    placeNew(doc, res.layout);
  };
  if (ops.length <= MAX_OPS) {
    runBatch(ops);
  } else {
    for (let i = 0; i < ops.length; i += MAX_OPS) {
      runBatch(ops.slice(i, i + MAX_OPS).map(translate));
    }
  }

  // The picture must state what the analysis declared: any card this build
  // generated that a zone does not contain is moved clear of that zone's
  // rectangle, so geometric membership can never show an outside or
  // unspecified card as contained.
  const zoneMembersById = new Map();
  for (const [zoneRef, memberRefs] of zonePlan) {
    const zoneId = refToId[zoneRef];
    if (zoneId) zoneMembersById.set(zoneId, new Set(memberRefs.map((r) => refToId[r]).filter(Boolean)));
  }
  const generated = new Set(Object.values(refToId));
  const generatedNodeIds = [...kindOf.keys()]
    .map((id) => refToId[boundaryCardRef.get(id) ?? refFor.get(id)])
    .filter(Boolean);
  const generatedNoteIds = doc.notes.filter(note => generated.has(note.id)).map(note => note.id);
  try {
    keepClearOfZones(doc, generatedNodeIds, generatedNoteIds, zoneMembersById);
  } catch (error) {
    Object.assign(doc, snapshot);
    throw error;
  }

  // Journey: every existing chapter and stop is preserved as-is; this view's
  // walkthrough is appended, built from the nodes just generated. Boundary
  // cards are framed but are not stops: a trust boundary is not a step.
  let chapter = null;
  const stopNodes = cards.map((finding) => refToId[refFor.get(finding.id)]).filter(Boolean);
  const boundaryNodes = [...boundaryIds]
    .filter((id) => kindOf.get(id) === BOUNDARY_CARD_KIND)
    .map((id) => refToId[boundaryCardRef.get(id) ?? refFor.get(id)])
    .filter(Boolean);
  const frameNodes = [...new Set([...stopNodes, ...boundaryNodes])];
  if (walkthrough && stopNodes.length) {
    chapter = {
      id: uid('j'),
      label: `${chapterMark(view)} ${viewTitle(valid)}`,
      caption: walkthroughCaption(view),
      view: { cx: 0, cy: 0, zoom: 1 },
      stops: cards
        .map((finding) => ({ finding, node: refToId[refFor.get(finding.id)] }))
        .filter((s) => s.node)
        .map((s) => ({ id: uid('s'), node: s.node, caption: stopCaption(valid, s.finding, order.get(s.finding.id)) })),
      targets: { nodes: frameNodes, wires: generatedWireIds(doc, refToId) },
    };
    chapter.view = resolveStep(doc, chapter).view;
    doc.journey.push(chapter);
  }

  // Point every included finding at what this build added — a boundary gains
  // both its zone and its card, so click-stage explanations follow either —
  // and keep the stored analysis canonical. Targets accumulate across builds
  // so earlier links stay visible and detectable; the 200-target limit is
  // enforced by the upfront refusal above, never by dropping references.
  const items = Object.create(null); // finding ids are opaque strings
  const recordItems = [];
  for (const finding of included) {
    items[finding.id] = refToId[refFor.get(finding.id)];
    for (const r of [refFor.get(finding.id), boundaryCardRef.get(finding.id)]) {
      const id = r && refToId[r];
      if (id) recordItems.push({ findingId: finding.id, target: id });
    }
  }
  const findings = valid.findings.map((finding) => {
    const added = [refFor.get(finding.id), boundaryCardRef.get(finding.id)]
      .map((r) => r && refToId[r])
      .filter((id) => id && !finding.targets.includes(id));
    return added.length ? { ...finding, targets: [...finding.targets, ...added] } : finding;
  });
  const updated = validateSecurityAnalysis({
    ...valid, findings,
    illustrations: [...priorRecords, { view, chapter: chapter ? chapter.id : '', items: recordItems }],
  });
  doc.securityAnalysis = updated;

  const boundaryCards = Object.create(null); // finding ids are opaque strings
  for (const [fid, ref] of boundaryCardRef) boundaryCards[fid] = refToId[ref];
  return {
    doc,
    analysis: updated,
    targets: {
      view,
      chapter: chapter ? chapter.id : null,
      nodes: frameNodes,
      wires: generatedWireIds(doc, refToId),
      zones: doc.zones.filter((z) => generated.has(z.id)).map((z) => z.id),
      notes: doc.notes.filter((t) => generated.has(t.id)).map((t) => t.id),
      items,
      boundaryCards,
    },
  };
}
