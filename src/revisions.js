import {escapeHTML as e, format as f, uniqueId} from './utils.js';
import {icon} from './visuals.js';
import {designOptionInputs} from './design-options.js';
import {normalizeDocument, DOCUMENT_REVIEW_ITEMS} from './document-control.js';

export const MAX_REVISIONS = 8;
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const isNumber = value => typeof value === 'number' && Number.isFinite(value);
const cleanText = (value,max) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max) : '';
const cleanDraftNote = value => typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').slice(0,800):'';
const validId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value);
const fieldsOf = definition => definition.inputGroups.flatMap(group=>group.fields);
const revisionKey = value => value.toLowerCase();
const emptyState = definition => ({schemaVersion:1,toolId:definition.id,entries:[],selectedId:null,includeInReport:false,draftNote:''});
const DOCUMENT_FIELDS = Object.freeze([
  ['projectCode','รหัสโครงการ / เอกสาร'],['client','ลูกค้า / เจ้าของโครงการ'],['site','สถานที่ / ส่วนงาน'],
  ['preparedBy','ผู้จัดทำ'],['checkedBy','ผู้ตรวจทานที่ระบุ'],['revision','ฉบับแก้ไข'],['issueDate','วันที่เอกสาร'],
  ['purpose','วัตถุประสงค์'],['designBasis','แหล่งข้อมูล เกณฑ์ และประเด็นที่ส่งต่อ'],
]);

/** Imported history must already be canonical; sanitizing it would silently rewrite the record. */
function canonicalRevisionDocument(value) {
  if (!isObject(value) || value.schemaVersion!==1 || !Array.isArray(value.reviewItems) || value.reviewItems.length!==DOCUMENT_REVIEW_ITEMS.length) return false;
  const normalized=normalizeDocument(value);
  if (DOCUMENT_FIELDS.some(([key])=>value[key]!==normalized[key])) return false;
  const ids=new Set();
  for (const row of value.reviewItems) {
    if (!isObject(row) || ids.has(row.id)) return false;
    const expected=normalized.reviewItems.find(item=>item.id===row.id);
    if (!expected || row.checked!==expected.checked || row.note!==expected.note) return false;
    ids.add(row.id);
  }
  return true;
}

/** Exact UTC calendar validation rejects overflowing dates and ambiguous local timestamps. */
export function isRevisionTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const time=Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString()===value;
}

function calculate(definition,inputs) {
  const result=definition.calculate({...inputs});
  if (!isObject(result) || !Array.isArray(result.summary) || result.summary.some(row=>!isObject(row) || (typeof row.value==='number' && !Number.isFinite(row.value)))) throw new Error('แบบจำลองไม่สามารถให้ผลลัพธ์ที่อ่านได้');
  return result;
}

/** An issued snapshot contains scalar inputs and document declarations, never calculated answers. */
export function captureRevision(definition,values,documentValue,{id=uniqueId(),note='',capturedAt=new Date().toISOString()}={}) {
  if (!validId(id)) throw new Error('รหัสฉบับอ้างอิงไม่ถูกต้อง');
  if (!isRevisionTimestamp(capturedAt)) throw new Error('เวลาที่เก็บฉบับอ้างอิงไม่ถูกต้อง');
  if (!isObject(documentValue) || !cleanText(documentValue.revision,24)) throw new Error('กรุณาระบุฉบับแก้ไขในข้อมูลเอกสารก่อนเก็บฉบับอ้างอิง');
  const description=cleanText(note,800);
  if (!description) throw new Error('กรุณาระบุเหตุผลหรือสิ่งที่เปลี่ยนในฉบับนี้');
  const inputs=designOptionInputs(definition,values),document=normalizeDocument(documentValue);
  calculate(definition,inputs);
  return {id,revision:document.revision,note:description,capturedAt,inputs,document};
}

