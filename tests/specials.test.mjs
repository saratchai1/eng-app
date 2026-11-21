import test from 'node:test';
import assert from 'node:assert/strict';
import {lineLength,polygonArea,normalizeTakeoffState,validImageData,scoreQuiz} from '../src/specials.js';

test('line length uses both axes and is translation independent',()=>{
  assert.equal(lineLength({x:1,y:2},{x:4,y:6}),5);
  assert.equal(lineLength({x:-10,y:30},{x:-7,y:34}),5);
  assert.throws(()=>lineLength({x:NaN,y:2},{x:0,y:0}));
});
test('polygon area supports either winding and concave shapes',()=>{
  const rect=[{x:0,y:0},{x:6,y:0},{x:6,y:4},{x:0,y:4}];
  assert.equal(polygonArea(rect),24);
  assert.equal(polygonArea([...rect].reverse()),24);
  assert.equal(polygonArea([...rect,rect[0]]),24);
  assert.equal(polygonArea([{x:0,y:0},{x:4,y:0},{x:4,y:1},{x:1,y:1},{x:1,y:4},{x:0,y:4}]),7);
});
test('self-intersecting polygons and duplicate consecutive vertices are rejected',()=>{
  assert.throws(()=>polygonArea([{x:0,y:0},{x:4,y:4},{x:0,y:4},{x:4,y:0}]),/ตัดกัน/);
  assert.throws(()=>polygonArea([{x:0,y:0},{x:4,y:0},{x:4,y:0},{x:0,y:4}]));
});
test('takeoff scale is derived from calibrated distance and rectangular pixel geometry',()=>{
  const s=normalizeTakeoffState({calibration:{points:[{x:0,y:0},{x:.375,y:.8}],meters:10},metersPerPixel:999,measures:[]});
  assert.equal(s.metersPerPixel,.02); // 300 px by 400 px = 500 px.
  assert.equal(s.width,800);
});
test('import rejects unsafe image types, oversized images and out-of-image points',()=>{
  assert.equal(validImageData('data:image/svg+xml;base64,AAAA'),false);
  assert.equal(validImageData('data:text/html;base64,AAAA'),false);
  assert.equal(validImageData('https://example.com/test.jpg'),false);
  assert.equal(validImageData('data:image/png;base64,AA" onload="x'),false);
  assert.throws(()=>normalizeTakeoffState({image:{src:'data:image/png;base64,AAAA',width:20000,height:2}}));
  assert.throws(()=>normalizeTakeoffState({measures:[{type:'length',points:[{x:-1,y:0},{x:1,y:1}]}]}));
});
test('uploaded image needs calibration even if imported scale claims to be valid',()=>{
  const state=normalizeTakeoffState({image:{src:'data:image/png;base64,AAAA',width:800,height:500,name:'example.png'},metersPerPixel:.02,measures:[],mode:'length'});
  assert.equal(state.metersPerPixel,null);
  assert.equal(state.mode,'calibrate');
});
test('quiz score preserves unanswered and validates option indices',()=>{
  assert.deepEqual(scoreQuiz(Array(12).fill(null)),{score:0,answered:0,total:12});
  assert.deepEqual(scoreQuiz([0,2,1,3,1,2,0,3,1,2,3,0]),{score:12,answered:12,total:12});
  assert.throws(()=>scoreQuiz([0]));
  assert.throws(()=>scoreQuiz(Array(12).fill(4)));
});
