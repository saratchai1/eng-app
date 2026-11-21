import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBoq, normalizeBoqState, analyzeSchedule, normalizePlanningState, normalizeInspectionState, inspectionSummary, requireNumber, toCSV } from '../src/workflows.js';

test('BOQ calculates material, labor, overhead then VAT with full precision', () => {
  const r = calculateBoq({ rows: [{ name: 'Concrete', unit: 'm3', quantity: 2.5, material: 2000, labor: 400 }, { name: 'Steel', unit: 'kg', quantity: 100, material: 25, labor: 5 }], overhead: 10, vat: 7 });
  assert.equal(r.material, 7500); assert.equal(r.labor, 1500); assert.equal(r.direct, 9000);
  assert.equal(r.overheadAmount, 900); assert.equal(r.vatAmount, 693); assert.equal(r.total, 10593);
});

test('BOQ does not accept negative quantities, blank numbers or non-finite rates', () => {
  const state = normalizeBoqState(null); state.rows[0].quantity = -1;
  assert.throws(() => calculateBoq(state), /ปริมาณ/);
  state.rows[0].quantity = ''; assert.throws(() => calculateBoq(state), /กรุณากรอก/);
  state.rows[0].quantity = 1; state.rows[0].material = Infinity; assert.throws(() => calculateBoq(state), /ราคาวัสดุ/);
  assert.throws(() => requireNumber(null, 'test'), /ตัวเลข/);
  assert.throws(() => requireNumber(true, 'test'), /ตัวเลข/);
});

test('BOQ handles an intentionally empty sheet and preserves editable imported invalid numbers', () => {
  const state = normalizeBoqState({ rows: [], overhead: 10, vat: 7 });
  assert.equal(state.rows.length, 0); assert.equal(calculateBoq(state).total, 0);
  const invalid = normalizeBoqState({ rows: [{ name: 'Bad input', unit: 'm', quantity: 'oops' }] });
  assert.throws(() => calculateBoq(invalid), /ปริมาณ/);
});

test('BOQ preset prices are concrete example records for every supported type', () => {
  for (const id of ['boq-building', 'boq-road', 'boq-irrigation', 'boq-warehouse', 'price-book']) {
    const state = normalizeBoqState(null, id); assert.equal(state.rows.length, 5); assert.ok(calculateBoq(state).direct > 0);
  }
});

test('price book treats imported cost rows as unit rates without hidden quantity or tax values', () => {
  const state = normalizeBoqState({ rows: [{ name: 'Rate', unit: 'm', quantity: 'bad', material: 80, labor: 20 }], overhead: -10, vat: 'bad' }, 'price-book');
  assert.equal(calculateBoq(state).total, 100);
});

test('CSV safely quotes commas, multiline values and spreadsheet formulas', () => {
  const csv = toCSV([['a,b', '"quote"', '=HYPERLINK("https://bad")', '@SUM(1)', 'line\nbreak', -2]]);
  assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes('"a,b"')); assert.ok(csv.includes('""quote""'));
  assert.ok(csv.includes("'=HYPERLINK")); assert.ok(csv.includes("'@SUM")); assert.ok(csv.endsWith('"-2"'));
});

function schedule(tasks, startDate = '2026-12-30') {
  return { startDate, tasks: tasks.map(t => ({ progress: 0, budget: 0, predecessors: '', ...t })) };
}

test('CPM handles branching, float and inclusive finish dates across a year boundary', () => {
  const r = analyzeSchedule(schedule([
    { id: 'A', name: 'Start', duration: 2 },
    { id: 'B', name: 'Long branch', duration: 5, predecessors: 'A' },
    { id: 'C', name: 'Short branch', duration: 3, predecessors: 'A' },
    { id: 'D', name: 'Finish', duration: 1, predecessors: 'B,C' },
  ]));
  assert.equal(r.duration, 8); assert.equal(r.endDate, '2027-01-06');
  assert.deepEqual(r.criticalTaskIds, ['A', 'B', 'D']);
  assert.equal(r.tasks.find(t => t.id === 'C').float, 2);
  assert.equal(r.tasks.find(t => t.id === 'D').es, 7);
});

