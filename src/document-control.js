import { escapeHTML as e } from './utils.js';

export const DOCUMENT_REVIEW_ITEMS = Object.freeze([
  Object.freeze({ id: 'inputs', title: 'ที่มาข้อมูลและหน่วย', description: 'ตรวจแหล่งข้อมูล หน่วย และค่าที่ใช้จริงของโครงการ' }),
  Object.freeze({ id: 'model-scope', title: 'ขอบเขตและสมมติฐาน', description: 'ตรวจว่าแบบจำลอง ครอบคลุมกรณีที่นำไปใช้ และระบุข้อจำกัดไว้แล้ว' }),
  Object.freeze({ id: 'independent', title: 'การตรวจทานโดยวิศวกร', description: 'มีการตรวจทานอย่างเป็นอิสระ และบันทึกประเด็นที่ต้องดำเนินการต่อ' }),
]);

const TEXT_LIMITS = Object.freeze({ projectCode: 64, client: 160, site: 180, preparedBy: 120, checkedBy: 120, revision: 24, designBasis: 2400 });
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '';

/** Calendar validation deliberately rejects overflow such as 2026-02-31. */
export function isDocumentDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Document notes are human-entered metadata, never an engineering approval. */
export function normalizeDocument(value) {
  const source = isObject(value) ? value : {};
  const result = { schemaVersion: 1 };
  for (const [key, max] of Object.entries(TEXT_LIMITS)) result[key] = text(source[key], max);
  result.revision ||= 'P01';
  result.issueDate = isDocumentDate(source.issueDate) ? source.issueDate : '';
  result.purpose = source.purpose === 'for-review' ? 'for-review' : 'draft';
  const candidates = Array.isArray(source.reviewItems) ? source.reviewItems.slice(0, 100) : [];
  result.reviewItems = DOCUMENT_REVIEW_ITEMS.map(item => {
    const entry = candidates.find(candidate => isObject(candidate) && candidate.id === item.id);
    return { id: item.id, checked: entry?.checked === true, note: text(entry?.note, 1200) };
  });
  return result;
}

export function documentReviewState(value) {
  const metadata = normalizeDocument(value);
  const pending = DOCUMENT_REVIEW_ITEMS.filter(item => !metadata.reviewItems.find(row => row.id === item.id).checked).map(item => ({ ...item }));
  return { completed: DOCUMENT_REVIEW_ITEMS.length - pending.length, total: DOCUMENT_REVIEW_ITEMS.length, pending };
}

/** A changed calculation/context requires human review again; notes remain useful. */
export function invalidateDocumentReview(value) {
  const metadata = normalizeDocument(value);
  return { ...metadata, reviewItems: metadata.reviewItems.map(item => ({ ...item, checked: false })) };
}

const purposeLabel = purpose => purpose === 'for-review' ? 'เพื่อการตรวจทาน' : 'ร่างเพื่อพัฒนา';
const filled = value => value || 'ยังไม่ระบุ';
const dateLabel = value => isDocumentDate(value) ? new Date(value + 'T12:00:00Z').toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', year: 'numeric', month: 'short', day: 'numeric' }) : 'ยังไม่ระบุ';

function textField(metadata, key, label, placeholder, full = false) {
  return `<label class="document-field${full ? ' document-field-wide' : ''}" for="doc-${key}"><span>${e(label)}</span><input id="doc-${key}" data-document-field="${key}" value="${e(metadata[key])}" maxlength="${TEXT_LIMITS[key]}" placeholder="${e(placeholder)}" autocomplete="off"></label>`;
}

