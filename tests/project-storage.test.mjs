import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_DRAFT_KEY, legacyToolDraftKey, draftStorageKey, draftPointerKey, normalizeDraft, makeDraftRecord, resolveProjectForTool, persistJSON, readToolDraft, persistToolDraft, removeToolDraft } from '../src/project-storage.js';

const createdAt = '2026-11-21T08:00:00.000Z';
const savedAt = '2026-11-21T08:01:00.000Z';
const editedAt = '2026-11-21T08:02:00.000Z';
const savedProject = { schemaVersion: 1, id: 'project-a', toolId: 'rc-beam', name: 'Beam A', createdAt, updatedAt: savedAt, data: { mu: 100 } };
const memoryStorage = () => {
  const items = new Map();
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) };
};

test('refreshing an edited saved project preserves its identity and original creation date', () => {
  const draft = makeDraftRecord({ ...savedProject, name: 'Beam A revised', data: { mu: 120 } }, editedAt);
  const restored = resolveProjectForTool('rc-beam', { draft, saved: [savedProject] });
  assert.equal(restored.project.id, 'project-a');
  assert.equal(restored.project.createdAt, createdAt);
  assert.equal(restored.project.data.mu, 120);
  assert.equal(restored.fromDraft, true);
});

test('opening a saved project resumes its own newer draft but never another saved project', () => {
  const draft = makeDraftRecord({ ...savedProject, data: { mu: 120 } }, editedAt);
  assert.equal(resolveProjectForTool('rc-beam', { project: savedProject, draft, saved: [savedProject] }).project.data.mu, 120);
  const other = { ...savedProject, id: 'project-b', name: 'Beam B', data: { mu: 70 } };
  const selected = resolveProjectForTool('rc-beam', { project: other, draft, saved: [savedProject, other] });
  assert.equal(selected.project.id, 'project-b'); assert.equal(selected.project.data.mu, 70); assert.equal(selected.fromDraft, false);
});

test('stale drafts never roll a saved project back', () => {
  const stale = makeDraftRecord({ ...savedProject, data: { mu: 60 } }, createdAt);
  for (const project of [null, savedProject]) {
    const restored = resolveProjectForTool('rc-beam', { project, draft: stale, saved: [savedProject] });
    assert.equal(restored.project.data.mu, 100); assert.equal(restored.fromDraft, false);
  }
});

test('deleted or mismatched saved IDs become new unsaved identities', () => {
  const draft = makeDraftRecord(savedProject, editedAt);
  assert.equal(resolveProjectForTool('rc-beam', { draft, saved: [] }).project.id, null);
  assert.equal(resolveProjectForTool('rc-beam', { draft, saved: [{ ...savedProject, toolId: 'footing' }] }).project.id, null);
});

test('imports and reset examples explicitly start fresh without picking up an existing draft', () => {
  const draft = makeDraftRecord(savedProject, editedAt);
  const requested = { name: 'Imported beam', id: null, data: { mu: 35 } };
  const r = resolveProjectForTool('rc-beam', { project: requested, draft, saved: [savedProject], now: editedAt });
  assert.equal(r.project.id, null); assert.equal(r.project.data.mu, 35); assert.equal(r.fromDraft, false);
  const reset = resolveProjectForTool('rc-beam', { project: { name: 'Example', data: {} }, draft, saved: [savedProject] });
  assert.deepEqual(reset.project.data, {}); assert.equal(reset.project.id, null);
});

test('A to B to A keeps separate drafts and resetting B does not erase A', () => {
  const storage = memoryStorage();
  const beam = makeDraftRecord(savedProject, editedAt);
  const wall = makeDraftRecord({ toolId: 'retaining-wall', name: 'Wall', data: { height: 4 } }, editedAt);
  assert.ok(persistToolDraft(storage, beam));
  assert.ok(persistToolDraft(storage, wall));
  assert.equal(readToolDraft(storage, 'rc-beam').data.mu, 100);
  assert.ok(removeToolDraft(storage, 'retaining-wall'));
  assert.equal(storage.getItem(draftStorageKey('retaining-wall')), null);
  assert.equal(readToolDraft(storage, 'rc-beam').id, 'project-a');
});

