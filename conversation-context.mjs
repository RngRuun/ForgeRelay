import {transcriptView} from './context-view.mjs';

// Lossless removal of repeated transport data, not a summary or history window.
// Human premises and adjudications remain explicit even if their UI text is absent.
export function conversationSnapshot(hub,room,agent){
  const snapshot=hub.snapshot(room,'chat'),flow=room.conversation;
  for(const key of ['governance','modelProfile','rulesHash','feedback','minimumRounds','roundsCompleted','round'])delete snapshot[key];
  snapshot.transcript=room.messages.filter(m=>!m.stale&&!['ground','mcp','command_start'].includes(m.phase)&&!(m.actor==='System'&&['coordination','preferences'].includes(m.phase))).map(transcriptView);
  const humanTexts=new Map();for(const message of snapshot.transcript)if(message.actor==='Human')humanTexts.set(message.text,(humanTexts.get(message.text)||0)+1);
  const unmatched=[];for(const entry of room.human){const count=humanTexts.get(entry.text)||0;if(count)humanTexts.set(entry.text,count-1);else unmatched.push(entry);}
  if(unmatched.length)snapshot.human=unmatched;else delete snapshot.human;
  // command/files already occur verbatim in this full transcript.
  delete snapshot.nativeEvidence;
  snapshot.humanConstraints={initial:room.governance?.initial||{direction:room.human[0]?.text||''},interventions:(room.governance?.history||[]).filter(h=>['INJECT','OVERRULE','STEER'].includes(h.action)).map(({action,text,premises,choice,objectionIds,revision})=>({action,text,...(premises?{premises}:{}),...(choice?{choice}:{}),...(objectionIds?.length?{objectionIds}:{}),revision}))};
  snapshot.conversation={mode:'chat',requestId:flow.lastRequestId,currentRequest:room.messages.find(m=>m.id===flow.lastRequestId)?.text||room.human.at(-1)?.text,direct:flow.directFor===flow.lastRequestId,complexityThreshold:flow.complexityThreshold,lead:{id:agent.id,name:agent.name,provider:agent.provider,focus:agent.focus},settingsVersion:flow.settingsVersion,settings:{team:room.governance.team,rebellion:Object.fromEntries(['codex','deepseek'].map(a=>[a,room.modelProfile?.settings?.[a]?.rebellion??50])),minimumRounds:room.minRounds,maximumRounds:room.maxRounds}};
  return snapshot;
}
