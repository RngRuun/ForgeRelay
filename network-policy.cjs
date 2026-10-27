'use strict';
function proxyURL(value){
  if(typeof value!=='string'||!value.trim())return'';
  if(value.length>1000||/[\r\n\0]/.test(value))throw Error('代理地址格式无效');
  const url=new URL(value.includes('://')?value:'http://'+value);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('代理仅支持无用户名密码的 HTTP(S) 主机与端口');
  return url.origin;
}
function systemProxy(value){const text=String(value||'').trim();for(const part of text.split(';')){const item=part.trim();if(/^DIRECT$/i.test(item))return'';const match=item.match(/^(PROXY|HTTPS)\s+(.+)$/i);if(match)return proxyURL((match[1].toUpperCase()==='HTTPS'?'https://':'http://')+match[2].trim());}return proxyURL(text);}
function settings(value={}){
  const mode=value.mode??'system';if(!['system','custom','direct'].includes(mode))throw Error('代理模式为 system/custom/direct');
  const url=proxyURL(value.url||'');if(mode==='custom'&&!url)throw Error('请填写代理主机和端口');
  const callTimeoutSeconds=value.callTimeoutSeconds??900,idleTimeoutSeconds=value.idleTimeoutSeconds??0;
  if(!Number.isInteger(callTimeoutSeconds)||callTimeoutSeconds<30||callTimeoutSeconds>3600||!Number.isInteger(idleTimeoutSeconds)||idleTimeoutSeconds<0||idleTimeoutSeconds>3600)throw Error('调用超时为 30–3600 秒，无事件超时为 0–3600 秒（0 表示关闭）');
  return{mode,url,callTimeoutSeconds,idleTimeoutSeconds};
}
function proxyEnvironment(base,input={},detected=''){
  const config=settings(input),env={...base},read=name=>base[name.toLowerCase()]||base[name]||'';
  const explicit=read('HTTPS_PROXY')||read('ALL_PROXY')||read('HTTP_PROXY');
  const url=config.mode==='direct'?'':config.mode==='custom'?config.url:explicit||systemProxy(detected);
  const httpProxy=config.mode==='system'&&explicit?(read('HTTP_PROXY')||read('ALL_PROXY')||url):url;
  const httpsProxy=config.mode==='system'&&explicit?(read('HTTPS_PROXY')||read('ALL_PROXY')||url):url;
  const source=config.mode==='direct'?'direct':config.mode==='custom'?'custom':explicit?'environment':url?'system':'direct';
  const noProxy=[read('NO_PROXY'),'localhost','127.0.0.1','::1','[::1]'].filter(Boolean).join(',');
  for(const name of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY']){delete env[name];delete env[name.toLowerCase()];}
  if(url){env.HTTP_PROXY=httpProxy;env.HTTPS_PROXY=httpsProxy;env.ALL_PROXY=config.mode==='system'?(read('ALL_PROXY')||url):url;}
  env.NO_PROXY=config.mode==='direct'?'*':noProxy;
  return{env,proxy:url,httpProxy,httpsProxy,source,mode:config.mode,host:url?new URL(url).host:'',noProxy:env.NO_PROXY};
}
module.exports={proxyURL,systemProxy,settings,proxyEnvironment};
