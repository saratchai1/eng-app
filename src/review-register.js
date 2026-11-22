import {escapeHTML as e, format as f, uniqueId} from './utils.js';
import {icon} from './visuals.js';
import {captureDesignOption} from './design-options.js';

export const MAX_REVIEW_ITEMS = 30;
export const REVIEW_PRIORITIES = Object.freeze({critical:'ต้องแก้ก่อนส่ง',normal:'ต้องตรวจยืนยัน',note:'ข้อสังเกต'});
export const REVIEW_STATUSES = Object.freeze({open:'รอแก้ไข',addressed:'ตอบแล้ว · รอตรวจ',closed:'ปิดประเด็นแล้ว','needs-review':'ต้องตรวจซ้ำ'});
const NEW_EDITOR = Symbol('new-review-editor');
const TEXT_LIMITS = Object.freeze({title:180,detail:2400,owner:120,response:2400});
const CONTEXT_FIELDS = Object.freeze({projectCode:{label:'รหัสโครงการ / เอกสาร',max:64},client:{label:'ลูกค้า / เจ้าของโครงการ',max:160},site:{label:'สถานที่ / ส่วนงาน',max:180},designBasis:{label:'แหล่งข้อมูลและเกณฑ์ที่ใช้',max:2400}});
const isObject = value => value && typeof value==='object' && !Array.isArray(value);
const fieldsOf = definition => definition.inputGroups.flatMap(group=>group.fields);
const cleanText = (value,max) => typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max):'';
const validId = value => typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value);
const validSequence = value => Number.isSafeInteger(value) && value>=1 && value<=999999;
const emptyState = definition => ({schemaVersion:1,toolId:definition.id,nextSequence:1,items:[],pending:null});
const code = item => 'RV-'+String(item.sequence).padStart(3,'0');
const copyInputs = value => value?{...value}:null;
const copyItem = item => ({...item,originInputs:copyInputs(item.originInputs),reviewedInputs:copyInputs(item.reviewedInputs),originContext:copyInputs(item.originContext),reviewedContext:copyInputs(item.reviewedContext)});
const copyPending = pending => pending?{itemId:pending.itemId,values:{...pending.values}}:null;
const editorValues = item => ({title:item?.title||'',detail:item?.detail||'',owner:item?.owner||'',response:item?.response||'',priority:item?.priority||'normal',status:item?.status||'open'});

/** Unconfirmed text is portable, but never a status transition or reportable evidence. */
export function normalizeReviewPending(value,items=[]) {
  if(value===null || value===undefined)return null;
  if(!isObject(value) || !(value.itemId===null || validId(value.itemId)) || !isObject(value.values))throw new Error('รูปแบบร่างประเด็นไม่ถูกต้อง');
  const original=value.itemId===null?null:items.find(item=>item.id===value.itemId);
  if(value.itemId!==null && !original)throw new Error('ร่างประเด็นอ้างอิงรายการที่ไม่มีอยู่');
  if(!Object.keys(TEXT_LIMITS).every(key=>typeof value.values[key]==='string') || !Object.hasOwn(REVIEW_PRIORITIES,value.values.priority) || !['open','addressed','closed'].includes(value.values.status))throw new Error('ข้อมูลร่างประเด็นไม่ถูกต้อง');
  const values={};
  for(const [key,max] of Object.entries(TEXT_LIMITS))values[key]=value.values[key].replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').slice(0,max);
  values.priority=value.values.priority;values.status=value.values.status;
  const baseline=editorValues(original);
  return Object.keys(baseline).some(key=>values[key]!==baseline[key])?{itemId:value.itemId,values}:null;
}

/** Only design context is tracked; issuance labels and review checkboxes do not stale a response. */
export function reviewDocumentContext(value) {
  return Object.fromEntries(Object.entries(CONTEXT_FIELDS).map(([key,{max}])=>[key,cleanText(value?.[key],max)]));
}

function restoreContext(value) {
  if(!isObject(value) || !Object.keys(CONTEXT_FIELDS).every(key=>Object.hasOwn(value,key) && typeof value[key]==='string')) throw new Error('บริบทเอกสารไม่ครบ');
  return reviewDocumentContext(value);
}

/** Portable timestamps have one canonical UTC representation and cannot overflow dates. */
export function isReviewTimestamp(value) {
  if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const time=Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString()===value;
}

/** Reuse the calculator's declared fields and coupled domain rules; store no answers. */
export function reviewInputs(definition,values) {
  try {return captureDesignOption(definition,values,{id:'review-context',label:'บริบทการตรวจทาน'}).inputs;}
  catch(error) {throw new Error(error.message.replaceAll('ข้อมูลทางเลือก','ข้อมูลการตรวจทาน').replaceAll('เก็บทางเลือก','เก็บประเด็น'));}
}

