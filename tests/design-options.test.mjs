import test from 'node:test';
import assert from 'node:assert/strict';
import {engineeringTools, defaultInputs} from '../src/engineering.js';
import {quantityTools} from '../src/quantities.js';
import {MAX_DESIGN_OPTIONS, designOptionInputs, captureDesignOption, restoreDesignOptions, designOptionApplication, evaluateDesignOptions, designOptionsReport} from '../src/design-options.js';

const beam=engineeringTools['rc-beam'];
const beamInputs=()=>({...defaultInputs('rc-beam'),b:300,d:500,fc:28,fy:400,count:4,diameter:20,mu:150});
const snapshot=(inputs=beamInputs(),id='option-one',label='แบบตั้งต้น')=>captureDesignOption(beam,inputs,{id,label});
const stateFor=(options,includeInReport=true)=>({schemaVersion:1,toolId:beam.id,options,includeInReport});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=Math.max(1,Math.abs(expected))*1e-10,`${actual} ≈ ${expected}`);
const defaults=definition=>Object.fromEntries(definition.inputGroups.flatMap(group=>group.fields).map(field=>[field.key,field.default]));

test('captured and applied alternatives are independent input-only snapshots',()=>{
  const original={...beamInputs(),_document:{projectCode:'not copied'},storedResult:999};
  const option=snapshot(original);
  original.d=600;
  assert.equal(option.inputs.d,500);
  assert.equal(Object.hasOwn(option.inputs,'_document'),false);
  assert.equal(Object.hasOwn(option.inputs,'storedResult'),false);
  const applied=designOptionApplication(beam,option);
  applied.inputs.d=700;
  assert.equal(option.inputs.d,500);
  assert.equal(original.d,600);
  assert.equal(applied.label,'แบบตั้งต้น');
});

test('multi-option beam values match an independent flexural calculation and depth increment',()=>{
  const initial=beamInputs();
  const deep={...initial,d:600};
  const study=evaluateDesignOptions(beam,stateFor([snapshot(initial,'one'),snapshot(deep,'two')]),initial);
  const area=4*Math.PI*20**2/4;
  const block=area*400/(.85*28*300);
  const expected=.9*area*400*(500-block/2)/1e6;
  near(study.columns[1].result.summary[0].value,expected);
  near(study.columns[2].result.summary[0].value-expected,.9*area*400*100/1e6);
  assert.deepEqual(study.changedFields.map(field=>field.key),['d']);
  assert.deepEqual(initial,beamInputs());
});

test('field validation rejects missing numbers, numeric strings, fractions in integer fields and non-finite inputs',()=>{
  const input=beamInputs();
  const missing={...input};delete missing.d;
  for(const values of [missing,{...input,d:'500'},{...input,count:3.5},{...input,d:Infinity},{...input,d:NaN},{...input,d:null},{...input,d:-1}]) assert.throws(()=>captureDesignOption(beam,values),/ขอบเขต/);
  assert.throws(()=>captureDesignOption(beam,input,{id:'current'}),/รหัส/);
});

test('select values are checked against their declared options before model evaluation',()=>{
  const definition={id:'typed',inputGroups:[{fields:[{key:'load',label:'Load',min:0,max:10},{key:'case',label:'Case',type:'select',options:[{value:'dead',label:'Dead'},{value:'live',label:'Live'}]}]}],calculate:inputs=>({summary:[{label:'Load',value:inputs.load,unit:'kN'}],checks:[]})};
  assert.deepEqual(designOptionInputs(definition,{load:2,case:'dead',foreign:100}),{load:2,case:'dead'});
  assert.throws(()=>captureDesignOption(definition,{load:2,case:'combined'}),/ขอบเขต/);
});

test('coupled constraints use the model domain gate and do not produce a false usable snapshot',()=>{
  const index=quantityTools['factor-k'];
  assert.throws(()=>captureDesignOption(index,{...defaults(index),fixed:.9}));
  const slab=engineeringTools['rc-slab'];
  assert.throws(()=>captureDesignOption(slab,{...defaults(slab),spacing:10,diameter:20}));
});

test('import rejects foreign schema, duplicate IDs and invalid candidates and clears report inclusion',()=>{
  const valid=snapshot();
  const imported=restoreDesignOptions(beam,stateFor([valid,{...valid},{...valid,id:'bad',inputs:{...valid.inputs,d:'500'}}]));
  assert.equal(imported.state.options.length,1);
  assert.equal(imported.rejected,2);
  assert.equal(imported.state.includeInReport,false);
  assert.match(imported.notice,/2/);
  const foreign=restoreDesignOptions(beam,{...stateFor([valid]),toolId:'footing'});
  assert.deepEqual(foreign.state.options,[]);
  assert.equal(foreign.state.includeInReport,false);
  assert.equal(foreign.rejected,1);
  assert.equal(restoreDesignOptions(beam,undefined).notice,'');
});

test('the imported collection is bounded to four visible alternatives',()=>{
  const options=Array.from({length:6},(_,index)=>snapshot(beamInputs(),`option-${index}`));
  const restored=restoreDesignOptions(beam,stateFor(options));
  assert.equal(MAX_DESIGN_OPTIONS,4);
  assert.equal(restored.state.options.length,4);
  assert.equal(restored.rejected,2);
  assert.equal(restored.state.includeInReport,false);
  assert.deepEqual(restored.state.options.map(option=>option.id),options.slice(0,4).map(option=>option.id));
});

