import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';import {EventEmitter} from 'node:events';
import {conversationSnapshot} from '../conversation-context.mjs';import {transcriptView} from '../context-view.mjs';
import {prepareCacheContext} from '../cache-context.mjs';import {createStateBroadcast} from '../state-broadcast.mjs';
import {executeToolBatch} from '../provider-history.mjs';

export async function chatEfficiencyBenchmark(){
 const room={workspace:'benchmark-only',rulesHash:'fixed',modelProfile:{hash:'fixed'},messages:[],human:[],minRounds:3,maxRounds:5,governance:{initial:{direction:'帮助我完成一个本地项目',premises:'全部数据保存在本地'},history:[],team:[]},conversation:{mode:'chat',lastRequestId:'',settingsVersion:1,complexityThreshold:4}};
 const beforeRoom={...room},afterRoom={...room},agent={id:'lead',name:'实施与整合',provider:'Codex',focus:'完成用户目标'};
 const makeBase=()=>({revision:room.human.length,phase:'chat',round:1,human:room.human,proposal:null,objections:[],runtime:{mode:'read',computer:'off',version:0},workspace:room.workspace,attachments:[],enabledSkills:[],workItems:[],agents:[],toolEvidence:[],nativeEvidence:room.messages.filter(m=>m.phase==='command').map(m=>({actor:m.actor,type:m.phase,text:m.text})),transcript:[]});
 let beforeBytes=0,afterBytes=0;const samples=[];
 for(let i=1;i<=24;i++){
   const message={id:'human-'+i,actor:'Human',phase:'direction',text:`第 ${i} 轮：请核对这个具体要求，保留本地数据边界。`+'完整的实际要求，不可裁剪。'.repeat(16)};room.messages.push(message);room.human.push({text:message.text,action:'MESSAGE',time:'fixture-'+i});room.conversation.lastRequestId=message.id;
   if(i%4===0)room.messages.push({id:'command-'+i,actor:'Codex',phase:'command',text:'完整的实际命令结果与证据，不能丢失。'.repeat(50)});
   const after=conversationSnapshot({snapshot:makeBase},room,agent),before=makeBase();
   before.transcript=room.messages.filter(m=>!m.stale&&!['mcp','command_start'].includes(m.phase)).map(transcriptView);
   before.conversation=structuredClone(after.conversation);
   const old=prepareCacheContext(beforeRoom,'Codex:chat:lead',before),current=prepareCacheContext(afterRoom,'Codex:chat:lead',after);
   beforeBytes+=Buffer.byteLength(JSON.stringify(old.messages));afterBytes+=Buffer.byteLength(JSON.stringify(current.messages));
   for(const item of room.messages.filter(m=>m.actor==='Human'||m.phase==='command'))assert.ok(JSON.stringify(after).includes(item.text));
   assert.equal(after.humanConstraints.initial.premises,room.governance.initial.premises);
   room.messages.push({id:'answer-'+i,actor:'Codex',phase:'chat',text:'依据完整事实回答当前问题。'.repeat(20)});
   samples.push({turn:i,beforeInputBytes:Buffer.byteLength(JSON.stringify(old.messages)),afterInputBytes:Buffer.byteLength(JSON.stringify(current.messages))});
 }
 let serializations=0,timer;const client=new EventEmitter();client.write=()=>true;
 const broadcast=createStateBroadcast(new Set([client]),()=>{serializations++;return 'snapshot';},{setTimer:fn=>{timer=fn;return 1;},clearTimer:()=>{}});
 for(let i=0;i<100;i++)broadcast.schedule();timer();broadcast.close();
 const calls=Array.from({length:6},(_,i)=>({id:String(i),function:{name:'read_file',arguments:JSON.stringify({i})}}));
 const observe=async(_,{i})=>{await new Promise(resolve=>setTimeout(resolve,15));return {i,evidence:'full result'};};
 const startSerial=performance.now(),serial=[];for(const tool of calls)serial.push(await observe(tool.function.name,JSON.parse(tool.function.arguments)));const serialMs=performance.now()-startSerial;
 const startParallel=performance.now(),parallel=await executeToolBatch(calls,observe,new AbortController().signal),parallelMs=performance.now()-startParallel;assert.deepEqual(parallel,serial);
 const prettyBytes=Buffer.byteLength(JSON.stringify(room,null,2)),compactBytes=Buffer.byteLength(JSON.stringify(room));
 return {networkRequests:0,modelCalls:0,context:{turns:24,beforeInputBytes:beforeBytes,afterInputBytes:afterBytes,reductionPercent:Math.round((1-afterBytes/beforeBytes)*1000)/10,fullHistoryAndEvidencePreserved:true,initialPremisesPreserved:true,samples},stateUpdates:{burst:100,previousSerializations:100,currentSerializations:serializations},independentObservations:{count:6,concurrency:3,sequentialMs:Math.round(serialMs),parallelMs:Math.round(parallelMs),identicalResults:true,fixtureDelayMs:15},persistence:{prettyBytes,compactBytes,reductionPercent:Math.round((1-compactBytes/prettyBytes)*1000)/10},limits:'Offline fixtures measure bytes and scheduling overhead, not API billed tokens, hardware watts or model reasoning accuracy.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await chatEfficiencyBenchmark(),null,2));
