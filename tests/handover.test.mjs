import test from 'node:test';
import assert from 'node:assert/strict';
import {engineeringTools, defaultInputs} from '../src/engineering.js';
import {quantityTools} from '../src/quantities.js';
import {normalizeDocument} from '../src/document-control.js';
import {captureReviewItem} from '../src/review-register.js';
import {captureRevision} from '../src/revisions.js';
import {normalizeBoqState, calculateBoq, normalizePlanningState, normalizeInspectionState} from '../src/workflows.js';
import {persistJSON} from '../src/project-storage.js';
import {MAX_HANDOVER_RECORDS, MAX_BUNDLE_BYTES, normalizeHandoverState, buildHandover, createProjectBundle, parseProjectBundle, planProjectBundleImport, handoverCSV} from '../src/handover.js';

const NOW='2026-11-22T10:00:00.000Z';
const EARLIER='2026-11-21T10:00:00.000Z';
const definitions={...engineeringTools,...quantityTools};
const doc=()=>normalizeDocument({projectCode:'DEMO / STR-01',client:'ลูกค้าตัวอย่าง',revision:'P02'});
const makeRecord=(id='beam',toolId='rc-beam',data={...defaultInputs('rc-beam'),_document:doc()})=>({schemaVersion:1,id,toolId,name:'งานตัวอย่าง '+id,createdAt:EARLIER,updatedAt:NOW,data});
const compose=(ids=['beam'],metadata={})=>normalizeHandoverState({metadata:{title:'ชุดส่งตรวจ A',reference:'TR-001',recipient:'ผู้ตรวจตัวอย่าง',note:'ข้อมูลตัวอย่าง',...metadata},selectedIds:ids});
const register=(items=[],pending=null)=>({schemaVersion:1,toolId:'rc-beam',nextSequence:items.length+1,items,pending});
const closedItem=(inputs=defaultInputs('rc-beam'))=>captureReviewItem(engineeringTools['rc-beam'],inputs,{id:'rv-one',sequence:1,title:'ตรวจหน้าตัด',detail:'เทียบข้อมูลตัวอย่าง',owner:'ผู้ตรวจตัวอย่าง',priority:'critical',status:'closed',response:'ตรวจแล้ว',document:doc(),now:EARLIER});
const revisions=(entries=[])=>({schemaVersion:1,toolId:'rc-beam',entries,selectedId:entries.at(-1)?.id||null,includeInReport:entries.length>0,draftNote:''});
const model=(records,state=compose(records.map(record=>record.id)))=>buildHandover(records,definitions,state,{now:NOW});
const bundle=(records=[makeRecord()],state=compose(records.map(record=>record.id)))=>createProjectBundle(records,state,{now:NOW,appVersion:'0.6'});

test('composer normalization bounds text and selections without mutating caller state',()=>{
  const raw={metadata:{title:'  ตัวอย่าง\u0000  ',reference:42,recipient:'X'.repeat(200),purpose:'approve',note:'A'.repeat(2500)},selectedIds:['a','a','',null,...Array.from({length:40},(_,i)=>'id-'+i)]};
  const normalized=normalizeHandoverState(raw);
  assert.equal(normalized.schemaVersion,1);assert.equal(normalized.metadata.title,'ตัวอย่าง');
  assert.equal(normalized.metadata.reference,'');assert.equal(normalized.metadata.recipient.length,160);
  assert.equal(normalized.metadata.note.length,2400);assert.equal(normalized.metadata.purpose,'for-review');
  assert.equal(normalized.selectedIds.length,MAX_HANDOVER_RECORDS);assert.equal(normalized.selectedIds[0],'a');
  assert.equal(raw.selectedIds.length,44);assert.equal(normalizeHandoverState().metadata.title,'ชุดเอกสารส่งตรวจ');
});

