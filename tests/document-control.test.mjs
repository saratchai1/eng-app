import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDocument, isDocumentDate, documentReviewState, invalidateDocumentReview, documentEditorMarkup, documentSummaryMarkup, documentCoverMarkup, normalizeDocumentAssessment, readDocumentEditor } from '../src/document-control.js';

test('document defaults are draft with no invented project identity or human approval', () => {
  const document = normalizeDocument();
  assert.equal(document.revision, 'P01');
  assert.equal(document.purpose, 'draft');
  for (const key of ['projectCode', 'client', 'site', 'preparedBy', 'checkedBy', 'issueDate', 'designBasis']) assert.equal(document[key], '');
  assert.equal(document.reviewItems.length, 3);
  assert.ok(document.reviewItems.every(item => item.checked === false && item.note === ''));
  assert.deepEqual(documentReviewState(document).pending.map(item => item.id), ['inputs', 'model-scope', 'independent']);
});

test('normalization retains editable document context while removing unsupported properties', () => {
  const input = { projectCode: ' TEAM-042 / STR-002 ', client: 'Owner', site: 'Zone B', preparedBy: 'Engineer A', checkedBy: 'Engineer B', revision: 'C-02', issueDate: '2026-11-21', purpose: 'for-review', designBasis: 'Drawing S-001\nSoil report SI-02', approved: true, reviewItems: [{ id: 'inputs', checked: true, note: 'Checked units against SI-02' }] };
  const value = normalizeDocument(input);
  assert.equal(value.projectCode, 'TEAM-042 / STR-002');
  assert.equal(value.issueDate, '2026-11-21');
  assert.equal(value.revision, 'C-02');
  assert.equal(value.designBasis, 'Drawing S-001\nSoil report SI-02');
  assert.equal(value.reviewItems[0].note, 'Checked units against SI-02');
  assert.equal(documentReviewState(value).completed, 1);
  assert.equal(value.approved, undefined);
  assert.notEqual(value.reviewItems, input.reviewItems);
  value.reviewItems[0].note = 'Different';
  assert.equal(input.reviewItems[0].note, 'Checked units against SI-02');
});

test('import never coerces strings or a checker name into review confirmation', () => {
  const value = normalizeDocument({ checkedBy: 'Named reviewer', purpose: 'approved', client: { name: 'Hidden data' }, reviewItems: [{ id: 'inputs', checked: 'true' }, { id: 'model-scope', checked: 1 }, { id: 'independent', checked: {} }, { id: 'approved', checked: true }] });
  assert.equal(value.purpose, 'draft');
  assert.equal(value.client, '');
  assert.equal(documentReviewState(value).completed, 0);
  assert.equal(value.reviewItems.length, 3);
});

test('changed inputs clear human confirmations without losing context or review notes', () => {
  const original = normalizeDocument({ projectCode: 'P-042', checkedBy: 'Engineer B', purpose: 'for-review', reviewItems: [{ id: 'inputs', checked: true, note: 'Reviewed SI-02' }, { id: 'independent', checked: true, note: 'Prior calculation check' }] });
  const changed = invalidateDocumentReview(original);
  assert.equal(documentReviewState(changed).completed, 0);
  assert.equal(changed.projectCode, 'P-042');
  assert.equal(changed.checkedBy, 'Engineer B');
  assert.equal(changed.purpose, 'for-review');
  assert.equal(changed.reviewItems[0].note, 'Reviewed SI-02');
  assert.equal(changed.reviewItems[2].note, 'Prior calculation check');
  assert.equal(original.reviewItems[0].checked, true);
  assert.notEqual(changed.reviewItems, original.reviewItems);
});

test('import bounds strings and strips non-text control characters without destroying multiline notes', () => {
  const value = normalizeDocument({ projectCode: 'A'.repeat(100), revision: 'B'.repeat(50), designBasis: 'Line 1\u0000\nLine 2\tend', reviewItems: [{ id: 'inputs', checked: true, note: 'X'.repeat(2000) }] });
  assert.equal(value.projectCode.length, 64);
  assert.equal(value.revision.length, 24);
  assert.equal(value.reviewItems[0].note.length, 1200);
  assert.equal(value.designBasis, 'Line 1\nLine 2\tend');
  assert.equal(normalizeDocument({ revision: '   ' }).revision, 'P01');
});

