import { escapeHTML as e, format as f } from './utils.js';
import { icon } from './visuals.js';
import { REVIEW_ROOM_PRIORITIES, REVIEW_ROOM_KINDS, REVIEW_ROOM_STATUSES, normalizeReviewRoomFilters, filterReviewRoom, groupReviewRoom } from './review-room.js';

export const REVIEW_ROOM_PAGE_SIZE = 20;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const serial = value => String(count(value)).padStart(2, '0');
const sourceLabel = value => value === 'draft' ? 'ร่างล่าสุด' : value === 'missing' ? 'ไม่พบต้นทาง' : 'งานที่บันทึกแล้ว';
const stamp = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }) : 'ยังไม่ระบุเวลา';
};
const textValue = value => value === null || value === undefined ? 'ยังไม่มีข้อมูล' : typeof value === 'boolean' ? value ? 'ใช่' : 'ไม่ใช่' : typeof value === 'number' ? Number.isFinite(value) ? f(value, 6) : 'ไม่ประเมิน' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const matrixKinds = [
  { key: 'source', label: 'ต้นทาง / ข้อมูล', kinds: ['missing-source', 'invalid-data', 'data-adjustment'] },
  { key: 'model', label: 'แบบจำลอง', kinds: ['model-fail', 'model-unassessed'] },
  { key: 'review', label: 'ประเด็นตรวจทาน', kinds: ['review-item'] },
  { key: 'document', label: 'การยืนยัน / ร่าง', kinds: ['document-review', 'pending-editor'] },
  { key: 'inspection', label: 'ตรวจหน้างาน', kinds: ['inspection-fail', 'inspection-pending'] },
];
const matrixKindLabels = { 'missing-source': 'ไม่พบต้นทาง', 'invalid-data': 'ข้อมูลต้องแก้', 'data-adjustment': 'ตรวจรูปแบบ', 'model-fail': 'ไม่ผ่าน', 'model-unassessed': 'ไม่ประเมิน', 'review-item': 'ประเด็นค้าง', 'document-review': 'ยังไม่ยืนยัน', 'pending-editor': 'ข้อความร่าง', 'inspection-fail': 'พบข้อบกพร่อง', 'inspection-pending': 'ยังไม่ตรวจ' };

/** UI preferences contain no copied source data and never record a finding as resolved. */
export function normalizeReviewRoomViewState(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const filters = normalizeReviewRoomFilters({ ...(value.filters || {}), groupBy: value.groupBy || value.filters?.groupBy });
  return {
    filters, groupBy: filters.groupBy,
    selectedId: typeof value.selectedId === 'string' && value.selectedId.length <= 1200 && !/[\u0000-\u001f\u007f]/.test(value.selectedId) ? value.selectedId : null,
    page: Number.isSafeInteger(value.page) && value.page > 0 && value.page <= 10000 ? value.page : 1,
    matrixOpen: value.matrixOpen === true,
    detailOpen: value.detailOpen === true,
  };
}

/** Keep a reviewer on the same finding after live data changes; never pick another silently. */
export function reviewRoomSelectionState(model, rawState) {
  const state = normalizeReviewRoomViewState(rawState);
  if (!state.selectedId) return { status: 'none', finding: null };
  const finding = (model.findings || []).find(item => item.id === state.selectedId);
  if (!finding) return { status: 'missing', finding: null };
  const visible = filterReviewRoom(model, state.filters).some(item => item.id === finding.id);
  return { status: visible ? 'visible' : !finding.outstanding && state.filters.status === 'outstanding' ? 'resolved' : 'filtered', finding };
}

/** Paging changes only the screen slice; reporting receives the complete filter scope. */
export function reviewRoomPage(model, rawState) {
  const state = normalizeReviewRoomViewState(rawState), visible = filterReviewRoom(model, state.filters);
  const groups = groupReviewRoom(visible, state.groupBy), ordered = groups.flatMap(group => group.findings);
  const pages = Math.max(1, Math.ceil(ordered.length / REVIEW_ROOM_PAGE_SIZE)), page = Math.min(state.page, pages);
  return { visible, groups, ordered, page, pages, rows: ordered.slice((page - 1) * REVIEW_ROOM_PAGE_SIZE, page * REVIEW_ROOM_PAGE_SIZE) };
}