/** Bounded restoration preserves valid records and explicitly disables partial report inclusion. */
export function restoreRevisions(definition,value) {
  const state=emptyState(definition);
  if (value===undefined || value===null) return {state,rejected:0,notice:''};
  if (!isObject(value) || value.schemaVersion!==1 || value.toolId!==definition.id || !Array.isArray(value.entries) || typeof value.includeInReport!=='boolean' || !(value.selectedId===null || typeof value.selectedId==='string')) return {state,rejected:1,notice:'ข้อมูลฉบับอ้างอิงในไฟล์ไม่ตรงกับเครื่องมือนี้ จึงเริ่มทะเบียนใหม่'};
  let rejected=Math.max(0,value.entries.length-MAX_REVISIONS);
  if (Object.hasOwn(value,'draftNote')) {
    if (typeof value.draftNote!=='string' || cleanDraftNote(value.draftNote)!==value.draftNote) rejected++;
    else state.draftNote=value.draftNote;
  }
  const ids=new Set(),revisions=new Set();
  for (const candidate of value.entries.slice(0,MAX_REVISIONS)) {
    try {
      if (!isObject(candidate) || !validId(candidate.id) || !isRevisionTimestamp(candidate.capturedAt) || typeof candidate.note!=='string' || !canonicalRevisionDocument(candidate.document) || ids.has(candidate.id)) throw new Error('ข้อมูลฉบับอ้างอิงไม่ถูกต้อง');
      const entry=captureRevision(definition,candidate.inputs,candidate.document,candidate);
      if (candidate.revision!==entry.revision || candidate.note!==entry.note || revisions.has(revisionKey(entry.revision))) throw new Error('รหัสฉบับซ้ำหรือไม่ตรงกับเอกสาร');
      ids.add(entry.id);revisions.add(revisionKey(entry.revision));state.entries.push(entry);
    } catch { rejected++; }
  }
  if (state.entries.length) {
    state.selectedId=state.entries.some(entry=>entry.id===value.selectedId)?value.selectedId:state.entries.at(-1).id;
    if (value.selectedId!==state.selectedId) rejected++;
  } else if (value.selectedId!==null) rejected++;
  state.includeInReport=value.includeInReport && !rejected && state.entries.length>0;
  return {state,rejected,notice:rejected?`ข้อมูลฉบับอ้างอิง ${rejected} รายการหรือการตั้งค่าไม่ถูกต้อง ซ้ำ หรือเกินจำนวนที่รองรับ จึงไม่นำมาใช้ โปรดตรวจชุดที่เหลือก่อนเลือกแนบรายงาน`:''};
}

export function appendRevision(definition,state,inputs,document,options={}) {
  const restored=restoreRevisions(definition,state);
  if (restored.rejected) throw new Error('กรุณาตรวจทะเบียนฉบับอ้างอิงก่อนเก็บฉบับใหม่');
  if (restored.state.entries.length>=MAX_REVISIONS) throw new Error(`เก็บได้สูงสุด ${MAX_REVISIONS} ฉบับ ส่งออก JSON สำรองก่อนนำฉบับที่ไม่ใช้แล้วออก`);
  const entry=captureRevision(definition,inputs,document,options);
  if (restored.state.entries.some(item=>revisionKey(item.revision)===revisionKey(entry.revision))) throw new Error(`มีฉบับ ${entry.revision} แล้ว กรุณาเปลี่ยนรหัสฉบับในข้อมูลเอกสารก่อนเก็บฉบับใหม่`);
  if (restored.state.entries.some(item=>item.id===entry.id)) throw new Error('รหัสฉบับอ้างอิงซ้ำ');
  return {...restored.state,entries:[...restored.state.entries,entry],selectedId:entry.id,draftNote:''};
}

const documentValue = (key,value) => key==='purpose' ? value==='for-review'?'เพื่อการตรวจทาน':'ร่างเพื่อพัฒนา' : value || 'ยังไม่ระบุ';

