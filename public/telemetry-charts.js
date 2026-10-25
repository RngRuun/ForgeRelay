const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n.toLocaleString('zh-CN');
const short=n=>n>=1000000?(n/1000000).toFixed(1)+'m':n>=1000?(n/1000).toFixed(n%1000?1:0)+'k':String(n);
const time=t=>new Date(t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
const date=t=>new Date(t).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'});
const W=280,H=110,L=33,R=9,T=12,B=85;
export function minuteBuckets(calls,count=15){
  const timed=calls.map(c=>({call:c,at:Date.parse(c.started)})).filter(c=>Number.isFinite(c.at));
  if(!timed.length)return {bins:[],anchor:null,untimed:calls.length,total:0};
  const anchor=Math.floor(Math.max(...timed.map(x=>x.at))/60000)*60000,start=anchor-(count-1)*60000;
  const bins=Array.from({length:count},(_,i)=>({minute:start+i*60000,count:0,calls:[]}));
  for(const entry of timed){const i=Math.floor((entry.at-start)/60000);if(i>=0&&i<count){bins[i].count++;bins[i].calls.push(entry.call);}}
  for(const bin of bins)bin.calls.sort((a,b)=>String(a.started).localeCompare(String(b.started)));
  return {bins,anchor,untimed:calls.length-timed.length,total:bins.reduce((n,b)=>n+b.count,0)};
}
// Monotone cubic interpolation: smooth the stroke without inventing peaks or dips.
export function monotonePath(points){
  if(!points.length)return '';if(points.length===1)return `M${points[0][0]},${points[0][1]}`;
  const d=points.slice(1).map((p,i)=>(p[1]-points[i][1])/(p[0]-points[i][0]));
  const m=points.map((_,i)=>i===0?d[0]:i===points.length-1?d.at(-1):d[i-1]*d[i]<=0?0:2*d[i-1]*d[i]/(d[i-1]+d[i]));
  d.forEach((s,i)=>{if(!s){m[i]=m[i+1]=0;return;}const a=m[i]/s,b=m[i+1]/s,len=Math.hypot(a,b);if(len>3){m[i]=3*a*s/len;m[i+1]=3*b*s/len;}});
  let out=`M${points[0][0]},${points[0][1]}`;
  for(let i=0;i<d.length;i++){const p=points[i],q=points[i+1],dx=(q[0]-p[0])/3;out+=`C${p[0]+dx},${p[1]+m[i]*dx} ${q[0]-dx},${q[1]-m[i+1]*dx} ${q[0]},${q[1]}`;}
  return out;
}
const guides=max=>`<path class="trace-grid" d="M${L} ${T}H${W-R}M${L} ${(T+B)/2}H${W-R}M${L} ${B}H${W-R}"/><text class="trace-axis" x="${L-8}" y="${T+4}" text-anchor="end">${short(max)}</text><text class="trace-axis" x="${L-8}" y="${B+4}" text-anchor="end">0</text>`;
const pointAction=(call,label,content)=>`<g class="trace-hit" role="button" tabindex="0" data-telemetry-call="${esc(call.id)}" data-telemetry-room="${esc(call.roomId)}" aria-label="${esc(label)}"><title>${esc(label)}\n点击查看调用记录</title>${content}</g>`;
export function tokenAreaChart(points){
  const known=points.filter(p=>p.tokens!==null),peak=Math.max(0,...known.map(p=>p.tokens));
  const scale=10**Math.max(0,Math.floor(Math.log10(peak||1))-1),max=Math.max(1,Math.ceil(peak/scale)*scale);
  const xy=(p,i)=>[L+(points.length<2?(W-L-R)/2:i*(W-L-R)/(points.length-1)),B-(p.tokens||0)/max*(B-T)];
  const segments=[];let segment=[];points.forEach((p,i)=>{if(p.tokens===null){if(segment.length)segments.push(segment);segment=[];}else segment.push(xy(p,i));});if(segment.length)segments.push(segment);
  return `<section class="telemetry-chart trace-chart" data-reading-anchor="token-usage"><div><span>Token 用量</span><strong>${known.length?fmt(peak):'—'}<small>峰值 tokens</small></strong></div><svg viewBox="0 0 ${W} ${H}" role="group" aria-label="最近 ${points.length} 次请求的 token 用量"><defs><linearGradient id="token-area-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b9ead0" stop-opacity=".2"/><stop offset="1" stop-color="#b9ead0" stop-opacity=".015"/></linearGradient></defs>${guides(max)}${segments.map(s=>{const curve=monotonePath(s);return `${s.length>1?`<path class="trace-area" d="${curve}L${s.at(-1)[0]},${B}L${s[0][0]},${B}Z" fill="url(#token-area-fill)"/>`:''}<path class="trace-line" d="${curve}"/>`;}).join('')}${points.map((p,i)=>{const [x,y]=xy(p,i);if(p.tokens===null)return `<text class="trace-unknown" x="${x}" y="${B-3}" text-anchor="middle">×<title>此请求未返回用量，曲线在这里断开</title></text>`;return pointAction(p,`${p.actor} · 第 ${p.count} 次请求 · ${fmt(p.tokens)} tokens`,`<path class="trace-crosshair" d="M${x} ${T}V${B}"/><circle class="trace-target" cx="${x}" cy="${y}" r="8"/><circle class="trace-dot" cx="${x}" cy="${y}" r="2.5"/>`);}).join('')}${points.length?`<text class="trace-axis" x="${L}" y="104">#${points[0].count}</text><text class="trace-axis" x="${W-R}" y="104" text-anchor="end">#${points.at(-1).count}</text>`:'<text class="trace-empty" x="150" y="53" text-anchor="middle">尚无调用记录</text>'}</svg><p class="trace-caption">最近 ${points.length} 次请求 · 未知用量留空</p></section>`;
}
export function minuteBarChart(calls){
  const value=minuteBuckets(calls),bins=value.bins,max=Math.max(1,...bins.map(b=>b.count)),step=(W-L-R)/(bins.length||15),bw=Math.max(5,step*.56);
  return `<section class="telemetry-chart trace-chart minute-chart" data-reading-anchor="minute-calls"><div><span>每分钟调用</span><strong>${fmt(value.total)}<small>次 / 15 分钟</small></strong></div><svg viewBox="0 0 ${W} ${H}" role="group" aria-label="按真实请求时间聚合的每分钟调用次数">${guides(max)}${bins.map((b,i)=>{const x=L+i*step+(step-bw)/2,h=b.count/max*(B-T),bar=`<rect class="minute-bar ${i===bins.length-1?'is-latest':''}" x="${x}" y="${B-h}" width="${bw}" height="${h}" rx="2"/>`;return b.count?pointAction(b.calls.at(-1),`${date(b.minute)} ${time(b.minute)} · ${b.count} 次请求 · 查看最近一次`,bar):`<path class="minute-zero" d="M${x} ${B}h${bw}"/>`;}).join('')}${bins.length?[0,7,14].map((i,j)=>`<text class="trace-axis" x="${j===0?L:j===2?W-R:L+(W-L-R)/2}" y="104" text-anchor="${j===0?'start':j===2?'end':'middle'}">${time(bins[i].minute)}</text>`).join(''):'<text class="trace-empty" x="150" y="53" text-anchor="middle">尚无调用记录</text>'}</svg><p class="trace-caption">${value.anchor!==null?`截至最后调用 ${date(value.anchor)} ${time(value.anchor)}`:'请求发生后按分钟绘制'}${value.untimed?' · '+value.untimed+' 次未记录时间':''}</p></section>`;
}