test('two saved projects using the same tool retain independent newer drafts and resume exact identities', () => {
  const storage = memoryStorage();
  const projectB = { ...savedProject, id: 'project-b', name: 'Beam B', data: { mu: 60 } };
  const draftA = makeDraftRecord({ ...savedProject, data: { mu: 120 } }, editedAt);
  const draftB = makeDraftRecord({ ...projectB, data: { mu: 80 } }, '2026-11-21T08:03:00.000Z');
  assert.ok(persistToolDraft(storage, draftA));
  assert.ok(persistToolDraft(storage, draftB));
  assert.equal(readToolDraft(storage, 'rc-beam').id, 'project-b');
  for (const [project, expected] of [[savedProject, 120], [projectB, 80]]) {
    const restored = resolveProjectForTool('rc-beam', { project, draft: readToolDraft(storage, 'rc-beam', project.id), saved: [savedProject, projectB] });
    assert.equal(restored.project.id, project.id); assert.equal(restored.project.data.mu, expected); assert.equal(restored.fromDraft, true);
  }
  // Returning to A updates only the last-work pointer; B's newer work is retained.
  persistToolDraft(storage, draftA);
  assert.equal(readToolDraft(storage, 'rc-beam').id, 'project-a');
  assert.equal(readToolDraft(storage, 'rc-beam', 'project-b').data.mu, 80);
});

test('reset/delete of one saved project does not erase another project draft or unsaved work', () => {
  const storage = memoryStorage();
  const a = makeDraftRecord(savedProject, editedAt);
  const b = makeDraftRecord({ ...savedProject, id: 'project-b', data: { mu: 80 } }, editedAt);
  const unsaved = makeDraftRecord({ toolId: 'rc-beam', name: 'New beam', data: { mu: 45 } }, editedAt);
  persistToolDraft(storage, unsaved); persistToolDraft(storage, a); persistToolDraft(storage, b);
  removeToolDraft(storage, 'rc-beam', 'project-a');
  assert.equal(readToolDraft(storage, 'rc-beam', 'project-a'), null);
  assert.equal(readToolDraft(storage, 'rc-beam').id, 'project-b');
  assert.equal(readToolDraft(storage, 'rc-beam', null).data.mu, 45);
  removeToolDraft(storage, 'rc-beam', 'project-b');
  assert.equal(storage.getItem(draftPointerKey('rc-beam')), null);
  assert.equal(readToolDraft(storage, 'rc-beam').data.mu, 45);
});

test('legacy removal is scoped to the matching tool', () => {
  const storage = memoryStorage();
  persistJSON(storage, LEGACY_DRAFT_KEY, makeDraftRecord(savedProject, editedAt));
  removeToolDraft(storage, 'retaining-wall'); assert.notEqual(storage.getItem(LEGACY_DRAFT_KEY), null);
  removeToolDraft(storage, 'rc-beam'); assert.equal(storage.getItem(LEGACY_DRAFT_KEY), null);
});

test('quota and access failures return failure without reporting a persisted write', () => {
  const denied = { setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } };
  assert.equal(persistJSON(denied, 'draft', { data: 1 }), false);
  assert.equal(removeToolDraft(denied, 'rc-beam'), false);
  assert.equal(persistToolDraft(denied, makeDraftRecord(savedProject, editedAt)), false);
});

test('v2 and legacy drafts migrate by matching identity while unrelated saved drafts remain recoverable', () => {
  const storage = memoryStorage();
  const draftA = makeDraftRecord(savedProject, editedAt);
  persistJSON(storage, legacyToolDraftKey('rc-beam'), draftA);
  assert.equal(readToolDraft(storage, 'rc-beam', 'project-a').data.mu, 100);
  const draftB = makeDraftRecord({ ...savedProject, id: 'project-b', data: { mu: 75 } }, editedAt);
  persistToolDraft(storage, draftB);
  assert.equal(readToolDraft(storage, 'rc-beam').id, 'project-b');
  assert.equal(readToolDraft(storage, 'rc-beam', 'project-a').id, 'project-a');
  persistToolDraft(storage, draftA);
  assert.equal(storage.getItem(legacyToolDraftKey('rc-beam')), null);
  assert.equal(readToolDraft(storage, 'rc-beam', 'project-b').data.mu, 75);
});

test('malformed or wrong-tool drafts are rejected, and legacy drafts safely recover without saved identity', () => {
  assert.equal(normalizeDraft(null, 'rc-beam'), null);
  assert.equal(normalizeDraft({ ...savedProject, data: [] }, 'rc-beam'), null);
  assert.equal(normalizeDraft(savedProject, 'footing'), null);
  const legacy = { schemaVersion: 1, toolId: 'rc-beam', name: 'Old draft', updatedAt: editedAt, data: { mu: 25 } };
  const recovered = resolveProjectForTool('rc-beam', { draft: legacy, saved: [savedProject], now: editedAt });
  assert.equal(recovered.project.id, null); assert.equal(recovered.project.data.mu, 25);
});
