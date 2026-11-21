import {escapeHTML as e, format as f, uniqueId} from './utils.js';
import {icon} from './visuals.js';

export const MAX_DESIGN_OPTIONS = 4;
const fieldsOf = definition => definition.inputGroups.flatMap(group => group.fields);
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const isNumber = value => typeof value === 'number' && Number.isFinite(value);
const cleanText = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0,max) : '';
const validId = value => typeof value === 'string' && value!=='current' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value);
const emptyState = definition => ({schemaVersion:1,toolId:definition.id,options:[],includeInReport:false});

/** Only defined primitive inputs are portable. Missing/invalid values never get defaults. */
export function designOptionInputs(definition, source) {
  if (!isObject(source)) throw new Error('ข้อมูลทางเลือกไม่ครบ กรุณาเก็บทางเลือกจากข้อมูลที่คำนวณได้');
  const inputs={};
  for (const field of fieldsOf(definition)) {
    const value=source[field.key];
    const valid=Object.hasOwn(source,field.key) && (field.type==='select'
      ? field.options.some(option=>option.value===value)
      : isNumber(value) && value>=(field.min??-Infinity) && value<=(field.max??Infinity) && (field.step!==1 || Number.isInteger(value)));
    if (!valid) throw new Error(`${field.label}: ข้อมูลทางเลือกไม่อยู่ในขอบเขตที่เครื่องมือรองรับ`);
    inputs[field.key]=value;
  }
  return inputs;
}

function calculate(definition, inputs) {
  const result=definition.calculate({...inputs});
  if (!isObject(result) || !Array.isArray(result.summary) || result.summary.some(metric=>!isObject(metric) || (typeof metric.value==='number' && !Number.isFinite(metric.value)))) throw new Error('แบบจำลองไม่สามารถให้ผลลัพธ์ที่อ่านได้');
  return result;
}

/** A snapshot stores inputs and the user's reasoning; computed answers are never stored. */
export function captureDesignOption(definition, values, {id=uniqueId(),label='ทางเลือก',note=''}={}) {
  if (!validId(id)) throw new Error('รหัสทางเลือกไม่ถูกต้อง');
  const inputs=designOptionInputs(definition,values);
  calculate(definition,inputs);
  return {id,label:cleanText(label,80)||'ทางเลือก',note:cleanText(note,1200),inputs};
}

/** Invalid imports are excluded and report inclusion is cleared so partial sets are explicit. */
export function restoreDesignOptions(definition, value) {
  const state=emptyState(definition);
  if (value===undefined || value===null) return {state,rejected:0,notice:''};
  if (!isObject(value) || value.schemaVersion!==1 || value.toolId!==definition.id || !Array.isArray(value.options) || typeof value.includeInReport!=='boolean') return {state,rejected:1,notice:'การตั้งค่าทางเลือกในไฟล์ไม่ตรงกับเครื่องมือนี้ จึงเริ่มชุดทางเลือกใหม่'};
  let rejected=Math.max(0,value.options.length-MAX_DESIGN_OPTIONS);
  const seen=new Set();
  for (const item of value.options.slice(0,MAX_DESIGN_OPTIONS)) {
    try {
      if (!isObject(item) || !validId(item.id) || seen.has(item.id)) throw new Error('รหัสทางเลือกซ้ำหรือไม่ถูกต้อง');
      const option=captureDesignOption(definition,item.inputs,item);
      seen.add(option.id);state.options.push(option);
    } catch {rejected++;}
  }
  state.includeInReport=value.includeInReport && !rejected && state.options.length>0;
  return {state,rejected,notice:rejected?`ไม่นำเข้าทางเลือก ${rejected} รายการที่เกินขอบเขต ซ้ำ หรือข้อมูลไม่ถูกต้อง โปรดตรวจชุดที่เหลือก่อนเลือกแนบรายงาน`:''};
}

export function designOptionApplication(definition, option) {
  if (!isObject(option)) throw new Error('ไม่พบทางเลือกนี้');
  const restored=captureDesignOption(definition,option.inputs,option);
  return {id:restored.id,label:restored.label,inputs:{...restored.inputs}};
}

