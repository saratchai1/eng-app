import test from 'node:test';
import assert from 'node:assert/strict';
import {engineeringTools, defaultInputs} from '../src/engineering.js';
import {quantityTools} from '../src/quantities.js';
import {sensitivityFields, defaultSensitivityRange, runSensitivity, sensitivitySegments, sensitivityApplication, sensitivityReport, restoreSensitivitySettings, sensitivityReportFromSettings} from '../src/sensitivity.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9*Math.max(1,Math.abs(expected)),`${actual} ≈ ${expected}`);
const inputsFor=definition=>Object.fromEntries(definition.inputGroups.flatMap(group=>group.fields.map(field=>[field.key,field.default])));

test('beam depth sweep matches independent flexure slope while leaving the source inputs unchanged',()=>{
  const def=engineeringTools['rc-beam'],inputs=defaultInputs('rc-beam'),before=structuredClone(inputs);
  const study=runSensitivity(def,inputs,{fieldKey:'d',metricIndex:0,low:400,high:600});
  const area=4*Math.PI*20**2/4,a=area*400/(0.85*28*300);
  assert.equal(study.samples.length,9);
  for(const sample of study.samples){assert.equal(sample.status,'calculated');near(sample.value,0.9*area*400*(sample.inputValue-a/2)*1e-6);}
  near(study.samples[8].value-study.samples[0].value,0.9*area*400*200*1e-6);
  assert.deepEqual(inputs,before);
  assert.equal(study.samples.filter(sample=>sample.isCurrent).length,1);
  assert.equal(study.segments.length,1);
  assert.equal(study.metric.unit,'kN·m');
});

test('sampling includes an off-grid current value and both endpoints without losing the nine-point order',()=>{
  const def=engineeringTools['rc-beam'],inputs={...defaultInputs('rc-beam'),d:517};
  const study=runSensitivity(def,inputs,{fieldKey:'d',low:450,high:610});
  assert.equal(study.samples.length,9);assert.equal(study.samples[0].inputValue,450);assert.equal(study.samples[8].inputValue,610);
  assert.ok(study.samples.some(sample=>sample.inputValue===517&&sample.isCurrent));
  assert.ok(study.samples.every((sample,index,array)=>index===0||sample.inputValue>array[index-1].inputValue));
  const outside=runSensitivity(def,inputs,{fieldKey:'d',low:600,high:700});
  assert.ok(outside.samples.every(sample=>!sample.isCurrent));assert.equal(outside.reference.inputValue,517);
});

test('independent continuous fields exclude counts and constrained index weights, with bounded zero-input ranges',()=>{
  assert.ok(!sensitivityFields(engineeringTools['rc-beam']).some(field=>field.key==='count'));
  assert.ok(!sensitivityFields(engineeringTools.shoring).some(field=>field.key==='legs'));
  const indexFields=sensitivityFields(quantityTools['factor-k']).map(field=>field.key);
  for(const key of ['fixed','labor','cement','steel'])assert.ok(!indexFields.includes(key));
  assert.ok(indexFields.includes('cementNow'));
  const wallWater=sensitivityFields(engineeringTools['retaining-wall']).find(field=>field.key==='waterHeight');
  const range=defaultSensitivityRange(wallWater,0);assert.equal(range.low,0);assert.ok(range.high>0&&range.high<=wallWater.max);
  const concrete=sensitivityFields(engineeringTools['rc-beam']).find(field=>field.key==='fc');
  assert.equal(defaultSensitivityRange(concrete,28).high,28);
});

