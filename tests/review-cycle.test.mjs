import test from 'node:test';
import assert from 'node:assert/strict';
import {engineeringTools,defaultInputs} from '../src/engineering.js';
import {quantityTools} from '../src/quantities.js';
import {normalizeDocument} from '../src/document-control.js';
import {captureReviewItem,updateReviewItem} from '../src/review-register.js';
import {normalizeInspectionState} from '../src/workflows.js';
import {captureHandoverReference,handoverReferenceSource} from '../src/handover-history.js';
import {createHandoverExample} from '../src/handover-example.js';
import {buildReviewCycle,filterReviewCycle,groupReviewCycle,normalizeReviewCycleFilters,REVIEW_CYCLE_TRANSITIONS} from '../src/review-cycle.js';

const PAST='2026-11-21T10:00:00.000Z',NOW='2026-11-22T10:00:00.000Z',LATER='2026-11-22T11:00:00.000Z';
const definitions={...engineeringTools,...quantityTools},beam=engineeringTools['rc-beam'];
const doc=()=>normalizeDocument({projectCode:'DEMO / STR-01',preparedBy:'ผู้จัดทำตัวอย่าง',checkedBy:'ผู้ตรวจเอกสาร',issueDate:'2026-11-22',designBasis:'ข้อมูลตัวอย่าง',reviewItems:[{id:'inputs',checked:true,note:'แหล่งข้อมูล'},{id:'model-scope',checked:true,note:'ขอบเขต'},{id:'independent',checked:true,note:'ตรวจแล้ว'}]});
const record=(id='beam',toolId='rc-beam',data=null)=>({id,schemaVersion:1,toolId,name:'งาน '+id,createdAt:PAST,updatedAt:NOW,data:data||{...defaultInputs(toolId),_document:doc()}});
const composer=ids=>({metadata:{title:'ชุดตรวจตัวอย่าง',reference:'TR-01'},selectedIds:ids});
const capture=(records,state=composer(records.map(row=>row.id)))=>captureHandoverReference(records,state,{id:'reference-01',code:'R01',note:'ก่อนการตรวจรอบนี้',now:NOW,appVersion:'0.8'});
const compare=(ref,records,state=composer(records.map(row=>row.id)),options={})=>buildReviewCycle(ref,records,definitions,state,{now:LATER,appVersion:'0.9',...options});
const item=(r,{id='issue-one',sequence=1,status='open',owner='ทีมโครงสร้าง',priority='normal',...other}={})=>captureReviewItem(definitions[r.toolId],r.data,{id,sequence,status,owner,priority,title:'ตรวจที่มาของแรง',detail:'เทียบกับแบบที่ใช้',response:status==='open'?'':'หลักฐานคำตอบรอบก่อน',document:r.data._document,now:PAST,...other});
const register=(r,items,pending=null)=>{r.data._review={schemaVersion:1,toolId:r.toolId,nextSequence:Math.max(0,...items.map(row=>row.sequence))+1,items,pending};return r;};
const revise=(r,index,draft)=>{r.data._review.items[index]=updateReviewItem(definitions[r.toolId],r.data._review.items[index],draft,r.data,{now:LATER,document:r.data._document});};
const authored=model=>model.entries.filter(row=>row.kind==='review-item');
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const inspection=rows=>record('inspection','inspection',{...normalizeInspectionState({version:1,property:'ตัวอย่าง',inspector:'ผู้ตรวจตัวอย่าง',items:rows}),_document:doc()});

test('unchanged six-document reference gives no changed agenda and retains all derived findings',()=>{
  let next=0;const example=createHandoverExample({now:NOW,idFactory:()=>`source-${++next}`}),ref=capture(example.records,example.state);
  const model=compare(ref,example.records,example.state);
  assert.equal(model.summary.referenceDocuments,6);assert.equal(model.summary.currentDocuments,6);
  assert.equal(model.summary.total,10);assert.equal(model.summary.counts.unchanged,10);assert.equal(model.summary.changes,0);
  assert.equal(filterReviewCycle(model).length,0);assert.equal(filterReviewCycle(model,{transition:'all'}).length,10);
  assert.equal(model.reference.appVersion,'0.8');assert.equal(model.currentAppVersion,'0.9');
});

