'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
function createCredentialStore(directory,safeStorage){
 const file=path.join(directory,'deepseek-key.encrypted');
 const available=async()=>typeof safeStorage.isAsyncEncryptionAvailable==='function'&&await safeStorage.isAsyncEncryptionAvailable();
 return{file,available,
  async load(){try{const bytes=await fs.readFile(file);if(!await available())return{key:'',saved:true,error:'系统加密存储暂不可用，请本次运行重新输入密钥。'};const decrypted=await safeStorage.decryptStringAsync(bytes);return{key:typeof decrypted==='string'?decrypted:decrypted.result,saved:true};}catch(error){if(error.code==='ENOENT')return{key:'',saved:false};return{key:'',saved:true,error:'本机加密密钥无法解密，请重新输入并保存；原文件已保留。'};}},
  async save(key){if(typeof key!=='string'||!key.trim()||key.length>2000)throw Error('请提供有效密钥');if(!await available())throw Error('系统加密不可用，未保存密钥；可选择仅本次运行');const encrypted=await safeStorage.encryptStringAsync(key);await fs.mkdir(directory,{recursive:true});await fs.writeFile(file+'.tmp',encrypted,{mode:0o600});await fs.rename(file+'.tmp',file);return{saved:true};},
  async clear(){await fs.rm(file,{force:true});return{saved:false};}
 };
}
module.exports={createCredentialStore};
