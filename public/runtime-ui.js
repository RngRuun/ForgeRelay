import {mountShortcuts} from './experience.js';
import {mountDesktop} from './desktop.js';
import {mountBudgetToggles} from './budget-limits.js';
import {mountReflections} from './reflection.js';
import {mountFloatingNetworks} from './floating-network.js';
// Official marks: OpenAI Developers header and DeepSeek homepage; local SVG paths, no third-party runtime requests.
const PROVIDER_MARKS={"Codex":"<svg class=\"provider-mark provider-codex\" viewBox=\"100 100 411 411\" fill=\"none\" aria-hidden=\"true\"><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M252.794 108.802C289.191 99.0484 326.265 110.305 351.148 135.135C385.113 126.072 422.85 134.862 449.492 161.505C476.136 188.149 484.925 225.888 475.862 259.85V259.854C500.696 284.735 511.95 321.81 502.198 358.207C492.447 394.602 464.161 421.084 430.215 430.217C421.083 464.162 394.603 492.448 358.206 502.199C321.812 511.951 284.734 500.693 259.852 475.864C225.887 484.927 188.15 476.137 161.507 449.495C134.864 422.851 126.073 385.111 135.136 351.149C110.304 326.266 99.0496 289.192 108.801 252.795C118.552 216.4 146.84 189.918 180.784 180.785C189.917 146.841 216.396 118.553 252.794 108.802ZM374.292 407.145C374.292 411.271 372.092 415.086 368.517 417.148L283.723 466.102C302.487 480.585 327.555 486.459 352.217 479.852C386.997 470.532 410.068 439.312 410.555 405.006V317.717C410.555 315.08 409.125 312.621 406.843 311.303L374.292 292.509V407.145ZM251.868 415.897C248.296 417.959 243.893 417.959 240.317 415.897L155.526 366.942C152.366 390.436 159.811 415.08 177.866 433.136H177.863C203.325 458.594 241.896 462.962 271.85 446.232L347.449 402.586C349.735 401.268 351.148 398.8 351.148 396.163V358.579L251.868 415.897ZM368.602 220.628C366.319 219.309 363.474 219.318 361.191 220.637L328.641 239.431L427.921 296.749C431.496 298.811 433.697 302.627 433.697 306.752V404.661C455.622 395.654 473.244 376.881 479.851 352.218C489.169 317.442 473.668 281.85 444.201 264.274L368.602 220.628ZM177.303 206.34C155.377 215.348 137.756 234.122 131.148 258.783C121.832 293.561 137.331 329.153 166.799 346.727L242.398 390.373C244.68 391.692 247.525 391.684 249.807 390.366L282.357 371.572L183.078 314.253C179.504 312.189 177.303 308.375 177.303 304.251V206.34ZM259.849 279.145V331.858L305.5 358.213L351.15 331.858V279.145L305.5 252.789L259.849 279.145ZM327.276 144.9C308.512 130.418 283.445 124.543 258.782 131.15C224.002 140.471 200.931 171.691 200.445 205.995V293.286C200.445 295.923 201.875 298.381 204.158 299.7L236.707 318.493V203.856C236.707 199.731 238.909 195.916 242.483 193.853L327.276 144.9ZM433.137 177.867C407.675 152.407 369.103 148.038 339.149 164.769L263.55 208.415C261.265 209.734 259.852 212.202 259.852 214.838V252.423L359.132 195.105C362.703 193.041 367.108 193.041 370.682 195.105L455.473 244.06C458.635 220.567 451.189 195.922 433.135 177.867H433.137Z\" fill=\"currentColor\"></path></svg>","DeepSeek":"<svg class=\"provider-mark provider-deepseek\" viewBox=\"0 0 27 23\" aria-hidden=\"true\"><path d=\"M26.5174 3.39471C26.235 3.2567 26.1137 3.52006 25.9487 3.65346C25.8923 3.69659 25.8446 3.75294 25.7969 3.80469C25.3846 4.24516 24.9027 4.53439 24.2737 4.49989C23.3536 4.44814 22.5682 4.73737 21.8735 5.44119C21.7258 4.57349 21.2353 4.0554 20.4889 3.72304C20.0985 3.55054 19.7034 3.37746 19.4297 3.00197C19.2388 2.73459 19.1865 2.43673 19.091 2.14289C19.0301 1.96579 18.9697 1.78466 18.7656 1.75418C18.5442 1.71968 18.4574 1.90541 18.3705 2.06067C18.0232 2.69549 17.8887 3.39471 17.9019 4.10313C17.9324 5.6965 18.6051 6.96556 19.9421 7.86834C20.0939 7.97184 20.133 8.07535 20.0852 8.22658C19.9938 8.53766 19.8857 8.83955 19.7903 9.15063C19.7293 9.34901 19.6384 9.39271 19.4257 9.30588C18.692 8.9994 18.0583 8.54571 17.4982 7.99772C16.5477 7.07827 15.6881 6.06336 14.6162 5.26869C14.3644 5.08296 14.1125 4.91045 13.8521 4.746C12.7584 3.68394 13.9952 2.81164 14.2816 2.70814C14.5812 2.60003 14.3857 2.22857 13.4179 2.23317C12.4502 2.2372 11.5646 2.56151 10.4359 2.99335C10.2708 3.05832 10.0972 3.10547 9.91951 3.14457C8.8954 2.95022 7.83162 2.90709 6.72069 3.03245C4.62877 3.26533 2.95777 4.25436 1.72954 5.94261C0.254043 7.97184 -0.0932678 10.2777 0.33167 12.6824C0.778458 15.2171 2.07225 17.3153 4.06008 18.9558C6.12152 20.6567 8.49577 21.4905 11.2047 21.3306C12.8498 21.2358 14.6812 21.0155 16.7473 19.2669C17.2682 19.5262 17.8151 19.6297 18.7219 19.7074C19.4205 19.7723 20.0933 19.6729 20.6143 19.5648C21.4302 19.3923 21.3739 18.6367 21.0789 18.4981C18.6874 17.3843 19.2124 17.8374 18.7351 17.4706C19.9501 16.033 21.8063 13.4776 22.379 9.99821C22.4353 9.61409 22.5072 9.073 22.4986 8.76192C22.494 8.57216 22.5377 8.49856 22.7545 8.47671C23.3536 8.40771 23.935 8.24383 24.4692 7.94999C26.0188 7.10357 26.6439 5.71318 26.7911 4.04678C26.8129 3.79204 26.7865 3.52869 26.5174 3.39471ZM13.0143 18.3946C10.6964 16.5724 9.5722 15.9726 9.10816 15.9985C8.67402 16.0244 8.75222 16.5212 8.84768 16.8449C8.94773 17.1646 9.07768 17.3849 9.25996 17.6655C9.38589 17.8512 9.47272 18.1272 9.13404 18.3348C8.38766 18.7965 7.08985 18.1796 7.0289 18.1491C5.51833 17.2595 4.25559 16.0853 3.36546 14.4793C2.50581 12.9337 2.0067 11.2753 1.92447 9.50542C1.90262 9.07818 2.02855 8.92695 2.45406 8.84932C3.01413 8.74582 3.59144 8.72397 4.15093 8.80619C6.51656 9.15178 8.53027 10.2092 10.2185 11.8848C11.1822 12.8388 11.9114 13.979 12.6623 15.0929C13.461 16.2757 14.3201 17.4027 15.4144 18.3268C15.8008 18.6505 16.109 18.8966 16.404 19.0783C15.5144 19.1778 14.0297 19.1991 13.0143 18.3958V18.3946ZM14.1252 11.2489C14.1252 11.0591 14.277 10.9079 14.4679 10.9079C14.511 10.9079 14.5501 10.9165 14.5852 10.9292C14.6329 10.9464 14.6766 10.9723 14.7111 11.0114C14.7721 11.0718 14.8066 11.158 14.8066 11.2489C14.8066 11.4386 14.6548 11.5899 14.4639 11.5899C14.273 11.5899 14.1252 11.4386 14.1252 11.2489ZM17.5759 13.0188C17.3545 13.1096 17.1331 13.1873 16.9203 13.1959C16.5903 13.2131 16.2303 13.0791 16.0348 12.9153C15.7312 12.6605 15.5139 12.5179 15.423 12.0734C15.3839 11.8837 15.4057 11.5899 15.4402 11.4214C15.5185 11.0585 15.4316 10.8257 15.1757 10.614C14.9676 10.4415 14.7025 10.3938 14.4115 10.3938C14.3029 10.3938 14.2034 10.3461 14.1292 10.3076C14.0079 10.2472 13.9078 10.096 14.0033 9.91023C14.0338 9.84985 14.1815 9.70322 14.216 9.67734C14.6111 9.45251 15.0665 9.52612 15.488 9.6946C15.8784 9.85445 16.174 10.1477 16.5989 10.5623C17.033 11.0631 17.1112 11.2011 17.3585 11.5772C17.554 11.871 17.7317 12.1729 17.8536 12.5185C17.9272 12.7341 17.8317 12.9107 17.5759 13.0188Z\" fill=\"currentColor\"></path></svg>"};
export function providerIcon(actor){return PROVIDER_MARKS[actor]||'';}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const recycleIcon='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let notificationTimer;
export function notify(text,undo=null){
  const host=document.getElementById('toast');if(!host)return;clearTimeout(notificationTimer);host.replaceChildren();
  const message=document.createElement('span');message.textContent=text;host.append(message);host.hidden=false;
  if(undo){const button=document.createElement('button');button.type='button';button.className='toast-undo';button.textContent='撤销删除';button.addEventListener('click',async()=>{clearTimeout(notificationTimer);button.disabled=true;try{notify(await undo()||'已恢复');}catch(e){notify(e.message);}});host.append(button);}
  const close=document.createElement('button');close.type='button';close.className='toast-close';close.setAttribute('aria-label','关闭通知');close.textContent='×';close.addEventListener('click',()=>{clearTimeout(notificationTimer);host.hidden=true;});host.append(close);
  notificationTimer=setTimeout(()=>host.hidden=true,undo?12000:6500);
}
export function recycleView(items,kind='room'){
  const room=kind==='room',noun=room?'会话':'任务',rows=[...items].sort((a,b)=>String(b.deletedAt).localeCompare(String(a.deletedAt)));
  return `<section class="recycle-panel" aria-labelledby="recycle-heading"><header class="recycle-heading"><span class="recycle-symbol">${recycleIcon}</span><div><h2 id="recycle-heading">已删除的${noun} <span>${rows.length}</span></h2><p>记录、调用证据与项目文件保留，可随时恢复。</p></div></header>${rows.length?`<div class="recycle-list">${rows.map(r=>`<article class="recycle-row"><span class="recycle-item-mark" aria-hidden="true">${room?'<svg viewBox="0 0 24 24"><path d="M4 5h16v12H9l-5 4V5m4 4h8m-8 4h5"/></svg>':'<svg viewBox="0 0 24 24"><path d="M7 4h10v4H7V4m-2 2H4v15h16V6h-1M8 12h8m-8 4h5"/></svg>'}</span><div class="recycle-item-copy"><b>${esc(r.title)}</b><small>${room?'三方会谈':r.kind==='code'?'软件开发':'写作研究'}<span>·</span>${r.calls?.length||0} 次调用<time datetime="${esc(r.deletedAt)}">${new Date(r.deletedAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})} 移入</time></small></div><button class="secondary restore-button" ${room?`data-action="restore-room" data-id="${esc(r.id)}"`:`data-restore-task="${esc(r.id)}"`} aria-label="恢复${noun} ${esc(r.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9a8 8 0 1 1-1 7M5 4v5h5"/></svg>恢复${noun}</button></article>`).join('')}</div>`:`<div class="recycle-empty">${recycleIcon}<h3>回收站是空的</h3><p>删除的${noun}会收纳在这里。恢复后可以继续使用。</p></div>`}</section>`;
}
export function mainNavigation({active='discussion',roomId='',extra=''}={}){
 const room=roomId?encodeURIComponent(roomId):'';
 const routes={discussion:'/discussion'+(room?'#'+room:''),workbench:'/workbench'+(room?'?room='+room:'')+'#control',models:'/models'+(room?'?room='+room:'')};
 const icons={discussion:'<path d="M4 5h16v11H9l-5 4zM8 9h8M8 12h5"/>',workbench:'<path d="m4 6 5 5-5 5m8 1h8M3 3h18v18H3z"/>',models:'<path d="M9 3h6m-5 0v7l-6 9a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-9V3M7 16h10"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>'};
 const item=(id,label)=>'<a class="global-nav-link '+(active===id?'is-current':'')+'" href="'+routes[id]+'" '+(active===id?'aria-current="page"':'')+'><svg viewBox="0 0 24 24" aria-hidden="true">'+icons[id]+'</svg><span>'+label+'</span></a>';
 return '<nav class="global-rail" aria-label="全局导航"><a class="global-brand" href="'+routes.discussion+'" aria-label="ForgeRelay 首页"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 30V10h14M8 19h12M21 30V10h4a6 6 0 0 1 0 12h-4m4 0 7 8"/></svg><span>ForgeRelay</span></a><div class="global-primary">'+item('discussion','三方会谈')+item('workbench','任务控制')+item('models','模型实验室')+'</div><div class="global-nav-spacer"></div><div class="global-ambient">'+ambientControl()+'</div><button class="global-command" type="button" data-command-open aria-label="快捷导航，Ctrl 或 Command 加 K" title="快捷导航 · Ctrl / ⌘ K"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg><span>快捷导航</span><kbd>⌘ K</kbd></button><a class="global-nav-link global-settings" href="/workbench#settings"><svg viewBox="0 0 24 24" aria-hidden="true">'+icons.settings+'</svg><span>模型接入</span></a></nav>'+(extra?'<nav class="global-secondary global-context-strip" aria-label="执行管理">'+extra+'</nav>':'');
}
// Original parametric ribbons: an illustration of the two collaborating roles,
// never a simulated activity indicator or a copy of the reference video's artwork.
export function collaborationStructure({team=[],leaderId=''}={}){const roles=team.length?team:[{id:'codex',name:'主导 / 实现与复核',provider:'Codex'},{id:'deepseek',name:'协作 / 实现与质疑',provider:'DeepSeek'}];return '<div class="relay-schematic"><div class="schematic-title"><span>协商团队</span><code>'+String(roles.length).padStart(2,'0')+' / ROLES</code></div><relay-sculpture compact aria-hidden="true"></relay-sculpture><div class="schematic-roles">'+roles.map(a=>'<span>'+esc(a.name)+(a.id===leaderId?' · 主持':'')+'</span>').join('')+'</div><p>人的前提定义边界，独立互审支撑决策。</p></div>';}

