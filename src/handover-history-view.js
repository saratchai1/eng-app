import { escapeHTML as e, format as f } from './utils.js';
import { icon } from './visuals.js';
import { handoverReportMarkup } from './handover-view.js';
import { MAX_HANDOVER_REFERENCES } from './handover-history.js';

const STATUS = Object.freeze({ added: 'เพิ่มในชุด', removed: 'นำออกจากชุด', changed: 'ข้อมูลเปลี่ยน', unchanged: 'ข้อมูลตรงกัน', missing: 'ไม่พบต้นทางปัจจุบัน' });
const FILTERS = Object.freeze([['all', 'ทั้งหมด'], ['changed', 'ข้อมูลเปลี่ยน'], ['added', 'เพิ่มในชุด'], ['removed', 'นำออกจากชุด'], ['missing', 'ไม่พบต้นทาง'], ['unchanged', 'ข้อมูลตรงกัน']]);
const number = value => Number.isFinite(value) ? value : 0;
const serial = value => String(value).padStart(2, '0');
const copyDraft = value => ({ code: typeof value?.code === 'string' ? value.code : '', note: typeof value?.note === 'string' ? value.note : '' });
const stamp = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }) : 'ยังไม่ระบุเวลา';
};
const textValue = value => value === undefined || value === null ? '—' : typeof value === 'boolean' ? value ? 'ใช่' : 'ไม่ใช่' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const sourceText = entry => !entry || entry.missing ? 'ไม่พบข้อมูลปัจจุบัน' : entry.sourceState === 'draft' ? 'ร่างล่าสุด' : 'งานที่บันทึกแล้ว';
const resultValue = (value, digits = 2) => value === null || value === undefined || typeof value === 'number' && !Number.isFinite(value) ? 'ไม่ประเมิน' : f(value, digits);
const distinctMetricValues = row => {
  const old = resultValue(row.before, row.digits ?? 2), current = resultValue(row.after, row.digits ?? 2);
  return typeof row.before === 'number' && typeof row.after === 'number' && row.before !== row.after && old === current ? [String(row.before), String(row.after)] : [old, current];
};

function deltaValue(row) {
  if (typeof row.deltaText === 'string') return row.deltaText;
  if (typeof row.delta !== 'number' || !Number.isFinite(row.delta)) return '—';
  if (row.delta === 0) return '0';
  const digits = Math.max(3, 2 - Math.floor(Math.log10(Math.abs(row.delta))));
  return (row.delta > 0 ? '+' : '') + (digits > 12 ? row.delta.toExponential(3) : f(row.delta, digits));
}

function tableWrap(label, content) {
  return `<div class="hh-table-wrap table-scroll" tabindex="0" role="region" aria-label="${e(label)}">${content}</div>`;
}