function reviewValues(source) {
  const value={};
  for(const [key,max] of Object.entries(TEXT_LIMITS)) value[key]=cleanText(source?.[key],max);
  if(!value.title) throw new Error('กรุณาระบุหัวข้อที่ต้องตรวจทาน');
  value.priority=source?.priority??'normal';
  if(!Object.hasOwn(REVIEW_PRIORITIES,value.priority)) throw new Error('ระดับความสำคัญไม่ถูกต้อง');
  value.status=source?.status??'open';
  if(!['open','addressed','closed'].includes(value.status)) throw new Error('สถานะประเด็นไม่ถูกต้อง');
  if(value.status!=='open' && !value.response) throw new Error('กรุณาบันทึกคำตอบหรือหลักฐานการแก้ไขก่อนยืนยันสถานะ');
  return value;
}

function restoreItem(definition,item) {
  if(!isObject(item) || !validId(item.id) || !validSequence(item.sequence)) throw new Error('รหัสประเด็นไม่ถูกต้อง');
  if(!Object.keys(TEXT_LIMITS).every(key=>typeof item[key]==='string')) throw new Error('ข้อความประเด็นไม่ถูกต้อง');
  if(!Object.hasOwn(REVIEW_PRIORITIES,item.priority) || !['open','addressed','closed'].includes(item.status)) throw new Error('ระดับความสำคัญหรือสถานะไม่ถูกต้อง');
  if(!isReviewTimestamp(item.createdAt) || !isReviewTimestamp(item.updatedAt) || item.updatedAt<item.createdAt) throw new Error('วันที่ประเด็นไม่ถูกต้อง');
  const values=reviewValues(item),originInputs=reviewInputs(definition,item.originInputs),originContext=restoreContext(item.originContext);
  let reviewedInputs=null,reviewedAt=null,reviewedContext=null;
  if(item.reviewedInputs!==null || item.reviewedAt!==null || item.reviewedContext!==null) {
    if(!isReviewTimestamp(item.reviewedAt) || item.reviewedAt<item.createdAt || item.reviewedAt>item.updatedAt) throw new Error('วันที่ยืนยันสถานะไม่ถูกต้อง');
    reviewedInputs=reviewInputs(definition,item.reviewedInputs);reviewedAt=item.reviewedAt;reviewedContext=restoreContext(item.reviewedContext);
  }
  if(values.status!=='open' && !reviewedInputs) throw new Error('ประเด็นที่ตอบแล้วต้องมีข้อมูล ณ เวลายืนยัน');
  return {id:item.id,sequence:item.sequence,...values,createdAt:item.createdAt,updatedAt:item.updatedAt,originInputs,originContext,reviewedInputs,reviewedContext,reviewedAt};
}

/** Partial import is visible, bounded, and never preserves a fabricated resolved state. */
export function restoreReviewRegister(definition,value) {
  const state=emptyState(definition);
  if(value===null || value===undefined) return {state,rejected:0,adjusted:false,notice:''};
  if(!isObject(value) || value.schemaVersion!==1 || value.toolId!==definition.id || !Array.isArray(value.items)) return {state,rejected:1,adjusted:true,notice:'รายการตรวจทานในไฟล์ไม่ตรงกับเครื่องมือนี้ จึงเริ่มรายการใหม่'};
  let rejected=Math.max(0,value.items.length-MAX_REVIEW_ITEMS),adjusted=false;
  const ids=new Set(),sequences=new Set();
  for(const candidate of value.items.slice(0,MAX_REVIEW_ITEMS)) {
    try {
      const item=restoreItem(definition,candidate);
      if(ids.has(item.id) || sequences.has(item.sequence)) throw new Error('รหัสซ้ำ');
      ids.add(item.id);sequences.add(item.sequence);state.items.push(item);
      if(Object.keys(TEXT_LIMITS).some(key=>item[key]!==candidate[key])) adjusted=true;
      if(Object.keys(CONTEXT_FIELDS).some(key=>item.originContext[key]!==candidate.originContext[key] || item.reviewedContext?.[key]!==candidate.reviewedContext?.[key])) adjusted=true;
    } catch {rejected++;}
  }
  const minimum=Math.max(1,...state.items.map(item=>item.sequence+1));
  if(Number.isSafeInteger(value.nextSequence) && value.nextSequence>=minimum && value.nextSequence<=1000000) state.nextSequence=value.nextSequence;
  else {state.nextSequence=minimum;adjusted=true;}
  let pendingRejected=false;
  try {
    state.pending=normalizeReviewPending(value.pending,state.items);
    if(state.pending && Object.keys(state.pending.values).some(key=>state.pending.values[key]!==value.pending.values[key]))adjusted=true;
  }catch {pendingRejected=true;adjusted=true;}
  const notice=(rejected?`ไม่นำเข้าประเด็น ${rejected} รายการที่ข้อมูลไม่ถูกต้อง รหัสซ้ำ หรือเกิน ${MAX_REVIEW_ITEMS} รายการ โปรดตรวจรายการที่เหลืออีกครั้ง`:adjusted&&!pendingRejected?'ปรับข้อความหรือเลขลำดับรายการตรวจทานให้อยู่ในรูปแบบที่รองรับ โปรดตรวจข้อมูลก่อนใช้งาน':'')+(pendingRejected?' ไม่นำเข้าร่างประเด็นที่ข้อมูลไม่ถูกต้องหรืออ้างอิงรายการที่ไม่มีอยู่':'');
  return {state,rejected,adjusted:adjusted||rejected>0,pendingRejected,notice:notice.trim()};
}

