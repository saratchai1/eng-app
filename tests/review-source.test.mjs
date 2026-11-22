import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewSourceHash, parseReviewSourceHash, resolveReviewSource, preserveReviewSourceDraft } from '../src/review-source.js';

test('review source links retain exact project and issue identity across special characters and reload', () => {
  const sourceId = 'โครงการ/A B?x=1#2%&', itemId = 'issue/A B?x=1', findingId = 'doc:A?B#C / review-1';
  const hash = reviewSourceHash(sourceId, { section: 'review', itemId }, findingId);
  assert.ok(hash.startsWith('#review-source/'));
  assert.deepEqual(parseReviewSourceHash(hash), { sourceId, target: { section: 'review', itemId }, findingId });
  const records = [{ id: 'last-beam', toolId: 'rc-beam' }, { id: sourceId, toolId: 'rc-beam' }];
  assert.equal(resolveReviewSource(records, parseReviewSourceHash(hash).sourceId), records[1]);
});

test('ambiguous and missing IDs never open the first matching or latest same-tool record', () => {
  const records = [{ id: 'a', toolId: 'rc-beam' }, { id: 'a', toolId: 'rc-beam' }, { id: 'b', toolId: 'rc-beam' }];
  assert.throws(() => resolveReviewSource(records, 'a'), /มากกว่าหนึ่ง/);
  assert.throws(() => resolveReviewSource(records, 'missing'), /ไม่พบ/);
  assert.equal(resolveReviewSource(records, 'b'), records[2]);
});

test('malformed and unsupported targets are rejected without a fallback to another source section', () => {
  for (const hash of ['#review-source/%E0%A4%A', '#review-source/a?section=delete', '#review-source/a?section=review&section=results', '#review-source/a?section=document&item=issue', '#review-source/a?pending=0', '#review-source/a?unknown=1', '#review-source/%0A']) {
    assert.throws(() => parseReviewSourceHash(hash), Error, hash);
  }
  assert.equal(parseReviewSourceHash('#tool/rc-beam'), null);
  assert.throws(() => reviewSourceHash(' ', { section: 'results' }));
  assert.throws(() => reviewSourceHash('x', { section: 'review', itemId: 'a'.repeat(81) }));
});

test('pending editor and document targets do not need a guessed issue ID', () => {
  assert.deepEqual(parseReviewSourceHash(reviewSourceHash('beam', { section: 'review', pending: true })).target, { section: 'review', pending: true });
  assert.deepEqual(parseReviewSourceHash(reviewSourceHash('beam', { section: 'revisions', pending: true })).target, { section: 'revisions', pending: true });
  assert.deepEqual(parseReviewSourceHash(reviewSourceHash('boq', { section: 'document' })).target, { section: 'document' });
});

test('return-to-room persistence failure retains dirty source state and never reports success', () => {
  const source = { dirty: true, response: 'ยังพิมพ์คำตอบไม่เสร็จ', value: 550 };
  let calls = 0;
  assert.equal(preserveReviewSourceDraft(source.dirty, () => { calls++; throw new Error('quota'); }), false);
  assert.equal(preserveReviewSourceDraft(source.dirty, () => { calls++; return false; }), false);
  assert.equal(source.response, 'ยังพิมพ์คำตอบไม่เสร็จ');
  assert.equal(source.value, 550);
  assert.equal(source.dirty, true);
  assert.equal(calls, 2);
  assert.equal(preserveReviewSourceDraft(false, () => { throw new Error('must not write clean data'); }), true);
  assert.equal(preserveReviewSourceDraft(true, () => true), true);
});
