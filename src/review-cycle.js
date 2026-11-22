import {handoverReferenceSource} from './handover-history.js';
import {buildReviewRoom, REVIEW_ROOM_KINDS} from './review-room.js';
import {REVIEW_PRIORITIES,REVIEW_STATUSES} from './review-register.js';
import {catalog} from './catalog.js';

export const REVIEW_CYCLE_TRANSITIONS=Object.freeze({
  new:'พบเพิ่ม',reopened:'กลับมาตรวจ',closed:'ผู้ใช้ปิดประเด็น',updated:'ข้อมูลเปลี่ยน',unchanged:'คงเดิม',
  cleared:'เงื่อนไขเดิมไม่คงอยู่', 'not-listed':'ไม่พบรายการเดิม', 'removed-source':'เอกสารออกจากชุด',unavailable:'ยังเทียบไม่ได้',
});
const ORDER=['unavailable','reopened','new','updated','closed','cleared','not-listed','removed-source','unchanged'];
const TOOL_IDS=new Set(catalog.map(tool=>tool.id));
const SECTION_LABELS={results:'ผลคำนวณ',review:'ทะเบียนตรวจทาน',revisions:'ประวัติฉบับ',document:'ข้อมูลเอกสาร',source:'งานต้นทาง'};
const CONTEXT_KEYS=['projectCode','preparedBy','checkedBy','issueDate','designBasis'];
const FIELDS={kind:'ประเภทประเด็น',status:'สถานะตามข้อมูลรอบนั้น',recordedStatus:'สถานะที่ผู้ใช้บันทึก',title:'หัวข้อ',detail:'ข้อสังเกต',response:'คำตอบ',owner:'ผู้รับผิดชอบที่ระบุ',authoredPriority:'ระดับที่ผู้ใช้ระบุ',priority:'ลำดับดำเนินการ',evidence:'ข้อมูลประกอบ',target:'ตำแหน่งต้นทาง'};
const clean=(value,max=4000)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max):'';
const ownerKey=value=>value?'owner:'+value:'unassigned';
const equal=(a,b)=>a===b||Boolean(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>Object.hasOwn(b,key)&&equal(a[key],b[key])));
const countTransitions=entries=>Object.fromEntries(Object.keys(REVIEW_CYCLE_TRANSITIONS).map(key=>[key,entries.filter(entry=>entry.transition===key).length]));
const isModel=finding=>['model-fail','model-unassessed'].includes(finding?.kind);
const keyParts=finding=>JSON.parse(finding.id);
const uniqueRecord=(records,id)=>{const matches=records.filter(record=>record?.id===id);return matches.length===1?matches[0]:null;};
const issueUnsafe=document=>Boolean(document?.metadataAdjusted||document?.adjustments?.registerAdjusted||document?.adjustments?.registerRejected);
const printable=value=>value===undefined||value===null?'':typeof value==='string'?value:typeof value==='object'?JSON.stringify(value):String(value);

