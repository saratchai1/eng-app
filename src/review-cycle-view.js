import { escapeHTML as e } from './utils.js';
import { icon } from './visuals.js';
import { REVIEW_ROOM_KINDS } from './review-room.js';
import { REVIEW_CYCLE_TRANSITIONS, normalizeReviewCycleFilters, filterReviewCycle, groupReviewCycle } from './review-cycle.js';

export const REVIEW_CYCLE_PAGE_SIZE = 20;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const serial = value => String(count(value)).padStart(2, '0');
const stamp = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }) : 'ยังไม่ระบุเวลา';
};
const textValue = value => value === null || value === undefined ? '—' : typeof value === 'boolean' ? value ? 'ใช่' : 'ไม่ใช่' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const sourceLabel = value => value === 'draft' ? 'ร่างแก้ไขล่าสุด' : value === 'missing' ? 'ไม่พบต้นทาง' : 'งานที่บันทึกแล้ว';
const optionsMarkup = (entries, value) => entries.map(([id, label]) => `<option value="${e(id)}"${id === value ? ' selected' : ''}>${e(label)}</option>`).join('');
const transitionLabel = row => row.transitionLabel || REVIEW_CYCLE_TRANSITIONS[row.transition] || row.transition || 'ยังเทียบไม่ได้';

/** Navigation preferences contain no comparison evidence, source status or reference data. */
export function normalizeReviewCycleViewState(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const filters = normalizeReviewCycleFilters({ ...(value.filters || {}), groupBy: value.groupBy || value.filters?.groupBy });
  return {
    filters, groupBy: filters.groupBy,
    selectedId: typeof value.selectedId === 'string' && value.selectedId.length <= 1600 && !/[\u0000-\u001f\u007f]/.test(value.selectedId) ? value.selectedId : null,
    page: Number.isSafeInteger(value.page) && value.page > 0 && value.page <= 10000 ? value.page : 1,
    detailOpen: value.detailOpen === true,
  };
}

/** Never replace an absent or filtered selection with another row after a live refresh. */
export function reviewCycleSelectionState(model, rawState) {
  const state = normalizeReviewCycleViewState(rawState);
  if (!state.selectedId) return { status: 'none', entry: null };
  const entry = model?.entries?.find(row => row.id === state.selectedId);
  if (!entry) return { status: 'missing', entry: null };
  return { status: filterReviewCycle(model, state.filters).some(row => row.id === entry.id) ? 'visible' : 'filtered', entry };
}

/** Pagination applies only to the screen; exports receive every active filter. */
export function reviewCyclePage(model, rawState) {
  const state = normalizeReviewCycleViewState(rawState);
  const visible = model ? filterReviewCycle(model, state.filters) : [], groups = groupReviewCycle(visible, state.groupBy);
  const ordered = groups.flatMap(group => group.entries), pages = Math.max(1, Math.ceil(ordered.length / REVIEW_CYCLE_PAGE_SIZE));
  const page = Math.min(state.page, pages);
  return { visible, groups, ordered, pages, page, rows: ordered.slice((page - 1) * REVIEW_CYCLE_PAGE_SIZE, page * REVIEW_CYCLE_PAGE_SIZE) };
}

