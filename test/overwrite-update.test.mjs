import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';

const root=fileURLToPath(new URL('../',import.meta.url));
const windows={skip:process.platform!=='win32'};
const powershell=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'relay-overwrite-test-'));
  t.after(()=>{
    const absolute=fs.realpathSync(directory);assert.ok(absolute.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'relay-overwrite-test-'));
    fs.rmSync(absolute,{recursive:true,force:true});
  });
  const source=path.join(directory,'new package'),destination=path.join(directory,'原来的应用');
  fs.mkdirSync(source);fs.mkdirSync(destination);
  const files={'ForgeRelay.exe':Buffer.from('MZ new executable fixture'),
    'Update-ForgeRelay.ps1':fs.readFileSync(path.join(root,'desktop/update/Update-ForgeRelay.ps1')),
    'Update-ForgeRelay.cmd':fs.readFileSync(path.join(root,'desktop/update/Update-ForgeRelay.cmd')),
    'README.txt':Buffer.from('release instructions'),'CHANGELOG.md':Buffer.from('# Update')};
  const manifest={product:'ForgeRelay',version:'0.6.3',architecture:'x64',files:Object.entries(files).map(([name,buffer])=>({path:name,bytes:buffer.length,sha256:hash(buffer)}))};
  for(const [name,buffer] of Object.entries(files))fs.writeFileSync(path.join(source,name),buffer);
  const save=()=>fs.writeFileSync(path.join(source,'release-manifest.json'),JSON.stringify(manifest));save();
  const run=()=>spawnSync(powershell,['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(source,'Update-ForgeRelay.ps1'),'-Source',source,'-Destination',destination,'-NonInteractive','-NoLaunch','-SkipShortcuts'],{encoding:'utf8',windowsHide:true,timeout:30000});
  return{directory,source,destination,files,manifest,save,run};
}

test('overwrite upgrade replaces stable and legacy entries while preserving every user file',windows,t=>{
  const f=fixture(t),old=Buffer.from('old release');
  for(const name of ['ForgeRelay-0.6.1-Windows-x64.exe','ForgeRelay-0.6.2-Windows-x64.exe'])fs.writeFileSync(path.join(f.destination,name),old);
  const personal={'ForgeRelay.config.json':'{"dataDir":"D:\\Projects"}','data/discussions.json':'[{"message":"原有对话"}]','data/model-profiles.json':'{"profiles":[1]}','data/tasks.json':'[{"id":"kept"}]','data/attachments/keep.txt':'attachment','deepseek-key.encrypted':'encrypted fixture bytes','custom-project/source.js':'original project'};
  for(const [name,text] of Object.entries(personal)){const file=path.join(f.destination,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
  const result=f.run();assert.equal(result.status,0,result.stdout+result.stderr);const proof=JSON.parse(result.stdout.trim());assert.equal(proof.success,true);
  for(const name of ['ForgeRelay.exe','ForgeRelay-0.6.1-Windows-x64.exe','ForgeRelay-0.6.2-Windows-x64.exe'])assert.deepEqual(fs.readFileSync(path.join(f.destination,name)),f.files['ForgeRelay.exe']);
  for(const [name,text] of Object.entries(personal))assert.equal(fs.readFileSync(path.join(f.destination,name),'utf8'),text,name);
  assert.deepEqual(fs.readFileSync(path.join(proof.backup,'ForgeRelay-0.6.1-Windows-x64.exe')),old);
  assert.equal(fs.readdirSync(f.destination).filter(name=>name.startsWith('.forgerelay-update-')).length,0);
  const repeated=f.run();assert.equal(repeated.status,0,repeated.stderr);assert.equal(JSON.parse(repeated.stdout.trim()).changed,0,'repeat upgrade must be idempotent');
});

test('corrupt update payload cannot change an existing application',windows,t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.destination,'ForgeRelay.exe'),'old');fs.appendFileSync(path.join(f.source,'ForgeRelay.exe'),'corruption');
  const result=f.run();assert.equal(result.status,1);assert.equal(fs.readFileSync(path.join(f.destination,'ForgeRelay.exe'),'utf8'),'old');assert.deepEqual(fs.readdirSync(f.destination),['ForgeRelay.exe']);
  assert.match(result.stderr.replace(/\s/g,''),/文件损坏/);
});

test('update manifest cannot write user data or escape the application directory',windows,t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.destination,'ForgeRelay.exe'),'old');
  f.manifest.files[0].path='../outside.exe';f.save();
  const result=f.run();assert.equal(result.status,1);assert.equal(fs.readFileSync(path.join(f.destination,'ForgeRelay.exe'),'utf8'),'old');assert.equal(fs.existsSync(path.join(f.directory,'outside.exe')),false);
  assert.match(result.stderr.replace(/\s/g,''),/非法路径/);
});

test('incomplete update manifest and unrelated destination fail without modifying files',windows,t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.destination,'personal.txt'),'untouched');
  let result=f.run();assert.equal(result.status,1);assert.deepEqual(fs.readdirSync(f.destination),['personal.txt']);
  f.manifest.files.pop();f.save();result=f.run();assert.equal(result.status,1);assert.equal(fs.readFileSync(path.join(f.destination,'personal.txt'),'utf8'),'untouched');
});

