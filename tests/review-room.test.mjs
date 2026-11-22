import test from 'node:test';
import assert from 'node:assert/strict';
import { engineeringTools, defaultInputs } from '../src/engineering.js';
import { quantityTools } from '../src/quantities.js';
import { normalizeDocument } from '../src/document-control.js';
import { captureReviewItem, updateReviewItem, evaluateReviewRegister } from '../src/review-register.js';
import { normalizeInspectionState, normalizeBoqState } from '../src/workflows.js';
import { createHandoverExample } from '../src/handover-example.js';
import { buildReviewRoom, filterReviewRoom, groupReviewRoom, normalizeReviewRoomFilters } from '../src/review-room.js';

const definitions={...engineeringTools,...quantityTools},beam=engineeringTools['rc-beam'];
const BEFORE='2026-11-21T10:00:00.000Z',NOW='2026-11-22T10:00:00.000Z';
const doc=()=>normalizeDocument({projectCode:'DEMO / STR-01',preparedBy:'ผู้จัดทำตัวอย่าง',checkedBy:'ผู้ตรวจเอกสาร',issueDate:'2026-11-22',designBasis:'ข้อมูลตัวอย่าง',reviewItems:[{id:'inputs',checked:true,note:'แหล่งข้อมูล'},{id:'model-scope',checked:true,note:'ขอบเขต'},{id:'independent',checked:true,note:'ตรวจแล้ว'}]});
const record=(id='beam',toolId='rc-beam',data=null)=>({id,schemaVersion:1,toolId,name:'งาน '+id,createdAt:BEFORE,updatedAt:NOW,data:data||{...defaultInputs(toolId),_document:doc()}});
const composer=ids=>({metadata:{title:'ชุดตรวจตัวอย่าง',reference:'TR-01'},selectedIds:ids});
const build=(records,ids=records.map(row=>row.id))=>buildReviewRoom(records,definitions,composer(ids),{now:NOW});
const issue=(r,{id='issue-one',sequence=1,status='open',owner='ทีมโครงสร้าง',priority='normal',...values}={})=>captureReviewItem(definitions[r.toolId],r.data,{id,sequence,title:'ตรวจที่มาของแรง',detail:'เทียบกับแบบที่ใช้',response:status==='open'?'':'ตอบจากข้อมูลจริง',status,owner,priority,document:r.data._document,now:BEFORE,...values});
const register=(r,items,pending=null)=>{r.data._review={schemaVersion:1,toolId:r.toolId,nextSequence:Math.max(0,...items.map(item=>item.sequence))+1,items,pending};return r;};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

test('six-document example yields actual authored observations, exact owner groups and one declaration row per document',()=>{
  let sequence=0;const example=createHandoverExample({now:NOW,idFactory:()=>`example-${++sequence}`});
  const model=buildReviewRoom(example.records,definitions,example.state,{now:NOW});
  assert.equal(model.summary.documents,6);assert.equal(model.summary.reviewOutstanding,4);assert.equal(model.summary.fix,2);
  assert.equal(model.summary.documentGaps,6);assert.equal(model.summary.owners,3);assert.equal(model.summary.findings,10);
  assert.equal(model.findings.filter(row=>row.authoredPriority==='critical').length,2);
  assert.equal(model.documents.find(row=>row.toolId==='boq-building').model.assessment,null);
  assert.equal(model.documents.find(row=>row.toolId==='quantity-building').model.assessment.total,0);
});

test('empty selection remains explicitly empty even when records exist and no readiness or approval is fabricated',()=>{
  const model=build([record()],[]);
  assert.equal(model.summary.documents,0);assert.equal(model.findings.length,0);assert.equal(model.documents.length,0);
  assert.ok(!('ready' in model.summary));assert.ok(!('approved' in model.summary));assert.match(model.notes.join(' '),/ไม่ได้แปลว่าตรวจครบหรืออนุมัติ/);
});

test('missing, duplicate and unknown selected sources stay actionable without resolving by name or code',()=>{
  const first=record('duplicate'),second=record('duplicate'),unknown=record('unknown','unsupported',{});
  const model=build([first,second,unknown,record('unselected')],['missing','duplicate','unknown']);
  assert.equal(model.summary.documents,3);assert.equal(model.summary.missingDocuments,2);assert.equal(model.summary.invalidDocuments,1);
  assert.equal(model.findings.filter(row=>row.kind==='missing-source').length,2);
  assert.equal(model.findings.find(row=>row.documentId==='duplicate').title,'รหัสงานซ้ำกัน');
  assert.ok(model.findings.some(row=>row.documentId==='unknown'&&row.kind==='invalid-data'));
  assert.ok(!model.findings.some(row=>row.documentId==='unselected'));
});

