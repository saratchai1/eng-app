import { buildHandover } from './handover.js';
import { evaluateReviewRegister, REVIEW_PRIORITIES, REVIEW_STATUSES } from './review-register.js';
import { restoreRevisions } from './revisions.js';
import { format } from './utils.js';

export const REVIEW_ROOM_PRIORITIES = Object.freeze({fix:'ตรวจแก้ลำดับแรก',review:'ตรวจและตอบประเด็น',prepare:'เตรียมข้อมูลส่งต่อ'});
export const REVIEW_ROOM_KINDS = Object.freeze({
  'missing-source':'ไม่พบต้นทางที่ชัดเจน','invalid-data':'ข้อมูลที่ยังประเมินไม่ได้','data-adjustment':'ข้อมูลที่ต้องตรวจรูปแบบ',
  'model-fail':'ข้อไม่ผ่านในแบบจำลอง','model-unassessed':'ข้อที่แบบจำลองไม่ประเมิน','review-item':'ประเด็นที่บันทึกไว้',
  'document-review':'ข้อมูลเอกสารและรายการยืนยัน','pending-editor':'ข้อความที่ยังรอยืนยัน',
  'inspection-fail':'ข้อบกพร่องที่บันทึกไว้','inspection-pending':'รายการหน้างานที่ยังไม่ตรวจ',
});
export const REVIEW_ROOM_STATUSES = Object.freeze({open:'ต้องดำเนินการ',addressed:'ตอบแล้ว · รอตรวจ','needs-review':'ต้องตรวจซ้ำ',closed:'ผู้ใช้ระบุว่าปิดแล้ว'});
const PRIORITY_ORDER = Object.keys(REVIEW_ROOM_PRIORITIES);
const CONTEXT_FIELDS = Object.freeze({projectCode:'รหัสโครงการ / เอกสาร',preparedBy:'ผู้จัดทำ',checkedBy:'ผู้ตรวจทานที่ระบุ',issueDate:'วันที่เอกสาร',designBasis:'แหล่งข้อมูลและเกณฑ์ที่ใช้'});
const text = (value,max=4000) => typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max):'';
const ownerKey = value => value?'owner:'+value:'unassigned';
const valueText = value => value===null || value===undefined?'ไม่มีค่าที่ประเมินได้':typeof value==='number'?Number.isFinite(value)?format(value,6):'ข้อมูลไม่ถูกต้อง':String(value);
const identity = (documentId,kind,key) => JSON.stringify([documentId,kind,String(key)]);
const evidence = (label,value) => ({label:String(label),value:String(value)});