test('same local issue IDs across documents remain distinct; copied documents are added rather than matched by name/code',()=>{
  const a=record('a'),b=record('b');register(a,[item(a)]);register(b,[item(b)]);
  const ref=capture([a,b]),copy=structuredClone(a);copy.id='copied';
  const model=compare(ref,[b,copy]);
  assert.equal(model.summary.addedDocuments,1);assert.equal(model.summary.removedDocuments,1);
  assert.equal(model.summary.counts.new,1);assert.equal(model.summary.counts['removed-source'],1);assert.equal(model.summary.counts.unchanged,1);
  assert.equal(new Set(model.entries.map(row=>row.id)).size,3);
});

test('only an explicitly confirmed current closure counts as user-closed',()=>{
  const r=record();register(r,[item(r)]);const ref=capture([r]);
  revise(r,0,{status:'closed',response:'ตรวจตามข้อมูลปัจจุบันแล้ว'});
  const model=compare(ref,[r]),row=authored(model)[0];
  assert.equal(row.transition,'closed');assert.equal(row.before.status,'open');assert.equal(row.after.status,'closed');
  assert.equal(row.currentOutstanding,false);assert.equal(model.summary.counts.closed,1);
  assert.equal(row.canOpenCurrent,true);assert.equal(row.target.itemId,'issue-one');assert.equal(row.currentFindingId,row.after.id);
});

test('pending closure and changed pending owner do not close or reassign the confirmed issue',()=>{
  const r=record();register(r,[item(r)]);const ref=capture([r]);
  r.data._review.pending={itemId:'issue-one',values:{title:'ตรวจที่มาของแรง',detail:'เทียบกับแบบที่ใช้',owner:'เจ้าของร่าง',priority:'critical',response:'ยังไม่ยืนยันคำตอบ',status:'closed'}};
  const model=compare(ref,[r]);
  assert.equal(authored(model)[0].transition,'unchanged');assert.equal(authored(model)[0].owner,'ทีมโครงสร้าง');
  assert.equal(model.summary.counts.closed,0);assert.equal(model.entries.find(row=>row.kind==='pending-editor').transition,'new');
  assert.ok(!model.owners.some(owner=>owner.id==='owner:เจ้าของร่าง'));
});

test('changed design inputs restore a previously closed item with exact old/current evidence',()=>{
  const r=record();register(r,[item(r,{status:'closed'})]);const ref=capture([r]),oldMu=r.data.mu;r.data.mu=350;
  const row=authored(compare(ref,[r]))[0];
  assert.equal(row.transition,'reopened');assert.equal(row.before.status,'closed');assert.equal(row.after.status,'needs-review');
  assert.equal(row.after.recordedStatus,'closed');assert.equal(row.currentOutstanding,true);assert.match(row.reason,/เคยปิด/);
  assert.ok(row.after.evidence.some(e=>e.value===`${oldMu} → 350`));
});

test('a newly stale addressed item is distinguished from one previously closed',()=>{
  const r=record();register(r,[item(r,{status:'addressed'})]);const ref=capture([r]);r.data.d+=25;
  const row=authored(compare(ref,[r]))[0];assert.equal(row.transition,'reopened');assert.match(row.reason,/เพิ่งมีสถานะต้องตรวจซ้ำ/);assert.doesNotMatch(row.reason,/เคยปิด/);
});

test('answered items remain outstanding and expose response, status and owner changes',()=>{
  const r=record();register(r,[item(r)]);const ref=capture([r]);revise(r,0,{status:'addressed',response:'แนบผลวิเคราะห์แรงแล้ว',owner:'ทีมตรวจแบบ'});
  const row=authored(compare(ref,[r]))[0];assert.equal(row.transition,'updated');assert.equal(row.currentOutstanding,true);
  assert.ok(['status','response','owner'].every(key=>row.changes.some(change=>change.key===key)));
  assert.equal(row.changes.find(change=>change.key==='owner').before,'ทีมโครงสร้าง');
});

