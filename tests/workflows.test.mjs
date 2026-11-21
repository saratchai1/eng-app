import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBoq, normalizeBoqState, changeBoqRows, analyzeSchedule, normalizePlanningState, normalizeInspectionState, inspectionSummary, requireNumber, toCSV } from '../src/workflows.js';

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

test('workflow number imports never substitute defaults for explicit invalid values', () => {
  for (const value of [null, true, false, {}, [], '0x10', '1,000', 'Infinity']) {
    const boq = normalizeBoqState({ rows: [{ name: 'Concrete', unit: 'm3', quantity: value, material: 100, labor: 20 }] });
    assert.throws(() => calculateBoq(boq), /ปริมาณ/);
    const plan = normalizePlanningState({ tasks: [{ id: 'A', name: 'Build', duration: value }] });
    assert.throws(() => analyzeSchedule(plan), /ระยะเวลา/);
  }
  const boq = normalizeBoqState({ rows: [{ name: 'Concrete', unit: 'm3', quantity: ' 2.5 ', material: '1e2', labor: '20.00' }], overhead: '0', vat: '7' });
  assert.equal(boq.rows[0].quantity, 2.5);
  assert.equal(boq.rows[0].material, 100);
  assert.equal(calculateBoq(boq).total, 321);
  for (const field of ['overhead', 'vat']) {
    const invalid = { ...boq, [field]: null };
    assert.throws(() => calculateBoq(normalizeBoqState(invalid)), /กรุณากรอก/);
  }
});

test('oversized imported workflows are rejected instead of silently losing rows', () => {
  assert.throws(() => normalizeBoqState({ rows: Array(201).fill({}) }), /200/);
  assert.throws(() => normalizePlanningState({ tasks: Array(121).fill({}) }), /120/);
  assert.throws(() => normalizeInspectionState({ items: Array(201).fill({}) }), /200/);
  assert.equal(normalizeBoqState({ rows: Array(200).fill({}) }).rows.length, 200);
  assert.equal(normalizeInspectionState({ items: Array(200).fill({}) }).items.length, 200);
});

test('BOQ copies retain rates, get a new identity, and leave the original row unchanged', () => {
  const state = normalizeBoqState(null);
  const before = structuredClone(state);
  const rows = changeBoqRows(state.rows, 'copy', 0, 'copied-row');
  assert.equal(rows.length, state.rows.length + 1);
  assert.equal(rows[1].id, 'copied-row');
  assert.ok(rows[1].name.endsWith(' (สำเนา)'));
  for (const field of ['unit', 'quantity', 'material', 'labor']) assert.equal(rows[1][field], state.rows[0][field]);
  assert.deepEqual(state, before);
  rows[1].material = 0;
  assert.equal(state.rows[0].material, before.rows[0].material);
  assert.throws(() => changeBoqRows(state.rows, 'copy', 0, state.rows[0].id), /ซ้ำ/);
  assert.throws(() => changeBoqRows(Array.from({ length: 200 }, (_, i) => ({ id: String(i) })), 'copy', 0, 'new'), /200/);
});

