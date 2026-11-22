import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewCycleReportMarkup, reviewCycleCSV } from '../src/review-cycle-report.js';
import { buildReviewCycle, filterReviewCycle, REVIEW_CYCLE_TRANSITIONS } from '../src/review-cycle.js';
import { captureHandoverReference } from '../src/handover-history.js';
import { createHandoverExample } from '../src/handover-example.js';
import { engineeringTools } from '../src/engineering.js';
import { quantityTools } from '../src/quantities.js';
import { updateReviewItem } from '../src/review-register.js';

const capturedAt = '2026-11-21T08:30:00.000Z', now = '2026-11-22T08:30:00.000Z';
const definitions = { ...engineeringTools, ...quantityTools };
function example() {
  let sequence = 0;
  return createHandoverExample({ idFactory: () => 'cycle-agenda-' + ++sequence, now: capturedAt });
}
function fixture(before = () => {}, after = () => {}) {
  const sample = example(); before(sample);
  const reference = captureHandoverReference(sample.records, sample.state, { id: 'cycle-reference', code: 'CR-01', note: 'ข้อมูลก่อนตอบประเด็น', now: capturedAt, appVersion: '0.7' });
  after(sample);
  return { sample, reference, model: buildReviewCycle(reference, sample.records, definitions, sample.state, { now, appVersion: '0.9' }) };
}
function answer(beam, values) {
  beam.data._review.items[0] = updateReviewItem(definitions['rc-beam'], beam.data._review.items[0], values, beam.data, { now, document: beam.data._document });
}
function parseCSV(value) {
  const result = []; let row = [], cell = '', quoted = false;
  const input = value.replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') { cell += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && char === ',') { row.push(cell); cell = ''; }
    else if (!quoted && (char === '\r' || char === '\n')) {
      if (char === '\r' && input[index + 1] === '\n') index++;
      row.push(cell); result.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (row.length || cell) { row.push(cell); result.push(row); }
  return result;
}
function csvRecords(value) {
  const [headers, ...rows] = parseCSV(value);
  assert.equal(new Set(headers).size, headers.length, 'CSV column names are unique');
  for (const row of rows) assert.equal(row.length, headers.length, 'CSV rows are rectangular');
  return rows.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}
const dataRows = value => csvRecords(value).filter(row => row['ชนิดแถว'] === 'รายการเปรียบเทียบ');
function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}

test('cycle report identifies both package contexts, capture version and current-engine interpretation', () => {
  const { model } = fixture(() => {}, sample => {
    sample.state.metadata.title = 'ชุดปัจจุบันสำหรับตรวจรอบสอง';
    sample.state.metadata.reference = 'TR-ROUND-02';
    answer(sample.records[0], { status: 'addressed', response: 'คำตอบสำหรับตรวจรอบสอง' });
  });
  const html = reviewCycleReportMarkup(model);
  assert.match(html, /document-cover handover-report-cover review-cycle-report-cover/);
  assert.match(html, /document-report-body review-cycle-report/);
  assert.match(html, /<h1>ชุดปัจจุบันสำหรับตรวจรอบสอง<\/h1>/);
  assert.match(html, /CR-01 → ชุดปัจจุบัน/);
  assert.match(html, /TR-ROUND-02/);
  assert.match(html, /DEMO-OFFICE \/ TR-001/);
  assert.match(html, /รุ่นแอปที่เก็บฉบับ<\/dt><dd>0\.7/);
  assert.match(html, /รุ่นแอปที่ใช้เปรียบเทียบ<\/dt><dd>0\.9/);
  assert.match(html, /ผลทั้งสองฝั่งคำนวณใหม่ด้วยแบบจำลองปัจจุบัน/);
  assert.match(html, /ข้อมูลก่อนตอบประเด็น/);
  assert.doesNotMatch(html, /<button|<input|<script|\sid=/i);
});

test('default changes scope excludes unchanged rows and empty scope never implies approval', () => {
  const { model } = fixture();
  assert.equal(filterReviewCycle(model).length, 0);
  const html = reviewCycleReportMarkup(model);
  assert.match(html, /รายงานนี้แสดง <strong>0 รายการ/);
  assert.match(html, /การไม่มีรายการเปลี่ยนไม่ได้ยืนยันว่าตรวจครบหรืออนุมัติแล้ว/);
  assert.doesNotMatch(html, /class="rc-report-entry"/);
  const rows = csvRecords(reviewCycleCSV(model));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['ชนิดแถว'], 'ขอบเขตผลเทียบ');
  assert.equal(rows[0]['รายการในรายงาน'], '0');
  assert.equal(rows[0]['รหัสฉบับอ้างอิง'], 'CR-01');
  assert.equal(rows[0]['เอกสารในฉบับอ้างอิงทั้งชุด'], '6');
  assert.equal(rows[0]['เอกสารที่เลือกในชุดปัจจุบัน'], '6');
  assert.equal(dataRows(reviewCycleCSV(model, { transition: 'all' })).length, model.entries.length);
});

