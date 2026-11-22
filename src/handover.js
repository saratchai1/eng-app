import {catalog, categories} from './catalog.js';
import {normalizeDocument, documentReviewState, invalidateDocumentReview} from './document-control.js';
import {reviewInputs, reviewRegisterSummary} from './review-register.js';
import {restoreRevisions} from './revisions.js';
import {restoreDesignOptions} from './design-options.js';
import {normalizeBoqState, calculateBoq, normalizePlanningState, analyzeSchedule, normalizeInspectionState, inspectionSummary, toCSV} from './workflows.js';
import {uniqueId} from './utils.js';

export const MAX_HANDOVER_RECORDS = 30;
export const MAX_BUNDLE_BYTES = 8 * 1024 * 1024;
const FORMAT = 'engapp-project-bundle';
const META_LIMITS = Object.freeze({title:180, reference:80, recipient:160, note:2400});
const BOQ_IDS = new Set(['boq-building','boq-road','boq-irrigation','boq-warehouse','price-book']);
const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const cleanText = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max) : '';
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const validTimestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const clone = value => JSON.parse(JSON.stringify(value));
const emptyRegister = () => ({total:0,open:0,addressed:0,closed:0,needsReview:0,outstanding:0,criticalOutstanding:0,currentValid:false,pendingDraft:false,rejected:0,adjusted:false});
const emptyModel = (status='reference',label='เอกสารประกอบ · เปิดตรวจรายละเอียดในเครื่องมือ') => ({status,label,metrics:[],assessment:null});
const metric = (label,value,unit='',digits=2) => ({label,value,unit,digits});
const equalJSON = (left,right) => {
  if(left===right)return true;
  if(!left || !right || typeof left!=='object' || typeof right!=='object' || Array.isArray(left)!==Array.isArray(right))return false;
  const leftKeys=Object.keys(left),rightKeys=Object.keys(right);
  return leftKeys.length===rightKeys.length && leftKeys.every(key=>Object.hasOwn(right,key) && equalJSON(left[key],right[key]));
};

export function normalizeHandoverState(raw) {
  const source=isObject(raw?.metadata)?raw.metadata:{};
  const metadata={};
  for(const [key,max] of Object.entries(META_LIMITS))metadata[key]=cleanText(source[key],max);
  metadata.title ||= 'ชุดเอกสารส่งตรวจ';
  metadata.purpose=source.purpose==='coordination'?'coordination':'for-review';
  const selectedIds=Array.isArray(raw?.selectedIds)?[...new Set(raw.selectedIds.filter(validId))].slice(0,MAX_HANDOVER_RECORDS):[];
  return {schemaVersion:1,metadata,selectedIds};
}

function strictWorkflowState(raw,normalize,kind) {
  if(!isObject(raw) || raw.version!==1)throw new Error('ข้อมูล'+kind+'ไม่ครบ กรุณาเปิดตรวจและบันทึกงานก่อน');
  const normalized=normalize(raw);
  // Normalizers may supply defaults or repair malformed data. A dossier must not
  // present those replacements as the source record's validated current state.
  for(const key of Object.keys(normalized)) {
    if(!Object.hasOwn(raw,key) || !equalJSON(raw[key],normalized[key]))throw new Error('ข้อมูล'+kind+'ต้องปรับรูปแบบเมื่อเปิด กรุณาตรวจและบันทึกงานก่อนใช้ยอดสรุป');
  }
  return normalized;
}

