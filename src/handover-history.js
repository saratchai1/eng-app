import {buildHandover, createProjectBundle, normalizeHandoverState, parseProjectBundle, MAX_HANDOVER_RECORDS, MAX_BUNDLE_BYTES} from './handover.js';
import {reviewInputs} from './review-register.js';
import {DOCUMENT_REVIEW_ITEMS} from './document-control.js';
import {uniqueId} from './utils.js';

export const MAX_HANDOVER_REFERENCES=6;
export const MAX_HANDOVER_HISTORY_BYTES=4*1024*1024;
const CODE_LIMIT=40,NOTE_LIMIT=1200;
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const plain=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null));
const timestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value);
const sourceId=value=>typeof value==='string'&&value.length>0&&value.length<=200&&value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value);
const clean=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max):'';
const byteLength=value=>new TextEncoder().encode(value).byteLength;
const codeKey=value=>value.toLocaleLowerCase('en-US');
const emptyState=()=>({schemaVersion:1,entries:[],selectedId:null,includeInReport:false,draft:{code:'',note:''}});
const DOCUMENT_FIELDS={projectCode:'รหัสโครงการ / เอกสาร',client:'ลูกค้า / เจ้าของโครงการ',site:'สถานที่ / ส่วนงาน',preparedBy:'ผู้จัดทำ',checkedBy:'ผู้ตรวจทานที่ระบุ',revision:'ฉบับแก้ไข',issueDate:'วันที่เอกสาร',purpose:'วัตถุประสงค์ของเอกสาร',designBasis:'แหล่งข้อมูล เกณฑ์ และประเด็นที่ส่งต่อ',schemaVersion:'รุ่นข้อมูลเอกสาร'};
const PACKAGE_FIELDS={title:'ชื่อชุดเอกสาร',reference:'เลขที่นำส่ง',recipient:'ผู้รับที่ระบุ',purpose:'วัตถุประสงค์ของชุด',note:'หมายเหตุชุดเอกสาร'};
const SECTION_LABELS={_review:'ทะเบียนตรวจทานและคำตอบค้าง',_revisions:'ฉบับอ้างอิงของรายการคำนวณ',_options:'ทางเลือกของแบบ',_comparison:'ค่าฐานเปรียบเทียบ',_sensitivity:'การศึกษาความไว',rows:'รายการปริมาณและราคา',tasks:'กิจกรรมและความสัมพันธ์ของแผนงาน',items:'รายการตรวจหน้างาน',image:'ภาพแบบต้นทาง',calibration:'การสอบเทียบมาตราส่วน',measures:'รายการวัดจากภาพ',notes:'หมายเหตุของงาน',overhead:'ค่าอำนวยการและกำไร',vat:'ภาษีมูลค่าเพิ่ม',startDate:'วันเริ่มแผน',statusDate:'วันที่ประเมินผลงาน',property:'ชื่ออาคารที่ตรวจ',inspector:'ผู้ตรวจที่ระบุ'};
const REGISTER_FIELDS={total:'ประเด็นทั้งหมด',open:'รอแก้ไข',addressed:'ตอบแล้ว รอตรวจ',closed:'ปิดประเด็นแล้ว',needsReview:'ต้องตรวจซ้ำ',outstanding:'ประเด็นค้าง',criticalOutstanding:'ประเด็นสำคัญที่ค้าง'};

