import test from 'node:test';
import assert from 'node:assert/strict';
import {collectTelemetry,chartSeries,telemetryView} from '../public/telemetry.js';
import {topologyRoles,teamTopology} from '../public/team-topology.js';
test('telemetry keeps unknown usage as gaps and counts only actual running requests',()=>{
  const room={id:'r1',status:'running',calls:[{id:'a',actor:'Codex',status:'success',tokens:30,usageKnown:true,started:'2026-10-24T00:00:00Z'},{id:'b',actor:'DeepSeek',status:'failed',tokens:0,usageKnown:false,started:'2026-10-24T00:00:01Z'},{id:'c',actor:'DeepSeek',status:'running',tokens:0,started:'2026-10-24T00:00:02Z'}],processes:[{status:'running'},{status:'stopped'}],agents:[{status:'running'}]};
  const result=collectTelemetry([room,{...room,id:'deleted',deletedAt:'yes'}]);
  assert.equal(result.total,3);assert.equal(result.tokens,30);assert.equal(result.unknown,2);assert.equal(result.live.length,1);assert.equal(result.providers.DeepSeek.active,1);assert.equal(result.processes,1);assert.equal(result.agents,1);
  assert.deepEqual(chartSeries(result.calls).map(x=>x.tokens),[30,null,null]);
  assert.deepEqual(chartSeries(result.calls,2).map(x=>x.count),[2,3]);
  assert.equal(collectTelemetry([{...room,status:'interrupted'}]).live.length,0);
  assert.equal(telemetryView([]).includes('尚无调用记录'),true);
});
test('telemetry never turns missing provider cache counters into a measured hit rate',()=>{
  const t=collectTelemetry([{id:'a',calls:[{actor:'DeepSeek',status:'success',tokens:150,usage:{prompt_tokens:100,completion_tokens:50}}]}]);
  assert.equal(t.cache.actors.DeepSeek.ratio,null);assert.equal(t.cache.actors.DeepSeek.unknownCalls,1);
  const measured=collectTelemetry([{id:'a',calls:[{actor:'DeepSeek',status:'success',tokens:150,usage:{prompt_tokens:100,prompt_cache_hit_tokens:90,prompt_cache_miss_tokens:10}}]}]);
  assert.equal(measured.cache.actors.DeepSeek.ratio,.9);
});
test('team topology derives leader, parameters and navigation targets from editable configuration',()=>{
  const c={leaderId:'research',minRounds:2,maxRounds:4,highDisagreement:true,team:[{id:'lead',name:'实现',provider:'Codex',focus:'修改代码'},{id:'research',name:'研究',provider:'DeepSeek',focus:'读取证据'},{id:'critic',name:'反方',provider:'Codex',focus:'提出反例'}]};
  const before=JSON.stringify(c),roles=topologyRoles(c);assert.equal(roles.filter(a=>a.lead).length,1);assert.equal(roles.find(a=>a.lead).id,'research');assert.ok(roles.every(a=>a.x>=0&&a.x<=100&&a.y>=0&&a.y<=100));
  const html=teamTopology(c,{selected:'critic',settings:{codex:{rebellion:75},deepseek:{rebellion:25}}});
  assert.match(html,/data-team-role="critic"/);assert.match(html,/aria-label="调整 Codex 模型参数，叛逆值 75"/);assert.match(html,/aria-label="设置互审边界，当前 2 至 4 轮"/);assert.match(html,/data-topology-action="human"/);assert.equal(JSON.stringify(c),before);
});
