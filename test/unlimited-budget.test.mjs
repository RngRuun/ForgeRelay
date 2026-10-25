import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {budgetReached,budgetExceeded,budgetLimit,limitText,roundRange,budgetField} from '../public/budget-limits.js';
import {defaultSettings,validateSettings} from '../model-settings.mjs';
import {DiscussionHub} from '../discussion.mjs';import {Workbench} from '../core.mjs';import {parseBudgetCap} from '../cli.mjs';
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-unlimited-'));t.after(()=>{const target=fs.realpathSync(dir);assert.ok(target.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'relay-unlimited-'));fs.rmSync(target,{recursive:true,force:true});});return dir;}
test('不限显式使用 null，零值不能冒充不限，有限预算仍在边界生效',()=>{
 assert.equal(budgetReached(1e9,null),false);assert.equal(budgetExceeded(1e9,null),false);assert.equal(budgetReached(10,10),true);assert.equal(budgetExceeded(10,10),false);assert.equal(budgetExceeded(11,10),true);assert.equal(budgetLimit(null,100,6,400),null);assert.throws(()=>budgetLimit(0,100,6,400),/整数/);assert.throws(()=>budgetLimit(Infinity,100,6,400),/整数/);assert.equal(limitText(null),'不限');assert.ok(roundRange(3,null).includes('至少 3 轮'));assert.equal(parseBudgetCap('unlimited'),null);assert.equal(parseBudgetCap('不限'),null);assert.equal(parseBudgetCap('100'),100);assert.throws(()=>parseBudgetCap('0'),/正整数/);
});
test('实验室可分别保存不限轮数、调用和 token；缺省配置维持有限值',()=>{
 const original=defaultSettings();assert.equal(original.collaboration.maxRounds,5);assert.ok(!Object.hasOwn(original.collaboration,'maxCalls'));
 for(const key of ['maxRounds','maxCalls','tokenBudget']){const settings=defaultSettings();settings.collaboration[key]=null;assert.equal(validateSettings(settings).collaboration[key],null);}
 const settings=defaultSettings();settings.collaboration.minRounds=0;settings.collaboration.maxRounds=null;assert.throws(()=>validateSettings(settings),/互审轮数/);
});
test('取消不限时，数值输入的默认值不能低于最低互审轮数',()=>{
 const field=budgetField('maxRounds','最多轮数',null,{min:10,max:50,fallback:5});assert.match(field,/value="10" disabled/);assert.match(field,/aria-label="最多轮数不限" checked/);
});
function discussionFixture(t,policy,usage=110,stopAt=0){const dir=temp(t),settings=defaultSettings();settings.collaboration={...settings.collaboration,minRounds:1,maxRounds:null,...policy};let hub;
 const adapter=async args=>{const r=hub.rooms[0],phase=r.activity.phase;args.onUsage?.({total_tokens:usage});args.onTrace?.('synthetic-'+r.calls.length);if(stopAt&&r.calls.length>=stopAt)queueMicrotask(()=>hub.stop(r.id));return JSON.stringify({rulesHash:r.rulesHash,revision:r.revision,proposalHash:r.proposal?.hash||'',directiveHash:r.governance.directiveHash,acknowledged:true,summary:'依据完整约束独立核对，测试中的异议仍未充分解决。',analysis:['challenge','synthesis'].includes(phase)?[{topic:'边界',position:'保留未解决的具体取舍',evidence:'测试固定事实',alternative:'缩小任务范围'}]:[],objections:[],replies:[],close:[],proposal:phase==='proposal'?'完整测试方案：核对人的全部约束，保持真实证据，并在独立复核后决定。':'',stance:phase==='vote'?'disagree':'undecided',question:'',signals:[]});};
 hub=new DiscussionHub({dir,getModelProfile:()=>({name:'unit-only',hash:'unit-only',settings}),codex:adapter,deepseek:adapter});const room=hub.create({direction:'仅用于测试不限上限与人工停止的状态机',governance:true});hub.emit=()=>{};t.after(()=>hub.shutdown());return{hub,room};}
