import test from 'node:test';
import assert from 'node:assert/strict';
import {buildingQuantity,roadQuantity,canalQuantity,weightedIndex} from '../src/quantities.js';
import {csv,escapeHTML} from '../src/utils.js';

test('geometric takeoff distinguishes net concrete, purchase allowance and formwork',()=>{
 const p={length:6,width:.3,depth:.6,count:4,steelRatio:120,allowance:3,element:'beam'};
 const r=buildingQuantity(p);assert.ok(Math.abs(r.volume-4.32)<1e-9);assert.equal(r.formwork,36);assert.ok(Math.abs(r.order-4.4496)<1e-9);
 assert.ok(Math.abs(buildingQuantity({...p,element:'slab'}).formwork-7.2)<1e-9);
 assert.throws(()=>buildingQuantity({...p,count:1.5}));assert.throws(()=>buildingQuantity({...p,width:'0.3'}));
});
test('road quantities are consistent with compacted thickness and density',()=>{
 const r=roadQuantity({length:100,width:7,base:.15,subbase:.2,surface:.05,density:2.4,looseFactor:1.2});
 assert.equal(r.area,700);assert.equal(r.surface,35);assert.equal(r.asphaltMass,84);assert.equal(r.looseBase,126);
});
test('rectangular canal is valid zero-side-slope limiting case',()=>{
 const r=canalQuantity({bottom:2,depth:1.5,slope:0,length:100,thickness:.1});
 assert.equal(r.channelVolume,300);assert.equal(r.liningArea,500);
 // An open 2 m × 1.5 m channel, 0.1 m lining: outside is 2.2 m × 1.6 m.
 assert.ok(Math.abs(r.excavation-352)<1e-10);assert.ok(Math.abs(r.concrete-52)<1e-10);
});
test('canal concrete matches independent inner/outer polygon areas including thick lining and steep banks',()=>{
 const polygonArea=points=>Math.abs(points.reduce((sum,p,i)=>{
  const next=points[(i+1)%points.length];return sum+p[0]*next[1]-next[0]*p[1];
 },0))/2;
 for(const p of [
  {bottom:2,depth:1.5,slope:1.5,length:100,thickness:.1},
  {bottom:.01,depth:.01,slope:0,length:1,thickness:1},
  {bottom:.2,depth:.1,slope:10,length:1000,thickness:1},
  {bottom:1000,depth:100,slope:10,length:100000,thickness:1},
 ]) {
  const {bottom:b,depth:d,slope:z,length:L,thickness:t}=p,s=Math.sqrt(1+z*z);
  const inside=polygonArea([[-b/2,0],[b/2,0],[b/2+z*d,d],[-b/2-z*d,d]]);
  const outside=polygonArea([[-b/2+z*t-t*s,-t],[b/2-z*t+t*s,-t],[b/2+z*d+t*s,d],[-b/2-z*d-t*s,d]]);
  const r=canalQuantity(p),expected=(outside-inside)*L;
  assert.ok(Math.abs(r.concrete-expected)<=1e-9*Math.max(1,expected));
  assert.ok(Math.abs(r.excavation-outside*L)<=1e-9*Math.max(1,r.excavation));
  assert.ok(r.concrete>r.thinApproximation);
  assert.ok(r.outerBottom>0);
 }
});
test('zero lining returns zero concrete and exactly the clear channel excavation profile',()=>{
 const r=canalQuantity({bottom:2,depth:1.5,slope:1.5,length:100,thickness:0});
 assert.equal(r.concrete,0);assert.equal(r.cornerArea,0);
 assert.equal(r.excavation,r.channelVolume);assert.equal(r.outerArea,r.area);
});
test('weighted index reproduces neutral price, scales money, rejects invalid weights/bases',()=>{
 const p={fixed:.15,labor:.25,cement:.35,steel:.25,laborBase:100,laborNow:100,cementBase:100,cementNow:100,steelBase:100,steelNow:100,amount:1000000};
 assert.equal(weightedIndex(p).K,1);assert.equal(weightedIndex(p).difference,0);
 assert.ok(Math.abs(weightedIndex({...p,steelNow:120}).difference-50000)<1e-8);
 assert.throws(()=>weightedIndex({...p,laborBase:0}));assert.throws(()=>weightedIndex({...p,fixed:.2}));
});
test('tiny genuine weight mismatches cannot create fictional price differences on large projects',()=>{
 const p={fixed:.15,labor:.25,cement:.35,steel:.25,laborBase:100,laborNow:100,cementBase:100,cementNow:100,steelBase:100,steelNow:100,amount:1e12};
 assert.throws(()=>weightedIndex({...p,fixed:p.fixed+9e-9}),/ผลรวมน้ำหนัก/);
 assert.throws(()=>weightedIndex({...p,fixed:p.fixed-9e-9}),/ผลรวมน้ำหนัก/);
 const neutral=weightedIndex({...p,fixed:.1,labor:.2,cement:.3,steel:.4});
 assert.equal(neutral.K,1);assert.equal(neutral.difference,0);
 assert.equal(neutral.adjusted,1e12);
 const changed=weightedIndex({...p,steelNow:100.00000004});
 const expected=1e12*.25*(100.00000004-100)/100;
 assert.equal(changed.difference,expected);
 assert.ok(changed.difference>0);
});
test('exports escape markup and spreadsheet formulas',()=>{
 assert.equal(escapeHTML('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
 assert.match(csv([['=CMD()','a,b','"quote"',-12]]),/"'=CMD\(\)"/);
 assert.match(csv([['  =CMD()']]),/"'  =CMD\(\)"/);
 assert.match(csv([[-12]]),/"-12"/);
});
