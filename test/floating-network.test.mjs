import test from 'node:test';import assert from 'node:assert/strict';
import {cardPort,curvedConnection} from '../public/floating-geometry.js';
import {networkSceneLayout,topologySceneLayout,networkDiagram} from '../public/floating-diagrams.js';
import {resolveLeaderProvider} from '../public/telemetry.js';
test('control links follow the configured leader and never make context the controller',()=>{
  for(const leader of ['Codex','DeepSeek'])for(const compact of [false,true]){
    const scene=networkSceneLayout(leader,compact),peer=leader==='Codex'?'DeepSeek':'Codex';
    assert.ok(scene.edges.some(e=>e.from==='human'&&e.to===leader));
    assert.ok(scene.edges.some(e=>e.from===leader&&e.to===peer));
    assert.ok(!scene.edges.some(e=>e.from==='context'));
  }
  const team=[{id:'implement',provider:'Codex'},{id:'research',provider:'DeepSeek'}];
  assert.equal(resolveLeaderProvider([],{leaderId:'research',team}),'DeepSeek');
  assert.equal(resolveLeaderProvider([{id:'legacy',calls:[]}],{leaderId:'research',team}),'Codex');
  assert.equal(resolveLeaderProvider([{governance:{team:[{...team[1],lead:true}]}}]),'DeepSeek');
});
test('laboratory links connect the actual lead role directly to each independent reviewer',()=>{
  const roles=[{id:'implement',provider:'Codex'},{id:'research',provider:'DeepSeek',lead:true},{id:'critic',provider:'Codex'}];
  const original=JSON.stringify(roles),scene=topologySceneLayout(roles);
  assert.deepEqual(scene.edges.map(e=>[e.from,e.to]),[['research','implement'],['research','critic']]);assert.equal(JSON.stringify(roles),original);
});
test('wire endpoints remain attached to translated card boundaries',()=>{
  const a={x:12.75,y:18.5,w:138,h:62},b={x:190.25,y:153.75,w:175,h:64};
  for(const dx of [-3,0,3])for(const dy of [-4,0,4]){
    const moved={...b,x:b.x+dx,y:b.y+dy},curve=curvedConnection(a,moved);
    const p=curve.end,onHorizontal=(p.y===moved.y||p.y===moved.y+moved.h)&&p.x>=moved.x&&p.x<=moved.x+moved.w;
    const onVertical=(p.x===moved.x||p.x===moved.x+moved.w)&&p.y>=moved.y&&p.y<=moved.y+moved.h;
    assert.ok(onHorizontal||onVertical);assert.ok(!curve.d.includes('NaN'));assert.deepEqual(curve.end,cardPort(moved,a));
  }
});
