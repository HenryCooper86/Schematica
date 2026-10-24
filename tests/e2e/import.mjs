// Build from a source, in the Assistant panel: an incident log, a CVE id and
// a write-up each become a board without a provider. The CVE lookup is stubbed at window.fetch so
// the suite never leaves the machine. Registered by the main smoke runner;
// IMPORT_E2E_ONLY=1 runs it alone.
export async function runImportChecks({ js, key, check, sleep, waitFor, capture = async () => {} }) {
  const saved = () => js(`(() => { const reg = JSON.parse(localStorage.getItem('schematica.projects') || '{"active":"main"}'); const slot = reg.active === 'main' ? 'schematica.autosave' : 'schematica.autosave.' + reg.active; const d = JSON.parse(localStorage.getItem(slot) || '{}'); return JSON.stringify({ title: d.title, kinds: (d.nodes || []).map(n => n.kind), labels: (d.nodes || []).map(n => n.label), wires: (d.wires || []).map(w => w.label), zones: (d.zones || []).map(z => z.label), chapters: (d.journey || []).map(j => ({ label: j.label, stops: (j.stops || []).length })), note: (d.notes || [])[0]?.text || '', incident: !!d.incident }); })()`);
  const dialog = () => js(`(() => { const d = document.getElementById('import-dialog'); return JSON.stringify({ open: d.open, mode: d.dataset.mode, status: d.querySelector('#import-status').textContent, error: d.querySelector('#import-status').classList.contains('error'), buildDisabled: d.querySelector('#import-build').disabled, focus: document.activeElement.id }); })()`);
  const record = {
    dataType: 'CVE_RECORD', dataVersion: '5.1', cveMetadata: { cveId: 'CVE-2021-44228', state: 'PUBLISHED' },
    containers: { cna: {
      title: 'Apache Log4j2 JNDI features do not protect against attacker controlled endpoints',
      descriptions: [{ lang: 'en', value: 'Apache Log4j2 JNDI features do not protect against attacker controlled LDAP endpoints.' }],
      affected: [{ vendor: 'Apache Software Foundation', product: 'Apache Log4j2', versions: [{ version: '2.0-beta9', status: 'affected', lessThan: '2.15.0', versionType: 'semver' }] }],
      problemTypes: [{ descriptions: [{ type: 'CWE', lang: 'en', cweId: 'CWE-502', description: 'CWE-502 Deserialization of Untrusted Data' }] }],
      metrics: [{ cvssV3_1: { baseScore: 10, baseSeverity: 'CRITICAL', vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H' } }],
      references: [{ url: 'https://logging.apache.org/log4j/2.x/security.html' }],
      solutions: [{ lang: 'en', value: 'Upgrade to Log4j 2.17.1 or later.' }],
    } },
  };

  await js(`for (const d of document.querySelectorAll('dialog[open]')) d.close(); true`);
  // Every lookup is answered locally; the requested URLs are kept for the checks.
  await js(`(() => { window.__importFetch = window.fetch; window.__importUrls = []; window.__importRecord = ${JSON.stringify(record)}; window.__importMissing = false; window.fetch = async (url) => { window.__importUrls.push(String(url)); if (window.__importMissing) return new Response('{}', { status: 404 }); return Response.json(window.__importRecord); }; window.__importConfirm = window.confirm; window.__confirms = 0; window.confirm = () => { window.__confirms += 1; return true; }; return true; })()`);
  try {
    check('the toolbar has no Import button; the Assistant offers Build from a source with three buttons', await js(`(() => { if (document.getElementById('btn-import') || document.getElementById('import-menu')) return false; const a = document.getElementById('assistant'); if (a.hidden) document.getElementById('btn-assistant').click(); const b = [...document.querySelectorAll('#assistant [data-build]')].map(x => x.dataset.build); return b.join(',') === 'log,cve,poc'; })()`));
    check('the three buttons sit under Options & sources beside the attached documents', await js(`(() => { const row = document.querySelector('#assistant .ai-build-row'); return !!row && !!row.closest('#ai-options') && row.previousElementSibling?.id === 'ai-documents'; })()`));

    // CVE id → explainer board, replacing the current board after confirmation.
    await js(`document.querySelector('#assistant [data-build=cve]').click(); true`);
    let d = JSON.parse(await dialog());
    check('the CVE entry opens the dialog in CVE mode with the id field focused', d.open && d.mode === 'cve' && d.focus === 'import-cve-id', JSON.stringify(d));
    await js(`(() => { const f = document.getElementById('import-cve-id'); f.value = 'cve-2021-44228'; return true; })()`);
    await js(`document.getElementById('import-build').click(); true`);
    await waitFor(`!document.getElementById('import-dialog').open`, 400);
    await sleep(500);
    let s = JSON.parse(await saved());
    check('a CVE id builds the explainer: attacker, product, flaw, impacts, two zones and a five-chapter story', s.title === 'CVE-2021-44228: Apache Log4j2 JNDI features do not protect against attacker controlled endpoints' && s.kinds.join(',') === 'threatactor,package,vulnerability,dataleak,codeexec,processcrash' && s.zones.join(',') === 'Internet,Affected system' && s.chapters.map(c => c.label).join(',') === 'Who acts,Boundary crossed,The flaw,Impact,Fix' && /Fix: Upgrade to Log4j 2.17.1/.test(s.note), JSON.stringify(s));
    check('only the id went to CVE.org, and replacing a non-empty board asked first', await js(`JSON.stringify({ urls: window.__importUrls, confirms: window.__confirms })`) === JSON.stringify({ urls: ['https://cveawg.mitre.org/api/cve/CVE-2021-44228'], confirms: 1 }), await js(`JSON.stringify({ urls: window.__importUrls, confirms: window.__confirms })`));
    check('the canvas shows the six cards and the toast names the board', await js(`document.querySelectorAll('#canvas .node').length === 6 && document.getElementById('toast').textContent.includes('Open Present')`));
    await capture('import-cve-explainer');
    await js(`document.getElementById('undo').click(); true`);
    await sleep(500);
    check('one Undo restores the previous board', JSON.parse(await saved()).title !== 'CVE-2021-44228: Apache Log4j2 JNDI features do not protect against attacker controlled endpoints');

    // A missing record is reported inside the dialog, which stays open.
    await js(`window.__importMissing = true; window.__importUrls = []; document.querySelector('#assistant [data-build=cve]').click(); document.getElementById('import-cve-id').value = 'CVE-2030-0001'; document.getElementById('import-build').click(); true`);
    await waitFor(`document.getElementById('import-dialog').querySelector('#import-status').classList.contains('error')`, 400);
    d = JSON.parse(await dialog());
    check('a record nobody has is reported in the dialog and Build is usable again', d.open && d.status === 'CVE.org has no record for CVE-2030-0001.' && !d.buildDisabled, JSON.stringify(d));
    check('a nonsense id never leaves the browser', await js(`(() => { document.getElementById('import-cve-id').value = 'not an id'; window.__importUrls = []; document.getElementById('import-build').click(); const st = document.getElementById('import-status').textContent; return st.startsWith('Enter a CVE id') && window.__importUrls.length === 0; })()`));
    await js(`document.getElementById('import-cancel').click(); window.__importMissing = false; true`);

    // A write-up naming the CVE: its steps become stops on a proof-of-concept card.
    await js(`document.querySelector('#assistant [data-build=poc]').click(); true`);
    d = JSON.parse(await dialog());
    check('the write-up entry opens the dialog in write-up mode with the text area focused', d.open && d.mode === 'poc' && d.focus === 'import-poc-text', JSON.stringify(d));
    await js(`(() => { document.getElementById('import-poc-text').value = '# Notes on CVE-2021-44228 in a lab\\n\\n1. Start the sample service\\n2. Send a request with the test header\\n3. Watch the service log line\\n'; document.getElementById('import-build').click(); return true; })()`);
    await waitFor(`!document.getElementById('import-dialog').open`, 400);
    await sleep(500);
    s = JSON.parse(await saved());
    const poc = s.chapters.find(c => c.label === 'Steps from the write-up');
    check('a write-up builds the explainer from the CVE it names with its three steps as stops', s.kinds.includes('exploit') && poc && poc.stops === 3 && s.wires.includes('follows the steps') && /quoted from the write-up as written/.test(s.note), JSON.stringify(s));
    await capture('import-writeup-explainer');

    // A write-up with no CVE: the picture is the document's own claim, marked as such.
    await js(`document.querySelector('#assistant [data-build=poc]').click(); document.getElementById('import-poc-text').value = 'An internal note about a flaw in our build agent.\\n\\n- Open the settings page\\n- Change the agent name\\n'; document.getElementById('import-build').click(); true`);
    await waitFor(`!document.getElementById('import-dialog').open`, 400);
    await sleep(500);
    s = JSON.parse(await saved());
    check('a write-up without a CVE still draws, with the assumptions written in the note and the toast', s.title === 'An internal note about a flaw in our build agent.' && s.zones[0] === 'Outside the system' && (s.note.match(/Assumption:/g) || []).length === 4 && /Drawn from a write-up alone/.test(s.note), JSON.stringify(s));
    check('the toast counts the assumptions', await js(`document.getElementById('toast').textContent.includes('4 assumption(s)')`));

    // A private record source replaces the public ones and is remembered.
    await js(`window.__importUrls = []; document.querySelector('#assistant [data-build=cve]').click(); document.getElementById('import-source').value = 'https://cve.internal.example/api/{id}'; document.getElementById('import-cve-id').value = 'CVE-2021-44228'; document.getElementById('import-build').click(); true`);
    await waitFor(`!document.getElementById('import-dialog').open`, 400);
    check('a record source template is used instead of CVE.org and kept for next time', await js(`JSON.stringify([window.__importUrls, localStorage.getItem('schematica.cve.source')])`) === JSON.stringify([['https://cve.internal.example/api/CVE-2021-44228'], 'https://cve.internal.example/api/{id}']), await js(`JSON.stringify([window.__importUrls, localStorage.getItem('schematica.cve.source')])`));
    await js(`document.querySelector('#assistant [data-build=cve]').click(); document.getElementById('import-source').value = ''; document.getElementById('import-cancel').click(); localStorage.removeItem('schematica.cve.source'); true`);

    // An incident log file rebuilds a replayable board.
    const log = { incident: 'Lab incident', trustBoundaries: [{ id: 'lan', name: 'Office LAN' }], nodes: { attacker: 'threatactor', laptop: 'laptop', files: 'nas' }, actions: [
      { ts: '2026-03-01T09:00:00Z', actor: 'attacker', action: 'phishing email', target: 'laptop', phase: 'initial access', boundary: 'lan' },
      { ts: '2026-03-01T09:20:00Z', actor: 'laptop', action: 'copies files', target: 'files', phase: 'collection', boundary: 'lan', condition: 'exfil' },
    ] };
    await js(`(() => { const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(JSON.stringify(log))}], 'incident.json', { type: 'application/json' })); const input = document.getElementById('import-log-input'); input.files = dt.files; input.dispatchEvent(new Event('change')); return true; })()`);
    await waitFor(`document.getElementById('title').value === 'Lab incident'`);
    await sleep(500);
    s = JSON.parse(await saved());
    check('an incident log becomes a board with its timeline, phases as chapters and the Replay chip shown', s.incident && s.kinds.join(',') === 'threatactor,laptop,nas' && s.zones.join(',') === 'Office LAN' && s.chapters.map(c => c.label).join(',') === 'Phase: initial access,Phase: collection' && await js(`!document.getElementById('replay-chip').hidden`), JSON.stringify(s));
    check('a log that is not JSON is refused with a message and leaves the board alone', await js(`(() => { const dt = new DataTransfer(); dt.items.add(new File(['{nope'], 'bad.json', { type: 'application/json' })); const input = document.getElementById('import-log-input'); input.files = dt.files; input.dispatchEvent(new Event('change')); return true; })()`) && await (async () => { await waitFor(`document.getElementById('toast').textContent.includes('not valid JSON')`); return js(`document.getElementById('title').value === 'Lab incident'`); })());
    await capture('import-incident-log');
  } finally {
    await js(`window.fetch = window.__importFetch; window.confirm = window.__importConfirm; delete window.__importFetch; delete window.__importConfirm; delete window.__importUrls; delete window.__importRecord; delete window.__importMissing; delete window.__confirms; true`);
  }
}
