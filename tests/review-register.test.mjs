import test from 'node:test';
import assert from 'node:assert/strict';
import {engineeringTools,defaultInputs} from '../src/engineering.js';
import {quantityTools} from '../src/quantities.js';
import {MAX_REVIEW_ITEMS,captureReviewItem,updateReviewItem,restoreReviewRegister,reviewRegisterSummary,reviewRegisterReport,reopenReviewRegister,reviewDocumentContext,isReviewTimestamp,normalizeReviewPending} from '../src/review-register.js';

const beam=engineeringTools['rc-beam'];
const inputs=()=>({...defaultInputs('rc-beam'),b:300,d:500,fc:28,fy:400,count:4,diameter:20,mu:150});
const context=()=>({projectCode:'DEMO / STR-001',client:'เจ้าของโครงการตัวอย่าง',site:'อาคาร A',designBasis:'แรงดัดตามแบบวิเคราะห์ Rev A',revision:'P01',reviewItems:[{id:'inputs',checked:true}]});
const t0='2026-11-21T10:00:00.000Z',t1='2026-11-21T10:15:00.000Z',t2='2026-11-21T11:00:00.000Z';
const item=(draft={},values=inputs())=>captureReviewItem(beam,values,{id:'review-one',sequence:1,title:'ยืนยันแรงดัดออกแบบ',detail:'ตรวจแบบวิเคราะห์ฉบับล่าสุด',owner:'วิศวกรโครงสร้าง',priority:'normal',status:'open',response:'',now:t0,document:context(),...draft});
const state=items=>({schemaVersion:1,toolId:beam.id,nextSequence:Math.max(1,...items.map(value=>value.sequence+1)),items,pending:null});
const editorFields=source=>({title:source?.title||'',detail:source?.detail||'',owner:source?.owner||'',response:source?.response||'',priority:source?.priority||'normal',status:source?.status||'open'});
const summary=(items,values=inputs(),document=context())=>reviewRegisterSummary(beam,state(items),values,document);

test('opening a review captures independent defined inputs and only relevant document context',()=>{
  const original={...inputs(),_options:{options:[{answer:999}]}},document=context();
  const opened=captureReviewItem(beam,original,{id:'start',sequence:4,title:'ตรวจวัสดุ',now:t0,document});
  original.d=700;document.designBasis='Changed';
  assert.equal(opened.originInputs.d,500);
  assert.equal(opened.originContext.designBasis,'แรงดัดตามแบบวิเคราะห์ Rev A');
  assert.equal(Object.hasOwn(opened.originInputs,'_options'),false);
  assert.deepEqual(Object.keys(opened.originContext),['projectCode','client','site','designBasis']);
  assert.equal(opened.reviewedInputs,null);assert.equal(opened.reviewedContext,null);assert.equal(opened.reviewedAt,null);
  assert.equal(opened.status,'open');
  assert.equal(summary([opened]).outstanding,1);
});

test('responding and closing require a nonblank response and retain the immutable opening context',()=>{
  const opened=item();
  for(const status of ['addressed','closed']) assert.throws(()=>updateReviewItem(beam,opened,{status,response:' \u0000 '},inputs(),{now:t1,document:context()}),/คำตอบ/);
  const changed={...inputs(),d:600};
  const addressed=updateReviewItem(beam,opened,{status:'addressed',response:'เพิ่มความลึกเป็น 600 mm'},changed,{now:t1,document:context()});
  assert.equal(addressed.originInputs.d,500);assert.equal(addressed.reviewedInputs.d,600);assert.equal(addressed.reviewedAt,t1);
  assert.equal(opened.reviewedInputs,null);assert.equal(opened.status,'open');
  let result=summary([addressed],changed);
  assert.equal(result.addressed,1);assert.equal(result.outstanding,1);assert.equal(result.closed,0);
  const closed=updateReviewItem(beam,addressed,{status:'closed',response:'ผู้ตรวจยืนยันความลึกและแรงแล้ว'},changed,{now:t2,document:context()});
  result=summary([closed],changed);
  assert.equal(result.closed,1);assert.equal(result.outstanding,0);assert.equal(closed.createdAt,t0);assert.equal(closed.updatedAt,t2);
  changed.d=700;assert.equal(closed.reviewedInputs.d,600);
});

