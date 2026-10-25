import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';
import {assertStrictSchemaShape,outputSchemaPath} from '../output-schema.mjs';
import {createCodexAdapter} from '../adapters.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('所有 CLI 输出 schema 的对象均满足严格必填字段契约',()=>{
 for(const name of ['discussion','director','plan']){const file=outputSchemaPath(root,name),schema=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(assertStrictSchemaShape(schema),schema);}
 const schema=JSON.parse(fs.readFileSync(path.join(root,'discussion.schema.json'),'utf8'));assert.ok(schema.required.includes('directiveHash'));assert.ok(schema.required.includes('signals'));
});
test('遗漏根字段、嵌套数组字段或 additionalProperties 会被明确定位',()=>{
 const original=JSON.parse(fs.readFileSync(path.join(root,'discussion.schema.json'),'utf8'));
 const rootMissing=structuredClone(original);rootMissing.required=rootMissing.required.filter(k=>k!=='directiveHash');assert.throws(()=>assertStrictSchemaShape(rootMissing),/required 缺少 directiveHash/);
 const nested=structuredClone(original);nested.properties.signals.items.required=nested.properties.signals.items.required.filter(k=>k!=='blocking');assert.throws(()=>assertStrictSchemaShape(nested),/properties.signals.items.*缺少 blocking/);
 const extra=structuredClone(original);delete extra.properties.analysis.items.additionalProperties;assert.throws(()=>assertStrictSchemaShape(extra),/properties.analysis.items.*additionalProperties/);
});
test('无效 schema 在启动 Codex 之前被拦截，不发出远程推理请求',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-schema-test-'));t.after(()=>{const target=fs.realpathSync(dir);assert.ok(target.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'relay-schema-test-'));fs.rmSync(target,{recursive:true,force:true});});
 const schema=JSON.parse(fs.readFileSync(path.join(root,'discussion.schema.json'),'utf8'));schema.required=schema.required.filter(k=>k!=='directiveHash');fs.writeFileSync(path.join(dir,'discussion.schema.json'),JSON.stringify(schema));let spawns=0;
 const adapter=createCodexAdapter({bin:'test-only',root:dir,config:{},spawnProcess:()=>{spawns++;throw Error('不应启动任何 CLI');}});
 await assert.rejects(adapter({task:{workspace:dir},prompt:'fixture',schema:'discussion',readOnly:true,stateless:true,signal:new AbortController().signal,onEvent:()=>{},onUsage:()=>{}}),/required 缺少 directiveHash/);assert.equal(spawns,0);
});
