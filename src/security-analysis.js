// Static analysis is reference data, not proof of exploitation or deployment risk.
// Optional finding.assetKind names a real catalogue kind (see
// security-assets.js) so illustrations draw a recognizable asset; it stays
// absent on every analysis that never chose one.
import { SECURITY_ASSET_KINDS } from './security-assets.js';

export const SECURITY_KINDS = ['affected', 'root_cause', 'prerequisite', 'step', 'impact', 'mitigation', 'severity', 'mapping', 'contradiction', 'unknown', 'component', 'boundary', 'consistency'];
export const SECURITY_VIEWS = ['architecture', 'exploit', 'mitigation', 'mechanism'];
export const SECURITY_BOUNDARY_RELATIONS = ['none', 'inside', 'outside', 'crosses'];
export const SECURITY_COVERAGE_RANGES_LIMIT = 1000;   // canonical read ranges per source
export const SECURITY_EXPLANATION_KINDS = ['memory', 'structure', 'sequence', 'state', 'comparison', 'attack', 'parallel'];
export const SECURITY_EXPLANATION_ROLES = ['input', 'storage', 'pointer', 'operation', 'guard', 'invalid', 'result', 'neutral'];
// Panel placements of the composed kinds ("attack", "parallel"): the semantic
// role a panel plays in the composition. Hints only — never physical network,
// containment or coordinate claims; no coords, HTML or SVG exist here.
export const SECURITY_EXPLANATION_PLACEMENTS = ['actor', 'exchange', 'target', 'outcome'];
export const SECURITY_EXPLANATION_ROW_MAX = 7;        // highest parallel row index
export const SECURITY_EXPLANATIONS_LIMIT = 6;         // mechanism scenes per analysis
const BASES = ['source', 'inference', 'unknown'];
const STATUSES = ['published', 'reserved', 'rejected', 'unknown', 'not-provided'];
const stringSchema = (maxLength, extra = {}) => ({ type: 'string', maxLength, ...extra });
const arraySchema = (items, maxItems, extra = {}) => ({ type: 'array', items, maxItems, ...extra });
const objectSchema = (properties, optional = []) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties).filter(key => !optional.includes(key)) });
const idSchema = stringSchema(120, { minLength: 1 });
const lineSchema = { type: 'integer', minimum: 1 };
const evidenceSchema = objectSchema({ sourceId: idSchema, startLine: lineSchema, endLine: lineSchema });
const evidenceList = arraySchema(evidenceSchema, 20);
const coverageRangeSchema = objectSchema({ startLine: lineSchema, endLine: lineSchema });
const coverageEntrySchema = objectSchema({ sourceId: idSchema, ranges: arraySchema(coverageRangeSchema, SECURITY_COVERAGE_RANGES_LIMIT) });
const illustrationItemSchema = objectSchema({ findingId: idSchema, target: idSchema });
const illustrationSchema = objectSchema({ view: { type: 'string', enum: SECURITY_VIEWS }, chapter: stringSchema(120), items: arraySchema(illustrationItemSchema, 200) });
// Optional mechanism explanations: schematic scenes grounded in normal
// findings — findingIds is the only citation channel, so evidence basis and
// citations are derived from the referenced findings, never asserted here.
const explanationFindingRefs = arraySchema(idSchema, 8);
// Items and panels may carry presentation hints: an optional item assetKind
// (an illustration asset, drawn only when the renderer can ground it in a
// referenced finding — a saved ungrounded hint stays inert data), an optional
// parallel row index, and an optional panel placement for the composed kinds.
// All are semantic composition hints grounded through findingIds, never a
// separate citation channel and never coordinates or markup.
const explanationItemSchema = objectSchema({ id: idSchema, label: stringSchema(240, { minLength: 1 }),
  value: stringSchema(1000), role: { type: 'string', enum: SECURITY_EXPLANATION_ROLES },
  assetKind: { type: 'string', enum: [...SECURITY_ASSET_KINDS] },
  row: { type: 'integer', minimum: 0, maximum: SECURITY_EXPLANATION_ROW_MAX },
  findingIds: explanationFindingRefs }, ['assetKind', 'row']);
const explanationPanelSchema = objectSchema({ id: idSchema, title: stringSchema(240, { minLength: 1 }),
  placement: { type: 'string', enum: SECURITY_EXPLANATION_PLACEMENTS },
  items: arraySchema(explanationItemSchema, 8) }, ['placement']);
