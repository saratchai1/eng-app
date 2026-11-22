import test from 'node:test';
import assert from 'node:assert/strict';
import { engineeringTools, defaultInputs } from '../src/engineering.js';
import { normalizeDocument } from '../src/document-control.js';
import { normalizeHandoverState } from '../src/handover.js';
import { captureHandoverReference, compareHandoverReference, handoverReferenceModel } from '../src/handover-history.js';
import { handoverHistoryComparisonReportMarkup, handoverHistorySnapshotReportMarkup } from '../src/handover-history-view.js';

const capturedAt = '2026-11-22T09:00:00.000Z';
const now = '2026-11-22T10:00:00.000Z';
const record = (id = 'beam') => ({
  schemaVersion: 1, id, toolId: 'rc-beam', name: 'คาน B1 ' + id, createdAt: capturedAt, updatedAt: capturedAt,
  data: { ...defaultInputs('rc-beam'), _document: normalizeDocument({ projectCode: 'DEMO / STR-001', revision: 'P01', designBasis: 'ข้อมูลตัวอย่างสำหรับตรวจหน้าตัด' }) },
});
const composer = (selectedIds = ['beam'], metadata = {}) => normalizeHandoverState({ selectedIds, metadata: { title: 'ชุดตัวอย่าง', reference: 'TR-001', note: 'ข้อมูลตัวอย่าง', ...metadata } });
const capture = (records = [record()], state = composer(), options = {}) => captureHandoverReference(records, state, { id: 'ref-one', code: 'PKG-01', note: 'ก่อนปรับข้อมูลหน้าตัด', now: capturedAt, appVersion: '0.6', ...options });
const compare = (entry, records, state = composer(records.map(item => item.id))) => compareHandoverReference(entry, records, engineeringTools, state, { now, appVersion: '0.7' });

test('history comparison report contains source input changes, current-engine metrics and document context', () => {
  const source = record();
  const reference = capture([source]);
  source.data.d = 650;
  source.data._document.revision = 'P02';
  const comparison = compare(reference, [source]);
  const html = handoverHistoryComparisonReportMarkup(comparison);
  assert.match(html, /document-cover hh-report-cover/);
  assert.match(html, /document-report-body hh-report-body/);
  assert.match(html, /PKG-01 → ชุดปัจจุบัน/);
  assert.match(html, /ตัวแปรคำนวณที่เปลี่ยน/);
  assert.match(html, /ความลึกประสิทธิผล d/);
  assert.match(html, /ผลลัพธ์ที่คำนวณด้วยแบบจำลองปัจจุบัน/);
  assert.match(html, /P01/);
  assert.match(html, /P02/);
  assert.match(html, /จุดเปอร์เซ็นต์/);
  assert.match(html, /table-scroll/);
  assert.doesNotMatch(html, /<details|<button|data-hh-open=/);
});

test('snapshot report retains original evidence and distinguishes capture time from current calculation time', () => {
  const source = record();
  const reference = capture([source]);
  const frozen = JSON.stringify(reference);
  source.name = 'ชื่อที่แก้ภายหลัง';
  source.data.d = 850;
  const snapshot = handoverReferenceModel(reference, engineeringTools, { now, appVersion: '0.7' });
  const html = handoverHistorySnapshotReportMarkup(reference, snapshot.model, snapshot);
  assert.match(html, /ฉบับอ้างอิง PKG-01/);
  assert.match(html, /เก็บข้อมูลเมื่อ/);
  assert.match(html, /รุ่นแอปที่ระบุ 0\.6/);
  assert.match(html, /ผลสรุปคำนวณใหม่ด้วยแบบจำลองปัจจุบัน · รุ่น 0\.7/);
  assert.match(html, /คาน B1 beam/);
  assert.doesNotMatch(html, /ชื่อที่แก้ภายหลัง/);
  assert.equal(JSON.stringify(reference), frozen);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
});

