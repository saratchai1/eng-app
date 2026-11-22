import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewRoomReportMarkup, reviewRoomCSV } from '../src/review-room-report.js';
import { buildReviewRoom, filterReviewRoom } from '../src/review-room.js';
import { createHandoverExample } from '../src/handover-example.js';
import { engineeringTools } from '../src/engineering.js';
import { quantityTools } from '../src/quantities.js';
import { captureReviewItem } from '../src/review-register.js';

const now = '2026-11-22T08:30:00.000Z';
const definitions = { ...engineeringTools, ...quantityTools };
function example() {
  let sequence = 0;
  return createHandoverExample({ idFactory: () => 'agenda-' + ++sequence, now });
}
const room = (sample = example()) => buildReviewRoom(sample.records, definitions, sample.state, { now });

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
  for (const row of rows) assert.equal(row.length, headers.length, 'CSV columns stay rectangular');
  return rows.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}
function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}

test('review agenda identifies its captured package, filter scope and separate whole-package counts', () => {
  const model = room();
  const html = reviewRoomReportMarkup(model);
  assert.match(html, /document-cover handover-report-cover review-room-report-cover/);
  assert.match(html, /document-report-body review-room-report/);
  assert.match(html, /<h1>อาคารสำนักงาน 48 ตร\.ม\. — ชุดประสานงานตัวอย่าง<\/h1>/);
  assert.match(html, /DEMO-OFFICE \/ TR-001/);
  assert.match(html, /ผู้ตรวจประสานงาน \(ตัวอย่าง\)/);
  assert.match(html, /เพื่อประสานงาน/);
  assert.match(html, /เฉพาะรายการคงค้าง/);
  assert.match(html, /เอกสารที่เลือกทั้งชุด<\/dt><dd>6<\/dd>/);
  assert.match(html, /ส่งออกทุกรายการที่ตรงกับตัวกรอง/);
  assert.match(html, /รวมรายการในหน้าถัดไป/);
  assert.match(html, /ข้อมูลจาก STR-001/);
  assert.match(html, /ไม่มีรายการค้างไม่ได้แปลว่าตรวจครบหรืออนุมัติแล้ว/);
  assert.doesNotMatch(html, /คะแนนความพร้อม|พร้อมก่อสร้าง|<button|<input|<script|\sid=/i);
});

test('filtered agenda and owner totals reflect only matching findings while source totals remain package-wide', () => {
  const model = room();
  const filters = { kind: 'review-item', owner: 'owner:ผู้ตรวจฐานราก (ตัวอย่าง)', groupBy: 'owner' };
  const findings = filterReviewRoom(model, filters);
  assert.equal(findings.length, 1);
  const html = reviewRoomReportMarkup(model, filters);
  assert.match(html, /วาระนี้มี <strong>1 รายการ<\/strong>/);
  assert.match(html, /ครอบคลุม 1 เอกสาร/);
  assert.match(html, /เอกสารที่เลือกทั้งชุด<\/dt><dd>6<\/dd>/);
  assert.match(html, /ผู้ตรวจฐานราก \(ตัวอย่าง\)/);
  assert.match(html, /ตรวจแก้ลำดับแรก/);
  assert.doesNotMatch(html, /<h4>ยืนยัน Mu และตรวจแรงเฉือนของคาน B1<\/h4>/);
  const rows = csvRecords(reviewRoomCSV(model, filters));
  assert.equal(rows.filter(row => row['ชนิดแถว'] === 'รายการดำเนินการ').length, 1);
  assert.equal(rows[0]['เอกสารที่เลือกทั้งชุด'], '6');
  assert.equal(rows[0]['รายการในวาระ'], '1');
  assert.match(rows[0]['ตัวกรองวาระ'], /ผู้รับผิดชอบ: ผู้ตรวจฐานราก \(ตัวอย่าง\)/);
});

test('closed authored observations appear only when the status scope explicitly includes them', () => {
  const sample = example(), beam = sample.records[0], original = beam.data._review.items[0];
  const closedTitle = 'CLOSED-ONLY-OBSERVATION';
  beam.data._review.items[0] = captureReviewItem(definitions['rc-beam'], beam.data, {
    ...original, title: closedTitle, status: 'closed', response: 'ตรวจตามข้อมูลชุดนี้แล้ว', now, document: beam.data._document,
  });
  const model = room(sample);
  assert.doesNotMatch(reviewRoomReportMarkup(model, { kind: 'review-item' }), /CLOSED-ONLY-OBSERVATION/);
  assert.match(reviewRoomReportMarkup(model, { kind: 'review-item', status: 'all' }), /CLOSED-ONLY-OBSERVATION/);
  const rows = csvRecords(reviewRoomCSV(model, { kind: 'review-item', status: 'closed' }));
  const findings = rows.filter(row => row['ชนิดแถว'] === 'รายการดำเนินการ');
  assert.equal(findings.length, 1);
  assert.equal(findings[0]['หัวข้อ'], closedTitle);
  assert.equal(findings[0]['ยังคงค้าง'], 'ไม่');
  assert.match(findings[0]['สถานะจากข้อมูลปัจจุบัน'], /ผู้ใช้ระบุว่าปิดแล้ว/);
});

