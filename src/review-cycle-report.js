import { escapeHTML as e } from './utils.js';
import { toCSV } from './workflows.js';
import { REVIEW_PRIORITIES } from './review-register.js';
import { REVIEW_ROOM_KINDS } from './review-room.js';
import {
  REVIEW_CYCLE_TRANSITIONS, normalizeReviewCycleFilters, filterReviewCycle, groupReviewCycle,
} from './review-cycle.js';

const text = value => value === undefined || value === null ? '' : String(value);
const filled = value => text(value) || 'ยังไม่ระบุ';
const serial = value => String(value).padStart(2, '0');
const sourceLabel = value => value === 'draft' ? 'ร่างแก้ไขล่าสุดของฝั่งนี้' : value === 'saved' ? 'งานที่บันทึกแล้วของฝั่งนี้' : value === 'missing' ? 'ไม่พบต้นทางที่ใช้ได้' : filled(value);
const purposeLabel = value => value === 'coordination' ? 'เพื่อประสานงาน' : value === 'for-review' ? 'เพื่อการตรวจทาน' : filled(value);
const membershipLabels = Object.freeze({ retained: 'อยู่ในทั้งสองชุด', added: 'เพิ่มเอกสารเข้าชุด', removed: 'เอกสารไม่อยู่ในชุดปัจจุบัน', missing: 'อ่านต้นทางปัจจุบันไม่ได้', 'tool-changed': 'เครื่องมือของเอกสารเปลี่ยน' });
const sectionLabels = Object.freeze({ results: 'ผลคำนวณ / ผลสรุป', review: 'ทะเบียนตรวจทาน', revisions: 'ประวัติฉบับ', document: 'ข้อมูลเอกสาร', source: 'งานต้นทาง' });

function thaiDate(value, message) {
  const date = new Date(value);
  if (typeof value !== 'string' || !Number.isFinite(date.getTime())) throw new Error(message);
  return date.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long', timeStyle: 'short' });
}

function reportContext(model, rawFilters) {
  if (!model || !model.reference || !model.beforeModel?.metadata || !model.currentModel?.metadata || !model.summary || !Array.isArray(model.entries) || !Array.isArray(model.documents)) throw new Error('ข้อมูลเทียบรอบตรวจไม่พร้อมสำหรับสร้างรายงาน');
  const generated = thaiDate(model.generatedAt, 'เวลาสร้างรายงานเทียบรอบตรวจไม่ถูกต้อง');
  const captured = thaiDate(model.reference.capturedAt, 'เวลาเก็บฉบับอ้างอิงไม่ถูกต้อง');
  const filters = normalizeReviewCycleFilters(rawFilters), entries = filterReviewCycle(model, filters);
  const ids = new Set(entries.map(entry => entry.documentId));
  const documents = model.documents.filter(document => ids.has(document.id));
  const selectedDocument = model.documents.find(document => document.id === filters.documentId);
  const owner = model.owners?.find(row => row.id === filters.owner);
  const category = model.categories?.find(row => row.id === filters.category);
  const filterLabels = [
    ['คำค้น', filters.search || 'ทุกคำ'],
    ['การเปลี่ยนแปลง', filters.transition === 'all' ? 'ทุกประเภท รวมรายการไม่เปลี่ยน' : filters.transition === 'changes' ? 'เฉพาะรายการที่เปลี่ยนหรือมีข้อจำกัดในการเทียบ' : REVIEW_CYCLE_TRANSITIONS[filters.transition] || filters.transition],
    ['ประเภทประเด็นในฝั่งใดฝั่งหนึ่ง', REVIEW_ROOM_KINDS[filters.kind] || 'ทุกประเภท'],
    ['เอกสาร', filters.documentId ? selectedDocument?.name || filters.documentId : 'ทุกเอกสารในขอบเขตเปรียบเทียบ'],
    ['หมวดงานในฝั่งใดฝั่งหนึ่ง', filters.category === 'all' ? 'ทุกหมวดงาน' : category?.label || filters.category],
    ['ผู้รับผิดชอบในฝั่งใดฝั่งหนึ่ง', filters.owner ? owner?.label || (filters.owner === 'unassigned' ? 'ไม่มีชื่อผู้รับผิดชอบในฝั่งใดฝั่งหนึ่ง' : filters.owner.startsWith('owner:') ? filters.owner.slice(6) : filters.owner) : 'ทุกผู้รับผิดชอบ'],
    ['จัดกลุ่มตาม', filters.groupBy === 'document' ? 'เอกสารต้นทาง' : 'การเปลี่ยนแปลง'],
  ];
  return {
    filters, entries, documents, filterLabels, generated, captured,
    groups: groupReviewCycle(entries, filters.groupBy),
    scopedCounts: Object.fromEntries(Object.keys(REVIEW_CYCLE_TRANSITIONS).map(key => [key, entries.filter(entry => entry.transition === key).length])),
  };
}

