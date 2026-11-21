import { catalog, categories } from './catalog.js';
import { escapeHTML as e, format as f } from './utils.js';
import { icon } from './visuals.js';
import { normalizeHandoverState, buildHandover, MAX_HANDOVER_RECORDS } from './handover.js';

const filled = value => value || 'ยังไม่ระบุ';
const count = value => Number.isFinite(value) ? value : 0;
const serial = value => String(value).padStart(2, '0');
const purposeLabel = value => value === 'coordination' ? 'เพื่อประสานงาน' : 'เพื่อการตรวจทาน';
const sourceLabel = entry => entry.missing ? 'ไม่พบต้นทาง' : entry.sourceState === 'draft' ? 'มีร่างแก้ไข' : 'บันทึกแล้ว';
const sourceBadge = entry => `<span class="handover-source ${entry.missing ? 'is-missing' : entry.sourceState === 'draft' ? 'is-draft' : ''}">${sourceLabel(entry)}</span>`;
const metricValue = metric => metric.value === null || metric.value === undefined || typeof metric.value === 'number' && !Number.isFinite(metric.value) ? 'ไม่ประเมิน' : f(metric.value, metric.digits ?? 2);

function metricsMarkup(entry, report = false) {
  const metrics = (entry.model?.metrics || []).slice(0, report ? 6 : 2);
  return metrics.length ? `<dl class="handover-record-metrics">${metrics.map(metric => `<div><dt>${e(metric.label)}</dt><dd>${e(metricValue(metric))}${metric.value !== null && metric.unit ? ` <small>${e(metric.unit)}</small>` : ''}</dd></div>`).join('')}</dl>` : '';
}

function modelLabel(entry) {
  return entry.missing ? 'เลือกต้นทางใหม่หรือนำรายการออก' : entry.model?.label || 'เปิดตรวจข้อมูลในเครื่องมือ';
}

function reviewLabel(entry) {
  if (entry.missing) return 'ยังประเมินไม่ได้';
  const register = entry.register || {};
  if (register.outstanding) return `ประเด็นค้าง ${register.outstanding} รายการ`;
  if (register.total) return `ปิดประเด็นโดยผู้ใช้ ${count(register.closed)}/${register.total}`;
  return 'ไม่มีประเด็นในทะเบียน';
}

function modelTone(entry) {
  if (entry.missing || entry.model?.status === 'invalid') return 'is-alert';
  if (entry.model?.assessment?.fail || entry.model?.assessment?.unassessed || entry.model?.inspection?.fail) return 'is-observation';
  return '';
}

function sourceScopeMarkup() {
  return `<p class="handover-scope">${icon('info')}<span>รวมเอกสารที่เลือกอย่างชัดเจน ผลแต่ละงานคำนวณจากข้อมูลของงานนั้น แรง ปริมาณ และราคาไม่ได้เชื่อมถึงกันอัตโนมัติ</span></p>`;
}

function summaryMarkup(model) {
  const s = model.summary || {};
  return `<dl class="handover-summary">
    <div><dt>เอกสารในชุด</dt><dd>${serial(count(s.documents))}</dd><small>${count(s.disciplines)} หมวดงาน${s.missing ? ` · ไม่พบต้นทาง ${s.missing}` : ''}</small></div>
    <div><dt>ประเด็นตรวจทานค้าง</dt><dd>${serial(count(s.reviewOutstanding))}</dd><small>ต้องตรวจซ้ำ ${count(s.reviewNeedsReview)} รายการ</small></div>
    <div><dt>ผลตรวจแบบจำลอง</dt><dd>${serial(count(s.modelFailures))}<span>ไม่ผ่าน</span></dd><small>ไม่ประเมิน ${count(s.modelUnassessed)} · ข้อมูลต้องแก้ ${count(s.invalid)} งาน</small></div>
    <div><dt>การยืนยันของผู้ใช้</dt><dd>${serial(count(s.manualPending))}<span>งานยังไม่ครบ</span></dd><small>แยกจากผลคำนวณและประเด็นค้าง</small></div>
  </dl>`;
}

