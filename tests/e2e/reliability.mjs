// Regression coverage for startup recovery and real Engineering form lifecycles.
export async function runReliabilityChecks({ js, check, send, origin, sleep, capture, expectDialog }) {
  const wait = async expression => {
    for (let i = 0; i < 80; i++) {
      if (await js(expression).catch(() => false)) return;
      await sleep(50);
    }
    throw Error('Reliability check timed out: ' + expression);
  };
  const navigate = async () => {
    await js(`window.__reliabilityNavigationPending=true;true`);
    await send('Page.navigate', { url: origin + '/' });
    await wait(`!window.__reliabilityNavigationPending && document.readyState === 'complete' && !!document.getElementById('btn-engineering')`);
  };
  const section = name => js(`document.querySelector('[data-tab="${name}"]').click();true`);
  const change = (name, value) => js(`(()=>{const input=document.querySelector('#engineering-body [name="${name}"]');input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await navigate();
  await js(`(async()=>{const {EXAMPLES}=await import('/src/examples.js');const doc=EXAMPLES.find(e=>e.id==='declared-uart-reference').doc;const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(doc)],'reliability.json'));const f=document.getElementById('file-input');f.files=dt.files;f.dispatchEvent(new Event('change'));})()`);
  await wait(`document.getElementById('title').value==='Declared UART Interface Reference'`);
  await js(`document.getElementById('btn-engineering').click();true`);
  await section('interfaces');
  await change('source', 'Uncommitted interface source');
  await section('requirements');
  await section('interfaces');
  check('interface draft survives a section change', await js(`document.querySelector('[name=source]').value==='Uncommitted interface source'`));
  await js(`document.querySelectorAll('[data-worklist-wire]')[1].click();true`);
  await change('source', 'Second connection draft');
  await js(`document.querySelectorAll('[data-worklist-wire]')[0].click();true`);
  check('connection drafts remain separate', await js(`document.querySelector('[name=source]').value==='Uncommitted interface source'`));
  await js(`document.querySelector('#engineering-dialog [data-action=close]').click();document.getElementById('btn-engineering').click();true`);
  check('closing and reopening Engineering retains a draft', await js(`document.querySelector('[name=source]').value==='Uncommitted interface source'`));
  await js(`document.querySelector('#engineering-body button[type=submit]').focus();document.querySelector('#engineering-body form').requestSubmit();window.dispatchEvent(new Event('pagehide'));true`);
  check('saving an interface keeps keyboard focus in the dialog', await js(`document.getElementById('engineering-dialog').contains(document.activeElement)&&document.activeElement.type==='submit'`));
  check('saved draft reaches the board', await js(`JSON.parse(localStorage.getItem('schematica.autosave')).wires[0].spec.source==='Uncommitted interface source'`));
  await js(`document.querySelector('#engineering-dialog [data-action=close]').click();document.getElementById('undo').click();document.getElementById('btn-engineering').click();true`);
  check('undo is not overwritten by a previously saved draft', await js(`document.querySelector('[name=source]').value.startsWith('Illustrative interface contract')`));
  await section('requirements');
  await change('id', 'REQ-DRAFT');
  await change('text', 'Retain this requirement draft');
  await section('decisions');
  await section('requirements');
  check('new requirement fields survive section navigation', await js(`document.querySelector('[name=id]').value==='REQ-DRAFT'&&document.querySelector('[name=text]').value==='Retain this requirement draft'`));
  await change('text', '');
  await js(`document.querySelector('#engineering-body form').requestSubmit();true`);
  await section('decisions'); await section('requirements');
  check('validation failure keeps the draft for correction', await js(`document.querySelector('[name=id]').value==='REQ-DRAFT'&&document.querySelector('[name=text]').value===''`));
  await change('text', 'Retain this requirement draft');
  await js(`(async()=>{const {setLang}=await import('/src/i18n.js');setLang('zh');})()`);
  check('language changes preserve edited form fields', await js(`document.querySelector('[name=text]').value==='Retain this requirement draft'`));
  await js(`(async()=>{const {setLang}=await import('/src/i18n.js');setLang('en');})()`);
  await section('report');
  await change('summary', 'Unsaved report narrative');
  await section('requirements');
  await section('report');
  check('report narrative survives section navigation', await js(`document.querySelector('[name=summary]').value==='Unsaved report narrative'`));
  const logo = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1kAAAAASUVORK5CYII=';
  await js(`(()=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob('${logo}'),c=>c.charCodeAt(0))],'logo.png',{type:'image/png'}));const input=document.getElementById('report-logo');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[name=section][value=bom]').click();return true})()`);
  await wait(`!document.querySelector('[data-report-action=remove-logo]').disabled`);
  await section('requirements'); await section('report');
  check('report drafts retain a loaded logo and individual section choices', await js(`document.querySelector('[name=logo]').value==='data:image/png;base64,${logo}'&&!document.querySelector('[name=section][value=bom]').checked&&!document.querySelector('[data-report-action=remove-logo]').disabled`));
  check('restoring a report draft requires a fresh preview before export', await js(`document.querySelector('[data-report-action=html]').disabled`));
  await js(`document.querySelector('[data-draft-discard]').click();true`);
  check('discard clears just the current form', await js(`document.querySelector('[name=summary]').value===''&&document.querySelector('[name=logo]').value===''`));
  await section('requirements');
  check('discarding a report leaves other drafts intact', await js(`document.querySelector('[name=id]').value==='REQ-DRAFT'`));
  // Decline the real file-open replacement guard and verify the board and draft.
  await js(`window.reliabilityConfirm=window.confirm;window.reliabilityConfirmCalls=0;window.confirm=()=>{window.reliabilityConfirmCalls++;return false};document.querySelector('#engineering-dialog [data-action=close]').click();true`);
  await js(`(async()=>{const {newDoc}=await import('/src/state.js');const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(newDoc('Rejected replacement'))],'replace.json'));const input=document.getElementById('file-input');input.files=dt.files;input.dispatchEvent(new Event('change'));})()`);
  await wait(`window.reliabilityConfirmCalls===1`);
  await js(`window.confirm=window.reliabilityConfirm;delete window.reliabilityConfirm;document.getElementById('btn-engineering').click();true`);
  check('cancelling a board replacement preserves the board and its drafts', await js(`document.getElementById('title').value==='Declared UART Interface Reference'&&document.querySelector('[name=id]').value==='REQ-DRAFT'`));
  await capture?.('engineering-drafts');
  expectDialog('Discard unsaved Engineering drafts and open another board?');
  await js(`document.querySelector('#engineering-dialog [data-action=close]').click();true`);
  await js(`(async()=>{const {newDoc}=await import('/src/state.js');const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(newDoc('Accepted replacement'))],'replace.json'));const input=document.getElementById('file-input');input.files=dt.files;input.dispatchEvent(new Event('change'));})()`);
  await wait(`document.getElementById('title').value==='Accepted replacement'`);
  await js(`document.getElementById('btn-engineering').click();true`);
  check('accepting a board replacement clears previous board drafts', await js(`document.querySelector('[name=id]').value!=='REQ-DRAFT'&&document.querySelector('[name=text]').value===''`));
  await section('revisions'); await change('label', 'Comparison baseline');
  await js(`document.querySelector('#engineering-body form').requestSubmit();true`);
  await wait(`[...document.querySelectorAll('#engineering-body li')].some(li=>li.querySelector('strong')?.textContent==='Comparison baseline'&&li.textContent.includes('Saved on this device'))`);
  await js(`(()=>{const row=[...document.querySelectorAll('#engineering-body li')].find(li=>li.querySelector('strong')?.textContent==='Comparison baseline');window.reliabilityBaseline=row.querySelector('[data-restore]').dataset.restore;row.querySelector('[data-baseline]').click();return true})()`);
  await section('revisions');
  await js(`document.querySelector('[data-restore="'+window.reliabilityBaseline+'"]').click();true`);
  await section('review');
  check('restoring a revision preserves the explicitly chosen comparison baseline', await js(`document.getElementById('engineering-body').textContent.includes('Baseline: Accepted replacement')`));

  // Exercise a delayed revision save with the production workflow and draft helper.
  check('typing during an asynchronous review save retains only newer edits', await js(`(async()=>{
    const {Store,newDoc}=await import('/src/state.js'), {createFormDrafts}=await import('/src/ui/form-drafts.js'), {renderWorkflow}=await import('/src/ui/workflow-ui.js');
    const body=document.createElement('section');document.body.append(body);const store=new Store(newDoc()), drafts=createFormDrafts(paint);let release;
    const revisions={save:()=>({id:'revision'}),flush:()=>new Promise(resolve=>release=resolve),list:()=>[{id:'revision',durable:true}]};
    function paint(){drafts.capture();renderWorkflow({tab:'comments',body,store,navigation:{rootDoc:()=>store.doc},revisions,paint,onSaved:drafts.commit,onSaveStart:drafts.snapshot});drafts.mount(body,'comments');}
    paint();let form=body.querySelector('#review-start');form.elements.author.value='Reviewer';form.elements.title.value='Submitted';form.dispatchEvent(new Event('input',{bubbles:true}));form.requestSubmit();
    form.elements.title.value='Newer draft';form.dispatchEvent(new Event('input',{bubbles:true}));paint();release();await new Promise(resolve=>setTimeout(resolve,50));
    form=body.querySelector('#review-start');const result=store.doc.engineering.reviews[0].title==='Submitted'&&form.elements.title.value==='Newer draft'&&drafts.hasChanges();body.remove();return result;
  })()`));

  // Leave the fixture page before injecting startup data, so its pagehide flush
  // cannot replace the malformed value intended for the next document.
  await send('Page.navigate', { url: origin + '/guide.html' });
  await wait(`document.readyState==='complete'&&!!document.getElementById('guide-part-search')`);
  await js(`localStorage.setItem('schematica.autosave','{"nodes":');true`);
  await navigate();
  check('unreadable autosave presents a persistent recovery notice', await js(`document.getElementById('recovery-status').textContent.includes('Recovery')`));
  await js(`document.getElementById('title').value='After recovery';document.getElementById('title').dispatchEvent(new Event('change'));window.dispatchEvent(new Event('pagehide'));document.getElementById('recovery-status').click();true`);
  check('original startup bytes remain exportable after an edit', await js(`(async()=>{const {RECOVERY_PREFIX}=await import('/src/startup-recovery.js');return Object.keys(localStorage).filter(k=>k.startsWith(RECOVERY_PREFIX)).some(k=>JSON.parse(localStorage.getItem(k)).text==='{"nodes":')&&!!document.querySelector('[data-recovery-export]')})()`));
  await capture?.('startup-recovery');
  await navigate();
  check('recovery originals and notice survive reload', await js(`document.getElementById('title').value==='After recovery'&&document.getElementById('recovery-status').textContent.includes('Recovery')`));
  await js(`document.getElementById('recovery-status').click();document.querySelector('[data-recovery-reviewed]').click();true`);
  check('reviewing recovery clears the notice but retains the original export', await js(`!document.getElementById('recovery-status').textContent.includes('Recovery')&&!!document.querySelector('[data-recovery-export]')`));
  await js(`localStorage.clear();window.dispatchEvent(new StorageEvent('storage',{key:null,newValue:null,storageArea:localStorage}));true`);
  check('another tab clearing local storage restores the recovery warning', await js(`document.getElementById('recovery-status').textContent.includes('Recovery')`));
  await js(`document.querySelector('#engineering-dialog [data-action=close]').click();document.getElementById('recovery-status').click();true`);
  check('cleared recovery copies remain exportable in memory and can be preserved again', await js(`(async()=>{
    const {RECOVERY_PREFIX}=await import('/src/startup-recovery.js');
    const retained=!!document.querySelector('[data-recovery-export]')&&document.getElementById('startup-recovery').textContent.includes('Autosave is paused');
    document.querySelector('[data-recovery-retry]').click();
    return retained&&Object.keys(localStorage).filter(k=>k.startsWith(RECOVERY_PREFIX)).some(k=>JSON.parse(localStorage.getItem(k)).text==='{"nodes":')
      &&document.getElementById('startup-recovery').textContent.includes('Original data saved on this device.');
  })()`));
}
