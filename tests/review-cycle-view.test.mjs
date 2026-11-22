import test from 'node:test';
import assert from 'node:assert/strict';
import { engineeringTools } from '../src/engineering.js';
import { quantityTools } from '../src/quantities.js';
import { createHandoverExample } from '../src/handover-example.js';
import { captureHandoverReference } from '../src/handover-history.js';
import { buildReviewCycle, REVIEW_CYCLE_TRANSITIONS } from '../src/review-cycle.js';
import { normalizeReviewCycleViewState, reviewCyclePage, reviewCycleSelectionState, reviewCycleReferenceMarkup, reviewCycleSummaryMarkup, reviewCycleEntryDetailMarkup, REVIEW_CYCLE_PAGE_SIZE } from '../src/review-cycle-view.js';

const now = '2026-11-22T08:00:00.000Z';
const definitions = { ...engineeringTools, ...quantityTools };
function fixture() {
  let sequence = 0;
  const source = createHandoverExample({ now, idFactory: () => `cycle-view-${++sequence}` });
  const reference = captureHandoverReference(source.records, source.state, { id: 'reference-1', code: 'PKG-P01', note: 'ชุดก่อนทบทวน', now, appVersion: '0.8' });
  const model = buildReviewCycle(reference, source.records, definitions, source.state, { now });
  return { ...source, reference, model };
}
const referenceMeta = reference => ({ id: reference.id, code: reference.code, note: reference.note, capturedAt: reference.capturedAt, appVersion: reference.appVersion, documentCount: reference.bundle.records.length });
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value)) freeze(item); } return value; };

test('view state keeps bounded navigation only and defaults to changed entries', () => {
  const raw = { filters: { search: 'คาน', transition: 'closed', owner: 'owner:ทีม B', groupBy: 'document' }, selectedId: '["a","review-item","issue"]', page: 3, detailOpen: true, source: { unsafe: true }, selectedReferenceId: 'not-owned-by-view' };
  const before = JSON.stringify(raw), state = normalizeReviewCycleViewState(freeze(raw));
  assert.equal(state.filters.transition, 'closed');
  assert.equal(state.filters.owner, 'owner:ทีม B');
  assert.equal(state.groupBy, 'document');
  assert.equal(state.page, 3);
  assert.equal(state.detailOpen, true);
  assert.equal('source' in state, false);
  assert.equal('selectedReferenceId' in state, false);
  assert.equal(JSON.stringify(raw), before);
  const invalid = normalizeReviewCycleViewState({ page: Infinity, selectedId: 'line\nbreak', groupBy: 'owner', detailOpen: 'yes' });
  assert.equal(invalid.page, 1);
  assert.equal(invalid.selectedId, null);
  assert.equal(invalid.groupBy, 'transition');
  assert.equal(invalid.detailOpen, false);
  assert.equal(normalizeReviewCycleViewState().filters.transition, 'changes');
  assert.equal(normalizeReviewCycleViewState({ selectedId: 'x'.repeat(1601) }).selectedId, null);
});

test('the unchanged initial round is excluded by default and available explicitly', () => {
  const { model } = fixture();
  assert.equal(reviewCyclePage(model, {}).visible.length, 0);
  const all = reviewCyclePage(model, { filters: { transition: 'all' } });
  assert.equal(all.visible.length, model.entries.length);
  assert.ok(all.rows.every(row => row.transition === 'unchanged'));
  assert.equal(reviewCyclePage(null, { page: 50 }).page, 1);
});

test('screen paging retains every matching entry once without clipping a full export scope', () => {
  const { model } = fixture(), first = model.entries.find(row => row.kind === 'review-item');
  const entries = Array.from({ length: 67 }, (_, index) => ({ ...first, id: `row-${index}`, documentId: `source-${index}`, documentName: `เอกสาร ${index}`, transition: index % 2 ? 'new' : 'updated' }));
  const large = freeze({ ...model, entries }), ids = [];
  for (let page = 1; page <= 4; page++) {
    const result = reviewCyclePage(large, { page });
    assert.equal(result.visible.length, 67);
    assert.equal(result.pages, 4);
    assert.ok(result.rows.length <= REVIEW_CYCLE_PAGE_SIZE);
    ids.push(...result.rows.map(row => row.id));
  }
  assert.equal(ids.length, 67);
  assert.equal(new Set(ids).size, 67);
  assert.equal(reviewCyclePage(large, { page: 999 }).page, 4);
  assert.equal(reviewCyclePage(large, { groupBy: 'document', page: 2 }).rows.length, 20);
});

