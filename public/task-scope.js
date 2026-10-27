export const ACTIVE_TASK_STATES=['running','queued','pausing','paused','waiting_user'];
export const taskRoomId=task=>task.sourceDiscussion?.id||task.roomId||null;
export function taskView(tasks,{scope='all',roomId=null,taskId=null,deleted=false}={}){
  if(!['all','room','task'].includes(scope))throw Error('任务范围必须为 all、room 或 task');
  if(scope==='room'&&!roomId||scope==='task'&&!taskId)throw Error('任务范围缺少会谈或任务 ID');
  return tasks.filter(task=>!task.legacy&&Boolean(task.deletedAt)===deleted&&(scope==='all'||scope==='room'&&taskRoomId(task)===roomId||scope==='task'&&task.id===taskId));
}
export function taskCounts(tasks,shown=taskView(tasks)){
  const live=taskView(tasks);return{total:live.length,visible:shown.length,active:live.filter(task=>ACTIVE_TASK_STATES.includes(task.status)).length,running:live.filter(task=>['running','pausing'].includes(task.status)).length,queued:live.filter(task=>task.status==='queued').length,interrupted:live.filter(task=>task.status==='interrupted'&&!task.recovery?.acknowledged).length,deleted:taskView(tasks,{deleted:true}).length};
}
export function navigationTask(task){return{id:task.id,title:task.title,status:task.status,kind:task.kind,roomId:taskRoomId(task),startedAt:task.activity?.startedAt||task.startedAt||null,recovery:task.recovery||null};}
export function taskURL(task){const params=new URLSearchParams({task:task.id});if(taskRoomId(task))params.set('room',taskRoomId(task));return'/workbench?'+params+'#control';}
