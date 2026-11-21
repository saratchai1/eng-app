import test from 'node:test';
import assert from 'node:assert/strict';
import {engineeringTools,defaultInputs} from '../src/engineering.js';
import {quantityTools} from '../src/quantities.js';
import {normalizeDocument} from '../src/document-control.js';
import {captureReviewItem} from '../src/review-register.js';
import {normalizeBoqState} from '../src/workflows.js';
import {normalizeHandoverState,planProjectBundleImport} from '../src/handover.js';
import {MAX_HANDOVER_REFERENCES,MAX_HANDOVER_HISTORY_BYTES,restoreHandoverHistory,handoverHistoryBytes,captureHandoverReference,appendHandoverReference,handoverReferenceModel,compareHandoverReference,formatHandoverDelta} from '../src/handover-history.js';

const PAST='2026-11-21T10:00:00.000Z',NOW='2026-11-22T10:00:00.000Z',LATER='2026-11-22T11:00:00.000Z';
const definitions={...engineeringTools,...quantityTools};
const document=()=>normalizeDocument({projectCode:'DEMO / STR-001',revision:'P01',preparedBy:'ผู้จัดทำตัวอย่าง',designBasis:'ข้อมูลตัวอย่าง'});
const record=(id='beam',toolId='rc-beam',data={...defaultInputs('rc-beam'),_document:document()})=>({schemaVersion:1,id,toolId,name:'งานตัวอย่าง '+id,createdAt:PAST,updatedAt:NOW,data});
const composer=(ids=['beam'],metadata={})=>normalizeHandoverState({selectedIds:ids,metadata:{title:'ชุดส่งตรวจตัวอย่าง',reference:'TR-001',recipient:'ผู้ตรวจตัวอย่าง',purpose:'for-review',note:'ทดสอบ',...metadata}});
const capture=(records=[record()],state=composer(records.map(item=>item.id)),options={})=>captureHandoverReference(records,state,{id:'reference-one',code:'H01',note:'ข้อมูลก่อนตรวจ',now:NOW,appVersion:'0.7',...options});
const archive=entries=>({schemaVersion:1,entries});
const compare=(entry,records,state=composer(records.map(item=>item.id)),options={})=>compareHandoverReference(entry,records,definitions,state,{now:LATER,appVersion:'0.7',...options});
const defaults=definition=>Object.fromEntries(definition.inputGroups.flatMap(group=>group.fields).map(field=>[field.key,field.default]));

test('captures complete independent source data and pending drafts without changing live work',()=>{
  const records=[record()];records[0].fromDraft=true;
  records[0].data._review={schemaVersion:1,toolId:'rc-beam',nextSequence:1,items:[],pending:{itemId:null,values:{title:'กำลังเขียน',detail:'',owner:'',response:'ยังไม่ได้ยืนยัน',status:'open',priority:'normal'}}};
  const state=composer(),before=structuredClone({records,state}),entry=capture(records,state);
  assert.deepEqual({records,state},before);assert.deepEqual(entry.bundle.records[0].data,records[0].data);
  assert.equal(entry.bundle.records[0].sourceState,'draft');assert.equal(entry.capturedAt,NOW);assert.equal(entry.appVersion,'0.7');
  records[0].data.d=900;state.metadata.title='แก้ชื่อ';
  assert.notEqual(entry.bundle.records[0].data.d,900);assert.equal(entry.bundle.metadata.title,'ชุดส่งตรวจตัวอย่าง');
  assert.equal(entry.bundle.records[0].data._review.pending.values.response,'ยังไม่ได้ยืนยัน');
});

test('capture requires explicit code, note, valid source dates and existing selected records',()=>{
  for(const options of [{code:''},{note:'  '},{id:'bad id'},{now:'2026-02-31T00:00:00.000Z'},{appVersion:''}])assert.throws(()=>capture([record()],composer(),options));
  assert.throws(()=>capture([],composer(['missing'])),/ไม่พบงาน/);
  const missingDate=record();delete missingDate.createdAt;assert.throws(()=>capture([missingDate]),/วันที่ต้นทาง/);
  assert.throws(()=>capture([record()],composer([])),/1–30/);
  const draft=record();draft.fromDraft='true';assert.throws(()=>capture([draft]),/สถานะร่าง/);
});

