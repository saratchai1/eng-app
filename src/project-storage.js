/** Draft resolution is independent of the DOM and never assigns an unverified saved ID. */
export const LEGACY_DRAFT_KEY = 'engapp.draft.v1';
export const legacyToolDraftKey = toolId => `engapp.draft.v2.${toolId}`;
export const draftStorageKey = (toolId, projectId = null) => `engapp.draft.v3.${toolId}.${validId(projectId) ? 'project.' + encodeURIComponent(projectId) : 'unsaved'}`;
export const draftPointerKey = toolId => `engapp.draft.current.v3.${toolId}`;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const validDate = value => timestamp(value) ? value : null;

export function normalizeDraft(value, toolId) {
  if (!object(value) || value.schemaVersion !== 1 || value.toolId !== toolId || typeof value.name !== 'string' || !object(value.data)) return null;
  return {
    schemaVersion: 1, toolId, id: validId(value.id), name: value.name.slice(0, 180),
    createdAt: validDate(value.createdAt), updatedAt: validDate(value.updatedAt), data: value.data,
  };
}

export function makeDraftRecord(record, now = new Date().toISOString()) {
  return {
    schemaVersion: 1, toolId: record.toolId, id: validId(record.id),
    name: typeof record.name === 'string' ? record.name.slice(0, 180) : '',
    createdAt: validDate(record.createdAt) || now, updatedAt: now, data: record.data,
  };
}

/**
 * Explicit imports/new examples ignore other drafts. Saved projects may resume a
 * newer draft only when its ID matches that same saved project and tool.
 */
export function resolveProjectForTool(toolId, { project = null, draft = null, saved = [], now = new Date().toISOString() } = {}) {
  const candidate = normalizeDraft(draft, toolId);
  const records = Array.isArray(saved) ? saved : [];
  const savedMatch = id => validId(id) ? records.find(item => item && item.id === id && item.toolId === toolId) || null : null;
  const view = (record, identity = null) => ({
    schemaVersion: 1, toolId, id: identity?.id || null,
    name: typeof record.name === 'string' ? record.name.slice(0, 180) : '', data: record.data,
    createdAt: validDate(identity?.createdAt) || validDate(record.createdAt) || now,
    updatedAt: validDate(record.updatedAt),
  });
  if (project) {
    const identity = savedMatch(project.id);
    const canResume = identity && candidate?.id === identity.id && timestamp(candidate.updatedAt) > timestamp(project.updatedAt);
    return { project: view(canResume ? candidate : project, identity), fromDraft: Boolean(canResume) };
  }
  if (!candidate) return { project: null, fromDraft: false };
  const identity = savedMatch(candidate.id);
  if (identity && timestamp(identity.updatedAt) >= timestamp(candidate.updatedAt)) {
    return { project: view(identity, identity), fromDraft: false };
  }
  return { project: view(candidate, identity), fromDraft: true };
}

export function persistJSON(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

function readJSON(storage, key) {
  try { return JSON.parse(storage.getItem(key)); } catch { return null; }
}
function readPointer(storage, toolId) {
  const value = readJSON(storage, draftPointerKey(toolId));
  return object(value) && value.schemaVersion === 1 && value.toolId === toolId && (value.id === null || validId(value.id)) ? value : null;
}

/** An explicit ID reads that saved project's draft; omission resumes this tool's last work. */
export function readToolDraft(storage, toolId, projectId = undefined) {
  const pointer = projectId === undefined ? readPointer(storage, toolId) : null;
  const expectedId = projectId === undefined ? pointer?.id ?? null : validId(projectId);
  const scoped = normalizeDraft(readJSON(storage, draftStorageKey(toolId, expectedId)), toolId);
  if (scoped && scoped.id === expectedId) return scoped;
  for (const key of [legacyToolDraftKey(toolId), LEGACY_DRAFT_KEY]) {
    const legacy = normalizeDraft(readJSON(storage, key), toolId);
    if (legacy && (projectId === undefined && !pointer || legacy.id === expectedId)) return legacy;
  }
  return null;
}

/** Save data before moving the last-work pointer. A partial/quota failure is reported. */
export function persistToolDraft(storage, value) {
  const draft = normalizeDraft(value, value?.toolId);
  if (!draft) return false;
  if (!persistJSON(storage, draftStorageKey(draft.toolId, draft.id), draft)) return false;
  if (!persistJSON(storage, draftPointerKey(draft.toolId), { schemaVersion: 1, toolId: draft.toolId, id: draft.id })) return false;
  // Remove only a migrated draft of this same identity. Other legacy work remains recoverable.
  for (const key of [legacyToolDraftKey(draft.toolId), LEGACY_DRAFT_KEY]) {
    const legacy = normalizeDraft(readJSON(storage, key), draft.toolId);
    if (legacy?.id === draft.id) {
      try { storage.removeItem(key); } catch { /* New durable record and pointer already succeeded. */ }
    }
  }
  return true;
}

/** Reset/delete one project draft, keeping other projects and tools intact. */
export function removeToolDraft(storage, toolId, projectId = undefined) {
  try {
    const pointer = readPointer(storage, toolId);
    const current = projectId === undefined ? readToolDraft(storage, toolId) : null;
    const id = projectId === undefined ? pointer?.id ?? current?.id ?? null : validId(projectId);
    storage.removeItem(draftStorageKey(toolId, id));
    if (pointer && pointer.id === id) storage.removeItem(draftPointerKey(toolId));
    for (const key of [legacyToolDraftKey(toolId), LEGACY_DRAFT_KEY]) {
      const legacy = normalizeDraft(readJSON(storage, key), toolId);
      if (legacy && legacy.id === id) storage.removeItem(key);
    }
    return true;
  } catch { return false; }
}
