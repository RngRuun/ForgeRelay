import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {contextPatch,prepareCacheContext,CONTEXT_PROTOCOL} from '../cache-context.mjs';
import {transcriptView,nativeEvidenceText} from '../context-view.mjs';
import {DiscussionHub} from '../discussion.mjs';
import {RuntimeHarness} from '../harness.mjs';
import {createDiscussionDeepseekAdapter} from '../adapters.mjs';
import {cacheEconomyBenchmark} from '../tools/cache-economy-benchmark.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
function apply(value,patch){
  let state=structuredClone(value);
  for(const op of patch){
    if(op.path===''){state=structuredClone(op.value);continue;}
    const keys=op.path.slice(1).split('/').map(k=>k.replaceAll('~1','/').replaceAll('~0','~'));
    let parent=state;for(const k of keys.slice(0,-1))parent=parent[k];const key=keys.at(-1);
    if(op.op==='remove'){if(Array.isArray(parent))parent.splice(Number(key),1);else delete parent[key];}
    else if(key==='-'&&Array.isArray(parent))parent.push(structuredClone(op.value));
    else parent[key]=structuredClone(op.value);
  }
  return state;
}
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-economy-'));
  t.after(()=>{const resolved=fs.realpathSync(dir);assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'relay-economy-'));fs.rmSync(resolved,{recursive:true,force:true});});
  fs.writeFileSync(path.join(dir,'proof.txt'),'first actual evidence');
  const room={workspace:dir,revision:1,rulesHash:'fixture-rules',modelProfile:{hash:'fixture-profile'},runtime:{mode:'read',computer:'off',version:0},fileEvidence:{'proof.txt':digest('first actual evidence')},attachments:[],enabledSkills:[]};
  const read={id:'actual-read',actor:'DeepSeek',status:'success',name:'read_file',depth:0};
  return {dir,room,read,snapshot:{projectInstructions:'follow project constraints',toolEvidence:[read]}};
}

test('滚动窗口只移除旧项并追加新项，冻结的请求前缀和精确状态均保留',()=>{
  const entry=i=>({id:i,text:('不可丢失的完整证据 '+i+' ').repeat(180)}),room={workspace:'fixture',rulesHash:'rules'};
  let state={phase:'challenge','a/b~':Array.from({length:16},(_,i)=>entry(i))};
  let request=prepareCacheContext(room,'DeepSeek',state),restored=JSON.parse(request.text.slice(CONTEXT_PROTOCOL.length+1)).checkpoint;
  for(let i=16;i<25;i++){
    const next={...state,'a/b~':[...state['a/b~'].slice(1),entry(i)]},patch=contextPatch(state,next),prior=structuredClone(request.messages);
    assert.deepEqual(patch.map(p=>[p.op,p.path]),[['remove','/a~1b~0/0'],['add','/a~1b~0/-']]);
    restored=apply(restored,patch);assert.deepEqual(restored,next);
    request=prepareCacheContext(room,'DeepSeek',next);
    assert.deepEqual(request.messages.slice(0,prior.length),prior);
    assert.ok(!request.messages.at(-1).content.includes('不可丢失的完整证据 '+(i-1)+' '));state=next;
  }
});

test('数组缩短、重复项、索引内修改及随机滚动补丁均可精确还原',()=>{
  const cases=[[[1,2,3],[2,3]],[[1,1,2],[1,2,3]],[[{x:1},{x:2}],[{x:1},{x:3}]],[[1,2],[]],[[],[1]],[[1,2,3],[3,4,5,6]]];
  let seed=12345;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let i=0;i<400;i++){const a=Array.from({length:rand()%20},()=>({value:rand()%7,text:'证据'.repeat(rand()%60)})),b=structuredClone(a);b.splice(0,rand()%(a.length+1));for(let j=rand()%5;j>0;j--)b.push({value:rand()%7,text:'新证据'.repeat(rand()%50)});if(b.length&&rand()%2)b[rand()%b.length].value=42;cases.push([a,b]);}
  for(const [a,b]of cases)assert.deepEqual(apply({'x/~':a},contextPatch({'x/~':a},{'x/~':b})),{'x/~':b});
});

