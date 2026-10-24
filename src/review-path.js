// The review path: one ordered view of the work that turns a drawing into a
// reviewable handoff, built from the existing checks rather than a new
// workflow state. Four stages — Prepare, Check, Resolve, Handoff — each with
// items that name the exact control to go to. The caller supplies what the
// document cannot know: which design fingerprint was last checked, exported
// and saved as a revision.
import { checkDoc } from './drc.js';
import { validationCoverage, reviewReadiness } from './validation-coverage.js';
import { missingInterfaceDeclarations } from './interface-checks.js';
import { interfaceChecklist } from './interface-workbench.js';
import { designFingerprint } from './workflows.js';
import { tr } from './i18n.js';

export const STAGES = ['prepare', 'check', 'resolve', 'handoff'];
export const stageName = id => ({ prepare: tr('Prepare'), check: tr('Check'), resolve: tr('Resolve'), handoff: tr('Handoff') })[id];

const EXCLUDED = new Set(['flow', 'link']);
const endpointLabel = (doc, ref) => doc.nodes.find(n => n.id === ref?.node)?.label || ref?.node || '?';
const wireLabel = (doc, wire) => `${endpointLabel(doc, wire.from)} → ${endpointLabel(doc, wire.to)} (${wire.bus})`;

export function reviewPath(doc, { checked = '', exported = '', revisions = [] } = {}) {
  const mark = designFingerprint(doc);
  const findings = checkDoc(doc);
  const coverage = validationCoverage(doc);
  const readiness = reviewReadiness(doc, findings, coverage);
  const wires = doc.wires.filter(w => !EXCLUDED.has(w.bus));
  const unassessed = wires.filter(w => missingInterfaceDeclarations(doc, w).length);
  const untitled = !doc.title?.trim() || doc.title === tr('Untitled Board');

  const prepare = [
    { id: 'title', label: tr('Name the board'), done: !untitled, target: { type: 'title' } },
    { id: 'parts', label: tr('Place at least two parts'), done: doc.nodes.length >= 2, target: { type: 'palette' } },
    { id: 'wires', label: tr('Connect their ports'), done: doc.wires.length > 0, target: { type: 'connect' } },
    ...(wires.length ? unassessed.length ? unassessed.map(w => ({
      id: `declare:${w.id}`, label: tr('Declare {wire}', { wire: wireLabel(doc, w) }), done: false,
      detail: missingInterfaceDeclarations(doc, w).join(', '),
      target: { type: 'interface', wire: w.id, field: interfaceChecklist(doc, w)[0]?.field },
    })) : [{ id: 'declared', label: tr('Every interface is declared'), done: true, target: { type: 'interface', wire: wires[0].id } }] : []),
  ];

  const blocking = findings.filter(f => ['error', 'warning'].includes(f.level) && f.rule !== 'interface-incomplete');
  const resolve = blocking.map((f, i) => ({
    id: `finding:${i}`, label: f.message, done: false, level: f.level,
    target: f.record ? { type: 'requirement', record: f.record }
      : f.field ? { type: 'interface', wire: f.ids[0], field: f.field }
      : { type: 'select', ids: f.ids },
  }));

  const checkDone = checked === mark;
  const check = [{ id: 'run', label: checkDone ? tr('Checks run on this version') : tr('Run checks on this version'), done: checkDone, target: { type: 'check' } }];
  const saved = revisions.includes(mark);
  const handoff = [
    { id: 'revision', label: saved ? tr('This version is saved as a revision') : tr('Save this version as a revision'), done: saved, target: { type: 'revision' } },
    { id: 'package', label: tr('Download the review package'), done: exported === mark && readiness.ready, target: { type: 'package' } },
  ];

  const stages = [
    { id: 'prepare', items: prepare },
    { id: 'check', items: check },
    { id: 'resolve', items: resolve },
    { id: 'handoff', items: handoff },
  ].map(stage => ({ ...stage, name: stageName(stage.id), open: stage.items.filter(i => !i.done).length,
    // Resolve only counts once this version has been checked; a stale check
    // cannot vouch for an empty finding list.
    done: stage.items.every(i => i.done) && (stage.id !== 'resolve' || checkDone) }));
  const current = stages.find(s => !s.done)?.id || 'handoff';
  const complete = stages.every(s => s.done);
  return { mark, stages, current, complete, ready: readiness.ready, coverage, findings: blocking.length };
}
