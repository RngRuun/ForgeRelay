import fs from 'node:fs';
import path from 'node:path';

// Validate the strict object contract before launching a billable CLI request.
// This checks required/additionalProperties recursively, not the whole provider dialect.
export function assertStrictSchemaShape(schema,label='输出 schema'){
  const fail=(at,message)=>{throw Error(`${label} 无效（${at}）：${message}`);};
  if(schema?.type!=='object')fail('$','根节点必须是 object');
  function visit(node,at){
    if(!node||typeof node!=='object'||Array.isArray(node))fail(at,'节点必须是 schema 对象');
    if(node.type==='object'||node.properties){
      const properties=node.properties;
      if(!properties||typeof properties!=='object'||Array.isArray(properties))fail(at,'缺少 properties');
      if(node.additionalProperties!==false)fail(at,'additionalProperties 必须为 false');
      if(!Array.isArray(node.required)||node.required.some(k=>typeof k!=='string')||new Set(node.required).size!==node.required.length)fail(at,'required 必须是无重复字段的数组');
      const missing=Object.keys(properties).filter(k=>!node.required.includes(k)),unknown=node.required.filter(k=>!Object.hasOwn(properties,k));
      if(missing.length)fail(at,'required 缺少 '+missing.join('、'));
      if(unknown.length)fail(at,'required 包含未定义字段 '+unknown.join('、'));
      for(const [key,value]of Object.entries(properties))visit(value,at+'.properties.'+key);
    }
    if(node.items)visit(node.items,at+'.items');
    for(const keyword of ['anyOf','oneOf','allOf'])if(Array.isArray(node[keyword]))node[keyword].forEach((branch,i)=>visit(branch,at+'.'+keyword+'['+i+']'));
    if(node.$defs)for(const [key,value]of Object.entries(node.$defs))visit(value,at+'.$defs.'+key);
  }
  visit(schema,'$');return schema;
}
export function outputSchemaPath(root,name){
  const filename=name==='conversation'?'conversation.schema.json':name==='director'?'director.schema.json':name==='discussion'?'discussion.schema.json':'plan.schema.json',file=path.join(root,filename);
  assertStrictSchemaShape(JSON.parse(fs.readFileSync(file,'utf8')),filename);return file;
}