test('离线对照只测新增输入字节，滚动窗口与模型视图均减少重复内容',()=>{
  const report=cacheEconomyBenchmark();assert.equal(report.networkRequests,0);
  assert.ok(report.rollingHistory.afterBytes<report.rollingHistory.beforeBytes/10);
  assert.ok(report.modelTranscript.afterBytes<report.modelTranscript.beforeBytes);
  assert.ok(report.shortCommandEvidence.afterBytes<report.shortCommandEvidence.beforeBytes);
});

test('模型视图只移除重复摘要和已校验封装，保留实质论据、版本及角色归属',()=>{
  const message={id:'M1',actor:'DeepSeek',agentId:'critic',agentLabel:'独立反方',phase:'challenge',text:'完整的审查摘要',detail:{rulesHash:'r'.repeat(64),directiveHash:'d'.repeat(64),acknowledged:true,revision:2,proposalHash:'p'.repeat(64),summary:'完整的审查摘要',analysis:[{topic:'边界',position:'反对',evidence:'真实证据',alternative:'完整备选'}],objections:[],replies:[{objectionId:'O1',response:'不能忽略这一条件'}],close:[],signals:[{kind:'gap',detail:'只有人知道的期限'}],proposal:'完整备选方案不能删除',question:'请说明真实约束',stance:'undecided',futureField:{important:false}}};
  const original=structuredClone(message),view=transcriptView(message);
  assert.deepEqual(message,original);assert.equal(view.agentId,'critic');assert.equal(view.detail.revision,2);assert.equal(view.detail.proposalHash,message.detail.proposalHash);
  for(const key of ['analysis','replies','signals','proposal','question','futureField'])assert.deepEqual(view.detail[key],message.detail[key]);
  for(const key of ['summary','rulesHash','directiveHash','acknowledged','objections','close','stance'])assert.ok(!Object.hasOwn(view.detail,key));
  assert.equal(transcriptView({...message,detail:{summary:'不同于 text 的重要摘要'}}).detail.summary,'不同于 text 的重要摘要');
});

test('共享快照保留人的约束、权限、完整方案和未决事项，原记录及独立投票不受影响',t=>{
  const {dir}=fixture(t),hub=new DiscussionHub({dir:path.join(dir,'data'),codex:()=>assert.fail(),deepseek:()=>assert.fail()});
  const room=hub.create({direction:'客户数据只能本地存储，不得上传'});
  room.proposal={hash:'complete',text:'完整规范方案'};room.objections=[{id:'O1',status:'open',reason:'不可忽略的未解决异议'}];
  room.messages.push({actor:'Codex',phase:'vote',text:'其他角色的私有表决',detail:{stance:'agree'}});
  room.messages.push({actor:'Codex',phase:'command',text:'short actual command output'});
  const original=JSON.stringify(room),snapshot=hub.snapshot(room,'vote');
  assert.deepEqual(snapshot.human,room.human);assert.deepEqual(snapshot.runtime,room.runtime);assert.deepEqual(snapshot.proposal,room.proposal);assert.deepEqual(snapshot.objections,room.objections);
  assert.ok(!JSON.stringify(snapshot).includes('其他角色的私有表决'));assert.equal(snapshot.nativeEvidence[0].text,'short actual command output');assert.equal(JSON.stringify(room),original);
  assert.equal(nativeEvidenceText('x'.repeat(1800)).length,1800);assert.equal(nativeEvidenceText('x'.repeat(1801)).length,1801);
});

