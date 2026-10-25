import test from 'node:test';
import assert from 'node:assert/strict';
import {publicTask,publicRoom} from '../public-state.mjs';

test('任务实时推送不再携带大段后台缓存日志；模型上下文与持久化对象完整保留',()=>{
  const task={id:'fixture',prompt:'完整需求',cacheContexts:{journal:'历史'.repeat(120000)},deepseekThreads:{private:[{content:'完整模型输入'}]},calls:[{usage:{input_tokens:200,cached_input_tokens:128}}],board:[{id:'T1',status:'done'}],modelProfile:{settings:{codex:{effort:'max'},deepseek:{maxTokens:32000}}}};
  const before=JSON.stringify(task),view=publicTask(task);
  assert.ok(!Object.hasOwn(view,'cacheContexts'));assert.ok(!Object.hasOwn(view,'deepseekThreads'));
  assert.deepEqual(view.calls,task.calls);assert.deepEqual(view.board,task.board);assert.deepEqual(view.modelProfile,task.modelProfile);assert.equal(view.prompt,task.prompt);assert.equal(JSON.stringify(task),before);
  assert.ok(Buffer.byteLength(JSON.stringify(view))<Buffer.byteLength(before)/100);
});

test('会谈界面保留发言、所有异议、人的约束、角色及用量，只省去后台历史封装',()=>{
  const room={id:'fixture',rules:'固定完整规则',rulesHash:'hash',ruleHistory:[{rules:'旧规则'}],modelProfileHistory:[{profile:'old'}],cacheContexts:{journal:'完整日志'},human:[{text:'不能改变的约束'}],messages:[{text:'完整观点',detail:{analysis:[{evidence:'完整依据'}]}}],objections:[{id:'O1',status:'open'}],governance:{team:[{id:'critic'}],history:[{action:'INITIAL'}]},modelProfile:{hash:'current'},calls:[{usage:{prompt_tokens:100,prompt_cache_hit_tokens:50}}],workItems:[{acceptance:['实际验收标准']}],attachments:[{id:'a1',hash:'version'}]};
  const original=structuredClone(room),view=publicRoom(room);
  for(const key of ['rulesHash','human','messages','objections','governance','modelProfile','calls','workItems','attachments'])assert.deepEqual(view[key],room[key]);
  for(const key of ['rules','ruleHistory','modelProfileHistory','cacheContexts'])assert.ok(!Object.hasOwn(view,key));
  assert.deepEqual(room,original);
});
