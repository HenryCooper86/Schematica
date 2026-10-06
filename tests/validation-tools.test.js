import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

// Wrong paired timing, silently missing tasks, or accepted critical failures
// would misrepresent measured evidence as a successful pilot.
const study = () => ({version:1,kind:'study',participants:Array.from({length:5},(_,i)=>({
 id:'p'+i,consented:true,date:'2026-10-07',device:'Study laptop',browser:'Browser version',
 taskOrder:i%2?'schematica-first':'baseline-first',baselineTool:'Current diagram tool',
 observations:['create','review','recover','handoff'].flatMap(task=>['baseline','schematica'].map(tool=>({
 task,tool,seconds:tool==='baseline'?100:70,completed:true,helpRequests:0,missedCritical:0,dataLoss:false,evidence:'session-notes.md'
 })))
}))});
async function evaluate(input) {
 const dir=await mkdtemp(join(tmpdir(),'schematica-evidence-'));
 try { const file=join(dir,'results.json');await writeFile(file,JSON.stringify(input));
 const p=spawnSync(process.execPath,['scripts/evaluate-evidence.mjs',file],{encoding:'utf8'});
 return {code:p.status,...JSON.parse(p.stdout)};
 } finally {await rm(dir,{recursive:true,force:true});}
}
test('empty studies remain awaiting participants, never pass',async()=>{
 const r=await evaluate({version:1,kind:'study',participants:[]});
 assert.equal(r.code,2);assert.equal(r.status,'needs-data');
});
test('paired study summary measures review plus handoff and reports critical failures',async()=>{
 const input=study();let r=await evaluate(input);
 assert.equal(r.code,0);assert.equal(r.participants,5);assert.equal(r.medianImprovementPercent,30);
 input.participants[0].observations.find(x=>x.tool==='schematica'&&x.task==='review').missedCritical=1;
 r=await evaluate(input);assert.equal(r.code,1);assert.equal(r.status,'target-not-met');
});
test('unfinished baseline tasks cannot count as a measured speed improvement',async()=>{
 const input=study();input.participants[0].observations.find(x=>x.tool==='baseline'&&x.task==='review').completed=false;
 const r=await evaluate(input);assert.equal(r.code,2);assert.equal(r.status,'needs-data');
 assert.equal(r.medianImprovementPercent,null);
});
test('study refuses missing pairs, duplicate identities and invalid measurements',async()=>{
 for(const mutate of [s=>s.participants[0].observations.pop(),s=>s.participants[1].id='p0',s=>s.participants[0].observations[0].seconds=-1,s=>s.participants[0].consented=false]){
 const s=study();mutate(s);const r=await evaluate(s);assert.equal(r.code,2);assert.equal(r.status,'invalid');
 }
});
test('assistant evidence cannot pass with missing cases or unsupported claims',async()=>{
 const cases=JSON.parse(await import('node:fs/promises').then(fs=>fs.readFile('docs/validation/assistant-cases.json','utf8'))).cases;
 const input={version:1,kind:'assistant',provider:'recorded-test-provider',model:'recorded-model',date:'2026-10-07',results:cases.map(c=>({id:c.id,evidence:'observations.md',passed:true,unsupportedVerifiedClaim:false,corrections:0,seconds:10}))};
 let r=await evaluate(input);assert.equal(r.code,0);assert.equal(r.cases,cases.length);
 input.results[0].unsupportedVerifiedClaim=true;r=await evaluate(input);assert.equal(r.code,1);
 input.results.pop();r=await evaluate(input);assert.equal(r.code,2);
});
test('release verification checks content identity and health, not just HTTP success',async()=>{
 const {verifySite}=await import('../scripts/verify-release.mjs');
 const body='export const x=1;';const sha='a'.repeat(40);
 let stale=false;
 const server=createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 res.setHeader('content-type','application/json');
 res.end(p==='/revision.json'?JSON.stringify({commit:stale?'b'.repeat(40):sha}):p==='/healthz'?' {"status":"ok"} ':stale?'old':body);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {const base=`http://127.0.0.1:${server.address().port}/`;
 const options={base,commit:sha,health:true,revision:true,assets:[{path:'src/render.js',sha256:createHash('sha256').update(body).digest('hex')}]};
 assert.equal((await verifySite(options)).passed,true);
 stale=true;const result=await verifySite(options);assert.equal(result.passed,false);assert.equal(result.checks.filter(x=>!x.passed).length,2);
 } finally {await new Promise(r=>server.close(r));}
});
