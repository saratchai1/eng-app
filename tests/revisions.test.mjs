import test from 'node:test';
import assert from 'node:assert/strict';
import {engineeringTools,defaultInputs} from '../src/engineering.js';
import {quantityTools} from '../src/quantities.js';
import {normalizeDocument} from '../src/document-control.js';
import {MAX_REVISIONS,isRevisionTimestamp,captureRevision,restoreRevisions,appendRevision,revisionDocumentChanges,compareRevision,revisionsReport} from '../src/revisions.js';

const beam=engineeringTools['rc-beam'];
const inputs=()=>({...defaultInputs('rc-beam'),b:300,d:500,fc:28,fy:400,count:4,diameter:20,mu:150});
const doc=(revision='P01')=>normalizeDocument({revision,projectCode:'DEMO / STR-001',preparedBy:'ผู้จัดทำตัวอย่าง'});
const time='2026-11-21T10:30:00.000Z';
const entry=(revision='P01',values=inputs(),id='rev-'+revision)=>captureRevision(beam,values,doc(revision),{id,note:'ชุดข้อมูลสำหรับตรวจทาน '+revision,capturedAt:time});
const state=(entries=[],includeInReport=true)=>({schemaVersion:1,toolId:beam.id,entries,selectedId:entries.at(-1)?.id||null,includeInReport:includeInReport&&entries.length>0,draftNote:''});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=1e-10*Math.max(1,Math.abs(expected)),`${actual} ≈ ${expected}`);
const defaults=definition=>Object.fromEntries(definition.inputGroups.flatMap(group=>group.fields).map(field=>[field.key,field.default]));

test('captures immutable input and document records without trusting stored output or nested state',()=>{
  const values={...inputs(),_options:{options:[]},capacity:999},document=doc();
  document.reviewItems[0].checked=true;
  const captured=captureRevision(beam,values,document,{id:'snapshot',note:'สำหรับตรวจ',capturedAt:time});
  values.d=600;document.preparedBy='เปลี่ยนชื่อ';document.reviewItems[0].checked=false;
  assert.equal(captured.inputs.d,500);
  assert.equal(captured.document.preparedBy,'ผู้จัดทำตัวอย่าง');
  assert.equal(captured.document.reviewItems[0].checked,true);
  assert.equal(Object.hasOwn(captured.inputs,'_options'),false);
  assert.equal(Object.hasOwn(captured.inputs,'capacity'),false);
  assert.deepEqual(Object.keys(captured),['id','revision','note','capturedAt','inputs','document']);
});

test('validates actual UTC calendar timestamps and rejects overflow or ambiguous local time',()=>{
  assert.equal(isRevisionTimestamp(time),true);
  assert.equal(isRevisionTimestamp('2024-02-29T23:59:59.123Z'),true);
  for (const value of ['2026-02-29T00:00:00.000Z','2026-02-31T00:00:00.000Z','2026-11-21T24:00:00.000Z','2026-11-21','2026-11-21T10:30:00','bad',42]) assert.equal(isRevisionTimestamp(value),false,value);
  assert.throws(()=>captureRevision(beam,inputs(),doc(),{note:'x',capturedAt:'2026-02-31T00:00:00.000Z'}),/เวลา/);
});

test('requires an explicit revision code and useful change note',()=>{
  for(const document of [null,{},[],{revision:'  '}]) assert.throws(()=>captureRevision(beam,inputs(),document,{note:'x'}),/ฉบับแก้ไข/);
  for(const note of ['',null,' \n ']) assert.throws(()=>captureRevision(beam,inputs(),doc(),{note}),/เหตุผล/);
  const cleaned=captureRevision(beam,inputs(),doc(),{id:'clean',note:'  A\u0000B'+'.'.repeat(1000),capturedAt:time});
  assert.equal(cleaned.note.length,800);
  assert.equal(cleaned.note.startsWith('AB'),true);
});

test('field validation rejects numeric strings, missing fields, fractions and nonfinite values',()=>{
  const missing=inputs();delete missing.d;
  for(const value of [missing,{...inputs(),d:'500'},{...inputs(),d:NaN},{...inputs(),d:Infinity},{...inputs(),d:-1},{...inputs(),count:3.5}]) assert.throws(()=>captureRevision(beam,value,doc(),{note:'test'}));
});

