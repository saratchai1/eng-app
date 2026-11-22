import test from 'node:test';
import assert from 'node:assert/strict';
import { engineeringTools } from '../src/engineering.js';
import { quantityTools } from '../src/quantities.js';
import { createHandoverExample } from '../src/handover-example.js';
import { buildReviewRoom, REVIEW_ROOM_STATUSES } from '../src/review-room.js';
import { normalizeReviewRoomViewState, reviewRoomSelectionState, reviewRoomPage, reviewRoomMatrixMarkup, reviewRoomFindingDetailMarkup, REVIEW_ROOM_PAGE_SIZE } from '../src/review-room-view.js';

const now = '2026-11-22T08:00:00.000Z';
const definitions = { ...engineeringTools, ...quantityTools };
function example() {
  let sequence = 0;
  const source = createHandoverExample({ now, idFactory: () => `room-example-${++sequence}` });
  return { ...source, model: buildReviewRoom(source.records, definitions, source.state, { now }) };
}

test('view preferences preserve only bounded navigation and explicit filters without changing source data', () => {
  const { model } = example(), selectedId = model.findings[0].id;
  const raw = { filters: { search: 'คาน', status: 'closed', documentId: model.documents[0].id, owner: 'owner:ผู้ตรวจ', kind: 'review-item' }, selectedId, groupBy: 'owner', page: 2, matrixOpen: true, detailOpen: true, sourceData: { ignored: true } };
  const before = JSON.stringify(raw), state = normalizeReviewRoomViewState(raw);
  assert.equal(state.selectedId, selectedId);
  assert.equal(state.filters.search, 'คาน');
  assert.equal(state.filters.status, 'closed');
  assert.equal(state.groupBy, 'owner');
  assert.equal(state.filters.groupBy, 'owner');
  assert.equal(state.page, 2);
  assert.equal(state.matrixOpen, true);
  assert.equal(state.detailOpen, true);
  assert.equal('sourceData' in state, false);
  assert.equal(JSON.stringify(raw), before);
  const invalid = normalizeReviewRoomViewState({ page: Infinity, groupBy: 'unsafe', selectedId: 'x\n', matrixOpen: 'yes' });
  assert.equal(invalid.page, 1);
  assert.equal(invalid.groupBy, 'priority');
  assert.equal(invalid.selectedId, null);
  assert.equal(invalid.matrixOpen, false);
  assert.equal(normalizeReviewRoomViewState().filters.status, 'outstanding');
});

test('selection remains on the same resolved, removed or filtered finding and never silently picks another', () => {
  const { model } = example(), finding = model.findings.find(item => item.kind === 'review-item');
  const state = { selectedId: finding.id };
  assert.equal(reviewRoomSelectionState(model, state).status, 'visible');
  const closed = { ...finding, outstanding: false, status: 'closed', statusLabel: REVIEW_ROOM_STATUSES.closed };
  const changed = { ...model, findings: model.findings.map(item => item.id === finding.id ? closed : item) };
  const resolved = reviewRoomSelectionState(changed, state);
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.finding.id, finding.id);
  assert.equal(reviewRoomSelectionState(model, { ...state, filters: { search: 'missing text unmatched' } }).status, 'filtered');
  const removed = reviewRoomSelectionState({ ...model, findings: model.findings.filter(item => item.id !== finding.id) }, state);
  assert.equal(removed.status, 'missing');
  assert.equal(removed.finding, null);
  assert.equal(reviewRoomSelectionState(model, {}).status, 'none');
});

test('screen pages retain every matching record exactly once across a large queue', () => {
  const { model } = example(), first = model.findings[0];
  const large = { ...model, findings: Array.from({ length: 67 }, (_, index) => ({ ...first, id: JSON.stringify(['doc', 'review-item', index]), priority: index % 2 ? 'prepare' : 'fix', documentIndex: index + 1, documentId: 'doc-' + index })) };
  const ids = [];
  for (let page = 1; page <= 4; page++) {
    const result = reviewRoomPage(large, { page, groupBy: 'priority' });
    assert.equal(result.visible.length, 67);
    assert.equal(result.pages, 4);
    assert.ok(result.rows.length <= REVIEW_ROOM_PAGE_SIZE);
    ids.push(...result.rows.map(item => item.id));
  }
  assert.equal(ids.length, 67);
  assert.equal(new Set(ids).size, 67);
  assert.equal(reviewRoomPage(large, { page: 999 }).page, 4);
  assert.equal(reviewRoomPage(large, { filters: { search: 'not in any item' }, page: 4 }).page, 1);
});

test('matrix keeps assessment coverage and recorded declarations distinct from absence of findings', () => {
  const { model } = example();
  const html = reviewRoomMatrixMarkup(model);
  assert.match(html, /ตารางเอกสารและประเด็นที่ต้องตรวจต่อ/);
  assert.match(html, /tabindex="0" role="region"/);
  assert.match(html, /data-rr-kind="review-item"/);
  assert.match(html, /data-rr-kind="document-review"/);
  assert.match(html, /ไม่มีเกณฑ์ตรวจในมุมมองนี้/);
  assert.match(html, /ไม่มีทะเบียนแบบเครื่องคำนวณ/);
  assert.match(html, /ไม่ใช่รายการตรวจหน้างาน/);
  assert.match(html, /การไม่มีรายการค้างไม่ใช่การอนุมัติเอกสาร/);
  assert.doesNotMatch(html, /100%|อนุมัติแล้ว|พร้อมก่อสร้าง/);
});

