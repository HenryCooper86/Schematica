import { buildTechnicalReport, technicalReportHTML } from '../technical-report.js';
import { normalizeReportSettings, MAX_REPORT_LOGO_BYTES } from '../report-settings.js';
import { download } from '../export.js';
import { escAttr as esc, safe, eng } from './press.js';
import { tr } from '../i18n.js';

export function renderTechnicalReport({ body, store, baseline, onSaved = () => {} }) {
  const details = normalizeReportSettings(store.doc.engineering?.technicalReport || {});
  let preview = null, ready = false, logoPending = false, logoRequest = 0;
  const field = (key, label, limit = 240, type = 'text', value = details[key]) => `<label>${esc(label)}<input name="${key}" type="${type}" maxlength="${limit}" value="${esc(value)}"></label>`;
  const area = (key, label) => `<label>${esc(label)}<textarea name="${key}" maxlength="20000" rows="3">${esc(details[key])}</textarea></label>`;
  const sections = [
    ['architecture', tr('System architecture')], ['interfaces', tr('Interfaces and connections')],
    ['requirements', tr('Requirements and allocation')], ['decisions', tr('Design decisions')],
    ['power', tr('Power budgets and assumptions')], ['bom', tr('Component list')],
    ['verification', tr('Verification and evidence')], ['changes', tr('Revision comparison')],
  ];
  body.innerHTML = `<p>${esc(tr('Create a technical deliverable for clients and managers. Report details are saved with the board when you preview.'))}</p>
    <p>${esc(baseline ? tr('Baseline: {title}', { title: baseline.title }) : tr('Choose a revision as the baseline to include a comparison.'))}</p>
    <form id="technical-report-form">
      <input type="hidden" name="logo" value="${esc(details.logo)}">
      ${field('title', tr('Report title'), 240, 'text', details.title || (store.doc.title + ' - Technical report').slice(0, 240))}
      ${field('organization', tr('Organization'))}${field('author', tr('Prepared by'))}${field('recipient', tr('Prepared for'))}
      ${field('revision', tr('Document revision'), 80)}${field('date', tr('Document date'), 10, 'date', details.date || new Date().toISOString().slice(0, 10))}
      <label>${esc(tr('Document status'))}<select name="status">${[['draft', tr('Draft')], ['review', tr('For review')], ['issued', tr('Issued')]].map(([value, label]) => `<option value="${value}"${details.status === value ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
      <div class="report-branding"><label>${esc(tr('Company logo (PNG or JPEG, up to 256 KiB)'))}<input id="report-logo" type="file" accept="image/png,image/jpeg"></label><p id="report-logo-status">${esc(details.logo ? tr('Logo included') : tr('No logo selected'))}</p><button type="button" data-report-action="remove-logo"${details.logo ? '' : ' disabled'}>${esc(tr('Remove logo'))}</button></div>
      ${area('summary', tr('Executive summary'))}${area('scope', tr('Project scope'))}${area('architecture', tr('Architecture explanation'))}${area('risks', tr('Risks and open issues'))}${area('nextSteps', tr('Next steps'))}
      <fieldset class="report-sections"><legend>${esc(tr('Report sections'))}</legend><p>${esc(tr('The cover, executive summary, and risks remain in every report.'))}</p>${sections.map(([key, label]) => `<label><input name="section" type="checkbox" value="${key}"${details.sections.includes(key) ? ' checked' : ''}>${esc(label)}</label>`).join('')}</fieldset>
      <p>${esc(tr('Report headings are in English. Your project text is preserved.'))}</p>
      <button type="submit">${esc(tr('Save and preview report'))}</button>
    </form>
    <div class="report-export-actions"><button type="button" data-report-action="html" disabled>${esc(tr('Export report HTML'))}</button><button type="button" data-report-action="pdf" disabled>${esc(tr('Export report PDF'))}</button></div>
    <p>${esc(tr('PDF opens the browser print dialog. Choose Save as PDF to save the complete report.'))}</p>
    <p id="report-preview-status" role="status">${esc(tr('Preview the report to enable export.'))}</p>
    <iframe id="technical-report-preview" title="${esc(tr('Technical report preview'))}" sandbox="allow-same-origin allow-modals" hidden></iframe>`;
  const form = body.querySelector('form'), frame = body.querySelector('iframe'), status = body.querySelector('#report-preview-status');
  const exports = [...body.querySelectorAll('.report-export-actions button')];
  const read = () => {
    const data = new FormData(form);
    return normalizeReportSettings({ ...Object.fromEntries(data), sections: data.getAll('section') });
  };
  const setEnabled = enabled => exports.forEach(button => { button.disabled = !enabled; });
  const invalidate = message => { ready = false; setEnabled(false); status.textContent = message; };
  const current = () => preview && body.isConnected && JSON.stringify(store.doc) === preview.document && JSON.stringify(read()) === preview.settings;
  const frameCurrent = () => preview && frame.contentDocument?.documentElement.dataset.reportSource === preview.source
    && frame.contentDocument.documentElement.dataset.reportCreated === preview.created;
  const assertCurrent = () => {
    if (!ready || !current() || !frameCurrent()) {
      invalidate(tr('The project or report details changed. Preview again before exporting.'));
      throw new Error(tr('The project or report details changed. Preview again before exporting.'));
    }
  };
  form.addEventListener('input', () => invalidate(tr('Report details changed. Preview again before exporting.')));
  form.addEventListener('change', () => invalidate(tr('Report details changed. Preview again before exporting.')));
  const unsubscribe = store.subscribe(() => {
    if (preview && !current()) invalidate(tr('The project or report details changed. Preview again before exporting.'));
  }, { documentOnly: true });
  form.addEventListener('submit', safe(() => {
    if (logoPending) throw new Error(tr('Wait for the logo to finish loading before previewing.'));
    const settings = read();
    store.apply(doc => { eng(doc).technicalReport = settings; });
    onSaved(form);
    const report = buildTechnicalReport(store.doc, { baseline });
    preview = { document: JSON.stringify(store.doc), settings: JSON.stringify(settings), html: technicalReportHTML(report),
      source: report.source.fingerprint, created: report.created };
    const pending = preview;
    invalidate(tr('Preparing report preview...'));
    frame.hidden = false;
    frame.onload = async () => {
      if (preview !== pending || !current() || !frameCurrent()) return;
      const document = frame.contentDocument;
      await document.fonts.ready;
      if (preview !== pending || !current() || !frameCurrent() || frame.contentDocument !== document) return;
      const images = [...document.images];
      if (images.some(img => !img.complete || !img.naturalWidth)) {
        invalidate(tr('A report image could not be loaded. Check the logo and preview again.'));
        return;
      }
      ready = true; setEnabled(true); status.textContent = tr('Report preview is current and ready to export.');
    };
    frame.srcdoc = preview.html;
  }));
  body.querySelector('[data-report-action=html]').onclick = safe(() => {
    assertCurrent(); download('technical-report.html', preview.html, 'text/html');
  });
  body.querySelector('[data-report-action=pdf]').onclick = safe(() => {
    assertCurrent(); frame.contentWindow.focus(); frame.contentWindow.print();
  });
  const logoStatus = body.querySelector('#report-logo-status'), remove = body.querySelector('[data-report-action=remove-logo]');
  const logoField = form.elements.namedItem('logo');
  const syncLogo = () => { remove.disabled = !logoField.value; logoStatus.textContent = logoField.value ? tr('Logo included') : tr('No logo selected'); };
  form.addEventListener('draftrestore', syncLogo);
  remove.onclick = () => {
    logoRequest++; logoPending = false;
    logoField.value = ''; form.dispatchEvent(new Event('input', { bubbles: true })); remove.disabled = true; body.querySelector('#report-logo').value = '';
    logoStatus.textContent = tr('No logo selected'); invalidate(tr('Report details changed. Preview again before exporting.'));
  };
  body.querySelector('#report-logo').onchange = safe(async () => {
    const request = ++logoRequest;
    logoPending = false;
    const input = body.querySelector('#report-logo'), file = input.files[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > MAX_REPORT_LOGO_BYTES) throw new Error(tr('Choose a PNG or JPEG logo no larger than 256 KiB.'));
    logoPending = true;
    try {
      const url = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(tr('The logo could not be read.'))); reader.readAsDataURL(file);
      });
      if (!body.isConnected || request !== logoRequest || input.files[0] !== file) return;
      const normalized = normalizeReportSettings({ logo: url }).logo;
      if (!normalized) throw new Error(tr('Choose a PNG or JPEG logo no larger than 256 KiB.'));
      logoField.value = normalized; form.dispatchEvent(new Event('input', { bubbles: true })); remove.disabled = false; logoStatus.textContent = tr('Logo included');
      invalidate(tr('Report details changed. Preview again before exporting.'));
    } catch (error) {
      if (request === logoRequest) throw error;
    } finally { if (request === logoRequest) logoPending = false; }
  });
  return unsubscribe;
}
