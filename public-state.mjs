// Presentation transport only. Model adapters, persisted state and exported
// audit reports continue to use the complete original objects.
export function publicTask(task){
  const {cacheContexts,deepseekThreads,chatReceipts,...visible}=task;
  return visible;
}
export function publicRoom(room){
  const {cacheContexts,deepseekThreads,chatReceipts,rules,ruleHistory,modelProfileHistory,evidenceReuse,...visible}=room;
  return visible;
}