test('invalid calculation inputs remain recoverable evidence and never become fabricated passes',()=>{
  const source=record();source.data.d=null;
  const entry=capture([source]),restored=restoreHandoverHistory(archive([entry]));
  assert.equal(restored.rejected,0);assert.equal(restored.state.entries[0].bundle.records[0].data.d,null);
  const preview=handoverReferenceModel(entry,definitions,{now:LATER,appVersion:'0.7'});
  assert.equal(preview.model.summary.invalid,1);assert.equal(preview.model.entries[0].model.assessment,null);
  assert.equal(preview.model.generatedAt,LATER);assert.equal(preview.reference.capturedAt,NOW);
  assert.match(preview.warnings[0],/รุ่นปัจจุบัน/);
});

test('minimal archives, strings and null restore without inventing UI settings or adjustment warnings',()=>{
  const entry=capture();
  for(const raw of [archive([entry]),JSON.stringify(archive([entry]))]){
    const restored=restoreHandoverHistory(raw);assert.equal(restored.rejected,0);assert.equal(restored.adjusted,false);assert.equal(restored.notice,'');
    assert.equal(restored.state.selectedId,null);assert.equal(restored.state.includeInReport,false);assert.deepEqual(restored.state.draft,{code:'',note:''});
    assert.equal(restored.bytes,new TextEncoder().encode(JSON.stringify(archive([entry]))).byteLength);
  }
  for(const raw of [null,undefined])assert.equal(restoreHandoverHistory(raw).rejected,0);
});

test('append enforces six references, stable identity and case-insensitive code uniqueness',()=>{
  let state=archive([]);
  for(let i=0;i<MAX_HANDOVER_REFERENCES;i++)state=appendHandoverReference(state,[record()],composer(),{id:'ref-'+i,code:'H0'+i,note:'เหตุผล '+i,now:NOW,appVersion:'0.7'});
  assert.equal(state.entries.length,6);assert.equal(state.selectedId,'ref-5');assert.deepEqual(state.draft,{code:'',note:''});
  assert.throws(()=>appendHandoverReference(state,[record()],composer(),{id:'ref-seven',code:'H07',note:'เกิน',now:NOW}),/สูงสุด 6/);
  const one=archive([capture()]);
  assert.throws(()=>appendHandoverReference(one,[record()],composer(),{id:'second',code:'h01',note:'ซ้ำ',now:NOW}),/ซ้ำ/);
  assert.throws(()=>appendHandoverReference(one,[record()],composer(),{id:'reference-one',code:'H02',note:'ซ้ำ',now:NOW}),/ซ้ำ/);
  assert.equal(one.entries.length,1);
});

test('restore rejects malformed evidence without rewriting it and retains later valid records',()=>{
  const first=capture(),valid=capture([record()],composer(),{id:'valid',code:'H02'});
  const mutations=[entry=>entry.code=' H01 ',entry=>entry.note='X'.repeat(1201),entry=>entry.capturedAt=PAST,entry=>entry.appVersion='different',entry=>entry.bundle.metadata.extra='not captured schema',entry=>entry.bundle.records[0].extra='unknown',entry=>entry.bundle.records[0].updatedAt='bad'];
  for(const mutate of mutations){
    const bad=structuredClone(first);mutate(bad);const raw=archive([bad,valid]),before=structuredClone(raw),restored=restoreHandoverHistory(raw);
    assert.equal(restored.rejected,1);assert.equal(restored.state.entries.length,1);assert.equal(restored.state.entries[0].id,'valid');
    assert.deepEqual(raw,before);assert.match(restored.notice,/ยังไม่ได้เขียนทับ/);
  }
  assert.equal(restoreHandoverHistory(archive([first,{...valid,code:'h01'}])).rejected,1);
  const seven=Array.from({length:7},(_,i)=>({...structuredClone(first),id:'ref-'+i,code:'H'+i}));
  assert.equal(restoreHandoverHistory(archive(seven)).state.entries.length,6);assert.equal(restoreHandoverHistory(archive(seven)).rejected,1);
});