test('snapshots enforce select values and coupled model domain limits',()=>{
  const index=quantityTools['factor-k'];
  assert.throws(()=>captureRevision(index,{...defaults(index),fixed:.9},doc(),{note:'test'}));
  const typed={id:'typed',inputGroups:[{fields:[{key:'case',type:'select',label:'Case',options:[{value:'A',label:'A'}]}]}],calculate:()=>({summary:[]})};
  assert.throws(()=>captureRevision(typed,{case:'B'},doc(),{note:'test'}));
  assert.equal(captureRevision(typed,{case:'A'},doc(),{note:'test'}).inputs.case,'A');
});

test('adding a revision selects it without mutating older snapshots or working values',()=>{
  const original=state([entry()]),before=JSON.stringify(original),working={...inputs(),d:600};
  const next=appendRevision(beam,original,working,doc('P02'),{id:'two',note:'เพิ่ม d',capturedAt:time});
  assert.equal(JSON.stringify(original),before);
  assert.equal(working.d,600);
  assert.equal(next.selectedId,'two');
  assert.equal(next.entries.length,2);
  assert.equal(next.entries[0].inputs.d,500);
  next.entries[0].inputs.d=700;
  assert.equal(original.entries[0].inputs.d,500);
});

test('duplicate revision codes ignore case and collection is capped at eight',()=>{
  assert.throws(()=>appendRevision(beam,state([entry()]),inputs(),doc('p01'),{note:'duplicate'}),/มีฉบับ/);
  assert.throws(()=>appendRevision(beam,state([entry()]),inputs(),doc('P02'),{id:'rev-P01',note:'duplicate id'}),/รหัส.*ซ้ำ/);
  const entries=Array.from({length:8},(_,index)=>entry('P'+index));
  assert.equal(MAX_REVISIONS,8);
  assert.throws(()=>appendRevision(beam,state(entries),inputs(),doc('P09'),{note:'ninth'}),/สูงสุด 8/);
});

test('bounded imports reject malformed snapshots, duplicate codes, wrong tools and excess entries',()=>{
  const good=entry(),bad={...entry('P02'),inputs:{...inputs(),d:'500'}};
  const restored=restoreRevisions(beam,state([good,bad,{...good,id:'another'},{...entry('P03'),capturedAt:'2026-02-31T00:00:00.000Z'}]));
  assert.equal(restored.state.entries.length,1);
  assert.ok(restored.rejected>=3);
  assert.equal(restored.state.includeInReport,false);
  assert.match(restored.notice,/ไม่ถูกต้อง/);
  const tooMany=restoreRevisions(beam,state(Array.from({length:10},(_,index)=>entry('P'+index))));
  assert.equal(tooMany.state.entries.length,8);
  assert.equal(tooMany.state.includeInReport,false);
  for(const foreign of [{...state([good]),schemaVersion:2},{...state([good]),toolId:'rc-slab'},{...state([good]),entries:{}},{...state([good]),includeInReport:'true'}]) assert.equal(restoreRevisions(beam,foreign).state.entries.length,0);
});

test('invalid selected references are disclosed and valid JSON roundtrip retains selection and notes',()=>{
  const original=state([entry(),entry('P02')]);original.selectedId=original.entries[0].id;
  assert.deepEqual(restoreRevisions(beam,JSON.parse(JSON.stringify(original))),{state:original,rejected:0,notice:''});
  const invalid=restoreRevisions(beam,{...original,selectedId:'missing'});
  assert.equal(invalid.rejected,1);
  assert.equal(invalid.state.selectedId,original.entries[1].id);
  assert.equal(invalid.state.includeInReport,false);
  assert.equal(restoreRevisions(beam,undefined).rejected,0);
});

test('imported records must carry their own identifier, capture time and note',()=>{
  for(const key of ['id','capturedAt','note']) {
    const record=entry();delete record[key];
    const restored=restoreRevisions(beam,state([record]));
    assert.equal(restored.state.entries.length,0,key);
    assert.equal(restored.state.includeInReport,false,key);
    assert.ok(restored.rejected>0,key);
  }
  assert.throws(()=>compareRevision(beam,{...entry(),revision:'P99'},inputs(),doc()),/ครบ/);
});

