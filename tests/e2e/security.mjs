// Controlled saved records exercise the real panel/history/export workflow.
// These checks are not evidence that a language model understood a PoC.
export async function runSecurityChecks({ send, js, check, sleep, origin, capture }) {
  const wait = async expression => {
    for (let i = 0; i < 100; i++) {
      if (await js(expression).catch(() => false)) return;
      await sleep(50);
    }
    throw Error('Security workflow timed out: ' + expression);
  };
  const click = selector => js(`document.querySelector(${JSON.stringify(selector)}).click(); true`);
  const snapshot = () => js(`(() => { window.dispatchEvent(new Event('pagehide')); return JSON.parse(localStorage.getItem('schematica.autosave')); })()`);
  await send('Page.navigate', { url: origin + '/' });
  await wait(`document.readyState === 'complete' && !!document.getElementById('btn-security')`);
  await js(String.raw`(async () => {
    const {sha256Hex} = await import('/src/ai/security.js');
    const {newDoc} = await import('/src/state.js');
    const text = Array.from({length:500}, (_, i) => i === 0 ? 'An illustrative parser receives a request.' : 'Reference line ' + (i + 1)).join('\n');
    const time = '2026-01-01T00:00:00.000Z';
    const evidence = [{sourceId:'history-source',startLine:1,endLine:1}];
    const finding = (id,kind,view,title) => ({id,kind,view,title,detail:'Static source description: '+title,basis:'source',evidence,targets:[]});
    const doc = newDoc('Security history fixture');
    doc.securityAnalysis = {version:1,id:'security-history',title:'Security history assessment',cveId:'',status:'not-provided',summary:'Illustrative source reading, not an execution result.',generatedAt:time,
      sources:[{id:'history-source',name:'x'.repeat(508)+'.txt',url:'',retrievedAt:time,hash:await sha256Hex(text),text,startLine:1,totalLines:500,partial:false,warnings:[]}],
      readCoverage:[{sourceId:'history-source',ranges:[{startLine:1,endLine:120}]}],
      findings:[finding('parser','component','architecture','Illustrative parser'),finding('request','step','exploit','Receive illustrative request')],
      relationships:[{id:'handled-by',from:'request',to:'parser',label:'handled by',basis:'source',view:'exploit',evidence,boundaryRelation:'none'}],warnings:[]};
    const dt = new DataTransfer(); dt.items.add(new File([JSON.stringify(doc)],'security-history.json'));
    const input = document.getElementById('file-input');input.files=dt.files;input.dispatchEvent(new Event('change'));
  })()`);
  await wait(`document.getElementById('title').value === 'Security history fixture'`);
  await click('#btn-security');
  check('security panel distinguishes retained source lines from model delivery', await js(`document.getElementById('sec-analysis-coverage').textContent.includes('120 of 500') && document.getElementById('sec-analysis-coverage').textContent.includes('Undelivered lines remain unassessed.')`));
  check('maximum-length source names and citation buttons stay within the security panel', await js(`(() => { const scroll=document.querySelector('#security-panel .sec-scroll');return scroll.scrollWidth<=scroll.clientWidth; })()`));
  const illustrate = async view => {
    await click(`[data-sec-view="${view}"]`);
    await wait(`!!document.getElementById('ai-preview-apply')`);
    await click('#ai-preview-apply');
    await wait(`!document.getElementById('ai-preview-dialog')`);
  };
  await illustrate('architecture');
  await illustrate('exploit');
  const applied = await snapshot();
  const exploitNodes = applied.journey.at(-1).targets.nodes;
  const architectureNodes = applied.journey.at(-2).targets.nodes;
  check('separate architecture and exploit illustrations retain their own chapter targets', exploitNodes.length === 2 && architectureNodes.length === 1 && exploitNodes.every(id => !architectureNodes.includes(id)));
  await click('#sec-undo-apply');
  await click('#redo');
  await click('[data-sec-show="request"]');
  check('panel Undo apply followed by normal Redo restores stage explanations and saved state', await js(`document.getElementById('sec-board-state').textContent.includes('Saved with this board.') && document.getElementById('sec-selection').textContent.includes('Static source description: Receive illustrative request') && !document.getElementById('sec-selection').textContent.includes('No finding references') && document.getElementById('sec-save-analysis').disabled`));
  await click('#sec-walkthrough');
  const stops = await js(`Array.from(document.querySelectorAll('[data-sec-stop]'), b => b.dataset.secStop)`);
  check('exploit walkthrough resolves only nodes from the exploit illustration', stops.length === exploitNodes.length && stops.every(id => exploitNodes.includes(id)) && stops.every(id => !architectureNodes.includes(id)));
  // Observe the actual generated report without opening a native download dialog.
  await js(`window.__securityReport = null; window.__securityCreateURL = URL.createObjectURL; URL.createObjectURL = function(blob) { if (blob.type.startsWith('text/html')) blob.text().then(text => window.__securityReport = text); return window.__securityCreateURL.call(this,blob); }; true`);
  await click('#sec-download');
  await wait(`typeof window.__securityReport === 'string'`);
  const report = await js(`window.__securityReport`);
  check('report after Redo contains restored board references and honest delivery coverage', exploitNodes.every(id => report.includes(id)) && report.includes('120') && report.includes('500') && /deliver|model-read/i.test(report) && !report.includes('Reference line 500'));
  await js(`URL.createObjectURL = window.__securityCreateURL; delete window.__securityCreateURL; true`);
  if (capture) await capture('security-history-and-coverage');
  await click('#btn-security');
  await click('#undo');
  await click('#redo');
  await click('#btn-security');
  check('closed security panel follows history when reopened', await js(`document.getElementById('sec-board-state').textContent.includes('Saved with this board.') && !!document.querySelector('[data-sec-show="request"]')`));
  const saved = await snapshot();
  await send('Page.reload');
  await wait(`!!document.getElementById('btn-security')`);
  await click('#btn-security');
  check('saved analysis retains model-read ranges across reload', await js(`document.getElementById('sec-analysis-coverage').textContent.includes('120 of 500') && document.getElementById('sec-board-state').textContent.includes('Saved with this board.')`));
  // A genuinely new result must not be overwritten by history of the saved one.
  await js(`localStorage.setItem('schematica.ai.settings',JSON.stringify({provider:'anthropic',model:'test-model',baseUrl:location.origin+'/fake',remember:true,tools:true}));localStorage.setItem('schematica.ai.key.anthropic','sk-fake-security');true`);
  await send('Page.reload');
  await wait(`!!document.getElementById('btn-security')`);
  await click('#btn-security');
  await js(`document.getElementById('sec-notes').value='SECURITY_UI_INDEPENDENT_DRAFT';true`);
  await click('#sec-analyze');
  await wait(`document.getElementById('sec-analysis-header').textContent.includes('Independent security draft') && document.getElementById('sec-cancel').hidden`);
  // Create a history step using the saved record, without applying the new draft.
  await click('#sec-remove-analysis');
  await wait(`!!document.getElementById('ai-preview-apply')`);
  await click('#ai-preview-apply');
  await wait(`!document.getElementById('ai-preview-dialog')`);
  await click('#undo');
  check('independent unsaved analysis survives unrelated board Undo', await js(`document.getElementById('sec-analysis-header').textContent.includes('Independent security draft') && document.getElementById('sec-board-state').textContent.includes('differs from this result') && !document.getElementById('sec-save-analysis').disabled`));
  check('unrelated board history preserves the original analysis and delivery metadata', JSON.stringify((await snapshot()).securityAnalysis) === JSON.stringify(saved.securityAnalysis));
  // Historical records cannot acquire fabricated model-read history on import.
  await js(`(() => { const doc=JSON.parse(localStorage.getItem('schematica.autosave'));delete doc.securityAnalysis.readCoverage;const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(doc)],'historical-security.json'));const input=document.getElementById('file-input');input.files=dt.files;input.dispatchEvent(new Event('change'));})()`);
  await wait(`document.getElementById('sec-analysis-header').textContent.includes('Security history assessment')`);
  check('historical analyses explicitly disclose missing model-read records', await js(`document.getElementById('sec-analysis-coverage').textContent.includes('Model-read coverage not recorded') && !document.getElementById('sec-analysis-coverage').textContent.includes('120 of 500')`));
  await js(`(async () => {
    const {newDoc} = await import('/src/state.js'); const {sha256Hex} = await import('/src/ai/security.js');
    const text='The client is outside the service trust boundary. The parser is inside the service trust boundary.';
    const time='2026-01-01T00:00:00.000Z', evidence=[{sourceId:'boundary-source',startLine:1,endLine:1}];
    const finding=(id,kind,title)=>({id,kind,title,detail:text,basis:'source',view:'architecture',evidence,targets:[]});
    const relation=(id,from,to,boundaryRelation)=>({id,from,to,label:boundaryRelation,boundaryRelation,basis:'source',view:'architecture',evidence});
    const doc=newDoc('Boundary geometry fixture');
    doc.securityAnalysis={version:1,id:'boundary-fixture',title:'Explicit trust boundary',cveId:'',status:'not-provided',summary:text,generatedAt:time,
      sources:[{id:'boundary-source',name:'boundary.txt',url:'',retrievedAt:time,hash:await sha256Hex(text),text,startLine:1,totalLines:1,partial:false,warnings:[]}],
      readCoverage:[{sourceId:'boundary-source',ranges:[{startLine:1,endLine:1}]}],
      findings:[finding('client','component','Outside client'),finding('parser','component','Inside parser'),finding('boundary','boundary','Service trust boundary')],
      relationships:[relation('outside','client','boundary','outside'),relation('inside','boundary','parser','inside')],warnings:[]};
    const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(doc)],'boundary.json'));const input=document.getElementById('file-input');input.files=dt.files;input.dispatchEvent(new Event('change'));
  })()`);
  await wait(`document.getElementById('title').value === 'Boundary geometry fixture'`);
  await illustrate('architecture');
  const geometry = await js(`(async () => {
    window.dispatchEvent(new Event('pagehide'));
    const doc=JSON.parse(localStorage.getItem('schematica.autosave')), {nodeRect}=await import('/src/geometry.js');
    const rect=id=>nodeRect(doc.nodes.find(node=>doc.securityAnalysis.findings.find(f=>f.id===id).targets.includes(node.id)));
    const client=rect('client'), parser=rect('parser'), zone=doc.zones[0];
    if(!zone)return {hasZone:false,wires:doc.wires.length};
    return {hasZone:true,parserInside:parser.x>=zone.x&&parser.y>=zone.y&&parser.x+parser.w<=zone.x+zone.w&&parser.y+parser.h<=zone.y+zone.h,
      clientOutside:client.x+client.w<=zone.x||client.x>=zone.x+zone.w||client.y+client.h<=zone.y||client.y>=zone.y+zone.h,wires:doc.wires.length,
      labels:doc.wires.map(w=>w.label)};
  })()`);
  check('explicit trust zone keeps parser inside and the entire outside client outside', geometry.hasZone && geometry.parserInside && geometry.clientOutside, JSON.stringify(geometry));
  check('boundary relations remain visible as directed labeled connections', geometry.wires === 2 && geometry.labels.some(label=>label.includes('outside')) && geometry.labels.some(label=>label.includes('inside')) && await js(`document.querySelectorAll('#canvas g.wire').length === 2`), JSON.stringify(geometry));
  if(capture) await capture('security-explicit-trust-boundary');
  await click('#btn-security');
}