const definitionList = (rows, className) => `<dl class="${className}">${rows.map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(filled(value))}</dd></div>`).join('')}</dl>`;
const evidenceText = finding => (finding?.evidence || []).map(row => `${text(row.label)}: ${text(row.value)}`).join('\n');

function missingSide(entry, side) {
  if (side === 'before') return entry.beforeDocument ? 'ไม่มีรายการนี้ในข้อมูลของฉบับอ้างอิงที่เลือก' : 'เอกสารนี้ไม่ได้อยู่ในฉบับอ้างอิงที่เลือก';
  if (entry.membership === 'removed') return 'เอกสารนี้ไม่ได้อยู่ในชุดปัจจุบัน การนำเอกสารออกไม่ใช่การปิดประเด็น';
  if (entry.membership === 'missing') return 'อ่านต้นทางปัจจุบันไม่ได้ จึงไม่มีหลักฐานให้ยืนยันว่ารายการเดิมได้รับการแก้ไข';
  if (entry.membership === 'tool-changed') return 'เครื่องมือของเอกสารเปลี่ยน จึงไม่ใช้การหายไปของรายการเป็นหลักฐานว่าปิดประเด็นแล้ว';
  if (entry.transition === 'unavailable') return 'ยังไม่มีหลักฐานปัจจุบันที่ใช้เปรียบเทียบรายการนี้ได้';
  if (entry.transition === 'cleared') return 'ไม่พบเงื่อนไขเดิมในข้อมูลปัจจุบันตามขอบเขตที่ระบุ การเปลี่ยนนี้ไม่ใช่การอนุมัติงาน';
  return 'ไม่พบรายการเดิมในข้อมูลปัจจุบัน การไม่ปรากฏของรายการไม่ใช่หลักฐานการยืนยันปิดประเด็น';
}

function sideMarkup(entry, side) {
  const before = side === 'before', finding = entry[side], document = before ? entry.beforeDocument : entry.afterDocument;
  const label = before ? 'ฉบับอ้างอิงที่เลือก' : 'ชุดปัจจุบัน';
  const docCode = finding?.documentCode || document?.document?.projectCode || '';
  const revision = finding?.documentRevision || document?.document?.revision || '';
  const source = finding?.sourceState || document?.sourceState;
  return `<section class="rc-report-side ${before ? 'is-before' : 'is-current'}"><h5>${label}</h5>
    ${definitionList([['เอกสาร', finding?.documentName || document?.name || 'ไม่มีเอกสารในฝั่งนี้'], ['เครื่องมือ', finding?.toolTitle || document?.toolTitle || 'ไม่มีเครื่องมือในฝั่งนี้'], ['รหัส / ฉบับ', [docCode || 'ยังไม่ระบุรหัส', revision ? 'REV ' + revision : 'ยังไม่ระบุฉบับ'].join(' · ')], ['ที่มาข้อมูล', source ? sourceLabel(source) : 'ไม่มีต้นทางในฝั่งนี้'], ['ขอบเขตผลสรุป', document?.model?.label || 'ไม่มีผลสรุปที่ใช้ได้']], 'rc-report-scope')}
    ${finding ? `${definitionList([['ประเภทประเด็น', finding.kindLabel], ['สถานะในข้อมูลฝั่งนี้', finding.statusLabel], ['ผู้รับผิดชอบที่ระบุ', finding.owner || 'ไม่มีชื่อผู้รับผิดชอบในต้นทาง'], ['ลำดับดำเนินการ', finding.priorityLabel], ...(finding.authoredPriority ? [['ความสำคัญที่ผู้ใช้บันทึก', REVIEW_PRIORITIES[finding.authoredPriority] || finding.authoredPriority]] : [])], 'rc-report-scope')}
      <div class="rc-report-note"><strong>${e(finding.title)}</strong>${finding.detail ? `<p>${e(finding.detail)}</p>` : ''}</div>
      <div class="rc-report-note"><strong>คำตอบที่บันทึกไว้</strong><p>${e(finding.response || 'ยังไม่มีคำตอบที่บันทึกในรายการนี้')}</p></div>
      ${(finding.evidence || []).length ? definitionList(finding.evidence.map(row => [row.label, text(row.value)]), 'rc-report-evidence') : ''}
      ${(finding.warnings || []).length ? `<ul class="rc-report-note">${finding.warnings.map(warning => `<li>${e(warning)}</li>`).join('')}</ul>` : ''}` : `<p class="rc-report-empty">${e(missingSide(entry, side))}</p>`}
  </section>`;
}

function changeMarkup(entry) {
  if (!entry.changes?.length) return '';
  return `<div class="rc-report-table-wrap table-scroll" tabindex="0" role="region" aria-label="ข้อมูลประเด็นที่เปลี่ยน — เลื่อนแนวนอนเพื่อดูครบทุกคอลัมน์"><table class="rc-report-table"><thead><tr><th>ข้อมูลที่เปลี่ยน</th><th>ฉบับอ้างอิง</th><th>ปัจจุบัน</th></tr></thead><tbody>${entry.changes.map(change => `<tr><th>${e(change.label)}</th><td>${e(text(change.before) || 'ว่าง')}</td><td>${e(text(change.after) || 'ว่าง')}</td></tr>`).join('')}</tbody></table></div>`;
}

function entryMarkup(entry, index) {
  const action = entry.canOpenCurrent ? `ตรวจต่อในงานปัจจุบัน: ${sectionLabels[entry.target?.section] || 'งานต้นทาง'}${entry.after?.nextAction ? ' · ' + entry.after.nextAction : ''}` : 'ยังเปิดรายการปัจจุบันจากผลเทียบนี้ไม่ได้ ตรวจขอบเขตชุดและสภาพต้นทางตามเหตุผลที่ระบุ';
  return `<article class="rc-report-entry"><header><span class="eyebrow">${e(serial(index))} / ${e(entry.kindLabel)}</span><h4>${e(entry.title)}</h4></header><p class="rc-report-source">${e(entry.documentName)} · ${e(entry.documentCode || 'ยังไม่ระบุรหัส')} · ${e(entry.documentRevision ? 'REV ' + entry.documentRevision : 'ยังไม่ระบุฉบับ')}</p><div class="rc-report-transition"><strong>${e(entry.transitionLabel)}</strong><p>${e(entry.reason)}</p></div><p class="rc-report-note">ขอบเขตเอกสาร: ${e(membershipLabels[entry.membership] || entry.membership)}</p>${changeMarkup(entry)}<div class="rc-report-comparison">${sideMarkup(entry, 'before')}${sideMarkup(entry, 'after')}</div><p class="rc-report-note"><strong>ดำเนินการต่อ</strong><br>${e(action)}</p></article>`;
}

function documentMarkup(document, entries) {
  const rows = entries.filter(entry => entry.documentId === document.id), before = document.before, after = document.after;
  const code = side => side ? `${side.document?.projectCode || 'ยังไม่ระบุรหัส'} · REV ${side.document?.revision || 'ยังไม่ระบุ'}` : 'ไม่มีเอกสารในฝั่งนี้';
  return `<tr><th>${e(document.name)}<small>${e(document.toolTitle)}</small></th><td>${e(membershipLabels[document.membership] || document.membership)}</td><td>${e(code(before))}</td><td>${e(code(after))}</td><td>${rows.length}<small>มีประเด็นคงค้างปัจจุบัน ${rows.filter(row => row.currentOutstanding === true).length}</small></td></tr>`;
}

/** A frozen review-cycle report includes every matching comparison row, not just the current page. */
export function reviewCycleReportMarkup(model, rawFilters) {
  const context = reportContext(model, rawFilters), current = model.currentModel.metadata, previous = model.beforeModel.metadata;
  const empty = 'ไม่มีรายการตรงกับตัวกรองนี้ ตรวจขอบเขตและตัวกรองก่อนสรุปผล การไม่มีรายการเปลี่ยนไม่ได้ยืนยันว่าตรวจครบหรืออนุมัติแล้ว';
  let sequence = 0;
  return `<section class="document-cover handover-report-cover review-cycle-report-cover"><div class="handover-report-brand"><strong>ENG APP</strong><span>ENGINEERING STUDIO / REVIEW CYCLE</span></div><span class="eyebrow">REVIEW ROUND COMPARISON</span><h1>${e(current.title || 'รายงานเทียบรอบตรวจโครงการ')}</h1><p class="handover-report-subtitle">รายงานเทียบรอบตรวจ · ${e(model.reference.code)} → ชุดปัจจุบัน</p>${definitionList([['เลขที่ชุดปัจจุบัน', current.reference], ['ผู้รับที่ระบุ', current.recipient], ['วัตถุประสงค์', purposeLabel(current.purpose)], ['สร้างรายงานเมื่อ', context.generated + ' (ไทย)']], 'handover-report-metadata')}${current.note ? `<div class="handover-report-note"><strong>ข้อความส่งต่อของชุดปัจจุบัน</strong><p>${e(current.note)}</p></div>` : ''}<p class="handover-report-boundary">รายงานเปรียบเทียบข้อมูล ณ เวลาที่สร้าง การปิดที่ผู้ใช้ระบุ การไม่พบเงื่อนไขเดิม และการไม่พบข้อมูลเป็นคนละผลการเปรียบเทียบ ไม่มีการอนุมัติหรือเปลี่ยนสถานะต้นทางโดยรายงานนี้</p></section>
    <div class="document-report-body review-cycle-report"><section><h2>ฉบับอ้างอิงและวิธีอ่านผลเทียบ</h2>${definitionList([['รหัสฉบับอ้างอิง', model.reference.code], ['เก็บฉบับเมื่อ', context.captured + ' (ไทย)'], ['รุ่นแอปที่เก็บฉบับ', model.reference.appVersion], ['รุ่นแอปที่ใช้เปรียบเทียบ', model.currentAppVersion], ['ชื่อชุดในฉบับอ้างอิง', previous.title], ['เลขที่ชุดในฉบับอ้างอิง', previous.reference], ['เหตุผลที่เก็บฉบับ', model.reference.note]], 'rc-report-scope')}<p class="rc-report-note">ผลทั้งสองฝั่งคำนวณใหม่ด้วยแบบจำลองปัจจุบันจากข้อมูลของแต่ละฝั่ง ไม่ใช่การเล่นซ้ำคำตอบจากเครื่องยนต์รุ่นเก่า การจับคู่ใช้รหัสต้นทางภายใน ไม่รวมงานที่มีชื่อหรือรหัสเอกสารเหมือนกันให้เป็นงานเดียว</p></section>
    <section><h2>ขอบเขตและตัวกรองของรายงาน</h2><p>รายงานนี้แสดง <strong>${context.entries.length} รายการ</strong> จากผลเปรียบเทียบทั้งชุด ${model.entries.length} รายการ · ครอบคลุม ${context.documents.length} เอกสาร</p><p class="rc-report-note">ส่งออกทุกรายการที่ตรงกับตัวกรอง รวมหน้าถัดไปของหน้าจอ ผู้รับผิดชอบที่เลือกหมายถึงมีชื่อนั้นในฉบับอ้างอิงหรือปัจจุบัน คำตอบและชื่อทั้งสองฝั่งยังแสดงแยกกัน</p>${definitionList(context.filterLabels, 'rc-report-scope')}${definitionList([['เอกสารในฉบับอ้างอิงทั้งชุด', model.summary.referenceDocuments], ['เอกสารที่เลือกในชุดปัจจุบัน', model.summary.currentDocuments], ['ต้นทางปัจจุบันที่อ่านได้', model.summary.availableDocuments], ['ต้นทางปัจจุบันที่อ่านไม่ได้', model.summary.missingDocuments]], 'rc-report-summary')}<p class="rc-report-note">จำนวนเอกสารข้างต้นเป็นขอบเขตทั้งชุด ตารางผลเทียบด้านล่างแยกจำนวนในรายงานที่กรองแล้วออกจากจำนวนทั้งชุด ไม่มีเปอร์เซ็นต์อนุมัติหรือคะแนนความปลอดภัย</p><div class="rc-report-table-wrap table-scroll" tabindex="0" role="region" aria-label="จำนวนผลเปรียบเทียบตามขอบเขต"><table class="rc-report-table"><thead><tr><th>ประเภทผลเทียบ</th><th>ในรายงานนี้</th><th>ทั้งชุด</th></tr></thead><tbody>${Object.entries(REVIEW_CYCLE_TRANSITIONS).map(([key, label]) => `<tr><th>${e(label)}</th><td>${context.scopedCounts[key]}</td><td>${model.summary.counts?.[key] ?? 0}</td></tr>`).join('')}</tbody></table></div></section>
    <section><h2>เอกสารที่อยู่ในผลเทียบนี้</h2>${context.documents.length ? `<div class="rc-report-table-wrap table-scroll" tabindex="0" role="region" aria-label="เอกสารในผลเทียบ — เลื่อนแนวนอนเพื่อดูครบทุกคอลัมน์"><table class="rc-report-table"><thead><tr><th>เอกสาร / เครื่องมือ</th><th>ขอบเขตชุด</th><th>ฉบับอ้างอิง</th><th>ปัจจุบัน</th><th>รายการในรายงาน</th></tr></thead><tbody>${context.documents.map(document => documentMarkup(document, context.entries)).join('')}</tbody></table></div>` : `<p class="rc-report-empty">${empty}</p>`}</section>
    <section><h2>หลักฐานการเปลี่ยนแปลงรายประเด็น</h2>${context.groups.length ? context.groups.map(group => `<section class="rc-report-group"><h3>${e(group.label)} · ${group.total} รายการ</h3>${group.entries.map(entry => entryMarkup(entry, ++sequence)).join('')}</section>`).join('') : `<p class="rc-report-empty">${empty}</p>`}</section>
    ${(model.notes || []).length ? `<section><h2>ขอบเขตและข้อควรทราบ</h2><ul class="rc-report-note">${model.notes.map(note => `<li>${e(note)}</li>`).join('')}</ul></section>` : ''}</div><footer class="print-footer">ENG APP / REVIEW CYCLE · ข้อมูลและตัวกรอง ณ เวลาที่สร้าง · ผลทั้งสองฝั่งใช้แบบจำลองปัจจุบัน</footer>`;
}

/** One explicit scope row plus every comparison row, including unavailable and previous-only evidence. */
export function reviewCycleCSV(model, rawFilters) {
  const context = reportContext(model, rawFilters), current = model.currentModel.metadata, previous = model.beforeModel.metadata;
  const filterText = context.filterLabels.map(([label, value]) => `${label}: ${value}`).join(' | ');
  const headers = [
    'ชนิดแถว', 'ชื่อชุดปัจจุบัน', 'เลขที่ชุดปัจจุบัน', 'ผู้รับที่ระบุ', 'วัตถุประสงค์', 'ข้อความส่งต่อของชุด', 'เวลาสร้าง UTC',
    'รหัสฉบับอ้างอิงภายใน', 'รหัสฉบับอ้างอิง', 'เวลาเก็บฉบับ UTC', 'รุ่นแอปที่เก็บฉบับ', 'รุ่นแอปที่ใช้เปรียบเทียบ', 'เหตุผลที่เก็บฉบับ', 'ชื่อชุดในฉบับอ้างอิง', 'เลขที่ชุดในฉบับอ้างอิง',
    'ตัวกรองผลเทียบ', 'รายการในรายงาน', 'รายการเปรียบเทียบทั้งชุด', 'เอกสารในฉบับอ้างอิงทั้งชุด', 'เอกสารที่เลือกในชุดปัจจุบัน', 'ต้นทางปัจจุบันที่อ่านไม่ได้',
    'ลำดับในรายงาน', 'รหัสแถวเปรียบเทียบภายใน', 'รหัสงานต้นทางภายใน', 'ชื่อเอกสาร', 'รหัสเอกสาร', 'ฉบับเอกสาร', 'เครื่องมือ', 'หมวดงาน', 'ประเภทประเด็น',
    'ประเภทผลเทียบ', 'เหตุผลของผลเทียบ', 'ขอบเขตเอกสารในชุด', 'หัวข้อ', 'ข้อมูลที่เปลี่ยน',
    'มีรายการในฉบับอ้างอิง', 'รหัสรายการในฉบับอ้างอิง', 'เครื่องมือในฉบับอ้างอิง', 'ประเภทประเด็นในฉบับอ้างอิง', 'หัวข้อในฉบับอ้างอิง', 'ลำดับดำเนินการในฉบับอ้างอิง', 'ความสำคัญที่ผู้ใช้บันทึกในฉบับอ้างอิง', 'สถานะในฉบับอ้างอิง', 'ผู้รับผิดชอบในฉบับอ้างอิง', 'ที่มาข้อมูลในฉบับอ้างอิง', 'รายละเอียดในฉบับอ้างอิง', 'คำตอบในฉบับอ้างอิง', 'หลักฐานในฉบับอ้างอิง', 'ข้อควรทราบในฉบับอ้างอิง',
    'มีรายการปัจจุบัน', 'รหัสรายการปัจจุบัน', 'เครื่องมือปัจจุบัน', 'ประเภทประเด็นปัจจุบัน', 'หัวข้อปัจจุบัน', 'ลำดับดำเนินการปัจจุบัน', 'ความสำคัญที่ผู้ใช้บันทึกปัจจุบัน', 'สถานะปัจจุบัน', 'ผู้รับผิดชอบปัจจุบัน', 'ที่มาข้อมูลปัจจุบัน', 'รายละเอียดปัจจุบัน', 'คำตอบปัจจุบัน', 'หลักฐานปัจจุบัน', 'ข้อควรทราบปัจจุบัน',
    'ประเด็นปัจจุบันยังคงค้าง', 'เปิดงานปัจจุบันได้', 'ส่วนงานต้นทางปัจจุบัน', 'รหัสประเด็นย่อยปัจจุบัน', 'ข้อจำกัดเมื่อไม่มีฝั่งอ้างอิง', 'ข้อจำกัดเมื่อไม่มีฝั่งปัจจุบัน',
  ];
  const metadataCells = [
    current.title || '', current.reference || '', current.recipient || '', purposeLabel(current.purpose), current.note || '', model.generatedAt,
    model.reference.id, model.reference.code, model.reference.capturedAt, model.reference.appVersion, model.currentAppVersion, model.reference.note, previous.title || '', previous.reference || '',
    filterText, context.entries.length, model.entries.length, model.summary.referenceDocuments, model.summary.currentDocuments, model.summary.missingDocuments,
  ];
  const rows = [headers, ['ขอบเขตผลเทียบ', ...metadataCells, ...Array(headers.length - metadataCells.length - 1).fill('')]];
  const sideCells = finding => finding ? ['มี', finding.id, finding.toolTitle, finding.kindLabel, finding.title, finding.priorityLabel, finding.authoredPriority ? REVIEW_PRIORITIES[finding.authoredPriority] || finding.authoredPriority : '', finding.statusLabel, finding.owner || '', sourceLabel(finding.sourceState), finding.detail || '', finding.response || '', evidenceText(finding), (finding.warnings || []).join('\n')] : ['ไม่มี', ...Array(13).fill('')];
  context.groups.flatMap(group => group.entries).forEach((entry, index) => rows.push([
    'รายการเปรียบเทียบ', ...metadataCells,
    index + 1, entry.id, entry.documentId, entry.documentName, entry.documentCode, entry.documentRevision, entry.toolTitle, entry.categoryLabel, entry.kindLabel,
    entry.transitionLabel, entry.reason, membershipLabels[entry.membership] || entry.membership, entry.title, (entry.changes || []).map(change => `${change.label}: ${text(change.before) || 'ว่าง'} → ${text(change.after) || 'ว่าง'}`).join('\n'),
    ...sideCells(entry.before), ...sideCells(entry.after),
    entry.currentOutstanding === null || entry.currentOutstanding === undefined ? 'ไม่มีรายการปัจจุบันให้ประเมิน' : entry.currentOutstanding ? 'ใช่' : 'ไม่',
    entry.canOpenCurrent ? 'ได้' : 'ไม่ได้', entry.target?.section || '', entry.target?.itemId || '', entry.before ? '' : missingSide(entry, 'before'), entry.after ? '' : missingSide(entry, 'after'),
  ]));
  return toCSV(rows);
}
