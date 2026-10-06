import { escAttr as esc } from './press.js';
import { tr } from '../i18n.js';
export function impactSummary(impact) {
  const rows = impact.affected
    .map(
      (item) =>
        `<tr><td><button type="button" data-impact-id="${esc(JSON.parse(item.scope)[0] || item.id)}">${esc(item.label)}</button></td><td>${esc(item.scopeTitle)}</td><td>${esc(item.distance === 0 ? tr('Direct change') : tr('Connected review scope'))}</td></tr>`,
    )
    .join('');
  return `<section aria-label="${esc(tr('Change impact'))}"><h3>${esc(tr('Change impact'))}</h3>
    <p>${esc(tr('{changed} direct changes; {affected} items in the review scope.', { changed: impact.changed.length, affected: impact.affected.length }))}</p>
    <p>${esc(tr('Connected items may need review; this is not proof that they are broken.'))}</p>
    <table><thead><tr><th>${esc(tr('Part / connection'))}</th><th>${esc(tr('Scope'))}</th><th>${esc(tr('Reason'))}</th></tr></thead><tbody>${rows}</tbody></table>
    ${['requirements', 'decisions'].map((key) => `<h4>${esc(key === 'requirements' ? tr('Requirements to review') : tr('Decisions to review'))}</h4><ul>${impact[key].map((r) => `<li>${esc(r.id)} — ${esc(r.text)} (${esc(r.owner || tr('No owner'))}) · ${esc(r.scopeTitle)}${r.removed ? ` · ${esc(tr('Removed'))}` : ''}</li>`).join('') || `<li>${esc(tr('None'))}</li>`}</ul>`).join('')}
    <h4>${esc(tr('Verification evidence to review'))}</h4>
    <ul>${(impact.verification || []).map(r => `<li><strong>${esc(r.id)}</strong> · ${esc(r.scopeTitle)} · ${esc(r.owner || tr('No owner'))}
      <p>${esc(r.needsReview ? tr('Evidence needs re-review') : r.verified ? tr('Verified') : tr('Not verified'))}${!r.allocated ? ` · ${esc(tr('Missing allocations'))}` : ''}</p>
      <p>${esc(tr('Verification method'))}: ${esc(r.method || tr('Unknown'))}<br>${esc(tr('Evidence URL'))}: ${esc(r.evidence || tr('Unknown'))}</p></li>`).join('') || `<li>${esc(tr('None'))}</li>`}</ul>
    <p>${esc(impact.budgets.changed ? tr('Calculated power budgets changed.') : tr('Calculated power budgets are unchanged.'))}</p>
    <h4>${esc(tr('New or changed findings'))}</h4><ul>${impact.newFindings.map((f) => `<li>${esc(f.level)}: ${esc(f.message)}</li>`).join('') || `<li>${esc(tr('None'))}</li>`}</ul></section>`;
}
