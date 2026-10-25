import {budgetField,readBudgetInputs,setBudgetInputs,limitText} from './budget-limits.js';
import {createDraftStore,createRenderGate,protectInput,createApiClient} from './experience.js';
import {notify,recycleIcon,recycleView,mountAmbient,ambientControl,mainNavigation,providerIcon} from './runtime-ui.js';
import {cacheOverview,cacheCallDetail} from './cache-usage.js';
import {activeProviders,leaderProvider,participantsReady,planningEmptyTitle} from './participants.js';
import {curvedConnection} from './floating-geometry.js';
let graphCleanup,sceneSeen=false,graphMotionClock=0;
const retainedGraphLights=new Map();
const $ = s => document.querySelector(s), app = $('#app'), modal = $('#modal');
mountAmbient();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const n = value => Number(value || 0).toLocaleString('zh-CN');
const shortTime = value => value ? new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  task: '<path d="M9 5H5v16h14V5h-4M9 3h6v4H9zM8 12h8M8 16h5"/>',
  memory: '<path d="M8 3a4 4 0 0 0-4 5 4 4 0 0 0-1 7 4 4 0 0 0 5 6M16 3a4 4 0 0 1 4 5 4 4 0 0 1 1 7 4 4 0 0 1-5 6M9 3v18m6-18v18M4 9h5m6 6h5"/>',
  file: '<path d="M14 3H5v18h14V8zM14 3v5h5M8 13h8M8 17h5"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="m5 5 14 14M19 5 5 19"/>', arrow: '<path d="M4 12h16m-5-5 5 5-5 5"/>',
  play: '<path d="m8 4 12 8-12 8z"/>', pause: '<path d="M8 4v16M16 4v16"/>', stop: '<rect x="6" y="6" width="12" height="12"/>',
  search: '<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/>', link: '<path d="m9 15 6-6M7 17l-1 1a4 4 0 0 1-5-6l6-6a4 4 0 0 1 6 0M17 7l1-1a4 4 0 0 1 5 6l-6 6a4 4 0 0 1-6 0"/>',
  expand: '<path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"/>', minus: '<path d="M5 12h14"/>', move: '<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4"/>',
  check: '<path d="m4 12 5 5L20 6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>', code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',
  bolt: '<path d="m14 2-9 12h7l-2 8 9-12h-7z"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-6 5-6 13 0 18 6-5 6-13 0-18"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>', alert: '<path d="m12 3 10 18H2zM12 9v5m0 3v.1"/>', download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>', layers: '<path d="m12 3 10 6-10 6L2 9zM2 13l10 6 10-6M2 17l10 6 10-6"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
const statusText = { draft: '尚未启动', queued: '队列等待', running: '真实协作中', pausing: '等待当前调用结束', paused: '已暂停', waiting_user: '等待你的回复', completed: '已验收', failed: '执行失败', cancelled: '已停止', interrupted: '已中断', needs_attention: '预算上限 · 待处理', pending: '待调度', working: '执行中', submitted: '待负责人验收', done: '已验收' };
const actionText = { direct: '调度决策', delegate: '辅助工作', execute: '主任务执行', review: '工作区复查' };
let state = { tasks: [], config: { codex: {}, deepseek: {} } }, token = '', selected = localStorage.getItem('relay-selected'), view = location.hash.slice(1) || 'control';
if (!['control', 'tasks', 'memory', 'outputs', 'settings', 'roadmap'].includes(view)) view = 'control';
let tab = 'board', logFilter = 'all', actorFocus = null, unitFocus = null, search = '', zoom = 1, pan = false, offset = { x: 0, y: 0 }, expanded = false, online = true;
const routeParams=new URLSearchParams(location.search), sourceRoomId=routeParams.get('room');
let sourceRoom=null;
let draftPrompt = '', draftKind = 'code', steerDraft = '', pendingRender = false, tasksFilter = 'live', toastTimer;
const current = () => state.tasks.find(t => t.id === selected && !t.legacy && !t.deletedAt && (!sourceRoomId||t.sourceDiscussion?.id===sourceRoomId));
const liveTasks = () => state.tasks.filter(t => !t.legacy&&!t.deletedAt&&(!sourceRoomId||t.sourceDiscussion?.id===sourceRoomId));
const trashTasks = () => state.tasks.filter(t=>t.deletedAt&&(!sourceRoomId||t.sourceDiscussion?.id===sourceRoomId));
const realCalls = () => liveTasks().flatMap(t => t.calls || []);
const active = t => t && ['running', 'pausing', 'paused', 'waiting_user', 'queued'].includes(t.status);
const teamSubject=()=>current()||sourceRoom||{collaboration:state.config.collaboration};
const ready = () => participantsReady(teamSubject(),state.config);
function toast(text,undo=null){notify(text,undo);}
const api=createApiClient({getToken:()=>token,setToken:value=>token=value});
let taskLimitDraft={maxSteps:24,maxCalls:48,tokenBudget:100000};
let controlPage='dispatch';
const controlPages=[['dispatch','任务调度','画布与执行控制'],['records','执行记录','事件与补充指令'],['workspace','任务与文件','依赖、修改与验收'],['usage','用量数据','调用与预算']];
function controlNavigation(){return '<nav class="page-section-nav" aria-label="任务控制分区">'+controlPages.map(([id,label,help])=>'<button type="button" data-control-page="'+id+'" id="control-page-'+id+'" title="'+help+'" class="'+(controlPage===id?'is-current':'')+'" aria-current="'+(controlPage===id?'page':'false')+'"><b>'+label+'</b><small>'+help+'</small></button>').join('')+'</nav>';}
const workDrafts=createDraftStore(localStorage,'relay.workbench.drafts.v1');
const renderGate=createRenderGate(renderNow);protectInput(app,renderGate);
const recovered=workDrafts.read('new:'+ (sourceRoomId||'local'));if(recovered){draftPrompt=recovered.prompt||'';draftKind=recovered.kind||'code';if(recovered.limits)taskLimitDraft={...taskLimitDraft,...recovered.limits};}
function render(){renderGate.now();}
function saveWorkDraft(){if($('#quick-form'))Object.assign(taskLimitDraft,readBudgetInputs($('#quick-form'),['maxSteps','maxCalls','tokenBudget']));if(draftPrompt.trim())workDrafts.write('new:'+(sourceRoomId||'local'),{prompt:draftPrompt,kind:draftKind,limits:taskLimitDraft});else workDrafts.clear('new:'+(sourceRoomId||'local'));if(selected&&document.getElementById('steer-input'))workDrafts.write('steer:'+selected,{text:document.getElementById('steer-input').value});}

