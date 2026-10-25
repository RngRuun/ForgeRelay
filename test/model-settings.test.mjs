import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ModelProfileStore,defaultSettings,validateSettings,deepseekParameters,codexParameters} from '../model-settings.mjs';
import {createDiscussionDeepseekAdapter} from '../adapters.mjs';
import {DiscussionHub} from '../discussion.mjs';
import {RuntimeHarness} from '../harness.mjs';

function directory(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'forge-model-test-'));t.after(()=>{const resolved=fs.realpathSync(dir);assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'forge-model-test-'));fs.rmSync(resolved,{recursive:true,force:true});});return dir;}
test('配置字段白名单、数值验证、并发冲突与持久化；不存入未知凭据',t=>{
 const dir=directory(t),store=new ModelProfileStore(dir),settings=defaultSettings();
 settings.deepseek.apiKey='synthetic-test-secret';settings.deepseek.maxTokens=32768;settings.codex.prompt='独立复核交付';
 const state=store.update({action:'save',name:'审查配置',settings,activate:true,revision:1,apiKey:'synthetic-test-secret'});
 assert.equal(state.profiles.length,2);assert.equal(store.snapshot().settings.codex.prompt,'独立复核交付');assert.ok(!fs.readFileSync(store.file,'utf8').includes('synthetic-test-secret'));
 assert.throws(()=>store.update({action:'activate',id:'default',revision:1}),/其他窗口/);
 assert.equal(new ModelProfileStore(dir).snapshot().hash,store.snapshot().hash);
 for(const bad of [NaN,Infinity,-1,1.5,131073,'12000']){const s=defaultSettings();s.deepseek.maxTokens=bad;assert.throws(()=>validateSettings(s),/输出上限/);}
 const bad=defaultSettings();bad.codex.model='model\n--unsafe';assert.throws(()=>validateSettings(bad),/模型 ID/);
 const previous=store.state.activeId;store.update({action:'delete',id:previous,revision:2});assert.ok(store.state.profiles.find(p=>p.id===previous).deletedAt);assert.notEqual(store.state.activeId,previous);
});
test('实际参数按模型模式发送，忽略不生效的采样项，CLI 参数没有 shell 拼接',()=>{
 const s=defaultSettings();s.deepseek.temperature=.25;s.deepseek.topP=.5;
 assert.deepEqual(deepseekParameters(s.deepseek,true),{model:'deepseek-flash',thinking:{type:'disabled'},max_tokens:12000,temperature:.25,tool_choice:'required'});
 s.deepseek.thinking=true;const thinking=deepseekParameters(s.deepseek,true);assert.equal(thinking.temperature,undefined);assert.equal(thinking.top_p,.95);assert.equal(thinking.reasoning_effort,'high');assert.equal(thinking.tool_choice,'auto');
 s.deepseek.model='deepseek-v4-pro';assert.equal(deepseekParameters(s.deepseek).top_p,undefined);s.deepseek.thinking=false;assert.equal(deepseekParameters(s.deepseek).top_p,.5);
 s.codex.model='custom-model';s.codex.effort='high';s.codex.verbosity='low';assert.deepEqual(codexParameters(s.codex),['--model','custom-model','-c','model_reasoning_effort="high"','-c','model_verbosity="low"']);
});
test('创建后固定配置快照，切换或修改全局配置不改变已有讨论与其子代理',async t=>{
 const dir=directory(t),store=new ModelProfileStore(dir),seen=[];
 const hub=new DiscussionHub({dir,getModelProfile:()=>store.snapshot(),harness:{enabledTools:()=>[],skills:[]},deepseek:async args=>{seen.push(args.task.modelProfile);return '{"summary":"test"}';},codex:async()=>''});
 const room=hub.create({direction:'验证固定模型配置与实际子代理继承'}),original=room.modelProfile.hash;
 const settings=defaultSettings();settings.deepseek.prompt='新的全局配置';store.update({action:'save',id:'default',name:'已更新',settings,revision:1});
 assert.equal(room.modelProfile.hash,original);assert.notEqual(store.snapshot().hash,original);
 await hub.subagent(room,'DeepSeek','检查配置',new AbortController().signal,1,true);
 assert.equal(seen[0].hash,original);assert.equal(seen[0].settings.deepseek.prompt,'');assert.equal(hub.create({direction:'后续新会话采用新的配置'}).modelProfile.hash,store.snapshot().hash);
});
test('DeepSeek 适配器真实请求体使用会话参数、角色提示词与工具回路的思考连续性',async()=>{
 const requests=[],settings=defaultSettings();settings.deepseek.model='deepseek-v4-pro';settings.deepseek.prompt='关注失败案例';settings.deepseek.thinking=true;settings.deepseek.effort='max';settings.deepseek.maxTokens=32768;
 const invoke=createDiscussionDeepseekAdapter({deepseekKey:'synthetic-only',deepseekModel:'ignored-global'},async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,headers:new Headers(),json:async()=>({id:'test',choices:[{message:requests.length===1?{content:null,reasoning_content:'synthetic-reasoning',tool_calls:[{id:'tool-1',function:{name:'read_file',arguments:'{}'}}]}:{content:'{"summary":"done"}'}}]})};});
 await invoke({task:{modelProfile:{settings}},system:'基础协议 JSON',prompt:'调查',signal:new AbortController().signal,tools:[{type:'function',function:{name:'read_file'}}],requireTool:true,runTool:async()=>({text:'actual fixture evidence'})});
 assert.equal(requests[0].model,'deepseek-v4-pro');assert.equal(requests[0].max_tokens,32768);assert.equal(requests[0].reasoning_effort,'max');assert.equal(requests[0].temperature,undefined);assert.equal(requests[0].tool_choice,'auto');assert.match(requests[0].messages[0].content,/基础协议 JSON/);assert.match(requests[0].messages[0].content,/关注失败案例/);assert.equal(requests[1].messages.find(m=>m.role==='assistant').reasoning_content,'synthetic-reasoning');
});
test('被关闭的共享工具同时从目录移除，并在服务端拒绝直接调用',async()=>{
 const settings=defaultSettings();settings.deepseek.tools={agents:false,skills:false,computer:false};
 const room={id:'fixture',modelProfile:{settings},runtime:{mode:'work',computer:'browser'},toolCalls:[]};const harness=new RuntimeHarness({});
 for(const name of ['spawn_agent','load_skill','read_skill_file','list_skills','computer_use']){assert.ok(!harness.enabledTools(room,false,'DeepSeek').some(t=>t.name===name));await assert.rejects(()=>harness.execute(room,'DeepSeek',name,{},new AbortController().signal),/配置中关闭/);}
 assert.ok(harness.enabledTools(room,false,'Codex').some(t=>t.name==='spawn_agent'));
});
test('旧会话首次采用模型配置时重新确认规则，接入失败时不改写旧表决',async t=>{
 const dir=directory(t),store=new ModelProfileStore(dir);let allowed=false;
 const hub=new DiscussionHub({dir,getModelProfile:()=>store.snapshot(),ready:async()=>{if(!allowed)throw Error('preflight failed');},codex:async()=>'',deepseek:async()=>''});
 const room=hub.create({direction:'旧会话迁移配置需要重新确认角色协议'});delete room.modelProfile;room.grounded={Codex:'old',DeepSeek:'old'};room.votes={Codex:{old:true}};room.stage='challenge_deepseek';
 await assert.rejects(()=>hub.start(room.id),/preflight failed/);assert.equal(room.modelProfile,undefined);assert.ok(room.votes.Codex);
 allowed=true;hub.launch=()=>{};await hub.start(room.id);assert.equal(room.modelProfile.hash,store.snapshot().hash);assert.deepEqual(room.votes,{});assert.deepEqual(room.grounded,{});assert.equal(room.stage,'ground_codex');
});
test('共享技能关闭时，子代理提示词也不自动加载选定技能内容',async t=>{
 const dir=directory(t),skillPath=path.join(dir,'SKILL.md');fs.writeFileSync(skillPath,'private-skill-test-marker');const settings=defaultSettings();settings.deepseek.tools.skills=false;let prompt='';
 const hub=new DiscussionHub({dir,getModelProfile:()=>({name:'关闭技能',hash:'fixture',settings}),harness:{skills:[{name:'test-skill',path:skillPath}],enabledTools:()=>[]},codex:async()=>'',deepseek:async args=>{prompt=args.prompt;return '{}';}});
 const room=hub.create({direction:'验证子代理的技能内容遵守模型工具配置'});room.enabledSkills=['test-skill'];await hub.subagent(room,'DeepSeek','调查',new AbortController().signal,1,true);assert.ok(!prompt.includes('private-skill-test-marker'));
});