test('CPM accepts out-of-order input and deduplicates repeated dependencies', () => {
  const r = analyzeSchedule(schedule([
    { id: 'B', name: 'B', duration: 3, predecessors: 'A,A' },
    { id: 'A', name: 'A', duration: 2 },
  ]));
  assert.equal(r.duration, 5); assert.equal(r.tasks[0].es, 2);
});

test('CPM rejects cycles, missing activities, duplicate IDs, self dependency and invalid dates', () => {
  assert.throws(() => analyzeSchedule(schedule([{ id: 'A', name: 'A', duration: 2, predecessors: 'B' }, { id: 'B', name: 'B', duration: 2, predecessors: 'A' }])), /วงจร/);
  assert.throws(() => analyzeSchedule(schedule([{ id: 'A', name: 'A', duration: 2, predecessors: 'X' }])), /ไม่พบ/);
  assert.throws(() => analyzeSchedule(schedule([{ id: 'A', name: 'A', duration: 2 }, { id: 'A', name: 'Other', duration: 1 }])), /ซ้ำ/);
  assert.throws(() => analyzeSchedule(schedule([{ id: 'A', name: 'A', duration: 2, predecessors: 'A' }])), /ตัวเอง/);
  assert.throws(() => analyzeSchedule(schedule([{ id: 'A', name: 'A', duration: 2 }], '2026-02-31')), /วันเริ่ม/);
  assert.throws(() => analyzeSchedule(schedule([{ id: 'A', name: 'A', duration: .5 }])), /จำนวนเต็ม/);
});

test('planning progress uses budget weighting and duration fallback only for zero total budget', () => {
  const base = [{ id: 'A', name: 'A', duration: 1, progress: 100, budget: 100 }, { id: 'B', name: 'B', duration: 3, progress: 0, budget: 300 }];
  const weighted = analyzeSchedule(schedule(base)); assert.equal(weighted.weightedProgress, 25); assert.equal(weighted.weightMode, 'budget');
  const fallback = analyzeSchedule(schedule(base.map(t => ({ ...t, budget: 0 })))); assert.equal(fallback.weightedProgress, 25); assert.equal(fallback.weightMode, 'duration');
});

test('planning imported malformed state stays recoverable and normal defaults calculate', () => {
  assert.equal(analyzeSchedule(normalizePlanningState(null)).duration, 59);
  const state = normalizePlanningState({ tasks: [null, { id: 'T2', predecessors: ['T1', 2], duration: 'bad' }] });
  assert.equal(state.tasks[0].id, 'T1'); assert.equal(state.tasks[1].predecessors, 'T1');
  assert.throws(() => analyzeSchedule(state), /ระยะเวลา/);
});

test('inspection totals distinguish pending, fail, pass and not applicable', () => {
  const state = normalizeInspectionState({ items: ['pending', 'pass', 'fail', 'na'].map((status, i) => ({ title: `Item ${i}`, status })) });
  assert.deepEqual(inspectionSummary(state), { total: 4, pending: 1, pass: 1, fail: 1, na: 1, photos: 0, percent: 75 });
});

test('inspection import rejects executable/non-image photo URLs and unknown statuses', () => {
  const state = normalizeInspectionState({ items: [{ title: '<img onerror=bad()>', status: 'invented', photos: ['javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'https://example.com/tracker.jpg', 'data:image/jpeg;base64,YQ=='] }] });
  assert.equal(state.items[0].status, 'pending'); assert.equal(state.items[0].photos.length, 1);
  assert.equal(state.items[0].title, '<img onerror=bad()>');
  assert.equal(inspectionSummary(state).photos, 1);
});

test('inspection photo import keeps per-item limits from exhausting later items', () => {
  const photo = 'data:image/jpeg;base64,YQ==';
  const state = normalizeInspectionState({ items: [{ title: 'One', photos: Array(8).fill(photo) }, { title: 'Two', photos: [photo, photo] }] });
  assert.equal(state.items[0].photos.length, 2); assert.equal(state.items[1].photos.length, 2);
  assert.equal(inspectionSummary(state).photos, 4);
});