function recordMarkup(entry, index, total) {
  const document = entry.document || {};
  const register = entry.register || {};
  const review = entry.review || {};
  return `<article class="handover-record ${entry.missing ? 'is-missing' : ''}" aria-label="เอกสาร ${index + 1} ${e(entry.name)}">
    <div class="handover-record-number"><span>${serial(index + 1)}</span><div class="handover-order-controls"><button type="button" data-ho-up="${e(entry.id)}" aria-label="เลื่อนขึ้น ${e(entry.name)}"${index === 0 ? ' disabled' : ''}>↑</button><button type="button" data-ho-down="${e(entry.id)}" aria-label="เลื่อนลง ${e(entry.name)}"${index === total - 1 ? ' disabled' : ''}>↓</button></div></div>
    <div class="handover-record-identity"><div class="handover-record-code">${e(document.projectCode || entry.toolTitle || 'ต้นทางที่เลือกไว้')}${!entry.missing ? `<span>REV ${e(document.revision || 'P01')}</span>` : ''}</div><h3>${e(entry.name)}</h3><p>${e(entry.toolTitle || 'รายการอ้างอิงเดิม')}${document.client ? ` · ${e(document.client)}` : ''}</p><div class="handover-record-tags">${sourceBadge(entry)}${entry.categoryLabel ? `<span>${e(entry.categoryLabel)}</span>` : ''}</div></div>
    <div class="handover-record-analysis"><strong class="handover-model-label ${modelTone(entry)}">${e(modelLabel(entry))}</strong>${metricsMarkup(entry)}</div>
    <div class="handover-record-review"><strong class="${register.outstanding ? 'is-observation' : ''}">${e(reviewLabel(entry))}</strong>${register.needsReview ? `<span>ต้องตรวจซ้ำ ${register.needsReview} รายการ</span>` : ''}${!entry.missing ? `<small>ผู้ใช้ยืนยัน ${count(review.completed)}/${count(review.total)}</small>` : ''}${register.pendingDraft ? '<small class="is-observation">มีคำตอบที่ยังไม่ยืนยัน</small>' : ''}</div>
    <div class="handover-record-actions">${!entry.missing ? `<button type="button" class="button light compact" data-ho-open="${e(entry.id)}" aria-label="เปิดงาน ${e(entry.name)}">เปิดงาน ${icon('external')}</button>` : ''}<button type="button" class="link-button" data-ho-remove="${e(entry.id)}" aria-label="นำออกจากชุด ${e(entry.name)}">นำออกจากชุด</button></div>
    ${(entry.warnings || []).length ? `<ul class="handover-record-warnings">${entry.warnings.map(warning => `<li>${e(warning)}</li>`).join('')}</ul>` : ''}
  </article>`;
}

function attentionMarkup(model) {
  const s = model.summary || {};
  const rows = [
    s.missing ? ['ไม่พบเอกสารต้นทาง', `${s.missing} รายการ`, 'เลือกเอกสารใหม่หรือนำรายการที่หาไม่พบออกก่อนส่งออกชุด JSON'] : null,
    s.drafts ? ['ข้อมูลจากร่างล่าสุด', `${s.drafts} งาน`, 'ชุดนี้รวมร่างที่ใหม่กว่างานที่บันทึกไว้ โดยแสดงที่มาของแต่ละเอกสาร'] : null,
    s.editorDrafts ? ['มีข้อความที่ยังทำไม่เสร็จ', `${s.editorDrafts} งาน`, 'เปิดงานเพื่อยืนยันคำตอบตรวจทานหรือออกฉบับก่อนส่งรายงานฉบับสมบูรณ์'] : null,
    s.inspectionDefects ? ['ข้อบกพร่องจากรายการตรวจงาน', `${s.inspectionDefects} รายการ`, 'เป็นผลตรวจหน้างาน แยกจากการตรวจในแบบจำลองและทะเบียนข้อสังเกต'] : null,
  ].filter(Boolean);
  return rows.length ? `<section class="handover-attention" aria-label="ข้อมูลที่ต้องทราบก่อนส่งต่อ"><div><span class="eyebrow">BEFORE HANDOVER</span><h2>สิ่งที่ต้องส่งต่อให้ผู้ตรวจ</h2></div><dl>${rows.map(([label, value, detail]) => `<div><dt>${e(label)} <strong>${e(value)}</strong></dt><dd>${e(detail)}</dd></div>`).join('')}</dl></section>` : '';
}

