import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareCacheContext,contextPatch,canonical,CONTEXT_PROTOCOL} from '../cache-context.mjs';
import {cacheSummary,normalizeCacheUsage,callCacheUsage} from '../public/cache-usage.js';
import {codexUsageDelta,createDiscussionDeepseekAdapter} from '../adapters.mjs';
import {DiscussionHub} from '../discussion.mjs';

function apply(state,operations){
  for(const op of operations){const keys=op.path.slice(1).split('/').map(k=>k.replaceAll('~1','/').replaceAll('~0','~'));
    if(!op.path){state=structuredClone(op.value);continue;}
    let parent=state;for(const key of keys.slice(0,-1))parent=parent[key];const key=keys.at(-1);
    if(op.op==='remove'){if(Array.isArray(parent))parent.splice(Number(key),1);else delete parent[key];}
    else if(Array.isArray(parent)&&key==='-')parent.push(structuredClone(op.value));else parent[key]=structuredClone(op.value);
  }return state;
}
function decode(text){let state;for(const line of text.slice(CONTEXT_PROTOCOL.length+1).split('\n')){const entry=JSON.parse(line);state=entry.checkpoint||apply(state,entry.patch);}return state;}
const room=()=>({workspace:'C:/project',rulesHash:'rules-fixture',modelProfile:{hash:'profile-fixture'}});
const snapshot=()=>({phase:'challenge',revision:1,round:1,human:[{text:'核对项目与约束'}],runtime:{mode:'work',computer:'off'},proposal:{hash:'v1',text:'依据文件证据设计方案'},objections:[{id:'O1',status:'open',replies:[]}],transcript:[{actor:'Human',phase:'direction',text:'真实方向'}],feedback:''});

