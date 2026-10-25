// One serialization per burst, and at most one queued full snapshot per slow client.
export function createStateBroadcast(clients,serialize,{delay=80,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let timer=null,dirty=false,closed=false;const blocked=new Map();
  function write(client,event){
    if(client.destroyed||client.writableEnded){clients.delete(client);return;}
    const waiting=blocked.get(client);if(waiting){waiting.event=event;return;}
    if(client.write(event)===false){
      const pending={event:null};blocked.set(client,pending);
      const cleanup=()=>{blocked.delete(client);client.off?.('drain',drain);client.off?.('close',cleanup);};
      pending.cleanup=cleanup;
      const drain=()=>{const latest=pending.event;cleanup();if(latest&&!closed)write(client,latest);};
      client.once('drain',drain);client.once('close',cleanup);
    }
  }
  function flush(){if(timer!==null){clearTimer(timer);timer=null;}if(!dirty||closed)return;dirty=false;if(clients.size){const event=serialize();for(const client of clients)write(client,event);}}
  return {
    schedule(){if(closed||!clients.size)return;dirty=true;if(timer===null){timer=setTimer(flush,delay);timer?.unref?.();}},
    flush,
    close(){flush();closed=true;if(timer!==null)clearTimer(timer);for(const pending of [...blocked.values()])pending.cleanup();blocked.clear();}
  };
}
