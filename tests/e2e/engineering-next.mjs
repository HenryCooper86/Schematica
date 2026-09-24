// Exercise the persisted declarations, preview/apply boundary, undo, and offline report.
export async function runEngineeringNextChecks({ js, key, check, sleep }) {
  const original = await js(
    `(()=>{window.dispatchEvent(new Event('pagehide'));return localStorage.getItem('schematica.autosave')})()`,
  );
  await js(
    `(async()=>{const {Store,addNode,addWire}=await import('/src/state.js');const s=new Store();s.doc.title='Interface review';const a=addNode(s,'mcu',0,0),b=addNode(s,'temp',400,0);addWire(s,'i2c',{node:a,port:'i2c'},{node:b,port:'i2c'});const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(s.doc)],'review.json'));const f=document.getElementById('file-input');f.files=dt.files;f.dispatchEvent(new Event('change'));})()`,
  );
  await sleep(200);
  await js(`document.getElementById('btn-check').click();document.querySelector('[data-check-mode=readiness]').click();true`);
  check('undeclared connections are unassessed and block review readiness', await js(`(()=>{const t=document.getElementById('drc-list').textContent;return t.includes('1 unassessed')&&t.includes('Not ready for interface review')&&!t.includes('passes every check')})()`));
  await js(`document.querySelector('#drc-list [data-coverage]').click();true`);
  check('coverage selects the incomplete connection', await js(`!document.getElementById('drc-dialog').open&&!!document.querySelector('#canvas .wire [stroke="#7dd3fc"]')`));
  await js(
    `document.getElementById('btn-engineering').click();document.querySelector('[data-tab=interfaces]').click();true`,
  );
  const limits = { voltageMinV: '3', voltageMaxV: '3.6', rateBps: '400000' };
  const values = {
    ...limits,
    direction: 'bidirectional',
    protocol: 'I2C',
    source: 'Board specification',
  };
  for (const end of ['from', 'to']) {
    Object.assign(
      values,
      Object.fromEntries(Object.entries(limits).map(([k, v]) => [end + '_' + k, v])),
    );
    Object.assign(values, {
      [end + '_direction']: 'bidirectional',
      [end + '_protocols']: 'I2C',
      [end + '_source']: 'Datasheet',
    });
  }
  const submit = async (data) =>
    js(
      `(()=>{const f=document.querySelector('#engineering-body form');for(const [k,v] of Object.entries(${JSON.stringify(data)}))f.elements.namedItem(k).value=v;f.requestSubmit();return true})()`,
    );
  await submit(values);
  check(
    'numeric interface limits survive the form save',
    await js(
      `document.querySelector('[name=voltageMaxV]').value==='3.6'&&document.querySelector('[name=from_rateBps]').value==='400000'`,
    ),
  );
  await js(`window.dispatchEvent(new Event('pagehide'));true`);
  check(
    'complete compatible declarations produce no compatibility findings',
    await js(
      `(async()=>{const {interfaceCompatibility}=await import('/src/interface-checks.js');return interfaceCompatibility(JSON.parse(localStorage.getItem('schematica.autosave'))).length===0})()`,
    ),
  );
  await submit({ to_rateBps: '100000' });
  await js(`window.dispatchEvent(new Event('pagehide'));true`);
  check(
    'an endpoint bandwidth mismatch appears in persisted design checks',
    await js(
      `(async()=>{const {checkDoc}=await import('/src/drc.js');return checkDoc(JSON.parse(localStorage.getItem('schematica.autosave'))).some(f=>f.rule==='interface-bandwidth')})()`,
    ),
  );
  await js(`document.querySelector('[data-tab=impact]').click();true`);
  await submit({ partNumber: 'Replacement device', rail: '5V' });
  check(
    'impact preview shows connected items without modifying the board',
    await js(
      `document.querySelectorAll('[data-impact-id]').length>=3&&!JSON.parse(localStorage.getItem('schematica.autosave')).nodes.some(n=>n.sublabel==='Replacement device')`,
    ),
  );
  await js(
    `document.querySelector('[data-action=apply-preview]').click();document.querySelector('[data-action=close]').click();window.dispatchEvent(new Event('pagehide'));document.activeElement.blur();document.getElementById('canvas').focus();true`,
  );
  check(
    'applying a replacement clears old endpoint ratings',
    await js(
      `(()=>{const n=JSON.parse(localStorage.getItem('schematica.autosave')).nodes.find(n=>n.sublabel==='Replacement device');return n&&n.rail==='5V'&&!n.interfacePorts})()`,
    ),
  );
  await key('z', 'KeyZ', 90, 2);
  await js(`window.dispatchEvent(new Event('pagehide'));true`);
  check(
    'one undo restores the original part and its declarations',
    await js(
      `(()=>{const d=JSON.parse(localStorage.getItem('schematica.autosave'));return !d.nodes.some(n=>n.sublabel==='Replacement device')&&d.nodes.every(n=>n.interfacePorts?.i2c)})()`,
    ),
  );
  // A separate same-origin wrapper lets the harness inspect the report controls;
  // the exported diagram itself retains its normal opaque sandbox.
  await js(
    `(async()=>{const {Store}=await import('/src/state.js'),{groupSubsystem}=await import('/src/subsystems.js'),{reviewHTML}=await import('/src/review.js');const s=new Store();s.replaceDoc(JSON.parse(localStorage.getItem('schematica.autosave')));groupSubsystem(s,s.doc.nodes.map(n=>n.id),'Nested sensors');const f=document.createElement('iframe');f.id='review-test-frame';f.style='position:fixed;inset:0;width:100%;height:100%;z-index:99999;background:white';document.body.append(f);f.srcdoc=reviewHTML(s.doc);await new Promise(r=>f.onload=r);return true})()`,
  );
  check(
    'offline review contains readable nested interface and capability tables',
    await js(
      `(()=>{const d=document.getElementById('review-test-frame').contentDocument;return d.querySelector('#interfaces tbody').textContent.includes('Nested sensors')&&d.querySelector('#interfaces tbody').textContent.includes('Datasheet')&&d.querySelectorAll('table').length>=6&&!d.querySelector('pre')})()`,
    ),
  );
  await js(
    `document.getElementById('review-test-frame').contentDocument.querySelector('#interfaces [data-scope]').click();true`,
  );
  await sleep(150);
  check(
    'a nested interface switches the offline diagram scope and focus',
    await js(
      `(()=>{const d=document.getElementById('review-test-frame').contentDocument;return d.getElementById('scope').value!=='[]'&&d.getElementById('viewer-status').textContent.startsWith('Focused items:')&&d.querySelector('iframe').dataset.scope===d.getElementById('scope').value})()`,
    ),
  );
  check(
    'offline source artifacts include all subsystem interfaces',
    await js(
      `(()=>{const d=document.getElementById('review-test-frame').contentDocument,data=JSON.parse(d.getElementById('review-data').textContent);return data.files['interfaces-all.csv'].includes('Nested sensors')&&JSON.parse(data.files['review.json']).interfaces[0].fromCapability.protocols[0]==='I2C'})()`,
    ),
  );
  check('offline review includes failed interface coverage', await js(`document.getElementById('review-test-frame').contentDocument.getElementById('interface-coverage').textContent.includes('1 failed')`));
  await js(`document.getElementById('review-test-frame').remove();true`);
  await js(`(async()=>{const {EXAMPLES}=await import('/src/examples.js');const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(EXAMPLES.find(e=>e.id==='declared-uart-reference').doc)],'reference.json'));const f=document.getElementById('file-input');f.files=dt.files;f.dispatchEvent(new Event('change'));})()`);
  await sleep(200);
  await js(`document.getElementById('btn-check').click();document.querySelector('[data-check-mode=readiness]').click();true`);
  check('fully declared reference is ready with four checked connections', await js(`(()=>{const t=document.getElementById('drc-list').textContent;return t.includes('4 checked')&&t.includes('Ready for interface review')&&t.includes('not hardware validation')})()`));
  await js(`(async()=>{const {setLang}=await import('/src/i18n.js');setLang('zh')})()`);
  check('readiness coverage is translated in the open dialog', await js(`document.getElementById('drc-list').textContent.includes('4 条已检查')&&document.querySelector('[data-check-mode=readiness]').textContent.includes('审查')`));
  await js(`(async()=>{const {setLang}=await import('/src/i18n.js');setLang('en');document.querySelector('[data-check-mode=design]').click();document.getElementById('drc-close').click()})()`);
  await js(`(async()=>{const {EXAMPLES}=await import('/src/examples.js');const d=structuredClone(EXAMPLES.find(e=>e.id==='declared-uart-reference').doc);d.wires[1].spec=undefined;const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(d)],'reuse.json'));const f=document.getElementById('file-input');f.files=dt.files;f.dispatchEvent(new Event('change'));})()`);
  await sleep(200);
  await js(`document.getElementById('btn-engineering').click();document.querySelector('[data-tab=interfaces]').click();true`);
  check('interface worklist shows every connection and its declaration status', await js(`document.querySelectorAll('#interface-worklist [data-worklist-wire]').length===4&&document.getElementById('interface-worklist').textContent.includes('Unassessed')`));
  await js(`document.querySelector('#interface-worklist [data-reuse-target="w2"]').click();document.querySelector('[data-action=preview-reuse]').click();window.dispatchEvent(new Event('pagehide'));true`);
  check('reuse previews only missing fields before changing the board', await js(`document.getElementById('reuse-preview').textContent.includes('w2')&&!JSON.parse(localStorage.getItem('schematica.autosave')).wires[1].spec`));
  await js(`document.querySelector('[data-action=apply-reuse]').click();window.dispatchEvent(new Event('pagehide'));true`);
  check('reuse applies selected connection fields in one board edit', await js(`(()=>{const w=JSON.parse(localStorage.getItem('schematica.autosave')).wires[1];return w.spec.protocol==='UART'&&w.spec.source&&document.getElementById('interface-worklist').textContent.includes('Checked')})()`));
  await js(`document.querySelector('#engineering-dialog [data-action=close]').click();true`);
  await js(
    `(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(original)}],'restore.json'));const f=document.getElementById('file-input');f.files=dt.files;f.dispatchEvent(new Event('change'));return true})()`,
  );
  await sleep(200);
}
