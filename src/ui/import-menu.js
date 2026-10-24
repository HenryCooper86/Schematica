// Build a board from an incident log, a CVE id or a write-up without a
// provider. The Assistant panel's "Build from a source" row calls start();
// everything runs in the browser, and the only network call is the CVE
// record lookup, which sends the id alone to the server's database or the
// public sources. Each build replaces the board after confirmation and is
// one Undo step.
import { parseIncidentLog, reconstructIncident } from '../incident-replay.js';
import { fetchCveRecord, buildCveExplainer, readWriteup, cveId, CVE_SOURCE_KEY, CVE_SOURCES } from '../cve-explainer.js';
import { toast, openModal } from './press.js';
import { tr } from '../i18n.js';
import { CVE_PROXY } from '../ai/runtime.js';

const BOARD_KEYS = ['title', 'nodes', 'wires', 'zones', 'notes', 'journey', 'incident'];
const MAX_FILE = 2 * 1024 * 1024;

export function initImport({ store, storage = null }) {
  const dialog = document.getElementById('import-dialog');
  const logInput = document.getElementById('import-log-input');
  if (!dialog || !logInput) return null;
  const el = (id) => dialog.querySelector(`#${id}`);
  const idField = el('import-cve-id'), textField = el('import-poc-text'), fileField = el('import-poc-file');
  const sourceField = el('import-source'), status = el('import-status'), build = el('import-build');
  const read = (k) => { try { return storage?.getItem(k) || ''; } catch { return ''; } };
  const write = (k, v) => { try { if (v) storage?.setItem(k, v); else storage?.removeItem(k); } catch { /* blocked storage: the session still works */ } };
  sourceField.value = read(CVE_SOURCE_KEY);
  sourceField.placeholder = CVE_SOURCES.cve;
  const serverHint = dialog.querySelector('#import-source-server');
  if (serverHint && CVE_PROXY) serverHint.hidden = false;
  let busy = false, request = 0;

  function start(mode) {
    if (mode === 'log') { logInput.value = ''; logInput.click(); return; }
    dialog.dataset.mode = mode;
    status.textContent = '';
    status.classList.remove('error');
    busy = false;
    build.disabled = false;
    openModal(dialog);
    (mode === 'cve' ? idField : textField).focus();
  }

  // Replacing the board is the destructive step: ask, then one undo step.
  function hasWork() { const d = store.doc; return !!(d.nodes.length || d.zones.length || d.notes.length || (d.journey || []).length); }
  function place(doc, name) {
    if (hasWork() && !confirm(tr('Replace the current board with "{name}"? Anything not saved to a file is lost.', { name }))) return false;
    store.apply((d) => { for (const key of BOARD_KEYS) { if (doc[key] === undefined) delete d[key]; else d[key] = doc[key]; } });
    store.setSelection([]);
    document.dispatchEvent(new CustomEvent('schematica:board-imported', { detail: { title: doc.title } }));
    return true;
  }
  const readFile = (file) => new Promise((resolve, reject) => {
    if (!file) return reject(Error(tr('Choose a file first.')));
    if (file.size > MAX_FILE) return reject(Error(tr('The file is larger than 2 MB.')));
    const reader = new FileReader();
    reader.onerror = () => reject(Error(tr('The file could not be read.')));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(file);
  });

  logInput.addEventListener('change', async () => {
    const file = logInput.files[0];
    logInput.value = '';
    try {
      const result = reconstructIncident(parseIncidentLog(await readFile(file)));
      if (!place(result.doc, result.doc.title)) return;
      toast(tr('Rebuilt "{title}": {steps} step(s) in {phases} phase(s). Press Replay incident to play it on a clock.', { title: result.doc.title, steps: result.timeline.length, phases: result.phases.length }));
    } catch (error) { toast(error.message); }
  });

  fileField.addEventListener('change', async () => {
    try { textField.value = await readFile(fileField.files[0]); status.textContent = tr('Loaded {name}.', { name: fileField.files[0].name }); status.classList.remove('error'); } catch (error) { report(error); }
    fileField.value = '';
  });

  function report(error) { status.textContent = error.message; status.classList.add('error'); }
  function note(message) { status.textContent = message; status.classList.remove('error'); }

  async function run() {
    if (busy) return;
    const mode = dialog.dataset.mode, mine = ++request;
    const source = sourceField.value.trim();
    write(CVE_SOURCE_KEY, source);
    busy = true;
    build.disabled = true;
    try {
      let record, steps = [], writeup = '';
      if (mode === 'cve') {
        const id = cveId(idField.value);
        if (!id) throw Error(tr('Enter a CVE id such as CVE-2021-44228.'));
        note(tr('Fetching {id} from {source}…', { id, source: source ? tr('the record source') : 'CVE.org' }));
        record = await fetchCveRecord(id, { source });
      } else {
        const read = readWriteup(textField.value);
        steps = read.steps;
        writeup = read.title || tr('the write-up');
        if (read.ids[0]) {
          note(tr('Found {id} in the write-up; fetching its record from {source}…', { id: read.ids[0], source: source ? tr('the record source') : 'CVE.org' }));
          record = await fetchCveRecord(read.ids[0], { source });
        } else {
          // No CVE named: the picture is the write-up's own claims, marked as such.
          record = { id: '', title: read.title || tr('Vulnerability described in a write-up'), description: textField.value.trim().split(/\n\s*\n/)[0].slice(0, 400), cwes: [], cvss: null, affected: [], references: [], solution: '', workaround: '', published: '', kev: false, source: '' };
        }
        if (!steps.length) note(tr('No numbered steps, commands or request lines were found; the board shows the record alone.'));
      }
      if (mine !== request) return;
      const { doc, assumptions } = buildCveExplainer(record, { steps, writeup });
      if (!place(doc, doc.title)) return;
      dialog.close();
      const extra = assumptions.length ? ' ' + tr('{count} assumption(s) are written in the note.', { count: assumptions.length }) : '';
      toast(tr('Built "{title}". Open Present to step through it.', { title: doc.title }) + extra);
    } catch (error) {
      if (mine === request) report(error);
    } finally {
      if (mine === request) { busy = false; build.disabled = false; }
    }
  }
  build.addEventListener('click', (e) => { e.preventDefault(); run(); });
  dialog.addEventListener('submit', (e) => { e.preventDefault(); run(); });
  idField.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  el('import-cancel').addEventListener('click', (e) => { e.preventDefault(); request += 1; busy = false; build.disabled = false; dialog.close(); });
  dialog.addEventListener('close', () => { request += 1; busy = false; build.disabled = false; });
  return { start };
}