function workflowModel(toolId,data) {
  if(BOQ_IDS.has(toolId)) {
    const state=strictWorkflowState(data,raw=>normalizeBoqState(raw,toolId),'ตารางราคา');
    const result=calculateBoq(state);
    if(toolId==='price-book')return {...emptyModel('calculated','รายการราคาต่อหน่วย · ไม่รวมเป็นงบโครงการ'),metrics:[metric('รายการราคา',result.rows.length,'รายการ',0)]};
    return {...emptyModel('calculated','ยอดเฉพาะเอกสารนี้ · ต้องตรวจขอบเขตก่อนรวมต้นทุน'),metrics:[metric('ยอดรวมภาษี',result.total,'บาท'),metric('ต้นทุนตรง',result.direct,'บาท')]};
  }
  if(toolId==='planning') {
    const state=strictWorkflowState(data,normalizePlanningState,'แผนงาน');
    const result=analyzeSchedule(state);
    return {...emptyModel('calculated','สรุปแผนงานตามวันที่ประเมิน'),metrics:[metric('ระยะเวลาแผน',result.duration,'วัน',0),metric('ผลงานที่กรอก',result.weightedProgress,'%'),metric('เทียบแผน',result.progressVariance,'จุดเปอร์เซ็นต์')],schedule:{startDate:result.startDate,endDate:result.endDate,statusDate:result.statusDate,remainingCritical:result.remainingCriticalTaskIds.length}};
  }
  if(toolId==='inspection') {
    const state=strictWorkflowState(data,normalizeInspectionState,'รายการตรวจ');
    const inspection=inspectionSummary(state);
    return {...emptyModel('calculated','รายการตรวจหน้างานตามที่ผู้ใช้บันทึก'),metrics:[metric('ข้อบกพร่อง',inspection.fail,'รายการ',0),metric('ยังไม่ตรวจ',inspection.pending,'รายการ',0)],inspection};
  }
  return emptyModel();
}

function metadataWarnings(raw,document) {
  if(raw===undefined || raw===null)return [];
  if(!isObject(raw))return ['ข้อมูลเอกสารไม่ถูกต้อง กรุณาเปิดงานเพื่อตรวจแก้'];
  const changed=Object.keys(document).filter(key=>Object.hasOwn(raw,key) && key!=='reviewItems' && raw[key]!==document[key]);
  const rows=raw.reviewItems;
  const malformedReview=rows!==undefined && (!Array.isArray(rows) || rows.some(row=>!isObject(row) || !document.reviewItems.some(item=>item.id===row.id) || typeof row.checked!=='boolean' || typeof row.note!=='string' || document.reviewItems.find(item=>item.id===row.id)?.note!==row.note) || new Set(rows.map(row=>row?.id)).size!==rows.length);
  return changed.length || malformedReview ? ['ข้อมูลเอกสารหรือเครื่องหมายตรวจบางส่วนไม่ถูกต้อง กรุณาเปิดตรวจและบันทึกใหม่'] : [];
}

