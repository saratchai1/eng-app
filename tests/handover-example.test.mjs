import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandoverExample } from '../src/handover-example.js';
import { engineeringTools } from '../src/engineering.js';
import { buildingQuantity, quantityTools } from '../src/quantities.js';
import { calculateBoq, analyzeSchedule, normalizeBoqState, normalizePlanningState } from '../src/workflows.js';
import { reviewInputs, restoreReviewRegister } from '../src/review-register.js';
import { documentReviewState } from '../src/document-control.js';

const now = '2026-11-22T08:00:00.000Z';
const makeExample = () => {
  let id = 0;
  return createHandoverExample({ now, idFactory: () => `example-${++id}` });
};
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('handover example creates six explicit documents and selected references with no storage dependency', () => {
  const { records, state } = makeExample();
  assert.equal(records.length, 6);
  assert.equal(new Set(records.map(record => record.id)).size, 6);
  assert.deepEqual(records.map(record => record.toolId), ['rc-beam', 'rc-slab', 'footing', 'quantity-building', 'boq-building', 'planning']);
  assert.deepEqual(state.selectedIds, records.map(record => record.id));
  assert.equal(state.metadata.purpose, 'coordination');
  assert.equal(new Set(records.map(record => record.data._document.projectCode)).size, 6);
  for (const record of records) {
    assert.equal(record.schemaVersion, 1);
    assert.match(record.name, /ตัวอย่าง/);
    assert.equal(record.createdAt, now);
    assert.equal(record.updatedAt, now);
    assert.equal(record.data._document.revision, 'P01');
    assert.match(record.data._document.designBasis, /ไม่มีการวิเคราะห์แรงร่วม/);
  }
});

test('example calculator inputs validate through the actual tool definitions and produce finite metrics', () => {
  const definitions = { ...engineeringTools, ...quantityTools };
  for (const record of makeExample().records.filter(record => definitions[record.toolId])) {
    const definition = definitions[record.toolId];
    const inputs = reviewInputs(definition, record.data);
    const result = definition.calculate(inputs);
    assert.ok(result.summary.length > 0);
    for (const metric of result.summary) assert.ok(Number.isFinite(metric.value), `${record.toolId}: ${metric.label}`);
  }
});

test('example BOQ is a disclosed one-time snapshot of only six B1 beams', () => {
  const { records } = makeExample();
  const quantity = records.find(record => record.toolId === 'quantity-building');
  const boq = records.find(record => record.toolId === 'boq-building');
  const calculated = buildingQuantity(quantity.data);
  near(calculated.volume, 4.32);
  near(calculated.order, 4.4496);
  near(calculated.formwork, 36);
  near(calculated.steel, 518.4);
  assert.equal(boq.data.rows[0].quantity, calculated.volume);
  assert.equal(boq.data.rows[1].quantity, calculated.formwork);
  assert.equal(boq.data.rows[2].quantity, calculated.steel);
  assert.deepEqual(boq.data.rows.map(row => row.unit), ['ลบ.ม.', 'ตร.ม.', 'กก.']);
  const result = calculateBoq(boq.data);
  near(result.direct, 47376);
  near(result.total, 55761.552);
  assert.match(boq.data.notes, /ไม่ใช่งบทั้งอาคาร/);
  assert.match(boq.data.notes, /ไม่ปรับตาม QTY-001 อัตโนมัติ/);
  assert.match(boq.data.notes, /ค่าตัวอย่าง/);
  assert.deepEqual(normalizeBoqState(boq.data).rows, boq.data.rows);
  quantity.data.count = 7;
  near(boq.data.rows[0].quantity, 4.32);
});

test('example plan has a valid 30-day sequence, explicit assessment date and duration-based progress', () => {
  const data = makeExample().records.find(record => record.toolId === 'planning').data;
  const result = analyzeSchedule(data);
  assert.equal(result.duration, 30);
  assert.equal(result.startDate, '2026-12-01');
  assert.equal(result.endDate, '2026-12-30');
  assert.equal(result.statusDate, '2026-12-08');
  assert.equal(result.weightMode, 'duration');
  assert.equal(result.totalBudget, 0);
  assert.deepEqual(result.criticalPaths, [['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']]);
  assert.equal(result.criticalTaskIds.length, 7);
  assert.deepEqual(normalizePlanningState(data).tasks, data.tasks);
  assert.match(data.notes, /ความก้าวหน้าเป็นค่าจำลอง/);
  assert.match(data.notes, /กำลังจริง/);
});

test('example does not claim human review and all captured observations remain open', () => {
  const definitions = { ...engineeringTools, ...quantityTools };
  let observations = 0;
  for (const record of makeExample().records) {
    const metadata = record.data._document;
    assert.equal(documentReviewState(metadata).completed, 0);
    assert.equal(metadata.checkedBy, '');
    assert.equal(metadata.purpose, 'draft');
    if (!record.data._review) continue;
    const restored = restoreReviewRegister(definitions[record.toolId], record.data._review);
    assert.equal(restored.adjusted, false);
    assert.equal(restored.rejected, 0);
    assert.equal(restored.state.items.length, 1);
    observations++;
    const item = restored.state.items[0];
    assert.equal(item.status, 'open');
    assert.equal(item.response, '');
    assert.equal(item.reviewedAt, null);
    assert.equal(item.reviewedInputs, null);
    assert.equal(item.originContext.projectCode, metadata.projectCode);
  }
  assert.equal(observations, 4);
});

test('each example call has independent nested data and fresh identities', () => {
  let serial = 0;
  const idFactory = () => `fresh-${++serial}`;
  const first = createHandoverExample({ idFactory, now });
  const second = createHandoverExample({ idFactory, now });
  assert.equal(new Set([...first.records, ...second.records].map(record => record.id)).size, 12);
  first.records[0].data._review.items[0].originInputs.b = 999;
  first.records[3].data.count = 99;
  first.records[4].data.rows[0].quantity = 999;
  first.records[5].data.tasks[0].name = 'changed';
  first.state.selectedIds.pop();
  assert.equal(second.records[0].data._review.items[0].originInputs.b, 300);
  assert.equal(second.records[3].data.count, 6);
  near(second.records[4].data.rows[0].quantity, 4.32);
  assert.equal(second.records[5].data.tasks[0].name, 'ตรวจแบบและวิธีการทำงาน');
  assert.equal(second.state.selectedIds.length, 6);
});

test('example timestamps use Bangkok document dates and invalid IDs/dates fail before return', () => {
  let serial = 0;
  const lateUTC = createHandoverExample({ idFactory: () => `late-${++serial}`, now: '2026-11-22T20:00:00.000Z' });
  assert.ok(lateUTC.records.every(record => record.data._document.issueDate === '2026-11-23'));
  assert.throws(() => createHandoverExample({ now: '2026-02-30T00:00:00.000Z' }), /วันที่/);
  assert.throws(() => createHandoverExample({ now, idFactory: () => 'duplicate' }), /รหัส/);
  assert.throws(() => createHandoverExample({ now, idFactory: () => '' }), /รหัส/);
  assert.throws(() => createHandoverExample({ now, idFactory: () => 'x'.repeat(201) }), /รหัส/);
  assert.throws(() => createHandoverExample({ now, idFactory: null }), /ตัวสร้าง/);
});