/** A derived agenda only. It never changes source inputs, declarations or review records. */
export function buildReviewRoom(records,definitions,composer,{now=new Date().toISOString()}={}) {
  const handover=buildHandover(records,definitions,composer,{now}),findings=[];
  const source=Array.isArray(records)?records:[];
  const documents=handover.entries.map((entry,index)=>({...entry,documentIndex:index+1}));
  for(const document of documents) {
    const add=(kind,key,values={})=>{
      const priority=values.priority||'review',status=values.status||'open',owner=text(values.owner,120);
      const finding={
        id:identity(document.id,kind,key),documentId:document.id,documentIndex:document.documentIndex,
        documentName:document.name,documentCode:document.document.projectCode,documentRevision:document.document.revision,
        toolId:document.toolId,toolTitle:document.toolTitle,category:document.category,categoryLabel:document.categoryLabel,
        sourceState:document.sourceState,kind,kindLabel:REVIEW_ROOM_KINDS[kind],priority,priorityLabel:REVIEW_ROOM_PRIORITIES[priority],
        authoredPriority:'',status,statusLabel:REVIEW_ROOM_STATUSES[status],owner,ownerKey:ownerKey(owner),
        title:'',detail:'',response:'',evidence:[],target:{section:'source'},warnings:[...document.warnings],nextAction:'เปิดต้นทางเพื่อตรวจข้อมูล',
        ...values,outstanding:status!=='closed',
      };
      // An authored owner is the only source of assignment; document checker names are context.
      finding.owner=owner;finding.ownerKey=ownerKey(owner);findings.push(finding);return finding;
    };
    if(document.missing) {
      add('missing-source','source',{priority:'fix',title:document.name,detail:document.warnings.join('\n'),nextAction:'กลับไปจัดชุดและตรวจรายการต้นทาง',target:{section:'source'}});
      continue;
    }
    const matches=source.filter(record=>record?.id===document.id),record=matches.length===1?matches[0]:null;
    const data=record?.data,definition=definitions?.[document.toolId];
    if(document.model.status==='invalid') {
      add('invalid-data','model',{priority:'fix',title:document.model.label,detail:document.warnings.join('\n')||'เปิดต้นทางเพื่อตรวจข้อมูลและขอบเขตของเครื่องมือ',nextAction:'เปิดต้นทางและแก้ข้อมูลที่ประเมินไม่ได้',target:{section:'results'}});
    }
    const adjustment=document.adjustments||{};
    if(document.metadataAdjusted || Object.values(adjustment).some(Boolean)) {
      const issues=[];
      if(document.metadataAdjusted)issues.push(evidence('ข้อมูลเอกสาร','มีข้อมูลหรือเครื่องหมายตรวจที่ต้องปรับรูปแบบ'));
      if(adjustment.registerRejected)issues.push(evidence('ประเด็นที่ใช้ไม่ได้',adjustment.registerRejected));
      if(adjustment.registerAdjusted)issues.push(evidence('ทะเบียนประเด็น','มีข้อมูลที่ต้องตรวจรูปแบบใหม่'));
      if(adjustment.revisionRejected)issues.push(evidence('ฉบับอ้างอิงที่ใช้ไม่ได้',adjustment.revisionRejected));
      if(adjustment.optionRejected)issues.push(evidence('ทางเลือกที่ใช้ไม่ได้',adjustment.optionRejected));
      add('data-adjustment','restore',{priority:'fix',title:'ตรวจข้อมูลที่อ่านได้ไม่ครบหรือถูกปรับรูปแบบ',detail:'ตรวจข้อมูลเดิมและรายการที่ยังอ่านได้ก่อนบันทึกใหม่ การแสดงหน้านี้ไม่เขียนทับต้นทาง',evidence:issues,nextAction:'เปิดต้นทางเพื่อตรวจข้อมูลที่ต้องแก้รูปแบบ',target:{section:document.metadataAdjusted?'document':'review'}});
    }
    for(const check of document.model.checks||[]) {
      if(check.pass===true)continue;
      add(check.pass===false?'model-fail':'model-unassessed',JSON.stringify([check.index,check.label]),{priority:check.pass===false?'fix':'review',title:check.label,detail:check.detail,
        evidence:[evidence('ผลตรวจ',check.pass===false?'ไม่ผ่านเงื่อนไขที่แสดงในแบบจำลอง':'ไม่ประเมินในสภาวะข้อมูลปัจจุบัน')],
        nextAction:'เปิดผลคำนวณและตรวจข้อมูลกับขอบเขตที่ระบุ',target:{section:'results'}});
    }
    if(document.kind==='calculator' && definition && data && typeof data==='object') {
      const register=evaluateReviewRegister(definition,data._review,data,data._document);
      for(const item of register.items) {
        const changes=[...item.changedFields,...item.changedContext];
        const details=[evidence('รหัสประเด็น',item.code),evidence('ระดับที่ผู้ใช้ระบุ',REVIEW_PRIORITIES[item.priority]),evidence('สถานะที่ยืนยันไว้',REVIEW_STATUSES[item.status])];
        if(item.effectiveStatus==='needs-review')details.push(evidence('เหตุที่ต้องตรวจซ้ำ',!register.currentValid?'ข้อมูลปัจจุบันไม่อยู่ในขอบเขตที่ประเมินได้':'ข้อมูลเข้าหรือบริบทเปลี่ยนจากชุดที่ยืนยัน'));
        for(const change of changes)details.push(evidence(change.label+(change.unit?' ('+change.unit+')':''),valueText(change.previous)+' → '+valueText(change.current)));
        add('review-item',item.id,{priority:item.priority==='critical'?'fix':'review',authoredPriority:item.priority,status:item.effectiveStatus,owner:item.owner,
          code:item.code,title:item.title,detail:item.detail,response:item.response,evidence:details,
          recordedStatus:item.status,changedFields:item.changedFields.map(row=>({...row})),changedContext:item.changedContext.map(row=>({...row})),
          nextAction:item.effectiveStatus==='closed'?'เปิดประเด็นที่ผู้ใช้ระบุว่าปิดแล้ว':'เปิดประเด็นและตรวจคำตอบตามข้อมูลปัจจุบัน',target:{section:'review',itemId:item.id}});
      }
      if(register.pending) {
        add('pending-editor','review',{priority:'prepare',title:'มีข้อความประเด็นที่ยังไม่ยืนยัน',detail:'ร่างข้อความและสถานะในตัวแก้ไขยังไม่เปลี่ยนรายการที่ยืนยันไว้ เปิดต้นทางเพื่อทำต่อ บันทึก หรือยกเลิกร่างอย่างชัดเจน',
          evidence:[evidence('ร่างเกี่ยวกับ',register.pending.itemId?'ประเด็นเดิม '+(register.items.find(item=>item.id===register.pending.itemId)?.code||''):'ประเด็นใหม่ที่ยังไม่บันทึก'),
            evidence('หัวข้อ (ร่างยังไม่ยืนยัน)',register.pending.values.title),evidence('รายละเอียด (ร่างยังไม่ยืนยัน)',register.pending.values.detail),
            evidence('คำตอบ (ร่างยังไม่ยืนยัน)',register.pending.values.response),evidence('สถานะที่เลือก (ร่างยังไม่ยืนยัน)',REVIEW_STATUSES[register.pending.values.status]),
            evidence('ผู้รับผิดชอบ (ร่างยังไม่ยืนยัน)',register.pending.values.owner||'ยังไม่ระบุ')],
          nextAction:'กลับไปทำข้อความร่างในทะเบียนประเด็นให้เสร็จ',target:{section:'review',pending:true,...(register.pending.itemId?{itemId:register.pending.itemId}:{})}});
      }
      const revisions=restoreRevisions(definition,data._revisions);
      if(revisions.state.draftNote) {
        add('pending-editor','revision',{priority:'prepare',title:'มีหมายเหตุฉบับอ้างอิงที่ยังไม่ได้เก็บ',detail:'ข้อความยังเป็นร่างของฉบับใหม่ ไม่ได้เพิ่มฉบับอ้างอิงหรือเปลี่ยนประวัติที่เก็บไว้',evidence:[evidence('หมายเหตุร่างที่ยังไม่ได้เก็บ',revisions.state.draftNote)],nextAction:'เปิดประวัติฉบับเพื่อทำหมายเหตุร่างต่อ',target:{section:'revisions',pending:true}});
      }
    }
    if(document.toolId==='inspection' && document.model.status==='calculated') {
      // buildHandover accepted the complete canonical workflow first. Use its original rows,
      // never a normalizer's repaired/default observations or inferred defect severity.
      const rows=data.items;
      for(let index=0;index<rows.length;index++) {
        const row=rows[index];if(row.status!=='fail')continue;
        add('inspection-fail',JSON.stringify([index,row.id]),{priority:'fix',title:row.title,detail:row.note||'ผู้ใช้บันทึกว่ารายการนี้ต้องแก้ไข',
          evidence:[evidence('กลุ่มตรวจ',row.group),evidence('สถานะที่บันทึก','ต้องแก้ไข')],nextAction:'เปิดรายการตรวจหน้างานและติดตามข้อบกพร่อง',target:{section:'results'}});
      }
      if(document.model.inspection.pending) {
        add('inspection-pending','pending',{priority:'review',title:'รายการหน้างานที่ยังไม่ตรวจ '+document.model.inspection.pending+' รายการ',detail:'สถานะยังไม่ตรวจเป็นข้อมูลที่ผู้ใช้บันทึก ไม่ถือว่ารายการเหล่านี้ผ่านหรือไม่เกี่ยวข้อง',
          evidence:rows.filter(row=>row.status==='pending').map(row=>evidence(row.group,row.title)),nextAction:'เปิดแบบตรวจเพื่อทำรายการที่ยังไม่ตรวจ',target:{section:'results'}});
      }
    }
    const pending=document.review.pending||[],missingContext=Object.entries(CONTEXT_FIELDS).filter(([key])=>!document.document[key]);
    if(pending.length || missingContext.length) {
      add('document-review','document',{priority:'prepare',title:'ทบทวนข้อมูลเอกสารและรายการยืนยัน',
        detail:'รายการนี้แสดงสิ่งที่ผู้ใช้ยังไม่ระบุ ชื่อผู้ตรวจและเครื่องหมายเป็นข้อความของผู้ใช้ แยกจากผลคำนวณและการอนุมัติ',
        evidence:[...pending.map(item=>evidence('ยังไม่ระบุว่าตรวจแล้ว',item.title)),...missingContext.map(([,label])=>evidence('ข้อมูลส่งต่อที่ยังไม่ระบุ',label))],
        nextAction:'เปิดข้อมูลเอกสารเพื่อตรวจบริบทและบันทึกสิ่งที่ตรวจจริง',target:{section:'document'}});
    }
  }
  findings.sort((a,b)=>Number(!a.outstanding)-Number(!b.outstanding)||PRIORITY_ORDER.indexOf(a.priority)-PRIORITY_ORDER.indexOf(b.priority)||a.documentIndex-b.documentIndex);
  for(const document of documents) {
    const rows=findings.filter(finding=>finding.documentId===document.id);
    document.findingCount=rows.length;document.outstanding=rows.filter(row=>row.outstanding).length;document.closed=rows.length-document.outstanding;
  }
  const outstanding=findings.filter(item=>item.outstanding),count=kind=>outstanding.filter(item=>item.kind===kind).length;
  const owners=groupReviewRoom(findings,'owner').map(group=>({id:group.id,label:group.label,total:group.total,outstanding:group.outstanding}));
  const categories=[];
  for(const document of documents)if(document.category && !categories.some(group=>group.id===document.category)) {
    const rows=findings.filter(item=>item.category===document.category);
    categories.push({id:document.category,label:document.categoryLabel,total:rows.length,outstanding:rows.filter(item=>item.outstanding).length});
  }
  const summary={documents:documents.length,presentDocuments:handover.summary.documents,missingDocuments:handover.summary.missing,invalidDocuments:handover.summary.invalid,
    findings:findings.length,outstanding:outstanding.length,closed:findings.length-outstanding.length,
    ...Object.fromEntries(PRIORITY_ORDER.map(priority=>[priority,outstanding.filter(item=>item.priority===priority).length])),
    modelFailures:count('model-fail'),modelUnassessed:count('model-unassessed'),reviewOutstanding:count('review-item'),needsReview:outstanding.filter(item=>item.status==='needs-review').length,
    unassigned:outstanding.filter(item=>!item.owner).length,owners:owners.filter(group=>group.id!=='unassigned').length,documentGaps:count('document-review'),pendingEditors:count('pending-editor'),dataAdjustments:count('data-adjustment'),inspectionDefects:count('inspection-fail'),drafts:handover.summary.drafts};
  return {metadata:{...handover.metadata},generatedAt:now,documents,findings,summary,owners,categories,notes:[
    'เรียงงานที่ยังติดตามก่อนรายการปิด จากนั้นเป็นตรวจแก้ลำดับแรก → ตรวจและตอบประเด็น → เตรียมข้อมูลส่งต่อ และลำดับเอกสารในชุด การจัดกลุ่มนี้เป็นลำดับทำงาน ไม่ใช่คะแนนความเสี่ยงหรือการอนุมัติ',
    'ผู้รับผิดชอบมาจากชื่อที่บันทึกไว้ในประเด็นเท่านั้น รายการที่ระบบรวบรวมไม่ได้ถูกมอบหมายให้ชื่อผู้ตรวจเอกสาร และไม่มีการแจ้งเตือนบุคคลอัตโนมัติ',
    'ผลแบบจำลอง ประเด็นที่ผู้ใช้บันทึก และรายการยืนยันแสดงแยกกัน ไม่มีรายการค้างไม่ได้แปลว่าตรวจครบหรืออนุมัติแล้ว',
  ]};
}