test('changed inputs invalidate both a response and a closure without changing stored user declarations',()=>{
  const addressed=item({status:'addressed',response:'แก้ตามข้อสังเกตแล้ว'}),closed=item({id:'review-two',sequence:2,status:'closed',response:'ผู้ตรวจยืนยันแล้ว',priority:'critical'});
  const changed={...inputs(),mu:180};
  const result=summary([addressed,closed],changed);
  assert.equal(result.needsReview,2);assert.equal(result.outstanding,2);assert.equal(result.closed,0);assert.equal(result.addressed,0);assert.equal(result.criticalOutstanding,1);
  assert.equal(addressed.status,'addressed');assert.equal(closed.status,'closed');
  const reconfirmed=updateReviewItem(beam,closed,{response:'ตรวจแรง 180 kN·m แล้ว'},changed,{now:t1,document:context()});
  assert.equal(summary([reconfirmed],changed).closed,1);
  assert.equal(reconfirmed.originInputs.mu,150);assert.equal(reconfirmed.reviewedInputs.mu,180);
});

test('project code, client, site and design basis change the effective review; issuance metadata does not',()=>{
  const closed=item({status:'closed',response:'ยืนยันแล้ว'});
  for(const key of ['projectCode','client','site','designBasis']) {
    assert.equal(summary([closed],inputs(),{...context(),[key]:'Changed'}).needsReview,1,key);
  }
  const issuance={...context(),revision:'P09',issueDate:'2026-11-22',purpose:'for-review',preparedBy:'A',checkedBy:'B',reviewItems:[]};
  assert.equal(summary([closed],inputs(),issuance).closed,1);
  assert.equal(summary([closed],inputs(),{...context(),designBasis:'  แรงดัดตามแบบวิเคราะห์ Rev A  '}).closed,1);
});

test('numerical passing checks do not auto-close open issues and invalid live values cannot retain closure',()=>{
  const opened=item(),closed=item({id:'review-two',sequence:2,status:'closed',response:'ตรวจแล้ว'});
  assert.equal(beam.calculate(inputs()).checks.every(check=>check.pass===true),true);
  assert.equal(summary([opened]).open,1);
  for(const value of [null,'500',NaN,Infinity]) {
    const result=summary([opened,closed],{...inputs(),d:value});
    assert.equal(result.currentValid,false);assert.equal(result.open,1);assert.equal(result.needsReview,1);assert.equal(result.outstanding,2);
  }
  const after=updateReviewItem(beam,opened,{owner:'ทีมปรับข้อมูล'}, {...inputs(),d:null},{now:t1,document:context()});
  assert.equal(after.status,'open');assert.equal(after.owner,'ทีมปรับข้อมูล');
  assert.throws(()=>updateReviewItem(beam,opened,{status:'closed',response:'ไม่ควรยืนยันได้'}, {...inputs(),d:null},{now:t1,document:context()}));
});

test('capture validates numbers, integer fields, select membership and coupled domain restrictions',()=>{
  const missing=inputs();delete missing.d;
  for(const value of [missing,{...inputs(),d:'500'},{...inputs(),count:4.1},{...inputs(),d:Infinity},{...inputs(),d:-1}]) assert.throws(()=>item({},value));
  const index=quantityTools['factor-k'];
  const defaults=Object.fromEntries(index.inputGroups.flatMap(group=>group.fields).map(field=>[field.key,field.default]));
  assert.throws(()=>captureReviewItem(index,{...defaults,fixed:.9},{title:'weight sum',now:t0}));
  const selectable={id:'selectable',inputGroups:[{fields:[{key:'case',type:'select',label:'Case',options:[{value:'dead',label:'Dead'}]}]}],calculate:()=>({summary:[]})};
  assert.throws(()=>captureReviewItem(selectable,{case:'live'},{title:'case',now:t0}));
  assert.equal(captureReviewItem(selectable,{case:'dead'},{title:'case',now:t0}).originInputs.case,'dead');
});