export function reviewCycleReferenceMarkup(references = [], selectedReferenceId = null, model = null) {
  const reference = references.find(row => row.id === selectedReferenceId);
  if (!reference) return `<div class="rc-start"><span class="eyebrow">A BASELINE FOR THE REVIEW</span><h2>${selectedReferenceId ? 'ไม่พบฉบับอ้างอิงที่เลือกไว้' : references.length ? 'เลือกฉบับอ้างอิงที่จะเทียบ' : 'เก็บฉบับอ้างอิงก่อนเริ่มเทียบรอบ'}</h2><p>${selectedReferenceId ? 'ฉบับนี้อาจถูกนำออกหรืออ่านไม่ได้ เลือกฉบับที่มีอยู่จากรายการด้านบน ระบบจะไม่เปลี่ยนจุดอ้างอิงให้เอง' : references.length ? 'เลือกข้อมูลที่เก็บไว้เพื่อดูว่า รอบปัจจุบันมีประเด็นใดเพิ่ม เปลี่ยน ปิด หรือยังต้องตรวจต่อ' : 'ไปที่ฉบับอ้างอิงของชุดส่งตรวจ แล้วเก็บชุดพร้อมรหัสและเหตุผล เมื่อกลับมา หน้านี้จะเทียบกับข้อมูลปัจจุบันได้'}</p><a class="button light" href="#handover-history">${icon('layers')} จัดการฉบับอ้างอิง</a></div>`;
  const s = model?.summary || {}, current = model?.currentModel?.metadata || {};
  return `<div class="rc-context-pair"><section class="rc-context is-before" aria-label="ฉบับอ้างอิงที่เลือก"><span class="eyebrow">REFERENCE / CAPTURED INPUTS</span><strong>${e(reference.code)}</strong><p>${e(reference.note || 'ยังไม่ระบุเหตุผลที่เก็บฉบับ')}</p><small>เก็บเมื่อ ${e(stamp(reference.capturedAt))} · เวลาไทย · รุ่น ${e(reference.appVersion || '—')}</small><dl class="rc-context-metrics"><div><dt>เอกสารในฉบับ</dt><dd>${serial(s.referenceDocuments ?? reference.documentCount)}</dd></div><div><dt>รายการที่ต้องตรวจต่อ</dt><dd>${model ? serial(s.beforeOutstanding) : '—'}</dd></div></dl></section><div class="rc-context-arrow" aria-hidden="true"><span>→</span></div><section class="rc-context is-current" aria-label="ชุดปัจจุบันที่นำมาเทียบ"><span class="eyebrow">CURRENT / LATEST SOURCES</span><strong>${e(current.title || 'ชุดส่งตรวจปัจจุบัน')}</strong><p>${e(current.reference || 'ยังไม่ระบุเลขที่ชุดส่งตรวจ')}${current.recipient ? ` · ${e(current.recipient)}` : ''}</p><small>${model ? `อ่านเมื่อ ${e(stamp(model.generatedAt))} · เวลาไทย` : 'ยังเปรียบเทียบข้อมูลปัจจุบันไม่ได้'}</small><dl class="rc-context-metrics"><div><dt>เอกสารที่เลือก</dt><dd>${model ? serial(s.currentDocuments) : '—'}</dd></div><div><dt>รายการที่ต้องตรวจต่อ</dt><dd>${model ? serial(s.currentOutstanding) : '—'}</dd></div></dl></section></div><p class="rc-compare-note">${icon('info')}<span>ผลทั้งสองรอบคำนวณจากข้อมูลต้นทางด้วยแบบจำลองปัจจุบัน · จำนวนค้างอาจเปลี่ยนตามสมาชิกชุดและข้อมูลที่อ่านได้ จึงไม่ใช่เปอร์เซ็นต์ความสำเร็จหรือการอนุมัติ</span></p>`;
}

export function reviewCycleSummaryMarkup(model, transition = 'changes') {
  if (!model) return '';
  const s = model.summary || {};
  return `<div class="rc-summary-heading"><div><span class="eyebrow">REVIEW MOVEMENT</span><h2>สิ่งที่เปลี่ยนระหว่างสองรอบ</h2></div><p>${count(s.total)} รายการที่นำมาเทียบ · เปลี่ยน ${count(s.changes)}</p></div><div class="rc-transition-grid" role="group" aria-label="เลือกประเภทการเปลี่ยนแปลง">${Object.entries(REVIEW_CYCLE_TRANSITIONS).map(([key, label]) => `<button type="button" class="rc-transition-tile rc-transition-${e(key)}" data-rc-transition="${e(key)}" aria-pressed="${transition === key}" aria-label="${e(label)} ${count(s.counts?.[key])} รายการ"><strong>${serial(s.counts?.[key])}</strong><span>${e(label)}</span></button>`).join('')}</div>`;
}

function absentText(entry, side) {
  if (side === 'before') return entry.membership === 'added' ? 'เอกสารนี้ยังไม่อยู่ในฉบับอ้างอิง' : 'ไม่พบรายการนี้ในฉบับอ้างอิง';
  if (entry.membership === 'removed') return 'เอกสารนี้ไม่ได้เลือกในชุดปัจจุบัน';
  if (entry.membership === 'missing') return 'ไม่พบต้นทางปัจจุบันที่อ่านได้';
  if (entry.membership === 'tool-changed') return 'ชนิดเครื่องมือเปลี่ยน จึงเทียบรายการเดิมไม่ได้';
  if (entry.transition === 'not-listed') return 'ไม่พบประเด็นเดิมในทะเบียนปัจจุบัน';
  if (entry.transition === 'unavailable') return 'ยังประเมินรายการปัจจุบันไม่ได้';
  return 'ไม่พบรายการนี้ในข้อมูลปัจจุบัน';
}

