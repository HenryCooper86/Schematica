import { interfaceChecklist } from '../interface-workbench.js';
import { interfaceCompatibility } from '../interface-checks.js';
import { tr } from '../i18n.js';
import { escAttr as esc } from './press.js';

export function mountInterfaceGuide(body, doc, wire, statuses, onNext) {
  const form = body.querySelector('form');
  if (!form || !wire) return;
  const steps = interfaceChecklist(doc, wire);
  const findings = interfaceCompatibility(doc).filter(f => f.ids[0] === wire.id && f.level === 'error');
  const next = [...statuses.slice(statuses.findIndex(r => r.id === wire.id) + 1), ...statuses.slice(0, statuses.findIndex(r => r.id === wire.id))]
    .find(r => ['failed', 'unassessed'].includes(r.code));
  const guide = document.createElement('section');
  guide.id = 'interface-guide';
  const excluded = ['flow', 'link'].includes(wire.bus);
  guide.innerHTML = `<h3>${esc(tr('Guided interface completion'))}</h3>
    <p>${esc(tr('Blank fields remain unknown. Save declared values before moving to another connection.'))}</p>
    <p role="status" data-guide-status>${esc(excluded ? tr('Not applicable') : steps.length ? tr('{count} declarations still needed.', { count: steps.length }) : tr('All required declarations are present.'))}</p>
    <ol>${steps.map(s => `<li><button type="button" data-guide-field="${esc(s.field)}">${esc(s.endpoint)} · ${esc(s.label)}</button><small>${esc(s.explanation)}</small></li>`).join('')}</ol>
    ${findings.length ? `<p>${esc(tr('Resolve these conflicts before review:'))}</p><ul>${findings.map(f => `<li>${esc(f.message)}</li>`).join('')}</ul>` : ''}
    <button type="button" data-guide-next ${next ? '' : 'disabled'}>${esc(tr('Next connection needing review'))}</button>`;
  form.before(guide);
  guide.querySelectorAll('[data-guide-field]').forEach(button => {
    button.onclick = () => {
      const field = form.elements.namedItem(button.dataset.guideField);
      field?.scrollIntoView({ block: 'center' });
      field?.focus({ preventScroll: true });
    };
  });
  guide.querySelector('[data-guide-next]').onclick = () => { if (next) onNext(next.id); };
  form.addEventListener('input', () => {
    guide.querySelector('[data-guide-next]').disabled = true;
    guide.querySelector('[data-guide-status]').textContent = tr('Save your edits before moving to the next connection.');
  });
}