function buildEntry(record,id,definitions) {
  if(!record) return {id,name:'ไม่พบงานที่เลือก',toolId:'',toolTitle:'งานที่ไม่พบ',category:'',categoryLabel:'',sourceState:'missing',document:normalizeDocument(),review:documentReviewState(),kind:'missing',model:emptyModel('invalid','ไม่พบข้อมูลต้นทาง'),register:emptyRegister(),warnings:['งานนี้ถูกลบหรือไม่มีอยู่ในเบราว์เซอร์ กรุณานำออกจากชุดหรือเปิดไฟล์งานกลับมา'],missing:true};
  const tool=catalog.find(item=>item.id===record.toolId);
  const document=normalizeDocument(record.data?._document);
  const documentNotices=metadataWarnings(record.data?._document,document);
  const displayedDocument=documentNotices.length?invalidateDocumentReview(document):document;
  const entry={id,name:cleanText(record.name,180)||'งานไม่มีชื่อ',toolId:record.toolId,toolTitle:tool?.title||'เครื่องมือไม่รู้จัก',category:tool?.category||'',categoryLabel:categories.find(category=>category.id===tool?.category)?.label||'',sourceState:record.fromDraft?'draft':'saved',document:displayedDocument,review:documentReviewState(displayedDocument),kind:tool?.kind||'special',model:emptyModel(),register:emptyRegister(),warnings:documentNotices,metadataAdjusted:documentNotices.length>0,missing:false};
  if(entry.sourceState==='draft')entry.warnings.push('ใช้ร่างแก้ไขล่าสุดของงานนี้ ซึ่งยังไม่ได้กดบันทึกงาน');
  if(!tool || !isObject(record.data)) {
    entry.model=emptyModel('invalid','รูปแบบงานไม่ถูกต้อง');entry.warnings.push('เปิดเครื่องมือต้นทางเพื่อตรวจข้อมูลก่อนใช้ผล');return entry;
  }
  const definition=definitions?.[record.toolId];
  if(tool.kind==='calculator') {
    if(!definition){entry.model=emptyModel('invalid','ไม่พบแบบจำลองของเครื่องมือ');return entry;}
    entry.register=reviewRegisterSummary(definition,record.data._review,record.data,document);
    if(entry.register.rejected || entry.register.adjusted)entry.warnings.push(`ทะเบียนตรวจทานมีข้อมูลที่ต้องปรับแก้${entry.register.rejected?` (${entry.register.rejected} รายการที่ใช้ไม่ได้)`:''} เปิดงานเพื่อตรวจรายการที่เหลือก่อนส่ง`);
    if(entry.register.pendingDraft)entry.warnings.push('มีคำตอบตรวจทานที่ยังไม่ยืนยัน');
    const revisions=restoreRevisions(definition,record.data._revisions);
    if(revisions.rejected)entry.warnings.push(`ฉบับอ้างอิงหรือการตั้งค่า ${revisions.rejected} รายการไม่ถูกต้อง เปิดงานเพื่อตรวจข้อมูลก่อนใช้`);
    if(revisions.state.draftNote)entry.warnings.push('มีหมายเหตุฉบับอ้างอิงที่ยังไม่ได้เก็บเป็นฉบับ');
    const options=restoreDesignOptions(definition,record.data._options);
    if(options.rejected)entry.warnings.push(`ข้อมูลทางเลือก ${options.rejected} รายการไม่ถูกต้อง เปิดงานเพื่อตรวจข้อมูลก่อนใช้`);
    entry.adjustments={registerRejected:entry.register.rejected,registerAdjusted:entry.register.adjusted,revisionRejected:revisions.rejected,optionRejected:options.rejected};
    if(entry.register.rejected || entry.register.adjusted || revisions.rejected || options.rejected || metadataWarnings(record.data._document,document).length) {
      entry.document=invalidateDocumentReview(document);entry.review=documentReviewState(entry.document);
      entry.warnings.push('เครื่องหมายยืนยันเดิมต้องตรวจใหม่หลังแก้ข้อมูลที่ไม่ถูกต้อง');
    }
    entry.editorDraft=entry.register.pendingDraft || Boolean(revisions.state.draftNote);
    try {
      const inputs=reviewInputs(definition,record.data),result=definition.calculate(inputs);
      const checks=Array.isArray(result.checks)?result.checks:[];
      const assessment={pass:checks.filter(item=>item.pass===true).length,fail:checks.filter(item=>item.pass===false).length,unassessed:checks.filter(item=>item.pass!==true&&item.pass!==false).length,total:checks.length};
      const label=assessment.fail?`แบบจำลองไม่ผ่าน ${assessment.fail} รายการ`:assessment.unassessed?`แบบจำลองไม่ประเมิน ${assessment.unassessed} รายการ`:checks.length?'ผลคำนวณพร้อมตรวจทาน':'ปริมาณพร้อมตรวจเทียบข้อมูล';
      entry.model={status:'calculated',label,metrics:result.summary.slice(0,3).map(item=>({...item})),assessment,checks:checks.map((item,index)=>({index,label:item.label||'รายการตรวจในแบบจำลอง',detail:item.detail||'',pass:item.pass===true?true:item.pass===false?false:null}))};
    }catch(error){entry.model=emptyModel('invalid','ข้อมูลคำนวณต้องตรวจแก้');entry.warnings.push(error.message);}
  }else {
    try{entry.model=workflowModel(record.toolId,record.data);}
    catch(error){entry.model=emptyModel('invalid','ข้อมูลสรุปต้องตรวจแก้');entry.warnings.push(error.message);}
  }
  return entry;
}

