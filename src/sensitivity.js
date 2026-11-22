import {escapeHTML as e, format as f} from './utils.js';
import {icon} from './visuals.js';

const fieldsOf = definition => definition.inputGroups.flatMap(group => group.fields);
const inputSnapshot = (definition, values) => Object.fromEntries(fieldsOf(definition).map(field => [field.key, Object.hasOwn(values || {}, field.key) ? values[field.key] : field.default]));
const isNumber = value => typeof value === 'number' && Number.isFinite(value);
const metricAt = (result, index) => result.summary?.[index];

export function sensitivityFields(definition) {
  const constrainedWeights = definition.id === 'factor-k' ? ['fixed','labor','cement','steel'] : [];
  return fieldsOf(definition).filter(field => field.type !== 'select' && field.step !== 1 && isNumber(field.min) && isNumber(field.max) && field.min < field.max && !constrainedWeights.includes(field.key));
}

export function defaultSensitivityRange(field, current) {
  if (!isNumber(current) || current < field.min || current > field.max) throw new Error('ค่าปัจจุบันของตัวแปรอยู่นอกขอบเขต');
  const span = field.max - field.min;
  const half = Math.abs(current) * 0.2 || Math.abs(field.default) * 0.2 || Math.min(span * 0.05, 1);
  return {low: Math.max(field.min, current - half), high: Math.min(field.max, current + half)};
}

/** Persist settings only. Any imported answers, samples or report markup are discarded. */
export function restoreSensitivitySettings(definition, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1 || value.toolId !== definition.id || typeof value.includeInReport !== 'boolean') return null;
  const field=sensitivityFields(definition).find(item=>item.key===value.fieldKey);
  if (!field || !isNumber(value.low) || !isNumber(value.high) || value.low>=value.high || value.low<field.min || value.high>field.max || !Number.isInteger(value.metricIndex) || value.metricIndex<0) return null;
  try {
    const defaults=inputSnapshot(definition,{});
    if (!metricAt(definition.calculate(defaults),value.metricIndex)) return null;
    sampleValues(value.low,value.high,defaults[field.key]);
  } catch {return null;}
  return {schemaVersion:1,toolId:definition.id,fieldKey:field.key,metricIndex:value.metricIndex,low:value.low,high:value.high,includeInReport:value.includeInReport};
}

/** Nine sorted samples; preserve both endpoints and the current value when it is inside the range. */
function sampleValues(low, high, current) {
  const values = Array.from({length: 9}, (_, index) => index === 8 ? high : low + (high - low) * index / 8);
  if (current > low && current < high) {
    const nearest = values.slice(1,8).reduce((best, value, index) => Math.abs(value - current) < Math.abs(values[best] - current) ? index + 1 : best, 1);
    values[nearest] = current;
  }
  const sorted = [...new Set(values)].sort((a,b) => a-b);
  if (sorted.length !== 9) throw new Error('ช่วงตัวแปรแคบเกินกว่าจะแยกตัวอย่างได้ กรุณาขยายช่วง');
  return sorted;
}

export function sensitivitySegments(samples) {
  const segments = [];
  let current = [];
  for (const sample of samples) {
    if (sample.status === 'calculated' && isNumber(sample.value)) current.push(sample);
    else if (current.length) {segments.push(current); current = [];}
  }
  if (current.length) segments.push(current);
  return segments;
}

