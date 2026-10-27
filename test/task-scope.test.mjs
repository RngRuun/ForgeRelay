import test from 'node:test';
import assert from 'node:assert/strict';
import {taskView,taskCounts,taskURL,navigationTask} from '../public/task-scope.js';
const tasks=[{id:'A',title:'未关联',status:'draft'},{id:'B',title:'本会谈',status:'draft',sourceDiscussion:{id:'room-one'}},{id:'C',title:'其他会谈执行中',status:'running',sourceDiscussion:{id:'room-two'}},{id:'D',status:'draft',deletedAt:'now'},{id:'E',status:'draft',legacy:true}];
test('room navigation context never silently filters the default task list',()=>{
 assert.deepEqual(taskView(tasks,{roomId:'room-one'}).map(task=>task.id),['A','B','C']);assert.deepEqual(taskView(tasks,{scope:'room',roomId:'room-one'}).map(task=>task.id),['B']);assert.deepEqual(taskView(tasks,{scope:'task',taskId:'C'}).map(task=>task.id),['C']);
 const counts=taskCounts(tasks,taskView(tasks,{scope:'room',roomId:'room-one'}));assert.equal(counts.total,3);assert.equal(counts.visible,1);assert.equal(counts.running,1);assert.equal(counts.deleted,1);
 assert.equal(navigationTask(tasks[0]).roomId,null);assert.equal(navigationTask(tasks[2]).roomId,'room-two');assert.equal(taskURL(tasks[2]),'/workbench?task=C&room=room-two#control');
});