test('matrix cells keep model-failure and unassessed filters exact and independently actionable', () => {
  const { model } = example(), document = model.documents[0], base = model.findings[0];
  const findings = ['model-fail', 'model-fail', 'model-unassessed'].map((kind, index) => ({ ...base, id: 'item-' + index, documentId: document.id, kind, outstanding: true }));
  const html = reviewRoomMatrixMarkup({ ...model, documents: [document], findings });
  assert.match(html, /data-rr-kind="model-fail"[^>]*><strong>2<\/strong>/);
  assert.match(html, /data-rr-kind="model-unassessed"[^>]*><strong>1<\/strong>/);
  assert.equal((html.match(/data-rr-kind=/g) || []).length, 2);
});

test('matrix does not mark missing and reference-only documents as technically assessed', () => {
  const { records, state } = example();
  const missing = buildReviewRoom(records, definitions, { ...state, selectedIds: ['missing-record'] }, { now });
  const html = reviewRoomMatrixMarkup(missing);
  assert.match(html, /data-rr-kind="missing-source"/);
  assert.match(html, /ยังอ่านต้นทางไม่ได้/);
  assert.doesNotMatch(html, /ไม่มีข้อค้างจากเกณฑ์ที่คำนวณ/);
  const reference = { ...missing.documents[0], id: 'reference', missing: false, kind: 'special', model: { status: 'reference', assessment: null }, sourceState: 'saved', document: {}, review: { completed: 0, total: 3 } };
  assert.match(reviewRoomMatrixMarkup({ documents: [reference], findings: [] }), /เอกสารประกอบ/);
});

test('detail presents recorded owner, response and source evidence without adding status-edit actions', () => {
  const { model } = example(), base = model.findings.find(item => item.kind === 'review-item');
  const finding = { ...base, sourceState: 'draft', status: 'needs-review', statusLabel: REVIEW_ROOM_STATUSES['needs-review'], response: 'คำตอบเดิม\nข้อมูลเปลี่ยนแล้ว', evidence: [{ label: 'ความลึก d (mm)', value: '550 → 600' }], warnings: ['ยังมีข้อความร่าง'] };
  const html = reviewRoomFindingDetailMarkup(finding);
  assert.match(html, /ร่างล่าสุด/);
  assert.match(html, /คำตอบเดิม\nข้อมูลเปลี่ยนแล้ว/);
  assert.match(html, /550 → 600/);
  assert.match(html, /ผู้รับผิดชอบที่ระบุ/);
  assert.match(html, /ระดับความสำคัญของประเด็นมาจากผู้ใช้/);
  assert.match(html, /เปิดทะเบียนตรวจทาน/);
  assert.match(html, /data-rr-action="next"/);
  assert.doesNotMatch(html, /data-rr-action="(?:save|close|approve|resolve)"|<input|<textarea/);
});

test('detail and matrix escape every source text including identity values used by buttons', () => {
  const { model } = example();
  const attack = '<img src=x onerror="alert(1)">';
  const finding = { ...model.findings[0], title: attack, documentName: attack, documentCode: attack, documentRevision: attack, toolTitle: attack, owner: attack, detail: attack, response: attack, evidence: [{ label: attack, value: attack }], warnings: [attack], nextAction: attack };
  const html = reviewRoomFindingDetailMarkup(finding);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img|onerror="alert/);
  const document = { ...model.documents[0], id: 'id" onclick="alert(1)', name: attack, document: { ...model.documents[0].document, projectCode: attack } };
  const matrix = reviewRoomMatrixMarkup({ documents: [document], findings: [{ ...finding, documentId: document.id }] });
  assert.match(matrix, /data-rr-document="id&quot; onclick=&quot;alert\(1\)"/);
  assert.doesNotMatch(matrix, /<img| onclick="/);
});

test('closed and filtered selections retain evidence with an explicit continuation notice', () => {
  const { model } = example(), finding = { ...model.findings[0], status: 'closed', statusLabel: REVIEW_ROOM_STATUSES.closed, outstanding: false };
  const resolved = reviewRoomFindingDetailMarkup(finding, { selectionStatus: 'resolved' });
  assert.match(resolved, /รายการที่เลือกไม่อยู่ในกลุ่มค้างแล้ว/);
  assert.match(resolved, /ผู้ใช้ระบุว่าปิดแล้ว/);
  assert.match(resolved, /role="status"/);
  assert.match(reviewRoomFindingDetailMarkup(finding, { selectionStatus: 'filtered' }), /อยู่นอกตัวกรองปัจจุบัน/);
  const missing = reviewRoomFindingDetailMarkup(null, { selectionStatus: 'missing' });
  assert.match(missing, /รายการที่เลือกเปลี่ยนไปแล้ว/);
  assert.match(missing, /data-rr-action="clear-selection"/);
  assert.doesNotMatch(missing, /data-rr-action="open"/);
});

test('empty package offers a concrete composer path without inferred completion', () => {
  const matrix = reviewRoomMatrixMarkup({ documents: [], findings: [] });
  assert.match(matrix, /ยังไม่มีเอกสารในชุด/);
  assert.match(matrix, /href="#handover"/);
  assert.doesNotMatch(matrix, /ผ่านทั้งหมด|อนุมัติ|100%/);
  const before = JSON.stringify(example().model);
  const model = JSON.parse(before);
  reviewRoomMatrixMarkup(model);
  reviewRoomFindingDetailMarkup(model.findings[0]);
  reviewRoomPage(model, {});
  assert.equal(JSON.stringify(model), before);
});