test('selected rows remain explicit when filtered or absent after live refresh', () => {
  const { model } = fixture(), entry = model.entries[0];
  const selected = { selectedId: entry.id };
  assert.equal(reviewCycleSelectionState(model, selected).status, 'filtered');
  assert.equal(reviewCycleSelectionState(model, { ...selected, filters: { transition: 'all' } }).status, 'visible');
  assert.equal(reviewCycleSelectionState({ ...model, entries: [] }, selected).status, 'missing');
  assert.equal(reviewCycleSelectionState(null, selected).status, 'missing');
  assert.equal(reviewCycleSelectionState(model, {}).status, 'none');
  assert.equal(reviewCycleSelectionState(model, selected).entry.id, entry.id);
});

test('reference context requires explicit selection and never silently substitutes another reference', () => {
  const { reference, model } = fixture(), references = [referenceMeta(reference)];
  assert.match(reviewCycleReferenceMarkup(references, null, null), /เลือกฉบับอ้างอิงที่จะเทียบ/);
  const missing = reviewCycleReferenceMarkup(references, 'deleted-reference', null);
  assert.match(missing, /ไม่พบฉบับอ้างอิงที่เลือกไว้/);
  assert.match(missing, /ระบบจะไม่เปลี่ยนจุดอ้างอิงให้เอง/);
  assert.doesNotMatch(missing, /REFERENCE \/ CAPTURED INPUTS/);
  assert.match(reviewCycleReferenceMarkup([], null, null), /เก็บฉบับอ้างอิงก่อนเริ่มเทียบรอบ/);
  const content = reviewCycleReferenceMarkup(references, reference.id, model);
  assert.match(content, /PKG-P01/);
  assert.match(content, /ข้อมูลต้นทางด้วยแบบจำลองปัจจุบัน/);
  assert.match(content, /ไม่ใช่เปอร์เซ็นต์ความสำเร็จหรือการอนุมัติ/);
});

test('summary preserves all transition meanings and exact filter keys', () => {
  const { model } = fixture();
  const counts = Object.fromEntries(Object.keys(REVIEW_CYCLE_TRANSITIONS).map((key, index) => [key, index]));
  const html = reviewCycleSummaryMarkup({ ...model, summary: { ...model.summary, counts } }, 'removed-source');
  assert.equal((html.match(/data-rc-transition=/g) || []).length, 9);
  for (const key of Object.keys(REVIEW_CYCLE_TRANSITIONS)) assert.ok(html.includes(`data-rc-transition="${key}"`));
  assert.match(html, /data-rc-transition="removed-source" aria-pressed="true"/);
  assert.match(html, /ผู้ใช้ปิดประเด็น/);
  assert.match(html, /เงื่อนไขเดิมไม่คงอยู่/);
  assert.match(html, /ไม่พบรายการเดิม/);
  assert.doesNotMatch(html, /100%|อนุมัติแล้ว|พร้อมก่อสร้าง/);
});

test('removed and unavailable current sources do not expose an enabled open action', () => {
  const { model } = fixture(), original = model.entries.find(row => row.kind === 'review-item');
  const removed = { ...original, after: null, afterDocument: null, membership: 'removed', transition: 'removed-source', transitionLabel: REVIEW_CYCLE_TRANSITIONS['removed-source'], canOpenCurrent: false, target: null, reason: 'เอกสารออกจากชุด ไม่ถือว่าปิดแล้ว' };
  const html = reviewCycleEntryDetailMarkup(removed);
  assert.match(html, /เอกสารนี้ไม่ได้เลือกในชุดปัจจุบัน/);
  assert.match(html, /data-rc-action="open" disabled/);
  assert.match(html, /href="#handover"/);
  assert.match(html, /การไม่มีรายการไม่ใช่การยืนยันว่าปิดแล้ว/);
  const missing = reviewCycleEntryDetailMarkup({ ...removed, membership: 'missing', transition: 'unavailable' });
  assert.match(missing, /ไม่พบต้นทางปัจจุบันที่อ่านได้/);
  assert.match(missing, /data-rc-action="open" disabled/);
});

test('before-only entries can open the surviving source without inventing a current finding', () => {
  const { model } = fixture(), original = model.entries.find(row => row.kind === 'review-item');
  const entry = { ...original, after: null, transition: 'not-listed', transitionLabel: REVIEW_CYCLE_TRANSITIONS['not-listed'], reason: 'ไม่พบรหัสประเด็นในทะเบียนปัจจุบัน', canOpenCurrent: true, target: { section: 'review' } };
  const html = reviewCycleEntryDetailMarkup(entry);
  assert.match(html, /ไม่พบประเด็นเดิมในทะเบียนปัจจุบัน/);
  assert.doesNotMatch(html, /data-rc-action="open" disabled/);
  assert.match(html, /ข้อมูลในฉบับอ้างอิง/);
  assert.match(html, /การไม่มีรายการไม่ใช่การยืนยันว่าปิดแล้ว/);
});

