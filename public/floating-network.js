import {curvedConnection} from './floating-geometry.js';
let mounted=false;
export function mountFloatingNetworks(){
  if(mounted)return;mounted=true;
  const scenes=new Set(),known=new WeakSet(),retained=new Map(),reduce=matchMedia('(prefers-reduced-motion: reduce)');
  let raf=0,last=0;
  const moving=()=>!document.hidden&&!reduce.matches&&document.body.dataset.effects!=='off';
  const set=(el,key,value)=>{if(el.getAttribute(key)!==value)el.setAttribute(key,value);};
  function draw(scene,time,dt,animate){
    const positions={};
    scene.nodes.forEach((n,i)=>{
      const frozen=n.el.matches(':hover,:focus-within')||n.el.classList.contains('selected');
      if(!animate){n.dx=0;n.dy=0;}
      else if(!frozen){
        const phase=time*.00028+i*1.7;
        const x=Math.sin(phase)*2.6+scene.pointer.x*(.8+i*.28),y=Math.cos(phase*.83+i)*3.5+scene.pointer.y*(.8+i*.2);
        const ease=1-Math.exp(-dt*5);n.dx+=(x-n.dx)*ease;n.dy+=(y-n.dy)*ease;
      }
      positions[n.id]={x:n.x+n.dx,y:n.y+n.dy,w:n.w,h:n.h};
      set(n.el,'transform',`translate(${(n.x+n.ox+n.dx).toFixed(3)} ${(n.y+n.oy+n.dy).toFixed(3)})`);
      retained.set(scene.key+':'+n.id,{dx:n.dx,dy:n.dy});
    });
    for(const edge of scene.edges){
      const a=positions[edge.from],b=positions[edge.to];if(!a||!b)continue;
      const result=edge.returned?curvedConnection(b,a,{fromSide:edge.toSide,toSide:edge.fromSide,offset:4}):curvedConnection(a,b,{fromSide:edge.fromSide,toSide:edge.toSide});
      if(edge.port){set(edge.el,'cx',result.end.x.toFixed(3));set(edge.el,'cy',result.end.y.toFixed(3));}
      else set(edge.el,'d',result.d);
    }
    scene.el.dataset.motion=animate?'floating':'static';scene.el.dataset.frame=String(++scene.frame);
  }
  function tick(time){
    raf=0;const dt=Math.min((time-last)/1000||.033,.06);if(time-last<31){raf=requestAnimationFrame(tick);return;}last=time;
    let active=false;
    for(const scene of scenes){if(!scene.el.isConnected){scene.observer.unobserve(scene.el);scenes.delete(scene);continue;}if(!scene.visible)continue;const animate=moving();draw(scene,time,dt,animate);active||=animate;}
    if(active)raf=requestAnimationFrame(tick);
  }
  const wake=()=>{if(!raf)raf=requestAnimationFrame(tick);};
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){const scene=[...scenes].find(s=>s.el===entry.target);if(scene)scene.visible=entry.isIntersecting;}wake();});
  function scan(){
    for(const el of document.querySelectorAll('[data-floating-network]')){
      if(known.has(el))continue;known.add(el);
      const key=el.dataset.floatingNetwork;
      const nodes=[...el.querySelectorAll('[data-float-node]')].map(n=>({el:n,id:n.dataset.floatNode,x:Number(n.dataset.baseX),y:Number(n.dataset.baseY),w:Number(n.dataset.width),h:Number(n.dataset.height),ox:Number(n.dataset.originX)||0,oy:Number(n.dataset.originY)||0,...(retained.get(key+':'+n.dataset.floatNode)||{dx:0,dy:0})}));
      const edges=[...el.querySelectorAll('[data-float-edge],[data-float-port]')].map(n=>({el:n,from:n.dataset.from,to:n.dataset.to,fromSide:n.dataset.sourceSide,toSide:n.dataset.targetSide,returned:n.dataset.floatEdge==='return',port:n.hasAttribute('data-float-port')}));
      const scene={el,key,nodes,edges,visible:true,pointer:{x:0,y:0},observer,frame:0};scenes.add(scene);observer.observe(el);
      const pointerHost=el.closest('.topology-stage')||el;
      pointerHost.addEventListener('pointermove',event=>{if(event.pointerType==='touch')return;const r=el.getBoundingClientRect();scene.pointer={x:Math.max(-1,Math.min(1,(event.clientX-r.left)/r.width*2-1)),y:Math.max(-1,Math.min(1,(event.clientY-r.top)/r.height*2-1))};wake();},{passive:true});
      pointerHost.addEventListener('pointerleave',()=>{scene.pointer={x:0,y:0};wake();});
      draw(scene,performance.now(),0,moving());
    }wake();
  }
  new MutationObserver(scan).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',wake);document.addEventListener('relay-effects-change',wake);reduce.addEventListener('change',wake);scan();
}