export function captureReviewItem(definition,currentInputs,{id=uniqueId(),sequence=1,now=new Date().toISOString(),document:currentDocument,...draft}={}) {
  if(!validId(id) || !validSequence(sequence)) throw new Error('รหัสประเด็นไม่ถูกต้อง');
  if(!isReviewTimestamp(now)) throw new Error('วันที่ประเด็นไม่ถูกต้อง');
  const values=reviewValues(draft),originInputs=reviewInputs(definition,currentInputs),originContext=reviewDocumentContext(currentDocument);
  return {id,sequence,...values,createdAt:now,updatedAt:now,originInputs,originContext,reviewedInputs:values.status==='open'?null:{...originInputs},reviewedContext:values.status==='open'?null:{...originContext},reviewedAt:values.status==='open'?null:now};
}

/** Saving a responded/closed status is an explicit confirmation against the current inputs. */
export function updateReviewItem(definition,item,draft,currentInputs,{now=new Date().toISOString(),document:currentDocument}={}) {
  const original=restoreItem(definition,item),values=reviewValues({...original,...draft});
  if(!isReviewTimestamp(now) || now<original.createdAt || now<original.updatedAt) throw new Error('เวลาปัจจุบันอยู่ก่อนบันทึกเดิม กรุณาตรวจนาฬิกาเครื่อง');
  const reviewedInputs=values.status==='open'?copyInputs(original.reviewedInputs):reviewInputs(definition,currentInputs);
  const reviewedContext=values.status==='open'?copyInputs(original.reviewedContext):reviewDocumentContext(currentDocument);
  return {...original,...values,updatedAt:now,reviewedInputs,reviewedContext,reviewedAt:values.status==='open'?original.reviewedAt:now};
}

const differences = (definition,previous,current) => fieldsOf(definition).filter(field=>!Object.hasOwn(current||{},field.key) || previous?.[field.key]!==current?.[field.key]).map(field=>({key:field.key,label:field.label,unit:field.unit||'',previous:previous?.[field.key],current:current?.[field.key]}));

function evaluateRegister(definition,state,currentInputs,currentDocument) {
  let currentValid=true,currentError='';
  try {reviewInputs(definition,currentInputs);} catch(error) {currentValid=false;currentError=error.message;}
  const items=state.items.map(item=>{
    const context=item.reviewedInputs||item.originInputs,changedFields=differences(definition,context,currentInputs);
    const documentContext=reviewDocumentContext(currentDocument),previousContext=item.reviewedContext||item.originContext;
    const changedContext=Object.entries(CONTEXT_FIELDS).filter(([key])=>documentContext[key]!==previousContext[key]).map(([key,field])=>({key,label:field.label,unit:'',previous:previousContext[key],current:documentContext[key],type:'context'}));
    const stale=item.status!=='open' && (!currentValid || changedFields.length>0 || changedContext.length>0);
    return {...copyItem(item),code:code(item),effectiveStatus:stale?'needs-review':item.status,changedFields,changedContext,originChanges:differences(definition,item.originInputs,currentInputs)};
  });
  const count=status=>items.filter(item=>item.effectiveStatus===status).length;
  const closed=count('closed');
  return {items,currentValid,currentError,summary:{total:items.length,open:count('open'),addressed:count('addressed'),closed,needsReview:count('needs-review'),outstanding:items.length-closed,criticalOutstanding:items.filter(item=>item.priority==='critical' && item.effectiveStatus!=='closed').length,currentValid,pendingDraft:Boolean(state.pending)}};
}

/** Saved-project indicators use the same validation and effective status as the live desk. */
export function reviewRegisterSummary(definition,rawState,currentInputs,currentDocument) {
  const restored=restoreReviewRegister(definition,rawState);
  return {...evaluateRegister(definition,restored.state,currentInputs,currentDocument).summary,rejected:restored.rejected,adjusted:restored.adjusted};
}

/** A read-only view for package review; never promotes pending editor text to evidence. */
export function evaluateReviewRegister(definition,rawState,currentInputs,currentDocument) {
  const restored=restoreReviewRegister(definition,rawState);
  return {...evaluateRegister(definition,restored.state,currentInputs,currentDocument),pending:copyPending(restored.state.pending),rejected:restored.rejected,adjusted:restored.adjusted,pendingRejected:restored.pendingRejected,notice:restored.notice};
}

/** A copied project keeps the reasoning, but starts a new human review cycle. */
export function reopenReviewRegister(definition,rawState,{now=new Date().toISOString()}={}) {
  const {state}=restoreReviewRegister(definition,rawState);
  if(!isReviewTimestamp(now)) throw new Error('วันที่ประเด็นไม่ถูกต้อง');
  const items=state.items.map(item=>({...copyItem(item),status:'open',updatedAt:now<item.updatedAt?item.updatedAt:now}));
  const pending=state.pending?normalizeReviewPending({...copyPending(state.pending),values:{...state.pending.values,status:'open'}},items):null;
  return {...state,items,pending};
}