/** A coordination summary; individual calculation reports stay in their source tools. */
export function handoverReportMarkup(model) {
  const metadata = model.metadata || {};
  const entries = model.entries || [];
  const generated = new Date(model.generatedAt);
  const date = Number.isFinite(generated.getTime()) ? generated.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long', timeStyle: 'short' }) : 'ไม่ระบุเวลาสร้าง';
  return `<section class="document-cover handover-report-cover"><div class="handover-report-brand"><strong>ENG APP</strong><span>ENGINEERING STUDIO / PROJECT HANDOVER</span></div><span class="eyebrow">DOCUMENT TRANSMITTAL</span><h1>${e(metadata.title || 'ชุดส่งตรวจโครงการ')}</h1><p class="handover-report-subtitle">ทะเบียนเอกสารและสรุปประเด็นเพื่อประสานการตรวจทาน</p><dl class="handover-report-metadata"><div><dt>เลขที่ชุดส่งตรวจ</dt><dd>${e(filled(metadata.reference))}</dd></div><div><dt>ผู้รับที่ระบุ</dt><dd>${e(filled(metadata.recipient))}</dd></div><div><dt>วัตถุประสงค์</dt><dd>${e(purposeLabel(metadata.purpose))}</dd></div><div><dt>สร้างสรุปเมื่อ</dt><dd>${e(date)} (ไทย)</dd></div></dl>${metadata.note ? `<div class="handover-report-note"><strong>ข้อความส่งต่อ</strong><p>${e(metadata.note)}</p></div>` : ''}<p class="handover-report-boundary">รายงานนี้เป็นทะเบียนประสานงาน ผลคำนวณฉบับเต็มและขอบเขตแบบจำลองอยู่ในรายงานของแต่ละเครื่องมือ ชื่อผู้รับและการยืนยันเป็นข้อมูลที่ผู้ใช้ระบุ</p></section>
    <div class="document-report-body handover-report-body"><section><h2>ภาพรวมชุดส่งตรวจ</h2>${summaryMarkup(model)}${attentionMarkup(model)}${sourceScopeMarkup()}</section>
    <section><h2>ทะเบียนเอกสารในชุด</h2><table class="handover-report-register"><thead><tr><th>ลำดับ</th><th>เอกสาร / เครื่องมือ</th><th>รหัส / ฉบับ</th><th>ที่มาข้อมูล</th><th>ประเด็นค้าง / ผู้ใช้ยืนยัน</th></tr></thead><tbody>${entries.map((entry, index) => `<tr><td>${serial(index + 1)}</td><td><strong>${e(entry.name)}</strong><small>${e(entry.toolTitle || 'ไม่พบต้นทาง')}</small></td><td>${e(entry.document?.projectCode || 'ยังไม่ระบุ')}<small>${entry.missing ? '—' : 'REV ' + e(entry.document?.revision || 'P01')}</small></td><td>${e(sourceLabel(entry))}</td><td>${entry.missing ? 'ยังประเมินไม่ได้' : `${count(entry.register?.outstanding)} รายการ<small>${count(entry.review?.completed)}/${count(entry.review?.total)} ข้อ</small>`}</td></tr>`).join('')}</tbody></table></section>
    <section><h2>ข้อสังเกตและข้อมูลรายเอกสาร</h2>${entries.map((entry, index) => `<section class="handover-report-entry"><div class="handover-report-entry-heading"><span>${serial(index + 1)}</span><h3>${e(entry.name)}</h3></div><p class="handover-report-entry-type">${e(entry.toolTitle || 'ไม่พบเอกสารต้นทาง')} · ${e(sourceLabel(entry))}</p><p class="handover-model-label ${modelTone(entry)}">${e(modelLabel(entry))}</p>${metricsMarkup(entry, true)}<dl class="handover-report-checks"><div><dt>ประเด็นตรวจทาน</dt><dd>${e(reviewLabel(entry))}${entry.register?.needsReview ? ` · ต้องตรวจซ้ำ ${entry.register.needsReview}` : ''}</dd></div><div><dt>รายการยืนยันของผู้ใช้</dt><dd>${entry.missing ? 'ยังประเมินไม่ได้' : `${count(entry.review?.completed)}/${count(entry.review?.total)} ข้อ`}</dd></div>${entry.document?.designBasis ? `<div><dt>แหล่งข้อมูล / เกณฑ์ที่ระบุ</dt><dd>${e(entry.document.designBasis)}</dd></div>` : ''}</dl>${(entry.warnings || []).length ? `<ul class="handover-report-warnings">${entry.warnings.map(warning => `<li>${e(warning)}</li>`).join('')}</ul>` : ''}</section>`).join('')}</section></div><footer class="print-footer handover-report-footer">ENG APP / PROJECT HANDOVER · สรุปจากข้อมูลในชุด ณ เวลาที่สร้าง · ผลแต่ละงานและการยืนยันของผู้ใช้แสดงแยกกัน</footer>`;
}

