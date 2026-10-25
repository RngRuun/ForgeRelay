// Private provider transport. Never expose reasoning or raw tool payloads in UI state.
export function assistantMessage(message,thinking=false){
  return {role:'assistant',content:message.content??null,
    ...(message.tool_calls?.length?{tool_calls:structuredClone(message.tool_calls)}:{}),
    ...(thinking&&typeof message.reasoning_content==='string'?{reasoning_content:message.reasoning_content}:{})};
}
export function validateProviderHistory(messages){
  if(!Array.isArray(messages)||!messages.length||messages[0].role!=='user')throw Error('共享上下文消息格式无效');
  const pending=new Set();
  for(const message of messages){
    if(!['user','assistant','tool'].includes(message.role))throw Error('共享上下文包含无效角色');
    if(message.role==='tool'){
      if(typeof message.content!=='string'||!pending.delete(message.tool_call_id))throw Error('工具结果没有对应的原始调用');
      continue;
    }
    if(pending.size)throw Error('工具调用尚未完整返回，不能追加新的发言');
    if(!(typeof message.content==='string'||Array.isArray(message.content)||message.role==='assistant'&&message.content===null))throw Error('共享上下文内容格式无效');
    for(const tool of message.tool_calls||[]){if(message.role!=='assistant'||!tool.id||pending.has(tool.id))throw Error('工具调用标识无效');pending.add(tool.id);}
  }
  if(pending.size)throw Error('工具调用缺少结果');
  return messages;
}

// Only known independent observations may overlap. A mutation, agent or computer
// action is a barrier; no cross-request memoization of changing external facts.
const independent=new Set(['list_files','read_file','search_files','read_attachment','read_image','list_skills','read_skill_file','read_process']);
export async function executeToolBatch(calls,runTool,signal,{concurrency=3}={}){
  const results=new Array(calls.length);let cursor=0;
  const execute=async index=>{
    signal?.throwIfAborted();const tool=calls[index];
    try{return await runTool(tool.function.name,JSON.parse(tool.function.arguments));}
    catch(error){signal?.throwIfAborted();return {error:error.message};}
  };
  while(cursor<calls.length){
    signal?.throwIfAborted();
    if(!independent.has(calls[cursor].function.name)){results[cursor]=await execute(cursor);cursor++;continue;}
    let end=cursor;while(end<calls.length&&independent.has(calls[end].function.name))end++;
    const start=cursor;let next=start;
    const settled=await Promise.allSettled(Array.from({length:Math.min(concurrency,end-start)},async()=>{
      while(next<end){const index=next++;results[index]=await execute(index);}
    }));
    const failed=settled.find(result=>result.status==='rejected');if(failed)throw failed.reason;
    cursor=end;
  }
  signal?.throwIfAborted();return results;
}
