import test from 'node:test';
import assert from 'node:assert/strict';
import {lineLength,polygonArea,normalizeTakeoffState,validImageData,inspectImageData,measurement,takeoffSummary,scoreQuiz} from '../src/specials.js';

const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFklEQVR4nGO8++YBAwMDAwMDEwMMAAAwGwKtwBLI/gAAAABJRU5ErkJggg==';
const WEBP='data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAkAAAAdQ9nYXvP+BiOh/AAA=';
const JPEG='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD2aiiioMT/2Q==';

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
  const state=normalizeTakeoffState({image:{src:PNG,width:3,height:2,name:'example.png'},metersPerPixel:.02,measures:[],mode:'length'});
  assert.equal(state.metersPerPixel,null);
  assert.equal(state.mode,'calibrate');
});
test('quiz score preserves unanswered and validates option indices',()=>{
  assert.deepEqual(scoreQuiz(Array(12).fill(null)),{score:0,answered:0,total:12});
  assert.deepEqual(scoreQuiz([0,2,1,3,1,2,0,3,1,2,3,0]),{score:12,answered:12,total:12});
  assert.throws(()=>scoreQuiz([0]));
  assert.throws(()=>scoreQuiz(Array(12).fill(4)));
  assert.throws(()=>scoreQuiz(Array(12)));
});
test('raster signatures and intrinsic dimensions are validated',()=>{
  for(const src of [PNG,WEBP]){
    const info=inspectImageData(src);
    assert.equal(info.width,3);assert.equal(info.height,2);assert.equal(validImageData(src),true);
  }
  assert.equal(validImageData('data:image/png;base64,AAAA'),false);
  assert.equal(validImageData(PNG.replace('image/png','image/jpeg')),false);
  assert.equal(validImageData(PNG.slice(0,-20)),false);
});
test('JPEG EXIF rotation swaps the dimensions used by image calibration',()=>{
  const info=inspectImageData(JPEG);
  assert.equal(info.orientation,6);assert.equal(info.width,2);assert.equal(info.height,3);
  const state=normalizeTakeoffState({image:{src:JPEG,width:2,height:3},measures:[]});
  assert.equal(state.width,2);assert.equal(state.height,3);
});
test('stored image dimension mismatch is rejected instead of distorting scale',()=>{
  assert.throws(()=>normalizeTakeoffState({image:{src:PNG,width:300,height:200},calibration:{points:[{x:0,y:0},{x:1,y:0}],meters:3}}),/ไม่ตรง/);
});
test('decoded image limit applies even at a base64 padding boundary',()=>{
  const large='data:image/png;base64,'+Buffer.alloc(2*1024*1024+1).toString('base64');
  assert.equal(validImageData(large),false);
});
test('import refuses zero-length saved measurements',()=>{
  assert.throws(()=>normalizeTakeoffState({measures:[{type:'length',points:[{x:.2,y:.3},{x:.2,y:.3}]}]}),/ต้องต่างกัน/);
});
test('calibrated quantities and totals preserve dimensions and rescale correctly',()=>{
  const raw={measures:[
    {type:'length',points:[{x:.1,y:.2},{x:.6,y:.2}]},
    {type:'area',points:[{x:.1,y:.2},{x:.6,y:.2},{x:.6,y:.6},{x:.1,y:.6}]},
    {type:'count',points:[{x:.2,y:.2},{x:.3,y:.3},{x:.4,y:.4}]}
  ]};
  const state=normalizeTakeoffState(raw);
  assert.deepEqual(takeoffSummary(state),{length:8,area:32,count:3});
  assert.deepEqual(measurement(state.measures[1],state),{value:32,unit:'m²'});
  const updated=normalizeTakeoffState({...state,calibration:{...state.calibration,meters:24}});
  assert.deepEqual(takeoffSummary(updated),{length:16,area:128,count:3});
});
