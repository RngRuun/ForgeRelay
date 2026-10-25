import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compatibleEngine} from '../cli.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('Windows release includes document extractor and builtin skill while excluding runtime data',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'desktop/package.json'),'utf8'));
  const engine=config.build.extraResources.find(resource=>resource.to==='engine');
  for(const required of ['*.py','skills/**/*','public/**/*','package.json'])assert.ok(engine.filter.includes(required),'missing release input: '+required);
  for(const excluded of ['!data/**','!outputs/**','!test/**','!node_modules/**'])assert.ok(engine.filter.includes(excluded));
  assert.ok(fs.existsSync(path.join(root,'extract_document.py')));
  assert.ok(fs.readFileSync(path.join(root,'skills/deepseek-coauthor/SKILL.md'),'utf8').includes('deepseek-coauthor'));
  assert.equal(config.version,JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version);
});
test('CLI accepts compatible patch releases and rejects unknown protocols and unrelated services',()=>{
  for(const version of ['0.5.0','0.6.0','0.6.1','0.6.99'])assert.equal(compatibleEngine({app:'relay-workbench',version,humanLoopVersion:1}),true);
  for(const health of [{app:'other',version:'0.6.1',humanLoopVersion:1},{app:'relay-workbench',version:'0.6.1',humanLoopVersion:2},{app:'relay-workbench',version:'0.7.0',humanLoopVersion:1},null])assert.equal(compatibleEngine(health),false);
});