/** Reuse the exact current model with one input changed. No interpolation or design optimization. */
export function runSensitivity(definition, values, {fieldKey, metricIndex = 0, low, high}) {
  const field = sensitivityFields(definition).find(item => item.key === fieldKey);
  if (!field) throw new Error('ตัวแปรนี้ไม่รองรับการปรับแบบอิสระต่อเนื่อง');
  if (!isNumber(low) || !isNumber(high) || low >= high || low < field.min || high > field.max) throw new Error(`กำหนดค่าต่ำ < ค่าสูง ภายใน ${f(field.min,6)} ถึง ${f(field.max,6)} ${field.unit || ''}`);
  const inputs = inputSnapshot(definition, values);
  const base = definition.calculate({...inputs});
  if (!Number.isInteger(metricIndex) || metricIndex < 0 || !metricAt(base, metricIndex)) throw new Error('เลือกรายการผลลัพธ์ที่ถูกต้อง');
  const sourceMetric = metricAt(base, metricIndex);
  const metric = {index: metricIndex, label: sourceMetric.label, unit: sourceMetric.unit || '', digits: sourceMetric.digits ?? 2};
  const samples = sampleValues(low, high, inputs[fieldKey]).map((inputValue, index) => {
    try {
      const result = definition.calculate({...inputs, [fieldKey]: inputValue});
      const output = metricAt(result, metricIndex);
      if (!output || output.label !== metric.label) throw new Error('รายการผลลัพธ์เปลี่ยนระหว่างการศึกษา');
      const checks = (result.checks || []).map(check => ({label: check.label, pass: check.pass, detail: check.detail || ''}));
      const numeric = isNumber(output.value);
      if (typeof output.value === 'number' && !numeric) throw new Error('ผลลัพธ์ไม่ใช่จำนวนจำกัด');
      if (numeric && metric.unit && (output.unit || '') !== metric.unit) throw new Error('หน่วยผลลัพธ์ไม่ตรงกันระหว่างการศึกษา');
      if (numeric && !metric.unit) metric.unit = output.unit || '';
      return {index, inputValue, value: numeric ? output.value : null, status: numeric ? 'calculated' : 'unassessed', note: numeric ? '' : String(output.value ?? 'แบบจำลองไม่ประเมินค่านี้'), checks, failedChecks: checks.filter(check => check.pass === false), unassessedChecks: checks.filter(check => check.pass !== true && check.pass !== false), isCurrent: inputValue === inputs[fieldKey]};
    } catch (error) {
      return {index, inputValue, value: null, status: 'invalid', note: error.message, checks: [], failedChecks: [], unassessedChecks: [], isCurrent: inputValue === inputs[fieldKey]};
    }
  });
  return {toolId: definition.id, field: {...field}, metric, low, high, inputs, reference: {inputValue: inputs[fieldKey], value: isNumber(sourceMetric.value) ? sourceMetric.value : null}, samples, segments: sensitivitySegments(samples)};
}

/** A stale or unassessed sample cannot silently become a new design input. */
export function sensitivityApplication(definition, study, sampleIndex, currentInputs) {
  if (!study || study.toolId !== definition.id || JSON.stringify(inputSnapshot(definition, currentInputs)) !== JSON.stringify(study.inputs)) throw new Error('ข้อมูลปัจจุบันเปลี่ยนแล้ว กรุณาคำนวณความไวใหม่ก่อนใช้ค่า');
  const sample = study.samples.find(item => item.index === sampleIndex);
  if (!sample || sample.status !== 'calculated' || !isNumber(sample.value)) throw new Error('เลือกตัวอย่างที่คำนวณผลได้ก่อนใช้ค่า');
  const field = sensitivityFields(definition).find(item => item.key === study.field.key);
  if (!field || !isNumber(sample.inputValue) || sample.inputValue < field.min || sample.inputValue > field.max) throw new Error('ค่าตัวอย่างอยู่นอกขอบเขต');
  const result = definition.calculate({...inputSnapshot(definition, currentInputs), [field.key]: sample.inputValue});
  if (!isNumber(metricAt(result, study.metric.index)?.value)) throw new Error('ตัวอย่างนี้ไม่ให้ผลลัพธ์เชิงตัวเลขในแบบจำลองปัจจุบัน');
  return {fieldKey: field.key, value: sample.inputValue};
}

const outputText = sample => sample.status === 'calculated' ? f(sample.value,6) : sample.status === 'unassessed' ? 'ไม่ประเมิน' : 'ข้อมูลไม่เข้าเงื่อนไข';
const axisText = value => Math.abs(value) >= 1e6 || (value !== 0 && Math.abs(value) < 0.001) ? value.toExponential(2) : f(value,4);
const statusMarkup = sample => sample.status !== 'calculated' ? `<span class="study-status is-unassessed">${sample.status === 'invalid' ? 'ข้อมูลไม่เข้าเงื่อนไข' : 'ไม่ประเมินผล'}</span>` : sample.failedChecks.length ? `<span class="study-status is-failed">ไม่ผ่าน ${sample.failedChecks.length} รายการ</span>` : sample.unassessedChecks.length ? `<span class="study-status is-unassessed">ยังไม่ประเมิน ${sample.unassessedChecks.length} รายการ</span>` : `<span class="study-status is-calculated">${sample.checks.length ? 'ผ่านรายการตรวจในโมเดล' : 'คำนวณได้'}</span>`;

