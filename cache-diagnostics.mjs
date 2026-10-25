import {randomUUID} from 'node:crypto';
import {discussionSystem,validateTurn} from './discussion.mjs';
import {prepareCacheContext} from './cache-context.mjs';
import {cacheSummary} from './public/cache-usage.js';
import {setTimeout as pause} from 'node:timers/promises';
import {defaultSettings} from './model-settings.mjs';

// Bounded real requests, recorded separately from business calls, budgets and consensus.
export async function diagnoseCache({hub,room,deepseek,signal,settleMs=2000}){
  const revision=room.revision,run={id:randomUUID(),started:new Date().toISOString(),status:'running',purpose:'只读核对增量上下文与 API 缓存；不执行原任务，不参与共识',calls:[]};
  room.cacheDiagnostics=[...(room.cacheDiagnostics||[]).slice(-9),run];hub.emit(room);
  const task={workspace:room.workspace,rulesHash:room.rulesHash,modelProfile:structuredClone(room.modelProfile||hub.getModelProfile?.()||{settings:defaultSettings()})};
  if(task.modelProfile?.settings?.deepseek)task.modelProfile.settings.deepseek.maxTokens=Math.min(1024,task.modelProfile.settings.deepseek.maxTokens);
  const system=discussionSystem(room,'DeepSeek')+'\n本请求是人授权的只读缓存诊断，不继续原业务、不派工、不调用工具、不提出新异议。按最新快照 phase 及 feedback 核对状态。严格按 schema 返回 JSON：summary 必须包含 feedback 指定的 CACHE_CHECK 标记及当前 phase；analysis 给出一项状态核对；proposal、question 为空，objections/replies/close 为空数组，stance=undecided。必须准确返回最新 rulesHash、revision、proposalHash；若快照含 governance，还须返回 governance.directiveHash，signals=[]。不要声称执行过任何工具或完成了原业务。';
  try{
    for(const [index,phase] of ['challenge','synthesis','challenge'].entries()){
      if(index&&settleMs)await pause(settleMs,undefined,{signal});
      signal.throwIfAborted();if(room.revision!==revision)throw new Error('人的方向变化，诊断已停止');
      const snapshot=structuredClone(hub.snapshot(room,phase)),marker='CACHE_CHECK_'+(index+1);
      snapshot.runtime={...snapshot.runtime,mode:'read',computer:'off'};
      snapshot.feedback=`只读缓存诊断：当前标记 ${marker}；核对最新 phase、revision 与 proposal hash，不执行任务。`;
      const context=prepareCacheContext(task,'DeepSeek',snapshot);
      if(context.text.length>240000)throw new Error('诊断上下文超过 240,000 字符，未发送');
      const call={id:randomUUID(),cacheVersion:1,actor:'DeepSeek',phase:'cache_check',status:'running',started:new Date().toISOString(),model:task.modelProfile?.settings?.deepseek?.model||'',tokens:0,providerId:'',contextCache:context.stats};run.calls.push(call);hub.emit(room);
      const observers={onUsage:usage=>{call.usage=usage;(call.usageEvents||=[]).push(usage);call.tokens+=Number(usage.total_tokens??Number(usage.prompt_tokens||0)+Number(usage.completion_tokens||0));hub.emit(room);},onTrace:(id,metadata)=>{call.providerId=id;if(metadata)Object.assign(call,metadata);},onSuccess:()=>{call.status='success';call.ended=new Date().toISOString();hub.emit(room);},onFailure:err=>{call.status='failed';call.error=String(err.message);call.ended=new Date().toISOString();hub.emit(room);}};
      try{
        let exchange;const raw=await deepseek({task,system,prompt:context.text,contextMessages:context.messages,onExchange:value=>exchange=value,signal,tools:[],beforeRequest:()=>observers});
        const turn=validateTurn(room,'DeepSeek',phase,JSON.parse(raw),snapshot);
        if(!turn.summary.includes(marker)||!turn.summary.includes(phase))throw new Error('诊断回复没有对应最新状态标记与阶段');
        if(turn.proposal||turn.question||turn.objections.length||turn.replies.length||turn.close.length)throw new Error('诊断不得修改原方案或议题');
        if(room.revision!==revision)throw new Error('人的方向变化，诊断结果已过时');
        context.rememberReply(raw,exchange);
        call.stateValidated=true;call.summary=turn.summary;hub.emit(room);
      }catch(err){call.status=signal.aborted?'interrupted':'failed';call.error=String(err.message);call.ended=new Date().toISOString();throw err;}
    }
    run.status='completed';
  }catch(err){run.status=signal.aborted?'interrupted':'failed';run.error=String(err.message);}
  finally{run.ended=new Date().toISOString();run.metrics=cacheSummary(run.calls);hub.emit(room);}
  return run;
}