test('bad UI preferences are disclosed independently while valid captured entries survive',()=>{
  const entry=capture(),raw={...archive([entry]),selectedId:'missing',includeInReport:true,draft:{code:'H02',note:' text with spaces '}};
  const restored=restoreHandoverHistory(raw);assert.equal(restored.state.entries.length,1);assert.equal(restored.adjusted,true);
  assert.equal(restored.state.selectedId,null);assert.equal(restored.state.includeInReport,false);assert.equal(restored.state.draft.note,' text with spaces ');
  const valid=restoreHandoverHistory({...archive([entry]),selectedId:entry.id,includeInReport:true,draft:{code:'H02',note:'Pending'}});
  assert.equal(valid.rejected,0);assert.equal(valid.adjusted,false);assert.equal(valid.state.includeInReport,true);
});

test('archive accessors, serializers, unsafe JSON and deep payloads never execute during restore',()=>{
  let executed=0;const original=capture(),good={...structuredClone(original),id:'good',code:'H02'};
  const getter=structuredClone(original);Object.defineProperty(getter,'note',{enumerable:true,get(){executed++;return 'bad';}});
  const nested=structuredClone(original);Object.defineProperty(nested.bundle.records[0].data,'trap',{enumerable:true,get(){executed++;return 1;}});
  const serializer=structuredClone(original);Object.defineProperty(serializer.bundle.records[0].data,'toJSON',{value(){executed++;return {};}});
  for(const bad of [getter,nested,serializer]){const restored=restoreHandoverHistory(archive([bad,good]));assert.equal(restored.rejected,1);assert.equal(restored.state.entries[0].id,'good');}
  const array=archive([original,good]);Object.defineProperty(array.entries,'0',{enumerable:true,get(){executed++;return original;}});assert.equal(restoreHandoverHistory(array).rejected,1);
  const root=archive([]);Object.defineProperty(root,'entries',{enumerable:true,get(){executed++;return [];}});assert.equal(restoreHandoverHistory(root).rejected,1);
  assert.throws(()=>handoverHistoryBytes(root),/ตัวอ่านค่า/);
  assert.equal(executed,0);
  const polluted=JSON.stringify(archive([original])).replace('"data":{','"data":{"__proto__":{},');assert.equal(restoreHandoverHistory(polluted).rejected,1);
  assert.equal(restoreHandoverHistory('{broken').rejected,1);
});

test('evidence byte limit counts UTF-8 and preserves smaller valid snapshots when a candidate is too large',()=>{
  const source=record();source.data.memo='ก'.repeat(1450000);
  assert.throws(()=>capture([source]),/4 MiB/);
  const first=record();first.data.memo='A'.repeat(2200000);
  const large=capture([first]),other=capture([first],composer(),{id:'second',code:'H02'}),small=capture([record()],composer(),{id:'small',code:'H03'});
  const restored=restoreHandoverHistory(archive([large,other,small]));
  assert.equal(restored.rejected,1);assert.deepEqual(restored.state.entries.map(entry=>entry.id),['reference-one','small']);
  assert.ok(restored.bytes<=MAX_HANDOVER_HISTORY_BYTES);
  assert.throws(()=>appendHandoverReference(archive([large]),[first],composer(),{id:'second',code:'H02',note:'เกินพื้นที่',now:NOW}),/รวมเกิน 4/);
});

test('stable local IDs define added and removed records; names or project codes never reconnect imports',()=>{
  const original=record(),entry=capture([original]);
  const imported=planProjectBundleImport(entry.bundle,[],{idFactory:()=> 'imported-copy',now:LATER}).records;
  const result=compare(entry,imported,composer(['imported-copy']));
  assert.equal(result.summary.added,1);assert.equal(result.summary.removed,1);assert.equal(result.summary.changed,0);
  assert.deepEqual(result.entries.map(row=>[row.id,row.status]),[['imported-copy','added'],['beam','removed']]);
});

test('missing current references remain different from deliberately removed selections',()=>{
  const records=[record('one'),record('two')],entry=capture(records);
  const result=compare(entry,[records[0]],composer(['two','new-missing']));
  assert.equal(result.summary.missing,2);assert.equal(result.summary.removed,1);assert.equal(result.summary.added,0);
  assert.equal(result.summary.currentDocuments,0);
  assert.deepEqual(result.entries.map(row=>[row.id,row.status]),[['two','missing'],['new-missing','missing'],['one','removed']]);
  assert.equal(result.entries[0].before.id,'two');assert.equal(result.entries[0].after.sourceState,'missing');
});

