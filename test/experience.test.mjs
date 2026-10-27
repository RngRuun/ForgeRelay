import test from 'node:test';
import assert from 'node:assert/strict';
import {createDraftStore,readMigratedDraft,createRenderGate,createApiClient,messageCopyText} from '../public/experience.js';

test('草稿按会话与版本隔离，刷新可恢复，损坏数据或存储失败不覆盖旧草稿',()=>{
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const a=createDraftStore(storage,'fixture'),b=createDraftStore(storage,'other');
  assert.equal(a.write('room:one:1',{fields:{text:'人的隐性约束与未发出的意见'}}),true);
  assert.deepEqual(createDraftStore(storage,'fixture').read('room:one:1'),{fields:{text:'人的隐性约束与未发出的意见'}});
  assert.equal(a.read('room:two:1'),null);assert.equal(a.read('room:one:2'),null);assert.equal(b.read('room:one:1'),null);
  const broken=createDraftStore({...storage,setItem:()=>{throw Error('quota');}},'fixture');
  assert.equal(broken.write('room:one:1',{fields:{text:'new'}}),false);assert.match(a.read('room:one:1').fields.text,/隐性约束/);
  assert.equal(a.write('room:one:1',{text:'x'.repeat(250001)}),false);assert.match(a.read('room:one:1').fields.text,/隐性约束/);
  data.set('fixture:broken','not JSON');assert.equal(a.read('broken'),null);a.clear('room:one:1');assert.equal(a.read('room:one:1'),null);
});
test('旧会谈草稿迁移后不复活已发送内容，迁移写入失败保留旧稿',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},store=createDraftStore(storage,'migration'),draft={fields:{'intervention-text':'用户尚未发送的内容'}};
 store.write('old',draft);assert.deepEqual(readMigratedDraft(store,'chat',['old']),draft);assert.equal(store.read('old'),null);assert.deepEqual(store.read('chat'),draft);store.clear('chat');assert.equal(readMigratedDraft(store,'chat',['old']),null);
 store.write('old',draft);const full=createDraftStore({...storage,setItem:()=>{throw Error('quota');}},'migration');assert.deepEqual(readMigratedDraft(full,'chat',['old']),draft);assert.deepEqual(store.read('old'),draft);
});

test('中文输入与文本选择期间延后刷新，解锁后一次绘制最新状态，不丢事件',()=>{
  const pending=new Map();let id=0,state=0;const drawn=[];
  const gate=createRenderGate(()=>drawn.push(state),{schedule:fn=>{pending.set(++id,fn);return id;},cancel:key=>pending.delete(key)});
  const flush=()=>{const entries=[...pending.values()];pending.clear();for(const fn of entries)fn();};
  state=1;gate.request();state=2;gate.request();assert.equal(pending.size,1);flush();assert.deepEqual(drawn,[2]);
  gate.block('ime',true);state=3;gate.now();state=4;gate.request();assert.deepEqual(drawn,[2]);
  gate.block('reading',true);gate.block('ime',false);flush();assert.deepEqual(drawn,[2]);
  state=5;gate.block('reading',false);flush();assert.deepEqual(drawn,[2,5]);
  state=6;gate.request();state=7;gate.now();flush();assert.deepEqual(drawn,[2,5,7]);
});

test('后台刷新可以保留编辑节点，显式导航即使被输入法延后也不会被误当成后台更新',()=>{
  const frames=new Map(),modes=[];let sequence=0;
  const gate=createRenderGate(mode=>modes.push(mode.background),{schedule:fn=>{frames.set(++sequence,fn);return sequence;},cancel:id=>frames.delete(id)});
  const tick=()=>{const callbacks=[...frames.values()];frames.clear();for(const fn of callbacks)fn();};
  gate.request();tick();gate.now();
  gate.block('ime',true);gate.now();gate.request();gate.block('ime',false);tick();
  gate.request();tick();assert.deepEqual(modes,[true,false,false,true]);
});

test('服务重启后仅重试确定未执行的令牌拒绝；相同请求体、更新后的令牌只重发一次',async()=>{
  let token='old';const sent=[];
  const api=createApiClient({getToken:()=>token,setToken:value=>token=value,request:async(url,options)=>{
    sent.push({url,options});if(url==='/api/state')return Response.json({token:'new'});
    return options.headers['X-Relay-Token']==='old'?Response.json({error:'请刷新页面后重试'},{status:403}):Response.json({saved:true});
  }});
  const input={text:'完整人工约束'};assert.deepEqual(await api('/api/fixture',input),{saved:true});assert.equal(sent.length,3);
  assert.equal(sent[0].options.body,sent[2].options.body);assert.equal(sent[2].options.headers['X-Relay-Token'],'new');assert.deepEqual(input,{text:'完整人工约束'});
});

test('网络中断、运行错误或权限拒绝不自动重放写请求，避免重复任务与费用',async()=>{
  for(const failure of ['network',500,403]){
    let calls=0;const api=createApiClient({getToken:()=>'',setToken:()=>assert.fail(),request:async()=>{calls++;if(failure==='network')throw Error('network');return Response.json({error:failure===403?'来源不匹配':'执行失败'},{status:failure});}});
    await assert.rejects(api('/api/tasks',{prompt:'must not duplicate'}));assert.equal(calls,1);
  }
});

test('复制发言包含公开审查依据、反例、异议与完整方案，不读取私有字段',()=>{
  const result=messageCopyText({text:'公开结论',privateReasoning:'不得进入剪贴板',detail:{analysis:[{topic:'边界',position:'反对当前方案',evidence:'实际证据',alternative:'完整反例'}],objections:[{title:'遗漏',reason:'原因',change:'解决条件'}],replies:[{objectionId:'O1',response:'逐项回应'}],proposal:'完整方案文本'}});
  for(const text of ['公开结论','实际证据','完整反例','解决条件','逐项回应','完整方案文本'])assert.ok(result.includes(text));assert.ok(!result.includes('不得进入剪贴板'));
});
import {createLifecycleEventSource} from '../public/experience.js';
test('离页释放 SSE，浏览器后退恢复连接；显式关闭后不再重连',()=>{
 const created=[],target=new EventTarget();class Source{constructor(url){this.url=url;this.closed=false;created.push(this);}close(){this.closed=true;}}
 const channel=createLifecycleEventSource('/events',{target,EventSourceImpl:Source}),messages=[];channel.onmessage=event=>messages.push(event.data);created[0].onmessage({data:'first'});target.dispatchEvent(new Event('pagehide'));assert.equal(created[0].closed,true);created[0].onmessage({data:'stale'});assert.deepEqual(messages,['first']);target.dispatchEvent(new Event('pageshow'));assert.equal(created.length,2);created[1].onmessage({data:'restored'});assert.deepEqual(messages,['first','restored']);channel.close();assert.equal(created[1].closed,true);target.dispatchEvent(new Event('pageshow'));assert.equal(created.length,2);
});