test('valid serialized register round-trips its exact input contexts, timestamps and monotonic sequence',()=>{
  const closed=item({status:'closed',response:'ตรวจแล้ว'}),raw={...state([closed]),nextSequence:8};
  const restored=restoreReviewRegister(beam,JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(restored.state,raw);assert.equal(restored.rejected,0);assert.equal(restored.adjusted,false);
  restored.state.items[0].originInputs.d=999;
  restored.state.items[0].reviewedContext.site='changed';
  assert.equal(raw.items[0].originInputs.d,500);assert.equal(raw.items[0].reviewedContext.site,'อาคาร A');
});

test('invalid, duplicate and forged closure imports are rejected with a visible count',()=>{
  const valid=item(),closed=item({id:'closed',sequence:2,status:'closed',response:'done'});
  const invalid=[
    {...valid},
    {...valid,id:'same-sequence'},
    {...valid,id:'bad-number',sequence:3,originInputs:{...inputs(),d:'500'}},
    {...closed,id:'no-evidence',sequence:4,response:''},
    {...closed,id:'no-review-context',sequence:5,reviewedInputs:null,reviewedAt:null,reviewedContext:null},
    {...valid,id:'invalid-time',sequence:6,createdAt:'2026-02-31T00:00:00.000Z'},
    {...valid,id:'unknown-status',sequence:7,status:'approved'},
    {...valid,id:'missing-doc-context',sequence:8,originContext:undefined},
  ];
  const restored=restoreReviewRegister(beam,{...state([valid]),nextSequence:9,items:[valid,...invalid]});
  assert.equal(restored.state.items.length,1);assert.equal(restored.rejected,8);assert.equal(restored.adjusted,true);assert.match(restored.notice,/8/);
  assert.equal(restoreReviewRegister(beam,{...state([valid]),toolId:'footing'}).rejected,1);
  assert.equal(restoreReviewRegister(beam,{...state([valid]),schemaVersion:2}).rejected,1);
  assert.equal(restoreReviewRegister(beam,undefined).adjusted,false);
});

test('imports enforce a 30-item cap and never reuse an accepted code after sequence repair',()=>{
  const items=Array.from({length:33},(_,index)=>item({id:'review-'+index,sequence:index+1}));
  const restored=restoreReviewRegister(beam,{...state(items),nextSequence:1});
  assert.equal(MAX_REVIEW_ITEMS,30);assert.equal(restored.state.items.length,30);assert.equal(restored.rejected,3);
  assert.equal(restored.state.nextSequence,31);assert.equal(restored.adjusted,true);
  const sparse=restoreReviewRegister(beam,{...state([item({sequence:72})]),nextSequence:null});
  assert.equal(sparse.state.nextSequence,73);assert.equal(sparse.rejected,0);assert.equal(sparse.adjusted,true);
});

test('fabricated results, user identities and HTML properties never become trusted register fields',()=>{
  const candidate={...item(),result:{approved:true},signature:'verified',html:'<script>run()</script>',originInputs:{...inputs(),pass:true},originContext:{...reviewDocumentContext(context()),token:'secret'}};
  const restored=restoreReviewRegister(beam,state([candidate]));
  const value=restored.state.items[0];
  for(const key of ['result','signature','html'])assert.equal(Object.hasOwn(value,key),false);
  assert.equal(Object.hasOwn(value.originInputs,'pass'),false);assert.equal(Object.hasOwn(value.originContext,'token'),false);
});

test('text is bounded and sanitization is disclosed without evaluating markup',()=>{
  const original=item({title:'A'.repeat(400),detail:'\u0000detail',owner:'Owner'.repeat(50),response:'R'.repeat(3000)});
  assert.equal(original.title.length,180);assert.equal(original.owner.length,120);assert.equal(original.response.length,2400);assert.equal(original.detail,'detail');
  const altered={...original,title:'  Title  ',originContext:{...original.originContext,designBasis:'\u0000basis'}};
  const restored=restoreReviewRegister(beam,state([altered]));
  assert.equal(restored.state.items[0].title,'Title');assert.equal(restored.state.items[0].originContext.designBasis,'basis');assert.equal(restored.adjusted,true);assert.match(restored.notice,/ปรับข้อความ/);
  assert.throws(()=>item({title:' \u0000 '}),/หัวข้อ/);
});

test('timestamps reject overflow and confirmation cannot move backward before its recorded history',()=>{
  assert.equal(isReviewTimestamp(t0),true);
  for(const value of ['2026-02-29T10:00:00.000Z','2026-11-21','2026-11-21T10:00:00+00:00','2026-11-21T25:00:00.000Z',null])assert.equal(isReviewTimestamp(value),false);
  assert.throws(()=>updateReviewItem(beam,item(),{owner:'changed'},inputs(),{now:'2026-11-21T09:00:00.000Z'}),/นาฬิกา/);
  const reviewed=item({status:'closed',response:'Done'});
  const malformed={...reviewed,reviewedAt:t2,updatedAt:t1};
  assert.equal(restoreReviewRegister(beam,state([malformed])).rejected,1);
});

test('copying a project reopens all terminal declarations while retaining response and original evidence',()=>{
  const source=state([item({status:'closed',response:'ปิดในโครงการเดิม'}),item({id:'two',sequence:2,status:'addressed',response:'ตอบในงานเดิม'})]);
  const reopened=reopenReviewRegister(beam,source,{now:t1});
  assert.deepEqual(reopened.items.map(value=>value.status),['open','open']);
  assert.equal(reopened.items[0].response,'ปิดในโครงการเดิม');assert.equal(reopened.items[0].reviewedAt,t0);assert.equal(reopened.items[0].updatedAt,t1);
  assert.equal(reviewRegisterSummary(beam,reopened,inputs(),context()).outstanding,2);
  assert.equal(source.items[0].status,'closed');
  reopened.items[0].reviewedInputs.d=999;assert.equal(source.items[0].reviewedInputs.d,500);
});

test('reports include responses, effective status and changed context without interactive controls or unescaped markup',()=>{
  const closed=item({title:'<img src=x onerror=alert(1)>',detail:'<script>unsafe</script>',owner:'A & B',status:'closed',response:'แก้ตามแบบ <ref>',priority:'critical'});
  const html=reviewRegisterReport(beam,{...inputs(),d:600},state([closed]),{...context(),designBasis:'Basis <new>'});
  assert.match(html,/ทะเบียนประเด็นตรวจทาน/);assert.match(html,/คงค้าง 1/);assert.match(html,/ต้องตรวจซ้ำ 1/);assert.match(html,/ต้องแก้ก่อนส่ง 1/);
  assert.match(html,/สถานะที่เคยระบุ/);assert.match(html,/ปิดประเด็นแล้ว/);assert.match(html,/แหล่งข้อมูลและเกณฑ์ที่ใช้/);assert.match(html,/Basis &lt;new&gt;/);
  assert.match(html,/&lt;img/);assert.match(html,/&lt;script&gt;/);assert.match(html,/A &amp; B/);assert.match(html,/&lt;ref&gt;/);
  assert.doesNotMatch(html,/<input|<textarea|<button|<script|<img/);assert.match(html,/ไม่ใช่ลายเซ็น/);assert.match(html,/ไม่ปิดประเด็นให้อัตโนมัติ/);
  assert.equal(reviewRegisterReport(beam,inputs(),state([]),context()),'');
});

test('reports reject invalid persisted records instead of silently dropping part of the evidence',()=>{
  const bad={...item(),originInputs:{...inputs(),d:null}};
  assert.throws(()=>reviewRegisterReport(beam,inputs(),state([bad]),context()),/รายการตรวจทานมีข้อมูลไม่ถูกต้อง/);
  const closed=item({status:'closed',response:'checked'});
  const html=reviewRegisterReport(beam,{...inputs(),d:null},state([closed]),context());
  assert.match(html,/ข้อมูลปัจจุบันไม่อยู่ในขอบเขต/);assert.match(html,/ต้องตรวจซ้ำ/);
});

test('a typed response and pending closed selection round-trip without closing the actual issue',()=>{
  const opened=item(),pending={itemId:opened.id,values:{...editorFields(opened),response:'  กำลังรอผลยืนยัน\nข้อมูลยังไม่ครบ  ',status:'closed'}};
  const raw={...state([opened]),pending};
  const restored=restoreReviewRegister(beam,JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(restored.state.pending,pending);assert.equal(restored.adjusted,false);
  const signals=reviewRegisterSummary(beam,restored.state,inputs(),context());
  assert.equal(signals.pendingDraft,true);assert.equal(signals.open,1);assert.equal(signals.closed,0);assert.equal(signals.outstanding,1);
  assert.equal(restored.state.items[0].response,'');assert.equal(restored.state.items[0].status,'open');
  restored.state.pending.values.response='Changed';assert.equal(raw.pending.values.response,pending.values.response);
});

test('new incomplete review drafts survive without requiring a title or closure evidence',()=>{
  const pending={itemId:null,values:{...editorFields(),detail:'ตรวจรายงานดินก่อนกำหนดแรง',status:'closed'}};
  const restored=restoreReviewRegister(beam,{...state([]),pending});
  assert.equal(restored.state.pending.values.title,'');assert.equal(restored.state.pending.values.response,'');
  assert.equal(restored.state.pending.values.status,'closed');
  const signals=reviewRegisterSummary(beam,restored.state,inputs(),context());
  assert.equal(signals.total,0);assert.equal(signals.closed,0);assert.equal(signals.outstanding,0);assert.equal(signals.pendingDraft,true);
  assert.throws(()=>captureReviewItem(beam,inputs(),{...pending.values,document:context(),now:t1}),/หัวข้อ/);
});

test('unchanged editors and empty new forms are clean, and cancelling a draft removes the report block',()=>{
  const opened=item();
  assert.equal(normalizeReviewPending({itemId:opened.id,values:editorFields(opened)},[opened]),null);
  assert.equal(normalizeReviewPending({itemId:null,values:editorFields()},[]),null);
  const raw={...state([opened]),pending:{itemId:opened.id,values:{...editorFields(opened),response:'ยังไม่ยืนยัน'}}};
  assert.throws(()=>reviewRegisterReport(beam,inputs(),raw,context()),/ร่างประเด็นที่ยังไม่ยืนยัน/);
  assert.throws(()=>reviewRegisterReport(beam,inputs(),{...state([]),pending:{itemId:null,values:{...editorFields(),title:'Draft'}}},context()),/บันทึกประเด็นหรือยกเลิก/);
  const cleared={...raw,pending:null};
  assert.equal(reviewRegisterSummary(beam,cleared,inputs(),context()).pendingDraft,false);
  const html=reviewRegisterReport(beam,inputs(),cleared,context());
  assert.match(html,/ยังไม่มีคำตอบ/);assert.doesNotMatch(html,/ยังไม่ยืนยัน/);
});

test('malformed pending records are discarded and disclosed without discarding valid saved issues',()=>{
  const opened=item(),valid={itemId:opened.id,values:{...editorFields(opened),response:'draft'}};
  const invalid=[{},'bad',{...valid,itemId:'missing'},{...valid,itemId:12},{...valid,values:{...valid.values,title:null}},{...valid,values:{...valid.values,status:'approved'}},{...valid,values:{...valid.values,priority:'urgent'}},{...valid,values:{title:'missing fields'}}];
  for(const pending of invalid){
    const restored=restoreReviewRegister(beam,{...state([opened]),pending});
    assert.equal(restored.state.items.length,1);assert.equal(restored.state.pending,null);assert.equal(restored.pendingRejected,true);assert.equal(restored.rejected,0);assert.equal(restored.adjusted,true);assert.match(restored.notice,/ไม่นำเข้าร่างประเด็น/);
    assert.throws(()=>reviewRegisterReport(beam,inputs(),{...state([opened]),pending},context()),/ข้อมูลไม่ถูกต้อง/);
  }
});

test('pending text is bounded, controls stripped and unknown approval/context fields ignored',()=>{
  const pending={itemId:null,values:{...editorFields(),title:'X'.repeat(500),detail:'\u0000text',response:'Y'.repeat(5000),approved:true,reviewedInputs:inputs()},signature:'verified'};
  const restored=restoreReviewRegister(beam,{...state([]),pending});
  assert.equal(restored.state.pending.values.title.length,180);assert.equal(restored.state.pending.values.response.length,2400);assert.equal(restored.state.pending.values.detail,'text');assert.equal(restored.adjusted,true);
  assert.deepEqual(Object.keys(restored.state.pending),['itemId','values']);assert.equal(Object.hasOwn(restored.state.pending.values,'approved'),false);assert.equal(Object.hasOwn(restored.state.pending.values,'reviewedInputs'),false);
  assert.equal(reviewRegisterSummary(beam,restored.state,inputs(),context()).closed,0);
});

test('copying work retains pending response text and reopens pending terminal status without confirming it',()=>{
  const closed=item({status:'closed',response:'Confirmed in original'});
  const raw={...state([closed]),pending:{itemId:closed.id,values:{...editorFields(closed),response:'New response in progress',status:'closed'}}};
  const copied=reopenReviewRegister(beam,raw,{now:t1});
  assert.equal(copied.items[0].status,'open');assert.equal(copied.items[0].response,'Confirmed in original');
  assert.equal(copied.pending.values.response,'New response in progress');assert.equal(copied.pending.values.status,'open');
  const signals=reviewRegisterSummary(beam,copied,inputs(),context());assert.equal(signals.closed,0);assert.equal(signals.open,1);assert.equal(signals.pendingDraft,true);
  assert.equal(raw.pending.values.status,'closed');assert.equal(raw.items[0].status,'closed');
});

test('only an explicit item update turns a pending response into review evidence',()=>{
  const opened=item(),pending={itemId:opened.id,values:{...editorFields(opened),response:'ตรวจแรงและค่าความลึกครบแล้ว',status:'closed'}};
  const raw={...state([opened]),pending};
  assert.equal(reviewRegisterSummary(beam,raw,inputs(),context()).closed,0);
  const committed=updateReviewItem(beam,opened,pending.values,inputs(),{now:t1,document:context()});
  const saved=state([committed]);
  const signals=reviewRegisterSummary(beam,saved,inputs(),context());assert.equal(signals.pendingDraft,false);assert.equal(signals.closed,1);
  assert.equal(committed.reviewedAt,t1);assert.match(reviewRegisterReport(beam,inputs(),saved,context()),/ตรวจแรงและค่าความลึกครบแล้ว/);
});
