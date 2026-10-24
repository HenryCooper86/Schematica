// Adoption-study rehearsal: drives the facilitator script's four measured
// tasks (review, repair, recover, handoff) on the seeded study board, so the
// kit is known to work on the release before any engineer sits down. The
// timings it writes are a scripted rehearsal, not participant observations.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeShare } from '../../src/share.js';
import { deserialize } from '../../src/serialize.js';

const SEEDED = new URL('../../docs/validation/study/seeded-review-board.schematica.json', import.meta.url);
export const SEEDED_FINDINGS = [
  'Interface w2: Required bandwidth exceeds endpoint 2 capacity.',
  'Interface w3: The connection voltage range exceeds endpoint 2 limits.',
  'Interface w4: The protocol is not supported by endpoint 2.',
  'Verified requirement REQ-2 has no evidence.',
];

export async function runStudyChecks({ js, key, check, sleep, send, origin, artifactDir, capture }) {
  const { doc } = deserialize(readFileSync(SEEDED, 'utf8'));
  const timings = {};
  const timed = async (task, fn) => { const t0 = Date.now(); await fn(); timings[task] = Date.now() - t0; };
  const open = (tab) => js(`document.getElementById('btn-engineering').click();(document.querySelector('[data-tab="${tab}"]')||(document.querySelector('.eng-advanced').click(),document.querySelector('[data-tab="${tab}"]'))).click();true`);
  const submit = (values) => js(`(()=>{const f=document.querySelector('#engineering-body form');for(const [k,v] of Object.entries(${JSON.stringify(values)})){const el=f.elements.namedItem(k);el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));}f.requestSubmit();return true;})()`);
  const closeEngineering = () => js(`document.querySelector('#engineering-dialog [data-action=close]').click();true`);
  const findings = async () => {
    await js(`document.getElementById('btn-check').click(); true`);
    await sleep(200);
    const text = await js(`document.getElementById('drc-list').textContent`);
    await key('Escape', 'Escape', 27);
    return text;
  };

  // Load the seeded board the way the facilitator does: as a fresh board.
  await sleep(700);
  await js('localStorage.clear(); true');
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await send('Page.navigate', { url: `${origin}/#${await encodeShare(doc)}` });
  for (let i = 0; i < 40; i++) {
    const n = await js(`document.querySelectorAll('#canvas g.node').length`).catch(() => -1);
    if (n === doc.nodes.length) break;
    await sleep(150);
  }
  await sleep(300);
  check('the seeded study board loads with its five declared parts', await js(`document.querySelectorAll('#canvas g.node').length === 5 && document.getElementById('title').value.includes('seeded')`));

  // Task 1 — review: Check surfaces every seeded issue and nothing else.
  let text = '';
  await timed('review', async () => { text = await findings(); });
  check('Check lists the three seeded interface errors and the evidence warning', SEEDED_FINDINGS.every((m) => text.includes(m)), text.slice(0, 400));
  await js(`document.getElementById('btn-check').click(); true`);
  await sleep(200);
  await capture('study-01-seeded-findings');
  await key('Escape', 'Escape', 27);

  // A named revision before any repair, so the recover task has somewhere to go back to.
  await open('revisions');
  await submit({ label: 'Seeded baseline' });
  check('the seeded state is kept as a named revision', await js(`[...document.querySelectorAll('#engineering-body li')].some(li => li.textContent.includes('Seeded baseline'))`));
  await closeEngineering();

  // Task 2 — repair: three interface declarations and one evidence line.
  await timed('repair', async () => {
    await open('interfaces');
    const fix = async (wire, values) => {
      await js(`(()=>{const s=document.querySelector('#engineering-body [name=wire]');s.value='${wire}';s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
      await sleep(100);
      await submit(values);
      await sleep(100);
    };
    await fix('w2', { to_rateBps: '115200' });
    await fix('w3', { to_voltageMinV: '3', to_voltageMaxV: '3.6' });
    await fix('w4', { to_protocols: 'UART' });
    await open('requirements');
    await sleep(100);
    await js(`document.querySelector('#engineering-body [data-record="REQ-2"]').click(); true`);
    await sleep(150);
    const form = await js(`(()=>{const f=document.querySelector('#engineering-body form');return {id:f.elements.namedItem('id')?.value, names:[...f.elements].map(e=>e.name).filter(Boolean)}})()`);
    check('selecting REQ-2 fills the requirement form', form.id === 'REQ-2', JSON.stringify(form));
    await submit({ method: 'Design review (illustrative)', evidence: 'supply-domain-review-2026-10-02.md (illustrative)' });
    await sleep(150);
    check('saving the evidence line reports no error', !(await js(`document.getElementById('toast').textContent`)).match(/required|invalid/i), await js(`document.getElementById('toast').textContent`));
    await closeEngineering();
  });
  text = await findings();
  check('after the repairs Check reports none of the seeded findings', !SEEDED_FINDINGS.some((m) => text.includes(m)), text.slice(0, 400));
  await capture('study-02-repaired-board');
  await open('revisions');
  await submit({ label: 'Repaired' });
  await closeEngineering();

  // Task 3 — recover: go back to the seeded revision, see the findings return, come forward again.
  await timed('recover', async () => {
    await open('revisions');
    await js(`[...document.querySelectorAll('#engineering-body li')].find(li => li.textContent.includes('Seeded baseline')).querySelector('[data-restore]').click(); true`);
    await sleep(200);
    await closeEngineering();
  });
  text = await findings();
  check('restoring the seeded revision brings the seeded findings back', SEEDED_FINDINGS.every((m) => text.includes(m)), text.slice(0, 300));
  await open('revisions');
  await js(`[...document.querySelectorAll('#engineering-body li')].find(li => li.textContent.includes('Repaired')).querySelector('[data-restore]').click(); true`);
  await sleep(200);
  await closeEngineering();
  text = await findings();
  check('restoring the repaired revision clears them again', !SEEDED_FINDINGS.some((m) => text.includes(m)), text.slice(0, 300));

  // Task 4 — handoff: compare against the seeded baseline and download the review package.
  const htmlPath = join(artifactDir, 'architecture-review.html');
  rmSync(htmlPath, { force: true });
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: artifactDir });
  await timed('handoff', async () => {
    await open('revisions');
    await js(`[...document.querySelectorAll('#engineering-body li')].find(li => li.textContent.includes('Seeded baseline')).querySelector('[data-baseline]').click(); true`);
    await sleep(150);
    await js(`document.querySelector('#engineering-body [data-action=package]').click(); true`);
    for (let i = 0; i < 100 && !existsSync(htmlPath); i++) await sleep(50);
  });
  await capture('study-03-review-package');
  await closeEngineering();
  const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : '';
  check('the review package downloads with the baseline comparison, the interfaces and the requirements',
    html.includes('Changes from baseline') && html.includes('REQ-2') && html.includes('115200') && html.includes('UART-REF-1'), JSON.stringify({ bytes: html.length, baseline: html.includes('Changes from baseline'), req: html.includes('REQ-2'), rate: html.includes('115200'), src: html.includes('UART-REF-1') }));

  writeFileSync(join(artifactDir, 'study-dry-run.json'), JSON.stringify({
    kind: 'study-rehearsal', note: 'Scripted rehearsal of the facilitator script on the seeded board; not participant observations.',
    date: new Date().toISOString().slice(0, 10), seededFindings: SEEDED_FINDINGS, scriptedMs: timings,
  }, null, 2));
}
