import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';
import {DiscussionHub} from '../discussion.mjs';import {defaultSettings} from '../model-settings.mjs';import {conversationIntent} from '../public/conversation-policy.js';import {assertStrictSchemaShape,outputSchemaPath} from '../output-schema.mjs';
const reply=(text='可以，今天想聊什么？',complexity=1)=>JSON.stringify({reply:text,complexity,discussionReason:complexity>=4?'包含多个耦合模块和架构取舍':'',discussionQuestion:complexity>=4?'这个任务涉及多个模块，要不要先让团队讨论，还是由我直接处理？':''});
function fixture(t,{answer,lead='lead',direction='你好',ready}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-conversation-')),settings=defaultSettings();settings.collaboration.leaderId=lead;let hub;const calls=[];
 const handle=actor=>async args=>{calls.push({actor,...args});return answer?answer({actor,args,hub,room:hub.rooms[0],index:calls.length}):reply();};
 hub=new DiscussionHub({dir,getModelProfile:()=>({name:'test',hash:'test-profile',settings}),codex:handle('Codex'),deepseek:handle('DeepSeek'),ready});
 const room=hub.create({direction,governance:true,interaction:'adaptive'});
 t.after(async()=>{await hub.shutdown();const resolved=fs.realpathSync(dir);assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'relay-conversation-'));fs.rmSync(resolved,{recursive:true,force:true});});
 return {hub,room,calls,settings};
}
async function completed(hub,id){await hub.live.get(id)?.promise;}
test('直接控制意图避开引文和否定，明确讨论可以附带自然语言目标',()=>{
 for(const s of ['你们俩先停止讨论','停止','请立即停止执行'])assert.equal(conversationIntent(s),'stop',s);
 for(const s of ['请你们讨论一下这个架构','请讨论缓存优化方案','我希望让你们一起讨论架构','开始团队讨论'])assert.equal(conversationIntent(s),'discuss',s);
 for(const s of ['不要停止','解释“停止讨论”的含义','讨论区界面怎么做','普通聊天','如何停止讨论'])assert.equal(conversationIntent(s),'message',s);
 assert.equal(conversationIntent('不用讨论，你直接回答'),'direct');
});
test('普通聊天只进行一次 lead 调用，不确认三轮规范，不唤起其他角色',async t=>{
 const {hub,room,calls}=fixture(t);await hub.start(room.id);await completed(hub,room.id);
 assert.equal(calls.length,1);assert.equal(calls[0].actor,'Codex');assert.equal(calls[0].schema,'conversation');assert.equal(room.status,'waiting_user');assert.equal(room.conversation.pending,null);assert.equal(room.review,null);assert.ok(!room.messages.some(m=>m.phase==='ground'));assert.equal(room.proposals.length,0);assert.equal(room.objections.length,0);assert.match(room.messages.at(-1).text,/想聊/);await assert.rejects(hub.start(room.id),/已回复/);
});

