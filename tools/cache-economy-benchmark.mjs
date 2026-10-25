// Offline, synthetic input benchmark. No API client, provider tokens or billing.
import {pathToFileURL} from 'node:url';
import {contextPatch} from '../cache-context.mjs';
import {transcriptView,nativeEvidenceText} from '../context-view.mjs';

const bytes=value=>Buffer.byteLength(JSON.stringify(value));
// Reference: the pre-optimization positional array algorithm, for comparison.
function previousPatch(a,b,at=''){
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),escape=k=>k.replaceAll('~','~0').replaceAll('/','~1');
  if(same(a,b))return [];
  if(Array.isArray(a)&&Array.isArray(b)){
    if(b.length>=a.length&&a.every((v,i)=>same(v,b[i])))return b.slice(a.length).map(value=>({op:'add',path:at+'/-',value}));
    if(a.length===b.length)return b.flatMap((v,i)=>previousPatch(a[i],v,at+'/'+i));
  }
  if(a&&b&&!Array.isArray(a)&&!Array.isArray(b)&&typeof a==='object'&&typeof b==='object')return [
    ...Object.keys(a).filter(k=>!Object.hasOwn(b,k)).map(k=>({op:'remove',path:at+'/'+escape(k)})),
    ...Object.keys(b).flatMap(k=>Object.hasOwn(a,k)?previousPatch(a[k],b[k],at+'/'+escape(k)):[{op:'add',path:at+'/'+escape(k),value:b[k]}])
  ];
  return [{op:'replace',path:at,value:b}];
}
const message=i=>{
  const text=`角色在第 ${i} 次审查中发现的边界与建议：`+'依据项目事实核对需求，不遗漏约束、反例和验收条件。'.repeat(22);
  return {id:'M'+i,actor:i%2?'Codex':'DeepSeek',agentId:i%2?'lead':'research',agentLabel:i%2?'主持人':'调查者',phase:'challenge',text,
    detail:{rulesHash:'r'.repeat(64),revision:1,proposalHash:'p'.repeat(64),directiveHash:'d'.repeat(64),acknowledged:true,summary:text,
      analysis:[{topic:'边界 '+i,position:'检查当前前提',evidence:'测试夹具中的文件 '+i,alternative:'范围有限的替代实现'}],objections:[],replies:[],close:[],proposal:'',question:'',stance:'undecided',signals:[]}};
};
export function cacheEconomyBenchmark(){
  const messages=Array.from({length:48},(_,i)=>message(i));let before=0,after=0;
  for(let i=16;i<messages.length;i++){
    const a={transcript:messages.slice(i-16,i).map(transcriptView)},b={transcript:messages.slice(i-15,i+1).map(transcriptView)};
    before+=bytes({patch:previousPatch(a,b)});after+=bytes({patch:contextPatch(a,b)});
  }
  const raw=messages.slice(0,16).map(m=>({actor:m.actor,phase:m.phase,text:m.text,detail:m.detail})),compact=messages.slice(0,16).map(transcriptView);
  const command='实际命令返回：检查通过\n'.repeat(20),oldCommand=command.slice(0,200)+'\n'+command.slice(-1600);
  return {kind:'offline-synthetic',networkRequests:0,paidInferenceCalls:0,metric:'UTF-8 bytes; not provider tokens, hit rate, or money',
    rollingHistory:{window:16,updates:messages.length-16,beforeBytes:before,afterBytes:after,reduction:1-after/before},
    modelTranscript:{messages:16,beforeBytes:bytes(raw),afterBytes:bytes(compact),reduction:1-bytes(compact)/bytes(raw)},
    shortCommandEvidence:{beforeBytes:bytes(oldCommand),afterBytes:bytes(nativeEvidenceText(command))}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(cacheEconomyBenchmark(),null,2));