test('selected order, missing references and draft provenance remain explicit and read-only',()=>{
  const records=[makeRecord('one'),{...makeRecord('two'),fromDraft:true}],before=structuredClone(records);
  const result=model(records,compose(['two','missing','one']));
  assert.deepEqual(result.entries.map(entry=>entry.id),['two','missing','one']);
  assert.equal(result.entries[1].sourceState,'missing');assert.equal(result.entries[1].missing,true);
  assert.equal(result.summary.documents,2);assert.equal(result.summary.missing,1);assert.equal(result.summary.drafts,1);
  assert.equal(result.summary.invalid,0);assert.deepEqual(records,before);
  const ambiguous=model([makeRecord('one'),makeRecord('one')],compose(['one']));
  assert.equal(ambiguous.summary.missing,1);assert.match(ambiguous.entries[0].warnings[0],/มากกว่าหนึ่ง/);
});

test('calculator register never obtains success by filling missing inputs or coercing strings',()=>{
  const missing=makeRecord('missing-input');delete missing.data.d;
  const string=makeRecord('string-input');string.data.d='500';
  const range=makeRecord('out-of-range');range.data.count=0;
  const result=model([missing,string,range]);
  assert.equal(result.summary.invalid,3);
  for(const entry of result.entries){assert.equal(entry.model.status,'invalid');assert.equal(entry.model.metrics.length,0);assert.equal(entry.model.assessment,null);assert.ok(entry.warnings.length);}
});

test('model check counts, manual declarations and contextual review counts stay distinct',()=>{
  const failed=makeRecord('failed');failed.data.mu=1000;
  const unassessed=makeRecord('unassessed');unassessed.data.d=50;unassessed.data.count=24;
  const reviewed=makeRecord('reviewed');reviewed.data._review=register([closedItem()]);reviewed.data.d+=50;
  reviewed.data._document.reviewItems.forEach(item=>item.checked=true);
  const result=model([failed,unassessed,reviewed]);
  assert.ok(result.summary.modelFailures>=1);assert.ok(result.summary.modelUnassessed>=1);
  assert.equal(result.summary.reviewOutstanding,1);assert.equal(result.summary.reviewNeedsReview,1);
  assert.equal(result.summary.manualPending,2);assert.equal(result.summary.invalid,0);
  assert.equal(reviewed.data._review.items[0].status,'closed');
  assert.equal(result.entries[2].model.assessment.fail,0);
});

test('BOQ totals remain per document; price books never contribute an invented project total',()=>{
  const boq=normalizeBoqState(null,'boq-building'),prices=normalizeBoqState(null,'price-book');
  const records=[makeRecord('boq-a','boq-building',boq),makeRecord('boq-b','boq-building',structuredClone(boq)),makeRecord('rates','price-book',prices)];
  const result=model(records);
  assert.equal(result.summary.documents,3);assert.equal(result.summary.disciplines,1);assert.equal(result.summary.invalid,0);
  assert.equal(result.entries[0].model.metrics[0].value,calculateBoq(boq).total);
  assert.equal(result.entries[1].model.metrics[0].value,calculateBoq(boq).total);
  assert.equal(result.entries[2].model.metrics.length,1);assert.equal(result.entries[2].model.metrics[0].unit,'รายการ');
  assert.equal(Object.hasOwn(result.summary,'totalCost'),false);assert.equal(Object.hasOwn(result.summary,'budget'),false);
  const reordered=structuredClone(boq);reordered.rows=reordered.rows.map(row=>Object.fromEntries(Object.entries(row).reverse()));
  assert.equal(model([makeRecord('reordered','boq-building',reordered)]).summary.invalid,0);
});

test('workflow defaults and repaired numeric types are not reported as original validated totals',()=>{
  const partial=makeRecord('partial','boq-building',{rows:[]});
  const numeric=makeRecord('numeric','boq-building',normalizeBoqState(null));numeric.data.rows[0].quantity='18';
  const planning=makeRecord('plan','planning',normalizePlanningState());delete planning.data.statusDate;
  const inspection=makeRecord('inspection','inspection',normalizeInspectionState());inspection.data.items[0].status='approved';
  const result=model([partial,numeric,planning,inspection]);
  assert.equal(result.summary.invalid,4);assert.equal(result.summary.inspectionDefects,0);
  assert.ok(result.entries.every(entry=>entry.model.metrics.length===0));
});

