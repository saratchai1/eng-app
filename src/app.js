import {catalog,categories} from './catalog.js';
import {engineeringTools} from './engineering.js';
import {quantityTools} from './quantities.js';
import {mountWorkflow} from './workflows.js';
import {mountSpecial} from './specials.js';
import {icon,sketch} from './visuals.js';
import {engineeringFigure,engineeringFigureCaption} from './calculation-diagrams.js';
import {escapeHTML as e,format as f,download,csv,today,uniqueId} from './utils.js';
import {makeDraftRecord,resolveProjectForTool,persistJSON,readToolDraft,persistToolDraft,removeToolDraft,persistToolPointer,finalizeSavedDraft,removeOwnedDraft} from './project-storage.js';
import {captureBaseline,restoreBaseline,comparisonMarkup} from './comparison.js';
import {studioHeader,studioFooter,studioHomeLead,projectSignals,projectSignalMarkup,calculationOverview} from './studio.js';
import {normalizeDocument,documentEditorMarkup,readDocumentEditor,documentSummaryMarkup,documentCoverMarkup,documentReviewState,invalidateDocumentReview} from './document-control.js';
import {mountSensitivity} from './sensitivity.js';
import {mountDesignOptions} from './design-options.js';
import {indexReportContent,reportNavigationMarkup,mountReportReader,loadReportStyles,standaloneReportHTML} from './report-reader.js';
import {mountReviewRegister,reopenReviewRegister} from './review-register.js';
import {mountRevisions} from './revisions.js';
import {reviewWorkspaceMarkup,mountReviewWorkspace,reviewHandoverMarkup} from './review-workspace.js';
import {MAX_HANDOVER_RECORDS,MAX_BUNDLE_BYTES,normalizeHandoverState,buildHandover,createProjectBundle,parseProjectBundle,planProjectBundleImport,handoverCSV} from './handover.js';
import {mountHandover,handoverReportMarkup} from './handover-view.js';
import {createHandoverExample} from './handover-example.js';
import {restoreHandoverHistory,appendHandoverReference,compareHandoverReference,handoverReferenceModel,MAX_HANDOVER_REFERENCES} from './handover-history.js';
import {mountHandoverHistory,handoverHistoryComparisonReportMarkup,handoverHistorySnapshotReportMarkup} from './handover-history-view.js';
import {HANDOVER_HISTORY_KEY,readHandoverHistory,updateHandoverHistory} from './handover-history-storage.js';
import {buildReviewRoom,normalizeReviewRoomFilters} from './review-room.js';
import {mountReviewRoom} from './review-room-view.js';
import {reviewRoomReportMarkup,reviewRoomCSV} from './review-room-report.js';
import {reviewSourceHash,parseReviewSourceHash,resolveReviewSource,preserveReviewSourceDraft} from './review-source.js';

const APP_VERSION='0.8';
const SESSION_WRITER_ID=uniqueId();

const app=document.querySelector('#app');
const tools={...engineeringTools,...quantityTools};
const KEYS={projects:'engapp.projects.v1',favorites:'engapp.favorites.v1',recent:'engapp.recent.v1',handover:'engapp.handover.v1',handoverPrevious:'engapp.handover.previous.v1',handoverHistoryPreferences:'engapp.handover.history-preferences.v1',reviewRoomPreferences:'engapp.review-room.preferences.v1'};
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
function readSavedProjects(){const records=read(KEYS.projects,[]);return Array.isArray(records)?records.filter(p=>p&&p.schemaVersion===1&&typeof p.id==='string'&&p.id.length>0&&p.id.length<=200&&typeof p.name==='string'&&catalog.some(t=>t.id===p.toolId)&&p.data&&typeof p.data==='object'&&!Array.isArray(p.data)):[];}
let saved=readSavedProjects();
let recentTools=read(KEYS.recent,[]);if(!Array.isArray(recentTools))recentTools=[];
recentTools=[...new Set(recentTools.filter(id=>catalog.some(t=>t.id===id)))].slice(0,4);
let favorites=read(KEYS.favorites,[]);if(!Array.isArray(favorites))favorites=[];
favorites=favorites.filter(id=>catalog.some(t=>t.id===id));
let filters={search:'',category:'all',favorites:false};
let projectFilters={search:'',sort:'updated'};
let modalReturnFocus=null;
let modalCleanup=null;
let mounted=null,current=null,draftTimer=null,toastTimer=null,storeErrorShown=false;
let handoverDesk=null,handoverState=normalizeHandoverState(read(KEYS.handover,null)),pendingBundle=null,activeReport=null;
let previousHandoverState=read(KEYS.handoverPrevious,null);
previousHandoverState=previousHandoverState?.schemaVersion===1?normalizeHandoverState(previousHandoverState):null;
let handoverUnsaved=false,handoverHistoryView=null,historyBusy=false,historyUndo=null,historyNotice='';
const historyPreferences=read(KEYS.handoverHistoryPreferences,null);
let historySelectedId=typeof historyPreferences?.selectedId==='string'?historyPreferences.selectedId:null;
let historyDraft={code:typeof historyPreferences?.draft?.code==='string'?historyPreferences.draft.code.slice(0,40):'',note:typeof historyPreferences?.draft?.note==='string'?historyPreferences.draft.note.slice(0,1200):''};
let reviewRoom=null,reviewRoomState=read(KEYS.reviewRoomPreferences,null),reviewSourceContext=null;

function showModal(markup){
 modalCleanup?.();modalCleanup=null;
 activeReport=null;pendingBundle=null;
 const root=document.querySelector('#modal-root');
 if(!root.firstElementChild)modalReturnFocus=document.activeElement;
 root.innerHTML=markup;app.inert=true;document.body.classList.add('modal-open');
 return root;
}
function closeModal(){
 modalCleanup?.();modalCleanup=null;
 activeReport=null;pendingBundle=null;
 document.querySelector('#modal-root').innerHTML='';app.inert=false;document.body.classList.remove('modal-open','printing-report');
 document.querySelector('#print-root').innerHTML='';
 if(modalReturnFocus?.isConnected)modalReturnFocus.focus({preventScroll:true});modalReturnFocus=null;
}
function notify(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4000);}
function storageResult(ok){if(ok){storeErrorShown=false;return true;}if(!storeErrorShown){notify('เก็บข้อมูลในเบราว์เซอร์ไม่ได้หรือพื้นที่ไม่พอ กรุณาส่งออก JSON เพื่อสำรองงาน');storeErrorShown=true;}return false;}
function write(key,value){let ok=false;try{ok=persistJSON(localStorage,key,value);}catch{}return storageResult(ok);}
function writeDraft(record){let ok=false;try{ok=persistToolDraft(localStorage,record);}catch{}return storageResult(ok);}
function readDraft(toolId,projectId=undefined){try{return readToolDraft(localStorage,toolId,projectId,saved);}catch{return null;}}
function clearDraft(toolId,projectId=undefined){try{return removeToolDraft(localStorage,toolId,projectId);}catch{return false;}}
function cleanup({save=true}={}){clearTimeout(draftTimer);if(save&&current&&mounted)saveDraft({showStatus:false});mounted?.destroy?.();mounted=null;handoverDesk?.destroy?.();handoverDesk=null;handoverHistoryView?.destroy?.();handoverHistoryView=null;if(reviewRoom){reviewRoomState=reviewRoom.getState();reviewRoom.destroy();reviewRoom=null;}reviewSourceContext=null;}
function saveDraft({showStatus=true}={}){if(!current||!mounted)return false;if(current.id&&!current.dirty){try{return storageResult(persistToolPointer(localStorage,current.tool.id,current.id));}catch{return storageResult(false);}}const record=makeDraftRecord({id:current.id,toolId:current.tool.id,name:document.querySelector('#project-name')?.value ?? current.name,createdAt:current.createdAt,writerId:SESSION_WRITER_ID,baseSavedAt:current.baseSavedAt,data:mounted.getState()},current.dirty?new Date().toISOString():current.updatedAt);const ok=writeDraft(record);if(showStatus&&current.dirty){const badge=document.querySelector('#save-status');if(badge)badge.textContent=ok?'สำรองชั่วคราวแล้ว · กดบันทึกงานเพื่อเก็บในงานของฉัน':'ยังสำรองไม่ได้ · กรุณาส่งออก JSON เก็บข้อมูล';}return ok;}
function onChange({documentOnly=false}={}){if(!documentOnly)mounted?.invalidateReview?.();mounted?.refreshContext?.();if(current)current.dirty=true;clearTimeout(draftTimer);draftTimer=setTimeout(()=>saveDraft(),500);const badge=document.querySelector('#save-status');if(badge)badge.textContent='มีการแก้ไข · กำลังสำรองชั่วคราว…';}
function logo(){return `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 44" fill="none"><path d="m20 2 17 10v20L20 42 3 32V12z" stroke="currentColor" stroke-width="2"/><path d="M12 12h16v5H17v4h9v4h-9v5h11v5H12z" fill="currentColor"/><path d="M29 6v8m-4-4h8" stroke="#f58335" stroke-width="2"/></svg></span><span><strong>ENG<span>APP</span></strong><small>ENGINEERING STUDIO</small></span>`;}
function header(active='catalog'){return studioHeader({active,count:saved.length,logo:logo(),version:APP_VERSION,category:current?.tool?.category||''});}
function footer(){return studioFooter(APP_VERSION);}

function recentMarkup(){return recentTools.length?`<section class="recent-tools" aria-label="เครื่องมือที่ใช้ล่าสุด"><div class="recent-heading"><span class="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>กลับไปทำต่อ</h2></div><div class="recent-links">${recentTools.map(id=>{const tool=catalog.find(t=>t.id===id);return `<a href="#tool/${id}"><span class="recent-icon">${icon(tool.kind==='calculator'?'calculator':'folder')}</span><span><small>${e(categories.find(c=>c.id===tool.category).label)}</small><strong>${e(tool.title)}</strong></span><span class="recent-arrow" aria-hidden="true">↗</span></a>`;}).join('')}</div></section>`:'';}

