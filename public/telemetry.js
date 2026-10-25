import {tokenAreaChart,minuteBarChart} from './telemetry-charts.js';
import {networkDiagram} from './network-diagram.js';
import {cacheSummary,cachePercent} from './cache-usage.js';
import {activeProviders} from './participants.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>Number(v).toLocaleString('zh-CN');
const phaseNames={ground:'规则确认',proposal:'方案提案',challenge:'独立审查',synthesis:'整合修订',vote:'独立表决',dispatch:'分派任务',delivery:'提交交付',review:'验收复核',question:'等待人类'};
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const knownTokens=c=>finite(c.tokens)&&(c.usageKnown===true||c.status==='success'&&c.usageKnown!==false);
export function collectTelemetry(rooms=[]){
  const visible=rooms.filter(r=>!r.deletedAt);
  const calls=visible.flatMap(r=>(r.calls||[]).map(c=>({...c,roomId:r.id,roomTitle:r.title}))).sort((a,b)=>String(a.started||'').localeCompare(String(b.started||'')));
  const known=calls.filter(knownTokens);
  const live=visible.flatMap(r=>(r.calls||[]).filter(c=>c.status==='running'&&r.status==='running').map(c=>({...c,roomId:r.id})));
  const count=(key,status)=>visible.reduce((n,r)=>n+(r[key]||[]).filter(x=>status.includes(x.status)).length,0);
  const providers=Object.fromEntries(['Codex','DeepSeek'].map(actor=>{const own=calls.filter(c=>c.actor===actor),active=live.filter(c=>c.actor===actor);return[actor,{calls:own.length,active:active.length,tokens:own.filter(knownTokens).reduce((n,c)=>n+c.tokens,0),latest:own.at(-1),phase:phaseNames[active.at(-1)?.phase]||active.at(-1)?.phase||''}];}));
  return {calls,live,providers,total:calls.length,tokens:known.reduce((n,c)=>n+c.tokens,0),unknown:calls.length-known.length,processes:count('processes',['starting','running','stopping']),agents:count('agents',['running']),tools:count('toolCalls',['running']),waiting:visible.filter(r=>r.governance?.pending||r.status==='waiting_user').length,cache:cacheSummary(calls),roomCount:visible.length};
}
export function chartSeries(calls,limit=12){
  const start=Math.max(0,calls.length-limit);
  return calls.slice(start).map((c,i)=>({id:c.id,roomId:c.roomId,actor:c.actor,started:c.started,status:c.status,tokens:knownTokens(c)?c.tokens:null,count:start+i+1}));
}
export function resolveLeaderProvider(rooms,collaboration){
  const visible=rooms.filter(r=>!r.deletedAt),room=visible.length===1?visible[0]:visible.find(r=>r.status==='running'&&r.governance?.team);
  if(room){const lead=room.governance?.team?.find(a=>a.lead);return lead?.provider==='DeepSeek'?'DeepSeek':'Codex';}
  const lead=collaboration?.team?.find(a=>a.id===collaboration.leaderId);
  return lead?.provider==='DeepSeek'?'DeepSeek':'Codex';
}
export function telemetryView(rooms,{compact=false,scope='当前会谈',icon=()=>'',collaboration}={}){
  const t=collectTelemetry(rooms),points=chartSeries(t.calls),live=t.live.length>0;
  t.leaderProvider=resolveLeaderProvider(rooms,collaboration);
  const selected=rooms.filter(r=>!r.deletedAt),subject=selected.length===1?selected[0]:selected.find(r=>r.status==='running'&&r.governance?.team);
  t.activeProviders=activeProviders(subject||{collaboration});
  return `<details class="mission-observatory ${compact?'is-compact':''}" data-remember="telemetry-${compact?'overview':'room'}" open><summary><span><i class="telemetry-status ${live?'is-live':''}"></i><b>协作态势</b><small>${esc(scope)}</small></span><span class="telemetry-live-label">${live?t.live.length+' 个模型请求进行中':t.waiting?'等待人的决定':'当前无模型调用'}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></span></summary><div class="observatory-body">${networkDiagram(t,compact,icon)}<div class="telemetry-signals">${tokenAreaChart(points)}${minuteBarChart(t.calls)}<div class="telemetry-chart-caption"><span>点击数据点或柱形查看调用记录 ↗</span></div></div></div><footer class="telemetry-readouts"><span><b>${number(t.total)}</b> 次调用</span><span><b>${number(t.tokens)}</b> 已返回 tokens${t.unknown?`<i title="${t.unknown} 次未返回完整用量">*</i>`:''}</span><span><b>${t.processes}</b> 后台进程</span><span><b>${t.agents}</b> 执行中子代理</span><span class="telemetry-cache">DeepSeek 缓存 <b>${cachePercent(t.cache.actors.DeepSeek.ratio)}</b></span></footer></details>`;
}
let mounted=false;
export function mountTelemetry(open){
  if(mounted)return;mounted=true;
  function select(event){const target=event.target.closest('[data-telemetry-call],[data-telemetry-provider]');if(!target)return;if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;event.preventDefault();open({roomId:target.dataset.telemetryRoom,callId:target.dataset.telemetryCall,provider:target.dataset.telemetryProvider});}
  document.addEventListener('click',select);document.addEventListener('keydown',select);
}