const explanationLinkSchema = objectSchema({ from: idSchema, to: idSchema, label: stringSchema(240, { minLength: 1 }),
  findingIds: explanationFindingRefs });
const explanationSchema = objectSchema({ id: idSchema, title: stringSchema(240, { minLength: 1 }),
  kind: { type: 'string', enum: SECURITY_EXPLANATION_KINDS }, detail: stringSchema(4000),
  panels: arraySchema(explanationPanelSchema, 4), links: arraySchema(explanationLinkSchema, 24) });
export const SECURITY_ANALYSIS_SCHEMA = objectSchema({
  version: { type: 'integer', enum: [1] }, id: idSchema, title: stringSchema(240, { minLength: 1 }),
  cveId: stringSchema(64), status: { type: 'string', enum: STATUSES }, summary: stringSchema(8000), generatedAt: stringSchema(40),
  sources: arraySchema(objectSchema({ id: idSchema, name: stringSchema(512, { minLength: 1 }), url: stringSchema(4096),
    retrievedAt: stringSchema(40), hash: stringSchema(64), text: stringSchema(100000), startLine: lineSchema,
    totalLines: lineSchema, partial: { type: 'boolean' }, warnings: arraySchema(stringSchema(2000), 30) }), 20),
  findings: arraySchema(objectSchema({ id: idSchema, kind: { type: 'string', enum: SECURITY_KINDS },
    title: stringSchema(240, { minLength: 1 }), detail: stringSchema(8000), basis: { type: 'string', enum: BASES },
    view: { type: 'string', enum: [...SECURITY_VIEWS, 'none'] },
    assetKind: { type: 'string', enum: [...SECURITY_ASSET_KINDS] }, evidence: evidenceList, targets: arraySchema(idSchema, 200) },
    ['assetKind']), 100),
  relationships: arraySchema(objectSchema({ id: idSchema, from: idSchema, to: idSchema, label: stringSchema(240, { minLength: 1 }),
    basis: { type: 'string', enum: BASES }, view: { type: 'string', enum: SECURITY_VIEWS }, evidence: evidenceList,
    boundaryRelation: { type: 'string', enum: SECURITY_BOUNDARY_RELATIONS } }, ['boundaryRelation']), 150),
  warnings: arraySchema(stringSchema(2000), 50),
  readCoverage: arraySchema(coverageEntrySchema, 20),
  illustrations: arraySchema(illustrationSchema, 100),
  explanations: arraySchema(explanationSchema, SECURITY_EXPLANATIONS_LIMIT),
}, ['readCoverage', 'illustrations', 'explanations']);

function checkShape(value, schema, path) {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${path} must be an object.`);
    for (const key of schema.required) if (!Object.hasOwn(value, key)) throw Error(`Missing ${path}.${key}.`);
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, key)) throw Error(`Unknown ${path} field: ${key}.`);
      checkShape(value[key], schema.properties[key], `${path}.${key}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > schema.maxItems) throw Error(`${path} exceeds its collection limit (${schema.maxItems}).`);
    for (let i = 0; i < value.length; i++) checkShape(value[i], schema.items, `${path}[${i}]`);
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || value.length > schema.maxLength || value.length < (schema.minLength || 0)
      || (schema.minLength && !value.trim()) || /\u0000/.test(value)) throw Error(`${path} is invalid or exceeds its text limit.`);
  } else if (schema.type === 'integer') {
    if (!Number.isSafeInteger(value) || value < (schema.minimum ?? -Number.MAX_SAFE_INTEGER)
      || value > (schema.maximum ?? Number.MAX_SAFE_INTEGER)) throw Error(`${path} must be a safe integer.`);
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') throw Error(`${path} must be boolean.`);
  if (schema.enum && !schema.enum.includes(value)) throw Error(`${path} has an unsupported value.`);
}
function distinct(rows, label) {
  const ids = new Set();
  for (const row of rows) {
    if (ids.has(row.id)) throw Error(`Duplicate ${label} id: ${row.id}.`);
    ids.add(row.id);
  }
  return ids;
}
function timestamp(value, label) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw Error(`${label} must be a UTC timestamp.`);
  if (new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) throw Error(`${label} is not a valid calendar time.`);
}
function sourceUrl(value) {
  if (!value) return;
  let url;
  try { url = new URL(value); } catch { throw Error('Invalid security source URL.'); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  // DNS and redirect validation belong to server/web.js; saved references are never fetched on opening.
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port
    || !host.includes('.') || host.includes(':') || /\.(?:localhost|local|internal|lan|home)$/.test(host)
    || /^(?:0|10|127|169\.254|192\.168|172\.(?:1[6-9]|2\d|3[01]))\./.test(host)) throw Error('Security sources require public HTTP(S) URLs without credentials or custom ports.');
}

