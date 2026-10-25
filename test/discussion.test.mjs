import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {DiscussionHub,validateTurn,consensusProblems,RULES_HASH,discussionReport,hash} from '../discussion.mjs';
import {createDiscussionDeepseekAdapter,codexUsageDelta} from '../adapters.mjs';
import {safeTerminal} from '../cli.mjs';

const proposal='完整方案：先确认目标与约束，独立评估替代方案，逐项检验争议，再依照证据逐步实施与验收。';
function output(snapshot, extra={}) {return {directiveHash:snapshot.governance?.directiveHash||'',signals:[],rulesHash:snapshot.rulesHash,revision:snapshot.revision,proposalHash:snapshot.proposal?.hash||'',acknowledged:true,summary:'我已审查当前方案的约束、风险及替代选择，以下给出具体依据。',analysis:[],objections:[],replies:[],close:[],proposal:'',stance:'undecided',question:'',...extra};}
function fixture(t,handler,options={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-discussion-test-'));let hub;
  const invoke=actor=>async args=>{const room=hub.rooms[0],snapshot=hub.snapshot(room,room.activity.phase);args.onUsage(actor==='Codex'?{input_tokens:30,output_tokens:20}:{total_tokens:50});args.onTrace('test-response-'+actor);const result=await handler(actor,snapshot,room,args);return JSON.stringify(result);};
  hub=new DiscussionHub({dir,codex:invoke('Codex'),deepseek:invoke('DeepSeek'),...options});
  t.after(async()=>{await hub.shutdown();const resolved=fs.realpathSync(dir);assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'relay-discussion-test-'));fs.rmSync(resolved,{recursive:true,force:true});});return hub;
}
async function settle(hub,room){for(let i=0;i<400;i++){if(!hub.busy&&room.status!=='running')return;await delay(5);}throw new Error('test did not settle: '+room.status+' '+room.stage);}
function normal(actor,s) {return output(s,{analysis:['challenge','synthesis'].includes(s.phase)?[{topic:'边界与备选',position:'应确认当前方向与失败条件均有覆盖',evidence:'根据共享方案文本推断',alternative:'缩小首版范围后验证'}]:[],proposal:s.phase==='proposal'?proposal:'',stance:s.phase==='vote'?'agree':'undecided'});}

