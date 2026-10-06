import {tr} from './i18n.js';
export function createTeamClient({baseUrl='/api/team',fetchImpl=globalThis.fetch}={}){
 let token='',generation=0;const pending=new Set();
 function disconnect(){token='';generation++;for(const c of pending)c.abort();pending.clear();}
 return {
  get connected(){return !!token;},
  disconnect,
  setToken(value){disconnect();if(typeof value!=='string'||!value.trim()||/[\r\n]/.test(value))throw Error(tr('Enter a team access token.'));token=value.trim();},
  async request(path,body,{publicRequest=false}={}){
   if(!publicRequest&&!token)throw Error(tr('Connect to team reviews first.'));
   if(!/^\/[a-zA-Z0-9/_-]*$/.test(path))throw Error(tr('Invalid team request.'));
   const session=generation,controller=new AbortController();pending.add(controller);
   try{
    const response=await fetchImpl(baseUrl+path,{method:body===undefined?'GET':'POST',credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]),headers:{'x-schematica-client':'1',...(!publicRequest?{authorization:'Bearer '+token}:{}),...(body!==undefined?{'content-type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    const result=await response.json().catch(()=>null);
    if(session!==generation)throw Error(tr('The team session ended. Connect again.'));
    if(!response.ok||!result)throw Object.assign(Error(result?.error?.message||tr('Team reviews are unavailable on this server.')),{status:response.status});
    return result;
   }finally{pending.delete(controller);}
  },
 };
}
