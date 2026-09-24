import { designFingerprint } from './workflows.js';
import { reviewReadiness } from './validation-coverage.js';

export function firstProjectProgress(doc, { checked = '', exported = '' } = {}) {
  const mark = designFingerprint(doc);
  const readiness = reviewReadiness(doc);
  const coverage = readiness.coverage;
  return { mark, ready: readiness.ready, checks: [
    doc.nodes.length > 0,
    doc.wires.length > 0,
    coverage.applicable > 0 && coverage.unassessed === 0 && coverage.failed === 0,
    checked === mark,
    exported === mark && readiness.ready,
  ] };
}