/** All summary values are counts. Costs/quantities are intentionally per record. */
export function buildHandover(records,definitions,state,{now=new Date().toISOString()}={}) {
  if(!validTimestamp(now))throw new Error('วันที่จัดชุดเอกสารไม่ถูกต้อง');
  const normalized=normalizeHandoverState(state),source=Array.isArray(records)?records:[];
  const entries=normalized.selectedIds.map(id=>{
    const matches=source.filter(record=>record?.id===id);
    const entry=buildEntry(matches.length===1?matches[0]:null,id,definitions);
    if(matches.length>1){entry.name='รหัสงานซ้ำกัน';entry.warnings=['มีงานต้นทางมากกว่าหนึ่งรายการใช้รหัสเดียวกัน กรุณาแก้รหัสก่อนจัดชุด'];}
    return entry;
  });
  const present=entries.filter(entry=>!entry.missing);
  const sum=fn=>present.reduce((total,entry)=>total+fn(entry),0);
  const summary={documents:present.length,missing:entries.length-present.length,drafts:present.filter(entry=>entry.sourceState==='draft').length,disciplines:new Set(present.map(entry=>entry.category).filter(Boolean)).size,modelFailures:sum(entry=>entry.model.assessment?.fail||0),modelUnassessed:sum(entry=>entry.model.assessment?.unassessed||0),invalid:present.filter(entry=>entry.model.status==='invalid').length,reviewOutstanding:sum(entry=>entry.register.outstanding),reviewNeedsReview:sum(entry=>entry.register.needsReview),manualPending:present.filter(entry=>entry.review.completed<entry.review.total).length,editorDrafts:present.filter(entry=>entry.editorDraft).length,inspectionDefects:sum(entry=>entry.model.inspection?.fail||0)};
  return {metadata:{...normalized.metadata},generatedAt:now,entries,summary};
}