function zeroCell(document, key) {
  if (document.missing) return ['—', 'ยังอ่านต้นทางไม่ได้'];
  if (key === 'source') return [sourceLabel(document.sourceState), 'ที่มาของข้อมูล'];
  if (key === 'model') {
    if (document.model?.status === 'invalid') return ['ยังประเมินไม่ได้', 'ตรวจข้อมูลต้นทาง'];
    const total = count(document.model?.assessment?.total);
    return total ? [`0 / ${total}`, 'ไม่มีข้อค้างจากเกณฑ์ที่คำนวณ'] : ['—', document.model?.status === 'reference' ? 'เอกสารประกอบ' : 'ไม่มีเกณฑ์ตรวจในมุมมองนี้'];
  }
  if (key === 'review') return document.kind === 'calculator' ? [count(document.register?.total) ? `ปิด ${count(document.register?.closed)}` : 'ยังไม่มีประเด็น', 'ตามทะเบียนที่บันทึก'] : ['—', 'ไม่มีทะเบียนแบบเครื่องคำนวณ'];
  if (key === 'document') return [`${count(document.review?.completed)}/${count(document.review?.total)}`, 'ผู้ใช้ระบุการตรวจ'];
  return document.model?.inspection ? ['0', 'ไม่มีข้อค้างตามรายการที่บันทึก'] : ['—', 'ไม่ใช่รายการตรวจหน้างาน'];
}

export function reviewRoomMatrixMarkup(model) {
  const documents = model.documents || [], findings = model.findings || [];
  if (!documents.length) return '<div class="rr-matrix-empty"><p>ยังไม่มีเอกสารในชุด เลือกงานที่ต้องการทบทวนจากหน้าชุดส่งตรวจก่อน</p><a class="button light compact" href="#handover">เลือกเอกสารในชุด</a></div>';
  return `<div class="rr-matrix-scroll" tabindex="0" role="region" aria-label="ตารางเอกสารและประเด็นที่ต้องตรวจต่อ"><table class="rr-matrix-table"><thead><tr><th scope="col">เอกสารในชุด</th>${matrixKinds.map(column => `<th scope="col">${e(column.label)}</th>`).join('')}</tr></thead><tbody>${documents.map(document => {
    const rows = findings.filter(item => item.documentId === document.id && item.outstanding);
    return `<tr><th scope="row"><button type="button" class="rr-matrix-document" data-rr-document="${e(document.id)}"><span>${serial(document.documentIndex)}</span><span><strong>${e(document.document?.projectCode || document.name)}</strong><small>${e(document.name)}${document.missing ? '' : ` · REV ${e(document.document?.revision || 'P01')}`}</small></span></button></th>${matrixKinds.map(column => {
      const matching = rows.filter(item => column.kinds.includes(item.kind));
      if (matching.length) return `<td><div class="rr-matrix-cell-group">${column.kinds.map(kind => {
        const total = matching.filter(item => item.kind === kind).length;
        return total ? `<button type="button" class="rr-matrix-cell rr-cell-${column.key}" data-rr-matrix="${column.key}" data-rr-kind="${kind}" data-rr-document="${e(document.id)}" aria-label="${e(REVIEW_ROOM_KINDS[kind])} ${total} รายการ ใน ${e(document.name)}"><strong>${total}</strong><span>${e(matrixKindLabels[kind])}</span></button>` : '';
      }).join('')}</div></td>`;
      const [label, detail] = zeroCell(document, column.key);
      return `<td><span class="rr-matrix-zero"><strong>${e(label)}</strong><small>${e(detail)}</small></span></td>`;
    }).join('')}</tr>`;
  }).join('')}</tbody></table></div><p class="rr-matrix-legend">${icon('info')}<span>ตัวเลขคือรายการที่ต้องตรวจต่อในแต่ละด้าน เครื่องหมาย — หมายถึงไม่มีการประเมินด้านนั้น การไม่มีรายการค้างไม่ใช่การอนุมัติเอกสาร</span></p>`;
}

