import test from 'node:test';
import assert from 'node:assert/strict';
import {engineeringTools,defaultInputs} from '../src/engineering.js';
import {projectSignals,studioHomeLead,calculationReview,calculationOverview} from '../src/studio.js';

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

test('review brief prioritizes failed checks and preserves unassessed checks separately',()=>{
  const result={checks:[
    {label:'No capacity',pass:null},
    {label:'Moment',pass:false},
    {label:'Geometry',pass:true},
    {label:'Outside scope',pass:undefined},
    {label:'String is not a boolean',pass:'true'},
    {label:'Sliding',pass:false},
  ]};
  const review=calculationReview(result);
  assert.deepEqual({pass:review.pass,fail:review.fail,unassessed:review.unassessed,total:review.total,state:review.state},
    {pass:1,fail:2,unassessed:3,total:6,state:'fail'});
  assert.deepEqual(review.observations,[{label:'Moment',status:'fail'},{label:'Sliding',status:'fail'},{label:'No capacity',status:'unassessed'}]);
  assert.equal(review.remaining,2);
  assert.match(calculationOverview(result),/และอีก 2 รายการ/);
});

test('quantity-only results are not labeled as passed criteria and review labels are escaped',()=>{
  assert.equal(calculationReview({summary:[]}).state,'quantity');
  assert.equal(calculationReview({checks:[{label:'Unspecified',pass:null}]}).state,'unassessed');
  assert.equal(calculationReview({checks:[{label:'Actual pass',pass:true}]}).state,'assessed');
  const quantity=calculationOverview({summary:[]});
  assert.doesNotMatch(quantity,/studio-review-counts|ผลตรวจตามแบบจำลองพร้อมให้ทบทวน/);
  const unsafe=calculationOverview({checks:[{label:'<img src=x onerror=alert(1)>',pass:false}]});
  assert.match(unsafe,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(unsafe,/<img src=x/);
});

test('home work counts remain zero when no project is saved',()=>{
  const html=studioHomeLead([],engineeringTools);
  assert.equal((html.match(/class="overview-value">00</g)||[]).length,3);
  assert.match(html,/สร้างงานแรก/);
  assert.doesNotMatch(html,/studio-register-head/);
});
