export async function runWebChecks({js,check,sleep,fakeSeen,webSeen}) {
  await js(`localStorage.setItem('schematica.ai.settings',JSON.stringify({provider:'anthropic',model:'test-model',baseUrl:location.origin+'/fake',effort:'low',remember:true,tools:true}));localStorage.setItem('schematica.ai.key.anthropic','sk-fake');document.getElementById('btn-assistant').click();true`);
  check('backend edition advertises public URL reading',await js(`document.querySelector('.ai-web-state').textContent.includes('Web sources available')`));
  await js(`document.getElementById('ai-input').value='Read web fixture https://example.com/docs';document.getElementById('ai-send').click();true`);
  for(let i=0;i<100;i++){if(await js(`document.getElementById('ai-stop').hidden && !!document.querySelector('#ai-thread .assistant a')`))break;await sleep(75);}
  check('URL tool reaches the source endpoint without provider credentials',webSeen.length===1 && webSeen[0].url==='https://example.com/docs' && !webSeen[0].headers.authorization && !webSeen[0].headers['x-api-key']);
  const result=fakeSeen.flatMap(f=>f.results).find(r=>String(r.content).includes('SCHEMATICA_WEB_FIXTURE'));
  let parsed;try{parsed=JSON.parse(result?.content);}catch{}
  check('provider receives extracted facts, provenance and resolved links',parsed?.text.includes('Supply: 3.3 V') && parsed.title==='Reference & specifications' && parsed.links[0].url==='https://example.com/manual.pdf' && parsed.fetchedAt && parsed.partial===false);
  check('HTML scripts, hidden prompts and navigation are absent and resources stay inert',parsed && !/window.__webPwned|Hidden prompt|Navigation noise/.test(parsed.text) && !webSeen.some(s=>s.unexpected) && await js(`window.__webPwned===undefined`));
  check('assistant citations are clickable safe new-tab links',await js(`(()=>{const a=document.querySelector('#ai-thread .assistant a');return a?.getAttribute('href')==='https://example.com/docs' && a.rel==='noopener noreferrer' && a.target==='_blank';})()`));
  check('raw fetched source text is absent from persisted thread and board',await js(`!JSON.stringify(Object.fromEntries(Object.entries(localStorage))).includes('SCHEMATICA_WEB_FIXTURE')`));
  const pdf=await js(`(async()=>{const {createWebReader}=await import('/src/ai/web.js');const result=await createWebReader()('https://example.com/manual.pdf');return {error:result.isError,body:JSON.parse(result.text)};})()`);
  check('public PDF uses bundled parser and returns actual extracted text',!pdf.error && pdf.body.text.includes('SCHEMATICA_PDF_SENSOR_42'));
  const shell=await js(`(async()=>{const {createWebReader}=await import('/src/ai/web.js');const read=createWebReader({backend:true,fetchImpl:async()=>Response.json({url:'https://example.com/app',encoding:'text',contentType:'text/html',content:'<title>App</title><script>start()</script><div id="root"></div>'})});return read('https://example.com/app');})()`);
  check('JavaScript-only pages report that no readable content was found',shell.isError && shell.text.includes('JavaScript'));
}