function badgeMarkup(finding) {
  return `<span class="rr-priority rr-priority-${e(finding.priority)}">${e(finding.priorityLabel || REVIEW_ROOM_PRIORITIES[finding.priority] || '')}</span><span class="rr-status rr-status-${e(finding.status)}">${e(finding.statusLabel || REVIEW_ROOM_STATUSES[finding.status] || '')}</span>`;
}

export function reviewRoomFindingDetailMarkup(finding, { selectionStatus = 'visible' } = {}) {
  if (!finding) return `<div class="rr-detail-empty"><span class="rr-empty-symbol">${icon('file')}</span><span class="eyebrow">EVIDENCE / NEXT ACTION</span><h3 id="rr-detail-title" tabindex="-1">${selectionStatus === 'missing' ? 'รายการที่เลือกเปลี่ยนไปแล้ว' : 'เลือกประเด็นเพื่อดูข้อมูลประกอบ'}</h3><p>${selectionStatus === 'missing' ? 'ไม่พบรายการเดิมในข้อมูลล่าสุด อาจแก้ไขแล้ว นำออกจากชุด หรือเปลี่ยนข้อมูลต้นทาง เลือกรายการใหม่เมื่อพร้อม' : 'เปิดจากรายการด้านซ้ายเพื่อดูสิ่งที่พบ ที่มาข้อมูล และงานที่ต้องดำเนินการต่อ'}</p>${selectionStatus === 'missing' ? '<button type="button" class="button light compact" data-rr-action="clear-selection">กลับไปเลือกรายการ</button>' : '<button type="button" class="button light compact" data-rr-action="start">เริ่มจากรายการแรก</button>'}</div>`;
  const context = selectionStatus === 'resolved' ? '<p class="rr-selection-notice" role="status">รายการที่เลือกไม่อยู่ในกลุ่มค้างแล้ว สถานะล่าสุดแสดงอยู่ด้านล่าง เลือกรายการถัดไปเมื่อพร้อม</p>' : selectionStatus === 'filtered' ? '<p class="rr-selection-notice" role="status">รายการนี้อยู่นอกตัวกรองปัจจุบัน ยังคงแสดงรายการที่คุณเลือกไว้เพื่อให้อ่านต่อได้</p>' : '';
  return `<div class="rr-detail-body"><div class="rr-detail-navigation"><button type="button" class="link-button" data-rr-action="back">← กลับไปรายการ</button><span>${e(finding.kindLabel || REVIEW_ROOM_KINDS[finding.kind] || '')}</span></div>${context}<header class="rr-detail-heading"><div class="rr-detail-badges">${badgeMarkup(finding)}</div><h3 id="rr-detail-title" tabindex="-1">${e(finding.title)}</h3><p>${e(finding.documentCode || finding.documentName)} <span>· REV ${e(finding.documentRevision || 'P01')}</span></p></header><div class="rr-detail-source"><span class="rr-source-number">${serial(finding.documentIndex)}</span><div><strong>${e(finding.documentName)}</strong><small>${e(finding.toolTitle)} · ${e(sourceLabel(finding.sourceState))}</small></div><span class="rr-source-tag${finding.sourceState === 'draft' ? ' is-draft' : ''}">${e(sourceLabel(finding.sourceState))}</span></div>${finding.detail ? `<section class="rr-detail-section"><h4>สิ่งที่ต้องตรวจต่อ</h4><p>${e(finding.detail)}</p></section>` : ''}${finding.evidence?.length ? `<section class="rr-detail-section"><h4>ข้อมูลประกอบจากต้นทาง</h4><dl class="rr-evidence">${finding.evidence.map(row => `<div><dt>${e(row.label)}</dt><dd>${e(textValue(row.value))}</dd></div>`).join('')}</dl></section>` : ''}${finding.response ? `<section class="rr-detail-section rr-recorded-response"><span class="eyebrow">RECORDED RESPONSE</span><h4>คำตอบที่บันทึกไว้</h4><p>${e(finding.response)}</p></section>` : ''}<dl class="rr-detail-attribution"><div><dt>ผู้รับผิดชอบที่ระบุ</dt><dd>${e(finding.owner || 'ไม่มีชื่อผู้รับผิดชอบในต้นทาง')}</dd></div><div><dt>ที่มาของรายการ</dt><dd>${e(finding.kindLabel || REVIEW_ROOM_KINDS[finding.kind] || '')}${finding.authoredPriority ? '<small>ระดับความสำคัญของประเด็นมาจากผู้ใช้</small>' : ''}</dd></div></dl>${finding.warnings?.length ? `<ul class="rr-detail-warnings">${finding.warnings.map(warning => `<li>${e(warning)}</li>`).join('')}</ul>` : ''}<footer class="rr-next-action"><span class="eyebrow">NEXT ACTION</span><p>${e(finding.nextAction || 'เปิดต้นทางเพื่อตรวจรายละเอียดและดำเนินการต่อ')}</p><div><button type="button" class="button primary compact" data-rr-action="open">${icon('external')} ${finding.target?.section === 'source' ? 'ตรวจสมาชิกชุดส่งตรวจ' : finding.target?.section === 'review' ? 'เปิดทะเบียนตรวจทาน' : finding.target?.section === 'document' ? 'เปิดข้อมูลเอกสาร' : finding.target?.section === 'revisions' ? 'เปิดประวัติฉบับ' : 'เปิดงานต้นทาง'}</button><button type="button" class="button light compact" data-rr-action="next">รายการถัดไป →</button></div><small>การเปิดดูหรือจัดลำดับรายการไม่ยืนยันสถานะและไม่แก้ข้อมูลต้นทาง</small></footer></div>`;
}

