import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverTurn,validateTurn} from '../discussion.mjs';
const room=()=>({rulesHash:'rules',revision:1,proposal:{hash:'proposal'},objections:[{id:'O1',actor:'DeepSeek',agentId:'research',status:'open',title:'权限边界'}],governance:{version:1,directiveHash:'human',team:[]}});
function value(){return{rulesHash:'rules',revision:1,proposalHash:'proposal',directiveHash:'human',acknowledged:true,summary:'独立检查现有证据，保留尚未确认的权限约束。',analysis:[{topic:'边界',position:'需要核验',evidence:'现有记录',alternative:'缩小范围'}],objections:[],close:[],replies:[],stance:'undecided',question:'',proposal:'',signals:[]};}
const agent={id:'critic',provider:'DeepSeek',name:'独立反方',lead:false};
test('unknown signal IDs never discard analysis or erase the underlying blocking gap',()=>{
 const r=room(),raw=value();raw.signals=[{kind:'gap',topic:'权限提升说明',detail:'需要人说明机器部署权限',impact:5,blocking:true,humanOnly:true,position:'unknown',options:['确认权限'],objectionIds:['O1','O4']}];
 const fixed=recoverTurn(r,'DeepSeek','challenge',raw,r,agent);assert.deepEqual(fixed.turn.signals[0].objectionIds,['O1']);assert.equal(fixed.turn.signals[0].blocking,true);assert.deepEqual(fixed.turn.analysis,raw.analysis);assert.deepEqual(raw.signals[0].objectionIds,['O1','O4']);assert.equal(fixed.warnings.length,1);assert.doesNotThrow(()=>validateTurn(r,'DeepSeek','challenge',fixed.turn,r,agent));
});
test('cross-role close becomes a review reply without closing the original objection',()=>{
 const r=room(),raw=value();raw.close=[{objectionId:'O1',reason:'已经核对修改后的权限说明，建议原提出者确认关闭。'}];const fixed=recoverTurn(r,'DeepSeek','challenge',raw,r,agent);
 assert.equal(fixed.turn.close.length,0);assert.equal(fixed.turn.replies[0].objectionId,'O1');assert.equal(r.objections[0].status,'open');assert.doesNotThrow(()=>validateTurn(r,'DeepSeek','challenge',fixed.turn,r,agent));
});
test('stale directions, votes and invalid ownership checks remain strict',()=>{
 const r=room(),raw=value();raw.close=[{objectionId:'O1',reason:'由错误角色尝试关闭另一个角色尚未确认的异议。'}];
 const stale={...raw,revision:0};assert.equal(recoverTurn(r,'DeepSeek','challenge',stale,r,agent).turn,stale);assert.throws(()=>validateTurn(r,'DeepSeek','challenge',stale,r,agent));
 const ballot={...raw,stance:'agree'};assert.equal(recoverTurn(r,'DeepSeek','vote',ballot,r,agent).turn,ballot);assert.throws(()=>validateTurn(r,'DeepSeek','vote',ballot,r,agent));assert.throws(()=>validateTurn(r,'DeepSeek','challenge',raw,r,agent),/提出者/);
});
