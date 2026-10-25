export const ROOM_SECTIONS=[
  {id:'conversation',name:'对话现场',help:'发言与人的目标',panel:'proposal'},
  {id:'deliberation',name:'方案审议',help:'方案、分歧与复盘',panel:'proposal'},
  {id:'execution',name:'任务控制',help:'执行与派工',panel:'workbench'},
  {id:'resources',name:'附件与环境',help:'项目、文件与工具',panel:'runtime'},
  {id:'metrics',name:'调用与数据',help:'记录、缓存与图表',panel:'calls'}
];
export function roomSectionFor(panel){return panel==='calls'?'metrics':panel==='runtime'?'resources':['workbench','tasks'].includes(panel)?'execution':'deliberation';}
export function roomPageSelection(search){const params=new URLSearchParams(search),section=params.get('section'),panel=params.get('panel');if(params.get('new')==='1')return{section:'conversation',panel:'proposal'};return {section:ROOM_SECTIONS.some(s=>s.id===section)?section:panel?roomSectionFor(panel):'conversation',panel:['proposal','review','signals','objections','workbench','tasks','runtime','calls'].includes(panel)?panel:'proposal'};}
export function roomSectionNavigation(section){return '<nav class="page-section-nav" aria-label="会谈分区">'+ROOM_SECTIONS.map(s=>'<button type="button" data-room-section="'+s.id+'" id="room-section-'+s.id+'" title="'+s.help+'" class="'+(section===s.id?'is-current':'')+'" aria-current="'+(section===s.id?'page':'false')+'"><b>'+s.name+'</b><small>'+s.help+'</small></button>').join('')+'</nav>';}
