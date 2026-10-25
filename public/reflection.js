let mounted=false;
export function mountReflections(){
  if(mounted)return;mounted=true;
  function prepare(event){
    if(document.body.dataset.effects==='off'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const control=event.target.closest('button,.execution-entry,.global-nav-link,.global-context-link,.profile-menu>summary,.room-menu>summary');
    if(!control||control.disabled||control.matches('[role=switch],.toggle-switch,.effects-toggle,.chart-hit,.workspace-list-backdrop')||control.querySelector(':scope > .button-reflection'))return;
    // Only static controls need an anchor. Existing absolute/fixed/sticky layouts stay intact.
    if(getComputedStyle(control).position==='static')control.classList.add('reflection-anchor');
    const surface=document.createElement('span');surface.className='button-reflection';surface.setAttribute('aria-hidden','true');control.classList.add('reflective-control');control.append(surface);
  }
  document.addEventListener('pointerover',prepare,{passive:true});document.addEventListener('focusin',prepare);
}
