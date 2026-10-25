// Optional native integration. Browser and CLI clients retain the same engine.
let mounted=false;
export function mountDesktop(){
  const desktop=window.forgeDesktop;if(!desktop||mounted)return;mounted=true;
  document.documentElement.dataset.desktop='true';
  function reveal(input){for(let parent=input.parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;}
  function attach(){
    const input=document.querySelector('#room-upload, #pending-upload');
    if(input){reveal(input);input.click();}
    else window.dispatchEvent(new CustomEvent('relay-desktop-notice',{detail:'请先进入三方会谈，再添加图片或文件。'}));
  }
  desktop.onAction(action=>{if(action.type==='attach')attach();});
  function enhance(){
    for(const id of ['new-project','runtime-project']){
      const input=document.getElementById(id);if(!input||input.closest('.desktop-project-picker'))continue;
      const row=document.createElement('div');row.className='desktop-project-picker';input.before(row);row.append(input);
      const button=document.createElement('button');button.type='button';button.className='secondary desktop-folder-button';button.title='从本机选择项目文件夹';
      button.setAttribute('aria-label','选择项目文件夹');
      button.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3V7Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M3 11h18" stroke="currentColor" stroke-width="1.5"/></svg><span>选择文件夹</span>';
      button.addEventListener('click',async()=>{
        button.disabled=true;
        try{const selected=await desktop.chooseProject();if(selected&&input.isConnected){input.value=selected;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.focus({preventScroll:true});}}
        finally{if(button.isConnected)button.disabled=false;}
      });row.append(button);
    }
  }
  enhance();new MutationObserver(enhance).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  // Prevent the desktop shell from navigating to a dropped local file.
  document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});
  document.addEventListener('drop',event=>{
    if(!event.dataTransfer?.files.length)return;event.preventDefault();
    const input=document.querySelector('#room-upload, #pending-upload');
    if(!input){window.dispatchEvent(new CustomEvent('relay-desktop-notice',{detail:'请在三方会谈中添加附件。'}));return;}
    reveal(input);input.files=event.dataTransfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  });
}