test('locked legacy executable rolls back earlier replacements',windows,async t=>{
  const f=fixture(t),legacy=path.join(f.destination,'ForgeRelay-0.6.1-Windows-x64.exe');
  fs.writeFileSync(path.join(f.destination,'ForgeRelay.exe'),'old stable');fs.writeFileSync(legacy,'old alias');
  const lockScript=path.join(f.directory,'lock.ps1');
  fs.writeFileSync(lockScript,'param($Target)\n$stream=[IO.File]::Open($Target,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)\nWrite-Output "LOCKED"\n[Console]::ReadLine() > $null\n$stream.Dispose()\n');
  const locker=spawn(powershell,['-NoProfile','-ExecutionPolicy','Bypass','-File',lockScript,legacy],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const closed=once(locker,'exit');let ready='';locker.stdout.on('data',value=>ready+=value);locker.stderr.on('data',value=>ready+=value);
  t.after(async()=>{if(locker.exitCode===null)locker.kill();await closed;});
  for(let i=0;i<100&&!ready.includes('LOCKED');i++)await delay(30);assert.match(ready,/LOCKED/);
  try{
    const result=f.run();assert.equal(result.status,1,result.stdout);
    assert.match(result.stderr.replace(/\s/g,''),/另一个进程.*(?:使用|访问)|beingusedbyanotherprocess/);
    assert.equal(fs.readFileSync(path.join(f.destination,'ForgeRelay.exe'),'utf8'),'old stable');
    assert.equal(fs.readFileSync(legacy,'utf8'),'old alias');
    assert.equal(fs.existsSync(path.join(f.destination,'release-manifest.json')),false);
  }finally{locker.stdin.end('\n');await closed;}
});

test('update refuses a running copy and leaves that process alive',windows,async t=>{
  const f=fixture(t),executable=path.join(f.destination,'ForgeRelay.exe');fs.copyFileSync(process.execPath,executable);
  const before=hash(fs.readFileSync(executable));
  const aliasScript=path.join(f.directory,'short-path.ps1');
  fs.writeFileSync(aliasScript,'param($Target)\n[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)\n$env:PSModulePath=(Join-Path $PSHOME "Modules")+[IO.Path]::PathSeparator+$env:PSModulePath\n$fso=New-Object -ComObject Scripting.FileSystemObject\nWrite-Output ($fso.GetFile($Target).ShortPath)\n');
  const aliasResult=spawnSync(powershell,['-NoProfile','-ExecutionPolicy','Bypass','-File',aliasScript,executable],{encoding:'utf8',windowsHide:true});
  assert.equal(aliasResult.status,0,aliasResult.stderr);const imageAlias=aliasResult.stdout.trim();assert.ok(imageAlias);assert.equal(fs.statSync(imageAlias).ino,fs.statSync(executable).ino);assert.equal(hash(fs.readFileSync(imageAlias)),before);
  const running=spawn(imageAlias,['-e','console.log("READY "+JSON.stringify({pid:process.pid,exe:process.execPath}));setInterval(()=>{},1000)'],{windowsHide:true,stdio:['ignore','pipe','pipe']});const closed=once(running,'exit');
  let startup='';running.stdout.on('data',value=>startup+=value);running.stderr.on('data',value=>startup+=value);
  t.after(async()=>{if(running.exitCode===null)running.kill();await closed;});
  try{
    for(let i=0;i<200&&!startup.includes('READY')&&running.exitCode===null;i++)await delay(25);
    assert.match(startup,/READY/,'running-app fixture must actually reach its event loop');
    assert.equal(running.exitCode,null);
    const result=f.run();let diagnostic='';
    if(result.status!==1){
      const file=path.join(f.directory,'inspect.ps1');
      const script='param([int]$TargetId,[string]$Expected)\n[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)\n$env:PSModulePath=(Join-Path $PSHOME "Modules")+[IO.Path]::PathSeparator+$env:PSModulePath\n$p=Get-CimInstance Win32_Process -Filter ("ProcessId = "+$TargetId)\n$n=[System.Diagnostics.Process]::GetProcessById($TargetId)\n[pscustomobject]@{Id=$TargetId;CimName=$p.Name;CimPath=$p.ExecutablePath;NativeName=$n.ProcessName;NativePath=$n.MainModule.FileName;Expected=$Expected}|ConvertTo-Json -Compress\n';
      fs.writeFileSync(file,script);
      const probe=spawnSync(powershell,['-NoProfile','-ExecutionPolicy','Bypass','-File',file,'-TargetId',String(running.pid),'-Expected',executable],{encoding:'utf8',windowsHide:true});
      diagnostic=probe.stdout+' '+probe.stderr;
    }
    assert.equal(result.status,1,result.stdout+' fixture exit='+running.exitCode+' startup='+startup+' paths='+diagnostic);
    assert.match(result.stderr.replace(/\s/g,''),/仍在运行|无法确认.*进程的路径/);
    assert.equal(running.exitCode,null,'updater must not kill user work');assert.equal(hash(fs.readFileSync(executable)),before);
  }finally{running.kill();await closed;}
});

test('overwrite updater refuses a downgrade without touching data',windows,t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.destination,'ForgeRelay.exe'),'newer installed release');
  fs.writeFileSync(path.join(f.destination,'release-manifest.json'),JSON.stringify({product:'ForgeRelay',version:'0.6.4'}));
  const result=f.run();assert.equal(result.status,1);assert.match(result.stderr.replace(/\s/g,''),/不支持覆盖降级/);
  assert.equal(fs.readFileSync(path.join(f.destination,'ForgeRelay.exe'),'utf8'),'newer installed release');
});
