import { escapeHTML as e } from './utils.js';
import { toCSV } from './workflows.js';
import { REVIEW_PRIORITIES } from './review-register.js';
import {
  normalizeReviewRoomFilters, filterReviewRoom, groupReviewRoom,
  REVIEW_ROOM_PRIORITIES, REVIEW_ROOM_KINDS, REVIEW_ROOM_STATUSES,
} from './review-room.js';

const filled = value => typeof value === 'string' && value ? value : 'ยังไม่ระบุ';
const serial = value => String(value).padStart(2, '0');
const sourceLabel = value => value === 'draft' ? 'ร่างแก้ไขล่าสุด' : value === 'saved' ? 'งานที่บันทึกแล้ว' : value === 'missing' ? 'ไม่พบต้นทางที่ใช้ได้' : filled(value);
const purposeLabel = value => value === 'coordination' ? 'เพื่อประสานงาน' : value === 'for-review' ? 'เพื่อการตรวจทาน' : filled(value);
const groupLabels = { priority: 'ลำดับดำเนินการ', owner: 'ผู้รับผิดชอบที่ระบุ', document: 'เอกสารต้นทาง' };
const text = value => value === null || value === undefined ? '' : String(value);

function reportContext(model, rawFilters) {
  if (!model || !Array.isArray(model.documents) || !Array.isArray(model.findings) || !model.metadata) throw new Error('ข้อมูลห้องตรวจทานไม่พร้อมสำหรับสร้างวาระ');
  const generated = new Date(model.generatedAt);
  if (!Number.isFinite(generated.getTime())) throw new Error('เวลาสร้างวาระตรวจทานไม่ถูกต้อง');
  const filters = normalizeReviewRoomFilters(rawFilters);
  const findings = filterReviewRoom(model, filters);
  const visibleIds = new Set(findings.map(finding => finding.documentId));
  const documents = model.documents.filter(document => visibleIds.has(document.id));
  const owner = model.owners?.find(row => row.id === filters.owner);
  const selectedDocument = model.documents.find(document => document.id === filters.documentId);
  const selectedCategory = model.categories?.find(category => category.id === filters.category);
  const filterLabels = [
    ['คำค้น', filters.search || 'ทุกคำ'],
    ['ลำดับดำเนินการ', REVIEW_ROOM_PRIORITIES[filters.priority] || 'ทุกลำดับ'],
    ['ประเภทประเด็น', REVIEW_ROOM_KINDS[filters.kind] || 'ทุกประเภท'],
    ['สถานะ', filters.status === 'all' ? 'ทุกสถานะ รวมรายการที่ปิดแล้ว' : filters.status === 'outstanding' ? 'เฉพาะรายการคงค้าง' : REVIEW_ROOM_STATUSES[filters.status] || filters.status],
    ['หมวดงาน', filters.category === 'all' ? 'ทุกหมวดงาน' : selectedCategory?.label || filters.category],
    ['เอกสาร', filters.documentId ? selectedDocument?.name || filters.documentId : 'ทุกเอกสารในชุด'],
    ['ผู้รับผิดชอบ', filters.owner ? owner?.label || (filters.owner === 'unassigned' ? 'ยังไม่ระบุผู้รับผิดชอบ' : filters.owner.startsWith('owner:') ? filters.owner.slice(6) : filters.owner) : 'ทุกผู้รับผิดชอบ'],
    ['จัดกลุ่มตาม', groupLabels[filters.groupBy] || filters.groupBy],
  ];
  return {
    filters, findings, documents, filterLabels,
    groups: groupReviewRoom(findings, filters.groupBy),
    owners: groupReviewRoom(findings, 'owner'),
    generated: generated.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long', timeStyle: 'short' }),
    visibleOutstanding: findings.filter(finding => finding.outstanding).length,
    present: model.documents.filter(document => !document.missing).length,
    missing: model.documents.filter(document => document.missing).length,
    invalid: model.documents.filter(document => !document.missing && document.model?.status === 'invalid').length,
  };
}

function filterMarkup(rows) {
  return `<dl class="rr-report-scope">${rows.map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>`;
}

