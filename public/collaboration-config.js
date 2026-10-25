import {budgetLimit} from './budget-limits.js';
export const ROLE_PRESETS=[
 {id:'lead',name:'实施与整合',provider:'Codex',model:'',focus:'负责完整方案、实际实施和整合。独立核对其他角色的证据，不替他人表决。'},
 {id:'research',name:'研究与证据',provider:'DeepSeek',model:'',focus:'独立调查、读取资料、比较替代方案。区分已有事实与只能由人补充的信息。'},
 {id:'critic',name:'反方验证',provider:'Codex',model:'',focus:'用失败案例、算法边界、可验证性和反证挑战方案；证据充分时认可，不捏造反对。'},
 {id:'constraints',name:'约束审计',provider:'DeepSeek',model:'',focus:'检查成本、维护、隐性约束和人的裁决是否得到落实。'},
 {id:'delivery',name:'交付复核',provider:'Codex',model:'',focus:'独立核对需求覆盖、验收标准、实际证据和剩余风险。'}
];
export const defaultCollaboration=()=>({minRounds:3,maxRounds:5,highDisagreement:true,informationGaps:true,threshold:4,leaderId:'lead',team:ROLE_PRESETS.slice(0,3).map(a=>({...a}))});
export function validateCollaboration(value){
 const v=value===undefined?defaultCollaboration():value;
 if(!v||typeof v!=='object'||!Array.isArray(v.team)||v.team.length<3||v.team.length>5)throw Error('协商团队需要 3–5 个角色');
 if(!Number.isInteger(v.minRounds)||v.minRounds<1||v.minRounds>10||v.maxRounds!==null&&(!Number.isInteger(v.maxRounds)||v.maxRounds>10||v.maxRounds<v.minRounds))throw Error('互审轮数为 1–10，最多轮数不能小于最低轮数；也可以明确选择不限轮数');
 if(typeof v.highDisagreement!=='boolean'||typeof v.informationGaps!=='boolean'||!Number.isInteger(v.threshold)||v.threshold<1||v.threshold>5)throw Error('介入开关或影响阈值无效');
 const ids=new Set(),team=v.team.map(a=>{if(!a||!/^[a-z][a-z0-9_-]{0,31}$/.test(a.id)||ids.has(a.id))throw Error('角色 ID 无效或重复');ids.add(a.id);
  if(!['Codex','DeepSeek'].includes(a.provider)||typeof a.name!=='string'||!a.name.trim()||a.name.length>40||typeof a.focus!=='string'||!a.focus.trim()||a.focus.length>2000||a.focus.includes('\0'))throw Error('角色需要名称、模型来源和明确职责（最多 2000 字）');
  if(typeof a.model!=='string'||!/^[\w.:/-]{0,120}$/.test(a.model))throw Error('角色模型 ID 无效');
  return{id:a.id,name:a.name.trim(),provider:a.provider,model:a.model,focus:a.focus.trim()};});
 if(!team.some(a=>a.id===v.leaderId))throw Error('主持人必须是团队内的角色');
 return{minRounds:v.minRounds,maxRounds:v.maxRounds,highDisagreement:v.highDisagreement,informationGaps:v.informationGaps,threshold:v.threshold,leaderId:v.leaderId,team,...(v.maxCalls!==undefined?{maxCalls:budgetLimit(v.maxCalls,100,6,400,'调用预算')}:{ }),...(v.tokenBudget!==undefined?{tokenBudget:budgetLimit(v.tokenBudget,1000000,10000,2000000,'Token 预算')}:{ })};
}