test('order changes are separate from contents, while additions alone do not mark retained documents reordered',()=>{
  const records=[record('a'),record('b'),record('c')],entry=capture(records);
  const reorder=compare(entry,records,composer(['c','b','a']));
  assert.equal(reorder.summary.changed,0);assert.equal(reorder.summary.unchanged,3);assert.equal(reorder.summary.reordered,2);assert.equal(reorder.orderChanged,true);
  assert.deepEqual(reorder.orderChanges.map(row=>row.id),['c','a']);
  const extra=record('extra'),added=compare(entry,[extra,...records],composer(['extra','a','b','c']));
  assert.equal(added.summary.added,1);assert.equal(added.summary.reordered,0);assert.equal(added.orderChanged,false);
});

test('updatedAt-only saves stay unchanged but provenance and original creation-date differences are explicit',()=>{
  const source=record(),entry=capture([source]),next=structuredClone(source);next.updatedAt=LATER;
  const saved=compare(entry,[next]);assert.equal(saved.summary.changed,0);assert.equal(saved.summary.unchanged,1);
  assert.equal(saved.entries[0].changes.updatedAt,true);assert.equal(saved.entries[0].details.timestampChanges.length,1);
  next.fromDraft=true;const drafted=compare(entry,[next]);assert.equal(drafted.summary.changed,1);assert.equal(drafted.entries[0].changes.sourceState,true);
  delete next.fromDraft;next.createdAt=NOW;const changedCreation=compare(entry,[next]);assert.equal(changedCreation.summary.changed,1);assert.equal(changedCreation.entries[0].changes.createdAt,true);
});

test('all calculator field and document changes are labeled and current models recompute both sides',()=>{
  const source=record(),entry=capture([source]),next=structuredClone(source);
  next.name='คานปรับแก้';next.data.d+=50;next.data._document.revision='P02';next.data._document.reviewItems[0].checked=true;
  const result=compare(entry,[next]),row=result.entries[0];
  assert.equal(row.status,'changed');assert.equal(row.changes.name,true);
  assert.equal(row.details.inputChanges.length,1);assert.equal(row.details.inputChanges[0].key,'d');assert.equal(row.details.inputChanges[0].unit,'mm');
  assert.ok(row.details.documentChanges.some(change=>change.key==='revision'));
  assert.ok(row.details.documentChanges.some(change=>change.key==='reviewItems.inputs.checked'));
  const capacity=row.details.metrics.find(metric=>metric.unit==='kN·m'&&metric.delta>0);
  assert.ok(capacity);assert.equal(capacity.delta,capacity.after-capacity.before);assert.match(capacity.deltaText,/^\+/);
  assert.equal(entry.bundle.records[0].data.d,source.data.d);
});

test('tiny monetary deltas and percentage-point differences are never hidden by relative tolerances',()=>{
  const definition=quantityTools['factor-k'],baseline={...defaults(definition),amount:1e12,laborNow:100,cementNow:100,steelNow:100,_document:document()};
  const original=record('factor','factor-k',baseline),entry=capture([original]),next=structuredClone(original);next.data.laborNow=100.00000000004;
  const result=compare(entry,[next]),metric=result.entries[0].details.metrics.find(item=>item.label==='มูลค่าตามดัชนี');
  const before=definition.calculate(baseline),after=definition.calculate(next.data);
  assert.equal(metric.delta,after.values.adjusted-before.values.adjusted);assert.ok(metric.delta>0&&metric.delta<1);assert.notEqual(metric.deltaText,'0');
  assert.notEqual(formatHandoverDelta(1e-13),'0');assert.match(formatHandoverDelta(1e-13),/^\+.*e-13$/);
  const beam=record(),beamRef=capture([beam]),changed=structuredClone(beam);changed.data.d+=50;
  assert.ok(compare(beamRef,[changed]).entries[0].details.metrics.filter(item=>item.unit==='%').every(item=>item.deltaUnit==='จุดเปอร์เซ็นต์'));
});

