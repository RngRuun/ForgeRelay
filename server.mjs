import http from 'node:http';
import { ModelProfileStore, validateSettings, codexParameters, deepseekParameters, roleGuidance } from './model-settings.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Workbench } from './core.mjs';
import { findCodex, codexStatus, createCodexAdapter, createDeepseekAdapter, createDiscussionDeepseekAdapter } from './adapters.mjs';
import { DiscussionHub, discussionReport, RULES, RULES_HASH } from './discussion.mjs';
import { AttachmentStore } from './attachments.mjs';
import { RuntimeHarness } from './harness.mjs';
import { listFiles, readFile } from './workspace.mjs';
import {cacheSummary} from './public/cache-usage.js';
import {diagnoseCache} from './cache-diagnostics.mjs';
import {executionInput} from './execution-context.mjs';
import {publicTask,publicRoom} from './public-state.mjs';
import {verifyParticipants,createReadinessProbe} from './model-readiness.mjs';
import {createStateBroadcast} from './state-broadcast.mjs';
import {taskView,taskCounts,navigationTask} from './public/task-scope.js';
import {NetworkSettings,windowsSystemProxy,validateNetworkSettings} from './network.mjs';
import {desktopRequest} from './desktop-channel.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const appVersion=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const config = { deepseekKey: process.env.DEEPSEEK_API_KEY || '', deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-flash', codexModel: process.env.RELAY_CODEX_MODEL || '' };
const bin = findCodex();
const dir = process.env.RELAY_DATA_DIR || path.join(root, 'data');
const modelProfiles = new ModelProfileStore(dir, config);
const network=new NetworkSettings(dir);config.networkSettings=network;
const credentialState={available:process.env.FORGERELAY_CREDENTIAL_STORE==='available',saved:process.env.FORGERELAY_KEY_SAVED==='1',source:process.env.FORGERELAY_KEY_SOURCE||(config.deepseekKey?'environment':'none'),notice:process.env.FORGERELAY_CREDENTIAL_NOTICE||''};
let networkStatus={checked:false,reachable:false,message:'尚未检查网络端点；CLI 登录状态不代表推理可用。'};
let inferenceController=null;
let configSaving=false;
let connectionRevision=0;
let inferenceChecks=[];try{inferenceChecks=JSON.parse(fs.readFileSync(path.join(dir,'connection-checks.json'),'utf8'));}catch{}
config.getModelProfile = () => modelProfiles.snapshot();
const syncModels = () => { config.codexModel = modelProfiles.active().settings.codex.model; config.deepseekModel = modelProfiles.active().settings.deepseek.model; }; syncModels();
const token = randomBytes(32).toString('hex');
const port = Number(process.env.PORT || 4317), host = `127.0.0.1:${port}`;
const workbench = new Workbench({ dir, getModelProfile: config.getModelProfile, codex: createCodexAdapter({ bin, root, config }), deepseek: createDeepseekAdapter(config) });
let status = { installed: null, authenticated: false, message: '正在检查 Codex CLI…' };
const probeCodex=createReadinessProbe(()=>codexStatus(bin));
probeCodex().then(result => status = result);
let deepseekStatus = { ok: false, checked: false, message: config.deepseekKey ? '已配置，尚未验证' : '未配置 API Key', models: [] };
const staleCheck=()=>({ok:false,checked:false,models:[],stale:true,message:'接入设置已变化，请重新验证'});
function invalidateConnections(){connectionRevision++;deepseekStatus={ok:false,checked:false,models:[],message:config.deepseekKey?'接入配置已更新，尚未验证':'未配置 API Key'};networkStatus={checked:false,reachable:false,message:'接入配置已更新，请重新检查网络端点。'};}
const publicTasks = tasks => tasks.map(publicTask);
const publicJSON=value=>JSON.stringify(value,(key,value)=>['cacheContexts','deepseekThreads','chatReceipts'].includes(key)?undefined:value);
async function checkDeepseek(model = config.deepseekModel,revision=connectionRevision) {
  if(revision!==connectionRevision)return staleCheck();
  const key=config.deepseekKey,accept=value=>revision===connectionRevision?(deepseekStatus=value):staleCheck();
  if (!key) return accept({ ok: false, checked: false, message: '未配置 API Key，实际推理调用为 0', models: [] });
  try {
    const response = await network.fetch('https://api.deepseek.com/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok){await response.body?.cancel();return accept({ ok: false, checked: true, message: `连接失败，HTTP ${response.status}`, models: [], checkedAt: Date.now() });}
    const data = await response.json(), models = (data.data || []).map(x => x.id);
    const ok = models.includes(model);
    return accept({ ok, checked: true, message: ok ? 'API 已验证，尚未代表推理调用成功' : '已连接，但所选模型不在可用列表中', models, checkedAt: Date.now() });
  } catch { return accept({ ok: false, checked: true, message: '网络连接失败，请重试', models: [], checkedAt: Date.now() }); }
}
async function ensureModels(profile,subject=profile) {
  await verifyParticipants(profile,subject,{hasDeepseekKey:!!config.deepseekKey,
    checkCodex:async()=>status=await probeCodex(),
    checkDeepseek:async models=>{
      if(!deepseekStatus.checked||!models.every(model=>deepseekStatus.models.includes(model))||Date.now()-(deepseekStatus.checkedAt||0)>300000)await checkDeepseek(models[0]);
      return deepseekStatus;
    }});
}
const attachments=new AttachmentStore(path.join(dir,'attachments'));
const harness=new RuntimeHarness({attachments,onChange:room=>discussions.emit(room),spawnAgent:(...args)=>discussions.subagent(...args),delegation:(...args)=>discussions.delegator.execute(...args),redact:value=>config.deepseekKey?String(value).replaceAll(config.deepseekKey,'[已隐藏密钥]'):String(value)});
const discussions = new DiscussionHub({dir,harness,getModelProfile:config.getModelProfile,baseUrl:`http://${host}`,codex:createCodexAdapter({bin,root,config}),deepseek:createDiscussionDeepseekAdapter(config),ready:ensureModels});
const discussionConnections = new Set();
let cacheController=null;
const discussionBroadcast=createStateBroadcast(discussionConnections,()=>`data: ${publicJSON(discussions.rooms.map(publicRoom))}\n\n`);
discussions.listeners.add(()=>discussionBroadcast.schedule());
function json(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(publicJSON(Array.isArray(body?.human)&&Array.isArray(body?.messages)?publicRoom(body):body)); }
async function body(req,maximum=100000) {
  let value = ''; for await (const part of req) { value += part; if (Buffer.byteLength(value) > maximum) throw new Error('请求内容过长'); }
  try { return JSON.parse(value || '{}'); } catch { throw new Error('请求格式不正确'); }
}
const connections = new Set();
const taskBroadcast=createStateBroadcast(connections,()=>`data: ${JSON.stringify(publicTasks(workbench.tasks))}\n\n`);
workbench.listeners.add(()=>taskBroadcast.schedule());
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (![host, `localhost:${port}`].includes(req.headers.host)) return json(res, 403, { error: '仅允许从本机访问' });
  if (req.headers.origin && ![`http://${host}`, `http://localhost:${port}`].includes(req.headers.origin)) return json(res, 403, { error: '来源不匹配' });
  const url = new URL(req.url, `http://${host}`);
  try {
    const taskScope=url.searchParams.get('scope')||(url.searchParams.has('task')?'task':url.searchParams.has('room')?'room':'all');
    const scopedTasks=()=>taskView(workbench.tasks,{scope:taskScope,roomId:url.searchParams.get('room'),taskId:url.searchParams.get('task'),deleted:url.searchParams.get('deleted')==='true'});
    if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: '不支持的请求方法' });
    const runtimeRoute=url.pathname.match(/^\/api\/discussions\/([a-f0-9-]+)\/runtime\/(catalog|tool)$/);
    if(runtimeRoute){const context=discussions.runtimeKeys.get(req.headers['x-relay-runtime-token']);if(req.method!=='POST'||!context||context.roomId!==runtimeRoute[1]||context.signal.aborted)return json(res,403,{error:'此代理工具会话无效或已结束'});const room=discussions.get(context.roomId);
      if(runtimeRoute[2]==='catalog')return json(res,200,{tools:harness.enabledTools(room,context.readOnly,context.actor)});
      const input=await body(req,1000000);try{const result=await harness.execute(room,context.actor,input.name,input.arguments||{},context.signal,context.depth,context.readOnly,context.scope);const {dataUrl,...visible}=result||{};const content=[{type:'text',text:JSON.stringify(visible)}];if(dataUrl){const match=dataUrl.match(/^data:([^;]+);base64,(.+)$/s);if(match)content.push({type:'image',mimeType:match[1],data:match[2]});}return json(res,200,{content});}catch(err){return json(res,200,{isError:true,content:[{type:'text',text:harness.redact(err.message)}]});}
    }
    if (req.method === 'POST' && req.headers['x-relay-token'] !== token) return json(res, 403, { error: '请刷新页面后重试' });
    if(req.method==='POST'&&configSaving&&!/(?:stop|pause|cancel|shutdown)$/.test(url.pathname))throw Error('正在保存接入配置，请稍后重试');
    if(req.method==='POST'&&inferenceController&&(/\/api\/discussions\/.+\/(?:start|chat|discussion-choice|cache-check)$/.test(url.pathname)||/\/api\/tasks\/.+\/start$/.test(url.pathname)))throw Error('正在进行真实推理测试，请等待测试结束');
    if (url.pathname === '/api/health') return json(res, 200, { app: 'relay-workbench', version: appVersion, frontendAssetsVersion:1, cacheOptimization:'append-context-v1',humanLoopVersion:2,conversationVersion:1,efficiencyVersion:1, ...(process.env.FORGERELAY_DESKTOP_MANAGED==='1'?{desktopEngineId:process.env.FORGERELAY_ENGINE_ID}: {}) });
    if(url.pathname==='/api/cache'&&req.method==='GET')return json(res,200,cacheSummary([...discussions.rooms.flatMap(r=>r.calls),...workbench.tasks.filter(t=>!t.legacy).flatMap(t=>t.calls)]));
    if(url.pathname==='/api/capabilities'&&req.method==='GET')return json(res,200,{tools:harness.catalog({}),skills:harness.skills.map(s=>({name:s.name,path:s.path})),nativeDesktop:process.platform==='win32',computerModes:['off','browser',...(process.platform==='win32'?['desktop']:[])],attachments:['images: PNG/JPEG/GIF/WebP','text/code','PDF text (pypdf)','DOCX/PPTX/XLSX/ODF text','other binary: original only'],mode:'真实工具需要会话权限；只读讨论为默认。命令工具以当前用户权限运行。'});
    if (url.pathname === '/api/navigation' && req.method === 'GET') return json(res,200,{rooms:discussions.rooms.filter(r=>!r.deletedAt).map(({id,title,status})=>({id,title,status})),tasks:scopedTasks().map(navigationTask),scope:{type:taskScope,roomId:url.searchParams.get('room'),taskId:url.searchParams.get('task')},counts:taskCounts(workbench.tasks,scopedTasks())});
    if(url.pathname==='/api/tasks'&&req.method==='GET')return json(res,200,{tasks:publicTasks(scopedTasks()),scope:{type:taskScope,roomId:url.searchParams.get('room'),taskId:url.searchParams.get('task')},counts:taskCounts(workbench.tasks,scopedTasks())});
    if (url.pathname === '/api/state' && req.method === 'GET') return json(res, 200, { token, tasks: publicTasks(taskScope==='all'&&!url.searchParams.has('scope')?workbench.tasks:scopedTasks()), rooms:discussions.rooms.filter(r=>!r.deletedAt).map(({id,title,status})=>({id,title,status})),scope:{type:taskScope,roomId:url.searchParams.get('room'),taskId:url.searchParams.get('task')},counts:taskCounts(workbench.tasks,scopedTasks()), config: { deepseekConfigured: !!config.deepseekKey, deepseek: deepseekStatus, deepseekModel: config.deepseekModel, codexModel: config.codexModel, codex: {...status,network:networkStatus}, network:network.public(), credentialStorage:credentialState, inferenceChecks, collaboration:modelProfiles.active().settings.collaboration } });
    if (url.pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify(publicTasks(workbench.tasks))}\n\n`); connections.add(res);
      const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 15000);
      req.on('close', () => { connections.delete(res); clearInterval(heartbeat); }); return;
    }
    if (url.pathname === '/api/model-profiles' && req.method === 'GET') return json(res,200,{...modelProfiles.public(), defaults: (await import('./model-settings.mjs')).defaultSettings()});
    if (url.pathname === '/api/model-profiles' && req.method === 'POST') {
      const input=await body(req,200000);
      if(config.deepseekKey && JSON.stringify(input).includes(config.deepseekKey))throw new Error('请勿将 API 密钥写入模型配置，请在接入页设置密钥');
      const previousModels=JSON.stringify([config.codexModel,config.deepseekModel]);const result=modelProfiles.update(input);syncModels();if(previousModels!==JSON.stringify([config.codexModel,config.deepseekModel]))invalidateConnections();return json(res,200,result);
    }
    if (url.pathname === '/api/model-preview' && req.method === 'POST') {
      const settings=validateSettings((await body(req,200000)).settings);
      return json(res,200,{settings,codex:codexParameters(settings.codex),deepseek:deepseekParameters(settings.deepseek),tools: {codex:settings.codex.tools,deepseek:settings.deepseek.tools},behavior:Object.fromEntries(['codex','deepseek'].map(actor=>[actor,{rebellion:settings[actor].rebellion,instructions:roleGuidance('',settings[actor].rebellion)}]))});
    }
    if (url.pathname === '/api/config' && req.method === 'POST') {
      if (workbench.active || workbench.queue.length || discussions.busy || cacheController || inferenceController) throw new Error('请等待任务、讨论或诊断结束后再修改接入设置');
      const input = await body(req);
      if(workbench.active||workbench.queue.length||discussions.busy||cacheController||inferenceController||configSaving)throw Error('当前调用或配置已变化，请结束后重试');
      configSaving=true;try{
      const nextKey=input.clearKey?'':typeof input.deepseekKey==='string'&&input.deepseekKey.trim()?input.deepseekKey.trim():config.deepseekKey;
      if(nextKey.length>2000||/[\r\n\0]/.test(nextKey))throw Error('密钥格式无效');
      if(input.deepseekModel!==undefined&&(typeof input.deepseekModel!=='string'||!/^[a-zA-Z0-9_.:/-]{1,100}$/.test(input.deepseekModel)))throw Error('DeepSeek 模型 ID 无效');
      if(input.codexModel!==undefined&&(typeof input.codexModel!=='string'||!/^[a-zA-Z0-9_.:/-]{0,100}$/.test(input.codexModel)))throw Error('Codex 模型 ID 无效');
      if(input.network)validateNetworkSettings({...network.value,...input.network});
      if(input.rememberKey===true){if(!credentialState.available)throw Error('当前后台不支持桌面加密存储，请选择仅本次运行');if(!nextKey)throw Error('请先填写密钥');await desktopRequest('credential:save',{key:nextKey});credentialState.saved=true;credentialState.source='encrypted';}
      else if(input.clearKey||input.rememberKey===false){if(credentialState.saved){await desktopRequest('credential:clear');credentialState.saved=false;}credentialState.source=nextKey?'session':'none';}
      else if(nextKey!==config.deepseekKey)credentialState.source=nextKey?'session':'none';
      config.deepseekKey=nextKey;credentialState.notice='';
      if(input.network)network.update(input.network);
      if (typeof input.deepseekModel === 'string' && /^[a-zA-Z0-9_.:/-]{1,100}$/.test(input.deepseekModel)) config.deepseekModel = input.deepseekModel;
      if (typeof input.codexModel === 'string' && /^[a-zA-Z0-9_.:/-]{0,100}$/.test(input.codexModel)) config.codexModel = input.codexModel;
      const next = modelProfiles.snapshot();if(next.settings.codex.model!==config.codexModel||next.settings.deepseek.model!==config.deepseekModel){next.settings.codex.model = config.codexModel; next.settings.deepseek.model = config.deepseekModel; modelProfiles.update({action:'save',id:next.id,name:next.name,settings:next.settings,revision:modelProfiles.state.revision});}
      invalidateConnections();
      return json(res, 200, { saved: true, deepseekConfigured: !!config.deepseekKey });
      }finally{configSaving=false;}
    }
    if (url.pathname === '/api/shutdown' && req.method === 'POST') {
      await body(req);res.once('finish',()=>setImmediate(()=>void shutdown()));json(res, 200, { stopping: true });return;
    }
    if (url.pathname === '/api/check' && req.method === 'POST') {
      const revision=connectionRevision;
      try{const detected=process.env.FORGERELAY_DESKTOP_MANAGED==='1'?(await desktopRequest('network:system')).proxy:windowsSystemProxy();if(revision===connectionRevision)network.detected=detected;}catch{}
      status = await probeCodex({force:true});
      const [deepseek,checkedNetwork]=await Promise.all([checkDeepseek(config.deepseekModel,revision),network.probe()]);const stale=revision!==connectionRevision;if(!stale)networkStatus=checkedNetwork;
      return json(res, 200, { codex: status, deepseek:stale?staleCheck():deepseek,network:networkStatus,stale });
    }
    if(url.pathname==='/api/check/inference'&&req.method==='POST'){
      const input=await body(req);if(input.confirmPaid!==true||!['Codex','DeepSeek'].includes(input.actor))throw Error('真实推理测试需要明确选择模型并确认会产生用量');
      if(workbench.active||workbench.queue.length||discussions.busy||cacheController||inferenceController)throw Error('请等待当前任务或诊断结束');
      const controller=new AbortController();inferenceController=controller;const check={actor:input.actor,status:'running',started:new Date().toISOString()};inferenceChecks.push(check);inferenceChecks=inferenceChecks.slice(-20);
      const timer=setTimeout(()=>controller.abort('推理测试超过 120 秒'),120000);
      try{
        if(input.actor==='Codex'){
          status=await probeCodex({force:true});if(!status.authenticated)throw Error(status.message||'Codex CLI 未登录');
          const workspace=path.join(dir,'connection-check');fs.mkdirSync(workspace,{recursive:true});
          const output=await createCodexAdapter({bin,root,config})({task:{id:'connection-check',workspace,modelProfile:modelProfiles.snapshot()},prompt:'连接诊断。请只回复 OK，不读取或修改文件，不调用任何工具。',readOnly:true,stateless:true,channel:'connection-check',signal:controller.signal,onEvent:(type,text)=>{if(type==='retry')check.retryCount=(check.retryCount||0)+1;},onUsage:usage=>check.usage=usage,onTrace:id=>check.providerId=id});if(!output.trim())throw Error('模型未返回文本');
        }else{
          if(!config.deepseekKey)throw Error('请先填写 DeepSeek API Key');
          const response=await network.fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.deepseekKey}`},signal:controller.signal,body:JSON.stringify({...(await import('./model-settings.mjs')).deepseekParameters(modelProfiles.active().settings.deepseek),messages:[{role:'user',content:'连接诊断，请只回复 OK，不使用工具。'}],stream:false})});
          if(!response.ok)throw Error(`推理测试返回 HTTP ${response.status}`);const data=await response.json();check.usage=data.usage;check.providerId=data.id;if(!data.choices?.[0]?.message?.content||data.choices[0].finish_reason==='length')throw Error('推理未完整返回');
        }
        check.status='success';
      }catch(error){check.status='failed';check.error=String(error.message).replaceAll(config.deepseekKey||'\u0000','[已隐藏密钥]');if(error.partialOutput)check.partialOutputAvailable=true;}
      finally{clearTimeout(timer);check.ended=new Date().toISOString();check.usageKnown=!!check.usage;inferenceController=null;fs.writeFileSync(path.join(dir,'connection-checks.json'),JSON.stringify(inferenceChecks,null,2));}
      return json(res,200,check);
    }
    if (url.pathname === '/api/discussions/events' && req.method === 'GET') {
      res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive'});
      res.write(`data: ${publicJSON(discussions.rooms.map(publicRoom))}\n\n`); discussionConnections.add(res);
      const heartbeat=setInterval(()=>res.write(': keepalive\n\n'),15000);
      req.on('close',()=>{discussionConnections.delete(res);clearInterval(heartbeat);}); return;
    }
    if (url.pathname === '/api/discussions' && req.method === 'GET') return json(res,200,{rooms:discussions.rooms.map(publicRoom),rules:RULES,rulesHash:RULES_HASH});
    if (url.pathname === '/api/discussions' && req.method === 'POST') return json(res,201,discussions.create({governance:true,...await body(req)}));
    const attachmentDownload=url.pathname.match(/^\/api\/discussions\/([a-f0-9-]+)\/attachments\/([a-f0-9-]+)\/file$/);
    if(attachmentDownload&&req.method==='GET'){const room=discussions.get(attachmentDownload[1]),item=attachments.get(room,attachmentDownload[2]);res.writeHead(200,{'Content-Type':item.mime||'application/octet-stream','Content-Disposition':`${item.type==='image'?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(item.name)}`});fs.createReadStream(item.path).pipe(res);return;}
    const attachmentRoute=url.pathname.match(/^\/api\/discussions\/([a-f0-9-]+)\/(attachments|runtime-config)$/);
    if(attachmentRoute&&req.method==='POST')return json(res,200,attachmentRoute[2]==='attachments'?discussions.attach(attachmentRoute[1],await body(req,36000000)):discussions.configure(attachmentRoute[1],await body(req)));
    const processRoute=url.pathname.match(/^\/api\/discussions\/([a-f0-9-]+)\/processes\/([a-f0-9-]+)\/stop$/);
    if(processRoute&&req.method==='POST'){const room=discussions.get(processRoute[1]);return json(res,200,await harness.perform(room,'Human','stop_process',{id:processRoute[2]},new AbortController().signal,0,false));}
    const roomMatch=url.pathname.match(/^\/api\/discussions\/([a-f0-9-]+)(?:\/(start|message|pause|stop|report|cache|cache-check|model-profile|trash|restore|execution|intervene|review|chat|discussion-choice|conversation-settings))?$/);
    if (roomMatch) {
      const [,id,action]=roomMatch, room=discussions.get(id,{includeDeleted:['trash','restore'].includes(action)});
      if(action==='trash'&&req.method==='POST'){if(cacheController)throw new Error('请等待缓存诊断结束');if(workbench.tasks.some(t=>t.sourceDiscussion?.id===id&&['queued','running','pausing','paused','waiting_user'].includes(t.status)))throw new Error('请先停止此会话关联的执行任务');return json(res,200,discussions.trash(id));}
      if(action==='restore'&&req.method==='POST')return json(res,200,discussions.restore(id));
      if(action==='execution'&&req.method==='POST'){
        const input=await body(req);const existing=workbench.tasks.find(t=>!t.deletedAt&&t.sourceDiscussion?.id===id&&['draft','queued','running','pausing','paused','waiting_user'].includes(t.status));if(existing&&!input.newTask)return json(res,200,publicTask(existing));
        const task=workbench.create(executionInput(room,input));task.modelProfile=structuredClone(room.modelProfile||modelProfiles.snapshot());workbench.emit();return json(res,201,publicTask(task));
      }
      if (!action && req.method==='GET') return json(res,200,room);
      if(['chat','discussion-choice','conversation-settings'].includes(action)&&req.method==='POST'){if(cacheController)throw Error('请等待缓存诊断结束');if((workbench.active||workbench.queue.length)&&action!=='conversation-settings')throw Error('请先暂停执行任务');const input=await body(req);return json(res,200,await (action==='chat'?discussions.converse(id,input):action==='discussion-choice'?discussions.discussionChoice(id,input):discussions.conversationSettings(id,input)));}
      if(action==='intervene'&&req.method==='POST')return json(res,200,await discussions.intervene(id,await body(req)));
      if(action==='review'&&req.method==='GET')return json(res,200,room.review||null);
      if(action==='model-profile'&&req.method==='POST'){if(cacheController)throw new Error('请等待缓存诊断结束');const input=await body(req);return json(res,200,discussions.setProfile(id,modelProfiles.snapshot(input.profileId),{upgradeWorkflow:input.upgradeWorkflow===true}));}
      if(action==='cache'&&req.method==='GET')return json(res,200,cacheSummary(room.calls));
      if(action==='cache-check'&&req.method==='POST'){
        if(cacheController||discussions.busy||workbench.active||workbench.queue.length)throw new Error('请等待当前调用结束，再进行缓存诊断');
        if(!config.deepseekKey)throw new Error('请先接入 DeepSeek');
        cacheController=new AbortController();const controller=cacheController;
        const disconnect=()=>{if(!res.writableEnded)controller.abort('诊断连接已关闭');};res.once('close',disconnect);
        try{return json(res,200,await diagnoseCache({hub:discussions,room,deepseek:createDiscussionDeepseekAdapter(config),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(120000)])}));}
        finally{res.off('close',disconnect);cacheController=null;}
      }
      if (action==='report' && req.method==='GET') { res.writeHead(200,{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename="relay-discussion.md"'}); return res.end(discussionReport(room)); }
      if (req.method!=='POST' || !action || action==='report') return json(res,405,{error:'不支持的请求方法'});
      if (action==='start') { if(workbench.active || workbench.queue.length || cacheController) throw new Error('请等待执行任务或缓存诊断结束再开始讨论'); return json(res,200,await discussions.start(id,await body(req))); }
      return json(res,200,action==='message'?discussions.message(id,(await body(req)).text):discussions[action](id));
    }
    if (url.pathname === '/api/tasks' && req.method === 'POST') {const input=await body(req);delete input.sourceDiscussion;const room=input.discussionId?discussions.get(input.discussionId):null;const task=workbench.create(room?executionInput(room,input):input);if(room){task.modelProfile=structuredClone(room.modelProfile||modelProfiles.snapshot());workbench.emit();}return json(res,201,publicTask(task));}
    const workspaceMatch = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]+)\/workspace$/);
    if (workspaceMatch && req.method === 'GET') {
      const task = workbench.get(workspaceMatch[1]);
      if (!fs.existsSync(task.workspace)) return json(res, 200, { files: [] });
      return json(res, 200, url.searchParams.get('path') ? readFile(task.workspace, url.searchParams.get('path'), 1, 200) : { files: listFiles(task.workspace) });
    }
    const fileMatch = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]+)\/file$/);
    if (fileMatch && req.method === 'GET') {
      const task = workbench.get(fileMatch[1]);
      const allowed = task.artifacts.find(a => a.url === url.pathname + url.search);
      if (!allowed) return json(res, 404, { error: '文件不在此任务的成果列表中' });
      const workspace = fs.realpathSync(task.workspace), target = fs.realpathSync(path.resolve(workspace, url.searchParams.get('path') || ''));
      const relative = path.relative(workspace, target);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(target).isFile()) return json(res, 403, { error: '文件路径不在任务目录内' });
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(target))}` });
      const stream = fs.createReadStream(target); stream.on('error', () => res.destroy()); stream.pipe(res); return;
    }
    const match = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]+)\/(start|pause|resume|cancel|steer|report|trash|restore|acknowledge)$/);
    if (match) {
      const [, id, action] = match, task = workbench.get(id,{includeDeleted:['trash','restore'].includes(action)});
      if(action==='acknowledge'&&req.method==='POST'){if(task.recovery)task.recovery.acknowledged=true;workbench.emit();return json(res,200,publicTask(task));}
      if (action === 'report' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="relay-report.md"' }); return res.end(workbench.report(task));
      }
      if (req.method !== 'POST' || action === 'report') return json(res, 405, { error: '不支持的请求方法' });
      if (action === 'start' && task.mode === 'live') {
        if(cacheController)throw new Error('请等待缓存诊断结束');
        if (discussions.busy) throw new Error('请先暂停讨论再开始执行任务');
        if(!task.modelProfile)task.modelProfile=modelProfiles.snapshot();
        await ensureModels(task.modelProfile,task);
      }
      return json(res, 200, publicTask(action === 'steer' ? workbench.steer(id, (await body(req)).text) : workbench[action](id)));
    }
    const fontFiles=new Set(['publicsans-variable.ttf','ibmplexmono-regular.ttf','ibmplexmono-medium.ttf']);
    if(req.method==='GET'&&url.pathname.startsWith('/fonts/')&&fontFiles.has(url.pathname.slice(7))){res.writeHead(200,{'Content-Type':'font/ttf','Cache-Control':'public, max-age=86400'});fs.createReadStream(path.join(root,'public','fonts',url.pathname.slice(7))).pipe(res);return;}
    const assets = { '/models':['models.html','text/html; charset=utf-8'], '/models.js':['models.js','text/javascript; charset=utf-8'], '/models.css':['models.css','text/css; charset=utf-8'], '/vendor/vue.runtime.esm-browser.prod.js':['vendor/vue.runtime.esm-browser.prod.js','text/javascript; charset=utf-8'], '/': ['discussion.html','text/html; charset=utf-8'], '/workbench':['index.html','text/html; charset=utf-8'], '/fonts.css':['fonts.css','text/css; charset=utf-8'], '/discussion': ['discussion.html','text/html; charset=utf-8'], '/discussion.js':['discussion.js','text/javascript; charset=utf-8'], '/discussion.css':['discussion.css','text/css; charset=utf-8'], '/runtime-ui.js':['runtime-ui.js','text/javascript; charset=utf-8'], '/runtime-ui.css':['runtime-ui.css','text/css; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
    assets['/cache-usage.js']=['cache-usage.js','text/javascript; charset=utf-8'];
    assets['/conversation-policy.js']=['conversation-policy.js','text/javascript; charset=utf-8'];
    assets['/conversation-controls.js']=['conversation-controls.js','text/javascript; charset=utf-8'];
    assets['/collaboration-config.js']=['collaboration-config.js','text/javascript; charset=utf-8'];
    assets['/participants.js']=['participants.js','text/javascript; charset=utf-8'];
    assets['/discussion-layout.js']=['discussion-layout.js','text/javascript; charset=utf-8'];
    assets['/workspace-layout.css']=['workspace-layout.css','text/css; charset=utf-8'];
    assets['/workspace-shell.css']=['workspace-shell.css','text/css; charset=utf-8'];
    assets['/workspace-shell.js']=['workspace-shell.js','text/javascript; charset=utf-8'];
    assets['/task-scope.js']=['task-scope.js','text/javascript; charset=utf-8'];
    assets['/work-status.js']=['work-status.js','text/javascript; charset=utf-8'];
    assets['/budget-limits.js']=['budget-limits.js','text/javascript; charset=utf-8'];
    assets['/human-loop-ui.js']=['human-loop-ui.js','text/javascript; charset=utf-8'];
    assets['/human-directions.js']=['human-directions.js','text/javascript; charset=utf-8'];
    assets['/boot-recovery.js']=['boot-recovery.js','text/javascript; charset=utf-8'];
    assets['/vendor/gsap.min.js']=['vendor/gsap.min.js','text/javascript; charset=utf-8'];
    assets['/interface.css']=['interface.css','text/css; charset=utf-8'];
    assets['/experience.js']=['experience.js','text/javascript; charset=utf-8'];
    assets['/desktop.js']=['desktop.js','text/javascript; charset=utf-8'];
    assets['/telemetry.js']=['telemetry.js','text/javascript; charset=utf-8'];
    assets['/telemetry-charts.js']=['telemetry-charts.js','text/javascript; charset=utf-8'];
    assets['/network-diagram.js']=['network-diagram.js','text/javascript; charset=utf-8'];
    assets['/floating-diagrams.js']=['floating-diagrams.js','text/javascript; charset=utf-8'];
    assets['/floating-geometry.js']=['floating-geometry.js','text/javascript; charset=utf-8'];
    assets['/floating-network.js']=['floating-network.js','text/javascript; charset=utf-8'];
    assets['/reflection.js']=['reflection.js','text/javascript; charset=utf-8'];
    assets['/team-topology.js']=['team-topology.js','text/javascript; charset=utf-8'];
    assets['/topology-diagram.js']=['topology-diagram.js','text/javascript; charset=utf-8'];
    assets['/telemetry.css']=['telemetry.css','text/css; charset=utf-8'];
    const asset = assets[url.pathname];
    if (!asset || req.method !== 'GET') return json(res, 404, { error: '页面不存在' });
    res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(root, 'public', asset[0])));
  } catch (err) {
    let error = String(err.message || '请求失败'); if (config.deepseekKey) error = error.replaceAll(config.deepseekKey, '[已隐藏密钥]');
    json(res, 400, { error });
  }
});
server.listen(port, '127.0.0.1', () => console.log(`ForgeRelay 本地工作空间 http://${host}`));
server.on('error', err => { console.error(err.code === 'EADDRINUSE' ? `端口 ${port} 已被占用。请打开 http://${host} 或设置 PORT 后重试。` : err.message); process.exitCode = 1; });
let stopping = false;
async function shutdown() {
  cacheController?.abort('服务正在关闭');
  inferenceController?.abort('服务正在关闭');
  if (stopping) return; stopping = true;
  for (const t of workbench.tasks) if (['running', 'queued', 'paused', 'pausing', 'waiting_user'].includes(t.status)) workbench.cancel(t.id);
  const discussionStop=discussions.shutdown();
  discussionBroadcast.close();taskBroadcast.close();
  for (const connection of discussionConnections) connection.end(); discussionConnections.clear();
  for (const connection of connections) connection.end(); connections.clear();
  const closed=new Promise(resolve=>server.close(resolve));const forceClose=setTimeout(()=>server.closeAllConnections(),6000);forceClose.unref();
  for (let i = 0; i < 50 && workbench.active; i++) await new Promise(resolve => setTimeout(resolve, 100));
  await Promise.race([discussionStop,new Promise(resolve=>setTimeout(resolve,5000))]);
  await network.close();await closed;clearTimeout(forceClose);
  process.exit(0);
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
// A managed engine must not remain orphaned if its desktop parent exits.
if(process.env.FORGERELAY_DESKTOP_MANAGED==='1'&&process.send)process.on('disconnect',shutdown);