test('同一消息并发提交和网络重试只接受一次，重启后也识别已接受请求',async t=>{
 const {hub,room,calls}=fixture(t);await hub.start(room.id);await completed(hub,room.id);
 const input={text:'请继续自然聊天',expectedRevision:room.revision,clientRequestId:'fixed-client-request-1'},revision=room.revision;
 const results=await Promise.all([hub.converse(room.id,input),hub.converse(room.id,input)]);await completed(hub,room.id);
 assert.equal(results[0],results[1]);assert.equal(room.revision,revision+1);assert.equal(calls.length,2);await hub.converse(room.id,input);assert.equal(calls.length,2);
 await assert.rejects(async()=>hub.converse(room.id,{...input,text:'同一请求篡改为另一个任务'}),/不同内容/);
 const restored=new DiscussionHub({dir:hub.dir,codex:()=>assert.fail('must not infer'),deepseek:()=>assert.fail('must not infer')});
 await restored.converse(room.id,input);assert.equal(restored.get(room.id).revision,room.revision);await restored.shutdown();
});
test('复杂度建议必须等待人的选择，拒绝后同一请求不再询问',async t=>{
 const {hub,room,calls}=fixture(t,{answer:()=>reply('我会直接处理。',4)});await hub.start(room.id);await completed(hub,room.id);const pending=room.conversation.pending;
 assert.ok(pending);assert.equal(calls.length,1);assert.equal(room.conversation.mode,'chat');assert.equal(room.status,'waiting_user');await assert.rejects(hub.start(room.id),/先选择/);
 await hub.discussionChoice(room.id,{requestId:pending.id,choice:'direct'});await completed(hub,room.id);assert.equal(calls.length,2);assert.ok(calls.every(c=>c.actor==='Codex'));assert.equal(room.conversation.pending,null);assert.equal(room.messages.at(-1).text,'我会直接处理。');await assert.rejects(hub.discussionChoice(room.id,{requestId:pending.id,choice:'discuss'}),/已变化/);
});
test('明确请求讨论直接进入主持提案，后续确认不再产生空 ground 调用',async t=>{
 let fixtureRef;const f=fixture(t,{direction:'请讨论一下如何提高缓存命中率',answer:({room})=>{queueMicrotask(()=>f.hub.pause(room.id));return JSON.stringify({rulesHash:room.rulesHash,revision:room.revision,proposalHash:'',directiveHash:room.governance.directiveHash,acknowledged:true,summary:'比较稳定前缀与新增输入，依据真实计量选择优化方案。',analysis:[],objections:[],replies:[],close:[],proposal:'完整讨论方案：保持上下文稳定，使用真实计量验证缓存，记录新的输入与证据。',stance:'undecided',question:'',signals:[]});}});
 const {hub,room,calls}=f;assert.equal(room.conversation.mode,'discussion');assert.equal(room.stage,'council:proposal:0');await hub.start(room.id);await completed(hub,room.id);assert.equal(calls.length,1);assert.ok(!room.calls.some(c=>c.phase==='ground'));
});
test('停止直接取消调度，不再向模型请求停止声明',async t=>{
 let entered;const started=new Promise(r=>entered=r);const {hub,room,calls}=fixture(t,{answer:async({args})=>{entered();await new Promise(r=>args.signal.addEventListener('abort',r,{once:true}));return reply('过期回复不得写入');}});
 await hub.start(room.id);await started;await hub.converse(room.id,{text:'你们俩先停止讨论',expectedRevision:room.revision});await completed(hub,room.id);assert.equal(room.status,'stopped');assert.equal(calls.length,1);assert.ok(!room.messages.some(m=>m.text==='过期回复不得写入'));assert.equal(room.calls[0].status,'interrupted');
});
test('旧会谈的消息和干预入口也能直接停止',async t=>{
 const {hub}=fixture(t);const r=hub.create({direction:'旧会谈的已有任务',governance:true});hub.message(r.id,'你们俩先停止讨论');assert.equal(r.status,'stopped');const other=hub.create({direction:'旧会谈的第二个任务',governance:true});await hub.intervene(other.id,{action:'STEER',text:'你们俩先停止讨论',expectedRevision:other.revision,manual:true});assert.equal(other.status,'stopped');assert.equal(other.calls.length,0);
});
test('随时更新叛逆值、轮数和 lead，保留历史与原模型能力参数',async t=>{
 const {hub,room,calls,settings}=fixture(t);await hub.start(room.id);await completed(hub,room.id);const before=structuredClone(room.messages),usage=room.calls.length;
 await hub.conversationSettings(room.id,{expectedRevision:room.revision,settingsVersion:1,leaderId:'research',rebellion:{codex:80,deepseek:12},minRounds:1,maxRounds:null});
 assert.equal(room.governance.team.find(a=>a.lead).provider,'DeepSeek');assert.equal(room.maxRounds,null);assert.equal(room.minRounds,1);assert.equal(room.modelProfile.settings.deepseek.rebellion,12);assert.equal(room.modelProfile.settings.deepseek.maxTokens,settings.deepseek.maxTokens);assert.equal(room.modelProfile.settings.deepseek.thinking,settings.deepseek.thinking);assert.equal(room.calls.length,usage);assert.deepEqual(room.messages.slice(0,before.length),before);
 await hub.converse(room.id,{text:'继续普通聊天'});await completed(hub,room.id);assert.equal(calls.at(-1).actor,'DeepSeek');assert.equal(calls.at(-1).task.modelProfile.settings.deepseek.rebellion,12);await assert.rejects(hub.conversationSettings(room.id,{settingsVersion:1,rebellion:{deepseek:22}}),/其他窗口/);
});
test('聊天接入只检查 lead',async t=>{
 const checked=[];const {hub,room}=fixture(t,{lead:'research',ready:async(p,subject)=>checked.push(subject.governance.team.map(a=>a.provider))});await hub.start(room.id);await completed(hub,room.id);assert.deepEqual(checked,[['DeepSeek']]);
});
test('新对话 schema 全部属性进入 required，Codex 发请求前可验证',()=>{
 const root=fileURLToPath(new URL('..',import.meta.url));assertStrictSchemaShape(JSON.parse(fs.readFileSync(new URL('../conversation.schema.json',import.meta.url))));assert.ok(outputSchemaPath(root,'conversation').endsWith('conversation.schema.json'));
});
test('用户同意后才启动所有角色，真实调度满足完整轮数和独立表决',async t=>{
 const f=fixture(t,{answer:({room,args})=>{
  if(args.schema==='conversation'||room.activity.phase==='chat')return reply('',4);
  const phase=room.activity.phase;return JSON.stringify({rulesHash:room.rulesHash,revision:room.revision,proposalHash:room.proposal?.hash||'',directiveHash:room.governance.directiveHash,acknowledged:true,summary:'依据当前目标和完整证据独立审查，认可本次方案的边界与验收条件。',analysis:['challenge','synthesis'].includes(phase)?[{topic:'具体边界',position:'核对当前实现要求和替代方案',evidence:'固定测试事实',alternative:'保留现有范围'}]:[],objections:[],replies:[],close:[],proposal:phase==='proposal'?'完整方案：按人给定目标实现，保持实际证据，并由所有配置角色独立审查和表决。':'',stance:phase==='vote'?'agree':'undecided',question:'',signals:[]});
 }});
 const {hub,room,calls}=f;await hub.start(room.id);await completed(hub,room.id);assert.equal(calls.length,1);assert.equal(room.proposal,null);
 await hub.converse(room.id,{text:'好的'});await completed(hub,room.id);assert.equal(room.status,'consensus',room.reason);assert.equal(room.roundsSinceInput,3);assert.equal(Object.keys(room.votes).length,3);assert.equal(calls.filter(c=>c.actor==='DeepSeek').length,4);assert.ok(!room.calls.some(c=>c.phase==='ground'));assert.ok(room.governance.team.every(a=>room.grounded[a.id]===room.rulesHash));
});
test('运行中切换 lead 丢弃旧回复，并按新 lead 与叛逆值继续',async t=>{
 let entered;const started=new Promise(r=>entered=r);const {hub,room,calls}=fixture(t,{answer:async({actor,args})=>{if(actor==='Codex'){entered();await new Promise(r=>args.signal.addEventListener('abort',r,{once:true}));return reply('不应显示的旧 lead 回复');}return reply('新的 lead 已按最新需求回应');}});
 await hub.start(room.id);await started;await hub.conversationSettings(room.id,{settingsVersion:1,expectedRevision:room.revision,leaderId:'research',rebellion:{deepseek:90},minRounds:2,maxRounds:4});await completed(hub,room.id);
 assert.equal(calls.length,2);assert.equal(calls[1].actor,'DeepSeek');assert.equal(calls[1].task.modelProfile.settings.deepseek.rebellion,90);assert.ok(!room.messages.some(m=>m.text==='不应显示的旧 lead 回复'));assert.equal(room.messages.at(-1).text,'新的 lead 已按最新需求回应');assert.equal(room.calls[0].status,'interrupted');assert.equal(hub.runtimeKeys.size,0);
});
test('已回复或等待讨论选择时调预算不会额外调用模型',async t=>{
 const {hub,room,calls}=fixture(t);await hub.start(room.id);await completed(hub,room.id);await hub.start(room.id,{maxCalls:null,tokenBudget:null,maxRounds:null});assert.equal(calls.length,1);assert.equal(room.maxCalls,null);assert.equal(room.tokenBudget,null);assert.equal(room.maxRounds,null);assert.equal(room.status,'waiting_user');
});
test('设置等待旧请求退出期间收到 STOP，保存设置也不能自动恢复',async t=>{
 let entered,aborted,release;const started=new Promise(r=>entered=r),cancelled=new Promise(r=>aborted=r),released=new Promise(r=>release=r);
 const {hub,room,calls}=fixture(t,{answer:async({args})=>{entered();await new Promise(r=>args.signal.addEventListener('abort',()=>{aborted();r();},{once:true}));await released;return reply('过期结果');}});
 await hub.start(room.id);await started;const changed=hub.conversationSettings(room.id,{settingsVersion:1,expectedRevision:room.revision,rebellion:{codex:70}});await cancelled;hub.stop(room.id);release();await changed;await completed(hub,room.id);assert.equal(room.status,'stopped');assert.equal(calls.length,1);assert.equal(room.modelProfile.settings.codex.rebellion,70);assert.ok(!room.messages.some(m=>m.text==='过期结果'));
});
test('并发保存会谈设置只能接受一个版本，不覆盖先前已生效的值',async t=>{
 const {hub,room}=fixture(t);const results=await Promise.allSettled([hub.conversationSettings(room.id,{settingsVersion:1,expectedRevision:room.revision,rebellion:{codex:10}}),hub.conversationSettings(room.id,{settingsVersion:1,expectedRevision:room.revision,rebellion:{codex:90}})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal(room.modelProfile.settings.codex.rebellion,10);assert.equal(room.conversation.settingsVersion,2);
});
test('显式补充事实保留人工动作，同时让普通聊天继续由 lead 回应',async t=>{
 const {hub,room,calls}=fixture(t);await hub.start(room.id);await completed(hub,room.id);await hub.intervene(room.id,{action:'INJECT',text:'补充实际情况：本次只讨论本地使用。',expectedRevision:room.revision,manual:true});assert.equal(room.conversation.mode,'chat');assert.equal(room.stage,'conversation');await hub.start(room.id);await completed(hub,room.id);assert.equal(calls.length,2);assert.ok(room.governance.history.some(h=>h.action==='INJECT'));assert.ok(!room.calls.some(c=>c.phase==='ground'));
});
