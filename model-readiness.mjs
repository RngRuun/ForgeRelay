import {activeProviders,participantTeam} from './public/participants.js';
export function createReadinessProbe(check,{ttl=60000,now=Date.now}={}){
  let cached=null,expires=0,inflight=null;
  return async({force=false}={})=>{
    if(!force&&cached&&now()<expires)return cached;
    if(inflight)return inflight;
    inflight=Promise.resolve().then(check).then(value=>{cached=value.authenticated?value:null;expires=now()+ttl;return value;}).finally(()=>inflight=null);
    return inflight;
  };
}
export function modelRequirements(profile,subject=profile){
  const providers=activeProviders(subject),roles=participantTeam(subject);
  const models=providers.includes('DeepSeek')?[...new Set(roles?.length?roles.filter(a=>a.provider==='DeepSeek').map(a=>a.model||profile?.settings?.deepseek?.model).filter(Boolean):[profile?.settings?.deepseek?.model].filter(Boolean))]:[];
  return {providers,models};
}
export async function verifyParticipants(profile,subject,{checkCodex,checkDeepseek,hasDeepseekKey}){
  const requirements=modelRequirements(profile,subject);
  if(requirements.providers.includes('Codex')){
    const status=await checkCodex();
    if(!status.authenticated)throw Error('参与团队的 Codex CLI 尚未登录，请先运行 codex login');
  }
  if(requirements.providers.includes('DeepSeek')){
    if(!hasDeepseekKey)throw Error('参与团队包含 DeepSeek，请先在接入设置或 CLI /key 中填写 DeepSeek API Key');
    const status=await checkDeepseek(requirements.models);
    if(!requirements.models.length||requirements.models.some(model=>!status.models?.includes(model)))throw Error(`DeepSeek 接入校验未通过：${status.message}`);
  }
}
