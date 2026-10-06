#!/usr/bin/env node
// Summarize observations supplied by a human; never generate study/model results.
import {readFile} from 'node:fs/promises';
const tasks=['create','review','recover','handoff'];
const median=values=>{const s=[...values].sort((a,b)=>a-b),i=Math.floor(s.length/2);return s.length%2?s[i]:(s[i-1]+s[i])/2;};
function requireValue(ok,message){if(!ok)throw Error(message);}
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=2000;
const natural=v=>Number.isSafeInteger(v)&&v>=0;
function unique(rows){const ids=new Set();for(const row of rows){requireValue(text(row.id)&&!ids.has(row.id),'Missing or duplicate identity.');ids.add(row.id);}}
function summarizeStudy(input){
 requireValue(Array.isArray(input.participants),'participants must be an array.');
 if(!input.participants.length)return {status:'needs-data',participants:0,reason:'No participant observations supplied.'};
 unique(input.participants);const people=[];
 for(const p of input.participants){
  requireValue(p.consented===true&&[p.date,p.device,p.browser,p.baselineTool].every(text)&&['baseline-first','schematica-first'].includes(p.taskOrder),'Participant consent, date, device, browser, baseline tool and task order are required.');
  requireValue(Array.isArray(p.observations)&&p.observations.length===8,'Each participant needs four tasks in each tool.');
  const seen=new Set();
  for(const o of p.observations){
   const key=o.task+':'+o.tool;
   requireValue(tasks.includes(o.task)&&['baseline','schematica'].includes(o.tool)&&!seen.has(key),'Unknown or duplicated task/tool.');seen.add(key);
   requireValue(Number.isFinite(o.seconds)&&o.seconds>0&&o.seconds<=86400&&typeof o.completed==='boolean'&&natural(o.helpRequests)&&natural(o.missedCritical)&&typeof o.dataLoss==='boolean'&&text(o.evidence),'Invalid observation or missing evidence reference.');
  }
  const time=tool=>p.observations.filter(o=>o.tool===tool&&['review','handoff'].includes(o.task)).reduce((n,o)=>n+o.seconds,0);
  const own=p.observations.filter(o=>o.tool==='schematica');
  const baselineComplete=p.observations.filter(o=>o.tool==='baseline').every(o=>o.completed);
  people.push({id:p.id,baselineComplete,improvementPercent:baselineComplete?(time('baseline')-time('schematica'))/time('baseline')*100:null,completed:own.every(o=>o.completed),missedCritical:own.reduce((n,o)=>n+o.missedCritical,0),dataLoss:own.some(o=>o.dataLoss),helpRequests:own.reduce((n,o)=>n+o.helpRequests,0)});
 }
 const paired=people.every(p=>p.baselineComplete);
 const improvement=paired?median(people.map(p=>p.improvementPercent)):null;
 const enough=people.length>=5&&paired,passed=enough&&improvement>=20&&people.every(p=>p.completed&&!p.dataLoss&&!p.missedCritical);
 return {status:!enough?'needs-data':passed?'target-met':'target-not-met',participants:people.length,medianImprovementPercent:improvement===null?null:Math.round(improvement*100)/100,people,limitation:'Recorded observations are not independently verified; this exploratory pilot is not a market-wide ranking.'};
}
async function summarizeAssistant(input){
 requireValue([input.provider,input.model,input.date].every(text),'Provider, model and date are required.');
 requireValue(Array.isArray(input.results),'results must be an array.');
 if(!input.results.length)return {status:'needs-data',cases:0,reason:'No live-provider observations supplied.'};
 const {cases}=JSON.parse(await readFile(new URL('../docs/validation/assistant-cases.json',import.meta.url),'utf8'));
 unique(input.results);requireValue(input.results.length===cases.length&&input.results.every(r=>cases.some(c=>c.id===r.id)),'Every defined case must have exactly one result.');
 for(const r of input.results)requireValue(text(r.evidence)&&typeof r.passed==='boolean'&&typeof r.unsupportedVerifiedClaim==='boolean'&&natural(r.corrections)&&Number.isFinite(r.seconds)&&r.seconds>0,'Invalid case observation or missing evidence reference.');
 return {status:input.results.every(r=>r.passed&&!r.unsupportedVerifiedClaim)?'target-met':'target-not-met',provider:input.provider,model:input.model,cases:input.results.length,passed:input.results.filter(r=>r.passed&&!r.unsupportedVerifiedClaim).length,corrections:input.results.reduce((n,r)=>n+r.corrections,0),limitation:'This summarizes supplied observations, not an independent evaluation of provider output.'};
}
try{
 requireValue(process.argv.length===3,'Usage: node scripts/evaluate-evidence.mjs results.json');
 const data=await readFile(process.argv[2]);requireValue(data.length<=2*1024*1024,'Evidence file exceeds 2 MiB.');
 const input=JSON.parse(data);requireValue(input&&input.version===1,'Expected evidence version 1.');
 requireValue(['study','assistant'].includes(input.kind),'Expected kind study or assistant.');
 const result=input.kind==='study'?summarizeStudy(input):await summarizeAssistant(input);
 console.log(JSON.stringify({version:1,kind:input.kind,...result},null,2));
 process.exitCode=result.status==='target-met'?0:result.status==='target-not-met'?1:2;
}catch(error){console.log(JSON.stringify({version:1,status:'invalid',error:error.message}));process.exitCode=2;}
