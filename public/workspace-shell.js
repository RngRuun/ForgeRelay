// Shared layout behavior. Model state, drafts and navigation remain in their own views.
const compact=matchMedia('(max-width:1100px)'),key='forgerelay.layout.list-collapsed.v1';
let collapsed=false,drawerOpen=false,frame=0,restoreFocus=null;
try{collapsed=localStorage.getItem(key)==='true';}catch{}
const icon='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9 5v14m4-10 3 3-3 3"/></svg>';
const backdrop=document.createElement('button');backdrop.className='workspace-list-backdrop';backdrop.type='button';backdrop.tabIndex=-1;backdrop.setAttribute('aria-label','关闭列表');backdrop.hidden=true;document.body.append(backdrop);
const pane=()=>document.querySelector('.room-rail,.profile-rail,.project-rail');
const main=()=>document.querySelector('.shell>main,.lab-main,.work-area');
function refresh(){
  frame=0;const list=pane(),content=main(),heading=content?.querySelector('.room-heading,.page-heading');
  document.body.dataset.workspaceList=compact.matches?(drawerOpen?'drawer':'closed'):(collapsed?'collapsed':'expanded');
  if(!list||!heading)return;
  // Keep both layers inside the same page stacking context.
  if(backdrop.parentElement!==list.parentElement)list.parentElement.append(backdrop);
  let toggle=heading.querySelector('[data-list-toggle]');
  if(!toggle){toggle=document.createElement('button');toggle.type='button';toggle.className='workspace-list-toggle secondary';toggle.dataset.listToggle='';toggle.innerHTML=icon;heading.prepend(toggle);}
  list.id='workspace-object-list';toggle.setAttribute('aria-controls',list.id);
  if(!list.querySelector('[data-list-close]')){const button=document.createElement('button');button.type='button';button.className='workspace-list-close secondary';button.dataset.listClose='';button.setAttribute('aria-label','收起列表');button.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';list.prepend(button);}
  const shown=compact.matches?drawerOpen:!collapsed,name=list.classList.contains('profile-rail')?'配置列表':list.classList.contains('project-rail')?'任务列表':'会话列表';
  toggle.setAttribute('aria-expanded',String(shown));toggle.setAttribute('aria-label',(shown?'收起':'展开')+name);toggle.title=(shown?'收起':'展开')+name;
  backdrop.hidden=!(compact.matches&&drawerOpen);content.inert=compact.matches&&drawerOpen;list.inert=!shown;
  if(compact.matches&&drawerOpen){list.setAttribute('role','dialog');list.setAttribute('aria-modal','true');list.setAttribute('aria-label',name);}
  else{list.removeAttribute('role');list.removeAttribute('aria-modal');list.removeAttribute('aria-label');}
}
function schedule(){if(!frame)frame=requestAnimationFrame(refresh);}
function close(){drawerOpen=false;refresh();if(restoreFocus?.isConnected)restoreFocus.focus({preventScroll:true});restoreFocus=null;window.dispatchEvent(new Event('workspace-layoutchange'));}
document.addEventListener('click',event=>{
  if(event.target.closest('[data-list-close]')){close();return;}
  for(const menu of document.querySelectorAll('.profile-menu[open]'))if(!menu.contains(event.target)||event.target.closest('.profile-menu-items button'))menu.open=false;
  const toggle=event.target.closest('[data-list-toggle]');
  if(toggle){if(compact.matches){drawerOpen=!drawerOpen;restoreFocus=toggle;}else{collapsed=!collapsed;try{localStorage.setItem(key,String(collapsed));}catch{}}refresh();if(drawerOpen)requestAnimationFrame(()=>pane()?.querySelector('button,input,a')?.focus({preventScroll:true}));window.dispatchEvent(new Event('workspace-layoutchange'));return;}
  if(compact.matches&&drawerOpen&&event.target.closest('[data-room],.profile-item,[data-task]'))close();
  const tab=event.target.closest('.page-section-nav button,.lab-section-nav button');if(tab)tab.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
});
backdrop.addEventListener('click',close);
document.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open],[role=alertdialog]'))return;
  if(drawerOpen&&compact.matches){
    if(event.key==='Escape'){event.preventDefault();close();return;}
    if(event.key==='Tab'){const items=[...pane().querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}return;
  }
  if(event.key==='Escape'){const menu=document.querySelector('.profile-menu[open]');if(menu){menu.open=false;menu.querySelector('summary')?.focus();return;}}
  if(event.defaultPrevented||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const nav=event.target.closest('.page-section-nav,.lab-section-nav');if(!nav)return;const items=[...nav.querySelectorAll('button:not(:disabled)')],index=items.indexOf(event.target);if(index<0)return;
  event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowRight'?1:-1)+items.length)%items.length;items[next].focus();items[next].click();
});
document.addEventListener('focusin',event=>{if(drawerOpen&&compact.matches&&event.target.closest('dialog[open],[role=alertdialog]')){drawerOpen=false;restoreFocus=null;refresh();window.dispatchEvent(new Event('workspace-layoutchange'));}});
compact.addEventListener('change',()=>{drawerOpen=false;refresh();window.dispatchEvent(new Event('workspace-layoutchange'));});
new MutationObserver(schedule).observe(document.getElementById('app'),{childList:true,subtree:true});refresh();