function changeTable(rows, label, { section = false, delta = false } = {}) {
  if (!rows?.length) return '';
  return tableWrap(label, `<table class="hh-change-table"><thead><tr><th scope="col">ข้อมูล${section ? ' / ส่วนงาน' : ' / หน่วย'}</th><th scope="col">ฉบับอ้างอิง</th><th scope="col">ชุดปัจจุบัน</th>${delta ? '<th scope="col">ผลต่าง</th>' : ''}</tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${e(row.label || row.key)}${row.unit ? `<small>${e(row.unit)}</small>` : ''}${section && Number.isFinite(row.changedCount) ? `<small>เปลี่ยน ${row.changedCount} รายการ / ช่องข้อมูล</small>` : ''}</th><td>${e(textValue(row.before))}${section && Number.isFinite(row.beforeCount) ? `<small>จำนวน ${row.beforeCount}</small>` : ''}</td><td class="hh-current-value">${e(textValue(row.after))}${section && Number.isFinite(row.afterCount) ? `<small>จำนวน ${row.afterCount}</small>` : ''}</td>${delta ? `<td>${e(deltaValue(row))}</td>` : ''}</tr>`).join('')}</tbody></table>`);
}

function metricsTable(rows) {
  if (!rows?.length) return '';
  return tableWrap('ผลลัพธ์ฉบับอ้างอิงเทียบชุดปัจจุบัน', `<table class="hh-metrics-table"><thead><tr><th scope="col">ผลลัพธ์ / หน่วย</th><th scope="col">ฉบับอ้างอิง</th><th scope="col">ชุดปัจจุบัน</th><th scope="col">ผลต่าง Δ</th></tr></thead><tbody>${rows.map(row => {
    const [before, after] = distinctMetricValues(row);
    return `<tr><th scope="row">${e(row.label)}${row.unit ? `<small>${e(row.unit)}</small>` : ''}</th><td>${e(before)}</td><td class="hh-current-value">${e(after)}</td><td>${e(deltaValue(row))}${row.comparable === false ? '<small>เทียบตัวเลขไม่ได้</small>' : row.unit === '%' && row.delta !== null ? '<small>จุดเปอร์เซ็นต์</small>' : ''}</td></tr>`;
  }).join('')}</tbody></table>`);
}

function countMarkup(comparison) {
  const summary = comparison?.summary || {};
  return `<dl class="hh-counts">${['added', 'removed', 'changed', 'unchanged', 'missing'].map(status => `<div class="hh-count-${status}"><dt>${STATUS[status]}</dt><dd>${serial(number(summary[status]))}</dd></div>`).join('')}</dl>`;
}

function orderMarkup(comparison, report = false) {
  if (!comparison?.orderChanged) return '';
  const rows = comparison.orderChanges || [];
  return `<div class="hh-order-note">${report ? '' : icon('layers')}<div><strong>ลำดับเอกสารเปลี่ยน ${number(comparison.summary?.reordered)} รายการ</strong><p>แสดงการจัดลำดับแยกจากการเปลี่ยนข้อมูลและผลคำนวณ</p>${report && rows.length ? `<ul>${rows.map(row => `<li>${e(comparison.entries?.find(entry => entry.id === row.id)?.name || row.id)}: ลำดับ ${number(row.beforeIndex) + 1} → ${number(row.afterIndex) + 1}</li>`).join('')}</ul>` : ''}</div></div>`;
}

function contextMarkup(entry, label, absent) {
  if (!entry) return `<div class="hh-source-context is-absent"><span>${e(label)}</span><strong>${e(absent)}</strong></div>`;
  if (entry.missing) return `<div class="hh-source-context is-absent"><span>${e(label)}</span><strong>ไม่พบเอกสารต้นทางที่เลือกไว้</strong></div>`;
  return `<div class="hh-source-context"><span>${e(label)}</span><strong>${e(entry.document?.projectCode || entry.name)}</strong><p>REV ${e(entry.document?.revision || 'P01')} · ${e(sourceText(entry))}</p><small>${e(entry.model?.label || 'เปิดตรวจข้อมูลในเครื่องมือ')}</small></div>`;
}

function sourceChanges(row) {
  const result = [...(row.details?.timestampChanges || [])];
  if (row.changes?.name) result.unshift({ label: 'ชื่องาน', before: row.before?.name, after: row.after?.name });
  if (row.changes?.tool) result.unshift({ label: 'เครื่องมือ', before: row.before?.toolTitle, after: row.after?.toolTitle });
  if (row.changes?.sourceState) result.push({ label: 'ที่มาข้อมูล', before: sourceText(row.before), after: sourceText(row.after) });
  return result;
}

function documentDetailsMarkup(row, { report = false } = {}) {
  const details = row.details || {};
  const blocks = [
    ['ผลลัพธ์ที่คำนวณด้วยแบบจำลองปัจจุบัน', metricsTable(details.metrics)],
    ['ตัวแปรคำนวณที่เปลี่ยน', changeTable(details.inputChanges, 'ตัวแปรที่เปลี่ยนจากฉบับอ้างอิง')],
    ['ข้อมูลเอกสารที่เปลี่ยน', changeTable(details.documentChanges, 'ข้อมูลเอกสารฉบับอ้างอิงและปัจจุบัน')],
    ['ส่วนข้อมูลที่เปลี่ยน', changeTable(details.sectionChanges, 'ส่วนข้อมูลที่เปลี่ยน', { section: true })],
    ['การตรวจทานที่เปลี่ยน', changeTable(details.registerChanges, 'จำนวนประเด็นและการตรวจทานที่เปลี่ยน', { delta: true })],
    ['ชื่อและที่มาของข้อมูล', changeTable(sourceChanges(row), 'ชื่อและที่มาของข้อมูล')],
  ].filter(([, content]) => content);
  const warnings = [...new Set(details.warnings || [])];
  return `<div class="hh-document-content"><div class="hh-context-pair">${contextMarkup(row.before, 'ฉบับอ้างอิง', 'ยังไม่ได้เลือกเอกสารนี้ในฉบับอ้างอิง')}${contextMarkup(row.after, 'ชุดปัจจุบัน', 'ไม่ได้เลือกเอกสารนี้ในชุดปัจจุบัน')}</div>${row.orderChanged ? `<p class="hh-document-order">ลำดับ ${number(row.beforeIndex) + 1} → ${number(row.afterIndex) + 1} · บันทึกการเปลี่ยนลำดับแยกไว้</p>` : ''}${blocks.length ? blocks.map(([title, content]) => `<section class="hh-diff-section"><h4>${e(title)}</h4>${content}</section>`).join('') : `<p class="hh-no-detail">${row.status === 'unchanged' ? 'ข้อมูลต้นทางตรงกับฉบับอ้างอิงที่เลือก' : row.status === 'missing' ? 'เปิดงานต้นทางหรือคืนไฟล์งานก่อนเปรียบเทียบผลปัจจุบัน' : 'ดูสถานะเอกสารและที่มาข้อมูลด้านบน'}</p>`}${warnings.length ? `<ul class="hh-document-warnings">${warnings.map(warning => `<li>${e(warning)}</li>`).join('')}</ul>` : ''}${!report && row.after && !row.after.missing ? `<div class="hh-document-footer"><button type="button" class="button light compact" data-hh-open="${e(row.id)}">เปิดงานปัจจุบัน ${icon('external')}</button><span>การเปิดดูฉบับอ้างอิงไม่เปลี่ยนข้อมูลต้นทาง</span></div>` : ''}</div>`;
}

function documentMarkup(row, open) {
  return `<details class="hh-document hh-document-${e(row.status)}" data-hh-document="${e(row.id)}"${open ? ' open' : ''}><summary><span class="hh-document-index">${row.afterIndex === null || row.afterIndex === undefined ? '—' : serial(row.afterIndex + 1)}</span><span class="hh-document-heading"><strong>${e(row.name)}</strong><small>${e(row.toolTitle || row.toolId)}${row.before?.document?.revision || row.after?.document?.revision ? ` · ${e(row.before?.document?.revision || '—')} → ${e(row.after?.document?.revision || '—')}` : ''}</small></span><span class="hh-status hh-status-${e(row.status)}">${e(STATUS[row.status] || row.status)}</span>${icon('chevron')}</summary>${documentDetailsMarkup(row)}</details>`;
}

export function handoverHistorySnapshotReportMarkup(entry, model, { currentAppVersion = '', warnings = [] } = {}) {
  if (!entry?.bundle || !model) throw new Error('กรุณาเลือกฉบับอ้างอิงก่อนเปิดรายงาน');
  const context = `<div class="hh-snapshot-context"><span>REFERENCE SNAPSHOT</span><strong>ฉบับอ้างอิง ${e(entry.code)}</strong><p>เก็บข้อมูลเมื่อ ${e(stamp(entry.capturedAt))} · รุ่นแอปที่ระบุ ${e(entry.appVersion || '—')}</p><p>${e(entry.note)}</p><small>ใช้ข้อมูลต้นทางที่เก็บไว้ในฉบับนี้ ผลสรุปคำนวณใหม่ด้วยแบบจำลองปัจจุบัน${currentAppVersion ? ' · รุ่น ' + e(currentAppVersion) : ''}</small>${warnings.length ? `<ul>${warnings.map(warning => `<li>${e(warning)}</li>`).join('')}</ul>` : ''}</div>`;
  return handoverReportMarkup(model).replace('<section class="document-cover handover-report-cover">', `<section class="document-cover handover-report-cover">${context}`);
}

export function handoverHistoryComparisonReportMarkup(comparison) {
  if (!comparison?.reference || !Array.isArray(comparison.entries)) throw new Error('กรุณาเลือกฉบับอ้างอิงก่อนสร้างรายงานเปรียบเทียบ');
  const reference = comparison.reference;
  return `<section class="document-cover hh-report-cover"><span class="eyebrow">ENG APP / PACKAGE CHANGE REVIEW</span><h1>${e(reference.code)} → ชุดปัจจุบัน</h1><p>ทะเบียนการเปลี่ยนแปลงของชุดเอกสารที่เลือก</p><dl><div><dt>เก็บฉบับอ้างอิงเมื่อ</dt><dd>${e(stamp(reference.capturedAt))}</dd></div><div><dt>สร้างการเปรียบเทียบเมื่อ</dt><dd>${e(stamp(comparison.generatedAt))}</dd></div><div><dt>รุ่นแอปที่เก็บข้อมูล</dt><dd>${e(reference.appVersion || '—')}</dd></div><div><dt>รุ่นแอปที่คำนวณเปรียบเทียบ</dt><dd>${e(comparison.currentAppVersion || 'ปัจจุบัน')}</dd></div></dl><div class="hh-reference-note"><strong>เหตุผลที่เก็บฉบับอ้างอิง</strong><p>${e(reference.note)}</p></div><p class="hh-report-boundary">คำนวณทั้งสองชุดจากข้อมูลต้นทางด้วยแบบจำลองปัจจุบัน การเก็บฉบับอ้างอิงเป็นบันทึกของผู้ใช้สำหรับตรวจความเปลี่ยนแปลง</p><p class="hh-report-boundary">จับคู่ด้วยรหัสภายในของงานต้นทาง สำเนาหรืองานนำเข้าใหม่มีรหัสใหม่ จึงแสดงเป็นเอกสารเพิ่ม / นำออก</p></section>
    <div class="document-report-body hh-report-body"><section><h2>ภาพรวมการเปลี่ยนแปลง</h2>${countMarkup(comparison)}<p class="hh-document-count-note">ฉบับอ้างอิง ${number(comparison.summary?.referenceDocuments)} เอกสาร · ชุดปัจจุบัน ${number(comparison.summary?.currentDocuments)} เอกสาร</p>${orderMarkup(comparison, true)}${comparison.warnings?.length ? `<ul class="hh-comparison-warnings">${comparison.warnings.map(warning => `<li>${e(warning)}</li>`).join('')}</ul>` : ''}</section><section><h2>ข้อมูลปกชุดและการส่งต่อ</h2>${comparison.metadataChanges?.length ? changeTable(comparison.metadataChanges, 'ข้อมูลปกชุดที่เปลี่ยน') : '<p class="hh-no-detail">ข้อมูลปกชุดตรงกับฉบับอ้างอิง</p>'}</section><section><h2>ทะเบียนการเปลี่ยนแปลงรายเอกสาร</h2>${tableWrap('ทะเบียนการเปลี่ยนแปลงเอกสาร', `<table class="hh-report-register"><thead><tr><th scope="col">เอกสาร</th><th scope="col">ฉบับอ้างอิง</th><th scope="col">ชุดปัจจุบัน</th><th scope="col">สถานะ</th></tr></thead><tbody>${comparison.entries.map(row => `<tr><th scope="row">${e(row.name)}<small>${e(row.toolTitle || row.toolId)}</small></th><td>${e(row.before?.document?.revision || '—')}</td><td>${e(row.after?.document?.revision || '—')}</td><td>${e(STATUS[row.status] || row.status)}</td></tr>`).join('')}</tbody></table>`)}</section><section><h2>รายละเอียดเปรียบเทียบ</h2>${comparison.entries.map(row => `<section class="hh-report-document"><div class="hh-report-document-heading"><h3>${e(row.name)}</h3><span class="hh-status hh-status-${e(row.status)}">${e(STATUS[row.status] || row.status)}</span></div>${documentDetailsMarkup(row, { report: true })}</section>`).join('')}</section></div><footer class="print-footer hh-report-footer">ENG APP / PACKAGE CHANGE REVIEW · ผลต่างแต่ละเอกสารแยกกัน · ตรวจสมมติฐานและขอบเขตของเครื่องมือต้นทางก่อนใช้ผล</footer>`;
}

export function mountHandoverHistory(host, {
  history = { entries: [], selectedId: null, draft: {} }, currentModel = null, comparison = null, notice = '', undoLabel = '', busy: initialBusy = false, readOnly = false,
  onDraftChange = () => {}, onSelect = () => {}, onCapture = () => {}, onRemove = () => {}, onUndo = () => {}, onOpen = () => {},
  onSnapshotReport = () => {}, onComparisonReport = () => {}, onExportSnapshot = () => {}, onRefresh = () => {}, notify = () => {},
} = {}) {
  let view = { history, currentModel, comparison, notice, undoLabel, busy: initialBusy, readOnly };
  let draft = copyDraft(history.draft);
  let receivedDraft = copyDraft(history.draft);
  let query = '', filter = 'all', busy = false, disposed = false;
  let renderedSelection = null;
  let openIds = new Set();
  host.innerHTML = `<div class="handover-history-workspace"><a class="hh-back" href="#handover">${icon('back')} กลับไปจัดชุดส่งตรวจ</a><header class="hh-page-heading"><div><span class="eyebrow">PROJECT HANDOVER / REFERENCE HISTORY</span><h1>ฉบับอ้างอิงและการเปลี่ยนแปลง</h1><p>เก็บข้อมูลทั้งชุดไว้เทียบกับงานรอบถัดไป เห็นสิ่งที่เพิ่ม นำออก และเปลี่ยนในแต่ละเอกสาร</p></div><a class="button light compact" href="#review-room">${icon('check')} ห้องทบทวน</a><button type="button" class="button primary" data-hh-action="capture-focus">${icon('save')} เก็บชุดปัจจุบัน</button></header>
    <details class="hh-capture"${history.entries?.length ? '' : ' open'}><summary><span>${icon('plus')} เก็บชุดปัจจุบันเป็นฉบับอ้างอิง</span><small data-hh-capacity></small>${icon('chevron')}</summary><form class="hh-capture-form"><label for="hh-capture-code"><span>รหัสฉบับอ้างอิง</span><input id="hh-capture-code" name="code" data-hh-draft="code" maxlength="40" required autocomplete="off" placeholder="เช่น PKG-P01" value="${e(draft.code)}"></label><label for="hh-capture-note"><span>เหตุผลหรือสิ่งที่ต้องเก็บไว้เทียบ</span><textarea id="hh-capture-note" name="note" data-hh-draft="note" maxlength="1200" required rows="2" placeholder="เช่น ชุดก่อนปรับหน้าตัด B1 และทบทวนปริมาณ BOQ">${e(draft.note)}</textarea></label><button type="submit" class="button primary" data-hh-capture-submit>${icon('save')} เก็บฉบับนี้</button><p class="hh-capture-context" data-hh-capture-context></p><p class="hh-capture-error" data-hh-capture-error role="alert" hidden></p></form></details>
    <div data-hh-notice></div><div class="hh-undo" data-hh-undo hidden><span data-hh-undo-label></span><button type="button" class="link-button" data-hh-action="undo">คืนฉบับอ้างอิง</button></div>
    <div class="hh-layout"><aside class="hh-reference-rail" aria-label="รายการฉบับอ้างอิง"><div class="hh-rail-heading"><span class="eyebrow">REFERENCE SETS</span><h2>ฉบับที่เก็บไว้</h2><p>เลือกฉบับเพื่อเทียบกับชุดปัจจุบัน</p></div><div data-hh-reference-list></div><p class="hh-rail-note">ข้อมูลในฉบับที่เก็บไว้คงเดิม การเปิดดูและเปรียบเทียบไม่แก้ไขงานต้นทาง</p></aside>
    <section class="hh-review-workspace" aria-label="เปรียบเทียบฉบับอ้างอิง"><div data-hh-comparison-heading></div><div data-hh-counts></div><div data-hh-package-changes></div><div class="hh-ledger-toolbar" data-hh-ledger-toolbar><label class="search-input">${icon('search')}<input type="search" data-hh-search aria-label="ค้นหาเอกสารในผลเปรียบเทียบ" placeholder="ค้นหาชื่องาน รหัสเอกสาร หรือเครื่องมือ..."></label><button type="button" class="button light compact" data-hh-action="refresh">${icon('reset')} อ่านข้อมูลล่าสุด</button></div><div class="hh-filter-bar" data-hh-filters role="group" aria-label="กรองสถานะการเปลี่ยนแปลง">${FILTERS.map(([id, label]) => `<button type="button" data-hh-filter="${id}" aria-pressed="${id === 'all'}">${e(label)}</button>`).join('')}</div><p class="hh-result-count" data-hh-result-count role="status"></p><div data-hh-ledger></div></section></div><p class="hh-boundary">${icon('info')}<span>ฉบับอ้างอิงบันทึกข้อมูลที่เลือกไว้ ผลทั้งสองฝั่งคำนวณด้วยแบบจำลองปัจจุบัน รหัสและหมายเหตุเป็นข้อมูลที่ผู้ใช้ระบุ<br>จับคู่ด้วยรหัสภายในของงานต้นทาง สำเนาหรืองานนำเข้าใหม่มีรหัสใหม่ จึงแสดงเป็นเอกสารเพิ่ม / นำออก</span></p><span class="hh-live" data-hh-live role="status" aria-live="polite"></span></div>`;

  const selected = () => view.history?.entries?.find(entry => entry.id === view.history.selectedId) || null;
  const setError = message => { const el = host.querySelector('[data-hh-capture-error]'); el.textContent = message; el.hidden = !message; };
  const announce = message => { host.querySelector('[data-hh-live]').textContent = message; };
  const focusCapture = () => { const detail = host.querySelector('.hh-capture'); detail.open = true; detail.scrollIntoView({ block: 'start', behavior: 'smooth' }); host.querySelector('[data-hh-draft="code"]').focus({ preventScroll: true }); };

  function renderReferences() {
    const entries = view.history?.entries || [];
    host.querySelector('[data-hh-capacity]').textContent = `${entries.length}/${MAX_HANDOVER_REFERENCES} ฉบับ`;
    host.querySelector('[data-hh-reference-list]').innerHTML = entries.length ? `<ol class="hh-reference-list">${entries.map(entry => `<li class="${entry.id === view.history.selectedId ? 'is-selected' : ''}"><button type="button" class="hh-reference-select" data-hh-select="${e(entry.id)}" aria-pressed="${entry.id === view.history.selectedId}"><span class="hh-reference-node"></span><span><strong>${e(entry.code)}</strong><time datetime="${e(entry.capturedAt)}">${e(stamp(entry.capturedAt))}</time><small>${entry.bundle?.records?.length || 0} เอกสาร · ${e(entry.appVersion || '—')}</small><span>${e(entry.note)}</span></span></button><button type="button" class="hh-reference-remove" data-hh-remove="${e(entry.id)}" aria-label="นำฉบับอ้างอิง ${e(entry.code)} ออก"${view.busy || view.readOnly || busy ? ' disabled' : ''}>นำฉบับออก</button></li>`).join('')}</ol>` : `<div class="hh-reference-empty">${icon('layers')}<strong>ยังไม่มีฉบับอ้างอิง</strong><p>เก็บชุดปัจจุบันเป็นจุดเริ่มต้นสำหรับเทียบการเปลี่ยนแปลง</p><button type="button" class="link-button" data-hh-action="capture-focus">เก็บฉบับแรก</button></div>`;
  }

  function renderCaptureContext() {
    const summary = view.currentModel?.summary || {};
    const entries = view.history?.entries || [];
    let context = `ชุดปัจจุบัน ${number(summary.documents)} เอกสาร · มีร่างล่าสุด ${number(summary.drafts)} งาน`;
    if (summary.missing) context += ` · ไม่พบต้นทาง ${summary.missing} รายการ — กลับไปจัดชุดก่อนเก็บฉบับ`;
    if (!summary.documents) context += ' · เลือกเอกสารในหน้าชุดส่งตรวจก่อน';
    if (entries.length >= MAX_HANDOVER_REFERENCES) context += ` · ครบ ${MAX_HANDOVER_REFERENCES} ฉบับแล้ว ส่งออกและนำฉบับที่ไม่ใช้แล้วออกเพื่อเพิ่มฉบับใหม่`;
    if (view.readOnly) context += ' · ประวัติอยู่ในโหมดอ่านอย่างเดียว';
    if (view.busy) context += ' · กำลังบันทึกการเปลี่ยนแปลง';
    host.querySelector('[data-hh-capture-context]').textContent = context;
    host.querySelector('[data-hh-capture-submit]').disabled = busy || view.busy || view.readOnly || !summary.documents || Boolean(summary.missing) || entries.length >= MAX_HANDOVER_REFERENCES;
    host.querySelectorAll('[data-hh-draft]').forEach(field => { field.disabled = busy || view.busy; });
    host.querySelectorAll('[data-hh-remove],[data-hh-action="undo"]').forEach(button => { button.disabled = busy || view.busy || view.readOnly; });
  }

  function renderComparisonHeading() {
    const entry = selected();
    const comparison = view.comparison;
    const hasComparison = Boolean(entry && comparison);
    host.querySelector('[data-hh-comparison-heading]').innerHTML = entry ? `<div class="hh-comparison-heading"><div><span class="eyebrow">REFERENCE → CURRENT PACKAGE</span><h2>${e(entry.code)} <span aria-hidden="true">→</span> ชุดปัจจุบัน</h2><p>${e(view.currentModel?.metadata?.title || 'ชุดเอกสารที่เลือก')}</p><small>อ้างอิง ${e(stamp(entry.capturedAt))}${comparison?.generatedAt ? ` · อ่านข้อมูล ${e(stamp(comparison.generatedAt))}` : ''}</small></div><div class="hh-comparison-document-count"><strong>${number(comparison?.summary?.referenceDocuments ?? entry.bundle?.records?.length)} <span>→</span> ${number(comparison?.summary?.currentDocuments ?? view.currentModel?.summary?.documents)}</strong><span>เอกสาร</span></div></div><div class="hh-report-actions"><button type="button" class="button primary compact" data-hh-action="comparison-report"${!hasComparison ? ' disabled' : ''}>${icon('file')} รายงานเปรียบเทียบ</button><button type="button" class="button light compact" data-hh-action="snapshot-report">รายงานฉบับอ้างอิง</button><button type="button" class="link-button" data-hh-action="export-snapshot">${icon('download')} JSON ฉบับอ้างอิง</button></div>${!hasComparison ? '<p class="hh-comparison-unavailable">ยังเปรียบเทียบกับข้อมูลปัจจุบันไม่ได้ เปิดรายงานหรือส่งออกฉบับอ้างอิงที่เก็บไว้ได้จากปุ่มด้านบน</p>' : ''}` : `<div class="hh-start-panel"><span class="eyebrow">A REFERENCE FOR THE NEXT REVIEW</span><h2>${view.history?.selectedId ? 'ไม่พบฉบับอ้างอิงที่เลือกไว้' : view.history?.entries?.length ? 'เลือกฉบับอ้างอิงเพื่อเริ่มเทียบ' : 'เก็บจุดอ้างอิงของชุดนี้ไว้'}</h2><p>ชุดปัจจุบันมี ${number(view.currentModel?.summary?.documents)} เอกสาร เมื่อแก้ไขงานในรอบต่อไป หน้านี้จะแสดงสิ่งที่เปลี่ยนเทียบกับข้อมูลที่เก็บไว้</p><button type="button" class="button light" data-hh-action="capture-focus">${icon('save')} เก็บชุดปัจจุบัน</button></div>`;
    host.querySelector('[data-hh-counts]').innerHTML = hasComparison ? countMarkup(comparison) : '';
    host.querySelector('[data-hh-package-changes]').innerHTML = hasComparison ? `${orderMarkup(comparison)}${comparison.metadataChanges?.length ? `<details class="hh-package-changes"><summary>ข้อมูลปกชุดเปลี่ยน ${comparison.metadataChanges.length} รายการ</summary>${changeTable(comparison.metadataChanges, 'ข้อมูลปกชุดที่เปลี่ยน')}</details>` : ''}${comparison.warnings?.length ? `<ul class="hh-comparison-warnings">${comparison.warnings.map(warning => `<li>${e(warning)}</li>`).join('')}</ul>` : ''}` : '';
    host.querySelector('[data-hh-ledger-toolbar]').hidden = !hasComparison;
    host.querySelector('[data-hh-filters]').hidden = !hasComparison;
    host.querySelector('[data-hh-result-count]').hidden = !hasComparison;
  }

  function renderLedger() {
    const comparison = view.comparison;
    if (!selected() || !comparison) { host.querySelector('[data-hh-ledger]').innerHTML = ''; return; }
    const words = query.trim().toLocaleLowerCase('th').split(/\s+/).filter(Boolean);
    const entries = comparison.entries || [];
    const visible = entries.filter(row => (filter === 'all' || row.status === filter) && words.every(word => [row.name, row.toolTitle, row.toolId, row.before?.document?.projectCode, row.after?.document?.projectCode].join(' ').toLocaleLowerCase('th').includes(word)));
    host.querySelector('[data-hh-result-count]').textContent = `แสดง ${visible.length} จาก ${entries.length} เอกสาร · เปิดแถวเพื่อดูข้อมูลก่อนและหลัง`;
    host.querySelectorAll('[data-hh-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.hhFilter === filter)));
    host.querySelector('[data-hh-ledger]').innerHTML = visible.length ? visible.map(row => documentMarkup(row, openIds.has(row.id))).join('') : `<div class="hh-filter-empty">${icon('search')}<strong>ไม่พบเอกสารตามตัวกรองนี้</strong><p>เปลี่ยนคำค้นหรือดูทุกสถานะ</p><button type="button" class="link-button" data-hh-action="clear-filter">ล้างตัวกรอง</button></div>`;
  }

  function render() {
    const focused = host.ownerDocument.activeElement;
    const selectedFocus = focused?.dataset?.hhSelect;
    const removedFocus = focused?.dataset?.hhRemove;
    const entryId = selected()?.id || null;
    if (entryId !== renderedSelection) {
      renderedSelection = entryId;
      const first = view.comparison?.entries?.find(row => row.status === 'changed') || view.comparison?.entries?.find(row => row.status !== 'unchanged');
      openIds = new Set(first ? [first.id] : []);
    }
    renderReferences(); renderCaptureContext(); renderComparisonHeading(); renderLedger();
    const notices = [view.notice, view.history?.selectedId && !selected() ? 'ไม่พบฉบับอ้างอิงที่เลือกไว้ กรุณาเลือกฉบับที่มีอยู่จากรายการ' : ''].filter(Boolean);
    host.querySelector('[data-hh-notice]').innerHTML = notices.length ? `<p class="hh-notice" role="status">${notices.map(e).join('<br>')}</p>` : '';
    host.querySelector('[data-hh-undo]').hidden = !view.undoLabel;
    host.querySelector('[data-hh-undo-label]').textContent = view.undoLabel;
    host.querySelector('[data-hh-action="undo"]').disabled = view.busy || view.readOnly || busy;
    if (selectedFocus) [...host.querySelectorAll('[data-hh-select]')].find(button => button.dataset.hhSelect === selectedFocus)?.focus({ preventScroll: true });
    if (removedFocus && !(view.history?.entries || []).some(entry => entry.id === removedFocus) && view.undoLabel) host.querySelector('[data-hh-action="undo"]').focus({ preventScroll: true });
  }

  const input = event => {
    const key = event.target.dataset?.hhDraft;
    if (key) { draft = { ...draft, [key]: event.target.value }; setError(''); onDraftChange(copyDraft(draft)); }
    else if (event.target.matches('[data-hh-search]')) { query = event.target.value; renderLedger(); }
  };
  const submit = async event => {
    event.preventDefault();
    if (busy || host.querySelector('[data-hh-capture-submit]').disabled) return;
    const form = host.querySelector('form');
    if (!form.reportValidity()) return;
    if (!draft.code.trim() || !draft.note.trim()) { setError('กรุณาระบุรหัสและเหตุผลที่เก็บฉบับอ้างอิง'); host.querySelector(`[data-hh-draft="${draft.code.trim() ? 'note' : 'code'}"]`).focus(); return; }
    busy = true; renderCaptureContext(); setError('');
    try { await onCapture(copyDraft(draft)); }
    catch (error) { if (!disposed) { setError(error.message || 'ยังเก็บฉบับอ้างอิงไม่ได้'); notify(error.message || 'ยังเก็บฉบับอ้างอิงไม่ได้'); } }
    finally { busy = false; if (!disposed) renderCaptureContext(); }
  };
  const click = event => {
    const button = event.target.closest('button');
    if (!button || !host.contains(button) || button.disabled) return;
    if (button.dataset.hhSelect) { onSelect(button.dataset.hhSelect); return; }
    if (button.dataset.hhRemove) { onRemove(button.dataset.hhRemove); return; }
    if (button.dataset.hhOpen) { onOpen(button.dataset.hhOpen); return; }
    if (button.dataset.hhFilter) { filter = button.dataset.hhFilter; renderLedger(); return; }
    const action = button.dataset.hhAction;
    if (action === 'capture-focus') focusCapture();
    else if (action === 'undo') onUndo();
    else if (action === 'refresh') { onRefresh(); announce('อ่านข้อมูลปัจจุบันใหม่แล้ว'); }
    else if (action === 'clear-filter') { query = ''; filter = 'all'; host.querySelector('[data-hh-search]').value = ''; renderLedger(); host.querySelector('[data-hh-search]').focus(); }
    else {
      const id = selected()?.id;
      if (!id) return;
      if (action === 'snapshot-report') onSnapshotReport(id);
      else if (action === 'comparison-report') onComparisonReport(id);
      else if (action === 'export-snapshot') onExportSnapshot(id);
    }
  };
  const toggle = event => {
    if (!host.contains(event.target)) return;
    const id = event.target.dataset?.hhDocument;
    if (id) { if (event.target.open) openIds.add(id); else openIds.delete(id); }
  };
  host.addEventListener('input', input);
  host.addEventListener('click', click);
  host.addEventListener('toggle', toggle, true);
  host.querySelector('form').addEventListener('submit', submit);
  render();
  return {
    getDraft: () => copyDraft(draft),
    refresh(patch = {}) {
      if (disposed) return;
      view = { ...view, ...patch };
      const nextDraft = copyDraft(view.history?.draft);
      if (patch.history && JSON.stringify(nextDraft) !== JSON.stringify(receivedDraft) && JSON.stringify(nextDraft) !== JSON.stringify(draft)) {
        draft = nextDraft;
        for (const [key, value] of Object.entries(draft)) host.querySelector(`[data-hh-draft="${key}"]`).value = value;
      }
      if (patch.history) receivedDraft = nextDraft;
      render();
    },
    destroy() { disposed = true; host.removeEventListener('input', input); host.removeEventListener('click', click); host.removeEventListener('toggle', toggle, true); host.querySelector('form')?.removeEventListener('submit', submit); },
  };
}