export function securityEvidence(analysis, ref) {
  const source = analysis.sources.find(s => s.id === ref.sourceId);
  if (!source) throw Error(`Evidence source not found: ${ref.sourceId}.`);
  const lines = source.text.split('\n');
  if (!Number.isSafeInteger(ref.startLine) || !Number.isSafeInteger(ref.endLine) || ref.startLine < source.startLine
    || ref.endLine < ref.startLine || ref.endLine >= source.startLine + lines.length) throw Error(`Evidence falls outside the included lines of ${source.name}.`);
  if (ref.endLine - ref.startLine >= 200) throw Error('An evidence reference may include at most 200 lines.');
  const text = lines.slice(ref.startLine - source.startLine, ref.endLine - source.startLine + 1).join('\n');
  if (text.length > 20000) throw Error('An evidence reference may include at most 20,000 characters.');
  return { source, text, startLine: ref.startLine, endLine: ref.endLine };
}

// Explanation items and links ground every visible claim in existing
// findings: nonempty, duplicate-free findingIds only, never a separate
// citation channel.
function checkExplanationGrounding(findingIds, element, label) {
  if (!element.findingIds.length) throw Error(`${label} must reference at least one existing finding id.`);
  const seen = new Set();
  for (const id of element.findingIds) {
    if (seen.has(id)) throw Error(`${label} repeats finding id ${id}.`);
    seen.add(id);
    if (!findingIds.has(id)) throw Error(`${label} references an unknown finding: ${id}.`);
  }
}

