import test from 'node:test';
import assert from 'node:assert/strict';
import {HUMAN_DIRECTIONS} from '../public/human-directions.js';
import {humanControl,interventionPayload} from '../public/human-loop-ui.js';

const room=()=>({revision:3,objections:[],governance:{pending:{id:'window-current',kind:'gap',title:'需要决定推进方式',question:'现有信息不足，应如何继续？',options:[{id:'option-1',label:'保留旧流程，接受较慢交付'}],objectionIds:[]}}});
function data(values={}){const f=new FormData();for(const [k,v] of Object.entries({action:'STEER',text:'',expectedRevision:'3',windowId:'window-current',...values}))f.set(k,v);return f;}

test('六个通用方向可不填文字，携带方向 ID 与过时校验字段，不冒充补充事实',()=>{
 assert.equal(HUMAN_DIRECTIONS.length,6);
 for(const direction of HUMAN_DIRECTIONS){
  const payload=interventionPayload(data({action:'INJECT',optionId:'direction:'+direction.id,text:'  '}),room());
  assert.equal(payload.action,'STEER');assert.equal(payload.directionId,direction.id);assert.equal(payload.optionId,undefined);assert.equal(payload.text,'');assert.equal(payload.expectedRevision,3);assert.equal(payload.windowId,'window-current');assert.equal(payload.manual,false);
 }
});

test('模型选项支持无文字裁决；空白与未知方向不能发请求',()=>{
 const payload=interventionPayload(data({action:'OVERRULE',optionId:'option-1'}),room());
 assert.equal(payload.optionId,'option-1');assert.equal(payload.directionId,undefined);assert.equal(payload.text,'');assert.equal(payload.action,'OVERRULE');
 assert.throws(()=>interventionPayload(data({text:' \n '}),room()),/请选择/);
 assert.throws(()=>interventionPayload(data({optionId:'direction:invented'}),room()),/有效的调整方向/);
 assert.throws(()=>interventionPayload(data({action:'INJECT',optionId:'option-1'}),room()),/补充事实需要填写/);
 const typed=interventionPayload(data({action:'INJECT',text:'  客户期限为周五。  '}),room());assert.equal(typed.text,'客户期限为周五。');assert.equal(typed.action,'INJECT');
});

test('人工窗口显示分组选项及可选输入；方向选择保持 STEER，转义模型内容',()=>{
 const r=room();r.governance.pending.options.push({id:'" onfocus="alert(1)',label:'<script>恶意内容</script>'});
 const markup=humanControl(r,'','INJECT','direction:existing-info');
 assert.match(markup,/<optgroup label="当前问题的选项">/);assert.match(markup,/<optgroup label="不补充信息，也可以继续">/);
 assert.match(markup,/value="direction:existing-info" selected/);assert.match(markup,/name="action" value="STEER" checked/);
 assert.match(markup,/选好方向后可不填/);assert.match(markup,/明确保留未知条件/);
 const textarea=markup.match(/<textarea[^>]+id="intervention-text"[^>]*>/)?.[0];assert.ok(textarea);assert.ok(!/\brequired\b/.test(textarea));
 assert.ok(!markup.includes('<script>'));assert.ok(!markup.includes('id="" onfocus="'));assert.match(markup,/&lt;script&gt;/);
});

test('主动调整也能选通用方向，忙碌时禁用整个表单',()=>{
 const r=room();r.governance.pending=null;
 const markup=humanControl(r,'','','direction:verify-first',true,'',true);
 assert.match(markup,/<fieldset disabled>/);assert.match(markup,/value="direction:verify-first" selected/);
 assert.ok(!markup.includes('当前问题的选项'));
 assert.equal(interventionPayload(data({optionId:'direction:verify-first',windowId:''}),r).manual,true);
});