function evidenceText(rows){return (rows||[]).map(row=>row.label+': '+row.value).join('\n');}
function fieldText(finding,key){
  if(key==='evidence')return evidenceText(finding.evidence);
  if(key==='status')return finding.statusLabel;
  if(key==='recordedStatus')return REVIEW_STATUSES[finding.recordedStatus]||'';
  if(key==='authoredPriority')return REVIEW_PRIORITIES[finding.authoredPriority]||'';
  if(key==='kind')return finding.kindLabel;
  if(key==='priority')return finding.priorityLabel;
  if(key==='target')return [SECTION_LABELS[finding.target.section],finding.target.itemId?finding.code||'ประเด็นที่เชื่อมโยง':'',finding.target.pending?'ข้อความร่าง':''].filter(Boolean).join(' · ');
  return printable(finding[key]);
}
function differences(before,after){
  if(!before||!after)return [];
  return Object.entries(FIELDS).filter(([key])=>!equal(before[key],after[key])).map(([key,label])=>({key,label,before:fieldText(before,key),after:fieldText(after,key)}));
}
function sourceRows(record){return Array.isArray(record?.data?.items)?record.data.items:[];}
function uniqueInspectionRow(record,id){
  const rows=sourceRows(record).filter(row=>row?.id===id);
  return rows.length===1?rows[0]:null;
}
function findingKey(finding,records,otherRecords){
  const [sourceId,kind,key]=keyParts(finding);
  if(isModel(finding))return JSON.stringify([sourceId,'model-check',key]);
  if(kind==='inspection-fail'){
    const [,rowId]=JSON.parse(key),own=uniqueRecord(records,sourceId),other=uniqueRecord(otherRecords,sourceId);
    // Unique authored row identities survive reordering. Duplicate IDs retain their
    // source-index identity; they cannot establish a repaired observation below.
    if(uniqueInspectionRow(own,rowId)&&(!other||uniqueInspectionRow(other,rowId)))return JSON.stringify([sourceId,'inspection-row',rowId]);
  }
  return JSON.stringify([sourceId,kind,key]);
}
function canEvaluate(document,finding){
  const kind=typeof finding==='string'?finding:finding.kind;
  if(!document||document.missing)return false;
  if(kind==='pending-editor'&&finding.target?.section==='revisions')return document.kind==='calculator'&&!document.adjustments?.revisionRejected;
  if(kind==='review-item'||kind==='pending-editor')return document.kind==='calculator'&&document.model.status!=='invalid'&&!issueUnsafe(document);
  if(kind==='document-review')return !document.metadataAdjusted;
  if(kind==='model-fail'||kind==='model-unassessed')return document.model.status==='calculated'&&Array.isArray(document.model.checks);
  if(kind.startsWith('inspection-'))return document.toolId==='inspection'&&document.model.status==='calculated';
  return true;
}
function positiveClear(before,currentDocument,beforeRecord,currentRecord){
  if(isModel(before)){
    const [index,label]=JSON.parse(keyParts(before)[2]);
    const check=currentDocument.model.checks.find(check=>check.index===index&&check.label===label);
    if(check?.pass===true)return 'รายการตรวจเดียวกันให้ผลผ่านในแบบจำลองปัจจุบัน: '+check.detail+' ผลนี้ไม่ปิดประเด็นที่ผู้ใช้บันทึกไว้';
  }
  if(before.kind==='document-review'&&!currentDocument.metadataAdjusted&&currentDocument.review.pending.length===0&&CONTEXT_KEYS.every(key=>currentDocument.document[key])){
    return 'ข้อมูลส่งต่อและรายการยืนยันครบตามช่องที่เครื่องมือแสดงในรอบปัจจุบัน เครื่องหมายเหล่านี้ยังเป็นข้อมูลที่ผู้ใช้ระบุ ไม่ใช่การอนุมัติ';
  }
  if(before.kind==='invalid-data'&&['calculated','reference'].includes(currentDocument.model.status)){
    return 'ต้นทางรอบปัจจุบันผ่านการตรวจรูปแบบและอ่านผลตามขอบเขตเครื่องมือได้แล้ว: '+currentDocument.model.label;
  }
  if(before.kind==='data-adjustment'&&!currentDocument.metadataAdjusted&&!Object.values(currentDocument.adjustments||{}).some(Boolean)){
    return 'ข้อมูลรอบปัจจุบันอ่านได้โดยไม่พบการปรับรูปแบบในส่วนที่เครื่องมือนี้ตรวจ ไม่ได้ยืนยันความครบถ้วนทางวิศวกรรม';
  }
  if(before.kind==='inspection-fail'){
    const [,rowId]=JSON.parse(keyParts(before)[2]),row=uniqueInspectionRow(currentRecord,rowId);
    if(uniqueInspectionRow(beforeRecord,rowId)&&row?.status==='pass')return 'รายการหน้างานรหัสเดียวกันมีสถานะที่ผู้ใช้บันทึกว่า “ผ่าน” ในรอบปัจจุบัน: '+row.title+' ไม่ใช่ผลตรวจโครงสร้างอัตโนมัติ';
  }
  if(before.kind==='inspection-pending'&&currentDocument.model.inspection?.pending===0){
    const prior=sourceRows(beforeRecord).filter(row=>row.status==='pending');
    if(prior.length&&prior.every(row=>uniqueInspectionRow(beforeRecord,row.id)&&uniqueInspectionRow(currentRecord,row.id)&&uniqueInspectionRow(currentRecord,row.id).status!=='pending'))return 'รายการหน้างานที่เคยรอตรวจยังมีรหัสเดิมครบ และปัจจุบันไม่มีสถานะ “ยังไม่ตรวจ” เหลืออยู่ สถานะผ่าน ต้องแก้ไข และไม่เกี่ยวข้องยังต้องอ่านแยกกัน';
  }
  return '';
}
function classify(before,after,document,beforeRecord,currentRecord,changes){
  const old=document.before,current=document.after;
  if(document.membership==='removed')return {transition:'removed-source',reason:'เอกสารต้นทางไม่อยู่ในชุดที่เลือกปัจจุบัน การนำออกจากชุดไม่ใช่การปิดหรือแก้ประเด็น'};
  if(document.membership==='missing')return {transition:'unavailable',reason:'งานต้นทางที่เลือกปัจจุบันหาไม่พบหรือมีรหัสซ้ำ จึงยังสรุปผลของรายการเดิมไม่ได้'};
  if(document.membership==='tool-changed')return {transition:'unavailable',reason:'รหัสต้นทางเดิมใช้เครื่องมือคนละชนิด จึงไม่จับคู่สถานะหรือผลข้ามแบบจำลอง'};
  if(before&&after){
    if(before.kind==='review-item'&&(issueUnsafe(old)||issueUnsafe(current)))return {transition:'unavailable',reason:'ข้อมูลเอกสารหรือทะเบียนมีการปรับรูปแบบ ต้องตรวจต้นทางก่อนสรุปการเปิดหรือปิดประเด็น'};
    if(before.kind==='review-item'&&after.kind==='review-item'){
      if(before.status==='closed'&&after.outstanding)return {transition:'reopened',reason:after.status==='needs-review'?'ประเด็นที่เคยปิดกลับมาตรวจซ้ำ เพราะข้อมูลหรือบริบทต่างจากชุดที่ยืนยัน':'ประเด็นที่เคยปิดมีสถานะคงค้างในข้อมูลปัจจุบัน'};
      if(before.status!=='needs-review'&&after.status==='needs-review')return {transition:'reopened',reason:'ประเด็นนี้เพิ่งมีสถานะต้องตรวจซ้ำเมื่อเทียบกับฉบับอ้างอิง คำตอบเดิมต้องตรวจให้ตรงกับข้อมูลปัจจุบัน'};
      if(before.outstanding&&after.status==='closed'&&after.recordedStatus==='closed')return {transition:'closed',reason:'ประเด็นเดิมมีคำตอบและสถานะปิดที่ผู้ใช้ยืนยันไว้ โดยบริบทปัจจุบันตรงกับชุดที่ยืนยัน'};
    }
    return changes.length?{transition:'updated',reason:'สถานะ ข้อความ ผู้รับผิดชอบ หรือข้อมูลประกอบของรายการเดิมเปลี่ยน ดูทั้งสองฝั่งก่อนสรุปผล'}:{transition:'unchanged',reason:'รายการและสถานะที่เปรียบเทียบยังเหมือนฉบับอ้างอิง การเปลี่ยนเวลาบันทึก ลำดับเอกสาร หรือป้ายร่างเพียงอย่างเดียวไม่ถือเป็นการแก้ประเด็น'};
  }
  if(after){
    if(old&&!canEvaluate(old,after))return {transition:'unavailable',reason:'ฉบับอ้างอิงอ่านหรือประเมินข้อมูลประเภทนี้ไม่ได้ครบ จึงยังยืนยันไม่ได้ว่าเป็นรายการที่เพิ่งเกิดขึ้น'};
    return {transition:'new',reason:document.membership==='added'?'รายการมาจากเอกสารที่เพิ่มเข้าชุดปัจจุบัน จึงไม่ใช่การเปลี่ยนของเอกสารเดิม':'พบรายการนี้ในข้อมูลปัจจุบัน แต่ไม่มีรายการรหัสเดียวกันในฉบับอ้างอิง'};
  }
  if(!canEvaluate(current,before))return {transition:'unavailable',reason:'ข้อมูลปัจจุบันอ่านหรือประเมินรายการประเภทนี้ไม่ได้ครบ การไม่พบรายการเดิมจึงไม่ใช่หลักฐานว่าปิดหรือแก้แล้ว'};
  const cleared=positiveClear(before,current,beforeRecord,currentRecord);
  if(cleared)return {transition:'cleared',reason:cleared};
  return {transition:'not-listed',reason:before.kind==='review-item'?'ไม่พบประเด็นรหัสเดิมในทะเบียนปัจจุบัน ไม่มีสถานะปิดให้ยืนยัน จึงไม่นับเป็นประเด็นที่ปิดแล้ว':before.kind==='pending-editor'?'ไม่พบข้อความร่างนี้ในข้อมูลปัจจุบัน การที่ร่างหายไปไม่ยืนยันว่าได้บันทึกคำตอบ ปิดประเด็น หรือเก็บฉบับแล้ว':'ไม่พบรายการเดิมในคิวปัจจุบัน แต่ไม่มีหลักฐานของเงื่อนไขเดิมที่เพียงพอให้สรุปว่าแก้แล้ว'};
}