function documentMarkup(document, findings) {
  const rows = findings.filter(finding => finding.documentId === document.id);
  return `<tr><td>${e(serial(document.documentIndex))}</td><td><strong>${e(document.name)}</strong><small>${e(document.toolTitle || 'ไม่มีเครื่องมือต้นทาง')}</small></td><td>${e(document.document?.projectCode || 'ยังไม่ระบุรหัส')}<small>${document.missing ? '—' : 'REV ' + e(document.document?.revision || 'ยังไม่ระบุ')}</small></td><td>${e(sourceLabel(document.sourceState))}<small>${e(document.model?.label || 'ไม่มีผลสรุปเฉพาะเครื่องมือ')}</small></td><td>${rows.length} รายการ<small>คงค้าง ${rows.filter(row => row.outstanding).length}</small></td></tr>`;
}

function findingMarkup(finding, number) {
  const evidence = Array.isArray(finding.evidence) ? finding.evidence : [];
  const warnings = Array.isArray(finding.warnings) ? finding.warnings : [];
  return `<article class="rr-report-finding"><header><span class="eyebrow">${e(serial(number))} / ${e(finding.kindLabel)}</span><h4>${e(finding.title)}</h4></header>
    <p class="rr-report-source">ข้อมูลจาก ${e(finding.documentName)} · ${e(finding.documentCode || 'ยังไม่ระบุรหัส')} · ${e(finding.documentRevision ? 'REV ' + finding.documentRevision : 'ยังไม่ระบุฉบับ')}</p>
    <dl class="rr-report-finding-meta"><div><dt>ลำดับดำเนินการ</dt><dd>${e(finding.priorityLabel)}</dd></div><div><dt>สถานะจากข้อมูลปัจจุบัน</dt><dd>${e(finding.statusLabel)}</dd></div><div><dt>ผู้รับผิดชอบที่ระบุ</dt><dd>${e(finding.owner || 'ยังไม่ระบุผู้รับผิดชอบ')}</dd></div><div><dt>ที่มาข้อมูล</dt><dd>${e(sourceLabel(finding.sourceState))}</dd></div>${finding.authoredPriority ? `<div><dt>ความสำคัญที่ผู้ใช้บันทึก</dt><dd>${e(REVIEW_PRIORITIES[finding.authoredPriority] || finding.authoredPriority)}</dd></div>` : ''}</dl>
    ${finding.detail ? `<div class="rr-report-note"><strong>ข้อสังเกตและเหตุผล</strong><p>${e(finding.detail)}</p></div>` : ''}
    ${finding.response ? `<div class="rr-report-note"><strong>คำตอบที่บันทึกในรายการ</strong><p>${e(finding.response)}</p></div>` : ''}
    ${evidence.length ? `<dl class="rr-report-evidence">${evidence.map(row => `<div><dt>${e(row.label)}</dt><dd>${e(text(row.value))}</dd></div>`).join('')}</dl>` : ''}
    ${warnings.length ? `<ul class="rr-report-note">${warnings.map(warning => `<li>${e(warning)}</li>`).join('')}</ul>` : ''}
    <div class="rr-report-action"><strong>ดำเนินการต่อ</strong><p>${e(finding.nextAction || 'เปิดงานต้นทางเพื่อตรวจข้อมูลที่เกี่ยวข้อง')}</p></div>
  </article>`;
}

