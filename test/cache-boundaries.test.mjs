import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareCacheContext,CONTEXT_PROTOCOL} from '../cache-context.mjs';
import {createDiscussionDeepseekAdapter,createDeepseekAdapter} from '../adapters.mjs';
import {Workbench} from '../core.mjs';

const fixture=()=>({workspace:'fixture-project',rulesHash:'fixed-rules',modelProfile:{hash:'fixed-profile'}});
const state=()=>({phase:'challenge',revision:1,proposal:{text:'unchanged evidence '.repeat(500)},runtime:{mode:'read'},attachments:[]});
const response=()=>new Response(JSON.stringify({id:'unit-test-only',choices:[{finish_reason:'stop',message:{content:'{"summary":"unit-test-only"}'}}],usage:{prompt_tokens:20,prompt_cache_hit_tokens:0,prompt_cache_miss_tokens:20}}));

test('消息边界被冻结；重启后只追加增量消息，不移动旧 user 消息结束位置',()=>{
  let room=fixture();const first=prepareCacheContext(room,'DeepSeek:research',state()),before=structuredClone(first.messages);
  room=JSON.parse(JSON.stringify(room));const next=state();next.revision=2;next.runtime.mode='work';
  const second=prepareCacheContext(room,'DeepSeek:research',next);
  assert.deepEqual(second.messages.slice(0,before.length),before);
  assert.equal(second.messages.length,before.length+1);
  assert.ok(second.messages.at(-1).content.includes('/revision'));
  assert.ok(!second.messages.at(-1).content.includes('unchanged evidence'));
  assert.equal(second.messages.map(m=>m.content).join('\n'),second.text);
  assert.deepEqual(first.messages,before);
});

test('旧日志按一个完整消息迁移，避免把历史字符串重新切分破坏前缀',()=>{
  const room=fixture(),first=prepareCacheContext(room,'DeepSeek',state());delete room.cacheContexts['DeepSeek:dialogue'].segments;
  const next={...state(),revision:2},second=prepareCacheContext(room,'DeepSeek',next);
  assert.equal(second.messages[0].content,first.text);
  assert.equal(second.messages.length,2);
});

test('只续接当前角色的真实有效回复，不注入虚构确认，也不恢复旧表决',()=>{
  let room=fixture();const first=prepareCacheContext(room,'DeepSeek:research',state()),reply='{"summary":"actual validated role reply"}';first.rememberReply(reply);
  room=JSON.parse(JSON.stringify(room));const second=prepareCacheContext(room,'DeepSeek:research',{...state(),revision:2});
  assert.deepEqual(second.messages.map(m=>m.role),['user','assistant','user']);assert.equal(second.messages[1].content,reply);
  first.rememberReply('stale response');assert.ok(!JSON.stringify(room).includes('stale response'));
  const vote=prepareCacheContext(room,'DeepSeek:research',{phase:'vote',revision:2});vote.rememberReply('private vote');
  assert.equal(vote.messages.length,1);assert.ok(!JSON.stringify(room.cacheContexts).includes('private vote'));
});

test('实际 HTTP 请求构造跨轮保留完整消息前缀，工具键与顺序固定',async()=>{
  const sent=[],invoke=createDiscussionDeepseekAdapter({deepseekKey:'unit-test-only'},async(_url,opts)=>{sent.push(JSON.parse(opts.body));return response();}),room=fixture();
  const tools=['z_find','a_read'].map(name=>({type:'function',function:{name,description:'fixed',parameters:{properties:{z:{type:'string'},a:{type:'string'}},type:'object'}}}));
  for(let revision=1;revision<=2;revision++){
    const snapshot={...state(),revision},prepared=prepareCacheContext(room,'DeepSeek',snapshot),frozen=JSON.stringify(prepared.messages);
    const raw=await invoke({system:'Fixed JSON rules',prompt:prepared.text,contextMessages:prepared.messages,tools:revision===1?tools:[...tools].reverse(),signal:new AbortController().signal});prepared.rememberReply(raw);
    assert.equal(JSON.stringify(prepared.messages),frozen);
  }
  assert.deepEqual(sent[1].messages.slice(0,sent[0].messages.length),sent[0].messages);
  assert.equal(JSON.stringify(sent[0].tools),JSON.stringify(sent[1].tools));
  assert.equal(sent[0].messages[0].content,sent[1].messages[0].content);
});