export function documentEditorMarkup(value) {
  const metadata = normalizeDocument(value);
  const review = documentReviewState(metadata);
  return `<details class="document-editor">
    <summary><span class="document-editor-heading"><span class="document-kicker">DOCUMENT CONTROL</span><strong>ข้อมูลเอกสารและการตรวจทาน</strong></span><span class="document-editor-status">${e(metadata.revision)} <span aria-hidden="true">/</span> ระบุการตรวจแล้ว ${review.completed}/${review.total}<span class="document-chevron" aria-hidden="true">⌄</span></span></summary>
    <div class="document-editor-body">
      <p class="document-intro">ระบุบริบทของงานให้ผู้รับรายงานตรวจต่อได้ ข้อมูลส่วนนี้จะติดไปกับไฟล์งานและหน้าปกรายงาน</p>
      <div class="document-fields">
        ${textField(metadata, 'projectCode', 'รหัสโครงการ / เอกสาร', 'เช่น PRJ-2026-001 / STR-001')}
        ${textField(metadata, 'revision', 'ฉบับแก้ไข', 'เช่น P01')}
        ${textField(metadata, 'client', 'ลูกค้า / เจ้าของโครงการ', 'ระบุชื่อองค์กรหรือเจ้าของโครงการ')}
        ${textField(metadata, 'site', 'สถานที่ / ส่วนงาน', 'ระบุสถานที่หรือส่วนของโครงการ')}
        ${textField(metadata, 'preparedBy', 'ผู้จัดทำ', 'ชื่อผู้จัดทำเอกสาร')}
        ${textField(metadata, 'checkedBy', 'ผู้ตรวจทานที่ระบุ', 'ชื่อผู้รับผิดชอบตรวจทาน')}
        <label class="document-field" for="doc-issueDate"><span>วันที่เอกสาร</span><input id="doc-issueDate" type="date" min="1000-01-01" max="9999-12-31" data-document-field="issueDate" value="${e(metadata.issueDate)}"></label>
        <label class="document-field" for="doc-purpose"><span>วัตถุประสงค์ของฉบับนี้</span><select id="doc-purpose" data-document-field="purpose"><option value="draft"${metadata.purpose === 'draft' ? ' selected' : ''}>ร่างเพื่อพัฒนา</option><option value="for-review"${metadata.purpose === 'for-review' ? ' selected' : ''}>เพื่อการตรวจทาน</option></select></label>
        <label class="document-field document-field-wide" for="doc-designBasis"><span>แหล่งข้อมูล เกณฑ์ที่ใช้ และประเด็นที่ส่งต่อ</span><textarea id="doc-designBasis" data-document-field="designBasis" maxlength="2400" rows="4" placeholder="เช่น เลขที่แบบ / รายงานสำรวจดิน / วันที่ข้อมูล / ข้อสมมติที่ต้องยืนยัน">${e(metadata.designBasis)}</textarea></label>
      </div>
      <section class="document-review-list" aria-labelledby="doc-review-heading"><div class="document-review-heading"><h3 id="doc-review-heading">รายการตรวจทานของผู้จัดทำ</h3><span class="document-kicker">HUMAN REVIEW</span></div><p>ทำเครื่องหมายเมื่อได้ตรวจจริง พร้อมบันทึกหลักฐานหรือสิ่งที่พบ</p>
        ${DOCUMENT_REVIEW_ITEMS.map((item, index) => {
          const entry = metadata.reviewItems[index];
          return `<div class="document-review-item"><label class="document-review-check"><input type="checkbox" data-document-review="${item.id}"${entry.checked ? ' checked' : ''}><span><strong>${e(item.title)}</strong><small>${e(item.description)}</small></span></label><label class="document-review-note" for="doc-review-${item.id}"><span>บันทึก — ${e(item.title)}</span><textarea id="doc-review-${item.id}" data-document-review-note="${item.id}" maxlength="1200" rows="2" placeholder="ระบุสิ่งที่ตรวจ ผู้ตรวจ หรือประเด็นคงค้าง">${e(entry.note)}</textarea></label></div>`;
        }).join('')}
      </section>
      <p class="document-attribution-note">ชื่อผู้ตรวจและเครื่องหมายตรวจเป็นข้อมูลที่ผู้ใช้ระบุ ไม่ใช่ลายเซ็น การอนุมัติ หรือการรับรองโดยระบบ</p>
    </div>
  </details>`;
}

/** The root delegates input/change and persists this independent serializable value. */
export function readDocumentEditor(container) {
  const result = {};
  for (const key of [...Object.keys(TEXT_LIMITS), 'issueDate', 'purpose']) result[key] = container.querySelector(`[data-document-field="${key}"]`)?.value ?? '';
  result.reviewItems = DOCUMENT_REVIEW_ITEMS.map(item => ({
    id: item.id,
    checked: container.querySelector(`[data-document-review="${item.id}"]`)?.checked === true,
    note: container.querySelector(`[data-document-review-note="${item.id}"]`)?.value ?? '',
  }));
  return normalizeDocument(result);
}

export function documentSummaryMarkup(value) {
  const metadata = normalizeDocument(value);
  const review = documentReviewState(metadata);
  return `<div class="document-summary" aria-label="สถานะข้อมูลเอกสาร"><span class="document-code">${e(metadata.projectCode || 'ยังไม่กำหนดรหัส')}</span><span class="document-revision">REV ${e(metadata.revision)}</span><span class="document-purpose ${metadata.purpose}">${purposeLabel(metadata.purpose)}</span><span class="document-review-count">ผู้ใช้ระบุการตรวจ ${review.completed}/${review.total}</span></div>`;
}