test('identical local review IDs in different source documents produce distinct finding IDs and exact targets',()=>{
  const a=record('a'),b=record('b');register(a,[issue(a)]);register(b,[issue(b)]);
  const rows=build([a,b]).findings.filter(row=>row.kind==='review-item');
  assert.equal(rows.length,2);assert.notEqual(rows[0].id,rows[1].id);assert.equal(rows[0].target.itemId,rows[1].target.itemId);
  assert.deepEqual(rows.map(row=>row.documentId),['a','b']);
});

test('model failure and unassessed checks retain actual labels and details without invented numerical success',()=>{
  const r=record();Object.assign(r.data,{d:150,count:8,diameter:40});
  const expected=beam.calculate(r.data),model=build([r]);
  assert.equal(model.summary.modelFailures,expected.checks.filter(row=>row.pass===false).length);
  assert.equal(model.summary.modelUnassessed,expected.checks.filter(row=>row.pass!==true&&row.pass!==false).length);
  for(const check of expected.checks.filter(row=>row.pass!==true))assert.ok(model.findings.some(row=>row.title===check.label&&row.detail===check.detail));
  assert.ok(model.findings.some(row=>row.kind==='model-unassessed'&&row.priority==='review'));
});

test('invalid current inputs preserve a formerly closed issue as needs-review and expose source error',()=>{
  const r=record();register(r,[issue(r,{status:'closed'})]);r.data.d='bad';
  const model=build([r]);assert.equal(model.summary.invalidDocuments,1);assert.equal(model.summary.closed,0);assert.equal(model.summary.needsReview,1);
  const item=model.findings.find(row=>row.kind==='review-item');assert.equal(item.status,'needs-review');assert.equal(item.recordedStatus,'closed');
  assert.ok(item.evidence.some(row=>row.value.includes('ไม่อยู่ในขอบเขต')));assert.ok(model.findings.some(row=>row.kind==='invalid-data'));
});

test('addressed remains outstanding while current closed items appear only when requested',()=>{
  const r=record();register(r,[issue(r,{id:'answered',status:'addressed'}),issue(r,{id:'closed',sequence:2,status:'closed'})]);
  const model=build([r]);assert.equal(model.summary.reviewOutstanding,1);assert.equal(model.summary.closed,1);
  assert.deepEqual(filterReviewRoom(model).map(row=>row.status),['addressed']);
  assert.deepEqual(filterReviewRoom(model,{status:'closed'}).map(row=>row.target.itemId),['closed']);
  assert.equal(filterReviewRoom(model,{status:'all'}).length,2);
});

test('context changes expose prior and current values using the same contextual evaluator as the source register',()=>{
  const r=record();register(r,[issue(r,{status:'closed'})]);r.data._document.site='ไซต์งานรอบใหม่';r.data.d+=25;
  const model=build([r]),row=model.findings.find(item=>item.kind==='review-item');
  assert.equal(row.status,'needs-review');assert.equal(row.changedFields.length,1);assert.equal(row.changedContext.length,1);
  assert.ok(row.evidence.some(item=>item.label.includes('ความลึก')&&item.value.includes('→')));
  assert.ok(row.evidence.some(item=>item.value.includes('ไซต์งานรอบใหม่')));
});

test('pending closed selection and response remain unconfirmed evidence and do not reassign or close the authored issue',()=>{
  const r=record(),item=issue(r);register(r,[item],{itemId:item.id,values:{title:item.title,detail:item.detail,response:'คำตอบที่ยังพิมพ์ค้าง',owner:'เจ้าของร่างคนใหม่',priority:'critical',status:'closed'}});
  const model=build([r]),confirmed=model.findings.find(row=>row.kind==='review-item'),pending=model.findings.find(row=>row.kind==='pending-editor');
  assert.equal(confirmed.status,'open');assert.equal(confirmed.owner,'ทีมโครงสร้าง');assert.equal(confirmed.response,'');
  assert.equal(pending.owner,'');assert.equal(pending.target.pending,true);assert.equal(pending.target.itemId,item.id);
  assert.ok(pending.evidence.some(row=>row.label.includes('ยังไม่ยืนยัน')&&row.value==='คำตอบที่ยังพิมพ์ค้าง'));
  assert.ok(pending.evidence.some(row=>row.value==='ปิดประเด็นแล้ว'));assert.equal(model.summary.closed,0);
});