test('先双方确认规则，至少三轮互审后对同一方案独立表决；投票提示不暴露对方表态',async t=>{
  const votes=[];const hub=fixture(t,(actor,s)=>{assert.equal(s.rulesHash,RULES_HASH);if(s.phase==='vote'){votes.push(actor);assert.ok(!JSON.stringify(s.transcript).includes('"phase":"vote"'));assert.ok(!Object.hasOwn(s,'votes'));}return normal(actor,s);});
  const room=hub.create({direction:'设计一个本地三方讨论与共识应用'});await hub.start(room.id);await settle(hub,room);
  assert.equal(room.status,'consensus');assert.equal(room.roundsSinceInput,3);assert.equal(room.calls.length,11);assert.deepEqual(votes,['Codex','DeepSeek']);assert.deepEqual(consensusProblems(room),[]);assert.equal(room.messages[1].phase,'ground');assert.equal(room.messages[2].phase,'ground');assert.equal(room.calls[0].actor,'Codex');assert.equal(room.votes.DeepSeek.hash,room.proposal.hash);assert.ok(discussionReport(room).includes('双方已达成共识'));
});
test('异议由提出者关闭，规范方案修订后必须重新表决',async t=>{
  const hub=fixture(t,(actor,s,room)=>{
    const result=normal(actor,s);
    if(actor==='DeepSeek'&&s.phase==='challenge'&&s.round===1)result.objections=[{title:'缺少中断恢复',reason:'服务重启后可能丢失决议',change:'加入会话持久化和明确恢复入口',evidence:'方案未规定持久化'}];
    if(actor==='Codex'&&s.phase==='synthesis'&&s.round===1){result.proposal=proposal+' 增加持久化和恢复命令。';result.replies=[{objectionId:'O1',response:'修订方案加入了持久化和恢复入口，请复核。'}];}
    if(actor==='DeepSeek'&&s.phase==='challenge'&&s.round===2)result.close=[{objectionId:'O1',reason:'已核对新方案明确包含持久化与恢复入口，原异议得到解决。'}];
    return result;
  });const room=hub.create({direction:'本地应用需要在崩溃后恢复讨论',minRounds:2});await hub.start(room.id);await settle(hub,room);
  assert.equal(room.status,'consensus');assert.equal(room.proposals.length,2);assert.equal(room.objections[0].actor,'DeepSeek');assert.equal(room.objections[0].status,'closed');assert.equal(room.votes.Codex.hash,room.proposals[1].hash);
});
test('主导方不能关闭对方异议，错误输出不改变状态',t=>{
  const hub=fixture(t,normal),r=hub.create({direction:'测试异议关闭的权限边界'});r.objections=[{id:'O1',actor:'DeepSeek',status:'open',title:'预算',replies:[]}];
  assert.throws(()=>validateTurn(r,'Codex','synthesis',output(r,{analysis:[{topic:'预算',position:'应该回应而非擅自关闭',evidence:'清单',alternative:''}],close:[{objectionId:'O1',reason:'我认为问题已经解决，不需要再讨论。'}]})),/只有异议提出者/);assert.equal(r.objections[0].status,'open');
});
test('反对持续存在到上限，不能将停止或不同意写成共识',async t=>{
  const hub=fixture(t,(actor,s)=>{const result=normal(actor,s);if(actor==='DeepSeek'&&s.phase==='challenge')result.objections=[{title:'缺少必要事实',reason:'不知道目标用户',change:'先提供目标用户',evidence:'尚未提供'}];return result;});const r=hub.create({direction:'为尚未明确的用户设计一个新产品',minRounds:1,maxRounds:2});await hub.start(r.id);await settle(hub,r);assert.equal(r.status,'unresolved');assert.equal(r.objections.filter(o=>o.status==='open').length,1);assert.ok(consensusProblems(r).length);assert.equal(r.calls.filter(c=>c.phase==='vote').length,0);assert.ok(discussionReport(r).includes('尚未达成共识'));
});
test('投票必须绑定当前 hash、人工方向、规则及成功的实际请求',t=>{
  const hub=fixture(t,normal),r=hub.create({direction:'验证程序共识门槛不能被旧投票越过'});r.proposal={hash:'current'};r.roundsSinceInput=3;r.grounded={Codex:RULES_HASH,DeepSeek:RULES_HASH};
  for(const actor of ['Codex','DeepSeek']){r.calls.push({id:actor,actor,status:'success'});r.votes[actor]={stance:'agree',hash:'current',revision:1,rulesHash:RULES_HASH,callId:actor};}
  assert.deepEqual(consensusProblems(r),[]);r.votes.DeepSeek.hash='old';assert.ok(consensusProblems(r).some(s=>s.includes('DeepSeek')));r.votes.DeepSeek.hash='current';r.calls[1].status='failed';assert.ok(consensusProblems(r).some(s=>s.includes('DeepSeek')));r.calls[1].status='success';r.revision++;assert.equal(consensusProblems(r).length,2);
});
test('人工在调用中插话会中止旧请求，清空表决并把新方向交给双方',async t=>{
  let changed=false;const seen=[];const hub=fixture(t,async(actor,s,r,args)=>{seen.push(s.revision);if(actor==='DeepSeek'&&s.phase==='challenge'&&!changed){changed=true;setTimeout(()=>hub.message(r.id,'补充新方向：离线优先，不能自动发布。'),0);await new Promise((resolve,reject)=>args.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));}return normal(actor,s);});
  const r=hub.create({direction:'实现一个可靠的本地讨论应用',minRounds:1});await hub.start(r.id);await settle(hub,r);assert.equal(r.status,'consensus');assert.equal(r.revision,2);assert.equal(r.human.length,2);assert.ok(seen.includes(2));assert.equal(r.calls.filter(c=>c.status==='interrupted').length,1);assert.equal(r.votes.Codex.revision,2);assert.equal(r.votes.DeepSeek.revision,2);
});
test('等待人答复时不继续空转；人工回复后手动恢复使用新版本',async t=>{
  const hub=fixture(t,(actor,s)=>{const result=normal(actor,s);if(actor==='DeepSeek'&&s.phase==='challenge'&&s.revision===1)result.question='首版预算是多少？';return result;});const r=hub.create({direction:'为我的应用确定范围和实现方案',minRounds:1});await hub.start(r.id);await settle(hub,r);assert.equal(r.status,'waiting_user');const calls=r.calls.length;await delay(30);assert.equal(r.calls.length,calls);hub.message(r.id,'首版预算一万元，请优先支持本地运行');await hub.start(r.id);await settle(hub,r);assert.equal(r.status,'consensus');assert.equal(r.revision,2);
});
test('暂停中断请求，恢复不重复有效发言；重启不会自动产生推理调用',async t=>{
  let pause=true;const hub=fixture(t,async(actor,s,r,args)=>{if(s.phase==='proposal'&&pause){pause=false;setTimeout(()=>hub.pause(r.id),0);await new Promise((resolve,reject)=>args.signal.addEventListener('abort',()=>reject(new Error('abort')),{once:true}));}return normal(actor,s);});const r=hub.create({direction:'检查暂停恢复与重启的行为',minRounds:1});await hub.start(r.id);await settle(hub,r);assert.equal(r.status,'paused');assert.equal(r.messages.filter(m=>m.phase==='ground').length,2);await hub.start(r.id);await settle(hub,r);assert.equal(r.status,'consensus');assert.equal(r.messages.filter(m=>m.phase==='ground').length,2);r.status='running';hub.save();const restarted=new DiscussionHub({dir:hub.dir,codex:()=>assert.fail(),deepseek:()=>assert.fail()});assert.equal(restarted.rooms[0].status,'interrupted');assert.equal(restarted.busy,false);
});
test('未提供密钥时预检拦截，零推理调用和零 AI 发言',async t=>{
  const hub=fixture(t,()=>assert.fail(),{ready:async()=>{throw new Error('没有 DeepSeek API Key');}});const r=hub.create({direction:'不能运行预设对话来冒充真实讨论'});await assert.rejects(hub.start(r.id),/API Key/);assert.equal(r.calls.length,0);assert.equal(r.messages.length,1);assert.equal(r.status,'draft');assert.equal(hub.busy,false);
  let sent=false;await assert.rejects(createDiscussionDeepseekAdapter({deepseekKey:''},async()=>{sent=true;})({signal:new AbortController().signal}),/API Key/);assert.equal(sent,false);
});
test('三次格式错误保留分歧，达到调用预算后只能明确加额继续',async t=>{
  const hub=fixture(t,(actor,s)=>output(s,{rulesHash:'wrong'}));const r=hub.create({direction:'检查无效模型输出的错误处理',maxCalls:6,minRounds:1});await hub.start(r.id);await settle(hub,r);assert.equal(r.status,'unresolved');assert.equal(r.calls.length,3);assert.equal(r.proposal,null);assert.ok(r.calls.every(c=>c.validationError));
});
test('DeepSeek 真实 HTTP 适配器传入固定 system、JSON 模式并保存使用量与返回 ID',async()=>{
  let sent,usage,id;const adapter=createDiscussionDeepseekAdapter({deepseekKey:'test-placeholder-key',deepseekModel:'test-model'},async(url,opts)=>{sent={url,...opts,body:JSON.parse(opts.body)};return new Response(JSON.stringify({id:'response-test',choices:[{message:{content:'{"acknowledged":true}'},finish_reason:'stop'}],usage:{total_tokens:12}}),{headers:{'Content-Type':'application/json'}});});const result=await adapter({system:'固定规则',prompt:'JSON snapshot',signal:new AbortController().signal,onUsage:u=>usage=u,onTrace:i=>id=i});assert.equal(sent.url,'https://api.deepseek.com/chat/completions');assert.ok(sent.body.messages[0].content.startsWith('固定规则'));assert.match(sent.body.messages[0].content,/叛逆值 50\/100/);assert.deepEqual(sent.body.response_format,{type:'json_object'});assert.equal(id,'response-test');assert.equal(usage.total_tokens,12);assert.match(result,/acknowledged/);
});
test('CLI 输出移除模型文本中的终端控制序列',()=>{assert.equal(safeTerminal('文本\x1b[2J\x1b[31m颜色\x07\r\n正常'),'文本颜色\n正常');});
test('Codex 用量按会话累计值差分，重复快照不重复收费，基线持久化后恢复仍正确',()=>{
  let task={};assert.equal(codexUsageDelta(task,'discussion','A',{input_tokens:100,output_tokens:10}).input_tokens,100);
  task=JSON.parse(JSON.stringify(task));const delta=codexUsageDelta(task,'discussion','A',{input_tokens:250,output_tokens:35},true);assert.equal(delta.input_tokens,150);assert.equal(delta.output_tokens,25);
  assert.equal(codexUsageDelta(task,'discussion','A',{input_tokens:250,output_tokens:35},true).input_tokens,0);
  assert.equal(codexUsageDelta(task,'discussion','B',{input_tokens:50,output_tokens:5}).input_tokens,50);
  assert.equal(codexUsageDelta({},'discussion','unknown',{input_tokens:200,output_tokens:20},true).unknown,true);
  assert.equal(codexUsageDelta(task,'discussion','B',{input_tokens:10,output_tokens:1},true).unknown,true);
});
test('表决时新异议使共识失败，即便另一方此前投了同意',async t=>{
  let saw=false;const hub=fixture(t,(actor,s,r)=>{const result=normal(actor,s);if(actor==='DeepSeek'&&s.phase==='vote'&&!saw){saw=true;result.stance='disagree';result.objections=[{title:'遗漏停止语义',reason:'未定义网络调用取消',change:'明确终止在途请求',evidence:'规范尚未说明'}];}return result;});const r=hub.create({direction:'验证最终独立表决不会自动附和',minRounds:1,maxRounds:1});await hub.start(r.id);await settle(hub,r);assert.equal(r.status,'unresolved');assert.equal(r.objections.length,1);assert.ok(consensusProblems(r).length);assert.equal(Object.keys(r.votes).length,0);
});
test('调用上限需要明确增加总预算才能继续；超出 tokens 的响应不能生成共识',async t=>{
  const hub=fixture(t,normal);const r=hub.create({direction:'预算达到后保存方案与分歧',minRounds:1,maxCalls:6});await hub.start(r.id);await settle(hub,r);assert.equal(r.status,'unresolved');assert.equal(r.calls.length,6);await assert.rejects(hub.start(r.id),/明确增加/);await hub.start(r.id,{maxCalls:10});await settle(hub,r);assert.equal(r.status,'consensus');
});
test('后一个投票期间文件变化使双方重新投票，不能刷新证据后沿用前方旧票',async t=>{
  let changed=false,codexVotes=0;const hub=fixture(t,(actor,s,r)=>{if(actor==='Codex'&&s.phase==='vote')codexVotes++;if(actor==='DeepSeek'&&s.phase==='vote'&&!changed){changed=true;fs.writeFileSync(path.join(r.workspace,'fact.md'),'version2');r.fileEvidence['fact.md']=hash('version2');}return normal(actor,s);});const r=hub.create({direction:'核对独立表决对同一实际文件版本的绑定',minRounds:1});fs.mkdirSync(r.workspace,{recursive:true});fs.writeFileSync(path.join(r.workspace,'fact.md'),'version1');r.fileEvidence={'fact.md':hash('version1')};await hub.start(r.id);await settle(hub,r);assert.equal(r.status,'consensus');assert.equal(codexVotes,2);assert.equal(r.messages.filter(m=>m.stale&&m.phase==='vote').length,1);assert.deepEqual(consensusProblems(r),[]);
});
