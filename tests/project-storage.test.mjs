import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_DRAFT_KEY, legacyToolDraftKey, draftStorageKey, draftPointerKey, normalizeDraft, makeDraftRecord, resolveProjectForTool, persistJSON, readToolDraft, persistToolDraft, removeToolDraft, persistToolPointer, finalizeSavedDraft, removeOwnedDraft } from '../src/project-storage.js';

const createdAt = '2026-11-21T08:00:00.000Z';
const savedAt = '2026-11-21T08:01:00.000Z';
const editedAt = '2026-11-21T08:02:00.000Z';
const savedProject = { schemaVersion: 1, id: 'project-a', toolId: 'rc-beam', name: 'Beam A', createdAt, updatedAt: savedAt, data: { mu: 100 } };
const memoryStorage = () => {
  const items = new Map();
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) };
};

test('saving an unsaved project removes redundant image-heavy drafts after durable save', () => {
  const storage = memoryStorage();
  const unsaved = makeDraftRecord({ ...savedProject, id: null }, editedAt);
  persistToolDraft(storage, unsaved);
  persistJSON(storage, 'projects', [savedProject]);
  assert.equal(finalizeSavedDraft(storage, savedProject, null), true);
  assert.equal(storage.getItem(draftStorageKey('rc-beam', null)), null);
  assert.equal(storage.getItem(draftStorageKey('rc-beam', 'project-a')), null);
  const recovered = readToolDraft(storage, 'rc-beam', undefined, [savedProject]);
  assert.equal(recovered.id, 'project-a');
  assert.equal(recovered.data.mu, 100);
});

test('clean saved projects resume from a small pointer without duplicating the project payload', () => {
  const storage = memoryStorage();
  assert.ok(persistToolPointer(storage, 'rc-beam', savedProject.id));
  assert.equal(readToolDraft(storage, 'rc-beam', undefined, [savedProject]).id, savedProject.id);
  assert.equal(readToolDraft(storage, 'rc-beam', 'other', [savedProject]), null);
  assert.equal(readToolDraft(storage, 'rc-beam', undefined, []), null);
});

test('saving one identity preserves the drafts of another saved project and unsaved work', () => {
  const storage = memoryStorage();
  persistToolDraft(storage, makeDraftRecord({ ...savedProject, data: { mu: 120 } }, editedAt));
  persistToolDraft(storage, makeDraftRecord({ ...savedProject, id: 'project-b', data: { mu: 140 } }, editedAt));
  persistToolDraft(storage, makeDraftRecord({ ...savedProject, id: null, data: { mu: 160 } }, editedAt));
  assert.ok(finalizeSavedDraft(storage, savedProject, savedProject.id));
  assert.equal(readToolDraft(storage, 'rc-beam', 'project-b').data.mu, 140);
  assert.equal(readToolDraft(storage, 'rc-beam', null).data.mu, 160);
});

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

test('a stale-base draft cannot shadow an explicitly opened saved version but resumes as an unsaved fork', () => {
  const newer = { ...savedProject, updatedAt: '2026-11-21T08:03:00.000Z', data: { mu: 200 } };
  const draft = makeDraftRecord({ ...savedProject, data: { mu: 100 }, writerId: 'stale-tab', baseSavedAt: savedAt }, '2026-11-21T08:04:00.000Z');
  const explicit = resolveProjectForTool('rc-beam', { project: savedProject, draft, saved: [newer] });
  assert.equal(explicit.project.data.mu, 200);
  assert.equal(explicit.project.id, savedProject.id);
  assert.equal(explicit.fromDraft, false);
  const resumed = resolveProjectForTool('rc-beam', { draft, saved: [newer], now: '2026-11-21T08:05:00.000Z' });
  assert.equal(resumed.project.data.mu, 100);
  assert.equal(resumed.project.id, null);
  assert.equal(resumed.project.baseSavedAt, null);
  assert.equal(resumed.project.writerId, 'stale-tab');
  assert.equal(resumed.project.createdAt, '2026-11-21T08:05:00.000Z');
  assert.match(resumed.project.name, /ร่างจากงานรุ่นก่อน/);
  assert.equal(resumed.fromDraft, true);
  const validDraft = { ...draft, baseSavedAt: newer.updatedAt };
  const matching = resolveProjectForTool('rc-beam', { project: newer, draft: validDraft, saved: [newer] });
  assert.equal(matching.project.data.mu, 100);
  assert.equal(matching.project.writerId, 'stale-tab');
  assert.equal(matching.project.baseSavedAt, newer.updatedAt);
});

