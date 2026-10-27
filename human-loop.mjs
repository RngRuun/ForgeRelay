import {createHash,randomUUID} from 'node:crypto';
import {validateCollaboration} from './public/collaboration-config.js';
import {HUMAN_DIRECTIONS} from './public/human-directions.js';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const text=(v,max=2000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
export const TEAM_PRESETS=[
  {id:'lead',name:'实施与整合',provider:'Codex',focus:'负责方案、实际实施和整合。独立审查其余角色的证据，不替他人表决。'},
  {id:'research',name:'研究与证据',provider:'DeepSeek',focus:'独立调查、读取资料、比较替代方案。区分已有事实与只能由人补充的信息。'},
  {id:'critic',name:'反方验证',provider:'Codex',focus:'以失败案例、算法边界、可验证性和反证挑战方案。证据充分时认可，不捏造反对。'},
  {id:'constraints',name:'约束审计',provider:'DeepSeek',focus:'检查预算、维护、隐性约束与人的裁决是否得到落实。'},
  {id:'delivery',name:'交付复核',provider:'Codex',focus:'独立检查需求覆盖、验收标准、实际证据和剩余风险。'}
];
export const governed=r=>r.governance?.version===1;
export const voters=r=>governed(r)?r.governance.team:[{id:'Codex',name:'Codex',provider:'Codex'},{id:'DeepSeek',name:'DeepSeek',provider:'DeepSeek'}];
export function createGovernance(input,direction,premises=''){
  if(input===false)return null;
  input=input&&typeof input==='object'?input:{};
  const policy=validateCollaboration(input.team?{...input,minRounds:input.minRounds??3,maxRounds:input.maxRounds===undefined?5:input.maxRounds,highDisagreement:input.highDisagreement??true,informationGaps:input.informationGaps??true,threshold:input.threshold??4,leaderId:input.leaderId||input.team[0]?.id}:undefined);
  const team=policy.team;
  if(!Array.isArray(team)||team.length<3||team.length>5)throw Error('协商团队需要 3–5 个独立角色');
  const ids=new Set();const normalized=team.map((a,i)=>{
    if(!/^[a-z][a-z0-9_-]{0,31}$/.test(a.id)||ids.has(a.id))throw Error('角色 ID 需要唯一，使用字母、数字和短横线');ids.add(a.id);
    if(!['Codex','DeepSeek'].includes(a.provider)||!text(a.name,40)||!text(a.focus,2000))throw Error('角色需要有效的模型来源、名称和职责');
    if(a.model&&!/^[\w.:/-]{1,120}$/.test(a.model))throw Error('角色模型 ID 无效');
    return{id:a.id,name:a.name.trim(),provider:a.provider,focus:a.focus.trim(),model:a.model||'',lead:a.id===policy.leaderId};
  });
  if(typeof premises!=='string'||premises.length>2000)throw Error('前提与隐性约束最多 2000 字');
  const g={...policy,version:1,team:normalized,initial:{direction,premises:premises.trim()},cycle:1,signals:[],pending:null,history:[{id:randomUUID(),action:'INITIAL',text:direction,premises:premises.trim(),time:new Date().toISOString(),revision:1}],directiveHash:''};
  refreshDirectives(g);return g;
}
export function refreshDirectives(g){g.directiveHash=digest({initial:g.initial,history:g.history.map(({id,action,text,premises,choice,directionId,objectionIds})=>({id,action,text,premises,choice,directionId,objectionIds}))});}
export const firstStage=r=>governed(r)?'council:ground:0':'ground_codex';
export const firstVote=r=>governed(r)?'council:vote:0':'vote_codex';
export function resumeStage(r){if(!governed(r))return r.grounded.Codex!==r.rulesHash?'ground_codex':r.grounded.DeepSeek!==r.rulesHash?'ground_deepseek':r.proposal?'challenge_deepseek':'proposal';const i=voters(r).findIndex(a=>r.grounded[a.id]!==r.rulesHash);return i>=0?'council:ground:'+i:r.proposal?'council:challenge:0':'council:proposal:0';}
export function councilTurn(r){const [,phase,index]=r.stage.split(':'),team=voters(r),agent=['proposal','synthesis'].includes(phase)?team.find(a=>a.lead):team[Number(index)];if(!agent)throw Error('协商角色状态无效');return{actor:agent.provider,phase,agent};}
export function advanceCouncil(r){const [,phase,raw]=r.stage.split(':'),i=Number(raw),n=voters(r).length;let boundary=false;
  if(phase==='ground')r.stage=i+1<n?'council:ground:'+(i+1):'council:proposal:0';
  else if(phase==='proposal')r.stage='council:challenge:0';
  else if(phase==='challenge')r.stage=i+1<n?'council:challenge:'+(i+1):'council:synthesis:0';
  else if(phase==='synthesis'){r.roundsSinceInput++;boundary=true;if(r.roundsSinceInput>=r.minRounds&&!r.objections.some(o=>o.status==='open'))r.stage='council:vote:0';else{r.round++;r.stage='council:challenge:0';}}
  else if(phase==='vote')r.stage=i+1<n?'council:vote:'+(i+1):'council:review:0';
  return boundary;
}
export function validateSignals(r,turn,phase,objections=r.objections){if(!governed(r))return;
  if(turn.directiveHash!==r.governance.directiveHash)throw Error('发言必须确认最新人类前提与干预版本 directiveHash');
  if(!Array.isArray(turn.signals)||turn.signals.length>6)throw Error('多代理发言必须返回 signals（最多 6 项）');
  if(phase==='ground'&&turn.signals.length)throw Error('规则确认阶段不能登记分歧或缺口');
  for(const [index,s] of turn.signals.entries()){
    if(!['gap','disagreement'].includes(s.kind)||!text(s.topic,120)||!text(s.detail,2000)||!Number.isInteger(s.impact)||s.impact<1||s.impact>5||!['support','oppose','unknown'].includes(s.position))throw Error('分歧与缺口需要有效主题、依据、影响等级和立场');
    if(s.options.length>3)throw Error(`signals[${index}].options 最多给人三个有效选择，实际 ${s.options.length} 项`);
    const invalidOption=s.options.findIndex(o=>!text(o,200));
    if(invalidOption>=0)throw Error(`signals[${index}].options[${invalidOption}] 必须为 1–200 字的非空选项`);
    const unknown=s.objectionIds.filter(id=>!objections.some(o=>o.id===id));
    if(unknown.length)throw Error(`signals[${index}].objectionIds 引用了不存在的异议：${unknown.join(', ')}；有效 ID：${[...new Set(objections.map(o=>o.id))].join(', ')||'无'}。只能引用已登记或本条 objections 实际提交的异议；没有关联时返回 []，被拒绝输出中的异议未登记`);
  }
  if(turn.question&&!turn.signals.some(s=>s.kind==='gap'&&s.humanOnly&&s.blocking))throw Error('只有阻塞且必须由人补充的信息缺口才可向人提问；其他问题先自行调查或辩论');
}
export function recordSignals(r,agent,turn){if(!governed(r))return;
  const g=r.governance;
  for(const s of turn.signals||[]){let group=g.signals.find(x=>x.revision===r.revision&&x.kind===s.kind&&x.topic.trim().toLocaleLowerCase()===s.topic.trim().toLocaleLowerCase()&&x.status==='open');
    if(!group){group={id:'S'+(g.signals.length+1),kind:s.kind,topic:s.topic.trim(),revision:r.revision,round:r.round,status:'open',entries:[],objectionIds:[]};g.signals.push(group);}
    group.entries=group.entries.filter(e=>e.agentId!==agent.id);group.entries.push({...s,agentId:agent.id,agentName:agent.name,time:new Date().toISOString()});group.objectionIds=[...new Set(group.entries.flatMap(e=>e.objectionIds))];
    if(group.entries.every(e=>!e.blocking)&&(group.kind==='gap'||group.entries.length>1&&new Set(group.entries.map(e=>e.position)).size===1))group.status='resolved';
  }
}
export function triggerWindow(r,boundary=false){if(!governed(r)||r.governance.pending||!['running','unresolved'].includes(r.status))return null;
  const g=r.governance,eligible=g.signals.filter(s=>s.revision===r.revision&&s.status==='open'&&!s.windowSuppressedBy).filter(s=>s.kind==='gap'?g.informationGaps&&s.entries.some(e=>e.blocking&&e.humanOnly):g.highDisagreement&&boundary&&s.entries.some(e=>e.blocking&&e.impact>=g.threshold)&&s.entries.some(e=>e.position==='support')&&s.entries.some(e=>e.position==='oppose'));
  const s=eligible.sort((a,b)=>Math.max(...b.entries.map(e=>e.impact))-Math.max(...a.entries.map(e=>e.impact)))[0];if(!s)return null;
  const options=[...new Set(s.entries.flatMap(e=>e.options))].slice(0,3).map((label,i)=>({id:'option-'+(i+1),label}));
  const short=(value,n)=>value.length>n?value.slice(0,n)+'…':value;
  const sides=['support','oppose'].map(position=>s.entries.find(e=>e.position===position)).filter(Boolean);
  const question=s.kind==='gap'?short(s.entries.find(e=>e.humanOnly)?.detail||s.entries[0].detail,440):sides.map(e=>e.agentName+'：'+short(e.detail,240)).join('\n');
  const pending={id:randomUUID(),status:'open',signalId:s.id,revision:r.revision,round:r.round,kind:s.kind,title:s.topic,question,options,objectionIds:s.objectionIds,created:new Date().toISOString()};
  g.pending=pending;s.windowId=pending.id;r.status='waiting_user';r.reason=s.kind==='gap'?'需要你补充一项 AI 无法取得的信息':'关键分歧需要你的取舍';return pending;
}
export function applyIntervention(r,input){if(!governed(r))throw Error('此会话仍使用旧版双模型流程，请新建自主协商会谈');
  const g=r.governance,w=g.pending;
  if(input.expectedRevision!==r.revision)throw Error('会话版本已变化，请刷新后再提交干预');
  if(!['INJECT','OVERRULE','STEER','REOPEN'].includes(input.action))throw Error('请选择有效的人工介入动作');
  if(input.text!==undefined&&(typeof input.text!=='string'||input.text.length>2000))throw Error('补充说明最多 2000 字');
  if(input.action==='REOPEN'&&(w||['running','pausing','draft'].includes(r.status)))throw Error('先处理当前介入窗口或暂停本轮，再明确另开一轮');
  if(w&&input.windowId!==w.id||!w&&input.windowId)throw Error('介入窗口已变化或已处理，不能重复提交');
  if(!w&&!input.manual)throw Error('当前没有待处理的介入窗口');
  const option=input.optionId?w?.options.find(o=>o.id===input.optionId):null;if(input.optionId&&!option)throw Error('选择不属于当前窗口');
  const direction=input.directionId?HUMAN_DIRECTIONS.find(d=>d.id===input.directionId):null;
  if(input.directionId&&!direction)throw Error('调整方向无效，请重新选择');
  if(direction&&(input.action!=='STEER'||option))throw Error('调整方向应使用 STEER，且不能同时提交窗口取舍');
  const suppliedText=(input.text||'').trim();
  if(!suppliedText&&(!direction&&!option||!['OVERRULE','STEER'].includes(input.action)))throw Error('请选择调整方向或当前窗口的取舍，或补充 1–2000 字说明；补充事实需要填写内容');
  const objectionIds=input.objectionIds||w?.objectionIds||[];
  if(!Array.isArray(objectionIds)||objectionIds.some(id=>!r.objections.some(o=>o.id===id)))throw Error('裁决必须引用已有异议');
  if(input.action==='OVERRULE'&&!w&&!objectionIds.length)throw Error('直接裁决需要指定异议 ID');
  const instruction=direction?.instruction||(!suppliedText&&option?`人选择：${option.label}。此选择是处理方向或价值取舍，不代表未知事实已获证实；保留原有证据与风险。`:'');
  const entry={id:randomUUID(),action:input.action,text:[instruction,suppliedText].filter(Boolean).join('\n补充说明：'),choice:direction?.label||option?.label||'',...(direction?{directionId:direction.id}:{}),windowId:w?.id||null,signalId:w?.signalId||null,objectionIds:input.action==='OVERRULE'?objectionIds:[],time:new Date().toISOString(),revision:r.revision+1,cycle:g.cycle};
  if(input.action==='OVERRULE')for(const id of objectionIds){const o=r.objections.find(o=>o.id===id);if(o.status==='open'){o.status='overruled';o.resolution=entry.text;o.resolvedBy='Human';o.interventionId=entry.id;o.closedAt=entry.time;}}
  if(w){w.status='resolved';w.resolvedBy=entry.id;w.ended=entry.time;const s=g.signals.find(s=>s.id===w.signalId);if(s){s.resolution=entry.text;s.action=entry.action;if(entry.action==='STEER'){s.windowSuppressedBy=entry.id;s.humanDirectionId=direction?.id||'';}else s.status='human_resolved';}(g.windows||=[]).push(w);g.pending=null;}
  // A new human direction does not erase an unresolved blocker from the next snapshot.
  // The chosen window stays dismissed while agents work on it; new topics may still ask for help.
  for(const s of g.signals)if(s.status==='open'&&s.revision===r.revision){s.originalRevision??=s.revision;s.revision=entry.revision;}
  g.history.push(entry);refreshDirectives(g);g.cycle++;return entry;
}
export function stopGovernance(r){if(!governed(r))return;const g=r.governance;if(g.pending){g.pending.status='stopped';(g.windows||=[]).push(g.pending);g.pending=null;}g.history.push({id:randomUUID(),action:'STOP',text:'人明确停止本轮，保留全部未决项。',time:new Date().toISOString(),revision:r.revision});refreshDirectives(g);}
export function governanceSnapshot(r){if(!governed(r))return undefined;const g=r.governance;return{version:g.version,policy:{minRounds:r.minRounds,maxRounds:r.maxRounds,highDisagreement:g.highDisagreement,informationGaps:g.informationGaps,threshold:g.threshold},team:g.team,initial:g.initial,directiveHash:g.directiveHash,cycle:g.cycle,interventions:g.history,signals:g.signals.filter(s=>s.status==='open'&&s.revision===r.revision),priority:'人的 INITIAL、INJECT、OVERRULE、STEER 是当前任务的约束。最新有效干预优先；不能把人的价值裁决宣称为 AI 一致，也不能编造技术事实。STEER 可以仅选择方向而不补充信息：必须落实所选方向，保留未知和开放异议，按原 topic 更新核验结果或新范围下不再阻塞的依据；不得以换名重报同一缺口迫使人补充。发现新的具体风险仍可登记。'};}
export function decisionReview(r){if(!governed(r))return null;
 if(r.conversation?.version===1&&!r.proposal&&!r.objections.length&&!r.calls.some(c=>['proposal','challenge','synthesis','vote'].includes(c.phase)))return null;
 const votes=voters(r).map(a=>{const v=r.votes[a.id],valid=v&&v.hash===r.proposal?.hash&&v.revision===r.revision&&v.rulesHash===r.rulesHash&&v.directiveHash===r.governance.directiveHash&&r.calls.some(c=>c.id===v.callId&&c.agentId===a.id&&c.status==='success');return{agentId:a.id,name:a.name,provider:a.provider,stance:valid?v.stance:'undecided'};});
 const unresolved=[...r.objections.filter(o=>o.status==='open').map(o=>({id:o.id,title:o.title,detail:o.reason,kind:'objection'})),...r.governance.signals.filter(s=>s.status==='open').map(s=>({id:s.id,title:s.topic,detail:s.entries.map(e=>e.detail).join('\n'),kind:s.kind,revision:s.revision})),...(r.workItems||[]).filter(t=>!['accepted','cancelled'].includes(t.status)).map(t=>({id:t.id,title:t.title+' · '+t.status,detail:'实际派工尚未完成独立验收。',kind:'delivery'}))];
 if(['unresolved','failed','stopped','interrupted'].includes(r.status)){for(const v of votes.filter(v=>v.stance!=='agree'))unresolved.push({id:'vote:'+v.agentId,title:v.name+' 尚未有效同意',detail:'独立表决未完成或未同意，不能将缺失表态当作同意。',kind:'vote'});if(r.reason)unresolved.push({id:'boundary',title:'本轮停止边界',detail:r.reason,kind:'boundary'});}
 return{status:r.status,decision:r.proposal?.text||'',proposalHash:r.proposal?.hash||'',directiveHash:r.governance.directiveHash,interventions:r.governance.history,unresolved,votes,rounds:r.roundsSinceInput,calls:r.calls.length};}

export function governanceReport(r){const review=decisionReview(r);if(!review)return'';return['## 人类介入记录',...review.interventions.map(h=>`- ${h.action} · v${h.revision} · ${h.time}\n  ${h.text}${h.premises?'\n  隐性前提：'+h.premises:''}${h.choice?'\n  选择：'+h.choice:''}`),'','## 未决悬空项',...(review.unresolved.length?review.unresolved.map(s=>`- ${s.id} · ${s.title}\n  ${s.detail}`):['没有已登记的未决项；这不代替实际验收。']),'','## 独立角色表决',...review.votes.map(v=>`- ${v.name} · ${v.provider}：${v.stance}`),'',`人类约束 SHA-256：${review.directiveHash}`].join('\n');}