test('already-closed unchanged items are retained without claiming another closure',()=>{
  const r=record();register(r,[item(r,{status:'closed'})]);const model=compare(capture([r]),[r]);
  assert.equal(model.summary.counts.closed,0);assert.equal(model.summary.counts.unchanged,1);assert.equal(model.summary.currentOutstanding,0);
});

test('deleting an authored issue is not a closure and opens only the current register',()=>{
  const r=record();register(r,[item(r)]);const ref=capture([r]);r.data._review.items=[];
  const row=authored(compare(ref,[r]))[0];assert.equal(row.transition,'not-listed');assert.equal(row.after,null);
  assert.equal(row.currentOutstanding,null);assert.equal(row.canOpenCurrent,true);assert.deepEqual(row.target,{section:'review'});assert.equal(row.currentFindingId,null);
});

test('removing a document from selection differs from missing or duplicated current sources',()=>{
  const r=record();register(r,[item(r)]);const ref=capture([r]);
  const removed=compare(ref,[r],composer([]));assert.equal(removed.summary.counts['removed-source'],1);assert.equal(removed.entries[0].canOpenCurrent,false);
  for(const records of [[],[r,structuredClone(r)]]){
    const missing=compare(ref,records,composer(['beam']));assert.equal(missing.summary.missingDocuments,1);assert.equal(missing.summary.counts.closed,0);
    assert.ok(missing.entries.every(row=>row.transition==='unavailable'&&!row.canOpenCurrent));
  }
});

test('invalid current inputs do not turn an absent model check into improvement',()=>{
  const r=record();r.data.mu=350;const ref=capture([r]);r.data.d='bad';
  const model=compare(ref,[r]),old=model.entries.find(row=>row.before?.kind==='model-fail');
  assert.equal(old.transition,'unavailable');assert.equal(old.after,null);assert.equal(model.summary.counts.cleared,0);
  assert.ok(model.entries.some(row=>row.after?.kind==='invalid-data'));
});

test('a rejected current review record remains unavailable rather than removed or closed',()=>{
  const r=record();register(r,[item(r)]);const ref=capture([r]);r.data._review.items[0].reviewedAt='bad';
  const row=authored(compare(ref,[r]))[0];assert.equal(row.transition,'unavailable');assert.equal(row.after,null);
});

test('a malformed historical register cannot prove that a current issue is newly created',()=>{
  const r=record();register(r,[{id:'bad',sequence:1,title:'ข้อมูลไม่ครบ'}]);const ref=capture([r]);register(r,[item(r)]);
  const row=authored(compare(ref,[r]))[0];assert.equal(row.transition,'unavailable');assert.equal(row.before,null);
});

test('a positively matching model check that now passes is cleared independently of human issue closure',()=>{
  const r=record();r.data.mu=350;register(r,[item(r)]);const ref=capture([r]);r.data.mu=120;
  const model=compare(ref,[r]),row=model.entries.find(row=>row.before?.kind==='model-fail');
  assert.equal(row.transition,'cleared');assert.equal(row.after,null);assert.match(row.reason,/ให้ผลผ่าน.*255|ให้ผลผ่าน.*210/);
  assert.equal(model.summary.counts.closed,0);assert.equal(authored(model)[0].after.status,'open');assert.deepEqual(row.target,{section:'results'});
});

