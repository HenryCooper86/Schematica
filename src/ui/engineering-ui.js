import { requirementFingerprint } from '../workflows.js';
import { renderWorkflow } from './workflow-ui.js';
import { architectureScopes } from '../architecture-scopes.js';
import { normalizeCapability, resolveInterfaceEndpoint } from '../interface-checks.js';
import { impactAnalysis, proposePartChange } from '../impact.js';
import { impactSummary } from './impact-summary.js';
import { nodePart } from '../rdk/profiles.js';
import { uid } from '../state.js';
import { interfaceRows, interfaceCSV, importInterfaces, normalizeSpec, normalizeBudget } from '../engineering.js';
import { reviewFindings, reviewHTML } from '../review.js';
import { powerSummary, formatCurrent } from '../power.js';
import { groupSubsystem, exposePort } from '../subsystems.js';
import { download } from '../export.js';
import { serialize } from '../serialize.js';
import { escAttr as esc, openModal, toast } from './press.js';
import { tr, onLanguageChange } from '../i18n.js';

export function initEngineering({ store, revisions, navigation, persistence, flush, importKiCad, explorer, tools }) {
  const button = document.createElement('button'); button.id = 'btn-engineering';
  button.innerHTML = '<svg viewBox="0 0 18 18" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="11" y="11" width="5" height="5" rx="1"/><path d="M7 4.5h6.5V11M4.5 7v6.5H11"/></svg>';
  const labelButton = () => { button.title = tr('Engineering'); button.setAttribute('aria-label', tr('Engineering')); };
  document.getElementById('btn-bom').after(button);
  const dialog = document.createElement('dialog'); dialog.id = 'engineering-dialog';
  dialog.setAttribute('aria-labelledby', 'engineering-heading'); document.body.append(dialog);
  let tab = 'revisions', selected = null, baseline = null;
  const labels = () => ({ revisions: tr('Revisions'), interfaces: tr('Interfaces'), requirements: tr('Requirements'), decisions: tr('Decisions'),
    impact: tr('Change impact'), budgets: tr('Budget assumptions'), subsystems: tr('Subsystems'), review: tr('Review package'), interchange: tr('Interchange'), views: tr('Saved views'), comments: tr('Review comments'), matrix: tr('Verification matrix') });
  const input = (name, label, value = '', type = 'text') => `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" maxlength="20000"></label>`;
  const area = (name, label, value = '') => `<label>${esc(label)}<textarea name="${name}" rows="3" maxlength="20000">${esc(value)}</textarea></label>`;
  const select = (name, label, entries, value = '') => `<label>${esc(label)}<select name="${name}">${entries.map(([id, title]) => `<option value="${esc(id)}"${id === value ? ' selected' : ''}>${esc(title)}</option>`).join('')}</select></label>`;
  const submit = label => `<button type="submit">${esc(label)}</button>`;
  const items = () => [...store.doc.nodes, ...store.doc.wires].map(i => [i.id, i.label || `${i.id} (${i.bus})`]);
  const act = (id, label) => `<button type="button" data-action="${id}">${esc(label)}</button>`;
  const safe = fn => async event => { event?.preventDefault(); try { await fn(event); } catch (error) { toast(error.message); } };
  const edit = fn => { store.apply(fn); paint(); };
  const eng = doc => (doc.engineering ||= {});
  function paint() {
    labelButton();
    const names = labels();
    dialog.dataset.section = tab;
    dialog.innerHTML = `<header><h2 id="engineering-heading">${esc(tr('Engineering'))}</h2><button data-action="close">${esc(tr('Close'))}</button></header>
      <nav aria-label="${esc(tr('Engineering sections'))}">${Object.entries(names).map(([id, name]) => `<button data-tab="${id}" aria-pressed="${tab === id}">${esc(name)}</button>`).join('')}</nav>
      <p>${esc(store.doc.title)}${navigation.depth() ? ' · ' + esc(tr('Expanded subsystem')) : ''}</p><section id="engineering-body"></section>`;
    const body = dialog.querySelector('section');
    const actions = { retry: async () => { await revisions.retry(); flush(); paint(); }, close: () => dialog.close() };
    let formHandler;
    if (tab === 'revisions') {
      const conflict = persistence.pending();
      body.innerHTML = (conflict ? `<aside role="alert"><p>${esc(tr('Another tab changed this board. Both versions are kept in revisions.'))}</p>${act('keep', tr('Keep this version'))}${conflict.doc ? act('remote', tr('Open other version')) : ''}</aside>` : '')
        + `<form>${input('label', tr('Revision name'), navigation.rootDoc().title)}${submit(tr('Save revision'))}</form>`
        + act('retry', tr('Retry saving revisions')) + `<p>${esc(tr('Up to 30 recent revisions are kept on this device. Export important milestones to a file.'))}</p><ul>${revisions.list().map(r => `<li><strong>${esc(r.label)}</strong> <span>${esc(r.durable ? tr('Saved on this device') : tr('Not saved — export or retry'))}</span> <time>${esc(new Date(r.at).toLocaleString())}</time>
          <button data-restore="${esc(r.id)}">${esc(tr('Restore'))}</button><button data-export="${esc(r.id)}">${esc(tr('Export'))}</button><button data-baseline="${esc(r.id)}">${esc(tr('Use as baseline'))}</button></li>`).join('')}</ul>`;
      formHandler = data => { revisions.save(navigation.rootDoc(), data.get('label')); paint(); };
      actions.keep = () => { persistence.resolve(); persistence.setItem('schematica.autosave', JSON.stringify(navigation.rootDoc())); flush(); paint(); };
      actions.remote = () => { const doc = persistence.pending()?.doc; persistence.resolve(); if (doc) store.replaceDoc(doc); paint(); };
      body.querySelectorAll('[data-restore]').forEach(b => b.onclick = safe(() => { store.replaceDoc(revisions.restore(b.dataset.restore)); paint(); }));
      body.querySelectorAll('[data-export]').forEach(b => b.onclick = safe(() => download('revision.schematica.json', serialize(revisions.restore(b.dataset.export)), 'application/json')));
      body.querySelectorAll('[data-baseline]').forEach(b => b.onclick = safe(() => { baseline = revisions.restore(b.dataset.baseline); tab = 'review'; paint(); }));
    } else if (tab === 'interfaces') {
      const rows = interfaceRows(store.doc); selected = rows.some(r => r.id === selected) ? selected : rows.find(r => store.selection.has(r.id))?.id || rows[0]?.id;
      const row = rows.find(r => r.id === selected), wire = store.doc.wires.find(w=>w.id===selected);
      const limits = [['voltageMinV',tr('Minimum voltage (V)')],['voltageMaxV',tr('Maximum voltage (V)')],['rateBps',tr('Bandwidth (bit/s)')]];
      const capabilityFields = end => { const cap=resolveInterfaceEndpoint(store.doc,wire[end]).capability||{}; return `<fieldset><legend>${esc((end==='from'?tr('From endpoint capabilities'):tr('To endpoint capabilities')))}</legend>
        ${select(end+'_direction',tr('Endpoint direction'),[['',tr('Unspecified')],['input',tr('Input')],['output',tr('Output')],['bidirectional',tr('Bidirectional')],['passive',tr('Passive')]],cap.direction)}
        ${limits.map(([key,label])=>input(end+'_'+key,label,cap[key]??'','number')).join('')}${input(end+'_protocols',tr('Supported protocols (comma separated)'),cap.protocols?.join(', ')||'')}${input(end+'_source',tr('Source reference'),cap.source)}</fieldset>`; };
      body.innerHTML = `<label><input type="checkbox" id="require-interfaces"${store.doc.engineering?.interfacesRequired ? ' checked' : ''}>${esc(tr('Check required interface details'))}</label>`
        + (row ? `<form>${select('wire', tr('Connection'), rows.map(r => [r.id, `${r.from} → ${r.to} (${r.bus})`]), selected)}
          ${select('direction', tr('Direction'), [['', tr('Unspecified')], ['from-to', tr('From → To')], ['to-from', tr('To → From')], ['bidirectional', tr('Bidirectional')]], row.direction)}
          ${input('voltage', tr('Voltage domain'), row.voltage)}${input('protocol', tr('Protocol version'), row.protocol)}${input('rate', tr('Rate / bandwidth'), row.rate)}${input('source', tr('Source reference'), row.source)}<fieldset><legend>${esc(tr('Connection limits'))}</legend>${limits.map(([key,label])=>input(key,label,row[key]??'','number')).join('')}</fieldset>${capabilityFields('from')}${capabilityFields('to')}<p>${esc(tr('Numeric declarations are optional. Blank values mean unknown; protocol names are matched exactly, ignoring case.'))}</p>${submit(tr('Save interface'))}</form>` : `<p>${esc(tr('Draw a connection to specify its interface.'))}</p>`)
        + act('csv', tr('Export ICD CSV'));
      body.querySelector('#require-interfaces').onchange = e => edit(doc => { eng(doc).interfacesRequired = e.target.checked; });
      body.querySelector('[name=wire]')?.addEventListener('change', e => { selected = e.target.value; paint(); });
      body.querySelectorAll('input[type=number]').forEach(el=>{el.step='any';if(el.name.endsWith('rateBps'))el.min='0';});
      formHandler = data => {
        const numbers = prefix => Object.fromEntries(limits.filter(([key])=>data.get(prefix+key)!=='').map(([key])=>[key,Number(data.get(prefix+key))]));
        const numeric = ['', 'from_', 'to_'].map(numbers);
        if(numeric.some(v=>Object.values(v).some(n=>!Number.isFinite(n))||(v.rateBps!==undefined&&v.rateBps<=0)||(v.voltageMinV!==undefined&&v.voltageMaxV!==undefined&&v.voltageMinV>v.voltageMaxV))) throw new Error(tr('Declared interface limits are invalid.'));
        edit(doc => { const w = doc.wires.find(w => w.id === selected); w.spec = normalizeSpec({...Object.fromEntries(data),...numeric[0]});
          w.arrow = ({ 'from-to': 'fwd', 'to-from': 'back', bidirectional: 'both' })[w.spec.direction] || null;
          ['from','to'].forEach((end,index)=>{ const {node,port}=resolveInterfaceEndpoint(doc,w[end]); if(!node)return;
            const cap=normalizeCapability({...numeric[index+1],direction:data.get(end+'_direction'),protocols:data.get(end+'_protocols').split(','),source:data.get(end+'_source')});
            const declared=Object.keys(numeric[index+1]).length||cap.direction||cap.protocols.length||cap.source.trim();
            if(declared){node.interfacePorts||={};node.interfacePorts[port]=cap;}else if(node.interfacePorts){delete node.interfacePorts[port];if(!Object.keys(node.interfacePorts).length)delete node.interfacePorts;}
          });
        });
      };
      actions.csv = () => download('interfaces.csv', interfaceCSV(store.doc), 'text/csv');
    } else if (tab === 'requirements' || tab === 'decisions') {
      const records = store.doc.engineering?.[tab] || [], record = records.find(r => r.id === selected);
      const targets = record?.targets || [...store.selection];
      body.innerHTML = `<div>${act('new', tr('New record'))}${records.map(r => `<button data-record="${esc(r.id)}">${esc(r.id)} · ${esc(r.text.slice(0, 70))}</button>`).join('')}</div><form>
        ${input('id', tr('Record ID'), record?.id || uid(tab === 'requirements' ? 'REQ-' : 'ADR-'))}${area('text', tr('Description'), record?.text)}${area('rationale', tr('Rationale'), record?.rationale)}${input('owner', tr('Owner'), record?.owner)}${input('evidence', tr('Evidence URL'), record?.evidence)}${tab === 'requirements' ? input('method', tr('Verification method'), record?.method) : ''}
        ${select('status', tr('Verification status'), [['draft', tr('Draft')], ['verified', tr('Verified')], ['accepted', tr('Accepted')], ['rejected', tr('Rejected')]], record?.status || 'draft')}
        <label>${esc(tr('Linked parts and connections'))}<select name="targets" multiple size="8">${[...items(), ...targets.filter(id => !items().some(([key]) => key === id)).map(id => [id, `${id} (${tr('Missing')})`])].map(([id, label]) => `<option value="${esc(id)}"${targets.includes(id) ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
        ${submit(tr('Save record'))}${record ? act('delete', tr('Delete record')) : ''}</form>`;
      body.querySelectorAll('[data-record]').forEach(b => b.onclick = () => { selected = b.dataset.record; paint(); });
      actions.new = () => { selected = null; paint(); };
      actions.delete = () => edit(doc => { eng(doc)[tab] = records.filter(r => r.id !== selected); selected = null; });
      formHandler = data => {
        const next = { ...Object.fromEntries(data), targets: data.getAll('targets') }; next.id = next.id.trim();
        if (!next.id || !next.text.trim()) throw new Error(tr('Record ID and description are required.'));
        if (records.some(r => r.id === next.id && r.id !== selected)) throw new Error(tr('That record ID already exists.'));
        if (tab === 'requirements' && next.status === 'verified') {
          if (!next.method?.trim() || !next.evidence.trim() || !next.targets.length || next.targets.some(id => !items().some(([key]) => key === id))) throw new Error(tr('Verification needs a method, evidence, and valid allocations.'));
          next.verifiedFingerprint = requirementFingerprint(store.doc, next); next.verifiedAt = new Date().toISOString(); }
        edit(doc => { eng(doc)[tab] = [...records.filter(r => r.id !== selected), next]; selected = next.id; });
      };
    } else if (['views', 'comments', 'matrix'].includes(tab)) {
      renderWorkflow({ tab, body, store, navigation, revisions, baseline, explorer, tools, paint, close: () => dialog.close(), openTab: (next, id) => { tab = next; selected = id; paint(); } });
    } else if (tab === 'impact') {
      const nodes=store.doc.nodes.filter(n=>!n.locked&&!n.subsystem);selected=nodes.some(n=>n.id===selected)?selected:nodes.find(n=>store.selection.has(n.id))?.id||nodes[0]?.id;
      const node=nodes.find(n=>n.id===selected);
      body.innerHTML=`<p>${esc(tr('Preview a part-number or voltage-rail change before applying it. Replacing a part clears its old ratings and endpoint declarations; ports remain provisional until reviewed.'))}</p>`+(node?`<form>${select('node',tr('Part'),nodes.map(n=>[n.id,n.label]),selected)}${input('partNumber',tr('Part number'),node.sublabel)}${input('rail',tr('Voltage rail'),node.rail)}${submit(tr('Preview change'))}</form><div id="impact-preview"></div>`:`<p>${esc(tr('Choose an unlocked part to preview a change.'))}</p>`);
      body.querySelector('[name=node]')?.addEventListener('change',e=>{selected=e.target.value;paint();});
      formHandler=data=>{
        const snapshot=JSON.stringify(store.doc),generation=store.generation,proposal=proposePartChange(store.doc,{id:selected,partNumber:data.get('partNumber'),rail:data.get('rail')});
        const target=body.querySelector('#impact-preview');target.innerHTML=`<p><strong>${esc(data.get('partNumber'))}</strong> · ${esc(data.get('rail'))}</p>`+impactSummary(impactAnalysis(store.doc,proposal))+act('apply-preview',tr('Apply previewed change'));
        target.querySelector('[data-action=apply-preview]').onclick=safe(()=>{if(store.generation!==generation||JSON.stringify(store.doc)!==snapshot)throw new Error(tr('The board changed. Preview again before applying.'));store.apply(doc=>{doc.nodes=proposal.nodes;});paint();});
        target.querySelectorAll('[data-impact-id]').forEach(b=>b.onclick=()=>{store.setSelection([b.dataset.impactId]);});
      };
    } else if (tab === 'budgets') {
      const nodes = store.doc.nodes; selected = nodes.some(n => n.id === selected) ? selected : nodes.find(n => store.selection.has(n.id))?.id || nodes[0]?.id;
      const node = nodes.find(n => n.id === selected), b = node?.budget || {}, settings = store.doc.engineering?.budget || {};
      const fields = [['inputV', tr('Input voltage (V)')], ['outputV', tr('Output voltage (V)')], ['efficiency', tr('Efficiency (%)')],
        ['activeMa', tr('Active current (mA)')], ['sleepMa', tr('Sleep current (mA)')], ['activePeakMa', tr('Active peak (mA)')], ['sleepPeakMa', tr('Sleep peak (mA)')], ['dutyPercent', tr('Active duty (%)')]];
      body.innerHTML = `<p>${esc(tr('Conversion requires input voltage, output voltage, and efficiency. Blank values remain unknown. Estimates exclude transients, thermal effects, and ageing.'))}</p><p>${esc(tr('Operating and peak modes apply to this scope. Subsystems use their own settings; grouping copies the current settings.'))}</p><form>
        ${select('mode', tr('Operating mode'), [['active', tr('Active')], ['sleep', tr('Sleep')], ['average', tr('Duty-weighted average')]], settings.mode || 'active')}
        ${select('peaks', tr('Peak assumption'), [['simultaneous', tr('All peaks simultaneous')], ['noncoincident', tr('Only one peak at a time')]], settings.peaks || 'simultaneous')}
        ${node ? select('node', tr('Part'), nodes.map(n => [n.id, n.label]), selected) + fields.map(([key, label]) => input(key, label, b[key] ?? '', 'number')).join('') : ''}${submit(tr('Save assumptions'))}</form>
        <table><thead><tr><th>${esc(tr('Part'))}</th><th>${esc(tr('Typical current'))}</th><th>${esc(tr('Peak current'))}</th><th>${esc(tr('Incomplete current data'))}</th></tr></thead><tbody>${powerSummary(store.doc).map(r => `<tr><td>${esc(r.sources.join(', '))}</td><td>${esc(r.summed ? formatCurrent(r.typicalMa) : '—')}</td><td>${esc(r.summed ? formatCurrent(r.peakMa) : '—')}</td><td>${esc(r.undeclared.join(', ') || '—')}</td></tr>`).join('')}</tbody></table>`;
      body.querySelectorAll('input[type=number]').forEach(el => { el.step = 'any'; el.min = '0'; if (['efficiency', 'dutyPercent'].includes(el.name)) el.max = '100'; });
      body.querySelector('[name=node]')?.addEventListener('change', e => { selected = e.target.value; paint(); });
      formHandler = data => {
        const raw = Object.fromEntries(fields.filter(([key]) => data.get(key) !== '' && data.get(key) != null).map(([key]) => [key, Number(data.get(key))]));
        const budget = normalizeBudget(raw);
        if (Object.keys(raw).length !== Object.keys(budget || {}).length) throw new Error(tr('Budget values are outside their allowed range.'));
        edit(doc => { eng(doc).budget = { mode: data.get('mode'), peaks: data.get('peaks') }; if (node) { const n = doc.nodes.find(n => n.id === selected); if (budget) n.budget = budget; else delete n.budget; } });
      };
    } else if (tab === 'subsystems') {
      const containers = store.doc.nodes.filter(n => n.subsystem);
      const container = containers.find(n => n.id === selected) || containers[0];
      const internalPorts = container?.subsystem.doc.nodes.flatMap(n => nodePart(n).ports.map(p => [JSON.stringify({ node: n.id, port: p.id }), `${n.label}.${p.name} (${p.bus})`])) || [];

      body.innerHTML = `<p>${esc(tr('Group selected parts into a reusable subsystem. Boundary connections become exposed ports. Open it to edit its internal architecture; Return commits the expanded view.'))}</p>
        <form>${input('name', tr('Subsystem name'), tr('Subsystem'))}${submit(tr('Group selected parts'))}</form>${navigation.depth() ? act('up', tr('Return to parent')) : ''}
        <ul>${store.doc.nodes.filter(n => n.subsystem).map(n => `<li>${esc(n.label)} <button data-enter="${esc(n.id)}">${esc(tr('Open subsystem'))}</button></li>`).join('')}</ul>`;
      if (container) {
        body.insertAdjacentHTML('beforeend', `<div class="exposed-ports">${select('container', tr('Subsystem'), containers.map(n => [n.id, n.label]), container.id)}
          ${select('internal-port', tr('Internal port'), internalPorts)}${input('port-name', tr('Exposed port name'))}${act('expose', tr('Expose port'))}
          <ul>${container.subsystem.exposed.map(p => `<li>${esc(container.part.ports.find(x => x.id === p.port)?.name || p.port)} → ${esc(p.node)}.${esc(p.childPort)}</li>`).join('')}</ul></div>`);
        body.querySelector('[name=container]').onchange = e => { selected = e.target.value; paint(); };
        actions.expose = () => { const value = body.querySelector('[name=internal-port]').value;
          if (!value) return; exposePort(store, container.id, JSON.parse(value), body.querySelector('[name=port-name]').value); paint(); };
      }
      formHandler = data => { selected = groupSubsystem(store, store.selection, data.get('name').trim() || tr('Subsystem')); paint(); };
      actions.up = () => { navigation.up(); dialog.close(); };
      body.querySelectorAll('[data-enter]').forEach(b => b.onclick = safe(() => { revisions.save(navigation.rootDoc(), navigation.rootDoc().title, 'subsystem-edit'); navigation.enter(b.dataset.enter); dialog.close(); }));
    } else if (tab === 'review') {
      const findings = reviewFindings(store.doc);
      body.innerHTML = `<p>${esc(baseline ? tr('Baseline: {title}', { title: baseline.title }) : tr('Choose a revision as the baseline to include a comparison.'))}</p>${act('package', tr('Download review package'))}${baseline ? impactSummary(impactAnalysis(baseline,navigation.rootDoc())) : ''}
        <p>${esc(tr('Reviewed exceptions retain the finding and its rationale. They expire when relevant design data changes.'))}</p>
        <ul>${findings.map(f => `<li><strong>${esc(f.level)} · ${esc(f.rule)}</strong> ${esc(f.message)} ${f.exception ? `<p>${esc(f.exception.owner)}: ${esc(f.exception.rationale)}</p>${act('unreview-' + f.id, tr('Remove exception'))}` : `<button data-finding="${esc(f.id)}">${esc(tr('Review exception'))}</button>`}</li>`).join('')}</ul>
        ${selected && findings.some(f => f.id === selected) ? `<form>${input('owner', tr('Reviewer'))}${area('rationale', tr('Exception rationale'))}${submit(tr('Save reviewed exception'))}</form>` : ''}`;
      actions.package = () => download('architecture-review.html', reviewHTML(navigation.rootDoc(), baseline), 'text/html');
      body.querySelectorAll('[data-finding]').forEach(b => b.onclick = () => { selected = b.dataset.finding; paint(); });
      for (const f of findings) actions['unreview-' + f.id] = () => edit(doc => { const scope = architectureScopes(doc).find(s => s.key === f.scope).doc; eng(scope).exceptions = (eng(scope).exceptions || []).filter(e => e.id !== f.exceptionId); });
      formHandler = data => {
        const f = findings.find(f => f.id === selected); if (!f || !data.get('rationale').trim() || !data.get('owner').trim()) throw new Error(tr('Reviewer and rationale are required.'));
        edit(doc => { const e = eng(architectureScopes(doc).find(s => s.key === f.scope).doc); e.exceptions = [...(e.exceptions || []).filter(e => e.id !== f.exceptionId), { id: f.exceptionId, fingerprint: f.fingerprint, rationale: data.get('rationale'), owner: data.get('owner'), at: new Date().toISOString() }]; selected = null; });
      };
    } else {
      body.innerHTML = `<p>${esc(tr('ICD CSV updates existing connections by ID and checks endpoint names and bus before applying. KiCad XML netlists import as a new architecture board; review the result before use.'))}</p>
        <label>${esc(tr('Import ICD CSV'))}<input type="file" id="engineering-csv" accept=".csv"></label>
        <label>${esc(tr('Import KiCad XML netlist'))}<input type="file" id="engineering-kicad" accept=".xml,.net"></label>${act('icd', tr('Export ICD CSV'))}`;
      actions.icd = () => download('interfaces.csv', interfaceCSV(store.doc), 'text/csv');
      const importFile = (id, fn) => { body.querySelector(id).onchange = safe(async e => { const file = e.target.files[0]; if (!file) return; if (file.size > 16 * 1024 * 1024) throw new Error(tr('Board file exceeds 16 MiB.')); fn(await file.text()); paint(); }); };
      importFile('#engineering-csv', csv => edit(doc => importInterfaces(doc, csv)));
      importFile('#engineering-kicad', xml => store.replaceDoc(importKiCad(xml)));
    }
    dialog.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; selected = null; paint(); });
    dialog.querySelectorAll('[data-action]').forEach(b => b.onclick = safe(actions[b.dataset.action] || (() => {})));
    body.querySelectorAll('[data-impact-id]').forEach(b=>b.onclick=()=>{const id=b.dataset.impactId;if(tab==='review')while(navigation.depth())navigation.up();store.setSelection([id]);paint();});
    body.querySelector('form')?.addEventListener('submit', safe(e => formHandler?.(new FormData(e.currentTarget))));
  }
  revisions.subscribe?.(() => { if (dialog.open && tab === 'revisions' && !dialog.querySelector('input:focus')) paint(); });
  button.onclick = () => { paint(); openModal(dialog); };
  onLanguageChange(() => { labelButton(); if (dialog.open) paint(); });
  labelButton();
  return { openTab(next) { tab = next; selected = null; paint(); openModal(dialog); }, openRevisions() { tab = 'revisions'; paint(); openModal(dialog); } };
}