export function ambientControl(){return `<button type="button" class="effects-toggle" data-ambient-toggle aria-pressed="true" aria-label="关闭动态光效" title="切换动态光效"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/><circle cx="12" cy="12" r="4"/></svg><span data-effects-label>光效已开</span><i></i></button>`;}
export function mountAmbient(){
  mountBudgetToggles();
  mountDesktop();
  mountReflections();
  mountFloatingNetworks();
  window.addEventListener('relay-desktop-notice',event=>notify(event.detail));
  mountShortcuts();
  if(document.getElementById('relay-ambience'))return;
  Object.assign(document.body.dataset,{designVariance:'7',motionIntensity:'6',visualDensity:'5'});
  const atmosphere=document.createElement('div');atmosphere.id='relay-ambience';atmosphere.setAttribute('aria-hidden','true');atmosphere.innerHTML='<div class="ambient-field field-mint"></div><div class="ambient-field field-ice"></div><div class="ambient-field field-warm"></div><div class="ambient-grain"></div>';document.body.prepend(atmosphere);
  const reduce=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(hover: hover) and (pointer: fine)');let off=false,panel=null;try{off=localStorage.getItem('relay.effects.off')==='true';}catch{}
  const motion=window.gsap;let lensX=null,lensY=null;
  const clear=()=>{panel?.classList.remove('lens-active');if(panel)motion?.killTweensOf(panel,'--lens-x,--lens-y');panel=null;lensX=null;lensY=null;};
  function sync(){const active=!off&&!reduce.matches;document.body.dataset.effects=active?'on':'off';document.dispatchEvent(new Event('relay-effects-change'));if(!active)clear();for(const b of document.querySelectorAll('[data-ambient-toggle]')){b.setAttribute('aria-pressed',String(active));b.setAttribute('aria-label',active?'关闭动态光效':'开启动态光效');b.disabled=reduce.matches;const label=b.querySelector('[data-effects-label]');if(label)label.textContent=active?'光效已开':'静态模式';}}
  document.addEventListener('pointermove',e=>{if(off||reduce.matches||!fine.matches||e.pointerType==='touch')return;const next=e.target.closest('.role-editor,.policy-number,.conversation,.shared-panel,.start-panel,.protocol-panel,.panel,.connection-card,.feature-card,.lab-workspace');if(next!==panel){clear();panel=next;if(panel){const r=panel.getBoundingClientRect();panel.style.setProperty('--lens-x',(e.clientX-r.left)+'px');panel.style.setProperty('--lens-y',(e.clientY-r.top)+'px');lensX=motion?motion.quickTo(panel,'--lens-x',{duration:.34,ease:'power3.out'}):v=>panel?.style.setProperty('--lens-x',v+'px');lensY=motion?motion.quickTo(panel,'--lens-y',{duration:.34,ease:'power3.out'}):v=>panel?.style.setProperty('--lens-y',v+'px');panel.classList.add('lens-active');}}if(panel){const r=panel.getBoundingClientRect();lensX(e.clientX-r.left);lensY(e.clientY-r.top);}},{passive:true});
  document.documentElement.addEventListener('pointerleave',clear);window.addEventListener('blur',clear);window.addEventListener('scroll',clear,{passive:true});
  document.addEventListener('click',e=>{if(!e.target.closest('[data-ambient-toggle]'))return;off=!off;try{localStorage.setItem('relay.effects.off',String(off));}catch{}sync();});reduce.addEventListener('change',sync);new MutationObserver(sync).observe(document.getElementById('app'),{childList:true});sync();mountViewMotion();
}

