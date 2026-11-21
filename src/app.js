import {catalog,categories} from './catalog.js';
import {engineeringTools} from './engineering.js';
import {quantityTools} from './quantities.js';
import {mountWorkflow} from './workflows.js';
import {mountSpecial} from './specials.js';
import {icon,sketch} from './visuals.js';
import {engineeringFigure} from './calculation-diagrams.js';
import {escapeHTML as e,format as f,download,csv,today,uniqueId} from './utils.js';
import {makeDraftRecord,resolveProjectForTool,persistJSON,readToolDraft,persistToolDraft,removeToolDraft,persistToolPointer,finalizeSavedDraft,removeOwnedDraft} from './project-storage.js';
import {captureBaseline,restoreBaseline,comparisonMarkup} from './comparison.js';

const APP_VERSION='0.2';
const SESSION_WRITER_ID=uniqueId();

const app=document.querySelector('#app');
const tools={...engineeringTools,...quantityTools};
const KEYS={projects:'engapp.projects.v1',favorites:'engapp.favorites.v1',recent:'engapp.recent.v1'};
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
let mounted=null,current=null,draftTimer=null,toastTimer=null,storeErrorShown=false;

function showModal(markup){
 const root=document.querySelector('#modal-root');
 if(!root.firstElementChild)modalReturnFocus=document.activeElement;
 root.innerHTML=markup;app.inert=true;document.body.classList.add('modal-open');
 return root;
}
function closeModal(){
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
function cleanup({save=true}={}){clearTimeout(draftTimer);if(save&&current&&mounted)saveDraft({showStatus:false});mounted?.destroy?.();mounted=null;}
function saveDraft({showStatus=true}={}){if(!current||!mounted)return false;if(current.id&&!current.dirty){try{return storageResult(persistToolPointer(localStorage,current.tool.id,current.id));}catch{return storageResult(false);}}const record=makeDraftRecord({id:current.id,toolId:current.tool.id,name:document.querySelector('#project-name')?.value ?? current.name,createdAt:current.createdAt,writerId:SESSION_WRITER_ID,baseSavedAt:current.baseSavedAt,data:mounted.getState()},current.dirty?new Date().toISOString():current.updatedAt);const ok=writeDraft(record);if(showStatus&&current.dirty){const badge=document.querySelector('#save-status');if(badge)badge.textContent=ok?'สำรองชั่วคราวแล้ว · กดบันทึกงานเพื่อเก็บในงานของฉัน':'ยังสำรองไม่ได้ · กรุณาส่งออก JSON เก็บข้อมูล';}return ok;}
function onChange(){if(current)current.dirty=true;clearTimeout(draftTimer);draftTimer=setTimeout(()=>saveDraft(),500);const badge=document.querySelector('#save-status');if(badge)badge.textContent='มีการแก้ไข · กำลังสำรองชั่วคราว…';}
function logo(){return `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 44" fill="none"><path d="m20 2 17 10v20L20 42 3 32V12z" stroke="currentColor" stroke-width="2"/><path d="M12 12h16v5H17v4h9v4h-9v5h11v5H12z" fill="currentColor"/><path d="M29 6v8m-4-4h8" stroke="#f58335" stroke-width="2"/></svg></span><span><strong>ENG<span>APP</span></strong><small>เครื่องมือคิด งานวิศวกรรม</small></span>`;}
function header(active='catalog'){return `<header class="site-header"><div class="header-inner"><a class="brand" href="#" aria-label="ENG APP หน้าหลัก">${logo()}</a><nav aria-label="เมนูหลัก"><a href="#" class="${active==='catalog'?'active':''}">เครื่องมือทั้งหมด</a><a href="#projects" class="${active==='projects'?'active':''}">งานของฉัน <span class="nav-count">${saved.length}</span></a><a href="#tool/guide">คู่มือการใช้งาน</a></nav><div class="header-actions"><button class="button light compact" data-action="import" aria-label="เปิดไฟล์งาน">${icon('upload')}<span>เปิดไฟล์งาน</span></button><span class="local-user" title="พื้นที่ทำงานในเบราว์เซอร์นี้">E</span></div></div></header>`;}
function footer(){return `<footer class="site-footer"><div><a class="brand footer-brand" href="#">${logo()}</a><p>เครื่องมือช่วยคิด พร้อมที่มาของทุกผลลัพธ์</p></div><div><span>ENG APP · รุ่น ${APP_VERSION}</span><a href="https://github.com/saratchai1/eng-app" target="_blank" rel="noopener">โค้ดและเอกสาร ${icon('external')}</a><button class="link-button" data-action="about">เกี่ยวกับเครื่องมือ</button></div></footer>`;}

function recentMarkup(){return recentTools.length?`<section class="recent-tools" aria-label="เครื่องมือที่ใช้ล่าสุด"><div class="recent-heading"><span class="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>กลับไปทำต่อ</h2></div><div class="recent-links">${recentTools.map(id=>{const tool=catalog.find(t=>t.id===id);return `<a href="#tool/${id}"><span class="recent-icon">${icon(tool.kind==='calculator'?'calculator':'folder')}</span><span><small>${e(categories.find(c=>c.id===tool.category).label)}</small><strong>${e(tool.title)}</strong></span><span class="recent-arrow" aria-hidden="true">↗</span></a>`;}).join('')}</div></section>`:'';}

function renderHome(){
 cleanup();current=null;document.title='ENG APP — เครื่องมือคิด งานวิศวกรรม';
 app.innerHTML=header()+`<main id="main" class="page-shell"><section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="orange-line"></span> ENGINEERING WORKSPACE</div><h1>ทุกงานวิศวกรรม<br><span>เริ่มคิดได้ที่นี่</span></h1><p>คำนวณ ถอดปริมาณ วางแผน และตรวจงาน <br class="desktop-only">เลือกเครื่องมือ แล้วเริ่มจากตัวอย่างได้ทันที</p><div class="hero-actions"><a class="button primary" href="#tool/retaining-wall">${icon('calculator')}เริ่มคำนวณกำแพงกันดิน</a><a class="text-link" href="#tools">ดูเครื่องมือทั้งหมด</a></div><div class="hero-facts"><span>${icon('grid')} 20 เครื่องมือ</span><span>${icon('file')} บันทึกและส่งออกงาน</span><span>${icon('shield')} เปิดใช้ได้ทันที</span></div></div><div class="hero-preview"><a class="feature-tile tile-wall" href="#tool/retaining-wall"><div class="feature-top"><span>GEOTECHNICAL</span><span class="tiny-pill">ดิน + น้ำ</span></div>${sketch('wall','ภาพร่างกำแพงกันดิน')}<div class="feature-bottom"><strong>Retaining Wall</strong><span>ดูแรงและเสถียรภาพ</span></div></a><a class="feature-tile tile-beam" href="#tool/rc-beam"><div class="feature-top"><span>STRUCTURAL</span>${icon('ruler')}</div>${sketch('beam','ภาพร่างคานคอนกรีตเสริมเหล็ก')}<div class="feature-bottom"><strong>RC Beam</strong><span>ตรวจแรงดัดพร้อมวิธีทำ</span></div></a><div class="preview-note">${icon('check')} ปรับค่า · ดูผล · ตรวจที่มา</div></div></section>
 ${recentMarkup()}<section id="tools" class="catalog-section" aria-label="ค้นหาเครื่องมือ"><div class="catalog-heading"><div><span class="eyebrow">YOUR TOOLBOX</span><h2>เลือกเครื่องมือให้ตรงกับงาน</h2></div><button class="button light compact ${filters.favorites?'selected':''}" data-action="favorites">${icon('star')} รายการโปรด <span>${favorites.length}</span></button></div><div class="search-bar"><label class="search-input">${icon('search')}<input id="tool-search" type="search" value="${e(filters.search)}" placeholder="ค้นหาเครื่องมือ เช่น BOQ กำแพงกันดิน แผนงาน..." aria-label="ค้นหาเครื่องมือ"><kbd>/</kbd></label><span class="search-hint">คำนวณในเบราว์เซอร์ · ไม่ต้องมีบัญชี</span></div><div class="category-list" role="group" aria-label="หมวดเครื่องมือ">${categories.map(c=>`<button class="category ${filters.category===c.id?'selected':''}" data-category="${c.id}" aria-pressed="${filters.category===c.id}">${icon(c.icon)}${c.label}${c.id==='all'?` <span>${catalog.length}</span>`:''}</button>`).join('')}</div><div id="catalog-results" aria-live="polite"></div></section>
 <aside class="storage-note">${icon('folder')}<div><strong>งานของคุณ อยู่ในเบราว์เซอร์นี้</strong><span>บันทึกงานไว้เปิดต่อ และส่งออกไฟล์ JSON เพื่อย้ายเครื่องหรือเก็บสำรองได้</span></div><button class="button light compact" data-action="projects">เปิดงานของฉัน</button></aside></main>`+footer();
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

function renderTool(toolId,project=null){
 cleanup();const tool=catalog.find(t=>t.id===toolId);if(!tool){location.hash='';return;}
 const restored=resolveProjectForTool(toolId,{project,draft:readDraft(toolId,project?.id),saved});project=restored.project;
 const initial=project?.data || null;document.title=tool.title+' | ENG APP';recentTools=[toolId,...recentTools.filter(id=>id!==toolId)].slice(0,4);try{persistJSON(localStorage,KEYS.recent,recentTools);}catch{}
 current={tool,id:project?.id||null,name:project?.name||`${tool.title} — งานตัวอย่าง`,createdAt:project?.createdAt||new Date().toISOString(),updatedAt:project?.updatedAt||new Date().toISOString(),dirty:restored.fromDraft,baseSavedAt:project?.baseSavedAt||saved.find(p=>p.id===project?.id)?.updatedAt||null,resumedWriterId:restored.fromDraft?project?.writerId:null,resumedUpdatedAt:restored.fromDraft?project?.updatedAt:null};
 app.innerHTML=header('tool')+`<main id="main" class="workspace page-shell"><div class="breadcrumb"><a href="#">เครื่องมือทั้งหมด</a><span>/</span><span>${e(categories.find(c=>c.id===tool.category).label)}</span><span>/</span><strong>${tool.title}</strong></div><div class="workspace-title"><div><div class="eyebrow">${tool.en}</div><h1>${tool.title}</h1><p>${tool.description}</p></div><span class="scope-tag">${icon('info')}${tool.category==='design'?'ตรวจเบื้องต้นตามขอบเขต':tool.kind==='workflow'?'พื้นที่ทำงานของคุณ':'พร้อมเริ่มจากตัวอย่าง'}</span></div><div class="workspace-bar"><label class="project-name-label">ชื่อโครงการ / งาน<input id="project-name" maxlength="180" value="${e(current.name)}" aria-label="ชื่อโครงการ / งาน"></label><div class="workspace-buttons"><button class="button primary compact" data-action="save">${icon('save')} บันทึกงาน</button><button class="button light compact" data-action="export">${icon('download')} JSON</button><button class="button light compact" data-action="duplicate">${icon('file')} ทำสำเนา</button><button class="button light compact" data-action="print">${icon('print')} พิมพ์ / PDF</button><button class="icon-button" data-action="reset" title="เริ่มจากตัวอย่างใหม่" aria-label="เริ่มจากตัวอย่างใหม่">${icon('reset')}</button></div></div><div class="workspace-meta"><span id="save-status">${project?.id?'เปิดจากงานที่บันทึกไว้':'งานตัวอย่าง · ปรับค่าได้'}</span><span>${tool.scope}</span></div><div id="tool-workspace"></div></main>`+footer();
 const host=document.querySelector('#tool-workspace');
 try {if(tool.kind==='calculator')mounted=mountCalculator(host,tools[toolId],initial);else if(tool.kind==='workflow')mounted=mountWorkflow(host,toolId,initial,{onChange,notify});else mounted=mountSpecial(host,toolId,initial,{onChange,notify});}
 catch(error){host.innerHTML=`<div class="error-banner" role="alert">เปิดข้อมูลนี้ไม่ได้: ${e(error.message)}<button class="button light" data-action="reset">เริ่มจากตัวอย่างใหม่</button></div>`;mounted=null;}
 document.querySelector('#project-name').addEventListener('input',onChange);
 if(restored.fromDraft)document.querySelector('#save-status').textContent='กู้คืนสำรองชั่วคราวแล้ว · กดบันทึกงานเมื่อพร้อม';
 window.scrollTo(0,0);
}
function mountCalculator(host,def,initial){
 let input=normalizeInputs(def,initial),result=null,error=null;
 let baseline=restoreBaseline(def,initial?._comparison);
 const fields=def.inputGroups.flatMap(group=>group.fields);
 host.innerHTML=`<div class="calc-grid"><div class="input-panel"><div class="panel-title"><h2>${icon('ruler')} ข้อมูลที่ใช้คำนวณ</h2><span>SI UNITS</span></div><form id="calc-form" novalidate>${def.inputGroups.map(group=>`<fieldset><legend>${e(group.title)}</legend><div class="field-grid">${group.fields.map(field=>`<label class="field"><span>${e(field.label)}</span>${field.type==='select'?`<select data-field="${e(field.key)}" aria-label="${e(field.label)}">${field.options.map(option=>`<option value="${e(option.value)}" ${input[field.key]===option.value?'selected':''}>${e(option.label)}</option>`).join('')}</select>`:`<div class="number-input"><input type="number" data-field="${e(field.key)}" value="${e(typeof input[field.key]==='number'?input[field.key]:'')}" min="${e(field.min??'')}" max="${e(field.max??'')}" step="${e(field.step??'any')}" inputmode="decimal" required aria-label="${e(field.label)}"><span>${e(field.unit||'')}</span></div>`}</label>`).join('')}</div></fieldset>`).join('')}<div class="form-tip">${icon('info')} ปรับข้อมูลเพื่อคำนวณสด · Ctrl / ⌘ + S เพื่อบันทึกงาน</div><button type="button" class="button light mobile-result-jump" data-action="view-results">ดูผลการคำนวณ ↓</button></form></div><div class="result-panel"><div id="calc-comparison"></div><div id="calc-result" aria-live="polite"></div><details class="assumptions" open><summary>${icon('shield')} สมมติฐานและขอบเขตการใช้</summary><ul>${def.assumptions.map(x=>`<li>${e(x)}</li>`).join('')}</ul>${def.references?.length?`<div class="references"><strong>เอกสารประกอบวิธีคำนวณ</strong>${def.references.map(ref=>`<a href="${e(ref.url)}" target="_blank" rel="noopener">${e(ref.label)} ${icon('external')}</a>`).join('')}</div>`:''}</details></div></div>`;
 const form=host.querySelector('form'),resultEl=host.querySelector('#calc-result'),comparisonEl=host.querySelector('#calc-comparison');
 function update(){
  for(const el of form.querySelectorAll('[data-field]')){
   const field=fields.find(field=>field.key===el.dataset.field),value=input[field.key];
   const invalid=field.type==='select'?!field.options.some(option=>option.value===value):typeof value!=='number'||!Number.isFinite(value)||value<(field.min??-Infinity)||value>(field.max??Infinity);
   el.setAttribute('aria-invalid',String(invalid));el.closest('.field').classList.toggle('has-error',invalid);
  }
  try{result=def.calculate(input);error=null;resultEl.innerHTML=resultMarkup(result,def,input);}
  catch(err){result=null;error=err.message;resultEl.innerHTML=`<div class="error-banner" role="alert">${icon('info')}<div><h3>ตรวจข้อมูลก่อนคำนวณ</h3><p>${e(error)}</p><span>ยังไม่แสดงผลจนกว่าข้อมูลจะครบและอยู่ในขอบเขต</span></div></div>`;}
  comparisonEl.innerHTML=comparisonMarkup(def,baseline,input,{valid:!error});
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
 form.addEventListener('input',handler);form.addEventListener('change',changeHandler);form.addEventListener('submit',submitHandler);comparisonEl.addEventListener('click',compareHandler);update();
 if(initial?._comparison&&!baseline)notify('ค่า A ในไฟล์เดิมไม่ตรงกับขอบเขตรุ่นนี้ กรุณาบันทึกค่า A ใหม่');
 return {
  getState:()=>({...input,...(baseline?{_comparison:baseline}:{})}),
  getReport:()=>{
   if(error)throw new Error(error);
   return `<h2>${e(def.title)}</h2><table><thead><tr><th>ข้อมูลเข้า</th><th>ค่า</th><th>หน่วย</th></tr></thead><tbody>${fields.map(field=>`<tr><td>${e(field.label)}</td><td>${e(field.type==='select'?(field.options.find(option=>option.value===input[field.key])?.label||String(input[field.key])):f(input[field.key],5))}</td><td>${e(field.unit||'')}</td></tr>`).join('')}</tbody></table>${resultMarkup(result,def,input,true)}${comparisonMarkup(def,baseline,input,{report:true})}<h3>สมมติฐาน</h3><ul>${def.assumptions.map(x=>`<li>${e(x)}</li>`).join('')}</ul><h3>เอกสารอ้างอิง</h3>${(def.references||[]).map(ref=>`<p>${e(ref.label)}<br>${e(ref.url)}</p>`).join('')}`;
  },
  destroy:()=>{form.removeEventListener('input',handler);form.removeEventListener('change',changeHandler);form.removeEventListener('submit',submitHandler);comparisonEl.removeEventListener('click',compareHandler);}
 };
}
function resultMarkup(result,def,input,report=false){
 return `<div class="result-heading"><h2>ผลการคำนวณ</h2><span class="calculation-label">${icon('calculator')} คำนวณจากข้อมูลที่กรอก</span></div><div class="summary-grid">${result.summary.map(item=>`<div class="metric ${item.tone||'neutral'}"><span>${e(item.label)}</span><strong>${e(f(item.value,item.digits??2))}</strong><small>${e(item.unit||'')}</small></div>`).join('')}</div>${`<div class="calculation-figure"><div class="figure-label">${e(def.id==='retaining-wall'?'หน้าตัดกำแพงและระดับน้ำ':def.id==='footing'?'การสัมผัสดินใต้ฐานราก':'ภาพร่างประกอบการคำนวณ')}<small>ภาพสื่อสารแนวคิด</small></div>${calculationFigure(def.id,input,result.values)}<span class="figure-caption">${e(figureCaption(def.id,input))}</span></div>`}${result.checks?.length?`<div class="check-panel"><h3>รายการที่ตรวจในแบบจำลอง</h3>${result.checks.map(check=>`<div class="check-row ${check.pass===true?'pass':check.pass===false?'fail':'unassessed'}"><span class="check-icon">${icon(check.pass===true?'check':'info')}</span><div><strong>${e(check.label)}</strong><p>${e(check.detail)}</p></div><span class="check-status">${check.pass===true?'ผ่าน':check.pass===false?'ไม่ผ่าน':'ไม่ประเมิน'}</span></div>`).join('')}</div>`:''}${result.table?`<div class="result-table table-scroll"><table><thead><tr>${result.table.headers.map(x=>`<th>${e(x)}</th>`).join('')}</tr></thead><tbody>${result.table.rows.map(row=>`<tr>${row.map(x=>`<td>${e(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:''}<${report?'section':'details'} class="calculation-steps" ${report?'':'open'}>${report?'<h3>วิธีคำนวณ</h3>':`<summary>${icon('book')} ที่มาของผลลัพธ์และวิธีคำนวณ</summary>`}<div class="steps-content">${result.steps.map((step,i)=>`<div class="formula-step"><span class="step-index">${i+1}</span><div><h4>${e(step.title)}</h4><code>${e(step.formula)}</code>${step.substitution?`<p class="substitution">${e(step.substitution)}</p>`:''}<strong>${e(step.result)}</strong></div></div>`).join('')}</div></${report?'section':'details'}>${result.notes?.length?`<aside class="result-notes">${icon('info')}<div>${result.notes.map(x=>`<p>${e(x)}</p>`).join('')}</div></aside>`:''}`;
}
function figureCaption(id,p){if(id==='retaining-wall')return `H = ${f(p.height)} m เหนือหลังฐาน · B = ${f(p.width)} m · ระดับน้ำวัดจากใต้ฐาน`;if(id==='rc-beam')return `b = ${f(p.b)} mm · d = ${f(p.d)} mm · ${f(p.count,0)} DB ${f(p.diameter)} mm`;if(id==='rc-slab')return `แถบพื้น 1,000 mm · d = ${f(p.d)} mm · DB ${f(p.diameter)} @ ${f(p.spacing)} mm`;if(id==='footing')return `B × L = ${f(p.width)} × ${f(p.length)} m · N = ${f(p.normal)} kN · M = ${f(p.moment)} kN·m`;return 'ภาพร่างไม่ใช่แบบก่อสร้างและไม่ได้อิงมาตราส่วน';}
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
 document.querySelector('#project-name').value=record.name;
 document.querySelector('#save-status').textContent='บันทึกงานแล้ว · '+new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})+(cleared?'':' · ล้างร่างเก่าไม่ได้');
 notify(conflict?'งานเดิมถูกแก้ไขจากอีกแท็บ จึงเก็บการแก้ไขนี้เป็นสำเนาใหม่':cleared?'บันทึกงานแล้ว เปิดต่อได้จาก “งานของฉัน”':'บันทึกงานแล้ว แต่ล้างร่างเก่าไม่ได้ กรุณาสำรอง JSON');
 const count=document.querySelector('.nav-count');if(count)count.textContent=saved.length;
}
function effectiveProject(record){return resolveProjectForTool(record.toolId,{project:record,draft:readDraft(record.toolId,record.id),saved});}
function duplicateProject(record=null){
 const source=record?effectiveProject(record).project:current&&mounted?{toolId:current.tool.id,name:document.querySelector('#project-name').value||current.name,data:mounted.getState()}:null;
 if(!source)return;
 const now=new Date().toISOString();
 const copy={schemaVersion:1,id:uniqueId(),toolId:source.toolId,name:(source.name+' — สำเนา').slice(0,180),createdAt:now,updatedAt:now,data:JSON.parse(JSON.stringify(source.data))};
 const next=[copy,...readSavedProjects()];
 if(!write(KEYS.projects,next))return;
 saved=next;history.replaceState(null,'',`#tool/${copy.toolId}`);renderTool(copy.toolId,copy);
 try{persistToolPointer(localStorage,copy.toolId,copy.id);}catch{}
 notify('สร้างสำเนาแล้ว ปรับทางเลือกใหม่ได้โดยเก็บงานต้นฉบับไว้');
}
function exportProject(record){const p=record|| (current&&mounted?{schemaVersion:1,toolId:current.tool.id,name:document.querySelector('#project-name').value||current.name,updatedAt:new Date().toISOString(),data:mounted.getState()}:null);if(!p)return;download(`engapp-${p.toolId}-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(p,null,2),'application/json');notify('ส่งออกไฟล์งาน JSON แล้ว');}
function importProject(){const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.hidden=true;document.body.append(file);file.addEventListener('cancel',()=>file.remove(),{once:true});file.addEventListener('change',async()=>{const selected=file.files?.[0];file.remove();if(!selected)return;if(selected.size>8*1024*1024){notify('ไฟล์งานต้องไม่เกิน 8 MB');return;}try{const data=JSON.parse(await selected.text());if(data.schemaVersion!==1||!catalog.some(t=>t.id===data.toolId)||typeof data.name!=='string'||data.name.length>180||!data.data||typeof data.data!=='object'||Array.isArray(data.data))throw new Error('รูปแบบไฟล์ ENG APP ไม่ถูกต้อง');data.id=null;history.replaceState(null,'',`#tool/${data.toolId}`);renderTool(data.toolId,data);notify(mounted?'เปิดไฟล์แล้ว กดบันทึกเพื่อเก็บไว้ในงานของฉัน':'ข้อมูลในไฟล์ไม่ผ่านการตรวจ ดูรายละเอียดบนหน้าจอ');}catch(error){notify('เปิดไฟล์ไม่ได้: '+error.message);}});file.click();}
function projectReport(){
 if(!current||!mounted)throw new Error('กรุณาเปิดงานก่อนสร้างรายงาน');
 const report=mounted.getReport();
 return `<header class="print-heading"><span>ENG APP / รายงานงาน</span><h1>${e(document.querySelector('#project-name').value||current.name)}</h1><p>${e(current.tool.title)} · ${today()} · รุ่น ${APP_VERSION}</p></header>${report}<footer class="print-footer">สร้างโดย ENG APP · ค่าตั้งต้นเป็นตัวอย่าง · ตรวจข้อมูล สมมติฐาน และขอบเขตก่อนนำไปใช้งาน</footer>`;
}
function printProject(){
 try{
  const content=projectReport();
  showModal(`<div class="modal-backdrop"><section class="modal report-modal" role="dialog" aria-modal="true" aria-label="ตัวอย่างรายงาน"><div class="report-toolbar"><div><strong>ตัวอย่างรายงาน</strong><p>ตรวจข้อมูล แล้วเลือกพิมพ์หรือ Save as PDF</p></div><button class="button primary compact" data-action="print-confirm">${icon('print')} พิมพ์ / บันทึก PDF</button><button class="icon-button" data-action="close-modal" aria-label="ปิดตัวอย่างรายงาน">${icon('close')}</button></div><div class="report-preview">${content}</div></section></div>`);
  document.querySelector('[data-action="print-confirm"]').focus();
 }catch(error){notify('ยังพิมพ์ผลไม่ได้: '+error.message);}
}
function preparePrint(){
 document.body.classList.remove('printing-report');document.querySelector('#print-root').innerHTML='';
 if(!current||!mounted)return;
 try{document.querySelector('#print-root').innerHTML=projectReport();document.body.classList.add('printing-report');}
 catch(error){notify('ยังพิมพ์ผลไม่ได้: '+error.message);}
}

function projectDate(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}):'ยังไม่มีวันที่บันทึก';}
function renderProjects(){
 cleanup();current=null;saved=readSavedProjects();document.title='งานของฉัน | ENG APP';
 app.innerHTML=header('projects')+`<main id="main" class="page-shell projects-page"><div class="workspace-title"><div><span class="eyebrow">MY WORKSPACE</span><h1>งานของฉัน</h1><p>เปิดงานเดิม ทำสำเนาลองทางเลือก และเก็บผลคำนวณต่อได้</p></div><button class="button primary" data-action="import">${icon('upload')} เปิดไฟล์ JSON</button></div>${saved.length?`<div class="project-toolbar"><label class="search-input">${icon('search')}<input id="project-search" type="search" value="${e(projectFilters.search)}" placeholder="ค้นหาชื่องานหรือเครื่องมือ..." aria-label="ค้นหางานที่บันทึก"></label><label class="project-sort">เรียงตาม<select id="project-sort"><option value="updated" ${projectFilters.sort==='updated'?'selected':''}>แก้ไขล่าสุด</option><option value="name" ${projectFilters.sort==='name'?'selected':''}>ชื่อโครงการ</option><option value="tool" ${projectFilters.sort==='tool'?'selected':''}>ชนิดเครื่องมือ</option></select></label></div><div id="project-results" aria-live="polite"></div>`:`<div class="empty-state large">${icon('folder')}<h2>เริ่มต้นงานแรกของคุณ</h2><p>เลือกเครื่องมือ ปรับข้อมูล แล้วกด “บันทึกงาน”</p><a class="button primary" href="#">เลือกเครื่องมือ</a></div>`}<aside class="storage-note">${icon('info')}<div><strong>ไฟล์ JSON คือสำเนางานที่ย้ายเครื่องได้</strong><span>ป้าย “มีร่างแก้ไข” หมายถึงมีข้อมูลใหม่กว่าที่บันทึกไว้ เปิดงานหรือส่งออกเพื่อใช้ร่างล่าสุดได้</span></div></aside></main>`+footer();
 document.querySelector('#project-search')?.addEventListener('input',event=>{projectFilters.search=event.target.value;renderProjectCards();});
 document.querySelector('#project-sort')?.addEventListener('change',event=>{projectFilters.sort=event.target.value;renderProjectCards();});
 renderProjectCards();window.scrollTo(0,0);
}
function renderProjectCards(){
 const root=document.querySelector('#project-results');if(!root)return;
 const words=projectFilters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
 const records=saved.map(record=>{const resolved=effectiveProject(record);return {...resolved.project,fromDraft:resolved.fromDraft,tool:catalog.find(tool=>tool.id===record.toolId)};}).filter(p=>words.every(word=>(p.name+' '+p.tool.title+' '+p.tool.en).toLowerCase().includes(word)));
 records.sort((a,b)=>projectFilters.sort==='name'?a.name.localeCompare(b.name,'th'):projectFilters.sort==='tool'?a.tool.title.localeCompare(b.tool.title,'th')||a.name.localeCompare(b.name,'th'):(Date.parse(b.updatedAt)||0)-(Date.parse(a.updatedAt)||0));
 root.innerHTML=`<div class="project-result-line"><span>พบ <strong>${records.length}</strong> จาก ${saved.length} งาน</span><span>เก็บในเบราว์เซอร์นี้</span></div>`+(records.length?`<div class="project-grid">${records.map(p=>`<article class="project-card"><div class="project-card-top"><span class="project-icon">${icon(p.tool.kind==='calculator'?'calculator':'folder')}</span>${p.fromDraft?'<span class="draft-badge">มีร่างแก้ไข</span>':'<span class="saved-badge">บันทึกแล้ว</span>'}</div><span class="project-type">${e(p.tool.title)}</span><h2>${e(p.name)}</h2><p>${icon('clock')} ${e(projectDate(p.updatedAt))}</p><div class="project-card-actions"><button class="button primary compact" data-open-project="${e(p.id)}">เปิดงาน</button><button class="button light compact" data-copy-project="${e(p.id)}">ทำสำเนา</button><button class="button light compact" data-export-project="${e(p.id)}" aria-label="ส่งออก JSON ${e(p.name)}">${icon('download')} JSON</button><button class="link-button muted" data-delete-project="${e(p.id)}" aria-label="ลบ ${e(p.name)}">ลบ</button></div></article>`).join('')}</div>`:`<div class="empty-state">${icon('search')}<h2>ยังไม่พบงานที่ตรงกัน</h2><p>ลองค้นด้วยชื่อโครงการหรือชื่อเครื่องมือ</p><button class="button light" data-action="clear-project-search">ล้างคำค้น</button></div>`);
}
function about(){const root=document.querySelector('#modal-root');showModal(`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="about-title"><button class="icon-button modal-close" data-action="close-modal" aria-label="ปิดหน้าต่าง">${icon('close')}</button><span class="eyebrow">ABOUT ENG APP</span><h2 id="about-title">เครื่องมือที่ตรวจที่มาได้</h2><p>ENG APP เป็นงานเขียนขึ้นใหม่จากแนวทางหน้ารวมเครื่องมือวิศวกรรมที่มองเห็นได้สาธารณะ มี 20 เครื่องมือในขอบเขตที่ระบุไว้บนแต่ละหน้าจอ</p><p>เครื่องมือโครงสร้างเป็นการตรวจเบื้องต้นตามสมมติฐานที่แสดง พร้อมสูตรและแหล่งอ้างอิง ราคาและโครงการตั้งต้นเป็นข้อมูลตัวอย่างที่แก้ไขได้</p><p>ข้อมูลเก็บในเบราว์เซอร์นี้ ส่งออก JSON เพื่อสำรองงาน และพิมพ์รายงานเป็น PDF จากเมนูพิมพ์ของเบราว์เซอร์ได้</p><a class="button primary" href="https://github.com/saratchai1/eng-app" target="_blank" rel="noopener">ดูซอร์สโค้ดและขอบเขต</a></section></div>`);root.querySelector('button').focus();}
function reset(){if(!current)return;const toolId=current.tool.id;const root=document.querySelector('#modal-root');showModal(`<div class="modal-backdrop"><section class="modal small" role="dialog" aria-modal="true" aria-labelledby="reset-title"><h2 id="reset-title">เริ่มจากตัวอย่างใหม่?</h2><p>ข้อมูลที่แก้ไขในหน้าปัจจุบันจะถูกแทนด้วยค่าตัวอย่าง งานที่กดบันทึกไว้ยังเปิดได้จาก “งานของฉัน”</p><div class="modal-actions"><button class="button light" data-action="close-modal">กลับไปแก้ไข</button><button class="button primary" data-action="confirm-reset">เริ่มตัวอย่างใหม่</button></div></section></div>`);root.querySelector('button').focus();}
function route(){if(document.querySelector('#modal-root').firstElementChild)closeModal();const hash=location.hash.slice(1);if(hash==='projects')renderProjects();else if(hash.startsWith('tool/'))renderTool(hash.slice(5));else if(hash==='tools'){if(current||!document.querySelector('#tools'))renderHome();document.querySelector('#tools').scrollIntoView({behavior:'smooth'});}else renderHome();}

document.addEventListener('click',event=>{
 const skip=event.target.closest('a.skip-link');if(skip){event.preventDefault();const main=document.querySelector('#main');if(main){main.tabIndex=-1;main.focus();main.scrollIntoView({block:'start'});}return;}
 const copyButton=event.target.closest('[data-copy-project]');if(copyButton){const record=saved.find(p=>p.id===copyButton.dataset.copyProject);if(record)duplicateProject(record);return;}
 const favorite=event.target.closest('[data-favorite]');if(favorite){const id=favorite.dataset.favorite;const focused=document.activeElement===favorite;favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];write(KEYS.favorites,favorites);renderCatalog();const count=document.querySelector('[data-action="favorites"]>span');if(count)count.textContent=favorites.length;if(focused)document.querySelector('[data-favorite="'+id+'"]')?.focus({preventScroll:true});return;}
 const category=event.target.closest('[data-category]');if(category){filters.category=category.dataset.category;document.querySelectorAll('[data-category]').forEach(b=>{b.classList.toggle('selected',b===category);b.setAttribute('aria-pressed',String(b===category));});renderCatalog();return;}
 const projectButton=event.target.closest('[data-open-project]');if(projectButton){const p=saved.find(x=>x.id===projectButton.dataset.openProject);if(p){history.replaceState(null,'',`#tool/${p.toolId}`);renderTool(p.toolId,p);}return;}
 const exportButton=event.target.closest('[data-export-project]');if(exportButton){const record=saved.find(x=>x.id===exportButton.dataset.exportProject);if(record)exportProject(effectiveProject(record).project);return;}
 const deleteButton=event.target.closest('[data-delete-project]');if(deleteButton){const id=deleteButton.dataset.deleteProject;const p=saved.find(x=>x.id===id);const root=document.querySelector('#modal-root');showModal(`<div class="modal-backdrop"><section class="modal small" role="dialog" aria-modal="true" aria-label="ยืนยันลบงาน"><h2>ลบงานที่บันทึกไว้?</h2><p>${e(p?.name)}</p><p>ส่งออก JSON เก็บไว้ก่อน หากต้องการนำกลับมาใช้</p><div class="modal-actions"><button class="button light" data-action="close-modal">ยกเลิก</button><button class="button primary" data-confirm-delete="${e(id)}">ลบงานนี้</button></div></section></div>`);root.querySelector('button').focus();return;}
 const confirmDelete=event.target.closest('[data-confirm-delete]');if(confirmDelete){const id=confirmDelete.dataset.confirmDelete;saved=readSavedProjects();const removed=saved.find(x=>x.id===id);const next=saved.filter(x=>x.id!==id);if(write(KEYS.projects,next)){saved=next;const draftCleared=!removed||clearDraft(removed.toolId,id);closeModal();renderProjects();notify(draftCleared?'ลบงานแล้ว':'ลบงานที่บันทึกแล้ว แต่ล้างสำรองชั่วคราวไม่ได้');}return;}
 const button=event.target.closest('[data-action]');if(!button)return;
 const action=button.dataset.action;
 if(action==='save')saveProject();else if(action==='view-results'){document.querySelector('#calc-result')?.scrollIntoView({behavior:'smooth',block:'start'});}else if(action==='duplicate')duplicateProject();else if(action==='clear-project-search'){projectFilters.search='';const search=document.querySelector('#project-search');if(search){search.value='';search.focus();}renderProjectCards();}else if(action==='export')exportProject();else if(action==='import')importProject();else if(action==='print')printProject();else if(action==='print-confirm')window.print();else if(action==='projects')location.hash='projects';else if(action==='favorites'){filters.favorites=!filters.favorites;renderHome();}else if(action==='clear-filter'){filters={search:'',category:'all',favorites:false};renderHome();}else if(action==='about')about();else if(action==='close-modal')closeModal();else if(action==='reset')reset();else if(action==='confirm-reset'){const id=current.tool.id;const projectId=current.id;closeModal();cleanup({save:false});current=null;const cleared=clearDraft(id,projectId);renderTool(id,{name:catalog.find(x=>x.id===id).title+' — งานตัวอย่าง',data:{}});if(!cleared){document.querySelector('#save-status').textContent='เริ่มตัวอย่างใหม่แล้ว · ล้างสำรองเก่าไม่ได้';notify('ล้างสำรองชั่วคราวของเครื่องมือนี้ไม่ได้ กรุณาส่งออก JSON หากต้องการเก็บงานใหม่');}}
});
document.addEventListener('keydown',event=>{
 const modal=document.querySelector('.modal');
 if(event.key==='Escape'&&modal){event.preventDefault();closeModal();return;}
 if((event.ctrlKey||event.metaKey)&&!event.altKey&&current&&mounted){
  if(event.key.toLowerCase()==='s'&&!modal){event.preventDefault();saveProject();return;}
  if(event.key.toLowerCase()==='p'){event.preventDefault();printProject();return;}
 }
 if(event.key==='/'&&!modal&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){
  const search=document.querySelector('#tool-search,#project-search');if(search){event.preventDefault();search.focus();}
 }
 if(event.key==='Tab'&&modal){
  const elements=[...modal.querySelectorAll('a[href],button,input,select,textarea')].filter(el=>!el.disabled&&el.getClientRects().length);
  const first=elements[0],last=elements.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 }
});
window.addEventListener('beforeprint',preparePrint);
window.addEventListener('afterprint',()=>document.body.classList.remove('printing-report'));
window.addEventListener('hashchange',route);
window.addEventListener('pagehide',saveDraft);
route();