function evidenceSideMarkup(entry, side) {
  const finding = entry[side], before = side === 'before', document = entry[before ? 'beforeDocument' : 'afterDocument'];
  const label = before ? 'ฉบับอ้างอิง' : 'ชุดปัจจุบัน';
  if (!finding) return `<section class="rc-evidence-side ${before ? 'is-before' : 'is-current'} is-absent"><span class="eyebrow">${before ? 'BEFORE / REFERENCE' : 'NOW / CURRENT'}</span><h4>${label}</h4><p>${e(absentText(entry, side))}</p>${document ? `<p>${e(document.document?.projectCode || document.name || '')}</p>` : ''}<p>อ่านเหตุผลของการเปรียบเทียบประกอบ การไม่มีรายการไม่ใช่การยืนยันว่าปิดแล้ว</p></section>`;
  return `<section class="rc-evidence-side ${before ? 'is-before' : 'is-current'}"><span class="eyebrow">${before ? 'BEFORE / REFERENCE' : 'NOW / CURRENT'}</span><h4>${label}</h4><dl class="rc-side-meta"><div><dt>สถานะตามข้อมูลรอบนี้</dt><dd>${e(finding.statusLabel || finding.status || 'ยังไม่ระบุ')}</dd></div><div><dt>ผู้รับผิดชอบที่บันทึก</dt><dd>${e(finding.owner || 'ไม่มีชื่อในต้นทาง')}</dd></div><div><dt>ที่มาของข้อมูล</dt><dd>${before ? 'ข้อมูลในฉบับอ้างอิง' : e(sourceLabel(finding.sourceState))}${before && finding.sourceState === 'draft' ? ' · เก็บจากร่างแก้ไข' : ''}</dd></div><div><dt>รหัสเอกสาร / ฉบับ</dt><dd>${e(finding.documentCode || finding.documentName || 'ยังไม่ระบุรหัส')} · REV ${e(finding.documentRevision || '—')}</dd></div></dl>${finding.title !== entry.title ? `<div class="rc-side-section"><strong>หัวข้อในรอบนี้</strong><p>${e(finding.title)}</p></div>` : ''}${finding.detail ? `<div class="rc-side-section"><strong>ข้อสังเกต</strong><p>${e(finding.detail)}</p></div>` : ''}${finding.response ? `<div class="rc-side-section"><strong>คำตอบที่บันทึกไว้</strong><p>${e(finding.response)}</p></div>` : ''}${finding.evidence?.length ? `<div class="rc-side-section"><strong>ข้อมูลประกอบ</strong><dl class="rc-side-evidence">${finding.evidence.map(row => `<div><dt>${e(row.label)}</dt><dd>${e(textValue(row.value))}</dd></div>`).join('')}</dl></div>` : ''}${finding.warnings?.length ? `<ul class="rc-side-warnings">${finding.warnings.map(warning => `<li>${e(warning)}</li>`).join('')}</ul>` : ''}</section>`;
}