test('historical document imports reject normalization that would rewrite known metadata',()=>{
  const changes=[
    document=>{document.client=123;},
    document=>{document.projectCode='X'.repeat(65);},
    document=>{document.preparedBy='  Name  ';},
    document=>{document.checkedBy='A\u0000B';},
    document=>{document.issueDate='2026-02-31';},
    document=>{document.purpose='approved';},
    document=>{delete document.site;},
    document=>{document.reviewItems[0].checked='true';},
    document=>{document.reviewItems[1].note='X'.repeat(1201);},
    document=>{document.reviewItems.push({...document.reviewItems[0]});},
  ];
  for(const change of changes) {
    const good=entry(),bad=entry('P02');change(bad.document);
    const restored=restoreRevisions(beam,state([good,bad]));
    assert.deepEqual(restored.state.entries,[good]);
    assert.ok(restored.rejected>0);
    assert.equal(restored.state.includeInReport,false);
    assert.match(restored.notice,/ไม่ถูกต้อง/);
  }
  const canonical=entry();canonical.document.issueDate='2024-02-29';canonical.document.purpose='for-review';canonical.document.reviewItems[0].checked=true;
  assert.deepEqual(restoreRevisions(beam,state([canonical])).state.entries,[canonical]);
  const longNote={...entry(),note:'X'.repeat(801)};
  assert.equal(restoreRevisions(beam,state([longNote])).state.entries.length,0);
});

test('unfinished revision note roundtrips separately, preserves typing whitespace and never enters a report',()=>{
  const original={...state([entry()]),draftNote:'  Next revision — unfinished\n'};
  const restored=restoreRevisions(beam,JSON.parse(JSON.stringify(original)));
  assert.deepEqual(restored.state,original);
  assert.equal(restored.rejected,0);
  assert.doesNotMatch(revisionsReport(beam,inputs(),doc(),restored.state),/Next revision/);
  const next=appendRevision(beam,restored.state,inputs(),doc('P02'),{note:original.draftNote,capturedAt:time});
  assert.equal(next.draftNote,'');
  assert.equal(next.entries.at(-1).note,'Next revision — unfinished');
  const older={...original};delete older.draftNote;
  assert.equal(restoreRevisions(beam,older).state.draftNote,'');
  assert.equal(restoreRevisions(beam,older).rejected,0);
});

test('malformed pending revision notes are disclosed without losing valid issued records',()=>{
  for(const draftNote of [42,{},'x'.repeat(801),'A\u0000B']) {
    const original=state([entry()]),restored=restoreRevisions(beam,{...original,draftNote});
    assert.deepEqual(restored.state.entries,original.entries);
    assert.equal(restored.state.draftNote,'');
    assert.equal(restored.state.includeInReport,false);
    assert.ok(restored.rejected>0);
    assert.match(restored.notice,/ไม่ถูกต้อง/);
  }
});

test('imported answers are discarded and changing the model recalculates both comparison sides',()=>{
  const imported={...entry(),result:{capacity:987654321},inputs:{...inputs(),fakeResult:999},html:'<script>bad</script>'};
  const restored=restoreRevisions(beam,state([imported]));
  assert.equal(Object.hasOwn(restored.state.entries[0],'result'),false);
  assert.equal(Object.hasOwn(restored.state.entries[0].inputs,'fakeResult'),false);
  const changedModel={...beam,calculate:values=>({...beam.calculate(values),summary:[{label:'Modified model',value:values.d*2,unit:'test'}]})};
  const study=compareRevision(changedModel,restored.state.entries[0],{...inputs(),d:600},doc('P02'));
  assert.deepEqual(study.metrics,[{label:'Modified model',unit:'test',digits:2,before:1000,after:1200,delta:200}]);
});

test('beam comparison matches independent flexural result and signed depth delta',()=>{
  const study=compareRevision(beam,entry(),{...inputs(),d:600},doc('P02'));
  const area=4*Math.PI*20**2/4,block=area*400/(.85*28*300),capacity=.9*area*400*(500-block/2)/1e6;
  near(study.metrics[0].before,capacity);
  near(study.metrics[0].delta,.9*area*400*100/1e6);
  assert.deepEqual(study.inputChanges.map(row=>[row.key,row.before,row.after]),[['d',500,600]]);
  assert.equal(study.documentChanges[0].key,'revision');
});

