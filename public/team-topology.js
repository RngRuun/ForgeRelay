import {limitText} from './budget-limits.js';
import {topologyDiagram} from './topology-diagram.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function topologyRoles(c={}){
  return (c.team||[]).map((a,i,list)=>{const angle=-Math.PI/2+i*Math.PI*2/list.length;return {...a,lead:a.id===c.leaderId,x:50+39*Math.cos(angle),y:50+39*Math.sin(angle)};});
}
export function teamTopology(c,{selected='',settings={},icon=()=>''}={}){
  const roles=topologyRoles(c),focus=roles.find(a=>a.id===selected)||roles.find(a=>a.lead)||roles[0];
  const rebellion=focus?settings[focus.provider.toLowerCase()]?.rebellion??50:50;
  return `<div class="team-topology"><header><b>团队拓扑</b><code>${String(roles.length).padStart(2,'0')} / ROLES</code></header>${topologyDiagram(roles,focus,icon)}<div class="topology-role-list">${roles.map(a=>`<button type="button" data-team-role="${esc(a.id)}" aria-pressed="${a.id===focus?.id}" class="${a.id===focus?.id?'selected':''}"><span class="topology-role-dot"></span><span><b>${esc(a.name)}</b><small>${esc(a.provider)}${a.lead?' · 主持人':''}</small></span><em>↗</em></button>`).join('')}</div>${focus?`<div class="topology-focus"><span>当前查看 · ${esc(focus.name)}</span><p>${esc(focus.focus||'尚未填写职责')}</p></div>`:''}${teamControls(c,focus,rebellion)}<p class="topology-help">配置预览 · 点击节点编辑角色，保存启用后用于新会谈。</p></div>`;
}

function teamControls(c,focus,level){
  const glyph=path=>'<svg class="parameter-link-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="'+path+'"/></svg>';
  const arrow='<svg class="parameter-link-arrow" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m4.5 2.5 3.5 3.5-3.5 3.5"/></svg>';
  const row=(action,label,value,icon,attrs='')=>'<button type="button" class="parameter-link" data-topology-action="'+action+'" '+attrs+'>'+glyph(icon)+'<span class="parameter-link-label">'+label+'</span><span class="parameter-link-value">'+value+'</span>'+arrow+'</button>';
  return '<nav class="topology-controls" aria-label="团队参数快捷入口">'+
    row('parameters','叛逆值','<b>'+level+'</b><small>/100</small>','M3 5h14M3 15h14M7 2v6m6 4v6','data-topology-provider="'+esc(focus?.provider||'Codex')+'" title="'+esc(focus?.provider||'Codex')+' 模型参数" aria-label="调整 '+esc(focus?.provider||'Codex')+' 模型参数，叛逆值 '+level+'"')+
    row('debate','互审边界','<b>'+c.minRounds+'–'+limitText(c.maxRounds)+'</b><small>轮</small>','M3 5h11l-3-3m3 3-3 3M17 15H6l3-3m-3 3 3 3','aria-label="设置互审边界，当前 '+c.minRounds+' 至 '+limitText(c.maxRounds)+' 轮"')+
    row('human','高分歧介入','<span class="parameter-state" data-enabled="'+!!c.highDisagreement+'">'+(c.highDisagreement?'已开启':'已关闭')+'</span>','M3 3h14v10H8l-5 4V3m7 3v3m0 2v.5','aria-label="配置高分歧人类介入，当前'+(c.highDisagreement?'已开启':'已关闭')+'"')+'</nav>';
}