test('failed and unassessed states of the same exact check form one updated row in both directions',()=>{
  const fail=record();fail.data.mu=350;const unassessed=structuredClone(fail);Object.assign(unassessed.data,{d:150,count:8,diameter:40});
  for(const [before,after] of [[fail,unassessed],[unassessed,fail]]){
    const model=compare(capture([before]),[after]);
    const rows=model.entries.filter(row=>row.title==='กำลังดัดเพียงพอเฉพาะแบบจำลองนี้');
    assert.equal(rows.length,1);assert.equal(rows[0].transition,'updated');assert.notEqual(rows[0].before.kind,rows[0].after.kind);
    assert.equal(filterReviewCycle(model,{kind:'model-unassessed',transition:'all'}).some(row=>row.id===rows[0].id),true);
    assert.equal(filterReviewCycle(model,{kind:'model-fail',transition:'all'}).some(row=>row.id===rows[0].id),true);
  }
});

test('invalid saved inputs becoming evaluable clears only the data condition',()=>{
  const r=record();r.data.d=null;const ref=capture([r]);r.data.d=500;
  const row=compare(ref,[r]).entries.find(row=>row.before?.kind==='invalid-data');assert.equal(row.transition,'cleared');assert.match(row.reason,/ตรวจรูปแบบ/);
});

test('both sides use the supplied current model rather than an engine implied by reference version',()=>{
  const r=record(),ref=capture([r]),priorMu=r.data.mu,calls=[];r.data.mu+=1;
  const currentDefinitions={...definitions,'rc-beam':{...beam,calculate(values){calls.push(values.mu);const result=beam.calculate(values);return {...result,checks:[{label:'ตรวจจากแบบจำลองที่ส่งให้',pass:false,detail:'Current model'}]};}}};
  const model=buildReviewCycle(ref,[r],currentDefinitions,composer(['beam']),{now:LATER});
  assert.ok(calls.includes(priorMu)&&calls.includes(priorMu+1));assert.equal(model.summary.counts.unchanged,1);assert.equal(model.entries[0].before.title,'ตรวจจากแบบจำลองที่ส่งให้');assert.equal(model.entries[0].after.title,'ตรวจจากแบบจำลองที่ส่งให้');assert.match(model.notes[0],/รุ่นปัจจุบัน/);
});

test('document order, capture time, source timestamp and draft provenance do not fabricate finding edits',()=>{
  const a=record('a'),b=record('b');register(a,[item(a)]);register(b,[item(b)]);const ref=capture([a,b]);
  a.updatedAt=LATER;a.fromDraft=true;a.name='ชื่อเพื่อการนำส่งรอบใหม่';a.data._document.revision='P02';
  const model=compare(ref,[a,b],composer(['b','a']));assert.equal(model.summary.counts.unchanged,2);assert.equal(model.summary.changes,0);
  assert.equal(model.currentModel.summary.drafts,1);assert.equal(model.documents[0].id,'b');assert.equal(model.documents[1].before.name,'งาน a');assert.equal(model.documents[1].after.name,'ชื่อเพื่อการนำส่งรอบใหม่');
});

test('filling every displayed preparation field and declaration clears that condition but does not create approval',()=>{
  const r=record();r.data._document=normalizeDocument();const ref=capture([r]);r.data._document=doc();
  const model=compare(ref,[r]),row=model.entries.find(row=>row.kind==='document-review');assert.equal(row.transition,'cleared');assert.equal(model.summary.counts.closed,0);assert.match(row.reason,/ไม่ใช่การอนุมัติ/);
});

test('partially completed document preparation remains an updated outstanding item',()=>{
  const r=record();r.data._document=normalizeDocument();const ref=capture([r]);r.data._document.projectCode='DOC-01';
  const row=compare(ref,[r]).entries.find(row=>row.kind==='document-review');assert.equal(row.transition,'updated');assert.equal(row.currentOutstanding,true);
});

test('removed pending text is not proof of a confirmed answer or newly captured revision',()=>{
  const r=record();r.data._revisions={schemaVersion:1,toolId:'rc-beam',entries:[],selectedId:null,includeInReport:false,draftNote:'ร่างหมายเหตุ'};
  const ref=capture([r]);r.data._revisions.draftNote='';const row=compare(ref,[r]).entries.find(row=>row.kind==='pending-editor');
  assert.equal(row.transition,'not-listed');assert.deepEqual(row.target,{section:'revisions'});assert.match(row.reason,/ไม่ยืนยัน/);
});

