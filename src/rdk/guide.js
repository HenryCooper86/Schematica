// Pure document-derived reference guide. No provider, settings or command access.
import { profileFor, RDK_PRODUCTS } from './catalogue.js';
import { cameraOccupancy } from './checks.js';
import { checkDoc } from '../drc.js';
import { partOf } from '../custom.js';
import { tr, trd } from '../i18n.js';

// Placeholder fill with no dictionary lookup: the untranslated path for
// profileFacts, used only by referenceText (the copilot's rdk_reference
// tool, which always reads English regardless of interface language).
// Also used bare as an Array.prototype.map callback (profileFacts passes
// `trd` to `.map`), so a non-object second argument (index, array) must be
// treated as "no vars" rather than fed to the `in` operator.
const fillVars = (text, vars) => {
  const s = String(text ?? '');
  return vars && typeof vars === 'object' ? s.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : s;
};
// profileFacts shadows tr/trd below with translate-or-raw switches of the
// same name, so its calls stay literal tr and trd text for the i18n
// coverage test; these capture the real functions before that shadowing.
const trBase = tr;
const trdBase = trd;

export function rdkProfile(node) {
  return profileFor(
    node?.kind === 'rdksoftware'
      ? { kind: node.kind, sublabel: node.fields?.package }
      : node,
  );
}
function compatiblePeripherals(profile) {
  if (profile?.kind !== 'aisbc') return [];
  return RDK_PRODUCTS.filter(
    (p) =>
      !['aisbc', 'rdksoftware'].includes(p.kind) &&
      p.compatibility.boardIds?.includes(profile.id) &&
      !p.compatibility.unsupportedBoardIds.includes(profile.id),
  );
}
export function safeSources(profile) {
  const sources = [profile, ...compatiblePeripherals(profile)].flatMap(
    (p) => p?.sources || [],
  );
  return [...new Map(sources.map((s) => [s.url, s])).values()].filter((s) => {
    try {
      const url = new URL(s.url);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  });
}
// Flatten user text and encode Markdown punctuation, including HTML and links.
export function markdownText(value) {
  return String(value ?? '')
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/[&<>\\`*_{}\[\]()#+.!|~-]/g, (c) => `&#${c.charCodeAt(0)};`);
}
function profileFacts(p, { translate = true } = {}) {
  const tr = translate ? trBase : fillVars;
  const trd = translate ? trdBase : fillVars;
  if (!p) return [tr('Package or product identity is unverified.')];
  const lines = [
    p.name,
    tr('Checked: {date}', { date: p.checkedOn }),
    trd(p.notes),
    p.ports
      ? tr('Ports: {list}', { list: p.ports.map((port) => `${port.id} (${port.bus})`).join(', ') })
      : tr('Ports: unverified; generic drawing ports are not validated connectors'),
  ];
  if (p.power) {
    lines.push(tr('Power: {rail}; input {min}–{max}V{current}{power}{load}', {
      rail: p.power.rail, min: p.power.inputMinV, max: p.power.inputMaxV,
      current: p.power.recommendedCurrentA ? tr('; recommended {a}A', { a: p.power.recommendedCurrentA }) : '',
      power: p.power.recommendedPowerW ? tr('; recommended {w}W', { w: p.power.recommendedPowerW }) : '',
      load: p.power.maxLoadPowerW ? tr('; maximum-load supply {w}W', { w: p.power.maxLoadPowerW }) : '',
    }));
  }
  lines.push(...p.requirements.map(trd));
  if (p.compatibility.boardIds) lines.push(tr('Documented boards: {list}', { list: p.compatibility.boardIds.join(', ') }));
  if (p.compatibility.unsupportedBoardIds.length) lines.push(tr('Unsupported boards: {list}', { list: p.compatibility.unsupportedBoardIds.join(', ') }));
  const peripherals = compatiblePeripherals(p);
  if (peripherals.length) {
    lines.push(tr('Documented peripherals: {list}', { list: peripherals.map((part) => part.name).join(', ') }));
    for (const part of peripherals) lines.push(tr('{name} requirements: {list}', { name: part.name, list: part.requirements.map(trd).join(' ') }));
    lines.push(tr('These documented relationships do not validate other peripherals or replace carrier, adapter and connector requirements.'));
  }
  return lines;
}
export function referenceText(profile) {
  return [
    ...profileFacts(profile, { translate: false }),
    ...safeSources(profile).map(
      (s) => `${s.title}${s.archived ? ' (archived)' : ''}: ${s.url}`,
    ),
  ].join('\n');
}
export function rdkFacts(node, doc) {
  const lines = profileFacts(rdkProfile(node));
  for (const slot of cameraOccupancy(doc, node))
    lines.push(
      tr('CSI {port}: {endpoints}', { port: slot.port, endpoints: slot.endpoints.length ? slot.endpoints.map((e) => `${e.node}.${e.port}`).join(', ') : tr('unused') }),
    );
  return lines;
}
export function rdkGuide(doc) {
  if (!doc.nodes.some((n) => n.kind === 'aisbc' && rdkProfile(n))) return '';
  const m = markdownText;
  const out = [
    tr('# RDK setup guide: {title}', { title: m(doc.title) }),
    '',
    tr('Architecture reference only. Verify the exact hardware revision, adapters, power supply and software documentation before setup. Diagram checks do not certify hardware operation.'),
    '',
    tr('## Bill of materials'),
  ];
  // Include every diagram component: unknown accessories must remain visible.
  for (const n of doc.nodes) {
    // A part with no part number falls back to its palette name, not its kind id.
    const what = n.kind === 'rdksoftware'
      ? n.fields?.package || tr('package not selected')
      : n.sublabel || trd(partOf(n).name);
    out.push(`- ${m(n.label)} (${m(n.id)}): ${m(what)}`);
    if (rdkProfile(n) || n.kind === 'rdksoftware')
      for (const line of rdkFacts(n, doc)) out.push(`  - ${m(line)}`);
    if (n.notes) out.push(tr('  - Component notes / assumptions: {notes}', { notes: m(n.notes) }));
  }
  out.push('', tr('## Connections'));
  for (const w of doc.wires)
    out.push(
      `- ${m(w.from.node)}.${m(w.from.port)} → ${m(w.to.node)}.${m(w.to.port)} (${m(w.bus)})`,
    );
  if (!doc.wires.length) out.push(tr('No connections drawn.'));
  out.push('', tr('## Software mapping'));
  for (const n of doc.nodes.filter((n) => n.kind === 'rdksoftware')) {
    const target = doc.nodes.find(
      (b) => b.id === n.fields?.target && b.kind === 'aisbc',
    );
    out.push(
      tr('- {label}: package {package}; target: {target}; Runtime: {runtime}', {
        label: m(n.label),
        package: m(n.fields?.package || tr('not selected')),
        target: m(target ? `${target.label} (${target.id})` : tr('{id} (missing or non-board target)', { id: n.fields?.target || tr('not selected') })),
        runtime: m(n.fields?.runtime || tr('not selected (optional component-level assumption)')),
      }),
    );
  }
  out.push('', tr('## Diagram notes and assumptions'));
  for (const note of doc.notes) out.push(`- ${m(note.text)}`);
  if (!doc.notes.length) out.push(tr('No diagram notes recorded.'));
  out.push('', tr('## Findings'));
  const findings = checkDoc(doc);
  for (const f of findings)
    out.push(`- ${m(f.level === 'error' ? tr('error') : tr('warning'))} ${f.rule}: ${m(f.message)}`);
  if (!findings.length)
    out.push(
      tr('No current architectural findings. Physical operation still requires verification.'),
    );
  out.push(
    '',
    tr('## Preparation checklist'),
    tr('- Confirm the exact hardware revision and any carrier or expansion board against the official references; resolve unverified connectors and adapter requirements.'),
    tr('- Verify the required cables, connector orientation and separate stereo CSI paths against the documented assembly.'),
    tr('- Check power voltage, supply capacity, regulation and all return/ground connections; resolve the current findings above.'),
    tr('- Review each software package, target board and selected runtime in the software mapping against its official documentation. If runtime is not selected, record that decision before setup.'),
    tr('- Create a hardware validation record with the actual board revision, assembly, software/runtime versions, observations and unresolved issues after physical testing. This guide does not establish validation results.'),
  );
  out.push('', tr('## Official references'));
  const sources = new Map();
  for (const n of doc.nodes)
    for (const s of safeSources(rdkProfile(n))) sources.set(s.url, s);
  for (const s of sources.values())
    out.push(
      `- [${m(trd(s.title))}${s.archived ? m(tr(' (archived)')) : ''}](<${s.url.replace(/[<>\s()]/g, (c) => encodeURIComponent(c))}>)`,
    );
  return out.join('\n') + '\n';
}
