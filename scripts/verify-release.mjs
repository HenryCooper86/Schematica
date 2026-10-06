#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const hash=data=>createHash('sha256').update(data).digest('hex');
export async function verifySite({base,commit,assets,health=false,revision=false}){
 const root=new URL(base);if(!['https:','http:'].includes(root.protocol)||root.username||root.password||root.search||root.hash)throw Error('Expected a public site base URL.');
 if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Expected a full Git commit.');
 if(!root.pathname.endsWith('/'))root.pathname+='/';
 const checks=[];
 const check=async(path,validate)=>{
  try{const url=new URL(path,root);url.searchParams.set('verify',commit);
   const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('HTTP '+response.status);
   const body=Buffer.from(await response.arrayBuffer());
   if(!validate(body))throw Error('Content does not match expected release.');
   checks.push({path,passed:true});
  }catch(error){checks.push({path,passed:false,error:error.message});}
 };
 if(revision)await check('revision.json',body=>JSON.parse(body).commit===commit);
 if(health)await check('healthz',body=>JSON.parse(body).status==='ok');
 for(const asset of assets)await check(asset.path,body=>hash(body)===asset.sha256);
 return {site:root.href,commit,passed:checks.every(c=>c.passed)&&checks.length>0,checks};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [base,...flags]=process.argv.slice(2);
  if(!base||flags.some(f=>!['--pages','--health'].includes(f)))throw Error('Usage: node scripts/verify-release.mjs BASE_URL [--pages] [--health]');
  const cwd=fileURLToPath(new URL('../',import.meta.url));
  const commit=execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8'}).trim();
  const paths=['index.html','css/style.css','src/render.js','src/ui/change-preview.js','src/interface-workbench.js'];
  // Compare served assets to the committed tree, never to uncommitted local edits.
  const assets=paths.map(path=>({path,sha256:hash(execFileSync('git',['show',commit+':'+path],{cwd}))}));
  const result=await verifySite({base,commit,assets,revision:flags.includes('--pages'),health:flags.includes('--health')});
  console.log(JSON.stringify(result,null,2));process.exitCode=result.passed?0:1;
 }catch(error){console.error(error.message);process.exitCode=2;}
}
