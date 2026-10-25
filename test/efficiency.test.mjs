import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {createDiscussionDeepseekAdapter} from '../adapters.mjs';
import {prepareCacheContext} from '../cache-context.mjs';import {defaultSettings} from '../model-settings.mjs';
import {conversationSnapshot} from '../conversation-context.mjs';import {publicRoom} from '../public-state.mjs';
import {executeToolBatch,validateProviderHistory} from '../provider-history.mjs';
import {createStateBroadcast} from '../state-broadcast.mjs';import {createReadinessProbe} from '../model-readiness.mjs';
import {createChatSender} from '../public/experience.js';

test('DeepSeek 跨轮完整续接真实工具结果和思考字段，HTTP 前缀不变且私有数据不公开',async()=>{
 const sent=[],settings=defaultSettings();settings.deepseek.thinking=true;const room={workspace:'fixture',rulesHash:'fixed',modelProfile:{hash:'fixed',settings},calls:[],messages:[]};
 const final=JSON.stringify({reply:'已核对完整原始证据',complexity:2,discussionReason:'',discussionQuestion:''});
 const invoke=createDiscussionDeepseekAdapter({deepseekKey:'test-only'},async(_,options)=>{
   const body=JSON.parse(options.body);sent.push(body);
   const message=sent.length===1?{role:'assistant',content:null,reasoning_content:'PRIVATE_NATIVE_FIELD_1',tool_calls:[{id:'read-1',type:'function',function:{name:'read_file',arguments:'{"path":"a.txt"}'}}]}:{role:'assistant',content:final,reasoning_content:'PRIVATE_NATIVE_FIELD_2'};
   return new Response(JSON.stringify({id:'test-only',choices:[{message,finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:20}}));
 });
 const tools=[{type:'function',function:{name:'read_file',parameters:{type:'object',properties:{}}}}],evidence='FULL_TOOL_EVIDENCE_'.repeat(600);
 for(let revision=1;revision<=2;revision++){
   const context=prepareCacheContext(room,'DeepSeek:chat:lead',{phase:'chat',revision,attachments:[]});let exchange;
   const raw=await invoke({task:room,system:'Fixed JSON rules',prompt:context.text,contextMessages:context.messages,onExchange:value=>exchange=value,signal:new AbortController().signal,tools,runTool:async()=>({evidence})});
   context.rememberReply(raw,exchange);
 }
 assert.equal(sent.length,3);assert.deepEqual(sent[2].messages.slice(0,sent[1].messages.length),sent[1].messages);
 assert.equal(sent[2].messages.find(m=>m.role==='tool').content,JSON.stringify({evidence}));
 assert.deepEqual(sent[2].messages.filter(m=>m.role==='assistant').map(m=>m.reasoning_content),['PRIVATE_NATIVE_FIELD_1','PRIVATE_NATIVE_FIELD_2']);
 assert.ok(!JSON.stringify(publicRoom(room)).includes('PRIVATE_NATIVE_FIELD'));assert.ok(!JSON.stringify(publicRoom(room)).includes(evidence));
 validateProviderHistory(sent[2].messages.slice(1));
});

test('工具调用和结果必须配对；旧请求不能向新上下文提交回包',()=>{
 assert.throws(()=>validateProviderHistory([{role:'user',content:'goal'},{role:'tool',content:'orphan',tool_call_id:'unknown'}]),/对应/);
 const room={workspace:'fixed',rulesHash:'r'},first=prepareCacheContext(room,'DeepSeek',{phase:'chat',revision:1});
 const next=prepareCacheContext(room,'DeepSeek',{phase:'chat',revision:2});first.rememberReply('stale');assert.ok(!JSON.stringify(room.cacheContexts).includes('stale'));
 next.rememberReply('valid');next.rememberReply('duplicate');assert.ok(!JSON.stringify(room.cacheContexts).includes('duplicate'));
});

test('独立只读工具并发最多三个，修改工具作为顺序屏障且回包顺序固定',async()=>{
 const names=['read_file','search_files','read_image','list_files','write_file','read_file','computer_use','read_file'];
 const calls=names.map((name,i)=>({id:String(i),function:{name,arguments:JSON.stringify({i})}})),events=[];let active=0,peak=0;
 const results=await executeToolBatch(calls,async(name,{i})=>{events.push('start:'+i);active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;events.push('end:'+i);return {name,i};},new AbortController().signal);
 assert.equal(peak,3);assert.deepEqual(results.map(x=>x.i),names.map((_,i)=>i));
 assert.ok(events.indexOf('start:4')>events.indexOf('end:3'));assert.ok(events.indexOf('start:5')>events.indexOf('end:4'));assert.ok(events.indexOf('start:7')>events.indexOf('end:6'));
});

test('工具批次错误隔离，停止后不再调度待执行工具并等待在途工具结束',async()=>{
 const names=['read_file','search_files','list_files','read_image','write_file'],calls=names.map((name,i)=>({function:{name,arguments:JSON.stringify({i})}})),controller=new AbortController();let started=0,finished=0;
 await assert.rejects(executeToolBatch(calls,async(_,{i})=>{started++;await new Promise(r=>setImmediate(r));if(i===0)controller.abort('stop');finished++;return i;},controller.signal),/stop/);
 assert.equal(started,3);assert.equal(finished,3);
 const failure=await executeToolBatch([calls[0]],async()=>{throw Error('real failure');},new AbortController().signal);assert.deepEqual(failure,[{error:'real failure'}]);
});

test('聊天上下文无损去重，同时保留 INITIAL 前提、裁决、完整历史和工具证据',()=>{
 const human='原始用户目标与约束'.repeat(200),command='original full command '.repeat(300),messages=[{id:'h',actor:'Human',phase:'direction',text:human},{id:'c',actor:'Codex',phase:'command',text:command},{id:'ack',actor:'Codex',phase:'ground',text:'protocol acknowledgement'},{id:'chat',actor:'Codex',phase:'chat',text:'substantive answer'},...['coordination','preferences'].map(phase=>({actor:'System',phase,text:'scheduler metadata'}))];
 const room={messages,human:[{text:human},{text:'遗留但必须保留的补充条件'}],governance:{initial:{direction:human,premises:'数据不能离开本机'},history:[{action:'OVERRULE',text:'采用本地方案',objectionIds:['O1'],revision:2}],team:[]},conversation:{lastRequestId:'h',settingsVersion:1,complexityThreshold:4},minRounds:3,maxRounds:5};
 const original=structuredClone(room),snapshot=conversationSnapshot({snapshot:()=>({human:room.human,nativeEvidence:[{text:command}],toolEvidence:[{result:'真实工具输出'}],round:9,transcript:messages})},room,{id:'lead',provider:'Codex',focus:'完成用户目标'});
 assert.equal(snapshot.human.length,1);assert.equal(snapshot.human[0].text,'遗留但必须保留的补充条件');assert.equal(snapshot.transcript.find(m=>m.id==='c').text,command);assert.equal(snapshot.transcript.find(m=>m.id==='chat').text,'substantive answer');
 assert.equal(snapshot.humanConstraints.initial.premises,'数据不能离开本机');assert.deepEqual(snapshot.humanConstraints.interventions[0].objectionIds,['O1']);assert.equal(snapshot.toolEvidence[0].result,'真实工具输出');
 assert.ok(!JSON.stringify(snapshot).includes('scheduler metadata'));assert.ok(!Object.hasOwn(snapshot,'nativeEvidence'));assert.deepEqual(room,original);
});

function broadcastFixture(){let callback,serializations=0,state=0;const timers={setTimer:fn=>{callback=fn;return 1;},clearTimer:()=>callback=null};const clients=new Set(),sender=createStateBroadcast(clients,()=>{serializations++;return String(state);},timers);return {clients,sender,tick:()=>{const fn=callback;callback=null;fn?.();},state:n=>state=n,count:()=>serializations};}
test('状态推送合并突发更新，无订阅时不启动计时或序列化',()=>{
 const f=broadcastFixture(),client=new EventEmitter(),values=[];client.write=value=>{values.push(value);return true;};f.sender.schedule();f.tick();assert.equal(f.count(),0);f.clients.add(client);
 for(let n=1;n<=100;n++){f.state(n);f.sender.schedule();}assert.equal(f.count(),0);f.tick();assert.deepEqual(values,['100']);assert.equal(f.count(),1);f.sender.close();
});
test('慢连接只保留最新完整状态，断开连接和关闭服务均清理监听',()=>{
 const f=broadcastFixture(),client=new EventEmitter(),values=[];let writable=false;client.write=value=>{values.push(value);return writable;};f.clients.add(client);
 f.state(1);f.sender.schedule();f.tick();for(const n of [2,3]){f.state(n);f.sender.schedule();f.tick();}assert.deepEqual(values,['1']);writable=true;client.emit('drain');assert.deepEqual(values,['1','3']);
 writable=false;f.state(4);f.sender.schedule();f.tick();f.sender.close();assert.equal(client.listenerCount('drain'),0);assert.equal(client.listenerCount('close'),0);
});
test('Codex 登录探测合并并发并短期复用，失败不缓存、手动检查可强制刷新',async()=>{
 let time=0,calls=0,authenticated=true;const probe=createReadinessProbe(async()=>{calls++;return {authenticated};},{now:()=>time,ttl:60});
 await Promise.all([probe(),probe(),probe()]);assert.equal(calls,1);time=30;await probe();assert.equal(calls,1);await probe({force:true});assert.equal(calls,2);
 time=100;authenticated=false;await probe();await probe();assert.equal(calls,4);
});
test('发送网络失败重试保持请求 ID，成功后的新消息重新生成 ID',async()=>{
 let ids=0,fail=true;const sent=[],send=createChatSender(async(_,body)=>{sent.push(body);if(fail){fail=false;throw Error('connection interrupted');}return {accepted:true};},{newId:()=>`request-${++ids}`});
 await assert.rejects(send({id:'room',revision:1},'你好'));await send({id:'room',revision:2},'你好');await send({id:'room',revision:2},'你好');
 assert.equal(sent[0].clientRequestId,sent[1].clientRequestId);assert.notEqual(sent[1].clientRequestId,sent[2].clientRequestId);
});
