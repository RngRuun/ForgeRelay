import {ACTIVE_TASK_STATES,taskURL,taskCounts} from './task-scope.js';
export function workStatus(tasks){
  const live=tasks.filter(task=>!task.deletedAt&&!task.legacy),rank={running:0,pausing:1,waiting_user:2,queued:3,paused:4};
  const active=live.filter(task=>ACTIVE_TASK_STATES.includes(task.status)).sort((a,b)=>rank[a.status]-rank[b.status]);
  const recovered=live.filter(task=>task.status==='interrupted'&&!task.recovery?.acknowledged),target=active[0]||recovered[0];
  return{target:target?taskURL(target):null,count:active.length||recovered.length,label:active.length?'后台任务':'中断任务',names:(active.length?active:recovered).map(task=>task.title).join('、'),counts:taskCounts(live)};
}
export function mountWorkStatus(){
  let tasks=[],pending=false,controller,stale=false;
  const draw=()=>{const parent=document.querySelector('.global-primary');if(!parent)return;const status=workStatus(tasks);let item=parent.querySelector('.global-work-status');
    document.body.dataset.taskCount=String(status.counts.total);
    if(!status.target&&!stale){item?.remove();window.dispatchEvent(new Event('workspace-task-count'));return;}
    if(!item){item=document.createElement('a');item.className='global-work-status';item.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h4l3-7 3 14 3-7h3"/></svg><span></span>';parent.append(item);}
    item.href=status.target||'/workbench#control';item.classList.toggle('is-stale',stale);item.title=stale?'后台状态暂不可达，显示上次记录：'+(status.names||'暂无已确认任务'):status.label+'：'+status.names;item.setAttribute('aria-label',stale?'后台状态待更新，查看上次任务记录':status.label+' '+status.count+' 项，查看 '+status.names);const text=stale?'状态待更新':status.label+' '+status.count;if(item.lastElementChild.textContent!==text)item.lastElementChild.textContent=text;
    window.dispatchEvent(new Event('workspace-task-count'));
  };
  const refresh=async()=>{if(pending||document.hidden)return;pending=true;controller=new AbortController();try{const response=await fetch('/api/navigation',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(5000)]),cache:'no-store'});if(!response.ok)throw Error('状态读取失败');const data=await response.json();tasks=data.tasks||[];stale=false;draw();}catch{stale=true;draw();}finally{pending=false;}};
  const timer=setInterval(refresh,2000);
  const observer=new MutationObserver(()=>{if(document.querySelector('.global-primary')&&!document.querySelector('.global-work-status')&&workStatus(tasks).target)draw();});observer.observe(document.getElementById('app'),{childList:true,subtree:true});
  const clock=setInterval(()=>{if(document.hidden)return;for(const node of document.querySelectorAll('[data-elapsed-since]')){const seconds=Math.max(0,Math.floor((Date.now()-Date.parse(node.dataset.elapsedSince))/1000));if(!Number.isFinite(seconds))continue;const text=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');if(node.firstChild?.nodeType===3){if(node.firstChild.nodeValue!==text)node.firstChild.nodeValue=text;}else node.textContent=text;}},1000);
  document.addEventListener('visibilitychange',refresh);window.addEventListener('pageshow',refresh);window.addEventListener('pagehide',()=>controller?.abort());refresh();
  return()=>{clearInterval(timer);clearInterval(clock);observer.disconnect();controller?.abort();document.removeEventListener('visibilitychange',refresh);window.removeEventListener('pageshow',refresh);};
}
