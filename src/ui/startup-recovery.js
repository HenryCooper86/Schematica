import { download } from '../export.js';
import { escAttr as esc, toast } from './press.js';
import { tr } from '../i18n.js';

export function renderStartupRecovery(body, recovery, flush, paint) {
  if (!recovery || (!recovery.list().length && !recovery.readError)) return;
  const section = document.createElement('section'); section.id = 'startup-recovery';
  section.innerHTML = `<h3>${esc(tr('Original autosave recovery'))}</h3>
    <p>${esc(tr('Startup found unreadable or repaired data. Original copies stay separate from saved revisions and are retained after review.'))}</p>
    ${recovery.readError ? `<p role="alert">${esc(recovery.readError)}</p>` : ''}
    ${recovery.list().map(entry => `<article data-recovery="${esc(entry.id)}"><strong>${esc(entry.error ? tr('Saved board could not be opened') : entry.warnings.length ? tr('Saved board loaded with repairs') : tr('Original saved board'))}</strong>
      <time>${esc(new Date(entry.at).toLocaleString())}</time>
      <p>${esc(entry.durable ? tr('Original data saved on this device.') : tr('Autosave is paused to protect the original data. Export your current board or retry recovery.'))}</p>
      ${entry.error ? `<p>${esc(entry.error)}</p>` : ''}<ul>${entry.warnings.map(warning => `<li>${esc(warning)}</li>`).join('')}</ul>
      <button type="button" data-recovery-export="${esc(entry.id)}">${esc(tr('Export original data'))}</button>
      ${entry.reviewed ? `<span>${esc(tr('Reviewed'))}</span>` : `<button type="button" data-recovery-reviewed="${esc(entry.id)}"${entry.durable ? '' : ' disabled'}>${esc(tr('Mark reviewed'))}</button>`}</article>`).join('')}
    <button type="button" data-recovery-retry>${esc(tr('Retry preserving original data'))}</button>`;
  body.prepend(section);
  section.querySelectorAll('[data-recovery-export]').forEach(button => { button.onclick = () => {
    const entry = recovery.list().find(value => value.id === button.dataset.recoveryExport);
    if (entry) download('original-autosave-' + entry.id + '.json', entry.text, 'application/json');
  }; });
  section.querySelectorAll('[data-recovery-reviewed]').forEach(button => { button.onclick = () => {
    try { recovery.acknowledge(button.dataset.recoveryReviewed); paint(); }
    catch (error) { toast(error.message); }
  }; });
  section.querySelector('[data-recovery-retry]').onclick = () => { recovery.retry(); flush(); paint(); };
}
