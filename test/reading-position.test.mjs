import test from 'node:test';import assert from 'node:assert/strict';
import {createUnreadTracker,captureReadingPosition,restoreReadingPosition} from '../public/experience.js';
import {planningEmptyTitle} from '../public/participants.js';

test('计划来源跟随实际主持模型，单 DeepSeek 团队不会归因给 Codex',()=>{
 const subject=provider=>({collaboration:{leaderId:'lead',team:[{id:'lead',provider}]}});
 assert.equal(planningEmptyTitle(subject('DeepSeek')),'计划会由真实的 DeepSeek 调用产生');
 assert.equal(planningEmptyTitle(subject('Codex')),'计划会由真实的 Codex 调用产生');
 assert.equal(planningEmptyTitle({governance:{team:[{id:'c',provider:'Codex'},{id:'d',provider:'DeepSeek',lead:true}]}}),'计划会由真实的 DeepSeek 调用产生');
});
test('图表和旧消息阅读期间累计未读，后台刷新和其他会话不会把新消息标为已读',()=>{
 const unread=createUnreadTracker();assert.equal(unread.observe('a',5),0);assert.equal(unread.observe('a',6),1);assert.equal(unread.observe('a',6),1);assert.equal(unread.observe('b',30),0);assert.equal(unread.observe('a',9),4);assert.equal(unread.observe('a',9,true),0);assert.equal(unread.observe('a',10),1);unread.markRead('a',10);assert.equal(unread.observe('a',10),0);assert.equal(unread.observe('b',32),2);
});
test('图表上方新增记录后保持正在阅读的图表位置，嵌套面板也保留偏移',()=>{
 let anchorAbsoluteTop=1400,pane={scrollTop:87,scrollLeft:11};
 const view={scrollX:3,scrollY:1300,innerHeight:900,scrollTo(p){this.scrollX=p.left;this.scrollY=p.top;}};
 const anchor={dataset:{readingAnchor:'token-usage'},getBoundingClientRect:()=>({top:anchorAbsoluteTop-view.scrollY,bottom:anchorAbsoluteTop-view.scrollY+220})};
 const root={querySelectorAll:selector=>selector==='[data-reading-anchor]'?[anchor]:selector==='.shared-content'?[pane]:[]};
 const saved=captureReadingPosition(root,view);assert.equal(saved.anchor.top,100);
 // DOM replacement temporarily clamps the page; an extra call row adds 160px above the chart.
 view.scrollY=0;anchorAbsoluteTop+=160;pane={scrollTop:0,scrollLeft:0};restoreReadingPosition(root,saved,view);
 assert.equal(view.scrollY,1460);assert.equal(anchor.getBoundingClientRect().top,100);assert.deepEqual(pane,{scrollTop:87,scrollLeft:11});
});
test('没有图表锚点时保留外层滚动位置，显式导航不需要恢复旧位置',()=>{
 const root={querySelectorAll:()=>[]},view={scrollX:0,scrollY:650,innerHeight:900,scrollTo(p){this.scrollY=p.top;}};
 const saved=captureReadingPosition(root,view);view.scrollY=0;restoreReadingPosition(root,saved,view);assert.equal(view.scrollY,650);view.scrollY=10;restoreReadingPosition(root,null,view);assert.equal(view.scrollY,10);
});