function chartMarkup(study, selected) {
  const valid = study.samples.filter(sample => sample.status === 'calculated');
  if (!valid.length) return '<div class="study-no-results"><strong>ไม่มีผลเชิงตัวเลขในช่วงนี้</strong><p>ตรวจรายละเอียดแต่ละตัวอย่างด้านล่าง แล้วปรับช่วงหรือเลือกรายการผลลัพธ์อื่น</p></div>';
  const left=82, right=738, top=22, bottom=238;
  const min=Math.min(...valid.map(sample => sample.value)), max=Math.max(...valid.map(sample => sample.value));
  const pad=(max-min)*0.1 || Math.max(Math.abs(max)*0.05,0.5);
  const yMin=min-pad,yMax=max+pad;
  const x=value=>left+(value-study.low)/(study.high-study.low)*(right-left);
  const y=value=>bottom-(value-yMin)/(yMax-yMin)*(bottom-top);
  const currentInRange=study.reference.inputValue>=study.low&&study.reference.inputValue<=study.high;
  const yTicks=Array.from({length:4},(_,i)=>yMin+(yMax-yMin)*i/3);
  const xTicks=Array.from({length:5},(_,i)=>study.low+(study.high-study.low)*i/4);
  return `<div class="study-chart-wrap"><svg class="study-chart" viewBox="0 0 760 294" role="img" aria-label="กราฟ ${e(study.metric.label)} ต่อ ${e(study.field.label)}; ตารางด้านล่างแสดงข้อมูลครบทุกจุด"><rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" class="study-plot-bg"/>${yTicks.map(value=>`<path d="M${left} ${y(value)}H${right}" class="study-grid-line"/><text x="${left-13}" y="${y(value)+4}" text-anchor="end" class="study-axis-label">${e(axisText(value))}</text>`).join('')}${xTicks.map(value=>`<path d="M${x(value)} ${bottom}v5" class="study-axis-line"/><text x="${x(value)}" y="${bottom+24}" text-anchor="middle" class="study-axis-label">${e(axisText(value))}</text>`).join('')}<path d="M${left} ${top}V${bottom}H${right}" class="study-axis-line"/>${currentInRange?`<path d="M${x(study.reference.inputValue)} ${top}V${bottom}" class="study-current-line"/>`:''}${study.segments.filter(segment=>segment.length>1).map(segment=>`<path d="${segment.map((point,index)=>`${index?'L':'M'}${x(point.inputValue)} ${y(point.value)}`).join(' ')}" class="study-response-line"/>`).join('')}${study.samples.map(sample=>sample.status==='calculated'?`<g><title>${e(f(sample.inputValue,6))} ${e(study.field.unit||'')} → ${e(f(sample.value,6))} ${e(study.metric.unit)}${sample.failedChecks.length?' · มีรายการตรวจไม่ผ่าน':''}</title>${sample.index===selected?`<circle cx="${x(sample.inputValue)}" cy="${y(sample.value)}" r="10" class="study-selected-halo"/>`:''}<circle cx="${x(sample.inputValue)}" cy="${y(sample.value)}" r="${sample.isCurrent?5.5:4.5}" class="study-point ${sample.failedChecks.length?'has-failures':''} ${sample.isCurrent?'is-current':''}"/></g>`:`<path d="M${x(sample.inputValue)-4} ${bottom-7}l8 8m-8 0l8-8" class="study-gap-mark"><title>${e(sample.note)}</title></path>`).join('')}<text x="${(left+right)/2}" y="${bottom+50}" text-anchor="middle" class="study-axis-title">${e(study.field.unit||'ค่าตัวแปร')}</text></svg></div><div class="study-chart-legend"><span><i class="study-legend-line"></i>คำนวณทีละจุด</span><span><i class="study-legend-current"></i>ค่าปัจจุบัน${currentInRange?'':'อยู่นอกช่วง'}</span><span><i class="study-legend-failed"></i>มีรายการตรวจไม่ผ่าน</span><span><i class="study-legend-gap">×</i>ไม่ประเมิน / ข้อมูลไม่เข้าเงื่อนไข</span></div>`;
}