function equal(left,right){
  if(left===right)return true;
  if(!left||!right||typeof left!=='object'||typeof right!=='object'||Array.isArray(left)!==Array.isArray(right))return false;
  const keys=Object.keys(left);
  return keys.length===Object.keys(right).length&&keys.every(key=>own(right,key)&&equal(left[key],right[key]));
}
function dataProperty(value,key,{required=false}={}){
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor){if(required)throw new Error('ข้อมูลฉบับอ้างอิงไม่ครบ');return undefined;}
  if(!own(descriptor,'value'))throw new Error('ข้อมูลฉบับอ้างอิงต้องไม่มีตัวอ่านค่า');
  return descriptor.value;
}
function envelope(value,keys,required=keys){
  if(!plain(value))throw new Error('รูปแบบฉบับอ้างอิงไม่ถูกต้อง');
  const names=Reflect.ownKeys(value);
  if(names.some(key=>typeof key!=='string'||!keys.includes(key)))throw new Error('ฉบับอ้างอิงมีช่องข้อมูลที่ไม่รู้จัก');
  for(const key of names){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor?.enumerable||!own(descriptor,'value'))throw new Error('ฉบับอ้างอิงมีข้อมูลซ่อนอยู่หรือตัวอ่านค่า');
  }
  if(required.some(key=>!own(value,key)))throw new Error('ข้อมูลฉบับอ้างอิงไม่ครบ');
  return value;
}
function checkedArray(value){
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw new Error('รายการฉบับอ้างอิงไม่ถูกต้อง');
  if(Reflect.ownKeys(value).some(key=>key!=='length'&&(typeof key!=='string'||!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=value.length)))throw new Error('รายการฉบับอ้างอิงมีช่องข้อมูลพิเศษ');
  return value;
}

function validateReference(raw){
  envelope(raw,['id','code','note','capturedAt','appVersion','bundle']);
  const {id,code,note,capturedAt,appVersion}=raw;
  if(!validId(id)||typeof code!=='string'||!code||clean(code,CODE_LIMIT)!==code||typeof note!=='string'||!note||clean(note,NOTE_LIMIT)!==note||!timestamp(capturedAt)||typeof appVersion!=='string'||!appVersion||clean(appVersion,30)!==appVersion)throw new Error('รหัส เหตุผล วันที่ หรือรุ่นแอปของฉบับอ้างอิงไม่ถูกต้อง');
  const bundle=parseProjectBundle(raw.bundle);
  // Parsing a portable bundle can discard unknown envelope fields. Historical
  // evidence must already match that schema; never rewrite the captured record.
  if(!equal(bundle,raw.bundle)||bundle.exportedAt!==capturedAt||bundle.appVersion!==appVersion)throw new Error('ข้อมูลชุดที่เก็บไว้ไม่ตรงกับฉบับอ้างอิง จึงไม่แก้ข้อมูลเดิมโดยอัตโนมัติ');
  return {id,code,note,capturedAt,appVersion,bundle};
}

const evidenceBytes=state=>{
  return byteLength(JSON.stringify({schemaVersion:1,entries:state.entries}));
};
/** Evidence size excludes preferences; object callers receive the same strict validation. */
export function handoverHistoryBytes(state){
  if(!plain(state))throw new Error('รูปแบบประวัติไม่ถูกต้อง');
  const source=checkedArray(dataProperty(state,'entries',{required:true}));
  if(source.length>MAX_HANDOVER_REFERENCES)throw new Error('ประวัติมีมากกว่า 6 ฉบับ');
  const entries=[];
  for(let index=0;index<source.length;index++)entries.push(validateReference(dataProperty(source,String(index),{required:true})));
  return evidenceBytes({entries});
}

