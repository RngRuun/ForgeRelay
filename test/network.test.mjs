import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {once} from 'node:events';
import {NetworkSettings,proxyEnvironment,systemProxy,validateNetworkSettings} from '../network.mjs';
function directory(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-network-'));t.after(()=>{const target=fs.realpathSync(dir);assert.ok(target.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'relay-network-'));fs.rmSync(target,{recursive:true,force:true});});return dir;}
test('Windows/system proxy feeds both HTTP requests and Codex env; local backend bypasses it',()=>{
 const base={PATH:'keep',https_proxy:'http://env.example:8081',http_proxy:'http://env.example:8082',NO_PROXY:'example.test'};
 const inherited=proxyEnvironment(base,{mode:'system'},'PROXY 127.0.0.1:7890; DIRECT');assert.equal(inherited.source,'environment');assert.equal(inherited.env.HTTPS_PROXY,base.https_proxy);assert.equal(inherited.env.HTTP_PROXY,base.http_proxy);assert.match(inherited.noProxy,/localhost/);assert.equal(inherited.env.PATH,'keep');assert.equal(base.HTTPS_PROXY,undefined);
 const detected=proxyEnvironment({},{} ,'PROXY 127.0.0.1:7890; DIRECT');assert.equal(detected.proxy,'http://127.0.0.1:7890');assert.equal(detected.source,'system');
 const custom=proxyEnvironment(base,{mode:'custom',url:'localhost:9000'});assert.equal(custom.env.ALL_PROXY,'http://localhost:9000');
 const direct=proxyEnvironment(base,{mode:'direct'});assert.equal(direct.env.NO_PROXY,'*');assert.equal(direct.env.HTTPS_PROXY,undefined);
 assert.equal(systemProxy('DIRECT'),'');assert.equal(systemProxy('DIRECT; PROXY ignored.example:8080'),'');assert.equal(systemProxy('HTTPS secure.example:8443; DIRECT'),'https://secure.example:8443');assert.throws(()=>validateNetworkSettings({mode:'custom',url:'http://user:pass@example.test'}));assert.throws(()=>validateNetworkSettings({callTimeoutSeconds:0}));
});
test('custom proxy is actually used, loopback is bypassed, saved mode survives restart',async t=>{
 const target=http.createServer((_req,res)=>res.end('local fixture response'));target.listen(0,'127.0.0.1');await once(target,'listening');
 const sockets=new Set(),connections=[];const proxy=http.createServer((req,res)=>{connections.push(req.url);const upstream=http.request({host:'127.0.0.1',port:target.address().port,path:new URL(req.url).pathname},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});upstream.on('error',()=>res.destroy());req.pipe(upstream);});proxy.on('connect',(req,client,head)=>{connections.push(req.url);sockets.add(client);const upstream=net.connect(target.address().port,'127.0.0.1',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client);});sockets.add(upstream);upstream.on('error',()=>client.destroy());client.on('error',()=>upstream.destroy());});proxy.listen(0,'127.0.0.1');await once(proxy,'listening');
 const dir=directory(t),network=new NetworkSettings(dir,{env:{},detected:''});
 t.after(async()=>{await network.close();for(const socket of sockets)socket.destroy();await Promise.all([new Promise(r=>target.close(r)),new Promise(r=>proxy.close(r))]);});
 network.update({mode:'custom',url:`http://127.0.0.1:${proxy.address().port}`});
 const response=await network.fetch(`http://api.relay.test:${target.address().port}/test`,{signal:AbortSignal.timeout(3000)});assert.equal(await response.text(),'local fixture response');assert.equal(connections.length,1);
 const loopback=await network.fetch(`http://127.0.0.1:${target.address().port}/local`,{signal:AbortSignal.timeout(3000)});assert.equal(await loopback.text(),'local fixture response');assert.equal(connections.length,1,'loopback must not traverse proxy');
 const next=new NetworkSettings(dir,{env:{},detected:''});assert.equal(next.value.mode,'custom');assert.equal(next.public().proxyHost,`127.0.0.1:${proxy.address().port}`);await next.close();
 const probe=await network.probe({url:`http://127.0.0.1:${target.address().port}/probe`});assert.equal(probe.reachable,true);assert.match(probe.message,/不代表.*推理/);
});