/** Re-evaluate captured/current inputs using one current engine, never mutate evidence. */
export function buildReviewCycle(rawReference,currentRecords,definitions,composer,{now=new Date().toISOString(),appVersion='0.9'}={}){
  const source=handoverReferenceSource(rawReference),records=Array.isArray(currentRecords)?currentRecords:[];
  const beforeModel=buildReviewRoom(source.records,definitions,source.composer,{now}),currentModel=buildReviewRoom(records,definitions,composer,{now});
  const oldDocs=new Map(beforeModel.documents.map(document=>[document.id,document])),newDocs=new Map(currentModel.documents.map(document=>[document.id,document]));
  const ids=[...newDocs.keys(),...[...oldDocs.keys()].filter(id=>!newDocs.has(id))];
  const documents=ids.map(id=>{
    const before=oldDocs.get(id)||null,after=newDocs.get(id)||null,shown=after&&!after.missing?after:before||after;
    const membership=!after?'removed':after.missing?'missing':!before?'added':before.toolId!==after.toolId?'tool-changed':'retained';
    return {id,name:shown.name,toolId:shown.toolId,toolTitle:shown.toolTitle,category:shown.category,categoryLabel:shown.categoryLabel,before,after,membership,beforeIndex:before?.documentIndex??null,afterIndex:after?.documentIndex??null,counts:null};
  });
  const documentsById=new Map(documents.map(document=>[document.id,document]));
  const beforeByKey=new Map(beforeModel.findings.map(finding=>[findingKey(finding,source.records,records),finding]));
  const afterByKey=new Map(currentModel.findings.map(finding=>[findingKey(finding,records,source.records),finding]));
  const keys=[...afterByKey.keys(),...[...beforeByKey.keys()].filter(key=>!afterByKey.has(key))];
  const entries=keys.map(id=>{
    const before=beforeByKey.get(id)||null,after=afterByKey.get(id)||null,shown=after||before,document=documentsById.get(shown.documentId);
    const changes=differences(before,after),result=classify(before,after,document,uniqueRecord(source.records,document.id),uniqueRecord(records,document.id),changes);
    const canOpenCurrent=Boolean(document.after&&!document.after.missing&&TOOL_IDS.has(document.after.toolId));
    const target=!canOpenCurrent?null:document.membership==='tool-changed'?{section:'source'}:after?{...after.target}:{section:before.target.section};
    return {id,documentId:shown.documentId,documentIndex:document.after?.documentIndex||document.before.documentIndex,documentName:document.after&&!document.after.missing?document.after.name:document.before?.name||shown.documentName,
      documentCode:shown.documentCode,documentRevision:shown.documentRevision,toolId:shown.toolId,toolTitle:shown.toolTitle,category:shown.category,categoryLabel:shown.categoryLabel,
      kind:shown.kind,kindLabel:shown.kindLabel,priority:shown.priority,priorityLabel:shown.priorityLabel,owner:shown.owner,ownerKey:shown.ownerKey,title:shown.title,
      before,after,beforeDocument:document.before,afterDocument:document.after,transition:result.transition,transitionLabel:REVIEW_CYCLE_TRANSITIONS[result.transition],reason:result.reason,changes,
      membership:document.membership,canOpenCurrent,currentFindingId:after?.id||null,target,currentOutstanding:after?after.outstanding:null};
  });
  entries.sort((a,b)=>ORDER.indexOf(a.transition)-ORDER.indexOf(b.transition)||ids.indexOf(a.documentId)-ids.indexOf(b.documentId));
  for(const document of documents)document.counts=countTransitions(entries.filter(entry=>entry.documentId===document.id));
  const ownerNames=[...new Set(entries.flatMap(entry=>[entry.before?.owner,entry.after?.owner]).filter(name=>name!==undefined))];
  const owners=ownerNames.map(name=>({id:ownerKey(name),label:name||'ไม่มีชื่อผู้รับผิดชอบในฝั่งที่เปรียบเทียบ',total:entries.filter(entry=>[entry.before,entry.after].some(side=>side&&side.owner===name)).length}));
  const categoryIds=[...new Set(documents.flatMap(document=>[document.before?.category,document.after?.category]).filter(Boolean))];
  const categories=categoryIds.map(id=>({id,label:[...beforeModel.categories,...currentModel.categories].find(category=>category.id===id)?.label||id,total:entries.filter(entry=>[entry.before,entry.after].some(side=>side?.category===id)).length}));
  const counts=countTransitions(entries);
  return {reference:source.reference,generatedAt:now,currentAppVersion:clean(appVersion,30)||'ไม่ระบุ',beforeModel,currentModel,documents,entries,owners,categories,
    summary:{total:entries.length,changes:entries.length-counts.unchanged,counts,referenceDocuments:beforeModel.documents.length,currentDocuments:currentModel.documents.length,
      availableDocuments:currentModel.summary.presentDocuments,missingDocuments:currentModel.summary.missingDocuments,addedDocuments:documents.filter(document=>document.membership==='added').length,
      removedDocuments:documents.filter(document=>document.membership==='removed').length,toolChangedDocuments:documents.filter(document=>document.membership==='tool-changed').length,
      beforeFindings:beforeModel.findings.length,currentFindings:currentModel.findings.length,beforeOutstanding:beforeModel.summary.outstanding,currentOutstanding:currentModel.summary.outstanding},
    notes:[
      'ผลทั้งสองฝั่งอ่านจากข้อมูลต้นทางด้วยแบบจำลองรุ่นปัจจุบัน วันที่ฉบับอ้างอิงคือเวลาเก็บข้อมูล ไม่ใช่การย้อนใช้เครื่องยนต์รุ่นเก่า',
      'จับคู่ด้วยรหัสต้นทางและรหัสรายการเท่านั้น การนำเอกสารออก การลบประเด็น หรือข้อมูลที่ประเมินไม่ได้ไม่ถือเป็นการปิดประเด็น',
      'ผู้ใช้ปิดประเด็นหมายถึงสถานะของประเด็นที่บันทึกไว้ ส่วนเงื่อนไขเดิมไม่คงอยู่ใช้หลักฐานจากแบบจำลองหรือข้อมูลปัจจุบัน ทั้งสองอย่างไม่ใช่การอนุมัติโครงการ',
      'ตัวกรองผู้รับผิดชอบใช้ชื่อที่บันทึกในฝั่งใดฝั่งหนึ่งของรายการ ชื่อเป็นข้อความในข้อมูล ไม่ใช่บัญชีผู้ใช้หรือการมอบหมายอัตโนมัติ',
    ]};
}