export function revisionDocumentChanges(beforeValue,afterValue) {
  const before=normalizeDocument(beforeValue),after=normalizeDocument(afterValue);
  const rows=DOCUMENT_FIELDS.filter(([key])=>before[key]!==after[key]).map(([key,label])=>({key,label,before:documentValue(key,before[key]),after:documentValue(key,after[key])}));
  for (const item of DOCUMENT_REVIEW_ITEMS) {
    const old=before.reviewItems.find(row=>row.id===item.id),next=after.reviewItems.find(row=>row.id===item.id);
    if (old.checked!==next.checked) rows.push({key:'review-'+item.id,label:'ผู้ใช้ระบุการตรวจ — '+item.title,before:old.checked?'ระบุว่าตรวจแล้ว':'ยังไม่ระบุว่าตรวจ',after:next.checked?'ระบุว่าตรวจแล้ว':'ยังไม่ระบุว่าตรวจ'});
    if (old.note!==next.note) rows.push({key:'review-note-'+item.id,label:'บันทึกการตรวจ — '+item.title,before:old.note||'ยังไม่ระบุ',after:next.note||'ยังไม่ระบุ'});
  }
  return rows;
}

/** Both sides are recalculated now; the stored snapshot does not freeze the engine's answers. */
export function compareRevision(definition,entry,currentInputs,currentDocument) {
  if (!isObject(entry) || !validId(entry.id) || !isRevisionTimestamp(entry.capturedAt) || !canonicalRevisionDocument(entry.document) || entry.revision!==entry.document.revision) throw new Error('กรุณาเลือกฉบับอ้างอิงที่มีข้อมูลครบ');
  const reference=captureRevision(definition,entry.inputs,entry.document,entry);
  const current=designOptionInputs(definition,currentInputs);
  const before=calculate(definition,reference.inputs),after=calculate(definition,current);
  const metrics=[],seen=new Set();
  for (const item of [...before.summary,...after.summary]) {
    const key=JSON.stringify([item.label,item.unit||'']);
    if (seen.has(key)) continue;
    seen.add(key);
    const previous=before.summary.find(row=>row.label===item.label && (row.unit||'')===(item.unit||''));
    const next=after.summary.find(row=>row.label===item.label && (row.unit||'')===(item.unit||''));
    const numeric=isNumber(previous?.value) && isNumber(next?.value);
    const rawDelta=numeric?next.value-previous.value:null;
    // A relative tolerance would erase real subunit money changes on large projects.
    const delta=Object.is(rawDelta,-0)?0:rawDelta;
    metrics.push({label:item.label,unit:item.unit||'',digits:Math.max(0,Math.min(8,item.digits??2)),before:previous?.value??null,after:next?.value??null,delta});
  }
  const checks=[],checkLabels=new Set();
  for (const item of [...(before.checks||[]),...(after.checks||[])]) {
    if (checkLabels.has(item.label)) continue;
    checkLabels.add(item.label);
    const old=before.checks?.find(check=>check.label===item.label),next=after.checks?.find(check=>check.label===item.label);
    checks.push({label:item.label,before:old?.pass,after:next?.pass,beforeDetail:old?.detail||'',afterDetail:next?.detail||''});
  }
  return {reference,metrics,checks,inputChanges:fieldsOf(definition).filter(field=>reference.inputs[field.key]!==current[field.key]).map(field=>({...field,before:reference.inputs[field.key],after:current[field.key]})),documentChanges:revisionDocumentChanges(reference.document,currentDocument)};
}

const timestampText = value => new Date(value).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'});
const valueText = (value,digits=2) => value===null || value===undefined?'ไม่ประเมิน':f(value,digits);
function deltaText(value,digits=3) {
  if (value===null) return '—';
  if (value===0) return '0';
  const magnitude=Math.abs(value),requiredDigits=Math.max(digits,2-Math.floor(Math.log10(magnitude)));
  const rendered=requiredDigits>12?value.toExponential(3):f(value,requiredDigits);
  return `${value>0?'+':''}${rendered}`;
}
const inputText = (field,value) => field.type==='select'?field.options.find(option=>option.value===value)?.label||'ไม่ระบุ':f(value,6);
function distinctValues(before,after,formatValue) {
  const oldText=formatValue(before),newText=formatValue(after);
  return isNumber(before) && isNumber(after) && before!==after && oldText===newText ? [String(before),String(after)] : [oldText,newText];
}
const checkText = value => value===true?'ผ่าน':value===false?'ไม่ผ่าน':'ไม่ประเมิน';
const checkClass = value => value===true?'is-pass':value===false?'is-fail':'is-unassessed';