const assessment = result => {
  const checks=Array.isArray(result?.checks)?result.checks:[];
  return {pass:checks.filter(check=>check.pass===true).length,fail:checks.filter(check=>check.pass===false).length,unassessed:checks.filter(check=>check.pass!==true&&check.pass!==false).length,total:checks.length};
};

/** All columns are evaluated afresh, including when the working inputs are temporarily invalid. */
export function evaluateDesignOptions(definition, state, currentInputs) {
  const evaluate=(option,isCurrent=false)=>{
    try {
      const inputs=designOptionInputs(definition,option.inputs);
      const result=calculate(definition,inputs);
      return {...option,inputs,isCurrent,result,assessment:assessment(result),error:null};
    } catch (error) {return {...option,isCurrent,result:null,assessment:null,error:error.message};}
  };
  const current=evaluate({id:'current',label:'ข้อมูลปัจจุบัน',note:'',inputs:currentInputs},true);
  const options=(Array.isArray(state?.options)?state.options:[]).slice(0,MAX_DESIGN_OPTIONS).map(option=>evaluate(option));
  const columns=[current,...options];
  const metrics=[];const seen=new Set();
  for (const column of columns) for (const metric of column.result?.summary||[]) {
    const key=JSON.stringify([metric.label,metric.unit||'']);
    if (!seen.has(key)) {seen.add(key);metrics.push({label:metric.label,unit:metric.unit||'',digits:Math.max(0,Math.min(8,metric.digits??2))});}
  }
  const changedFields=fieldsOf(definition).filter(field=>options.some(option=>option.inputs?.[field.key]!==currentInputs?.[field.key]));
  const checks=[];const checkLabels=new Set();
  for (const column of columns) for (const check of column.result?.checks||[]) if (!checkLabels.has(check.label)) {checkLabels.add(check.label);checks.push(check.label);}
  return {columns,metrics,changedFields,checks};
}

const metricAt = (column, metric) => column.result?.summary.find(item=>item.label===metric.label && (item.unit||'')===metric.unit);
const metricText = (value,digits=2) => value===null || value===undefined ? 'ไม่ประเมิน' : f(value,digits);
const inputText = (field,value) => field.type==='select' ? field.options.find(option=>option.value===value)?.label||'ไม่ระบุ' : isNumber(value)?f(value,6):'ข้อมูลไม่ถูกต้อง';
const deltaText = (value,digits) => `${value>0?'+':''}${f(value,digits)}`;
const checkText = value => value===true?'ผ่าน':value===false?'ไม่ผ่าน':'ไม่ประเมิน';
const checkClass = value => value===true?'is-pass':value===false?'is-fail':'is-unassessed';

function assessmentMarkup(column) {
  if (column.error) return `<span class="option-status is-invalid">ข้อมูลไม่เข้าเงื่อนไข</span><small class="option-error-detail">${e(column.error)}</small>`;
  const counts=column.assessment;
  if (!counts.total) return '<span class="option-status is-unassessed">ไม่มีรายการผ่าน / ไม่ผ่าน</span>';
  return `<div class="option-counts"><span class="is-pass">ผ่าน <b>${counts.pass}</b></span><span class="${counts.fail?'is-fail':''}">ไม่ผ่าน <b>${counts.fail}</b></span><span>ไม่ประเมิน <b>${counts.unassessed}</b></span></div>`;
}

function columnHeading(column,index,interactive) {
  if (column.isCurrent) return `<span class="option-column-code">${interactive?'WORKING':'CURRENT SNAPSHOT'}</span><strong>ข้อมูลปัจจุบัน</strong><small>${interactive?'ปรับได้จากข้อมูลเข้า':'ชุดที่ใช้สร้างรายงาน'}</small>`;
  const code=`OPTION ${String(index).padStart(2,'0')}`;
  if (!interactive) return `<span class="option-column-code">${code}</span><strong>${e(column.label)}</strong>`;
  return `<span class="option-column-code">${code}</span><label class="option-name-label"><span class="option-visually-hidden">ชื่อทางเลือก ${index}</span><input data-option-edit="label" data-option-id="${e(column.id)}" maxlength="80" value="${e(column.label)}" aria-label="ชื่อทางเลือก ${index}"></label><div class="option-column-actions"><button type="button" class="option-use" data-option-action="apply" data-option-id="${e(column.id)}" aria-label="ใช้ทางเลือก ${e(column.label)}" ${column.error?'disabled':''}>ใช้ชุดนี้ ${icon('external')}</button><button type="button" class="option-remove" data-option-action="remove" data-option-id="${e(column.id)}" aria-label="ลบทางเลือก ${e(column.label)}">ลบ</button></div>`;
}