test('import ignores fabricated answers and markup and reports recalculate using the current model',()=>{
  const option={...snapshot(),result:{capacity:987654321},html:'<script>alert(1)</script>',assessment:{pass:50},inputs:{...beamInputs(),injectedAnswer:999}};
  const restored=restoreDesignOptions(beam,stateFor([option]));
  assert.deepEqual(Object.keys(restored.state.options[0]),['id','label','note','inputs']);
  assert.equal(Object.hasOwn(restored.state.options[0].inputs,'injectedAnswer'),false);
  const updatedModel={...beam,calculate:input=>{const value=beam.calculate(input);return {...value,summary:value.summary.map((metric,index)=>index===0?{...metric,value:123.456}:metric)};}};
  const report=designOptionsReport(updatedModel,beamInputs(),restored.state);
  assert.match(report,/123\.46/);
  assert.doesNotMatch(report,/987654321|<script>|injectedAnswer/);
});

test('an invalid working draft leaves saved alternatives visible but cannot enter a report',()=>{
  const state=stateFor([snapshot()]);
  const study=evaluateDesignOptions(beam,state,{...beamInputs(),d:null});
  assert.ok(study.columns[0].error);
  assert.equal(study.columns[1].error,null);
  assert.equal(typeof study.columns[1].result.summary[0].value,'number');
  assert.throws(()=>designOptionsReport(beam,{...beamInputs(),d:null},state),/แก้ข้อมูล/);
});

test('out-of-scope flexure and unassessed checks remain visible without replacing answers by zero',()=>{
  const inputs={...beamInputs(),d:200,count:10,diameter:32};
  const option=snapshot(inputs,'over-reinforced');
  const study=evaluateDesignOptions(beam,stateFor([option]),beamInputs());
  assert.equal(study.columns[1].result.values.capacity,null);
  assert.equal(study.columns[1].assessment.fail,1);
  assert.equal(study.columns[1].assessment.unassessed,1);
  const report=designOptionsReport(beam,beamInputs(),stateFor([option]));
  assert.match(report,/นอกขอบเขต/);
  assert.match(report,/ไม่ประเมิน/);
  assert.doesNotMatch(report,/NaN|Infinity/);
});

test('reports escape names and notes and contain no editing or apply controls',()=>{
  const option=captureDesignOption(beam,beamInputs(),{id:'safe',label:'<img src=x onerror=alert(1)>',note:'<script>unsafe</script>\nตรวจแบบ A & B'});
  const report=designOptionsReport(beam,beamInputs(),stateFor([option]));
  assert.match(report,/&lt;img/);
  assert.match(report,/&lt;script&gt;/);
  assert.match(report,/A &amp; B/);
  assert.doesNotMatch(report,/<input|<textarea|<button|<script|<img/);
  assert.match(report,/ไม่จัดอันดับ/);
  assert.match(report,/ชุดที่ใช้สร้างรายงาน/);
  assert.match(report,/ชุดข้อมูลปัจจุบัน ณ เวลาสร้างรายงาน/);
  assert.doesNotMatch(report,/ปรับได้จากข้อมูลเข้า|เก็บชุดข้อมูลเพื่อบันทึกเหตุผลของทางเลือก/);
});

test('reports distinguish percent-point differences and require explicit inclusion',()=>{
  const option=snapshot({...beamInputs(),d:600});
  assert.equal(designOptionsReport(beam,beamInputs(),stateFor([option],false)),'');
  assert.match(designOptionsReport(beam,beamInputs(),stateFor([option])),/จุดเปอร์เซ็นต์/);
  assert.throws(()=>designOptionsReport(beam,beamInputs(),stateFor([])),/ชุดทางเลือก/);
  assert.throws(()=>designOptionsReport(beam,beamInputs(),stateFor([{...option,inputs:{...option.inputs,fc:99}}])),/ชุดทางเลือก/);
});

test('text is bounded, control characters removed, and missing labels receive a neutral fallback',()=>{
  const option=captureDesignOption(beam,beamInputs(),{id:'safe',label:'  \u0000  ',note:'n'.repeat(2000)});
  assert.equal(option.label,'ทางเลือก');
  assert.equal(option.note.length,1200);
  assert.equal(captureDesignOption(beam,beamInputs(),{id:'safe',label:'x'.repeat(200)}).label.length,80);
});

test('a model cannot mutate the inputs retained in a saved option or the working draft',()=>{
  const definition={id:'mutation-check',inputGroups:[{fields:[{key:'x',label:'Value',min:0,max:20}]}],calculate:inputs=>{const original=inputs.x;inputs.x=999;return {summary:[{label:'Value',value:original,unit:''}],checks:[]};}};
  const source={x:5};
  const option=captureDesignOption(definition,source,{id:'saved'});
  const state={schemaVersion:1,toolId:definition.id,options:[option],includeInReport:true};
  const study=evaluateDesignOptions(definition,state,source);
  assert.equal(source.x,5);
  assert.equal(option.inputs.x,5);
  assert.equal(study.columns[1].result.summary[0].value,5);
});