test('agenda preserves actual pending text and distinguishes recorded closure from current needs-review', () => {
  const sample = example(), beam = sample.records[0], original = beam.data._review.items[0];
  const item = captureReviewItem(definitions['rc-beam'], beam.data, {
    ...original, status: 'closed', response: 'คำตอบที่ยืนยันในข้อมูลเดิม', now, document: beam.data._document,
  });
  beam.data._review.items = [item];
  beam.data._review.pending = {
    itemId: item.id,
    values: { title: item.title, detail: item.detail, owner: 'ผู้รับผิดชอบในร่างเท่านั้น', priority: item.priority, status: 'closed', response: 'ร่างคำตอบรอบใหม่ — ยังไม่ยืนยัน' },
  };
  beam.data.d += 50;
  const before = JSON.stringify(sample);
  const model = room(sample);
  const html = reviewRoomReportMarkup(model, { documentId: beam.id });
  assert.match(html, /ต้องตรวจซ้ำ/);
  assert.match(html, /สถานะที่ยืนยันไว้<\/dt><dd>ปิดประเด็นแล้ว/);
  assert.match(html, /550 → 600/);
  assert.match(html, /คำตอบ \(ร่างยังไม่ยืนยัน\)/);
  assert.match(html, /ร่างคำตอบรอบใหม่ — ยังไม่ยืนยัน/);
  assert.match(html, /คำตอบที่ยืนยันในข้อมูลเดิม/);
  const pendingRow = csvRecords(reviewRoomCSV(model)).find(row => row['ประเภทประเด็น'] === 'ข้อความที่ยังรอยืนยัน');
  assert.equal(pendingRow['ผู้รับผิดชอบที่ระบุ'], '');
  assert.match(pendingRow['ข้อมูลประกอบจากต้นทาง'], /ผู้รับผิดชอบ \(ร่างยังไม่ยืนยัน\): ผู้รับผิดชอบในร่างเท่านั้น/);
  assert.equal(JSON.stringify(sample), before);
  assert.equal(beam.data._review.items[0].status, 'closed');
});

test('all matching findings are exported beyond the on-screen page size', () => {
  const model = room(), base = model.findings.find(finding => finding.kind === 'review-item');
  model.findings = Array.from({ length: 47 }, (_, index) => ({ ...base, id: 'many-' + index, title: 'UNIQUE-AGENDA-' + index }));
  const filters = { kind: 'review-item', page: 3, pageSize: 20 };
  const html = reviewRoomReportMarkup(model, filters);
  assert.equal((html.match(/class="rr-report-finding"/g) || []).length, 47);
  assert.match(html, /UNIQUE-AGENDA-46/);
  const rows = csvRecords(reviewRoomCSV(model, filters));
  assert.equal(rows.filter(row => row['ชนิดแถว'] === 'รายการดำเนินการ').length, 47);
  assert.equal(rows.at(-1)['หัวข้อ'], 'UNIQUE-AGENDA-46');
  assert.equal(rows[0]['รายการในวาระ'], '47');
});