export function normalizeReviewCycleFilters(raw={}){
  const value=raw&&typeof raw==='object'?raw:{};
  return {search:clean(value.search,240),transition:value.transition==='all'||value.transition==='changes'||Object.hasOwn(REVIEW_CYCLE_TRANSITIONS,value.transition)?value.transition:'changes',
    documentId:clean(value.documentId,200),kind:Object.hasOwn(REVIEW_ROOM_KINDS,value.kind)?value.kind:'all',category:clean(value.category,80)||'all',owner:clean(value.owner,140),groupBy:value.groupBy==='document'?'document':'transition'};
}
export function filterReviewCycle(model,rawFilters={}){
  const filters=normalizeReviewCycleFilters(rawFilters),search=filters.search.toLocaleLowerCase('th-TH');
  return (model?.entries||[]).filter(entry=>{
    const sides=[entry.before,entry.after].filter(Boolean);
    return (filters.transition==='all'||filters.transition==='changes'&&entry.transition!=='unchanged'||entry.transition===filters.transition)&&
      (!filters.documentId||entry.documentId===filters.documentId)&&(filters.kind==='all'||sides.some(side=>side.kind===filters.kind))&&
      (filters.category==='all'||sides.some(side=>side.category===filters.category))&&(!filters.owner||sides.some(side=>side.ownerKey===filters.owner))&&
      (!search||[entry.title,entry.reason,entry.documentName,entry.documentCode,entry.transitionLabel,...sides.flatMap(side=>[side.documentName,side.documentCode,side.documentRevision,side.title,side.detail,side.response,side.owner,side.kindLabel,side.statusLabel,evidenceText(side.evidence)])].join('\n').toLocaleLowerCase('th-TH').includes(search));
  });
}
export function groupReviewCycle(entries,groupBy='transition'){
  const groups=new Map(),byDocument=groupBy==='document';
  for(const entry of entries||[]){
    const id=byDocument?entry.documentId:entry.transition,label=byDocument?(entry.documentCode?entry.documentCode+' · ':'')+entry.documentName:REVIEW_CYCLE_TRANSITIONS[id];
    if(!groups.has(id))groups.set(id,{id,label,entries:[],total:0,currentOutstanding:0});
    const group=groups.get(id);group.entries.push(entry);group.total++;group.currentOutstanding+=Number(entry.currentOutstanding===true);
  }
  const result=[...groups.values()];
  if(!byDocument)result.sort((a,b)=>ORDER.indexOf(a.id)-ORDER.indexOf(b.id));
  return result;
}