function tableMarkup(study,{interactive=false}={}) {
  const {columns,metrics}=study;
  return `<div class="options-table-wrap" tabindex="0" role="region" aria-label="ตารางเปรียบเทียบผลลัพธ์ทางเลือก"><table class="options-matrix" style="--option-columns:${columns.length}"><thead><tr><th scope="col"><span class="option-column-code">DESIGN REVIEW</span><strong>ผลลัพธ์ / หน่วย</strong></th>${columns.map((column,index)=>`<th scope="col" class="${column.isCurrent?'option-working-column':''}">${columnHeading(column,index,interactive)}</th>`).join('')}</tr></thead><tbody>${metrics.map(metric=>{
    const currentValue=metricAt(columns[0],metric)?.value;
    return `<tr><th scope="row">${e(metric.label)}<small>${e(metric.unit)}</small></th>${columns.map(column=>{
      const output=metricAt(column,metric),value=output?.value;
      const delta=!column.isCurrent && isNumber(value) && isNumber(currentValue)?value-currentValue:null;
      const nonzero=delta!==null && Math.abs(delta)>1e-12*Math.max(1,Math.abs(value),Math.abs(currentValue));
      return `<td class="${column.isCurrent?'option-working-column':''}"><strong>${column.error?'—':e(metricText(value,metric.digits))}</strong>${nonzero?`<small class="option-delta">Δ ${e(deltaText(delta,Math.max(3,metric.digits)))}${metric.unit==='%'?' จุดเปอร์เซ็นต์':''}</small>`:''}</td>`;
    }).join('')}</tr>`;
  }).join('')}<tr class="option-assessment-row"><th scope="row">รายการตรวจในแบบจำลอง<small>แยกจากการตรวจทานโดยคน</small></th>${columns.map(column=>`<td class="${column.isCurrent?'option-working-column':''}">${assessmentMarkup(column)}</td>`).join('')}</tr><tr class="option-note-row"><th scope="row">เหตุผล / ประเด็นพิจารณา<small>บันทึกประกอบทางเลือก</small></th>${columns.map((column,index)=>`<td class="${column.isCurrent?'option-working-column':''}">${column.isCurrent?`<span class="option-working-note">${interactive?'เก็บชุดข้อมูลเพื่อบันทึกเหตุผลของทางเลือก':'ชุดข้อมูลปัจจุบัน ณ เวลาสร้างรายงาน'}</span>`:interactive?`<label><span class="option-visually-hidden">บันทึกทางเลือก ${index}</span><textarea data-option-edit="note" data-option-id="${e(column.id)}" maxlength="1200" rows="3" aria-label="บันทึกทางเลือก ${index}" placeholder="เหตุผลที่เก็บ / ประเด็นที่ต้องตรวจ">${e(column.note)}</textarea></label>`:`<span class="option-report-note">${e(column.note||'ยังไม่มีบันทึก')}</span>`}</td>`).join('')}</tr></tbody></table></div>`;
}