/** Restore bounded evidence; invalid entries are disclosed while valid ones survive. */
export function restoreHandoverHistory(raw){
  const state=emptyState();let rejected=0,adjusted=false;
  const finish=()=>({state,rejected,adjusted,bytes:evidenceBytes(state),notice:rejected||adjusted?`ฉบับอ้างอิงหรือการตั้งค่า ${rejected||1} รายการไม่ถูกต้อง ซ้ำ หรือเกินขอบเขต แสดงเฉพาะฉบับที่ตรวจรูปแบบได้ ยังไม่ได้เขียนทับประวัติเดิม กรุณาตรวจรายการที่เหลือ`:''});
  if(raw===undefined||raw===null)return finish();
  try{
    if(typeof raw==='string'){
      if(byteLength(raw)>MAX_BUNDLE_BYTES)throw new Error('ไฟล์ประวัติใหญ่เกินขอบเขต');
      raw=JSON.parse(raw);
    }
    envelope(raw,['schemaVersion','entries','selectedId','includeInReport','draft'],['schemaVersion','entries']);
    if(raw.schemaVersion!==1)throw new Error('รุ่นข้อมูลประวัติไม่ถูกต้อง');
    checkedArray(raw.entries);
  }catch{rejected=1;adjusted=true;return finish();}
  const ids=new Set(),codes=new Set(),limit=Math.min(raw.entries.length,100);
  for(let index=0;index<limit;index++){
    if(state.entries.length>=MAX_HANDOVER_REFERENCES){rejected+=limit-index;break;}
    try{
      const entry=validateReference(dataProperty(raw.entries,String(index),{required:true}));
      if(ids.has(entry.id)||codes.has(codeKey(entry.code)))throw new Error('ฉบับอ้างอิงซ้ำ');
      if(evidenceBytes({entries:[...state.entries,entry]})>MAX_HANDOVER_HISTORY_BYTES)throw new Error('พื้นที่เก็บฉบับอ้างอิงเกินขอบเขต');
      state.entries.push(entry);ids.add(entry.id);codes.add(codeKey(entry.code));
    }catch{rejected++;}
  }
  rejected+=Math.max(0,raw.entries.length-limit);
  if(own(raw,'selectedId')){
    if(raw.selectedId===null||typeof raw.selectedId==='string'&&ids.has(raw.selectedId))state.selectedId=raw.selectedId;
    else {adjusted=true;rejected++;}
  }
  if(own(raw,'includeInReport')){
    if(typeof raw.includeInReport==='boolean')state.includeInReport=raw.includeInReport;
    else {adjusted=true;rejected++;}
  }
  if(own(raw,'draft')){
    try{
      envelope(raw.draft,['code','note']);
      for(const [key,max] of [['code',CODE_LIMIT],['note',NOTE_LIMIT]]){
        const value=raw.draft[key];
        if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw new Error('ร่างข้อความไม่ถูกต้อง');
        state.draft[key]=value;
      }
    }catch{state.draft={code:'',note:''};adjusted=true;rejected++;}
  }
  if(state.includeInReport&&!state.selectedId){state.includeInReport=false;adjusted=true;}
  if(rejected){adjusted=true;state.includeInReport=false;}
  return finish();
}

function selectedSources(records,composer,{allowMissing=false}={}){
  // Inspect descriptors before values so internal object input cannot execute a
  // getter while a supposedly read-only archive operation is taking place.
  envelope(composer,['schemaVersion','metadata','selectedIds'],['metadata','selectedIds']);
  if(own(composer,'schemaVersion')&&composer.schemaVersion!==1)throw new Error('รุ่นข้อมูลชุดเอกสารไม่ถูกต้อง');
  envelope(composer.metadata,['title','reference','recipient','purpose','note'],[]);
  checkedArray(composer.selectedIds);checkedArray(records);
  const selectedIds=[];
  for(let index=0;index<composer.selectedIds.length;index++)selectedIds.push(dataProperty(composer.selectedIds,String(index),{required:true}));
  if(selectedIds.length>MAX_HANDOVER_RECORDS||selectedIds.some(id=>!sourceId(id))||new Set(selectedIds).size!==selectedIds.length)throw new Error('รายการงานที่เลือกไม่ถูกต้องหรือเกิน 30 งาน');
  const found=[];
  for(const id of selectedIds){
    const matches=[];
    for(let index=0;index<records.length;index++){
      const record=dataProperty(records,String(index),{required:true});
      if(!plain(record))continue;
      if(dataProperty(record,'id')===id)matches.push(record);
    }
    if(matches.length!==1){if(allowMissing)continue;throw new Error('ไม่พบงานที่เลือกหรือรหัสงานซ้ำ');}
    const source=matches[0],record={};
    for(const key of ['id','toolId','name','createdAt','updatedAt','data','fromDraft']){
      const value=dataProperty(source,key);
      if(value!==undefined)record[key]=value;
    }
    if(own(record,'fromDraft')&&typeof record.fromDraft!=='boolean')throw new Error('สถานะร่างของงานต้นทางไม่ถูกต้อง');
    if(!timestamp(record.createdAt)||!timestamp(record.updatedAt))throw new Error('วันที่ต้นทางไม่ครบ กรุณาเปิดและบันทึกงานก่อนเก็บฉบับอ้างอิง');
    found.push(record);
  }
  return {records:found,state:normalizeHandoverState(composer)};
}

