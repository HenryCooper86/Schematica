import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// A real isolated app/API and private disk store: no provider or production calls.
export async function runTeamReviewChecks({js,check,sleep,navigate,capture,resize,restoreViewport}){
 const {createTeamService}=await import('../../server/team-api.js');
 const {createAppServer}=await import('../../server/index.js');
 const root=fileURLToPath(new URL('../../',import.meta.url)),directory=await mkdtemp(join(tmpdir(),'schematica-team-browser-'));
 const identitiesFile=join(directory,'identities.json'),ownerToken=randomBytes(32).toString('hex'),reviewerToken=randomBytes(32).toString('hex');
 const identities={version:1,users:[['owner','Owner',ownerToken],['reviewer','Reviewer',reviewerToken]].map(([id,name,token])=>({id,name,tokenHash:createHash('sha256').update(token).digest('hex')}))};
 await writeFile(identitiesFile,JSON.stringify(identities),{mode:0o600});
 let service,server,failNextList=false;
 const wait=async expr=>{for(let i=0;i<80;i++){if(await js(expr).catch(()=>false))return;await sleep(50);}throw Error('Team UI did not reach expected state: '+expr);};
 const settled=()=>wait(`!document.querySelector('#team-body [data-was-disabled]')`);
 const click=async id=>{await js(`document.getElementById(${JSON.stringify(id)}).click();true`);await settled();};
 const submit=async(id,values)=>{await js(`(()=>{const form=document.getElementById(${JSON.stringify(id)});for(const [key,value] of Object.entries(${JSON.stringify(values)}))form.elements[key].value=value;form.requestSubmit();return true})()`);await settled();};
 try{
  server=createAppServer({root});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await navigate('http://127.0.0.1:'+server.address().port+'/');await wait(`!!document.getElementById('btn-team')`);
  await js(`for(const d of document.querySelectorAll('dialog[open]'))d.close();true`);await click('btn-team');
  check('disabled server explains local review availability without requesting a credential',await js(`document.getElementById('team-body').textContent.includes('Local review packages remain available')&&!document.getElementById('team-login')`));
  await navigate('about:blank');await new Promise(resolve=>server.close(resolve));server=null;
  service=await createTeamService({directory:join(directory,'data'),identitiesFile,root});server=createAppServer({root,teamService:service});
  const handle=server.listeners('request')[0];server.removeAllListeners('request');server.on('request',(req,res)=>{if(failNextList&&req.method==='GET'&&req.url==='/api/team/projects'){failNextList=false;res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'Temporary test outage'}}));return;}handle(req,res);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  const api=async(path,body,token=ownerToken)=>{const r=await fetch(origin+'/api/team'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'x-schematica-client':'1',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,...await r.json()};};
  await navigate(origin+'/');await wait(`!!document.getElementById('btn-team')`);
  await js(`(async()=>{for(const d of document.querySelectorAll('dialog[open]'))d.close();const {EXAMPLES}=await import('/src/examples.js'),doc=EXAMPLES.find(e=>e.id==='declared-uart-reference').doc,input=document.getElementById('file-input'),dt=new DataTransfer();dt.items.add(new File([JSON.stringify(doc)],'team-source.json'));input.files=dt.files;input.dispatchEvent(new Event('change'));return true})()`);
  await wait(`document.querySelectorAll('#canvas .node').length>0`);
  await js(`(()=>{for(const d of document.querySelectorAll('dialog[open]'))d.close();document.getElementById('title').value='Local review source';document.getElementById('title').dispatchEvent(new Event('change'));return true})()`);
  await click('btn-team');failNextList=true;await submit('team-login',{token:ownerToken});
  await js(`(async()=>{const {setLang}=await import('/src/i18n.js');setLang('zh');setLang('en');return true})()`);
  check('a failed inbox load after authentication clears the session even after event dispatch has ended',await js(`!!document.getElementById('team-login')&&!document.getElementById('team-project')&&document.querySelector('#team-login input').value===''`));
  await submit('team-login',{token:ownerToken});
  check('team login identifies the operator-assigned account',await js(`document.getElementById('team-body').textContent.includes('Connected as Owner')`));
  await submit('team-create',{title:'Browser review project'});
  let project=(await api('/projects')).projects[0],id=project.id;project=(await api('/projects/'+id)).project;
  const firstRevision=project.latestRevisionId,firstHash=project.revisions[0].hash;
  await wait(`document.getElementById('team-local-state')?.textContent.includes('matches')`);
  check('published snapshot renders separately with its full hash and local match state',await js(`!!document.querySelector('#team-diagram svg')&&document.querySelector('.team-hash').textContent.includes(${JSON.stringify(firstHash)})&&document.getElementById('title').value==='Local review source'`));
  await js(`(()=>{const form=document.getElementById('team-members');form.elements.userId.value='reviewer';form.requestSubmit();return true})()`);
  await wait(`!document.querySelector('#team-members button').disabled&&document.getElementById('team-project').textContent.includes('reviewer · reviewer')`);
  await submit('team-comment',{text:'Verify supply limits before approval',target:''});
  await submit('team-decision',{status:'approved',comment:'Premature'});
  project=(await api('/projects/'+id)).project;
  check('unresolved discussion prevents approval through the real API and displays an error',project.reviews.length===0&&await js(`!!document.getElementById('team-error').textContent`));
  await click('team-close');await click('btn-team');await submit('team-login',{token:reviewerToken});
  await js(`(async()=>{await document.querySelector('[data-project]').onclick();return true})()`);
  check('reviewer can read snapshots and discuss but cannot publish or manage members',await js(`!!document.querySelector('#team-diagram svg')&&document.getElementById('team-publish').disabled&&!document.getElementById('team-members')`));
  await js(`(async()=>{await document.querySelector('[data-comment]').onclick();return true})()`);
  await submit('team-decision',{status:'approved',comment:'Reviewed declared limits'});
  project=(await api('/projects/'+id)).project;
  check('approval records the authenticated reviewer and exact immutable snapshot hash',project.reviews.length===1&&project.reviews[0].author.id==='reviewer'&&project.reviews[0].hash===firstHash&&project.comments[0].resolved);
  check('reviewing the server snapshot leaves the local title unchanged',await js(`document.getElementById('title').value==='Local review source'`));
  await click('team-close');await click('btn-team');await submit('team-login',{token:ownerToken});await js(`(async()=>{await document.querySelector('[data-project]').onclick();return true})()`);
  await js(`document.getElementById('title').value='Changed local design';document.getElementById('title').dispatchEvent(new Event('change'));true`);
  await click('team-refresh');await wait(`document.getElementById('team-local-state')?.textContent.includes('differs')`);
  check('changed local content is explicitly distinguished from the reviewed snapshot',await js(`document.getElementById('team-local-state').textContent.includes('Decisions and comments apply only')`));
  await click('team-publish');project=(await api('/projects/'+id)).project;
  check('new revision does not inherit approval and preserves the original snapshot',project.revisions.length===2&&project.revisions[0].hash===firstHash&&project.revisions[0].board.title==='Local review source'&&!project.reviews.some(r=>r.revisionId===project.latestRevisionId));
  await js(`document.getElementById('team-revision').value=${JSON.stringify(firstRevision)};document.getElementById('team-revision').dispatchEvent(new Event('change'));true`);
  check('old revision is visibly identified and cannot be approved from the UI',await js(`document.querySelector('#team-decision button').disabled&&document.getElementById('team-project').textContent.includes('older revision')`));
  await click('team-refresh');
  await api('/projects/'+id+'/comments',{version:project.version,revisionId:project.latestRevisionId,text:'Concurrent reviewer comment'},reviewerToken);
  await submit('team-comment',{text:'Keep this draft after conflict',target:''});
  check('concurrent write conflict preserves the user draft and surfaces an error',await js(`document.querySelector('#team-comment textarea').value==='Keep this draft after conflict'&&!!document.getElementById('team-error').textContent`));
  await click('team-refresh');await submit('team-comment',{text:'Resubmitted after refresh',target:''});
  const exported=await api('/projects/'+id+'/export'),encoded=JSON.stringify(exported);
  check('authenticated export contains both revisions and discussion without credentials',encoded.includes('Resubmitted after refresh')&&encoded.includes(firstHash)&&!encoded.includes(ownerToken)&&!encoded.includes(reviewerToken)&&!encoded.includes('tokenHash'));
  await capture?.('team-review-desktop');
  if(resize){await resize(390,844);check('shared review remains readable within a narrow viewport',await js(`(()=>{const d=document.getElementById('team-dialog');return d.getBoundingClientRect().width<=innerWidth&&d.scrollWidth<=d.clientWidth+1})()`));await capture?.('team-review-mobile');await restoreViewport();}
  identities.users[0].disabled=true;await writeFile(identitiesFile,JSON.stringify(identities));await click('team-refresh');
  check('operator token revocation clears the connected UI without a server restart',await js(`!!document.getElementById('team-login')&&!document.getElementById('team-project')&&!!document.getElementById('team-error').textContent`));
  await click('team-close');await click('btn-team');
  check('closing clears credentials and no token entered browser storage',await js(`!!document.getElementById('team-login')&&document.querySelector('#team-login input').value===''&&!JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage)]).includes(${JSON.stringify(ownerToken)})&&!JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage)]).includes(${JSON.stringify(reviewerToken)})`));
  await click('team-close');
 }catch(error){await capture?.('team-review-failure');throw error;}finally{
  await restoreViewport?.();await navigate('about:blank');
  if(server)await new Promise(resolve=>server.close(resolve));
  await service?.close();await rm(directory,{recursive:true,force:true});
 }
}
