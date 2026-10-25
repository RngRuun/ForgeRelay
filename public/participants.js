export const PROVIDERS=['Codex','DeepSeek'];
export function participantTeam(subject){
  if(Array.isArray(subject?.human)&&Array.isArray(subject?.messages)&&!subject.governance)return null;
  return subject?.governance?.team||subject?.sourceDiscussion?.governance?.team||subject?.modelProfile?.settings?.collaboration?.team||subject?.settings?.collaboration?.team||subject?.collaboration?.team||null;
}
export function activeProviders(subject){
  const team=participantTeam(subject);
  return team?.length?PROVIDERS.filter(p=>team.some(a=>a.provider===p)):[...PROVIDERS];
}
export function leaderProvider(subject){
  const team=participantTeam(subject),policy=subject?.modelProfile?.settings?.collaboration||subject?.settings?.collaboration||subject?.collaboration;
  return team?.find(a=>a.lead||a.id===policy?.leaderId)?.provider||activeProviders(subject)[0];
}
export const participantsReady=(subject,config)=>activeProviders(subject).every(p=>p==='Codex'?config.codex?.authenticated:config.deepseek?.ok);
export const planningEmptyTitle=subject=>`计划会由真实的 ${leaderProvider(subject)} 调用产生`;