export function validateSecurityAnalysis(value) {
  checkShape(value, SECURITY_ANALYSIS_SCHEMA, 'Security analysis');
  if (value.cveId && !/^CVE-\d{4}-\d{4,}$/.test(value.cveId)) throw Error('Use a normalized CVE-YYYY-NNNN identifier.');
  if (!value.cveId && !['unknown', 'not-provided'].includes(value.status)) throw Error('A CVE record status requires a CVE identifier.');
  timestamp(value.generatedAt, 'Analysis time');
  distinct(value.sources, 'source');
  const findingIds = distinct(value.findings, 'finding');
  distinct(value.relationships, 'relationship');
  let totalChars = 0;
  for (const source of value.sources) {
    sourceUrl(source.url);
    timestamp(source.retrievedAt, 'Source retrieval time');
    if (!/^[a-f0-9]{64}$/.test(source.hash)) throw Error('Source hashes must be SHA-256 hexadecimal digests.');
    const end = source.startLine + source.text.split('\n').length - 1;
    if (end > source.totalLines || !Number.isSafeInteger(end)) throw Error('Included source lines exceed the declared total.');
    if (!source.partial && (source.startLine !== 1 || end !== source.totalLines)) throw Error('Incomplete source coverage must be marked partial.');
    totalChars += source.text.length;
  }
  if (totalChars > 500000) throw Error('Security source collection exceeds 500,000 characters.');
  if (value.readCoverage !== undefined) {
    const sourceById = new Map(value.sources.map(s => [s.id, s]));
    const seen = new Set();
    for (const entry of value.readCoverage) {
      if (seen.has(entry.sourceId)) throw Error(`Duplicate read coverage for source ${entry.sourceId}.`);
      seen.add(entry.sourceId);
      const source = sourceById.get(entry.sourceId);
      if (!source) throw Error(`Read coverage references an unknown source: ${entry.sourceId}.`);
      const last = source.startLine + source.text.split('\n').length - 1;
      let prevEnd = -Infinity;
      for (const range of entry.ranges) {
        if (range.endLine < range.startLine || range.startLine < source.startLine || range.endLine > last) {
          throw Error(`Read coverage for ${entry.sourceId} has an invalid range outside retained lines ${source.startLine}-${last}.`);
        }
        if (range.startLine <= prevEnd + 1) throw Error(`Read coverage for ${entry.sourceId} must be sorted, merged and non-overlapping.`);
        prevEnd = range.endLine;
      }
    }
  }
  let citedChars = 0;
  for (const item of [...value.findings, ...value.relationships]) {
    if (item.basis === 'source' && !item.evidence.length) throw Error(`Source-backed finding or relationship ${item.id} requires evidence.`);
    for (const ref of item.evidence) {
      citedChars += securityEvidence(value, ref).text.length;
      if (citedChars > 500000) throw Error('Cited excerpts exceed 500,000 characters; use narrower references.');
    }
  }
  const boundaryIds = new Set(value.findings.filter(f => f.kind === 'boundary').map(f => f.id));
  for (const relation of value.relationships) {
    if (!findingIds.has(relation.from) || !findingIds.has(relation.to) || relation.from === relation.to) throw Error(`Relationship ${relation.id} must join two existing, distinct findings.`);
    if (relation.boundaryRelation && relation.boundaryRelation !== 'none') {
      const fromBoundary = boundaryIds.has(relation.from);
      const toBoundary = boundaryIds.has(relation.to);
      if (fromBoundary === toBoundary) throw Error(`Relationship ${relation.id} boundaryRelation "${relation.boundaryRelation}" requires exactly one boundary endpoint.`);
    }
  }
  for (const finding of value.findings) if (new Set(finding.targets).size !== finding.targets.length) throw Error(`Duplicate board targets in ${finding.id}.`);
  if (value.explanations !== undefined) {
    // Scene ids are unique across the analysis; panel ids per scene and item
    // ids across each scene's panels. Grounding and endpoints are checked
    // against findings and items that actually exist, with the offending id
    // named so a rejected save points at the exact scene element.
    distinct(value.explanations, 'explanation');
    for (const scene of value.explanations) {
      if (!scene.panels.length) throw Error(`Explanation "${scene.id}" requires at least one panel.`);
      distinct(scene.panels, `panel of explanation "${scene.id}"`);
      const itemIds = new Set();
      for (const panel of scene.panels) {
        if (!panel.items.length) throw Error(`Panel "${panel.id}" of explanation "${scene.id}" requires at least one item.`);
        // Composed kinds place every panel; parallel aligns its non-actor
        // items with an explicit row. Presence only — enum, type and the 0..7
        // range are already enforced by the schema. Item assetKind is
        // deliberately not grounding-checked here: a structurally valid but
        // ungrounded saved hint stays data that renderers suppress, so
        // historical records never become invalid.
        if ((scene.kind === 'attack' || scene.kind === 'parallel') && panel.placement === undefined) {
          throw Error(`Panel "${panel.id}" of ${scene.kind} explanation "${scene.id}" requires a placement (${SECURITY_EXPLANATION_PLACEMENTS.join('|')}).`);
        }
        for (const item of panel.items) {
          if (itemIds.has(item.id)) throw Error(`Duplicate item id in explanation "${scene.id}": ${item.id}.`);
          itemIds.add(item.id);
          if (scene.kind === 'parallel' && panel.placement !== 'actor' && item.row === undefined) {
            throw Error(`Non-actor item "${item.id}" of parallel explanation "${scene.id}" requires a row (0-${SECURITY_EXPLANATION_ROW_MAX}).`);
          }
          checkExplanationGrounding(findingIds, item, `Item "${item.id}" of explanation "${scene.id}"`);
        }
      }
      for (const link of scene.links) {
        if (link.from === link.to) throw Error(`Link in explanation "${scene.id}" must join two distinct items, not ${link.from} twice.`);
        for (const endpoint of [link.from, link.to]) {
          if (!itemIds.has(endpoint)) throw Error(`Link in explanation "${scene.id}" references an unknown item: ${endpoint}.`);
        }
        checkExplanationGrounding(findingIds, link, `Link "${link.from} -> ${link.to}" of explanation "${scene.id}"`);
      }
    }
  }
  if (value.illustrations !== undefined) {
    for (const [i, illustration] of value.illustrations.entries()) {
      for (const item of illustration.items) {
        const finding = value.findings.find(f => f.id === item.findingId);
        if (!finding) throw Error(`Illustration ${i + 1} references an unknown finding: ${item.findingId}.`);
        if (!finding.targets.includes(item.target)) throw Error(`Illustration ${i + 1} target "${item.target}" is not a board target of finding ${item.findingId}.`);
      }
    }
  }
  return structuredClone(value);
}

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const basisLabel = basis => ({ source: 'Source-backed statement (not independently reproduced)', inference: 'Inference — requires review', unknown: 'Unknown — evidence missing' })[basis];
const lineCountOf = text => text.split('\n').length;
// Ranges the model did not receive as complete lines: retained minus delivered.
function unreadSpans(source, ranges) {
  const last = source.startLine + lineCountOf(source.text) - 1;
  const spans = [];
  let cursor = source.startLine;
  for (const range of ranges) {
    if (range.startLine > cursor) spans.push({ startLine: cursor, endLine: range.startLine - 1 });
    cursor = Math.max(cursor, range.endLine + 1);
  }
  if (cursor <= last) spans.push({ startLine: cursor, endLine: last });
  return spans;
}
// Bounded span list: keeps delivered/unassessed summaries short even when a
// source is split into hundreds of tiny ranges. Never fabricates a count.
const formatLineSpans = (spans, budget = 400) => {
  const parts = [];
  let length = 0, index = 0;
  for (; index < spans.length; index++) {
    const { startLine: a, endLine: b } = spans[index];
    const piece = a === b ? `${a}` : `${a}–${b}`;
    const cost = piece.length + (parts.length ? 2 : 0);
    if (length + cost > budget) break;
    parts.push(piece);
    length += cost;
  }
  const label = parts.join(', ');
  const remaining = spans.length - index;
  return remaining ? `${label}${parts.length ? ', ' : ''}… +${remaining} more` : label;
};
// null => historical record with no recorded coverage; [] => recorded, none delivered.
function deliveredRanges(analysis, sourceId) {
  if (!Array.isArray(analysis.readCoverage)) return null;
  return analysis.readCoverage.find(entry => entry.sourceId === sourceId)?.ranges ?? null;
}
function coverageDisclosure(analysis, source) {
  const ranges = deliveredRanges(analysis, source.id);
  if (ranges === null) return '<p>Model-read coverage not recorded; it is unknown which retained lines were delivered to the model.</p>';
  const delivered = ranges.length ? formatLineSpans(ranges) : 'none';
  const spans = unreadSpans(source, ranges);
  const unassessed = spans.length ? ` Retained lines not delivered and left unassessed: ${formatLineSpans(spans)}.` : ' All retained lines were delivered.';
  return `<p>Complete lines delivered to the model (delivery is not proof of comprehension): ${delivered}.${unassessed}</p>`;
}

