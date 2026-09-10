// The assistant panel: settings, a message thread, quick actions, and the
// composer. One reply is one undo step: the agent owns the store batch, the
// panel only shows what happened and points the camera at it.
import { createSettings, PROVIDERS, EFFORTS, estimateCost, THREAD_KEY } from '../ai/settings.js';
import { makeProvider, probeTools } from '../ai/providers/index.js';
import { listOpenAIModels } from '../ai/providers/openai.js';
import { BACKEND } from '../ai/runtime.js';
import { runRequest, runSingleShot } from '../ai/agent.js';
import { createExecutor } from '../ai/tools.js';
import { boardText } from '../ai/context.js';
import { stableSystem, perRequestSystem } from '../ai/prompt.js';
import { ProviderError } from '../ai/providers/errors.js';
import { checkDoc } from '../drc.js';
import { contentBounds, nodeRect, NOTE_W, noteHeight } from '../geometry.js';
import { findItem } from '../state.js';
import { panelHeader, bindCollapsible } from './collapsible.js';
import { escAttr, toast, onPress } from './press.js';
import { initAssistantDocuments } from './assistant-documents.js';
import { tr, trd, onLanguageChange, getLang } from '../i18n.js';

const privacy = () => BACKEND
  ? tr('The board\'s text and API key pass through this website\'s server to your chosen provider. The server does not store your key. Remember saves it only in this browser.')
  : tr('The board\'s text and API key are sent to your chosen endpoint, through a relay when configured. Keys are saved in this browser only when you choose Remember.');
const intro = () => tr('Describe a board and it builds it; ask for a change and it edits the one you have. Every reply is a single undo step.');