function wrappedTable(label,markup) {
  return `<div class="revision-table-wrap table-scroll" tabindex="0" role="region" aria-label="${e(label)}">${markup}</div>`;
}

function inputChangesMarkup(study) {
  if (!study.inputChanges.length) return '<p class="revision-identical">ข้อมูลคำนวณตรงกับฉบับอ้างอิงที่เลือก</p>';
  return wrappedTable('ข้อมูลเข้าที่เปลี่ยนจากฉบับอ้างอิง',`<table class="revision-diff-table"><thead><tr><th scope="col">ข้อมูล / หน่วย</th><th scope="col">${e(study.reference.revision)}</th><th scope="col">ปัจจุบัน</th></tr></thead><tbody>${study.inputChanges.map(field=>{const [before,after]=distinctValues(field.before,field.after,value=>inputText(field,value));return `<tr><th scope="row">${e(field.label)}<small>${e(field.unit||'')}</small></th><td>${e(before)}</td><td class="revision-changed">${e(after)}</td></tr>`;}).join('')}</tbody></table>`);
}

function documentChangesMarkup(study) {
  if (!study.documentChanges.length) return '<p class="revision-identical">ข้อมูลเอกสารตรงกับฉบับอ้างอิงที่เลือก</p>';
  return wrappedTable('ข้อมูลเอกสารที่เปลี่ยนจากฉบับอ้างอิง',`<table class="revision-diff-table revision-document-table"><thead><tr><th scope="col">ข้อมูลเอกสาร</th><th scope="col">${e(study.reference.revision)}</th><th scope="col">ปัจจุบัน</th></tr></thead><tbody>${study.documentChanges.map(row=>`<tr><th scope="row">${e(row.label)}</th><td>${e(row.before)}</td><td class="revision-changed">${e(row.after)}</td></tr>`).join('')}</tbody></table>`);
}

function metricsMarkup(study) {
  return wrappedTable('ผลลัพธ์ฉบับอ้างอิงเทียบปัจจุบัน',`<table class="revision-metrics-table"><thead><tr><th scope="col">ผลลัพธ์ / หน่วย</th><th scope="col">${e(study.reference.revision)}</th><th scope="col">ปัจจุบัน</th><th scope="col">ผลต่าง Δ</th></tr></thead><tbody>${study.metrics.map(row=>{const [before,after]=distinctValues(row.before,row.after,value=>valueText(value,row.digits));return `<tr><th scope="row">${e(row.label)}<small>${e(row.unit)}</small></th><td>${e(before)}</td><td><strong>${e(after)}</strong></td><td>${e(deltaText(row.delta,Math.max(3,row.digits)))}${row.unit==='%'&&row.delta!==null?'<small>จุดเปอร์เซ็นต์</small>':''}</td></tr>`;}).join('')}</tbody></table>`);
}

function checksMarkup(study) {
  if (!study.checks.length) return '<p class="revision-identical">เครื่องมือนี้ไม่มีรายการตรวจแบบผ่าน / ไม่ผ่าน</p>';
  return wrappedTable('รายการตรวจฉบับอ้างอิงเทียบปัจจุบัน',`<table class="revision-diff-table"><thead><tr><th scope="col">รายการในแบบจำลอง</th><th scope="col">${e(study.reference.revision)}</th><th scope="col">ปัจจุบัน</th></tr></thead><tbody>${study.checks.map(row=>`<tr><th scope="row">${e(row.label)}</th><td><span class="revision-check ${checkClass(row.before)}">${checkText(row.before)}</span><small>${e(row.beforeDetail)}</small></td><td><span class="revision-check ${checkClass(row.after)}">${checkText(row.after)}</span><small>${e(row.afterDetail)}</small></td></tr>`).join('')}</tbody></table>`);
}