test('malformed revision state cannot make a previous pending note appear completed',()=>{
  const r=record();r.data._revisions={schemaVersion:1,toolId:'rc-beam',entries:[],selectedId:null,includeInReport:false,draftNote:'ร่างหมายเหตุ'};
  const ref=capture([r]);r.data._revisions.entries='bad';const row=compare(ref,[r]).entries.find(row=>row.before?.kind==='pending-editor');assert.equal(row.transition,'unavailable');
});

test('unique inspection row IDs survive reorder without inventing a removed defect',()=>{
  const r=inspection([{id:'one',group:'ระบบ',title:'ไฟไม่ติด',status:'fail'},{id:'two',group:'ระบบ',title:'ท่อรั่ว',status:'fail'}]),ref=capture([r]);
  r.data.items.reverse();const model=compare(ref,[r]);assert.equal(model.summary.counts.unchanged,2);assert.equal(model.summary.changes,0);
  assert.notEqual(model.entries[0].before.id,model.entries[0].after.id);
});

test('an exact unique inspection defect explicitly marked pass is positively cleared, not human-closed',()=>{
  const r=inspection([{id:'one',group:'ระบบ',title:'ไฟไม่ติด',status:'fail'}]),ref=capture([r]);r.data.items[0].status='pass';
  const model=compare(ref,[r]);assert.equal(model.entries[0].transition,'cleared');assert.match(model.entries[0].reason,/ผู้ใช้บันทึกว่า “ผ่าน”/);assert.equal(model.summary.counts.closed,0);
});

test('deleted or ambiguously duplicated inspection rows cannot establish a repaired defect',()=>{
  const r=inspection([{id:'one',group:'ระบบ',title:'ไฟไม่ติด',status:'fail'}]),ref=capture([r]);r.data.items=[];
  assert.equal(compare(ref,[r]).entries[0].transition,'not-listed');
  const duplicate=inspection([{id:'same',group:'ระบบ',title:'ไฟไม่ติด',status:'fail'},{id:'same',group:'ระบบ',title:'ท่อรั่ว',status:'fail'}]),duplicatedRef=capture([duplicate]);
  duplicate.data.items.forEach(row=>row.status='pass');const model=compare(duplicatedRef,[duplicate]);assert.equal(model.summary.counts['not-listed'],2);assert.equal(model.summary.counts.cleared,0);
});

test('an empty pending inspection queue is cleared only when the prior rows still exist with recorded dispositions',()=>{
  const r=inspection([{id:'one',group:'ระบบ',title:'รอตรวจไฟ',status:'pending'}]),ref=capture([r]);r.data.items=[];
  assert.equal(compare(ref,[r]).entries[0].transition,'not-listed');
  r.data.items=normalizeInspectionState({items:[{id:'one',group:'ระบบ',title:'รอตรวจไฟ',status:'fail'}]}).items;
  const model=compare(ref,[r]);assert.equal(model.entries.find(row=>row.before?.kind==='inspection-pending').transition,'cleared');assert.equal(model.summary.counts.closed,0);assert.equal(model.currentModel.summary.inspectionDefects,1);
});

test('replacing a source tool blocks cross-tool comparisons while retaining a generic current-source action',()=>{
  const r=record();register(r,[item(r)]);const ref=capture([r]),next=record('beam','rc-slab');
  const model=compare(ref,[next]);assert.equal(model.summary.toolChangedDocuments,1);assert.ok(model.entries.every(row=>row.transition==='unavailable'));
  assert.equal(model.entries[0].canOpenCurrent,true);assert.deepEqual(model.entries[0].target,{section:'source'});
});