test('report distinguishes added, removed and missing selected current records', () => {
  const reference = capture([record('old'), record('missing')], composer(['old', 'missing']));
  const comparison = compare(reference, [record('new')], composer(['new', 'missing']));
  assert.deepEqual(comparison.entries.map(row => row.status), ['added', 'missing', 'removed']);
  const html = handoverHistoryComparisonReportMarkup(comparison);
  assert.match(html, /hh-status-added/);
  assert.match(html, /hh-status-removed/);
  assert.match(html, /hh-status-missing/);
  assert.match(html, /ไม่ได้เลือกเอกสารนี้ในชุดปัจจุบัน/);
  assert.match(html, /ไม่พบเอกสารต้นทางที่เลือกไว้/);
  assert.match(html, /สำเนาหรืองานนำเข้าใหม่มีรหัสใหม่/);
  assert.doesNotMatch(html, /ลบงานต้นทางแล้ว/);
});

test('order and timestamp changes remain visibly separate from technical changes', () => {
  const sources = [record('one'), record('two')];
  const reference = capture(sources, composer(['one', 'two']));
  sources[0].updatedAt = now;
  const comparison = compare(reference, sources, composer(['two', 'one']));
  assert.equal(comparison.summary.changed, 0);
  assert.equal(comparison.summary.unchanged, 2);
  const html = handoverHistoryComparisonReportMarkup(comparison);
  assert.match(html, /ลำดับเอกสารเปลี่ยน 2 รายการ/);
  assert.match(html, /แสดงการจัดลำดับแยกจากการเปลี่ยนข้อมูลและผลคำนวณ/);
  assert.match(html, /วันที่บันทึกงานต้นทาง/);
  assert.match(html, /hh-status-unchanged/);
  assert.doesNotMatch(html, /class="hh-status hh-status-changed"/);
});

test('reference notes, package metadata and document labels are escaped throughout exported reports', () => {
  const source = record();
  source.name = '<img src=x onerror=alert(1)>';
  source.data._document.designBasis = '<script>window.x=1</script>';
  const reference = capture([source], composer(), { code: '<svg onload=x>', note: '<iframe src=x></iframe>' });
  source.data._document.designBasis = '<img src=y onerror=alert(2)>';
  const comparison = compare(reference, [source], composer(['beam'], { title: '<a href=javascript:x>test</a>' }));
  const html = handoverHistoryComparisonReportMarkup(comparison);
  assert.match(html, /&lt;svg onload=x&gt;/);
  assert.match(html, /&lt;iframe src=x&gt;&lt;\/iframe&gt;/);
  assert.match(html, /&lt;script&gt;window.x=1&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=y onerror=alert\(2\)&gt;/);
  assert.doesNotMatch(html, /<script|<iframe|<img|<a\s|<svg onload=/i);
});

test('small nonzero metric differences stay visible when ordinary precision would collapse both values', () => {
  const reference = capture();
  const comparison = compare(reference, [record()]);
  comparison.entries[0].details.metrics = [{ label: 'ดัชนีทดสอบ', unit: '', digits: 2, before: 1, after: 1.000000000001, delta: 1.000088900582341e-12, deltaText: '+1.000e-12', comparable: true }];
  const html = handoverHistoryComparisonReportMarkup(comparison);
  assert.match(html, /1\.000000000001/);
  assert.match(html, /\+1\.000e-12/);
  assert.doesNotMatch(html, /เทียบตัวเลขไม่ได้/);
});

test('invalid current results remain unassessed without a fabricated numeric delta', () => {
  const source = record(), reference = capture([source]);
  source.data.d = null;
  const comparison = compare(reference, [source]);
  const html = handoverHistoryComparisonReportMarkup(comparison);
  assert.equal(comparison.entries[0].after.model.status, 'invalid');
  assert.match(html, /ข้อมูลคำนวณต้องตรวจแก้/);
  assert.match(html, /ไม่ประเมิน/);
  assert.match(html, /เทียบตัวเลขไม่ได้/);
  assert.doesNotMatch(html, /อนุมัติแล้ว|รับรองแล้ว/);
});

test('reports require an explicit valid selection', () => {
  assert.throws(() => handoverHistoryComparisonReportMarkup(null), /เลือกฉบับอ้างอิง/);
  assert.throws(() => handoverHistorySnapshotReportMarkup(null, null), /เลือกฉบับอ้างอิง/);
});