for(const scenario of ['stable','changed','rejected'])test(`真实调度及 HTTP 构造 ${scenario}：完整保留每轮独立取证机会`,async t=>{
  const changed=scenario==='changed',{dir}=fixture(t);let hub,rejected=false;const sent=[];
  const turn=()=>{const r=hub.rooms[0],phase=r.activity.phase;return {directiveHash:r.governance?.directiveHash||'',signals:[],rulesHash:r.rulesHash,revision:r.revision,proposalHash:r.proposal?.hash||'',acknowledged:true,summary:'按真实文件证据独立审查当前方案、人的约束和仍未解决的问题。',analysis:['challenge','synthesis'].includes(phase)?[{topic:'边界',position:'核对当前完整证据',evidence:'测试夹具的实际文件',alternative:'有限范围验证'}]:[],objections:[],replies:[],close:[],proposal:phase==='proposal'?'完整规范方案：保留人的全部约束，实际读取证据并逐项验证，在有限轮次后独立投票。':'',stance:phase==='vote'?'agree':'undecided',question:''};};
  const deepseek=createDiscussionDeepseekAdapter({deepseekKey:'unit-test-only'},async(_url,opts)=>{
    const req=JSON.parse(opts.body),r=hub.rooms[0];sent.push({phase:r.activity.phase,round:r.round,req});
    const result=turn();if(scenario==='rejected'&&!rejected&&r.activity.phase==='challenge'&&req.tool_choice!=='required'){result.acknowledged=false;rejected=true;}
    const message=req.tool_choice==='required'?{content:null,tool_calls:[{id:'fixture-read-'+sent.length,type:'function',function:{name:'read_file',arguments:JSON.stringify({path:'proof.txt'})}}]}:{content:JSON.stringify(result)};
    return new Response(JSON.stringify({id:'mock-http-'+sent.length,choices:[{message,finish_reason:'stop'}],usage:{prompt_tokens:100,prompt_cache_hit_tokens:64,prompt_cache_miss_tokens:36,completion_tokens:20}}));
  });
  const harness=new RuntimeHarness({attachments:{images:()=>[]},onChange:r=>hub.emit(r)});
  hub=new DiscussionHub({dir:path.join(dir,'hub'),harness,deepseek,codex:async args=>{const r=hub.rooms[0];if(changed&&r.activity.phase==='synthesis'&&r.round===1)fs.writeFileSync(path.join(dir,'proof.txt'),'new file after first review');args.onUsage({input_tokens:100,output_tokens:20,cached_input_tokens:64});return JSON.stringify(turn());}});
  t.after(()=>hub.shutdown());const r=hub.create({direction:'读取 proof.txt，核对证据并保留三轮独立审查',workspace:dir,minRounds:3});
  await hub.start(r.id);await hub.live.get(r.id)?.promise;
  if(scenario==='rejected'){assert.equal(r.status,'unresolved');const count=r.calls.length;await new Promise(resolve=>setTimeout(resolve,10));assert.equal(r.calls.length,count,'invalid output must not silently trigger another paid request');await hub.start(r.id);await hub.live.get(r.id)?.promise;}
  assert.equal(r.status,'consensus',r.reason);assert.equal(r.roundsSinceInput,3);assert.deepEqual(Object.keys(r.votes).sort(),['Codex','DeepSeek']);
  assert.equal(sent.filter(s=>s.req.tool_choice==='required').length,rejected?4:3);
  assert.equal(sent.filter(s=>s.phase==='challenge').length,rejected?8:6);
  assert.equal(r.toolCalls.filter(c=>c.name==='read_file'&&c.status==='success').length,rejected?4:3);
  if(rejected)assert.equal(r.calls.filter(c=>c.validationError).length,1);
  assert.ok(sent.filter(s=>s.phase==='challenge').every(s=>s.req.tools.some(t=>t.function.name==='read_file')));
  const votes=sent.filter(s=>s.phase==='vote');assert.equal(votes.length,1);assert.ok(!JSON.stringify(votes[0].req.messages).includes('"stance":"agree"'));
  assert.equal(r.calls.filter(c=>c.actor==='DeepSeek').length,sent.length);
});
