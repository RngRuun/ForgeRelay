import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import os from 'node:os';
import {createCodexAdapter} from '../adapters.mjs';
const message={type:'item.completed',item:{type:'agent_message',text:'Hello! I am here and ready.'}};
const complete={type:'turn.completed',usage:{input_tokens:17163,cached_input_tokens:13312,output_tokens:12}};
function replay(events,code=0){const observed=[],usage=[];const adapter=createCodexAdapter({bin:'replay-only',root:os.tmpdir(),config:{},spawnProcess:()=>{const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin.on('finish',()=>setImmediate(()=>{for(const event of events)child.stdout.write(JSON.stringify(event)+'\n');child.stdout.end();setImmediate(()=>child.emit('close',code));}));return child;},terminateProcess:()=>assert.fail('Unexpected termination')});return {observed,usage,run:()=>adapter({task:{workspace:os.tmpdir()},signal:new AbortController().signal,prompt:'event replay',stateless:true,readOnly:true,onEvent:(...event)=>observed.push(event),onUsage:event=>usage.push(event)})};}
test('Codex reconnect and transport fallback do not discard a completed successful turn',async()=>{
 const r=replay([{type:'thread.started',thread_id:'replay-thread'},{type:'turn.started'},...[2,3,4,5].map(n=>({type:'error',message:`Reconnecting... ${n}/5 (request timed out)`})),{type:'item.completed',item:{type:'error',message:'Falling back from WebSockets to HTTPS transport'}},{type:'error',message:'Reconnecting... waiting for network'},message,complete]);
 assert.equal(await r.run(),message.item.text);assert.equal(r.usage[0].input_tokens,17163);assert.equal(r.observed.filter(([type])=>type==='retry').length,5);assert.ok(r.observed.some(([type])=>type==='warning'));assert.ok(r.observed.some(([type])=>type==='call_progress'));
});
test('Codex true turn failure, nonzero exit and missing completion never become success',async()=>{
 for(const [events,code] of [[[message,{type:'turn.failed',error:{message:'fatal failure'}}],0],[[message,complete],1],[[message],0]]){const r=replay(events,code);await assert.rejects(r.run(),error=>{assert.equal(error.partialOutput,message.item.text);return true;});}
});