function renderHome(){
 if(!guardReviewSourceTransition())return;
 cleanup();current=null;saved=readSavedProjects();document.title='ENG APP — Engineering Studio';
 const records=saved.map(record=>{const resolved=effectiveProject(record);return {...resolved.project,fromDraft:resolved.fromDraft};});
 app.innerHTML=header()+`<main id="main" class="page-shell studio-main studio-home">${studioHomeLead(records,tools)}<section class="handover-home-entry" aria-labelledby="home-handover-title"><div class="handover-home-mark" aria-hidden="true">${icon('layers')}</div><div><span class="eyebrow">NEW / PROJECT REVIEW ROOM</span><h2 id="home-handover-title">เห็นประเด็นทั้งชุด แล้วเปิดแก้ได้ตรงงาน</h2><p>เลือกเอกสาร · ดูสิ่งที่ต้องทำต่อ · ทบทวนกับข้อมูลต้นทาง</p></div><div class="handover-home-actions"><a class="button primary" href="#review-room">เข้าห้องทบทวน ${icon('external')}</a><a class="button light" href="#handover">จัดชุดเอกสาร</a><button class="button light" data-action="handover-example">ลองชุดตัวอย่าง 6 เอกสาร</button></div></section>${recentMarkup()}<section id="tools" class="catalog-section" aria-label="ค้นหาเครื่องมือ"><div class="catalog-heading"><div><span class="eyebrow">ENGINEERING TOOLKIT</span><h2>เครื่องมือสำหรับทุกขั้นของงาน</h2></div><button class="button light compact ${filters.favorites?'selected':''}" data-action="favorites">${icon('star')} รายการโปรด <span>${favorites.length}</span></button></div><div class="search-bar"><label class="search-input">${icon('search')}<input id="tool-search" type="search" value="${e(filters.search)}" placeholder="ค้นหาเครื่องมือ เช่น BOQ กำแพงกันดิน แผนงาน..." aria-label="ค้นหาเครื่องมือ"><kbd>/</kbd></label><span class="search-hint">เลือกโจทย์ · ปรับข้อมูล · ตรวจผล</span></div><div class="category-list" role="group" aria-label="หมวดเครื่องมือ">${categories.map(c=>`<button class="category ${filters.category===c.id?'selected':''}" data-category="${c.id}" aria-pressed="${filters.category===c.id}">${icon(c.icon)}${c.label}${c.id==='all'?` <span>${catalog.length}</span>`:''}</button>`).join('')}</div><div id="catalog-results" aria-live="polite"></div></section><aside class="storage-note">${icon('folder')}<div><strong>พร้อมส่งต่องาน พร้อมกลับมาคิดใหม่</strong><span>บันทึกงานพร้อมข้อมูลเอกสาร ส่งออก JSON เพื่อย้ายเครื่อง และสร้างรายงานสำหรับตรวจทาน</span></div><button class="button light compact" data-action="projects">เปิดงานของฉัน</button></aside></main>`+footer();
 document.querySelector('#tool-search').addEventListener('input',event=>{filters.search=event.target.value;renderCatalog();});
 renderCatalog();
}
function renderCatalog(){
 const words=filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
 const entries=catalog.filter(t=>(filters.category==='all'||t.category===filters.category)&&(!filters.favorites||favorites.includes(t.id))&&words.every(w=>[t.title,t.en,t.description,...t.tags].join(' ').toLowerCase().includes(w)));
 const results=document.querySelector('#catalog-results');if(!results)return;
 results.innerHTML=`<div class="result-line"><span>พบ <strong>${entries.length}</strong> เครื่องมือ${filters.favorites?' ในรายการโปรด':''}</span><span>มีตัวอย่างให้ลองทุกเครื่องมือ</span></div>`+(entries.length?categories.filter(c=>c.id!=='all').map(c=>{const items=entries.filter(t=>t.category===c.id);return items.length?`<section class="tool-group"><div class="group-heading"><h3>${icon(c.icon)}${c.label}</h3><span>${items.length} เครื่องมือ</span><div></div></div><div class="tool-grid">${items.map(card).join('')}</div></section>`:'';}).join(''):`<div class="empty-state">${icon('search')}<h3>ยังไม่พบเครื่องมือที่ตรงกัน</h3><p>ลองคำว่า “คอนกรีต”, “BOQ” หรือเลือกหมวดทั้งหมด</p><button class="button primary" data-action="clear-filter">ล้างตัวกรอง</button></div>`);
}
function card(t){return `<article class="tool-card color-${t.color}"><a class="card-visual" href="#tool/${t.id}" tabindex="-1" aria-hidden="true">${sketch(t.art,t.title)}<span class="card-code">${t.en}</span></a><button class="favorite-button ${favorites.includes(t.id)?'is-favorite':''}" data-favorite="${t.id}" aria-label="${favorites.includes(t.id)?'นำออกจาก':'เพิ่มใน'}รายการโปรด ${e(t.title)}" aria-pressed="${favorites.includes(t.id)}">${icon('star')}</button><div class="card-body"><div class="card-badge">${t.badge?`<span>${e(t.badge)}</span>`:`<span class="simple-badge">${t.kind==='calculator'?'เครื่องมือคำนวณ':t.kind==='workflow'?'เครื่องมือทำงาน':'เครื่องมือเสริม'}</span>`}</div><h4><a href="#tool/${t.id}">${t.title}</a></h4><p>${t.description}</p><div class="card-tags">${t.tags.map(tag=>`<span>${e(tag)}</span>`).join('')}</div><a class="card-open" href="#tool/${t.id}">${icon(t.kind==='calculator'?'calculator':t.kind==='workflow'?'folder':'book')} เปิดใช้งาน</a><p class="card-scope">${t.scope}</p></div></article>`;}

function defaults(def){return Object.fromEntries(def.inputGroups.flatMap(g=>g.fields).map(x=>[x.key,x.default]));}
function normalizeInputs(def,source){const result=defaults(def);if(!source||typeof source!=='object'||Array.isArray(source))return result;for(const field of def.inputGroups.flatMap(g=>g.fields)){if(Object.hasOwn(source,field.key))result[field.key]=source[field.key];}return result;}