/** Export every matching finding, independent of the screen's current page. */
export function reviewRoomReportMarkup(model, filters) {
  const context = reportContext(model, filters);
  const metadata = model.metadata;
  let findingNumber = 0;
  const empty = !model.documents.length ? 'ยังไม่มีเอกสารที่เลือกในชุดส่งตรวจ กรุณาจัดชุดก่อนสร้างวาระสำหรับตรวจทาน' : 'ไม่มีรายการตรงกับตัวกรองนี้ ตรวจขอบเขตและตัวกรองที่ระบุด้านบนเพื่อดูรายการอื่น';
  return `<section class="document-cover handover-report-cover review-room-report-cover"><div class="handover-report-brand"><strong>ENG APP</strong><span>ENGINEERING STUDIO / REVIEW ROOM</span></div><span class="eyebrow">PROJECT REVIEW AGENDA</span><h1>${e(metadata.title || 'วาระตรวจทานชุดโครงการ')}</h1><p class="handover-report-subtitle">วาระตรวจทานและรายการดำเนินการจากเอกสารที่เลือก</p><dl class="handover-report-metadata"><div><dt>เลขที่ชุดส่งตรวจ</dt><dd>${e(filled(metadata.reference))}</dd></div><div><dt>ผู้รับที่ระบุ</dt><dd>${e(filled(metadata.recipient))}</dd></div><div><dt>วัตถุประสงค์</dt><dd>${e(purposeLabel(metadata.purpose))}</dd></div><div><dt>สร้างวาระเมื่อ</dt><dd>${e(context.generated)} (ไทย)</dd></div></dl>${metadata.note ? `<div class="handover-report-note"><strong>ข้อความส่งต่อของชุด</strong><p>${e(metadata.note)}</p></div>` : ''}<p class="handover-report-boundary">วาระนี้บันทึกรายการและตัวกรอง ณ เวลาที่สร้าง ชื่อผู้รับและผู้รับผิดชอบเป็นข้อความที่ระบุในข้อมูลต้นทาง สถานะคงค้างและการยืนยันของผู้ใช้แยกจากผลตรวจในแบบจำลอง</p></section>
    <div class="document-report-body review-room-report"><section><h2>ขอบเขตวาระตรวจทาน</h2><p>วาระนี้มี <strong>${context.findings.length} รายการ</strong> จากรายการที่ระบบพบทั้งชุด ${model.findings.length} รายการ · ในวาระยังคงค้าง ${context.visibleOutstanding} รายการ · ครอบคลุม ${context.documents.length} เอกสาร</p><p class="rr-report-note">ส่งออกทุกรายการที่ตรงกับตัวกรองด้านล่าง รวมรายการในหน้าถัดไปของห้องตรวจทาน</p>${filterMarkup(context.filterLabels)}<dl class="rr-report-summary"><div><dt>เอกสารที่เลือกทั้งชุด</dt><dd>${model.documents.length}</dd></div><div><dt>มีต้นทางให้อ่าน</dt><dd>${context.present}</dd></div><div><dt>ไม่พบต้นทางที่ใช้ได้</dt><dd>${context.missing}</dd></div><div><dt>ข้อมูลคำนวณหรือสรุปต้องแก้</dt><dd>${context.invalid}</dd></div></dl><p class="rr-report-note">จำนวนเอกสารข้างต้นเป็นข้อมูลของทั้งชุด ส่วนรายการดำเนินการและกลุ่มผู้รับผิดชอบด้านล่างใช้เฉพาะตัวกรองของวาระนี้</p></section>
    <section><h2>เอกสารที่อยู่ในวาระนี้</h2>${context.documents.length ? `<div class="rr-report-table-wrap table-scroll" tabindex="0" role="region" aria-label="เอกสารในวาระตรวจทาน — เลื่อนแนวนอนเพื่อดูครบทุกคอลัมน์"><table class="rr-report-table"><thead><tr><th>ลำดับในชุด</th><th>เอกสาร / เครื่องมือ</th><th>รหัส / ฉบับ</th><th>ที่มา / ขอบเขตผลสรุป</th><th>รายการในวาระ</th></tr></thead><tbody>${context.documents.map(document => documentMarkup(document, context.findings)).join('')}</tbody></table></div>` : `<p class="rr-report-empty">${e(empty)}</p>`}</section>
    <section><h2>ผู้รับผิดชอบตามข้อมูลที่ระบุ</h2>${context.owners.length ? `<div class="rr-report-table-wrap table-scroll" tabindex="0" role="region" aria-label="รายการตามผู้รับผิดชอบ"><table class="rr-report-table"><thead><tr><th>ชื่อหรือทีมที่บันทึกไว้</th><th>รายการในวาระ</th><th>ยังคงค้าง</th></tr></thead><tbody>${context.owners.map(owner => `<tr><td>${e(owner.label)}</td><td>${owner.total}</td><td>${owner.outstanding}</td></tr>`).join('')}</tbody></table></div><p class="rr-report-note">กลุ่มที่ยังไม่ระบุผู้รับผิดชอบคงแสดงแยกไว้เพื่อให้ทีมตกลงผู้ดำเนินการ การแสดงชื่อนี้ไม่ได้ส่งข้อความหรือมอบหมายผ่านบัญชีผู้ใช้</p>` : '<p class="rr-report-empty">ไม่มีรายการในขอบเขตนี้ให้จัดกลุ่มผู้รับผิดชอบ</p>'}</section>
    <section><h2>รายการดำเนินการในวาระ</h2>${context.groups.length ? context.groups.map(group => `<section class="rr-report-group"><h3>${e(group.label)} · ${group.total} รายการ</h3>${group.findings.map(finding => findingMarkup(finding, ++findingNumber)).join('')}</section>`).join('') : `<p class="rr-report-empty">${e(empty)}</p>`}</section>
    ${(model.notes || []).length ? `<section><h2>ขอบเขตการอ่านข้อมูล</h2><ul class="rr-report-note">${model.notes.map(note => `<li>${e(note)}</li>`).join('')}</ul></section>` : ''}</div><footer class="print-footer">ENG APP / REVIEW ROOM · วาระจากข้อมูลและตัวกรอง ณ เวลาที่สร้าง · ผลตรวจครอบคลุมเฉพาะแบบจำลองของแต่ละเครื่องมือ</footer>`;
}