const EXPLANATION_KIND_LABELS = { memory: 'Memory / object layout', structure: 'Data / payload structure',
  sequence: 'Interaction sequence', state: 'Object / program states', comparison: 'Before / after comparison',
  attack: 'Illustrated attack scene', parallel: 'Parallel target scenarios' };
const PLACEMENT_LABELS = { actor: 'Actor', exchange: 'Exchange', target: 'Target', outcome: 'Outcome' };
const BASIS_RANK = { source: 0, inference: 1, unknown: 2 };
// Scenes carry no basis of their own: the visible basis of every panel item
// and link is the weakest basis among the findings it references, so a scene
// built on a downgraded or not-assessed finding can never read as established.
const weakestBasis = findings => findings.length
  ? findings.reduce((weakest, f) => BASIS_RANK[f.basis] > BASIS_RANK[weakest] ? f.basis : weakest, 'source')
  : 'unknown';

// Structured mechanism scenes render in every report, before (and regardless
// of) any illustration build. Citations are the referenced findings' own
// evidence, deduplicated — never ranges guessed from the wording.
function explanationSection(analysis, citation) {
  const byId = new Map(analysis.findings.map(f => [f.id, f]));
  const grounding = ids => {
    const findings = ids.map(id => byId.get(id)).filter(Boolean);
    const refs = new Map();
    for (const finding of findings) for (const ref of finding.evidence) {
      refs.set(`${ref.sourceId}:${ref.startLine}-${ref.endLine}`, ref);
    }
    return { basis: weakestBasis(findings), citations: [...refs.values()], findings };
  };
  return '<h3>Mechanism explanations</h3>'
    + '<p>Schematic readings of the retained sources by static analysis only: nothing was compiled, executed or observed at runtime, and layouts are interpretations, not ABI-accurate addresses. Every item and link shows the weakest evidence basis of the findings that ground it, followed by those findings\u2019 citations. Attack and parallel scenes are semantic compositions of the referenced findings: they claim no physical network, containment or deployment layout, and uncertain outcomes stay visibly uncertain.</p>'
    + analysis.explanations.map(scene => {
      const items = scene.panels.flatMap(panel => panel.items);
      const labelOf = new Map(items.map(item => [item.id, item.label]));
      const entry = (label, role, value, ids, arrow, hints = '') => {
        const g = grounding(ids);
        return `<li>${arrow ? `${esc(labelOf.get(arrow.from) || arrow.from)} → ${esc(labelOf.get(arrow.to) || arrow.to)}: ` : ''}<strong>${esc(label)}</strong>${role ? ` · ${esc(role)}` : ''}${hints ? ` · ${esc(hints)}` : ''}${value ? ` — ${esc(value)}` : ''} (${esc(basisLabel(g.basis))})${g.citations.map(citation).join('')}</li>`;
      };
      // Composition hints are disclosed, never asserted: an asset hint its own
      // findings do not ground (the exact same assetKind on a referenced
      // non-unknown finding, every reference non-unknown) is reported as not
      // drawn, matching what illustrations render.
      const assetHint = item => {
        if (!item.assetKind) return '';
        const refs = item.findingIds.map(id => byId.get(id)).filter(Boolean);
        return refs.every(f => f.basis !== 'unknown') && refs.some(f => f.assetKind === item.assetKind)
          ? `asset ${item.assetKind}` : `ungrounded asset hint (${item.assetKind}), not drawn as an illustration asset`;
      };
      const hintsOf = item => [item.row !== undefined ? `row ${item.row}` : '', assetHint(item)].filter(Boolean).join(' · ');
      const sceneBasis = weakestBasis(grounding([...new Set([...items.flatMap(i => i.findingIds), ...scene.links.flatMap(l => l.findingIds)])]).findings);
      return `<article><h4>${esc(scene.title)}</h4><p><strong>${esc(basisLabel(sceneBasis))}</strong> · ${esc(EXPLANATION_KIND_LABELS[scene.kind])}</p>`
        + (scene.detail ? `<p class="narrative">${esc(scene.detail)}</p>` : '')
        + scene.panels.map(panel => `<p><strong>${esc(panel.title)}</strong>${panel.placement ? ` · ${esc(PLACEMENT_LABELS[panel.placement])} placement` : ''}</p><ul>${panel.items.map(item => entry(item.label, item.role, item.value, item.findingIds, undefined, hintsOf(item))).join('')}</ul>`).join('')
        + (scene.links.length ? `<p>Relationships within the scene:</p><ul>${scene.links.map(link => entry(link.label, '', '', link.findingIds, link)).join('')}</ul>` : '')
        + '</article>';
    }).join('');
}