function findingRow(finding, selectedId) {
  return `<button type="button" class="rr-finding ${finding.id === selectedId ? 'is-selected' : ''} rr-finding-${e(finding.priority)}" data-rr-select="${e(finding.id)}" aria-pressed="${finding.id === selectedId}" aria-controls="rr-detail"><span class="rr-row-top"><span class="rr-row-kind">${e(finding.kindLabel || REVIEW_ROOM_KINDS[finding.kind] || '')}</span><span class="rr-row-number">${serial(finding.documentIndex)}</span></span><strong class="rr-row-title">${e(finding.title)}</strong><span class="rr-row-document">${e(finding.documentCode || finding.documentName)} · ${e(finding.toolTitle)}</span><span class="rr-row-status">${badgeMarkup(finding)}</span><span class="rr-row-footer"><span>${e(finding.owner || 'ไม่มีชื่อในต้นทาง')}</span><span>${finding.sourceState === 'draft' ? 'ร่างล่าสุด · ' : ''}ดูข้อมูล ${icon('chevron')}</span></span></button>`;
}

function briefingMarkup(model) {
  const s = model.summary || {}, metadata = model.metadata || {};
  return `<div class="rr-briefing"><div class="rr-package"><span class="eyebrow">CURRENT REVIEW PACKAGE</span><strong>${e(metadata.title || 'ชุดเอกสารส่งตรวจ')}</strong><p>${e(metadata.reference || 'ยังไม่ระบุเลขที่ชุด')}${metadata.recipient ? ` · ${e(metadata.recipient)}` : ''}</p><small>อ่านข้อมูล ${e(stamp(model.generatedAt))} · เวลาไทย</small></div><dl class="rr-brief-counts"><div><dt>เอกสารที่เลือก</dt><dd>${serial(s.documents)}</dd><small>${count(s.missingDocuments) ? `ไม่พบต้นทาง ${count(s.missingDocuments)}` : `${count(s.presentDocuments)} เอกสารที่อ่านได้`}</small></div><div><dt>รายการที่ต้องตรวจต่อ</dt><dd>${serial(s.outstanding)}</dd><small>แยกตามที่มาและขั้นตอนถัดไป</small></div><div><dt>ผลในแบบจำลอง</dt><dd>${serial(s.modelFailures)}<span>ไม่ผ่าน</span></dd><small>ไม่ประเมิน ${count(s.modelUnassessed)}</small></div><div><dt>ทะเบียนตรวจทาน</dt><dd>${serial(s.reviewOutstanding)}<span>ค้าง</span></dd><small>ต้องตรวจซ้ำ ${count(s.needsReview)}</small></div></dl></div>`;
}

const optionsMarkup = (entries, value) => entries.map(([id, label]) => `<option value="${e(id)}"${id === value ? ' selected' : ''}>${e(label)}</option>`).join('');

