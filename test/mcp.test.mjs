import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import readline from 'node:readline';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {RuntimeHarness} from '../harness.mjs';
import {AttachmentStore} from '../attachments.mjs';
import {runtimeCodexArgs} from '../adapters.mjs';

test('实际 stdio MCP 初始化、工具目录与项目读取贯通 HTTP，凭证只通过进程环境传递',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-mcp-test-')),workspace=path.join(dir,'project');fs.mkdirSync(workspace);fs.writeFileSync(path.join(workspace,'proof.txt'),'ACTUAL MCP FILE');const room={id:randomUUID(),workspace,runtime:{mode:'read',computer:'off'},toolCalls:[]};const harness=new RuntimeHarness({attachments:new AttachmentStore(path.join(dir,'attachments'))});const token=randomUUID();
  const server=http.createServer(async(req,res)=>{if(req.headers['x-relay-runtime-token']!==token){res.writeHead(403);res.end('{"error":"invalid runtime session"}');return;}let text='';for await(const chunk of req)text+=chunk;const input=JSON.parse(text||'{}');res.setHeader('Content-Type','application/json');if(req.url.endsWith('/catalog'))res.end(JSON.stringify({tools:harness.enabledTools(room,true)}));else{const result=await harness.execute(room,'Codex',input.name,input.arguments,new AbortController().signal,0,true);res.end(JSON.stringify({content:[{type:'text',text:JSON.stringify(result)}]}));}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),env={...process.env,RELAY_RUNTIME_TOKEN:token};delete env.DEEPSEEK_API_KEY;
  const child=spawn(process.execPath,[path.join(root,'runtime-mcp.mjs'),base,room.id],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});const pending=new Map();let next=0;readline.createInterface({input:child.stdout}).on('line',line=>{const message=JSON.parse(line);pending.get(message.id)?.(message);pending.delete(message.id);});
  t.after(async()=>{child.kill();await new Promise(resolve=>child.exitCode!==null?resolve():child.once('close',resolve));await new Promise(resolve=>server.close(resolve));await harness.close(room.id);const real=fs.realpathSync(dir);assert.ok(real.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'relay-mcp-test-'));fs.rmSync(real,{recursive:true,force:true});});
  function rpc(method,params={}){const id=++next;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('MCP timed out'));},7000);pending.set(id,value=>{clearTimeout(timer);resolve(value);});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
  const init=await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}});assert.equal(init.result.serverInfo.name,'relay-runtime');child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  const listed=await rpc('tools/list');assert.ok(listed.result.tools.some(t=>t.name==='load_skill'&&t.annotations.readOnlyHint));assert.ok(!listed.result.tools.some(t=>t.name==='write_file'));
  const result=await rpc('tools/call',{name:'read_file',arguments:{path:'proof.txt'}});assert.match(result.result.content[0].text,/ACTUAL MCP FILE/);assert.equal(room.toolCalls[0].status,'success');
  const args=runtimeCodexArgs(root,room,{baseUrl:base,enabledTools:['read_file','load_skill'],token});assert.ok(!args.join(' ').includes(token));assert.ok(args.some(a=>a==='mcp_servers.relay_runtime.tools.load_skill.approval_mode="approve"'));assert.ok(!args.some(a=>a.includes('tools.run_command.approval_mode')));
});
