import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import policy from '../network-policy.cjs';

const root=fileURLToPath(new URL('../',import.meta.url)),desktop=path.join(root,'desktop');
const readJSON=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function run(file,args,options={}){
  const result=spawnSync(file,args,{cwd:root,windowsHide:true,stdio:'inherit',...options});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(`依赖准备失败（退出码 ${result.status}）。检查网络后再次打开；已下载的文件会复用。`);
}
function npmCLI(){
  const found=spawnSync('where.exe',['npm.cmd'],{encoding:'utf8',windowsHide:true});
  const candidates=[path.dirname(process.execPath),...(found.stdout||'').trim().split(/\r?\n/).filter(Boolean).map(file=>path.dirname(file))];
  const cli=candidates.map(dir=>path.join(dir,'node_modules/npm/bin/npm-cli.js')).find(file=>fs.existsSync(file));
  if(!cli)throw Error('未找到 npm。请安装包含 npm 的 Node.js 22.19 或更新版本，再打开应用。');
  return cli;
}
function prepareEnvironment(){
  // Resolve the same explicit/system proxy as the engine, before Undici is installed.
  let detected='';
  const command="$p=Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';if($p.ProxyEnable -eq 1){[pscustomobject]@{proxy=$p.ProxyServer}|ConvertTo-Json -Compress}";
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:4000});
  try{
    const raw=JSON.parse(result.stdout).proxy;
    const entry=raw.includes('=')?(raw.split(';').find(item=>item.startsWith('https='))||raw.split(';').find(item=>item.startsWith('http='))||'').split('=').slice(1).join('='):raw;
    detected=policy.proxyURL(entry);
  }catch{}
  const env=policy.proxyEnvironment(process.env,{},detected).env;
  for(const key of ['DEEPSEEK_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','ELECTRON_RUN_AS_NODE','ELECTRON_SKIP_BINARY_DOWNLOAD'])delete env[key];
  env.ELECTRON_GET_USE_PROXY='1';
  return env;
}

try{
  if(process.platform!=='win32')throw Error('此桌面启动入口用于 Windows；其他平台可运行 npm start 或 npm run chat。');
  const [major,minor]=process.versions.node.split('.').map(Number);
  if(major<22||major===22&&minor<19)throw Error('请使用 Node.js 22.19 或更新版本。免安装版不需要安装 Node.js。');
  if(process.argv.slice(2).some(arg=>arg!=='--prepare-only'))throw Error('仅支持 --prepare-only；正常打开无需参数。');
  const env=prepareEnvironment();let cli;
  const install=dir=>{cli||=npmCLI();run(process.execPath,[cli,'ci','--include=dev','--ignore-scripts=false','--no-audit','--no-fund','--registry=https://registry.npmjs.org'],{cwd:dir,env});};
  const expected=readJSON(path.join(root,'package.json')).dependencies.undici;
  let engineReady=false;
  try{engineReady=readJSON(path.join(root,'node_modules/undici/package.json')).version===expected;if(engineReady)await import('../network.mjs');}catch{engineReady=false;}
  if(!engineReady){console.log('[1/3] 首次启动：准备本地引擎依赖…');install(root);}
  const electron=path.join(desktop,'node_modules/electron/dist/electron.exe');
  const electronVersion=readJSON(path.join(desktop,'package.json')).devDependencies.electron;
  let desktopReady=false;
  try{desktopReady=fs.existsSync(electron)&&fs.readFileSync(path.join(desktop,'node_modules/electron/dist/version'),'utf8').trim().replace(/^v/,'')===electronVersion;}catch{}
  if(!desktopReady){
    console.log('[2/3] 首次启动：准备桌面运行环境，下载期间请保留此窗口…');
    let packageReady=false;
    try{packageReady=readJSON(path.join(desktop,'node_modules/electron/package.json')).version===electronVersion;}catch{}
    if(!packageReady)install(desktop);
    // Electron 45 publishes an explicit installer instead of an automatic package postinstall.
    run(process.execPath,[path.join(desktop,'node_modules/electron/install.js')],{cwd:desktop,env});
  }
  if(!fs.existsSync(electron))throw Error('Electron 运行环境未下载成功。检查代理/网络后再次打开应用。');
  console.log('[3/3] 校验应用内置 Node.js 运行环境…');
  await import('./prepare-desktop-runtime.mjs');
  if(process.argv.includes('--prepare-only'))console.log('ForgeRelay 源码启动环境已就绪。');
  else{
    const appEnv={...process.env};delete appEnv.ELECTRON_RUN_AS_NODE;
    const child=spawn(electron,[desktop],{cwd:root,detached:true,windowsHide:false,stdio:'ignore',env:appEnv});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    child.unref();console.log('ForgeRelay 桌面应用已启动。');
  }
}catch(error){console.error('\nForgeRelay 无法启动：'+error.message);process.exitCode=1;}
