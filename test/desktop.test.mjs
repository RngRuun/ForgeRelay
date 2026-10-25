import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {desktopConfig,navigationAllowed,downloadAllowed,externalURL,activeItems,windowBounds}=require('../desktop/policy.cjs');
const origin='http://127.0.0.1:4317',root=path.resolve('test-data');
test('desktop accepts only validated local configuration',()=>{
  assert.deepEqual(desktopConfig({},root),{port:4317,dataDir:root});
  for(const invalid of [{port:80},{port:'4317'},{port:65536},{dataDir:'relative'},{dataDir:'C:\\bad\x00path'},null,[]])assert.throws(()=>desktopConfig(invalid,root));
});
test('desktop navigation cannot become a privileged general-purpose browser',()=>{
  assert.equal(navigationAllowed(origin+'/discussion?new=1',origin),true);
  assert.equal(navigationAllowed(origin+'/models?room=abc#team',origin),true);
  for(const url of ['https://example.com',origin+'/api/state','http://localhost:4317/discussion','file:///C:/Windows/explorer.exe',origin+'.example.com/discussion','javascript:alert(1)','http://user@127.0.0.1:4317/models'])assert.equal(navigationAllowed(url,origin),false,url);
});
test('desktop file export is restricted to actual attachment and report endpoints',()=>{
  for(const route of ['/api/discussions/abc-123/attachments/def-456/file','/api/discussions/abc/report','/api/tasks/abc/file?path=output.md','/api/tasks/abc/report'])assert.equal(downloadAllowed(origin+route,origin),true);
  for(const route of ['/api/state','/api/config','/api/tasks/abc/start','/api/discussions/abc/attachments/../../state'])assert.equal(downloadAllowed(origin+route,origin),false);
  assert.equal(downloadAllowed('https://example.com/api/tasks/abc/report',origin),false);
});
test('external links cannot launch file, shell, custom or credential-bearing URLs',()=>{
  assert.equal(externalURL('https://www.electronjs.org/docs/'),'https://www.electronjs.org/docs/');
  for(const url of ['file:///C:/a.exe','cmd:calc','ms-settings:privacy','javascript:alert(1)','https://user:pass@example.com','http://127.0.0.1:4317/api/state','http://localhost:4317'])assert.equal(externalURL(url),null);
});
test('desktop closing detects paused work and excludes deleted or completed work',()=>{
  assert.equal(activeItems({tasks:[{status:'paused'},{status:'running',deletedAt:'x'},{status:'done'}],rooms:[{status:'waiting_user'},{status:'stopped'}]}).length,2);
});
test('saved window geometry remains reachable after monitor changes',()=>{
  const area={x:0,y:0,width:1920,height:1080};
  assert.deepEqual(windowBounds({width:3200,height:4000,x:-8000,y:-5000},area),{width:1920,height:1080});
  assert.deepEqual(windowBounds({width:1000,height:700,x:20,y:30},area),{width:1000,height:700,x:20,y:30});
});