async function refresh(draw = true) { const data = await api('/api/state'); state = data; token = data.token; if (!current()) selected = liveTasks()[0]?.id || null; if (draw) render(); }
function go(name) { view = name; location.hash = name; actorFocus = null; render(); }
function selectTask(id) { controlPage='dispatch';saveWorkDraft();const previousSteer=document.getElementById('steer-input');if(previousSteer)previousSteer.remove();selected = id;steerDraft=workDrafts.read('steer:'+id)?.text||''; localStorage.setItem('relay-selected', id); unitFocus = null; tab = 'board'; view = 'control'; location.hash = view; render(); }
const pill = (text, cls = '') => `<span class="pill ${cls}"><i></i>${esc(text)}</span>`;
function renderNow() {
  graphCleanup?.();graphCleanup=null;
  const focused = document.activeElement, focusedId = focused?.id, selection = focused?.selectionStart,selectionEnd=focused?.selectionEnd,selectionDirection=focused?.selectionDirection,inputScroll=focused?.scrollTop;
  if ($('#draft-prompt')) draftPrompt = $('#draft-prompt').value;
  if($('#quick-form'))Object.assign(taskLimitDraft,readBudgetInputs($('#quick-form'),['maxSteps','maxCalls','tokenBudget']));
  if ($('#steer-input')) steerDraft = $('#steer-input').value;
  const feed = $('.event-list'), feedTop = feed?.scrollTop || 0, follow = feed ? feed.scrollHeight - feedTop - feed.clientHeight < 50 : true;
  const titles = { control: '任务控制', tasks: '任务中心', memory: '共享记忆', outputs: '成果工作区', settings: '模型接入', roadmap: '功能路线图' };
  app.innerHTML = `<div class="app-shell">${mainNavigation({active:"workbench",roomId:current()?.sourceDiscussion?.id||sourceRoomId||"",extra:workbenchLinks()})}
  <aside class="project-rail"><div class="wordmark">ForgeRelay <span>CLI 执行后台</span></div><a class="return-conversation" href="${discussionHref()}">← 返回三方会谈</a><div class="workspace-switch">${icon('layers')} 本地工作空间 <span class="local-tag">LOCAL</span></div><div class="rail-heading">工作任务<button class="icon-button" data-action="new" title="新建真实任务" aria-label="新建真实任务">${icon('plus')}</button></div><label class="search-field">${icon('search')}<input id="task-search" placeholder="搜索任务" aria-label="搜索任务" value="${esc(search)}"></label><div class="task-list">${liveTasks().filter(t => t.title.includes(search)).map(t => `<button class="task-item ${selected === t.id ? 'selected' : ''}" data-task="${t.id}"><span class="task-status-dot ${t.status}"></span><span><b>${esc(t.title)}</b><small>${statusText[t.status] || t.status}</small></span></button>`).join('') || '<div class="rail-empty">尚无真实任务<br>创建后会保存在这里</div>'}</div><div class="rail-utilities"><button class="rail-utility ${view==='tasks'&&tasksFilter==='trash'?'is-current':''}" data-action="open-trash">${recycleIcon}<span>任务回收站</span><code>${trashTasks().length}</code></button></div><button class="roadmap-link" data-view="roadmap">${icon('bolt')}功能与能力 ${icon('arrow')}</button><div class="rail-health"><div><i class="${state.config.codex.authenticated ? 'good' : ''}"></i>Codex<span>${state.config.codex.authenticated ? 'CLI 已登录' : '未连接'}</span></div><div><i class="${state.config.deepseek?.ok ? 'good' : 'warn'}"></i>DeepSeek<span>${state.config.deepseek?.ok ? 'API 已验证' : state.config.deepseekConfigured ? '待验证' : '未配置'}</span></div><small>实际推理尝试 <b>${realCalls().length}</b> 次</small></div></aside>
  <div class="work-area"><header class="topbar"><div class="crumb">工作空间 <span>/</span><b>${titles[view]}</b></div><div class="top-status">${ambientControl()}<span class="local-signal">${online ? '本地服务在线' : '服务正在重连'}</span><span class="mono">v0.6</span><button class="icon-button" data-action="new" aria-label="创建任务">${icon('plus')}</button></div></header><main><div class="mobile-context-nav" aria-label="执行工具">${workbenchLinks()}</div>${view === 'control' ? control() : view === 'settings' ? settings() : view === 'tasks' ? tasks() : view === 'memory' ? memory() : view === 'outputs' ? outputs() : roadmap()}</main></div></div>`;
  const newFeed = $('.event-list'); if (newFeed) newFeed.scrollTop = follow ? newFeed.scrollHeight : feedTop;
  if (focusedId && $('#' + focusedId)) { const input = $('#' + focusedId); input.focus({preventScroll:true}); if (typeof selection === 'number' && input.setSelectionRange) input.setSelectionRange(selection, selectionEnd,selectionDirection);if(typeof inputScroll==='number')input.scrollTop=inputScroll; }
  setupGraph();
  const form=app.querySelector('#quick-form,#steer-form');if(form){const hint=document.createElement('p');hint.className='draft-hint';hint.textContent='草稿自动保存在此设备';form.append(hint);}
}
function pageHead(title, description, actions = '') { return `<div class="page-heading"><div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="heading-actions"><a class="discussion-entry" href="${discussionHref()}">← 返回三方会谈</a>${actions}<button class="primary" data-action="new">${icon('plus')}新建任务</button></div></div>`; }
function control() {
  const t = current(), total = t?.calls?.length || 0, tokens = Object.values(t?.usage || {}).reduce((a, b) => a + b, 0);
  return pageHead(t?.title || (sourceRoom?'任务控制 · '+sourceRoom.title:'任务控制'), t ? `${t.kind === 'code' ? '软件开发' : '写作与研究'} · 负责人 ${leaderProvider(t)} · ${statusText[t.status]}` : sourceRoom?'关联会谈：'+sourceRoom.title+'。执行状态和成果会回到会谈的任务控制面板。':'三方会谈是主流程；这里管理 CLI 执行、预算、文件和调用证据。', t ? `<button class="secondary" data-action="clone">复制任务</button><button class="text-button" data-trash-task="${t.id}">删除任务</button>` : '') +
  controlNavigation()+`<div class="control-workspace" data-control-page="${controlPage}"><div class="connection-banner ${ready() ? 'connected' : ''}"><span>${icon(ready() ? 'check' : 'link')}${ready() ? '接入预检通过。开始任务后才会发生真实模型调用。' : '参与团队的模型尚未全部验证，请先检查接入。'}</span><button data-view="settings">${ready() ? '查看接入' : '连接模型'} ${icon('arrow')}</button></div>
  ${t?.error ? `<div class="error-box">${icon('alert')}<span>${esc(t.error)}</span></div>` : ''}
  <div class="top-grid"><section class="panel graph-panel ${expanded ? 'expanded' : ''}"><div class="panel-heading"><div><h2>协作现场</h2><span class="quiet">${t?.activity ? `${esc(t.activity.actor)} · ${actionText[t.activity.purpose] || '工作中'}` : '没有正在进行的模型调用'}</span></div><div class="graph-tools"><button class="icon-button ${pan ? 'on' : ''}" data-action="pan" aria-pressed="${pan}" title="拖动视图" aria-label="拖动视图">${icon('move')}</button><button class="icon-button" data-action="zoom-out" title="缩小" aria-label="缩小">${icon('minus')}</button><button class="zoom-reset mono" data-action="zoom-reset" aria-label="重置视图">${Math.round(zoom * 100)}%</button><button class="icon-button" data-action="zoom-in" title="放大" aria-label="放大">${icon('plus')}</button><button class="icon-button" data-action="expand" title="${expanded ? '退出全屏' : '展开画布'}" aria-label="${expanded ? '退出全屏' : '展开画布'}">${icon(expanded ? 'close' : 'expand')}</button></div></div><div class="graph-viewport ${pan ? 'pannable' : ''}" tabindex="0" role="region" aria-label="协作画布" title="开启拖动后，可拖动画布或使用方向键平移">${network(t)}</div><div class="graph-bottom"><div><span class="legend-line"></span>任务分派 <span class="legend-line dashed"></span>独立反馈</div><button data-action="inspect" data-actor="workspace">共享工作区 ${icon('arrow')}</button></div></section>
  <aside class="panel mission-panel">${actorFocus ? inspector(t) : mission(t)}</aside></div>
  <div class="telemetry"><div><span>实际推理尝试</span><b class="mono">${n(total)}<small>次</small></b></div><div><span>工具操作记录</span><b class="mono">${n(t?.messages.filter(m => ['tool', 'command', 'files'].includes(m.type)).length)}<small>条</small></b></div><div><span>未处理问题</span><b class="mono">${n(t?.issues.filter(x => x.status === 'open').length)}<small>项</small></b></div><div><span>输入 + 输出</span><b class="mono">${n(tokens)}<small>tokens</small></b></div><div class="budget-caption">${t ? `决策 ${t.step || 0}/${limitText(t.maxSteps)} · 调用上限 ${limitText(t.maxCalls)}` : '创建任务后产生调用与证据记录。'}</div></div>
  <div class="bottom-grid"><section class="panel workspace-panel"><div class="content-tabs">${[['board', '任务依赖'], ['proposals', '修改提案'], ['issues', '问题与验收'], ['notes', '共享发现']].map(([id, label]) => `<button class="${tab === id ? 'active' : ''}" data-tab="${id}">${label}${id === 'proposals' && t?.proposals.length ? `<span>${t.proposals.length}</span>` : ''}</button>`).join('')}</div><div class="workspace-content">${workspaceContent(t)}</div></section>
  <section class="panel event-panel"><div class="panel-heading"><div><h2>执行现场</h2><span class="quiet">${t ? `${t.messages.length} 条可追溯记录` : '等待真实事件'}</span></div><button class="text-button" data-action="trace">调用凭据 ${icon('arrow')}</button></div><div class="event-filters">${[['all', '全部'], ['decision', '决策'], ['tool', '工具'], ['reply', '反馈']].map(([id, label]) => `<button class="${logFilter === id ? 'active' : ''}" data-log="${id}">${label}</button>`).join('')}</div><div class="event-list">${events(t)}</div><form class="steer-form" id="steer-form"><label class="sr-only" for="steer-input">补充指令</label><input id="steer-input" placeholder="${active(t) ? '补充指令，交给 Codex 的下一次决策' : '运行后可随时补充指令或回复问题'}" value="${esc(steerDraft)}" ${!active(t) || t.status === 'queued' ? 'disabled' : ''}><button class="icon-button" type="submit" aria-label="发送补充指令" ${!active(t) || t.status === 'queued' ? 'disabled' : ''}>${icon('arrow')}</button></form></section></div>
  <footer class="page-foot"><span>本地运行 · ${activeProviders(teamSubject()).join(' · ')}</span><button data-view="roadmap">查看已实现与可扩展功能 ${icon('arrow')}</button></footer></div>`;
}
function network(t) {
  const providers=activeProviders(t||{collaboration:state.config.collaboration}),lead=leaderProvider(t||{collaboration:state.config.collaboration});
  const busyC=t?.activity?.actor==='Codex',busyD=t?.activity?.actor==='DeepSeek';
  const cs=busyC?'真实调用进行中':state.config.codex.authenticated?'CLI 已登录':'CLI 尚未登录';
  const ds=busyD?'真实调用进行中':state.config.deepseek?.ok?'API 已验证':state.config.deepseekConfigured?'等待验证':'尚未接入';
  const count=actor=>(t?.calls||[]).filter(c=>c.actor===actor).length;
  const agentCards={Codex:`<button class="scene-agent ${lead==='Codex'?'codex-card':'deepseek-card'} ${busyC?'is-working':''} ${actorFocus==='Codex'?'is-selected':''}" data-node="codex" data-action="inspect" data-actor="Codex" aria-label="查看 Codex 能力"><span class="agent-card-head"><span class="agent-index">${lead==='Codex'?'01 / LEAD':'02 / CO-WORKER'}</span><span class="node-state ${busyC?'working':''}">${busyC?'执行中':lead==='Codex'?'主持':'协作'}</span></span><strong>${providerIcon('Codex')}Codex<span class="card-arrow">↗</span></strong><span class="agent-description">核心实现、算法迭代与交叉复核</span><span class="agent-card-foot"><span class="provider-state"><i class="${state.config.codex.authenticated?'ready':''}"></i>${cs}</span><span>${count('Codex')} 次调用</span></span></button>`,DeepSeek:`<button class="scene-agent ${lead==='DeepSeek'?'codex-card':'deepseek-card'} ${busyD?'is-working':''} ${actorFocus==='DeepSeek'?'is-selected':''}" data-node="deepseek" data-action="inspect" data-actor="DeepSeek" aria-label="查看 DeepSeek 工具"><span class="agent-card-head"><span class="agent-index">${lead==='DeepSeek'?'01 / LEAD':'02 / CO-WORKER'}</span><span class="node-state ${busyD?'working':''}">${busyD?'执行中':lead==='DeepSeek'?'主持':'协作'}</span></span><strong>${providerIcon('DeepSeek')}DeepSeek<span class="card-arrow">↗</span></strong><span class="agent-description">调查与实现，提出反例与质疑</span><span class="agent-card-foot"><span class="provider-state"><i class="${state.config.deepseek?.ok?'ready':''}"></i>${ds}</span><span>${count('DeepSeek')} 次调用</span></span></button>`};
  const intro=!sceneSeen;sceneSeen=true;
  return `<div class="network-scene ${intro?'scene-intro':''}" data-participants="${providers.join(' ')}" data-leader="${lead}"><div id="network-camera" class="network-camera">
    <relay-sculpture class="network-sculpture" aria-hidden="true"></relay-sculpture>
    <svg class="scene-wires" aria-hidden="true"><defs><marker id="wire-tip" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="m1 1 4 3-4 3"/></marker></defs><path data-wire="input"/><path data-wire="dispatch" class="${busyD?'is-flowing':''}"/><path data-wire="return" class="return-path ${busyD?'is-flowing':''}"/><path data-wire="workspace" class="${busyC?'is-flowing':''}"/></svg>
    <button class="direction-anchor" data-node="human" data-action="new"><span class="direction-mark">↳</span><span><small>任务方向</small><b>${t?esc(t.title.slice(0,18)):'从你的方向开始'}</b></span></button>
    ${[lead,lead==='Codex'?'DeepSeek':'Codex'].map(actor=>agentCards[actor]).join('')}
    <button class="scene-workspace" data-node="workspace" data-action="inspect" data-actor="workspace"><span class="workspace-port">${icon('layers')}</span><span><b>共享工作区</b><small>${t?`${t.board.length} 项任务 · ${t.proposals.length} 项修改提案`:'任务合同 / 文件 / 审查证据'}</small></span><span class="card-arrow">↗</span></button>
    <div class="scene-caption"><span class="diagram-index">协作结构 / ${String(providers.length).padStart(2,'0')}</span><span>${t?.activity?'状态来自当前实际调用':'动态结构示意 · 当前没有模型调用'}</span></div>
  </div></div>`;
}
function mission(t) {
  if (!t) return `<div class="panel-heading"><h2>发起真实任务</h2><span class="tiny-label">新建</span></div><form class="mission-form" id="quick-form"><div class="task-mode-switch" role="group" aria-label="任务模式">${[['code','code','软件开发','代码 · 算法 · 验证'],['research','file','写作研究','调研 · 分析 · 文稿']].map(([id,symbol,label,help])=>`<button type="button" class="task-mode ${draftKind===id?'is-selected':''}" data-kind="${id}" aria-pressed="${draftKind===id}"><span class="task-mode-head"><span class="task-mode-icon">${icon(symbol)}</span><b>${label}</b></span><small>${help}</small><span class="task-mode-check" aria-hidden="true">${icon('check')}</span></button>`).join('')}</div><label class="sr-only" for="draft-prompt">任务需求</label><textarea id="draft-prompt" minlength="5" maxlength="20000" required placeholder="${draftKind==='code'?'描述功能、代码问题或算法目标…':'描述研究问题、资料来源与交付形式…'}">${esc(draftPrompt)}</textarea><div class="mission-hint">${icon('layers')}参与角色实际实现与交叉复核，主持人负责整合与最终验收。</div><details class="advanced-fields"><summary>运行轮次与预算</summary><div class="task-budget-fields">${budgetField('maxSteps','决策轮数上限',taskLimitDraft.maxSteps,{min:8,max:60,fallback:24,prefix:'quick'})}${budgetField('maxCalls','调用次数上限',taskLimitDraft.maxCalls,{min:10,max:100,fallback:48,prefix:'quick'})}${budgetField('tokenBudget','Token 预算',taskLimitDraft.tokenBudget,{min:10000,max:1000000,fallback:100000,prefix:'quick'})}</div></details><button class="primary wide" type="submit">创建任务 ${icon('arrow')}</button><p class="honesty-note">${ready()?'创建后可核对项目与模型配置，再开始执行。':'创建任务后，先到接入页连接模型。'}</p></form>`;
  const submitted = t.board.filter(x => x.status === 'submitted').length;
  return `<div class="panel-heading"><h2>任务指挥台</h2>${pill(statusText[t.status], t.status)}</div><div class="mission-summary"><p class="requirement">${esc(t.prompt)}</p><dl><div><dt>决策预算</dt><dd>${limitText(t.maxSteps)} 轮 / ${limitText(t.maxCalls)} 次调用</dd></div><div><dt>Token 上限</dt><dd class="mono">${limitText(t.tokenBudget)}</dd></div><div><dt>待验收子任务</dt><dd>${submitted} 项</dd></div></dl>${t.question ? `<div class="question-box">${esc(t.question)}</div>` : ''}<div class="mission-controls">${controls(t)}</div><button class="path-button" data-action="copy-path">${icon('file')}复制工作目录 ${icon('arrow')}</button></div>`;
}
function controls(t) {
  if (t.status === 'running') return `<button class="secondary" data-task-action="pause">${icon('pause')}调用后暂停</button><button class="danger-ghost" data-task-action="cancel">停止</button>`;
  if (['paused', 'pausing'].includes(t.status)) return `<button class="primary" data-task-action="resume">${icon('play')}继续运行</button><button class="danger-ghost" data-task-action="cancel">停止</button>`;
  if (['queued', 'waiting_user'].includes(t.status)) return `<span class="muted">${t.status === 'waiting_user' ? '请在执行现场回复' : '等待前一任务完成'}</span><button class="secondary" data-task-action="cancel">停止</button>`;
  if (t.calls.length || t.status !== 'draft') return `<button class="primary" data-action="clone">复制为新任务 ${icon('arrow')}</button>`;
  return `<button class="primary wide" ${!ready() ? 'data-view="settings"' : 'data-task-action="start"'}>${icon(!ready() ? 'link' : 'play')}${!ready() ? '连接模型后启动' : '启动真实协作'}</button>`;
}
function inspector(t) {
  const actor = actorFocus, isWorkspace = actor === 'workspace', calls = t?.calls.filter(x => x.actor === actor) || [];
  const tools = actor === 'DeepSeek' ? ['读取共享文件', '按内容检索', '提交修改提案', '登记复查问题', '请求补充资料', '发布共享发现'] : ['规划任务依赖', '调度与返工', '执行主任务', '审查并合并提案', '处理问题', '最终验收'];
  return `<div class="panel-heading"><h2>${isWorkspace ? '共享工作区' : actor}</h2><button class="icon-button" data-action="close-inspector" aria-label="关闭详情">${icon('close')}</button></div><div class="agent-inspector"><p>${isWorkspace ? '双方围绕同一份任务状态、文件、提案和问题清单工作。' : actor === 'Codex' ? 'Codex 承担复杂代码、算法与模型更新、集成和测试，并独立质疑、复核 DeepSeek 的反馈。执行器与调度器分别保留会话。' : '辅助模型通过受控工具访问任务目录；修改进入提案区，等待 Codex 审查。'}</p><div class="capability-list">${(isWorkspace ? ['依赖任务', '修改提案与版本哈希', '共享发现与问题', '实际调用记录'] : tools).map(x => `<div>${icon('check')}${x}</div>`).join('')}</div><div class="inspector-footer">${isWorkspace ? `${t?.board.length || 0} 个子任务 · ${t?.notes.length || 0} 条共享发现` : `${calls.length} 次实际调用 · ${calls.filter(x => x.status === 'succeeded').length} 次成功`}</div></div>`;
}
function workspaceContent(t) {
  if (!t) return `<div class="workspace-empty">${icon('layers')}<h3>${esc(planningEmptyTitle(teamSubject()))}</h3><p>建立任务并接通模型后，这里会出现依赖关系、辅助提案与验收证据。</p><button class="text-button" data-view="roadmap">看看协作能力 ${icon('arrow')}</button></div>`;
  if (tab === 'board') {
    if (!t.board.length) return `<div class="workspace-empty">${icon('task')}<h3>尚未生成任务计划</h3><p>模型尚未开始规划。这里不会填入预设的子任务。</p></div>`;
    const selectedNode = t.board.find(x => x.id === unitFocus);
    return `<div class="board-legend"><span>${t.board.filter(x => x.status === 'done').length} / ${t.board.length} 已验收</span><span>点击任务查看依赖和结果</span></div><div class="board-list">${t.board.map(node => `<button class="board-row ${unitFocus === node.id ? 'focused' : ''}" data-unit="${esc(node.id)}"><span class="unit-line ${node.status}"></span><span class="unit-title"><b>${esc(node.title)}</b><small>${esc(node.owner)}${node.dependsOn.length ? ` · 依赖 ${node.dependsOn.map(esc).join(', ')}` : ' · 无前置依赖'}</small></span><span class="unit-state ${node.status}">${statusText[node.status] || node.status}</span>${icon('chevron')}</button>`).join('')}</div>${selectedNode ? `<div class="unit-detail"><h3>${esc(selectedNode.title)}</h3><p>${esc(selectedNode.result || '此任务尚未提交结果。')}</p>${selectedNode.acceptanceReason ? `<small>Codex 验收依据：${esc(selectedNode.acceptanceReason)}</small>` : ''}</div>` : ''}`;
  }
  if (tab === 'proposals') return t.proposals.length ? `<div class="proposal-list">${t.proposals.map(p => `<button class="proposal-row" data-proposal="${p.id}">${icon('code')}<span><b>${esc(p.path)}</b><small>${esc(p.rationale.slice(0, 110))}</small></span><span class="pill">${({ pending: '待审查', applied: '已合并', rejected: '未采纳', conflict: '存在冲突' })[p.status]}</span>${icon('chevron')}</button>`).join('')}</div>` : empty('尚无修改提案', 'DeepSeek 读取文件后可提交具体修改。原内容、变更理由与版本哈希会一起保留。');
  if (tab === 'issues') return `<div class="issue-section"><div class="mini-heading">复查问题 <span>${t.issues.filter(x => x.status === 'open').length} 项未处理</span></div>${t.issues.map(issue => `<details class="issue-row"><summary><span class="severity ${issue.severity}">${({ critical: '严重', major: '主要', minor: '一般' })[issue.severity]}</span><b>${esc(issue.title)}</b><span>${issue.status === 'open' ? '未解决' : '已处理'}</span></summary><p>${esc(issue.detail)}</p>${issue.resolution ? `<p class="resolved-note">Codex：${esc(issue.resolution)}</p>` : ''}</details>`).join('') || '<p class="inline-empty">尚无模型登记的问题；这不代表已经通过复查。</p>'}<div class="mini-heading acceptance-heading">验收标准 <span>Codex 提交的验证依据</span></div>${t.acceptance.map(item => `<details class="acceptance-row"><summary>${icon(item.evidence ? 'check' : 'clock')}<b>${esc(item.title)}</b><span>${item.evidence ? '已附依据' : '待验证'}</span></summary><p>${esc(item.evidence || '尚未提交验证依据。')}</p></details>`).join('') || '<p class="inline-empty">等待负责人制定验收标准。</p>'}</div>`;
  return t.notes.length ? t.notes.map(note => `<article class="memory-note"><div><b>${esc(note.title)}</b><small>${esc(note.author)} · ${shortTime(note.at)}</small></div><p>${esc(note.content)}</p></article>`).join('') : empty('尚无共享发现', 'DeepSeek 的 publish_note 工具会把发现连同来源写入这里，供后续决策使用。');
}
function empty(title, description) { return `<div class="workspace-empty"><h3>${esc(title)}</h3><p>${esc(description)}</p></div>`; }
function events(t) {
  let messages = t?.messages || [];
  if (logFilter !== 'all') messages = messages.filter(m => logFilter === 'tool' ? ['tool', 'command', 'files', 'command_start', 'tool_error'].includes(m.type) : m.type === logFilter);
  if (!messages.length) return `<div class="event-empty"><span class="empty-signal"></span><h3>没有真实执行记录</h3><p>模型请求、文件读取、提案和决策实际发生后，才会显示在这里。</p></div>`;
  const labels = { decision: '决策', delegate: '分工', review: '复查', reply: '辅助反馈', tool: '工具操作', command: '命令结果', command_start: '命令开始', gate: '验收拦截', merge: '提案合并', execute: '执行', execution_result: '执行结果', input: '人工指令', question: '请求回复', result: '最终交付', error: '错误' };
  return messages.slice(-100).map(m => `<article class="event-item ${m.type}"><div class="event-pin"></div><div class="event-meta"><b>${esc(m.actor === 'system' ? '调度引擎' : m.actor)}</b><span>${labels[m.type] || '状态'}</span><time>${shortTime(m.at)}</time></div>${m.text.length > 500 || ['tool', 'command', 'files'].includes(m.type) ? `<details><summary>${esc(m.text.split('\n')[0].slice(0, 110))}</summary><pre>${esc(m.text)}</pre></details>` : `<p>${esc(m.text)}</p>`}</article>`).join('');
}
function settings() {
  const c = state.config;
  return pageHead('模型接入', '先接通真实能力，再启动协作。配置、连接验证和推理成功是三种不同状态。') + `<div class="settings-grid"><section class="panel connection-card"><div class="panel-heading"><h2>Codex</h2>${pill(c.codex.authenticated ? 'CLI 已登录' : '未登录', c.codex.authenticated ? 'good' : '')}</div><div class="connection-body"><div class="provider-symbol">${providerIcon('Codex')}</div><h3>负责人 / Lead agent</h3><p>${esc(c.codex.message || '正在检查本地 CLI…')}</p><ul><li>持续调度会话 + 独立执行会话</li><li>读取项目、执行命令、写入成果</li><li>审查 DeepSeek 提案与最终验收</li></ul><small>登录不代表模型推理已经成功。</small></div></section><section class="panel connection-card"><div class="panel-heading"><h2>DeepSeek</h2>${pill(c.deepseek?.ok ? 'API 已验证' : c.deepseekConfigured ? '密钥已配置' : '未配置', c.deepseek?.ok ? 'good' : 'warn')}</div><div class="connection-body"><div class="provider-symbol">${providerIcon('DeepSeek')}</div><h3>辅助协作者 / Tool agent</h3><p>${esc(c.deepseek?.message || '尚未填写 API Key')}</p><ul><li>实际读取与检索共享项目文件</li><li>提交修改提案，登记问题与共享发现</li><li>请求补充资料并复查最终工作区</li></ul><small>未接入时，真实推理调用为 0。</small></div></section></div>
  <section class="panel settings-panel"><div class="panel-heading"><h2>接入配置</h2><button class="secondary" data-action="check">${icon('link')}验证连接</button></div><form id="settings-form" class="settings-form"><label class="field">DeepSeek API Key<div class="key-input"><input type="password" name="deepseekKey" id="deepseek-key" autocomplete="off" placeholder="${c.deepseekConfigured ? '已有密钥，留空保留' : '在本机填写，不需要发到聊天中'}"><button type="button" class="text-button" data-action="toggle-key">显示</button></div><small>仅保存在当前本地服务进程内存；不进入任务记录或浏览器存储。</small></label><div class="form-grid"><label class="field">当前 DeepSeek 模型<input readonly aria-label="当前 DeepSeek 模型" value="${esc(c.deepseekModel)}" list="available-models" required><datalist id="available-models">${(c.deepseek?.models || []).map(x => `<option value="${esc(x)}">`).join('')}</datalist><small><a href="/models">在模型实验室调整模型与参数 ↗</a></small></label><label class="field">当前 Codex 模型<input readonly aria-label="当前 Codex 模型" value="${esc(c.codexModel)}" placeholder="使用 CLI 当前配置"><small>留空时继承 CLI 当前配置。</small></label></div><div class="settings-note">${icon('link')}开始任务时，需求和允许的项目资料会发送给 OpenAI 与 DeepSeek 进行处理。仅验证连接不会发起推理。</div><div class="settings-actions"><button class="text-button danger" type="button" data-action="clear-key">清除会话密钥</button><span class="form-result" id="settings-result" role="status"></span><button class="primary" type="submit">保存配置</button></div></form></section><section class="notice-panel"><h2>怎样确认它真的在运行？</h2><p>控制台展示每次实际请求的开始与结束、成功或失败、服务返回的请求 / 会话 ID、输入与输出 tokens。工具操作会留下路径和结果。所有数字由运行记录计算；没有模型调用时不会出现双方回复。</p></section>`;
}
function tasks() {
  const list=tasksFilter==='legacy'?state.tasks.filter(x=>x.legacy&&!x.deletedAt):liveTasks();
  const toolbar=`<div class="task-center-toolbar"><div class="content-tabs"><button class="${tasksFilter==='live'?'active':''}" data-task-filter="live">工作任务 <span>${liveTasks().length}</span></button><button class="${tasksFilter==='legacy'?'active':''}" data-task-filter="legacy">历史演示 <span>${state.tasks.filter(x=>x.legacy&&!x.deletedAt).length}</span></button></div><button class="trash-entry ${tasksFilter==='trash'?'is-current':''}" data-task-filter="trash" aria-pressed="${tasksFilter==='trash'}">${recycleIcon}<span>回收站</span><code>${trashTasks().length}</code></button></div>`;
  return pageHead(tasksFilter==='trash'?'任务回收站':'任务中心',tasksFilter==='trash'?'已删除任务集中收纳；恢复后，原来的工作记录与文件仍可继续使用。':'管理执行任务，核对每一次真实调用与验收。')+toolbar+(tasksFilter==='trash'?recycleView(trashTasks(),'task'):`<section class="panel task-table">${list.length?`<table><thead><tr><th>任务</th><th>状态</th><th>真实调用</th><th>子任务</th><th>操作</th></tr></thead><tbody>${list.map(t=>`<tr><td><b>${esc(t.title)}</b><small>${t.legacy?'预设内容 · 未调用模型':t.kind==='code'?'软件开发':'写作与研究'}</small></td><td>${pill(t.legacy?'非真实运行':statusText[t.status],t.legacy?'warn':t.status)}</td><td class="mono num">${t.calls.length}</td><td class="mono num">${t.board.length}</td><td><div class="table-row-actions">${!t.legacy?`<button class="text-button" data-task="${t.id}">打开 ${icon('arrow')}</button><button class="text-button delete-action danger" data-trash-task="${t.id}">删除</button>`:'<span class="muted">仅保留历史</span>'}</div></td></tr>`).join('')}</tbody></table>`:empty('还没有工作任务','从会谈建立任务，或在工作台新建执行草稿。')}</section>`);
}
function memory() {
  const notes = liveTasks().flatMap(t => t.notes.map(note => ({ ...note, taskTitle: t.title, taskId: t.id })));
  return pageHead('共享记忆', '保留具体发现与来源，让协作跨越多次工具调用。') + `<section class="panel">${notes.length ? notes.map(note => `<article class="memory-note"><div><b>${esc(note.title)}</b><small>${esc(note.author)} · ${shortTime(note.at)}</small></div><p>${esc(note.content)}</p><button class="text-button" data-task="${note.taskId}">${esc(note.taskTitle)} ${icon('arrow')}</button></article>`).join('') : empty('尚无共享发现', '真实任务中，DeepSeek 可以通过 publish_note 把查到的文件信息、论据和不确定性写入共享记忆。')}</section>`;
}
function outputs() {
  const list = liveTasks().filter(t => t.artifacts.length);
  return pageHead('成果工作区', '真实交付与过程文件。未通过验收的任务不会生成“完成”报告。') + `<div class="output-grid">${list.map(t => `<section class="panel"><div class="panel-heading"><h2>${esc(t.title)}</h2>${pill('已验收', 'good')}</div><div class="artifact-list">${t.artifacts.map(a => `<a href="${esc(a.url)}" download>${icon('file')}<span><b>${esc(a.name)}</b><small>${esc(a.type)}</small></span>${icon('download')}</a>`).join('')}</div></section>`).join('') || `<section class="panel">${empty('尚无真实交付成果', '旧版演示文件不会混入这里。你可以在运行中通过共享工作区查看实际文件。')}</section>`}</div>`;
}
const FEATURES = [
  { title: '动态任务依赖与返工', icon: 'task', state: '已实现', detail: '由当前主持模型决定下一步，检查依赖、验收辅助成果，支持反复委派。' },
  { title: '共享文件与工具协作', icon: 'layers', state: '已实现', detail: 'DeepSeek 可读取和搜索允许的项目文件、请求上下文、发布发现。' },
  { title: '修改提案与冲突保护', icon: 'code', state: '已实现', detail: '保留原内容和 SHA-256。Codex 审查后合并，版本改变会拦截冲突。' },
  { title: '人工介入与调用预算', icon: 'bolt', state: '已实现', detail: '运行中补充指令，回复模型问题，设置轮数、调用次数和 token 上限。' },
  { title: '并行工作树与独立沙箱', icon: 'grid', state: '规划中', detail: '让双方在独立分支同时实施子任务，再由负责人审查合并。当前版本按顺序调度。' },
  { title: '独立测试与质量执行器', icon: 'check', state: '规划中', detail: '单独运行预先配置的测试与静态检查，以机器结果直接约束最终验收。当前展示 Codex 提交的依据和实际命令日志。' },
  { title: '联网检索与来源库', icon: 'globe', state: '规划中', detail: '为研究任务加入可追踪的网页检索、来源快照和引用核验。当前 DeepSeek 工具只访问本地任务目录。' },
  { title: '文档上传与知识检索', icon: 'memory', state: '规划中', detail: '解析 PDF、Word 等资料并建立检索索引，让双方按同一来源工作。' },
  { title: '逐 Token 推送与费用预算', icon: 'clock', state: '规划中', detail: '增加流式文本、账户价格配置和费用上限。当前按请求返回的 tokens 统计，不估算价格。' },
  { title: '版本回滚与任务续跑', icon: 'file', state: '规划中', detail: '将文件快照、调度状态与会话版本一起保存，失败后选择检查点恢复。当前已保留历史，重跑需复制任务。' }
];
function roadmap() {
  const wishlist = JSON.parse(localStorage.getItem('relay-wishlist') || '[]');
  return pageHead('功能路线图', '区分已经可用的能力与下一步扩展。你可以标记优先关注的功能。') + `<div class="feature-grid">${FEATURES.map((f, i) => `<article class="panel feature-card"><div class="feature-head">${icon(f.icon)}<span class="feature-status ${f.state === '已实现' ? 'shipped' : ''}">${f.state}</span></div><h2>${f.title}</h2><p>${f.detail}</p>${f.state === '规划中' ? `<button class="secondary ${wishlist.includes(i) ? 'wanted' : ''}" data-wish="${i}">${icon(wishlist.includes(i) ? 'check' : 'plus')}${wishlist.includes(i) ? '已标记关注' : '优先关注'}</button>` : '<span class="feature-live">可在当前版本使用</span>'}</article>`).join('')}</div>`;
}
function showModal(title, html, wide = false) {
  $('#modal-content').innerHTML = `<div class="modal-heading"><h2 id="modal-title">${esc(title)}</h2><button class="icon-button" data-close-modal aria-label="关闭">${icon('close')}</button></div>${html}`;
  modal.classList.toggle('wide-modal', wide); if (!modal.open) modal.showModal();
}
function saveTaskModal(){const form=modal.querySelector('#new-task-form');if(!form?.dataset.draftScope)return;const values={};for(const name of ['title','prompt','kind','workspace','maxSteps','maxCalls','tokenBudget'])if(form.elements.namedItem(name))values[name]=form.elements.namedItem(name).value;Object.assign(values,readBudgetInputs(form,['maxSteps','maxCalls','tokenBudget']));workDrafts.write(form.dataset.draftScope,values);}
modal.addEventListener('input',saveTaskModal);modal.addEventListener('change',saveTaskModal);
function newTask(clone) {
  const t = clone || {};const origin=t.sourceDiscussion?.id||sourceRoomId||'';
  showModal(clone ? '复制为新的真实任务' : '建立真实协作任务', `<form id="new-task-form"><input type="hidden" name="discussionId" value="${esc(origin)}"><div class="modal-intro">双方围绕同一工作区协作。没有密钥时可以建立任务，启动前必须通过接入校验。</div><label class="field">任务名称<input name="title" value="${esc(t.title || '')}" maxlength="80" placeholder="给这次任务起个名字"></label><label class="field">任务需求<textarea name="prompt" rows="5" minlength="5" maxlength="20000" required placeholder="目标、已有资料、限制和期望交付…">${esc(t.prompt || draftPrompt || sourceRoom?.human.map(x=>x.text).join('\n\n') || '')}</textarea></label><div class="form-grid"><label class="field">任务类型<select name="kind"><option value="code" ${(t.kind || draftKind) === 'code' ? 'selected' : ''}>软件开发</option><option value="research" ${(t.kind || draftKind) === 'research' ? 'selected' : ''}>写作与研究</option></select></label>${budgetField('maxSteps','决策轮数上限',t.maxSteps===undefined?24:t.maxSteps,{min:8,max:60,fallback:24,prefix:'task-modal'})}</div><details class="advanced-fields"><summary>工作目录与运行预算</summary><label class="field">已有项目目录（可选）<input name="workspace" value="${esc(t.workspace || '')}" placeholder="留空则创建独立任务目录"><small>Codex 可在这里修改文件；DeepSeek 通过工具读取允许的文件并提交提案。</small></label><div class="form-grid">${budgetField('maxCalls','调用次数上限',t.maxCalls===undefined?48:t.maxCalls,{min:10,max:100,fallback:48,prefix:'task-modal'})}${budgetField('tokenBudget','Token 预算',t.tokenBudget===undefined?100000:t.tokenBudget,{min:10000,max:1000000,fallback:100000,prefix:'task-modal'})}</div><p class="muted">预算在每次调用前检查，最后一次请求可能使累计 tokens 超过预算。</p></details><div class="form-error" id="modal-error" role="alert"></div><div class="modal-actions"><span>只创建任务，不会自动调用模型。</span><button type="submit" class="primary">建立任务 ${icon('arrow')}</button></div></form>`);
  const form=modal.querySelector('#new-task-form');form.dataset.draftScope='task-modal:'+origin+':'+(clone?.id||'new');const previous=workDrafts.read(form.dataset.draftScope);if(previous)for(const [name,value]of Object.entries(previous)){const field=form.elements.namedItem(name);if(field)field.value=value;}if(previous)setBudgetInputs(form,Object.fromEntries(['maxSteps','maxCalls','tokenBudget'].filter(k=>previous[k]!==undefined).map(k=>[k,previous[k]])));const hint=document.createElement('p');hint.className='draft-hint';hint.textContent=previous?'已恢复上次的任务草稿':'任务草稿会自动保存在此设备';form.append(hint);
}
function traceModal() {
  const t = current(), calls = t?.calls || [];
  showModal('实际调用凭据', `<p class="modal-intro">这里只记录实际发起的推理尝试。请求失败和成功分开显示；连接检查不算推理。当前任务共 ${calls.length} 次尝试。</p>${cacheOverview(calls)}${calls.length ? `<div class="trace-list">${calls.map(c => `<article class="trace-row"><div><b>${esc(c.actor)} <span>${actionText[c.purpose] || c.purpose}</span></b>${pill(({ succeeded: '成功', failed: '失败', running: '进行中', cancelled: '已取消' })[c.status] || c.status, c.status === 'succeeded' ? 'good' : c.status === 'failed' ? 'warn' : '')}</div>${cacheCallDetail(c)}<dl><div><dt>服务请求 / 会话 ID</dt><dd class="mono">${esc(c.providerId || '服务尚未返回')}</dd></div><div><dt>本地调用 ID</dt><dd class="mono">${esc(c.id)}</dd></div><div><dt>开始时间</dt><dd>${esc(c.startedAt)}</dd></div><div><dt>输入 / 输出</dt><dd>${n(c.inputTokens)} / ${n(c.outputTokens)} tokens</dd></div></dl>${c.error ? `<p class="danger">${esc(c.error)}</p>` : ''}</article>`).join('')}</div>` : empty('0 次推理尝试', '没有填写 API Key，也没有启动真实任务时，这里就是空的。')}`, true);
}
function proposalModal(id) {
  const p = current()?.proposals.find(x => x.id === id); if (!p) return;
  const before = p.before.split('\n'), after = p.after.split('\n');
  showModal(`修改提案 · ${p.path}`, `<p class="modal-intro">${esc(p.rationale)}</p><div class="proposal-meta"><span>状态：${({ pending: '待 Codex 审查', applied: 'Codex 已合并', rejected: '未采纳', conflict: '版本冲突' })[p.status]}</span><span class="mono">base ${esc(p.baseHash.slice(0, 12))}</span></div><div class="diff-grid"><section><h3>原文件</h3><pre>${before.map((line, i) => `<span class="diff-line ${line !== after[i] ? 'removed' : ''}"><i>${i + 1}</i>${esc(line) || ' '}</span>`).join('')}</pre></section><section><h3>提案新内容</h3><pre>${after.map((line, i) => `<span class="diff-line ${line !== before[i] ? 'added' : ''}"><i>${i + 1}</i>${esc(line) || ' '}</span>`).join('')}</pre></section></div><p class="diff-note">逐行对照以当前行号标记变化。版本哈希在合并前重新检查，发生冲突会阻止写入。</p>${p.reviewReason ? `<p class="review-reason">Codex 审查依据：${esc(p.reviewReason)}</p>` : ''}`, true);
}
async function workspaceModal() {
  const t = current(); if (!t) return toast('请先建立一个真实任务');
  showModal('共享工作区', '<p class="modal-intro">正在读取本地任务目录…</p>');
  try {
    const data = await api(`/api/tasks/${t.id}/workspace`);
    showModal('共享工作区', `<p class="modal-intro path-text">${esc(t.workspace)}</p><div class="workspace-file-list">${data.files.map(f => `<button data-read-file="${esc(f.path)}">${icon('file')}<span>${esc(f.path)}</span><small class="mono">${n(f.bytes)} B</small>${icon('chevron')}</button>`).join('') || '<p class="inline-empty">工作目录暂时没有可读取文件。隐藏文件、凭证和链接不在共享范围内。</p>'}</div>`, true);
  } catch (err) { showModal('共享工作区', `<p class="form-error">${esc(err.message)}</p>`); }
}
function setupGraph(){
  const viewport=$('.graph-viewport'),camera=$('#network-camera');if(!viewport||!camera)return;
  let start,raf=0,last=0,visible=true,disposed=false;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const agents=['codex','deepseek'].map(key=>{const el=camera.querySelector('[data-node="'+key+'"]'),saved=retainedGraphLights.get(key);return{key,el,hover:el.matches(':hover'),focus:el.matches(':focus-visible'),lift:saved?.lift||{value:0,velocity:0},light:saved?.light||{value:0,velocity:0},workLight:saved?.workLight||{value:0,velocity:0},motionX:saved?.motionX||{value:0,velocity:0},motionY:saved?.motionY||{value:0,velocity:0},x:0,y:0};});
  const paths=Object.fromEntries([...camera.querySelectorAll('[data-wire]')].map(el=>[el.dataset.wire,el]));
  let bases={};
  const measure=()=>{for(const key of ['human','codex','deepseek','workspace']){const el=camera.querySelector('[data-node="'+key+'"]');bases[key]={x:el.offsetLeft,y:el.offsetTop,w:el.offsetWidth,h:el.offsetHeight};}};
  const moving=()=>!reduce.matches&&document.body.dataset.effects!=='off';
  const spring=(s,target,omega,dt)=>{const d=s.value-target,c=(s.velocity+omega*d)*dt,e=Math.exp(-omega*dt);s.value=target+(d+c)*e;s.velocity=(s.velocity-omega*c)*e;return s.value;};
  const transform=()=>{camera.style.transform='translate('+offset.x+'px,'+offset.y+'px) scale('+zoom+')';};
  const position=key=>{const b=bases[key],a=agents.find(a=>a.key===key);return{...b,x:b.x+(a?.x||0),y:b.y+(a?.y||0)};};
  const wires=()=>{
    const scene=camera.closest('.network-scene'),both=scene.dataset.participants.includes('Codex')&&scene.dataset.participants.includes('DeepSeek');
    const human=position('human'),lead=position(scene.dataset.leader==='DeepSeek'?'deepseek':'codex'),feedback=position(scene.dataset.leader==='DeepSeek'?'codex':'deepseek'),workspace=position('workspace');
    const connect=(name,from,to,options={})=>paths[name].setAttribute('d',curvedConnection(from,to,options).d);
    connect('input',human,lead,{fromSide:'bottom',toSide:'top'});
    connect('workspace',lead,workspace);
    if(both){connect('dispatch',lead,feedback);connect('return',feedback,lead,{offset:5});}
    else{paths.dispatch.setAttribute('d','');paths.return.setAttribute('d','');}
  };
  const paint=(dt=0)=>{
    const animate=moving(),t=graphMotionClock;
    agents.forEach((a,i)=>{
      const selected=a.el.classList.contains('is-selected'),working=a.el.classList.contains('is-working');
      const whiteTarget=working?0:(selected||a.focus?1:(a.hover ? .38 : 0));
      const redTarget=working?(animate ? .94+Math.sin(t*1.05)*.06 : 1):0;
      if(animate){spring(a.light,whiteTarget,7.5,dt);spring(a.workLight,redTarget,7.5,dt);spring(a.lift,a.hover||a.focus?-3:0,9,dt);}else{a.light.value=whiteTarget;a.light.velocity=0;a.workLight.value=redTarget;a.workLight.velocity=0;a.lift.value=0;a.lift.velocity=0;}
      // Both cards share one clock. Different phases give bounded drift, without
      // accumulating position or restarting when task records rebuild the UI.
      if(!animate||selected||a.focus){a.motionX.velocity=0;a.motionY.velocity=0;}else{
        const tx=i===0?Math.sin(t*.47)*5+Math.sin(t*.21)*2:Math.sin(t*.39+1.7)*6;
        const ty=(i===0?Math.sin(t*.38+.4)*7:Math.sin(t*.34+2.4)*8)+a.lift.value;
        spring(a.motionX,tx,3.8,dt);spring(a.motionY,ty,3.8,dt);
      }
      a.x=a.motionX.value;a.y=a.motionY.value;
      a.el.style.setProperty('--float-x',a.x+'px');a.el.style.setProperty('--float-y',a.y+'px');a.el.style.setProperty('--agent-light',a.light.value.toFixed(4));a.el.style.setProperty('--agent-work-light',a.workLight.value.toFixed(4));
    });
    wires(t,animate);camera.dataset.drift=moving()?'running':'static';
  };
  const tick=time=>{raf=0;if(disposed||!visible||document.hidden||!moving())return;if(!last||time-last>=32){const dt=last?Math.min((time-last)/1000,.064):0;graphMotionClock+=dt;paint(dt);last=time;}raf=requestAnimationFrame(tick);};
  const resume=()=>{cancelAnimationFrame(raf);raf=0;last=0;if(disposed)return;measure();paint();if(visible&&!document.hidden&&moving())raf=requestAnimationFrame(tick);};
  const resizeObserver=new ResizeObserver(resume);resizeObserver.observe(viewport);agents.forEach(a=>resizeObserver.observe(a.el));
  const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;resume();});intersection.observe(viewport);
  const agentEvents=[];for(const a of agents)for(const [event,property,value] of [['pointerenter','hover',true],['pointerleave','hover',false],['focus','focus',true],['blur','focus',false]]){const handler=()=>{a[property]=value;if(!moving())paint();};a.el.addEventListener(event,handler);agentEvents.push([a.el,event,handler]);}
  document.addEventListener('visibilitychange',resume);document.addEventListener('relay-effects-change',resume);reduce.addEventListener('change',resume);
  transform();resume();
  graphCleanup=()=>{disposed=true;cancelAnimationFrame(raf);resizeObserver.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',resume);document.removeEventListener('relay-effects-change',resume);reduce.removeEventListener('change',resume);for(const [el,event,handler] of agentEvents)el.removeEventListener(event,handler);for(const a of agents)retainedGraphLights.set(a.key,{light:{...a.light},workLight:{...a.workLight},lift:{...a.lift},motionX:{...a.motionX},motionY:{...a.motionY}});};
  viewport.addEventListener('pointerdown',e=>{if(!pan||e.target.closest('button,a'))return;start={x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y};viewport.setPointerCapture(e.pointerId);});
  viewport.addEventListener('pointermove',e=>{if(!start)return;offset={x:start.ox+e.clientX-start.x,y:start.oy+e.clientY-start.y};transform();});
  viewport.addEventListener('keydown',e=>{if(!pan)return;const delta={ArrowLeft:[-30,0],ArrowRight:[30,0],ArrowUp:[0,-30],ArrowDown:[0,30]}[e.key];if(!delta)return;e.preventDefault();offset={x:offset.x+delta[0],y:offset.y+delta[1]};transform();});
  const end=()=>{start=null;};viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&expanded&&!modal.open){expanded=false;render();e.preventDefault();}});
