// Loaded only with the test child's explicit --import flag. No real providers.
import fs from 'node:fs';import path from 'node:path';import {setTimeout as delay} from 'node:timers/promises';import {NetworkSettings} from '../../network.mjs';
const directory=process.env.RELAY_DATA_DIR;
function append(event){const file=path.join(directory,'transport-events.json');let events=[];try{events=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}events.push(event);fs.writeFileSync(file,JSON.stringify(events));}
NetworkSettings.prototype.fetch=async function(url,options={}){
 let plan={};try{plan=JSON.parse(fs.readFileSync(path.join(directory,'transport-plan.json'),'utf8'));}catch{}
 if(String(url).endsWith('/models')){append({type:'models-start',oldKey:options.headers?.Authorization==='Bearer fixture-old-key'});while(plan.holdModels&&!fs.existsSync(path.join(directory,'transport-release')))await delay(10,undefined,{signal:options.signal});await delay(plan.delayModelsMs||0,undefined,{signal:options.signal});append({type:'models-end'});return new Response(JSON.stringify({data:[{id:'deepseek-flash'}]}),{status:200});}
 if(options.method==='HEAD'){await delay(plan.delayHeadMs||0,undefined,{signal:options.signal});return new Response(null,{status:200});}
 throw Error('Unexpected request in non-billing connection test');
};
