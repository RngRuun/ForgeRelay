import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
test('managed desktop engine exits on IPC disconnect without triggering inference',async t=>{
  const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-desktop-engine-'));
  const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,DEEPSEEK_API_KEY:'',RELAY_DATA_DIR:dir,PORT:String(port),FORGERELAY_DESKTOP_MANAGED:'1',FORGERELAY_ENGINE_ID:'lifecycle-test'}});
  const closed=once(child,'exit');
  t.after(async()=>{if(child.exitCode===null)child.kill();await closed;const absolute=fs.realpathSync(dir);assert.ok(absolute.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'relay-desktop-engine-'));fs.rmSync(absolute,{recursive:true,force:true});});
  let health;
  for(let i=0;i<100;i++){try{health=await(await fetch(`http://127.0.0.1:${port}/api/health`)).json();break;}catch{}await delay(100);}
  assert.equal(health?.desktopEngineId,'lifecycle-test');
  const navigation=await(await fetch(`http://127.0.0.1:${port}/api/navigation`)).json();assert.deepEqual(navigation,{rooms:[],tasks:[]});
  child.disconnect();
  const result=await Promise.race([closed,delay(8000,null,{ref:false}).then(()=>null)]);assert.ok(result,'engine must exit after parent disconnect');
  assert.equal(result[0],0);
});
