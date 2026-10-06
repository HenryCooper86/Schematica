// Browser DOMParser plus the real interchange file controls and store history.
export async function runKiCadUpdateChecks({ js, check, sleep }) {
  const xml = (value = 'MCU', extra = '') => `<export><design><source>/design/update.kicad_sch</source></design><components><comp ref="U1"><value>${value}</value><footprint>QFN</footprint></comp><comp ref="R1"><value>10k</value></comp>${extra ? '<comp ref="J1"><value>Header</value></comp>' : ''}</components><nets><net name="SIG"><node ref="U1" pin="1"/><node ref="R1" pin="2"/>${extra ? '<node ref="J1" pin="1"/>' : ''}</net></nets></export>`;
  const open = () => js(`for(const d of document.querySelectorAll('dialog[open]'))d.close();document.getElementById('btn-engineering').click();document.querySelector('[data-tab=interchange]').click();true`);
  const upload = (id, text) => js(`(async()=>{const input=document.getElementById(${JSON.stringify(id)}),dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(text)}],'update.xml'));input.files=dt.files;await input.onchange({target:input,preventDefault(){}});return true})()`);
  const saved = () => js(`(()=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem('schematica.autosave'))})()`);
  await open(); await upload('engineering-kicad', xml());
  check('one-shot KiCad XML import records source provenance and renders every endpoint', await js(`document.querySelectorAll('#canvas .node').length===3&&document.querySelectorAll('#canvas .wire').length===2`));
  const original = await saved();
  check('original source path and bounded source manifest survive autosave', original.kicad?.source === '/design/update.kicad_sch' && original.kicad?.components.length === 2);
  // Seed authored data through the normal board file loader, then use only UI.
  const u = original.nodes.find(n => n.label === 'U1'); Object.assign(u, { x: 123, y: -99, notes: 'Preserve my review note', flags: ['safety'] });
  original.title = 'Authored KiCad board'; original.engineering = { requirements: [{ id: 'REQ1', text: 'Controller', targets: [u.id] }] };
  await js(`(()=>{document.getElementById('engineering-dialog').close();const input=document.getElementById('file-input'),dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(JSON.stringify(original))}],'authored.json'));input.files=dt.files;input.dispatchEvent(new Event('change'));return true})()`); await sleep(200);
  await open(); await upload('engineering-kicad-update', xml('New MCU', 'add'));
  check('KiCad update displays before/after diagrams and source changes before applying', await js(`!!document.querySelector('#kicad-update-preview [data-change-before] svg')&&!!document.querySelector('#kicad-update-preview [data-change-after] svg')&&document.querySelector('#kicad-update-preview').textContent.includes('J1')&&!!document.querySelector('[data-action=apply-kicad-update]')&&document.querySelectorAll('#canvas .node').length===3`));
  await js(`document.querySelector('[data-action=apply-kicad-update]').click();true`);
  const updated = await saved(), nextU = updated.nodes.find(n => n.id === u.id);
  check('applying update changes source value and topology while preserving authored layout and notes', updated.nodes.length === 4 && updated.wires.length === 3 && nextU.sublabel === 'New MCU' && nextU.x === 123 && nextU.y === -99 && nextU.notes === u.notes && updated.title === original.title);
  await js(`document.getElementById('engineering-dialog').close();document.getElementById('undo').click();true`);
  const undone = await saved();
  check('one Undo restores the entire prior imported source and topology', undone.nodes.length === 3 && undone.wires.length === 2 && undone.nodes.find(n => n.id === u.id).sublabel === 'MCU' && undone.kicad.components.length === 2);
  await open(); await upload('engineering-kicad-update', xml('Stale MCU', 'add'));
  await js(`document.getElementById('title').value='Changed after preview';document.getElementById('title').dispatchEvent(new Event('change'));document.querySelector('[data-action=apply-kicad-update]').click();true`);
  check('stale apply is rejected without replacing newer board work', await js(`document.getElementById('toast').textContent.includes('board changed')&&document.getElementById('title').value==='Changed after preview'&&document.querySelectorAll('#canvas .node').length===3`));
  await open();
  await js(`(async()=>{const input=document.getElementById('engineering-kicad-update'),dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(xml('Pending MCU', 'add'))}],'pending.xml'));input.files=dt.files;const originalText=File.prototype.text;let release;File.prototype.text=function(){return new Promise(resolve=>{release=()=>resolve(${JSON.stringify(xml('Pending MCU', 'add'))})})};try{const pending=input.onchange({target:input,preventDefault(){}});document.getElementById('title').value='Changed during file read';document.getElementById('title').dispatchEvent(new Event('change'));release();await pending;}finally{File.prototype.text=originalText;}return true})()`);
  check('async file read captures its original snapshot and rejects a concurrent edit before displaying a preview', await js(`!document.querySelector('[data-action=apply-kicad-update]')&&document.getElementById('toast').textContent.includes('board changed')&&document.querySelectorAll('#canvas .node').length===3`));
  await upload('engineering-kicad-update', xml().replace('/design/update.kicad_sch', '/other/source.kicad_sch'));
  check('different source provenance refuses an update visibly', await js(`document.getElementById('toast').textContent.includes('does not match')&&!document.querySelector('[data-action=apply-kicad-update]')`));
  await upload('engineering-kicad-update', xml().replace('</nets>', '<net name="SIG"><node ref="U1" pin="2"/></net></nets>'));
  check('duplicate named nets are rejected by the browser XML importer', await js(`document.getElementById('toast').textContent.includes('Duplicate KiCad net name')&&!document.querySelector('[data-action=apply-kicad-update]')`));
  await js(`document.getElementById('engineering-dialog').close();true`);
}