test('planning and inspection use existing models without treating defects as structural failures',()=>{
  const planning=normalizePlanningState({version:1,startDate:'2026-11-23',statusDate:'2026-11-24',tasks:[{id:'A',name:'กิจกรรม',duration:4,predecessors:'',progress:25,budget:100}],notes:''});
  const inspection=normalizeInspectionState();inspection.items[0].status='fail';inspection.items[1].status='pass';
  const result=model([makeRecord('plan','planning',planning),makeRecord('inspection','inspection',inspection)]);
  assert.equal(result.summary.invalid,0);assert.equal(result.summary.inspectionDefects,1);assert.equal(result.summary.modelFailures,0);
  assert.equal(result.entries[0].model.metrics[0].value,4);assert.equal(result.entries[0].model.metrics[2].value,-25);
  assert.equal(result.entries[1].model.inspection.fail,1);
});

test('malformed review/revision metadata is disclosed and cannot retain displayed human confirmations',()=>{
  const record=makeRecord();record.data._document.reviewItems.forEach(item=>item.checked=true);
  record.data._review=register([{...closedItem(),status:'approved'}]);
  record.data._revisions={...revisions(),entries:[{id:'bad'}],selectedId:'bad',includeInReport:true};
  const before=structuredClone(record),result=model([record]);
  assert.equal(result.entries[0].model.status,'calculated');
  assert.equal(result.entries[0].review.completed,0);assert.equal(result.summary.manualPending,1);
  assert.equal(result.entries[0].adjustments.registerRejected,1);assert.ok(result.entries[0].adjustments.revisionRejected);
  assert.match(result.entries[0].warnings.join(' '),/ยืนยันเดิมต้องตรวจใหม่/);assert.deepEqual(record,before);
});

test('pending response and revision-note drafts count once per document and never close an issue',()=>{
  const record=makeRecord();
  const open=captureReviewItem(engineeringTools['rc-beam'],record.data,{id:'rv-open',sequence:1,title:'รอตรวจ',document:doc(),now:EARLIER});
  record.data._review=register([open],{itemId:open.id,values:{title:'รอตรวจ',detail:'',owner:'',response:'กำลังเขียน',priority:'normal',status:'closed'}});
  record.data._revisions={...revisions(),draftNote:'ยังไม่ได้ออกฉบับ'};
  const result=model([record]);assert.equal(result.summary.editorDrafts,1);assert.equal(result.summary.reviewOutstanding,1);
  assert.equal(result.entries[0].register.closed,0);assert.equal(record.data._review.items[0].status,'open');
});

test('special reference records are not assigned invented engineering or cost assessments',()=>{
  const result=model([makeRecord('guide','guide',{}),makeRecord('drawings','drawings',{})]);
  assert.equal(result.summary.invalid,0);assert.equal(result.summary.disciplines,2);
  assert.ok(result.entries.every(entry=>entry.model.status==='reference'&&entry.model.assessment===null&&entry.model.metrics.length===0));
});

test('bundle round-trip preserves complete data, source provenance, pending text and historical revision records',()=>{
  const record={...makeRecord(),fromDraft:true};
  const revision=captureRevision(engineeringTools['rc-beam'],record.data,doc(),{id:'p02',note:'ข้อมูลอ้างอิง',capturedAt:EARLIER});
  record.data._revisions=revisions([revision]);record.data._review=register([closedItem()]);
  record.data._options={schemaVersion:1,toolId:'rc-beam',options:[],includeInReport:false};
  record.data._review.pending={itemId:'rv-one',values:{title:'ตรวจหน้าตัด',detail:'กำลังเพิ่ม',owner:'ผู้ตรวจตัวอย่าง',priority:'critical',status:'closed',response:'ยังเขียนไม่เสร็จ'}};
  const before=structuredClone(record),exported=bundle([record]),parsed=parseProjectBundle(JSON.stringify(exported,null,2));
  assert.equal(parsed.format,'engapp-project-bundle');assert.equal(parsed.records[0].sourceId,record.id);assert.equal(parsed.records[0].sourceState,'draft');
  assert.deepEqual(parsed.records[0].data,record.data);assert.deepEqual(record,before);
  parsed.records[0].data.d=999;assert.notEqual(record.data.d,999);
});