function studyMarkup(study,{report=false}={}) {
  const summary=`<div class="revision-comparison-heading"><div><span class="revision-kicker">CHANGE RECORD</span><h3>${e(study.reference.revision)} <span aria-hidden="true">→</span> ข้อมูลปัจจุบัน</h3><p>${e(study.reference.note)}</p></div><div class="revision-change-count"><strong>${study.inputChanges.length}</strong><span>ข้อมูลเข้าเปลี่ยน</span></div></div>`;
  const block=(id,title,content,open=false)=>report?`<section class="revision-report-section"><h3>${title}</h3>${content}</section>`:`<details class="revision-detail" data-revision-detail="${id}"${open?' open':''}><summary>${title}</summary>${content}</details>`;
  return `${summary}${block('inputs',`ข้อมูลเข้าที่เปลี่ยน <span>${study.inputChanges.length} รายการ</span>`,inputChangesMarkup(study),true)}${block('metrics','ผลลัพธ์ที่คำนวณใหม่',metricsMarkup(study),true)}${block('checks','รายการตรวจในแบบจำลอง',checksMarkup(study))}${block('document',`ข้อมูลเอกสารที่เปลี่ยน <span>${study.documentChanges.length} รายการ</span>`,documentChangesMarkup(study))}<p class="revision-comparison-note">Δ = ปัจจุบัน − ฉบับอ้างอิง · ผลทั้งสองชุดคำนวณใหม่ด้วยแบบจำลองรุ่นปัจจุบัน ค่าที่เพิ่มขึ้นไม่ได้หมายถึงผลที่ดีขึ้นเสมอ</p>`;
}

function historyMarkup(state,{interactive=false}={}) {
  if (!interactive) return wrappedTable('ทะเบียนฉบับอ้างอิง',`<table class="revision-history-table"><thead><tr><th scope="col">ฉบับ</th><th scope="col">เวลาที่เก็บ (กรุงเทพฯ)</th><th scope="col">รหัสเอกสาร / ผู้จัดทำที่ระบุ</th><th scope="col">เหตุผล / การเปลี่ยนแปลง</th></tr></thead><tbody>${state.entries.map(entry=>`<tr><th scope="row">${e(entry.revision)}${entry.id===state.selectedId?'<small>ใช้เทียบในรายงานนี้</small>':''}</th><td>${e(timestampText(entry.capturedAt))}</td><td>${e(entry.document.projectCode||'ยังไม่ระบุรหัส')}<small>${e(entry.document.preparedBy||'ยังไม่ระบุผู้จัดทำ')}</small></td><td>${e(entry.note)}</td></tr>`).join('')}</tbody></table>`);
  return `<ol class="revision-timeline" aria-label="ฉบับอ้างอิงที่เก็บ">${[...state.entries].reverse().map(entry=>`<li class="${entry.id===state.selectedId?'is-selected':''}"><button type="button" class="revision-select" data-revision-action="select" data-revision-id="${e(entry.id)}" aria-pressed="${entry.id===state.selectedId}"><span class="revision-node" aria-hidden="true"></span><span class="revision-select-copy"><strong>${e(entry.revision)}</strong><time datetime="${e(entry.capturedAt)}">${e(timestampText(entry.capturedAt))}</time><span>${e(entry.note)}</span></span></button><button type="button" class="revision-remove" data-revision-action="remove" data-revision-id="${e(entry.id)}" aria-label="นำฉบับ ${e(entry.revision)} ออกจากทะเบียน">นำออก</button></li>`).join('')}</ol>`;
}