function tableMarkup(study, selected, interactive=true) {
  return `<div class="study-table-wrap"><table class="study-table"><thead><tr>${interactive?'<th scope="col">เลือก</th>':''}<th scope="col">${e(study.field.label)}<small>${e(study.field.unit||'')}</small></th><th scope="col">${e(study.metric.label)}<small>${e(study.metric.unit)}</small></th><th scope="col">รายการตรวจในแบบจำลอง</th></tr></thead><tbody>${study.samples.map(sample=>`<tr class="${sample.isCurrent?'study-current-row ':''}${sample.index===selected?'study-selected-row':''}">${interactive?`<td><input type="radio" name="sensitivity-sample" value="${sample.index}" aria-label="เลือก ${e(f(sample.inputValue,6))} ${e(study.field.unit||'')}" ${sample.index===selected?'checked':''} ${sample.status!=='calculated'?'disabled':''}></td>`:''}<th scope="row">${e(f(sample.inputValue,6))}${sample.isCurrent?'<small class="study-current-tag">ค่าปัจจุบัน</small>':''}</th><td>${e(outputText(sample))}</td><td>${statusMarkup(sample)}${sample.note?`<small class="study-row-note">${e(sample.note)}</small>`:''}${sample.failedChecks.length||sample.unassessedChecks.length?`<details class="study-check-details"${interactive?'':' open'}><summary>ดูรายการตรวจ</summary><ul>${[...sample.failedChecks,...sample.unassessedChecks].map(check=>`<li><strong>${e(check.label)}</strong><span>${e(check.detail)}</span></li>`).join('')}</ul></details>`:''}</td></tr>`).join('')}</tbody></table></div>`;
}

export function sensitivityReport(study) {
  if (!study) return '';
  return `<section class="sensitivity-report"><h2>การศึกษาความไวของตัวแปร</h2><p>ปรับเฉพาะ ${e(study.field.label)} จาก ${e(f(study.low,6))} ถึง ${e(f(study.high,6))} ${e(study.field.unit||'')} จำนวน 9 จุด โดยตรึงข้อมูลอื่นตามชุดที่ศึกษา ผลลัพธ์: ${e(study.metric.label)} (${e(study.metric.unit||'ไม่มีหน่วย')})</p>${chartMarkup(study,-1)}${tableMarkup(study,-1,false)}<p>เส้นเชื่อมแสดงแนวโน้มระหว่างตัวอย่างเท่านั้น; ไม่ยืนยันค่าระหว่างจุด ไม่เลือกแบบที่เหมาะสมที่สุด และไม่ขยายขอบเขตของแบบจำลอง</p></section>`;
}

/** Reports always evaluate the current inputs; no saved sample answers can enter a report. */
export function sensitivityReportFromSettings(definition, inputs, settings) {
  if (settings?.includeInReport === false) return '';
  const restored=restoreSensitivitySettings(definition,settings);
  if (!restored) throw new Error('การตั้งค่าศึกษาความไวไม่ถูกต้อง กรุณาตรวจตัวแปร ผลลัพธ์ และช่วงศึกษาก่อนแนบรายงาน');
  return sensitivityReport(runSensitivity(definition,inputs,restored));
}

