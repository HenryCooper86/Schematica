export async function runWorkflowChecks({ js, check, sleep, origin }) {
  const wait = async (expression) => {
    for (let i = 0; i < 100; i++) {
      if (await js(expression)) return;
      await sleep(100);
    }
    throw Error("Workflow timed out: " + expression);
  };
  const open = (tab) =>
    js(
      `document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.getElementById('btn-engineering').click();document.querySelector('[data-tab="${tab}"]').click();true`,
    );
  const form = (selector, values) =>
    js(
      `(()=>{const f=document.querySelector(${JSON.stringify(selector)});for(const [k,v] of Object.entries(${JSON.stringify(values)}))f.elements.namedItem(k).value=v;f.requestSubmit();return true;})()`,
    );
  await js(
    `(async()=>{const {Store,addNode,addWire}=await import('/src/state.js');const s=new Store();s.doc.title='Workflow integration';const a=addNode(s,'mcu',0,0),b=addNode(s,'temp',350,0);addWire(s,'i2c',{node:a,port:'i2c'},{node:b,port:'i2c'});const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(s.doc)],'workflow.json'));const input=document.getElementById('file-input');input.files=dt.files;input.dispatchEvent(new Event('change'));})()`,
  );
  await sleep(200);
  await open("revisions");
  await form("#engineering-body form", { label: "Durable milestone" });
  await wait(
    `[...document.querySelectorAll('#engineering-body li')].some(li=>li.textContent.includes('Durable milestone')&&li.textContent.includes('Saved on this device'))`,
  );
  check("named revisions finish durable IndexedDB writes", true);
  check(
    "revision insertion and rotation abort atomically without losing the old snapshot",
    await js(
      `(async()=>{const {openRevisionDB}=await import('/src/revision-db.js');const name='workflow-test-'+Date.now();const db=await openRevisionDB({open:()=>indexedDB.open(name,1)});await db.write([{id:'old',at:1,text:'old'}]);const put=IDBObjectStore.prototype.put;let rejected=false;IDBObjectStore.prototype.put=function(...args){const r=put.apply(this,args);this.transaction.abort();return r;};try{await db.write([{id:'new',at:2,text:'new'}]);}catch{rejected=true;}finally{IDBObjectStore.prototype.put=put;}const rows=await db.read();db.close();indexedDB.deleteDatabase(name);return rejected&&rows.length===1&&rows[0].id==='old';})()`,
    ),
  );
  await open("views");
  await form("#view-form", { name: "Firmware interfaces" });
  check(
    "saved engineering view appears in the board UI",
    await js(
      `document.getElementById('engineering-body').textContent.includes('Firmware interfaces')`,
    ),
  );
  await js(
    `document.querySelector('[data-action=close]').click();document.getElementById('zoom-out').click();true`,
  );
  await open("views");
  await js(
    `document.querySelector('[data-view]').click();window.dispatchEvent(new Event('pagehide'));true`,
  );
  check(
    "opening a named view restores its camera",
    await js(`document.getElementById('zoom-label').textContent==='100%'`),
  );
  await open("requirements");
  await js(
    `document.querySelector('[name=targets]').options[0].selected=true;true`,
  );
  await form("#engineering-body form", {
    id: "REQ-WF",
    text: "Sample sensor",
    owner: "Engineer",
    rationale: "Control",
    evidence: "bench-results.pdf",
    method: "Bench test",
    status: "verified",
  });
  await js(`document.querySelector('[data-tab=matrix]').click();true`);
  check(
    "verification matrix shows current evidence and verification method",
    await js(
      `document.getElementById('matrix-table').textContent.includes('Bench test')&&document.getElementById('matrix-table').textContent.includes('Verified')`,
    ),
  );
  await open("interfaces");
  await form("#engineering-body form", {
    voltage: "5V",
    direction: "bidirectional",
    protocol: "I2C",
    rate: "400kHz",
    source: "datasheet",
  });
  await js(`document.querySelector('[data-tab=matrix]').click();true`);
  check(
    "changed interface declarations invalidate allocated requirement evidence",
    await js(
      `document.getElementById('matrix-table').textContent.includes('Needs verification review')`,
    ),
  );
  await open("comments");
  await form("#review-start", {
    author: "Reviewer",
    title: "Prototype review",
  });
  await wait(`!!document.querySelector("[data-comment-form]")`);
  await form("[data-comment-form]", {
    author: "Reviewer",
    text: "Verify voltage tolerance",
  });
  check(
    "comments anchor to a saved revision and an item",
    await js(
      `(()=>{const s=document.querySelector('.review-record');return s.textContent.includes('Verify voltage tolerance')&&s.textContent.includes('rev')&&s.querySelector('[data-resolve]');})()`,
    ),
  );
  await js(
    `document.querySelector('[data-resolve]').click();document.querySelector('[data-status=approved]').click();true`,
  );
  check(
    "resolved comments permit approval of the current revision",
    await js(
      `document.querySelector('.review-record h3').textContent.includes('Approved')`,
    ),
  );
  await js(
    `document.querySelector('[data-action=close]').click();document.getElementById('title').value='Changed workflow';document.getElementById('title').dispatchEvent(new Event('change'));true`,
  );
  await open("comments");
  check(
    "editing the board makes the revision approval stale",
    await js(
      `document.querySelector('.review-record h3').textContent.includes('Stale review')&&document.querySelector('[data-status=approved]').disabled`,
    ),
  );
  await js(
    `document.querySelector('[data-action=close]').click();document.getElementById('btn-guide').click();true`,
  );
  check(
    "first-project guidance is accessible with actionable steps",
    await js(
      `!document.getElementById('first-project').hidden&&document.querySelectorAll('#first-project li').length===5&&!!document.getElementById('guide-interfaces')`,
    ),
  );
  await js(
    `document.getElementById('guide-close').click();window.dispatchEvent(new Event('pagehide'));window.__workflowBefore=localStorage.getItem('schematica.autosave');localStorage.setItem('schematica.ai.settings',JSON.stringify({provider:'anthropic',model:'test-model',baseUrl:location.origin+'/fake',effort:'low',remember:true,tools:true}));localStorage.setItem('schematica.ai.key.anthropic','sk-fake');if(document.getElementById('assistant').hidden)document.getElementById('btn-assistant').click();const p=document.getElementById('ai-preview-enabled');p.checked=true;p.dispatchEvent(new Event('change'));document.getElementById('ai-new').click();true`,
  );
  const send = () =>
    js(
      `(()=>{const input=document.getElementById('ai-input');input.value='build a small sensor node';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return true;})()`,
    );
  await send();
  await wait(`!!document.querySelector('#ai-preview-dialog[open]')`);
  check(
    "real assistant flow leaves the board unchanged while previewing",
    await js(
      `localStorage.getItem('schematica.autosave')===window.__workflowBefore&&document.querySelector('#ai-preview-dialog').textContent.includes('Design checks before and after')`,
    ),
  );
  await js(`document.getElementById('ai-preview-discard').click();true`);
  await sleep(100);
  check(
    "discarding the AI draft preserves the board",
    await js(
      `localStorage.getItem('schematica.autosave')===window.__workflowBefore`,
    ),
  );
  await send();
  await wait(`!!document.querySelector('#ai-preview-dialog[open]')`);
  await js(
    `document.getElementById('ai-preview-apply').click();window.dispatchEvent(new Event('pagehide'));true`,
  );
  check(
    "applying the AI preview commits proposed changes",
    await js(
      `JSON.parse(localStorage.getItem('schematica.autosave')).title==='Fake Build'`,
    ),
  );
  await js(
    `document.getElementById('undo').click();window.dispatchEvent(new Event('pagehide'));true`,
  );
  check(
    "one undo restores the board before AI preview",
    await js(
      `localStorage.getItem('schematica.autosave')===window.__workflowBefore`,
    ),
  );
  check(
    "review HTML includes views, verification, and revision discussions",
    await js(
      `(async()=>{const {reviewHTML}=await import('/src/review.js');const html=reviewHTML(JSON.parse(window.__workflowBefore));return html.includes('Firmware interfaces')&&html.includes('Verify voltage tolerance')&&html.includes('verification.csv')&&html.includes('saved-view');})()`,
    ),
  );
  await js(`(async()=>{const {buildHTML}=await import('/src/html-export.js');const f=document.createElement('iframe');f.id='workflow-offline';document.body.append(f);f.srcdoc=buildHTML(JSON.parse(window.__workflowBefore));await new Promise(resolve=>f.onload=resolve);f.contentWindow.postMessage({type:'schematica-saved-view',view:{query:'',bus:'',connections:'all',depth:'overview',selection:[],camera:{x:40,y:60,zoom:2}}},'*');return true;})()`);
  await sleep(150);
  check('offline saved views restore camera and reading detail in the rendered diagram',await js(`(()=>{const d=document.getElementById('workflow-offline').contentDocument,box=d.querySelector('svg').getAttribute('viewBox').split(' ').map(Number);return box[0]===-20&&box[1]===-30&&!!d.querySelector('[data-detail][visibility="hidden"]');})()`));
  await js(`document.getElementById('workflow-offline').remove();true`);

}