const dateText = value => isReviewTimestamp(value)?new Date(value).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}):'ยังไม่ระบุ';
const inputText = (definition,key,value) => {
  const field=fieldsOf(definition).find(item=>item.key===key);
  if(field?.type==='select') return field.options.find(option=>option.value===value)?.label||'ข้อมูลไม่ถูกต้อง';
  return typeof value==='number' && Number.isFinite(value)?f(value,6):'ข้อมูลไม่ถูกต้อง';
};
const statusMarkup = item => `<span class="review-status status-${item.effectiveStatus}">${e(REVIEW_STATUSES[item.effectiveStatus])}</span>`;

function contextMarkup(definition,item,{report=false}={}) {
  const changes=[...item.changedFields,...item.changedContext];
  if(!changes.length) return `<p class="review-context-note">ข้อมูลเข้าและบริบทตรงกับชุดที่${item.reviewedInputs?'ยืนยันสถานะล่าสุด':'เปิดประเด็น'}</p>`;
  const valueText=(field,value)=>field.type==='context'?(value||'ยังไม่ระบุ'):inputText(definition,field.key,value);
  const table=`<div class="review-context-table${report?' report-table-scroll':''}"${report?'':' tabindex="0" role="region" aria-label="ข้อมูลที่เปลี่ยนจากบริบทการตรวจทาน"'}><table><thead><tr><th scope="col">ข้อมูล / หน่วย</th><th scope="col">${item.reviewedInputs?'เมื่อยืนยันสถานะ':'เมื่อเปิดประเด็น'}</th><th scope="col">ปัจจุบัน</th></tr></thead><tbody>${changes.map(field=>`<tr${field.type==='context'?' class="review-context-text"':''}><th scope="row">${e(field.label)}<small>${e(field.unit)}</small></th><td>${e(valueText(field,field.previous))}</td><td>${e(valueText(field,field.current))}</td></tr>`).join('')}</tbody></table></div>`;
  return report?`<div class="review-report-context"><p>ข้อมูลหรือบริบทเปลี่ยน ${changes.length} รายการจาก${item.reviewedInputs?'การยืนยันสถานะล่าสุด':'การเปิดประเด็น'}</p>${table}</div>`:`<details class="review-context-details"><summary>ข้อมูลหรือบริบทเปลี่ยน ${changes.length} รายการ</summary>${table}</details>`;
}

export function reviewRegisterReport(definition,currentInputs,rawState,currentDocument) {
  const restored=restoreReviewRegister(definition,rawState);
  if(restored.rejected || restored.pendingRejected) throw new Error('รายการตรวจทานมีข้อมูลไม่ถูกต้อง กรุณาตรวจรายการก่อนสร้างรายงาน');
  if(restored.state.pending) throw new Error('มีร่างประเด็นที่ยังไม่ยืนยัน กรุณาเปิดแท็บตรวจทาน แล้วบันทึกประเด็นหรือยกเลิกร่างก่อนสร้างรายงาน');
  if(!restored.state.items.length) return '';
  const evaluation=evaluateRegister(definition,restored.state,currentInputs,currentDocument),summary=evaluation.summary;
  return `<section class="review-register-report"><h2>ทะเบียนประเด็นตรวจทาน</h2><p>ทั้งหมด ${summary.total} · คงค้าง ${summary.outstanding} · ปิดแล้ว ${summary.closed} · ต้องตรวจซ้ำ ${summary.needsReview}${summary.criticalOutstanding?` · ต้องแก้ก่อนส่ง ${summary.criticalOutstanding}`:''}</p><p class="review-report-boundary">สถานะเป็นบันทึกที่ผู้ใช้ระบุ ไม่ใช่ลายเซ็นหรือการอนุมัติโดยระบบ การเปลี่ยนข้อมูลเข้าหรือบริบทหลังตอบหรือปิดประเด็นจะทำให้ต้องตรวจซ้ำ รายการตรวจในแบบจำลองไม่ปิดประเด็นให้อัตโนมัติ</p>${!evaluation.currentValid?`<p class="review-report-warning">ข้อมูลปัจจุบันไม่อยู่ในขอบเขต: ${e(evaluation.currentError)}</p>`:''}${evaluation.items.map(item=>`<article class="review-report-item"><h3>${e(item.code)} · ${e(item.title)}</h3><div class="review-report-meta"><span>${e(REVIEW_PRIORITIES[item.priority])}</span>${statusMarkup(item)}<span>ผู้รับผิดชอบ: ${e(item.owner||'ยังไม่ระบุ')}</span></div>${item.effectiveStatus!==item.status?`<p class="review-report-warning">สถานะที่เคยระบุ: ${e(REVIEW_STATUSES[item.status])} · ข้อมูลหรือบริบทปัจจุบันเปลี่ยนจากชุดที่ยืนยัน จึงนับเป็นประเด็นคงค้าง</p>`:''}<dl><dt>ข้อสังเกต / สิ่งที่ต้องดำเนินการ</dt><dd>${e(item.detail||'ยังไม่มีรายละเอียด')}</dd><dt>คำตอบ / หลักฐานการแก้ไข</dt><dd>${e(item.response||'ยังไม่มีคำตอบ')}</dd></dl>${contextMarkup(definition,item,{report:true})}<p class="review-report-dates">เปิดประเด็น ${e(dateText(item.createdAt))} · แก้ไขล่าสุด ${e(dateText(item.updatedAt))}${item.reviewedAt?` · ยืนยันสถานะล่าสุด ${e(dateText(item.reviewedAt))}`:''} (เวลาไทย)</p></article>`).join('')}</section>`;
}