/** Validate JSON before cloning, including object input supplied by internal callers. */
function boundedJSON(value) {
  let nodes=0,characters=0;
  const seen=new Set();
  function visit(item,depth) {
    if(++nodes>250000 || depth>24)throw new Error('ข้อมูลซ้อนกันหรือมีรายการมากเกินขอบเขตชุดเอกสาร');
    if(item===null || typeof item==='boolean')return;
    if(typeof item==='number'){if(!Number.isFinite(item))throw new Error('ข้อมูล JSON มีตัวเลขไม่จำกัด');return;}
    if(typeof item==='string'){characters+=item.length;if(item.length>3000000 || characters>MAX_BUNDLE_BYTES)throw new Error('ข้อความหรือภาพในชุดเอกสารใหญ่เกินขอบเขต');return;}
    if(typeof item!=='object')throw new Error('ข้อมูลต้องเป็นค่า JSON เท่านั้น');
    if(seen.has(item))throw new Error('ข้อมูลชุดเอกสารอ้างอิงวนซ้ำ');
    seen.add(item);
    if(Array.isArray(item)){
      if(item.length>10000)throw new Error('จำนวนข้อมูลย่อยในชุดเอกสารมากเกินขอบเขต');
      if(Object.getPrototypeOf(item)!==Array.prototype || Reflect.ownKeys(item).some(key=>key!=='length' && (typeof key!=='string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key)>=item.length)))throw new Error('รายการข้อมูลต้องเป็นอาร์เรย์ JSON เท่านั้น');
      for(let index=0;index<item.length;index++){
        const descriptor=Object.getOwnPropertyDescriptor(item,String(index));
        if(!descriptor || !Object.hasOwn(descriptor,'value'))throw new Error('ข้อมูลชุดเอกสารต้องไม่มีตัวอ่านค่าหรือช่องว่างในอาร์เรย์');
        visit(descriptor.value,depth+1);
      }
    }else{
      if(Object.getPrototypeOf(item)!==Object.prototype && Object.getPrototypeOf(item)!==null)throw new Error('ชนิดข้อมูลชุดเอกสารไม่ถูกต้อง');
      const keys=Object.keys(item);
      if(Reflect.ownKeys(item).length!==keys.length)throw new Error('ข้อมูลชุดเอกสารต้องไม่มีชื่อช่องชนิดพิเศษหรือช่องข้อมูลซ่อนอยู่');
      if(keys.length>200)throw new Error('จำนวนช่องข้อมูลมากเกินขอบเขต');
      for(const key of keys){
        if(key.length>200 || ['__proto__','constructor','prototype'].includes(key))throw new Error('ชื่อช่องข้อมูลไม่ปลอดภัยหรือยาวเกินขอบเขต');
        const descriptor=Object.getOwnPropertyDescriptor(item,key);
        if(!descriptor || !Object.hasOwn(descriptor,'value'))throw new Error('ข้อมูลชุดเอกสารต้องไม่มีตัวอ่านค่า');
        visit(descriptor.value,depth+1);
      }
    }
    seen.delete(item);
  }
  visit(value,0);
  const encoded=JSON.stringify(value);
  if(new TextEncoder().encode(encoded).byteLength>MAX_BUNDLE_BYTES)throw new Error('ชุดเอกสารต้องไม่เกิน 8 MB');
  return JSON.parse(encoded);
}

function strictMetadata(value) {
  if(!isObject(value) || !['for-review','coordination'].includes(value.purpose))throw new Error('ข้อมูลหน้าปกชุดเอกสารไม่ถูกต้อง');
  const normalized=normalizeHandoverState({metadata:value}).metadata;
  if(Object.keys(META_LIMITS).some(key=>typeof value[key]!=='string' || value[key]!==normalized[key]))throw new Error('ข้อความหน้าปกชุดเอกสารไม่ครบหรือเกินขอบเขต');
  return normalized;
}

export function parseProjectBundle(raw) {
  if(typeof raw==='string') {
    if(new TextEncoder().encode(raw).byteLength>MAX_BUNDLE_BYTES)throw new Error('ชุดเอกสารต้องไม่เกิน 8 MB');
    try{raw=JSON.parse(raw);}catch{throw new Error('อ่าน JSON ชุดเอกสารไม่ได้');}
  }
  const value=boundedJSON(raw);
  if(!isObject(value) || value.format!==FORMAT || value.schemaVersion!==1 || !validTimestamp(value.exportedAt))throw new Error('รูปแบบชุดเอกสาร ENG APP ไม่ถูกต้อง');
  const metadata=strictMetadata(value.metadata);
  if(!Array.isArray(value.records) || !value.records.length || value.records.length>MAX_HANDOVER_RECORDS)throw new Error('ชุดเอกสารต้องมี 1–30 งาน');
  if(value.appVersion!==undefined && (typeof value.appVersion!=='string' || value.appVersion.length>30))throw new Error('รุ่นแอปในชุดเอกสารไม่ถูกต้อง');
  const ids=new Set();
  const records=value.records.map(record=>{
    if(!isObject(record) || record.schemaVersion!==1 || !validId(record.sourceId) || ids.has(record.sourceId) || !['saved','draft'].includes(record.sourceState) || !catalog.some(tool=>tool.id===record.toolId) || typeof record.name!=='string' || !record.name.trim() || record.name.length>180 || !validTimestamp(record.createdAt) || !validTimestamp(record.updatedAt) || !isObject(record.data))throw new Error('งานในชุดเอกสารไม่ครบ ไม่รู้จักเครื่องมือ หรือมีรหัสซ้ำ');
    ids.add(record.sourceId);
    return {schemaVersion:1,sourceId:record.sourceId,sourceState:record.sourceState,toolId:record.toolId,name:record.name,createdAt:record.createdAt,updatedAt:record.updatedAt,data:record.data};
  });
  return {format:FORMAT,schemaVersion:1,metadata,exportedAt:value.exportedAt,...(value.appVersion!==undefined?{appVersion:value.appVersion}:{}),records};
}

export function createProjectBundle(records,state,{now=new Date().toISOString(),appVersion='0.9'}={}) {
  if(!validTimestamp(now))throw new Error('วันที่ส่งออกชุดเอกสารไม่ถูกต้อง');
  if(!Array.isArray(state?.selectedIds) || !state.selectedIds.length || state.selectedIds.length>MAX_HANDOVER_RECORDS || new Set(state.selectedIds).size!==state.selectedIds.length || !state.selectedIds.every(validId))throw new Error('เลือกงานที่ไม่ซ้ำกัน 1–30 งานก่อนส่งออก');
  const normalized=normalizeHandoverState(state),source=Array.isArray(records)?records:[];
  const bundleRecords=normalized.selectedIds.map(id=>{
    const matches=source.filter(record=>record?.id===id);
    if(matches.length!==1)throw new Error('ไม่พบงานที่เลือกหรือรหัสงานซ้ำ กรุณาตรวจชุดก่อนส่งออก');
    const record=matches[0];
    return {schemaVersion:1,sourceId:id,sourceState:record.fromDraft?'draft':'saved',toolId:record.toolId,name:record.name,createdAt:validTimestamp(record.createdAt)?record.createdAt:now,updatedAt:validTimestamp(record.updatedAt)?record.updatedAt:now,data:record.data};
  });
  const bundle=parseProjectBundle({format:FORMAT,schemaVersion:1,metadata:normalized.metadata,exportedAt:now,appVersion,records:bundleRecords});
  if(new TextEncoder().encode(JSON.stringify(bundle,null,2)).byteLength>MAX_BUNDLE_BYTES)throw new Error('ไฟล์ชุดเอกสารต้องไม่เกิน 8 MB กรุณาแยกส่งเป็นชุดย่อย');
  return bundle;
}

/** Pure append plan: callers persist `next` once, then update composer state. */
export function planProjectBundleImport(raw,latestSaved,{idFactory=uniqueId,now=new Date().toISOString()}={}) {
  if(!validTimestamp(now))throw new Error('วันที่นำเข้าชุดเอกสารไม่ถูกต้อง');
  if(!Array.isArray(latestSaved))throw new Error('รายการงานที่บันทึกไว้ไม่ถูกต้อง');
  const bundle=parseProjectBundle(raw);
  const occupied=new Set([...latestSaved.map(record=>record?.id).filter(validId),...bundle.records.map(record=>record.sourceId)]);
  const records=bundle.records.map(source=>{
    let id=null;
    for(let attempt=0;attempt<100;attempt++){const candidate=idFactory();if(validId(candidate)&&!occupied.has(candidate)){id=candidate;break;}}
    if(!id)throw new Error('สร้างรหัสงานใหม่ไม่ได้ งานเดิมยังไม่ถูกเปลี่ยน');
    occupied.add(id);
    return {schemaVersion:1,id,toolId:source.toolId,name:source.name,createdAt:source.createdAt,updatedAt:now,data:clone(source.data)};
  });
  return {records,next:[...records,...latestSaved],state:{schemaVersion:1,metadata:{...bundle.metadata},selectedIds:records.map(record=>record.id)}};
}

export function handoverCSV(model) {
  const rows=[['ชุดเอกสาร',model.metadata.title],['เลขที่นำส่ง',model.metadata.reference],['ผู้รับที่ระบุ',model.metadata.recipient],['วัตถุประสงค์',model.metadata.purpose==='coordination'?'ประสานงาน':'เพื่อการตรวจทาน'],['วันที่จัดชุด',model.generatedAt],[],['ลำดับ','ชื่องาน','เครื่องมือ','สาขา','รหัสโครงการ / เอกสาร','ฉบับ','แหล่งข้อมูล','สถานะแบบจำลอง','ไม่ผ่านในแบบจำลอง','ไม่ประเมินในแบบจำลอง','ประเด็นค้าง','ต้องตรวจซ้ำ','ผู้ใช้ยืนยันการตรวจ','ข้อบกพร่องหน้างาน','ข้อสังเกต']];
  for(const [index,entry] of model.entries.entries())rows.push([index+1,entry.name,entry.toolTitle,entry.categoryLabel,entry.document.projectCode,entry.document.revision,{saved:'บันทึกแล้ว',draft:'ร่างแก้ไข',missing:'ไม่พบงาน'}[entry.sourceState],entry.model.label,entry.model.assessment?.fail??'',entry.model.assessment?.unassessed??'',entry.missing?'':entry.register.outstanding,entry.missing?'':entry.register.needsReview,entry.missing?'':`${entry.review.completed}/${entry.review.total}`,entry.model.inspection?.fail??'',entry.warnings.join(' | ')]);
  rows.push([],['หมายเหตุ',model.metadata.note],['ขอบเขต','ทะเบียนนี้สรุปแต่ละเอกสาร ไม่รวมต้นทุนข้ามงานหรือรับรองการออกแบบ ชื่อผู้รับเป็นข้อความที่ผู้ใช้กรอก ไม่มีการส่งข้อความอัตโนมัติ']);
  return toCSV(rows);
}