function renderTool(toolId,project=null,{reviewContext=null}={}){
 if(!guardReviewSourceTransition())return;
 cleanup();reviewSourceContext=reviewContext;const tool=catalog.find(t=>t.id===toolId);if(!tool){location.hash='';return;}
 const restored=resolveProjectForTool(toolId,{project,draft:readDraft(toolId,project?.id),saved});project=restored.project;
 const initial=project?.data || null;document.title=tool.title+' | ENG APP';recentTools=[toolId,...recentTools.filter(id=>id!==toolId)].slice(0,4);try{persistJSON(localStorage,KEYS.recent,recentTools);}catch{}
 current={tool,id:project?.id||null,name:project?.name||`${tool.title} — งานตัวอย่าง`,createdAt:project?.createdAt||new Date().toISOString(),updatedAt:project?.updatedAt||new Date().toISOString(),dirty:restored.fromDraft,baseSavedAt:project?.baseSavedAt||saved.find(p=>p.id===project?.id)?.updatedAt||null,resumedWriterId:restored.fromDraft?project?.writerId:null,resumedUpdatedAt:restored.fromDraft?project?.updatedAt:null};
 app.innerHTML=header('tool')+`<main id="main" class="workspace page-shell studio-main"><div class="breadcrumb"><a href="#">เครื่องมือทั้งหมด</a><span>/</span><span>${e(categories.find(c=>c.id===tool.category).label)}</span><span>/</span><strong>${tool.title}</strong></div><div class="workspace-title"><div><div class="eyebrow">${tool.en}</div><h1>${tool.title}</h1><p>${tool.description}</p></div><span class="scope-tag">${icon('info')}${tool.category==='design'?'ตรวจเบื้องต้นตามขอบเขต':tool.kind==='workflow'?'พื้นที่ทำงานของคุณ':'พร้อมเริ่มจากตัวอย่าง'}</span></div><div class="workspace-bar"><label class="project-name-label">ชื่อโครงการ / งาน<input id="project-name" maxlength="180" value="${e(current.name)}" aria-label="ชื่อโครงการ / งาน"></label><div class="workspace-buttons"><button class="button primary compact" data-action="save">${icon('save')} บันทึกงาน</button><button class="button light compact" data-action="export">${icon('download')} JSON</button><button class="button light compact" data-action="duplicate">${icon('file')} ทำสำเนา</button><button class="button light compact" data-action="print">${icon('print')} พิมพ์ / PDF</button><button class="icon-button" data-action="reset" title="เริ่มจากตัวอย่างใหม่" aria-label="เริ่มจากตัวอย่างใหม่">${icon('reset')}</button></div></div><div class="workspace-meta"><span id="save-status">${project?.id?'เปิดจากงานที่บันทึกไว้':'งานตัวอย่าง · ปรับค่าได้'}</span><span>${tool.scope}</span></div><div id="document-summary"></div><div id="document-editor-host"></div><div id="tool-workspace"></div></main>`+footer();
 const host=document.querySelector('#tool-workspace');
 const documentHost=document.querySelector('#document-editor-host');
 let documentInfo=normalizeDocument(initial?._document),reviewInvalidated=false;
 documentHost.innerHTML=documentEditorMarkup(documentInfo);
 const refreshDocumentSummary=()=>{
  document.querySelector('#document-summary').innerHTML=documentSummaryMarkup(documentInfo)+(reviewInvalidated?'<p class="document-reset-note">ข้อมูลเปลี่ยนหลังการตรวจทาน จึงล้างเครื่องหมายเดิมเพื่อให้ตรวจรอบใหม่</p>':'');
  const review=documentReviewState(documentInfo),status=documentHost.querySelector('.document-editor-status');
  if(status)status.innerHTML=`${e(documentInfo.revision)} <span aria-hidden="true">/</span> ระบุการตรวจแล้ว ${review.completed}/${review.total}<span class="document-chevron" aria-hidden="true">⌄</span>`;
 };
 refreshDocumentSummary();
 try {
  if(tool.kind==='calculator')mounted=mountCalculator(host,tools[toolId],initial,{getDocument:()=>normalizeDocument(documentInfo)});
  else if(tool.kind==='workflow')mounted=mountWorkflow(host,toolId,initial,{onChange,notify});
  else mounted=mountSpecial(host,toolId,initial,{onChange,notify});
  const inner=mounted;
  const invalidateReview=()=>{
   if(!documentReviewState(documentInfo).completed)return;
   documentInfo=invalidateDocumentReview(documentInfo);reviewInvalidated=true;
   documentHost.querySelectorAll('[data-document-review]').forEach(el=>{el.checked=false;});
   refreshDocumentSummary();
  };
  if(inner.importAdjusted)invalidateReview();
  const metadataHandler=event=>{
   if(!event.target.matches('[data-document-field],[data-document-review],[data-document-review-note]'))return;
   documentInfo=readDocumentEditor(documentHost);
   if(event.target.matches('[data-document-review]'))reviewInvalidated=false;
   if(event.target.matches('[data-document-field]'))invalidateReview();
   refreshDocumentSummary();onChange({documentOnly:true});
  };
  documentHost.addEventListener('input',metadataHandler);
  mounted={...inner,getState:()=>({...inner.getState(),_document:normalizeDocument(documentInfo)}),getDocument:()=>normalizeDocument(documentInfo),invalidateReview,destroy:()=>{documentHost.removeEventListener('input',metadataHandler);inner.destroy?.();}};
  if(inner.importAdjusted)onChange({documentOnly:true});
 }
 catch(error){host.innerHTML=`<div class="error-banner" role="alert">เปิดข้อมูลนี้ไม่ได้: ${e(error.message)}<button class="button light" data-action="reset">เริ่มจากตัวอย่างใหม่</button></div>`;mounted=null;}
 document.querySelector('#project-name').addEventListener('input',onChange);
 if(restored.fromDraft)document.querySelector('#save-status').textContent='กู้คืนสำรองชั่วคราวแล้ว · กดบันทึกงานเมื่อพร้อม';
 window.scrollTo(0,0);
 if(reviewContext){mountReviewSourceContext(reviewContext);focusReviewSourceTarget(reviewContext.target);}
}
function assumptionsMarkup(def){
 return `<section class="assumptions studio-model-basis"><div class="studio-basis-heading"><span class="eyebrow">MODEL BASIS</span><h3>สมมติฐานและขอบเขตการใช้</h3></div><ul>${def.assumptions.map(x=>`<li>${e(x)}</li>`).join('')}</ul>${def.references?.length?`<div class="references"><strong>เอกสารประกอบวิธีคำนวณ</strong>${def.references.map(ref=>`<a href="${e(ref.url)}" target="_blank" rel="noopener">${e(ref.label)} ${icon('external')}</a>`).join('')}</div>`:''}</section>`;
}
function calculationStepsMarkup(result,report=false){
 return `<${report?'section':'details'} class="calculation-steps" ${report?'':'open'}>${report?'<h3>ที่มาของผลลัพธ์และวิธีคำนวณ</h3>':`<summary>${icon('book')} ที่มาของผลลัพธ์และวิธีคำนวณ</summary>`}<div class="steps-content">${result.steps.map((step,i)=>`<div class="formula-step"><span class="step-index">${String(i+1).padStart(2,'0')}</span><div><h4>${e(step.title)}</h4><code>${e(step.formula)}</code>${step.substitution?`<p class="substitution">${e(step.substitution)}</p>`:''}<strong>${e(step.result)}</strong></div></div>`).join('')}</div></${report?'section':'details'}>`;
}
function mountCalculator(host,def,initial,{getDocument=()=>normalizeDocument()}={}){
 let input=normalizeInputs(def,initial),result=null,error=null,sensitivity=null,optionsDesk=null,reviewRegister=null,revisions=null,reviewDesk=null;
 let baseline=restoreBaseline(def,initial?._comparison);
 const fields=def.inputGroups.flatMap(group=>group.fields);
 const views=[['overview','ผลคำนวณ','chart'],['compare','ทางเลือกของแบบ','layers'],['sensitivity','ศึกษาความไว','ruler'],['review','ตรวจทาน','file'],['methods','วิธีคำนวณ','book']];
 host.innerHTML=`<div class="calc-grid"><div class="input-panel"><div class="panel-title"><h2>${icon('ruler')} ข้อมูลที่ใช้คำนวณ</h2><span>INPUTS / SI</span></div><form id="calc-form" novalidate>${def.inputGroups.map((group,groupIndex)=>`<fieldset><legend><span class="input-group-number">${String(groupIndex+1).padStart(2,'0')}</span>${e(group.title)}</legend><div class="field-grid">${group.fields.map(field=>`<label class="field"><span>${e(field.label)}</span>${field.type==='select'?`<select data-field="${e(field.key)}" aria-label="${e(field.label)}">${field.options.map(option=>`<option value="${e(option.value)}" ${input[field.key]===option.value?'selected':''}>${e(option.label)}</option>`).join('')}</select>`:`<div class="number-input"><input type="number" data-field="${e(field.key)}" value="${e(typeof input[field.key]==='number'?input[field.key]:'')}" min="${e(field.min??'')}" max="${e(field.max??'')}" step="${e(field.step??'any')}" inputmode="decimal" required aria-label="${e(field.label)}"><span>${e(field.unit||'')}</span></div>`}</label>`).join('')}</div></fieldset>`).join('')}<div class="form-tip">${icon('info')} ปรับข้อมูลเพื่อคำนวณสด · Ctrl / ⌘ + S บันทึกงาน</div><button type="button" class="button light mobile-result-jump" data-action="view-results">ดูผลการคำนวณ ↓</button></form></div><div class="result-panel"><div class="workspace-subnav" role="tablist" aria-label="มุมมองการวิเคราะห์">${views.map(([id,label,art],i)=>`<button type="button" role="tab" id="calc-tab-${id}" data-calc-tab="${id}" aria-selected="${i===0}" aria-controls="calc-view-${id}" tabindex="${i===0?0:-1}">${icon(art)}<span>${label}</span></button>`).join('')}</div><div class="workspace-view" id="calc-view-overview" role="tabpanel" aria-labelledby="calc-tab-overview"><div id="calc-result" aria-live="polite"></div></div><div class="workspace-view" id="calc-view-compare" role="tabpanel" aria-labelledby="calc-tab-compare" hidden><div class="comparison-view-tools"><span>DESIGN REVIEW / OPTIONS</span><button type="button" class="button light compact" data-comparison-expand aria-pressed="false">${icon('external')} ขยายพื้นที่เปรียบเทียบ</button></div><div id="calc-options"></div><details class="baseline-details"><summary>เปรียบเทียบค่าฐาน A กับค่าปัจจุบัน</summary><div id="calc-comparison"></div></details></div><div class="workspace-view" id="calc-view-sensitivity" role="tabpanel" aria-labelledby="calc-tab-sensitivity" hidden><div id="calc-sensitivity"></div></div><div class="workspace-view" id="calc-view-methods" role="tabpanel" aria-labelledby="calc-tab-methods" hidden><div id="calc-methods"></div></div></div></div>`;
 const form=host.querySelector('form'),resultEl=host.querySelector('#calc-result'),comparisonEl=host.querySelector('#calc-comparison'),methodsEl=host.querySelector('#calc-methods');
 const reviewView=document.createElement('div');reviewView.className='workspace-view';reviewView.id='calc-view-review';reviewView.setAttribute('role','tabpanel');reviewView.setAttribute('aria-labelledby','calc-tab-review');reviewView.hidden=true;reviewView.innerHTML=reviewWorkspaceMarkup();host.querySelector('#calc-view-methods').before(reviewView);
 const reviewBadge=document.createElement('span');reviewBadge.className='review-tab-count';reviewBadge.hidden=true;host.querySelector('#calc-tab-review').append(reviewBadge);
 reviewDesk=mountReviewWorkspace(reviewView);
 function refreshContext(){
  reviewRegister?.refresh();revisions?.refresh();
  const summary=reviewRegister?.getSummary();
  reviewDesk?.refresh(summary,revisions?.getSummary());
  reviewBadge.textContent=String(summary?.outstanding||0);reviewBadge.hidden=!summary?.outstanding;
  reviewBadge.setAttribute('aria-label','ประเด็นค้าง '+(summary?.outstanding||0)+' รายการ');
 }
 function showView(id,{focus=false}={}){
  if(!views.some(view=>view[0]===id))return;
  if(id!=='compare'){host.querySelector('.calc-grid').classList.remove('comparison-expanded');const expand=host.querySelector('[data-comparison-expand]');expand.setAttribute('aria-pressed','false');expand.innerHTML=icon('external')+' ขยายพื้นที่เปรียบเทียบ';}
  host.querySelector('.calc-grid').classList.toggle('review-focused',id==='review');
  host.querySelectorAll('.workspace-subnav [data-calc-tab]').forEach(button=>{const active=button.dataset.calcTab===id;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;if(active&&focus)button.focus();});
  host.querySelectorAll('.result-panel > .workspace-view').forEach(panel=>{panel.hidden=panel.id!=='calc-view-'+id;});
 }
 function update(){
  for(const el of form.querySelectorAll('[data-field]')){
   const field=fields.find(field=>field.key===el.dataset.field),value=input[field.key];
   const invalid=field.type==='select'?!field.options.some(option=>option.value===value):typeof value!=='number'||!Number.isFinite(value)||value<(field.min??-Infinity)||value>(field.max??Infinity)||(field.step===1&&!Number.isInteger(value));
   el.setAttribute('aria-invalid',String(invalid));el.closest('.field').classList.toggle('has-error',invalid);
  }
  try{result=def.calculate(input);error=null;resultEl.innerHTML=calculationOverview(result)+resultMarkup(result,def,input);}
  catch(err){result=null;error=err.message;resultEl.innerHTML=`<div class="error-banner" role="alert">${icon('info')}<div><h3>ตรวจข้อมูลก่อนคำนวณ</h3><p>${e(error)}</p><span>ยังไม่แสดงผลจนกว่าข้อมูลจะครบและอยู่ในขอบเขต</span></div></div>`;}
  comparisonEl.innerHTML=comparisonMarkup(def,baseline,input,{valid:!error});
  methodsEl.innerHTML=assumptionsMarkup(def)+(result?calculationStepsMarkup(result,true):'<p class="studio-method-error">แก้ข้อมูลให้ถูกต้องเพื่อดูการแทนค่าและผลลัพธ์ของแต่ละขั้น</p>');
  sensitivity?.refresh();
  optionsDesk?.refresh();
  refreshContext();
 }
 const handler=event=>{const el=event.target;if(!el.matches('[data-field]'))return;input[el.dataset.field]=el.tagName==='SELECT'?el.value:el.value.trim()===''?null:Number(el.value);update();onChange();};
 const changeHandler=event=>{if(event.target.tagName==='SELECT')handler(event);};
 const submitHandler=event=>event.preventDefault();
 const compareHandler=event=>{
  const button=event.target.closest('[data-compare]');if(!button)return;
  try{
   if(button.dataset.compare==='capture'){
    if(error)throw new Error(error);
    baseline=captureBaseline(def,input,document.querySelector('#project-name').value||def.title);
    notify('เก็บค่า A แล้ว ลองปรับข้อมูลเพื่อเปรียบเทียบผลต่าง');
   }else if(button.dataset.compare==='restore'&&baseline){
    input={...baseline.inputs};
    for(const el of form.querySelectorAll('[data-field]'))el.value=input[el.dataset.field]??'';
    notify('คืนข้อมูลตามค่า A แล้ว');
   }else if(button.dataset.compare==='clear'){baseline=null;notify('ล้างค่า A แล้ว ข้อมูลปัจจุบันยังอยู่');}
   const action=button.dataset.compare;update();onChange();
   comparisonEl.querySelector('[data-compare="'+(action==='clear'?'capture':action)+'"]')?.focus({preventScroll:true});
  }catch(err){notify(err.message);}
 };
 const tabHandler=event=>{
  const expand=event.target.closest('[data-comparison-expand]');
  if(expand){const expanded=host.querySelector('.calc-grid').classList.toggle('comparison-expanded');expand.setAttribute('aria-pressed',String(expanded));expand.innerHTML=icon(expanded?'ruler':'external')+(expanded?' แสดงข้อมูลเข้า':' ขยายพื้นที่เปรียบเทียบ');return;}
  const button=event.target.closest('[data-calc-tab]');if(button)showView(button.dataset.calcTab,{focus:!button.matches('[role="tab"]')});
 };
 const tabKeyHandler=event=>{
  if(!event.target.matches('.workspace-subnav [data-calc-tab]'))return;
  const index=views.findIndex(view=>view[0]===event.target.dataset.calcTab);
  const next=event.key==='ArrowRight'?(index+1)%views.length:event.key==='ArrowLeft'?(index+views.length-1)%views.length:event.key==='Home'?0:event.key==='End'?views.length-1:-1;
  if(next>=0){event.preventDefault();showView(views[next][0],{focus:true});}
 };
 form.addEventListener('input',handler);form.addEventListener('change',changeHandler);form.addEventListener('submit',submitHandler);comparisonEl.addEventListener('click',compareHandler);host.addEventListener('click',tabHandler);host.addEventListener('keydown',tabKeyHandler);update();
 sensitivity=mountSensitivity(host.querySelector('#calc-sensitivity'),def,{getInputs:()=>input,onApply:({fieldKey,value})=>{input[fieldKey]=value;const field=form.querySelector('[data-field="'+fieldKey+'"]');if(field)field.value=value;update();onChange();},notify,initialSettings:initial?._sensitivity,onStudyChange:()=>onChange()});
 optionsDesk=mountDesignOptions(host.querySelector('#calc-options'),def,{getInputs:()=>input,onApply:({inputs,label})=>{input={...inputs};for(const field of form.querySelectorAll('[data-field]'))field.value=input[field.dataset.field]??'';update();onChange();notify('นำข้อมูลจาก “'+label+'” มาใช้แล้ว');},onChange,notify,initialState:initial?._options});
 reviewRegister=mountReviewRegister(host.querySelector('#calc-review-register'),def,{getInputs:()=>input,getDocument,initialState:initial?._review,onChange:()=>onChange(),onDraftChange:()=>onChange({documentOnly:true}),notify});
 revisions=mountRevisions(host.querySelector('#calc-revisions'),def,{getInputs:()=>input,getDocument,initialState:initial?._revisions,onChange:()=>onChange({documentOnly:true}),notify});
 refreshContext();
 if(reviewRegister.getSummary().pendingDraft)showView('review');
 else if(revisions.getSummary().hasDraftNote){showView('review');reviewDesk.show('revisions');}
 if(initial?._comparison&&!baseline)notify('ค่า A ในไฟล์เดิมไม่ตรงกับขอบเขตรุ่นนี้ กรุณาบันทึกค่า A ใหม่');
 return {
  importAdjusted:optionsDesk.importAdjusted||reviewRegister.importAdjusted||revisions.importAdjusted,
  getState:()=>({...input,...(baseline?{_comparison:baseline}:{}),_sensitivity:sensitivity.getSettings(),_options:optionsDesk.getState(),_review:reviewRegister.getState(),_revisions:revisions.getState()}),
  refreshContext,
  getReviewSummary:()=>reviewRegister.getSummary(),
  getRevisionSummary:()=>revisions.getSummary(),
  getAssessment:()=>result?{pass:(result.checks||[]).filter(c=>c.pass===true).length,fail:(result.checks||[]).filter(c=>c.pass===false).length,unassessed:(result.checks||[]).filter(c=>c.pass!==true&&c.pass!==false).length}:null,
  showResults:()=>{showView('overview');host.querySelector('.workspace-subnav').scrollIntoView({behavior:'smooth',block:'start'});},
  showReviewTarget:target=>{
   if(target.section==='review'){
    showView('review');reviewDesk.show('register');
    if(target.pending)return reviewRegister.revealPending();
    if(target.itemId)return reviewRegister.revealItem(target.itemId);
    const heading=host.querySelector('#calc-review-register h2');if(heading){heading.tabIndex=-1;heading.focus();heading.scrollIntoView({block:'center'});}return true;
   }
   if(target.section==='revisions'){
    showView('review');reviewDesk.show('revisions');
    const field=host.querySelector('#calc-revisions textarea')||host.querySelector('#calc-revisions h2');if(field){field.tabIndex=field.tabIndex<0?-1:field.tabIndex;field.focus();field.scrollIntoView({block:'center'});}return true;
   }
   showView('overview');const region=host.querySelector('#calc-result');if(region){region.tabIndex=-1;region.focus();region.scrollIntoView({block:'start'});}return true;
  },
  getReport:()=>{
   if(error)throw new Error(error);
   return `<h2>${e(def.title)}</h2><table><thead><tr><th>ข้อมูลเข้า</th><th>ค่า</th><th>หน่วย</th></tr></thead><tbody>${fields.map(field=>`<tr><td>${e(field.label)}</td><td>${e(field.type==='select'?(field.options.find(option=>option.value===input[field.key])?.label||String(input[field.key])):f(input[field.key],5))}</td><td>${e(field.unit||'')}</td></tr>`).join('')}</tbody></table>${resultMarkup(result,def,input,true)}${comparisonMarkup(def,baseline,input,{report:true})}${optionsDesk.getReport()}${sensitivity.getReport()}${reviewRegister.getReport()}${revisions.getReport()}<h3>สมมติฐาน</h3><ul>${def.assumptions.map(x=>`<li>${e(x)}</li>`).join('')}</ul><h3>เอกสารอ้างอิง</h3>${(def.references||[]).map(ref=>`<p>${e(ref.label)}<br>${e(ref.url)}</p>`).join('')}`;
  },
  destroy:()=>{sensitivity?.destroy();optionsDesk?.destroy();reviewRegister?.destroy();revisions?.destroy();reviewDesk?.destroy();form.removeEventListener('input',handler);form.removeEventListener('change',changeHandler);form.removeEventListener('submit',submitHandler);comparisonEl.removeEventListener('click',compareHandler);host.removeEventListener('click',tabHandler);host.removeEventListener('keydown',tabKeyHandler);}
 };
}
function resultMarkup(result,def,input,report=false){
 return `<div class="result-heading"><h2>ผลการคำนวณ</h2><span class="calculation-label">${icon('calculator')} คำนวณจากข้อมูลที่กรอก</span></div><div class="summary-grid">${result.summary.map(item=>`<div class="metric ${item.tone||'neutral'}"><span>${e(item.label)}</span><strong>${item.value===null?'ไม่ประเมิน':e(f(item.value,item.digits??2))}</strong><small>${e(item.unit||'')}</small></div>`).join('')}</div><div class="calculation-figure"><div class="figure-label">${e(def.id==='retaining-wall'?'หน้าตัดกำแพงและระดับน้ำ':def.id==='footing'?'การสัมผัสดินใต้ฐานราก':'ภาพร่างประกอบการคำนวณ')}<small>ภาพสื่อสารแนวคิด</small></div>${calculationFigure(def.id,input,result.values)}<span class="figure-caption">${e(figureCaption(def.id,input))}</span></div>${result.checks?.length?`<div class="check-panel"><h3>รายการที่ตรวจในแบบจำลอง</h3>${result.checks.map(check=>`<div class="check-row ${check.pass===true?'pass':check.pass===false?'fail':'unassessed'}"><span class="check-icon">${icon(check.pass===true?'check':'info')}</span><div><strong>${e(check.label)}</strong><p>${e(check.detail)}</p></div><span class="check-status">${check.pass===true?'ผ่าน':check.pass===false?'ไม่ผ่าน':'ไม่ประเมิน'}</span></div>`).join('')}</div>`:''}${result.table?`<div class="result-table table-scroll"><table><thead><tr>${result.table.headers.map(x=>`<th>${e(x)}</th>`).join('')}</tr></thead><tbody>${result.table.rows.map(row=>`<tr>${row.map(x=>`<td>${e(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:''}${report?calculationStepsMarkup(result,true):''}${result.notes?.length?`<aside class="result-notes">${icon('info')}<div>${result.notes.map(x=>`<p>${e(x)}</p>`).join('')}</div></aside>`:''}`;
}
function figureCaption(id,p){return engineeringFigureCaption(id,p);}
function calculationFigure(id,p,v){return engineeringFigure(id,p,v,catalog.find(t=>t.id===id)?.art||'beam');}

function saveProject(){
 if(!current||!mounted)return;
 const name=document.querySelector('#project-name').value.trim();
 if(!name){notify('กรุณาตั้งชื่องานก่อนบันทึก');return;}
 clearTimeout(draftTimer);saved=readSavedProjects();
 const identity=saved.find(p=>p.id===current.id&&p.toolId===current.tool.id);
 const conflict=identity&&current.baseSavedAt&&identity.updatedAt!==current.baseSavedAt;
 const record={schemaVersion:1,id:conflict?uniqueId():identity?.id||uniqueId(),toolId:current.tool.id,name:(name+(conflict?' — สำเนาจากอีกแท็บ':'')).slice(0,180),createdAt:conflict?new Date().toISOString():current.createdAt,updatedAt:new Date().toISOString(),data:mounted.getState()};
 const next=[record,...saved.filter(p=>p.id!==record.id)];
 if(!write(KEYS.projects,next)){current.dirty=true;document.querySelector('#save-status').textContent='ยังบันทึกงานไม่ได้ · กรุณาส่งออก JSON เก็บข้อมูล';return;}
 saved=next;
 let cleared=false;try{const ownedCleared=!conflict||removeOwnedDraft(localStorage,current.tool.id,current.id,{writerId:SESSION_WRITER_ID,resumedWriterId:current.resumedWriterId,resumedUpdatedAt:current.resumedUpdatedAt});cleared=finalizeSavedDraft(localStorage,record,conflict?record.id:current.id)&&ownedCleared;}catch{}
 current.id=record.id;current.name=record.name;current.createdAt=record.createdAt;current.updatedAt=record.updatedAt;current.baseSavedAt=record.updatedAt;current.resumedWriterId=null;current.resumedUpdatedAt=null;current.dirty=false;
 if(reviewSourceContext&&record.id!==reviewSourceContext.sourceId){
  reviewSourceContext={...reviewSourceContext,originalSourceId:reviewSourceContext.originalSourceId||reviewSourceContext.sourceId,sourceId:record.id,findingId:'',target:{section:'source'}};
  history.replaceState(null,'',reviewSourceHash(record.id,{section:'source'}));
  const feedback=document.querySelector('[data-review-return-feedback]');if(feedback){feedback.hidden=false;feedback.textContent='บันทึกเป็นสำเนางานใหม่แล้ว ชุดส่งตรวจยังอ้างอิงงานเดิม กรุณาตรวจการเลือกเอกสารก่อนส่งต่อ';}
 }
 document.querySelector('#project-name').value=record.name;
 document.querySelector('#save-status').textContent='บันทึกงานแล้ว · '+new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})+(cleared?'':' · ล้างร่างเก่าไม่ได้');
 notify(conflict?'งานเดิมถูกแก้ไขจากอีกแท็บ จึงเก็บการแก้ไขนี้เป็นสำเนาใหม่':cleared?'บันทึกงานแล้ว เปิดต่อได้จาก “งานของฉัน”':'บันทึกงานแล้ว แต่ล้างร่างเก่าไม่ได้ กรุณาสำรอง JSON');
 document.querySelectorAll('.nav-count').forEach(count=>{count.textContent=saved.length;});
}
function effectiveProject(record){return resolveProjectForTool(record.toolId,{project:record,draft:readDraft(record.toolId,record.id),saved});}

function handoverRecords(){
 saved=readSavedProjects();
 return saved.map(record=>{const resolved=effectiveProject(record);return {...resolved.project,fromDraft:resolved.fromDraft};});
}
function saveHandoverState(value){
 handoverState=normalizeHandoverState(value);
 const saved=write(KEYS.handover,handoverState);handoverUnsaved=!saved;return saved;
}
function rememberHandoverState(value){
 previousHandoverState=normalizeHandoverState(value);
 try{return persistJSON(localStorage,KEYS.handoverPrevious,previousHandoverState);}catch{return false;}
}
function restoreHandoverDraft(){
 if(!previousHandoverState)return;
 const target=previousHandoverState,previous=handoverDesk?.getState()||handoverState;
 if(!saveHandoverState(target))return;
 rememberHandoverState(previous);renderHandover();notify('คืนข้อมูลชุดที่สำรองไว้แล้ว งานต้นทางทั้งหมดคงอยู่');
}
function currentHandover(){
 const records=handoverRecords();
 const state=normalizeHandoverState(handoverDesk?.getState()||handoverState);
 return {records,state,model:buildHandover(records,tools,state)};
}
function openHandoverRecord(id){
 saved=readSavedProjects();
 const record=saved.find(item=>item.id===id);
 if(!record){handoverDesk?.refresh(handoverRecords());refreshHandoverHistory();notify('ไม่พบงานนี้แล้ว กรุณาตรวจสมาชิกของชุดส่งตรวจ');return;}
 history.replaceState(null,'',`#tool/${record.toolId}`);renderTool(record.toolId,record);
}
function renderHandover(){
 if(!guardReviewSourceTransition())return;
 cleanup();current=null;document.title='ชุดส่งตรวจโครงการ | ENG APP';
 const records=handoverRecords();
 app.innerHTML=header('handover')+`<main id="main" class="page-shell studio-main handover-page">${previousHandoverState?'<aside class="storage-note handover-restore-note">'+icon('folder')+'<div><strong>กลับไปจัดชุดก่อนหน้าได้</strong><span>คืนชื่อชุด ข้อความ และลำดับที่เลือก โดยงานที่นำเข้ายังคงอยู่</span></div><button type="button" class="button light compact" data-action="restore-handover">คืนชุดที่สำรองไว้</button></aside>':''}<div id="handover-workspace"></div></main>`+footer();
 handoverDesk=mountHandover(document.querySelector('#handover-workspace'),{
  records,definitions:tools,initialState:handoverState,onChange:saveHandoverState,
  onOpen:openHandoverRecord,onExportJSON:exportHandover,onExportCSV:exportHandoverCSV,
  onReport:printHandover,onImport:importProject,onExample:previewHandoverExample,notify
 });
 window.scrollTo(0,0);
}
function addToHandover(id){
 if(!readSavedProjects().some(record=>record.id===id)){notify('ไม่พบงานที่เลือก');return;}
 const state=normalizeHandoverState(handoverDesk?.getState()||handoverState);
 if(!state.selectedIds.includes(id)){
  if(state.selectedIds.length>=MAX_HANDOVER_RECORDS){notify(`หนึ่งชุดเลือกได้ไม่เกิน ${MAX_HANDOVER_RECORDS} เอกสาร`);return;}
  state.selectedIds.push(id);
 }
 saveHandoverState(state);history.replaceState(null,'','#handover');renderHandover();
}
function exportHandover(){
 try{
  const {records,state}=currentHandover();
  const bundle=createProjectBundle(records,state,{appVersion:APP_VERSION});
  download(`engapp-handover-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(bundle,null,2),'application/json');
  notify(`ส่งออกชุดงาน ${bundle.records.length} เอกสาร พร้อมข้อมูลและร่างล่าสุดแล้ว`);
 }catch(error){notify('ส่งออกชุดงานไม่ได้: '+error.message);}
}
function exportHandoverCSV(){
 try{
  const {model}=currentHandover();
  if(!model.entries.length)throw new Error('เลือกเอกสารก่อนส่งออกทะเบียน');
  download(`engapp-register-${new Date().toISOString().slice(0,10)}.csv`,handoverCSV(model),'text/csv;charset=utf-8');
  notify('ส่งออกทะเบียนชุดส่งตรวจ CSV แล้ว');
 }catch(error){notify('ส่งออกทะเบียนไม่ได้: '+error.message);}
}
function printHandover(){
 try{
  const {model}=currentHandover();
  if(!model.entries.length)throw new Error('เลือกเอกสารก่อนสร้างสรุปชุดส่งตรวจ');
  openReport(handoverReportMarkup(model),model.metadata.title||'ชุดส่งตรวจโครงการ','handover');
 }catch(error){notify('สร้างสรุปชุดส่งตรวจไม่ได้: '+error.message);}
}
function saveHistoryPreferences(){
 return write(KEYS.handoverHistoryPreferences,{schemaVersion:1,selectedId:historySelectedId,draft:{...historyDraft}});
}
function currentHistorySource(){
 if(!handoverUnsaved&&!handoverDesk)handoverState=normalizeHandoverState(read(KEYS.handover,handoverState));
 return currentHandover();
}
function saveReviewRoomPreferences(value){
 reviewRoomState=value;
 return write(KEYS.reviewRoomPreferences,value);
}
function currentReviewRoomModel(){
 const source=currentHistorySource();
 return buildReviewRoom(source.records,tools,source.state,{appVersion:APP_VERSION});
}
function reviewRoomExportFilters(value=reviewRoom?.getState()||reviewRoomState){
 return normalizeReviewRoomFilters({...value?.filters,groupBy:value?.groupBy||value?.filters?.groupBy});
}
function preserveReviewSource(){
 clearTimeout(draftTimer);
 const ok=preserveReviewSourceDraft(Boolean(current&&mounted&&current.dirty),()=>saveDraft({showStatus:false}));
 if(!ok){
  const message='ยังเก็บร่างล่าสุดไม่ได้ จึงคงหน้านี้ไว้ กรุณาดาวน์โหลด JSON สำรอง แล้วลองกลับห้องทบทวนอีกครั้ง';
  const feedback=document.querySelector('[data-review-return-feedback]');if(feedback){feedback.hidden=false;feedback.textContent=message;}
  const badge=document.querySelector('#save-status');if(badge)badge.textContent='ยังเก็บร่างไม่ได้ · ส่งออก JSON ก่อนออกจากงาน';
  notify(message);
 }
 return ok;
}
function guardReviewSourceTransition(){
 if(!reviewSourceContext||!current?.dirty)return true;
 if(preserveReviewSource())return true;
 history.replaceState(null,'',reviewSourceHash(reviewSourceContext.sourceId,reviewSourceContext.target,reviewSourceContext.findingId));
 return false;
}
function renderReviewRoom({notice='',sourcePreserved=false}={}){
 if(current&&mounted&&current.dirty&&!sourcePreserved&&!preserveReviewSource()){
  history.replaceState(null,'',reviewSourceContext?reviewSourceHash(reviewSourceContext.sourceId,reviewSourceContext.target,reviewSourceContext.findingId):'#tool/'+current.tool.id);return;
 }
 cleanup({save:false});current=null;document.title='ห้องทบทวนโครงการ | ENG APP';
 app.innerHTML=header('review-room')+'<main id="main" class="page-shell studio-main review-room-page"><div id="review-room-workspace"></div></main>'+footer();
 try{
  reviewRoom=mountReviewRoom(document.querySelector('#review-room-workspace'),{
   model:currentReviewRoomModel(),initialState:reviewRoomState,notice,onStateChange:saveReviewRoomPreferences,
   onOpen:openReviewFinding,onReport:printReviewRoom,onExportCSV:exportReviewRoomCSV,
   onRefresh:()=>refreshReviewRoom('อ่านข้อมูลต้นทางล่าสุดแล้ว'),notify
  });
  reviewRoomState=reviewRoom.getState();
 }catch(error){document.querySelector('#review-room-workspace').innerHTML=`<div class="error-banner" role="alert"><div><h1>ยังเปิดห้องทบทวนไม่ได้</h1><p>${e(error.message)}</p><a class="button light" href="#handover">ตรวจชุดเอกสารที่เลือก</a></div></div>`;}
 window.scrollTo(0,0);
}
function refreshReviewRoom(notice=''){
 if(!reviewRoom)return;
 try{reviewRoom.refresh({model:currentReviewRoomModel(),notice});}
 catch(error){reviewRoom.refresh({notice:'อ่านข้อมูลปัจจุบันไม่ได้: '+error.message});notify('อ่านข้อมูลห้องทบทวนไม่ได้ กรุณาตรวจชุดเอกสารต้นทาง');}
}
function openReviewFinding(finding){
 try{
  const model=currentReviewRoomModel(),latest=model.findings.find(item=>item.id===finding?.id);
  if(!latest){refreshReviewRoom('รายการนี้เปลี่ยนไปแล้ว กรุณาเลือกจากข้อมูลล่าสุด');return;}
  if(latest.target.section==='source'&&model.documents.find(item=>item.id===latest.documentId)?.missing){location.hash='handover';return;}
  saved=readSavedProjects();resolveReviewSource(saved,latest.documentId);
  reviewRoomState=reviewRoom?.getState()||reviewRoomState;saveReviewRoomPreferences(reviewRoomState);
  const hash=reviewSourceHash(latest.documentId,latest.target,latest.id);
  history.replaceState(null,'',hash);renderReviewSource(parseReviewSourceHash(hash));
 }catch(error){refreshReviewRoom(error.message);notify(error.message);}
}
function renderReviewSource(context){
 try{
  saved=readSavedProjects();const record=resolveReviewSource(saved,context.sourceId);
  const model=currentReviewRoomModel(),finding=model.findings.find(item=>item.id===context.findingId&&item.documentId===context.sourceId);
  const currentContext={...context,packageTitle:model.metadata.title,findingTitle:finding?.title||'ตรวจข้อมูลต้นทางของเอกสาร',currentFinding:Boolean(finding)};
  renderTool(record.toolId,record,{reviewContext:currentContext});
 }catch(error){history.replaceState(null,'','#review-room');renderReviewRoom({notice:error.message});}
}
function mountReviewSourceContext(context){
 const main=document.querySelector('#main');if(!main)return;
 const aside=document.createElement('aside');aside.className='review-source-context';aside.setAttribute('aria-label','งานต้นทางจากห้องทบทวน');
 aside.innerHTML=`<div><span class="eyebrow">PROJECT REVIEW / SOURCE DOCUMENT</span><strong>${e(context.findingTitle)}</strong><p>${e(context.packageTitle)} · กลับเพื่ออ่านผลล่าสุดหลังแก้ข้อมูล</p></div><button type="button" class="button primary compact" data-action="return-review-room">${icon('back')} กลับห้องทบทวน</button><p data-review-return-feedback role="status" ${context.currentFinding?'hidden':''}>${context.currentFinding?'':'รายการเดิมไม่อยู่ในคิวปัจจุบันแล้ว งานต้นทางยังเปิดตรวจได้'}</p>`;
 main.prepend(aside);
}
function focusReviewSourceTarget(target){
 if(target.section==='document'){
  const editor=document.querySelector('.document-editor');if(editor)editor.open=true;
  const field=editor?.querySelector('[data-document-field]');if(field){field.focus();field.scrollIntoView({block:'center'});}return;
 }
 if(mounted?.showReviewTarget){const found=mounted.showReviewTarget(target);if(found===false)notify('รายการที่ขอเปิดเปลี่ยนไปแล้ว กรุณาตรวจรายการในงานนี้');return;}
 const host=document.querySelector('#tool-workspace');if(host){host.tabIndex=-1;host.focus();host.scrollIntoView({block:'start'});}
}
function returnReviewRoom(){
 if(!preserveReviewSource())return;
 const notice=reviewSourceContext?.originalSourceId||reviewSourceContext&&current?.id!==reviewSourceContext.sourceId?'บันทึกเป็นงานอีกฉบับแล้ว ชุดยังอ้างอิงต้นทางเดิม กรุณาตรวจสมาชิกชุดก่อนส่งต่อ':'อ่านข้อมูลต้นทางหลังกลับจากงานแล้ว';
 history.replaceState(null,'','#review-room');renderReviewRoom({notice,sourcePreserved:true});
}
function exportReviewRoomCSV(value){
 try{
  const model=currentReviewRoomModel();if(!model.documents.length)throw new Error('เลือกเอกสารในชุดก่อนส่งออกรายการ');
  download(`engapp-review-agenda-${new Date().toISOString().slice(0,10)}.csv`,reviewRoomCSV(model,reviewRoomExportFilters(value)),'text/csv;charset=utf-8');
  notify('ส่งออกวาระตรวจทานตามตัวกรองครบทุกหน้าแล้ว');
 }catch(error){notify('ส่งออกรายการทบทวนไม่ได้: '+error.message);}
}
function reviewRoomReport(value){
 const model=currentReviewRoomModel();if(!model.documents.length)throw new Error('เลือกเอกสารในชุดก่อนสร้างวาระตรวจทาน');
 return {markup:reviewRoomReportMarkup(model,reviewRoomExportFilters(value)),title:'วาระทบทวน · '+model.metadata.title};
}
function printReviewRoom(value){
 try{const report=reviewRoomReport(value);openReport(report.markup,report.title,'review-agenda');}
 catch(error){notify('สร้างวาระตรวจทานไม่ได้: '+error.message);}
}
function historyViewData(){
 let restored,readOnly=false;
 try{restored=readHandoverHistory(localStorage);}catch(error){restored=restoreHandoverHistory(null);restored.notice=error.message;readOnly=true;}
 readOnly ||= Boolean(restored.rejected||restored.adjusted);
 const source=currentHistorySource();
 const selected=restored.state.entries.find(entry=>entry.id===historySelectedId);
 const notices=[historyNotice,restored.notice];
 let comparison=null;
 if(selected){try{comparison=compareHandoverReference(selected,source.records,tools,source.state,{appVersion:APP_VERSION});}catch(error){notices.push(error.message);}}
 return {history:{...restored.state,selectedId:historySelectedId,draft:{...historyDraft}},currentModel:source.model,comparison,notice:notices.filter(Boolean).join(' · '),undoLabel:historyUndo?.entry.code||'',busy:historyBusy,readOnly};
}
function refreshHandoverHistory(){
 if(handoverHistoryView)handoverHistoryView.refresh(historyViewData());
}
function selectHandoverReference(id){
 historySelectedId=id;historyNotice='';saveHistoryPreferences();refreshHandoverHistory();
}
function renderHandoverHistory(){
 if(!guardReviewSourceTransition())return;
 cleanup();current=null;document.title='ฉบับอ้างอิงและรายการเปลี่ยนแปลง | ENG APP';
 const data=historyViewData();
 app.innerHTML=header('handover-history')+'<main id="main" class="page-shell studio-main"><div id="handover-history-workspace"></div></main>'+footer();
 handoverHistoryView=mountHandoverHistory(document.querySelector('#handover-history-workspace'),{
  ...data,onDraftChange:draft=>{historyDraft={...draft};historyNotice='';saveHistoryPreferences();},onSelect:selectHandoverReference,
  onCapture:captureHandoverHistory,onRemove:removeHandoverReference,onUndo:undoHandoverReference,
  onOpen:openHandoverRecord,onSnapshotReport:printHandoverReference,onComparisonReport:printHandoverChanges,
  onExportSnapshot:exportHandoverReference,onRefresh:()=>{historyNotice='';refreshHandoverHistory();},notify
 });
 window.scrollTo(0,0);
}
async function mutateHandoverHistory(transform,onSuccess){
 if(historyBusy)return;
 historyBusy=true;historyNotice='';refreshHandoverHistory();
 try{
  const result=await updateHandoverHistory(localStorage,transform);
  onSuccess(result);
 }catch(error){historyNotice=error.message;notify(error.message);}
 finally{historyBusy=false;refreshHandoverHistory();}
}
function captureHandoverHistory(draft){
 if(historyBusy)return;
 const source=currentHistorySource(),captureDraft={...draft};
 const options={id:uniqueId(),code:captureDraft.code,note:captureDraft.note,now:new Date().toISOString(),appVersion:APP_VERSION};
 return mutateHandoverHistory(latest=>({next:appendHandoverReference(latest,source.records,source.state,options),value:options.id}),result=>{
  historySelectedId=result.value;
  const liveDraft=handoverHistoryView?.getDraft()||historyDraft;
  historyDraft=liveDraft.code===captureDraft.code&&liveDraft.note===captureDraft.note?{code:'',note:''}:{...liveDraft};
  const prefsSaved=saveHistoryPreferences();
  notify(`เก็บฉบับอ้างอิง ${captureDraft.code.trim()} แล้ว ข้อมูลต้นทางยังอยู่ครบ${prefsSaved?'':' · แต่เก็บการเลือกและร่างฟอร์มไม่ได้'}`);
 });
}
function removeHandoverReference(id){
 return mutateHandoverHistory(latest=>{
  const index=latest.entries.findIndex(entry=>entry.id===id);
  if(index<0)throw new Error('ฉบับนี้ถูกนำออกจากอีกแท็บแล้ว กรุณารีเฟรชประวัติ');
  return {next:{...latest,entries:latest.entries.filter(entry=>entry.id!==id),selectedId:null},value:{entry:latest.entries[index],index}};
 },result=>{
  historyUndo=result.value;if(historySelectedId===id)historySelectedId=null;
  saveHistoryPreferences();notify(`นำฉบับ ${result.value.entry.code} ออกจากประวัติแล้ว ใช้ปุ่มคืนฉบับเพื่อย้อนรายการล่าสุดได้`);
 });
}
function undoHandoverReference(){
 if(!historyUndo||historyBusy)return;
 const undo=historyUndo;
 return mutateHandoverHistory(latest=>{
  if(latest.entries.length>=MAX_HANDOVER_REFERENCES)throw new Error(`ประวัติครบ ${MAX_HANDOVER_REFERENCES} ฉบับแล้ว นำฉบับอื่นออกก่อนเรียกคืน`);
  if(latest.entries.some(entry=>entry.id===undo.entry.id||entry.code.toLocaleLowerCase()===undo.entry.code.toLocaleLowerCase()))throw new Error('มีรหัสฉบับนี้อยู่แล้ว จึงไม่เขียนทับ กรุณาตรวจฉบับที่มีอยู่');
  const entries=[...latest.entries];entries.splice(Math.min(undo.index,entries.length),0,undo.entry);
  return {next:{...latest,entries,selectedId:undo.entry.id},value:undo.entry.id};
 },result=>{historySelectedId=result.value;historyUndo=null;saveHistoryPreferences();notify(`คืนฉบับ ${undo.entry.code} แล้ว โดยเก็บฉบับที่เพิ่มจากแท็บอื่นไว้ครบ`);});
}
function referenceForAction(id){
 const restored=readHandoverHistory(localStorage);
 const entry=restored.state.entries.find(entry=>entry.id===id);
 if(!entry)throw new Error('ไม่พบฉบับที่เลือก กรุณารีเฟรชแล้วเลือกฉบับอ้างอิงอีกครั้ง');
 return entry;
}
function exportHandoverReference(id){
 try{
  const entry=referenceForAction(id);
  download(`engapp-reference-${entry.code.replace(/[^a-z0-9._-]/gi,'-')||'snapshot'}.json`,JSON.stringify(entry.bundle,null,2),'application/json');
  notify(`ส่งออกข้อมูลต้นฉบับของ ${entry.code} แล้ว เปิดกลับเป็นชุดงานใหม่ได้`);
 }catch(error){notify('ส่งออกฉบับอ้างอิงไม่ได้: '+error.message);}
}
function printHandoverReference(id){
 try{
  const entry=referenceForAction(id);
  const snapshot=handoverReferenceModel(entry,tools,{appVersion:APP_VERSION});
  openReport(handoverHistorySnapshotReportMarkup(entry,snapshot.model,{currentAppVersion:snapshot.currentAppVersion,warnings:snapshot.warnings}),`${entry.code} · ${entry.bundle.metadata.title}`,'handover-reference');
 }catch(error){notify('เปิดรายงานฉบับอ้างอิงไม่ได้: '+error.message);}
}
function handoverChangesReport(id=historySelectedId){
 const entry=referenceForAction(id),source=currentHistorySource();
 const comparison=compareHandoverReference(entry,source.records,tools,source.state,{appVersion:APP_VERSION});
 return {markup:handoverHistoryComparisonReportMarkup(comparison),title:`${entry.code} → ชุดปัจจุบัน · ${source.state.metadata.title}`};
}
function printHandoverChanges(id=historySelectedId){
 try{const report=handoverChangesReport(id);openReport(report.markup,report.title,'handover-change');}
 catch(error){notify('สร้างรายการเปลี่ยนแปลงไม่ได้: '+error.message);}
}
function previewHandoverExample(){
 try{
  const example=createHandoverExample();
  previewProjectBundle(createProjectBundle(example.records,example.state,{appVersion:APP_VERSION}),{example:true});
 }catch(error){notify('เปิดตัวอย่างไม่ได้: '+error.message);}
}
function previewProjectBundle(value,{example=false}={}){
 const bundle=parseProjectBundle(value);
 const records=bundle.records.map(record=>({...record,id:record.sourceId,fromDraft:record.sourceState==='draft'}));
 const state=normalizeHandoverState({metadata:bundle.metadata,selectedIds:records.map(record=>record.id)});
 const model=buildHandover(records,tools,state);
 const warnings=model.entries.flatMap(entry=>(entry.warnings||[]).map(warning=>({name:entry.name,warning})));
 const root=showModal(`<div class="modal-backdrop"><section class="modal handover-import-modal" role="dialog" aria-modal="true" aria-labelledby="handover-import-title"><span class="eyebrow">${example?'EXAMPLE PROJECT / COORDINATION':'PROJECT BUNDLE / IMPORT'}</span><h2 id="handover-import-title">${example?'สร้างชุดตัวอย่างสำหรับลองทำงาน':'ตรวจรายการก่อนนำเข้าชุดงาน'}</h2><p>${e(bundle.metadata.title||'ชุดส่งตรวจโครงการ')}</p><p class="handover-import-note">${example?'เพิ่มงานตัวอย่างที่มีป้ายกำกับและสมมติฐานชัดเจน เพื่อทดลองคำนวณ ตรวจทาน และส่งต่อเอกสาร':'นำเข้าเป็นงานใหม่ทั้งหมด พร้อมข้อมูลเดิมและคำตอบที่ยังร่างอยู่'} · งานเดิมในเครื่องยังเก็บไว้ครบ</p><div class="handover-import-counts"><strong>${records.length} เอกสาร</strong><span>${model.summary.drafts} ร่างล่าสุด</span><span>${model.summary.reviewOutstanding} ประเด็นค้าง</span></div><ol class="handover-import-list">${model.entries.map(entry=>`<li><strong>${e(entry.name)}</strong><span>${e(entry.toolTitle)} · ${e(entry.document?.revision||'—')} · ${e(entry.sourceState==='draft'?'ร่างล่าสุด':'ฉบับบันทึก')}</span></li>`).join('')}</ol>${warnings.length?`<details class="handover-import-warnings" open><summary>ข้อสังเกตจากข้อมูล ${warnings.length} รายการ</summary><ul>${warnings.map(item=>`<li><strong>${e(item.name)}</strong> — ${e(item.warning)}</li>`).join('')}</ul><p>เก็บข้อมูลต้นฉบับเพื่อกู้คืนงาน เปิดแต่ละเครื่องมือเพื่อตรวจและแก้ข้อมูลก่อนใช้ผล</p></details>`:''}<p class="handover-import-note">การยืนยันจะเปิดชุดนี้แทนร่างชุดส่งตรวจปัจจุบัน โดยมีปุ่มคืนชุดที่สำรองไว้</p><p class="handover-import-note">ชื่อผู้รับและเครื่องหมายตรวจเป็นข้อมูลที่ผู้ใช้ระบุ การนำเข้าไม่ส่งข้อความหรือยืนยันตัวตนผู้ตรวจ</p><div class="modal-actions"><button type="button" class="button light" data-action="close-modal">ยกเลิก</button><button type="button" class="button primary" data-action="confirm-bundle-import">${example?'เพิ่มชุดตัวอย่าง':'นำเข้าเป็นงานใหม่'} ${records.length} เอกสาร</button></div></section></div>`);
 pendingBundle={bundle,example};root.querySelector('[data-action="close-modal"]').focus();
}
function confirmBundleImport(){
 if(!pendingBundle)return;
 try{
  const {bundle,example}=pendingBundle;
  const plan=planProjectBundleImport(bundle,readSavedProjects(),{idFactory:uniqueId});
  if(!write(KEYS.projects,plan.next))return;
  saved=plan.next;
  const backupSaved=rememberHandoverState(handoverDesk?.getState()||handoverState);
  const workspaceSaved=saveHandoverState(plan.state);
  closeModal();history.replaceState(null,'','#handover');renderHandover();
  notify(`${example?'เพิ่มชุดตัวอย่าง':'นำเข้าชุดงาน'} ${plan.records.length} เอกสารแล้ว${workspaceSaved?(backupSaved?'':' · ชุดก่อนหน้าคืนได้เฉพาะหน้านี้จนกว่าจะโหลดใหม่'):' · เก็บร่างชุดส่งตรวจไม่ได้ กรุณาส่งออก JSON สำรอง'}`);
 }catch(error){notify('นำเข้าชุดงานไม่ได้: '+error.message);}
}

function duplicateProject(record=null){
 const source=record?effectiveProject(record).project:current&&mounted?{toolId:current.tool.id,name:document.querySelector('#project-name').value||current.name,data:mounted.getState()}:null;
 if(!source)return;
 const now=new Date().toISOString();
 const copy={schemaVersion:1,id:uniqueId(),toolId:source.toolId,name:(source.name+' — สำเนา').slice(0,180),createdAt:now,updatedAt:now,data:JSON.parse(JSON.stringify(source.data))};
 if(copy.data._document)copy.data._document=invalidateDocumentReview(copy.data._document);
 if(tools[copy.toolId]&&copy.data._review)copy.data._review=reopenReviewRegister(tools[copy.toolId],copy.data._review,{now});
 const next=[copy,...readSavedProjects()];
 if(!write(KEYS.projects,next))return;
 saved=next;history.replaceState(null,'',`#tool/${copy.toolId}`);renderTool(copy.toolId,copy);
 try{persistToolPointer(localStorage,copy.toolId,copy.id);}catch{}
 notify('สร้างสำเนาแล้ว ปรับทางเลือกใหม่ได้โดยเก็บงานต้นฉบับไว้');
}
function exportProject(record){const p=record|| (current&&mounted?{schemaVersion:1,toolId:current.tool.id,name:document.querySelector('#project-name').value||current.name,updatedAt:new Date().toISOString(),data:mounted.getState()}:null);if(!p)return;download(`engapp-${p.toolId}-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(p,null,2),'application/json');notify('ส่งออกไฟล์งาน JSON แล้ว');}
function importProject(){
 const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.hidden=true;document.body.append(file);
 file.addEventListener('cancel',()=>file.remove(),{once:true});
 file.addEventListener('change',async()=>{
  const selected=file.files?.[0];file.remove();if(!selected)return;
  if(selected.size>MAX_BUNDLE_BYTES){notify('ไฟล์งานต้องไม่เกิน 8 MB');return;}
  try{
   const data=JSON.parse(await selected.text());
   if(data?.format==='engapp-project-bundle'){previewProjectBundle(data);return;}
   if(!data||data.schemaVersion!==1||!catalog.some(t=>t.id===data.toolId)||typeof data.name!=='string'||data.name.length>180||!data.data||typeof data.data!=='object'||Array.isArray(data.data))throw new Error('รูปแบบไฟล์ ENG APP ไม่ถูกต้อง');
   data.id=null;history.replaceState(null,'',`#tool/${data.toolId}`);renderTool(data.toolId,data);
   notify(mounted?'เปิดไฟล์แล้ว กดบันทึกเพื่อเก็บไว้ในงานของฉัน':'ข้อมูลในไฟล์ไม่ผ่านการตรวจ ดูรายละเอียดบนหน้าจอ');
  }catch(error){notify('เปิดไฟล์ไม่ได้: '+error.message);}
 });
 file.click();
}
function projectReport(){
 if(!current||!mounted)throw new Error('กรุณาเปิดงานก่อนสร้างรายงาน');
 const report=mounted.getReport();
 const cover=documentCoverMarkup({metadata:mounted.getDocument?.(),projectName:document.querySelector('#project-name').value||current.name,toolTitle:current.tool.title,toolId:current.tool.id,appVersion:APP_VERSION,generatedAt:new Date().toISOString(),assessment:mounted.getAssessment?.()});
 return `${cover}<div class="document-report-body">${reviewHandoverMarkup(mounted.getReviewSummary?.(),mounted.getRevisionSummary?.())}${report}</div><footer class="print-footer">ENG APP / ENGINEERING STUDIO · ${e(current.tool.title)} · REV ${e(mounted.getDocument?.().revision||'P01')} · ผลคำนวณอยู่ภายใต้สมมติฐานและขอบเขตที่ระบุ</footer>`;
}
function printProject(){
 try{
  openReport(projectReport(),document.querySelector('#project-name').value||current.name,current.tool.id);
 }catch(error){notify('ยังพิมพ์ผลไม่ได้: '+error.message);}
}
function openReport(markup,title,fileTag){
 const report=indexReportContent(markup);
 showModal(`<div class="modal-backdrop"><section class="modal report-modal report-reader" role="dialog" aria-modal="true" aria-label="ตัวอย่างรายงาน"><div class="report-toolbar"><div><strong>${fileTag==='review-agenda'?'วาระทบทวนโครงการ':fileTag==='handover-change'?'รายการเปลี่ยนแปลงชุดส่งตรวจ':fileTag==='handover-reference'?'รายงานฉบับอ้างอิง':fileTag==='handover'?'สรุปชุดส่งตรวจโครงการ':'รายงานสำหรับตรวจทาน'}</strong><p>อ่านตามสารบัญ · ข้อมูล ณ เวลาที่เปิดรายงาน</p></div><button class="button light compact" data-action="report-html">${icon('download')} ดาวน์โหลด HTML</button><button class="button primary compact" data-action="print-confirm">${icon('print')} พิมพ์ / บันทึก PDF</button><button class="icon-button" data-action="close-modal" aria-label="ปิดตัวอย่างรายงาน">${icon('close')}</button></div><div class="report-reader-layout">${reportNavigationMarkup(report.sections)}<div class="report-preview" tabindex="0" aria-label="เนื้อหารายงาน">${report.content}</div></div></section></div>`);
 activeReport={...report,title,fileTag};
 modalCleanup=mountReportReader(document.querySelector('.report-reader'));
 document.querySelector('[data-action="print-confirm"]').focus();
}
async function downloadReportHTML(button){
 if(button.disabled)return;
 button.disabled=true;
 try{
  if(!activeReport)throw new Error('เปิดตัวอย่างรายงานก่อนดาวน์โหลด');
  const report=activeReport;
  const styles=await loadReportStyles();
  download(`engapp-report-${report.fileTag}-${new Date().toISOString().slice(0,10)}.html`,standaloneReportHTML({...report,styles}),'text/html;charset=utf-8');
  notify('ดาวน์โหลดรายงาน HTML แล้ว เปิดอ่านออฟไลน์หรือส่งไฟล์ให้ผู้ตรวจได้');
 }catch(error){notify('ส่งออกรายงานไม่ได้: '+error.message);}
 finally{button.disabled=false;}
}
function preparePrint(){
 document.body.classList.remove('printing-report');document.querySelector('#print-root').innerHTML='';
 if(!activeReport&&(!current||!mounted)&&!handoverDesk&&!handoverHistoryView&&!reviewRoom)return;
 try{
  const content=activeReport?.content||(reviewRoom?reviewRoomReport().markup:handoverHistoryView?handoverChangesReport().markup:handoverDesk?handoverReportMarkup(currentHandover().model):projectReport());
  document.querySelector('#print-root').innerHTML=content;document.body.classList.add('printing-report');
 }
 catch(error){notify('ยังพิมพ์ผลไม่ได้: '+error.message);}
}

function projectDate(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}):'ยังไม่มีวันที่บันทึก';}
function renderProjects(){
 if(!guardReviewSourceTransition())return;
 cleanup();current=null;saved=readSavedProjects();document.title='งานของฉัน | ENG APP';
 app.innerHTML=header('projects')+`<main id="main" class="page-shell projects-page studio-main"><div class="workspace-title"><div><span class="eyebrow">MY WORKSPACE</span><h1>ทะเบียนงานของฉัน</h1><p>ภาพรวมผลคำนวณ เอกสาร และรายการตรวจทานของแต่ละงาน</p></div><div class="handover-project-actions"><a class="button light" href="#handover">${icon('layers')} เตรียมชุดส่งตรวจ</a><button class="button primary" data-action="import">${icon('upload')} เปิดไฟล์ JSON</button></div></div>${saved.length?`<div class="project-toolbar"><label class="search-input">${icon('search')}<input id="project-search" type="search" value="${e(projectFilters.search)}" placeholder="ค้นหาชื่องาน รหัสโครงการ ลูกค้า หรือเครื่องมือ..." aria-label="ค้นหางานที่บันทึก"></label><label class="project-sort">เรียงตาม<select id="project-sort"><option value="updated" ${projectFilters.sort==='updated'?'selected':''}>แก้ไขล่าสุด</option><option value="name" ${projectFilters.sort==='name'?'selected':''}>ชื่อโครงการ</option><option value="tool" ${projectFilters.sort==='tool'?'selected':''}>ชนิดเครื่องมือ</option></select></label></div><div id="project-results" aria-live="polite"></div>`:`<div class="empty-state large">${icon('folder')}<h2>เริ่มต้นงานแรกของคุณ</h2><p>เลือกเครื่องมือ ปรับข้อมูล แล้วกด “บันทึกงาน”</p><a class="button primary" href="#">เลือกเครื่องมือ</a></div>`}<aside class="storage-note">${icon('info')}<div><strong>ไฟล์ JSON คือสำเนางานที่ย้ายเครื่องได้</strong><span>ป้าย “มีร่างแก้ไข” หมายถึงมีข้อมูลใหม่กว่าที่บันทึกไว้ เปิดงานหรือส่งออกเพื่อใช้ร่างล่าสุดได้</span></div></aside></main>`+footer();
 document.querySelector('#project-search')?.addEventListener('input',event=>{projectFilters.search=event.target.value;renderProjectCards();});
 document.querySelector('#project-sort')?.addEventListener('change',event=>{projectFilters.sort=event.target.value;renderProjectCards();});
 renderProjectCards();window.scrollTo(0,0);
}
function renderProjectCards(){
 const root=document.querySelector('#project-results');if(!root)return;
 const words=projectFilters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
 const records=saved.map(record=>{const resolved=effectiveProject(record);return {...resolved.project,fromDraft:resolved.fromDraft,tool:catalog.find(tool=>tool.id===record.toolId)};}).filter(p=>words.every(word=>(p.name+' '+p.tool.title+' '+p.tool.en+' '+(p.data?._document?.projectCode||'')+' '+(p.data?._document?.client||'')).toLowerCase().includes(word)));
 records.sort((a,b)=>projectFilters.sort==='name'?a.name.localeCompare(b.name,'th'):projectFilters.sort==='tool'?a.tool.title.localeCompare(b.tool.title,'th')||a.name.localeCompare(b.name,'th'):(Date.parse(b.updatedAt)||0)-(Date.parse(a.updatedAt)||0));
 root.innerHTML=`<div class="project-result-line"><span>พบ <strong>${records.length}</strong> จาก ${saved.length} งาน</span><span>เก็บในเบราว์เซอร์นี้</span></div>`+(records.length?`<div class="project-grid">${records.map(p=>`<article class="project-card"><div class="project-card-top"><span class="project-icon">${icon(p.tool.kind==='calculator'?'calculator':'folder')}</span>${p.fromDraft?'<span class="draft-badge">มีร่างแก้ไข</span>':'<span class="saved-badge">บันทึกแล้ว</span>'}</div><span class="project-type">${e(p.tool.title)}</span><h2>${e(p.name)}</h2>${projectSignalMarkup(projectSignals(p,tools))}<p>${icon('clock')} ${e(projectDate(p.updatedAt))}</p><div class="project-card-actions"><button class="button primary compact" data-open-project="${e(p.id)}">เปิดงาน</button><button class="button light compact" data-copy-project="${e(p.id)}">ทำสำเนา</button><button class="button light compact" data-export-project="${e(p.id)}" aria-label="ส่งออก JSON ${e(p.name)}">${icon('download')} JSON</button><button class="button light compact" data-handover-project="${e(p.id)}" aria-label="เพิ่ม ${e(p.name)} ในชุดส่งตรวจ">${icon('layers')} ชุดส่งตรวจ</button><button class="link-button muted" data-delete-project="${e(p.id)}" aria-label="ลบ ${e(p.name)}">ลบ</button></div></article>`).join('')}</div>`:`<div class="empty-state">${icon('search')}<h2>ยังไม่พบงานที่ตรงกัน</h2><p>ลองค้นด้วยชื่อโครงการหรือชื่อเครื่องมือ</p><button class="button light" data-action="clear-project-search">ล้างคำค้น</button></div>`);
}
function openCommandPalette(){
 const projects=readSavedProjects();
 const actions=[{type:'action',id:'review-room',label:'เปิดห้องทบทวนโครงการ',detail:'PROJECT REVIEW ROOM / ACTION AGENDA',icon:'check'},{type:'action',id:'handover',label:'เตรียมชุดส่งตรวจโครงการ',detail:'PROJECT HANDOVER / BUNDLE',icon:'layers'},{type:'action',id:'handover-history',label:'ฉบับอ้างอิงและรายการเปลี่ยนแปลง',detail:'PACKAGE REFERENCES / CHANGE REVIEW',icon:'file'},{type:'action',id:'projects',label:'เปิดทะเบียนงานของฉัน',detail:'PROJECT REGISTER',icon:'folder'},{type:'action',id:'import',label:'เปิดไฟล์งาน JSON',detail:'IMPORT PROJECT',icon:'upload'},...(current&&mounted?[{type:'action',id:'save',label:'บันทึกงานปัจจุบัน',detail:'SAVE / CTRL S',icon:'save'},{type:'action',id:'print',label:'สร้างรายงานพร้อมข้อมูลเอกสาร',detail:'REPORT / CTRL P',icon:'print'}]:[])];
 const entries=[...actions,...projects.map(p=>({type:'project',id:p.id,label:p.name,detail:(p.data?._document?.projectCode||'งานที่บันทึก')+' · '+(catalog.find(t=>t.id===p.toolId)?.title||''),icon:'folder'})),...catalog.map(t=>({type:'tool',id:t.id,label:t.title,detail:t.en+' · '+t.tags.join(' '),icon:t.kind==='calculator'?'ruler':t.kind==='workflow'?'chart':'book'}))];
 const root=showModal(`<div class="command-overlay"><section class="command-dialog modal" role="dialog" aria-modal="true" aria-label="ค้นหาและเปิดงาน"><div class="command-search">${icon('search')}<input id="command-input" type="search" placeholder="ค้นหาเครื่องมือ ชื่องาน หรือรหัสโครงการ..." aria-label="ค้นหาเครื่องมือหรืองาน" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="command-results" autocomplete="off"><button class="icon-button" data-action="close-modal" aria-label="ปิดการค้นหา">${icon('close')}</button></div><div id="command-results" class="command-results" role="listbox" aria-label="ผลค้นหา"></div><p class="command-footer">↑ ↓ เลือก · Enter เปิด · Esc ปิด</p></section></div>`);
 const input=root.querySelector('#command-input'),list=root.querySelector('#command-results');
 let matches=[],selected=0;
 function highlight(){
  list.querySelectorAll('.command-item').forEach((button,index)=>button.setAttribute('aria-selected',String(index===selected)));
  if(matches.length)input.setAttribute('aria-activedescendant','command-item-'+selected);else input.removeAttribute('aria-activedescendant');
 }
 function draw(){
  const words=input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  matches=entries.filter(entry=>words.every(word=>(entry.label+' '+entry.detail).toLocaleLowerCase().includes(word))).slice(0,24);selected=0;
  list.innerHTML=matches.length?matches.map((entry,index)=>`<button type="button" class="command-item" id="command-item-${index}" data-command-index="${index}" role="option" aria-selected="${index===0}" tabindex="-1">${icon(entry.icon)}<span><strong>${e(entry.label)}</strong><small>${e(entry.detail)}</small></span></button>`).join(''):'<p>ยังไม่พบรายการ ลองคำว่า “คาน”, “BOQ” หรือชื่อโครงการ</p>';
  highlight();
 }
 function activate(index){
  const entry=matches[index];if(!entry)return;closeModal();
  if(entry.type==='tool'){history.replaceState(null,'','#tool/'+entry.id);renderTool(entry.id);}
  else if(entry.type==='project'){const project=projects.find(p=>p.id===entry.id);if(project){saved=readSavedProjects();history.replaceState(null,'','#tool/'+project.toolId);renderTool(project.toolId,project);}}
  else if(entry.id==='projects'){history.replaceState(null,'','#projects');renderProjects();}
  else if(entry.id==='handover'){history.replaceState(null,'','#handover');renderHandover();}
  else if(entry.id==='handover-history'){history.replaceState(null,'','#handover-history');renderHandoverHistory();}
  else if(entry.id==='review-room'){history.replaceState(null,'','#review-room');renderReviewRoom();}
  else if(entry.id==='import')importProject();else if(entry.id==='save')saveProject();else if(entry.id==='print')printProject();
 }
 input.addEventListener('input',draw);
 input.addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(matches.length){selected=(selected+(event.key==='ArrowDown'?1:matches.length-1))%matches.length;highlight();list.querySelector('#command-item-'+selected)?.scrollIntoView({block:'nearest'});}}
  else if(event.key==='Enter'){event.preventDefault();activate(selected);}
 });
 list.addEventListener('click',event=>{const button=event.target.closest('[data-command-index]');if(button)activate(Number(button.dataset.commandIndex));});
 draw();input.focus();
}
function showDiscipline(id){
 if(!guardReviewSourceTransition())return;
 if(!categories.some(category=>category.id===id))return;
 filters={search:'',category:id,favorites:false};history.replaceState(null,'','#tools');renderHome();
 document.querySelectorAll('[data-nav-category]').forEach(button=>button.classList.toggle('active',button.dataset.navCategory===id));
 document.querySelector('#tools').scrollIntoView({behavior:'smooth',block:'start'});
}
function about(){const root=document.querySelector('#modal-root');showModal(`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="about-title"><button class="icon-button modal-close" data-action="close-modal" aria-label="ปิดหน้าต่าง">${icon('close')}</button><span class="eyebrow">ABOUT ENGINEERING STUDIO</span><h2 id="about-title">คิดอย่างเป็นระบบ ส่งต่องานอย่างมีที่มา</h2><p>ENG APP Engineering Studio รวม 20 เครื่องมือสำหรับงานคำนวณ ปริมาณ ต้นทุน และบริหารโครงการ พร้อมการเทียบทางเลือก ศึกษาความไว และข้อมูลเอกสารสำหรับส่งตรวจทาน</p><p>เครื่องมือโครงสร้างเป็นการตรวจเบื้องต้นตามสมมติฐานที่แสดง พร้อมสูตรและแหล่งอ้างอิง ราคาและโครงการตั้งต้นเป็นข้อมูลตัวอย่างที่แก้ไขได้</p><p>ข้อมูลเก็บในเบราว์เซอร์นี้ ส่งออก JSON เพื่อสำรองงาน และพิมพ์รายงานเป็น PDF จากเมนูพิมพ์ของเบราว์เซอร์ได้</p><a class="button primary" href="https://github.com/saratchai1/eng-app" target="_blank" rel="noopener">ดูซอร์สโค้ดและขอบเขต</a></section></div>`);root.querySelector('button').focus();}
function reset(){if(!current)return;const toolId=current.tool.id;const root=document.querySelector('#modal-root');showModal(`<div class="modal-backdrop"><section class="modal small" role="dialog" aria-modal="true" aria-labelledby="reset-title"><h2 id="reset-title">เริ่มจากตัวอย่างใหม่?</h2><p>ข้อมูลที่แก้ไขในหน้าปัจจุบันจะถูกแทนด้วยค่าตัวอย่าง งานที่กดบันทึกไว้ยังเปิดได้จาก “งานของฉัน”</p><div class="modal-actions"><button class="button light" data-action="close-modal">กลับไปแก้ไข</button><button class="button primary" data-action="confirm-reset">เริ่มตัวอย่างใหม่</button></div></section></div>`);root.querySelector('button').focus();}
function route(){
 if(document.querySelector('#modal-root').firstElementChild)closeModal();
 const hash=location.hash.slice(1);
 if(reviewSourceContext&&current?.dirty&&!preserveReviewSource()){
  history.replaceState(null,'',reviewSourceHash(reviewSourceContext.sourceId,reviewSourceContext.target,reviewSourceContext.findingId));return;
 }
 if(hash==='projects')renderProjects();
 else if(hash==='handover')renderHandover();
 else if(hash==='handover-history')renderHandoverHistory();
 else if(hash==='review-room')renderReviewRoom();
 else if(hash.startsWith('review-source/')){
  try{renderReviewSource(parseReviewSourceHash(hash));}
  catch(error){history.replaceState(null,'','#review-room');renderReviewRoom({notice:error.message});}
 }
 else if(hash.startsWith('tool/'))renderTool(hash.slice(5));
 else if(hash==='tools'){if(current||!document.querySelector('#tools'))renderHome();document.querySelector('#tools').scrollIntoView({behavior:'smooth'});}
 else renderHome();
}