// Animate a view change once. Live event updates and editor keystrokes must never
// replay an entrance or move the control the person is using.
function mountViewMotion(){
  const app=document.getElementById('app'),gsap=window.gsap,reduce=matchMedia('(prefers-reduced-motion: reduce)');
  if(!gsap)return;
  let previous='',queued=false,tween=null;
  const settle=()=>{tween?.progress(1);tween?.kill();tween=null;};
  const update=()=>{queued=false;const view=app.querySelector('[data-motion-view]'),heading=app.querySelector('h1');if(!heading)return;const key=view?.dataset.motionView||location.pathname+location.hash;if(key===previous)return;previous=key;settle();if(reduce.matches||document.body.dataset.effects==='off')return;const targets=view?[view]:[...app.querySelectorAll('.page-heading,.room-heading,.page-title,.new-grid,.discussion-grid,.top-grid')];if(targets.length)tween=gsap.fromTo(targets,{y:9,opacity:.5},{y:0,opacity:1,duration:.52,stagger:.045,ease:'power3.out',clearProps:'transform,opacity',onComplete:()=>tween=null});};
  const schedule=()=>{if(!queued){queued=true;queueMicrotask(update);}};
  new MutationObserver(schedule).observe(app,{childList:true,subtree:true,attributes:true,attributeFilter:['data-motion-view']});
  document.addEventListener('relay-effects-change',()=>{if(document.body.dataset.effects==='off')settle();});reduce.addEventListener('change',()=>{if(reduce.matches)settle();});document.addEventListener('visibilitychange',()=>{if(document.hidden)settle();});schedule();
}
const taskStates={assigned:'已分派',running:'执行中',submitted:'待 Codex 验收',accepted:'验收通过',changes_requested:'退回修改',blocked:'受阻',failed:'执行失败',interrupted:'已中断',stale:'方向变更，已过时'};
export function workItemsView(room){const tasks=room.workItems||[];return `<div class="dispatch-flow"><span>Codex 派工</span><b>→</b><span>DeepSeek 执行</span><b>→</b><span>Codex 验收</span></div><p class="dispatch-note">${tasks.length?`${tasks.filter(t=>t.status==='accepted').length} 项已验收 · ${tasks.filter(t=>t.status==='submitted').length} 项待验收`:'目标、文件范围与验收标准组成合同，退回后带着意见重做。'}</p>${tasks.length?tasks.map(t=>`<details data-remember="work-${t.id}" class="work-item" ${t.status!=='accepted'?'open':''}><summary><span class="task-state ${t.status}">${taskStates[t.status]||esc(t.status)}</span><b>${esc(t.title)}</b></summary><p>${esc(t.goal)}</p><small>Codex → DeepSeek · 人工方向 v${t.revision} · ${t.attempts.length} 次执行</small><div class="task-contract"><b>文件范围</b><p>${t.files.map(esc).join(' · ')||'只读调查'}</p><b>验收标准</b><ol>${t.acceptance.map(c=>`<li>${esc(c)}</li>`).join('')}</ol>${t.constraints.length?`<b>约束</b><p>${t.constraints.map(esc).join('；')}</p>`:''}</div>${t.attempts.map(a=>`<details class="task-attempt" data-remember="attempt-${t.id}-${a.number}"><summary>执行 ${a.number} · ${taskStates[a.status]||esc(a.status)} · ${a.toolIds?.length||0} 项工具记录</summary><p>${esc(a.summary||a.error||'等待实际交付')}</p>${a.artifacts.map(f=>`<div class="task-artifact"><b>${esc(f.path)}</b><code>${f.hash}</code></div>`).join('')}${a.checks?.map(c=>`<p>${c.passed?'通过':'未通过'} ${esc(c.criterion)}<br><small>${esc(c.evidence)}</small></p>`).join('')||''}${a.blockers?.length?`<p>阻碍：${a.blockers.map(esc).join('；')}</p>`:''}</details>`).join('')}${t.reviews.map(r=>`<div class="task-review"><b>Codex · ${taskStates[r.decision]}</b><p>${esc(r.feedback)}</p><small>${r.evidenceIds.length} 项独立复核证据</small></div>`).join('')}</details>`).join(''):'<div class="panel-empty">尚无派工<br><span>开始后，Codex 可把调查、实现和验证分配给 DeepSeek。实际调用才会出现任务。</span></div>'}`;}
let pendingFiles=[],projectDraft='',modeDraft='read',activeRoom='',skillDraft='';const projectEdits=new Map();
export const pendingAttachmentNames=()=>pendingFiles.map(file=>file.name);
export function captureRuntimeDraft(){const project=document.querySelector('#new-project'),mode=document.querySelector('#new-mode'),existing=document.querySelector('#runtime-project'),skill=document.querySelector('#runtime-skill-form input');if(project)projectDraft=project.value;if(mode)modeDraft=mode.value;if(existing&&activeRoom)projectEdits.set(activeRoom,existing.value);if(skill)skillDraft=skill.value;}
export function presentMessage(m){if(m.phase==='mcp'){try{const item=JSON.parse(m.text);return{...m,text:`调用 ${item.tool} · ${item.error?'失败':item.status==='completed'?'已返回':item.status}${item.error?'\n'+JSON.stringify(item.error):''}`,toolOutput:item.result?.join('\n')};}catch{return m;}}if(['command','command_start','files'].includes(m.phase))return{...m,text:m.phase==='files'?'实际文件变化':m.phase==='command_start'?'正在执行实际命令':'实际命令结果已返回',toolOutput:m.text};return m;}
export function newRuntimeFields(){return `<div class="new-runtime"><label for="new-project">挂载项目（可选，本机完整路径）</label><input id="new-project" name="workspace" value="${esc(projectDraft)}" placeholder="C:\\Projects\\my-app"><div class="runtime-form-row"><label for="new-mode">协作权限</label><select id="new-mode" name="mode"><option value="read" ${modeDraft==='read'?'selected':''}>只读讨论与调查</option><option value="work" ${modeDraft==='work'?'selected':''}>实际工作：可修改项目、执行命令</option></select></div>${runtimeFileButton(true)}<div class="pending-files">${pendingFiles.map((f,i)=>`<span>${esc(f.name)} <button type="button" data-remove-file="${i}" aria-label="移除 ${esc(f.name)}">×</button></span>`).join('')}</div></div>`;}
export function runtimeFileButton(pending=false){return `<label class="attach-button">＋ ${pending?'图片 / 文件':'附件'}<input type="file" ${pending?'id="pending-upload"':'id="room-upload"'} multiple hidden></label>`;}
async function upload(room,file,api){if(file.size>25*1024*1024)throw new Error('单个文件上限为 25 MiB');const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});return api(`/api/discussions/${room.id}/attachments`,{name:file.name,base64});}
export async function uploadPending(room,api){let current=room;try{for(const file of pendingFiles)current=await upload(current,file,api);}catch(cause){const error=new Error('会话已经创建，部分附件未上传：'+cause.message+'。请在运行环境中补齐附件后再开始。');error.room=current;throw error;}finally{pendingFiles=[];projectDraft='';modeDraft='read';}return current;}
export function runtimeView(room){activeRoom=room.id;const runtime=room.runtime||{mode:'read',computer:'off'},files=room.attachments||[],tools=room.toolCalls||[],agents=room.agents||[];return `<section class="runtime-settings"><h3>会话模型配置</h3><p>${room.modelProfile?`${esc(room.modelProfile.name)} · 固定快照<br>Codex：${esc(room.modelProfile.settings.codex.model||'继承本机 CLI')}<br>DeepSeek：${esc(room.modelProfile.settings.deepseek.model)}<br><code>${esc(room.modelProfile.hash.slice(0,16))}</code>`:'历史会话尚无模型配置快照，下次启动时采用当前配置。'}</p><a href="/models?room=${room.id}">调节双方模型与叛逆值 ↗</a></section><section class="runtime-settings"><h3>真实执行权限</h3><label for="runtime-mode">项目操作</label><select id="runtime-mode"><option value="read" ${runtime.mode==='read'?'selected':''}>只读讨论与调查</option><option value="work" ${runtime.mode==='work'?'selected':''}>允许修改项目与执行命令</option></select><label for="runtime-computer">Computer Use</label><select id="runtime-computer">${[['off','关闭'],['browser','独立浏览器 · 两方分别持有'],['desktop','Windows 桌面 · 两方串行操作']].map(([v,text])=>`<option value="${v}" ${runtime.computer===v?'selected':''}>${text}</option>`).join('')}</select><p>命令以当前用户权限运行。桌面模式会把当前截图发给执行操作的模型；桌面控制须同时开启工作模式。</p><form id="runtime-project-form"><label for="runtime-project">共享项目</label><input id="runtime-project" name="project" value="${esc(projectEdits.get(room.id)??room.workspace)}" required><button class="secondary" type="submit">挂载项目</button></form></section>
<section class="runtime-resources"><h3>共享附件 <span>${files.length}</span></h3>${runtimeFileButton()}${files.length?files.map(f=>`<a class="attachment-item" href="/api/discussions/${room.id}/attachments/${f.id}/file" target="_blank" rel="noopener">${f.type==='image'?`<img src="/api/discussions/${room.id}/attachments/${f.id}/file" alt="${esc(f.name)}">`:`<span class="file-type">${esc(f.name.split('.').at(-1).slice(0,5))}</span>`}<span><b>${esc(f.name)}</b><small>${f.type} · ${(f.size/1024).toFixed(1)} KB</small></span></a>`).join(''):'<p>可添加图片、文档、代码和其他文件。未解码的文件会如实标明。</p>'}</section>
<section class="runtime-resources"><h3>技能</h3><p>Codex 原生配置 + 本机 SKILL.md。DeepSeek 通过自己的工具回路加载技能。</p><form id="runtime-skill-form"><input id="runtime-skill" name="skill" value="${esc(skillDraft)}" placeholder="例如 design-taste-frontend" aria-label="技能名称" required><button class="secondary" type="submit">指定技能</button></form>${room.enabledSkills?.length?`<p class="skill-names">${room.enabledSkills.map(esc).join(' · ')}</p>`:''}<details><summary>本会话实际加载</summary><pre>${esc(JSON.stringify(room.loadedSkills||{},null,2))}</pre></details></section>
<section class="runtime-resources"><h3>后台进程 <span>${room.processes?.length||0}</span></h3>${room.processes?.length?room.processes.map(p=>`<details data-remember="process-${p.id}" class="runtime-entry"><summary>${esc(p.owner)} · ${esc(p.status)}</summary><pre>${esc(p.command)}\n${esc(p.stdout||p.stderr||p.error||"")}</pre>${["starting","running"].includes(p.status)?`<button class="secondary" data-stop-process="${p.id}">停止进程</button>`:""}</details>`).join(""):"<p>预览服务器等长任务使用 start_process 管理；可在此查看和停止。</p>"}</section><section class="runtime-resources"><h3>实际子代理 <span>${agents.length}</span></h3>${agents.length?agents.map(a=>`<details data-remember="agent-${a.id}" class="runtime-entry"><summary>${esc(a.owner)} · ${esc(a.status)}</summary><p>${esc(a.task)}</p><pre>${esc(a.result||a.error||'等待真实返回')}</pre></details>`).join(''):'<p>没有实际调用就显示 0，不生成预设代理。</p>'}</section>
<section class="runtime-resources"><h3>工具现场 <span>${tools.length}</span></h3>${tools.length?tools.slice().reverse().map(t=>`<details data-remember="tool-${t.id}" class="runtime-entry"><summary>${esc(t.actor)} · ${esc(t.name)} <span>${esc(t.status)}</span></summary><pre>${esc(JSON.stringify(t.args,null,2))}\n${esc(t.result||t.error||'等待实际结果')}</pre></details>`).join(''):'<p>项目读取、命令、技能、子代理和 Computer Use 都会保留实际记录。</p>'}</section>`;}
export function setupRuntime({app,api,room,render,update,toast}){
  const addFiles=async(files,pending)=>{try{if(pending){pendingFiles.push(...files);render();}else{let r=room();if(!r)throw new Error('请先创建会话');for(const file of files)r=await upload(r,file,api);update(r);toast('附件已挂载，旧表决已失效。');}}catch(err){toast(err.message);}};
  app.addEventListener('change',async e=>{const input=e.target;if(input.id==='pending-upload'||input.id==='room-upload'){await addFiles([...input.files],input.id==='pending-upload');return;}if(input.id==='runtime-mode'||input.id==='runtime-computer'){try{const r=room();if(!r)return;update(await api(`/api/discussions/${r.id}/runtime-config`,{[input.id==='runtime-mode'?'mode':'computer']:input.value}));}catch(err){toast(err.message);render();}}});
  app.addEventListener('submit',async e=>{if(!['runtime-project-form','runtime-skill-form'].includes(e.target.id))return;e.preventDefault();const data=Object.fromEntries(new FormData(e.target));try{update(await api(`/api/discussions/${room().id}/runtime-config`,data));toast('会话设置已更新，双方会按新方向重新审查。');}catch(err){toast(err.message);}});
  app.addEventListener('click',async e=>{const stop=e.target.closest('[data-stop-process]');if(stop){try{await api(`/api/discussions/${room().id}/processes/${stop.dataset.stopProcess}/stop`,{});toast('进程已停止。');}catch(err){toast(err.message);}return;}const remove=e.target.closest('[data-remove-file]');if(remove){pendingFiles.splice(Number(remove.dataset.removeFile),1);render();}});
  app.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
  app.addEventListener('drop',e=>{if(!e.dataTransfer?.files.length)return;e.preventDefault();void addFiles([...e.dataTransfer.files],!room());});
}

