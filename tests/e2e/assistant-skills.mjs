export async function runSkillChecks({ js, check, sleep, fakeSeen }) {
  await js(`localStorage.setItem('schematica.ai.settings',JSON.stringify({provider:'anthropic',model:'test-model',baseUrl:location.origin+'/fake',effort:'low',remember:true,tools:true}));localStorage.setItem('schematica.ai.key.anthropic','sk-fake');document.getElementById('btn-assistant').click();const p=document.getElementById('ai-preview-enabled');p.checked=true;p.dispatchEvent(new Event('change'));true`);
  check('all five skills and automatic routing are available', await js(`document.querySelectorAll('#ai-skill option').length===6`));
  await js(`document.getElementById('ai-blueprint').click();document.querySelector('#blueprint-dialog [name=goal]').value='Manual plan';document.querySelector('#blueprint-dialog [name=components]').value='Sensor\\nController';document.querySelector('#blueprint-dialog form').requestSubmit();true`);
  await sleep(100);
  await js(`document.getElementById('ai-blueprint').click();true`);
  check('Blueprint can be edited and reopened without a provider request', await js(`document.querySelector('#blueprint-dialog [name=goal]').value==='Manual plan' && document.querySelector('#blueprint-dialog [name=components]').value==='Sensor\\nController'`));
  await js(`document.querySelector('#blueprint-dialog [data-close]').click();true`);
  await sleep(100);
  await js(`document.getElementById('undo').click();document.getElementById('ai-blueprint').click();true`);
  check('manual Blueprint editing participates in undo',await js(`document.querySelector('#blueprint-dialog [name=goal]').value===''`));
  await js(`document.querySelector('#blueprint-dialog [data-close]').click();const s=document.getElementById('ai-skill');s.value='presentation';s.dispatchEvent(new Event('change'));document.getElementById('ai-input').value='Skill integration story';document.getElementById('ai-send').click();true`);
  for(let i=0;i<80;i++){ if(await js(`!!document.querySelector('#ai-preview-dialog[open]')`))break; await sleep(75); }
  check('AI preview shows readable Blueprint and chapter content',await js(`(()=>{const d=document.getElementById('ai-preview-dialog');return d?.open && d.textContent.includes('Explain a sensor node') && d.textContent.includes('Process measurements');})()`));
  check('selected skill guidance reached the provider',fakeSeen.some(f=>JSON.stringify(f.system).includes('Skill: Presentation storytelling')));
  check('draft parts are absent before apply',await js(`![...document.querySelectorAll('#canvas .node')].some(n=>n.textContent.includes('Story controller'))`));
  await js(`document.getElementById('ai-preview-apply').click();document.getElementById('btn-journey').click();true`);
  await sleep(100);
  check('applied presentation is visible in Journey',await js(`[...document.querySelectorAll('#journey-panel input')].some(n=>n.value==='Sensor overview')`));
  await js(`document.getElementById('journey-present').click();document.querySelector('#present-stops button').click();true`);
  check('generated story plays linked captions',await js(`document.getElementById('present-caption').textContent==='Process measurements' && !!document.querySelector('#canvas .node.story-match')`));
  await js(`document.getElementById('present-exit').click();document.getElementById('undo').click();document.getElementById('ai-blueprint').click();true`);
  check('one undo restores the original plan and removes the generated part',await js(`document.querySelector('#blueprint-dialog [name=goal]').value==='' && ![...document.querySelectorAll('#canvas .node')].some(n=>n.textContent.includes('Story controller'))`));
  await js(`document.querySelector('#blueprint-dialog [data-close]').click();true`);
  await sleep(100);
  await js(`document.getElementById('redo').click();true`);
  await sleep(100);
  await js(`document.getElementById('ai-blueprint').click();true`);
  await sleep(100);
  check('redo restores the generated Blueprint',await js(`document.querySelector('#blueprint-dialog [name=goal]').value==='Explain a sensor node'`));
}