test('invalid bounds and invalid base inputs cannot produce a plausible sensitivity study',()=>{
  const def=engineeringTools['rc-beam'],inputs=defaultInputs('rc-beam');
  for(const range of [{low:NaN,high:600},{low:600,high:400},{low:400,high:400},{low:49,high:600},{low:400,high:2501},{low:'400',high:600}])assert.throws(()=>runSensitivity(def,inputs,{fieldKey:'d',...range}));
  assert.throws(()=>runSensitivity(def,{...inputs,count:4.2},{fieldKey:'d',low:400,high:600}),/จำนวนเต็ม/);
  assert.throws(()=>runSensitivity(def,inputs,{fieldKey:'count',low:2,high:6}),/ต่อเนื่อง/);
  assert.throws(()=>runSensitivity(def,inputs,{fieldKey:'d',metricIndex:99,low:400,high:600}),/ผลลัพธ์/);
});

test('invalid geometries remain visible with reasons and cannot be used as applied samples',()=>{
  const def=engineeringTools['retaining-wall'],inputs=defaultInputs('retaining-wall');
  const study=runSensitivity(def,inputs,{fieldKey:'width',metricIndex:0,low:0.3,high:3});
  const invalid=study.samples.filter(sample=>sample.status==='invalid');
  assert.ok(invalid.length>0);assert.ok(invalid.every(sample=>sample.value===null&&/heel/.test(sample.note)));
  assert.ok(study.samples.some(sample=>sample.status==='calculated'));
  assert.throws(()=>sensitivityApplication(def,study,invalid[0].index,inputs),/คำนวณผล/);
});

test('out-of-scope capacities never become zero and disconnected data never gains a chart segment',()=>{
  const def=engineeringTools.footing,inputs=defaultInputs('footing');
  const study=runSensitivity(def,inputs,{fieldKey:'moment',metricIndex:0,low:-800,high:800});
  const unavailable=study.samples.filter(sample=>sample.status==='unassessed');
  assert.ok(unavailable.length>0);assert.ok(unavailable.every(sample=>sample.value===null));
  assert.ok(study.samples.some(sample=>sample.status==='calculated'));
  const samples=[{status:'calculated',value:0,index:0},{status:'unassessed',value:null,index:1},{status:'calculated',value:5,index:2},{status:'invalid',value:null,index:3},{status:'calculated',value:8,index:4},{status:'calculated',value:10,index:5}];
  assert.deepEqual(sensitivitySegments(samples).map(segment=>segment.map(sample=>sample.index)),[[0],[2],[4,5]]);
});

test('a chosen sample changes only its field, and pending or stale input edits prevent application',()=>{
  const def=engineeringTools['rc-beam'],inputs=defaultInputs('rc-beam');
  const study=runSensitivity(def,inputs,{fieldKey:'d',low:400,high:600});
  assert.deepEqual(sensitivityApplication(def,study,8,inputs),{fieldKey:'d',value:600});
  assert.equal(inputs.d,500);assert.equal(inputs.mu,150);
  assert.throws(()=>sensitivityApplication(def,study,8,{...inputs,mu:151}),/เปลี่ยนแล้ว/);
  assert.throws(()=>sensitivityApplication(engineeringTools.footing,study,8,inputs),/เปลี่ยนแล้ว/);
  assert.throws(()=>sensitivityApplication(def,study,99,inputs),/เลือกตัวอย่าง/);
});

test('weighted price sensitivity follows the existing linear price equation and reports failed checks truthfully',()=>{
  const def=quantityTools['factor-k'],inputs=inputsFor(def);
  const study=runSensitivity(def,inputs,{fieldKey:'cementNow',metricIndex:2,low:100,high:120});
  for(const sample of study.samples)near(sample.value,inputs.amount*(inputs.labor*(inputs.laborNow-inputs.laborBase)/inputs.laborBase+inputs.cement*(sample.inputValue-inputs.cementBase)/inputs.cementBase+inputs.steel*(inputs.steelNow-inputs.steelBase)/inputs.steelBase));
  const beam=engineeringTools['rc-beam'];
  const deficient=runSensitivity(beam,{...defaultInputs('rc-beam'),mu:1000},{fieldKey:'d',low:400,high:600});
  assert.ok(deficient.samples.every(sample=>sample.status==='calculated'&&sample.failedChecks.length>0));
  const report=sensitivityReport(deficient);assert.match(report,/ไม่ผ่าน/);assert.doesNotMatch(report,/<input|<button/);
});