function inputDifferencesMarkup(study,{report=false}={}) {
  const {columns,changedFields}=study;
  if (!changedFields.length) return '<p class="options-identical">ข้อมูลของทุกทางเลือกตรงกับชุดปัจจุบัน</p>';
  const table=`<div class="options-table-wrap" tabindex="0" role="region" aria-label="ตารางข้อมูลที่ต่างกัน"><table class="options-input-matrix" style="--option-columns:${columns.length}"><thead><tr><th scope="col">ข้อมูล / หน่วย</th>${columns.map(column=>`<th scope="col" data-option-heading="${e(column.id)}">${e(column.label)}</th>`).join('')}</tr></thead><tbody>${changedFields.map(field=>`<tr><th scope="row">${e(field.label)}<small>${e(field.unit||'')}</small></th>${columns.map(column=>`<td class="${column.isCurrent?'option-working-column':column.inputs?.[field.key]!==columns[0].inputs?.[field.key]?'option-changed-input':''}">${e(inputText(field,column.inputs?.[field.key]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return report?`<section class="options-report-differences"><h3>ข้อมูลที่ต่างกัน ${changedFields.length} รายการ</h3>${table}</section>`:`<details class="options-input-details"><summary>ดูข้อมูลที่ต่างกัน <span>${changedFields.length} รายการ</span></summary>${table}<p>ช่องที่เน้นสีคือข้อมูลที่ต่างจากชุดปัจจุบัน</p></details>`;
}

function checksMarkup(study,{report=false}={}) {
  if (!study.checks.length) return '';
  const table=`<div class="options-table-wrap" tabindex="0" role="region" aria-label="ตารางรายการตรวจแต่ละทางเลือก"><table class="options-check-matrix" style="--option-columns:${study.columns.length}"><thead><tr><th scope="col">รายการตรวจ</th>${study.columns.map(column=>`<th scope="col" data-option-heading="${e(column.id)}">${e(column.label)}</th>`).join('')}</tr></thead><tbody>${study.checks.map(label=>`<tr><th scope="row">${e(label)}</th>${study.columns.map(column=>{
    const check=column.result?.checks?.find(item=>item.label===label);
    return `<td><span class="option-status ${checkClass(check?.pass)}">${checkText(check?.pass)}</span>${check?.detail?`<small>${e(check.detail)}</small>`:''}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table></div>`;
  return report?`<section class="options-report-checks"><h3>รายละเอียดรายการตรวจ</h3>${table}</section>`:`<details class="options-input-details"><summary>ดูรายละเอียดรายการตรวจ <span>${study.checks.length} รายการ</span></summary>${table}</details>`;
}

/** Inclusion is explicit, and no persisted/imported result can enter a report. */
export function designOptionsReport(definition,currentInputs,state) {
  if (state?.includeInReport!==true) return '';
  const restored=restoreDesignOptions(definition,state);
  if (restored.rejected || !restored.state.options.length) throw new Error('ชุดทางเลือกที่จะแนบรายงานไม่ถูกต้อง กรุณาตรวจทางเลือกก่อนสร้างรายงาน');
  const study=evaluateDesignOptions(definition,restored.state,currentInputs);
  if (study.columns.some(column=>column.error)) throw new Error('ข้อมูลปัจจุบันหรือทางเลือกไม่เข้าเงื่อนไข กรุณาแก้ข้อมูลก่อนแนบรายงาน');
  return `<section class="design-options-report"><h2>การเปรียบเทียบทางเลือก</h2><p>ข้อมูลปัจจุบันเทียบกับทางเลือกที่เก็บ ${restored.state.options.length} ชุด · ผลทุกชุดคำนวณใหม่ด้วยแบบจำลองเดียวกัน</p>${tableMarkup(study)}${inputDifferencesMarkup(study,{report:true})}${checksMarkup(study,{report:true})}<p class="options-boundary-note">Δ = ทางเลือก − ข้อมูลปัจจุบัน · ข้อมูลที่มากขึ้นไม่หมายถึงดีกว่าเสมอ การเปรียบเทียบนี้ไม่จัดอันดับและไม่ยืนยันการอนุมัติแบบ รายการตรวจยังอยู่ภายใต้สมมติฐานของเครื่องมือ</p></section>`;
}

export function mountDesignOptions(host,definition,{getInputs,onApply,onChange=()=>{},notify=()=>{},initialState}={}) {
  const restored=restoreDesignOptions(definition,initialState);
  let state=restored.state,notice=restored.notice,lastRemoved=null,disposed=false;
  const getState=()=>({schemaVersion:1,toolId:definition.id,options:state.options.map(option=>({id:option.id,label:cleanText(option.label,80)||'ทางเลือก',note:cleanText(option.note,1200),inputs:{...option.inputs}})),includeInReport:state.includeInReport && state.options.length>0});
  let lastSerialized=JSON.stringify(getState());
  const changed=()=>{const next=JSON.stringify(getState());if(next!==lastSerialized){lastSerialized=next;onChange();}};
  host.innerHTML=`<section class="design-options-workbench" aria-label="ชุดทางเลือกสำหรับทบทวนแบบ"><header class="options-heading"><div><span class="options-kicker">DESIGN OPTIONS</span><h2>วางทางเลือกไว้บนโต๊ะเดียวกัน</h2><p>เก็บข้อมูลแต่ละชุด พร้อมเหตุผล แล้วเปรียบเทียบผลและรายการตรวจจากแบบจำลองเดียวกัน</p></div><div class="options-capacity"><strong data-options-count>0</strong><span> / ${MAX_DESIGN_OPTIONS}</span><small>ทางเลือกที่เก็บ</small></div></header><form class="options-capture-form"><label><span>ชื่อทางเลือกใหม่</span><input data-option-new-label maxlength="80" placeholder="เช่น หน้าตัดเดิม / เพิ่มความลึก" aria-label="ชื่อทางเลือกใหม่"></label><button type="submit" class="button primary compact" data-option-action="capture">${icon('save')} เก็บค่าปัจจุบัน</button></form><div class="options-feedback" aria-live="polite"></div><div class="options-results"></div><div class="options-report-control"><label><input type="checkbox" data-option-include><span><strong>แนบชุดทางเลือกในรายงาน</strong><small>รวมค่าปัจจุบัน ทางเลือก บันทึก และข้อมูลที่ต่างกัน · คำนวณใหม่เมื่อสร้างรายงาน</small></span></label></div><p class="options-boundary-note">Δ = ทางเลือก − ข้อมูลปัจจุบัน · ค่าที่เพิ่มขึ้นไม่ได้หมายถึงดีขึ้นเสมอ การเลือกใช้ทางเลือกจะเปลี่ยนเฉพาะข้อมูลเข้าในแบบปัจจุบัน</p></section>`;
  const form=host.querySelector('.options-capture-form'),newName=host.querySelector('[data-option-new-label]'),results=host.querySelector('.options-results'),feedback=host.querySelector('.options-feedback'),include=host.querySelector('[data-option-include]');
  const focusOption=(id,action='label')=>{const selector=action==='label'?'[data-option-edit="label"]':'[data-option-action="'+action+'"]';[...host.querySelectorAll(selector)].find(node=>node.dataset.optionId===id)?.focus({preventScroll:action!=='label'});};
  const currentValid=()=>{try{calculate(definition,designOptionInputs(definition,getInputs()));return true;}catch{return false;}};
  function refresh(){
    if(disposed)return;
    const study=evaluateDesignOptions(definition,state,getInputs());
    const valid=!study.columns[0].error,full=state.options.length>=MAX_DESIGN_OPTIONS;
    host.querySelector('[data-options-count]').textContent=state.options.length;
    host.querySelector('[data-option-action="capture"]').disabled=!valid||full;
    include.checked=state.includeInReport;include.disabled=!state.options.length;
    feedback.innerHTML=`${notice?`<p class="options-import-notice">${e(notice)}</p>`:''}${!valid?`<p class="options-working-error">ยังเก็บค่าปัจจุบันไม่ได้: ${e(study.columns[0].error)}</p>`:''}${full?'<p class="options-limit-note">เก็บครบ 4 ทางเลือกแล้ว ลบชุดที่ไม่ใช้เพื่อเก็บทางเลือกใหม่</p>':''}${lastRemoved?`<div class="options-undo"><span>ลบ “${e(lastRemoved.option.label)}” แล้ว</span><button type="button" data-option-action="undo" ${full?'disabled':''}>คืนทางเลือกที่ลบ</button></div>`:''}`;
    results.innerHTML=state.options.length?`${tableMarkup(study,{interactive:true})}${inputDifferencesMarkup(study)}${checksMarkup(study)}`:'<div class="options-empty"><span class="options-empty-index">01 / 02 / 03</span><h3>เริ่มจากทางเลือกแรกของคุณ</h3><p>เก็บค่าปัจจุบัน → ปรับข้อมูลเข้า → เก็บอีกทางเลือก<br>ผลคำนวณและข้อมูลที่ต่างกันจะแสดงเทียบกันที่นี่</p></div>';
  }
  function capture(event){
    event.preventDefault();
    try{
      if(state.options.length>=MAX_DESIGN_OPTIONS)throw new Error('เก็บได้สูงสุด 4 ทางเลือก กรุณาลบชุดที่ไม่ใช้ก่อน');
      if(!currentValid())throw new Error('ตรวจข้อมูลปัจจุบันให้คำนวณได้ก่อนเก็บทางเลือก');
      let id=uniqueId();while(state.options.some(option=>option.id===id))id=uniqueId();
      const option=captureDesignOption(definition,getInputs(),{id,label:newName.value||`ทางเลือก ${state.options.length+1}`});
      state.options.push(option);newName.value='';notice='';refresh();changed();focusOption(option.id);notify(`เก็บ “${option.label}” แล้ว ปรับข้อมูลเพื่อเปรียบเทียบชุดถัดไปได้`);
    }catch(error){notify(error.message);}
  }
  function action(event){
    const button=event.target.closest('[data-option-action]');if(!button||button.dataset.optionAction==='capture')return;
    const operation=button.dataset.optionAction;
    try{
      if(operation==='undo'){
        if(!lastRemoved||state.options.length>=MAX_DESIGN_OPTIONS)return;
        const restoredId=lastRemoved.option.id;state.options.splice(Math.min(lastRemoved.index,state.options.length),0,lastRemoved.option);lastRemoved=null;refresh();changed();focusOption(restoredId);return;
      }
      const index=state.options.findIndex(option=>option.id===button.dataset.optionId),option=state.options[index];
      if(!option)return;
      if(operation==='apply'){
        const application=designOptionApplication(definition,option);
        onApply(application);refresh();focusOption(option.id,'apply');notify(`นำข้อมูล “${application.label}” มาใช้แล้ว`);
      }else if(operation==='remove'){
        lastRemoved={option:{...option,inputs:{...option.inputs}},index};state.options.splice(index,1);if(!state.options.length)state.includeInReport=false;refresh();changed();host.querySelector('[data-option-action="undo"]')?.focus({preventScroll:true});
      }
    }catch(error){notify(error.message);}
  }
  function edit(event){
    const element=event.target;
    if(element.matches('[data-option-include]')){state.includeInReport=element.checked && state.options.length>0;changed();return;}
    if(!element.matches('[data-option-edit]'))return;
    const option=state.options.find(item=>item.id===element.dataset.optionId);if(!option)return;
    if(element.dataset.optionEdit==='label'){
      option.label=element.value.slice(0,80);
      const label=cleanText(option.label,80)||'ทางเลือก';
      host.querySelectorAll('[data-option-heading]').forEach(node=>{if(node.dataset.optionHeading===option.id)node.textContent=label;});
      host.querySelectorAll('[data-option-action][data-option-id]').forEach(node=>{if(node.dataset.optionId===option.id)node.setAttribute('aria-label',`${node.dataset.optionAction==='apply'?'ใช้':'ลบ'}ทางเลือก ${label}`);});
    }else if(element.dataset.optionEdit==='note')option.note=element.value.slice(0,1200);
    changed();
  }
  form.addEventListener('submit',capture);host.addEventListener('click',action);host.addEventListener('input',edit);refresh();
  if(notice)notify(notice);
  return {importAdjusted:restored.rejected>0,getState,refresh,getReport:()=>designOptionsReport(definition,getInputs(),getState()),destroy:()=>{disposed=true;form.removeEventListener('submit',capture);host.removeEventListener('click',action);host.removeEventListener('input',edit);}};
}