// Lucide icons (ISC, see THIRD_PARTY_NOTICES.md), the same stroke family as
// the toolbar. 24-box paths; the size comes from CSS.
const ICONS = {
  sparkles: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
  newThread: '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 8v6"/><path d="M9 11h6"/>',
  settings: '<path d="M14 17H5"/><path d="M19 7h-9"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  send: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  stop: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  show: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/><path d="m16 16-1.9-1.9"/>',
  build: '<rect width="18" height="7" x="3" y="3" rx="1"/><rect width="9" height="7" x="3" y="14" rx="1"/><rect width="5" height="7" x="16" y="14" rx="1"/>',
  fix: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/>',
  fill: '<path d="M14.364 13.634a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506l4.013-4.009a1 1 0 0 0-3.004-3.004z"/><path d="M14.487 7.858A1 1 0 0 1 14 7V2"/><path d="M20 19.645V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l2.516 2.516"/><path d="M8 18h1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  ok: '<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
};
const icon = (name) => `<svg class="ai-ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

// What the header's dot says about the provider: the probe result when there
// is one, otherwise whether there is anything to call at all.
const states = () => ({ unset: tr('Set up'), untested: tr('Untested'), ready: tr('Ready'), single: tr('Single-shot') });

const actionCards = () => [
  { act: 'build', icon: 'build', title: tr('Build from a brief'), desc: tr('Start a board from a short spec') },
  { act: 'fix', icon: 'fix', title: tr('Fix checks'), desc: tr('Resolve the design-rule findings on this board') },
  { act: 'fill', icon: 'fill', title: tr('Fill in details'), desc: tr('Part numbers, addresses, and rails from the presets') },
];

export function initAssistant({ store, tools, render, svg, library = null }) {
  const panel = document.getElementById('assistant');
  const btn = document.getElementById('btn-assistant');
  // Reading `window.localStorage` throws outright when site data is blocked,
  // so the settings take a storage that may be null and live in memory.
  let storage = null;
  try { storage = window.localStorage; } catch { storage = null; }
  const settings = createSettings(storage);
  let settingsOpen = false;
  let busy = null;           // AbortController while a request runs

  const el = (id) => document.getElementById(id);
  // The whole chrome is rebuilt when the interface language changes, so every
  // element inside the panel is a fresh node afterwards: the references live
  // here and bindChrome() re-resolves them and rebinds their listeners. What
  // the panel holds — the thread, the settings, a running request, the
  // attached documents — is state outside the markup and survives.
  let form, meta, metaText, metaState, result, thread, actions, composer, input, sendBtn, stopBtn, usageEl, documentsEl;

  function renderChrome() {
    // A rebuild must not swallow what the user has already typed.
    const draft = input ? input.value : '';
    panel.innerHTML = panelHeader(tr('Assistant'), 'assistant')
      + `<button id="ai-meta" type="button" data-state="unset" title="${escAttr(tr('Provider settings'))}"><i class="ai-dot"></i><span></span><em class="ai-state"></em></button>`
      + '<div id="ai-body">'
      + '<form id="ai-settings" hidden>'
      + `<label><span>${escAttr(tr('Provider'))}</span><select id="ai-provider">${Object.entries(PROVIDERS).map(([id, p]) => `<option value="${id}">${escAttr(p.name)}</option>`).join('')}</select></label>`
      + `<label><span>${escAttr(tr('Model'))}</span><input id="ai-model" type="text" list="ai-models" spellcheck="false" autocomplete="off"><datalist id="ai-models"></datalist></label>`
      + `<label><span>${escAttr(tr('Base URL'))}</span><input id="ai-base" type="url" spellcheck="false" autocomplete="off"></label>`
      + `<label><span>${escAttr(tr('API key'))}</span><span class="ai-keywrap"><input id="ai-key" type="password" autocomplete="off" placeholder="${escAttr(tr('paste your key'))}"><button id="ai-key-eye" class="ai-icon-btn" type="button" title="${escAttr(tr('Show key'))}" aria-label="${escAttr(tr('Show key'))}">${icon('eye')}</button></span></label>`
      + `<label class="row"><input id="ai-remember" type="checkbox"> ${escAttr(tr('Remember the key on this device'))}</label>`
      + `<label><span>${escAttr(tr('Effort'))}</span><select id="ai-effort">${EFFORTS.map((e) => `<option value="${e}">${escAttr(trd(e))}</option>`).join('')}</select></label>`
      + `<div class="ai-buttons"><button id="ai-save" type="submit">${escAttr(tr('Save'))}</button><button id="ai-test" type="button">${escAttr(tr('Test connection'))}</button>`
      + `<button id="ai-models-btn" type="button">${escAttr(tr('List models'))}</button><button id="ai-forget" type="button">${escAttr(tr('Forget key'))}</button></div>`
      + '<div id="ai-test-result" class="ai-result" hidden></div>'
      + `<div class="ai-note" id="ai-help"></div><div class="ai-note ai-privacy">${escAttr(privacy())}</div>`
      + '</form>'
      + '<div id="ai-thread" role="log" aria-live="polite"></div>'
      + `<div id="ai-actions" class="cards"><p class="ai-intro">${escAttr(intro())}</p>`
      + actionCards().map((c) => `<button type="button" data-act="${c.act}"><i class="ai-act-ic">${icon(c.icon)}</i><span><b>${escAttr(c.title)}</b><small>${escAttr(c.desc)}</small></span></button>`).join('')
      + '</div>'
      + '</div>'
      + '<div id="ai-foot"><div id="ai-documents"></div><div id="ai-composer">'
      + `<textarea id="ai-input" rows="1" placeholder="${escAttr(tr('Describe a board, or ask for a change'))}" aria-label="${escAttr(tr('Message the assistant'))}"></textarea>`
      + `<div class="ai-composer-row"><span class="ai-hint"><kbd>Enter</kbd> ${escAttr(tr('send'))} &middot; <kbd>Shift</kbd>+<kbd>Enter</kbd> ${escAttr(tr('new line'))}</span>`
      + `<button id="ai-send" type="button" title="${escAttr(tr('Send (Enter)'))}" aria-label="${escAttr(tr('Send'))}">${icon('send')}</button>`
      + `<button id="ai-stop" type="button" title="${escAttr(tr('Stop the request'))}" aria-label="${escAttr(tr('Stop'))}" hidden>${icon('stop')}</button></div>`
      + '</div><div id="ai-usage"></div></div>';
    // The shared header gets the panel's badge and its own controls around the
    // fold toggle: new thread and settings before it, close after it.
    const h3 = panel.querySelector('h3');
    h3.insertAdjacentHTML('afterbegin', `<span class="ai-badge">${icon('sparkles')}</span>`);
    h3.querySelector('.panel-toggle').insertAdjacentHTML('beforebegin', '<span class="ai-tools">'
      + `<button id="ai-new" class="ai-icon-btn" type="button" title="${escAttr(tr('New thread'))}" aria-label="${escAttr(tr('New thread'))}">${icon('newThread')}</button>`
      + `<button id="ai-gear" class="ai-icon-btn" type="button" title="${escAttr(tr('Settings'))}" aria-label="${escAttr(tr('Assistant settings'))}">${icon('settings')}</button></span>`);
    h3.querySelector('.panel-toggle').insertAdjacentHTML('afterend', `<button id="ai-close" class="ai-icon-btn" type="button" title="${escAttr(tr('Close (A)'))}" aria-label="${escAttr(tr('Close the assistant'))}">${icon('close')}</button>`);
    bindCollapsible(panel, 'assistant');
    bindChrome();
    if (draft) { input.value = draft; grow(); }
  }

  // Everything the fresh markup needs: the references, and the listeners on
  // nodes the rebuild replaced. Listeners on nodes outside the panel (the
  // toolbar button, the window, the document, the store) are bound once, on
  // their own, and must not come through here.
  function bindChrome() {
    form = el('ai-settings');
    meta = el('ai-meta');
    metaText = meta.querySelector('span');
    metaState = meta.querySelector('.ai-state');
    result = el('ai-test-result');
    thread = el('ai-thread');
    actions = el('ai-actions');
    composer = el('ai-composer');
    input = el('ai-input');
    sendBtn = el('ai-send');
    stopBtn = el('ai-stop');
    usageEl = el('ai-usage');
    // The documents container keeps its node across a rebuild: the attachments
    // component holds it, along with the drop listeners bound on it directly.
    const keptDocuments = documentsEl;
    documentsEl = el('ai-documents');
    if (keptDocuments) { documentsEl.replaceWith(keptDocuments); documentsEl = keptDocuments; }

    form.addEventListener('input', invalidateDraft);
    form.addEventListener('change', invalidateDraft);
    form.addEventListener('submit', saveSettings);
    el('ai-provider').addEventListener('change', changeProvider);
    el('ai-key-eye').addEventListener('click', showKey);
    el('ai-forget').addEventListener('click', forgetKey);
    el('ai-test').addEventListener('click', testConnection);
    el('ai-models-btn').addEventListener('click', listModels);
    el('ai-gear').addEventListener('click', () => showSettings(!settingsOpen));
    meta.addEventListener('click', () => showSettings(true));
    el('ai-close').addEventListener('click', close);
    el('ai-new').addEventListener('click', () => { if (!busy) { clearThread(); showSettings(false); } });
    input.addEventListener('input', grow);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send(input.value);
      }
    });
    sendBtn.addEventListener('click', () => send(input.value));
    stopBtn.addEventListener('click', () => busy?.abort());
    actions.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => ACTIONS[b.dataset.act]());
    });
    grow();
    // An open settings sheet and a running request outlive the markup.
    form.hidden = !settingsOpen;
    el('ai-gear').classList.toggle('active', settingsOpen);
    if (busy) setBusy(true);
  }

  renderChrome();

  function refreshMeta() {
    const s = settings.get();
    const single = s.tools === false;
    metaText.innerHTML = `${escAttr(PROVIDERS[s.provider].name)} · <code>${escAttr(s.model || tr('no model'))}</code>${single ? escAttr(tr(' · single-shot')) : ''}`;
    const state = !settings.configured() ? 'unset' : s.tools === true ? 'ready' : single ? 'single' : 'untested';
    meta.dataset.state = state;
    metaState.textContent = states()[state];
    meta.title = tr('{meta} · {state}. Click for settings.', { meta: metaText.textContent, state: states()[state] });
  }

  function showResult(kind, text) {
    result.className = `ai-result ${kind}`;
    result.innerHTML = `${icon(kind === 'ok' ? 'ok' : 'alert')}<span>${escAttr(text)}</span>`;
    result.hidden = false;
  }

  let formVersion = 0;
  let testedConnection = null;
  const formSettings = () => ({
    provider: el('ai-provider').value, model: el('ai-model').value.trim(),
    baseUrl: el('ai-base').value.trim(), effort: el('ai-effort').value,
  });
  const sameConnection = (a, b) => ['provider', 'model', 'baseUrl', 'effort'].every((k) => a[k] === b[k]);
  function invalidateDraft() {
    formVersion++;
    testedConnection = null;
    result.hidden = true;
  }

  // What the sheet holds, saved or not, so a chrome rebuild can put it back.
  const formDraft = () => ({ ...formSettings(), key: el('ai-key').value, remember: el('ai-remember').checked });

  // Fills the sheet from the saved settings, or from a draft taken with
  // formDraft() when unsaved edits must survive a rebuild.
  function fillForm(draft = null) {
    const s = draft ? { ...settings.get(), ...draft } : settings.get();
    el('ai-provider').value = s.provider;
    el('ai-model').value = s.model;
    el('ai-base').value = s.baseUrl;
    el('ai-key').value = draft ? draft.key : settings.getKey();
    el('ai-remember').checked = s.remember;
    el('ai-effort').value = s.effort;
    const p = PROVIDERS[s.provider];
    el('ai-key').disabled = !p.needsKey;
    el('ai-key-eye').disabled = !p.needsKey;
    el('ai-key').placeholder = p.needsKey ? tr('paste your key') : tr('no key needed');
    // Anthropic has no model list endpoint the browser may call.
    el('ai-models-btn').hidden = p.adapter === 'anthropic';
    el('ai-help').textContent = trd(p.help || '');
    suggestModels(p.models);
  }

  // The Model field's datalist: the provider's suggested ids until "List
  // models" replaces them with what the endpoint actually serves.
  function suggestModels(names) {
    el('ai-models').innerHTML = names.map((n) => `<option value="${escAttr(n)}">`).join('');
  }

  // The settings are a sheet over the body: the thread, actions, and composer
  // step aside while it is open so the form has the whole height to scroll in.
  function showSettings(on) {
    settingsOpen = on;
    form.hidden = !on;
    panel.classList.toggle('settings', on);
    el('ai-gear').classList.toggle('active', on);
    if (on) { invalidateDraft(); fillForm(); } else el('ai-input').focus();
    refreshMeta();
  }

  function changeProvider() {
    const provider = el('ai-provider').value;
    settings.set({ provider, model: '', baseUrl: '', tools: null });
    // Model-facing turns from one provider must not replay to another (raw
    // thinking blocks, tool-call ids); the visible thread stays.
    history = [];
    saveThread();
    result.hidden = true;
    fillForm();
    refreshMeta();
  }

  function showKey() {
    const k = el('ai-key');
    const shown = k.type === 'password';
    k.type = shown ? 'text' : 'password';
    el('ai-key-eye').innerHTML = icon(shown ? 'eyeOff' : 'eye');
    el('ai-key-eye').title = shown ? tr('Hide key') : tr('Show key');
  }

  function saveSettings(e) {
    e.preventDefault();
    const s = formSettings();
    const key = el('ai-key').value.trim();
    const previous = settings.get();
    settings.set(s);
    settings.setKey(key, el('ai-remember').checked);
    if (testedConnection && sameConnection(testedConnection.settings, s) && testedConnection.key === key) settings.set({ tools: testedConnection.ok });
    if (!sameConnection(previous, s)) { history = []; saveThread(); }
    refreshMeta();
    if (settings.configured()) { showSettings(false); toast(tr('Assistant settings saved.')); } else showResult('warn', tr('Add a model and, for this provider, a key.'));
  }

  function forgetKey() {
    invalidateDraft();
    settings.forgetKey();
    el('ai-key').value = '';
    el('ai-remember').checked = false;
    settings.set({ remember: false });
    refreshMeta();
    toast(tr('Key forgotten.'));
  }

  async function testConnection() {
    const s = formSettings();
    const key = el('ai-key').value.trim();
    const version = formVersion;
    const current = () => version === formVersion && sameConnection(s, formSettings()) && key === el('ai-key').value.trim();
    testedConnection = null;
    if (sameConnection(s, settings.get()) && key === settings.getKey()) settings.set({ tools: null });
    el('ai-test').disabled = true;
    showResult('wait', tr('Connecting to {model}…', { model: s.model || tr('the model') }));
    try {
      const ok = await probeTools(makeProvider(s, key));
      if (!current()) return;
      testedConnection = { settings: s, key, ok };
      if (sameConnection(s, settings.get()) && key === settings.getKey()) settings.set({ tools: ok });
      const msg = ok ? tr('Connected. This model calls tools.') : tr('Connected. This model cannot call tools; the assistant will use single-shot mode.');
      showResult(ok ? 'ok' : 'warn', msg);
      toast(msg);
      refreshMeta();
    } catch (err) {
      if (!current()) return;
      const msg = tr('Test failed: {error}', { error: `${err.message}${err.hint ? `\n${err.hint}` : ''}` });
      showResult('err', msg);
      toast(msg);
    } finally {
      el('ai-test').disabled = false;
    }
  }

  async function listModels() {
    const version = formVersion;
    const p = PROVIDERS[el('ai-provider').value];
    const baseUrl = el('ai-base').value.trim();
    const apiKey = p.needsKey ? el('ai-key').value.trim() : '';
    try {
      const names = await listOpenAIModels({ baseUrl, apiKey });
      if (version !== formVersion) return;
      suggestModels(names);
      const msg = names.length ? tr('{n} models listed; pick one in the Model field.', { n: names.length }) : tr('The endpoint listed no models.');
      showResult(names.length ? 'ok' : 'warn', msg);
      toast(msg);
    } catch (err) {
      if (version !== formVersion) return;
      const msg = tr('Could not list models: {error}', { error: `${err.message}${err.hint ? `\n${err.hint}` : ''}` });
      showResult('err', msg);
      toast(msg);
    }
  }

  function isOpen() { return !panel.hidden; }
  function open() {
    // Opening the assistant is a request to see panels, whichever path asks
    // (the button, the A shortcut, a DRC "Fix"): a hidden container would
    // leave the panel display:none and the focus below would not land.
    const app = document.getElementById('app');
    if (app.classList.contains('panels-hidden')) document.getElementById('btn-panels').click();
    panel.hidden = false;
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    // Settings are read from storage on every call, so a seed written after
    // boot shows up here.
    refreshMeta();
    if (!settings.configured()) showSettings(true);
    // The thread renders while the panel is hidden, where it has no height
    // to scroll; show its newest message now that it does.
    thread.scrollTop = thread.scrollHeight;
    el('ai-input').focus();
  }
  function close() {
    panel.hidden = true;
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
  }
  function toggle() { if (isOpen()) close(); else open(); }

  // The right-hand panels end above this one: publish the height it takes
  // (plus its offset and a gap) as a CSS variable on the canvas area.
  const wrap = document.getElementById('canvas-wrap');
  function reserve() {
    const h = panel.hidden ? 0 : Math.round(panel.getBoundingClientRect().height) + 54 + 10;
    wrap.style.setProperty('--ai-reserve', `${h}px`);
    // A shorter panel keeps the newest message in view.
    thread.scrollTop = thread.scrollHeight;
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(reserve).observe(panel);
  reserve();
  btn.addEventListener('click', toggle);

  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key.toLowerCase() === 'a') toggle();
  });

  refreshMeta();

  onLanguageChange(() => {
    // The rebuild replaces the form; unsaved edits in an open sheet come back.
    const draft = settingsOpen ? formDraft() : null;
    renderChrome();
    repaintUsage();
    attachments.relabel();
    refreshMeta();
    if (settingsOpen) fillForm(draft);
    renderThread();
  });

  // ---- Thread ----
  let history = [];          // provider-facing messages
  let visible = [];          // what the thread shows: { role, text, undoSnap?, touched? }
  let generation = store.generation;
  // What the usage line last said, as arguments rather than text, so a
  // language change can render the same numbers in the new language.
  let lastUsage = null;
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const stable = stableSystem();
  // Initialization calls onChange before the controller is assigned.
  let attachments;
  function refreshSend() { sendBtn.disabled = !!busy || !!attachments?.isImporting(); }
  attachments = initAssistantDocuments({ container: documentsEl, onChange: refreshSend });

  // The composer grows with its text up to a few lines, then scrolls; the
  // send button lights up once there is something to send.
  function grow() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
    composer.classList.toggle('has-text', input.value.trim().length > 0);
  }

  // Keep the last 40 model-facing messages, but never cut between a
  // tool_use and its results: start at a user message that carries text.
  function trimHistory(h, max = 40) {
    if (h.length <= max) return h;
    let start = h.length - max;
    while (start < h.length && !(h[start].role === 'user' && h[start].content.some((b) => b.type === 'text'))) start += 1;
    return h.slice(start);
  }

  const VISIBLE_ROLES = ['user', 'assistant', 'status', 'error'];

  function saveThread() {
    try {
      // The undo snapshot is a whole document and belongs to this session
      // only: a restored thread's chips are dead.
      const shown = visible.slice(-80).map(({ undoSnap, ...m }) => m);
      localStorage.setItem(THREAD_KEY, JSON.stringify({ history, visible: shown, totals }));
    } catch { /* storage may be blocked; the thread lives for this session */ }
  }
  function loadThread() {
    try {
      const t = JSON.parse(localStorage.getItem(THREAD_KEY) || 'null');
      const ok = t && Array.isArray(t.history) && Array.isArray(t.visible)
        && t.history.every((m) => m && typeof m.role === 'string' && Array.isArray(m.content))
        && t.visible.every((m) => m && VISIBLE_ROLES.includes(m.role) && typeof m.text === 'string');
      if (ok) {
        history = t.history;
        visible = t.visible;
        Object.assign(totals, t.totals || {});
      }
    } catch { /* corrupt thread: start fresh */ }
  }
  function clearThread() {
    attachments.clear();
    history = [];
    visible = [];
    for (const k of Object.keys(totals)) totals[k] = 0;
    try { localStorage.removeItem(THREAD_KEY); } catch { /* fine */ }
    renderThread();
    lastUsage = null;
    repaintUsage();
  }

  function chipRow(m, index) {
    if (!m.touched?.length) return '';
    const live = !busy && m.undoSnap && store.undoStack.at(-1) === m.undoSnap;
    return `<div class="ai-chips"><button type="button" data-undo="${index}"${live ? '' : ' disabled'}>${icon('undo')}${escAttr(tr('Undo this'))}</button>`
      + `<button type="button" data-show="${index}">${icon('show')}${escAttr(tr('Show changes'))}</button></div>`;
  }

  // Consecutive tool status lines render as one activity block, a check per
  // finished step and a spinner on the one still running; a reply that has
  // no text yet shows as a thinking row while the request is open.
  function renderThread() {
    const parts = [];
    let activity = null;
    const flush = () => { if (activity) { parts.push(`<div class="ai-activity">${activity.join('')}</div>`); activity = null; } };
    const last = visible.length - 1;
    visible.forEach((m, i) => {
      if (m.role === 'status') {
        const live = !!busy && (i === last || (i === last - 1 && visible[last].role === 'assistant'));
        activity = activity || [];
        activity.push(`<div class="ai-status${live ? ' live' : ''}">${icon('check')}<span>${escAttr(m.text)}</span></div>`);
        return;
      }
      // A request that failed before any text leaves nothing to show but the
      // error bubble that follows it.
      if (m.role === 'assistant' && !m.text && !m.touched?.length) {
        // Thinking dots before the first tool call; once there is a live
        // status line its spinner is the indicator.
        if (busy && i === last && visible[i - 1]?.role !== 'status') { flush(); parts.push(`<div class="ai-typing" aria-label="${escAttr(tr('Thinking'))}"><i></i><i></i><i></i></div>`); }
        return;
      }
      flush();
      if (m.role === 'error') parts.push(`<div class="ai-msg error">${icon('alert')}<span>${escAttr(m.text)}</span></div>`);
      else parts.push(`<div class="ai-msg ${m.role}">${escAttr(m.text)}${m.role === 'assistant' ? chipRow(m, i) : ''}</div>`);
    });
    flush();
    thread.innerHTML = parts.join('');
    thread.querySelectorAll('[data-undo]').forEach((b) => onPress(b, () => { if (!b.disabled && !busy) store.undo(); }));
    thread.querySelectorAll('[data-show]').forEach((b) => onPress(b, () => highlight(visible[Number(b.dataset.show)].touched || [])));
    thread.scrollTop = thread.scrollHeight;
    // An empty thread shows the actions as cards under an intro; once there
    // is a conversation they fold to a chip row above the composer.
    const empty = visible.length === 0;
    actions.classList.toggle('cards', empty);
    actions.classList.toggle('chips', !empty);
  }

  // A chip is live only while the exact snapshot its reply pushed is still on
  // top of the undo stack, and no request is open: an undo inside the agent's
  // batch would cut it in half. Identity, not depth: an edit that pushes one
  // step and an undo that pops it leave the depth unchanged.
  function refreshChips() {
    thread.querySelectorAll('[data-undo]').forEach((b) => {
      const m = visible[Number(b.dataset.undo)];
      b.disabled = !!busy || !(m?.undoSnap && store.undoStack.at(-1) === m.undoSnap);
    });
  }

  store.subscribe(() => {
    if (store.generation !== generation) {
      generation = store.generation;
      // The board a running request was editing is gone; nothing it returns
      // applies to the new one.
      busy?.abort();
      clearThread();
      return;
    }
    refreshChips();
  });

  // ---- Canvas feedback ----
  function highlight(ids) {
    tools.ui.highlight.clear();
    for (const id of ids) tools.ui.highlight.add(id);
    render('overlay');
  }

  function itemRect(id) {
    const doc = store.doc;
    const n = doc.nodes.find((x) => x.id === id);
    if (n) return nodeRect(n);
    const z = doc.zones.find((x) => x.id === id);
    if (z) return { x: z.x, y: z.y, w: z.w, h: z.h };
    const t = doc.notes.find((x) => x.id === id);
    if (t) return { x: t.x, y: t.y, w: NOTE_W, h: noteHeight(t.text) };
    return null;
  }

  // Pan the least that brings the touched items into view; fit if the board
  // was empty when the request started.
  function showTouched(ids, wasEmpty) {
    if (wasEmpty) { tools.zoomFit(); return; }
    const rects = ids.map(itemRect).filter(Boolean);
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

  // ---- Sending ----
  function errorText(err) {
    if (err instanceof ProviderError) {
      const lead = {
        auth: tr('The provider rejected the key.'),
        rate: tr('The provider is rate-limiting requests; try again in a moment.'),
        network: tr('Could not reach the provider.'),
        model: tr('The model was not found.'),
        context: tr('The thread is too long for the model; start a new thread.'),
        refusal: tr('The model declined this request.'),
      }[err.code] || tr('The request failed.');
      return `${lead} ${err.message}${err.hint ? `\n${err.hint}` : ''}`;
    }
    return err?.message || String(err);
  }

  // While a request runs the canvas is read-only: a drag, an Escape, or a
  // toolbar edit aliases the same store batch and would cut the reply's
  // single undo step in half.
  function setBusy(on) {
    attachments.setBusy(on);
    refreshSend();
    form.inert = on;
    sendBtn.hidden = on;
    stopBtn.hidden = !on;
    input.disabled = on;
    actions.querySelectorAll('button').forEach((b) => { b.disabled = on; });
    tools.ui.busy = on;
    // `inert` takes the chrome out of the tab order as well as the pointer,
    // which pointer-events alone does not; the assistant's own button stays.
    for (const id of ['palette', 'props', 'journey-panel']) document.getElementById(id).inert = on;
    document.querySelectorAll('#toolbar button, #toolbar input').forEach((node) => { if (node.id !== 'btn-assistant') node.inert = on; });
    document.getElementById('app').classList.toggle('ai-busy', on);
    refreshChips();
  }

  function usageText(u, cost) {
    let s = tr('{in} in · {out} out', { in: u.input.toLocaleString(), out: u.output.toLocaleString() });
    if (u.cacheRead) s += tr(' · {n} cached', { n: u.cacheRead.toLocaleString() });
    if (cost !== null) s += tr(' · ≈ ${cost} (estimate)', { cost: cost.toFixed(cost < 0.01 ? 4 : 2) });
    return s;
  }
  function setUsage(text) {
    usageEl.textContent = text;
    usageEl.title = text;
  }
  // The one place the usage line is written: nothing before the first reply,
  // the thread total alone for a restored thread, both halves after a reply.
  function repaintUsage() {
    if (!lastUsage) { setUsage(''); return; }
    if (!lastUsage.usage) { setUsage(tr('thread: {thread}', { thread: usageText(totals, null) })); return; }
    setUsage(tr('last: {last} · thread: {thread}', {
      last: usageText(lastUsage.usage, lastUsage.lastCost),
      thread: usageText(totals, lastUsage.threadCost),
    }));
  }

  async function send(text) {
    const userText = String(text ?? '').trim();
    if (!userText || busy || attachments.isImporting()) return;
    if (!settings.configured()) { open(); showSettings(true); toast(tr('Add a provider and key first.')); return; }
    const gen = store.generation;
    const s = settings.get();
    const wasEmpty = !store.doc.nodes.length && !store.doc.zones.length && !store.doc.notes.length;
    const executor = createExecutor({
      getDoc: () => store.doc,
      commit: (fn) => store.mutate(fn),
      selection: () => [...store.selection],
      library,
    });
    const board = boardText(store.doc, { selection: [...store.selection], findings: checkDoc(store.doc) });
    const system = [stable, perRequestSystem({ date: new Date().toISOString().slice(0, 10), effort: s.effort, singleShot: s.tools === false, language: getLang() })];
    const sources = attachments.context();
    const sourceSummary = sources.entries.length
      ? '\n\n' + tr('Sources: {list}', { list: sources.entries.map((e) => tr('{name} ({used}/{total} chars{partial})', { name: e.name, used: e.used.toLocaleString(), total: e.total.toLocaleString(), partial: e.partial ? tr(', partial') : '' })).join('; ') })
      : '';
    visible.push({ role: 'user', text: userText + sourceSummary });
    const reply = { role: 'assistant', text: '' };
    visible.push(reply);
    // The chip is live only while this exact snapshot stays on top; capture
    // what was there before so an unchanged stack leaves no chip at all.
    const undoTopBefore = store.undoStack.at(-1);
    const undoLenBefore = store.undoStack.length;
    busy = new AbortController();
    setBusy(true);
    input.value = '';
    grow();
    renderThread();
    const run = s.tools === false ? runSingleShot : runRequest;
    // The lock is released in a finally: a throw inside the busy window must
    // not leave the canvas read-only. It reaches the user as an error bubble
    // through the same res.error path a provider failure takes.
    let res;
    try {
      res = await run({
        provider: makeProvider(s, settings.getKey()),
        executor, store, system, history, userText, boardText: board, documentText: sources.text, signal: busy.signal,
        onText: (t) => { reply.text += t; renderThread(); },
        onStatus: (line) => { visible.splice(visible.length - 1, 0, { role: 'status', text: line }); renderThread(); },
      });
    } catch (err) {
      res = { text: '', messages: history, touched: new Set(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, stop: 'end', rounds: 0, applied: 0, cutOff: false, error: err };
    } finally {
      busy = null;
      setBusy(false);
    }
    // The board this reply was written against is gone: it has its own thread.
    if (store.generation !== gen) return;
    history = trimHistory(res.messages);
    reply.text = res.text || (res.error ? '' : tr('(no reply)'));
    if (res.cutOff) reply.text += '\n\n' + tr('({how}; edits made so far are kept.)', { how: res.stop === 'aborted' ? tr('Stopped') : tr('Cut off') });
    if (res.stop === 'max_tokens') reply.text += '\n\n' + tr('(The reply hit the length limit.)');
    reply.touched = [...res.touched];
    reply.undoSnap = (store.undoStack.length > undoLenBefore || store.undoStack.at(-1) !== undoTopBefore)
      ? store.undoStack.at(-1)
      : null;
    if (res.error) {
      visible.push({ role: 'error', text: errorText(res.error) });
      if (res.error instanceof ProviderError && (res.error.code === 'auth' || res.error.code === 'model')) showSettings(true);
    }
    // A refusal is not an error on the wire: the reply simply stops. Say so,
    // with whatever explanation the model gave.
    if (res.stop === 'refusal') visible.push({ role: 'error', text: errorText(new ProviderError(res.stopDetails?.explanation || tr('The model declined this request.'), { code: 'refusal' })) });
    for (const k of Object.keys(totals)) totals[k] += res.usage[k] || 0;
    const priced = s.provider === 'anthropic';
    const lastCost = priced ? estimateCost(s.model, res.usage) : null;
    const threadCost = priced ? estimateCost(s.model, totals) : null;
    lastUsage = { usage: res.usage, lastCost, threadCost };
    repaintUsage();
    // A removed part must not linger in the selection.
    const kept = [...store.selection].filter((id) => findItem(store.doc, id));
    if (kept.length !== store.selection.size) store.setSelection(kept);
    renderThread();
    saveThread();
    if (res.touched.size) {
      highlight(res.touched);
      showTouched([...res.touched], wasEmpty);
    }
  }

  const ACTIONS = {
    build: () => {
      input.value = 'Build a board for: \nMust have: \nPower: \nConnectivity: ';
      grow();
      input.focus();
      input.setSelectionRange(19, 19);
    },
    fix: () => {
      const findings = checkDoc(store.doc);
      if (!findings.length) { toast(tr('The board passes every check.')); return; }
      send(`Fix these findings:\n${findings.map((f) => `${f.level} ${f.rule} "${f.message}" ids: ${f.ids.join(' ')}`).join('\n')}`);
    },
    fill: () => send('Fill in blank part numbers, addresses, rails, and notes from the presets. Change nothing else.'),
  };

  document.addEventListener('schematica:fix-finding', (e) => {
    const f = e.detail;
    open();
    send(`Fix this finding: ${f.level} ${f.rule} "${f.message}" ids: ${f.ids.join(' ')}.${f.evidence ? ' Evidence: ' + JSON.stringify(f.evidence) + '. Supported repairs: ' + JSON.stringify(f.supportedFixes || []) + '.' : ''} Change only what this finding needs; leave the rest of the board as it is.`);
  });

  loadThread();
  // A restored thread keeps its running total; the last reply's usage is not
  // persisted, so only the thread half comes back.
  if (totals.input || totals.output) { lastUsage = { usage: null, lastCost: null, threadCost: null }; repaintUsage(); }
  renderThread();
  return { open, close, toggle, isOpen, send, settings };
}