export function mountReviewRegister(host,definition,{getInputs,getDocument=()=>({}),initialState,onChange=()=>{},onDraftChange=()=>{},notify=()=>{}}={}) {
  const restored=restoreReviewRegister(definition,initialState);
  let state=restored.state,lastRemoved=null,editorId=null,disposed=false;
  const prefix='review-'+uniqueId();
  let readPending=()=>copyPending(state.pending);
  const getState=()=>({...state,items:state.items.map(copyItem),pending:copyPending(readPending())});
  const getEvaluation=()=>evaluateRegister(definition,{...state,pending:readPending()},getInputs(),getDocument());
  const fieldId=key=>prefix+'-'+key;
  host.innerHTML=`<section class="review-register" aria-labelledby="${prefix}-heading"><header class="review-register-heading"><div><span class="review-kicker">DESIGN REVIEW REGISTER</span><h2 id="${prefix}-heading">รายการตรวจทานแบบ</h2><p>ระบุสิ่งที่ต้องแก้ ผู้รับผิดชอบ และคำตอบ เพื่อให้การส่งตรวจรอบถัดไปมีที่มา</p></div><button type="button" class="button primary compact" data-review-action="add">${icon('plus')} เพิ่มประเด็น</button></header><div class="review-register-metrics" data-review-metrics></div><div class="review-register-feedback" data-review-feedback aria-live="polite"></div><div class="review-editor" data-review-editor hidden></div><div class="review-register-toolbar"><label for="${prefix}-search"><span>ค้นหาประเด็นหรือผู้รับผิดชอบ</span><input id="${prefix}-search" type="search" data-review-search placeholder="รหัส หัวข้อ ผู้รับผิดชอบ หรือคำตอบ" maxlength="180"></label><label for="${prefix}-filter"><span>กรองสถานะ</span><select id="${prefix}-filter" data-review-filter><option value="all">ทุกสถานะ</option><option value="outstanding">ประเด็นคงค้าง</option><option value="open">รอแก้ไข</option><option value="addressed">ตอบแล้ว · รอตรวจ</option><option value="needs-review">ต้องตรวจซ้ำ</option><option value="closed">ปิดประเด็นแล้ว</option></select></label></div><div class="review-register-list" data-review-list></div><p class="review-register-boundary">สถานะและชื่อผู้รับผิดชอบเป็นข้อมูลที่ผู้ใช้ระบุ เมื่อข้อมูลเข้าหรือบริบทเปลี่ยนหลังยืนยันสถานะ ประเด็นจะกลับมารอตรวจซ้ำ รายการที่ตอบแล้วยังคงค้างจนผู้ตรวจปิดประเด็น</p><span class="review-sr-only" data-review-announcement aria-live="polite"></span></section>`;
  const editor=host.querySelector('[data-review-editor]'),list=host.querySelector('[data-review-list]');
  const readEditor=()=>Object.fromEntries([...editor.querySelectorAll('[data-review-field]')].map(field=>[field.dataset.reviewField,field.value]));
  readPending=()=>editorId?normalizeReviewPending({itemId:editorId===NEW_EDITOR?null:editorId,values:readEditor()},state.items):copyPending(state.pending);
  const refreshPendingNote=()=>{const note=editor.querySelector('[data-review-pending-note]');if(note)note.hidden=!readPending();};
  const syncPending=({persist=true}={})=>{
    const before=JSON.stringify(state.pending),pending=readPending();state.pending=pending;refreshPendingNote();
    if(persist && before!==JSON.stringify(pending))onDraftChange();
  };
  const announce=message=>{host.querySelector('[data-review-announcement]').textContent=message;notify(message);};
  const focusAction=(id=null)=>{
    const target=id?host.querySelector(`[data-review-action="edit"][data-review-id="${id}"]`):null;
    (target||host.querySelector('[data-review-action="add"]:not(:disabled)')||host.querySelector('[data-review-filter]'))?.focus({preventScroll:true});
  };
  const editorStatus=()=>{
    const status=editor.querySelector('[data-review-field="status"]')?.value;
    const response=editor.querySelector('[data-review-field="response"]');
    if(response)response.required=status!=='open';
    const help=editor.querySelector('[data-review-status-help]');
    if(help)help.textContent=status==='closed'?'การบันทึกนี้ยืนยันว่าผู้ตรวจปิดประเด็นสำหรับข้อมูลเข้าและบริบทปัจจุบันแล้ว ต้องมีคำตอบหรือหลักฐานประกอบ':status==='addressed'?'บันทึกคำตอบสำหรับข้อมูลเข้าและบริบทปัจจุบัน ประเด็นยังคงค้างเพื่อให้ผู้ตรวจยืนยันอีกครั้ง':'ประเด็นยังเปิดอยู่และนับเป็นงานคงค้าง';
    const save=editor.querySelector('[data-review-save]');
    if(save)save.textContent=status==='open'?'บันทึกประเด็น':'บันทึกและยืนยันสถานะ';
  };
  const openEditor=(item,{draftValues=null,focus=true}={})=>{
    if(editorId && editorId!==(item?.id||NEW_EDITOR)) {announce('บันทึกหรือยกเลิกประเด็นที่เปิดอยู่ก่อนเปลี่ยนรายการ');editor.querySelector('[data-review-field="title"]')?.focus({preventScroll:true});return;}
    if(editorId) {editor.querySelector('[data-review-field="title"]')?.focus({preventScroll:true});return;}
    editorId=item?.id||NEW_EDITOR;editor.hidden=false;
    const values=draftValues||editorValues(item);
    editor.innerHTML=`<form class="review-editor-form"><header><span class="review-kicker">${item?e(code(item)):'NEW REVIEW ITEM'}</span><h3>${item?'แก้ไขและตอบประเด็น':'เพิ่มประเด็นจากข้อมูลปัจจุบัน'}</h3><p>${item?'บันทึกข้อสังเกตเดิมไว้ พร้อมคำตอบและสถานะของรอบนี้':'ระบบจะเก็บข้อมูลเข้าและบริบทเอกสารปัจจุบันไว้เมื่อเปิดประเด็น'}</p></header><div class="review-editor-fields"><label class="review-field-wide" for="${fieldId('title')}"><span>หัวข้อที่ต้องตรวจทาน</span><input id="${fieldId('title')}" data-review-field="title" maxlength="180" required value="${e(values.title)}" placeholder="เช่น ยืนยันแรงดัดจากแบบจำลองโครงสร้าง"></label><label for="${fieldId('owner')}"><span>ผู้รับผิดชอบ</span><input id="${fieldId('owner')}" data-review-field="owner" maxlength="120" value="${e(values.owner)}" placeholder="ชื่อหรือทีมที่รับผิดชอบ"></label><label for="${fieldId('priority')}"><span>ระดับความสำคัญ</span><select id="${fieldId('priority')}" data-review-field="priority">${Object.entries(REVIEW_PRIORITIES).map(([key,label])=>`<option value="${key}"${values.priority===key?' selected':''}>${e(label)}</option>`).join('')}</select></label><label class="review-field-wide" for="${fieldId('detail')}"><span>ข้อสังเกต / สิ่งที่ต้องดำเนินการ</span><textarea id="${fieldId('detail')}" data-review-field="detail" maxlength="2400" rows="3" placeholder="อ้างอิงเลขที่แบบ จุดที่ต้องตรวจ และเกณฑ์ที่ต้องยืนยัน">${e(values.detail)}</textarea></label><label class="review-field-wide" for="${fieldId('response')}"><span>คำตอบ / หลักฐานการแก้ไข</span><textarea id="${fieldId('response')}" data-review-field="response" maxlength="2400" rows="3" placeholder="ระบุสิ่งที่แก้ หลักฐาน และผลการตรวจ">${e(values.response)}</textarea></label><label class="review-field-wide" for="${fieldId('status')}"><span>สถานะที่ยืนยันในรอบนี้</span><select id="${fieldId('status')}" data-review-field="status">${['open','addressed','closed'].map(key=>`<option value="${key}"${values.status===key?' selected':''}>${e(REVIEW_STATUSES[key])}</option>`).join('')}</select><small data-review-status-help></small></label></div><p class="review-editor-error" data-review-error role="alert" hidden></p><div class="review-editor-actions"><button type="submit" class="button primary compact" data-review-save>บันทึกประเด็น</button><button type="button" class="button light compact" data-review-action="cancel">ยกเลิก</button></div></form>`;
    const note=document.createElement('p');note.className='review-editor-draft-note';note.dataset.reviewPendingNote='';note.textContent='ร่างยังไม่ยืนยัน · “บันทึกงาน” จะเก็บข้อความร่างนี้ไว้ ให้กด “บันทึกประเด็น” หรือ “บันทึกและยืนยันสถานะ” เพื่อใช้ข้อความและสถานะในรายการตรวจทาน';editor.querySelector('.review-editor-form>header').append(note);
    editorStatus();syncPending({persist:false});
    if(focus){editor.querySelector('[data-review-field="title"]').focus({preventScroll:true});editor.scrollIntoView({block:'nearest',behavior:'auto'});}
  };
  const closeEditor=()=>{const previous=editorId;editorId=null;state.pending=null;editor.hidden=true;editor.innerHTML='';return previous;};
  const cancelEditor=()=>{const hadPending=Boolean(readPending()),previous=closeEditor();render();if(hadPending)onDraftChange();focusAction(previous===NEW_EDITOR?null:previous);};
  const render=()=>{
    if(disposed)return;
    const evaluation=getEvaluation(),summary=evaluation.summary;
    const add=host.querySelector('[data-review-action="add"]');add.disabled=state.items.length>=MAX_REVIEW_ITEMS || state.nextSequence>999999 || !evaluation.currentValid;
    host.querySelector('[data-review-metrics]').innerHTML=`<div><strong>${summary.outstanding}</strong><span>ประเด็นคงค้าง</span></div><div><strong>${summary.closed}</strong><span>ปิดประเด็นแล้ว</span></div><div class="${summary.needsReview?'needs-attention':''}"><strong>${summary.needsReview}</strong><span>ต้องตรวจซ้ำ</span></div><div class="review-register-capacity"><strong>${summary.total}<small> / ${MAX_REVIEW_ITEMS}</small></strong><span>ประเด็นที่เก็บ</span></div>`;
    host.querySelector('[data-review-feedback]').innerHTML=(restored.notice?`<p class="review-import-notice">${e(restored.notice)}</p>`:'')+(!evaluation.currentValid?`<p class="review-working-error">ยังเพิ่มหรือยืนยันสถานะไม่ได้จนกว่าข้อมูลเข้าจะอยู่ในขอบเขต: ${e(evaluation.currentError)}</p>`:'')+(state.items.length>=MAX_REVIEW_ITEMS?`<p>เก็บครบ ${MAX_REVIEW_ITEMS} ประเด็นแล้ว นำรายการที่ไม่ต้องการออกก่อนเพิ่มประเด็นใหม่</p>`:'')+(lastRemoved?`<div class="review-undo"><span>นำ ${e(code(lastRemoved.item))} ออกจากรายการแล้ว</span><button type="button" data-review-action="undo"${state.items.length>=MAX_REVIEW_ITEMS?' disabled':''}>เลิกทำ</button></div>`:'');
    const search=host.querySelector('[data-review-search]').value.trim().toLocaleLowerCase('th-TH'),filter=host.querySelector('[data-review-filter]').value;
    const visible=evaluation.items.filter(item=>(filter==='all'||filter==='outstanding'&&item.effectiveStatus!=='closed'||item.effectiveStatus===filter) && (!search||[item.code,item.title,item.detail,item.owner,item.response].some(value=>value.toLocaleLowerCase('th-TH').includes(search))));
    list.innerHTML=visible.length?`<p class="review-list-count">แสดง ${visible.length} จาก ${summary.total} ประเด็น${summary.criticalOutstanding?` · ต้องแก้ก่อนส่ง ${summary.criticalOutstanding}`:''}</p>${visible.map(item=>`<article class="review-item priority-${item.priority}" aria-labelledby="${prefix}-item-${item.id}"><header><div class="review-item-tags"><span class="review-item-code">${e(item.code)}</span><span class="review-priority">${e(REVIEW_PRIORITIES[item.priority])}</span>${statusMarkup(item)}</div><div class="review-item-actions"><button type="button" data-review-action="edit" data-review-id="${e(item.id)}" aria-label="แก้ไขและตอบ ${e(item.code)}">แก้ไข / ตอบ</button><button type="button" data-review-action="remove" data-review-id="${e(item.id)}" aria-label="นำ ${e(item.code)} ออกจากรายการ">นำออก</button></div></header><h3 id="${prefix}-item-${item.id}">${e(item.title)}</h3>${item.detail?`<p class="review-item-detail">${e(item.detail)}</p>`:''}<div class="review-item-meta"><span><small>ผู้รับผิดชอบ</small><strong>${e(item.owner||'ยังไม่ระบุ')}</strong></span><span><small>แก้ไขล่าสุด · เวลาไทย</small><strong>${e(dateText(item.updatedAt))}</strong></span></div>${item.response?`<div class="review-item-response"><span class="review-kicker">RESPONSE</span><p>${e(item.response)}</p></div>`:''}${item.effectiveStatus==='needs-review'?`<p class="review-item-stale">เคยระบุ “${e(REVIEW_STATUSES[item.status])}” แต่ข้อมูลหรือบริบทปัจจุบันเปลี่ยนจากชุดที่ยืนยัน กรุณาตรวจคำตอบและยืนยันสถานะรอบใหม่</p>`:''}${contextMarkup(definition,item)}<footer>เปิดประเด็น ${e(dateText(item.createdAt))}${item.reviewedAt?` · ยืนยันล่าสุด ${e(dateText(item.reviewedAt))}`:''}</footer></article>`).join('')}`:`<div class="review-register-empty"><span class="review-kicker">${summary.total?'NO MATCHING ITEMS':'START A REVIEW CYCLE'}</span><h3>${summary.total?'ไม่พบประเด็นที่ตรงกับตัวกรอง':'ให้ทุกข้อสังเกตมีคำตอบ'}</h3><p>${summary.total?'ลองเปลี่ยนคำค้นหรือสถานะเพื่อดูรายการอื่น':'เริ่มจากสิ่งที่ต้องยืนยัน เช่น แหล่งที่มาของแรง ข้อมูลวัสดุ หรือข้อจำกัดของแบบจำลอง'}</p></div>`;
  };
  const click=event=>{
    const button=event.target.closest('[data-review-action]');if(!button || button.disabled)return;
    const action=button.dataset.reviewAction,id=button.dataset.reviewId;
    if(action==='add'){openEditor(null);return;}
    if(action==='edit'){const item=state.items.find(item=>item.id===id);if(item)openEditor(item);return;}
    if(action==='cancel'){cancelEditor();return;}
    if(action==='remove'){
      const index=state.items.findIndex(item=>item.id===id);if(index<0)return;
      if(editorId===id && readPending()){announce('บันทึกหรือยกเลิกร่างที่กำลังแก้ไขก่อนนำประเด็นนี้ออก');editor.querySelector('[data-review-field="title"]')?.focus({preventScroll:true});return;}
      lastRemoved={item:copyItem(state.items[index]),index};state.items.splice(index,1);
      if(editorId===id)closeEditor();render();onChange();announce('นำ '+code(lastRemoved.item)+' ออกแล้ว สามารถเลิกทำได้');focusAction(state.items[index]?.id||state.items[index-1]?.id);return;
    }
    if(action==='undo' && lastRemoved && state.items.length<MAX_REVIEW_ITEMS){
      const restoredItem=lastRemoved.item;state.items.splice(Math.min(lastRemoved.index,state.items.length),0,copyItem(restoredItem));lastRemoved=null;render();onChange();announce('คืน '+code(restoredItem)+' แล้ว');focusAction(restoredItem.id);
    }
  };
  const submit=event=>{
    if(!event.target.matches('.review-editor-form'))return;event.preventDefault();
    const draft=readEditor();
    try {
      let item;
      if(editorId===NEW_EDITOR){
        if(state.items.length>=MAX_REVIEW_ITEMS)throw new Error('จำนวนประเด็นถึงขีดจำกัดแล้ว');
        item=captureReviewItem(definition,getInputs(),{...draft,sequence:state.nextSequence,document:getDocument()});state.items.push(item);state.nextSequence++;
      } else {
        const index=state.items.findIndex(item=>item.id===editorId);if(index<0)throw new Error('ไม่พบประเด็นนี้');
        item=updateReviewItem(definition,state.items[index],draft,getInputs(),{document:getDocument()});state.items[index]=item;
      }
      closeEditor();render();onChange();announce('บันทึก '+code(item)+' แล้ว');focusAction(item.id);
    } catch(error){const message=editor.querySelector('[data-review-error]');message.hidden=false;message.textContent=error.message;message.tabIndex=-1;message.focus({preventScroll:true});}
  };
  const input=event=>{if(event.target.matches('[data-review-search]'))render();if(event.target.matches('[data-review-field="status"]'))editorStatus();if(event.target.matches('[data-review-field]'))syncPending();};
  const change=event=>{if(event.target.matches('[data-review-filter]'))render();if(event.target.matches('[data-review-field="status"]'))editorStatus();if(event.target.matches('[data-review-field]'))syncPending();};
  const keydown=event=>{if(event.key==='Escape' && editor.contains(event.target) && !editor.hidden){event.preventDefault();event.stopPropagation();cancelEditor();}};
  host.addEventListener('click',click);host.addEventListener('submit',submit);host.addEventListener('input',input);host.addEventListener('change',change);host.addEventListener('keydown',keydown);
  if(state.pending){const pending=copyPending(state.pending);openEditor(pending.itemId?state.items.find(item=>item.id===pending.itemId):null,{draftValues:pending.values,focus:false});}
  render();
  const revealItem=id=>{
    if(disposed)return false;
    if(!validId(id) || !state.items.some(item=>item.id===id)){announce('ไม่พบประเด็นนี้ในงานปัจจุบัน กรุณาตรวจรายการล่าสุด');return false;}
    host.querySelector('[data-review-search]').value='';host.querySelector('[data-review-filter]').value='all';render();
    const row=host.querySelector('#'+prefix+'-item-'+id)?.closest('.review-item');
    if(!row){announce('ไม่พบประเด็นนี้ในหน้ารายการ กรุณาตรวจรายการล่าสุด');return false;}
    row.tabIndex=-1;row.focus({preventScroll:true});row.scrollIntoView({block:'center',behavior:'auto'});
    announce('เปิดตำแหน่ง '+code(state.items.find(item=>item.id===id))+' แล้ว'+(readPending()?' ข้อความร่างที่กำลังแก้ยังคงอยู่':''));return true;
  };
  const revealPending=()=>{
    if(disposed)return false;
    if(!readPending() || editor.hidden){announce('ไม่มีข้อความประเด็นที่รอยืนยันในงานปัจจุบัน');return false;}
    editor.querySelector('[data-review-field="title"]')?.focus({preventScroll:true});editor.scrollIntoView({block:'center',behavior:'auto'});return true;
  };
  return {importAdjusted:restored.adjusted,getState,refresh:render,revealItem,revealPending,getSummary:()=>({...getEvaluation().summary,rejected:restored.rejected,adjusted:restored.adjusted}),getReport:()=>reviewRegisterReport(definition,getInputs(),getState(),getDocument()),destroy:()=>{disposed=true;host.removeEventListener('click',click);host.removeEventListener('submit',submit);host.removeEventListener('input',input);host.removeEventListener('change',change);host.removeEventListener('keydown',keydown);}};
}