export function captureHandoverReference(records,composer,{id=uniqueId(),code='',note='',now=new Date().toISOString(),appVersion='0.7'}={}){
  if(!validId(id)||!timestamp(now))throw new Error('รหัสหรือวันที่เก็บฉบับอ้างอิงไม่ถูกต้อง');
  const referenceCode=clean(code,CODE_LIMIT),description=clean(note,NOTE_LIMIT),version=clean(appVersion,30);
  if(!referenceCode||!description)throw new Error('กรุณาระบุรหัสฉบับและเหตุผลก่อนเก็บฉบับอ้างอิง');
  if(!version)throw new Error('กรุณาระบุรุ่นแอปที่ใช้เก็บฉบับอ้างอิง');
  const selected=selectedSources(records,composer);
  const bundle=createProjectBundle(selected.records,selected.state,{now,appVersion:version});
  const entry={id,code:referenceCode,note:description,capturedAt:now,appVersion:version,bundle};
  if(evidenceBytes({entries:[entry]})>MAX_HANDOVER_HISTORY_BYTES)throw new Error('ชุดนี้ใหญ่เกินพื้นที่ประวัติ 4 MiB กรุณาแบ่งชุดหรือส่งออก JSON เก็บแยก');
  return entry;
}

export function appendHandoverReference(history,records,composer,options={}){
  const restored=restoreHandoverHistory(history);
  if(restored.rejected||restored.adjusted)throw new Error('ประวัติมีข้อมูลที่ต้องตรวจแก้ก่อนเก็บฉบับใหม่');
  if(restored.state.entries.length>=MAX_HANDOVER_REFERENCES)throw new Error('เก็บฉบับอ้างอิงได้สูงสุด 6 ฉบับ ส่งออกชุดก่อนนำฉบับที่ไม่ใช้แล้วออก');
  const entry=captureHandoverReference(records,composer,options);
  if(restored.state.entries.some(item=>item.id===entry.id||codeKey(item.code)===codeKey(entry.code)))throw new Error('รหัสฉบับอ้างอิงซ้ำ กรุณาใช้รหัสใหม่');
  const state={...restored.state,entries:[...restored.state.entries,entry],selectedId:entry.id,draft:{code:'',note:''}};
  if(evidenceBytes(state)>MAX_HANDOVER_HISTORY_BYTES)throw new Error('ประวัติรวมเกิน 4 MiB ส่งออกชุดก่อนนำฉบับที่ไม่ใช้แล้วออก');
  return state;
}

const referenceInfo=entry=>({id:entry.id,code:entry.code,note:entry.note,capturedAt:entry.capturedAt,appVersion:entry.appVersion});
const sourceRecords=bundle=>bundle.records.map(record=>({...record,id:record.sourceId,fromDraft:record.sourceState==='draft'}));
const sourceComposer=bundle=>({schemaVersion:1,metadata:bundle.metadata,selectedIds:bundle.records.map(record=>record.sourceId)});
const MODEL_NOTICE='ผลทั้งสองฝั่งคำนวณใหม่ด้วยแบบจำลองรุ่นปัจจุบัน ฉบับอ้างอิงเก็บข้อมูลต้นทางและรุ่นแอปที่บันทึก ไม่ได้เก็บคำตอบจากเครื่องยนต์รุ่นเก่า';
const REFERENCE_NOTICE='ผลสรุปคำนวณใหม่จากข้อมูลที่เก็บไว้ด้วยแบบจำลองรุ่นปัจจุบัน ฉบับอ้างอิงเก็บข้อมูลต้นทางและรุ่นแอปที่บันทึก ไม่ได้เก็บคำตอบจากเครื่องยนต์รุ่นเก่า';

