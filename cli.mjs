#!/usr/bin/env node
export function parseBudgetCap(value){if(/^(unlimited|none|不限|∞)$/i.test(String(value)))return null;if(!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<1)throw Error('上限应为正整数或 unlimited（不限）');return Number(value);}
import {limitText} from './public/budget-limits.js';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {conversationIntent} from './public/conversation-policy.js';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface, emitKeypressEvents} from 'node:readline';
import {parseArgs} from 'node:util';
import {Writable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {RULES} from './discussion.mjs';
import {cachePercent} from './public/cache-usage.js';

const root=path.dirname(fileURLToPath(import.meta.url));
export const compatibleEngine=health=>health?.app==='relay-workbench'&&/^0\.(?:5|6)\.\d+$/.test(health.version)&&[1,2].includes(health.humanLoopVersion);
export const HELP=`ForgeRelay · 人 + DeepSeek + Codex

启动：npm run chat
继续：npm run chat -- --resume 会话ID
可选：--direction "方向" --initial "隐性前提" --workspace "目录"
      --max-calls 100 --tokens 1000000 --url http://127.0.0.1:4317 --no-color
不限：--max-rounds unlimited --max-calls unlimited --tokens unlimited

普通输入即是你对双方的发言，可在模型调用期间随时输入。
/discuss [目标]  明确启动团队讨论；同意 lead 的讨论建议
/direct         本次由 lead 直接处理
/lead 角色ID    随时切换当前会谈的主持角色
/rebellion codex|deepseek 数值  修改叛逆值（0–100）
/rounds 最低轮数 上限  修改互审轮数，上限可填 unlimited
/initial 前提   在创建前填写 AI 无法知道的前提与隐性约束
/new 方向       按模型实验室的团队、主持和轮数创建会谈
/inject 事实    INJECT：补充只能由人知道的信息
/overrule [option-1 或 O1] 理由  OVERRULE：裁决取舍，保留异议记录
/steer 新方向   STEER：调整目标、优先级或范围
/team           查看会谈独立角色和主持人
/review         查看人类介入记录与未决悬空项
/round          明确再开一轮互审，不自动增加调用预算
/key            隐藏输入 DeepSeek API Key，仅存服务内存
/check          检查真实接入，不生成 AI 发言
/start          开始或恢复当前会话
/pause          取消当前请求并暂停，保留记录
/continue 轮数 调用数 tokens  明确增加总预算后继续（例如 /continue 20 160 1500000）
                            每项也可填 unlimited；全部不限：/continue unlimited unlimited unlimited
/status         查看当前方案、异议和调用数
/cache          查看当前会话的真实缓存命中率（无会话时查看全局）
/rules          显示双方预先确认的固定讨论规则
/models         显示模型实验室地址
/profiles       列出本地模型配置
/profile ID     为新会话启用指定配置
/apply-profile ID  将配置应用到已暂停会话；旧会谈升级，重新审议并作废旧票
/save           导出完整 Markdown 记录到 outputs/discussions
/list           列出历史会话
/resume ID      切换到历史会话，随后 /start
/web            显示同步可视化平台地址
/attach 路径    挂载图片、文档、代码或其他文件（可拖入终端，可在提出方向前添加）
/project 路径   挂载项目文件夹；双方共享同一实际项目
/files          查看附件和项目
/mode work      开启真实项目修改与命令执行；/mode read 恢复只读
/computer browser|desktop|off   开启独立浏览器或 Windows 桌面截图、点击、输入
/tools          查看实际工具和解析能力
/skills         列出实际安装的本地技能
/skill 名称     指定参与角色必须使用的技能
/tasks          查看 Codex 分给 DeepSeek 的任务、执行和验收状态
/task ID        查看派工合同、交付与历次验收
/agents         查看双方实际调用的子代理及结果
/processes      查看本会话受管理的后台进程与日志
/kill ID        停止指定的本会话后台进程
/stop           停止当前讨论并保存分歧
/quit           暂停当前讨论并退出 CLI
/help           显示帮助

团队、主持人、互审轮数和介入开关由模型实验室设置。每个角色独立表决，达到上限保留未决项。
未配置真实模型就不会出现 AI 对话。API Key 请在 /key 的隐藏提示中输入，不要当普通消息发送。`;
const labels={draft:'待开始',running:'讨论中',pausing:'正在暂停',paused:'已暂停',waiting_user:'等待你回复',consensus:'双方已达成共识',unresolved:'未达成共识 · 达到边界',failed:'调用失败',interrupted:'中断，可继续',stopped:'已停止'};
const phaseNames={ground:'规则确认',proposal:'提出方案',challenge:'审查与反对',synthesis:'方案整合',vote:'独立表决',question:'向你提问',validation:'协议校验',direction:'方向',dispatch:'Codex 派工',delivery:'DeepSeek 交付',review:'Codex 验收',task:'派工执行'};
// Remove control characters from model text before writing it into a user's terminal.
export const safeTerminal=value=>String(value??'').replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))|[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,'');
export async function ensureServer(base,{autoStart=true}={}) {
  let response;
  try {response=await fetch(base+'/api/health',{signal:AbortSignal.timeout(1200)});} catch {}
  if(response) {const h=await response.json().catch(()=>({}));if(h.app!=='relay-workbench')throw new Error('目标端口被其他应用占用');if(!compatibleEngine(h))throw new Error('本地服务版本不兼容，请运行 stop.ps1 后重启');return;}
  if(!autoStart)throw new Error('无法连接本地服务');
  const instancePort=new URL(base).port||'80';
  const dir=instancePort==='4317'?path.join(root,'data'):path.join(root,'data','instances',instancePort);fs.mkdirSync(dir,{recursive:true});
  const log=fs.openSync(path.join(dir,'server.log'),'a'),errors=fs.openSync(path.join(dir,'server-error.log'),'a');
  const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env:{...process.env,PORT:instancePort,RELAY_DATA_DIR:process.env.RELAY_DATA_DIR||dir},detached:true,windowsHide:true,stdio:['ignore',log,errors]});
  let failure;child.on('error',err=>failure=err);child.unref();fs.closeSync(log);fs.closeSync(errors);fs.writeFileSync(path.join(dir,'relay.pid'),String(child.pid||''));
  for(let i=0;i<40;i++){if(failure)throw failure;await delay(150);try {response=await fetch(base+'/api/health',{signal:AbortSignal.timeout(700)});const h=await response.json();if(compatibleEngine(h))return;}catch {}}
  throw new Error('无法启动服务，请检查 data/server-error.log');
}
export async function readSecret(input=process.stdin,output=process.stdout) {
  if(!input.isTTY)throw new Error('/key 需要交互终端；管道模式请使用 DEEPSEEK_API_KEY 环境变量');
  output.write('DeepSeek API Key（隐藏输入，不写入文件）：'); emitKeypressEvents(input);const previous=input.isRaw;input.setRawMode(true);input.resume();
  return new Promise((resolve,reject)=>{let value=''; const finish=(err)=>{input.off('keypress',key);input.setRawMode(!!previous);output.write('\n');err?reject(err):resolve(value);};const key=(s,k={})=>{if(k.ctrl&&k.name==='c')return finish(new Error('已取消密钥输入'));if(k.name==='return')return finish();if(k.name==='backspace'){value=value.slice(0,-1);return;}if(s&&!k.ctrl&&!/[\r\n\x00-\x1f]/.test(s))value+=s;};input.on('keypress',key);});
}
export async function main(args=process.argv.slice(2)) {
  const {values}=parseArgs({args,options:{help:{type:'boolean',short:'h'},rules:{type:'boolean'},resume:{type:'string'},direction:{type:'string'},initial:{type:'string'},workspace:{type:'string'},project:{type:'string'},attach:{type:'string',multiple:true},file:{type:'string',multiple:true},mode:{type:'string'},computer:{type:'string'},skill:{type:'string',multiple:true},'min-rounds':{type:'string'},'max-rounds':{type:'string'},'max-calls':{type:'string'},tokens:{type:'string'},url:{type:'string'},'no-color':{type:'boolean'}}});
  if(values.project)values.workspace=values.project;
  const pendingFiles=[...(values.attach||[]),...(values.file||[])];
  const pendingSkills=[...(values.skill||[])];
  const localPath=text=>path.resolve(text.replace(/^"(.*)"$/s,'$1').replace(/^'(.*)'$/s,'$1'));
  if(values.help){console.log(HELP);return;}if(values.rules){console.log(RULES);return;}
  const base=(values.url||'http://127.0.0.1:4317').replace(/\/$/,'');const url=new URL(base);
  if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('只支持本机 HTTP 地址');
  await ensureServer(base);
  let token='',room=null,rl,closing=false,lastStatus='',seen=new Set(),seenWindows=new Set(),busy=false,silent=false,eventsAbort=new AbortController();
  const out=text=>{if(silent)return;if(rl&&process.stdout.isTTY)process.stdout.write('\r\x1b[2K');console.log(safeTerminal(text));if(rl&&process.stdout.isTTY)rl.prompt(true);};
  async function api(route,data){if(data&&route.endsWith('/chat'))data={...data,clientRequestId:data.clientRequestId||randomUUID()};const response=await fetch(base+route,{signal:AbortSignal.timeout(25000),...(data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Relay-Token':token},body:JSON.stringify(data)})});const dataOut=await response.json();if(!response.ok)throw new Error(dataOut.error||`HTTP ${response.status}`);return dataOut;}
  const state=await api('/api/state');token=state.token;
  function show(r){if(!room||r.id!==room.id)return;room=r;
    for(const m of r.messages){if(seen.has(m.id))continue;seen.add(m.id);if(m.actor==='Human')continue;const d=m.detail;out(`\n${m.agentLabel?m.agentLabel+' / '+m.actor:m.actor} · ${phaseNames[m.phase]||m.phase}${m.stale?' · 旧方向，已失效':''}\n${m.text}${d?.analysis?.map(a=>`\n  ${a.topic}：${a.position}${a.evidence?'\n  依据：'+a.evidence:''}${a.alternative?'\n  备选：'+a.alternative:''}`).join('')||''}${d?.objections?.map(o=>`\n  反对：${o.title}\n  ${o.reason}\n  解决条件：${o.change}`).join('')||''}${d?.replies?.map(x=>`\n  回应 ${x.objectionId}：${x.response}`).join('')||''}${d?.close?.map(x=>`\n  确认解决 ${x.objectionId}：${x.reason}`).join('')||''}${d?.proposal?'\n\n完整方案：\n'+d.proposal:''}`);}
    const marker=`${r.status}:${r.activity?.actor||''}:${r.activity?.phase||''}:${r.round}:${r.reason}`;
    humanWindow(r);if(marker!==lastStatus){lastStatus=marker;out(`\n[${labels[r.status]||r.status}] ${r.activity?`${r.activity.actor} · ${phaseNames[r.activity.phase]||r.activity.phase} · 第 ${r.round} 轮`:''}${r.reason?'\n'+r.reason:''}`);}
  }
  function humanWindow(r){const w=r.governance?.pending;if(w&&!seenWindows.has(w.id)){seenWindows.add(w.id);out(`\n[人类介入窗口 · ${w.kind==='gap'?'信息缺口':'关键分歧'}] ${w.title}\n${w.question}\n${w.options.map(o=>o.id+' · '+o.label).join('\n')}\n只需一个动作：/inject 事实、/overrule [选项] 理由、/steer 方向；或 /stop。`);}}
  async function intervene(action,text,optionId,objectionIds){if(!room?.governance)throw Error('请先选择新版自主协商会谈');show(await api(`/api/discussions/${room.id}/intervene`,{action,text,optionId,objectionIds,expectedRevision:room.revision,windowId:room.governance.pending?.id,manual:!room.governance.pending}));if(!['stop','pause'].includes(conversationIntent(text)))await start();}
  async function follow(){while(!eventsAbort.signal.aborted){try{const response=await fetch(base+'/api/discussions/events',{signal:eventsAbort.signal});if(!response.ok)throw new Error('事件连接失败');let buffer='';const decoder=new TextDecoder();for await(const chunk of response.body){buffer+=decoder.decode(chunk,{stream:true});let p;while((p=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,p);buffer=buffer.slice(p+2);const line=event.split('\n').find(l=>l.startsWith('data: '));if(line){const rooms=JSON.parse(line.slice(6));const r=rooms.find(r=>r.id===room?.id);if(r)show(r);}}}}catch(err){if(eventsAbort.signal.aborted)return;out('事件连接已断开，正在重连…');await delay(1200);}}}
  function select(r){room=r;seen=new Set(r.messages.map(m=>m.id));lastStatus='';out(`\n会话 ${r.id}\n方向：${r.human.at(-1).text}\n可视化：${base}/discussion#${r.id}`);show(r);}
  function status(){if(!room){out('还没有会话。直接输入方向即可创建。');return;}out(`${room.id}\n${labels[room.status]||room.status} · 当前方向下完成 ${room.roundsSinceInput}/${room.minRounds} 轮 · 总轮数上限 ${limitText(room.maxRounds)}\n调用 ${room.calls.length}/${limitText(room.maxCalls)} · tokens ${room.tokens}/${limitText(room.tokenBudget)}\n方案 v${room.proposal?.version||0} · ${room.proposal?.hash||'无'}\n${room.proposal?.text||''}\n未解决异议：\n${room.objections.filter(o=>o.status==='open').map(o=>`${o.id} · ${o.actor} · ${o.title}\n  ${o.reason}\n  解决条件：${o.change}`).join('\n')||'无'}`);}
  async function start(extra={}){if(!room)throw new Error('请先输入方向或 /resume ID');const r=await api(`/api/discussions/${room.id}/start`,{interaction:'adaptive',...extra});show(r);}
  async function create(direction){if(room&&['running','pausing'].includes(room.status))throw new Error('请先 /pause 当前会话');const input={direction,governance:true,interaction:'adaptive',initialPremises:values.initial||''};if(values.workspace)input.workspace=values.workspace;if(values.mode)input.mode=values.mode;for(const [flag,key]of [['min-rounds','minRounds'],['max-rounds','maxRounds'],['max-calls','maxCalls'],['tokens','tokenBudget']])if(values[flag])input[key]=key==='minRounds'?Number(values[flag]):parseBudgetCap(values[flag]);if(input.maxRounds!==undefined||input.minRounds!==undefined){const policy=(await api('/api/state')).config.collaboration;input.governance={...policy,minRounds:input.minRounds===undefined?policy.minRounds:input.minRounds,maxRounds:input.maxRounds===undefined?policy.maxRounds:input.maxRounds};}select(await api('/api/discussions',input));for(const file of [...pendingFiles]){show(await api(`/api/discussions/${room.id}/attachments`,{path:localPath(file)}));pendingFiles.shift();}for(const skill of pendingSkills)show(await api(`/api/discussions/${room.id}/runtime-config`,{skill}));if(values.computer)show(await api(`/api/discussions/${room.id}/runtime-config`,{computer:values.computer}));await start();}
  async function quit(){if(closing)return;closing=true;if(room?.status==='running')await api(`/api/discussions/${room.id}/pause`,{}).catch(()=>{});eventsAbort.abort();rl?.close();process.stdin.pause();out('讨论已保存。下次使用 --resume '+(room?.id||'会话ID')+' 继续。');}
  async function handle(line){line=line.trim();if(!line)return;if(/^sk-[a-zA-Z0-9_-]{10,}$/.test(line))throw new Error('这看起来像密钥。请使用 /key 隐藏输入，消息未保存。');
    if(!line.startsWith('/')){if(!room)await create(line);else show(await api(`/api/discussions/${room.id}/chat`,{text:line}));return;}
    const [command,...parts]=line.split(/\s+/),text=parts.join(' ');
    if(command==='/discuss'||command==='/direct'){if(!room)throw Error('请先创建会谈');const latest=await api('/api/discussions/'+room.id);if(latest.conversation?.pending)show(await api(`/api/discussions/${room.id}/discussion-choice`,{requestId:latest.conversation.pending.id,choice:command==='/discuss'?'discuss':'direct'}));else show(await api(`/api/discussions/${room.id}/chat`,{text:command==='/discuss'?'开始团队讨论 '+text:'不用讨论，你直接处理 '+text}));}
    else if(['/lead','/rebellion','/rounds'].includes(command)){if(!room)throw Error('请先创建会谈');const latest=await api('/api/discussions/'+room.id),input={settingsVersion:latest.conversation?.settingsVersion,expectedRevision:latest.revision};if(command==='/lead')input.leaderId=text;else if(command==='/rounds'){if(parts.length!==2)throw Error('/rounds 最低轮数 最多轮数或unlimited');input.minRounds=Number(parts[0]);input.maxRounds=parseBudgetCap(parts[1]);}else {if(parts.length!==2||!['codex','deepseek'].includes(parts[0].toLowerCase()))throw Error('/rebellion codex|deepseek 0至100');input.rebellion={[parts[0].toLowerCase()]:Number(parts[1])};}show(await api(`/api/discussions/${room.id}/conversation-settings`,input));}
    else if(command==='/initial'){if(room)throw Error('已有会谈请使用 /inject 补充事实');values.initial=text;out('INITIAL 前提已暂存，将随下次新会谈提交。');}
    else if(command==='/inject'||command==='/steer')await intervene(command==='/inject'?'INJECT':'STEER',text);
    else if(command==='/overrule'){const first=parts[0],isOption=/^option-[1-3]$/.test(first||''),isObjection=/^O\d+$/.test(first||'');await intervene('OVERRULE',isOption||isObjection?parts.slice(1).join(' '):text,isOption?first:undefined,isObjection?[first]:undefined);}
    else if(command==='/team')out(room?.governance?room.governance.team.map(a=>`${a.id} · ${a.name} · ${a.provider} · ${a.model||'继承供应商模型'}${a.lead?' · 主持':''}\n  ${a.focus}`).join('\n'):'旧版双模型会谈；新建会谈使用实验室团队。');
    else if(command==='/review'){const v=room?.review;if(!v)throw Error('当前会谈没有自主协商复盘');out(`人类介入 ${v.interventions.length} 条\n${v.interventions.map(h=>h.action+' · v'+h.revision+' · '+h.text+(h.choice?' · '+h.choice:'')).join('\n')}\n未决悬空项 ${v.unresolved.length} 条\n${v.unresolved.map(x=>x.id+' · '+x.title+'\n'+x.detail).join('\n')||'没有已登记的未决项'}\n状态 ${v.status}；不把人的裁决解释为 AI 已一致。`);}
    else if(command==='/round')await intervene('REOPEN','保持人的前提，明确再开一轮独立互审，复核方案、证据和未决项。');
    else if(command==='/help')out(HELP);
    else if(command==='/models')out('模型实验室：'+base+'/models');
    else if(command==='/apply-profile'){if(!room)throw new Error('请先 /resume 选择会话');if(!text)throw new Error('用法：/apply-profile 配置ID');show(await api(`/api/discussions/${room.id}/model-profile`,{profileId:text,upgradeWorkflow:true}));}
    else if(command==='/profiles'){const profiles=await api('/api/model-profiles');out(profiles.profiles.filter(p=>!p.deletedAt).map(p=>(p.id===profiles.activeId?'* ':'  ')+p.name+' · '+p.id).join('\n')+'\n使用 /profile ID 为新会话启用配置。已有会话保持原快照；回收站配置可在模型实验室恢复。');}
    else if(command==='/profile'){if(!text)throw new Error('请使用 /profile ID；/profiles 查看配置');const profiles=await api('/api/model-profiles');await api('/api/model-profiles',{action:'activate',id:text,revision:profiles.revision});out('已启用该配置，仅影响新会话。');}
    else if(command==='/rules')out(RULES);
    else if(command==='/web')out(base+'/discussion'+(room?'#'+room.id:''));
    else if(command==='/attach'){if(!text)throw new Error('用法：/attach "完整文件路径"');const target=localPath(text);if(!fs.existsSync(target)||!fs.statSync(target).isFile())throw new Error('附件文件不存在，文件夹请使用 /project');if(!room){pendingFiles.push(target);out('文件已加入待挂载列表。输入方向后会挂载到会话。');}else{show(await api(`/api/discussions/${room.id}/attachments`,{path:target}));out('附件已挂载。双方下一次发言会看到它。');}}
    else if(command==='/project'){if(!text)throw new Error('用法：/project "项目文件夹"');const target=localPath(text);if(!fs.existsSync(target)||!fs.statSync(target).isDirectory())throw new Error('项目文件夹不存在');if(!room){values.workspace=target;out('待挂载项目：'+target);}else show(await api(`/api/discussions/${room.id}/runtime-config`,{project:target}));}
    else if(command==='/mode'){if(!['read','work'].includes(text))throw new Error('用法：/mode read 或 /mode work（实际修改项目、执行命令，以当前用户权限运行）');if(!room){values.mode=text;out('新会话模式：'+text);}else show(await api(`/api/discussions/${room.id}/runtime-config`,{mode:text}));}
    else if(command==='/computer'){if(!['off','browser','desktop'].includes(text))throw new Error('用法：/computer off、/computer browser 或 /computer desktop');if(room)show(await api(`/api/discussions/${room.id}/runtime-config`,{computer:text}));else values.computer=text;out(text==='desktop'?'已选择 Windows 桌面控制；开始工作后，截图会发送给执行操作的模型。':'Computer Use 模式：'+text);}
    else if(command==='/tools'||command==='/skills'){const caps=await api('/api/capabilities');out(command==='/skills'?caps.skills.map(s=>`${s.name}\n  ${s.path}`).join('\n'):caps.tools.map(t=>`${t.name} · ${t.description}`).join('\n')+'\n\n'+caps.mode);}
    else if(command==='/skill'){if(!text)throw new Error('请提供技能名称，可先 /skills 查看');if(room)show(await api(`/api/discussions/${room.id}/runtime-config`,{skill:text}));else pendingSkills.push(text);out('已要求双方加载技能：'+text);}
    else if(command==='/files')out(room?`项目：${room.workspace}\n模式：${room.runtime?.mode||'read'} · Computer Use：${room.runtime?.computer||'off'}\n${(room.attachments||[]).map(a=>`${a.id} · ${a.name} · ${a.type} · ${a.size} bytes`).join('\n')||'无附件'}`:`待挂载项目：${values.workspace||'尚未选择'}\n待挂载文件：${pendingFiles.join('\n')||'无'}`);
    else if(command==='/tasks')out(room?.workItems?.length?room.workItems.map(t=>`${t.id} · ${t.owner} → ${t.assignee} · ${t.status}\n${t.title} · ${t.attempts.length} 次执行 · ${t.reviews.length} 次验收`).join('\n\n'):'尚无派工。启用双模型时可跨模型派工；单一模型使用自己的工具与子代理。');
    else if(command==='/task'){const t=room?.workItems?.find(t=>t.id===text);if(!t)throw new Error('请先 /tasks 查看任务 ID');out(JSON.stringify(t,null,2));}
    else if(command==='/agents')out(room?.agents?.length?room.agents.map(a=>`${a.id} · ${a.owner} · ${a.status}\n任务：${a.task}\n${a.result||a.error||''}`).join('\n\n'):'尚无真实子代理调用。');
    else if(command==='/processes')out(room?.processes?.length?room.processes.map(p=>`${p.id} · ${p.owner} · ${p.status}\n${p.command}\n${p.stdout||''}\n${p.stderr||p.error||''}`).join('\n\n'):'没有受管理的后台进程。');
    else if(command==='/kill'){if(!room||!text)throw new Error('用法：/kill 进程会话ID，可先 /processes 查看');const p=await api(`/api/discussions/${room.id}/processes/${text}/stop`,{});out(`${p.id} · ${p.status}`);}
    else if(command==='/quit'||command==='/exit')await quit();
    else if(command==='/key'){if(text)throw new Error('不要把密钥放在命令后，请只输入 /key');const previousHistory=[...rl.history];rl.pause();silent=true;try{const key=await readSecret();if(key.trim())await api('/api/config',{deepseekKey:key.trim()});}finally{rl.write(null,{ctrl:true,name:'u'});rl.history=previousHistory;silent=false;rl.resume();}out('密钥输入已结束；服务只在内存保存。使用 /check 验证。');}
    else if(command==='/check'){const s=await api('/api/check',{});out(`${s.codex.message}\nDeepSeek：${s.deepseek.message}\n当前模型：${(await api('/api/state')).config.deepseekModel}`);}
    else if(command==='/list'){const result=await api('/api/discussions');out(result.rooms.filter(r=>!r.deletedAt).map(r=>`${r.id} · ${labels[r.status]||r.status} · ${r.title}`).join('\n')||'无历史会话');}
    else if(command==='/resume'){if(room&&['running','pausing'].includes(room.status))throw new Error('请先 /pause 当前会话');select(await api('/api/discussions/'+text));}
    else if(command==='/new')await create(text);
    else if(command==='/start')await start();
    else if(command==='/continue'){if(parts.length!==3)throw new Error('格式：/continue 总轮数上限 总调用数上限 总token上限；可填写 unlimited');await start({maxRounds:parseBudgetCap(parts[0]),maxCalls:parseBudgetCap(parts[1]),tokenBudget:parseBudgetCap(parts[2])});}
    else if(command==='/status')status();
    else if(command==='/cache'){const s=await api(room?`/api/discussions/${room.id}/cache`:'/api/cache');out(`上下文缓存 · ${room?'当前会话':'全部实际调用'} · 监测目标 99%\n`+['Codex','DeepSeek'].map(actor=>{const a=s.actors[actor];return `${actor}: ${cachePercent(a.ratio)} · 缓存 ${a.cached} / 输入 ${a.input} tokens · ${a.measuredCalls} 次计量 / ${a.unknownCalls} 次未知`;}).join('\n')+'\n按服务端输入 tokens 加权，包含冷启动；99% 为监测目标，不是保证值。');}
    else if(command==='/pause'||command==='/stop'){if(!room)throw new Error('还没有会话');show(await api(`/api/discussions/${room.id}/${command.slice(1)}`,{}));}
    else if(command==='/save'){if(!room)throw new Error('还没有会话');const response=await fetch(base+`/api/discussions/${room.id}/report`);if(!response.ok)throw new Error('导出失败');const dir=path.join(root,'outputs','discussions');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,`${room.id}.md`);fs.writeFileSync(file,await response.text());out('已导出：'+file);}
    else throw new Error('未知命令，输入 /help 查看帮助');
  }
  out(`ForgeRelay 0.6 · 自主协商 CLI + Agent Runtime\n你定目标，团队按模型实验室配置独立实施与互审，可使用单一供应商或混合模型。\n${state.config.deepseekConfigured?'DeepSeek 已配置；/check 可验证接入。':'当前未配置 DeepSeek；仅在团队选择它时需要 /key。'}\n支持 /attach 图片或文件、/project 项目、/mode work 实际工作。\n输入 /help 查看命令，直接输入方向开始。\n/models 打开配置页面，/profiles 查看配置，/profile ID 切换新会话配置。`);
  if(values.resume)select(await api('/api/discussions/'+values.resume));
  if(values.direction){try{await create(values.direction);}catch(err){out('提示：'+err.message);}}
  void follow();
  // Mute readline as well as async events during secret entry. readSecret writes its
  // own masked prompt directly, and the secret never enters a chat or a command.
  const terminalOutput=new Writable({write(chunk,encoding,done){if(!silent)process.stdout.write(chunk,encoding);done();}});
  terminalOutput.isTTY=process.stdout.isTTY;Object.defineProperty(terminalOutput,'columns',{get:()=>process.stdout.columns});
  rl=createInterface({input:process.stdin,output:terminalOutput,terminal:!!process.stdin.isTTY,prompt:'你 › '});
  rl.on('line',line=>{if(busy){out('上一条命令尚在处理，请稍后再发。');return;}busy=true;handle(line).catch(err=>out('提示：'+err.message)).finally(()=>{busy=false;if(!closing&&process.stdin.isTTY)rl.prompt();});});
  rl.on('SIGINT',()=>void quit());
  rl.on('close',()=>{if(!closing)void quit();});
  if(process.stdin.isTTY)rl.prompt();
  await new Promise(resolve=>rl.once('close',resolve));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(()=>process.stdout.write('',()=>process.exit(0))).catch(err=>{console.error(safeTerminal('启动失败：'+err.message));process.stderr.write('',()=>process.exit(1));});