export function reviewCycleEntryDetailMarkup(entry, { selectionStatus = 'visible' } = {}) {
  if (!entry) return `<div class="rc-empty">${icon('file')}<span class="eyebrow">BEFORE / CURRENT EVIDENCE</span><h3 id="rc-detail-title" tabindex="-1">${selectionStatus === 'missing' ? 'ไม่พบรายการที่เลือกในผลล่าสุด' : 'เลือกประเด็นเพื่อเทียบสองรอบ'}</h3><p>${selectionStatus === 'missing' ? 'ข้อมูลหรือขอบเขตการเปรียบเทียบเปลี่ยนไปแล้ว เลือกรายการใหม่เมื่อพร้อม ระบบไม่เลือกแทนรายการเดิมให้อัตโนมัติ' : 'อ่านข้อมูลก่อนและหลัง พร้อมเหตุผลของสถานะและตำแหน่งที่เปิดตรวจต่อได้'}</p><button type="button" class="button light compact" data-rc-action="${selectionStatus === 'missing' ? 'clear-selection' : 'start'}">${selectionStatus === 'missing' ? 'กลับไปเลือกรายการ' : 'เริ่มจากรายการแรก'}</button></div>`;
  const label = transitionLabel(entry), open = entry.canOpenCurrent === true && !!entry.target;
  return `<header class="rc-detail-head"><div class="rc-detail-navigation"><button type="button" class="link-button" data-rc-action="back">← กลับไปรายการ</button><span>${e(entry.kindLabel || REVIEW_ROOM_KINDS[entry.kind] || '')}</span></div><span class="rc-badge rc-transition-${e(entry.transition)}">${e(label)}</span><h3 id="rc-detail-title" tabindex="-1">${e(entry.title)}</h3><p>${e(entry.documentCode || entry.documentName)} · ${e(entry.toolTitle || '')}</p></header><div class="rc-detail-content">${selectionStatus === 'filtered' ? '<p class="rc-selection-note" role="status">รายการที่เลือกอยู่นอกตัวกรองปัจจุบัน ยังคงแสดงหลักฐานล่าสุดเพื่อให้อ่านต่อได้ เลือกรายการถัดไปเมื่อพร้อม</p>' : ''}<p class="rc-reason rc-transition-${e(entry.transition)}">${e(entry.reason || 'อ่านข้อมูลและสถานะของแต่ละรอบประกอบ')}</p><div class="rc-evidence-pair">${evidenceSideMarkup(entry, 'before')}${evidenceSideMarkup(entry, 'after')}</div>${entry.changes?.length ? `<section class="rc-changes"><h4>ข้อมูลที่เปลี่ยน</h4><dl class="rc-change-list">${entry.changes.map(change => `<div class="rc-change"><dt>${e(change.label || change.key)}</dt><dd><div><small>ฉบับอ้างอิง</small><p>${e(textValue(change.before))}</p></div><div><small>ชุดปัจจุบัน</small><p>${e(textValue(change.after))}</p></div></dd></div>`).join('')}</dl></section>` : ''}<footer class="rc-source-action"><span class="eyebrow">CONTINUE THE REVIEW</span><p>${open ? 'เปิดงานปัจจุบันเพื่อตรวจหลักฐานและดำเนินการต่อ แล้วกลับมาอ่านผลเปรียบเทียบล่าสุด' : 'ยังเปิดต้นทางปัจจุบันของรายการนี้ไม่ได้ ตรวจสมาชิกชุดหรือข้อมูลต้นทางก่อน การขาดรายการไม่ยืนยันว่าปิดแล้ว'}</p><div><button type="button" class="button primary compact" data-rc-action="open"${open ? '' : ' disabled'}>${icon('external')} เปิดงานปัจจุบัน</button><button type="button" class="button light compact" data-rc-action="next">รายการถัดไป →</button>${open ? '' : '<a class="button light compact" href="#handover">ตรวจสมาชิกชุด</a>'}</div><small>การเทียบรอบไม่แก้ฉบับอ้างอิง ไม่เปลี่ยนสถานะ และไม่ยืนยันรายการตรวจแทนผู้ใช้</small></footer></div>`;
}

function entryRow(entry, selectedId) {
  return `<button type="button" class="rc-row rc-transition-${e(entry.transition)}${entry.id === selectedId ? ' is-selected' : ''}" data-rc-select="${e(entry.id)}" aria-pressed="${entry.id === selectedId}" aria-controls="rc-detail"><span class="rc-row-top"><span class="rc-badge rc-transition-${e(entry.transition)}">${e(transitionLabel(entry))}</span><small>${entry.documentIndex ? serial(entry.documentIndex) : '—'}</small></span><strong class="rc-row-title">${e(entry.title)}</strong><span class="rc-row-document">${e(entry.documentCode || entry.documentName)} · ${e(entry.kindLabel || REVIEW_ROOM_KINDS[entry.kind] || '')}</span><span class="rc-row-reason">${e(entry.reason)}</span><span class="rc-row-footer"><span>${e(entry.owner || 'ไม่มีชื่อในต้นทาง')}</span><span>อ่านสองรอบ →</span></span></button>`;
}