test('explicit closure retains before/after responses and statuses without merging them', () => {
  const { model, sample } = fixture(() => {}, sample => answer(sample.records[0], { status: 'closed', response: 'หลักฐานปิดประเด็นตัวอย่าง' }));
  const filters = { transition: 'closed', documentId: sample.records[0].id };
  const html = reviewCycleReportMarkup(model, filters), rows = dataRows(reviewCycleCSV(model, filters));
  assert.equal(rows.length, 1);
  assert.match(html, /หลักฐานปิดประเด็นตัวอย่าง/);
  assert.match(html, /ฉบับอ้างอิงที่เลือก/);
  assert.match(html, /ชุดปัจจุบัน/);
  assert.match(rows[0]['สถานะในฉบับอ้างอิง'], /ต้องดำเนินการ/);
  assert.match(rows[0]['สถานะปัจจุบัน'], /ปิดแล้ว/);
  assert.equal(rows[0]['คำตอบในฉบับอ้างอิง'], '');
  assert.equal(rows[0]['คำตอบปัจจุบัน'], 'หลักฐานปิดประเด็นตัวอย่าง');
  assert.equal(rows[0]['ประเด็นปัจจุบันยังคงค้าง'], 'ไม่');
});

test('reopened evidence remains distinct from its original recorded closure', () => {
  const { model } = fixture(sample => {
    const beam = sample.records[0];
    beam.data._review.items[0] = updateReviewItem(definitions['rc-beam'], beam.data._review.items[0], { status: 'closed', response: 'ปิดไว้สำหรับข้อมูลเก่า' }, beam.data, { now: capturedAt, document: beam.data._document });
  }, sample => { sample.records[0].data.mu = 350; });
  const rows = dataRows(reviewCycleCSV(model, { transition: 'reopened' }));
  assert.equal(rows.length, 1);
  assert.match(rows[0]['สถานะในฉบับอ้างอิง'], /ปิดแล้ว/);
  assert.equal(rows[0]['สถานะปัจจุบัน'], 'ต้องตรวจซ้ำ');
  assert.equal(rows[0]['คำตอบในฉบับอ้างอิง'], rows[0]['คำตอบปัจจุบัน']);
  assert.match(rows[0]['หลักฐานปัจจุบัน'], /95 → 350/);
  assert.equal(rows[0]['ประเด็นปัจจุบันยังคงค้าง'], 'ใช่');
});

test('owner filter matches either side and reports the previous and current names separately', () => {
  const oldOwner = 'ผู้ตรวจโครงสร้าง (ตัวอย่าง)', newOwner = 'ทีมตรวจรอบสอง';
  const { model } = fixture(() => {}, sample => { sample.records[0].data._review.items[0].owner = newOwner; });
  const oldRows = dataRows(reviewCycleCSV(model, { owner: 'owner:' + oldOwner }));
  const newRows = dataRows(reviewCycleCSV(model, { owner: 'owner:' + newOwner }));
  assert.equal(oldRows.length, 1);
  assert.equal(newRows.length, 1);
  assert.equal(oldRows[0]['รหัสแถวเปรียบเทียบภายใน'], newRows[0]['รหัสแถวเปรียบเทียบภายใน']);
  assert.equal(oldRows[0]['ผู้รับผิดชอบในฉบับอ้างอิง'], oldOwner);
  assert.equal(oldRows[0]['ผู้รับผิดชอบปัจจุบัน'], newOwner);
  assert.match(oldRows[0]['ตัวกรองผลเทียบ'], /ผู้รับผิดชอบในฝั่งใดฝั่งหนึ่ง/);
  assert.match(reviewCycleReportMarkup(model, { owner: 'owner:' + oldOwner }), /มีชื่อนั้นในฉบับอ้างอิงหรือปัจจุบัน/);
});

