// Model-facing views only. The original messages and protocol/evidence records
// remain intact for validation, reports, UI, and audit.
export function transcriptView(message){
  const {id,actor,phase,agentId,agentLabel,text}=message;
  const view={...(id?{id}:{}),actor,phase,...(agentId?{agentId,agentLabel}:{}),text};
  if(!message.detail||typeof message.detail!=='object'||Array.isArray(message.detail)){
    if(message.detail!==undefined)view.detail=message.detail;
    return view;
  }
  const detail=structuredClone(message.detail);
  // These attestations were checked by the scheduler, not substantive argument.
  // Keep revision/proposalHash so a critique stays bound to its original version.
  for(const key of ['rulesHash','acknowledged','directiveHash'])delete detail[key];
  if(detail.summary===text)delete detail.summary;
  for(const key of ['analysis','objections','replies','close','signals'])if(Array.isArray(detail[key])&&!detail[key].length)delete detail[key];
  for(const key of ['proposal','question'])if(detail[key]==='')delete detail[key];
  if(detail.stance==='undecided')delete detail.stance;
  if(Object.keys(detail).length)view.detail=detail;
  return view;
}

export function nativeEvidenceText(text){
  // Short command output used to appear twice (overlapping head and tail).
  return text.length<=1800?text:text.slice(0,200)+'\n'+text.slice(-1600);
}
