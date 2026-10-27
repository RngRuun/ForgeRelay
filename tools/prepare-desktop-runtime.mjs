import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createWriteStream} from 'node:fs';
import {NetworkSettings} from '../network.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await fs.readFile(new URL('./desktop-runtime.json',import.meta.url),'utf8'));
const directory=path.join(root,'desktop/runtime');
await fs.mkdir(directory,{recursive:true});
const network=new NetworkSettings(path.join(root,'data'));
async function ensure(name,url,expected){
  const target=path.join(directory,name),temp=target+'.part';
  try{if(createHash('sha256').update(await fs.readFile(target)).digest('hex')===expected){console.log(name+' verified');return;}}catch{}
  const response=await network.fetch(url,{signal:AbortSignal.timeout(180000)});
  if(!response.ok||!response.body)throw Error('Runtime download failed: '+response.status);
  const digest=createHash('sha256');
  try{
    await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,_encoding,done){digest.update(chunk);done(null,chunk);}}),createWriteStream(temp));
    if(digest.digest('hex')!==expected)throw Error('Runtime checksum mismatch: '+name);
    await fs.rename(temp,target);
  }catch(error){await fs.rm(temp,{force:true});throw error;}
  console.log(name+' downloaded and verified');
}
try{
  await ensure('node.exe',`https://nodejs.org/dist/v${manifest.version}/${manifest.platform}/node.exe`,manifest.nodeSha256);
  await ensure('NODE-LICENSE.txt',`https://raw.githubusercontent.com/nodejs/node/v${manifest.version}/LICENSE`,manifest.licenseSha256);
}finally{await network.close();}