test('removed membership, unavailable sources and absent authored items never become inferred closure', () => {
  const removed = fixture(() => {}, sample => { sample.state.selectedIds = sample.state.selectedIds.slice(1); }).model;
  const removedRows = dataRows(reviewCycleCSV(removed, { transition: 'removed-source' }));
  assert.ok(removedRows.length > 0);
  assert.ok(removedRows.every(row => row['มีรายการปัจจุบัน'] === 'ไม่มี'));
  assert.ok(removedRows.every(row => row['ข้อจำกัดเมื่อไม่มีฝั่งปัจจุบัน'].includes('ไม่ใช่การปิดประเด็น')));
  const missing = fixture(() => {}, sample => { sample.records = sample.records.slice(1); }).model;
  const missingRows = dataRows(reviewCycleCSV(missing, { transition: 'unavailable' }));
  assert.ok(missingRows.length > 0);
  assert.ok(missingRows.some(row => row['ข้อจำกัดเมื่อไม่มีฝั่งปัจจุบัน'].includes('ไม่มีหลักฐาน')));
  assert.ok(missingRows.every(row => row['ประเภทผลเทียบ'] !== REVIEW_CYCLE_TRANSITIONS.closed));
  const notListed = fixture(() => {}, sample => { sample.records[0].data._review.items = []; }).model;
  const absent = dataRows(reviewCycleCSV(notListed, { transition: 'not-listed' }));
  assert.equal(absent.length, 1);
  assert.match(absent[0]['ข้อจำกัดเมื่อไม่มีฝั่งปัจจุบัน'], /ไม่ใช่หลักฐานการยืนยันปิดประเด็น/);
  assert.equal(absent[0]['ประเด็นปัจจุบันยังคงค้าง'], 'ไม่มีรายการปัจจุบันให้ประเมิน');
});

test('a model condition no longer observed is labeled separately from human closure', () => {
  const { model } = fixture(sample => { sample.records[0].data.mu = 350; }, sample => { sample.records[0].data.mu = 95; });
  const rows = dataRows(reviewCycleCSV(model, { transition: 'cleared' }));
  assert.ok(rows.some(row => row['ประเภทประเด็น'] === 'ข้อไม่ผ่านในแบบจำลอง'));
  const modelRow = rows.find(row => row['ประเภทประเด็น'] === 'ข้อไม่ผ่านในแบบจำลอง');
  assert.equal(modelRow['มีรายการในฉบับอ้างอิง'], 'มี');
  assert.equal(modelRow['มีรายการปัจจุบัน'], 'ไม่มี');
  assert.equal(modelRow['สถานะปัจจุบัน'], '');
  assert.match(modelRow['ข้อจำกัดเมื่อไม่มีฝั่งปัจจุบัน'], /ไม่ใช่การอนุมัติงาน/);
});

test('all matching comparison rows export beyond the screen page size', () => {
  const { model } = fixture(() => {}, sample => answer(sample.records[0], { status: 'addressed', response: 'ตอบแล้ว' }));
  const base = model.entries.find(entry => entry.transition === 'updated');
  assert.ok(base);
  model.entries = Array.from({ length: 47 }, (_, index) => ({ ...base, id: 'export-row-' + index, title: 'EXPORTED-CYCLE-' + index }));
  model.summary.total = 47; model.summary.changes = 47; model.summary.counts.updated = 47;
  const filters = { transition: 'updated', page: 3, pageSize: 20, groupBy: 'document' };
  const html = reviewCycleReportMarkup(model, filters), rows = dataRows(reviewCycleCSV(model, filters));
  assert.equal((html.match(/class="rc-report-entry"/g) || []).length, 47);
  assert.match(html, /EXPORTED-CYCLE-46/);
  assert.equal(rows.length, 47);
  assert.equal(new Set(rows.map(row => row['รหัสแถวเปรียบเทียบภายใน'])).size, 47);
  assert.equal(rows.at(-1)['หัวข้อ'], 'EXPORTED-CYCLE-46');
  assert.equal(rows[0]['รายการในรายงาน'], '47');
});

test('no-match search retains reference, filters and explicit zero counts in CSV', () => {
  const { model } = fixture(() => {}, sample => answer(sample.records[0], { status: 'addressed', response: 'ตอบแล้ว' }));
  const filters = { search: 'UNMATCHED-CYCLE-QUERY', transition: 'all' };
  const html = reviewCycleReportMarkup(model, filters), rows = csvRecords(reviewCycleCSV(model, filters));
  assert.match(html, /รายงานนี้แสดง <strong>0 รายการ/);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['รายการในรายงาน'], '0');
  assert.equal(rows[0]['รหัสฉบับอ้างอิงภายใน'], 'cycle-reference');
  assert.match(rows[0]['ตัวกรองผลเทียบ'], /UNMATCHED-CYCLE-QUERY/);
  assert.equal(rows[0]['รายการเปรียบเทียบทั้งชุด'], String(model.entries.length));
});