document.addEventListener('click',event=>{
 const skip=event.target.closest('a.skip-link');if(skip){event.preventDefault();const main=document.querySelector('#main');if(main){main.tabIndex=-1;main.focus();main.scrollIntoView({block:'start'});}return;}
 const handoverButton=event.target.closest('[data-handover-project]');if(handoverButton){addToHandover(handoverButton.dataset.handoverProject);return;}
 const copyButton=event.target.closest('[data-copy-project]');if(copyButton){const record=saved.find(p=>p.id===copyButton.dataset.copyProject);if(record)duplicateProject(record);return;}
 const discipline=event.target.closest('[data-nav-category]');if(discipline){showDiscipline(discipline.dataset.navCategory);return;}
 const favorite=event.target.closest('[data-favorite]');if(favorite){const id=favorite.dataset.favorite;const focused=document.activeElement===favorite;favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];write(KEYS.favorites,favorites);renderCatalog();const count=document.querySelector('[data-action="favorites"]>span');if(count)count.textContent=favorites.length;if(focused)document.querySelector('[data-favorite="'+id+'"]')?.focus({preventScroll:true});return;}
 const category=event.target.closest('[data-category]');if(category){filters.category=category.dataset.category;document.querySelectorAll('[data-category]').forEach(b=>{b.classList.toggle('selected',b===category);b.setAttribute('aria-pressed',String(b===category));});renderCatalog();return;}
 const projectButton=event.target.closest('[data-open-project]');if(projectButton){const p=saved.find(x=>x.id===projectButton.dataset.openProject);if(p){history.replaceState(null,'',`#tool/${p.toolId}`);renderTool(p.toolId,p);}return;}
 const exportButton=event.target.closest('[data-export-project]');if(exportButton){const record=saved.find(x=>x.id===exportButton.dataset.exportProject);if(record)exportProject(effectiveProject(record).project);return;}
 const deleteButton=event.target.closest('[data-delete-project]');if(deleteButton){const id=deleteButton.dataset.deleteProject;const p=saved.find(x=>x.id===id);const root=document.querySelector('#modal-root');showModal(`<div class="modal-backdrop"><section class="modal small" role="dialog" aria-modal="true" aria-label="ยืนยันลบงาน"><h2>ลบงานที่บันทึกไว้?</h2><p>${e(p?.name)}</p><p>ส่งออก JSON เก็บไว้ก่อน หากต้องการนำกลับมาใช้</p><div class="modal-actions"><button class="button light" data-action="close-modal">ยกเลิก</button><button class="button primary" data-confirm-delete="${e(id)}">ลบงานนี้</button></div></section></div>`);root.querySelector('button').focus();return;}
 const confirmDelete=event.target.closest('[data-confirm-delete]');if(confirmDelete){const id=confirmDelete.dataset.confirmDelete;saved=readSavedProjects();const removed=saved.find(x=>x.id===id);const next=saved.filter(x=>x.id!==id);if(write(KEYS.projects,next)){saved=next;const draftCleared=!removed||clearDraft(removed.toolId,id);closeModal();renderProjects();notify(draftCleared?'ลบงานแล้ว':'ลบงานที่บันทึกแล้ว แต่ล้างสำรองชั่วคราวไม่ได้');}return;}
 const button=event.target.closest('[data-action]');if(!button)return;
 const action=button.dataset.action;
 if(action==='return-review-room'){returnReviewRoom();return;}
 if(action==='command')openCommandPalette();else if(action==='save')saveProject();else if(action==='view-results'){mounted?.showResults?.();}else if(action==='duplicate')duplicateProject();else if(action==='clear-project-search'){projectFilters.search='';const search=document.querySelector('#project-search');if(search){search.value='';search.focus();}renderProjectCards();}else if(action==='export')exportProject();else if(action==='import')importProject();else if(action==='confirm-bundle-import')confirmBundleImport();else if(action==='handover')location.hash='handover';else if(action==='handover-example')previewHandoverExample();else if(action==='restore-handover')restoreHandoverDraft();else if(action==='print')printProject();else if(action==='report-html')downloadReportHTML(button);else if(action==='print-confirm')window.print();else if(action==='projects')location.hash='projects';else if(action==='favorites'){filters.favorites=!filters.favorites;renderHome();}else if(action==='clear-filter'){filters={search:'',category:'all',favorites:false};renderHome();}else if(action==='about')about();else if(action==='close-modal')closeModal();else if(action==='reset')reset();else if(action==='confirm-reset'){const id=current.tool.id;const projectId=current.id;closeModal();cleanup({save:false});current=null;history.replaceState(null,'','#tool/'+id);const cleared=clearDraft(id,projectId);renderTool(id,{name:catalog.find(x=>x.id===id).title+' — งานตัวอย่าง',data:{}});if(!cleared){document.querySelector('#save-status').textContent='เริ่มตัวอย่างใหม่แล้ว · ล้างสำรองเก่าไม่ได้';notify('ล้างสำรองชั่วคราวของเครื่องมือนี้ไม่ได้ กรุณาส่งออก JSON หากต้องการเก็บงานใหม่');}}
});
document.addEventListener('keydown',event=>{
 const modal=document.querySelector('.modal');
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!event.altKey){if(!modal){event.preventDefault();openCommandPalette();}return;}
 if(event.key==='Escape'&&modal){event.preventDefault();closeModal();return;}
 if((event.ctrlKey||event.metaKey)&&!event.altKey&&event.key.toLowerCase()==='p'&&activeReport){event.preventDefault();window.print();return;}
 if((event.ctrlKey||event.metaKey)&&!event.altKey&&current&&mounted){
  if(event.key.toLowerCase()==='s'&&!modal){event.preventDefault();saveProject();return;}
  if(event.key.toLowerCase()==='p'&&!modal){event.preventDefault();printProject();return;}
 }
 if((event.ctrlKey||event.metaKey)&&!event.altKey&&handoverDesk&&!modal){
  if(event.key.toLowerCase()==='s'){event.preventDefault();if(saveHandoverState(handoverDesk.getState()))notify('เก็บร่างชุดส่งตรวจในเบราว์เซอร์แล้ว');return;}
  if(event.key.toLowerCase()==='p'){event.preventDefault();printHandover();return;}
 }
 if((event.ctrlKey||event.metaKey)&&!event.altKey&&handoverHistoryView&&!modal){
  if(event.key.toLowerCase()==='s'){event.preventDefault();historyDraft=handoverHistoryView.getDraft();if(saveHistoryPreferences())notify('เก็บข้อความร่างแล้ว ยังไม่ได้สร้างฉบับอ้างอิง');return;}
  if(event.key.toLowerCase()==='p'){event.preventDefault();printHandoverChanges();return;}
 }
 if((event.ctrlKey||event.metaKey)&&!event.altKey&&reviewRoom&&!modal){
  if(event.key.toLowerCase()==='s'){event.preventDefault();if(saveReviewRoomPreferences(reviewRoom.getState()))notify('เก็บตัวกรองและตำแหน่งทบทวนแล้ว');return;}
  if(event.key.toLowerCase()==='p'){event.preventDefault();printReviewRoom();return;}
 }
 if(event.key==='/'&&!modal&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){
  const search=document.querySelector('#tool-search,#project-search,[data-ho-search],[data-hh-search],[data-rr-search]');event.preventDefault();if(search){const picker=search.closest('details');if(picker)picker.open=true;search.focus();}else openCommandPalette();
 }
 if(event.key==='Tab'&&modal){
  const elements=[...modal.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])')].filter(el=>!el.disabled&&el.getClientRects().length);
  const first=elements[0],last=elements.at(-1);
  const active=document.activeElement;
  if(!elements.includes(active)){
   const candidates=modal.contains(active)?elements.filter(el=>active.compareDocumentPosition(el)&(event.shiftKey?Node.DOCUMENT_POSITION_PRECEDING:Node.DOCUMENT_POSITION_FOLLOWING)):[];
   event.preventDefault();(event.shiftKey?candidates.at(-1)||last:candidates[0]||first)?.focus();
  }else if(event.shiftKey&&active===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&active===last){event.preventDefault();first?.focus();}
 }
});
window.addEventListener('beforeprint',preparePrint);
window.addEventListener('afterprint',()=>document.body.classList.remove('printing-report'));
window.addEventListener('storage',event=>{
 if(handoverDesk&&(event.key===null||event.key===KEYS.projects||event.key?.startsWith('engapp.draft.'))){handoverDesk.refresh(handoverRecords());}
 if(handoverHistoryView&&(event.key===null||event.key===HANDOVER_HISTORY_KEY||event.key===KEYS.handover||event.key===KEYS.projects||event.key?.startsWith('engapp.draft.'))){refreshHandoverHistory();}
 if(reviewRoom&&(event.key===null||event.key===KEYS.handover||event.key===KEYS.projects||event.key?.startsWith('engapp.draft.'))){refreshReviewRoom();}
});
window.addEventListener('hashchange',route);
window.addEventListener('pagehide',saveDraft);
route();
