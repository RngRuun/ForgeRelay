import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {ModelProfileStore} from '../model-settings.mjs';
import {roomPageSelection,roomSectionFor,roomSectionNavigation,ROOM_SECTIONS} from '../public/discussion-layout.js';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-profile-trash-'));t.after(()=>{const target=fs.realpathSync(dir);assert.ok(target.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'relay-profile-trash-'));fs.rmSync(target,{recursive:true,force:true});});return {dir,store:new ModelProfileStore(dir)};}
test('最后一组启用配置移入回收站保留参数和既有快照，恢复不改当前配置',t=>{
 const {dir,store}=fixture(t),profile=store.active();profile.settings.deepseek.rebellion=83;profile.settings.deepseek.prompt='保留完整提示词与独立职责';profile.settings.collaboration.team.forEach(a=>a.provider='DeepSeek');store.persist();
 const prior=store.snapshot(),settings=structuredClone(profile.settings);store.update({action:'trash',id:profile.id,revision:store.state.revision});
 assert.ok(store.state.profiles.find(p=>p.id===profile.id).deletedAt);const replacement=store.active();assert.notEqual(replacement.id,profile.id);assert.deepEqual(replacement.settings,settings);assert.deepEqual(prior.settings,settings);
 assert.throws(()=>store.snapshot(profile.id),/回收站/);assert.throws(()=>store.update({action:'activate',id:profile.id,revision:store.state.revision}),/回收站/);assert.throws(()=>store.update({action:'save',id:profile.id,name:'覆盖应失败',settings,revision:store.state.revision}),/先恢复/);
 const reloaded=new ModelProfileStore(dir);reloaded.update({action:'restore',id:profile.id,revision:reloaded.state.revision});assert.deepEqual(reloaded.snapshot(profile.id).settings,settings);assert.equal(reloaded.state.activeId,replacement.id);assert.ok(!reloaded.state.profiles.find(p=>p.id===profile.id).deletedAt);
});
test('删除兼容入口改为可恢复操作；并发冲突不误删，当前配置优先切换到已有可用项',t=>{
 const {store}=fixture(t),settings=store.snapshot().settings;
 store.update({action:'save',name:'第二组',settings,activate:true,revision:1});const active=store.state.activeId;
 assert.throws(()=>store.update({action:'trash',id:active,revision:1}),/其他窗口/);assert.ok(!store.active().deletedAt);
 store.update({action:'delete',id:active,revision:2});assert.equal(store.state.activeId,'default');assert.equal(store.state.profiles.length,2);assert.ok(store.state.profiles.find(p=>p.id===active).deletedAt);
 const revision=store.state.revision;store.update({action:'trash',id:active,revision});assert.equal(store.state.revision,revision);
 store.update({action:'restore',id:active,revision});assert.equal(store.state.activeId,'default');assert.equal(store.state.profiles.filter(p=>!p.deletedAt).length,2);
});
test('会谈默认进入聊天；旧调用链接与顶部各分区可正确定位，分区不互相挤占',()=>{
 assert.deepEqual(roomPageSelection(''),{section:'conversation',panel:'proposal'});
 assert.deepEqual(roomPageSelection('?new=1&section=metrics&panel=calls'),{section:'conversation',panel:'proposal'});
 assert.equal(roomPageSelection('?panel=calls').section,'metrics');assert.equal(roomPageSelection('?panel=tasks').section,'execution');assert.equal(roomPageSelection('?panel=runtime').section,'resources');assert.equal(roomPageSelection('?section=conversation&panel=proposal').section,'conversation');assert.equal(roomSectionFor('signals'),'deliberation');
 const html=roomSectionNavigation('conversation');assert.equal((html.match(/aria-current="page"/g)||[]).length,1);for(const item of ROOM_SECTIONS)assert.ok(html.includes('data-room-section="'+item.id+'"'));
});
