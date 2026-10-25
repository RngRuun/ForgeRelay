import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseCache} from '../cache-diagnostics.mjs';
import {CONTEXT_PROTOCOL} from '../cache-context.mjs';
import {cacheOverview,cacheTrend} from '../public/cache-usage.js';

function read(text){let state;for(const line of text.slice(CONTEXT_PROTOCOL.length+1).split('\n')){const e=JSON.parse(line);if(e.checkpoint)state=e.checkpoint;else for(const p of e.patch){assert.ok(['/phase','/feedback'].includes(p.path));state[p.path.slice(1)]=p.value;}}return state;}
function fixture(){const room={id:'diagnostic-fixture',workspace:'fixture-project',rules:'固定 JSON 规则',rulesHash:'fixture-hash',revision:2,tokens:321,calls:[],proposal:{hash:'proposal-hash',text:'真实业务方案'},modelProfile:{hash:'profile-fixture',settings:{deepseek:{model:'fixture-model',maxTokens:12000}}}};
  return {room,hub:{emit:()=>{},snapshot:(_room,phase)=>({phase,feedback:'',rulesHash:room.rulesHash,revision:room.revision,proposal:room.proposal,runtime:{mode:'work',computer:'desktop'}})}};
}
function response(s){return {directiveHash:s.governance?.directiveHash||'',signals:[],rulesHash:s.rulesHash,revision:s.revision,proposalHash:s.proposal.hash,acknowledged:true,summary:s.feedback+'，当前阶段 '+s.phase,analysis:[{topic:'状态',position:'仅核对最新状态',evidence:'共享快照',alternative:'无'}],objections:[],replies:[],close:[],proposal:'',question:'',stance:'undecided'};}
test('最近五次缓存趋势按 token 加权，未知计量和独立表决检查点可追溯',()=>{
  const calls=[{actor:'DeepSeek',usage:{prompt_tokens:99999,prompt_cache_hit_tokens:99999}},...Array.from({length:4},()=>({actor:'DeepSeek',usage:{prompt_tokens:100,prompt_cache_hit_tokens:20}})),{actor:'Codex',usage:{input_tokens:1000,cached_input_tokens:999}},{actor:'DeepSeek',usage:{prompt_tokens:600,prompt_cache_hit_tokens:500},contextCache:{mode:'checkpoint',reason:'independent-vote',promptChars:3000,sharedPrefixChars:0}}];
  const trend=cacheTrend(calls,'DeepSeek');assert.equal(trend.recent.calls,5);assert.equal(trend.recent.ratio,.58);assert.equal(trend.latest.context.reason,'independent-vote');assert.equal(trend.latest.usage.uncached,100);
  calls.push({actor:'DeepSeek',status:'failed'});const unknown=cacheTrend(calls,'DeepSeek');assert.equal(unknown.recent.unknownCalls,1);assert.equal(unknown.recent.targetMet,null);assert.equal(unknown.latest.usage.known,false);
  const rendered=cacheOverview(calls);assert.ok(rendered.includes('上下文缓存命中率'));assert.ok(rendered.includes('调用失败'));assert.ok(!rendered.includes('缓存损失定位'));assert.ok(!rendered.includes('本地字符复用'));
});
test('缓存诊断最多三次真实适配器边界，验证增量状态但不修改业务计量或方案',async()=>{
  const {room,hub}=fixture(),sent=[];const deepseek=async a=>{sent.push(a);const s=read(a.prompt);assert.equal(a.task.modelProfile.settings.deepseek.maxTokens,1024);assert.deepEqual(a.tools,[]);assert.equal(s.runtime.mode,'read');assert.equal(s.runtime.computer,'off');const o=a.beforeRequest();o.onUsage({prompt_tokens:1000,prompt_cache_hit_tokens:900,prompt_cache_miss_tokens:100,total_tokens:1010});o.onTrace('fixture-provider-id');o.onSuccess();return JSON.stringify(response(s));};
  const r=await diagnoseCache({hub,room,deepseek,signal:new AbortController().signal,settleMs:0});assert.equal(sent.length,3);assert.equal(r.status,'completed');assert.ok(sent[1].prompt.startsWith(sent[0].prompt+'\n'));assert.ok(r.calls.every(c=>c.stateValidated));assert.equal(r.metrics.ratio,.9);assert.equal(room.tokens,321);assert.equal(room.calls.length,0);assert.equal(room.proposal.hash,'proposal-hash');assert.equal(room.modelProfile.settings.deepseek.maxTokens,12000);
});
test('诊断状态错误或中断立即停止，保留失败与真实用量，不继续刷请求',async()=>{
  const {room,hub}=fixture();let count=0;const r=await diagnoseCache({hub,room,signal:new AbortController().signal,settleMs:0,deepseek:async a=>{count++;const o=a.beforeRequest();o.onUsage({prompt_tokens:1000,prompt_cache_hit_tokens:800,prompt_cache_miss_tokens:200});return JSON.stringify({...response(read(a.prompt)),revision:999});}});assert.equal(count,1);assert.equal(r.status,'failed');assert.equal(r.calls[0].status,'failed');assert.equal(r.metrics.cached,800);assert.equal(room.tokens,321);
  const stop=new AbortController();stop.abort();const stopped=await diagnoseCache({hub,room,deepseek:()=>assert.fail(),signal:stop.signal,settleMs:0});assert.equal(stopped.status,'interrupted');assert.equal(stopped.calls.length,0);
});
test('前端只显示服务端命中率和调用状态，不暴露后端诊断或付费探测入口',()=>{
  const rendered=cacheOverview([{actor:'DeepSeek',status:'failed',usage:{prompt_tokens:1000,prompt_cache_hit_tokens:500}}],[{status:'failed',calls:[],error:'<img src=x onerror=alert(1)>'}],{canCheck:true});assert.ok(rendered.includes('50.00%'));assert.ok(rendered.includes('调用失败'));assert.ok(rendered.includes('尚无调用'));assert.ok(!rendered.includes('<img'));assert.ok(!rendered.includes('cache-check'));assert.ok(!rendered.includes('优化后'));assert.ok(!rendered.includes('99%'));
});
test('没有配置快照的旧会话继承当前配置，诊断输出仍受 1024 tokens 限制',async()=>{
  const {room,hub}=fixture();delete room.modelProfile;hub.getModelProfile=()=>({hash:'active-profile',settings:{deepseek:{model:'current-test-model',maxTokens:32000}}});
  const run=await diagnoseCache({hub,room,signal:new AbortController().signal,settleMs:0,deepseek:async a=>{assert.equal(a.task.modelProfile.settings.deepseek.model,'current-test-model');assert.equal(a.task.modelProfile.settings.deepseek.maxTokens,1024);a.beforeRequest().onTrace('fixture',{model:'current-test-model',maxOutputTokens:1024});return JSON.stringify(response(read(a.prompt)));}});
  assert.equal(run.status,'completed');assert.ok(run.calls.every(c=>c.maxOutputTokens===1024));assert.equal(room.modelProfile,undefined);
});