/** Automated check counts are separate from the human review record. */
export function normalizeDocumentAssessment(value) {
  if (!isObject(value)) return null;
  const keys = ['pass', 'fail', 'unassessed'];
  if (!keys.every(key => Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= 100000)) return null;
  const result = Object.fromEntries(keys.map(key => [key, value[key]]));
  result.total = result.pass + result.fail + result.unassessed;
  return result.total ? result : null;
}

export function documentCoverMarkup({ metadata: value, projectName = '', toolTitle = '', toolId = '', appVersion = '', generatedAt = new Date().toISOString(), assessment = null } = {}) {
  const metadata = normalizeDocument(value);
  const review = documentReviewState(metadata);
  const checks = normalizeDocumentAssessment(assessment);
  const generated = typeof generatedAt === 'string' && Number.isFinite(Date.parse(generatedAt)) ? new Date(generatedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' (ประเทศไทย)' : 'ยังไม่ระบุ';
  const titleRow = (label, content) => `<div><dt>${e(label)}</dt><dd>${e(filled(content))}</dd></div>`;
  return `<section class="document-cover" aria-label="หน้าปกและข้อมูลควบคุมเอกสาร">
    <div class="document-cover-top"><span class="document-cover-brand">ENG<span>APP</span> <small>ENGINEERING STUDIO</small></span><span class="document-cover-purpose">${purposeLabel(metadata.purpose)}<small>${metadata.purpose === 'for-review' ? 'FOR REVIEW' : 'WORKING DRAFT'}</small></span></div>
    <div class="document-cover-title"><span class="document-kicker">CALCULATION &amp; TECHNICAL NOTE</span><h1>${e(filled(projectName))}</h1><p>${e(toolTitle)}</p></div>
    <div class="document-identification"><div><span>DOCUMENT REFERENCE</span><strong>${e(filled(metadata.projectCode))}</strong></div><div><span>REVISION</span><strong>${e(metadata.revision)}</strong></div><div><span>ISSUE DATE</span><strong>${e(dateLabel(metadata.issueDate))}</strong></div></div>
    <dl class="document-titleblock">${titleRow('ลูกค้า / เจ้าของโครงการ', metadata.client)}${titleRow('สถานที่ / ส่วนงาน', metadata.site)}${titleRow('ผู้จัดทำ', metadata.preparedBy)}${titleRow('ผู้ตรวจทานที่ระบุ', metadata.checkedBy)}</dl>
    <section class="document-basis"><h2>บริบทและเกณฑ์ของงาน</h2><p>${e(metadata.designBasis || 'ยังไม่ระบุแหล่งข้อมูล เกณฑ์ หรือบันทึกส่งต่อของโครงการ')}</p></section>
    ${checks ? `<section class="document-assessment" aria-label="สรุปผลตรวจในแบบจำลอง"><div><h2>ผลตรวจในขอบเขตเครื่องมือ</h2><p>คำนวณจากข้อมูลชุดปัจจุบัน · ${checks.total} รายการ</p></div><dl><div class="document-check-pass"><dt>ผ่าน</dt><dd>${checks.pass}</dd></div><div class="document-check-fail"><dt>ไม่ผ่าน</dt><dd>${checks.fail}</dd></div><div><dt>ไม่ประเมิน</dt><dd>${checks.unassessed}</dd></div></dl></section>` : ''}
    <section class="document-cover-review"><div class="document-review-heading"><h2>บันทึกการตรวจทาน</h2><span>ผู้ใช้ระบุว่าตรวจแล้ว ${review.completed}/${review.total}</span></div><ul>${DOCUMENT_REVIEW_ITEMS.map((item, index) => { const entry = metadata.reviewItems[index]; return `<li><div><strong>${e(item.title)}</strong><span class="${entry.checked ? 'document-reviewed' : 'document-pending'}">${entry.checked ? 'ผู้ใช้ระบุว่าตรวจแล้ว' : 'ยังไม่ระบุว่าตรวจแล้ว'}</span></div>${entry.note ? `<p>${e(entry.note)}</p>` : ''}</li>`; }).join('')}</ul><p class="document-attribution-note">ชื่อผู้ตรวจและบันทึกนี้เป็นข้อมูลที่ผู้ใช้ระบุ ไม่ใช่ลายเซ็นหรือการอนุมัติ ผลตรวจอัตโนมัติครอบคลุมเฉพาะรายการและสมมติฐานที่ระบุในรายงาน</p></section>
    <div class="document-cover-foot"><span>${e(toolId)} · ENG APP ${e(appVersion)}</span><span>สร้างรายงาน ${e(generated)}</span></div>
  </section>`;
}