test('export refuses missing, ambiguous, empty, duplicate or oversized selections',()=>{
  assert.throws(()=>bundle([],compose([])),/1–30/);
  assert.throws(()=>bundle([],compose(['missing'])),/ไม่พบงาน/);
  assert.throws(()=>bundle([makeRecord(),makeRecord()],compose()),/รหัสงานซ้ำ/);
  assert.throws(()=>bundle([makeRecord()],{...compose(),selectedIds:['beam','beam']}),/ไม่ซ้ำ/);
  assert.throws(()=>bundle([makeRecord()],{...compose(),selectedIds:Array.from({length:31},(_,i)=>String(i))}),/1–30/);
});

test('bundle envelope rejects unknown tools, duplicates, bad metadata and invalid timestamps',()=>{
  const valid=bundle();
  for(const mutate of [
    value=>value.format='foreign',value=>value.schemaVersion=2,value=>value.exportedAt='2026-02-31T00:00:00.000Z',
    value=>value.records[0].toolId='unknown',value=>value.records.push(structuredClone(value.records[0])),
    value=>value.records[0].sourceState='approved',value=>value.records[0].data=[],value=>value.records[0].createdAt='bad',
    value=>delete value.metadata.note,value=>value.metadata.title=' ',value=>value.metadata.purpose='approved',
  ]){const value=structuredClone(valid);mutate(value);assert.throws(()=>parseProjectBundle(value));}
  assert.throws(()=>parseProjectBundle('{broken'),/JSON/);
});

test('bundle bounds bytes, nodes, nesting, unsafe keys and non-JSON values before import planning',()=>{
  assert.throws(()=>parseProjectBundle(' '.repeat(MAX_BUNDLE_BYTES+1)),/8 MB/);
  const utf8=bundle();utf8.records[0].data.extra='ก'.repeat(2900000);assert.throws(()=>parseProjectBundle(utf8),/8 MB/);
  const deep=bundle();let cursor=deep.records[0].data;for(let i=0;i<26;i++)cursor=cursor.next={};assert.throws(()=>parseProjectBundle(deep),/ซ้อน/);
  const polluted=JSON.stringify(bundle()).replace('"data":{','"data":{"__proto__":{},');assert.throws(()=>parseProjectBundle(polluted),/ปลอดภัย/);
  const nonfinite=bundle();nonfinite.records[0].data.d=Infinity;assert.throws(()=>parseProjectBundle(nonfinite),/ตัวเลข/);
  const cyclic=bundle();cyclic.records[0].data.cycle=cyclic;assert.throws(()=>parseProjectBundle(cyclic),/วนซ้ำ/);
  const getter=bundle();Object.defineProperty(getter.records[0].data,'trap',{enumerable:true,get(){throw new Error('must not execute');}});assert.throws(()=>parseProjectBundle(getter),/ตัวอ่านค่า/);
  const arrayGetter=bundle();Object.defineProperty(arrayGetter.records,'0',{enumerable:true,get(){throw new Error('must not execute');}});assert.throws(()=>parseProjectBundle(arrayGetter),/ตัวอ่านค่า/);
  const serializer=bundle();Object.defineProperty(serializer.records[0].data,'toJSON',{value(){throw new Error('must not execute');}});assert.throws(()=>parseProjectBundle(serializer),/ซ่อนอยู่/);
});

