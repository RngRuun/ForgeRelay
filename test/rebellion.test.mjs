import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {defaultSettings,validateSettings,ModelProfileStore,roleGuidance} from '../model-settings.mjs';
import {createCodexAdapter,createDiscussionDeepseekAdapter} from '../adapters.mjs';
import {DiscussionHub,discussionSystem} from '../discussion.mjs';

test('双方叛逆值独立校验，旧配置兼容 50，偏好不是 API 采样参数',()=>{
  const s=defaultSettings();s.codex.rebellion=0;s.deepseek.rebellion=100;assert.equal(validateSettings(s).codex.rebellion,0);assert.equal(validateSettings(s).deepseek.rebellion,100);
  delete s.codex.rebellion;assert.equal(validateSettings(s).codex.rebellion,50);
  for(const bad of [-1,101,1.5,NaN,Infinity,'90',null]){s.deepseek.rebellion=bad;assert.throws(()=>validateSettings(s),/叛逆值/);}
  assert.match(roleGuidance('',0),/协作取向/);assert.match(roleGuidance('',100),/高度反对倾向/);assert.match(roleGuidance('',100),/不得编造缺陷/);
});
test('实际两方适配器传输各自叛逆指令，不互相串值，子代理使用同一配置快照',async()=>{
  const settings=defaultSettings();settings.codex.rebellion=10;settings.deepseek.rebellion=95;let codexInput='',request;
  const spawnProcess=()=>{const p=new EventEmitter();p.stdout=new PassThrough();p.stderr=new PassThrough();p.stdin=new PassThrough();p.stdin.on('data',d=>codexInput+=d);p.stdin.on('finish',()=>queueMicrotask(()=>{p.stdout.write(JSON.stringify({type:'thread.started',thread_id:'fixture'})+'\n');p.stdout.write(JSON.stringify({type:'turn.completed',usage:{input_tokens:100,output_tokens:10,cached_input_tokens:0}})+'\n');p.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'fixture-result'}})+'\n');p.emit('close',0);}));p.kill=()=>{};return p;};
  const task={workspace:os.tmpdir(),modelProfile:{settings}};
  await createCodexAdapter({bin:'fixture',root:os.tmpdir(),config:{},spawnProcess})({task,prompt:'复杂代码由 Codex 实施',signal:new AbortController().signal,stateless:true,channel:'agent-fixture',onUsage:()=>{},onTrace:()=>{},onEvent:()=>{}});
  assert.match(codexInput,/叛逆值 10\/100/);assert.ok(!codexInput.includes('叛逆值 95/100'));
  const adapter=createDiscussionDeepseekAdapter({deepseekKey:'synthetic-only-key'},async(_url,options)=>{request=JSON.parse(options.body);return new Response(JSON.stringify({id:'fixture',model:'fixture',usage:{prompt_tokens:10,prompt_cache_hit_tokens:0},choices:[{message:{content:'{"summary":"fixture"}'},finish_reason:'stop'}]}));});
  await adapter({task,system:'子代理角色 JSON',prompt:'独立复核 Codex 代码',signal:new AbortController().signal});assert.match(request.messages[0].content,/叛逆值 95\/100/);assert.ok(!Object.hasOwn(request,'rebellion'));assert.ok(!request.messages[0].content.includes('叛逆值 10/100'));
  assert.match(discussionSystem({rules:'fixture'},'Codex'),/复杂代码、算法\/模型更新/);assert.match(discussionSystem({rules:'fixture'},'Codex'),/质疑并独立验证 DeepSeek/);
});
test('明确应用配置保留交付与异议，作废旧投票、重建角色缓存；运行中拒绝修改',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-rebellion-test-')),store=new ModelProfileStore(dir),hub=new DiscussionHub({dir,getModelProfile:()=>store.snapshot(),codex:async()=>'',deepseek:async()=>''});
  t.after(async()=>{await hub.shutdown();const p=fs.realpathSync(dir);assert.ok(p.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'relay-rebellion-test-'));fs.rmSync(p,{recursive:true,force:true});});
  const r=hub.create({direction:'在不丢失实际交付的情况下调整审议风格'});r.workItems=[{id:'accepted',status:'accepted'}];r.objections=[{id:'O1',status:'open'}];r.votes={Codex:{stance:'agree'}};r.grounded={Codex:r.rulesHash};r.status='paused';r.cacheContexts={old:'fixture'};const original=structuredClone({work:r.workItems,objections:r.objections,human:r.human});
  const settings=defaultSettings();settings.codex.rebellion=75;settings.deepseek.rebellion=100;store.update({action:'save',id:'default',name:'强审查',settings,revision:1});assert.equal(r.modelProfile.settings.codex.rebellion,50);
  hub.setProfile(r.id,store.snapshot());assert.equal(r.modelProfile.settings.codex.rebellion,75);assert.equal(r.modelProfile.settings.deepseek.rebellion,100);assert.deepEqual(r.votes,{});assert.deepEqual(r.grounded,{});assert.deepEqual(r.cacheContexts,{});assert.equal(r.stage,'ground_codex');assert.deepEqual(r.workItems,original.work);assert.deepEqual(r.objections,original.objections);assert.deepEqual(r.human,original.human);assert.equal(r.calls.length,0);
  r.status='running';assert.throws(()=>hub.setProfile(r.id,store.snapshot()),/先暂停/);r.status='paused';
});