// Shared safe fragment for the standalone explainer and project technical report.
export function securityAnalysisSection(value, { includeSources = false, prefix = 'security' } = {}) {
  const analysis = validateSecurityAnalysis(value);
  const sourceAnchors = new Map(analysis.sources.map((source, i) => [source.id, `${prefix}-source-${i + 1}`]));
  const citation = ref => {
    const { source, text } = securityEvidence(analysis, ref);
    return `<details open><summary><a href="#${esc(sourceAnchors.get(source.id))}">${esc(source.name)}</a> · lines ${ref.startLine}–${ref.endLine}</summary><pre class="narrative">${esc(text)}</pre></details>`;
  };
  // Finding-level restraint for non-established records: every item carries its
  // own caveat instead of relying on the report-wide disclaimer alone.
  const nonEstablished = ['reserved', 'rejected'].includes(analysis.status)
    ? `<p class="caveat"><strong>CVE record is ${esc(analysis.status)}.</strong> This item is not evidence of an established vulnerability; affected versions, severity and exploitability remain unestablished for this identifier. Citations preserve record facts and associated material, not proof of applicability.</p>`
    : '';
  return `<h3>${esc(analysis.title)}</h3><p>${esc(analysis.cveId || 'No CVE identifier supplied')} · Record status: ${esc(analysis.status)} · Analysis: ${esc(analysis.generatedAt)}</p>`
    + '<p><strong>Static source analysis only.</strong> No PoC was executed, no target was contacted, and exploitability or applicability to a deployment has not been verified. Severity does not establish deployment-specific risk.</p>'
    + `<p class="narrative">${esc(analysis.summary)}</p>`
    + `<ul>${analysis.warnings.map(w => `<li>${esc(w)}</li>`).join('')}${['reserved', 'rejected'].includes(analysis.status) ? `<li>The CVE record is ${esc(analysis.status)}; associated code is not proof of an established vulnerability.</li>` : ''}</ul>`
    + analysis.findings.map((finding, i) => `<article><h4>${i + 1}. ${esc(finding.title)}</h4>${nonEstablished}<p><strong>${esc(basisLabel(finding.basis))}</strong> · ${esc(finding.kind)} · ${esc(finding.view)}</p><p class="narrative">${esc(finding.detail)}</p>${finding.evidence.map(citation).join('')}<p>Board references: ${esc(finding.targets.join(', ') || 'Not illustrated')}</p></article>`).join('')
    + (analysis.explanations?.length ? explanationSection(analysis, citation) : '')
    + (analysis.relationships.length ? '<h3>Logical relationships</h3><ul>' + analysis.relationships.map(r => `<li>${esc(analysis.findings.find(f => f.id === r.from).title)} → ${esc(analysis.findings.find(f => f.id === r.to).title)}: ${esc(r.label)} (${esc(basisLabel(r.basis))})${r.evidence.map(citation).join('')}</li>`).join('') + '</ul>' : '')
    + '<h3>Sources and coverage</h3><p>Evidence excerpts are included above. Full retained source text is ' + (includeSources ? 'included below; review before sharing.' : 'omitted from this report.') + '</p>'
    + analysis.sources.map(source => `<article id="${esc(sourceAnchors.get(source.id))}"><h4>${esc(source.name)}</h4>${source.url ? `<p><a href="${esc(source.url)}" rel="noopener noreferrer">${esc(source.url)}</a></p>` : ''}<p>Retrieved: ${esc(source.retrievedAt)} · SHA-256: <code>${esc(source.hash)}</code></p><p>Included lines ${source.startLine}–${source.startLine + source.text.split('\n').length - 1} of ${source.totalLines}${source.partial ? ' · PARTIAL SOURCE — omitted content was not analyzed' : ' · Retained source complete; linked files were not automatically read'}</p>${coverageDisclosure(analysis, source)}<ul>${source.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>${includeSources ? `<details open><summary>Retained source text</summary><pre class="narrative">${esc(source.text)}</pre></details>` : ''}</article>`).join('');
}