export function revisionsReport(definition,currentInputs,currentDocument,state) {
  if (state?.includeInReport!==true) return '';
  const restored=restoreRevisions(definition,state);
  if (restored.rejected || !restored.state.entries.length) throw new Error('ข้อมูลฉบับอ้างอิงที่จะแนบรายงานไม่ถูกต้อง กรุณาตรวจทะเบียนก่อนสร้างรายงาน');
  const selected=restored.state.entries.find(entry=>entry.id===restored.state.selectedId);
  const study=compareRevision(definition,selected,currentInputs,currentDocument);
  return `<section class="revisions-report"><h2>ทะเบียนฉบับอ้างอิงและการเปลี่ยนแปลง</h2><p>เก็บข้อมูลเข้าและข้อมูลเอกสารไว้ ${restored.state.entries.length} ฉบับ · เลือก ${e(selected.revision)} เป็นฐานเทียบกับชุดที่สร้างรายงานนี้</p>${historyMarkup(restored.state)}${studyMarkup(study,{report:true})}<p class="revision-boundary-note">ฉบับอ้างอิงเป็นบันทึกที่ผู้ใช้เก็บในไฟล์งาน ไม่ใช่ประวัติที่รับรองการแก้ไข ลายเซ็น หรือการอนุมัติแบบ รายการตรวจทานฉบับปัจจุบันแสดงแยกต่างหาก</p></section>`;
}