export function handoverReferenceModel(raw,definitions,{now=new Date().toISOString(),appVersion='0.7'}={}){
  const entry=validateReference(raw);
  return {reference:referenceInfo(entry),model:buildHandover(sourceRecords(entry.bundle),definitions,sourceComposer(entry.bundle),{now}),currentAppVersion:clean(appVersion,30),warnings:[REFERENCE_NOTICE]};
}

function valueSummary(value){
  if(value===undefined||value===null)return null;
  if(Array.isArray(value))return `${value.length} รายการ`;
  if(typeof value==='object')return `${Object.keys(value).length} ช่องข้อมูล`;
  if(typeof value==='string'&&(/^data:image\//.test(value)||value.length>1200))return `${/^data:image\//.test(value)?'ข้อมูลภาพ':'ข้อความ'} ${value.length.toLocaleString('en-US')} ตัวอักษร`;
  return value;
}
function differenceRow(key,label,before,after,extra={}){
  return {key,label,before:valueSummary(before),after:valueSummary(after),beforePresent:before!==undefined,afterPresent:after!==undefined,...extra};
}
function documentChanges(before,after){
  if(!plain(before)||!plain(after)){
    if(equal(before,after))return [];
    if(before!==undefined&&before!==null&&!plain(before)||after!==undefined&&after!==null&&!plain(after))return [differenceRow('_document','ข้อมูลเอกสาร',before,after)];
    before=plain(before)?before:{};after=plain(after)?after:{};
  }
  const rows=[];
  for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
    if(key==='reviewItems')continue;
    if(!equal(before[key],after[key]))rows.push(differenceRow(key,DOCUMENT_FIELDS[key]||key,before[key],after[key]));
  }
  if(!equal(before.reviewItems,after.reviewItems)){
    const lists=[before.reviewItems,after.reviewItems];
    const usable=lists.every(items=>Array.isArray(items)&&items.every(item=>plain(item)&&typeof item.id==='string')&&new Set(items.map(item=>item.id)).size===items.length);
    if(!usable)rows.push(differenceRow('reviewItems','รายการยืนยันการตรวจ',before.reviewItems,after.reviewItems));
    else{
      const oldMap=new Map(before.reviewItems.map(item=>[item.id,item])),newMap=new Map(after.reviewItems.map(item=>[item.id,item]));
      for(const id of new Set([...oldMap.keys(),...newMap.keys()])){
        const old=oldMap.get(id),next=newMap.get(id),title=DOCUMENT_REVIEW_ITEMS.find(item=>item.id===id)?.title||id;
        if(!old||!next){rows.push(differenceRow(`reviewItems.${id}`,`รายการยืนยัน — ${title}`,old,next));continue;}
        for(const key of new Set([...Object.keys(old||{}),...Object.keys(next||{})])){
          if(key==='id')continue;
          if(!equal(old?.[key],next?.[key]))rows.push(differenceRow(`reviewItems.${id}.${key}`,`${key==='checked'?'การยืนยัน':key==='note'?'บันทึก':'ข้อมูล'} — ${title}`,old?.[key],next?.[key]));
        }
      }
      if(!rows.some(row=>row.key.startsWith('reviewItems.')))rows.push(differenceRow('reviewItems.order','ลำดับรายการยืนยันการตรวจ',before.reviewItems,after.reviewItems));
    }
  }
  return rows;
}
function sectionCount(value){
  if(Array.isArray(value))return value.length;
  if(plain(value)){
    for(const key of ['items','entries','options'])if(Array.isArray(value[key]))return value[key].length;
    return Object.keys(value).length;
  }
  return value===undefined?0:1;
}
function childChanges(before,after){
  if(Array.isArray(before)&&Array.isArray(after)){
    let count=0;for(let i=0;i<Math.max(before.length,after.length);i++)if(!equal(before[i],after[i]))count++;return count;
  }
  if(plain(before)&&plain(after))return [...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>!equal(before[key],after[key])).length;
  return equal(before,after)?0:1;
}
function sectionChanges(before,after,excluded){
  return [...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>!excluded.has(key)&&!equal(before[key],after[key])).map(key=>{
    const value=after[key],kind=value===undefined?'missing':Array.isArray(value)?'array':plain(value)?'object':'scalar';
    return differenceRow(key,SECTION_LABELS[key]||key,before[key],value,{kind,beforeCount:sectionCount(before[key]),afterCount:sectionCount(value),changedCount:childChanges(before[key],value)});
  });
}

export function formatHandoverDelta(value,digits=3){
  if(typeof value!=='number'||!Number.isFinite(value))return '—';
  if(value===0)return '0';
  const magnitude=Math.abs(value),precision=Math.max(0,Math.min(8,Number.isInteger(digits)?digits:3),2-Math.floor(Math.log10(magnitude)));
  const rendered=precision>10||magnitude>=1e15?magnitude.toExponential(3):magnitude.toLocaleString('en-US',{maximumFractionDigits:Math.max(0,precision)});
  return `${value>0?'+':'−'}${rendered}`;
}
function calculatedMetrics(source,preview,definition){
  if(!source||preview?.model.status!=='calculated')return [];
  if(!definition)return preview.model.metrics;
  try{return definition.calculate(reviewInputs(definition,source.data)).summary;}catch{return [];}
}
function metricChanges(oldRecord,newRecord,before,after,definition){
  const oldMetrics=calculatedMetrics(oldRecord,before,definition),newMetrics=calculatedMetrics(newRecord,after,definition),rows=[];
  const identities=new Set([...oldMetrics,...newMetrics].map(item=>JSON.stringify([item.label,item.unit||''])));
  for(const identity of identities){
    const [label,unit]=JSON.parse(identity),old=oldMetrics.find(item=>item.label===label&&(item.unit||'')===unit),next=newMetrics.find(item=>item.label===label&&(item.unit||'')===unit);
    const comparable=typeof old?.value==='number'&&Number.isFinite(old.value)&&typeof next?.value==='number'&&Number.isFinite(next.value)&&Number.isFinite(next.value-old.value);
    const raw=comparable?next.value-old.value:null,delta=Object.is(raw,-0)?0:raw,digits=Math.max(0,Math.min(8,next?.digits??old?.digits??2));
    rows.push({label,unit,digits,before:old?.value??null,after:next?.value??null,delta,deltaText:formatHandoverDelta(delta,Math.max(3,digits)),deltaUnit:unit==='%'?'จุดเปอร์เซ็นต์':unit,comparable});
  }
  return rows;
}

/** Match local record IDs only. Copy/import identity changes remain added/removed. */
export function compareHandoverReference(raw,currentRecords,definitions,composer,{now=new Date().toISOString(),appVersion='0.7'}={}){
  if(!timestamp(now))throw new Error('วันที่เปรียบเทียบไม่ถูกต้อง');
  const reference=validateReference(raw),selected=selectedSources(currentRecords,composer,{allowMissing:true});
  let currentSources=[];
  if(selected.records.length){
    const bundle=createProjectBundle(selected.records,{...selected.state,selectedIds:selected.records.map(record=>record.id)},{now,appVersion});
    currentSources=sourceRecords(bundle);
  }
  const beforeRecords=sourceRecords(reference.bundle),beforeState=sourceComposer(reference.bundle);
  const beforeModel=buildHandover(beforeRecords,definitions,beforeState,{now}),currentModel=buildHandover(currentSources,definitions,selected.state,{now});
  const beforeById=new Map(beforeRecords.map(record=>[record.id,record])),afterById=new Map(currentSources.map(record=>[record.id,record]));
  const beforeViews=new Map(beforeModel.entries.map(entry=>[entry.id,entry])),afterViews=new Map(currentModel.entries.map(entry=>[entry.id,entry]));
  const oldIds=beforeState.selectedIds,newIds=selected.state.selectedIds;
  const oldShared=oldIds.filter(id=>newIds.includes(id)),newShared=newIds.filter(id=>oldIds.includes(id));
  const orderChanged=!equal(oldShared,newShared),moved=new Set(oldShared.filter((id,index)=>newShared[index]!==id));
  const rows=[];
  for(const id of [...newIds,...oldIds.filter(id=>!newIds.includes(id))]){
    const old=beforeById.get(id),next=afterById.get(id),before=beforeViews.get(id)||null,after=afterViews.get(id)||null;
    const beforeIndex=oldIds.includes(id)?oldIds.indexOf(id):null,afterIndex=newIds.includes(id)?newIds.indexOf(id):null;
    const changes={name:Boolean(old&&next&&old.name!==next.name),tool:Boolean(old&&next&&old.toolId!==next.toolId),data:Boolean(old&&next&&!equal(old.data,next.data)),sourceState:Boolean(old&&next&&old.sourceState!==next.sourceState),createdAt:Boolean(old&&next&&old.createdAt!==next.createdAt),updatedAt:Boolean(old&&next&&old.updatedAt!==next.updatedAt)};
    const status=after?.missing?'missing':!old?'added':!next?'removed':Object.entries(changes).some(([key,value])=>key!=='updatedAt'&&value)?'changed':'unchanged';
    const details={inputChanges:[],documentChanges:[],sectionChanges:[],metrics:[],registerChanges:[],timestampChanges:[],warnings:[...(before?.warnings||[]).map(warning=>'ฉบับอ้างอิง: '+warning),...(after?.warnings||[]).map(warning=>'ปัจจุบัน: '+warning)]};
    if(old&&next){
      const sameTool=old.toolId===next.toolId,definition=sameTool?definitions?.[old.toolId]:null;
      const fields=definition?.inputGroups.flatMap(group=>group.fields)||[];
      details.inputChanges=fields.filter(field=>!equal(old.data[field.key],next.data[field.key])).map(field=>differenceRow(field.key,field.label,old.data[field.key],next.data[field.key],{unit:field.unit||''}));
      details.documentChanges=documentChanges(old.data._document,next.data._document);
      details.sectionChanges=sectionChanges(old.data,next.data,new Set(['_document',...fields.map(field=>field.key)]));
      if(sameTool){
        details.metrics=metricChanges(old,next,before,after,definition);
        if(definition)details.registerChanges=Object.entries(REGISTER_FIELDS).filter(([key])=>before.register[key]!==after.register[key]).map(([key,label])=>({key,label,before:before.register[key],after:after.register[key],delta:after.register[key]-before.register[key]}));
      }else details.warnings.push('เครื่องมือต้นทางเปลี่ยน จึงไม่เทียบผลตัวเลขข้ามแบบจำลอง');
      for(const [key,label] of [['createdAt','วันที่สร้างงานต้นทาง'],['updatedAt','วันที่บันทึกงานต้นทาง']])if(old[key]!==next[key])details.timestampChanges.push(differenceRow(key,label,old[key],next[key]));
    }
    rows.push({id,status,name:next?.name||old?.name||after?.name||'ไม่พบงานที่เลือก',toolId:next?.toolId||old?.toolId||'',toolTitle:after&&!after.missing?after.toolTitle:before?.toolTitle||after?.toolTitle||'',beforeIndex,afterIndex,orderChanged:moved.has(id),changes,before,after,details});
  }
  const metadataChanges=Object.entries(PACKAGE_FIELDS).filter(([key])=>reference.bundle.metadata[key]!==selected.state.metadata[key]).map(([key,label])=>differenceRow(key,label,reference.bundle.metadata[key],selected.state.metadata[key]));
  const count=status=>rows.filter(row=>row.status===status).length;
  const summary={referenceDocuments:reference.bundle.records.length,currentDocuments:currentModel.summary.documents,added:count('added'),removed:count('removed'),changed:count('changed'),unchanged:count('unchanged'),missing:count('missing'),reordered:moved.size,metadataChanges:metadataChanges.length};
  return {reference:referenceInfo(reference),generatedAt:now,currentAppVersion:clean(appVersion,30),summary,metadataChanges,orderChanged,orderChanges:rows.filter(row=>row.orderChanged).map(({id,beforeIndex,afterIndex})=>({id,beforeIndex,afterIndex})),entries:rows,beforeSummary:beforeModel.summary,currentSummary:currentModel.summary,warnings:[MODEL_NOTICE]};
}
