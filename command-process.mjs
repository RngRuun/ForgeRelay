import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),marker='__RELAY_PROCESS_READY__';
export function commandProcess(command,{cwd,signal,timeoutSeconds=60,managed=false,redact=x=>x,onOutput=()=>{}}={}) {
  if(typeof command!=='string'||!command.trim()||command.length>12000)throw new Error('命令需要为 1–12000 字');
  signal?.throwIfAborted();const env={...process.env};for(const key of Object.keys(env))if(/KEY|TOKEN|SECRET|PASSWORD/i.test(key))delete env[key];
  const windows=process.platform==='win32';
  const child=spawn(windows?'powershell.exe':'/bin/sh',windows?['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(root,'shell-runner.ps1')]:['-s'],{cwd,env,windowsHide:true,detached:!windows,stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='',timedOut=false,settled=false,readyDone=false,stopRequested=false,resolveReady,rejectReady,resolveDone,rejectDone;
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  const finished=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});
  // Both promises always have a handler; callers may await either one first.
  ready.catch(()=>{});finished.catch(()=>{});
  const snapshot=()=>({pid:child.pid,stdout:redact(stdout),stderr:redact(stderr.replaceAll(marker,'')),timedOut});
  const forceStop=()=>{if(child.exitCode!==null)return;if(windows){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}else{try{process.kill(-child.pid,'SIGTERM');}catch{child.kill();}}};
  const stop=()=>{stopRequested=true;if(windows&&!readyDone)return;forceStop();};
  const deadline=managed?null:setTimeout(()=>{timedOut=true;stop();},Math.min(180,Math.max(1,timeoutSeconds))*1000);
  const startup=setTimeout(()=>{if(!readyDone){forceStop();rejectReady(new Error('命令进程初始化超时'));}},15000);
  const abort=()=>stop();signal?.addEventListener('abort',abort,{once:true});
  const markReady=()=>{if(!readyDone){readyDone=true;clearTimeout(startup);if(stopRequested){rejectReady(new Error('命令已被中止'));forceStop();}else resolveReady(snapshot());}};
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',d=>{stdout=(stdout+d).slice(-20000);onOutput(snapshot());});
  child.stderr.on('data',d=>{stderr=(stderr+d).slice(-12000);if(stderr.includes(marker))markReady();onOutput(snapshot());});
  if(!windows)child.once('spawn',markReady);
  child.stdin.on('error',()=>{});
  const finish=(error,code)=>{if(settled)return;settled=true;clearTimeout(deadline);clearTimeout(startup);signal?.removeEventListener('abort',abort);
    const err=signal?.aborted?new Error('命令已被中止'):error;
    if(!readyDone){readyDone=true;rejectReady(err||new Error('命令在初始化完成前退出：'+redact(stderr)));}
    if(err)rejectDone(err);else resolveDone({...snapshot(),exitCode:code});
  };
  child.on('error',error=>finish(error));
  child.on('exit',()=>{if(signal?.aborted){child.stdout.destroy();child.stderr.destroy();}});
  child.on('close',code=>finish(null,code));
  child.stdin.end(windows?JSON.stringify({command,managed,parentPid:process.pid}):command+'\n');
  return{pid:child.pid,ready,finished,stop,snapshot};
}
