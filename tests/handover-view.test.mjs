import test from 'node:test';
import assert from 'node:assert/strict';
import { handoverReportMarkup } from '../src/handover-view.js';
import { buildHandover, normalizeHandoverState } from '../src/handover.js';
import { engineeringTools, defaultInputs } from '../src/engineering.js';
import { normalizeDocument } from '../src/document-control.js';
import { captureReviewItem } from '../src/review-register.js';

const now = '2026-11-22T09:00:00.000Z';
const beam = (id = 'beam') => ({
  schemaVersion: 1, id, name: 'คาน B1', toolId: 'rc-beam', createdAt: now, updatedAt: now,
  data: { ...defaultInputs('rc-beam'), _document: normalizeDocument({ projectCode: 'DEMO / STR-01', revision: 'P02', designBasis: 'ตัวอย่างสำหรับตรวจหน้าตัด' }) },
});
const modelFor = (records, ids = records.map(record => record.id), metadata = {}) => buildHandover(records, engineeringTools, normalizeHandoverState({ selectedIds: ids, metadata }), { now });

test('coordination report separates current model findings, source draft and human declarations', () => {
  const record = { ...beam(), fromDraft: true };
  const html = handoverReportMarkup(modelFor([record], ['beam'], { title: 'ชุดตรวจ B1', reference: 'TR-001', recipient: 'ทีมตัวอย่าง' }));
  assert.match(html, /document-cover handover-report-cover/);
  assert.match(html, /document-report-body handover-report-body/);
  assert.match(html, /<h1>ชุดตรวจ B1<\/h1>/);
  assert.match(html, /REV P02/);
  assert.match(html, /มีร่างแก้ไข/);
  assert.match(html, /การยืนยันของผู้ใช้/);
  assert.match(html, /0\/3 ข้อ/);
  assert.match(html, /ผลคำนวณฉบับเต็มและขอบเขตแบบจำลองอยู่ในรายงานของแต่ละเครื่องมือ/);
  assert.doesNotMatch(html, /อนุมัติแล้ว|ได้รับการรับรอง|ส่งถึงผู้รับแล้ว/);
});

test('coordination report includes current contextual needs-review without changing source declarations', () => {
  const record = beam();
  const item = captureReviewItem(engineeringTools['rc-beam'], record.data, {
    id: 'rv-1', sequence: 1, title: 'ตรวจหน้าตัด', priority: 'normal', status: 'closed',
    response: 'เทียบกับแบบตัวอย่างแล้ว', document: record.data._document, now,
  });
  record.data._review = { schemaVersion: 1, toolId: 'rc-beam', nextSequence: 2, items: [item] };
  record.data.d += 50;
  const before = JSON.stringify(record);
  const html = handoverReportMarkup(modelFor([record]));
  assert.match(html, /ประเด็นค้าง 1 รายการ/);
  assert.match(html, /ต้องตรวจซ้ำ 1/);
  assert.equal(JSON.stringify(record), before);
  assert.equal(record.data._review.items[0].status, 'closed');
});

test('missing sources remain numbered and visible in the coordination report', () => {
  const html = handoverReportMarkup(modelFor([beam()], ['gone', 'beam']));
  assert.match(html, /ไม่พบงานที่เลือก/);
  assert.match(html, /ไม่พบต้นทาง/);
  assert.match(html, /ยังประเมินไม่ได้/);
  assert.ok(html.indexOf('<h3>ไม่พบงานที่เลือก</h3>') < html.indexOf('<h3>คาน B1</h3>'));
  assert.match(html, /นำรายการที่หาไม่พบออกก่อนส่งออกชุด JSON/);
});

test('all package and source strings are escaped in report markup without executable or linked resources', () => {
  const record = beam();
  record.name = '<img src=x onerror=alert(1)>';
  record.data._document.designBasis = '</dd><script>window.x=1</script>';
  const model = modelFor([record], ['beam'], {
    title: '<svg onload=alert(2)>', reference: '" onmouseover="alert(3)',
    recipient: '<a href="javascript:alert(4)">ผู้รับ</a>', note: '<iframe src="https://example.org"></iframe>',
  });
  const html = handoverReportMarkup(model);
  assert.match(html, /&lt;svg onload=alert\(2\)&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;window.x=1&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script|<iframe|<img|<a\s|<svg onload=/i);
});

test('invalid calculation data has no invented numeric metric and remains a review task', () => {
  const record = beam();
  record.data.d = '650';
  const model = modelFor([record]);
  assert.equal(model.entries[0].model.status, 'invalid');
  const html = handoverReportMarkup(model);
  assert.match(html, /ข้อมูลต้องแก้ 1 งาน/);
  assert.doesNotMatch(html, /class="handover-record-metrics"/);
  assert.match(html, /ข้อมูลคำนวณต้องตรวจแก้/);
});

test('per-document values remain independent in report output rather than becoming a project total', () => {
  const model = modelFor([beam('a'), beam('b')]);
  model.entries[0].name = 'ต้นทุนทางเลือก A';
  model.entries[0].model.metrics = [{ label: 'รวมเฉพาะงาน A', value: 100, unit: 'บาท', digits: 2 }];
  model.entries[1].name = 'ต้นทุนทางเลือก B';
  model.entries[1].model.metrics = [{ label: 'รวมเฉพาะงาน B', value: 200, unit: 'บาท', digits: 2 }];
  const html = handoverReportMarkup(model);
  assert.match(html, /รวมเฉพาะงาน A/);
  assert.match(html, /รวมเฉพาะงาน B/);
  assert.doesNotMatch(html, /ยอดรวมโครงการ|ต้นทุนรวมโครงการ|300/);
  assert.match(html, /แรง ปริมาณ และราคาไม่ได้เชื่อมถึงกันอัตโนมัติ/);
});
