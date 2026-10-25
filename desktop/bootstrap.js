'use strict';
const message=document.getElementById('message'),retry=document.getElementById('retry'),progress=document.getElementById('progress');
function render(state){message.textContent=state.message;retry.hidden=state.state!=='failed';progress.hidden=state.state==='failed';if(state.version)document.getElementById('version').textContent='v'+state.version;}
window.forgeDesktop.onAction(action=>{if(action.type==='connection')render(action);});
window.forgeDesktop.connection().then(render);
retry.addEventListener('click',()=>{retry.hidden=true;window.forgeDesktop.retry();});