export function mountHandover(host, {
  records = [], definitions = {}, initialState, onChange = () => {}, onOpen = () => {},
  onExportJSON = () => {}, onExportCSV = () => {}, onReport = () => {}, onImport = () => {}, onExample = () => {}, notify = () => {},
} = {}) {
  let state = normalizeHandoverState(initialState);
  let available = Array.isArray(records) ? records : [];
  let query = '';
  let category = 'all';
  let disposed = false;
  let lastRemoved = null;
  const getState = () => ({ ...state, metadata: { ...state.metadata }, selectedIds: [...state.selectedIds] });
  const getModel = () => buildHandover(available, definitions, normalizeHandoverState(getState()));
  const m = state.metadata;
  host.innerHTML = `<div class="handover-workspace">
    <header class="handover-heading"><div><span class="eyebrow">PROJECT HANDOVER / 07</span><h1>ชุดส่งตรวจโครงการ</h1><p>รวบรวมงานที่เกี่ยวข้อง ตรวจภาพรวม แล้วส่งต่อพร้อมที่มาของแต่ละเอกสาร</p></div><div class="handover-heading-actions"><a class="button light compact" href="#handover-history">${icon('file')} ฉบับอ้างอิง / เทียบการเปลี่ยนแปลง</a><button type="button" class="button light compact" data-ho-action="example">${icon('layers')} ลองชุดตัวอย่าง</button><button type="button" class="button light compact" data-ho-action="import">${icon('upload')} เปิดไฟล์ชุดงาน</button></div></header>
    <div class="handover-process" aria-label="ขั้นตอนเตรียมส่งตรวจ"><span><b>01</b> เลือกเอกสาร</span><span><b>02</b> ตรวจประเด็นร่วมกัน</span><span><b>03</b> ส่งต่อทั้งชุด</span><small>LOCAL WORKSPACE</small></div>
    <div data-ho-summary></div>
    <div class="handover-layout"><aside class="handover-cover-panel" aria-label="ข้อมูลชุดส่งตรวจ"><div class="handover-panel-heading"><span class="eyebrow">TRANSMITTAL COVER</span><h2>ข้อมูลชุดส่งตรวจ</h2><p>ระบุผู้รับและบริบทให้เปิดตรวจต่อได้</p></div><form class="handover-metadata" novalidate>
      <label for="handover-title"><span>ชื่อชุดงาน</span><input id="handover-title" data-ho-meta="title" maxlength="180" value="${e(m.title)}" placeholder="เช่น อาคารสำนักงาน · รอบตรวจ P02" autocomplete="off"></label>
      <label for="handover-reference"><span>เลขที่ชุดส่งตรวจ</span><input id="handover-reference" data-ho-meta="reference" maxlength="80" value="${e(m.reference)}" placeholder="เช่น TR-2026-001" autocomplete="off"></label>
      <label for="handover-recipient"><span>ผู้รับที่ระบุ</span><input id="handover-recipient" data-ho-meta="recipient" maxlength="160" value="${e(m.recipient)}" placeholder="ชื่อหรือหน่วยงานที่ส่งให้ตรวจ" autocomplete="off"></label>
      <label for="handover-purpose"><span>วัตถุประสงค์</span><select id="handover-purpose" data-ho-meta="purpose"><option value="for-review"${m.purpose === 'for-review' ? ' selected' : ''}>เพื่อการตรวจทาน</option><option value="coordination"${m.purpose === 'coordination' ? ' selected' : ''}>เพื่อประสานงาน</option></select></label>
      <label for="handover-note"><span>ข้อความส่งต่อ</span><textarea id="handover-note" data-ho-meta="note" rows="4" maxlength="2400" placeholder="ขอบเขตที่ขอตรวจ เอกสารอ้างอิง หรือข้อสังเกตสำคัญ">${e(m.note)}</textarea></label>
    </form><p class="handover-local-note">${icon('save')}<span>ชุดที่กำลังเตรียมเก็บในเบราว์เซอร์นี้<br>การเลือกเอกสารไม่แก้ไขงานต้นทาง</span></p><div class="handover-export-actions"><button type="button" class="button primary" data-ho-action="json">${icon('download')} ดาวน์โหลดทั้งชุด · JSON</button><button type="button" class="button light" data-ho-action="report">${icon('file')} รายงานสรุปชุดส่งตรวจ</button><button type="button" class="link-button" data-ho-action="csv">${icon('download')} ทะเบียนเอกสาร CSV</button></div><p class="handover-recipient-note">ผู้รับเป็นข้อความประกอบเอกสาร ไม่มีการส่งไฟล์หรือแจ้งเตือนถึงบุคคลโดยอัตโนมัติ</p></aside>
    <section class="handover-register-panel" aria-labelledby="handover-register-heading"><div class="handover-register-heading"><div><span class="eyebrow">DOCUMENT REGISTER</span><h2 id="handover-register-heading">เอกสารในชุด <span data-ho-selected-count>0</span></h2></div><button type="button" class="button light compact" data-ho-action="choose">${icon('plus')} เลือกเอกสาร</button></div><p class="handover-register-caption">ลำดับนี้ใช้ในทะเบียนและรายงาน ปรับลำดับด้วยปุ่มขึ้น / ลง</p><div class="handover-register-columns" aria-hidden="true"><span>#</span><span>เอกสาร / ฉบับ</span><span>ผลในแบบจำลอง</span><span>การตรวจทาน</span><span>ต้นทาง</span></div><div data-ho-register></div><div class="handover-undo" data-ho-undo hidden><span data-ho-undo-message></span><button type="button" class="link-button" data-ho-action="undo">เลิกนำออก</button></div><div data-ho-attention></div></section></div>
    <details class="handover-picker"${state.selectedIds.length ? '' : ' open'}><summary><span><span class="eyebrow">SOURCE DOCUMENTS</span><strong>เลือกจากงานที่บันทึกไว้</strong></span><span class="handover-picker-summary-count" data-ho-available-count></span>${icon('chevron')}</summary><div class="handover-picker-body"><div class="handover-picker-toolbar"><label class="search-input">${icon('search')}<input type="search" data-ho-search aria-label="ค้นหาเอกสารสำหรับชุดส่งตรวจ" placeholder="ค้นหาชื่องาน รหัสเอกสาร หรือเครื่องมือ..."></label><label class="handover-category"><span>หมวดงาน</span><select data-ho-category>${categories.map(item => `<option value="${e(item.id)}">${e(item.label)}</option>`).join('')}</select></label><button type="button" class="button light compact" data-ho-action="select-visible">เลือกที่แสดง</button></div><p class="handover-selection-note" data-ho-selection-note role="status"></p><div data-ho-picker-list></div></div></details>
    ${sourceScopeMarkup()}<p class="handover-live-status" data-ho-live role="status" aria-live="polite"></p>
  </div>`;

  function visibleRecords() {
    const words = query.trim().toLocaleLowerCase('th').split(/\s+/).filter(Boolean);
    return available.filter(record => {
      const tool = catalog.find(item => item.id === record.toolId);
      if (!tool || category !== 'all' && tool.category !== category) return false;
      const text = [record.name, tool.title, tool.en, record.data?._document?.projectCode, record.data?._document?.client].join(' ').toLocaleLowerCase('th');
      return words.every(word => text.includes(word));
    });
  }

  function renderPicker() {
    const visible = visibleRecords();
    host.querySelector('[data-ho-available-count]').textContent = `${available.length} งานต้นทาง`;
    host.querySelector('[data-ho-selection-note]').textContent = `แสดง ${visible.length} จาก ${available.length} งาน · เลือกแล้ว ${state.selectedIds.length}/${MAX_HANDOVER_RECORDS} · เลือกที่แสดงใช้เฉพาะผลค้นหาปัจจุบัน`;
    const selected = new Set(state.selectedIds);
    host.querySelector('[data-ho-picker-list]').innerHTML = visible.length ? `<div class="handover-picker-list">${visible.map(record => {
      const tool = catalog.find(item => item.id === record.toolId);
      const document = record.data?._document || {};
      return `<div class="handover-picker-row ${selected.has(record.id) ? 'is-selected' : ''}"><label><input type="checkbox" data-ho-select="${e(record.id)}"${selected.has(record.id) ? ' checked' : ''}><span><strong>${e(record.name)}</strong><small>${e(document.projectCode || 'ยังไม่ระบุรหัสเอกสาร')} · REV ${e(document.revision || 'P01')}</small></span></label><span class="handover-picker-tool">${e(tool.title)}</span><span class="handover-source ${record.fromDraft ? 'is-draft' : ''}">${record.fromDraft ? 'มีร่างแก้ไข' : 'บันทึกแล้ว'}</span><button type="button" class="icon-button" data-ho-open="${e(record.id)}" aria-label="เปิดงาน ${e(record.name)}">${icon('external')}</button></div>`;
    }).join('')}</div>` : `<div class="handover-picker-empty">${icon('folder')}<strong>${available.length ? 'ยังไม่พบเอกสารที่ตรงกับตัวกรอง' : 'ยังไม่มีงานที่บันทึกไว้'}</strong><p>${available.length ? 'เปลี่ยนคำค้นหรือเลือกหมวดทั้งหมด' : 'ลองชุดตัวอย่าง หรือเปิดเครื่องมือแล้วบันทึกงานของคุณก่อนเลือกเข้าชุด'}</p>${available.length ? '<button type="button" class="link-button" data-ho-action="clear-search">ล้างตัวกรอง</button>' : '<button type="button" class="button light compact" data-ho-action="example">ลองชุดตัวอย่าง</button>'}</div>`;
  }

  function focusIdentity(element) {
    if (!element || !host.contains(element)) return null;
    for (const key of ['hoSelect', 'hoUp', 'hoDown', 'hoRemove', 'hoAction']) if (element.dataset?.[key]) return { key, value: element.dataset[key] };
    return null;
  }

  function restoreIdentity(identity) {
    if (!identity) return;
    const controls = [...host.querySelectorAll('button,input')];
    let element = controls.find(item => item.dataset?.[identity.key] === identity.value && !item.disabled);
    if (!element && ['hoUp', 'hoDown'].includes(identity.key)) {
      const other = identity.key === 'hoUp' ? 'hoDown' : 'hoUp';
      element = controls.find(item => item.dataset?.[other] === identity.value && !item.disabled) || controls.find(item => item.dataset?.hoOpen === identity.value);
    }
    element?.focus({ preventScroll: true });
  }

  function renderDerived() {
    const focus = focusIdentity(host.ownerDocument.activeElement);
    const model = getModel();
    host.querySelector('[data-ho-summary]').innerHTML = summaryMarkup(model);
    host.querySelector('[data-ho-selected-count]').textContent = `${state.selectedIds.length}/${MAX_HANDOVER_RECORDS}`;
    host.querySelector('[data-ho-register]').innerHTML = model.entries.length ? model.entries.map((entry, index) => recordMarkup(entry, index, model.entries.length)).join('') : `<div class="handover-register-empty"><span class="handover-empty-symbol">${icon('layers')}</span><span class="eyebrow">START A REVIEW PACKAGE</span><h3>เริ่มจากเอกสารที่ต้องตรวจร่วมกัน</h3><p>เลือกงานคำนวณ ปริมาณ ต้นทุน หรือแผนงาน<br>แล้วจัดลำดับสำหรับส่งต่อในชุดเดียว</p><button type="button" class="button primary" data-ho-action="choose">${icon('plus')} เลือกเอกสารเข้าชุด</button></div>`;
    host.querySelector('[data-ho-attention]').innerHTML = attentionMarkup(model);
    for (const action of ['json', 'csv', 'report']) host.querySelector(`[data-ho-action="${action}"]`).disabled = !model.entries.length;
    host.querySelector('[data-ho-action="json"]').disabled = !model.entries.length || Boolean(model.summary.missing);
    host.querySelector('[data-ho-undo]').hidden = !lastRemoved;
    if (lastRemoved) host.querySelector('[data-ho-undo-message]').textContent = `นำ “${lastRemoved.name}” ออกจากชุดแล้ว งานต้นทางยังอยู่`;
    renderPicker();
    restoreIdentity(focus);
  }

  function announce(message) {
    host.querySelector('[data-ho-live]').textContent = message;
  }

  function emit() {
    onChange(getState());
  }

  function choose() {
    const picker = host.querySelector('.handover-picker');
    picker.open = true;
    picker.scrollIntoView({ block: 'start', behavior: 'smooth' });
    host.querySelector('[data-ho-search]').focus({ preventScroll: true });
  }

  const onInput = event => {
    const field = event.target.dataset?.hoMeta;
    if (field) {
      state.metadata = { ...state.metadata, [field]: event.target.value };
      emit();
      return;
    }
    if (event.target.matches('[data-ho-search]')) { query = event.target.value; renderPicker(); }
  };

  const onChangeEvent = event => {
    if (event.target.matches('select[data-ho-meta]')) { state.metadata = { ...state.metadata, [event.target.dataset.hoMeta]: event.target.value }; emit(); return; }
    if (event.target.matches('[data-ho-category]')) { category = event.target.value; renderPicker(); return; }
    const id = event.target.dataset?.hoSelect;
    if (!id) return;
    if (event.target.checked) {
      if (state.selectedIds.length >= MAX_HANDOVER_RECORDS) { event.target.checked = false; notify(`เลือกได้สูงสุด ${MAX_HANDOVER_RECORDS} เอกสารต่อชุด`); return; }
      if (!state.selectedIds.includes(id)) state.selectedIds = [...state.selectedIds, id];
      announce(`เพิ่มเอกสารเข้าชุดแล้ว รวม ${state.selectedIds.length} รายการ`);
    } else {
      state.selectedIds = state.selectedIds.filter(value => value !== id);
      announce(`นำเอกสารออกจากชุดแล้ว เหลือ ${state.selectedIds.length} รายการ`);
    }
    emit(); renderDerived();
  };

  const onClick = event => {
    const button = event.target.closest('button');
    if (!button || !host.contains(button) || button.disabled) return;
    if (button.dataset.hoOpen) { onOpen(button.dataset.hoOpen); return; }
    const moveId = button.dataset.hoUp || button.dataset.hoDown;
    if (moveId) {
      const from = state.selectedIds.indexOf(moveId), to = from + (button.dataset.hoUp ? -1 : 1);
      if (from < 0 || to < 0 || to >= state.selectedIds.length) return;
      const ids = [...state.selectedIds]; [ids[from], ids[to]] = [ids[to], ids[from]]; state.selectedIds = ids;
      emit(); renderDerived(); announce(`ย้ายเอกสารไปลำดับ ${to + 1} แล้ว`);
      return;
    }
    const removeId = button.dataset.hoRemove;
    if (removeId) {
      const index = state.selectedIds.indexOf(removeId);
      lastRemoved = { id: removeId, index, name: available.find(item => item.id === removeId)?.name || 'รายการที่ไม่พบต้นทาง' };
      state.selectedIds = state.selectedIds.filter(id => id !== removeId);
      emit(); renderDerived(); host.querySelector('[data-ho-action="undo"]').focus({ preventScroll: true }); announce('นำเอกสารออกจากชุดแล้ว สามารถเลิกนำออกได้');
      return;
    }
    const action = button.dataset.hoAction;
    if (action === 'choose') choose();
    else if (action === 'json') onExportJSON();
    else if (action === 'csv') onExportCSV();
    else if (action === 'report') onReport();
    else if (action === 'import') onImport();
    else if (action === 'example') onExample();
    else if (action === 'clear-search') {
      query = ''; category = 'all'; host.querySelector('[data-ho-search]').value = ''; host.querySelector('[data-ho-category]').value = 'all'; renderPicker(); host.querySelector('[data-ho-search]').focus();
    } else if (action === 'select-visible') {
      const additions = visibleRecords().map(item => item.id).filter(id => !state.selectedIds.includes(id));
      if (state.selectedIds.length + additions.length > MAX_HANDOVER_RECORDS) { notify(`ผลค้นหามีเกินช่องว่างที่เหลือ ${MAX_HANDOVER_RECORDS - state.selectedIds.length} เอกสาร กรุณากรองหรือเลือกทีละงาน`); return; }
      state.selectedIds = [...state.selectedIds, ...additions]; emit(); renderDerived(); announce(`เพิ่ม ${additions.length} เอกสารจากผลค้นหาเข้าชุดแล้ว`);
    } else if (action === 'undo' && lastRemoved) {
      if (state.selectedIds.length >= MAX_HANDOVER_RECORDS) { notify(`ชุดนี้ครบ ${MAX_HANDOVER_RECORDS} เอกสารแล้ว นำรายการออกก่อนเรียกคืน`); return; }
      const { id, index } = lastRemoved;
      if (!state.selectedIds.includes(id)) { const ids = [...state.selectedIds]; ids.splice(Math.min(index, ids.length), 0, id); state.selectedIds = ids; }
      lastRemoved = null; emit(); renderDerived(); host.querySelector('[data-ho-action="choose"]').focus({ preventScroll: true }); announce('คืนเอกสารเข้าชุดแล้ว');
    }
  };

  const onSubmit = event => event.preventDefault();
  host.addEventListener('input', onInput);
  host.addEventListener('change', onChangeEvent);
  host.addEventListener('click', onClick);
  host.querySelector('form').addEventListener('submit', onSubmit);
  renderDerived();
  return {
    getState, getModel,
    refresh(nextRecords) { if (!disposed) { available = Array.isArray(nextRecords) ? nextRecords : []; renderDerived(); } },
    destroy() { disposed = true; host.removeEventListener('input', onInput); host.removeEventListener('change', onChangeEvent); host.removeEventListener('click', onClick); host.querySelector('form')?.removeEventListener('submit', onSubmit); },
  };
}