test('invalid current inputs yield unavailable deltas rather than zero, and changed tools never compare unlike metrics',()=>{
  const source=record(),entry=capture([source]),bad=structuredClone(source);bad.data.d=null;
  const invalid=compare(entry,[bad]);assert.equal(invalid.currentSummary.invalid,1);
  assert.ok(invalid.entries[0].details.metrics.length>0);assert.ok(invalid.entries[0].details.metrics.every(metric=>metric.delta===null&&!metric.comparable));
  const other=record('beam','rc-slab',{...defaultInputs('rc-slab'),_document:document()});
  const changed=compare(entry,[other]);assert.equal(changed.entries[0].changes.tool,true);assert.equal(changed.entries[0].details.metrics.length,0);
  assert.match(changed.entries[0].details.warnings.join(' '),/ข้ามแบบจำลอง/);
});

test('register effective status differences follow changed current inputs without rewriting old declarations',()=>{
  const source=record();
  const item=captureReviewItem(engineeringTools['rc-beam'],source.data,{id:'review-one',sequence:1,title:'ตรวจหน้าตัด',priority:'critical',status:'closed',response:'ตรวจแล้ว',document:source.data._document,now:PAST});
  source.data._review={schemaVersion:1,toolId:'rc-beam',nextSequence:2,items:[item],pending:null};
  const entry=capture([source]),next=structuredClone(source);next.data.d+=50;
  const result=compare(entry,[next]);assert.equal(result.beforeSummary.reviewOutstanding,0);assert.equal(result.currentSummary.reviewOutstanding,1);
  assert.ok(result.entries[0].details.registerChanges.some(change=>change.key==='needsReview'&&change.after===1));
  assert.equal(entry.bundle.records[0].data._review.items[0].status,'closed');assert.equal(next.data._review.items[0].status,'closed');
});

test('workflow and nested sections report every changed top-level field without flattening image payloads',()=>{
  const boq=normalizeBoqState(null),source=record('boq','boq-building',{...boq,_document:document(),image:{src:'data:image/png;base64,'+'A'.repeat(20000),name:'ภาพเดิม'}});
  const entry=capture([source]),next=structuredClone(source);next.data.rows[0].quantity+=1;next.data.notes='เพิ่มเติม';next.data.image.src+='A';
  const result=compare(entry,[next]),details=result.entries[0].details;
  assert.deepEqual(details.sectionChanges.map(change=>change.key),['rows','notes','image']);
  assert.equal(details.sectionChanges[0].beforeCount,boq.rows.length);assert.equal(details.sectionChanges[0].changedCount,1);
  assert.ok(JSON.stringify(details).length<15000);assert.doesNotMatch(JSON.stringify(details),/AAAAAA/);
  assert.ok(details.metrics[0].delta>0);
});

test('package metadata comparison never changes a document status and objects with reordered keys remain equal',()=>{
  const source=record(),entry=capture([source]),next=structuredClone(source);next.data=Object.fromEntries(Object.entries(next.data).reverse());
  const state=composer(['beam'],{title:'ชุดชื่อใหม่',reference:'TR-002',recipient:'ผู้รับใหม่'}),result=compare(entry,[next],state);
  assert.equal(result.summary.metadataChanges,3);assert.equal(result.summary.changed,0);assert.equal(result.summary.unchanged,1);
  assert.deepEqual(result.metadataChanges.map(change=>change.key),['title','reference','recipient']);
});

test('reference previews recompute using supplied current models rather than trusting any stored answers',()=>{
  const source=record(),entry=capture([source]);entry.bundle.records[0].data.capacity=999999;
  const current={...definitions,'rc-beam':{...engineeringTools['rc-beam'],calculate:input=>{
    const result=engineeringTools['rc-beam'].calculate(input);return {...result,summary:result.summary.map(metric=>typeof metric.value==='number'?{...metric,value:metric.value*2}:metric)};
  }}};
  const original=handoverReferenceModel(entry,definitions,{now:LATER,appVersion:'0.7'}),newEngine=handoverReferenceModel(entry,current,{now:LATER,appVersion:'0.8'});
  assert.equal(newEngine.model.entries[0].model.metrics[0].value,original.model.entries[0].model.metrics[0].value*2);
  assert.equal(newEngine.currentAppVersion,'0.8');assert.equal(newEngine.reference.appVersion,'0.7');
});

test('comparison and preview do not mutate history, composer or either current source record',()=>{
  const source=record(),entry=capture([source]),next=structuredClone(source);next.data.d+=50;const state=composer(['beam']);
  const before=structuredClone({entry,next,state});compare(entry,[next],state);handoverReferenceModel(entry,definitions,{now:LATER});
  assert.deepEqual({entry,next,state},before);
});