test('BOQ reorder and removal preserve surviving row identities and arithmetic', () => {
  const state = normalizeBoqState(null);
  const initialIds = state.rows.map(row => row.id);
  const down = changeBoqRows(state.rows, 'move-down', 0);
  assert.deepEqual(down.map(row => row.id), [initialIds[1], initialIds[0], ...initialIds.slice(2)]);
  assert.equal(calculateBoq({ ...state, rows: down }).total, calculateBoq(state).total);
  assert.deepEqual(changeBoqRows(down, 'move-up', 1), state.rows);
  assert.deepEqual(changeBoqRows(state.rows, 'move-up', 0), state.rows);
  const removed = changeBoqRows(state.rows, 'delete', 1);
  assert.deepEqual(removed.map(row => row.id), initialIds.filter((_, i) => i !== 1));
  assert.deepEqual(state.rows.map(row => row.id), initialIds);
  assert.throws(() => changeBoqRows(state.rows, 'delete', -1), /ไม่พบ/);
  assert.throws(() => changeBoqRows(state.rows, 'unsupported', 0), /ไม่ถูกต้อง/);
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

test('planning compares actual and planned weighted progress through the end of the assessment date', () => {
  const base = schedule([
    { id: 'A', name: 'A', duration: 2, progress: 50, budget: 100 },
    { id: 'B', name: 'B', duration: 2, predecessors: 'A', progress: 0, budget: 100 },
  ], '2026-12-30');
  const result = analyzeSchedule({ ...base, statusDate: '2026-12-31' });
  assert.equal(result.elapsedDays, 2);
  assert.equal(result.plannedProgress, 50);
  assert.equal(result.weightedProgress, 25);
  assert.equal(result.progressVariance, -25);
  assert.equal(result.endDate, '2027-01-02');
  assert.equal(analyzeSchedule({ ...base, statusDate: '2026-12-29' }).plannedProgress, 0);
  assert.equal(analyzeSchedule({ ...base, statusDate: '2026-12-30' }).plannedProgress, 25);
  assert.equal(analyzeSchedule({ ...base, statusDate: '2027-01-02' }).plannedProgress, 100);
  assert.equal(analyzeSchedule({ ...base, statusDate: '2027-01-10' }).plannedProgress, 100);
  assert.equal(analyzeSchedule({ ...base, tasks: base.tasks.map(t => ({ ...t, progress: 100 })) }).endDate, result.endDate);
});

test('planned progress uses the same budget weighting and zero-budget fallback as actual progress', () => {
  const base = schedule([
    { id: 'A', name: 'A', duration: 1, budget: 100 },
    { id: 'B', name: 'B', duration: 3, budget: 300 },
  ], '2026-01-01');
  const weighted = analyzeSchedule({ ...base, statusDate: '2026-01-01' });
  assert.equal(weighted.plannedProgress, 50);
  const fallback = analyzeSchedule({ ...base, statusDate: '2026-01-01', tasks: base.tasks.map(t => ({ ...t, budget: 0 })) });
  assert.equal(fallback.plannedProgress, 50);
  assert.equal(fallback.weightMode, 'duration');
  const onlyA = analyzeSchedule({ ...base, statusDate: '2026-01-01', tasks: base.tasks.map(t => ({ ...t, budget: t.id === 'A' ? 100 : 0 })) });
  assert.equal(onlyA.plannedProgress, 100);
});

test('critical paths follow connected dependency order even when input rows are out of order', () => {
  const result = analyzeSchedule(schedule([
    { id: 'D', name: 'Finish', duration: 1, predecessors: 'B,C' },
    { id: 'C', name: 'Branch C', duration: 3, predecessors: 'A' },
    { id: 'B', name: 'Branch B', duration: 3, predecessors: 'A', progress: 100 },
    { id: 'A', name: 'Start', duration: 2 },
    { id: 'E', name: 'Short independent task', duration: 2 },
  ]));
  assert.deepEqual(result.criticalPaths.map(path => path.join(',')).sort(), ['A,B,D', 'A,C,D']);
  assert.deepEqual(result.remainingCriticalTaskIds.sort(), ['A', 'C', 'D']);
  assert.equal(result.moreCriticalPaths, false);
  for (const path of result.criticalPaths) {
    assert.equal(path.reduce((sum, id) => sum + result.tasks.find(t => t.id === id).duration, 0), result.duration);
  }
});

test('many equally critical paths are bounded for readable reports without losing the extra-path indicator', () => {
  const branches = ['B', 'C', 'D', 'E', 'F'];
  const result = analyzeSchedule(schedule([
    { id: 'A', name: 'Start', duration: 1 },
    ...branches.map(id => ({ id, name: id, duration: 2, predecessors: 'A' })),
    { id: 'Z', name: 'Finish', duration: 1, predecessors: branches.join(',') },
  ]));
  assert.equal(result.criticalPaths.length, 3);
  assert.equal(result.moreCriticalPaths, true);
  assert.ok(result.criticalPaths.every(path => path[0] === 'A' && path.at(-1) === 'Z' && path.length === 3));
  assert.equal(result.criticalTaskIds.length, 7);
});

test('planning rejects invalid assessment dates and calendar overflow instead of emitting malformed dates', () => {
  const base = schedule([{ id: 'A', name: 'A', duration: 2 }]);
  assert.throws(() => analyzeSchedule({ ...base, statusDate: '' }), /วันที่ประเมิน/);
  assert.throws(() => analyzeSchedule({ ...base, statusDate: '2026-02-29' }), /วันที่ประเมิน/);
  assert.throws(() => analyzeSchedule({ ...base, startDate: '9999-12-31' }), /ขอบเขตปฏิทิน/);
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