export function mountReviewCycle(host, {
  references = [], selectedReferenceId = null, model = null, initialState, notice = '',
  onStateChange = () => {}, onSelectReference = () => {}, onOpen = () => {}, onReport = () => {}, onExportCSV = () => {}, onRefresh = () => {},
} = {}) {
  let state = normalizeReviewCycleViewState(initialState), view = { references, selectedReferenceId, model, notice }, disposed = false;
  const getState = () => normalizeReviewCycleViewState({ ...state, filters: { ...state.filters } });
  const persist = () => onStateChange(getState());
  const availableModel = () => view.model?.reference?.id === view.selectedReferenceId && view.references.some(row => row.id === view.selectedReferenceId) ? view.model : null;
  const announce = message => { host.querySelector('[data-rc-live]').textContent = message; };
  const orderedEntries = () => reviewCyclePage(availableModel(), state).ordered;
  host.innerHTML = `<div class="review-cycle"><nav class="rc-breadcrumb" aria-label="เส้นทางการทบทวน"><a href="#review-room">← ห้องทบทวนโครงการ</a><span>/</span><a href="#handover-history">ฉบับอ้างอิงและการเปลี่ยนแปลง</a></nav><header class="rc-heading"><div><span class="eyebrow">PROJECT REVIEW / ROUND COMPARISON</span><h1>เทียบรอบตรวจ</h1><p>เห็นประเด็นที่เพิ่ม สิ่งที่เปลี่ยน และงานที่ยังต้องดูต่อ พร้อมหลักฐานจากทั้งสองรอบ</p></div><div class="rc-heading-actions"><button type="button" class="button primary compact" data-rc-action="report">${icon('file')} รายงานเทียบรอบ</button><button type="button" class="button light compact" data-rc-action="csv">${icon('download')} รายการ CSV</button></div></header><div class="rc-reference-control"><label><span>เลือกฉบับอ้างอิงสำหรับรอบนี้</span><select data-rc-reference aria-label="ฉบับอ้างอิงสำหรับเทียบรอบตรวจ"></select></label><a href="#handover-history">ดูประวัติ / เก็บฉบับใหม่ →</a></div><div data-rc-context></div><p class="rc-notice" data-rc-notice role="status" hidden></p><div data-rc-summary></div><section data-rc-workspace aria-label="รายการเปรียบเทียบและหลักฐาน"><div class="rc-queue-heading"><div><span class="eyebrow">REVIEW FOLLOW-UP</span><h2>ไล่ตรวจสิ่งที่เปลี่ยน</h2></div><button type="button" class="button light compact" data-rc-action="refresh">${icon('reset')} อ่านข้อมูลล่าสุด</button></div><div class="rc-search-row"><label class="rc-search">${icon('search')}<input type="search" data-rc-search aria-label="ค้นหาประเด็นจากทั้งสองรอบ" maxlength="240" placeholder="ค้นหารหัสเอกสาร ประเด็น หรือคำตอบทั้งสองรอบ..."></label><button type="button" class="link-button" data-rc-action="clear-filters">ล้างตัวกรอง</button></div><div class="rc-filters"><label><span>การเปลี่ยนแปลง</span><select data-rc-filter="transition" aria-label="กรองการเปลี่ยนแปลง"></select></label><label><span>เอกสาร</span><select data-rc-filter="documentId" aria-label="กรองเอกสารที่เปรียบเทียบ"></select></label><label><span>ที่มารายการ</span><select data-rc-filter="kind" aria-label="กรองที่มารายการ"></select></label><label><span>หมวดงาน</span><select data-rc-filter="category" aria-label="กรองหมวดงาน"></select></label><label><span>ผู้รับผิดชอบในรอบใดรอบหนึ่ง</span><select data-rc-filter="owner" aria-label="กรองผู้รับผิดชอบจากทั้งสองรอบ"></select></label></div><p class="rc-filter-note">คำค้น ที่มารายการ หมวดงาน และผู้รับผิดชอบอ่านจากทั้งฉบับอ้างอิงและชุดปัจจุบัน ชื่อที่ตรงกันเป็นข้อความที่บันทึกไว้ ไม่ใช่การมอบหมายงานอัตโนมัติ</p><div class="rc-list-toolbar"><p data-rc-result-count role="status"></p><label><span>จัดกลุ่ม</span><select data-rc-group aria-label="จัดกลุ่มรายการเปรียบเทียบ"><option value="transition">การเปลี่ยนแปลง</option><option value="document">เอกสารต้นทาง</option></select></label></div><p class="rc-export-note">รายงานและ CSV รวมทุกรายการที่ตรงตัวกรอง รวมหน้าถัดไป โดยระบุฉบับอ้างอิงและเวลาที่สร้าง</p><div class="rc-split"><div class="rc-queue"><div data-rc-list></div><nav class="rc-pagination" aria-label="หน้ารายการเปรียบเทียบ"><button type="button" class="button light compact" data-rc-action="previous-page">← ก่อนหน้า</button><span data-rc-page-count></span><button type="button" class="button light compact" data-rc-action="next-page">ถัดไป →</button></nav></div><aside class="rc-detail" id="rc-detail" data-rc-detail aria-label="หลักฐานก่อนและปัจจุบัน"></aside></div></section><p class="rc-boundary">${icon('info')}<span>จับคู่ด้วยรหัสงานและรายการต้นทาง การนำเอกสารหรือประเด็นออกไม่ถือว่าปิดแล้ว ผลเทียบเป็นข้อมูลประกอบการตรวจของผู้ใช้ตามขอบเขตที่แสดง</span></p><span class="rc-live" data-rc-live role="status" aria-live="polite"></span></div>`;
  host.querySelector('[data-rc-search]').value = state.filters.search;

  function renderOptions(current) {
    const values = state.filters;
    const optionSets = {
      transition: [['changes', 'เฉพาะรายการที่เปลี่ยน'], ['all', 'ทุกรายการ รวมข้อมูลตรงเดิม'], ...Object.entries(REVIEW_CYCLE_TRANSITIONS)],
      documentId: [['', 'ทุกเอกสาร'], ...(current?.documents || []).map(row => [row.id, row.name])],
      kind: [['all', 'ทุกที่มา'], ...Object.entries(REVIEW_ROOM_KINDS)],
      category: [['all', 'ทุกหมวดงาน'], ...(current?.categories || []).map(row => [row.id, row.label])],
      owner: [['', 'ทุกคน / ไม่มีชื่อ'], ...(current?.owners || []).map(row => [row.id, row.label])],
    };
    for (const [key, options] of Object.entries(optionSets)) {
      if (values[key] && !options.some(([id]) => id === values[key])) options.push([values[key], key === 'documentId' ? 'เอกสารที่เลือกไว้ไม่อยู่ในผลล่าสุด' : key === 'owner' ? (values[key].startsWith('owner:') ? values[key].slice(6) : 'ไม่มีชื่อในต้นทาง') : values[key]]);
      host.querySelector(`[data-rc-filter="${key}"]`).innerHTML = optionsMarkup(options, values[key]);
    }
    host.querySelector('[data-rc-group]').value = state.groupBy;
  }

  function render({ source = false, options = false, focusDetail = false } = {}) {
    if (disposed) return;
    const active = host.ownerDocument?.activeElement;
    const focused = active && host.contains(active) ? { entry: active.closest('[data-rc-select]')?.dataset.rcSelect, action: active.closest('[data-rc-action]')?.dataset.rcAction, heading: active.id === 'rc-detail-title', reference: active.matches('[data-rc-reference]') } : null;
    const current = availableModel();
    if (source) {
      const referenceOptions = [['', view.references.length ? 'เลือกฉบับอ้างอิง...' : 'ยังไม่มีฉบับอ้างอิง'], ...view.references.map(row => [row.id, `${row.code} · ${stamp(row.capturedAt)}`])];
      if (view.selectedReferenceId && !view.references.some(row => row.id === view.selectedReferenceId)) referenceOptions.push([view.selectedReferenceId, 'ไม่พบฉบับอ้างอิงที่เลือกไว้']);
      host.querySelector('[data-rc-reference]').innerHTML = optionsMarkup(referenceOptions, view.selectedReferenceId || '');
      host.querySelector('[data-rc-context]').innerHTML = reviewCycleReferenceMarkup(view.references, view.selectedReferenceId, current);
    }
    host.querySelector('[data-rc-summary]').innerHTML = reviewCycleSummaryMarkup(current, state.filters.transition);
    const note = host.querySelector('[data-rc-notice]'); note.textContent = view.notice || (view.selectedReferenceId && view.references.some(row => row.id === view.selectedReferenceId) && !current ? 'ยังเปรียบเทียบฉบับนี้ไม่ได้ ตรวจข้อมูลหรือเลือกฉบับอ้างอิงอื่น' : ''); note.hidden = !note.textContent;
    host.querySelector('[data-rc-workspace]').hidden = !current;
    host.querySelector('[data-rc-action="report"]').disabled = !current;
    host.querySelector('[data-rc-action="csv"]').disabled = !current;
    if (options) renderOptions(current);
    const { visible, groups, ordered, pages, page, rows } = reviewCyclePage(current, state); state.page = page;
    host.querySelector('[data-rc-result-count]').textContent = `แสดง ${visible.length} จาก ${current?.entries?.length || 0} รายการ · ${state.filters.transition === 'changes' ? 'เฉพาะรายการที่เปลี่ยน' : 'ตามตัวกรองที่เลือก'}`;
    const ids = new Set(rows.map(row => row.id));
    host.querySelector('[data-rc-list]').innerHTML = rows.length ? groups.filter(group => group.entries.some(row => ids.has(row.id))).map(group => `<section class="rc-queue-group"><h3><span>${e(group.label)}</span><small>${group.entries.length} รายการ</small></h3>${group.entries.filter(row => ids.has(row.id)).map(row => entryRow(row, state.selectedId)).join('')}</section>`).join('') : `<div class="rc-empty">${icon('search')}<h3>${!current?.entries?.length ? 'ยังไม่มีรายการในขอบเขตที่เทียบ' : 'ไม่มีรายการตรงตัวกรองนี้'}</h3><p>${state.filters.transition === 'changes' ? 'ลองเลือกทุกรายการเพื่อดูสิ่งที่ยังตรงกับฉบับอ้างอิง การไม่มีรายการเปลี่ยนไม่ใช่การอนุมัติ' : 'ปรับคำค้น เอกสาร หรือประเภทการเปลี่ยนแปลงเพื่ออ่านรายการอื่น'}</p><button type="button" class="button light compact" data-rc-action="${state.filters.transition === 'changes' ? 'show-all' : 'clear-filters'}">${state.filters.transition === 'changes' ? 'ดูทุกรายการ' : 'ล้างตัวกรอง'}</button></div>`;
    host.querySelector('[data-rc-page-count]').textContent = `หน้า ${page} / ${pages}`;
    host.querySelector('[data-rc-action="previous-page"]').disabled = page <= 1;
    host.querySelector('[data-rc-action="next-page"]').disabled = page >= pages;
    host.querySelector('.rc-pagination').hidden = !ordered.length;
    const selected = reviewCycleSelectionState(current, state);
    host.querySelector('[data-rc-detail]').innerHTML = reviewCycleEntryDetailMarkup(selected.entry, { selectionStatus: selected.status });
    host.querySelector('.rc-split').classList.toggle('is-detail-open', state.detailOpen);
    const start = host.querySelector('[data-rc-action="start"]'); if (start) start.disabled = !ordered.length;
    const next = host.querySelector('[data-rc-action="next"]'); if (next) next.disabled = !ordered.length || ordered.findIndex(row => row.id === state.selectedId) === ordered.length - 1;
    if (focusDetail) host.querySelector('#rc-detail-title')?.focus({ preventScroll: false });
    else if (focused && !host.contains(host.ownerDocument?.activeElement)) {
      const target = focused.entry ? [...host.querySelectorAll('[data-rc-select]')].find(el => el.dataset.rcSelect === focused.entry) : focused.action ? [...host.querySelectorAll('[data-rc-action]')].find(el => el.dataset.rcAction === focused.action) : focused.heading ? host.querySelector('#rc-detail-title') : focused.reference ? host.querySelector('[data-rc-reference]') : null;
      (target || host.querySelector(current ? '[data-rc-search]' : '[data-rc-reference]'))?.focus({ preventScroll: true });
    }
  }

  function choose(id) {
    if (!availableModel()?.entries?.some(row => row.id === id)) return;
    state.selectedId = id; state.detailOpen = true;
    const index = orderedEntries().findIndex(row => row.id === id); if (index >= 0) state.page = Math.floor(index / REVIEW_CYCLE_PAGE_SIZE) + 1;
    render({ focusDetail: true }); persist();
  }
  function changeFilters(patch) {
    state.filters = normalizeReviewCycleFilters({ ...state.filters, ...patch, groupBy: state.groupBy }); state.page = 1; state.detailOpen = false;
    render({ options: true }); persist(); announce(host.querySelector('[data-rc-result-count]').textContent);
  }
  function backToQueue() {
    state.detailOpen = false; render(); persist();
    ([...host.querySelectorAll('[data-rc-select]')].find(el => el.dataset.rcSelect === state.selectedId) || host.querySelector('[data-rc-search]')).focus();
  }
  const click = event => {
    const selected = event.target.closest('[data-rc-select]'); if (selected) { choose(selected.dataset.rcSelect); return; }
    const transition = event.target.closest('[data-rc-transition]'); if (transition) { changeFilters({ transition: transition.dataset.rcTransition }); host.querySelector('[data-rc-filter="transition"]').focus(); return; }
    const button = event.target.closest('[data-rc-action]'); if (!button || button.disabled) return;
    const action = button.dataset.rcAction;
    if (action === 'clear-filters' || action === 'show-all') { state.filters = normalizeReviewCycleFilters({ groupBy: state.groupBy, transition: action === 'show-all' ? 'all' : 'changes' }); host.querySelector('[data-rc-search]').value = ''; changeFilters({}); host.querySelector('[data-rc-search]').focus(); }
    else if (action === 'refresh') onRefresh();
    else if (action === 'report') onReport({ filters: { ...state.filters }, groupBy: state.groupBy });
    else if (action === 'csv') onExportCSV({ filters: { ...state.filters }, groupBy: state.groupBy });
    else if (action === 'open') { const entry = availableModel()?.entries?.find(row => row.id === state.selectedId); if (entry?.canOpenCurrent && entry.target) onOpen(entry); }
    else if (action === 'start') { const first = orderedEntries()[0]; if (first) choose(first.id); }
    else if (action === 'next') { const ordered = orderedEntries(), index = ordered.findIndex(row => row.id === state.selectedId), next = ordered[index + 1]; if (next) choose(next.id); }
    else if (action === 'back') backToQueue();
    else if (action === 'clear-selection') { state.selectedId = null; backToQueue(); }
    else if (action === 'previous-page' || action === 'next-page') { state.page += action === 'next-page' ? 1 : -1; state.detailOpen = false; render(); persist(); host.querySelector('[data-rc-select]')?.focus(); announce(host.querySelector('[data-rc-page-count]').textContent); }
  };
  const input = event => { if (event.target.matches('[data-rc-search]')) changeFilters({ search: event.target.value }); };
  const change = event => {
    if (event.target.matches('[data-rc-reference]')) { state.selectedId = null; state.page = 1; state.detailOpen = false; persist(); onSelectReference(event.target.value || null); }
    else if (event.target.matches('[data-rc-filter]')) changeFilters({ [event.target.dataset.rcFilter]: event.target.value });
    else if (event.target.matches('[data-rc-group]')) { state.groupBy = event.target.value; state.filters = normalizeReviewCycleFilters({ ...state.filters, groupBy: state.groupBy }); state.page = 1; state.detailOpen = false; render(); persist(); }
  };
  const keydown = event => { if (event.key === 'Escape' && event.target.closest('[data-rc-detail]')) { event.preventDefault(); backToQueue(); } };
  host.addEventListener('click', click); host.addEventListener('input', input); host.addEventListener('change', change); host.addEventListener('keydown', keydown);
  render({ source: true, options: true });
  return {
    getState,
    refresh(patch = {}) {
      if (Object.hasOwn(patch, 'selectedReferenceId') && patch.selectedReferenceId !== view.selectedReferenceId) { state.selectedId = null; state.page = 1; state.detailOpen = false; }
      view = { ...view, ...patch }; render({ source: true, options: true });
    },
    destroy() { disposed = true; host.removeEventListener('click', click); host.removeEventListener('input', input); host.removeEventListener('change', change); host.removeEventListener('keydown', keydown); },
  };
}