test('the evidence inspector shows recorded status, responses and before/current changes without mutating them', () => {
  const { model } = fixture(), original = model.entries.find(row => row.kind === 'review-item');
  const entry = freeze({ ...original, transition: 'reopened', transitionLabel: REVIEW_CYCLE_TRANSITIONS.reopened, before: { ...original.before, status: 'closed', statusLabel: 'ผู้ใช้ระบุว่าปิดแล้ว', response: 'คำตอบจากรอบเดิม' }, after: { ...original.after, status: 'needs-review', statusLabel: 'ต้องตรวจซ้ำ', owner: 'ทีม B', sourceState: 'draft' }, changes: [{ key: 'evidence', label: 'โมเมนต์ Mu', before: '120 kN·m', after: '350 kN·m' }] });
  const before = JSON.stringify(entry), html = reviewCycleEntryDetailMarkup(entry, { selectionStatus: 'filtered' });
  assert.match(html, /อยู่นอกตัวกรองปัจจุบัน/);
  assert.match(html, /ผู้ใช้ระบุว่าปิดแล้ว/);
  assert.match(html, /ต้องตรวจซ้ำ/);
  assert.match(html, /คำตอบจากรอบเดิม/);
  assert.match(html, /ร่างแก้ไขล่าสุด/);
  assert.match(html, /120 kN·m/);
  assert.match(html, /350 kN·m/);
  assert.equal(JSON.stringify(entry), before);
});

test('view evidence escapes imported titles, owners, responses, dates and difference values', () => {
  const { model, reference } = fixture(), original = model.entries.find(row => row.kind === 'review-item');
  const unsafe = '<img src=x onerror="alert(1)">';
  const entry = { ...original, title: unsafe, documentName: unsafe, documentCode: unsafe, reason: unsafe, before: { ...original.before, owner: unsafe, response: unsafe, detail: unsafe, evidence: [{ label: unsafe, value: unsafe }] }, changes: [{ key: 'x', label: unsafe, before: unsafe, after: unsafe }] };
  const detail = reviewCycleEntryDetailMarkup(entry);
  assert.doesNotMatch(detail, /<img|<script|onerror="alert/);
  assert.match(detail, /&lt;img/);
  const referenceHTML = reviewCycleReferenceMarkup([{ ...referenceMeta(reference), code: unsafe, note: unsafe, capturedAt: unsafe }], reference.id, model);
  assert.doesNotMatch(referenceHTML, /<img|<script|onerror="alert/);
  assert.match(referenceHTML, /ยังไม่ระบุเวลา/);
});

test('owner scope matches recorded attribution on either side without changing displayed current ownership', () => {
  const { model } = fixture(), original = model.entries.find(row => row.kind === 'review-item');
  const entry = { ...original, transition: 'updated', owner: 'ทีม B', ownerKey: 'owner:ทีม B', before: { ...original.before, owner: 'ทีม A', ownerKey: 'owner:ทีม A' }, after: { ...original.after, owner: 'ทีม B', ownerKey: 'owner:ทีม B' } };
  const comparison = { ...model, entries: [entry] };
  assert.equal(reviewCyclePage(comparison, { filters: { owner: 'owner:ทีม A' } }).visible[0].owner, 'ทีม B');
  assert.equal(reviewCyclePage(comparison, { filters: { owner: 'owner:ทีม B' } }).visible.length, 1);
  assert.equal(reviewCyclePage(comparison, { filters: { owner: 'owner:ทีม' } }).visible.length, 0);
  const html = reviewCycleEntryDetailMarkup(entry);
  assert.match(html, /ทีม A/);
  assert.match(html, /ทีม B/);
});

test('empty and removed selections explain the next action without silently choosing a record', () => {
  const initial = reviewCycleEntryDetailMarkup(null);
  assert.match(initial, /เลือกประเด็นเพื่อเทียบสองรอบ/);
  assert.match(initial, /data-rc-action="start"/);
  const missing = reviewCycleEntryDetailMarkup(null, { selectionStatus: 'missing' });
  assert.match(missing, /ไม่พบรายการที่เลือกในผลล่าสุด/);
  assert.match(missing, /data-rc-action="clear-selection"/);
  assert.doesNotMatch(missing, /data-rc-action="open"/);
});
