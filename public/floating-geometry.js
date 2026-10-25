const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const round=n=>Math.round(n*1000)/1000;
export function cardPort(rect,toward,side='',offset=0){
  const cx=rect.x+rect.w/2,cy=rect.y+rect.h/2,dx=toward.x+toward.w/2-cx,dy=toward.y+toward.h/2-cy;
  if(!side)side=Math.abs(dx)/(rect.w/2)>Math.abs(dy)/(rect.h/2)?dx>=0?'right':'left':dy>=0?'bottom':'top';
  if(side==='left'||side==='right')return {x:rect.x+(side==='right'?rect.w:0),y:clamp(cy+offset,rect.y+9,rect.y+rect.h-9),nx:side==='right'?1:-1,ny:0};
  return {x:clamp(cx+offset,rect.x+9,rect.x+rect.w-9),y:rect.y+(side==='bottom'?rect.h:0),nx:0,ny:side==='bottom'?1:-1};
}
export function curvedConnection(from,to,{fromSide='',toSide='',offset=0}={}){
  const a=cardPort(from,to,fromSide,offset),b=cardPort(to,from,toSide,offset);
  const reach=clamp(Math.hypot(b.x-a.x,b.y-a.y)*.42,16,96);
  const d=`M${round(a.x)} ${round(a.y)}C${round(a.x+a.nx*reach)} ${round(a.y+a.ny*reach)} ${round(b.x+b.nx*reach)} ${round(b.y+b.ny*reach)} ${round(b.x)} ${round(b.y)}`;
  return {d,start:a,end:b};
}