/** One explicit scope row plus every matching finding; no page-dependent truncation. */
export function reviewRoomCSV(model, filters) {
  const context = reportContext(model, filters);
  const metadata = model.metadata;
  const filterText = context.filterLabels.map(([label, value]) => `${label}: ${value}`).join(' | ');
  const rows = [[
    'ชนิดแถว', 'ชื่อชุดงาน', 'เลขที่ชุดส่งตรวจ', 'ผู้รับที่ระบุ', 'วัตถุประสงค์', 'เวลาสร้าง UTC', 'ตัวกรองวาระ', 'ข้อความส่งต่อของชุด',
    'รายการในวาระ', 'รายการที่พบทั้งชุด', 'เอกสารที่เลือกทั้งชุด', 'เอกสารที่ไม่พบต้นทาง',
    'ลำดับในวาระ', 'รหัสรายการภายใน', 'ลำดับเอกสารในชุด', 'รหัสงานต้นทางภายใน', 'ชื่อเอกสาร', 'รหัสเอกสาร', 'ฉบับเอกสาร',
    'เครื่องมือ', 'หมวดงาน', 'ที่มาข้อมูล', 'ขอบเขตผลสรุปต้นทาง', 'ประเภทประเด็น', 'ลำดับดำเนินการ', 'ความสำคัญที่ผู้ใช้บันทึก',
    'สถานะจากข้อมูลปัจจุบัน', 'ยังคงค้าง', 'ผู้รับผิดชอบที่ระบุ', 'หัวข้อ', 'ข้อสังเกตและเหตุผล', 'คำตอบที่บันทึกในรายการ',
    'ข้อมูลประกอบจากต้นทาง', 'ข้อควรทราบ', 'ดำเนินการต่อ', 'ส่วนงานต้นทาง', 'รหัสรายการย่อยต้นทาง',
  ]];
  const metadataCells = [metadata.title || '', metadata.reference || '', metadata.recipient || '', purposeLabel(metadata.purpose), model.generatedAt, filterText, metadata.note || '', context.findings.length, model.findings.length, model.documents.length, context.missing];
  // A zero-match export still records the actual package, filters and zero scope.
  rows.push(['ขอบเขตวาระ', ...metadataCells, ...Array(rows[0].length - metadataCells.length - 1).fill('')]);
  const ordered = context.groups.flatMap(group => group.findings);
  ordered.forEach((finding, index) => rows.push([
    'รายการดำเนินการ', ...metadataCells,
    index + 1, finding.id, finding.documentIndex, finding.documentId, finding.documentName, finding.documentCode, finding.documentRevision,
    finding.toolTitle, finding.categoryLabel, sourceLabel(finding.sourceState), model.documents.find(document => document.id === finding.documentId)?.model?.label || '', finding.kindLabel, finding.priorityLabel,
    finding.authoredPriority ? REVIEW_PRIORITIES[finding.authoredPriority] || finding.authoredPriority : '',
    finding.statusLabel, finding.outstanding ? 'ใช่' : 'ไม่', finding.owner || '', finding.title, finding.detail, finding.response,
    (finding.evidence || []).map(row => `${text(row.label)}: ${text(row.value)}`).join('\n'),
    (finding.warnings || []).join('\n'), finding.nextAction || '', finding.target?.section || '', finding.target?.itemId || '',
  ]));
  return toCSV(rows);
}