test('both sides, transition evidence and package strings are HTML-escaped without executable resources', () => {
  const { model } = fixture(() => {}, sample => answer(sample.records[0], { status: 'addressed', response: 'ตอบแล้ว' }));
  const attack = '</p><img src=x onerror="alert(1)"><script>bad()</script>';
  Object.assign(model.currentModel.metadata, { title: attack, reference: attack, recipient: attack, note: attack });
  Object.assign(model.beforeModel.metadata, { title: attack, reference: attack });
  Object.assign(model.reference, { id: attack, code: attack, note: attack, appVersion: attack });
  model.currentAppVersion = attack; model.notes = [attack];
  const entry = model.entries.find(row => row.transition === 'updated');
  Object.assign(entry, { title: attack, documentName: attack, documentCode: attack, documentRevision: attack, kindLabel: attack, reason: attack, transitionLabel: attack, changes: [{ label: attack, before: attack, after: attack }] });
  for (const side of [entry.before, entry.after]) Object.assign(side, { documentName: attack, documentCode: attack, documentRevision: attack, statusLabel: attack, priorityLabel: attack, authoredPriority: attack, owner: attack, title: attack, detail: attack, response: attack, evidence: [{ label: attack, value: attack }], warnings: [attack], nextAction: attack });
  const html = reviewCycleReportMarkup(model, { transition: 'updated' });
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  const tags = (html.match(/<[^>]*>/g) || []).join('\n');
  assert.doesNotMatch(tags, /<script|<img|<iframe|<a\b|<link\b|\shref=|\ssrc=|\sid=/i);
});

test('CSV escapes formula-leading values and retains multiline evidence on both sides', () => {
  const { model } = fixture(() => {}, sample => answer(sample.records[0], { status: 'addressed', response: 'ตอบแล้ว' }));
  model.currentModel.metadata.title = '=HYPERLINK("https://example.invalid")';
  model.reference.code = '+SUM(1,2)';
  const entry = model.entries.find(row => row.transition === 'updated');
  entry.title = '-1+2'; entry.documentName = '\t=IMPORTXML("x")';
  entry.before.owner = '@old-owner'; entry.after.owner = '=new-owner';
  entry.before.response = 'คำตอบ "เดิม"\nสองบรรทัด, ไทย';
  entry.after.response = 'คำตอบใหม่\nมี, จุลภาค';
  entry.before.evidence = [{ label: 'ค่าเดิม', value: '11\n12' }];
  entry.after.evidence = [{ label: 'ค่าปัจจุบัน', value: '13\n14' }];
  const csv = reviewCycleCSV(model, { transition: 'updated' }), rows = dataRows(csv);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.equal(rows[0]['ชื่อชุดปัจจุบัน'], '\'=HYPERLINK("https://example.invalid")');
  assert.equal(rows[0]['รหัสฉบับอ้างอิง'], '\'+SUM(1,2)');
  assert.equal(rows[0]['หัวข้อ'], '\'-1+2');
  assert.equal(rows[0]['ชื่อเอกสาร'], '\'\t=IMPORTXML("x")');
  assert.equal(rows[0]['ผู้รับผิดชอบในฉบับอ้างอิง'], '\'@old-owner');
  assert.equal(rows[0]['ผู้รับผิดชอบปัจจุบัน'], '\'=new-owner');
  assert.equal(rows[0]['คำตอบในฉบับอ้างอิง'], entry.before.response);
  assert.equal(rows[0]['คำตอบปัจจุบัน'], entry.after.response);
  assert.equal(rows[0]['หลักฐานในฉบับอ้างอิง'], 'ค่าเดิม: 11\n12');
  assert.equal(rows[0]['หลักฐานปัจจุบัน'], 'ค่าปัจจุบัน: 13\n14');
});

test('exports do not mutate frozen source evidence, comparison models or filter state', () => {
  const { model, sample, reference } = fixture(() => {}, sample => answer(sample.records[0], { status: 'addressed', response: 'ตอบแล้ว' }));
  const state = deepFreeze({ model, sample, reference, filters: { transition: 'all', groupBy: 'document' } });
  const before = JSON.stringify(state);
  assert.match(reviewCycleReportMarkup(state.model, state.filters), /หลักฐานการเปลี่ยนแปลงรายประเด็น/);
  assert.ok(reviewCycleCSV(state.model, state.filters).includes('รายการเปรียบเทียบ'));
  assert.equal(JSON.stringify(state), before);
});

test('unusable models and bad capture/generation times reject instead of producing a successful empty report', () => {
  const { model } = fixture();
  assert.throws(() => reviewCycleReportMarkup(null), /ข้อมูลเทียบรอบตรวจไม่พร้อม/);
  assert.throws(() => reviewCycleCSV({ ...model, generatedAt: 'not-a-date' }), /เวลาสร้างรายงาน/);
  assert.throws(() => reviewCycleReportMarkup({ ...model, reference: { ...model.reference, capturedAt: 'bad-date' } }), /เวลาเก็บฉบับ/);
});