test('recoverable invalid calculations can travel without being normalized or represented as valid',()=>{
  const record=makeRecord();record.data.d=null;
  const parsed=parseProjectBundle(bundle([record]));assert.equal(parsed.records[0].data.d,null);
  const preview=model(parsed.records.map(row=>({...row,id:row.sourceId,fromDraft:row.sourceState==='draft'})));
  assert.equal(preview.summary.invalid,1);assert.equal(preview.entries[0].model.metrics.length,0);
});

test('import appends fresh identities and preserves original data and valid declarations',()=>{
  const source=makeRecord();source.data._document.reviewItems.forEach(item=>item.checked=true);source.data._review=register([closedItem()]);
  const existing=[makeRecord('existing')],before=structuredClone(existing),portable=bundle([source]);
  const ids=['existing','beam','new-beam'];
  const planned=planProjectBundleImport(portable,existing,{idFactory:()=>ids.shift(),now:NOW});
  assert.equal(planned.records[0].id,'new-beam');assert.deepEqual(planned.next.map(record=>record.id),['new-beam','existing']);
  assert.deepEqual(planned.state.selectedIds,['new-beam']);assert.equal(planned.records[0].data._review.items[0].status,'closed');
  assert.equal(planned.records[0].data._document.reviewItems.every(item=>item.checked),true);
  assert.deepEqual(existing,before);assert.deepEqual(portable.records[0].data,source.data);
  planned.records[0].data.d=999;assert.notEqual(portable.records[0].data.d,999);
});

test('ID collisions within imported batch retry without overwriting and exhaustion has no effects',()=>{
  const portable=bundle([makeRecord('one'),makeRecord('two')]);
  const ids=['new-one','new-one','new-two'];
  const result=planProjectBundleImport(portable,[],{idFactory:()=>ids.shift(),now:NOW});
  assert.deepEqual(result.records.map(record=>record.id),['new-one','new-two']);
  const existing=[makeRecord('existing')],before=structuredClone(existing);
  assert.throws(()=>planProjectBundleImport(portable,existing,{idFactory:()=> 'existing',now:NOW}),/สร้างรหัส/);
  assert.deepEqual(existing,before);
});

test('one failed list write leaves existing records and draft storage untouched',()=>{
  const existing=[makeRecord('existing')],serialized=JSON.stringify(existing);
  const memory=new Map([['engapp.projects.v1',serialized],['draft-key','unchanged']]);let attempts=0;
  const storage={setItem(key,value){attempts++;throw new Error('QuotaExceededError');},getItem:key=>memory.get(key)};
  const plan=planProjectBundleImport(bundle(),existing,{idFactory:()=> 'new',now:NOW});
  assert.equal(persistJSON(storage,'engapp.projects.v1',plan.next),false);assert.equal(attempts,1);
  assert.equal(memory.get('engapp.projects.v1'),serialized);assert.equal(memory.get('draft-key'),'unchanged');
});

test('append planning keeps another tab’s newer saved record and never mutates it',()=>{
  const newer=makeRecord('other-tab');newer.updatedAt='2026-11-22T10:01:00.000Z';newer.data.d=725;
  const latest=[newer,makeRecord('earlier')];
  const planned=planProjectBundleImport(bundle(),latest,{idFactory:()=> 'imported',now:NOW});
  assert.equal(planned.next[1],newer);assert.equal(planned.next[1].data.d,725);assert.equal(planned.next[1].updatedAt,newer.updatedAt);
});

test('CSV keeps identities, missing notices and distinct signals while neutralizing spreadsheet formulas',()=>{
  const record=makeRecord();record.name='=HYPERLINK("bad")';
  const state=compose(['beam','missing'],{title:'+SUM(1,2)',recipient:'@reviewer',note:'บรรทัด 1\nบรรทัด 2'});
  const output=handoverCSV(model([record],state));
  assert.ok(output.startsWith('\uFEFF'));assert.match(output,/'=HYPERLINK/);assert.match(output,/'\+SUM/);assert.match(output,/'@reviewer/);
  assert.match(output,/ไม่พบงาน/);assert.match(output,/ไม่รวมต้นทุน/);assert.match(output,/บรรทัด 1\nบรรทัด 2/);
});
