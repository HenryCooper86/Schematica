// The Security analysis panel: CVE lookup, URL reading, attached files, and
// pasted text become canonical sources; an explicit Analyze sends only the
// retained (checked) sources to the configured provider; findings, excerpts,
// illustration previews, a walkthrough, and a cited standalone report come
// back. The panel is a floating non-modal drawer, so the canvas stays usable
// and a click on a board stage can keep the evidence beside it. Nothing is
// ever committed from an async callback: every board change — including the
// analysis itself — goes through the shared edit preview (apply / undo).
import { createSettings, PROVIDERS } from '../ai/settings.js';
import { makeProvider } from '../ai/providers/index.js';
import { ProviderError } from '../ai/providers/errors.js';
import { createSecurityReader, sourcesFromDocuments, analyzeSecurity } from '../ai/security.js';
import { buildSecurityIllustration, buildSecurityWalkthrough } from '../security-diagrams.js';
import { validateSecurityAnalysis, securityEvidence, securityAnalysisHTML, SECURITY_VIEWS } from '../security-analysis.js';
import { importDocuments, SUPPORTED_ACCEPT } from '../ai/documents.js';
import { createEditPreview } from '../ai/preview.js';
import { showEditPreview } from './ai-preview.js';
import { download, buildExportSVG } from '../export.js';
import { BACKEND } from '../ai/runtime.js';
import { contentBounds, nodeRect, NOTE_W, noteHeight } from '../geometry.js';
import { uid, findItem } from '../state.js';
import { escAttr, toast, keepFocus } from './press.js';
import { panelHeader, bindCollapsible } from './collapsible.js';
import { makePanelDraggable, raisePanel } from './panel-drag.js';
import { tr, onLanguageChange, getLang } from '../i18n.js';

// The contract caps a retained collection at 20 sources / 500k characters;
// the panel enforces the count here and the analyzer enforces the rest.
const MAX_SOURCES = 20;
const BASIS_LABELS = () => ({
  source: tr('Source-backed (not independently reproduced)'),
  inference: tr('Inference — requires review'),
  unknown: tr('Unknown — evidence missing'),
});
const STATES = () => ({ unset: tr('Set up'), untested: tr('Untested'), ready: tr('Ready'), single: tr('Single-shot') });
// Label factories resolve the current language when rendered.
const ORIGIN_LABELS = () => ({ cve: tr('CVE record'), url: tr('URL'), file: tr('File'), paste: tr('Pasted') });
const VIEW_LABELS = () => ({ architecture: tr('Architecture'), exploit: tr('Exploit path'), mitigation: tr('Mitigation') });

function browserStorage() {
  try { return window.localStorage; } catch { return null; }
}

// "cve-2021-44228" and "CVE-2021-44228" both read as CVE-2021-44228; null
// means the text cannot be a CVE identifier.
function normalizeCve(value) {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return '';
  const match = raw.match(/^(?:CVE-)?(\d{4})-(\d{4,})$/);
  return match ? `CVE-${match[1]}-${match[2]}` : null;
}

function publicUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  return url.href;
}

function errorText(err) {
  if (err instanceof ProviderError) {
    const lead = {
      auth: tr('The provider rejected the key.'),
      rate: tr('The provider is rate-limiting requests; try again in a moment.'),
      network: tr('Could not reach the provider.'),
      model: tr('The model was not found.'),
      context: tr('The request is too long for the model; keep fewer or shorter sources.'),
      refusal: tr('The model declined this request.'),
    }[err.code] || tr('The request failed.');
    return `${lead} ${err.message}${err.hint ? `\n${err.hint}` : ''}`;
  }
  return err?.message || String(err);
}

const hashPreview = hash => `${String(hash).slice(0, 12)}…`;
const sourceEndLine = source => source.startLine + source.text.split('\n').length - 1;

