// Runs independently of the module graph so a missing module cannot leave a permanent spinner.
(() => {
  let shown=false;
  function recover(message){
    const placeholder=document.querySelector('#app > .loading, #app > .boot, #app > .lab-loading');
    if(!placeholder||shown)return;
    shown=true;
    const panel=document.createElement('section');panel.className='connection-empty';panel.setAttribute('role','alert');
    const title=document.createElement('h1');title.textContent='页面暂未完成加载';
    const detail=document.createElement('p');detail.textContent=message;
    const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='重新加载';
    retry.addEventListener('click',()=>location.reload());panel.append(title,detail,retry);placeholder.replaceWith(panel);
  }
  window.addEventListener('error',event=>{
    if(event.target instanceof HTMLScriptElement)recover('界面资源加载失败。请重新加载；若仍失败，请退出旧版本并重新解压完整应用。');
  },true);
  window.addEventListener('DOMContentLoaded',()=>setTimeout(()=>recover('本地页面响应超时。可重新加载，或通过帮助菜单重新连接引擎。'),20000),{once:true});
})();
