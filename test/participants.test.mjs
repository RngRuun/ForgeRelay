import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {defaultSettings,validateSettings} from '../model-settings.mjs';
import {verifyParticipants,modelRequirements} from '../model-readiness.mjs';
import {activeProviders,leaderProvider,participantsReady} from '../public/participants.js';
import {Workbench,completionProblems} from '../core.mjs';
import {hash} from '../workspace.mjs';
import {RuntimeHarness} from '../harness.mjs';
import {WorkDelegator} from '../delegation.mjs';
import {networkSceneLayout} from '../public/floating-diagrams.js';
import {createDeepseekAdapter} from '../adapters.mjs';
const profileFor=provider=>{const settings=defaultSettings();settings.collaboration.team.forEach(a=>a.provider=provider);return{name:'test-only',hash:'test-'+provider,settings:validateSettings(settings)};};
test('单供应商团队有效，未参与模型的密钥、登录和目录不阻塞启动',async()=>{
 for(const provider of ['Codex','DeepSeek']){
   const profile=profileFor(provider),calls=[];assert.deepEqual(activeProviders(profile),[provider]);assert.equal(leaderProvider(profile),provider);
   await verifyParticipants(profile,profile,{hasDeepseekKey:provider==='DeepSeek',checkCodex:async()=>{calls.push('Codex');return{authenticated:provider==='Codex'};},checkDeepseek:async()=>{calls.push('DeepSeek');return{models:[profile.settings.deepseek.model]};}});
   assert.deepEqual(calls,[provider]);assert.equal(participantsReady(profile,{codex:{authenticated:provider==='Codex'},deepseek:{ok:provider==='DeepSeek'}}),true);
   const scene=networkSceneLayout(provider,false,[provider]);assert.deepEqual(scene.nodes.filter(n=>n.actor).map(n=>n.actor),[provider]);assert.ok(scene.edges.every(e=>scene.nodes.some(n=>n.id===e.from)&&scene.nodes.some(n=>n.id===e.to)));
 }
});
test('只校验角色实际使用的 DeepSeek 型号，仍拒绝参与模型的无效凭据或型号',async()=>{
 const profile=profileFor('DeepSeek');profile.settings.deepseek.model='unused-base';profile.settings.collaboration.team.forEach(a=>a.model='selected-role-model');
 assert.deepEqual(modelRequirements(profile).models,['selected-role-model']);
 const dependencies={hasDeepseekKey:true,checkCodex:async()=>{throw Error('不应检查 Codex');},checkDeepseek:async()=>({models:['selected-role-model']})};await verifyParticipants(profile,profile,dependencies);
 await assert.rejects(verifyParticipants(profile,profile,{...dependencies,hasDeepseekKey:false}),/API Key/);
 await assert.rejects(verifyParticipants(profile,profile,{...dependencies,checkDeepseek:async()=>({models:[],message:'测试型号不存在'})}),/型号不存在/);
 await assert.rejects(verifyParticipants(profileFor('Codex'),profileFor('Codex'),{...dependencies,checkCodex:async()=>({authenticated:false})}),/尚未登录/);
});
test('单供应商会谈不暴露双模型派工，直接调用也不能绕过',async()=>{
 const room={modelProfile:profileFor('Codex'),runtime:{mode:'work'},activity:{phase:'synthesis'}};
 const harness=new RuntimeHarness({});assert.ok(!harness.enabledTools(room,false,'Codex').some(t=>['delegate_task','retry_task','review_task'].includes(t.name)));assert.ok(harness.enabledTools(room,false,'Codex').some(t=>t.name==='spawn_agent'));
 const d=new WorkDelegator({});await assert.rejects(d.execute(room,'Codex','delegate_task',{},new AbortController().signal,0,false),/未启用双模型派工/);
});
test('DeepSeek 主持适配器发送独立 JSON 调度协议，不混入固定 Codex 主持提示',async()=>{
 const bodies=[],adapter=createDeepseekAdapter({deepseekKey:'test-only-not-a-real-key'},async(_url,options)=>{bodies.push(JSON.parse(options.body));return new Response(JSON.stringify({id:'test-only-id',choices:[{message:{content:'{"action":"plan"}'},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:5}}),{headers:{'Content-Type':'application/json'}});});
 const task={modelProfile:profileFor('DeepSeek')},common={task,signal:new AbortController().signal,unitId:'director',systemPrompt:'你是当前团队负责人 DeepSeek，只输出 JSON。',json:true,tools:[],beforeRequest:async()=>({}),onUsage:()=>{},onResponse:()=>{},onFailure:()=>{}};
 await adapter({...common,instruction:'当前第 1 步',context:'{"step":1}'});const prefix=structuredClone(bodies[0].messages);await adapter({...common,instruction:'当前第 2 步',context:'{"step":2}'});
 assert.deepEqual(bodies[0].response_format,{type:'json_object'});assert.equal(bodies[0].tools,undefined);assert.match(bodies[0].messages[0].content,/负责人 DeepSeek/);assert.ok(!bodies[0].messages[0].content.includes('最终验收由 Codex'));assert.deepEqual(bodies[1].messages.slice(0,prefix.length),prefix);
});
const action=(action,extra={})=>({action,summary:'实际调度的测试依据',taskId:'',instruction:'',tasks:[],acceptance:[],proposalId:'',issueId:'',resolution:'',final:'',...extra});
test('单 Codex 恢复会话只追加差异；CLI 会话丢失或独立复查时发送完整最新状态',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-prefix-session-'));t.after(()=>{const target=fs.realpathSync(dir);assert.ok(target.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'relay-prefix-session-'));fs.rmSync(target,{recursive:true,force:true});});
 const sent=[],w=new Workbench({dir,getModelProfile:()=>profileFor('Codex'),codex:async args=>{sent.push(args);args.task.sessions||={};if(!args.stateless)args.task.sessions[args.channel]='synthetic-session';return '测试真实调用形状，不发起推理';},deepseek:async()=>assert.fail('不能调用未参与模型')});
 const task=w.create({prompt:'不变需求_'+('完整验收条件与项目约束。'.repeat(300))}),signal=new AbortController().signal,options={systemPrompt:'固定负责人协议，必须保留证据和验收。',channel:'director',readOnly:true};
 await w.callProvider(task,'Codex','第一步决策',signal,'director','direct',options);assert.ok(sent[0].prompt.includes(task.prompt));assert.ok(sent[0].prompt.includes('"checkpoint"'));
 task.inputs.push({id:'human-new',text:'新的人类条件：只允许本地存储。'});await w.callProvider(task,'Codex','第二步决策',signal,'director','direct',options);
 assert.ok(sent[1].prompt.startsWith('{"patch":'));assert.ok(!sent[1].prompt.includes(task.prompt));assert.ok(sent[1].prompt.includes('只允许本地存储'));assert.ok(sent[1].prompt.length<sent[0].prompt.length/3);
 delete task.sessions.director;await w.callProvider(task,'Codex','恢复后的决策',signal,'director','direct',options);assert.ok(sent[2].prompt.includes(task.prompt)&&sent[2].prompt.includes('只允许本地存储'));assert.ok(sent[2].prompt.includes('"checkpoint"'));
 await w.callProvider(task,'Codex','独立复查',signal,'review','review',{...options,stateless:true});assert.ok(sent[3].prompt.includes(task.prompt)&&sent[3].prompt.includes('"checkpoint"'));assert.equal(sent[3].stateless,true);
});
for(const provider of ['Codex','DeepSeek'])test(`${provider} 单供应商工作台真实写入、独立复查、验收，不调用另一方`,async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-participants-'));t.after(()=>{const target=fs.realpathSync(dir);assert.ok(target.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'relay-participants-'));fs.rmSync(target,{recursive:true,force:true});});
 const tasks=[{id:'build',title:'实际实施',owner:provider,dependsOn:[]},{id:'review',title:'独立复查',owner:provider,dependsOn:['build']}],acceptance=[{id:'a',title:'实际文件经过复查',evidence:''}];
 const queue=[action('plan',{tasks,acceptance}),action('execute',{taskId:'build',instruction:'写入实际成果'}),action('review',{taskId:'review',instruction:'独立读取成果，核对原始需求'}),action('accept_task',{taskId:'review',resolution:'独立核对了当前实际文件'}),action('complete',{acceptance:[{...acceptance[0],evidence:'实际文件和复查调用记录'}],final:'真实成果 result.txt 已验收'})];
 const sent=[];
 const codex=async args=>{assert.equal(provider,'Codex','不应调用未参加的 Codex');sent.push(args.purpose);args.onTrace('test-only-codex');args.onUsage({input_tokens:10,output_tokens:2});if(args.purpose==='direct')return JSON.stringify(queue.shift());if(args.purpose==='execute')fs.writeFileSync(path.join(args.task.workspace,'result.txt'),'真实测试成果');if(args.purpose==='review'){assert.equal(args.stateless,true);assert.ok(args.prompt.includes('真实测试成果'));}return '已实际执行与核对';};
 const deepseek=async args=>{assert.equal(provider,'DeepSeek','不应调用未参加的 DeepSeek');sent.push(args.purpose);const c=await args.beforeRequest();args.onUsage(c,{prompt_tokens:10,completion_tokens:2});args.onResponse(c,'test-only-deepseek');if(args.purpose==='direct'){assert.deepEqual(args.tools,[]);assert.equal(args.json,true);return{text:JSON.stringify(queue.shift())};}if(args.purpose==='execute'){const r=await args.runTool('write_file',{path:'result.txt',base_hash:hash(''),content:'真实测试成果'});assert.equal(r.written,true);}if(args.purpose==='review'){const r=await args.runTool('read_file',{path:'result.txt'});assert.ok(r.content.includes('真实测试成果'));const denied=await args.runTool('write_file',{path:'result.txt',base_hash:hash('真实测试成果'),content:'不应写入'});assert.ok(denied.error);}return{text:'实际成果和核验依据'};};
 const w=new Workbench({dir,codex,deepseek,getModelProfile:()=>profileFor(provider)}),task=w.create({prompt:'实现只使用指定供应商的真实任务'});w.start(task.id);
 for(let i=0;i<100&&w.active;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(task.status,'completed',task.error);assert.equal(fs.readFileSync(path.join(task.workspace,'result.txt'),'utf8'),'真实测试成果');assert.ok(task.calls.every(c=>c.actor===provider));assert.ok(sent.includes('execute')&&sent.includes('review'));assert.deepEqual(completionProblems(task),[]);
 const other=provider==='Codex'?'DeepSeek':'Codex';await assert.rejects(w.callProvider(task,other,'不应调用',new AbortController().signal,'forbidden','execute'),/未启用/);
});