// One rounded, solid Möbius ribbon. It illustrates collaboration, not activity.
let retainedSculpturePhase=.8;
const retainedSculpturePoses=new Map();
const spring=(s,target,omega,dt)=>{const delta=s.value-target,c=(s.velocity+omega*delta)*dt,decay=Math.exp(-omega*dt);s.value=target+(delta+c)*decay;s.velocity=(s.velocity-omega*c)*decay;return s.value;};

// The width frame and thickness frame both reverse after one circuit. Closing
// the cross-section at the opposite side yields one joined, half-twisted solid.
export function ribbonPoint(u,s,t){
  const tangent=[-1.36*Math.sin(u),1.26*Math.cos(2*u),.32*Math.cos(u)],length=Math.hypot(...tangent),flatLength=Math.hypot(tangent[0],tangent[1]);
  const T=tangent.map(v=>v/length),B=[-tangent[1]/flatLength,tangent[0]/flatLength,0],N=[T[2]*B[1],-T[2]*B[0],T[1]*B[0]-T[0]*B[1]],a=u/2+.38,b=s*Math.cos(a)-t*Math.sin(a),n=s*Math.sin(a)+t*Math.cos(a);
  return[1.36*Math.cos(u)+b*B[0]+n*N[0],.63*Math.sin(2*u)+b*B[1]+n*N[1],.32*Math.sin(u)+n*N[2]];
}
export function createRibbonMesh(segments=160){
  const section=[],width=.22,height=.027,bevel=.021;
  const add=(x,y,nx,ny)=>section.push([x,y,nx,ny]);
  // Broad planar faces, short sides and rounded corners; no stacked sheets.
  const corners=[[width-bevel,height-bevel,0],[-width+bevel,height-bevel,Math.PI/2],[-width+bevel,-height+bevel,Math.PI],[width-bevel,-height+bevel,Math.PI*1.5]];
  for(let side=0;side<4;side++){
    const [cx,cy,start]=corners[side];
    for(let k=0;k<=6;k++){const a=start+k/6*Math.PI/2;add(cx+Math.cos(a)*bevel,cy+Math.sin(a)*bevel,Math.cos(a),Math.sin(a));}
    const next=corners[(side+1)%4],end=start+Math.PI/2;
    const from=[cx+Math.cos(end)*bevel,cy+Math.sin(end)*bevel],to=[next[0]+Math.cos(end)*bevel,next[1]+Math.sin(end)*bevel];
    const steps=side%2===0?12:2;for(let k=1;k<steps;k++)add(from[0]+(to[0]-from[0])*k/steps,from[1]+(to[1]-from[1])*k/steps,Math.cos(end),Math.sin(end));
  }
  const vertices=[],indices=[],n=section.length;
  for(let i=0;i<=segments;i++)for(const p of section)vertices.push(i/segments*Math.PI*2,...p);
  for(let i=0;i<segments;i++)for(let j=0;j<n;j++){const a=i*n+j,b=i*n+(j+1)%n,c=(i+1)*n+j,d=(i+1)*n+(j+1)%n;indices.push(a,c,b,b,c,d);}
  return{vertices:new Float32Array(vertices),indices:new Uint16Array(indices),section,segments};
}
const tileNormalize=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
const tileCross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const tileDot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const tileSub=(a,b)=>a.map((v,i)=>v-b[i]);
const retainedTileStates=new Map();
export function createRibbonTiles(rows=4){
  const arc=[{u:0,length:0}],samples=768;let total=0,last=ribbonPoint(0,0,0);
  for(let i=1;i<=samples;i++){const u=i/samples*Math.PI*2,p=ribbonPoint(u,0,0);total+=Math.hypot(...tileSub(p,last));arc.push({u,length:total});last=p;}
  const columns=Math.round(total/(.44/rows)/2)*2,step=total/columns;
  const at=distance=>{let lo=0,hi=arc.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(arc[mid].length<distance)lo=mid;else hi=mid;}const a=arc[lo],b=arc[hi];return a.u+(b.u-a.u)*(distance-a.length)/(b.length-a.length);};
  const tiles=[];
  for(let i=0;i<columns;i++)for(let j=0;j<rows;j++){
    const u=at((i+.5)*step),s=-.22+(j+.5)*.44/rows,centre=ribbonPoint(u,s,0);
    const U=tileNormalize(tileSub(ribbonPoint(u+.001,s,0),ribbonPoint(u-.001,s,0))),rawV=tileSub(ribbonPoint(u,s+.001,0),ribbonPoint(u,s-.001,0)),V=tileNormalize(rawV.map((v,k)=>v-U[k]*tileDot(rawV,U))),N=tileNormalize(tileCross(U,V));
    const span=Math.hypot(...tileSub(ribbonPoint(at((i+1)*step),s,0),ribbonPoint(at(i*step),s,0)));
    const size=Math.min(.44/rows,span)*.87,seed=(Math.sin((i*rows+j+1)*12.9898)*43758.5453)%1;
    tiles.push({centre,U,V,N,half:size/2,seed:Math.abs(seed),open:{value:0,velocity:0},id:i*rows+j});
  }
  return tiles;
}
export function ribbonRotation(x,y,z){const sx=Math.sin(x),cx=Math.cos(x),sy=Math.sin(y),cy=Math.cos(y),sz=Math.sin(z),cz=Math.cos(z);return new Float32Array([cz*cy,sz*cy,-sy,cz*sy*sx-sz*cx,sz*sy*sx+cz*cx,cy*sx,cz*sy*cx+sz*sx,sz*sy*cx-cz*sx,cy*cx]);}
const tileVertex=`
precision highp float;
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUV;
attribute float aOpen;
uniform vec2 uFit;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUV;
varying float vOpen;
void main(){vNormal=aNormal;vPosition=aPosition;vUV=aUV;vOpen=aOpen;float q=1.-aPosition.z/6.;gl_Position=vec4(aPosition.xy*uFit,-aPosition.z*.18*q,q);}
`;
const tileFragment=`
precision highp float;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUV;
varying float vOpen;
void main(){
 vec3 n=normalize(vNormal),view=normalize(vec3(-vPosition.xy,6.-vPosition.z));
 if(dot(n,view)<0.)n=-n;
 float diffuse=max(0.,dot(n,normalize(vec3(-.6,.9,1.6))));
 float edge=1.-smoothstep(.018,.065,min(min(vUV.x,1.-vUV.x),min(vUV.y,1.-vUV.y)));
 vec3 r=reflect(-view,n);
 float soft=exp(-pow((r.y-.4)/.45,2.)-pow((r.x+.3)/.9,2.));
 vec3 colour=vec3(.39,.48,.44)+diffuse*vec3(.10,.12,.11)+soft*vec3(.10,.12,.11)+edge*vec3(.12,.15,.14)+vOpen*.06;
 gl_FragColor=vec4(colour,.40+edge*.18+vOpen*.10);
}
`;
function makeTileGL(canvas,count){
 const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true,powerPreference:'low-power'});if(!gl)return null;
 const resources=[];
 const dispose=()=>{for(const [type,r]of resources)gl['delete'+type[0].toUpperCase()+type.slice(1)](r);};
 try{
  const program=gl.createProgram();resources.push(['program',program]);
  for(const [type,source]of [[gl.VERTEX_SHADER,tileVertex],[gl.FRAGMENT_SHADER,tileFragment]]){const s=gl.createShader(type);resources.push(['shader',s]);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(program,s);}
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  const buffer=gl.createBuffer(),index=gl.createBuffer();resources.push(['buffer',buffer],['buffer',index]);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,count*4*9*4,gl.DYNAMIC_DRAW);
  const indices=new Uint16Array(count*6);for(let i=0;i<count;i++)indices.set([i*4,i*4+1,i*4+2,i*4,i*4+2,i*4+3],i*6);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
  for(const [name,size,offset]of [['aPosition',3,0],['aNormal',3,12],['aUV',2,24],['aOpen',1,32]]){const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,36,offset);}
  const fit=gl.getUniformLocation(program,'uFit');gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
  return{render(vertices,scale){gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,vertices);gl.uniform2fv(fit,scale);gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);},dispose};
 }catch(error){console.warn('Tile material: '+error.message);dispose();return null;}
}
class RelaySculpture extends (globalThis.HTMLElement||class{}){
 connectedCallback(){
  if(this.canvas)return;
  this.poseKey=this.hasAttribute('compact')?'compact':'network';
  this.tiles=createRibbonTiles(this.hasAttribute('compact')?3:4);
  const savedTiles=retainedTileStates.get(this.poseKey);this.tiles.forEach((tile,i)=>{if(savedTiles?.[i])tile.open={...savedTiles[i]};});
  this.vertices=new Float32Array(this.tiles.length*36);
  this.canvas=document.createElement('canvas');this.canvas.setAttribute('aria-hidden','true');this.append(this.canvas);this.renderer=makeTileGL(this.canvas,this.tiles.length);
  if(!this.renderer){this.canvas.remove();this.canvas=document.createElement('canvas');this.canvas.setAttribute('aria-hidden','true');this.append(this.canvas);this.ctx=this.canvas.getContext('2d');}
  const prior=retainedSculpturePoses.get(this.poseKey);this.pose=Object.fromEntries(['x','y','presence'].map(k=>[k,prior?.[k]||{value:0,velocity:0}]));
  this.frame=0;this.phase=retainedSculpturePhase;this.phaseTime=null;this.visible=true;this.target={x:0,y:0,presence:0};this.hoverPoint=null;this.reduce=matchMedia('(prefers-reduced-motion: reduce)');
  this.resize=()=>{if(!this.canvas||!this.isConnected)return;const r=this.getBoundingClientRect();this.width=r.width;this.height=r.height;this.dpr=Math.min(devicePixelRatio||1,1.8);this.canvas.width=Math.max(1,Math.round(r.width*this.dpr));this.canvas.height=Math.max(1,Math.round(r.height*this.dpr));this.draw(performance.now());};
  this.resume=()=>{cancelAnimationFrame(this.raf);this.last=0;this.phaseTime=null;if(this.visible&&!document.hidden&&this.isConnected&&!this.contextLost){this.draw(performance.now());if(this.moving())this.raf=requestAnimationFrame(t=>this.tick(t));}};
  this.pointer=e=>{if(!this.moving()||e.pointerType==='touch')return;const r=this.getBoundingClientRect();if(!r.width||!r.height)return;this.target={x:Math.max(-1,Math.min(1,(e.clientX-r.left)/r.width*2-1)),y:Math.max(-1,Math.min(1,(e.clientY-r.top)/r.height*2-1)),presence:1};this.hoverPoint={x:e.clientX,y:e.clientY,eligible:!e.target.closest('button,a,input,textarea,select,[role="button"],[role="switch"]')};};
  this.leave=()=>{this.target={x:0,y:0,presence:0};this.hoverPoint=null;};
  this.lost=e=>{e.preventDefault();this.contextLost=true;cancelAnimationFrame(this.raf);};this.restored=()=>{this.renderer?.dispose();this.renderer=makeTileGL(this.canvas,this.tiles.length);this.contextLost=false;this.resume();};
  this.canvas.addEventListener('webglcontextlost',this.lost);this.canvas.addEventListener('webglcontextrestored',this.restored);
  this.observer=new ResizeObserver(this.resize);this.observer.observe(this);this.intersection=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;this.resume();});this.intersection.observe(this);
  this.stage=this.parentElement;this.stage.addEventListener('pointermove',this.pointer,{passive:true});this.stage.addEventListener('pointerleave',this.leave);window.addEventListener('blur',this.leave);
  document.addEventListener('visibilitychange',this.resume);document.addEventListener('relay-effects-change',this.resume);this.reduce.addEventListener('change',this.resume);this.resume();
 }
 disconnectedCallback(){cancelAnimationFrame(this.raf);retainedSculpturePoses.set(this.poseKey,structuredClone(this.pose));retainedTileStates.set(this.poseKey,this.tiles.map(t=>({...t.open})));this.observer?.disconnect();this.intersection?.disconnect();this.stage?.removeEventListener('pointermove',this.pointer);this.stage?.removeEventListener('pointerleave',this.leave);window.removeEventListener('blur',this.leave);document.removeEventListener('visibilitychange',this.resume);document.removeEventListener('relay-effects-change',this.resume);this.reduce?.removeEventListener('change',this.resume);this.canvas?.removeEventListener('webglcontextlost',this.lost);this.canvas?.removeEventListener('webglcontextrestored',this.restored);this.renderer?.dispose();this.canvas?.remove();this.canvas=null;}
 moving(){return !this.reduce.matches&&document.body.dataset.effects!=='off';}
 tick(time){if(!this.isConnected||!this.visible||document.hidden||!this.moving()||this.contextLost)return;if(!this.last||time-this.last>=32){this.draw(time);this.last=time;}this.raf=requestAnimationFrame(t=>this.tick(t));}
 draw(time){
  const w=this.width,h=this.height;if(!w||!h||this.contextLost)return;
  const moving=this.moving(),dt=this.phaseTime===null?0:Math.min((time-this.phaseTime)/1000,.064);this.phaseTime=moving?time:null;
  if(moving){this.phase+=dt*.26;retainedSculpturePhase=this.phase;spring(this.pose.x,this.target.x,10.5,dt);spring(this.pose.y,this.target.y,10.5,dt);spring(this.pose.presence,this.target.presence,10,dt);}
  const px=this.pose.x.value,py=this.pose.y.value,t=this.phase,m=ribbonRotation(.30+Math.sin(t*.6)*.035+py*.22,-.20+Math.sin(t*.5)*.04+px*.30,-.12+Math.sin(t*.37)*.02);
  const rotate=p=>[p[0]*m[0]+p[1]*m[3]+p[2]*m[6],p[0]*m[1]+p[1]*m[4]+p[2]*m[7],p[0]*m[2]+p[1]*m[5]+p[2]*m[8]];
  const scale=Math.min(w/3.65,h/2.95)*.97,fit=[scale*2/w,scale*2/h],rect=this.getBoundingClientRect(),pointer=this.hoverPoint;
  const project=p=>[w/2+p[0]*scale/(1-p[2]/6),h/2-p[1]*scale/(1-p[2]/6)];
  const mouse=pointer?[(pointer.x-rect.left)*w/rect.width,(pointer.y-rect.top)*h/rect.height]:null;
  let closest=null,minRatio=Infinity;
  const rest=this.tiles.map(tile=>{const centre=rotate(tile.centre);centre[1]+=Math.sin(t*.7)*.016;const screen=project(centre),radius=tile.half*scale/(1-centre[2]/6)*1.6+3,distance=mouse?Math.hypot(screen[0]-mouse[0],screen[1]-mouse[1]):Infinity,ratio=distance/radius;if(ratio<minRatio){closest=tile;minRatio=ratio;}return{tile,centre,screen,distance,U:rotate(tile.U),V:rotate(tile.V),N:rotate(tile.N)};});
  const hovering=moving&&pointer?.eligible&&minRatio<1,spreadRadius=this.hasAttribute('compact')?28:46;
  let spread=0,maxOpen=0;
  const frames=rest.map(r=>{
   const tile=r.tile,target=hovering?Math.exp(-r.distance*r.distance/(2*spreadRadius*spreadRadius)):0;
   if(moving)spring(tile.open,target,9,dt);
   const open=tile.open.value;if(open>.03)spread++;maxOpen=Math.max(maxOpen,open);
   const axis=tileNormalize(r.U.map((v,i)=>v*Math.cos(tile.seed*6.28)+r.V[i]*Math.sin(tile.seed*6.28))),angle=open*Math.PI*(.72+tile.seed*.5)*(tile.seed>.5?1:-1),co=Math.cos(angle),si=Math.sin(angle);
   const turn=v=>{const cross=tileCross(axis,v),dot=tileDot(axis,v);return v.map((x,i)=>x*co+cross[i]*si+axis[i]*dot*(1-co));};
   const centre=r.centre.map((v,i)=>v+open*(r.N[i]*(.15+tile.seed*.12)+r.U[i]*Math.sin(tile.seed*23)*.12+r.V[i]*Math.cos(tile.seed*31)*.1));
   return{centre,U:turn(r.U),V:turn(r.V),N:turn(r.N),half:tile.half,open};
  }).sort((a,b)=>a.centre[2]-b.centre[2]);
  let cursor=0;const corners=[[-1,-1],[1,-1],[1,1],[-1,1]];
  for(const f of frames)for(const [x,y]of corners){for(let k=0;k<3;k++)this.vertices[cursor++]=f.centre[k]+f.U[k]*x*f.half+f.V[k]*y*f.half;for(const n of f.N)this.vertices[cursor++]=n;this.vertices[cursor++]=(x+1)/2;this.vertices[cursor++]=(y+1)/2;this.vertices[cursor++]=f.open;}
  if(this.renderer)this.renderer.render(this.vertices,fit);else{
   const ctx=this.ctx;ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.clearRect(0,0,w,h);ctx.lineWidth=.65;
   for(const f of frames){const pts=corners.map(([x,y])=>project(f.centre.map((v,i)=>v+f.U[i]*x*f.half+f.V[i]*y*f.half)));ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle='rgba(157,184,170,'+(.4+f.open*.1)+')';ctx.strokeStyle='rgba(196,218,204,.55)';ctx.fill();ctx.stroke();}
  }
  this.frame++;Object.assign(this.dataset,{frame:String(this.frame),motion:moving?'running':'static',interaction:hovering?'tiles-open':this.pose.presence.value>.01?'responding':'rest',pointerX:px.toFixed(3),pointerY:py.toFixed(3),tiles:String(this.tiles.length),spreadTiles:String(spread),maxOpen:maxOpen.toFixed(4),hoverTile:hovering?String(closest.id):'',renderer:this.renderer?'webgl-tiles':'canvas-tiles'});
 }
}
if(globalThis.customElements&&!customElements.get('relay-sculpture'))customElements.define('relay-sculpture',RelaySculpture);