test('pending revision note is shown literally as a draft and remains separate from source issues',()=>{
  const r=record();r.data._revisions={schemaVersion:1,toolId:'rc-beam',entries:[],selectedId:null,includeInReport:false,draftNote:'ร่างหมายเหตุรอบใหม่'};
  const model=build([r]),row=model.findings.find(item=>item.kind==='pending-editor');
  assert.equal(model.summary.pendingEditors,1);assert.equal(row.target.section,'revisions');assert.equal(row.target.pending,true);
  assert.equal(row.evidence[0].value,'ร่างหมายเหตุรอบใหม่');assert.equal(model.summary.reviewOutstanding,0);
});

test('an unsaved source draft changes provenance without generating a duplicate actionable failure',()=>{
  const r=record();const savedModel=build([r]);r.fromDraft=true;
  const draftModel=build([r]);assert.equal(draftModel.summary.drafts,1);assert.equal(draftModel.findings.length,savedModel.findings.length);
  assert.equal(draftModel.documents[0].sourceState,'draft');assert.ok(draftModel.documents[0].warnings.some(row=>row.includes('ร่างแก้ไขล่าสุด')));
});

test('malformed restored review and document metadata remain visible without overwriting original source',()=>{
  const r=record();register(r,[{id:'invalid-issue',title:'ข้อความเดิม'}]);r.data._document.reviewItems[0].checked='true';
  const before=JSON.stringify(r),model=build([r]);assert.equal(model.summary.dataAdjustments,1);assert.equal(model.summary.reviewOutstanding,0);
  assert.equal(model.documents[0].review.completed,0);assert.equal(model.summary.documentGaps,1);
  const row=model.findings.find(item=>item.kind==='data-adjustment');assert.ok(row.evidence.some(item=>item.label==='ประเด็นที่ใช้ไม่ได้'&&item.value==='1'));
  assert.equal(JSON.stringify(r),before);
});

test('malformed workflow values are not normalized into actionable default observations or valid totals',()=>{
  const state=normalizeBoqState({},'boq-building');state.rows[0].quantity='bad';state._document=doc();
  const model=build([record('cost','boq-building',state)]);
  assert.equal(model.summary.invalidDocuments,1);assert.ok(model.findings.some(row=>row.kind==='invalid-data'));
  assert.equal(model.documents[0].model.metrics.length,0);assert.equal(model.summary.modelFailures,0);
});

test('canonical inspection failures retain full row details, duplicate row IDs remain distinct, pending rows stay unassessed',()=>{
  const data=normalizeInspectionState({version:1,property:'อาคารตัวอย่าง',inspector:'ผู้ตรวจสถานที่',items:[
    {id:'same',group:'สถาปัตย์',title:'กระจกแตก',status:'fail',note:'ชั้นสอง'},
    {id:'same',group:'ระบบ',title:'ไฟไม่ติด',status:'fail',note:'ห้องสาม'},
    {id:'pending',group:'ระบบ',title:'รอตรวจน้ำ',status:'pending'},
  ]});data._document=doc();const model=build([record('site','inspection',data)]),rows=model.findings.filter(row=>row.kind==='inspection-fail');
  assert.equal(rows.length,2);assert.notEqual(rows[0].id,rows[1].id);assert.deepEqual(rows.map(row=>row.detail),['ชั้นสอง','ห้องสาม']);
  assert.ok(rows.every(row=>row.owner===''));assert.equal(model.summary.inspectionDefects,2);assert.equal(model.summary.modelFailures,0);
  const pending=model.findings.find(row=>row.kind==='inspection-pending');assert.match(pending.title,/1 รายการ/);assert.equal(pending.evidence[0].value,'รอตรวจน้ำ');
});

test('reference-only tools have honest no-model coverage even when metadata is complete and queue is empty',()=>{
  const model=build([record('reference','guide',{_document:doc()})]);
  assert.equal(model.findings.length,0);assert.equal(model.documents[0].model.status,'reference');assert.equal(model.documents[0].model.assessment,null);
  assert.equal(model.documents[0].register.total,0);assert.match(model.notes.join(' '),/ผลแบบจำลอง.*แยกกัน/);
});