test('document comparison separately tracks human declarations and notes without promoting approval',()=>{
  const before=doc(),after=doc('P02');
  after.checkedBy='วิศวกรตัวอย่าง';after.reviewItems[0].checked=true;after.reviewItems[1].note='ตรวจขอบเขตแล้ว';
  const changes=revisionDocumentChanges(before,after);
  assert.deepEqual(changes.map(row=>row.key),['checkedBy','revision','review-inputs','review-note-model-scope']);
  assert.equal(changes[2].after,'ระบุว่าตรวจแล้ว');
  assert.deepEqual(revisionDocumentChanges(before,JSON.parse(JSON.stringify(before))),[]);
});

test('numeric comparison retains tiny monetary changes and uses percentage point deltas',()=>{
  const definition={id:'precise',inputGroups:[{fields:[{key:'x',label:'X',min:0,max:100}]}],calculate:values=>({summary:[{label:'Index',value:values.x,unit:'%',digits:6}],checks:[{label:'Not assessed',pass:null}]})};
  const reference=captureRevision(definition,{x:10},doc(),{id:'precise-one',note:'test',capturedAt:time});
  const study=compareRevision(definition,reference,{x:10.00001},doc());
  near(study.metrics[0].delta,.00001);
  const data={schemaVersion:1,toolId:definition.id,entries:[reference],selectedId:reference.id,includeInReport:true};
  const html=revisionsReport(definition,{x:10.00001},doc(),data);
  assert.match(html,/จุดเปอร์เซ็นต์/);
  assert.match(html,/ไม่ประเมิน/);
  assert.doesNotMatch(html,/class="revision-check is-pass"/);
});

test('Factor K preserves genuine subunit deltas at the maximum permitted project amount',()=>{
  const definition=quantityTools['factor-k'];
  const baseline={...defaults(definition),amount:1e12,laborNow:100,cementNow:100,steelNow:100};
  const current={...baseline,laborNow:100.00000000004};
  const reference=captureRevision(definition,baseline,doc(),{id:'large-cost',note:'ฐานมูลค่าสูง',capturedAt:time});
  const study=compareRevision(definition,reference,current,doc('P02'));
  const before=definition.calculate(baseline),after=definition.calculate(current);
  const adjusted=study.metrics.find(row=>row.label==='มูลค่าตามดัชนี');
  const expected=after.values.adjusted-before.values.adjusted;
  assert.ok(expected>0 && expected<1);
  assert.equal(adjusted.delta,expected);
  const index=study.metrics.find(row=>row.label==='ดัชนีถ่วงน้ำหนัก K');
  assert.ok(index.delta>0 && index.delta<1e-12);
  const stored={schemaVersion:1,toolId:definition.id,entries:[reference],selectedId:reference.id,includeInReport:true};
  const html=revisionsReport(definition,current,doc('P02'),stored);
  assert.match(html,/\+0\.1/);
  assert.match(html,/\+[0-9.]+e-1[34]/);
  assert.match(html,/100\.00000000004/);
});

test('reports are opt-in, escape all user fields, include history and fail closed on invalid values',()=>{
  const unsafeDoc=doc('<P01>');unsafeDoc.preparedBy='<img src=x onerror=alert(1)>';
  const unsafe=captureRevision(beam,inputs(),unsafeDoc,{id:'unsafe',note:'<script>alert(1)</script>',capturedAt:time});
  const data=state([unsafe]);
  assert.equal(revisionsReport(beam,inputs(),doc(),{...data,includeInReport:false}),'');
  const html=revisionsReport(beam,{...inputs(),d:600},doc('P02'),data);
  assert.match(html,/ทะเบียนฉบับอ้างอิง/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/&lt;img/);
  assert.match(html,/&lt;P01&gt;/);
  assert.doesNotMatch(html,/<script>|<img src=x|onerror="/);
  assert.throws(()=>revisionsReport(beam,{...inputs(),d:null},doc(),data));
  assert.throws(()=>revisionsReport(beam,inputs(),doc(),{...data,selectedId:'bad'}),/ไม่ถูกต้อง/);
});

test('all nine calculator defaults can be captured and compared without input changes',()=>{
  const definitions={...engineeringTools,...quantityTools};
  assert.equal(Object.keys(definitions).length,9);
  for(const definition of Object.values(definitions)) {
    const values=defaults(definition),record=captureRevision(definition,values,doc(),{note:'default',capturedAt:time});
    const study=compareRevision(definition,record,values,doc());
    assert.equal(study.inputChanges.length,0,definition.id);
    assert.equal(study.documentChanges.length,0,definition.id);
    assert.ok(study.metrics.every(row=>row.delta===0||row.delta===null),definition.id);
  }
});
