import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DiscussionHub,validateTurn,discussionReport,consensusProblems} from '../discussion.mjs';
import {defaultSettings,validateSettings} from '../model-settings.mjs';
import {defaultCollaboration,ROLE_PRESETS} from '../public/collaboration-config.js';
import {executionInput} from '../execution-context.mjs';
import {humanControl,reviewView} from '../public/human-loop-ui.js';
function fixture(t,{policy={},answer}={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-human-loop-')),settings=defaultSettings();settings.collaboration={...defaultCollaboration(),minRounds:1,maxRounds:1,...policy};let hub;const sent=[];
 const adapter=provider=>async args=>{const r=hub.rooms[0],phase=r.activity.phase,agent=r.governance.team.find(a=>a.id===r.activity.agentId);const turn={rulesHash:r.rulesHash,revision:r.revision,proposalHash:r.proposal?.hash||'',directiveHash:r.governance.directiveHash,acknowledged:true,summary:'独立核对当前前提、实际证据和方案，保留未知，不替其他角色表决。',analysis:['challenge','synthesis'].includes(phase)?[{topic:'边界检查',position:'依据当前约束独立核对',evidence:'自动测试固定证据',alternative:'有限范围的替代设计'}]:[],objections:[],replies:[],close:[],proposal:phase==='proposal'?'完整规范方案：依据人的前提与隐性约束，逐项核对事实、风险和验收证据，再进行独立表决。':'',stance:phase==='vote'?'agree':'undecided',question:'',signals:[]};
  sent.push({provider,agent:agent.id,phase,task:args.task,prompt:args.prompt,system:args.system});await answer?.({r,phase,agent,turn,args});args.onUsage?.({input_tokens:100,output_tokens:10,cached_input_tokens:50});args.onTrace?.('fixture-'+sent.length);return JSON.stringify(turn);};
 hub=new DiscussionHub({dir,getModelProfile:()=>({name:'fixture',hash:'profile-fixture',settings:structuredClone(settings)}),codex:adapter('Codex'),deepseek:adapter('DeepSeek')});
 t.after(async()=>{await hub.shutdown();const full=fs.realpathSync(dir);assert.ok(full.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'relay-human-loop-'));fs.rmSync(full,{recursive:true,force:true});});
 const r=hub.create({direction:'测试人类定义前提、独立互审和精准干预的实际状态机',initialPremises:'预算不可增加，资料只保存在本地。',governance:true});return{hub,r,sent,settings};
}
async function run(hub,r){await hub.start(r.id);await hub.live.get(r.id)?.promise;}
const signal=(kind,position='unknown',extra={})=>({kind,topic:kind==='gap'?'客户的未公开期限':'本地与云端取舍',detail:'这是影响当前决策的具体条件，需要核对后才能继续。',impact:5,blocking:true,humanOnly:kind==='gap',position,options:['仅本地，接受较慢速度','使用云端，增加运维成本'],objectionIds:[],...extra});
test('三至五个独立角色真实进入调度，DeepSeek 可主持提案，逐一独立表决同一约束',async t=>{
 for(const count of [3,5]){const {hub,r,sent}=fixture(t,{policy:{team:ROLE_PRESETS.slice(0,count),leaderId:'research'}});await run(hub,r);assert.equal(r.status,'consensus',r.reason);assert.equal(sent.length,count+1+count+1+count);assert.equal(sent.find(x=>x.phase==='proposal').provider,'DeepSeek');assert.equal(Object.keys(r.votes).length,count);assert.deepEqual(consensusProblems(r),[]);assert.equal(sent.filter(x=>x.phase==='vote').length,count);for(const c of sent.filter(x=>x.phase==='vote'))assert.ok(!c.prompt.includes('"stance":"agree"'));assert.ok(r.review.interventions.some(h=>h.action==='INITIAL'));}
});
test('全 Codex 或全 DeepSeek 角色分别 Grounding、互审和投票，不强制另一供应商参加',async t=>{
 for(const provider of ['Codex','DeepSeek']){
  const team=ROLE_PRESETS.slice(0,3).map(a=>({...a,provider})),{hub,r,sent}=fixture(t,{policy:{team,leaderId:'research'}}),checks=[];
  hub.ready=async(profile,subject)=>checks.push(subject.governance.team.map(a=>a.provider));await run(hub,r);
  assert.equal(r.status,'consensus',r.reason);assert.ok(sent.length>0&&sent.every(s=>s.provider===provider));assert.equal(Object.keys(r.votes).length,3);assert.deepEqual(consensusProblems(r),[]);assert.deepEqual(checks,[[provider,provider,provider]]);assert.ok(sent.every(s=>(s.system||s.prompt).includes('本会谈实际参加的模型：'+provider)));
 }
});
test('只有明确的人类专属阻塞缺口立即打开窗口，INJECT 只处理一次并作废旧票',async t=>{
 const {hub,r}=fixture(t,{answer:({r,phase,agent,turn})=>{if(r.revision===1&&phase==='challenge'&&agent.id==='research'){turn.signals=[signal('gap')];turn.question='客户实际期限是哪一天？';}}});await run(hub,r);assert.equal(r.status,'waiting_user');const w=r.governance.pending,oldHash=r.governance.directiveHash;assert.equal(w.kind,'gap');await assert.rejects(hub.start(r.id),/介入窗口/);
 r.votes.lead={stance:'agree'};await hub.intervene(r.id,{action:'INJECT',text:'客户真实期限为月底，不能改变这个日期。',expectedRevision:1,windowId:w.id});assert.equal(r.revision,2);assert.deepEqual(r.votes,{});assert.notEqual(r.governance.directiveHash,oldHash);assert.equal(r.governance.pending,null);await assert.rejects(hub.intervene(r.id,{action:'INJECT',text:'重复提交不应生效',expectedRevision:1,windowId:w.id}),/版本已变化/);await run(hub,r);assert.equal(r.status,'consensus',r.reason);assert.ok(discussionReport(r).includes('人类介入记录'));assert.ok(discussionReport(r).includes('INJECT'));
});
test('不同角色的高影响相反立场在完整互审后才触发；关闭开关时保留到上限',async t=>{
 const answer=({phase,agent,turn})=>{if(phase==='challenge'&&agent.id==='research')turn.signals=[signal('disagreement','support')];if(phase==='challenge'&&agent.id==='critic')turn.signals=[signal('disagreement','oppose')];};
 const on=fixture(t,{answer});await run(on.hub,on.r);assert.equal(on.r.status,'waiting_user');assert.equal(on.r.roundsSinceInput,1);assert.equal(on.r.governance.pending.kind,'disagreement');assert.ok(on.sent.some(s=>s.phase==='synthesis'));
 const off=fixture(t,{policy:{highDisagreement:false},answer});await run(off.hub,off.r);assert.equal(off.r.status,'unresolved');assert.equal(off.r.governance.pending,null);assert.ok(off.r.review.unresolved.some(x=>x.kind==='disagreement'));
});
test('低影响分歧、同立场和 AI 可调查缺口不会打开人类窗口',async t=>{
 const {hub,r}=fixture(t,{answer:({phase,agent,turn})=>{if(phase==='challenge'){turn.signals=[signal('disagreement',agent.id==='critic'?'oppose':'support',{impact:2,blocking:false}),signal('gap','unknown',{humanOnly:false,blocking:false})];}}});await run(hub,r);assert.equal(r.status,'consensus',r.reason);assert.equal(r.governance.pending,null);
});
test('OVERRULE 留下人类裁决状态，不冒充异议提出者认可；过时哈希不能进入共识',async t=>{
 const {hub,r}=fixture(t,{answer:({phase,agent,turn})=>{if(phase==='proposal')turn.objections=[{title:'关键取舍未决定',reason:'真实约束存在冲突',change:'人明确说明优先级',evidence:'测试约束'}];if(phase==='challenge'&&agent.id==='research')turn.signals=[signal('disagreement','support',{objectionIds:['O1']})];if(phase==='challenge'&&agent.id==='critic')turn.signals=[signal('disagreement','oppose',{objectionIds:['O1']})];}});await run(hub,r);const old=r.governance.directiveHash,w=r.governance.pending;await hub.intervene(r.id,{action:'OVERRULE',text:'本地优先，接受性能下降，保留技术风险。',optionId:'option-1',expectedRevision:1,windowId:w.id});assert.equal(r.objections[0].status,'overruled');assert.equal(r.objections[0].resolvedBy,'Human');assert.equal(r.governance.history.at(-1).choice,'仅本地，接受较慢速度');
 const bad={rulesHash:r.rulesHash,revision:r.revision,proposalHash:r.proposal.hash,directiveHash:old,acknowledged:true,summary:'这是具有充分文字说明的旧版本表决。',analysis:[],objections:[],replies:[],close:[],proposal:'',stance:'agree',question:'',signals:[]};assert.throws(()=>validateTurn(r,'Codex','vote',bad,r,r.governance.team[0]),/directiveHash/);assert.ok(consensusProblems(r).length>0);
});
test('人正在调用期间 STEER，旧回复即使返回也不能覆盖新方向',async t=>{
 let release,entered;const ready=new Promise(resolve=>entered=resolve);const {hub,r}=fixture(t,{answer:async({phase,turn,args})=>{if(phase==='proposal'&&r.revision===1){entered();await new Promise(resolve=>{release=resolve;args.signal.addEventListener('abort',resolve,{once:true});});turn.proposal='旧方向的完整提案文本，即使返回，也不得覆盖人的新范围和新的限制。';}}});await hub.start(r.id);await ready;const prior=r.governance.directiveHash;await hub.intervene(r.id,{action:'STEER',text:'只做本地只读验证，不实施写入。',expectedRevision:1,manual:true});release?.();assert.equal(r.revision,2);assert.equal(r.proposal,null);assert.equal(r.status,'paused');assert.notEqual(r.governance.directiveHash,prior);assert.ok(r.messages.some(m=>m.stale));
});
test('实验室设置快照固定；角色模型覆盖进入适配器；更新配置保留人工记录并重新 Grounding',async t=>{
 const policy=defaultCollaboration();policy.team[1].model='fixture-custom-model';const {hub,r,sent,settings}=fixture(t,{policy:{...policy,minRounds:1,maxRounds:1}});settings.collaboration.team[1].focus='全局后续修改';assert.notEqual(r.governance.team[1].focus,settings.collaboration.team[1].focus);await run(hub,r);assert.equal(sent.find(s=>s.agent==='research').task.modelProfile.settings.deepseek.model,'fixture-custom-model');const history=structuredClone(r.governance.history);const profile={name:'新的设置',hash:'new-profile',settings:defaultSettings()};profile.settings.collaboration.leaderId='research';hub.setProfile(r.id,profile);assert.equal(r.governance.team.find(a=>a.lead).provider,'DeepSeek');assert.deepEqual(r.governance.history,history);assert.deepEqual(r.votes,{});assert.equal(r.stage,'council:ground:0');assert.equal(r.minRounds,3);
});
test('STOP 与 REOPEN 保存悬空项且不增加调用预算；执行交接带上前提和裁决',async t=>{
 const {hub,r}=fixture(t,{answer:({phase,agent,turn})=>{if(phase==='challenge'&&agent.id==='research')turn.signals=[signal('gap')];}});await run(hub,r);const calls=r.calls.length,budget=r.maxCalls;hub.stop(r.id);assert.equal(r.status,'stopped');assert.ok(r.review.unresolved.length);const before=r.governance.history.length;hub.stop(r.id);assert.equal(r.governance.history.length,before);await hub.intervene(r.id,{action:'REOPEN',text:'明确再开一轮，保留原来的约束，核对未决项。',expectedRevision:r.revision,manual:true});assert.equal(r.maxRounds,1);assert.equal(r.minRounds,1);assert.equal(r.maxCalls,budget);assert.equal(r.calls.length,calls);const input=executionInput(r);assert.ok(input.prompt.includes('资料只保存在本地'));assert.equal(input.sourceDiscussion.governance.directiveHash,r.governance.directiveHash);
});
test('实验室拒绝无效团队、轮数和主持人；页面转义人工与 AI 文本',()=>{
 const settings=defaultSettings();settings.collaboration.maxRounds=0;assert.throws(()=>validateSettings(settings),/互审轮数/);settings.collaboration=defaultCollaboration();settings.collaboration.leaderId='missing';assert.throws(()=>validateSettings(settings),/主持人/);
 const room={revision:1,governance:{pending:{id:'w',kind:'gap',title:'<img src=x onerror=alert(1)>',question:'<script>x</script>',options:[],objectionIds:[]}},review:{decision:'<script>x</script>',interventions:[],unresolved:[],votes:[]},calls:[],maxCalls:20,tokens:0,tokenBudget:1000,status:'unresolved'};assert.ok(!humanControl(room).includes('<script>'));assert.ok(humanControl(room).includes('&lt;img'));assert.ok(!reviewView(room).includes('<script>'));
});
test('关闭信息缺口介入不假装缺口已解决，也不能绕过实验室的轮次快照',async t=>{
 const {hub,r}=fixture(t,{policy:{informationGaps:false},answer:({phase,agent,turn})=>{if(phase==='challenge'&&agent.id==='research')turn.signals=[signal('gap')];}});await run(hub,r);assert.equal(r.status,'unresolved');assert.equal(r.governance.pending,null);assert.ok(r.review.unresolved.some(s=>s.kind==='gap'));assert.throws(()=>hub.create({direction:'不允许在创建时悄悄绕过实验室设置',governance:true,minRounds:9,maxRounds:9}),/模型实验室/);
});
test('同供应商的不同角色不能互相关闭异议或复制投票冒充独立同意',async t=>{
 const {hub,r}=fixture(t);await run(hub,r);r.votes.critic={...r.votes.lead};assert.ok(consensusProblems(r).some(x=>x.includes('反方验证')));r.objections.push({id:'O1',actor:'Codex',agentId:'lead',status:'open'});
 const turn={rulesHash:r.rulesHash,revision:r.revision,proposalHash:r.proposal.hash,directiveHash:r.governance.directiveHash,acknowledged:true,summary:'独立审查当前具体问题及证据，不代替其他角色认可。',analysis:[{topic:'审查',position:'核对证据',evidence:'fixture',alternative:'缩小范围'}],objections:[],replies:[],close:[{objectionId:'O1',reason:'试图代替另一角色关闭，这个动作必须被程序拒绝。'}],proposal:'',stance:'undecided',question:'',signals:[]};assert.throws(()=>validateTurn(r,'Codex','challenge',turn,r,r.governance.team.find(a=>a.id==='critic')),/只有异议提出者/);
});
test('显式从实验室升级旧会谈保留原人类消息、异议和交付，不自动调用模型',t=>{
 const {hub}=fixture(t),old=hub.create({direction:'旧会谈的方向和隐性条件必须保留'});hub.message(old.id,'这是旧会谈中人明确补充的本地优先约束。');old.objections.push({id:'O1',actor:'DeepSeek',status:'open',title:'旧异议',reason:'旧证据',replies:[]});old.workItems.push({id:'old-task',status:'accepted',title:'已有交付'});const history=structuredClone({human:old.human,objections:old.objections,workItems:old.workItems});hub.setProfile(old.id,{name:'新版协商',hash:'new',settings:defaultSettings()},{upgradeWorkflow:true});assert.equal(old.governance.team.length,3);assert.equal(old.stage,'council:ground:0');assert.deepEqual({human:old.human,objections:old.objections,workItems:old.workItems},history);assert.ok(old.governance.history.some(h=>h.text.includes('本地优先约束')));assert.equal(old.calls.length,0);assert.deepEqual(old.votes,{});
});
test('独立表决出现新信号立即作废本组票，不把当前投票信号透露给后续投票者',async t=>{
 const {hub,r,sent}=fixture(t,{answer:({phase,agent,turn})=>{if(phase==='vote'&&agent.id==='research'){turn.stance='undecided';turn.signals=[signal('disagreement','oppose',{blocking:false,humanOnly:false})];}}});await run(hub,r);assert.equal(r.status,'unresolved');assert.deepEqual(r.votes,{});assert.ok(sent.some(x=>x.phase==='vote'&&x.agent==='research'));assert.ok(!sent.some(x=>x.phase==='vote'&&x.agent==='critic'));assert.equal(r.governance.pending,null);
});
