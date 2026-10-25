import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url));
const textTypes=new Set(['.txt','.md','.json','.jsonl','.csv','.tsv','.html','.css','.js','.mjs','.cjs','.jsx','.ts','.tsx','.py','.rs','.go','.java','.c','.cpp','.h','.xml','.yaml','.yml','.toml','.ini','.sql','.sh','.ps1','.log','.svg','.tex','.rst']);
const docs=new Set(['.pdf','.docx','.pptx','.xlsx','.odt','.ods','.odp']);
const digest=b=>createHash('sha256').update(b).digest('hex');
function denyName(name){if(/(^|[\/\\])(?:\.env(?:\..*)?|auth\.json|credentials[^\/\\]*|id_rsa|id_ed25519|[^\/\\]*\.(?:pem|key|pfx))$/i.test(name))throw new Error('凭证文件不能作为共享附件');}
export function imageMime(bytes){if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return'image/png';if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return'image/jpeg';if(/^GIF8[79]a/.test(bytes.subarray(0,6).toString()))return'image/gif';if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return'image/webp';return null;}
export class AttachmentStore {
  constructor(dir){this.dir=dir;fs.mkdirSync(dir,{recursive:true});}
  add(room,source){const absolute=path.resolve(source);denyName(absolute);if(fs.lstatSync(absolute).isSymbolicLink()||!fs.statSync(absolute).isFile())throw new Error('附件必须是普通文件；项目文件夹请使用 /project');if(fs.statSync(absolute).size>25*1024*1024)throw new Error('单个附件上限为 25 MiB');return this.addBytes(room,path.basename(absolute),fs.readFileSync(absolute));}
  addBytes(room,name,bytes){name=path.basename(name);denyName(name);if(!name||!bytes.length||bytes.length>25*1024*1024)throw new Error('附件大小需要为 1 字节至 25 MiB');room.attachments||=[];if(room.attachments.length>=40)throw new Error('每个会话最多 40 个附件');const id=randomUUID(),folder=path.join(this.dir,room.id),target=path.join(folder,id+path.extname(name));fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});const ext=path.extname(name).toLowerCase(),mime=imageMime(bytes);const item={id,name,path:target,size:bytes.length,hash:digest(bytes),type:mime?'image':textTypes.has(ext)?'text':docs.has(ext)?'document':'binary',mime,added:new Date().toISOString()};room.attachments.push(item);return item;}
  get(room,id){const item=room.attachments?.find(a=>a.id===id);if(!item)throw new Error('附件不存在');return item;}
  images(room){return(room.attachments||[]).filter(a=>a.type==='image');}
  async read(room,id){const a=this.get(room,id),bytes=fs.readFileSync(a.path);if(digest(bytes)!==a.hash)throw new Error('共享附件原件已变化，请重新添加附件');if(a.type==='image')return{...a,dataUrl:`data:${a.mime};base64,${bytes.toString('base64')}`};if(a.type==='text'){if(bytes.includes(0))return{...a,text:'检测到二进制数据，不能按文本解码',supported:false};return{...a,text:bytes.toString('utf8').slice(0,120000),truncated:bytes.length>120000};}if(a.type==='document')return{...a,...await extractDocument(a.path)};return{...a,supported:false,text:'已挂载原始文件。此类型没有内置解码器；工作模式可由代理使用项目中的实际工具处理，不能声称已理解二进制内容。'};}
}
function pythonBin(){if(process.env.RELAY_PYTHON)return process.env.RELAY_PYTHON;const bundled=path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','python',process.platform==='win32'?'python.exe':'bin/python3');return fs.existsSync(bundled)?bundled:process.platform==='win32'?'python':'python3';}
export async function extractDocument(file){return new Promise((resolve,reject)=>{const proc=spawn(pythonBin(),[path.join(root,'extract_document.py'),file],{windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';const timer=setTimeout(()=>proc.kill(),30000);proc.stdout.setEncoding('utf8');proc.stderr.setEncoding('utf8');proc.stdout.on('data',d=>stdout+=d);proc.stderr.on('data',d=>stderr=(stderr+d).slice(-1000));proc.on('error',()=>{clearTimeout(timer);reject(new Error('文档解析需要 Python 3，或设置 RELAY_PYTHON'));});proc.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(new Error('文档解析失败：'+stderr));try{resolve(JSON.parse(stdout));}catch{reject(new Error('文档解析器没有返回有效结果'));}});});}
