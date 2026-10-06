import {createTeamClient} from '../team-client.js';
import {reviewSnapshot,reviewHash} from '../review-snapshot.js';
import {reviewHTML} from '../review.js';
import {buildExportSVG} from '../export.js';
import {download} from '../export.js';
import {escAttr as esc,openModal} from './press.js';
import {tr,onLanguageChange} from '../i18n.js';

// Shared snapshots never replace the editor document. Auth lives only in this closure.
export function initTeamReview({navigation}){
 const client=createTeamClient(),button=document.createElement('button');
 button.id='btn-team';document.getElementById('btn-connect').after(button);
 const dialog=document.createElement('dialog');dialog.id='team-dialog';dialog.className='workflow-dialog';dialog.setAttribute('aria-labelledby','team-heading');
 dialog.innerHTML='<header><h2 id="team-heading"></h2><button id="team-close" type="button"></button></header><p id="team-error" role="alert"></p><div id="team-body"></div>';
 document.body.append(dialog);const body=dialog.querySelector('#team-body'),error=dialog.querySelector('#team-error');
 let user=null,projects=[],project=null,selected='',enabled=null,busy=false,viewGeneration=0,operation=0;
 const field=(name,label,value='',type='text')=>`<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" maxlength="2000" required></label>`;
 const action=(id,label,disabled=false)=>`<button type="button" id="${id}"${disabled?' disabled':''}>${esc(label)}</button>`;
 const actor=a=>a?.name||a?.id||'';
 function setBusy(value){busy=value;for(const e of body.querySelectorAll('button,input,select,textarea')){if(value){e.dataset.wasDisabled=String(e.disabled);e.disabled=true;}else if(Object.hasOwn(e.dataset,'wasDisabled')){e.disabled=e.dataset.wasDisabled==='true';delete e.dataset.wasDisabled;}}}
 const run=fn=>async event=>{event?.preventDefault();if(busy)return;const current=++operation,isLogin=event?.currentTarget?.id==='team-login',formData=event?.currentTarget?.tagName==='FORM'?new FormData(event.currentTarget):null;error.textContent='';setBusy(true);
  try{await fn(event,formData);}catch(e){if(current===operation&&dialog.open){if(e.status===401||isLogin){disconnect();paint();}error.textContent=e.message;}}finally{if(current===operation)setBusy(false);}
 };
 const revision=()=>project?.revisions.find(r=>r.id===selected);
 async function list(){({projects}=await client.request('/projects'));}
 async function openProject(id){({project}=await client.request('/projects/'+id));selected=project.latestRevisionId;paint();}
 function rememberProject(){const summary={id:project.id,title:project.title,version:project.version,latestRevisionId:project.latestRevisionId,role:project.members[user.id]};projects=[...projects.filter(p=>p.id!==project.id),summary];}
 async function mutate(path,payload){const result=await client.request('/projects/'+project.id+path,{version:project.version,...payload});project=result.project;rememberProject();paint();}
 function disconnect(){operation++;viewGeneration++;client.disconnect();user=null;projects=[];project=null;selected='';busy=false;}
 function paint(){
  const generation=++viewGeneration;button.textContent=tr('Team reviews');dialog.querySelector('#team-heading').textContent=tr('Team reviews');dialog.querySelector('#team-close').textContent=tr('Close');
  if(!user){
   body.innerHTML=enabled===false?`<p>${esc(tr('Shared reviews require an enabled Schematica server. Local review packages remain available in Engineering.'))}</p>`:
    `<p>${esc(tr('Connect with the access token issued by your team operator. Closing this dialog disconnects; the token is never saved in this browser.'))}</p><form id="team-login">${field('token',tr('Team access token'),'','password')}<button>${esc(tr('Connect'))}</button></form>`;
   const form=body.querySelector('form');if(form){form.querySelector('input').autocomplete='off';form.onsubmit=run(async e=>{const input=e.currentTarget.elements.token;const token=input.value;input.value='';client.setToken(token);({user}=await client.request('/me'));await list();paint();});}
   return;
  }
  body.innerHTML=`<p>${esc(tr('Connected as'))} ${esc(user.name)} ${action('team-disconnect',tr('Disconnect'))}</p><p>${esc(tr('Shared review snapshots are separate from your local board. Publishing sends a copy to this server.'))}</p>
   <div class="team-columns"><section><h3>${esc(tr('Review inbox'))}</h3>${action('team-refresh',tr('Refresh'))}<ul>${projects.map(p=>`<li><button type="button" data-project="${esc(p.id)}" aria-current="${p.id===project?.id}">${esc(p.title)}</button> <small>${esc(p.role)}</small></li>`).join('')}</ul>
   <form id="team-create">${field('title',tr('New project title'),navigation.rootDoc().title)}<button>${esc(tr('Create project from local board'))}</button></form></section><section id="team-project"></section></div>`;
  body.querySelector('#team-disconnect').onclick=()=>{disconnect();paint();};
  body.querySelector('#team-refresh').onclick=run(async()=>{await list();if(project)await openProject(project.id);else paint();});
  body.querySelectorAll('[data-project]').forEach(b=>b.onclick=run(()=>openProject(b.dataset.project)));
  body.querySelector('#team-create').onsubmit=run(async (_event,data)=>{const title=data.get('title').trim();const {board}=reviewSnapshot(navigation.rootDoc());({project}=await client.request('/projects',{title,board}));selected=project.latestRevisionId;rememberProject();paint();});
  if(!project)return;
  const panel=body.querySelector('#team-project'),rev=revision(),canEdit=project.members[user.id]==='editor';
  panel.innerHTML=`<h3>${esc(project.title)}</h3><p>${esc(tr('Project version'))}: ${project.version}</p>
   <label>${esc(tr('Review snapshot'))}<select id="team-revision">${project.revisions.map(r=>`<option value="${esc(r.id)}"${r.id===selected?' selected':''}>${esc(r.title||r.id)} · ${esc(r.createdAt)} · ${esc(actor(r.author))}</option>`).join('')}</select></label>
   ${action('team-publish',tr('Publish local board as new revision'),!canEdit)} ${action('team-export',tr('Export shared review'))}
   ${rev?`<p class="team-hash">${esc(tr('Snapshot hash'))}: ${esc(rev.hash)}</p><p id="team-local-state" role="status"></p><div id="team-diagram" class="team-diagram"></div>${action('team-report',tr('Download snapshot review package'))}
   <h4>${esc(tr('Review decisions'))}</h4><ul>${project.reviews.filter(r=>r.revisionId===selected).map(r=>`<li>${esc(actor(r.author))}: ${esc(r.status)} · ${esc(r.createdAt)} ${esc(r.comment||'')}</li>`).join('')}</ul>
   <form id="team-decision"><label>${esc(tr('Decision'))}<select name="status"><option value="changes-requested">${esc(tr('Changes requested'))}</option><option value="approved">${esc(tr('Approved'))}</option></select></label><label>${esc(tr('Review note'))}<textarea name="comment" maxlength="2000"></textarea></label><button${selected!==project.latestRevisionId?' disabled':''}>${esc(tr('Record decision on this revision'))}</button></form>
   ${selected!==project.latestRevisionId?`<p>${esc(tr('This is an older revision. Select the latest revision to record a decision.'))}</p>`:''}
   <h4>${esc(tr('Discussion'))}</h4><ul>${project.comments.filter(c=>c.revisionId===selected).map(c=>`<li><strong>${esc(actor(c.author))}</strong> ${esc(c.target||'')}<p>${esc(c.text)}</p><button type="button" data-comment="${esc(c.id)}" data-resolved="${!!c.resolved}">${esc(c.resolved?tr('Reopen'):tr('Resolve'))}</button></li>`).join('')}</ul>
   <form id="team-comment"><label>${esc(tr('Target item ID (optional)'))}<input name="target" maxlength="200"></label><label>${esc(tr('Comment'))}<textarea name="text" maxlength="2000" required></textarea></label><button>${esc(tr('Add comment to this revision'))}</button></form>`:''}
   ${project.owner===user.id?`<h4>${esc(tr('Project members'))}</h4><ul>${Object.entries(project.members).map(([id,role])=>`<li>${esc(id)} · ${esc(role)}</li>`).join('')}</ul><form id="team-members">${field('userId',tr('Configured user ID'))}<label>${esc(tr('Role'))}<select name="role"><option value="reviewer">${esc(tr('Reviewer'))}</option><option value="editor">${esc(tr('Editor'))}</option><option value="remove">${esc(tr('Remove access'))}</option></select></label><button>${esc(tr('Update member'))}</button></form>`:''}`;
  panel.querySelector('#team-revision').onchange=e=>{selected=e.target.value;paint();};
  panel.querySelector('#team-publish').onclick=run(async()=>{const {board}=reviewSnapshot(navigation.rootDoc());const result=await client.request('/projects/'+project.id+'/revisions',{version:project.version,board,title:board.title});project=result.project;selected=project.latestRevisionId;rememberProject();paint();});
  panel.querySelector('#team-export').onclick=run(async()=>{const data=await client.request('/projects/'+project.id+'/export');download('shared-review.json',JSON.stringify(data,null,2),'application/json');});
  if(rev){
   panel.querySelector('#team-diagram').innerHTML=buildExportSVG(rev.board);
   const svg=panel.querySelector('#team-diagram svg');svg?.setAttribute('role','img');svg?.setAttribute('aria-label',tr('Review snapshot'));
   reviewHash(navigation.rootDoc()).then(hash=>{if(generation!==viewGeneration)return;panel.querySelector('#team-local-state').textContent=hash===rev.hash?tr('Your local board matches this snapshot.'):tr('Your local board differs. Decisions and comments apply only to the selected shared snapshot.');}).catch(()=>{if(generation===viewGeneration)panel.querySelector('#team-local-state').textContent=tr('Your local board differs. Decisions and comments apply only to the selected shared snapshot.');});
   panel.querySelector('#team-report').onclick=()=>download('snapshot-review.html',reviewHTML(rev.board),'text/html');
   panel.querySelector('#team-decision').onsubmit=run((_event,data)=>{return mutate('/reviews',{revisionId:selected,status:data.get('status'),comment:data.get('comment')});});
   panel.querySelector('#team-comment').onsubmit=run((_event,data)=>{return mutate('/comments',{revisionId:selected,text:data.get('text'),target:data.get('target')});});
   panel.querySelectorAll('[data-comment]').forEach(b=>b.onclick=run(()=>mutate('/comments/'+b.dataset.comment,{resolved:b.dataset.resolved!=='true'})));
  }
  panel.querySelector('#team-members')?.addEventListener('submit',run((_event,data)=>{return mutate('/members',{userId:data.get('userId'),role:data.get('role')==='remove'?null:data.get('role')});}));
 }
 const endSession=()=>{disconnect();error.textContent='';body.replaceChildren();button.focus();};
 dialog.querySelector('#team-close').onclick=()=>{endSession();dialog.close();};
 dialog.addEventListener('close',()=>{if(!dialog.open)endSession();});
 button.onclick=async()=>{disconnect();const current=++operation;paint();error.textContent='';openModal(dialog);setBusy(true);try{const result=await client.request('/status',undefined,{publicRequest:true});enabled=result.enabled;paint();body.querySelector('input')?.focus();}catch(e){if(current===operation&&dialog.open){enabled=false;paint();error.textContent=e.message;}}finally{if(current===operation)setBusy(false);}};
 onLanguageChange(()=>{if(!busy)paint();});paint();
 return {disconnect};
}