test('document dates reject calendar rollover and preserve valid leap days', () => {
  for (const value of ['2026-02-29', '2026-02-31', '2026-04-31', '2026-13-01', '2026-00-01', '2026-1-01', '21/11/2026', '2026-11-21T00:00:00Z', '0000-01-01', 20261121]) {
    assert.equal(isDocumentDate(value), false, String(value));
    assert.equal(normalizeDocument({ issueDate: value }).issueDate, '');
  }
  assert.equal(isDocumentDate('2024-02-29'), true);
  assert.equal(isDocumentDate('2000-02-29'), true);
  assert.equal(isDocumentDate('2100-02-29'), false);
  assert.equal(isDocumentDate('2026-11-21'), true);
});

test('document renderers escape imported content in text, values and textareas', () => {
  const attack = '</textarea><img src=x onerror=alert(1)>';
  const metadata = normalizeDocument({ projectCode: attack, client: attack, designBasis: attack, reviewItems: [{ id: 'inputs', checked: true, note: attack }] });
  for (const markup of [documentEditorMarkup(metadata), documentSummaryMarkup(metadata), documentCoverMarkup({ metadata, projectName: attack, toolTitle: attack, toolId: attack, appVersion: attack, generatedAt: '2026-11-21T00:00:00Z' })]) {
    assert.ok(markup.includes('&lt;'));
    assert.ok(!markup.includes('<img'));
    assert.ok(!markup.includes('</textarea><img'));
  }
});

test('cover keeps human declarations separate from current model results', () => {
  const metadata = { purpose: 'for-review', checkedBy: 'Engineer B', reviewItems: [{ id: 'inputs', checked: true }, { id: 'model-scope', checked: true }] };
  const markup = documentCoverMarkup({ metadata, projectName: 'Review package', assessment: { pass: 2, fail: 1, unassessed: 1 }, generatedAt: '2026-11-21T00:00:00Z' });
  assert.ok(markup.includes('FOR REVIEW'));
  assert.ok(markup.includes('ผู้ใช้ระบุว่าตรวจแล้ว 2/3'));
  assert.ok(markup.includes('ข้อมูลชุดปัจจุบัน · 4 รายการ'));
  assert.ok(markup.includes('ไม่ใช่ลายเซ็นหรือการอนุมัติ'));
  assert.ok(markup.includes('ยังไม่ระบุว่าตรวจแล้ว'));
  assert.ok(!markup.includes('APPROVED'));
  assert.equal((markup.match(/<input|<button|<textarea/g) || []).length, 0);
});

test('assessment counts reject invalid data and never rely on a claimed imported total', () => {
  assert.deepEqual(normalizeDocumentAssessment({ pass: 3, fail: 2, unassessed: 1, total: 999 }), { pass: 3, fail: 2, unassessed: 1, total: 6 });
  for (const value of [{ pass: '3', fail: 0, unassessed: 0 }, { pass: -1, fail: 2, unassessed: 0 }, { pass: 1, fail: 0 }, { pass: 0, fail: 0, unassessed: 0 }, { pass: 1.2, fail: 0, unassessed: 0 }, { pass: Infinity, fail: 0, unassessed: 0 }]) assert.equal(normalizeDocumentAssessment(value), null);
});

test('editor reads only its scoped controls and retains incomplete review notes', () => {
  const controls = new Map([
    ['[data-document-field="projectCode"]', { value: 'P-123' }],
    ['[data-document-field="purpose"]', { value: 'for-review' }],
    ['[data-document-review="inputs"]', { checked: true }],
    ['[data-document-review-note="model-scope"]', { value: 'Groundwater case pending' }],
  ]);
  const metadata = readDocumentEditor({ querySelector: selector => controls.get(selector) });
  assert.equal(metadata.projectCode, 'P-123');
  assert.equal(metadata.purpose, 'for-review');
  assert.equal(metadata.reviewItems[0].checked, true);
  assert.equal(metadata.reviewItems[1].checked, false);
  assert.equal(metadata.reviewItems[1].note, 'Groundwater case pending');
  assert.equal(documentReviewState(metadata).completed, 1);
});