test('conflict promotion removes its own older autosave even when latest edits are still pending', () => {
  const storage = memoryStorage();
  const original = { ...savedProject, updatedAt: '2026-11-21T08:03:00.000Z', data: { mu: 200 } };
  const autosaved = makeDraftRecord({ ...savedProject, data: { mu: 100 }, writerId: 'tab-a', baseSavedAt: savedAt }, '2026-11-21T08:04:00.000Z');
  persistToolDraft(storage, autosaved);
  // 110 was typed after autosave; promotion must not rely on equal payloads.
  const copy = { ...original, id: 'copy-b', createdAt: '2026-11-21T08:05:00.000Z', updatedAt: '2026-11-21T08:05:00.000Z', data: { mu: 110 } };
  const records = [copy, original];
  persistJSON(storage, 'projects', records);
  assert.ok(removeOwnedDraft(storage, 'rc-beam', original.id, { writerId: 'tab-a' }));
  assert.ok(finalizeSavedDraft(storage, copy));
  assert.equal(storage.getItem(draftStorageKey('rc-beam', original.id)), null);
  const reopened = resolveProjectForTool('rc-beam', { project: original, draft: readToolDraft(storage, 'rc-beam', original.id, records), saved: records });
  assert.equal(reopened.project.data.mu, 200);
  assert.equal(readToolDraft(storage, 'rc-beam', undefined, records).data.mu, 110);
});

test('adopted drafts including legacy writerless records are removed only by their exact writer and timestamp', () => {
  for (const resumedWriterId of [null, 'old-tab']) {
    const storage = memoryStorage();
    const adopted = makeDraftRecord({ ...savedProject, writerId: resumedWriterId, baseSavedAt: savedAt }, editedAt);
    if (resumedWriterId === null) { delete adopted.writerId; delete adopted.baseSavedAt; }
    const key = resumedWriterId === null ? LEGACY_DRAFT_KEY : draftStorageKey('rc-beam', savedProject.id);
    persistJSON(storage, key, adopted);
    persistToolPointer(storage, 'rc-beam', savedProject.id);
    assert.ok(removeOwnedDraft(storage, 'rc-beam', savedProject.id, { writerId: 'new-tab', resumedWriterId, resumedUpdatedAt: editedAt }));
    assert.equal(storage.getItem(key), null);
    assert.equal(storage.getItem(draftPointerKey('rc-beam')), null);
  }
});

test('owned cleanup preserves another writer’s later work and unrelated drafts, and reports storage denial', () => {
  const storage = memoryStorage();
  const laterAt = '2026-11-21T08:06:00.000Z';
  const newer = makeDraftRecord({ ...savedProject, writerId: 'other-tab', baseSavedAt: savedAt, data: { mu: 250 } }, laterAt);
  persistToolDraft(storage, newer);
  persistJSON(storage, LEGACY_DRAFT_KEY, makeDraftRecord({ ...savedProject, writerId: 'this-tab' }, editedAt));
  const unsaved = makeDraftRecord({ ...savedProject, id: null, writerId: 'this-tab', data: { mu: 300 } }, editedAt);
  persistJSON(storage, draftStorageKey('rc-beam', null), unsaved);
  assert.ok(removeOwnedDraft(storage, 'rc-beam', savedProject.id, { writerId: 'this-tab', resumedWriterId: 'other-tab', resumedUpdatedAt: editedAt }));
  assert.equal(readToolDraft(storage, 'rc-beam').data.mu, 250);
  assert.equal(readToolDraft(storage, 'rc-beam', null).data.mu, 300);
  assert.equal(storage.getItem(LEGACY_DRAFT_KEY), null);
  // Equal timestamps still do not authorize deleting a different writer.
  assert.ok(removeOwnedDraft(storage, 'rc-beam', savedProject.id, { writerId: 'this-tab', resumedWriterId: 'third-tab', resumedUpdatedAt: laterAt }));
  assert.equal(readToolDraft(storage, 'rc-beam').writerId, 'other-tab');
  assert.equal(removeOwnedDraft({ getItem() { throw new Error('denied'); } }, 'rc-beam', savedProject.id, { writerId: 'this-tab' }), false);
});