export function mountSensitivity(host, definition, {getInputs, onApply, notify=()=>{}, initialSettings, onStudyChange=()=>{}}) {
  const fields=sensitivityFields(definition);
  const restoredSettings=restoreSensitivitySettings(definition,initialSettings);
  const invalidImportedSettings=initialSettings!==undefined&&!restoredSettings;
  let fieldKey=restoredSettings?.fieldKey||fields[0]?.key,metricIndex=restoredSettings?.metricIndex??0,range=restoredSettings?{low:restoredSettings.low,high:restoredSettings.high}:null,study=null,selected=-1,sourceFingerprint=restoredSettings?JSON.stringify(inputSnapshot(definition,getInputs())):'',disposed=false,initializing=true,lastSettings='';
  host.innerHTML=`<section class="sensitivity-workbench" aria-label="ศึกษาความไวของตัวแปร"><div class="study-heading"><div><span class="study-kicker">PARAMETRIC STUDY</span><h2>เมื่อข้อมูลเปลี่ยน ผลเปลี่ยนแค่ไหน</h2><p>เปลี่ยนทีละตัวแปร ตรึงข้อมูลอื่น แล้วตรวจผลจากแบบจำลองเดิม 9 จุด</p></div><span class="study-method-label">ONE VARIABLE · 9 SAMPLES</span></div><form class="study-controls" novalidate><label><span>ตัวแปรที่ศึกษา</span><select data-study="field" aria-label="ตัวแปรที่ศึกษา">${fields.map(field=>`<option value="${e(field.key)}">${e(field.label)}${field.unit?' · '+e(field.unit):''}</option>`).join('')}</select></label><label><span>ผลลัพธ์ที่ติดตาม</span><select data-study="metric" aria-label="ผลลัพธ์ที่ติดตาม"></select></label><label class="study-bound"><span>ค่าต่ำ</span><input data-study="low" type="number" step="any" aria-label="ค่าต่ำของช่วงศึกษา"></label><label class="study-bound"><span>ค่าสูง</span><input data-study="high" type="number" step="any" aria-label="ค่าสูงของช่วงศึกษา"></label><button type="submit" class="button primary compact">ศึกษาช่วงนี้ ${icon('external')}</button></form><div class="study-range-hint"></div><div class="study-results" aria-live="polite"></div><p class="study-boundary-note">ศึกษาทีละตัวแปรโดยใช้สมมติฐานเดิม เส้นเชื่อมแสดงแนวโน้มของจุดที่คำนวณได้ ค่าระหว่างจุดยังไม่ได้ตรวจ; ผลที่มากขึ้นไม่ได้หมายถึงดีขึ้นเสมอ</p></section>`;
  const reportControl=document.createElement('div');
  reportControl.className='study-report-control';
  reportControl.innerHTML=`<label><input type="checkbox" data-study="include" ${restoredSettings?.includeInReport?'checked':''}><span><strong>แนบการศึกษานี้ในรายงาน</strong><small>บันทึกตัวแปรและช่วงศึกษาไว้กับงาน · ผลทั้งหมดคำนวณใหม่จากข้อมูลปัจจุบันเมื่อสร้างรายงาน</small></span></label>${invalidImportedSettings?'<p class="study-settings-notice" role="status">การตั้งค่าศึกษาความไวในไฟล์ไม่ตรงกับขอบเขตของเครื่องมือนี้ จึงเริ่มช่วงศึกษาใหม่และยังไม่แนบในรายงาน</p>':''}`;
  host.querySelector('.study-results').before(reportControl);
  const fieldSelect=host.querySelector('[data-study="field"]'), metricSelect=host.querySelector('[data-study="metric"]'), lowInput=host.querySelector('[data-study="low"]'), highInput=host.querySelector('[data-study="high"]'), includeInput=host.querySelector('[data-study="include"]'), results=host.querySelector('.study-results');
  fieldSelect.value=fieldKey;
  if(restoredSettings){lowInput.value=String(restoredSettings.low);highInput.value=String(restoredSettings.high);}
  function currentField(){return fields.find(field=>field.key===fieldKey);}
  function getSettings(){
    const bounds=readRange();
    return {schemaVersion:1,toolId:definition.id,fieldKey,metricIndex,low:isNumber(bounds.low)?bounds.low:null,high:isNumber(bounds.high)?bounds.high:null,includeInReport:includeInput.checked};
  }
  function emitSettingsChange(){
    const settings=getSettings(),serialized=JSON.stringify(settings);
    if(initializing){lastSettings=serialized;return;}
    if(serialized!==lastSettings){lastSettings=serialized;onStudyChange(settings);}
  }
  function rangeHint(){
    const field=currentField(),input=inputSnapshot(definition,getInputs());if(!field)return;
    for(const control of [lowInput,highInput]){control.min=field.min;control.max=field.max;}
    host.querySelector('.study-range-hint').textContent=`ขอบเขตตัวแปร ${f(field.min,6)}–${f(field.max,6)} ${field.unit||''} · ค่าปัจจุบัน ${f(input[fieldKey],6)} ${field.unit||''}`;
  }
  function updateRange(){
    const field=currentField();if(!field)return;
    const input=inputSnapshot(definition,getInputs());
    range=defaultSensitivityRange(field,input[fieldKey]);
    lowInput.value=String(Number(range.low.toPrecision(12)));highInput.value=String(Number(range.high.toPrecision(12)));
    rangeHint();
  }
  function readRange(){return {low:lowInput.value.trim()===''?NaN:Number(lowInput.value),high:highInput.value.trim()===''?NaN:Number(highInput.value)};}
  function renderStudy(){
    if(!study)return;
    const valid=study.samples.filter(sample=>sample.status==='calculated');
    results.innerHTML=`<div class="study-output-heading"><div><span class="study-kicker">RESPONSE CURVE</span><h3>${e(study.metric.label)} <small>${e(study.metric.unit)}</small></h3></div><div class="study-count"><strong>${valid.length}<span>/ 9</span></strong><small>จุดที่ให้ผลเชิงตัวเลข</small></div></div>${chartMarkup(study,selected)}${tableMarkup(study,selected)}<div class="study-apply-bar"><div><strong>นำตัวอย่างไปทดลองต่อ</strong><span>เลือกหนึ่งแถว แล้วนำไปแทนเฉพาะตัวแปรนี้ในงานปัจจุบัน</span></div><button type="button" class="button light compact" data-study="apply" ${selected<0?'disabled':''}>ใช้ค่าที่เลือกในงาน</button></div>`;
  }
  function calculate(){
    study=null;selected=-1;
    lowInput.removeAttribute('aria-invalid');highInput.removeAttribute('aria-invalid');
    try {
      range=readRange();study=runSensitivity(definition,getInputs(),{fieldKey,metricIndex,...range});
      selected=study.samples.find(sample=>sample.isCurrent&&sample.status==='calculated')?.index ?? -1;
      sourceFingerprint=JSON.stringify(inputSnapshot(definition,getInputs()));renderStudy();
    }catch(error){
      const field=currentField();
      if(!field||!isNumber(range?.low)||!isNumber(range?.high)||range.low>=range.high||range.low<field.min||range.high>field.max){lowInput.setAttribute('aria-invalid','true');highInput.setAttribute('aria-invalid','true');}
      results.innerHTML=`<div class="study-error" role="alert"><strong>ยังศึกษาช่วงนี้ไม่ได้</strong><p>${e(error.message)}</p></div>`;
    }
  }
  function refresh(){
    if(disposed)return;
    try{
      if(!fields.length)throw new Error('เครื่องมือนี้ไม่มีตัวแปรต่อเนื่องที่ปรับอิสระได้');
      const input=inputSnapshot(definition,getInputs()), result=definition.calculate({...input});
      metricSelect.innerHTML=result.summary.map((metric,index)=>`<option value="${index}" ${index===metricIndex?'selected':''}>${e(metric.label)}${metric.unit?' · '+e(metric.unit):''}</option>`).join('');
      if(metricIndex>=result.summary.length){metricIndex=0;metricSelect.value='0';}
      const fingerprint=JSON.stringify(input);
      if(!range||sourceFingerprint!==fingerprint)updateRange();
      else rangeHint();
      calculate();
    }catch(error){study=null;selected=-1;results.innerHTML=`<div class="study-error" role="alert"><strong>ตรวจข้อมูลปัจจุบันก่อนศึกษา</strong><p>${e(error.message)}</p></div>`;}
    emitSettingsChange();
  }
  function handleSubmit(event){event.preventDefault();calculate();emitSettingsChange();}
  function handleChange(event){
    const target=event.target;
    if(target===fieldSelect){fieldKey=target.value;try{updateRange();calculate();}catch{refresh();}}
    else if(target===metricSelect){metricIndex=Number(target.value);calculate();}
    else if(target.name==='sensitivity-sample'&&study){selected=Number(target.value);renderStudy();host.querySelector(`input[name="sensitivity-sample"][value="${selected}"]`)?.focus({preventScroll:true});}
    if(target===fieldSelect||target===metricSelect||target===includeInput)emitSettingsChange();
  }
  function handleInput(event){
    if(event.target===lowInput||event.target===highInput){study=null;selected=-1;results.innerHTML='<div class="study-pending">ช่วงตัวแปรเปลี่ยนแล้ว กด “ศึกษาช่วงนี้” เพื่อคำนวณก่อนเลือกตัวอย่าง</div>';emitSettingsChange();}
  }
  function handleClick(event){
    if(!event.target.closest('[data-study="apply"]'))return;
    try{const change=sensitivityApplication(definition,study,selected,getInputs());onApply(change);notify(`นำค่า ${f(change.value,6)} ${currentField().unit||''} ไปใช้ในงานแล้ว`);refresh();}catch(error){notify(error.message);refresh();}
  }
  host.querySelector('form').addEventListener('submit',handleSubmit);
  host.addEventListener('change',handleChange);host.addEventListener('input',handleInput);host.addEventListener('click',handleClick);
  refresh();
  initializing=false;lastSettings=JSON.stringify(getSettings());
  if(invalidImportedSettings)notify('การตั้งค่าศึกษาความไวในไฟล์ไม่ถูกต้อง จึงเริ่มช่วงศึกษาใหม่และปิดการแนบรายงาน');
  return {refresh,getSettings,getReport:()=>sensitivityReportFromSettings(definition,getInputs(),getSettings()),destroy(){disposed=true;host.querySelector('form')?.removeEventListener('submit',handleSubmit);host.removeEventListener('change',handleChange);host.removeEventListener('input',handleInput);host.removeEventListener('click',handleClick);}};
}
