'use strict';
const {app, BrowserWindow, Menu, Tray, dialog, ipcMain, shell, nativeTheme, protocol, net, screen, safeStorage, session} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {randomUUID} = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {desktopConfig, engineCompatible, navigationAllowed, downloadAllowed, externalURL, activeItems, windowBounds} = require('./policy.cjs');
const {createCredentialStore}=require('./credentials.cjs');

protocol.registerSchemesAsPrivileged([{scheme:'forgerelay', privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
app.setPath('userData', process.env.FORGERELAY_DESKTOP_HOME ? path.resolve(process.env.FORGERELAY_DESKTOP_HOME) : path.join(app.getPath('appData'),'ForgeRelay'));
app.setAppUserModelId('com.forgerelay.desktop');
const locked = app.requestSingleInstanceLock();
if (!locked) { app.quit(); } else {
  let window, tray, engine, config, origin, engineId, connecting, quitting = false, closing = false, ready = false;
  let phase = {state:'connecting', message:'正在连接本地协作引擎…'};
  const resources = app.isPackaged ? process.resourcesPath : __dirname;
  const engineRoot = app.isPackaged ? path.join(resources,'engine') : path.resolve(__dirname,'..');
  const networkPolicy=require(path.join(engineRoot,'network-policy.cjs'));
  const credentials=createCredentialStore(app.getPath('userData'),safeStorage);
  let keyState={key:'',saved:false},encryptionAvailable=false,detectedProxy='';
  const icon = path.join(__dirname,'assets','forgerelay.ico');
  const startup = 'forgerelay://desktop/';
  const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
  const log = event => {
    try { fs.appendFileSync(path.join(app.getPath('userData'),'desktop.log'),JSON.stringify({at:new Date().toISOString(),event})+'\n'); } catch {}
  };
  function show() { if(quitting)return;if (!window || window.isDestroyed()) createWindow(); if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
  function trusted(event) {
    return window && !window.isDestroyed() && !window.webContents.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame &&
      (navigationAllowed(event.senderFrame.url, origin) || event.senderFrame.url === startup);
  }
  function handle(channel, fn) { ipcMain.handle(channel, async event => { if (!trusted(event)) throw new Error('此页面无权调用桌面功能'); return fn(); }); }
  async function request(route, options = {}) {
    const response = await fetch(origin+route,{...options,signal:AbortSignal.timeout(2500)});
    if (!response.ok) throw new Error('本地服务暂不可用');
    return response.json();
  }
  async function health() { try { const h=await request('/api/health'); return h.app==='relay-workbench' ? h : null; } catch { return null; } }
  function updatePhase(state,message) { phase={state,message};if(!quitting&&window&&!window.isDestroyed()&&!window.webContents.isDestroyed())window.webContents.send('desktop:action',{type:'connection',...phase}); }
  async function loadWindow(url){const target=window;if(quitting||!target||target.isDestroyed())return false;try{await target.loadURL(url);return !quitting&&!target.isDestroyed();}catch(error){if(quitting||target.isDestroyed()||error.code==='ERR_ABORTED'||error.errno===-3)return false;updatePhase('failed','页面暂时无法加载，可重新连接引擎');log('window:load-failed');return false;}}
  async function attach() {
    if (connecting) return connecting;
    connecting = (async () => {
      ready=false; updatePhase('connecting','正在连接本地协作引擎…');
      let info=await health();
      if(quitting||!window||window.isDestroyed())return{ok:false,cancelled:true};
      if(info&&!engineCompatible(info,app.getVersion()))throw Error('检测到旧版本或不兼容的后台（'+String(info.version||'未知版本')+'）。请从系统托盘退出旧版应用，或停止旧 CLI 服务，再点击重新连接。记录会保留，不会自动终止其他后台。');
      if (info && !engine) { log('engine:attached-external'); }
      else if (!engine) {
        const bundled = path.join(resources,'runtime','node.exe');
        if (!fs.existsSync(bundled)) throw new Error('缺少内置运行环境，请重新解压完整应用');
        fs.mkdirSync(config.dataDir,{recursive:true});
        engineId=randomUUID();
        engine=spawn(bundled,[path.join(engineRoot,'server.mjs')],{
          cwd:engineRoot,windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],
          env:{...process.env,DEEPSEEK_API_KEY:process.env.DEEPSEEK_API_KEY||keyState.key,FORGERELAY_KEY_SOURCE:process.env.DEEPSEEK_API_KEY?'environment':keyState.key?'encrypted':'none',FORGERELAY_KEY_SAVED:keyState.saved?'1':'0',FORGERELAY_CREDENTIAL_STORE:encryptionAvailable?'available':'unavailable',FORGERELAY_CREDENTIAL_NOTICE:keyState.error||'',FORGERELAY_SYSTEM_PROXY:detectedProxy,PORT:String(config.port),RELAY_DATA_DIR:config.dataDir,FORGERELAY_DESKTOP_MANAGED:'1',FORGERELAY_ENGINE_ID:engineId}
        });
        const child=engine;
        child.on('message',async message=>{
          if(child!==engine||message?.channel!=='forgerelay-private-v1'||typeof message.id!=='string')return;
          let result,error;
          try{
            if(message.method==='credential:save'){result=await credentials.save(message.payload?.key);keyState=await credentials.load();}
            else if(message.method==='credential:clear'){result=await credentials.clear();keyState={key:'',saved:false};}
            else if(message.method==='network:system'){const resolved=await session.defaultSession.resolveProxy('https://chatgpt.com/');detectedProxy=networkPolicy.systemProxy(resolved);result={proxy:detectedProxy};}
            else throw Error('不支持的桌面请求');
          }catch{error='桌面加密存储或系统代理操作失败；未使用明文存储回退。';}
          if(child===engine&&child.connected)child.send({channel:'forgerelay-private-v1',replyTo:message.id,result,error},()=>{});
        });
        child.once('error',()=>{if(engine===child)engine=null; updatePhase('failed','协作引擎无法启动，请检查数据目录和运行环境');log('engine:spawn-error');});
        child.once('exit',()=>{
          if(engine===child)engine=null;
          if(!quitting) { ready=false; updatePhase('failed','本地协作引擎已退出。可重新连接；任务不会自动启动。'); void loadWindow(startup); }
          log('engine:exit');
        });
        log('engine:started-owned');
        for(let i=0;i<80;i++) {
          if(!engine) break;
          info=await health();
          if(quitting||!window||window.isDestroyed())return{ok:false,cancelled:true};
          if(info?.desktopEngineId===engineId) break;
          info=null; await delay(250);
        }
        if(!info) throw new Error('协作引擎启动超时，或本地端口被其他程序占用');
      }
      if(!info) throw new Error('本地协作引擎暂不可用');
      if(!engineCompatible(info,app.getVersion()))throw Error('本地引擎与桌面版本不一致，请重新解压完整更新包。');
      ready=true; updatePhase('ready','本地引擎已连接');
      if(!await loadWindow(origin+'/discussion?new=1'))return{ok:false,cancelled:quitting};
      log('window:ready');
      return {ok:true};
    })().catch(error=>{updatePhase('failed',error.message);log('engine:connect-failed');return {ok:false};}).finally(()=>{connecting=null;});
    return connecting;
  }
  async function stopOwned() {
    const child=engine;
    if (!child) return;
    try {
      const state=await request('/api/state');
      await request('/api/shutdown',{method:'POST',headers:{'X-Relay-Token':state.token,'Content-Type':'application/json'},body:'{}'});
    } catch {}
    for(let i=0;i<70 && engine===child;i++) await delay(100);
    if(engine===child) { child.kill(); await delay(250); }
  }
  async function quit() {
    if (closing || quitting) return;
    closing=true;
    if(engine && ready) {
      let work;
      try { work=await request('/api/navigation'); }
      catch { work=null; }
      if(!work || activeItems(work).length) {
        const choice=await dialog.showMessageBox(window,{
          type:'question',title:'ForgeRelay',message:work?'协作任务尚未结束':'暂时无法确认后台任务状态',
          detail:'可以保留在系统托盘继续工作。选择停止并退出会终止当前执行，已保存的记录与文件会保留。',
          buttons:['保留后台继续','停止并退出','取消'],defaultId:0,cancelId:2,noLink:true
        });
        if(choice.response===0){window.hide();closing=false;return;}
        if(choice.response===2){closing=false;return;}
      }
    }
    quitting=true; await stopOwned(); log('app:quit'); app.quit();
  }
  function navigate(route) { show(); if(ready) void loadWindow(origin+route); }
  function menus() {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label:'文件',submenu:[
        {label:'新建三方会谈',accelerator:'CmdOrCtrl+N',click:()=>navigate('/discussion?new=1')},
        {label:'添加图片或文件…',accelerator:'CmdOrCtrl+O',click:()=>{show();window.webContents.send('desktop:action',{type:'attach'});}},
        {type:'separator'},{label:'打开数据目录',click:()=>shell.openPath(config.dataDir)},
        {type:'separator'},{label:'隐藏到系统托盘',click:()=>window.hide()},
        {label:'退出 ForgeRelay',accelerator:'Alt+F4',click:()=>void quit()}
      ]},
      {label:'编辑',submenu:[{role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}]},
      {label:'工作空间',submenu:[
        {label:'三方会谈',accelerator:'CmdOrCtrl+1',click:()=>navigate('/discussion')},
        {label:'任务控制',accelerator:'CmdOrCtrl+2',click:()=>navigate('/workbench#control')},
        {label:'模型实验室',accelerator:'CmdOrCtrl+3',click:()=>navigate('/models')},
        {label:'模型接入',click:()=>navigate('/workbench#settings')}
      ]},
      {label:'视图',submenu:[{role:'reload',label:'重新载入'},{type:'separator'},{role:'resetZoom',label:'实际大小'},{role:'zoomIn',label:'放大'},{role:'zoomOut',label:'缩小'},{type:'separator'},{role:'togglefullscreen',label:'全屏'}]},
      {label:'帮助',submenu:[
        {label:'重新连接引擎',click:()=>{show();void attach();}},
        {label:'关于 ForgeRelay',click:()=>dialog.showMessageBox(window,{type:'info',title:'关于 ForgeRelay',message:'ForgeRelay '+app.getVersion(),detail:'本地智能体协作桌面应用\n三方会谈 · 任务控制 · 模型实验室\n'+(engine?'协作引擎由应用管理':'已连接本机现有协作引擎')+'\n会话、任务和模型配置保存在本机。',buttons:['确定']})}
      ]}
    ]));
  }
  function createWindow() {
    let saved={};try{saved=JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'window.json'),'utf8'));}catch{}
    window=new BrowserWindow({
      ...windowBounds(saved,screen.getPrimaryDisplay().workArea),minWidth:960,minHeight:680,
      title:'ForgeRelay',backgroundColor:'#111817',icon,show:false,
      webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,webviewTag:false,spellcheck:false}
    });
    window.once('ready-to-show',()=>window.show());
    window.on('close',event=>{if(!quitting){event.preventDefault();void quit();}});
    window.on('resize',saveBounds);window.on('move',saveBounds);
    const wc=window.webContents;
    wc.on('will-attach-webview',event=>event.preventDefault());
    const navigation=(event,url)=>{if(!navigationAllowed(url,origin)&&url!==startup){event.preventDefault();const safe=externalURL(url);if(safe)void shell.openExternal(safe);}};
    wc.on('will-navigate',navigation);wc.on('will-redirect',navigation);
    wc.setWindowOpenHandler(({url})=>{
      if(downloadAllowed(url,origin)) wc.downloadURL(url);
      else if(navigationAllowed(url,origin))void loadWindow(url);
      else {const safe=externalURL(url);if(safe)void shell.openExternal(safe);}
      return {action:'deny'};
    });
    wc.on('will-prevent-unload',event=>{ /* Preserve the renderer's unsaved-input protection. */ });
    wc.on('did-fail-load',(_event,code,_description,url,isMainFrame)=>{
      if(isMainFrame&&code!==-3&&url!==startup&&!quitting){ready=false;updatePhase('failed','页面连接中断，请重新连接本地引擎');void loadWindow(startup);}
    });
    void loadWindow(startup);
  }
  function saveBounds() {
    if(!window || window.isDestroyed() || window.isMinimized() || window.isMaximized() || window.isFullScreen()) return;
    try{fs.writeFileSync(path.join(app.getPath('userData'),'window.json'),JSON.stringify(window.getBounds()));}catch{}
  }
  app.on('second-instance',()=>show());
  app.on('before-quit',event=>{if(!quitting){event.preventDefault();void quit();}});
  app.on('window-all-closed',()=>{if(quitting)app.quit();});
  app.whenReady().then(async()=>{
    fs.mkdirSync(app.getPath('userData'),{recursive:true});
    encryptionAvailable=await credentials.available();keyState=await credentials.load();
    try{detectedProxy=networkPolicy.systemProxy(await session.defaultSession.resolveProxy('https://chatgpt.com/'));}catch{detectedProxy='';}
    nativeTheme.themeSource='dark';
    const sidecar=process.env.FORGERELAY_DESKTOP_CONFIG || path.join(process.env.PORTABLE_EXECUTABLE_DIR || (app.isPackaged?path.dirname(process.execPath):__dirname),'ForgeRelay.config.json');
    let input={};try{input=JSON.parse(fs.readFileSync(sidecar,'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('ForgeRelay.config.json 无法读取，请检查 JSON 格式');}
    config=desktopConfig(input,app.isPackaged?path.join(app.getPath('userData'),'data'):path.join(engineRoot,'data'));
    origin='http://127.0.0.1:'+config.port;
    protocol.handle('forgerelay',request=>{
      const url=new URL(request.url),files={'/':'bootstrap.html','/bootstrap.css':'bootstrap.css','/bootstrap.js':'bootstrap.js','/icon.png':'assets/forgerelay.png'};
      if(url.hostname!=='desktop'||!files[url.pathname])return new Response('Not found',{status:404});
      return net.fetch(pathToFileURL(path.join(__dirname,files[url.pathname])).href);
    });
    handle('desktop:connection',()=>({...phase,version:app.getVersion(),managed:!!engine}));
    handle('desktop:retry',()=>attach());
    handle('desktop:show-data',()=>shell.openPath(config.dataDir));
    let picking=false;
    handle('desktop:choose-project',async()=>{
      if(picking)return null;picking=true;
      try {const result=await dialog.showOpenDialog(window,{title:'选择协作项目',buttonLabel:'选择项目',properties:['openDirectory','dontAddToRecent']});return result.canceled?null:result.filePaths[0]||null;}
      finally{picking=false;}
    });
    createWindow();menus();
    const ses=window.webContents.session;
    ses.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    ses.setPermissionCheckHandler(()=>false);
    ses.on('will-download',(_event,item)=>{item.setSaveDialogOptions({title:'保存 ForgeRelay 文件'});});
    tray=new Tray(icon);tray.setToolTip('ForgeRelay · 本地协作');
    tray.setContextMenu(Menu.buildFromTemplate([{label:'打开 ForgeRelay',click:show},{label:'三方会谈',click:()=>navigate('/discussion')},{label:'任务控制',click:()=>navigate('/workbench#control')},{type:'separator'},{label:'退出',click:()=>void quit()}]));
    tray.on('double-click',show);
    log('app:started');await attach();
  }).catch(error=>{if(quitting)return;dialog.showErrorBox('ForgeRelay 无法启动',error.message);quitting=true;app.quit();});
}