export function initSecurityAnalysis({ store, tools, render, svg, library = null, settings: sharedSettings = null } = {}) {
  const settings = sharedSettings || createSettings(browserStorage());
  const reader = createSecurityReader();
  const panel = document.createElement('aside');
  panel.id = 'security-panel';
  panel.dataset.secPanel = '';
  panel.setAttribute('aria-labelledby', 'security-heading');
  panel.hidden = true;
  document.getElementById('canvas-wrap').append(panel);
  // The panel floats freely: dragged by its header anywhere in the viewport,
  // with the position remembered per panel like the collapsed flag.
  const drag = makePanelDraggable(panel, 'security');

  // Session state. Sources are canonical contract objects; `selection` keeps
  // the per-source retain checkbox without polluting what Analyze sends.
  let sources = [];
  const selection = new Map();
  let cveInfo = null;
  let cveRecord = '';
  let notices = [];
  let working = null; // retain the last result if its saved analysis is undone
  let workingFollowsBoard = false; // independent unsaved results never follow history
  let busy = null; // { controller, phase, statuses }
  let errorTextValue = '';
  let statusLine = '';
  let selectedEvidence = null; // { kind, id, index }
  let walkthroughView = null;
  let undoSnap = null;
  let pendingPreview = false;
  let boardAnalysisError = '';
  let generation = store.generation;

  const el = (selector) => panel.querySelector(selector);
  const isOpen = () => !panel.hidden;
  const retainedSources = () => sources.filter(s => selection.get(s.id) !== false);

  // Once applied, the board owns this result: history may restore a newer or
  // older set of finding targets. A separately analyzed draft stays independent.
  function currentAnalysis() {
    const board = store.doc.securityAnalysis;
    if (working && (!workingFollowsBoard || !board)) return working;
    if (!board) return null;
    try {
      boardAnalysisError = '';
      return validateSecurityAnalysis(board);
    } catch (err) {
      boardAnalysisError = err.message;
      return null;
    }
  }

  function appliedState(analysis) {
    const board = store.doc.securityAnalysis || null;
    if (!analysis) return 'none';
    if (!board) return 'unsaved';
    return board.id === analysis.id && JSON.stringify(board) === JSON.stringify(analysis) ? 'applied' : 'diverged';
  }

  // ---- Shell ----
  // Built once per language; the dynamic regions below re-render alone so
  // typing in an input is never disturbed by a store emit.
  let shellLang = null;
  function renderShell() {
    const values = {};
    const open = {};
    if (shellLang) {
      for (const [key, id] of [['cve', 'sec-cve-input'], ['url', 'sec-url-input'], ['pasteName', 'sec-paste-name'], ['paste', 'sec-paste-input'], ['notes', 'sec-notes']]) {
        const node = el(`#${id}`);
        values[key] = node ? node.value : '';
      }
      const include = el('#sec-include-sources');
      if (include) values.includeSources = include.checked;
      for (const id of ['sec-sources-details', 'sec-analysis-details', 'sec-results-details', 'sec-diagram-details', 'sec-export-details']) {
        const node = el(`#${id}`);
        open[id] = node ? node.open : undefined;
      }
    }
    const restore = keepFocus(panel);
    const viewLabels = VIEW_LABELS();
    const viewButtons = SECURITY_VIEWS.map(view =>
      `<button type="button" data-sec-view="${escAttr(view)}" title="${escAttr(tr('Preview a {view} illustration of the findings. Applied only through the edit preview.', { view: viewLabels[view] }))}">${escAttr(tr('{view} illustration', { view: viewLabels[view] }))}</button>`).join('');
    panel.innerHTML = panelHeader(tr('Security analysis'), 'security')
      + '<div class="sec-scroll">'
      + `<p class="sec-static-note" id="sec-static-note" ${BACKEND ? 'hidden' : ''}>${escAttr(tr('CVE lookup and URL reading need the Node-backed Schematica site (npm start). Attach files or paste source text instead.'))}</p>`
      + `<p class="sec-provider" id="sec-provider" data-state="unset" title="${escAttr(tr('Provider configuration is shared with the Assistant panel (A).'))}"></p>`
      + `<details class="sec-section" id="sec-sources-details"${open['sec-sources-details'] === false ? '' : ' open'}>`
      + `<summary>${escAttr(tr('Sources'))}<span id="sec-source-count" class="sec-count"></span></summary>`
      + '<div class="sec-section-body">'
      + `<p class="sec-privacy">${escAttr(tr('Attached files and pasted text stay in this tab; imports stay local. CVE lookups and URL reads fetch the public source through this website’s server. Analyze sends only the retained (checked) source text and your notes to your configured provider. Line numbers count extracted text lines; a PDF or DOCX keeps no original page layout. Applying an analysis saves it with the retained sources onto the board, so board files, share links, and exports then include them.'))}</p>`
      + `<div class="sec-fetch-row"><label>${escAttr(tr('CVE'))} <input id="sec-cve-input" spellcheck="false" autocomplete="off" placeholder="CVE-2021-44228" aria-label="${escAttr(tr('CVE identifier'))}"></label><button type="button" id="sec-cve-lookup" data-sec="cve-lookup">${escAttr(tr('Look up CVE'))}</button></div>`
      + `<p class="sec-cve-record" id="sec-cve-record" role="status" hidden></p>`
      + `<div class="sec-fetch-row"><label>${escAttr(tr('URL'))} <input id="sec-url-input" spellcheck="false" autocomplete="off" placeholder="https://example.com/advisory" aria-label="${escAttr(tr('Public source URL'))}"></label><button type="button" id="sec-url-read" data-sec="url-read">${escAttr(tr('Read URL'))}</button></div>`
      + `<div class="sec-file-row"><button type="button" id="sec-file-add" data-sec="add-files">${escAttr(tr('Add files'))}</button><button type="button" id="sec-clear-sources" data-sec="clear-sources" hidden>${escAttr(tr('Clear sources'))}</button><input type="file" id="sec-file-input" multiple accept="${escAttr(SUPPORTED_ACCEPT)}" hidden aria-label="${escAttr(tr('Add source files'))}"></div>`
      + `<div class="sec-paste"><label>${escAttr(tr('Title'))} <input id="sec-paste-name" maxlength="80" placeholder="${escAttr(tr('Pasted note'))}" aria-label="${escAttr(tr('Title for the pasted source'))}"></label>`
      + `<textarea id="sec-paste-input" rows="3" placeholder="${escAttr(tr('Paste source text (advisory, code, transcript)…'))}" aria-label="${escAttr(tr('Source text to retain'))}"></textarea>`
      + `<button type="button" id="sec-paste-add" data-sec="add-paste">${escAttr(tr('Add pasted source'))}</button></div>`
      + '<div id="sec-sources" class="sec-source-list"></div>'
      + '<p id="sec-notices" class="sec-notices" role="status"></p>'
      + '</div></details>'
      + `<details class="sec-section" id="sec-analysis-details"${open['sec-analysis-details'] === false ? '' : ' open'}>`
      + `<summary>${escAttr(tr('Analysis'))}</summary>`
      + '<div class="sec-section-body">'
      + `<label class="sec-notes-label">${escAttr(tr('Notes or a question for the analysis (optional)'))} <textarea id="sec-notes" rows="2" aria-label="${escAttr(tr('Notes for the analysis'))}"></textarea></label>`
      + `<div class="sec-actions-row"><button type="button" id="sec-analyze" class="sec-primary" data-sec="analyze">${escAttr(tr('Analyze retained sources'))}</button><button type="button" id="sec-cancel" data-sec="cancel" hidden>${escAttr(tr('Cancel'))}</button></div>`
      + `<p id="sec-status" role="status" aria-live="polite"></p>`
      + '<div id="sec-status-lines" class="sec-status-lines"></div>'
      + `<p id="sec-error" class="sec-error" role="alert" hidden></p>`
      + '</div></details>'
      + `<details class="sec-section" id="sec-results-details"${open['sec-results-details'] === false ? '' : ' open'} hidden>`
      + `<summary>${escAttr(tr('Findings'))}</summary>`
      + '<div class="sec-section-body">'
      + '<div id="sec-analysis-header"></div>'
      + '<div id="sec-board-state" class="sec-board-state"></div>'
      + `<div class="sec-actions-row" id="sec-save-row"><button type="button" id="sec-save-analysis" data-sec="save-analysis">${escAttr(tr('Save analysis with board'))}</button><button type="button" id="sec-remove-analysis" data-sec="remove-analysis">${escAttr(tr('Remove from board'))}</button><button type="button" id="sec-undo-apply" data-sec="undo-apply" hidden>${escAttr(tr('Undo apply'))}</button></div>`
      + '<div id="sec-selection" class="sec-selection" hidden></div>'
      + '<div id="sec-findings"></div>'
      + '<div id="sec-evidence" class="sec-evidence" hidden></div>'
      + '</div></details>'
      + `<details class="sec-section" id="sec-diagram-details"${open['sec-diagram-details'] === false ? '' : ' open'} hidden>`
      + `<summary>${escAttr(tr('Illustrations'))}</summary>`
      + '<div class="sec-section-body">'
      + `<div class="sec-view-row">${viewButtons}</div>`
      + `<p class="sec-view-note">${escAttr(tr('Illustrations use catalogue assets for supported systems, software, actors and controls, grouped into labelled colour-coded scene bands with logical connections. Reanalyze older results for asset selection. Preview first; nothing changes until Apply, and one Undo removes it.'))}</p>`
      + `<button type="button" id="sec-walkthrough" data-sec="walkthrough">${escAttr(tr('Show walkthrough'))}</button>`
      + '<div id="sec-walkthrough-view" class="sec-walkthrough"></div>'
      + '</div></details>'
      + `<details class="sec-section" id="sec-export-details"${open['sec-export-details'] === false ? '' : ' open'} hidden>`
      + `<summary>${escAttr(tr('Report'))}</summary>`
      + '<div class="sec-section-body">'
      + `<label class="sec-toggle"><input type="checkbox" id="sec-include-sources"${values.includeSources ? ' checked' : ''}> ${escAttr(tr('Include full retained source text'))}</label>`
      + `<div class="sec-actions-row"><button type="button" id="sec-download" data-sec="download">${escAttr(tr('Download HTML report'))}</button><button type="button" id="sec-print" data-sec="print">${escAttr(tr('Print'))}</button></div>`
      + `<p class="sec-disclosure">${escAttr(tr('The standalone report always carries the cited excerpts, source names, hashes, and retrieval times; the toggle adds the full retained source text. Exports and share links of a board with an applied analysis include the sources saved with it.'))}</p>`
      + '</div></details>'
      + '</div>';
    const heading = panel.querySelector('h3');
    heading.id = 'security-heading';
    heading.insertAdjacentHTML('beforeend', `<span class="sec-tools"><button id="sec-close" class="ai-icon-btn" type="button" title="${escAttr(tr('Close (Esc)'))}" aria-label="${escAttr(tr('Close the security panel'))}">&#215;</button></span>`);
    bindCollapsible(panel, 'security');
    drag.bindHandle();
    if (shellLang) {
      for (const [key, id] of [['cve', 'sec-cve-input'], ['url', 'sec-url-input'], ['pasteName', 'sec-paste-name'], ['paste', 'sec-paste-input'], ['notes', 'sec-notes']]) {
        const node = el(`#${id}`);
        if (node && values[key]) node.value = values[key];
      }
    }
    shellLang = getLang();
    bindShell();
    restore();
    renderAll();
  }

  function bindShell() {
    el('#sec-close').addEventListener('click', () => close());
    el('#sec-cve-lookup').addEventListener('click', lookupCve);
    el('#sec-url-read').addEventListener('click', readUrl);
    el('#sec-file-add').addEventListener('click', () => { if (!busy && !pendingPreview) el('#sec-file-input').click(); });
    el('#sec-file-input').addEventListener('change', event => {
      const files = Array.from(event.target.files || []);
      event.target.value = '';
      if (files && files.length) addFiles(files);
    });
    el('#sec-paste-add').addEventListener('click', addPaste);
    el('#sec-clear-sources').addEventListener('click', () => {
      if (busy || pendingPreview) return;
      sources = [];
      selection.clear();
      cveInfo = null;
      cveRecord = '';
      notices = [];
      renderAll();
    });
    el('#sec-analyze').addEventListener('click', analyze);
    el('#sec-cancel').addEventListener('click', () => busy?.controller.abort());
    el('#sec-save-analysis').addEventListener('click', () => saveAnalysis());
    el('#sec-remove-analysis').addEventListener('click', () => removeAnalysis());
    el('#sec-undo-apply').addEventListener('click', undoApply);
    el('#sec-walkthrough').addEventListener('click', showWalkthrough);
    el('#sec-download').addEventListener('click', downloadReport);
    el('#sec-print').addEventListener('click', printReport);
    for (const btn of panel.querySelectorAll('[data-sec-view]')) {
      btn.addEventListener('click', () => previewView(btn.dataset.secView));
    }
  }

  // ---- Dynamic regions ----
  function renderProvider() {
    const node = el('#sec-provider');
    if (!node) return;
    const s = settings.get();
    const configured = settings.configured();
    const state = !configured ? 'unset' : s.connected || s.tools === true ? 'ready' : s.tools === false ? 'single' : 'untested';
    node.dataset.state = state;
    const name = PROVIDERS[s.provider]?.name || s.provider;
    node.innerHTML = `<span class="sec-provider-name">${escAttr(name)} · <code>${escAttr(s.model || tr('no model'))}</code></span><span class="sec-provider-state">${escAttr(STATES()[state])}</span>`;
    node.title = configured
      ? tr('Analysis uses this provider and model. Configure it in the Assistant panel (A).')
      : tr('Add a provider and key in the Assistant panel (A) before analyzing sources.');
  }

  function renderSourceCount() {
    const node = el('#sec-source-count');
    if (node) node.textContent = sources.length ? tr(' · {n}/{max} retained {count}', { n: retainedSources().length, max: MAX_SOURCES, count: sources.length }) : '';
    const clear = el('#sec-clear-sources');
    if (clear) clear.hidden = !sources.length;
  }

  function renderSources() {
    const list = el('#sec-sources');
    if (!list) return;
    list.innerHTML = sources.map((source) => {
      const checked = selection.get(source.id) !== false;
      const lines = `${source.startLine}–${sourceEndLine(source)}`;
      return `<article class="sec-source" data-sec-source="${escAttr(source.id)}">`
        + `<h4><label><input type="checkbox" data-sec-retain="${escAttr(source.id)}"${checked ? ' checked' : ''}> ${escAttr(source.name)}</label><span class="sec-origin">${escAttr(ORIGIN_LABELS()[selection.get(`origin:${source.id}`)] || tr('File'))}</span></h4>`
        + (source.url ? `<p class="sec-source-url">${escAttr(source.url)}</p>` : '')
        + `<p class="sec-source-meta">${escAttr(tr('lines {range} of {total}', { range: lines, total: source.totalLines }))} · ${escAttr(source.text.length.toLocaleString())} ${escAttr(tr('chars'))} · ${escAttr(tr('SHA-256'))} <code title="${escAttr(source.hash)}">${escAttr(hashPreview(source.hash))}</code> · ${escAttr(source.retrievedAt)}</p>`
        + (source.partial ? `<p class="sec-partial">${escAttr(tr('Partial source — omitted content was not analyzed'))}</p>` : '')
        + (source.warnings.length ? `<ul class="sec-source-warnings">${source.warnings.map(w => `<li>${escAttr(w)}</li>`).join('')}</ul>` : '')
        + `<button type="button" class="sec-remove" data-sec-remove="${escAttr(source.id)}" title="${escAttr(tr('Remove this source'))}" aria-label="${escAttr(tr('Remove {name}', { name: source.name }))}">${escAttr(tr('Remove'))}</button>`
        + '</article>';
    }).join('');
    const recordEl = el('#sec-cve-record');
    if (recordEl) {
      recordEl.textContent = cveRecord;
      recordEl.hidden = !cveRecord;
    }
    const noticesEl = el('#sec-notices');
    if (noticesEl) {
      noticesEl.innerHTML = notices.length ? `<ul>${notices.map(n => `<li>${escAttr(n)}</li>`).join('')}</ul>` : '';
      noticesEl.hidden = !notices.length;
    }
    // The list is rebuilt by innerHTML, so its controls are bound here on
    // every render — a checkbox press must always reach Analyze's filter.
    for (const box of list.querySelectorAll('[data-sec-retain]')) {
      box.addEventListener('change', () => {
        selection.set(box.dataset.secRetain, box.checked);
        renderSourceCount();
      });
    }
    for (const btn of list.querySelectorAll('[data-sec-remove]')) {
      btn.addEventListener('click', () => removeSource(btn.dataset.secRemove));
    }
    renderSourceCount();
  }

  function renderProgress() {
    const status = el('#sec-status');
    const lines = el('#sec-status-lines');
    const error = el('#sec-error');
    if (!status) return;
    status.textContent = busy ? busyLabel() : statusLine;
    status.hidden = !status.textContent;
    if (lines) {
      const shown = busy ? busy.statuses.slice(-3) : [];
      lines.innerHTML = shown.map(line => `<p>${escAttr(line)}</p>`).join('');
      lines.hidden = !shown.length;
    }
    if (error) {
      error.textContent = errorTextValue;
      error.hidden = !errorTextValue;
    }
  }

  function busyLabel() {
    return busy?.phase === 'lookup' ? tr('Looking up the CVE record…')
      : busy?.phase === 'read' ? tr('Reading the source URL…')
        : busy?.phase === 'import' ? tr('Reading attached files…')
          : busy?.phase === 'paste' ? tr('Retaining the pasted source…')
            : tr('Analyzing retained sources…');
  }

  function setStatus(text) { statusLine = text || ''; renderProgress(); }
  function showError(text) {
    errorTextValue = String(text || '');
    statusLine = '';
    renderProgress();
  }
  function clearError() {
    errorTextValue = '';
    renderProgress();
  }

  function targetState(analysis) {
    // Which finding targets still exist on the board: the model is not asked
    // to validate targets, so stale references must stay visible.
    const present = id => !!findItem(store.doc, id);
    const map = new Map();
    for (const finding of analysis.findings) map.set(finding.id, { present: finding.targets.filter(present), missing: finding.targets.filter(id => !present(id)) });
    return map;
  }

  function renderAnalysisCoverage(analysis) {
    const coverage = new Map((analysis.readCoverage || []).map(item => [item.sourceId, item.ranges]));
    return `<details id="sec-analysis-coverage" open><summary>${escAttr(tr('Source retention and model-read coverage'))}</summary>`
      + `<p>${escAttr(tr('Delivery records complete lines sent to the model, not proof that it understood them. Linked files are not automatically read.'))}</p><ul>`
      + analysis.sources.map(source => {
        const retained = source.text.split('\n').length;
        const ranges = coverage.get(source.id);
        const delivered = ranges?.reduce((sum, range) => sum + range.endLine - range.startLine + 1, 0);
        const retention = tr('Retained lines {a}–{b} of {total}', { a: source.startLine, b: sourceEndLine(source), total: source.totalLines });
        const reading = ranges ? tr('Complete lines delivered to the model: {read} of {retained}', { read: delivered, retained })
          : tr('Model-read coverage not recorded');
        const intervals = ranges?.length ? ` (${ranges.map(range => `${range.startLine}–${range.endLine}`).join(', ')})` : '';
        return `<li><strong>${escAttr(source.name)}</strong>: ${escAttr(retention)}${source.partial ? ` · ${escAttr(tr('Partial source — omitted content was not analyzed'))}` : ''}<br>${escAttr(reading)}${escAttr(intervals)}${ranges && delivered < retained ? ` · ${escAttr(tr('Undelivered lines remain unassessed.'))}` : ''}</li>`;
      }).join('') + '</ul></details>';
  }

  function renderResults() {
    const details = el('#sec-results-details');
    const diagram = el('#sec-diagram-details');
    const exporter = el('#sec-export-details');
    if (!details) return;
    const analysis = currentAnalysis();
    details.hidden = !analysis && !boardAnalysisError;
    diagram.hidden = !analysis;
    exporter.hidden = !analysis;
    if (boardAnalysisError && !analysis) {
      el('#sec-analysis-header').innerHTML = `<p class="sec-error">${escAttr(tr('The board carries an invalid security analysis: {error}', { error: boardAnalysisError }))}</p>`;
      el('#sec-board-state').innerHTML = '';
      el('#sec-findings').innerHTML = '';
      el('#sec-evidence').hidden = true;
      syncActions();
      return;
    }
    if (!analysis) { syncActions(); return; }
    const state = appliedState(analysis);
    const header = el('#sec-analysis-header');
    header.innerHTML = `<h4>${escAttr(analysis.title)}</h4>`
      + `<p class="sec-analysis-meta">${escAttr(analysis.cveId || tr('No CVE identifier supplied'))} · ${escAttr(tr('record status: {status}', { status: analysis.status }))} · ${escAttr(analysis.generatedAt)}</p>`
      + `<p class="sec-narrative">${escAttr(analysis.summary)}</p>`
      + (analysis.warnings.length ? `<ul class="sec-analysis-warnings">${analysis.warnings.map(w => `<li>${escAttr(w)}</li>`).join('')}</ul>` : '')
      + `<p class="sec-analysis-note">${escAttr(tr('Static source analysis only. No PoC was executed, no target was contacted, and deployment risk was not verified.'))}</p>`
      + renderAnalysisCoverage(analysis);
    const boardState = el('#sec-board-state');
    boardState.innerHTML = state === 'applied' ? `<p class="sec-state applied">${escAttr(tr('Saved with this board.'))}</p>`
      : state === 'diverged' ? `<p class="sec-state diverged">${escAttr(tr('The analysis on the board differs from this result. Saving replaces it.'))}</p>`
        : state === 'unsaved' ? `<p class="sec-state unsaved">${escAttr(tr('Not saved with the board yet.'))}</p>`
          : `<p class="sec-state unsaved">${escAttr(tr('Loaded from this board.'))}</p>`;
    const targets = targetState(analysis);
    const nonEstablished = analysis.status === 'reserved' || analysis.status === 'rejected';
    el('#sec-findings').innerHTML = analysis.findings.map((finding, index) => {
      const t = targets.get(finding.id) || { present: [], missing: [] };
      const evidence = finding.evidence.length
        ? finding.evidence.map((ref, i) => {
          let label = ref.sourceId;
          try { label = securityEvidence(analysis, ref).source.name; } catch { /* a broken citation keeps its source id */ }
          return `<button type="button" class="sec-evidence-ref" data-sec-ev-kind="finding" data-sec-ev-id="${escAttr(finding.id)}" data-sec-ev-index="${i}">${escAttr(label)} · ${escAttr(tr('lines {a}–{b}', { a: ref.startLine, b: ref.endLine }))}</button>`;
        }).join('')
        : `<span class="sec-no-evidence">${escAttr(tr('No cited lines ({basis})', { basis: BASIS_LABELS()[finding.basis] }))}</span>`;
      return `<article class="sec-finding" data-sec-finding="${escAttr(finding.id)}">`
        + `<h4>${index + 1}. ${escAttr(finding.title)} <span class="sec-chips"><span class="sec-chip kind-${escAttr(finding.kind)}">${escAttr(finding.kind)}</span><span class="sec-chip basis-${escAttr(finding.basis)}">${escAttr(BASIS_LABELS()[finding.basis])}</span>${finding.view !== 'none' ? `<span class="sec-chip view">${escAttr(VIEW_LABELS()[finding.view] || finding.view)}</span>` : ''}</span></h4>`
        + `<p class="sec-narrative">${escAttr(finding.detail)}</p>`
        + (nonEstablished ? `<p class="sec-analysis-note">${escAttr(tr('The CVE record is {status}; this finding does not establish a vulnerability or applicability to a deployment.', { status: analysis.status }))}</p>` : '')
        + `<div class="sec-evidence-row">${evidence}</div>`
        + (t.present.length ? `<button type="button" class="sec-show" data-sec-show="${escAttr(finding.id)}">${escAttr(tr('Show on canvas'))}</button>` : '')
        + (t.missing.length ? `<p class="sec-targets-missing">${escAttr(tr('Board references no longer on the board: {ids}', { ids: t.missing.join(', ') }))}</p>` : (t.present.length ? `<p class="sec-targets">${escAttr(t.present.join(', '))}</p>` : ''))
        + '</article>';
    }).join('')
      + (analysis.relationships.length ? `<h4 class="sec-relationships-heading">${escAttr(tr('Logical relationships'))}</h4><ul class="sec-relationships">${analysis.relationships.map(rel => {
        const from = analysis.findings.find(f => f.id === rel.from);
        const to = analysis.findings.find(f => f.id === rel.to);
        return `<li><strong>${escAttr(from?.title || rel.from)} → ${escAttr(to?.title || rel.to)}</strong>: ${escAttr(rel.label)} <span class="sec-chip basis-${escAttr(rel.basis)}">${escAttr(BASIS_LABELS()[rel.basis])}</span> <span class="sec-chip view">${escAttr(VIEW_LABELS()[rel.view] || rel.view)}</span>`
          + rel.evidence.map((ref, i) => {
            let label = ref.sourceId;
            try { label = securityEvidence(analysis, ref).source.name; } catch { /* keep the id */ }
            return `<button type="button" class="sec-evidence-ref" data-sec-ev-kind="relationship" data-sec-ev-id="${escAttr(rel.id)}" data-sec-ev-index="${i}">${escAttr(label)} · ${escAttr(tr('lines {a}–{b}', { a: ref.startLine, b: ref.endLine }))}</button>`;
          }).join('')
          + '</li>';
      }).join('')}</ul>` : '');
    for (const btn of panel.querySelectorAll('[data-sec-ev-kind]')) {
      btn.addEventListener('click', () => {
        selectedEvidence = { kind: btn.dataset.secEvKind, id: btn.dataset.secEvId, index: Number(btn.dataset.secEvIndex) };
        renderEvidence(analysis);
      });
    }
    for (const btn of panel.querySelectorAll('[data-sec-show]')) {
      btn.addEventListener('click', () => {
        const t = targets.get(btn.dataset.secShow) || { present: [] };
        if (t.present.length) focusBoard(t.present);
      });
    }
    renderEvidence(analysis);
    renderSelection(analysis);
    syncActions();
  }

  function renderEvidence(analysis, { scroll = true } = {}) {
    const box = el('#sec-evidence');
    if (!box) return;
    if (!selectedEvidence) { box.hidden = true; box.innerHTML = ''; return; }
    let ref = null;
    if (selectedEvidence.kind === 'finding') ref = analysis.findings.find(f => f.id === selectedEvidence.id)?.evidence[selectedEvidence.index];
    else ref = analysis.relationships.find(r => r.id === selectedEvidence.id)?.evidence[selectedEvidence.index];
    if (!ref) { box.hidden = true; box.innerHTML = ''; return; }
    let excerpt;
    try { excerpt = securityEvidence(analysis, ref); }
    catch (err) {
      box.hidden = false;
      box.innerHTML = `<h4>${escAttr(tr('Cited lines'))}</h4><p class="sec-error">${escAttr(err.message)}</p>`;
      return;
    }
    const numbered = excerpt.text.split('\n')
      .map((line, i) => `<span class="sec-line"><span class="sec-line-n">${excerpt.startLine + i}</span>${escAttr(line)}</span>`).join('');
    box.hidden = false;
    box.innerHTML = `<h4>${escAttr(tr('Cited lines'))}</h4>`
      + `<p class="sec-source-meta">${escAttr(excerpt.source.name)} · ${escAttr(tr('lines {a}–{b}', { a: excerpt.startLine, b: excerpt.endLine }))} · ${escAttr(tr('SHA-256'))} <code title="${escAttr(excerpt.source.hash)}">${escAttr(hashPreview(excerpt.source.hash))}</code></p>`
      + `<pre class="sec-excerpt">${numbered}</pre>`;
    if (scroll) box.scrollIntoView({ block: 'nearest' });
  }

  // Canvas selection drives the evidence: picking a board stage lists the
  // findings that reference it, without closing this panel.
  function renderSelection(analysisArg = null, { selectEvidence = false } = {}) {
    const box = el('#sec-selection');
    if (!box) return;
    const analysis = analysisArg ?? currentAnalysis();
    if (!analysis || !isOpen()) { box.hidden = true; box.innerHTML = ''; return; }
    const id = [...store.selection][0];
    if (!id || !findItem(store.doc, id)) { box.hidden = true; box.innerHTML = ''; return; }
    const hits = analysis.findings.filter(f => f.targets.includes(id));
    const item = findItem(store.doc, id).item;
    const label = item.label || item.text || id;
    if (!hits.length) {
      box.hidden = false;
      box.innerHTML = `<h4>${escAttr(tr('Selected: {label}', { label }))}</h4><p>${escAttr(tr('No finding references this element.'))}</p>`;
      return;
    }
    // A canvas click explains itself: the first finding with cited lines (or
    // just the first finding) shows its detail and excerpt right here, with
    // the panel staying where the reader put it.
    const chosen = hits.find(f => f.evidence.length) || hits[0];
    const inline = `<p class="sec-narrative">${escAttr(chosen.detail)}</p>`
      + `<p class="sec-chips"><span class="sec-chip kind-${escAttr(chosen.kind)}">${escAttr(chosen.kind)}</span><span class="sec-chip basis-${escAttr(chosen.basis)}">${escAttr(BASIS_LABELS()[chosen.basis])}</span></p>`
      + (chosen.evidence.length ? '' : `<p class="sec-no-evidence">${escAttr(tr('No cited lines ({basis})', { basis: BASIS_LABELS()[chosen.basis] }))}</p>`);
    box.hidden = false;
    box.innerHTML = `<h4>${escAttr(tr('Selected: {label}', { label }))}</h4>${inline}`
      + `<p>${escAttr(tr('Findings referencing this element:'))}</p><ul>${hits.map(f => `<li><button type="button" class="sec-jump" data-sec-jump="${escAttr(f.id)}">${escAttr(f.title)}</button></li>`).join('')}</ul>`;
    if (selectEvidence) {
      selectedEvidence = chosen.evidence.length ? { kind: 'finding', id: chosen.id, index: 0 } : null;
      renderEvidence(analysis, { scroll: false });
    }
    for (const btn of box.querySelectorAll('[data-sec-jump]')) {
      btn.addEventListener('click', () => {
        const article = [...panel.querySelectorAll('[data-sec-finding]')].find(node => node.dataset.secFinding === btn.dataset.secJump);
        if (article) {
          article.scrollIntoView({ block: 'start', behavior: 'smooth' });
          article.classList.remove('attention');
          // Restart the flash so the eye lands on the right finding.
          void article.offsetWidth;
          article.classList.add('attention');
        }
      });
    }
  }

  function renderWalkthrough() {
    const box = el('#sec-walkthrough-view');
    if (!box) return;
    if (walkthroughView) {
      const analysis = currentAnalysis();
      walkthroughView = analysis ? buildSecurityWalkthrough(store.doc, analysis, { view: walkthroughView.view }) : null;
    }
    const data = walkthroughView;
    if (!data) { box.innerHTML = ''; return; }
    const stops = data.stops.map((stop, i) => {
      const node = store.doc.nodes.find(n => n.id === stop.node);
      const label = node?.label || stop.node;
      const evidence = (stop.evidence || []).map(ref => `${escAttr(ref.name || ref.sourceId)} · ${escAttr(tr('lines {a}–{b}', { a: ref.startLine, b: ref.endLine }))}`).join(' · ');
      return `<li><button type="button" class="sec-stop" data-sec-stop="${escAttr(stop.node)}">`
        + `<strong>${i + 1}. ${escAttr(label)}</strong>`
        + `<span class="sec-chips"><span class="sec-chip basis-${escAttr(stop.basis)}">${escAttr(BASIS_LABELS()[stop.basis] || stop.basis)}</span></span>`
        + `<span class="sec-stop-finding">${escAttr(stop.title)}</span>`
        + `<span class="sec-narrative">${escAttr(stop.caption)}</span>`
        + (evidence ? `<span class="sec-stop-evidence">${evidence}</span>` : '')
        + '</button></li>';
    }).join('');
    box.innerHTML = `<h4>${escAttr(data.title)} <span class="sec-chip view">${escAttr(VIEW_LABELS()[data.view] || data.view || '')}</span></h4>`
      + (data.caption ? `<p class="sec-narrative">${escAttr(data.caption)}</p>` : '')
      + (data.stops.length ? `<ol class="sec-stops">${stops}</ol>` : `<p class="sec-error">${escAttr(data.empty || tr('No walkthrough stops: no findings of this analysis are illustrated on the board.'))}</p>`)
      + (data.missing?.length ? `<p class="sec-targets-missing">${escAttr(tr('Not on the board: {titles}', { titles: data.missing.map(m => m.title).join('; ') }))}</p>` : '');
    for (const btn of box.querySelectorAll('[data-sec-stop]')) {
      btn.addEventListener('click', () => focusBoard([btn.dataset.secStop]));
    }
  }

  function syncActions() {
    const analysis = currentAnalysis();
    const idle = !busy && !pendingPreview;
    const set = (selector, disabled, hidden = false) => {
      const node = el(selector);
      if (node) { node.disabled = !!disabled; node.hidden = !!hidden; }
    };
    set('#sec-cve-lookup', !idle || !BACKEND);
    set('#sec-url-read', !idle || !BACKEND);
    set('#sec-file-add', !idle);
    set('#sec-paste-add', !idle);
    set('#sec-clear-sources', !idle, !sources.length);
    set('#sec-analyze', !idle || !settings.configured());
    set('#sec-cancel', false, !busy);
    set('#sec-save-analysis', !idle || !analysis || !!store.doc.securityAnalysis && appliedState(analysis) === 'applied');
    set('#sec-remove-analysis', !idle || !store.doc.securityAnalysis);
    const undo = el('#sec-undo-apply');
    if (undo) undo.hidden = !(undoSnap && store.canUndo() && store.undoStack.at(-1) === undoSnap);
    set('#sec-walkthrough', !idle || !analysis);
    for (const btn of panel.querySelectorAll('[data-sec-view]')) btn.disabled = !idle || !analysis;
    set('#sec-download', !idle || !analysis);
    set('#sec-print', !idle || !analysis);
  }

  function renderAll() {
    renderProvider();
    renderSources();
    renderProgress();
    renderResults();
    renderWalkthrough();
    syncActions();
  }

  // ---- Busy management ----
  // One async flow at a time, cancellable, and its result is dropped when the
  // board was replaced underneath it.
  async function runBusy(phase, fn) {
    if (busy) return;
    const token = { controller: new AbortController(), phase, statuses: [] };
    busy = token;
    errorTextValue = '';
    statusLine = '';
    renderProgress();
    syncActions();
    const gen = generation;
    try {
      await fn(busy.controller.signal, line => {
        // A late status from this flow must not touch a newer one's list.
        if (busy !== token) return;
        token.statuses.push(String(line || ''));
        renderProgress();
      });
    } catch (err) {
      if (err?.name === 'AbortError') setStatus(tr('Cancelled.'));
      else showError(errorText(err));
    } finally {
      busy = null;
      if (generation !== gen) renderAll();
      else { renderProgress(); syncActions(); }
    }
  }

  // ---- Source ingestion ----
  function addSources(list, origin) {
    let added = 0;
    const skipped = [];
    for (const source of list || []) {
      if (sources.some(s => s.id === source.id)) { skipped.push(source.name); continue; }
      if (sources.length >= MAX_SOURCES) { skipped.push(source.name); continue; }
      sources.push(source);
      selection.set(source.id, true);
      selection.set(`origin:${source.id}`, origin);
      added++;
    }
    if (skipped.length) notices = [...notices, tr('Skipped (duplicate or over the {max}-source cap): {names}', { max: MAX_SOURCES, names: skipped.join('; ') })];
    if (added) {
      notices = notices.slice(-8);
      clearError();
      toast(tr('{n} source(s) retained.', { n: added }));
    }
    renderSources();
    syncActions();
    return added;
  }

  function removeSource(id) {
    sources = sources.filter(s => s.id !== id);
    selection.delete(id);
    selection.delete(`origin:${id}`);
    renderSources();
    syncActions();
  }

  function lookupCve() {
    if (busy || pendingPreview) return;
    const cveId = normalizeCve(el('#sec-cve-input').value);
    if (cveId === null) { showError(tr('Use a CVE identifier like CVE-2021-44228.')); return; }
    if (!cveId) { showError(tr('Type a CVE identifier first.')); return; }
    runBusy('lookup', async (signal) => {
      const gen = generation;
      const result = await reader.lookupCve(cveId, { signal });
      if (generation !== gen || signal.aborted) return;
      notices = [...result.warnings];
      if (result.sources.length) {
        cveInfo = { cveId: result.cveId, status: result.status, title: result.title || '' };
        cveRecord = tr('{cve} — record status: {status}.{title}', { cve: result.cveId, status: result.status, title: result.title ? ` ${result.title}` : '' });
        addSources(result.sources, 'cve');
        setStatus(tr('CVE record retained as a source.'));
      } else {
        cveInfo = null;
        cveRecord = tr('{cve} — record status: {status}. No source text was retrieved; attach or paste the advisory instead.', { cve: result.cveId, status: result.status });
        setStatus(tr('No source retained from the CVE lookup.'));
      }
      renderSources();
    });
  }

  function readUrl() {
    if (busy || pendingPreview) return;
    const url = publicUrl(el('#sec-url-input').value);
    if (!url) { showError(tr('Supply one public HTTP(S) URL without credentials.')); return; }
    runBusy('read', async (signal) => {
      const gen = generation;
      const result = await reader.readUrl(url, { signal });
      if (generation !== gen || signal.aborted) return;
      notices = [...result.warnings];
      if (result.sources.length) {
        addSources(result.sources, 'url');
        setStatus(tr('Source retained from the URL.'));
      } else setStatus(tr('No source retained from the URL.'));
      renderSources();
    });
  }

  function addFiles(files) {
    runBusy('import', async (signal, status) => {
      const gen = generation;
      const { documents, issues } = await importDocuments(files, {
        signal,
        onProgress: p => status(tr('Reading {name}…', { name: p.name })),
      });
      if (generation !== gen || signal.aborted) return;
      notices = issues.map(issue => `${issue.name}: ${issue.message}`);
      if (!documents.length) {
        setStatus(tr('No files were retained.'));
        renderSources();
        return;
      }
      const converted = await sourcesFromDocuments(documents);
      if (generation !== gen || signal.aborted) return;
      addSources(converted, 'file');
      setStatus(tr('Attached files retained as sources.'));
    });
  }

  function addPaste() {
    if (busy || pendingPreview) return;
    const text = el('#sec-paste-input').value;
    if (!text.trim()) { showError(tr('Paste the source text first.')); return; }
    const name = (el('#sec-paste-name').value.trim() || tr('Pasted note')).slice(0, 512);
    runBusy('paste', async (signal) => {
      const gen = generation;
      const converted = await sourcesFromDocuments([{ id: uid('sec-paste'), name, kind: 'text', size: text.length, text, warnings: [] }]);
      if (generation !== gen || signal.aborted) return;
      addSources(converted, 'paste');
      el('#sec-paste-input').value = '';
      el('#sec-paste-name').value = '';
      setStatus(tr('Pasted source retained.'));
    });
  }

  // ---- Analysis ----
  function analyze() {
    if (busy || pendingPreview) return;
    renderProvider();
    if (!settings.configured()) {
      showError(tr('Add a provider and key in the Assistant panel (A) first.'));
      renderProvider();
      return;
    }
    const retained = retainedSources();
    const userText = el('#sec-notes').value.trim();
    if (!retained.length && !userText) {
      showError(tr('Retain at least one source, or write a note describing what to analyze.'));
      return;
    }
    const typedCve = normalizeCve(el('#sec-cve-input').value);
    if (typedCve === null) { showError(tr('Use a CVE identifier like CVE-2021-44228, or clear the field.')); return; }
    const cveId = cveInfo && typedCve === cveInfo.cveId ? cveInfo.cveId : typedCve;
    const status = cveInfo && cveId === cveInfo.cveId ? cveInfo.status : 'not-provided';
    const s = settings.get();
    const key = settings.getKey();
    runBusy('analyze', async (signal, onStatus) => {
      const gen = generation;
      const analysis = await analyzeSecurity({
        provider: makeProvider(s, key),
        sources: structuredClone(retained),
        cveId,
        status,
        userText,
        signal,
        allowTools: s.tools !== false,
        onStatus: line => onStatus(line),
      });
      if (generation !== gen || signal.aborted) return;
      settings.markConnected(s, key);
      working = analysis;
      workingFollowsBoard = false;
      selectedEvidence = null;
      walkthroughView = null;
      undoSnap = null;
      clearError();
      setStatus(tr('Analysis complete: {n} findings from {m} retained source(s).', { n: analysis.findings.length, m: retained.length }));
      renderProvider();
      renderResults();
      renderWalkthrough();
      syncActions();
      el('#sec-results-details').open = true;
    });
  }

  // ---- Board persistence (always through the shared edit preview) ----
  function commitPreview(mutate, { toast: appliedToast, workingAfter, illustrationView }) {
    const preview = createEditPreview(store);
    try {
      mutate(preview.draft);
    } catch (err) {
      preview.discard();
      showError(err.message);
      return;
    }
    if (!preview.changed()) {
      preview.discard();
      toast(tr('Nothing to apply.'));
      return;
    }
    pendingPreview = true;
    clearError();
    syncActions();
    showEditPreview(preview, applied => {
      pendingPreview = false;
      if (applied) {
        undoSnap = store.undoStack.at(-1) ?? null;
        const next = typeof workingAfter === 'function' ? workingAfter() : workingAfter;
        if (next || store.doc.securityAnalysis) {
          working = next || structuredClone(store.doc.securityAnalysis);
          workingFollowsBoard = true;
        }
        if (illustrationView && walkthroughView) {
          walkthroughView = buildSecurityWalkthrough(store.doc, currentAnalysis(), { view: illustrationView });
        }
        if (appliedToast) toast(appliedToast);
      }
      renderAll();
    });
  }

  function saveAnalysis() {
    if (busy || pendingPreview) return;
    const analysis = currentAnalysis();
    if (!analysis) return;
    const snapshot = structuredClone(analysis);
    commitPreview(draft => {
      draft.apply(doc => { doc.securityAnalysis = structuredClone(snapshot); });
    }, {
      toast: tr('Security analysis saved with the board. One Undo removes it.'),
    });
  }

  function removeAnalysis() {
    if (busy || pendingPreview || !store.doc.securityAnalysis) return;
    commitPreview(draft => {
      draft.apply(doc => { delete doc.securityAnalysis; });
    }, {
      toast: tr('Security analysis removed from the board. One Undo restores it.'),
    });
  }

  function undoApply() {
    if (!store.canUndo() || store.undoStack.at(-1) !== undoSnap) { undoSnap = null; syncActions(); return; }
    store.undo();
    undoSnap = null;
    renderAll();
    toast(tr('Applied changes undone.'));
  }

  function previewView(view) {
    if (busy || pendingPreview) return;
    const analysis = currentAnalysis();
    if (!analysis) { showError(tr('Analyze or load an analysis first.')); return; }
    let result;
    commitPreview(draft => {
      result = buildSecurityIllustration(draft.doc, structuredClone(analysis), { view });
      draft.replaceDoc(result.doc);
    }, {
      toast: tr('{view} illustration applied. One Undo removes it.', { view: VIEW_LABELS()[view] || view }),
      workingAfter: () => result?.analysis || null,
      illustrationView: view,
    });
  }

  function showWalkthrough() {
    if (busy || pendingPreview) return;
    const analysis = currentAnalysis();
    if (!analysis) { showError(tr('Analyze or load an analysis first.')); return; }
    try {
      walkthroughView = buildSecurityWalkthrough(store.doc, analysis);
      clearError();
      renderWalkthrough();
    } catch (err) {
      walkthroughView = null;
      renderWalkthrough();
      showError(err.message);
    }
  }

  // ---- Standalone cited report ----
  function reportFigures() {
    const doc = store.doc;
    const empty = !doc.nodes.length && !doc.wires.length && !doc.zones.length && !doc.notes.length;
    if (empty) return [];
    return [{ title: tr('{title} — board as currently drawn (native renderer, not model-generated)', { title: doc.title || tr('Untitled Board') }), svg: buildExportSVG(doc) }];
  }

  function reportHTML() {
    const analysis = currentAnalysis();
    if (!analysis) throw new Error(tr('Analyze or load an analysis first.'));
    return securityAnalysisHTML(analysis, {
      includeSources: el('#sec-include-sources')?.checked === true,
      figures: reportFigures(),
    });
  }

  function downloadReport() {
    if (busy || pendingPreview) return;
    try {
      const html = reportHTML();
      const name = `${(store.doc.title || 'schematica').replace(/[^\w-]+/g, '_')}-security-analysis.html`;
      download(name, html, 'text/html');
      setStatus(tr('Standalone cited report downloaded.'));
    } catch (err) { showError(errorText(err)); }
  }

  function printReport() {
    if (busy || pendingPreview) return;
    try {
      const html = reportHTML();
      const analysisId = currentAnalysis().id;
      const frame = document.createElement('iframe');
      frame.className = 'sec-print-frame';
      frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
      frame.title = tr('Security analysis report');
      let cleaned = false, printed = false;
      const cleanup = () => { if (!cleaned) { cleaned = true; frame.remove(); } };
      frame.addEventListener('load', async () => {
        const doc = frame.contentDocument;
        if (printed || doc?.documentElement.dataset.securityAnalysis !== analysisId) return;
        printed = true;
        await doc.fonts.ready;
        if (!frame.isConnected || frame.contentDocument !== doc) return;
        if ([...doc.images].some(image => !image.complete || !image.naturalWidth)) {
          cleanup();
          showError(tr('The report diagram could not be loaded. Download HTML instead.'));
          return;
        }
        frame.contentWindow.addEventListener('afterprint', cleanup, { once: true });
        frame.contentWindow.focus();
        frame.contentWindow.print();
      });
      frame.srcdoc = html;
      document.body.append(frame);
      setTimeout(cleanup, 120000);
      setStatus(tr('Use the browser print dialog for the cited report.'));
    } catch (err) { showError(errorText(err)); }
  }

  // ---- Canvas feedback ----
  // The least pan that brings the referenced items into view, exactly as the
  // assistant does, so an evidence click never hides what it points at.
  function itemRect(id) {
    const doc = store.doc;
    const n = doc.nodes.find(x => x.id === id);
    if (n) return nodeRect(n);
    const z = doc.zones.find(x => x.id === id);
    if (z) return { x: z.x, y: z.y, w: z.w, h: z.h };
    const t = doc.notes.find(x => x.id === id);
    if (t) return { x: t.x, y: t.y, w: NOTE_W, h: noteHeight(t.text) };
    return null;
  }

  function focusBoard(ids) {
    const present = ids.filter(id => findItem(store.doc, id));
    if (!present.length) return;
    tools.ui.highlight.clear();
    for (const id of present) tools.ui.highlight.add(id);
    render('overlay');
    store.setSelection(present);
    const rects = present.map(itemRect).filter(Boolean);
    if (!rects.length) return;
    const b = contentBounds({ nodes: [], zones: rects, notes: [] });
    const r = svg.getBoundingClientRect();
    const { zoom } = tools.view;
    const M = 40;
    const sx1 = b.x * zoom + tools.view.x;
    const sy1 = b.y * zoom + tools.view.y;
    const sx2 = (b.x + b.w) * zoom + tools.view.x;
    const sy2 = (b.y + b.h) * zoom + tools.view.y;
    let dx = 0;
    let dy = 0;
    if (sx1 < M) dx = M - sx1; else if (sx2 > r.width - M) dx = r.width - M - sx2;
    if (sy1 < M) dy = M - sy1; else if (sy2 > r.height - M) dy = r.height - M - sy2;
    if (dx || dy) { tools.view.x += dx; tools.view.y += dy; render('view'); }
  }

  // ---- Open / close ----
  function open() {
    if (!isOpen()) {
      const app = document.getElementById('app');
      if (app.classList.contains('panels-hidden')) document.getElementById('btn-panels').click();
      if (shellLang !== getLang()) renderShell();
      panel.hidden = false;
      raisePanel(panel);
      drag.ensure();
      renderAll();
      const first = busy ? null : el('#sec-cve-input');
      if (first) first.focus({ preventScroll: true });
    }
    syncToolbar();
  }

  function close() {
    // An in-flight lookup or analysis belongs to the open panel; cancel it so
    // a late result can never land as a stale state change.
    busy?.controller.abort();
    panel.hidden = true;
    syncToolbar();
  }

  function syncToolbar() {
    const btn = document.getElementById('btn-security');
    if (!btn) return;
    btn.classList.toggle('active', isOpen());
    btn.setAttribute('aria-pressed', String(isOpen()));
    btn.setAttribute('aria-expanded', String(isOpen()));
  }

  // Bound once: they live outside the shell that a language switch rebuilds.
  const btn = document.getElementById('btn-security');
  if (btn) {
    // The module owns the toolbar toggle: one press opens, the next closes.
    btn.addEventListener('click', () => {
      if (isOpen()) close(); else open();
    });
  }
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented || !isOpen()) return;
    let modalOpen = false;
    try { modalOpen = !!document.querySelector('dialog:modal'); } catch { /* an engine without :modal never opened one */ }
    if (modalOpen) return;
    const app = document.getElementById('app');
    if (app.classList.contains('presenting')) return;
    const focus = document.activeElement;
    if (focus && ['assistant', 'props', 'journey-panel', 'explore-panel'].some(id => document.getElementById(id)?.contains(focus))) return;
    close();
  });
  store.subscribe(() => {
    if (store.generation !== generation) {
      generation = store.generation;
      busy?.controller.abort();
      sources = [];
      selection.clear();
      cveInfo = null;
      cveRecord = '';
      notices = [];
      working = null;
      workingFollowsBoard = false;
      walkthroughView = null;
      selectedEvidence = null;
      undoSnap = null;
      boardAnalysisError = '';
      statusLine = tr('The board was replaced; sources and results were cleared.');
      if (isOpen()) renderAll();
      return;
    }
    if (isOpen()) {
      boardAnalysisError = '';
      renderResults();
      renderWalkthrough();
    }
  }, { documentOnly: true });
  store.subscribe(change => { if (change === 'selection' && isOpen()) renderSelection(null, { selectEvidence: true }); });
  onLanguageChange(() => { if (isOpen()) { renderShell(); syncActions(); } });
  // Provider settings can change in the Assistant while this panel stays
  // open: focus coming back here is the moment the shown provider goes stale.
  panel.addEventListener('focusin', () => { renderProvider(); syncActions(); });

  renderShell();
  syncToolbar();
  return { open, close };
}