async function run(hub,room){await hub.start(room.id);await hub.live.get(room.id)?.promise;}
test('全不限真实调度超过旧轮数和调用上限，最后仍能手动停止而非伪造共识',async t=>{
 const {hub,room}=discussionFixture(t,{maxRounds:null,maxCalls:null,tokenBudget:null},5000000,410);await run(hub,room);
 assert.equal(room.status,'stopped');assert.ok(room.round>50);assert.ok(room.calls.length>400);assert.ok(room.tokens>2000000);assert.equal(room.maxRounds,null);assert.equal(room.maxCalls,null);assert.equal(room.tokenBudget,null);
});
test('取消某一项上限不会顺便取消其他预算',async t=>{
 const calls=discussionFixture(t,{maxRounds:null,maxCalls:6,tokenBudget:null});await run(calls.hub,calls.room);assert.equal(calls.room.status,'unresolved');assert.equal(calls.room.calls.length,6);
 const tokens=discussionFixture(t,{maxRounds:null,maxCalls:null,tokenBudget:10000},6000);await run(tokens.hub,tokens.room);assert.equal(tokens.room.status,'unresolved');assert.equal(tokens.room.calls.length,2);
 const rounds=discussionFixture(t,{maxRounds:1,maxCalls:null,tokenBudget:null});await run(rounds.hub,rounds.room);assert.equal(rounds.room.status,'unresolved');assert.equal(rounds.room.roundsSinceInput,1);
});
test('既有会谈可明确切换不限，恢复有限值时不能低于当前用量',async t=>{
 const {hub,room}=discussionFixture(t,{maxRounds:1,maxCalls:6,tokenBudget:10000});hub.launch=()=>{};await hub.start(room.id,{maxRounds:null,maxCalls:null,tokenBudget:null});assert.equal(room.maxRounds,null);assert.equal(room.governance.maxRounds,null);assert.equal(room.maxCalls,null);assert.equal(room.tokenBudget,null);room.status='paused';room.round=8;room.calls=Array.from({length:20},()=>({status:'success'}));room.tokens=30000;
 await assert.rejects(hub.start(room.id,{maxRounds:3,maxCalls:10,tokenBudget:10000}),/整数/);await hub.start(room.id,{maxRounds:10,maxCalls:30,tokenBudget:50000});assert.equal(room.maxRounds,10);assert.equal(room.maxCalls,30);assert.equal(room.tokenBudget,50000);
});
test('工作台全不限超过旧执行步数和调用次数，取消仍中止实际调度',async t=>{
 const dir=temp(t),settings=defaultSettings();settings.collaboration.team.forEach(a=>a.provider='Codex');let w,count=0;
 w=new Workbench({dir,getModelProfile:()=>({name:'unit-only',hash:'unit-only',settings}),codex:async args=>{count++;args.onUsage({input_tokens:5000000,output_tokens:1});args.task.sessions||={};args.task.sessions.director='unit-session';if(count===105)queueMicrotask(()=>w.cancel(args.task.id));return JSON.stringify({action:'plan',summary:'保留当前测试计划，不伪造完成。',taskId:'',instruction:'',tasks:[{id:'a',title:'实现',owner:'Codex',dependsOn:[]},{id:'b',title:'复查',owner:'Codex',dependsOn:['a']}],acceptance:[{id:'done',title:'完成并复核',evidence:''}],proposalId:'',issueId:'',resolution:'',final:''});},deepseek:async()=>assert.fail('单 Codex 任务不应调用 DeepSeek')});
 const task=w.create({prompt:'工作台不限预算和人工取消测试',maxSteps:null,maxCalls:null,tokenBudget:null});w.emit=()=>{};w.start(task.id);for(let i=0;i<200&&w.active;i++)await new Promise(r=>setTimeout(r,5));assert.equal(task.status,'cancelled');assert.equal(count,105);assert.equal(task.maxSteps,null);assert.equal(task.maxCalls,null);assert.equal(task.tokenBudget,null);assert.ok(task.usage.codexInput>1000000);assert.equal(task.result,'');
});
