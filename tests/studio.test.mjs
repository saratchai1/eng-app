import test from 'node:test';
import assert from 'node:assert/strict';
import {engineeringTools,defaultInputs} from '../src/engineering.js';
import {projectSignals,projectSignalMarkup,studioHomeLead,calculationReview,calculationOverview} from '../src/studio.js';
import {captureReviewItem} from '../src/review-register.js';

const reviewedBeam = ({id='review-one',sequence=1,status='closed',document={}}={}) => captureReviewItem(
  engineeringTools['rc-beam'], defaultInputs('rc-beam'),
  {id,sequence,title:'ตรวจข้อมูลหน้าตัด',detail:'อ้างอิงแบบ STR-002',owner:'ผู้ตรวจตัวอย่าง',priority:'normal',status,response:status==='open'?'':'ตรวจเทียบกับแบบแล้ว',now:'2026-11-21T10:00:00.000Z',document},
);
const reviewState = items => ({schemaVersion:1,toolId:'rc-beam',nextSequence:Math.max(...items.map(item=>item.sequence))+1,items});

test('project overview separates calculated model checks from human review declarations',()=>{
  const record={id:'beam',name:'Beam',toolId:'rc-beam',data:defaultInputs('rc-beam')};
  const signals=projectSignals(record,engineeringTools);
  assert.equal(signals.assessment.fail,0);
  assert.equal(signals.assessment.pass,2);
  assert.equal(signals.review.completed,0);
  assert.equal(signals.issue,false);
  assert.equal(signals.document.preparedBy,'');
  assert.equal(signals.register.total,0);
  assert.equal(signals.register.outstanding,0);
  const workflow=projectSignals({toolId:'planning',data:{_review:{schemaVersion:1,toolId:'planning',items:[{status:'closed'}]}}},engineeringTools);
  assert.equal(workflow.assessment,null);
  assert.equal(workflow.calculator,false);
  assert.equal(workflow.review.completed,0);
  assert.deepEqual(workflow.register,{total:0,open:0,addressed:0,closed:0,needsReview:0,outstanding:0,criticalOutstanding:0,currentValid:false});
  assert.doesNotMatch(projectSignalMarkup(workflow),/ทะเบียนตรวจทาน|ประเด็นปิดโดยผู้ใช้/);
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

test('saved project review closure becomes outstanding when calculation inputs change, independently of passing model checks',()=>{
  const inputs=defaultInputs('rc-beam');
  const register=reviewState([reviewedBeam()]);
  const record={id:'beam',name:'Beam',toolId:'rc-beam',data:{...inputs,_review:register}};
  const original=projectSignals(record,engineeringTools);
  assert.equal(original.register.closed,1);
  assert.equal(original.register.outstanding,0);
  assert.match(projectSignalMarkup(original),/ประเด็นปิดโดยผู้ใช้ 1\/1/);
  const changed=projectSignals({...record,data:{...record.data,d:600}},engineeringTools);
  assert.equal(changed.assessment.fail,0);
  assert.equal(changed.issue,false);
  assert.equal(changed.register.closed,0);
  assert.equal(changed.register.needsReview,1);
  assert.equal(changed.register.outstanding,1);
  assert.match(projectSignalMarkup(changed),/ประเด็นค้าง 1\/1 · ต้องตรวจซ้ำ 1/);
  assert.equal(register.items[0].status,'closed');
  assert.equal(register.items[0].reviewedInputs.d,inputs.d);
});

test('saved review signals follow source-context changes while revision labels alone do not imply a new technical context',()=>{
  const document={projectCode:'DEMO-26',client:'ตัวอย่าง',site:'อาคาร A',designBasis:'แบบ STR-002',revision:'P01'};
  const register=reviewState([reviewedBeam({document})]);
  const record={id:'beam',name:'Beam',toolId:'rc-beam',data:{...defaultInputs('rc-beam'),_review:register,_document:document}};
  const labelOnly=projectSignals({...record,data:{...record.data,_document:{...document,revision:'P02'}}},engineeringTools);
  assert.equal(labelOnly.register.closed,1);
  const changed=projectSignals({...record,data:{...record.data,_document:{...document,designBasis:'แบบ STR-003'}}},engineeringTools);
  assert.equal(changed.register.needsReview,1);
  assert.equal(changed.register.outstanding,1);
  assert.equal(changed.issue,false);
});

test('home separates projects with outstanding review items, item totals, stale confirmations and numerical observations',()=>{
  const open=reviewedBeam({id:'review-open',sequence:2,status:'open'});
  const records=[
    {id:'current',name:'Current',toolId:'rc-beam',data:{...defaultInputs('rc-beam'),_review:reviewState([reviewedBeam()])}},
    {id:'changed',name:'Changed',toolId:'rc-beam',data:{...defaultInputs('rc-beam'),d:600,_review:reviewState([reviewedBeam(),open])}},
  ];
  const html=studioHomeLead(records,engineeringTools);
  assert.deepEqual([...html.matchAll(/class="overview-value">(\d+)</g)].map(match=>match[1]),['02','01','00']);
  assert.match(html,/2 ประเด็น · ต้องตรวจซ้ำ 1/);
  assert.match(html,/รายการยืนยันการตรวจของผู้ใช้/);
  assert.match(html,/ยังไม่ครบ 2 งาน/);
  assert.match(html,/ประเด็นค้าง 2\/2 · ต้องตรวจซ้ำ 1/);
  assert.match(html,/ประเด็นปิดโดยผู้ใช้ 1\/1/);
});
