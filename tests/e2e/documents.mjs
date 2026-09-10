// Browser acceptance for local assistant documents. The caller supplies the
// existing smoke harness so this module owns no browser, server or profile.
import { join } from 'node:path';

export async function runDocumentChecks(harness) {
  const { ROOT, send, js, sleep, check, fakeSeen, seedFake, screenshot } = harness;
  const fixture = name => join(ROOT, 'tests/fixtures/documents', name);
  const waitFor = async (expression, attempts = 160) => {
    let value;
    for (let index = 0; index < attempts; index++) {
      value = await js(expression);
      if (value) return value;
      await sleep(100);
    }
    return value;
  };
  const setInput = async (selector, paths) => {
    await js(`(() => { window.__documentPickerChanged=false; document.querySelector(${JSON.stringify(selector)}).addEventListener('change', () => { window.__documentPickerChanged=true; }, { once:true }); return true; })()`);
    const root = await send('DOM.getDocument', { depth: -1, pierce: true });
    const found = await send('DOM.querySelector', { nodeId: root.result.root.nodeId, selector });
    if (!found.result.nodeId) throw Error(`Missing file input: ${selector}`);
    const assigned = await send('DOM.setFileInputFiles', { nodeId: found.result.nodeId, files: paths });
    if (assigned.error) throw Error(`CDP file assignment failed: ${assigned.error.message}`);
    if (!await waitFor(`window.__documentPickerChanged`, 300)) throw Error(`CDP file picker did not emit change for ${paths.join(', ')}`);
  };
  const settle = () => waitFor(`(() => { const c=document.querySelector('#ai-documents [data-doc-cancel]'); const p=document.querySelector('#ai-documents [data-doc-progress]').textContent; return c.disabled && !/^(Reading|Cancelling)/.test(p); })()`);
  const rows = () => js(`document.querySelectorAll('#ai-documents [data-doc-index]').length`);
  const sourceStorage = () => js(`JSON.stringify(Object.fromEntries(Object.entries(localStorage)))`);

  await js(`(() => { const panel=document.getElementById('assistant'); if (panel.hidden) document.getElementById('btn-assistant').click(); return true; })()`);
  await js(`document.getElementById('ai-new').click(); true`);
  const requestsBeforeImport = fakeSeen.length;
  await setInput('#ai-documents [data-doc-files]', [
    fixture('requirements.md'), fixture('hostile.txt'), fixture('requirements.pdf'),
    fixture('requirements.docx'), fixture('large.txt'), fixture('<img src=x onerror=SCHEMATICA_NAME_8>.md'),
    fixture('corrupt.pdf'), fixture('unsupported.bin'),
  ]);
  await settle();
  const imported = await js(`(() => ({
    rows: document.querySelectorAll('#ai-documents [data-doc-index]').length,
    text: document.querySelector('#ai-documents [data-doc-list]').textContent,
    issues: document.querySelector('#ai-documents [data-doc-issues]').textContent,
    summary: document.querySelector('#ai-documents [data-doc-summary]').textContent,
  }))()`);
  check('choosing documents does not call the provider', fakeSeen.length === requestsBeforeImport, `${fakeSeen.length} vs ${requestsBeforeImport}`);
  check('file input runs real MD, TXT, PDF and DOCX extraction with Unicode markers', imported.rows === 6
    && /SCHEMATICA/.test(imported.summary) === false && /corrupt\.pdf/i.test(imported.issues) && /unsupported\.bin/i.test(imported.issues)
    && /Partial/.test(imported.text) && imported.text.includes('<img src=x onerror=SCHEMATICA_NAME_8>.md'), JSON.stringify(imported));

  const names = await js(`[...document.querySelectorAll('#ai-documents [data-doc-index] label span')].map(e => e.textContent)`);
  check('a failed parser is isolated from successful files', names.includes('requirements.pdf') && names.includes('requirements.docx') && !names.includes('corrupt.pdf'), JSON.stringify(names));
  const hostileIndex = names.indexOf('hostile.txt');
  await js(`document.querySelector('#ai-documents [data-doc-index="${hostileIndex}"] [data-doc-preview]').click(); true`);
  const preview = await js(`(() => { const d=document.querySelector('dialog.ai-document-preview'); return { open:d.open, pre:d.querySelector('pre').textContent, scripts:d.querySelectorAll('script').length }; })()`);
  check('preview renders hostile source as escaped plaintext', preview.open && preview.scripts === 0 && preview.pre.includes('</source><script>alert("SCHEMATICA_HOSTILE_9")</script>'), JSON.stringify(preview));
  await screenshot('/tmp/schematica-documents-preview.png');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(50);
  check('Escape closes the source preview', await js(`!document.querySelector('dialog.ai-document-preview')?.open`));

  const hostileName = '<img src=x onerror=SCHEMATICA_NAME_8>.md';
  const hostileNameIndex = names.indexOf(hostileName);
  await js(`document.querySelector('#ai-documents [data-doc-index="${hostileNameIndex}"] [data-doc-preview]').click(); true`);
  const filenameSafety = await js(`(() => { const d=document.querySelector('dialog.ai-document-preview'); return { title:d.querySelector('h3').textContent, dialogImages:d.querySelectorAll('img').length, listImages:document.querySelectorAll('#ai-documents img').length }; })()`);
  check('hostile filename stays literal in list and preview', filenameSafety.title === hostileName && filenameSafety.dialogImages === 0 && filenameSafety.listImages === 0, JSON.stringify(filenameSafety));
  await js(`document.querySelector('dialog.ai-document-preview [data-doc-close]').click(); true`);

  const mdIndex = names.indexOf('requirements.md');
  await js(`(() => { const c=document.querySelector('#ai-documents [data-doc-index="${mdIndex}"] [data-doc-select]'); c.click(); return !c.checked; })()`);
  const deselected = await js(`document.querySelector('#ai-documents [data-doc-index="${mdIndex}"]').textContent`);
  check('individual source selection updates request inclusion', /Not selected/.test(deselected), deselected);
  await js(`document.querySelector('#ai-documents [data-doc-index="${hostileIndex}"] [data-doc-remove]').click(); true`);
  check('Remove deletes exactly one source', await rows() === 5 && !(await js(`document.querySelector('#ai-documents [data-doc-list]').textContent`)).includes('hostile.txt'));

  const sendStart = fakeSeen.length;
  await js(`(() => { const i=document.getElementById('ai-input'); i.value='Use the attached sources'; document.getElementById('ai-send').click(); return true; })()`);
  await waitFor(`document.getElementById('ai-stop').hidden && document.querySelectorAll('#ai-thread .ai-msg.assistant').length > 0`);
  const roundBodies = fakeSeen.slice(sendStart).map(item => JSON.stringify(item.body));
  const sourceFrames = fakeSeen.slice(sendStart).map(item => item.body.messages.flatMap(message => message.content).find(block => block.text?.includes('SCHEMATICA_LARGE_START'))?.text || '');
  check('selected source payload reaches the provider through its tool round', roundBodies.length === 2
    && roundBodies.every(body => body.includes('SCHEMATICA_PDF_SENSOR_42') && body.includes('SCHEMATICA_DOCX_CAMERA_73') && body.includes('SCHEMATICA_LARGE_START') && body.includes('电源')),
    `${roundBodies.length} provider calls`);
  check('serialized source frame respects the 60,000-character budget', sourceFrames.length === 2
    && sourceFrames.every(frame => frame.length <= 60000 && !frame.includes('SCHEMATICA_LARGE_END')),
    JSON.stringify(sourceFrames.map(frame => frame.length)));
  check('deselected and removed raw source payloads are absent from the request', roundBodies.every(body => !body.includes('SCHEMATICA_MARKDOWN_19') && !body.includes('SCHEMATICA_HOSTILE_9')));
  const stored = await sourceStorage();
  check('raw source payload is absent from board and persisted thread storage', !/SCHEMATICA_(PDF_SENSOR_42|DOCX_CAMERA_73|LARGE_START)/.test(stored));
  await js(`(() => { const blobs=new Map(); window.__documentExport=''; window.__documentCreate=URL.createObjectURL; window.__documentClick=HTMLAnchorElement.prototype.click; URL.createObjectURL=blob => { const url=window.__documentCreate(blob); blobs.set(url,blob); return url; }; HTMLAnchorElement.prototype.click=function(){ const blob=blobs.get(this.href); if (this.download.endsWith('.schematica.json') && blob) blob.text().then(text => { window.__documentExport=text; }); }; document.getElementById('btn-save').click(); return true; })()`);
  const exported = await waitFor(`window.__documentExport`);
  await js(`URL.createObjectURL=window.__documentCreate; HTMLAnchorElement.prototype.click=window.__documentClick; true`);
  check('downloaded board JSON excludes raw source payload', exported && !/SCHEMATICA_(PDF_SENSOR_42|DOCX_CAMERA_73|LARGE_START)/.test(exported));

  await js(`document.getElementById('ai-new').click(); true`);
  check('New thread clears all session documents and their preview', await rows() === 0 && await js(`!document.querySelector('dialog.ai-document-preview')?.open`));

  // CDP supplies the actual directory path; Chromium populates relative paths.
  await setInput('#ai-documents [data-doc-directory]', [fixture('collection')]);
  await settle();
  const folder = await js(`(() => ({ count:document.querySelectorAll('#ai-documents [data-doc-index]').length, names:[...document.querySelectorAll('#ai-documents [data-doc-index] label span')].map(e=>e.textContent) }))()`);
  check('folder input accepts 20 files and preserves nested duplicate basenames', folder.count === 20
    && folder.names.some(name => name.endsWith('alpha/duplicate.txt'))
    && folder.names.some(name => name.endsWith('beta/duplicate.txt')), JSON.stringify(folder));
  await screenshot('/tmp/schematica-documents-desktop.png');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 820, deviceScaleFactor: 1, mobile: false });
  await js(`document.getElementById('btn-palette').click(); scrollTo(0, document.documentElement.scrollHeight); true`);
  await sleep(150);
  const narrow = await js(`(() => { const panel=document.getElementById('assistant').getBoundingClientRect(); const composer=document.getElementById('ai-composer').getBoundingClientRect(); const details=document.querySelector('.ai-document-details').getBoundingClientRect(); const hit=document.elementFromPoint(composer.left+composer.width/2, composer.top+composer.height/2); return { panel:[panel.left,panel.right,innerWidth], composer:[composer.top,composer.bottom,innerHeight], detailsHeight:details.height, hit:hit?.closest('#ai-composer')?.id || '', rows:document.querySelectorAll('[data-doc-index]').length }; })()`);
  check('20-file list keeps the narrow composer reachable', narrow.panel[0] >= 0 && narrow.panel[1] <= narrow.panel[2] + 1 && narrow.composer[0] >= 0 && narrow.composer[1] <= narrow.composer[2] + 1 && narrow.hit === 'ai-composer' && narrow.detailsHeight <= 231 && narrow.rows === 20, JSON.stringify(narrow));
  await screenshot('/tmp/schematica-documents-narrow.png');
  await send('Emulation.clearDeviceMetricsOverride');

  // A real 101-page parser is used; cancellation is requested immediately at
  // the UI boundary, where either zero or already-completed successes are valid.
  await js(`document.querySelector('[data-doc-clear]').click(); true`);
  await setInput('#ai-documents [data-doc-files]', [fixture('many-pages.pdf'), fixture('requirements.docx')]);
  await js(`document.querySelector('#ai-documents [data-doc-cancel]').click(); true`);
  await settle();
  const cancelled = await js(`({ progress:document.querySelector('[data-doc-progress]').textContent, rows:document.querySelectorAll('[data-doc-index]').length, sendDisabled:document.getElementById('ai-send').disabled })`);
  check('Cancel settles real parser work without locking the composer', /cancelled/i.test(cancelled.progress) && cancelled.rows <= 1 && !cancelled.sendDisabled, JSON.stringify(cancelled));

  await js(`(() => { window.__documentArrayBuffer=File.prototype.arrayBuffer; window.__heldReadStarted=false; window.__heldReadSettled=false; window.__releaseHeldRead=null; File.prototype.arrayBuffer=function(){ if (this.name !== 'requirements.pdf') return window.__documentArrayBuffer.call(this); window.__heldReadStarted=true; return new Promise(resolve => { window.__releaseHeldRead=() => window.__documentArrayBuffer.call(this).then(value => { window.__heldReadSettled=true; resolve(value); }); }); }; return true; })()`);
  try {
    await setInput('#ai-documents [data-doc-files]', [fixture('requirements.pdf')]);
    await waitFor(`window.__heldReadStarted`);
    await js(`document.getElementById('ai-new').click(); true`);
    await js(`window.__releaseHeldRead()`);
    await js(`new Promise(resolve => { const channel=new MessageChannel(); channel.port1.onmessage=resolve; channel.port2.postMessage(null); })`);
  } finally {
    await js(`File.prototype.arrayBuffer=window.__documentArrayBuffer; true`);
  }
  const staleRead = await js(`({ started:window.__heldReadStarted, settled:window.__heldReadSettled, rows:document.querySelectorAll('#ai-documents [data-doc-index]').length })`);
  check('New thread rejects stale file-read completion after its held read settles', staleRead.started && staleRead.settled && staleRead.rows === 0, JSON.stringify(staleRead));

  // An individual drop uses bytes fetched from the synthetic fixture server.
  await js(`(async () => { const bytes=await (await fetch('/tests/fixtures/documents/requirements.md')).arrayBuffer(); const file=new File([bytes], 'dropped.md', {type:'text/markdown'}); const dt=new DataTransfer(); dt.items.add(file); document.getElementById('ai-documents').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt})); return true; })()`);
  await settle();
  check('dropping an individual file runs the normal importer', await rows() === 1 && (await js(`document.querySelector('[data-doc-list]').textContent`)).includes('dropped.md'));

  const titleBeforeReplacement = await js(`document.getElementById('title').value`);
  await js(`(() => { window.__documentConfirm=window.confirm; window.confirm=()=>true; document.getElementById('btn-examples').click(); document.querySelector('#examples-menu [data-example]').click(); window.confirm=window.__documentConfirm; return true; })()`);
  await waitFor(`document.getElementById('title').value !== ${JSON.stringify(titleBeforeReplacement)}`);
  check('in-page board replacement clears session documents', await rows() === 0);
  await setInput('#ai-documents [data-doc-files]', [fixture('requirements.md')]);
  await settle();

  const beforeReloadRequests = fakeSeen.length;
  await send('Page.reload', { ignoreCache: true });
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('#ai-documents [data-doc-files]')`);
  check('reload clears session documents without a provider request', await rows() === 0 && fakeSeen.length === beforeReloadRequests);
  await seedFake();
  await js(`document.getElementById('btn-assistant').click(); (() => { const i=document.getElementById('ai-input'); i.value='Continue without sources'; document.getElementById('ai-send').click(); })(); true`);
  await waitFor(`document.getElementById('ai-stop').hidden && document.querySelectorAll('#ai-thread .ai-msg.assistant').length > 0`);
  check('the next request after reload excludes prior raw source text', !JSON.stringify(fakeSeen.at(-1).body).includes('SCHEMATICA_MARKDOWN_19'));
  await js(`document.getElementById('ai-new').click(); true`);

  // Import remains usable when persistent storage writes are blocked.
  await js(`(() => { window.__originalSetItem=Storage.prototype.setItem; Storage.prototype.setItem=function(){ throw new DOMException('blocked','QuotaExceededError'); }; return true; })()`);
  await setInput('#ai-documents [data-doc-files]', [fixture('requirements.md')]);
  await settle();
  const blocked = await js(`({ rows:document.querySelectorAll('[data-doc-index]').length, marker:document.querySelector('[data-doc-list]').textContent.includes('requirements.md') })`);
  await js(`Storage.prototype.setItem=window.__originalSetItem; true`);
  check('blocked localStorage does not prevent in-memory document import', blocked.rows === 1 && blocked.marker, JSON.stringify(blocked));
  await js(`document.getElementById('ai-new').click(); true`);
}
