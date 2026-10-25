// Capture the discussion at hand-off. Later conversation edits do not silently
// change a running task's contract, workspace permissions or model profile.
import {governanceSnapshot} from './human-loop.mjs';
export function executionInput(room,input={}){
  if(room.deletedAt)throw new Error('请先恢复会话');
  const direction=room.human.map(x=>x.text).join('\n\n')+(room.governance?.initial.premises?'\n\nINITIAL 前提与隐性约束：\n'+room.governance.initial.premises:'');
  return{...input,title:input.title||room.title,prompt:input.prompt||direction.slice(0,20000),workspace:input.workspace||(room.projectMounted?room.workspace:undefined),sourceDiscussion:{governance:governanceSnapshot(room),id:room.id,title:room.title,revision:room.revision,status:room.status,proposal:room.proposal?{version:room.proposal.version,hash:room.proposal.hash,text:room.proposal.text}:null,human:room.human.map(x=>({text:x.text,time:x.time})),objections:room.objections.filter(x=>x.status==='open').map(x=>({id:x.id,title:x.title,reason:x.reason,change:x.change})),capturedAt:new Date().toISOString()}};
}
