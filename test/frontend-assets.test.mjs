import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

test('production routes serve the complete frontend dependency graph for every app screen',async t=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'relay-frontend-assets-'));
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
  const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,PORT:String(port),RELAY_DATA_DIR:data,DEEPSEEK_API_KEY:''}});
  const closed=once(child,'exit');
  t.after(async()=>{
    if(child.exitCode===null)child.kill();await closed;
    const resolved=fs.realpathSync(data);
    assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'relay-frontend-assets-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  });
  let ready=false;
  for(let i=0;i<100;i++){
    try{ready=(await fetch(base+'/api/health')).ok;if(ready)break;}catch{}
    if(child.exitCode!==null)assert.fail('Production server exited before becoming ready');
    await delay(50);
  }
  assert.ok(ready,'Production server must start');
  const pending=['/','/discussion','/workbench','/models'],seen=new Set();
  while(pending.length){
    const route=pending.shift();if(seen.has(route))continue;seen.add(route);
    const response=await fetch(base+route);
    assert.equal(response.status,200,`Missing production frontend asset: ${route}`);
    const type=response.headers.get('content-type')||'';
    if(/\.js$/.test(route))assert.match(type,/javascript/,`Wrong module MIME: ${route}`);
    if(/\.css$/.test(route))assert.match(type,/text\/css/,`Wrong stylesheet MIME: ${route}`);
    const text=await response.text();let references=[];
    if(type.includes('text/html'))references=[...text.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g)].map(match=>match[1]);
    if(type.includes('javascript'))references=[...text.matchAll(/\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?["'](\.[^"']+|\/[^"']+)["']|\bimport\s*\(\s*["'](\.[^"']+|\/[^"']+)["']\s*\)/g)].map(match=>match[1]||match[2]);
    if(type.includes('text/css'))references=[...text.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)].map(match=>match[1]);
    for(const reference of references){
      if(/^(?:#|%23|data:)/i.test(reference))continue;
      const url=new URL(reference,base+route);
      if(url.origin===base&&!seen.has(url.pathname))pending.push(url.pathname);
    }
  }
  assert.ok(seen.has('/human-directions.js'),'Traverse transitive imports, not just HTML entry scripts');
  assert.ok(seen.has('/vendor/vue.runtime.esm-browser.prod.js'));
  assert.ok(seen.has('/fonts/publicsans-variable.ttf'));
  assert.equal((await fetch(base+'/network.mjs')).status,404,'Backend modules must remain private');
});