export function normalizeReviewRoomFilters(raw={}) {
  const value=raw&&typeof raw==='object'?raw:{};
  return {search:text(value.search,240),priority:Object.hasOwn(REVIEW_ROOM_PRIORITIES,value.priority)?value.priority:'all',kind:Object.hasOwn(REVIEW_ROOM_KINDS,value.kind)?value.kind:'all',
    status:['all','outstanding',...Object.keys(REVIEW_ROOM_STATUSES)].includes(value.status)?value.status:'outstanding',category:text(value.category,80)||'all',
    documentId:text(value.documentId,200),owner:text(value.owner,140),groupBy:['priority','document','owner'].includes(value.groupBy)?value.groupBy:'priority'};
}

export function filterReviewRoom(model,rawFilters={}) {
  const filters=normalizeReviewRoomFilters(rawFilters),search=filters.search.toLocaleLowerCase('th-TH');
  return (model?.findings||[]).filter(item=>
    (filters.priority==='all'||item.priority===filters.priority)&&(filters.kind==='all'||item.kind===filters.kind)&&
    (filters.status==='all'||filters.status==='outstanding'&&item.outstanding||item.status===filters.status)&&
    (filters.category==='all'||item.category===filters.category)&&(!filters.documentId||item.documentId===filters.documentId)&&(!filters.owner||item.ownerKey===filters.owner)&&
    (!search||[item.documentName,item.documentCode,item.toolTitle,item.title,item.detail,item.response,item.code,item.owner,item.kindLabel,...item.evidence.map(row=>row.label+' '+row.value)].join('\n').toLocaleLowerCase('th-TH').includes(search)));
}

export function groupReviewRoom(findings,groupBy='priority') {
  if(!['priority','document','owner'].includes(groupBy))groupBy='priority';
  const groups=[];
  for(const finding of findings||[]) {
    const id=groupBy==='document'?finding.documentId:groupBy==='owner'?finding.ownerKey:finding.priority;
    const label=groupBy==='document'?[String(finding.documentIndex).padStart(2,'0'),finding.documentName].join(' · '):groupBy==='owner'?finding.owner||'ไม่มีชื่อผู้รับผิดชอบในต้นทาง':REVIEW_ROOM_PRIORITIES[finding.priority];
    let group=groups.find(item=>item.id===id);if(!group){group={id,label,findings:[],total:0,outstanding:0};groups.push(group);}
    group.findings.push(finding);group.total++;if(finding.outstanding)group.outstanding++;
  }
  if(groupBy==='priority')groups.sort((a,b)=>PRIORITY_ORDER.indexOf(a.id)-PRIORITY_ORDER.indexOf(b.id));
  else if(groupBy==='document')groups.sort((a,b)=>a.findings[0].documentIndex-b.findings[0].documentIndex);
  return groups;
}