test('图片留在固定首消息；附件变动明确重建检查点，独立票不带旧消息',async()=>{
  const sent=[],invoke=createDiscussionDeepseekAdapter({deepseekKey:'unit-test-only',deepseekModel:'deepseek-flash'},async(_url,opts)=>{sent.push(JSON.parse(opts.body));return response();}),room=fixture();
  for(let revision=1;revision<=2;revision++){
    const snapshot={...state(),revision,attachments:[{type:'image',hash:'same-image'}]},prepared=prepareCacheContext(room,'DeepSeek',snapshot);
    await invoke({system:'Fixed JSON rules',prompt:prepared.text,contextMessages:prepared.messages,images:[{dataUrl:'data:image/png;base64,unit-test-only'}],signal:new AbortController().signal});
  }
  assert.deepEqual(sent[1].messages.slice(0,sent[0].messages.length),sent[0].messages);
  const changed=prepareCacheContext(room,'DeepSeek',{...state(),attachments:[{type:'image',hash:'new-image'}]});
  assert.equal(changed.stats.reason,'configuration-changed');assert.equal(changed.messages.length,1);
  const vote=prepareCacheContext(room,'DeepSeek',{phase:'vote',revision:2});
  assert.equal(vote.messages.length,1);assert.equal(vote.stats.reason,'independent-vote');assert.ok(!vote.text.includes('unchanged evidence'));
});

test('工作台跨轮追加状态补丁，保留自身真实响应而不重复整份任务状态',async()=>{
  const task={workspace:'fixture-project'},sent=[],invoke=createDeepseekAdapter({deepseekKey:'unit-test-only'},async(_url,opts)=>{sent.push(JSON.parse(opts.body));return response();});
  for(let version=1;version<=2;version++)await invoke({task,unitId:'same-unit',instruction:'Verify evidence',context:JSON.stringify({requirement:'stable requirement '.repeat(1000),workspaceVersion:version}),signal:new AbortController().signal,beforeRequest:async()=>({}),onUsage:()=>{},onResponse:()=>{},onFailure:()=>{}});
  assert.deepEqual(sent[1].messages.slice(0,sent[0].messages.length),sent[0].messages);
  assert.equal(sent[1].messages.at(-2).role,'assistant');
  assert.ok(sent[1].messages.at(-1).content.includes('/shared/workspaceVersion'));
  assert.ok(!sent[1].messages.at(-1).content.includes('stable requirement'));
  assert.deepEqual(sent[0].tools.map(t=>t.function.name),sent[1].tools.map(t=>t.function.name));
});

test('容量边界生成冻结完整检查点，过大的新状态在发送前停止，不裁掉需求',async()=>{
  const task={workspace:'fixture-project',deepseekThreads:{unit:[{role:'system',content:'old'},{role:'user',content:'x'.repeat(400001)}]}},sent=[];
  const invoke=createDeepseekAdapter({deepseekKey:'unit-test-only'},async(_url,opts)=>{sent.push(JSON.parse(opts.body));return response();});
  const args={task,unitId:'unit',instruction:'Keep the requirement',context:JSON.stringify({requirement:'must remain',workspaceVersion:7}),signal:new AbortController().signal,beforeRequest:async()=>({}),onUsage:()=>{},onResponse:()=>{},onFailure:()=>{}};
  await invoke(args);assert.equal(sent[0].messages.length,2);
  const checkpoint=JSON.parse(sent[0].messages[1].content.slice(CONTEXT_PROTOCOL.length+1)).checkpoint;
  assert.equal(checkpoint.shared.requirement,'must remain');assert.equal(checkpoint.shared.workspaceVersion,7);assert.equal(task.deepseekThreadState.unit.reason,'transport-size');
  await assert.rejects(invoke({...args,context:JSON.stringify({requirement:'x'.repeat(360001)})}),/未截断/);assert.equal(sent.length,1);
});

test('大型工作台状态仍是完整 JSON，不能从字符串尾部切掉原始需求',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-cache-boundary-'));
  t.after(()=>{const resolved=fs.realpathSync(dir);assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'relay-cache-boundary-'));fs.rmSync(resolved,{recursive:true,force:true});});
  const w=new Workbench({dir,codex:()=>assert.fail(),deepseek:()=>assert.fail()}),task=w.create({prompt:'原始需求必须始终保留'});
  task.notes.push({text:'evidence '.repeat(21000)});const text=w.context(task),parsed=JSON.parse(text);
  assert.ok(text.length>160000);assert.equal(parsed.requirement,'原始需求必须始终保留');assert.equal(parsed.notes[0].text,task.notes[0].text);
});