test('empty package and a zero-match filter are distinct and CSV retains zero-scope metadata', () => {
  const sample = example(); sample.state.selectedIds = [];
  assert.match(reviewRoomReportMarkup(room(sample)), /ยังไม่มีเอกสารที่เลือกในชุดส่งตรวจ/);
  const model = room();
  const html = reviewRoomReportMarkup(model, { search: 'NOT-PRESENT-IN-ANY-FINDING' });
  assert.match(html, /ไม่มีรายการตรงกับตัวกรองนี้/);
  assert.match(html, /วาระนี้มี <strong>0 รายการ/);
  assert.doesNotMatch(html, /ยังไม่มีเอกสารที่เลือกในชุดส่งตรวจ/);
  const rows = csvRecords(reviewRoomCSV(model, { search: 'NOT-PRESENT-IN-ANY-FINDING' }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['ชนิดแถว'], 'ขอบเขตวาระ');
  assert.equal(rows[0]['รายการในวาระ'], '0');
  assert.equal(rows[0]['เอกสารที่เลือกทั้งชุด'], '6');
  assert.equal(rows[0]['เลขที่ชุดส่งตรวจ'], 'DEMO-OFFICE / TR-001');
  assert.match(rows[0]['ตัวกรองวาระ'], /NOT-PRESENT-IN-ANY-FINDING/);
});

test('missing sources, invalid models and reference-only tools retain their actual scope labels', () => {
  const sample = example();
  sample.records[0].data.d = '600';
  sample.records.push({ ...sample.records[1], id: 'reference-only', toolId: 'drawings', name: 'ภาพร่างประกอบ', data: { _document: sample.records[1].data._document } });
  sample.state.selectedIds.push('missing-source', 'reference-only');
  const model = room(sample), html = reviewRoomReportMarkup(model);
  assert.match(html, /ไม่พบต้นทางที่ใช้ได้/);
  assert.match(html, /ข้อมูลคำนวณต้องตรวจแก้/);
  assert.match(html, /เอกสารประกอบ · เปิดตรวจรายละเอียดในเครื่องมือ/);
  assert.match(html, /ข้อมูลคำนวณหรือสรุปต้องแก้<\/dt><dd>1<\/dd>/);
  assert.doesNotMatch(html, /ต้นทุนรวมโครงการ|กำลังรวมโครงการ/);
  const rows = csvRecords(reviewRoomCSV(model));
  const reference = rows.find(row => row['รหัสงานต้นทางภายใน'] === 'reference-only');
  assert.equal(reference['ขอบเขตผลสรุปต้นทาง'], 'เอกสารประกอบ · เปิดตรวจรายละเอียดในเครื่องมือ');
  assert.equal(rows[0]['เอกสารที่ไม่พบต้นทาง'], '1');
});

test('every user-controlled report string is escaped without links, executable markup or colliding IDs', () => {
  const model = room();
  const attack = '</p><img src=x onerror="alert(1)"><script>bad()</script>';
  model.metadata = { title: attack, reference: attack, recipient: attack, purpose: 'coordination', note: attack };
  const finding = model.findings.find(row => row.kind === 'review-item');
  Object.assign(finding, { documentName: attack, documentCode: attack, documentRevision: attack, toolTitle: attack, categoryLabel: attack, kindLabel: attack, priorityLabel: attack, statusLabel: attack, owner: attack, ownerKey: 'owner:' + attack, title: attack, detail: attack, response: attack, evidence: [{ label: attack, value: attack }], warnings: [attack], nextAction: attack });
  model.documents[0].name = attack;
  model.documents[0].model.label = attack;
  model.notes = [attack];
  const html = reviewRoomReportMarkup(model, { groupBy: 'owner' });
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  const actualTags = (html.match(/<[^>]*>/g) || []).join('\n');
  assert.doesNotMatch(actualTags, /<script|<img|<iframe|<a\b|<link\b|\shref=|\ssrc=|\sid=/i);
});

test('CSV protects formula-leading source text and preserves quotes, multiline evidence and Thai text', () => {
  const model = room();
  model.metadata.title = '=HYPERLINK("https://example.invalid")';
  model.metadata.reference = '+SUM(1,2)';
  model.metadata.recipient = '@recipient';
  const finding = model.findings.find(row => row.kind === 'review-item');
  finding.title = '-1+2';
  finding.response = 'ทดสอบ "คำตอบ"\nบรรทัดที่สอง, พร้อมจุลภาค';
  finding.evidence = [{ label: 'ระดับที่วัด', value: '12.5\n13.0' }];
  finding.documentName = '\t=IMPORTXML("x")';
  const csv = reviewRoomCSV(model, { documentId: finding.documentId, kind: 'review-item' });
  assert.ok(csv.startsWith('\uFEFF'));
  const rows = csvRecords(csv), row = rows.find(item => item['ชนิดแถว'] === 'รายการดำเนินการ');
  assert.equal(row['ชื่อชุดงาน'], '\'=HYPERLINK("https://example.invalid")');
  assert.equal(row['เลขที่ชุดส่งตรวจ'], '\'+SUM(1,2)');
  assert.equal(row['ผู้รับที่ระบุ'], '\'@recipient');
  assert.equal(row['หัวข้อ'], '\'-1+2');
  assert.equal(row['ชื่อเอกสาร'], '\'\t=IMPORTXML("x")');
  assert.equal(row['คำตอบที่บันทึกในรายการ'], finding.response);
  assert.equal(row['ข้อมูลประกอบจากต้นทาง'], 'ระดับที่วัด: 12.5\n13.0');
});

test('report and CSV generation cannot mutate a frozen model or filter preferences', () => {
  const model = deepFreeze(room());
  const filters = deepFreeze({ kind: 'review-item', groupBy: 'document' });
  const before = JSON.stringify({ model, filters });
  const html = reviewRoomReportMarkup(model, filters), csv = reviewRoomCSV(model, filters);
  assert.match(html, /รายการดำเนินการในวาระ/);
  assert.ok(csv.includes('รายการดำเนินการ'));
  assert.equal(JSON.stringify({ model, filters }), before);
});

test('unusable agenda input fails instead of producing an apparently empty successful report', () => {
  assert.throws(() => reviewRoomReportMarkup(null), /ข้อมูลห้องตรวจทานไม่พร้อม/);
  assert.throws(() => reviewRoomCSV({ ...room(), generatedAt: 'not-a-date' }), /เวลาสร้างวาระตรวจทานไม่ถูกต้อง/);
});
