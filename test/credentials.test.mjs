import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import credentials from '../desktop/credentials.cjs';
function directory(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-key-store-'));t.after(()=>{const target=fs.realpathSync(dir);assert.ok(target.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'relay-key-store-'));fs.rmSync(target,{recursive:true,force:true});});return dir;}
function storage(){const key=randomBytes(32);return{isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async text=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const encrypted=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]);},decryptStringAsync:async bytes=>{const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return{result:Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'),shouldReEncrypt:false};}};}
test('opt-in key storage is encrypted, restarts restore it, clear removes only credential',async t=>{
 const dir=directory(t),osStorage=storage(),store=credentials.createCredentialStore(dir,osStorage),key='test-only-secret-not-real';
 assert.deepEqual(await store.load(),{key:'',saved:false});assert.equal(fs.existsSync(store.file),false,'default must not save anything');await store.save(key);assert.ok(!fs.readFileSync(store.file).includes(Buffer.from(key)));
 const restarted=credentials.createCredentialStore(dir,osStorage);assert.deepEqual(await restarted.load(),{key,saved:true});fs.writeFileSync(path.join(dir,'unrelated.txt'),'keep');await restarted.clear();assert.deepEqual(await restarted.load(),{key:'',saved:false});assert.equal(fs.readFileSync(path.join(dir,'unrelated.txt'),'utf8'),'keep');
});
test('unavailable encryption and decrypt failure never fall back to plaintext',async t=>{
 const dir=directory(t),store=credentials.createCredentialStore(dir,{isAsyncEncryptionAvailable:async()=>false});await assert.rejects(store.save('test-key'),/未保存密钥/);assert.equal(fs.existsSync(store.file),false);
 fs.writeFileSync(store.file,'opaque old encrypted bytes');const state=await store.load();assert.equal(state.key,'');assert.equal(state.saved,true);assert.match(state.error,/不可用/);assert.equal(fs.readFileSync(store.file,'utf8'),'opaque old encrypted bytes');
 const broken=credentials.createCredentialStore(dir,{isAsyncEncryptionAvailable:async()=>true,decryptStringAsync:async()=>{throw Error('different Windows user');}});assert.equal((await broken.load()).key,'');assert.match((await broken.load()).error,/原文件已保留/);
});