test('filter composition uses exact source and owner keys, including document IDs that look like sentinels',()=>{
  const a=record('all'),b=record('other');register(a,[issue(a,{owner:'TEAM'})]);register(b,[issue(b,{owner:'Team'})]);
  const model=build([a,b]);assert.equal(model.summary.owners,2);
  const rows=filterReviewRoom(model,{documentId:'all',owner:'owner:TEAM',kind:'review-item',priority:'review',category:'design',status:'open'});
  assert.equal(rows.length,1);assert.equal(rows[0].documentId,'all');
  assert.equal(filterReviewRoom(model,{documentId:'all',owner:'owner:Team'}).length,0);
});

test('search reaches Thai evidence and recorded responses while filters never mutate model ordering',()=>{
  const r=record();register(r,[issue(r,{status:'addressed',response:'แนบรายการวิเคราะห์แรงดัดแล้ว'})]);
  const model=build([r]),before=JSON.stringify(model);
  assert.equal(filterReviewRoom(model,{search:'วิเคราะห์แรงดัด'}).length,1);
  assert.equal(filterReviewRoom(model,{search:'RV-001'}).length,1);
  assert.equal(filterReviewRoom(model,{search:'ไม่พบข้อความนี้'}).length,0);assert.equal(JSON.stringify(model),before);
});

test('ordering and finding identity are stable across refreshes and selected source order is explicit',()=>{
  const a=record('a'),b=record('b');register(a,[issue(a,{id:'closed',status:'closed',priority:'critical'})]);register(b,[issue(b,{priority:'normal'})]);
  const first=build([a,b],['b','a']),second=buildReviewRoom([a,b],definitions,composer(['b','a']),{now:'2026-11-23T00:00:00.000Z'});
  assert.deepEqual(first.findings.map(row=>row.id),second.findings.map(row=>row.id));assert.equal(first.findings[0].documentId,'b');assert.equal(first.findings.at(-1).status,'closed');
  assert.deepEqual(groupReviewRoom(first.findings,'document').map(group=>group.id),['b','a']);
});

test('all 30 selected records and 900 valid source issues remain present without silent queue clipping',()=>{
  const records=Array.from({length:30},(_,index)=>record('record-'+index));
  for(const r of records)register(r,Array.from({length:30},(_,index)=>issue(r,{id:'issue-'+index,sequence:index+1})));
  const model=build(records);assert.equal(model.summary.documents,30);assert.equal(model.summary.reviewOutstanding,900);
  assert.equal(model.findings.length,900);assert.equal(new Set(model.findings.map(row=>row.id)).size,900);assert.equal(filterReviewRoom(model).length,900);
});

test('normalization bounds filter text and exact owner grouping never borrows document checker names',()=>{
  const normalized=normalizeReviewRoomFilters({search:'x'.repeat(1000),status:'approved',priority:'urgent',kind:'unsafe',documentId:' id ',groupBy:'unknown'});
  assert.equal(normalized.search.length,240);assert.equal(normalized.status,'outstanding');assert.equal(normalized.priority,'all');assert.equal(normalized.documentId,'id');assert.equal(normalized.groupBy,'priority');
  const r=record();r.data.mu=1000;const model=build([r]);
  assert.ok(model.findings.length>0);assert.ok(model.findings.every(row=>row.owner===''));assert.equal(model.summary.owners,0);
  assert.equal(groupReviewRoom(model.findings,'owner')[0].id,'unassigned');assert.deepEqual(groupReviewRoom(model.findings,'unknown'),groupReviewRoom(model.findings,'priority'));
});

test('model construction and public register evaluation preserve deeply frozen sources and return independent evidence',()=>{
  const r=record();register(r,[issue(r)]);const source=freeze([r]),before=JSON.stringify(source),state=freeze(composer(['beam']));
  const model=buildReviewRoom(source,definitions,state,{now:NOW});const evaluation=evaluateReviewRegister(beam,r.data._review,r.data,r.data._document);
  evaluation.items[0].originInputs.d=999;model.findings[0].evidence[0].value='changed output';
  assert.equal(JSON.stringify(source),before);assert.notEqual(r.data._review.items[0].originInputs.d,999);
});

test('invalid generation dates fail before returning a misleading agenda timestamp',()=>{
  assert.throws(()=>buildReviewRoom([record()],definitions,composer(['beam']),{now:'2026-02-31T00:00:00.000Z'}),/วันที่/);
});
