import fs from 'node:fs';
import {activeProviders} from './public/participants.js';
import {randomUUID,createHash} from 'node:crypto';
import {safePath} from './workspace.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const stamp=()=>new Date().toISOString();
const list=(value,max=20)=>Array.isArray(value)&&value.length<=max&&value.every(v=>typeof v==='string'&&v.trim()&&v.length<=4000);
const active=new Set(['assigned','running']);
const verificationTools=new Set(['read_file','read_image','read_attachment','search_files','run_command','computer_use']);
export function taskProblems(room){const errors=[];for(const task of room.workItems||[]){if(task.revision!==room.revision)continue;if(task.status!=='accepted')errors.push(`派工 ${task.id.slice(0,8)} 尚未由 Codex 验收（${task.status}）`);else for(const file of task.attempts.at(-1)?.artifacts||[]){try{if(sha(fs.readFileSync(safePath(room.workspace,file.path)))!==file.hash)errors.push(`派工交付物已变化：${file.path}`);}catch{errors.push(`派工交付物不可用：${file.path}`);}}}return errors;}
export class WorkDelegator {
  constructor(hub){this.hub=hub;}
  get(room,id){const task=room.workItems?.find(t=>t.id===id);if(!task)throw new Error('没有这个派工任务');return task;}
  authorize(room,actor,depth){if(actor!=='Codex'||depth!==0)throw new Error('只有主持 Codex 主代理能分派、验收和返工任务');if(activeProviders(room).length!==2)throw new Error('当前团队未启用双模型派工；请使用参与模型自己的工具和子代理');if(['ground','vote'].includes(room.activity?.phase))throw new Error('规则确认与独立表决阶段不能派工或验收');}
  current(room,task){if(task.revision!==room.revision||task.workspace!==room.workspace)throw new Error('人工方向或项目已经改变，请按当前方向重新派工');}
  async execute(room,actor,name,args,signal,depth,readOnly){
    if(name==='inspect_task'){const tasks=args.id?[this.get(room,args.id)]:room.workItems||[];if(actor==='Codex')for(const task of tasks)if(task.status==='submitted'){task.inspectedAttempt=task.attempts.length;task.inspectedAt=stamp();}this.hub.emit(room);return{tasks,verificationEvidence:(room.toolCalls||[]).filter(t=>t.actor===actor&&t.status==='success'&&verificationTools.has(t.name)).slice(-12).map(t=>({id:t.id,name:t.name,args:t.args,result:t.result,ended:t.ended}))};}
    this.authorize(room,actor,depth);
    if(name==='delegate_task'){
      if(!args.title?.trim()||args.title.length>160||!args.goal?.trim()||args.goal.length>12000||!list(args.files)||!list(args.acceptance)||!args.acceptance.length||!list(args.constraints))throw new Error('派工必须包含标题、明确目标、文件范围、至少一项验收标准和约束数组');
      if((room.workItems?.length||0)>=12)throw new Error('本会话最多 12 项派工');
      for(const file of args.files)safePath(room.workspace,file,true);
      const task={id:randomUUID(),title:args.title.trim(),goal:args.goal.trim(),files:[...new Set(args.files.map(f=>f.replaceAll('\\','/')))],acceptance:[...new Set(args.acceptance)],constraints:args.constraints,owner:'Codex',assignee:'DeepSeek',revision:room.revision,workspace:room.workspace,status:'assigned',created:stamp(),attempts:[],reviews:[]};
      (room.workItems||=[]).push(task);this.hub.harness.changed(room);this.hub.note(room,'Codex','dispatch',`分派给 DeepSeek：${task.title}\n目标：${task.goal}\n验收：${task.acceptance.join('；')}`,{workItemId:task.id});return this.run(room,task,signal,readOnly);
    }
    const task=this.get(room,args.id);this.current(room,task);
    if(name==='retry_task'){if(!['changes_requested','blocked','failed','interrupted'].includes(task.status))throw new Error('只能重做已退回、受阻、失败或中断的任务');return this.run(room,task,signal,readOnly);}
    if(name!=='review_task')throw new Error('未知派工操作');
    if(task.status!=='submitted'&&!(task.status==='accepted'&&args.decision==='changes_requested'))throw new Error('DeepSeek 尚未提交可验收的交付；已验收任务可因新问题退回修改');
    if(!['accepted','changes_requested'].includes(args.decision)||typeof args.feedback!=='string'||args.feedback.trim().length<10)throw new Error('验收需要 accepted/changes_requested 和具体评语');
    const attempt=task.attempts.at(-1),checks=args.checks;
    if(!Array.isArray(checks)||checks.length!==task.acceptance.length||new Set(checks.map(c=>c.criterion)).size!==task.acceptance.length||!checks.every(c=>task.acceptance.includes(c.criterion)&&typeof c.passed==='boolean'&&typeof c.evidence==='string'&&c.evidence.trim().length>=5))throw new Error('必须逐项回应原始验收标准，不得缺项或重复');
    if(args.decision==='accepted'){
      if(task.inspectedAttempt!==task.attempts.length)throw new Error('先 inspect_task 阅读本次真实交付，再独立复核');
      if(!checks.every(c=>c.passed))throw new Error('尚有验收项不通过，必须退回');
      if(!Array.isArray(args.evidenceIds)||!args.evidenceIds.length||!args.evidenceIds.every(id=>room.toolCalls.some(t=>t.id===id&&t.actor==='Codex'&&!t.workItemId&&t.status==='success'&&verificationTools.has(t.name)&&t.started>=attempt.ended)))throw new Error('验收必须引用提交后 Codex 自己实际复核的工具调用 ID；先 read_file/run_command 等，再 inspect_task 取得 ID');
      for(const file of attempt.artifacts)if(sha(fs.readFileSync(safePath(room.workspace,file.path)))!==file.hash)throw new Error('交付文件在提交后发生变化，请退回重新提交');
      if(!attempt.callIds.some(id=>room.calls.some(c=>c.id===id&&c.status==='success')))throw new Error('缺少真实 DeepSeek 成功调用');
    }
    const review={id:randomUUID(),reviewer:'Codex',attempt:task.attempts.length,decision:args.decision,checks,evidenceIds:args.evidenceIds||[],feedback:args.feedback,time:stamp()};task.reviews.push(review);task.status=args.decision;this.hub.harness.changed(room);this.hub.note(room,'Codex','review',`${task.title} · ${args.decision==='accepted'?'验收通过':'退回修改'}\n${args.feedback}`,{workItemId:task.id});this.hub.emit(room);return{task};
  }
  async run(room,task,parentSignal,readOnly){
    this.current(room,task);if(active.has(task.status)&&task.attempts.length)throw new Error('该任务正在执行');if(task.attempts.length>=4)throw new Error('单项派工最多 4 次执行，保留未解决问题');
    const signal=AbortSignal.any([parentSignal,AbortSignal.timeout(210000)]),attempt={number:task.attempts.length+1,started:stamp(),status:'running',toolIds:[],callIds:[],artifacts:[]};task.attempts.push(attempt);task.status='running';task.inspectedAttempt=0;this.hub.emit(room);
    const scope={workItemId:task.id,allowedFiles:task.files};let responseCall;
    try{
      const tools=this.hub.harness.enabledTools(room,readOnly,'DeepSeek').filter(t=>!['delegate_task','review_task','retry_task'].includes(t.name));
      const prompt=`你是 Codex 分派的 DeepSeek 执行代理，不是聊天回复器。你可以规划并实际调用工具、技能、自己的子代理。不能替 Codex 验收，也不能投票。\n人类方向：${JSON.stringify(room.human)}\n项目：${room.workspace}\n任务合同：${JSON.stringify({id:task.id,title:task.title,goal:task.goal,files:task.files,acceptance:task.acceptance,constraints:task.constraints})}\n上次交付与验收意见：${JSON.stringify({previous:task.attempts.slice(0,-1),reviews:task.reviews})}\n权限：${JSON.stringify(room.runtime)}；只读=${readOnly}。write_file 只允许合同的明确文件；空文件范围表示调查任务，不能写文件。命令仍以当前用户权限运行，必须遵守同样范围，不是 OS 沙箱。\n指定技能：${JSON.stringify(room.enabledSkills)}；附件：${JSON.stringify(room.attachments?.map(a=>({id:a.id,name:a.name,type:a.type})))}\n先读取适用 AGENTS.md 和资料，逐项完成验收标准，运行必要验证。实际工具失败就报告失败，不能编造。不要只给 Codex 提建议后声称完成。最终严格返回 JSON：{"status":"submitted 或 blocked","summary":"具体执行与结论","artifacts":["实际项目相对文件路径"],"checks":[{"criterion":"原始验收标准逐字匹配","passed":true,"evidence":"具体证据或工具结果"}],"blockers":["受阻原因"]}。status=submitted 只是待 Codex 验收，不能表示已验收。`;
      const raw=await this.hub.deepseek({task:room,system:room.rules+'\n你现在承担明确派工合同，先使用工具实际执行，再提交 JSON 交付。',prompt,signal,requireTool:true,tools:tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.inputSchema}})),runTool:(name,args)=>this.hub.harness.execute(room,'DeepSeek',name,args,signal,1,readOnly,scope),beforeRequest:()=>{responseCall=this.hub.newCall(room,'DeepSeek','task',{workItemId:task.id,attempt:attempt.number});attempt.callIds.push(responseCall.id);return this.hub.observers(room,responseCall);}});
      signal.throwIfAborted();this.current(room,task);const result=typeof raw==='string'?JSON.parse(raw):raw;
      if(!['submitted','blocked'].includes(result.status)||typeof result.summary!=='string'||!result.summary.trim()||!list(result.artifacts)||!list(result.blockers)||!Array.isArray(result.checks)||!result.checks.every(c=>task.acceptance.includes(c.criterion)&&typeof c.passed==='boolean'&&typeof c.evidence==='string'))throw new Error('DeepSeek 交付格式不符合任务合同');
      attempt.toolIds=room.toolCalls.filter(t=>t.workItemId===task.id&&t.started>=attempt.started).map(t=>t.id);
      if(!room.toolCalls.some(t=>attempt.toolIds.includes(t.id)&&t.actor==='DeepSeek'&&t.status==='success'))throw new Error('没有任何实际工具成功记录，不能以文字自述提交任务');
      for(const name of room.enabledSkills||[])if(!room.loadedSkills?.DeepSeek?.includes(name))throw new Error('DeepSeek 未实际加载指定技能：'+name);
      for(const file of result.artifacts){const full=safePath(room.workspace,file);if(!fs.statSync(full).isFile())throw new Error('交付物必须是实际文件');const hash=sha(fs.readFileSync(full));attempt.artifacts.push({path:file,hash,bytes:fs.statSync(full).size});room.fileEvidence||={};room.fileEvidence[file]=hash;}
      Object.assign(attempt,{status:result.status,summary:result.summary,checks:result.checks,blockers:result.blockers,ended:stamp()});task.status=result.status;this.hub.note(room,'DeepSeek','delivery',`${task.title} · ${result.status==='submitted'?'已提交，等待 Codex 验收':'执行受阻'}\n${result.summary}`,{workItemId:task.id});this.hub.harness.changed(room);return{task,next:'Codex 先 inspect_task，再独立读取/测试交付，review_task 逐项验收；不合格则 changes_requested，再 retry_task。'};
    }catch(err){attempt.status=signal.aborted?'interrupted':'failed';attempt.error=this.hub.harness.redact(err.message);attempt.ended=stamp();attempt.toolIds=room.toolCalls.filter(t=>t.workItemId===task.id&&t.started>=attempt.started).map(t=>t.id);task.status=task.revision===room.revision?attempt.status:'stale';if(responseCall?.status==='running'){responseCall.status=attempt.status;responseCall.error=attempt.error;responseCall.ended=stamp();}parentSignal.throwIfAborted();return{task,error:attempt.error,next:'失败保留，不算完成。可按原合同 retry_task，或向人说明阻碍。'};
    }finally{this.hub.emit(room);}
  }
}
