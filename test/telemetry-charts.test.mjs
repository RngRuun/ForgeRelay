import test from 'node:test';import assert from 'node:assert/strict';
import {minuteBuckets,monotonePath,minuteBarChart} from '../public/telemetry-charts.js';
test('minute histogram uses real minute boundaries, includes retries and preserves empty minutes',()=>{
  const result=minuteBuckets([{id:'old',started:'2026-10-24T11:58:59Z'},{id:'a',started:'2026-10-24T12:00:59.999Z',status:'failed'},{id:'b',started:'2026-10-24T12:01:00.000Z'},{id:'c',started:'2026-10-24T12:01:59.999Z'},{id:'unknown',started:'invalid'}],3);
  assert.deepEqual(result.bins.map(x=>x.count),[0,1,2]);assert.equal(result.total,3);assert.equal(result.untimed,1);assert.equal(result.anchor,Date.parse('2026-10-24T12:01:00Z'));assert.equal(result.bins.at(-1).calls.at(-1).id,'c');
  assert.deepEqual(minuteBuckets([]),{bins:[],anchor:null,untimed:0,total:0});assert.match(minuteBarChart([]),/尚无调用记录/);
});
test('smooth token interpolation stays inside every original segment envelope',()=>{
  const points=[[0,80],[10,10],[20,70],[30,70],[40,0]],curve=monotonePath(points);
  const parts=[...curve.matchAll(/C([^C]+)/g)];assert.equal(parts.length,points.length-1);
  for(let i=0;i<parts.length;i++){
    const n=parts[i][1].match(/-?[\d.]+(?:e[+-]?\d+)?/gi).map(Number),a=points[i],b=points[i+1];
    for(let k=0;k<=100;k++){const t=k/100,y=(1-t)**3*a[1]+3*(1-t)**2*t*n[1]+3*(1-t)*t*t*n[3]+t**3*b[1];assert.ok(y>=Math.min(a[1],b[1])-1e-9&&y<=Math.max(a[1],b[1])+1e-9);}
  }
});