export function mountReviewRoom(host, {
  model = { documents: [], findings: [], summary: {}, metadata: {} }, initialState,
  onStateChange = () => {}, onOpen = () => {}, onReport = () => {}, onExportCSV = () => {}, onRefresh = () => {}, notice = '',
} = {}) {
  let state = normalizeReviewRoomViewState(initialState), current = model, disposed = false, currentNotice = notice;
  const getState = () => normalizeReviewRoomViewState({ ...state, filters: { ...state.filters } });
  const persist = () => onStateChange(getState());
  const announce = message => { host.querySelector('[data-rr-live]').textContent = message; };
  host.innerHTML = `<div class="review-room"><nav class="rr-breadcrumb" aria-label="เส้นทางชุดส่งตรวจ"><a href="#handover">← ชุดส่งตรวจโครงการ</a><span>/</span><a href="#handover-history">ฉบับอ้างอิงและการเปลี่ยนแปลง</a></nav><header class="rr-heading"><div><span class="eyebrow">PROJECT REVIEW ROOM / 08</span><h1>ห้องทบทวนโครงการ</h1><p>เห็นประเด็นที่ต้องตรวจต่อ พร้อมข้อมูลต้นทางและงานที่ต้องเปิดแก้</p></div><div class="rr-heading-actions"><button type="button" class="button primary compact" data-rr-action="report">${icon('file')} รายงานวาระตรวจทาน</button><button type="button" class="button light compact" data-rr-action="csv">${icon('download')} รายการ CSV</button></div></header><div data-rr-briefing></div><p class="rr-notice" data-rr-notice role="status" hidden></p><details class="rr-matrix"${state.matrixOpen ? ' open' : ''}><summary><span><span class="eyebrow">DOCUMENT / REVIEW MAP</span><strong>ดูประเด็นแยกตามเอกสาร</strong></span><span data-rr-matrix-count></span>${icon('chevron')}</summary><div data-rr-matrix-content></div></details><section class="rr-workroom" aria-label="รายการและข้อมูลประกอบการตรวจทาน"><div class="rr-workroom-heading"><div><span class="eyebrow">REVIEW QUEUE</span><h2>เริ่มจากสิ่งที่ต้องดำเนินการ</h2></div><button type="button" class="button light compact" data-rr-action="refresh">${icon('reset')} อ่านข้อมูลล่าสุด</button></div><div class="rr-search-row"><label class="rr-search">${icon('search')}<span class="sr-only">ค้นหาเอกสาร ประเด็น หรือผู้รับผิดชอบ</span><input type="search" data-rr-search aria-label="ค้นหาเอกสาร ประเด็น หรือผู้รับผิดชอบ" placeholder="ค้นหารหัสเอกสาร ประเด็น หรือผู้รับผิดชอบ…" value="${e(state.filters.search)}" maxlength="240"></label><button type="button" class="link-button" data-rr-action="clear-filters">ล้างตัวกรอง</button></div><div class="rr-filters"><label><span>ที่มารายการ</span><select data-rr-filter="kind" aria-label="ที่มารายการ"></select></label><label><span>ลำดับการตรวจ</span><select data-rr-filter="priority" aria-label="ลำดับการตรวจ"></select></label><label><span>สถานะ</span><select data-rr-filter="status" aria-label="สถานะรายการ"></select></label><label><span>เอกสาร</span><select data-rr-filter="documentId" aria-label="เอกสารในรายการ"></select></label><label><span>หมวดงาน</span><select data-rr-filter="category" aria-label="หมวดงาน"></select></label><label><span>ผู้รับผิดชอบที่ระบุ</span><select data-rr-filter="owner" aria-label="ผู้รับผิดชอบที่ระบุ"></select></label></div><div class="rr-queue-toolbar"><p data-rr-result-count></p><label><span>จัดกลุ่ม</span><select data-rr-group aria-label="จัดกลุ่มรายการ">${optionsMarkup([['priority', 'ลำดับการตรวจ'], ['document', 'เอกสาร'], ['owner', 'ผู้รับผิดชอบ']], state.groupBy)}</select></label></div><p class="rr-scope-note" data-rr-scope-note hidden></p><div class="rr-split"><section class="rr-queue" aria-label="รายการที่พบ"><div data-rr-queue></div><div class="rr-pagination"><button type="button" class="button light compact" data-rr-action="previous-page">← หน้าก่อน</button><span data-rr-page-count></span><button type="button" class="button light compact" data-rr-action="next-page">หน้าถัดไป →</button></div></section><section class="rr-detail" id="rr-detail" aria-label="ข้อมูลประกอบของรายการที่เลือก" data-rr-detail></section></div></section><div class="rr-method-note"><span class="eyebrow">HOW TO READ THIS ROOM</span><p>รายการรวมข้อสังเกตจากข้อมูล แบบจำลอง และบันทึกของผู้ใช้ อาจเกี่ยวข้องกับเรื่องเดียวกัน จึงไม่ใช่จำนวนข้อบกพร่องที่ไม่ซ้ำกัน</p><p>ชื่อผู้รับผิดชอบมาจากข้อความในงาน ไม่มีการแจ้งเตือนหรือมอบหมายงานให้บุคคลนั้นอัตโนมัติ</p></div><div class="sr-only" aria-live="polite" data-rr-live></div></div>`;

  function setOptions(key, entries) {
    const control = host.querySelector(`[data-rr-filter="${key}"]`), value = state.filters[key];
    if (!entries.some(([id]) => id === value)) entries.push([value, 'ค่าที่เลือกไว้ไม่อยู่ในข้อมูลล่าสุด']);
    control.innerHTML = optionsMarkup(entries, value);
  }
  function renderOptions() {
    setOptions('kind', [['all', 'ทุกที่มา'], ...Object.entries(REVIEW_ROOM_KINDS)]);
    setOptions('priority', [['all', 'ทุกลำดับ'], ...Object.entries(REVIEW_ROOM_PRIORITIES)]);
    setOptions('status', [['outstanding', 'รายการที่ต้องตรวจต่อ'], ['all', 'ทุกสถานะ'], ...Object.entries(REVIEW_ROOM_STATUSES)]);
    setOptions('documentId', [['', 'ทุกเอกสาร'], ...(current.documents || []).map(document => [document.id, `${serial(document.documentIndex)} · ${document.document?.projectCode || document.name}`])]);
    setOptions('category', [['all', 'ทุกหมวดงาน'], ...(current.categories || []).map(category => [category.id, category.label])]);
    setOptions('owner', [['', 'ทุกคน / ไม่มีชื่อ'], ...(current.owners || []).map(owner => [owner.id, owner.id === 'unassigned' ? 'ไม่มีชื่อผู้รับผิดชอบในต้นทาง' : owner.label])]);
  }
  function visibleFindings() { return filterReviewRoom(current, state.filters); }
  function orderedFindings() { return groupReviewRoom(visibleFindings(), state.groupBy).flatMap(group => group.findings); }
  function render({ options = false, focusDetail = false, source = false } = {}) {
    if (disposed) return;
    const active = host.ownerDocument?.activeElement;
    const focused = active && host.contains(active) ? { finding: active.closest('[data-rr-select]')?.dataset.rrSelect, action: active.closest('[data-rr-action]')?.dataset.rrAction, heading: active.id === 'rr-detail-title' } : null;
    if (source) {
      host.querySelector('[data-rr-briefing]').innerHTML = briefingMarkup(current);
      host.querySelector('[data-rr-matrix-content]').innerHTML = reviewRoomMatrixMarkup(current);
      host.querySelector('[data-rr-matrix-count]').textContent = `${count(current.summary?.documents)} เอกสาร`;
    }
    const noticeElement = host.querySelector('[data-rr-notice]'); noticeElement.textContent = currentNotice; noticeElement.hidden = !currentNotice;
    if (options) renderOptions();
    const { visible, groups, ordered, pages, page, rows: pageRows } = reviewRoomPage(current, state); state.page = page;
    const pageIds = new Set(pageRows.map(item => item.id));
    const resultText = `แสดง ${visible.length} จาก ${(current.findings || []).length} รายการ · ${state.filters.status === 'outstanding' ? 'เฉพาะรายการที่ต้องตรวจต่อ' : 'ตามสถานะที่เลือก'}`;
    host.querySelector('[data-rr-result-count]').textContent = resultText;
    host.querySelector('[data-rr-queue]').innerHTML = pageRows.length ? groups.filter(group => group.findings.some(item => pageIds.has(item.id))).map(group => `<div class="rr-queue-group"><h3><span>${e(group.label)}</span><small>${group.findings.length} รายการ</small></h3>${group.findings.filter(item => pageIds.has(item.id)).map(item => findingRow(item, state.selectedId)).join('')}</div>`).join('') : `<div class="rr-queue-empty">${icon((current.documents || []).length ? 'search' : 'folder')}<h3>${!(current.documents || []).length ? 'ยังไม่ได้เลือกเอกสาร' : !(current.findings || []).length ? 'ยังไม่มีรายการจากข้อมูลที่อ่านได้' : 'ไม่มีรายการตรงกับตัวกรองนี้'}</h3><p>${!(current.documents || []).length ? 'เริ่มจากจัดชุดเอกสาร แล้วกลับมาทบทวนประเด็นร่วมกัน' : !(current.findings || []).length ? 'ตรวจขอบเขตและความครบถ้วนของเอกสารต่อได้ การไม่มีรายการไม่ใช่ผลอนุมัติ' : 'ปรับที่มา สถานะ เอกสาร หรือคำค้นเพื่อดูรายการอื่น'}</p>${!(current.documents || []).length ? '<a class="button light compact" href="#handover">เลือกเอกสารในชุด</a>' : '<button type="button" class="button light compact" data-rr-action="clear-filters">ล้างตัวกรอง</button>'}</div>`;
    host.querySelector('[data-rr-page-count]').textContent = `หน้า ${state.page} / ${pages}`;
    host.querySelector('[data-rr-action="previous-page"]').disabled = state.page === 1;
    host.querySelector('[data-rr-action="next-page"]').disabled = state.page === pages;
    host.querySelector('.rr-pagination').hidden = !ordered.length;
    const selected = reviewRoomSelectionState(current, state);
    host.querySelector('[data-rr-detail]').innerHTML = reviewRoomFindingDetailMarkup(selected.finding, { selectionStatus: selected.status });
    host.querySelector('.rr-split').classList.toggle('is-detail-open', state.detailOpen);
    const start = host.querySelector('[data-rr-action="start"]'); if (start) start.disabled = !ordered.length;
    const next = host.querySelector('[data-rr-action="next"]'); if (next) next.disabled = !ordered.length || ordered.findIndex(item => item.id === state.selectedId) === ordered.length - 1;
    host.querySelector('[data-rr-action="report"]').disabled = !(current.documents || []).length;
    host.querySelector('[data-rr-action="csv"]').disabled = !(current.documents || []).length;
    const scope = host.querySelector('[data-rr-scope-note]');
    scope.hidden = false;
    scope.textContent = 'รายงานและ CSV รวมทุกรายการที่ตรงกับตัวกรอง ไม่จำกัดเฉพาะหน้าที่เปิดอยู่';
    if (focusDetail) host.querySelector('#rr-detail-title')?.focus({ preventScroll: false });
    else if (focused && !host.contains(host.ownerDocument?.activeElement)) {
      const target = focused.finding ? [...host.querySelectorAll('[data-rr-select]')].find(element => element.dataset.rrSelect === focused.finding) : focused.action ? [...host.querySelectorAll('[data-rr-action]')].find(element => element.dataset.rrAction === focused.action) : focused.heading ? host.querySelector('#rr-detail-title') : null;
      (target || host.querySelector('[data-rr-search]')).focus({ preventScroll: true });
    }
  }
  function choose(id, focus = true) {
    if (!(current.findings || []).some(item => item.id === id)) return;
    state.selectedId = id; state.detailOpen = true;
    const index = orderedFindings().findIndex(item => item.id === id); if (index >= 0) state.page = Math.floor(index / REVIEW_ROOM_PAGE_SIZE) + 1;
    render({ focusDetail: focus }); persist();
  }
  function changeFilters(patch) {
    state.filters = normalizeReviewRoomFilters({ ...state.filters, ...patch, groupBy: state.groupBy }); state.page = 1; state.detailOpen = false;
    render({ options: true }); persist(); announce(host.querySelector('[data-rr-result-count]').textContent);
  }
  const click = event => {
    const selected = event.target.closest('[data-rr-select]'); if (selected) { choose(selected.dataset.rrSelect); return; }
    const matrix = event.target.closest('[data-rr-matrix]');
    if (matrix) {
      state.filters = normalizeReviewRoomFilters({ documentId: matrix.dataset.rrDocument, status: 'outstanding', kind: matrix.dataset.rrKind, groupBy: state.groupBy });
      state.page = 1; state.detailOpen = false;
      host.querySelector('[data-rr-search]').value = ''; render({ options: true }); persist(); host.querySelector('[data-rr-search]').focus(); announce(host.querySelector('[data-rr-result-count]').textContent); return;
    }
    const document = event.target.closest('[data-rr-document]'); if (document) { changeFilters({ documentId: document.dataset.rrDocument, search: '', kind: 'all', priority: 'all', category: 'all', owner: '', status: 'outstanding' }); host.querySelector('[data-rr-search]').value = ''; host.querySelector('[data-rr-search]').focus(); return; }
    const button = event.target.closest('[data-rr-action]'); if (!button || button.disabled) return;
    const action = button.dataset.rrAction;
    if (action === 'clear-filters') { state.filters = normalizeReviewRoomFilters({ groupBy: state.groupBy }); host.querySelector('[data-rr-search]').value = ''; changeFilters({}); host.querySelector('[data-rr-search]').focus(); }
    else if (action === 'refresh') onRefresh();
    else if (action === 'report') onReport({ filters: { ...state.filters }, groupBy: state.groupBy });
    else if (action === 'csv') onExportCSV({ filters: { ...state.filters }, groupBy: state.groupBy });
    else if (action === 'open') { const finding = (current.findings || []).find(item => item.id === state.selectedId); if (finding) onOpen(finding); }
    else if (action === 'start') { const first = orderedFindings()[0]; if (first) choose(first.id); }
    else if (action === 'next') { const ordered = orderedFindings(), index = ordered.findIndex(item => item.id === state.selectedId), next = ordered[index + 1]; if (next) choose(next.id); }
    else if (action === 'back') { state.detailOpen = false; render(); persist(); const selectedButton = [...host.querySelectorAll('[data-rr-select]')].find(item => item.dataset.rrSelect === state.selectedId); (selectedButton || host.querySelector('[data-rr-search]')).focus(); }
    else if (action === 'clear-selection') { state.selectedId = null; state.detailOpen = false; render(); persist(); host.querySelector('[data-rr-search]').focus(); }
    else if (action === 'previous-page' || action === 'next-page') { state.page += action === 'next-page' ? 1 : -1; state.detailOpen = false; render(); persist(); host.querySelector('[data-rr-select]')?.focus(); announce(host.querySelector('[data-rr-page-count]').textContent); }
  };
  const input = event => { if (event.target.matches('[data-rr-search]')) changeFilters({ search: event.target.value }); };
  const change = event => {
    if (event.target.matches('[data-rr-filter]')) changeFilters({ [event.target.dataset.rrFilter]: event.target.value });
    if (event.target.matches('[data-rr-group]')) { state.groupBy = event.target.value; state.filters = normalizeReviewRoomFilters({ ...state.filters, groupBy: state.groupBy }); state.page = 1; render(); persist(); }
  };
  const toggle = event => { if (event.target.matches('.rr-matrix')) { state.matrixOpen = event.target.open; persist(); } };
  const keydown = event => { if (event.key === 'Escape' && event.target.closest('[data-rr-detail]')) { event.preventDefault(); state.detailOpen = false; render(); persist(); host.querySelector('[data-rr-search]').focus(); } };
  host.addEventListener('click', click); host.addEventListener('input', input); host.addEventListener('change', change); host.addEventListener('toggle', toggle, true); host.addEventListener('keydown', keydown);
  render({ options: true, source: true });
  return { getState, refresh(patch = {}) { if (patch.model) current = patch.model; if (Object.hasOwn(patch, 'notice')) currentNotice = patch.notice || ''; render({ options: true, source: true }); }, destroy() { disposed = true; host.removeEventListener('click', click); host.removeEventListener('input', input); host.removeEventListener('change', change); host.removeEventListener('toggle', toggle, true); host.removeEventListener('keydown', keydown); } };
}
