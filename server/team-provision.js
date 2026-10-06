import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {open,rename,unlink} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readTeamIdentities} from './team-api.js';
import {privatePath} from './team-store.js';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function provisionTeamIdentity({identitiesFile,credentialFile,id,name,root=ROOT}){
 if(typeof id!=='string'||! /^[A-Za-z0-9_-]{1,80}$/.test(id)||['__proto__','constructor','prototype'].includes(id)||typeof name!=='string'||!name.trim()||name.length>200)throw Error('Use a valid identity ID and name.');
 if(!identitiesFile||!credentialFile||resolve(identitiesFile)===resolve(credentialFile))throw Error('Distinct identity and credential paths are required.');
 await privatePath(dirname(resolve(identitiesFile)),root,{directory:true});await privatePath(dirname(resolve(credentialFile)),root,{directory:true});
 const configPath=resolve(identitiesFile),tokenPath=resolve(credentialFile),lockPath=configPath+'.provision.lock';
 const lock=await open(lockPath,'wx',0o600);const temporary=join(dirname(configPath),`.identity-${randomUUID()}.tmp`);let createdToken=false;
 try{let config={version:1,users:[]};try{await privatePath(configPath,root);config={version:1,users:await readTeamIdentities(configPath)};}catch(e){if(e.code!=='ENOENT')throw e;}if(config.version!==1||!Array.isArray(config.users)||config.users.length>=1000||config.users.some(u=>u.id===id))throw Error('Identity configuration is invalid or ID already exists.');
 const token=randomBytes(32).toString('base64url');const credential=await open(tokenPath,'wx',0o600);createdToken=true;try{await credential.writeFile(token+'\n');await credential.sync();}finally{await credential.close();}
 config.users.push({id,name:name.trim(),tokenHash:createHash('sha256').update(token).digest('hex')});const file=await open(temporary,'wx',0o600);try{await file.writeFile(JSON.stringify(config,null,2)+'\n');await file.sync();}finally{await file.close();}await rename(temporary,configPath);createdToken=false;
 }finally{if(createdToken)await unlink(tokenPath).catch(()=>{});await unlink(temporary).catch(()=>{});await lock.close();await unlink(lockPath);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [identitiesFile,credentialFile,id,name]=process.argv.slice(2);
 try{await provisionTeamIdentity({identitiesFile,credentialFile,id,name});console.log('Identity provisioned. Deliver the private credential file securely and remove it after delivery.');}catch{console.error('Provisioning failed. Check private paths, unique identity ID, file permissions and existing provisioning lock.');process.exitCode=1;}
}