export function securityAnalysisHTML(value, { includeSources = false, figures = [] } = {}) {
  const analysis = validateSecurityAnalysis(value);
  // Figures are produced by the native board renderer, not by a model or imported source.
  const images = figures.map(figure => `<figure><img alt="${esc(figure.title)}" src="data:image/svg+xml;charset=utf-8,${esc(encodeURIComponent(figure.svg))}"><figcaption>${esc(figure.title)}</figcaption></figure>`).join('');
  return `<!doctype html><html lang="en" data-security-analysis="${esc(analysis.id)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(analysis.title)}</title><style>:root{color-scheme:light;background:#fff}body{font:15px/1.6 system-ui,sans-serif;max-width:1000px;margin:32px auto;padding:0 24px;color:#182330}h1,h3,h4,p,li{overflow-wrap:anywhere}article{border-top:1px solid #ccd3da;padding:12px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;border:1px solid #ccd3da;font-size:12px}code{overflow-wrap:anywhere}.narrative{white-space:pre-wrap}img{width:100%;height:auto}figure{break-inside:avoid}a{color:#075f99}@media print{body{margin:0;padding:0;font-size:10pt}details>pre{display:block}summary{display:block}article{break-inside:auto}h3,h4{break-after:avoid}@page{size:A4;margin:18mm}}</style></head><body><h1>Security analysis</h1>${images}${securityAnalysisSection(analysis, { includeSources })}</body></html>`;
}
