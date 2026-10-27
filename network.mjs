import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {EnvHttpProxyAgent,fetch as proxiedFetch} from 'undici';
import policy from './network-policy.cjs';
export const {proxyURL,systemProxy,proxyEnvironment}=policy;
export const validateNetworkSettings=policy.settings;
export function windowsSystemProxy(){
  if(process.platform!=='win32')return'';
  const command="$v=Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';if($v.ProxyEnable -eq 1){[pscustomobject]@{proxy=$v.ProxyServer}|ConvertTo-Json -Compress}";
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:4000});
  try{const raw=JSON.parse(result.stdout).proxy;if(raw.includes('=')){const entry=raw.split(';').find(item=>item.startsWith('https='))||raw.split(';').find(item=>item.startsWith('http='));return entry?proxyURL(entry.slice(entry.indexOf('=')+1)):'';}return proxyURL(raw);}catch{return'';}
}
export class NetworkSettings{
  constructor(dir,{env=process.env,detected=env.FORGERELAY_SYSTEM_PROXY??windowsSystemProxy(),request=proxiedFetch}={}){this.file=path.join(dir,'network.json');this.env=env;this.detected=detected;this.request=request;this.agents=new Map();let value={};try{value=JSON.parse(fs.readFileSync(this.file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('本机网络配置无法读取，请检查 network.json');}this.value=policy.settings(value);}
  effective(){return proxyEnvironment(this.env,this.value,this.detected);}
  public(){const effective=this.effective();return{...this.value,source:effective.source,proxyHost:effective.host,systemAvailable:!!this.detected,networkChecked:false};}
  update(input){const next=policy.settings({...this.value,...input});fs.writeFileSync(this.file+'.tmp',JSON.stringify(next,null,2));fs.renameSync(this.file+'.tmp',this.file);this.value=next;return this.public();}
  async fetch(url,options={}){const effective=this.effective(),key=JSON.stringify([effective.httpProxy,effective.httpsProxy,effective.noProxy]);let dispatcher=this.agents.get(key);if(!dispatcher){dispatcher=new EnvHttpProxyAgent({httpProxy:effective.httpProxy,httpsProxy:effective.httpsProxy,noProxy:effective.noProxy});this.agents.set(key,dispatcher);}return this.request(url,{...options,dispatcher});}
  async probe({url='https://chatgpt.com/',timeout=8000}={}){const start=Date.now();try{const response=await this.fetch(url,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(timeout)});await response.body?.cancel();return{checked:true,reachable:true,status:response.status,elapsedMs:Date.now()-start,message:'网络端点可达；这不代表模型权限或推理已经验证。'};}catch(error){return{checked:true,reachable:false,elapsedMs:Date.now()-start,message:'网络端点未在时限内响应，请检查系统/自定义代理。',code:error.cause?.code||error.code||'NETWORK_ERROR'};}}
  async close(){await Promise.allSettled([...this.agents.values()].map(agent=>agent.destroy()));this.agents.clear();}
}