test('增量上下文恢复精确最新状态，更新方向/权限/异议不改写已发送前缀，重启后仍可追加',()=>{
  let r=room();const a=snapshot(),one=prepareCacheContext(r,'DeepSeek',a);r=JSON.parse(JSON.stringify(r));
  const b=structuredClone(a);b.round++;b.phase='synthesis';b.revision++;b.human.push({text:'只读核对，不再修改文件'});b.runtime.mode='read';b.objections[0].status='closed';b.objections[0].replies.push({text:'证据已核对'});b.transcript.push({actor:'Codex',text:'新的证据与方案'});
  const two=prepareCacheContext(r,'DeepSeek',b);assert.ok(two.text.startsWith(one.text+'\n'));assert.deepEqual(decode(two.text),canonical(b));assert.equal(two.stats.mode,'append');assert.equal(two.stats.sharedPrefixChars,one.stats.promptChars);
});
test('JSON Patch 支持删除、对象键转义和数组缩短，不遗留旧值',()=>{
  const a={'a/b':{'~key':1},x:[1,2,3],remove:'old'},b={'a/b':{'~key':2},x:[1]};
  assert.deepEqual(apply(structuredClone(a),contextPatch(a,b)),b);
});
test('配置或项目变化重建检查点，体积限制后保留当前全部状态',()=>{
  const r=room(),s=snapshot();prepareCacheContext(r,'Codex',s);r.modelProfile.hash='new-model';
  const next=prepareCacheContext(r,'Codex',s);assert.equal(next.stats.reason,'configuration-changed');assert.deepEqual(decode(next.text),canonical(s));
  s.feedback='输出不合法，需要重新确认';const compact=prepareCacheContext(r,'Codex',s,{maxChars:1});assert.equal(compact.stats.reason,'checkpoint-size');assert.deepEqual(decode(compact.text),canonical(s));
});
test('投票使用新隔离检查点，不携带先前讨论日志或对方投票',()=>{
  const r=room(),s=snapshot();s.transcript.push({actor:'Codex',text:'只用于旧讨论的内容'});prepareCacheContext(r,'DeepSeek',s);
  const vote={...snapshot(),phase:'vote',transcript:[]};const one=prepareCacheContext(r,'DeepSeek',vote);assert.ok(!one.text.includes('只用于旧讨论'));assert.equal(one.stats.reason,'independent-vote');assert.ok(!r.cacheContexts['DeepSeek:vote']);assert.deepEqual(decode(one.text),canonical(vote));
});
test('真实用量按 tokens 加权并计入冷启动，保留未知和错误计量，不以请求数平均',()=>{
  const calls=[{actor:'DeepSeek',usage:{prompt_tokens:100,prompt_cache_hit_tokens:0,prompt_cache_miss_tokens:100}},{actor:'DeepSeek',usage:{prompt_tokens:900,prompt_cache_hit_tokens:810,prompt_cache_miss_tokens:90}},{actor:'Codex',usage:{input_tokens:1200,cached_input_tokens:1100}},{actor:'Codex',usage:{input_tokens:400}},{actor:'DeepSeek'}];
  const s=cacheSummary(calls);assert.equal(s.actors.DeepSeek.ratio,.81);assert.equal(s.actors.Codex.unknownCalls,1);assert.equal(s.cached,1910);assert.equal(s.input,2200);assert.equal(s.unknownCalls,2);assert.equal(s.complete,false);assert.equal(s.targetMet,null);
  assert.equal(normalizeCacheUsage({prompt_tokens:10,prompt_cache_hit_tokens:11}).known,false);assert.equal(normalizeCacheUsage({prompt_tokens:10,prompt_cache_hit_tokens:5,prompt_cache_miss_tokens:3}).known,false);assert.equal(normalizeCacheUsage({input_tokens:0,cached_input_tokens:0}).ratio,null);
  assert.equal(cacheSummary([{cacheVersion:1,actor:'DeepSeek',usage:{prompt_tokens:10000,prompt_cache_hit_tokens:9900}}]).optimized.targetMet,true);
  assert.equal(cacheSummary([{cacheVersion:1,actor:'DeepSeek'}]).optimized.targetMet,null);
});
test('同一 CLI 调用有多次用量事件时累加；缓存计数缺失不能变成零命中',()=>{
  const c={usageEvents:[{input_tokens:100,cached_input_tokens:90},{input_tokens:200,cached_input_tokens:180}]};assert.equal(callCacheUsage(c).ratio,.9);assert.equal(callCacheUsage(c).input,300);
  const t={};const first=codexUsageDelta(t,'x','session',{input_tokens:100,output_tokens:20});assert.ok(!Object.hasOwn(first,'cached_input_tokens'));
  const second=codexUsageDelta(t,'x','session',{input_tokens:250,output_tokens:35,cached_input_tokens:180},true);assert.equal(second.input_tokens,150);assert.ok(!Object.hasOwn(second,'cached_input_tokens'));assert.equal(callCacheUsage({usage:second}).known,false);
});
test('DeepSeek 定义工具顺序稳定；思考和工具结果原样追加到下一次请求',async()=>{
  const sent=[];const invoke=createDiscussionDeepseekAdapter({deepseekKey:'synthetic-key',deepseekModel:'deepseek-flash'},async(_url,options)=>{
    const request=JSON.parse(options.body);sent.push(request);const message=sent.length===1?{content:null,tool_calls:[{id:'proof',type:'function',function:{name:'a_read',arguments:'{}'}}]}:{content:'{"summary":"实际测试数据"}'};
    return new Response(JSON.stringify({id:'synthetic-response',choices:[{message,finish_reason:'stop'}],usage:{prompt_tokens:100,prompt_cache_hit_tokens:64,prompt_cache_miss_tokens:36}}));
  });
  await invoke({system:'固定规则 JSON',prompt:'共享状态',signal:new AbortController().signal,tools:['z_search','a_read'].map(name=>({type:'function',function:{name,parameters:{type:'object',properties:{}}}})),runTool:async()=>({actual:'fixture evidence'})});
  assert.deepEqual(sent[0].tools.map(t=>t.function.name),['a_read','z_search']);assert.deepEqual(sent[1].messages.slice(0,sent[0].messages.length),sent[0].messages);assert.equal(sent[1].messages.at(-1).role,'tool');
});
test('真实调度路径发送固定规则和增量上下文，独立票不透传另一方表态',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-cache-test-')),sent=[];let hub;
  const adapter=actor=>async args=>{const r=hub.rooms[0],s=hub.snapshot(r,r.activity.phase);sent.push({actor,phase:s.phase,prompt:args.prompt,system:args.system,stateless:args.stateless});args.onUsage({input_tokens:40,output_tokens:1,cached_input_tokens:20});
    return JSON.stringify({directiveHash:s.governance?.directiveHash||'',signals:[],rulesHash:s.rulesHash,revision:s.revision,proposalHash:s.proposal?.hash||'',acknowledged:true,summary:'依据同一方案及已有事实独立审议，确认结论和当前约束。',analysis:['challenge','synthesis'].includes(s.phase)?[{topic:'边界',position:'逐项检查约束',evidence:'测试固定事实',alternative:'缩小首版'}]:[],proposal:s.phase==='proposal'?'完整方案：只读核对当前项目与约束，以独立证据验证，再进入双方表决。':'',objections:[],close:[],replies:[],stance:s.phase==='vote'?'agree':'undecided',question:''});
  };
  hub=new DiscussionHub({dir,codex:adapter('Codex'),deepseek:adapter('DeepSeek')});t.after(async()=>{await hub.shutdown();const full=fs.realpathSync(dir);assert.ok(full.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'relay-cache-test-'));fs.rmSync(full,{recursive:true,force:true});});
  const r=hub.create({direction:'核对增量上下文实际进入双方请求',minRounds:2});await hub.start(r.id);await hub.live.get(r.id)?.promise;assert.equal(r.status,'consensus');
  const ds=sent.filter(c=>c.actor==='DeepSeek'&&c.phase==='challenge');assert.equal(ds[0].system,ds[1].system);assert.ok(ds[1].prompt.startsWith(ds[0].prompt+'\n'));
  const cx=sent.filter(c=>c.actor==='Codex'&&['proposal','synthesis'].includes(c.phase));assert.ok(cx[1].prompt.startsWith(cx[0].prompt+'\n'));
  for(const vote of sent.filter(c=>c.phase==='vote')){assert.ok(!vote.prompt.includes('"phase":"vote"')||!vote.prompt.includes('"stance":"agree"'));if(vote.actor==='Codex')assert.equal(vote.stateless,true);}
});
