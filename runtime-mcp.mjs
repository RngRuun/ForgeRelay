// A private stdio MCP bridge. No provider API key is given to this process.
import readline from 'node:readline';
const [base,roomId]=process.argv.slice(2),token=process.env.RELAY_RUNTIME_TOKEN;
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
const input=readline.createInterface({input:process.stdin});
input.on('line',async line=>{let request;try{request=JSON.parse(line);if(request.id===undefined)return;
  if(request.method==='initialize')return send({jsonrpc:'2.0',id:request.id,result:{protocolVersion:request.params?.protocolVersion||'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'relay-runtime',version:'0.4.0'}}});
  if(request.method==='ping')return send({jsonrpc:'2.0',id:request.id,result:{}});
  const route=request.method==='tools/list'?'catalog':request.method==='tools/call'?'tool':null;if(!route)throw new Error('Unsupported MCP method');
  const response=await fetch(`${base}/api/discussions/${roomId}/runtime/${route}`,{method:'POST',headers:{'Content-Type':'application/json','X-Relay-Runtime-Token':token},body:JSON.stringify(request.params||{}),signal:AbortSignal.timeout(240000)});const value=await response.json();if(!response.ok)throw new Error(value.error||'Runtime request failed');
  send({jsonrpc:'2.0',id:request.id,result:value});
}catch(err){send({jsonrpc:'2.0',id:request?.id??null,error:{code:-32000,message:err.message}});}});
