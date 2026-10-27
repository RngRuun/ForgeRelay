import {randomUUID} from 'node:crypto';
const waiting=new Map();
if(process.env.FORGERELAY_DESKTOP_MANAGED==='1'&&process.send){
 process.on('message',message=>{if(message?.channel!=='forgerelay-private-v1'||!message.replyTo)return;const item=waiting.get(message.replyTo);if(!item)return;waiting.delete(message.replyTo);clearTimeout(item.timer);message.error?item.reject(Error(message.error)):item.resolve(message.result);});
 process.on('disconnect',()=>{for(const item of waiting.values()){clearTimeout(item.timer);item.reject(Error('桌面主进程已断开'));}waiting.clear();});
}
export function desktopRequest(method,payload={}){return new Promise((resolve,reject)=>{if(process.env.FORGERELAY_DESKTOP_MANAGED!=='1'||!process.send||!process.connected)return reject(Error('此功能需要由桌面应用管理的后台'));
 const id=randomUUID(),timer=setTimeout(()=>{waiting.delete(id);reject(Error('桌面安全存储暂时没有响应'));},8000);waiting.set(id,{resolve,reject,timer});process.send({channel:'forgerelay-private-v1',id,method,payload},error=>{if(error){clearTimeout(timer);waiting.delete(id);reject(Error('无法连接桌面主进程'));}});
});}
