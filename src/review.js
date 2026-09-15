import { checkDoc } from './drc.js';
import { checkLayout } from './layout-checks.js';
import { compareBoards } from './compare.js';
import { interfaceRows, interfaceCSV } from './engineering.js';
import { buildBOM, bomCSV } from './bom.js';
import { powerSummary } from './power.js';
import { buildHTML } from './html-export.js';
import { esc } from './render.js';

function hash(value) {
  let h = 2166136261;
  for (const char of JSON.stringify(value)) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().filter(k => !['x', 'y', 'w', 'h', 'label', 'color'].includes(k)).map(k => [k, canonical(v[k])])) : v;
export function reviewFindings(doc) {
  const counters = new Map();
  const byId = new Map([...doc.nodes, ...doc.wires, ...doc.zones, ...doc.notes].map(item => [item.id, item]));
  return [...checkDoc(doc), ...checkLayout(doc)].map(finding => {
    const ids = [...finding.ids].sort();
    const base = hash([finding.rule, ids, finding.record || '']);
    const count = counters.get(base) || 0; counters.set(base, count + 1);
    const id = `${finding.rule}-${base}-${count}`;
    // A waiver stops applying when relevant engineering data changes.
    const fingerprint = hash([ids.map(id => canonical(byId.get(id))),
      doc.engineering?.requirements, doc.engineering?.budget,
      finding.rule.startsWith('layout') ? ids.map(id => byId.get(id)) : null]);
    const exception = doc.engineering?.exceptions?.find(e => e.id === id && e.fingerprint === fingerprint);
    return { ...finding, id, fingerprint, ...(exception ? { exception } : {}) };
  });
}
export function reviewPackage(doc, baseline = null) {
  return { format: 'schematica-review', version: 1, created: new Date().toISOString(), board: structuredClone(doc),
    interfaces: interfaceRows(doc), bom: buildBOM(doc), power: powerSummary(doc), findings: reviewFindings(doc),
    requirements: doc.engineering?.requirements || [], decisions: doc.engineering?.decisions || [],
    assumptions: { mode: doc.engineering?.budget?.mode || 'active', peaks: doc.engineering?.budget?.peaks || 'simultaneous',
      note: 'Declared data only; conversion applies only where voltage and efficiency are specified. No transient, thermal, ageing, or electrical simulation.' },
    comparison: baseline ? compareBoards(baseline, doc) : null };
}
export function reviewHTML(doc, baseline = null) {
  const report = reviewPackage(doc, baseline);
  const files = { 'board.schematica.json': JSON.stringify(doc, null, 2), 'interfaces.csv': interfaceCSV(doc),
    'bom.csv': bomCSV(report.bom), 'review.json': JSON.stringify(report, null, 2) };
  const json = JSON.stringify(files).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(doc.title)} — review</title>
<style>body{font:16px system-ui;margin:2rem auto;max-width:1100px;padding:0 1rem;color:#172033;background:#f5f7fb}iframe{width:100%;height:560px;border:1px solid #ccd3df}pre{white-space:pre-wrap;overflow-wrap:anywhere}button{padding:.7rem;margin:.3rem}details{background:white;padding:1rem;margin:1rem 0}</style>
<h1>${esc(doc.title)}</h1><p>Architecture review package · ${esc(report.created)}</p><p>${esc(report.assumptions.note)}</p>
<nav>${Object.keys(files).map((name, i) => `<button data-file="${i}">${esc(name)}</button>`).join('')}</nav>
<iframe title="Architecture board" sandbox="allow-scripts" srcdoc="${esc(buildHTML(doc))}"></iframe>
${['interfaces', 'requirements', 'decisions', 'power', 'findings', 'assumptions', 'comparison'].map(key => `<details><summary>${key}</summary><pre>${esc(JSON.stringify(report[key], null, 2))}</pre></details>`).join('')}
<script type="application/json" id="files">${json}</script><script>const files=JSON.parse(document.getElementById('files').textContent);document.querySelectorAll('[data-file]').forEach(b=>b.onclick=()=>{const name=Object.keys(files)[Number(b.dataset.file)],url=URL.createObjectURL(new Blob([files[name]],{type:'text/plain'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});</script></html>`;
}