export function mountRevisions(host,definition,{getInputs,getDocument,initialState,onChange=()=>{},notify=()=>{}}={}) {
  const restored=restoreRevisions(definition,initialState);
  let state=restored.state,notice=restored.notice,lastRemoved=null,disposed=false;
  const getState=()=>({schemaVersion:1,toolId:definition.id,entries:state.entries.map(entry=>({...entry,inputs:{...entry.inputs},document:normalizeDocument(entry.document)})),selectedId:state.selectedId,includeInReport:state.includeInReport&&state.entries.length>0,draftNote:cleanDraftNote(state.draftNote)});
  let serialized=JSON.stringify(getState());
  const changed=()=>{const next=JSON.stringify(getState());if(next!==serialized){serialized=next;onChange();}};
  host.innerHTML=`<section class="revisions-workbench" aria-label="ฉบับอ้างอิงและการเปลี่ยนแปลง"><header class="revisions-heading"><div><span class="revision-kicker">REVISION RECORD</span><h2>ทุกฉบับมีเหตุผลของการเปลี่ยน</h2><p>เก็บข้อมูลชุดที่ส่งตรวจไว้เป็นฉบับอ้างอิง แล้วเทียบกับงานปัจจุบันโดยไม่เปลี่ยนข้อมูลเข้า</p></div><div class="revision-capacity"><strong data-revision-count>0</strong><span> / ${MAX_REVISIONS}</span><small>ฉบับที่เก็บ</small></div></header><form class="revision-capture-form"><div class="revision-capture-code"><span>ฉบับในข้อมูลเอกสาร</span><strong data-revision-current-code></strong><small>เปลี่ยนรหัสได้ที่ข้อมูลเอกสาร</small></div><label><span>เหตุผล / สิ่งที่เปลี่ยนในฉบับนี้</span><textarea data-revision-note maxlength="800" rows="2" placeholder="เช่น P01 — ชุดตั้งต้นส่งตรวจ / P02 — ปรับความลึกตามข้อสังเกต" aria-label="เหตุผลของฉบับอ้างอิง" required>${e(state.draftNote)}</textarea><small class="revision-draft-hint">ข้อความร่างเก็บไว้กับงาน จะเข้าในทะเบียนเมื่อกดเก็บฉบับนี้</small></label><button type="submit" class="button primary compact" data-revision-action="capture">${icon('save')} เก็บฉบับนี้</button></form><div class="revisions-feedback" aria-live="polite"></div><div class="revisions-content"></div><div class="revision-report-control"><label><input type="checkbox" data-revision-include><span><strong>แนบทะเบียนและผลเทียบในรายงาน</strong><small>รวมประวัติทุกฉบับที่เก็บ และผลต่างของฉบับที่เลือกกับงานปัจจุบัน</small></span></label></div><p class="revision-boundary-note">เก็บเฉพาะข้อมูลเข้าและข้อมูลเอกสาร ผลเปรียบเทียบคำนวณใหม่เมื่อเปิดดู ฉบับอ้างอิงไม่ใช่ลายเซ็นหรือการอนุมัติแบบ</p></section>`;
  const form=host.querySelector('.revision-capture-form'),noteInput=host.querySelector('[data-revision-note]'),captureButton=host.querySelector('[data-revision-action="capture"]'),include=host.querySelector('[data-revision-include]'),content=host.querySelector('.revisions-content'),feedback=host.querySelector('.revisions-feedback');
  let lastStudy=null,currentError='';
  function refresh() {
    if (disposed) return;
    const document=normalizeDocument(getDocument()),inputs=getInputs();
    currentError='';
    try {calculate(definition,designOptionInputs(definition,inputs));} catch(error) {currentError=error.message;}
    const duplicate=state.entries.some(entry=>revisionKey(entry.revision)===revisionKey(document.revision));
    host.querySelector('[data-revision-count]').textContent=state.entries.length;
    host.querySelector('[data-revision-current-code]').textContent=document.revision;
    captureButton.disabled=!!currentError || state.entries.length>=MAX_REVISIONS || duplicate;
    include.checked=state.includeInReport;include.disabled=!state.entries.length;
    const openDetails=new Set([...content.querySelectorAll('[data-revision-detail][open]')].map(item=>item.dataset.revisionDetail));
    const hadDetails=!!content.querySelector('[data-revision-detail]');
    lastStudy=null;
    let study='';
    const selected=state.entries.find(entry=>entry.id===state.selectedId);
    if (selected) {
      try {lastStudy=compareRevision(definition,selected,inputs,document);study=studyMarkup(lastStudy);}
      catch(error) {study=`<div class="revision-unavailable"><span class="revision-kicker">${e(selected.revision)} → CURRENT</span><h3>เก็บฉบับอ้างอิงไว้แล้ว</h3><p>แก้ข้อมูลปัจจุบันให้คำนวณได้เพื่อดูผลต่าง</p><p>${e(error.message)}</p></div>`;}
    }
    content.innerHTML=state.entries.length?`<div class="revision-review-grid"><aside class="revision-history"><div class="revision-history-label"><span>ฉบับอ้างอิง</span><small>เลือกฐานสำหรับเปรียบเทียบ</small></div>${historyMarkup(state,{interactive:true})}</aside><section class="revision-comparison" aria-label="ผลเทียบฉบับอ้างอิง">${study}</section></div>`:'<div class="revisions-empty"><span class="revision-kicker">FIRST ISSUE / 01</span><h3>เก็บฉบับแรกก่อนเริ่มแก้ตามข้อสังเกต</h3><p>ข้อมูลเข้าและเอกสารชุดนี้จะคงอยู่เป็นฐานให้ตรวจว่ารอบถัดไปเปลี่ยนอะไรบ้าง</p></div>';
    if (hadDetails) content.querySelectorAll('[data-revision-detail]').forEach(item=>{item.open=openDetails.has(item.dataset.revisionDetail);});
    feedback.innerHTML=`${notice?`<p class="revision-import-notice">${e(notice)}</p>`:''}${currentError?`<p class="revision-working-error">ยังเก็บฉบับใหม่ไม่ได้: ${e(currentError)}</p>`:state.entries.length>=MAX_REVISIONS?`<p>เก็บครบ ${MAX_REVISIONS} ฉบับแล้ว ส่งออก JSON สำรองก่อนนำฉบับที่ไม่ใช้แล้วออก</p>`:duplicate?`<p>มีฉบับ ${e(document.revision)} แล้ว เปลี่ยนรหัสฉบับในข้อมูลเอกสารก่อนเก็บฉบับใหม่</p>`:''}${lastRemoved?`<div class="revision-undo"><span>นำฉบับ ${e(lastRemoved.entry.revision)} ออกจากทะเบียนแล้ว</span><button type="button" data-revision-action="undo"${state.entries.length>=MAX_REVISIONS?' disabled':''}>เลิกทำ</button></div>`:''}`;
  }
  const focusSelected=()=>host.querySelector(`[data-revision-action="select"][data-revision-id="${state.selectedId}"]`)?.focus({preventScroll:true});
  const submit=event=>{
    event.preventDefault();
    try {
      state=appendRevision(definition,state,getInputs(),getDocument(),{note:noteInput.value});
      noteInput.value='';notice='';lastRemoved=null;refresh();changed();focusSelected();notify('เก็บฉบับ '+state.entries.at(-1).revision+' แล้ว ข้อมูลปัจจุบันยังอยู่');
    } catch(error) {notify(error.message);}
  };
  const click=event=>{
    const button=event.target.closest('[data-revision-action]');
    if (!button || !host.contains(button) || button.disabled) return;
    const action=button.dataset.revisionAction,id=button.dataset.revisionId;
    if (action==='select') {state.selectedId=id;refresh();changed();focusSelected();}
    else if (action==='remove') {
      const index=state.entries.findIndex(entry=>entry.id===id);if(index<0)return;
      lastRemoved={entry:state.entries[index],index,selectedId:state.selectedId,includeInReport:state.includeInReport,clearedReport:state.entries.length===1};
      state.entries=state.entries.filter(entry=>entry.id!==id);
      if(state.selectedId===id)state.selectedId=state.entries.at(-1)?.id||null;
      if(!state.entries.length)state.includeInReport=false;
      refresh();changed();host.querySelector('[data-revision-action="undo"]')?.focus({preventScroll:true});
    } else if(action==='undo' && lastRemoved) {
      if(state.entries.length>=MAX_REVISIONS || state.entries.some(entry=>entry.id===lastRemoved.entry.id || revisionKey(entry.revision)===revisionKey(lastRemoved.entry.revision))) {notify('คืนฉบับนี้ไม่ได้ เพราะทะเบียนเต็มหรือมีรหัสฉบับซ้ำ');return;}
      state.entries.splice(Math.min(lastRemoved.index,state.entries.length),0,lastRemoved.entry);
      state.selectedId=lastRemoved.selectedId===lastRemoved.entry.id?lastRemoved.entry.id:state.selectedId||lastRemoved.entry.id;
      if(lastRemoved.clearedReport)state.includeInReport=lastRemoved.includeInReport;
      lastRemoved=null;
      refresh();changed();focusSelected();
    }
  };
  const change=()=>{state.includeInReport=include.checked&&state.entries.length>0;changed();};
  const noteChange=()=>{state.draftNote=cleanDraftNote(noteInput.value);changed();};
  form.addEventListener('submit',submit);host.addEventListener('click',click);include.addEventListener('change',change);noteInput.addEventListener('input',noteChange);refresh();
  return {
    importAdjusted:restored.rejected>0,
    getState,
    refresh,
    getSummary:()=>({total:state.entries.length,selectedId:state.selectedId,selectedRevision:state.entries.find(entry=>entry.id===state.selectedId)?.revision||'',inputChanges:lastStudy?.inputChanges.length??null,documentChanges:lastStudy?.documentChanges.length??null,hasChanges:!!(lastStudy?.inputChanges.length||lastStudy?.documentChanges.length),includeInReport:state.includeInReport,hasDraftNote:!!state.draftNote.trim()}),
    getReport:()=>revisionsReport(definition,getInputs(),getDocument(),getState()),
    destroy:()=>{disposed=true;form.removeEventListener('submit',submit);host.removeEventListener('click',click);include.removeEventListener('change',change);noteInput.removeEventListener('input',noteChange);},
  };
}