app.addEventListener('input', e => {
  if (e.target.id === 'draft-prompt') draftPrompt = e.target.value;
  if (e.target.id === 'steer-input') steerDraft = e.target.value;
  if (e.target.id === 'task-search') { search = e.target.value; render(); }
});
app.addEventListener('focusout', () => { if (pendingRender) setTimeout(() => { if (!document.activeElement?.closest('form')) { pendingRender = false; render(); } }, 100); });
app.addEventListener('click', async e => {
  const section=e.target.closest('button[data-control-page]');if(section){saveWorkDraft();controlPage=section.dataset.controlPage;render();return;}
  const button = e.target.closest('[data-view],[data-task],[data-action],[data-tab],[data-log],[data-unit],[data-proposal],[data-kind],[data-task-action],[data-task-filter],[data-wish],[data-trash-task],[data-restore-task]'); if (!button) return;
  if (button.dataset.view) { e.preventDefault(); return go(button.dataset.view); }
  if (button.dataset.task) return selectTask(button.dataset.task);
  if (button.dataset.tab) { tab = button.dataset.tab; return render(); }
  if (button.dataset.log) { logFilter = button.dataset.log; return render(); }
  if (button.dataset.unit) { unitFocus = unitFocus === button.dataset.unit ? null : button.dataset.unit; return render(); }
  if (button.dataset.proposal) return proposalModal(button.dataset.proposal);
  if (button.dataset.kind) { draftKind = button.dataset.kind;saveWorkDraft(); return render(); }
  if (button.dataset.taskFilter) { tasksFilter = button.dataset.taskFilter; return render(); }
  if (button.dataset.wish) {
    const i = Number(button.dataset.wish), wish = JSON.parse(localStorage.getItem('relay-wishlist') || '[]');
    localStorage.setItem('relay-wishlist', JSON.stringify(wish.includes(i) ? wish.filter(x => x !== i) : [...wish, i])); return render();
  }
  if(button.dataset.trashTask||button.dataset.restoreTask){const id=button.dataset.trashTask||button.dataset.restoreTask,restoring=!!button.dataset.restoreTask;button.disabled=true;try{await api('/api/tasks/'+id+'/'+(restoring?'restore':'trash'),{});await refresh();toast(restoring?'任务已恢复':'任务已移入回收站。',restoring?null:async()=>{await api('/api/tasks/'+id+'/restore',{});await refresh();return '任务已恢复';});}catch(error){toast(error.message);}finally{button.disabled=false;}return;}
  const t = current(), action = button.dataset.action;
  if (action === 'open-trash') {tasksFilter='trash';return go('tasks');}
  if (action === 'new') return newTask();
  if (action === 'clone') return newTask(t);
  if (action === 'trace') return traceModal();
  if (action === 'inspect') { if (pan) return; actorFocus = button.dataset.actor; return render(); }
  if (action === 'close-inspector') { actorFocus = null; return render(); }
  if(action==='pan'){pan=!pan;render();if(pan)$('.graph-viewport')?.focus();return;}
  if (action === 'expand') { expanded = !expanded; return render(); }
  if (action === 'zoom-in') { zoom = Math.min(1.7, zoom + .1); return render(); }
  if (action === 'zoom-out') { zoom = Math.max(.7, zoom - .1); return render(); }
  if (action === 'zoom-reset') { zoom = 1; offset = { x: 0, y: 0 }; return render(); }
  if (action === 'copy-path') { try { await navigator.clipboard.writeText(t.workspace); toast('工作目录已复制'); } catch { toast(t.workspace); } return; }
  if (action === 'toggle-key') { const input = $('#deepseek-key'); input.type = input.type === 'password' ? 'text' : 'password'; button.textContent = input.type === 'password' ? '显示' : '隐藏'; return; }
  if (action === 'clear-key') { try { await api('/api/config', { clearKey: true }); await refresh(); toast('已清除当前服务会话中的密钥'); } catch (err) { toast(err.message); } return; }
  if (action === 'check') {
    button.disabled = true; button.textContent = '验证中…';
    try { const result = await api('/api/check', {}); await refresh(); toast(`Codex：${result.codex.message}；DeepSeek：${result.deepseek.message}`); }
    catch (err) { toast(err.message); button.disabled = false; } return;
  }
  if (button.dataset.taskAction && t) {
    button.disabled = true;
    try { await api(`/api/tasks/${t.id}/${button.dataset.taskAction}`, {}); await refresh(); }
    catch (err) { toast(err.message); button.disabled = false; }
  }
});
app.addEventListener('keydown', e => { if (e.target.matches('g[role="button"]') && ['Enter', ' '].includes(e.key)) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
app.addEventListener('submit', async e => {
  e.preventDefault(); const button = e.target.querySelector('button[type="submit"]'); if (button) button.disabled = true;
  try {
    if (e.target.id === 'quick-form') { const t = await api('/api/tasks', { prompt: draftPrompt, kind: draftKind, discussionId:sourceRoomId||undefined,...readBudgetInputs(e.target,['maxSteps','maxCalls','tokenBudget']) }); draftPrompt = '';workDrafts.clear('new:'+(sourceRoomId||'local'));$('#draft-prompt')?.remove(); await refresh(false); selectTask(t.id); toast('真实任务已建立，尚未调用模型'); }
    if (e.target.id === 'steer-form') { await api(`/api/tasks/${selected}/steer`, { text: steerDraft }); steerDraft = ''; $('#steer-input').value = '';workDrafts.clear('steer:'+selected); await refresh(); toast('已补充指令，将在下一次调度决策生效'); }
    if (e.target.id === 'settings-form') { await api('/api/config', Object.fromEntries(new FormData(e.target))); await refresh(); toast('配置已保存。接下来点击验证连接。'); }
  } catch (err) { toast(err.message); if (button) button.disabled = false; }
});
modal.addEventListener('click', async e => {
  if (e.target.closest('[data-close-modal]')) return modal.close();
  const file = e.target.closest('[data-read-file]'); if (file) {
    try { const data = await api(`/api/tasks/${selected}/workspace?path=${encodeURIComponent(file.dataset.readFile)}`); showModal(data.path, `<p class="modal-intro">${data.totalLines} 行 · 显示前 200 行 · <span class="mono">${esc(data.base_hash.slice(0, 12))}</span></p><pre class="file-preview">${esc(data.content)}</pre>`, true); }
    catch (err) { toast(err.message); }
  }
  if (e.target === modal) { const r = modal.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) modal.close(); }
});
modal.addEventListener('submit', async e => {
  if (e.target.id !== 'new-task-form') return; e.preventDefault(); const button = e.target.querySelector('[type="submit"]'); button.disabled = true;
  try { const t = await api('/api/tasks', {...Object.fromEntries(new FormData(e.target)),...readBudgetInputs(e.target,['maxSteps','maxCalls','tokenBudget'])});workDrafts.clear(e.target.dataset.draftScope); modal.close(); await refresh(false); selectTask(t.id); toast('任务已创建。启动前会校验真实模型接入。'); }
  catch (err) { $('#modal-error').textContent = err.message; button.disabled = false; }
});
window.addEventListener('keydown', e => { if (e.key === 'Escape' && expanded) { expanded = false; render(); }  });
window.addEventListener('hashchange', () => { const hash = location.hash.slice(1); if (['control', 'tasks', 'memory', 'outputs', 'settings', 'roadmap'].includes(hash) && hash !== view) { view = hash; render(); } });
try {
  if(sourceRoomId){const data=await api('/api/discussions');sourceRoom=data.rooms.find(r=>r.id===sourceRoomId&&!r.deletedAt);if(sourceRoom&&!draftPrompt)draftPrompt=sourceRoom.human.map(x=>x.text).join('\n\n').slice(0,20000);if(!sourceRoom)throw new Error('关联会谈已删除或不存在，请返回三方会谈');}
  if(routeParams.get('task'))selected=routeParams.get('task');
  await refresh();steerDraft=workDrafts.read('steer:'+selected)?.text||'';if($('#steer-input'))$('#steer-input').value=steerDraft;
  const source = new EventSource('/api/events');
  source.onmessage = event => {
    const tasks=JSON.parse(event.data),unchanged=JSON.stringify(tasks)===JSON.stringify(state.tasks),wasOnline=online;state.tasks=tasks;online=true;if(unchanged&&wasOnline)return;
    if (view === 'settings') return;
    if (document.activeElement?.closest('form')) { pendingRender = true; return; }
    renderGate.request();
  };
  source.onerror = () => { online = false; if (view !== 'settings' && !document.activeElement?.closest('form')) renderGate.request(); };
  if (state.config.codex.installed === null) setTimeout(() => { if (view !== 'settings') refresh().catch(() => {}); }, 2500);
} catch (err) { app.innerHTML = `<div class="boot"><h1>本地服务暂时无法连接</h1><p>${esc(err.message)}</p><p>请启动ForgeRelay服务后刷新页面。</p></div>`; }

function discussionHref(){const id=current()?.sourceDiscussion?.id||sourceRoomId;return id?'/discussion?panel=workbench#'+id:'/discussion';}

function workbenchLinks(){return [["tasks","任务中心","task"],["memory","共享记忆","memory"],["outputs","成果文件","file"]].map(([id,label,symbol])=>'<button class="global-context-link '+(view===id?'is-current':'')+'" data-view="'+id+'">'+icon(symbol)+'<span>'+label+'</span></button>').join("");}

app.addEventListener('input',event=>{if(event.target.id==='draft-prompt')draftPrompt=event.target.value;if(event.target.id==='steer-input')steerDraft=event.target.value;if(['draft-prompt','steer-input'].includes(event.target.id))saveWorkDraft();});
app.addEventListener('change',event=>{if(event.target.name==='kind'||event.target.id==='draft-kind'){draftKind=event.target.value;saveWorkDraft();}});
window.addEventListener('pagehide',()=>{saveWorkDraft();saveTaskModal();});
