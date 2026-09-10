// Session-only source files. Nothing here writes storage or calls a provider.
import { importDocuments, documentContext, SUPPORTED_ACCEPT, LIMITS } from '../ai/documents.js';
import { escAttr, onPress, openModal } from './press.js';
import { tr } from '../i18n.js';

export function initAssistantDocuments({ container, onChange = () => {} }) {
  let documents = [];
  let selected = new Set();
  let busy = false;
  let importing = null;
  let generation = 0;
  let issues = [];
  let progress = '';
  let preview = null;
  let currentContext = documentContext([]);
  container.classList.add('ai-documents');
  const el = selector => container.querySelector(selector);
  const controls = ['[data-doc-add]', '[data-doc-folder]', '[data-doc-clear]'];
  // The interface language rebuilds this markup, so the references into it and
  // the listeners on it are made here and remade by relabel(). The container
  // itself is never replaced, so its drop listeners are bound once, below.
  let details, list, filesInput, folderInput;
  function renderStatic() {
    const open = details ? details.open : false;
    container.innerHTML = '<div class="ai-document-controls">'
      + `<button type="button" data-doc-add>${escAttr(tr('Add files'))}</button><button type="button" data-doc-folder>${escAttr(tr('Add folder'))}</button>`
      + `<button type="button" data-doc-clear hidden>${escAttr(tr('Clear files'))}</button><button type="button" data-doc-cancel hidden>${escAttr(tr('Cancel import'))}</button></div>`
      + `<input type="file" data-doc-files multiple accept="${escAttr(SUPPORTED_ACCEPT)}" hidden aria-label="${escAttr(tr('Add source files'))}">`
      + `<input type="file" data-doc-directory multiple webkitdirectory hidden aria-label="${escAttr(tr('Add source folder'))}">`
      + `<details class="ai-document-details"${open ? ' open' : ''}><summary data-doc-summary>${escAttr(tr('Sources · drop files here'))}</summary>`
      + `<p class="ai-document-note">${escAttr(tr('Files stay in this tab’s memory until reload, New thread, or board replacement. On Send, selected extracted text goes to your chosen AI endpoint, through a relay when configured. Imports stay local.'))}</p>`
      + '<div data-doc-list class="ai-document-list"></div>'
      + '<div data-doc-issues class="ai-document-issues" role="status"></div></details>'
      + '<div data-doc-progress class="ai-document-progress" role="status" aria-live="polite"></div>';
    details = el('details');
    list = el('[data-doc-list]');
    filesInput = el('[data-doc-files]');
    folderInput = el('[data-doc-directory]');
    onPress(el('[data-doc-add]'), () => { if (!busy && !importing) filesInput.click(); });
    onPress(el('[data-doc-folder]'), () => { if (!busy && !importing) folderInput.click(); });
    filesInput.addEventListener('change', () => addFiles(filesInput.files));
    folderInput.addEventListener('change', () => addFiles(folderInput.files));
    onPress(el('[data-doc-clear]'), () => { if (!busy && !importing) clear(); });
    onPress(el('[data-doc-cancel]'), () => {
      if (!importing || busy) return;
      importing.abort(); progress = tr('Cancelling import…'); render();
    });
  }
  function closePreview() { if (preview) { preview.close(); preview.remove(); preview = null; } }
  function showPreview(doc) {
    closePreview();
    const dialog = document.createElement('dialog');
    dialog.className = 'ai-document-preview';
    dialog.setAttribute('aria-label', tr('Source preview: {name}', { name: doc.name }));
    dialog.innerHTML = `<h3></h3><p></p><pre tabindex="0"></pre><button type="button" data-doc-close>${escAttr(tr('Close preview'))}</button>`;
    dialog.querySelector('h3').textContent = doc.name;
    dialog.querySelector('p').textContent = tr('{n} extracted characters. {warnings}', { n: doc.text.length.toLocaleString(), warnings: doc.warnings.join(' ') });
    dialog.querySelector('pre').textContent = doc.text;
    document.body.append(dialog);
    preview = dialog;
    onPress(dialog.querySelector('button'), closePreview);
    dialog.addEventListener('close', () => { dialog.remove(); if (preview === dialog) preview = null; });
    openModal(dialog);
  }
  function render() {
    currentContext = documentContext(documents.filter(d => selected.has(d.id)));
    const entries = new Map(currentContext.entries.map(e => [e.id, e]));
    const locked = busy || !!importing;
    for (const selector of controls) el(selector).disabled = locked;
    filesInput.disabled = folderInput.disabled = locked;
    el('[data-doc-clear]').hidden = !documents.length;
    el('[data-doc-cancel]').hidden = !importing;
    el('[data-doc-cancel]').disabled = busy || !!importing?.signal.aborted;
    el('[data-doc-summary]').textContent = documents.length
      ? tr('Sources: {selected}/{total} selected · {used}/{max} context chars', { selected: selected.size, total: documents.length, used: currentContext.totalChars.toLocaleString(), max: LIMITS.contextChars.toLocaleString() })
      : tr('Sources · drop files here');
    el('[data-doc-progress]').textContent = progress;
    el('[data-doc-issues]').textContent = issues.length
      ? tr('{n} skipped or interrupted:\n{list}', { n: issues.length, list: issues.map(i => `${i.name}: ${i.message}`).join('\n') }) : '';
    list.innerHTML = documents.map((d, index) => {
      const e = entries.get(d.id);
      const count = e
        ? tr('Included 1–{used} of {total} characters{partial}', { used: e.used.toLocaleString(), total: e.total.toLocaleString(), partial: e.partial ? tr(' · Partial') : '' })
        : tr('{n} characters · Not selected', { n: d.text.length.toLocaleString() });
      return `<div class="ai-document" data-doc-index="${index}"><label><input type="checkbox" data-doc-select${selected.has(d.id) ? ' checked' : ''}${locked ? ' disabled' : ''}><span>${escAttr(d.name)}</span></label>`
        + `<small>${escAttr(count)}</small>${d.warnings.length ? `<small class="ai-document-warning">${escAttr(d.warnings.join(' '))}</small>` : ''}`
        + `<div><button type="button" data-doc-preview>${escAttr(tr('Preview'))}</button><button type="button" data-doc-remove${locked ? ' disabled' : ''}>${escAttr(tr('Remove'))}</button></div></div>`;
    }).join('');
    list.querySelectorAll('[data-doc-index]').forEach(row => {
      const doc = documents[Number(row.dataset.docIndex)];
      row.querySelector('[data-doc-select]').addEventListener('change', e => {
        if (busy || importing) return;
        if (e.target.checked) selected.add(doc.id); else selected.delete(doc.id);
        render();
      });
      onPress(row.querySelector('[data-doc-preview]'), () => showPreview(doc));
      onPress(row.querySelector('[data-doc-remove]'), () => {
        if (busy || importing) return;
        closePreview();
        documents = documents.filter(d => d.id !== doc.id); selected.delete(doc.id); render();
      });
    });
    onChange();
  }
  async function addFiles(files, extraIssues = []) {
    if (busy || importing) return;
    const input = Array.from(files);
    if (!input.length && !extraIssues.length) return;
    const gen = ++generation;
    const controller = new AbortController();
    importing = controller;
    issues = extraIssues;
    progress = tr('Reading local documents…');
    details.open = true;
    render();
    try {
      const result = await importDocuments(input, {
        existing: documents, signal: controller.signal,
        onProgress: ({ name, index, total }) => {
          if (gen !== generation) return;
          progress = tr('Reading {i}/{total}: {name}', { i: index + 1, total, name });
          el('[data-doc-progress]').textContent = progress;
        },
      });
      if (gen !== generation) return;
      const previous = new Set(documents.map(d => d.id));
      documents = result.documents;
      for (const doc of documents) if (!previous.has(doc.id)) selected.add(doc.id);
      issues = [...extraIssues, ...result.issues];
      progress = controller.signal.aborted ? tr('Import cancelled. Completed files were kept.') : tr('{n} documents ready.', { n: documents.length });
    } catch (error) {
      if (gen !== generation) return;
      issues.push({ name: tr('Import'), message: error.message || tr('Could not read documents.') });
      progress = tr('Import failed.');
    } finally {
      if (gen === generation) { importing = null; filesInput.value = folderInput.value = ''; render(); }
    }
  }
  container.addEventListener('dragover', e => {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = busy || importing ? 'none' : 'copy';
  });
  container.addEventListener('drop', e => {
    e.preventDefault();
    if (busy || importing) return;
    const entries = Array.from(e.dataTransfer?.items || []).filter(i => i.kind === 'file');
    const directoryIssues = [];
    const dropped = entries.length ? entries.flatMap(item => {
      if (item.webkitGetAsEntry?.()?.isDirectory) {
        directoryIssues.push({ name: tr('Folder'), message: tr('Use Add folder to select a directory.') }); return [];
      }
      const file = item.getAsFile(); return file ? [file] : [];
    }) : Array.from(e.dataTransfer?.files || []);
    addFiles(dropped, directoryIssues);
  });
  function clear() {
    generation++;
    importing?.abort(); importing = null;
    documents = []; selected = new Set(); issues = []; progress = '';
    filesInput.value = folderInput.value = '';
    closePreview(); details.open = false; render();
  }
  renderStatic();
  render();
  return { context: () => currentContext, clear, setBusy(on) { busy = !!on; render(); }, isImporting: () => !!importing,
    relabel() { renderStatic(); render(); } };
}
