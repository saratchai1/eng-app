import test from 'node:test';
import assert from 'node:assert/strict';
import {engineeringTools,defaultInputs} from '../src/engineering.js';
import {projectSignals,studioHomeLead} from '../src/studio.js';

test('project overview separates calculated model checks from human review declarations',()=>{
  const record={id:'beam',name:'Beam',toolId:'rc-beam',data:defaultInputs('rc-beam')};
  const signals=projectSignals(record,engineeringTools);
  assert.equal(signals.assessment.fail,0);
  assert.equal(signals.assessment.pass,2);
  assert.equal(signals.review.completed,0);
  assert.equal(signals.issue,false);
  assert.equal(signals.document.preparedBy,'');
  const workflow=projectSignals({toolId:'planning',data:{}},engineeringTools);
  assert.equal(workflow.assessment,null);
  assert.equal(workflow.calculator,false);
  assert.equal(workflow.review.completed,0);
});

test('invalid data and unassessed capacities remain observations without invented numeric success',()=>{
  const bad=projectSignals({toolId:'rc-beam',data:{...defaultInputs('rc-beam'),d:null}},engineeringTools);
  assert.equal(bad.issue,true);
  assert.equal(bad.assessment,null);
  assert.equal(bad.metrics.length,0);
  const limited=projectSignals({toolId:'rc-beam',data:{...defaultInputs('rc-beam'),d:50,count:24}},engineeringTools);
  assert.equal(limited.issue,true);
  assert.equal(Number.isFinite(limited.metrics[0].value),false);
  assert.notEqual(limited.metrics[0].value,0);
  const html=studioHomeLead([{id:'a',toolId:'rc-beam',name:'<img src=x onerror=alert(1)>',data:{...defaultInputs('rc-beam'),d:null}}],engineeringTools);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html,/<img src=x/);
  assert.match(html,/ข้อมูลคำนวณต้องตรวจแก้/);
});