test('owner filtering matches either recorded side with literal case-sensitive identity',()=>{
  const r=record();register(r,[item(r,{owner:'TEAM'})]);const ref=capture([r]);revise(r,0,{owner:'Team',response:'คำตอบที่มีรายละเอียดเฉพาะ'});
  const model=compare(ref,[r]);assert.equal(model.owners.length,2);
  for(const owner of ['owner:TEAM','owner:Team'])assert.equal(filterReviewCycle(model,{owner}).length,1);
  assert.equal(filterReviewCycle(model,{owner:'owner:team'}).length,0);
  assert.equal(filterReviewCycle(model,{search:'คำตอบที่มีรายละเอียด'}).length,1);
  assert.equal(filterReviewCycle(model,{documentId:'other'}).length,0);
});

test('filter normalization is bounded and grouping preserves every selected row without modifying order',()=>{
  const filters=normalizeReviewCycleFilters({search:'x'.repeat(500),transition:'approved',documentId:' all ',kind:'unsafe',groupBy:'owner'});
  assert.equal(filters.search.length,240);assert.equal(filters.transition,'changes');assert.equal(filters.documentId,'all');assert.equal(filters.kind,'all');assert.equal(filters.groupBy,'transition');
  const r=record('all');register(r,[item(r)]);const ref=capture([r]);revise(r,0,{response:'เพิ่มเติม'});const model=compare(ref,[r]),before=JSON.stringify(model);
  assert.equal(filterReviewCycle(model,{documentId:'all'}).length,1);
  for(const by of ['transition','document','invalid'])assert.equal(groupReviewCycle(model.entries,by).flatMap(group=>group.entries).length,model.entries.length);
  assert.equal(JSON.stringify(model),before);assert.equal(Object.keys(model.summary.counts).length,Object.keys(REVIEW_CYCLE_TRANSITIONS).length);
});

test('all 900 authored issues remain comparable and filterable without display-size truncation',()=>{
  const records=Array.from({length:30},(_,i)=>record('source-'+i));
  for(const r of records)register(r,Array.from({length:30},(_,i)=>item(r,{id:'issue-'+i,sequence:i+1})));
  const ref=capture(records);for(const r of records)for(let i=0;i<30;i++)revise(r,i,{response:'หลักฐานรอบใหม่'});
  const model=compare(ref,records);assert.equal(model.summary.total,900);assert.equal(model.summary.counts.updated,900);assert.equal(filterReviewCycle(model).length,900);assert.equal(new Set(model.entries.map(row=>row.id)).size,900);
});

test('strict reference adapter rejects unsafe data without executing getters and returns independent source copies',()=>{
  const ref=capture([record()]);let executed=0;const bad=structuredClone(ref);Object.defineProperty(bad,'note',{enumerable:true,get(){executed++;return 'bad';}});
  assert.throws(()=>handoverReferenceSource(bad),/ตัวอ่าน|ซ่อน/);assert.equal(executed,0);
  const source=handoverReferenceSource(ref);source.records[0].data.d=999;source.composer.metadata.title='เปลี่ยน';assert.notEqual(ref.bundle.records[0].data.d,999);assert.notEqual(ref.bundle.metadata.title,'เปลี่ยน');
});

test('deeply frozen reference, source records and selections remain unchanged and returned evidence is independent',()=>{
  const r=record();register(r,[item(r)]);const ref=freeze(capture([r])),records=freeze([r]),state=freeze(composer(['beam'])),before=JSON.stringify({ref,records,state});
  const model=compare(ref,records,state);model.entries[0].after.evidence[0].value='modified output';model.beforeModel.documents[0].document.projectCode='different output';
  assert.equal(JSON.stringify({ref,records,state}),before);
});

test('invalid reference and generation time fail instead of creating an incomplete comparison',()=>{
  const ref=capture([record()]);assert.throws(()=>compare({...ref,capturedAt:PAST},[record()]),/ตรง|ฉบับ/);
  assert.throws(()=>compare(ref,[record()],composer(['beam']),{now:'2026-02-31T00:00:00.000Z'}),/วันที่/);
});
