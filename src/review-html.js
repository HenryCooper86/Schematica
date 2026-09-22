import { coverageSummary, coverageScope } from './validation-coverage.js';
import { esc } from './render.js';
import { formatCurrent } from './power.js';
const value = (v) =>
  v == null
    ? '—'
    : Array.isArray(v)
      ? v.map(value).join(', ')
      : typeof v === 'object'
        ? Object.entries(v)
            .map(([k, v]) => `${k}: ${value(v)}`)
            .join('; ')
        : String(v);
const capability = (c) =>
  c
    ? `${c.direction || 'Unknown direction'}; ${c.voltageMinV ?? '?'}–${c.voltageMaxV ?? '?'} V; ${c.rateBps ?? '?'} bit/s; ${(c.protocols || []).join(', ') || 'Unknown protocol'}; source: ${c.source || 'Not supplied'}`
    : 'Not declared';
const cell = (v) => `<td>${esc(value(v))}</td>`;
const table = (heads, rows) =>
  `<div class="table-wrap"><table><thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${heads.length}">None</td></tr>`}</tbody></table></div>`;
const focus = (scope, ids, label) =>
  `<button class="focus" data-scope="${esc(scope)}" data-ids="${esc(JSON.stringify(ids))}">${esc(label)}</button>`;
const scriptJSON = (data) =>
  JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
export function renderReviewHTML(report, files, viewers) {
  const counts = Object.fromEntries(
    ['error', 'warning', 'info'].map((level) => [
      level,
      report.findings.filter((f) => f.level === level).length,
    ]),
  );
  const sections = [];
  sections.push(
    `<section id="findings"><h2>Findings</h2>${table(
      ['Severity', 'Scope', 'Finding', 'Affected items', 'Review'],
      report.findings.map(
        (f) =>
          `<tr class="${esc(f.level)}">${cell(f.level)}${cell(f.scopeTitle)}${cell(f.message)}<td>${focus(f.scope, f.ids, 'Show affected items')}</td>${cell(f.exception ? `${f.exception.owner}: ${f.exception.rationale}` : 'Needs review')}</tr>`,
      ),
    )}</section>`,
  );
  sections.push(
    `<section id="interfaces"><h2>Interfaces across all subsystems</h2>${table(
      [
        'Scope',
        'Connection',
        'Bus',
        'Direction',
        'Voltage',
        'Bandwidth',
        'Protocol',
        'Source',
        'From endpoint limits',
        'To endpoint limits',
      ],
      report.interfaces.map(
        (r) =>
          `<tr>${cell(r.scopeTitle)}<td>${focus(r.scope, [r.id], r.from + ' → ' + r.to)}</td>${cell(r.bus)}${cell(r.direction || 'Unknown')}${cell(r.voltageMinV !== undefined && r.voltageMaxV !== undefined ? `${r.voltageMinV}–${r.voltageMaxV} V` : r.voltage || 'Unknown')}${cell(r.rateBps !== undefined ? r.rateBps + ' bit/s' : r.rate || 'Unknown')}${cell(r.protocol || 'Unknown')}${cell(r.source || 'Not supplied')}${cell(capability(r.fromCapability))}${cell(capability(r.toCapability))}</tr>`,
      ),
    )}</section>`,
  );
  for (const kind of ['requirements', 'decisions'])
    sections.push(
      `<section id="${kind}"><h2>${kind === 'requirements' ? 'Requirements' : 'Decisions'}</h2>${table(
        ['Scope', 'ID', 'Description', 'Status', 'Owner', 'Rationale', 'Evidence', 'Allocations'],
        report[kind].map(
          (r) =>
            `<tr>${cell(r.scopeTitle)}${cell(r.id)}${cell(r.text)}${cell(r.status)}${cell(r.owner || 'No owner')}${cell(r.rationale)}${cell(r.evidence || 'Not supplied')}<td>${r.targets.length ? focus(r.scope, r.targets, r.targets.join(', ')) : 'Unallocated'}</td></tr>`,
        ),
      )}</section>`,
    );
  sections.push(
    `<section id="power"><h2>Power budgets</h2><p>Root operating mode: <strong>${esc(report.assumptions.mode)}</strong>. Root peak scenario: <strong>${esc(report.assumptions.peaks)}</strong>.</p>${table(
      ['Sources', 'Typical', 'Peak', 'Supply limit', 'Incomplete loads'],
      report.power.map(
        (r) =>
          `<tr>${cell(r.sources)}${cell(r.summed ? formatCurrent(r.typicalMa) : 'Unknown')}${cell(r.summed ? formatCurrent(r.peakMa) : 'Unknown')}${cell(r.limitComplete ? formatCurrent(r.limitMa) : 'Unknown')}${cell(r.undeclared.length ? r.undeclared : 'None')}</tr>`,
      ),
    )}${table(['Scope','Operating mode','Peak assumption'],(report.assumptions.scopes || []).map(s=>`<tr>${[s.scope,s.mode,s.peaks].map(cell).join('')}</tr>`))}<p>${esc(report.assumptions.note)}</p></section>`,
  );
  sections.push(
    `<section id="bom"><h2>Bill of materials</h2>${table(
      ['Part', 'Part number', 'Quantity', 'References', 'Rails', 'Declared current'],
      report.bom.map(
        (r) =>
          `<tr>${cell(r.part)}${cell(r.sublabel)}${cell(r.qty)}${cell(r.refs)}${cell(r.rails)}${cell(r.currentMa == null ? 'Unknown' : formatCurrent(r.currentMa))}</tr>`,
      ),
    )}</section>`,
  );
  if (report.comparison)
    sections.push(
      `<section id="changes"><h2>Changes from baseline</h2>${table(
        ['Change', 'Item', 'Field', 'Before', 'After'],
        report.comparison.changes.flatMap((c) =>
          (c.fields || [{ field: c.collection, before: c.before, after: c.after }]).map(
            (f) =>
              `<tr class="change-${esc(c.type)}">${cell(c.type)}${cell(c.label)}${cell(f.field)}${cell(f.before)}${cell(f.after)}</tr>`,
          ),
        ),
      )}</section>`,
    );
  if (report.impact)
    sections.push(
      `<section id="impact"><h2>Change impact</h2><p>${report.impact.changed.length} direct changes; ${report.impact.affected.length} items in the connected review scope.</p><p>${esc(report.impact.note)}</p>${table(
        ['Item', 'Scope', 'Reason'],
        report.impact.affected.map(
          (item) =>
            `<tr><td>${focus(item.scope, [item.id], item.label)}</td>${cell(item.scopeTitle)}${cell(item.distance ? 'Connected item' : 'Direct change')}</tr>`,
        ),
      )}<h3>Records to review</h3>${table(
        ['Type', 'Scope', 'ID', 'Description'],
        ['requirements', 'decisions'].flatMap((kind) =>
          report.impact[kind].map(
            (r) => `<tr>${cell(kind)}${cell(r.scopeTitle)}${cell(r.id)}${cell(r.text)}</tr>`,
          ),
        ),
      )}</section>`,
    );
  sections.push(`<section id="verification"><h2>Verification matrix</h2>${table(['Scope','ID','Owner','Method','Evidence','Allocated','Needs review','Changed since baseline'],
    (report.verification || []).map(r => `<tr>${[r.scopeTitle,r.id,r.owner,r.method,r.evidence,r.allocated,r.needsReview,r.changed].map(cell).join('')}</tr>`))}</section>`);
  sections.push(`<section id="comments"><h2>Revision reviews</h2><p>Local review records; reviewer identities are not authenticated.</p>${(report.reviews || []).map(r => `<article><h3>${esc(r.title)} · ${esc(r.currentState)}</h3><p>${esc(r.scopeTitle)} · ${esc(r.revisionId)} · ${esc(r.author)}</p>${table(['Author','Target','Comment','Status'],r.comments.map(c => `<tr>${[c.author,c.target,c.text,c.resolved ? 'Resolved' : 'Open'].map(cell).join('')}</tr>`))}</article>`).join('')}</section>`);
  const readiness = report.interfaceReadiness;
  sections.unshift(`<section id="interface-coverage"><h2>Interface validation coverage</h2><p>${esc(coverageSummary(readiness.coverage))}</p><p>${esc(coverageScope())}</p><p>${readiness.ready ? 'Ready for interface review' : 'Not ready for interface review'} · ${readiness.blockingFindings} blocking design findings</p>${table(['Connection','Bus','Status','Missing declarations'], readiness.coverage.connections.map(c => `<tr>${[c.label,c.bus,c.status,c.missing.join(', ')].map(cell).join('')}</tr>`))}</section>`);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(report.board.title)} — architecture review</title>
<style>body{font:15px system-ui;margin:0;color:#172033;background:#f5f7fb}header,main{max-width:1200px;margin:auto;padding:24px}header{padding-bottom:0}h1{margin:0 0 8px}nav{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}a{color:#075985}.summary{display:flex;gap:12px;flex-wrap:wrap}.summary span,section{background:white;padding:16px;border:1px solid #d8e0eb;border-radius:8px}section{margin:20px 0}iframe{width:100%;height:560px;border:1px solid #ccd3df}button,select{font:inherit;padding:7px;border:1px solid #b8c6d6;border-radius:5px;background:white;color:#075985;cursor:pointer;max-width:100%}button:focus-visible,a:focus-visible,select:focus-visible{outline:3px solid #0284c7}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}td,th{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #d8e0eb;overflow-wrap:anywhere;min-width:70px}th{background:#eef3f8}.error{border-left:4px solid #b91c1c}.warning{border-left:4px solid #b45309}.change-added{background:#ecfdf5}.change-removed{background:#fff1f2}.change-changed,.change-rewired{background:#fffbeb}small{color:#475569}#downloads button{margin:4px}#viewer-status{min-height:1.5em}@media print{button,select,#downloads,nav{display:none}iframe{height:450px}header,main{padding:0}section{break-inside:avoid}.table-wrap{overflow:visible}}</style>
<header><h1>${esc(report.board.title)}</h1><small>Architecture review · ${esc(report.created)} · Report format ${report.version}</small>
<nav>${['board', 'interface-coverage', 'findings', 'interfaces', 'requirements', 'decisions', 'power', 'bom', 'verification', 'comments', ...(report.comparison ? ['changes', 'impact'] : [])].map((id) => `<a href="#${id}">${id[0].toUpperCase() + id.slice(1)}</a>`).join('')}</nav>
<div class="summary"><span>${esc(coverageSummary(readiness.coverage))}<br>${readiness.ready ? 'Ready for interface review' : 'Not ready for interface review'}</span><span>${counts.error} errors · ${counts.warning} warnings · ${counts.info} information items</span><span>${report.coverage.allocated}/${report.coverage.total} requirements fully allocated</span><span>${report.coverage.verifiedWithEvidence}/${report.coverage.total} currently verified with method, evidence and valid allocations</span></div></header>
<main><section id="board"><h2>Architecture</h2><label>Subsystem <select id="scope">${report.scopes.map((s) => `<option value="${esc(s.key)}">${esc(s.title)}</option>`).join('')}</select></label><label>Saved view <select id="saved-view"><option value="">Choose a saved view</option>${(report.savedViews || []).map((v,i)=>`<option value="${i}">${esc(v.name)}</option>`).join('')}</select></label><p id="viewer-status" role="status">Choose a finding or allocation to focus the diagram.</p><iframe title="Architecture board" sandbox="allow-scripts" srcdoc="${esc(viewers['[]'])}"></iframe></section>
${sections.join('')}<section id="downloads"><h2>Download source artifacts</h2>${Object.keys(files)
    .map((name, i) => `<button data-file="${i}">${esc(name)}</button>`)
    .join('')}</section></main>
<script type="application/json" id="review-data">${scriptJSON({ files, viewers, savedViews: report.savedViews || [] })}</script><script>
const {files,viewers,savedViews}=JSON.parse(document.getElementById('review-data').textContent),frame=document.querySelector('iframe'),scope=document.getElementById('scope');let pending=[],pendingView=null;
const focus=()=>frame.contentWindow.postMessage(pendingView ? {type:'schematica-saved-view',view:pendingView} : {type:'schematica-review-focus',ids:pending},'*');frame.addEventListener('load',focus);
function show(key,ids){if(!Object.hasOwn(viewers,key))return;pending=ids;const changed=scope.value!==key;scope.value=key;if(changed||frame.dataset.scope!==key){frame.dataset.scope=key;frame.srcdoc=viewers[key]}else focus();document.getElementById('viewer-status').textContent=ids.length?'Focused items: '+ids.join(', '):'Showing '+scope.selectedOptions[0].textContent;}
document.getElementById('saved-view').onchange=e=>{const v=savedViews[Number(e.target.value)];if(!e.target.value||!v)return;pendingView=v;show(JSON.stringify(v.scope),v.selection||[]);};
frame.dataset.scope='[]';scope.onchange=()=>{pendingView=null;show(scope.value,[]);};document.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{pendingView=null;show(b.dataset.scope,JSON.parse(b.dataset.ids));document.getElementById('board').scrollIntoView();});
document.querySelectorAll('[data-file]').forEach(b=>b.onclick=()=>{const name=Object.keys(files)[Number(b.dataset.file)],url=URL.createObjectURL(new Blob([files[name]],{type:'text/plain'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
</script></html>`;
}