test('study settings survive JSON roundtrip with custom bounds while imported answers are discarded',()=>{
  const def=engineeringTools['rc-beam'];
  const settings={schemaVersion:1,toolId:def.id,fieldKey:'d',metricIndex:0,low:440.125,high:690.875,includeInReport:true};
  const restored=restoreSensitivitySettings(def,JSON.parse(JSON.stringify({...settings,answers:[777777],samples:[{value:777777}],report:'<script>fake report</script>'})));
  assert.deepEqual(restored,settings);
  assert.deepEqual(Object.keys(restored),['schemaVersion','toolId','fieldKey','metricIndex','low','high','includeInReport']);
  assert.equal(runSensitivity(def,defaultInputs('rc-beam'),restored).low,440.125);
  assert.equal(runSensitivity(def,defaultInputs('rc-beam'),restored).high,690.875);
});

test('invalid or foreign imported settings are rejected for reset instead of coercing values',()=>{
  const def=engineeringTools['rc-beam'];
  const settings={schemaVersion:1,toolId:def.id,fieldKey:'d',metricIndex:0,low:400,high:600,includeInReport:false};
  for(const patch of [{schemaVersion:2},{toolId:'footing'},{fieldKey:'count'},{fieldKey:'missing'},{metricIndex:-1},{metricIndex:99},{metricIndex:'0'},{low:null},{low:'400'},{low:NaN},{low:49},{high:2501},{low:600},{includeInReport:'false'}])assert.equal(restoreSensitivitySettings(def,{...settings,...patch}),null,JSON.stringify(patch));
  for(const invalid of [null,undefined,[],false,42])assert.equal(restoreSensitivitySettings(def,invalid),null);
  assert.equal(restoreSensitivitySettings(quantityTools['factor-k'],{...settings,toolId:'factor-k',fieldKey:'cement',low:0.2,high:0.4}),null);
});

test('opted-in reports use current inputs rather than old imported calculations and block invalid settings',()=>{
  const def=engineeringTools['rc-beam'],inputs=defaultInputs('rc-beam');
  const settings={schemaVersion:1,toolId:def.id,fieldKey:'d',metricIndex:1,low:400,high:600,includeInReport:true,samples:[{value:777777}]};
  const first=sensitivityReportFromSettings(def,{...inputs,mu:123},settings);
  const changed=sensitivityReportFromSettings(def,{...inputs,mu:234},settings);
  assert.match(first,/>123<\/td>/);assert.match(changed,/>234<\/td>/);assert.doesNotMatch(changed,/777777|>123<\/td>/);
  assert.throws(()=>sensitivityReportFromSettings(def,inputs,{...settings,low:null}),/การตั้งค่า/);
  assert.throws(()=>sensitivityReportFromSettings(def,{...inputs,d:null},settings),/ตัวเลข/);
  assert.equal(sensitivityReportFromSettings(def,{...inputs,d:null},{...settings,low:null,includeInReport:false}),'');
});

test('reports retain unassessed results when current design leaves the supported capacity domain',()=>{
  const def=engineeringTools['rc-beam'];
  const settings={schemaVersion:1,toolId:def.id,fieldKey:'mu',metricIndex:0,low:100,high:200,includeInReport:true};
  const report=sensitivityReportFromSettings(def,{...defaultInputs('rc-beam'),b:150,d:150,count:8,diameter:32},settings);
  assert.match(report,/ไม่มีผลเชิงตัวเลข/);assert.match(report,/ไม่ประเมิน/);
  assert.doesNotMatch(report,/class="study-response-line"|<input|<button/);
  assert.match(report,/<details class="study-check-details" open>/);
});
