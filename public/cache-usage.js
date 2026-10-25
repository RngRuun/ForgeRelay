// Only provider-reported token counters count as cache hits. Missing is unknown, not zero.
const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function normalizeCacheUsage(usage={}){
  const input=usage.input_tokens??usage.prompt_tokens;
  const cached=usage.prompt_cache_hit_tokens??usage.cached_input_tokens??usage.input_tokens_details?.cached_tokens??usage.prompt_tokens_details?.cached_tokens;
  const miss=usage.prompt_cache_miss_tokens;
  const issues=[];
  if(!valid(input))issues.push('missing-input');
  if(!valid(cached))issues.push('missing-cache');
  if(valid(input)&&valid(cached)&&cached>input)issues.push('cache-exceeds-input');
  if(miss!==undefined&&(!valid(miss)||valid(input)&&valid(cached)&&miss+cached!==input))issues.push('inconsistent-miss');
  const known=issues.length===0;
  return {known,input:valid(input)?input:null,cached:known?cached:null,uncached:known?input-cached:null,ratio:known&&input>0?cached/input:null,issues};
}
export function callCacheUsage(call){
  const events=call.usageEvents?.length?call.usageEvents:[call.usage||{input_tokens:call.inputTokens}];
  const samples=events.map(normalizeCacheUsage),known=samples.every(s=>s.known);
  const input=samples.every(s=>s.input!==null)?samples.reduce((n,s)=>n+s.input,0):null;
  const cached=known?samples.reduce((n,s)=>n+s.cached,0):null;
  return {known,input,cached,uncached:known?input-cached:null,ratio:known&&input>0?cached/input:null,issues:[...new Set(samples.flatMap(s=>s.issues))]};
}
export function cacheSummary(calls=[]){
  const summarize=list=>{
    const samples=list.map(callCacheUsage),measured=samples.filter(s=>s.known);
    const input=measured.reduce((n,s)=>n+s.input,0),cached=measured.reduce((n,s)=>n+s.cached,0);
    return {calls:list.length,measuredCalls:measured.length,unknownCalls:samples.length-measured.length,reportedInput:samples.reduce((n,s)=>n+(s.input||0),0),input,cached,uncached:input-cached,ratio:input>0?cached/input:null,complete:samples.length===measured.length,targetMet:input>0&&samples.length===measured.length?cached/input>=.99:null};
  };
  const groups=list=>({ ...summarize(list),actors:Object.fromEntries(['Codex','DeepSeek'].map(actor=>[actor,summarize(list.filter(c=>c.actor===actor))])) });
  return {target:.99,definition:'provider-cached-input / provider-input; token-weighted; includes cold starts',...groups(calls),optimized:groups(calls.filter(c=>c.cacheVersion===1))};
}
export const cachePercent=value=>value===null||value===undefined?'待返回':(value*100).toFixed(2)+'%';
export function cacheTrend(calls=[],actor){
  const recent=calls.filter(c=>c.actor===actor).slice(-5);
  const summary=cacheSummary(recent),latest=recent.findLast(c=>c.status!=='running')||recent.at(-1);
  return {recent:summary,latest:latest?{usage:callCacheUsage(latest),context:latest.contextCache||null,continuation:!!latest.continuationOf}:null};
}
export function cacheOverview(calls){
  const summary=cacheSummary(calls),status={running:'调用中',success:'调用成功',succeeded:'调用成功',cancelled:'调用已取消',failed:'调用失败',interrupted:'调用中断'};
  return `<section class="cache-summary" aria-label="API 上下文缓存"><div class="cache-heading"><b>上下文缓存命中率</b></div><div class="cache-actors">${['Codex','DeepSeek'].map(actor=>{const value=summary.actors[actor],latest=calls.findLast(c=>c.actor===actor);return `<div><span>${actor}</span><strong>${cachePercent(value.ratio)}</strong><small>${latest?status[latest.status]||'已记录调用':'尚无调用'}${value.unknownCalls?' · '+value.unknownCalls+' 次计量未返回':''}</small></div>`;}).join('')}</div></section>`;
}
export function cacheCallDetail(call){
  const value=callCacheUsage(call);
  return `<p class="cache-call-detail">缓存命中 ${cachePercent(value.ratio)}${value.known?'':' · 计量未返回'}</p>`;
}
