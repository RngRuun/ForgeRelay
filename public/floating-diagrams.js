import {curvedConnection} from './floating-geometry.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(x,y,value,cls='',anchor='start')=>`<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${esc(value)}</text>`;
const pose=n=>`data-float-node="${esc(n.id)}" data-base-x="${n.x}" data-base-y="${n.y}" data-width="${n.w}" data-height="${n.h}" data-origin-x="${n.ox||0}" data-origin-y="${n.oy||0}" transform="translate(${n.x+(n.ox||0)} ${n.y+(n.oy||0)})"`;
export function networkSceneLayout(leader='Codex',compact=false,providers=['Codex','DeepSeek']){
  const follower=leader==='DeepSeek'?'Codex':'DeepSeek';
  const nodes=compact?[
    {id:'human',x:12,y:14,w:110,h:32},{id:leader,actor:leader,x:168,y:36,w:138,h:62},
    {id:follower,actor:follower,x:12,y:204,w:138,h:62},{id:'context',x:140,y:132,w:166,h:52}
  ]:[
    {id:'human',x:18,y:34,w:102,h:38},{id:leader,actor:leader,x:190,y:18,w:175,h:64},
    {id:follower,actor:follower,x:414,y:167,w:175,h:64},{id:'context',x:46,y:153,w:180,h:64}
  ];
  if(providers.length===1){
    const selected=nodes.filter(n=>!n.actor||providers.includes(n.actor)),model=selected.find(n=>n.actor);
    if(model){model.x=compact?168:305;model.y=compact?44:53;}
    return {width:compact?320:620,height:compact?250:270,nodes:selected,edges:[{from:'human',to:leader,activity:leader,fromSide:'right',toSide:'left'},{from:leader,to:'context',activity:'context',fromSide:'bottom',toSide:'right'}]};
  }
  return {width:compact?320:620,height:compact?286:270,nodes,edges:[
    {from:'human',to:leader,activity:leader,fromSide:'right',toSide:'left'},
    {from:leader,to:follower,activity:follower,...(compact?{fromSide:'left',toSide:'top'}:{})},
    {from:leader,to:'context',activity:'context',fromSide:'bottom',toSide:'top'}
  ]};
}
export function topologySceneLayout(roles){
  const leader=roles.find(a=>a.lead)||roles[0];if(!leader)return {width:200,height:230,nodes:[],edges:[]};
  const ordered=[leader,...roles.filter(a=>a.id!==leader.id)];
  const slots=[[102,37],[35,128],[162,161],[74,211],[169,65]];
  const nodes=ordered.map((a,i)=>({...a,x:slots[i][0]-24,y:slots[i][1]-21,w:48,h:42,ox:24,oy:21}));
  return {width:200,height:roles.length>3?270:230,nodes,edges:nodes.slice(1).map(a=>({from:leader.id,to:a.id}))};
}
function wires(scene,{kind='network',focus='',live=()=>false}={}){
  const nodes=Object.fromEntries(scene.nodes.map(n=>[n.id,n]));
  return scene.edges.map(e=>{
    const attrs=`data-from="${esc(e.from)}" data-to="${esc(e.to)}" data-source-side="${e.fromSide||''}" data-target-side="${e.toSide||''}"`;
    const forward=curvedConnection(nodes[e.from],nodes[e.to],e),back=curvedConnection(nodes[e.to],nodes[e.from],{fromSide:e.toSide,toSide:e.fromSide,offset:4});
    const selected=e.from===focus||e.to===focus,active=live(e);
    return `<path class="${kind==='network'?'network-wire':'topology-wire'+(selected?' selected':'')}" data-float-edge="request" ${attrs} d="${forward.d}"/><path class="${kind==='network'?'network-return':'topology-feedback'}" data-float-edge="return" ${attrs} d="${back.d}"/>${kind==='network'?`<path class="network-packet" data-float-edge="request" ${attrs} data-live="${active}" d="${forward.d}"/>`:''}<circle class="${kind==='network'?'network-port':'topology-port'}" data-float-port ${attrs} cx="${forward.end.x}" cy="${forward.end.y}" r="${kind==='network'?2.2:1.5}" data-live="${active}"/>`;
  }).join('');
}
export function networkDiagram(t,compact,icon){
  const scene=networkSceneLayout(t.leaderProvider||'Codex',compact,t.activeProviders),suffix=compact?'compact':'wide';
  const model=n=>{const p=t.providers[n.actor],status=p.active?p.phase||'调用中':p.latest?p.latest.status==='success'?'上次成功':p.latest.status==='failed'?'上次失败':'调用结束':'等待调用';return `<g class="network-model" ${pose(n)} role="button" tabindex="0" data-telemetry-provider="${n.actor}" data-live="${p.active>0}" aria-label="查看 ${n.actor} 调用记录"><title>${esc(n.actor+' · '+status+' · '+p.calls+' 次实际调用')}</title><rect class="network-model-glass" width="${n.w}" height="${n.h}" rx="10" fill="url(#network-surface-${suffix})"/>${icon(n.actor).replace('<svg','<svg x="12" y="11" width="22" height="22"')}${text(44,26,n.actor,'network-brand')}<circle class="network-state-dot" cx="15" cy="47" r="2"/>${text(24,51,status,'network-state')}${text(n.w-12,51,p.active?'实时':p.calls+' 次','network-count','end')}</g>`;};
  const node=n=>n.actor?model(n):n.id==='human'?`<g class="network-human" ${pose(n)} data-waiting="${t.waiting>0}"><rect width="${n.w}" height="${n.h}" rx="9"/>${text(n.w/2,n.h/2+4,'人类目标','network-human-label','middle')}</g>`:`<g class="network-context-panel" ${pose(n)} data-live="${t.tools>0}"><rect width="${n.w}" height="${n.h}" rx="10" fill="url(#network-surface-${suffix})"/><g class="network-layers" transform="translate(27 ${n.h/2-2})"><path d="m0-11 13 7-13 7-13-7 13-7ZM-13 3 0 10 13 3M-13 10 0 17l13-7"/></g>${text(51,n.h/2-3,'共享上下文','network-context')}${text(51,n.h/2+15,'方案 · 证据 · 文件','network-caption')}</g>`;
  return `<div class="telemetry-flow network-figure ${compact?'network-compact':'network-wide'}" data-live="${t.live.length>0}"><div class="flow-graticule" aria-hidden="true"></div><svg class="network-canvas floating-diagram" viewBox="0 0 ${scene.width} ${scene.height}" data-floating-network="routing-${suffix}" role="group" aria-label="模型协作网络"><defs><linearGradient id="network-surface-${suffix}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#b9ddcb" stop-opacity=".065"/><stop offset="1" stop-color="#17352a" stop-opacity=".06"/></linearGradient></defs>${wires(scene,{live:e=>e.activity==='context'?t.tools>0:t.providers[e.activity]?.active>0})}${scene.nodes.map(node).join('')}</svg></div>`;
}
export function topologyDiagram(roles,focus,icon){
  const scene=topologySceneLayout(roles);
  return `<div class="topology-stage topology-rack topology-organic" data-count="${roles.length}" aria-label="协商角色与独立互审回路"><relay-sculpture compact aria-hidden="true"></relay-sculpture><svg class="topology-routing floating-diagram" viewBox="0 0 ${scene.width} ${scene.height}" data-floating-network="team-${roles.map(a=>esc(a.id)).join('-')}" role="group" aria-label="选择角色编辑职责">${wires(scene,{kind:'topology',focus:focus?.id})}${scene.nodes.map(a=>`<g class="topology-card ${a.id===focus?.id?'selected':''}" ${pose(a)} data-team-role="${esc(a.id)}" role="button" tabindex="0" aria-label="编辑角色：${esc(a.name)}，${esc(a.provider)}${a.lead?'，主持人':''}"><title>${esc(a.name)} · ${esc(a.provider)}${a.lead?' · 主持人':''}</title><rect class="topology-card-glass" x="-24" y="-21" width="48" height="42" rx="9"/>${icon(a.provider).replace('<svg','<svg x="-12" y="-12" width="24" height="24"')}${a.lead?'<circle class="topology-leader-mark" cx="20" cy="-17" r="2"/>':''}</g>`).join('')}<g class="topology-loop-caption"><text x="100" y="${scene.height-9}" text-anchor="middle">独立互审回路</text></g></svg></div>`;
}
