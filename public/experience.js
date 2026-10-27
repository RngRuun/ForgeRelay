import {budgetField,readBudgetInputs,mountBudgetToggles} from './budget-limits.js';
// BFCache can retain a document. Release streaming connections before leaving,
// and recreate them when restored so repeated navigation cannot consume the
// browser's per-origin connection pool and stall mutations such as delete.
export function createLifecycleEventSource(url,{target=window,EventSourceImpl=EventSource}={}){
  let stream=null,closed=false;const handlers={onmessage:null,onerror:null};
  const suspend=()=>{stream?.close();stream=null;};
  const connect=()=>{if(closed||stream)return;const source=stream=new EventSourceImpl(url);for(const name of ['onmessage','onerror'])source[name]=event=>{if(stream===source)handlers[name]?.(event);};};
  target.addEventListener('pagehide',suspend);target.addEventListener('pageshow',connect);connect();
  return{get onmessage(){return handlers.onmessage;},set onmessage(value){handlers.onmessage=value;},get onerror(){return handlers.onerror;},set onerror(value){handlers.onerror=value;},close(){closed=true;suspend();target.removeEventListener('pagehide',suspend);target.removeEventListener('pageshow',connect);}};
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Callers explicitly select draft fields. Credentials, API state and File objects
// must never be passed here. A failed local write never clears an existing draft.
export function createDraftStore(storage,namespace='relay.drafts.v1'){
  const key=scope=>namespace+':'+encodeURIComponent(scope);
  return {
    read(scope){try{const item=JSON.parse(storage.getItem(key(scope))||'null');return item?.version===1?item.value:null;}catch{return null;}},
    write(scope,value){try{const text=JSON.stringify({version:1,value});if(text.length>250000)return false;storage.setItem(key(scope),text);return true;}catch{return false;}},
    clear(scope){try{storage.removeItem(key(scope));}catch{}}
  };
}

export function readMigratedDraft(store,scope,previousScopes=[]){
  const current=store.read(scope);if(current)return current;
  for(const previous of previousScopes){const saved=store.read(previous);if(!saved)continue;if(store.write(scope,saved))store.clear(previous);return saved;}
  return null;
}

export function createRenderGate(draw,{schedule=fn=>requestAnimationFrame(fn),cancel=id=>cancelAnimationFrame(id)}={}){
  const blocked=new Set();let frame=null,dirty=false,background=true;
  const flush=()=>{frame=null;if(blocked.size||!dirty)return;dirty=false;draw({background});};
  return {
    request(){if(!dirty)background=true;dirty=true;if(!blocked.size&&frame===null)frame=schedule(flush);},
    now(){background=false;dirty=true;if(frame!==null){cancel(frame);frame=null;}flush();},
    block(reason,value){if(value)blocked.add(reason);else blocked.delete(reason);if(!blocked.size&&dirty&&frame===null)frame=schedule(flush);}
  };
}
export function protectInput(root,gate){
  root.addEventListener('compositionstart',()=>gate.block('ime',true));
  root.addEventListener('compositionend',()=>gate.block('ime',false));
  document.addEventListener('selectionchange',()=>{
    const selection=document.getSelection(),node=selection?.anchorNode;
    gate.block('reading',!!selection&&!selection.isCollapsed&&root.contains(node)&&!!node?.parentElement?.closest('.transcript,.event-list,.shared-content'));
  });
  document.addEventListener('visibilitychange',()=>gate.block('hidden',document.hidden));
}

export function createUnreadTracker(){
  const seen=new Map();
  return {
    observe(id,total,readingLatest=false){if(!seen.has(id)||readingLatest)seen.set(id,total);else if(total<seen.get(id))seen.set(id,total);return Math.max(0,total-seen.get(id));},
    markRead(id,total){seen.set(id,total);}
  };
}

// Keep the chart being read at the same screen position even when records above
// it grow. Nested pane positions are independent of the window's scroll offset.
export function captureReadingPosition(root,view=window){
  const anchors=[...root.querySelectorAll('[data-reading-anchor]')].map(node=>{const {top,bottom}=node.getBoundingClientRect();return {key:node.dataset.readingAnchor,top,bottom};}).filter(a=>a.bottom>0&&a.top<view.innerHeight).sort((a,b)=>Math.abs(a.top)-Math.abs(b.top));
  const selectors=['.shared-content','.room-rail','.room-list','.shared-tabs','.page-section-nav'];
  return {x:view.scrollX,y:view.scrollY,anchor:anchors[0]||null,panes:selectors.flatMap(selector=>[...root.querySelectorAll(selector)].map((node,index)=>({selector,index,top:node.scrollTop,left:node.scrollLeft})))};
}
export function restoreReadingPosition(root,snapshot,view=window){
  if(!snapshot)return;
  for(const pane of snapshot.panes){const node=root.querySelectorAll(pane.selector)[pane.index];if(node){node.scrollTop=pane.top;node.scrollLeft=pane.left;}}
  const anchor=snapshot.anchor&&[...root.querySelectorAll('[data-reading-anchor]')].find(node=>node.dataset.readingAnchor===snapshot.anchor.key);
  const top=anchor?view.scrollY+anchor.getBoundingClientRect().top-snapshot.anchor.top:snapshot.y;
  view.scrollTo({left:snapshot.x,top,behavior:'instant'});
}

// Only retry an explicit pre-route CSRF rejection. Network errors and ambiguous
// mutation outcomes are never automatically replayed (could duplicate work).
export function createApiClient({getToken,setToken,request=(...args)=>fetch(...args)}){
  let refreshing=null;
  return async function api(url,data){
    const send=()=>request(url,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Relay-Token':getToken()},body:JSON.stringify(data)});
    let response=await send(),value=await response.json();
    if(data!==undefined&&response.status===403&&value.error==='请刷新页面后重试'){
      refreshing||=(async()=>{const r=await request('/api/state');if(!r.ok)throw Error('本地服务尚未恢复，请稍后重试');const state=await r.json();setToken(state.token);})().finally(()=>refreshing=null);
      await refreshing;response=await send();value=await response.json();
    }
    if(!response.ok)throw Error(value.error||'请求失败');return value;
  };
}

// A manual retry after an ambiguous network failure keeps the same receipt ID.
// A later intentional message, even with identical text, gets a fresh ID.
export function createChatSender(api,{newId=()=>crypto.randomUUID()}={}){
  const pending=new Map();
  return async(room,text)=>{
    let entry=pending.get(room.id);if(!entry||entry.text!==text){entry={text,id:newId()};pending.set(room.id,entry);}
    const result=await api(`/api/discussions/${room.id}/chat`,{text,expectedRevision:room.revision,clientRequestId:entry.id});
    if(pending.get(room.id)===entry)pending.delete(room.id);return result;
  };
}

export function messageCopyText(message){
  const d=message.detail||{};
  return [message.text,...(d.analysis||[]).map(a=>[a.topic,a.position,a.evidence?'依据：'+a.evidence:'',a.alternative?'备选：'+a.alternative:''].filter(Boolean).join('\n')),
    ...(d.objections||[]).map(o=>`异议：${o.title}\n${o.reason}\n解决条件：${o.change}`),
    ...(d.replies||[]).map(r=>`回应 ${r.objectionId}：${r.response}`),d.proposal].filter(Boolean).join('\n\n');
}

export function requestBudget(room){
  return new Promise(resolve=>{
    const prior=document.activeElement,dialog=document.createElement('dialog');dialog.className='utility-dialog budget-dialog';
    dialog.setAttribute('aria-labelledby','budget-title');
    dialog.innerHTML=`<form><header><div><span class="utility-eyebrow">会话预算</span><h2 id="budget-title">为讨论留出继续的空间</h2></div><button type="button" class="utility-close" aria-label="关闭预算调整">×</button></header><p>已完成 ${room.roundsSinceInput} 轮 · 已调用 ${room.calls.length} 次 · 已使用 ${room.tokens.toLocaleString()} tokens</p><div class="budget-fields">${[
      ['maxRounds','总轮数上限',Math.max(room.round,room.minRounds,room.maxRounds??0),Math.max(50,room.round),room.maxRounds===null?null:Math.min(50,Math.max(room.round,room.maxRounds)+3),'保留最低互审轮数'],
      ['maxCalls','总调用次数',Math.max(room.calls.length+1,room.maxCalls??0),Math.max(400,room.calls.length+1),room.maxCalls===null?null:Math.min(400,Math.max(room.calls.length,room.maxCalls)+20),'包括工具续调与子代理'],
      ['tokenBudget','总 token 预算',Math.max(room.tokens+1,room.tokenBudget??0),Math.max(2000000,room.tokens+1),room.tokenBudget===null?null:Math.min(2000000,Math.max(room.tokens,room.tokenBudget)+200000),'输入、输出均计入用量']
    ].map(([name,label,min,max,value,hint])=>budgetField(name,label,value,{min,max,fallback:min,prefix:'budget',hint})).join('')}</div><p class="utility-note">仅在确认后继续调用。选择不限后，实际用量持续累计；仍可暂停或停止，人的前提、证据和未决异议都会保留。</p><footer><button type="button" class="secondary" data-budget-cancel>暂不调整</button><button type="submit" class="primary">调整预算并继续 ↗</button></footer></form>`;
    mountBudgetToggles();document.body.append(dialog);let value=null;
    dialog.addEventListener('close',()=>{dialog.remove();resolve(value);requestAnimationFrame(()=>{const target=prior?.isConnected&&prior.tagName!=='BODY'&&!prior.disabled?prior:document.querySelector('[data-action=budget]');target?.focus({preventScroll:true});});},{once:true});
    dialog.querySelector('.utility-close').onclick=()=>dialog.close();dialog.querySelector('[data-budget-cancel]').onclick=()=>dialog.close();
    dialog.querySelector('form').onsubmit=e=>{e.preventDefault();if(!e.currentTarget.reportValidity())return;value=readBudgetInputs(e.currentTarget,['maxRounds','maxCalls','tokenBudget']);dialog.close();};
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
    dialog.showModal();dialog.querySelector('input')?.focus();
  });
}

let shortcutsMounted=false;
export function mountShortcuts(){
  if(shortcutsMounted)return;shortcutsMounted=true;
  const dialog=document.createElement('dialog');dialog.className='utility-dialog command-dialog';dialog.setAttribute('aria-label','快捷导航');
  dialog.innerHTML='<header class="command-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg><input aria-label="搜索页面、会话或任务" placeholder="前往页面，或查找会话与任务…" role="combobox" aria-autocomplete="list" aria-controls="command-results" aria-expanded="true"><button class="utility-close" aria-label="关闭快捷导航">Esc</button></header><div id="command-results" role="listbox" aria-label="搜索结果"></div><footer><span>↑ ↓ 选择 <kbd>Enter</kbd> 打开</span><span>仅导航，不启动模型</span></footer>';
  document.body.append(dialog);const input=dialog.querySelector('input'),list=dialog.querySelector('[role=listbox]');
  let rows=[],filtered=[],index=0,previous=null,loading=false,loadedAt=0;
  const statuses={draft:'待开始',running:'进行中',pausing:'正在暂停',paused:'已暂停',waiting_user:'等待你的答复',consensus:'达成共识',unresolved:'保留分歧',failed:'调用失败',interrupted:'已中断',stopped:'已停止',queued:'排队中',completed:'已验收',cancelled:'已停止',needs_attention:'待处理'};
  const hint=(item,label)=>label+' · '+(statuses[item.status]||item.status)+' · '+item.id.slice(0,8);
  const base=()=>{const params=new URLSearchParams(location.search),hash=location.hash.slice(1),room=params.get('room')||(/^[a-f0-9-]{36}$/.test(hash)?hash:'');return [
    {title:'三方会谈',hint:'方向、审查与决策',href:'/discussion'+(room?'#'+room:''),kind:'页面'},
    {title:'新建会谈',hint:'定义目标与人的前提',href:'/discussion?new=1',kind:'页面'},
    {title:'任务控制',hint:'CLI 执行与交付',href:'/workbench'+(room?'?room='+room:'')+'#control',kind:'页面'},
    {title:'模型实验室',hint:'模型、角色与互审设置',href:'/models'+(room?'?room='+room:''),kind:'页面'},
    {title:'模型接入',hint:'CLI 登录与 DeepSeek API',href:'/workbench#settings',kind:'页面'}
  ];};
  function paint(){
    const query=input.value.trim().toLocaleLowerCase();filtered=rows.filter(r=>(r.title+' '+r.hint+' '+r.kind).toLocaleLowerCase().includes(query)).slice(0,12);index=Math.min(index,Math.max(0,filtered.length-1));
    list.innerHTML=filtered.length?filtered.map((r,i)=>`<button type="button" id="command-result-${i}" role="option" aria-selected="${i===index}" data-command-index="${i}"><span class="command-result-copy"><b>${escape(r.title)}</b><small>${escape(r.hint)}</small></span><span class="command-result-kind">${escape(r.kind)}</span><span class="command-enter" aria-hidden="true">↵</span></button>`).join(''):`<div class="command-empty">${loading?'正在读取本地会话与任务…':'没有找到结果。试试名称中的其他字词。'}</div>`;
    if(filtered.length)input.setAttribute('aria-activedescendant','command-result-'+index);else input.removeAttribute('aria-activedescendant');
    list.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});
  }
  async function open(){
    if(document.querySelector('dialog[open]'))return;previous=document.activeElement;rows=base();input.value='';index=0;paint();dialog.showModal();input.focus();
    loading=true;
    try{const response=await fetch('/api/navigation',{signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error();const data=await response.json();
      rows=[...base(),...data.rooms.map(r=>({title:r.title,hint:hint(r,'三方会谈'),kind:'会话',href:'/discussion#'+r.id})),...data.tasks.map(t=>({title:t.title,hint:hint(t,t.kind==='code'?'软件开发':'写作研究'),kind:'任务',href:'/workbench?task='+t.id+'#control'}))];loadedAt=Date.now();
    }catch{if(!loadedAt)rows=base();}finally{loading=false;if(dialog.open)paint();}
  }
  input.addEventListener('input',()=>{index=0;paint();});
  dialog.addEventListener('keydown',e=>{if(e.isComposing)return;if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();index=(index+(e.key==='ArrowDown'?1:-1)+Math.max(1,filtered.length))%Math.max(1,filtered.length);paint();input.focus();}else if(e.key==='Enter'&&e.target===input){e.preventDefault();if(filtered[index])location.assign(filtered[index].href);}});
  list.addEventListener('click',e=>{const option=e.target.closest('[data-command-index]');if(option)location.assign(filtered[Number(option.dataset.commandIndex)].href);});
  dialog.querySelector('.utility-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>requestAnimationFrame(()=>{const target=previous?.isConnected&&previous.tagName!=='BODY'?previous:document.querySelector('[data-command-open]');target?.focus({preventScroll:true});}));
  document.addEventListener('click',e=>{if(e.target.closest('[data-command-open]'))void open();});
  document.addEventListener('keydown',e=>{if(!e.isComposing&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(dialog.open)dialog.close();else void open();}});
}
