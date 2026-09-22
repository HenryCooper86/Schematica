// Read-only declaration coverage, including internal subsystem connections.
// A checked connection has passed declared-data checks, not hardware validation.
import { analysisDoc } from './analysis-doc.js';
import { checkDoc } from './drc.js';
import { interfaceCompatibility, missingInterfaceDeclarations } from './interface-checks.js';
import { tr } from './i18n.js';

export function validationCoverage(source) {
  const doc = analysisDoc(source);
  const errors = new Set(interfaceCompatibility(doc).filter(f => f.level === 'error').map(f => f.ids[0]));
  const connections = doc.wires.map(wire => {
    const applicable = !['flow', 'link'].includes(wire.bus);
    const missing = applicable ? missingInterfaceDeclarations(doc, wire) : [];
    const status = !applicable ? 'excluded' : errors.has(wire.id) ? 'failed' : missing.length ? 'unassessed' : 'checked';
    return { id: wire.id, label: wire.label ? `${wire.id} (${wire.label})` : wire.id, bus: wire.bus, status, missing,
      ids: [wire.selectionId || wire.id] };
  });
  const count = status => connections.filter(c => c.status === status).length;
  return { total: connections.length, applicable: connections.filter(c => c.status !== 'excluded').length,
    checked: count('checked'), failed: count('failed'), unassessed: count('unassessed'), excluded: count('excluded'), connections };
}

export function reviewReadiness(doc, findings = checkDoc(doc), coverage = validationCoverage(doc)) {
  const blockingFindings = findings.filter(f => ['error', 'warning'].includes(f.level)).length;
  return { ready: coverage.applicable > 0 && !coverage.failed && !coverage.unassessed && !blockingFindings,
    blockingFindings, coverage };
}

export function coverageSummary(coverage) {
  return tr('Interface coverage: {checked} checked · {failed} failed · {unassessed} unassessed · {excluded} not applicable.', coverage);
}
export const coverageScope = () => tr('Checks compare declared data only. Flow and relationship links are not applicable. Power and ground checks cover declared voltage and direction, not current capacity. Sources are not independently verified; this is not hardware validation.');
