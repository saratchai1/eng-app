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
 assert.equal(r.excavation,300);assert.equal(r.liningArea,500);assert.equal(r.concrete,50);
});
test('weighted index reproduces neutral price, scales money, rejects invalid weights/bases',()=>{
 const p={fixed:.15,labor:.25,cement:.35,steel:.25,laborBase:100,laborNow:100,cementBase:100,cementNow:100,steelBase:100,steelNow:100,amount:1000000};
 assert.equal(weightedIndex(p).K,1);assert.equal(weightedIndex(p).difference,0);
 assert.ok(Math.abs(weightedIndex({...p,steelNow:120}).difference-50000)<1e-8);
 assert.throws(()=>weightedIndex({...p,laborBase:0}));assert.throws(()=>weightedIndex({...p,fixed:.2}));
});
test('exports escape markup and spreadsheet formulas',()=>{
 assert.equal(escapeHTML('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
 assert.match(csv([['=CMD()','a,b','"quote"',-12]]),/"'=CMD\(\)"/);
 assert.match(csv([['  =CMD()']]),/"'  =CMD\(\)"/);
 assert.match(csv([[-12]]),/"-12"/);
});
