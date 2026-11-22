const SECTIONS = new Set(['results', 'review', 'revisions', 'document', 'source']);
const MAX_SOURCE_HASH_LENGTH = 18000;
const safeText = (value, limit) => typeof value === 'string' && value.length > 0 && value.length <= limit && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);

/** The return destination names existing local evidence; it is never an external URL. */
export function normalizeReviewReturnContext(value) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.view !== 'review-cycle' || !safeText(value.referenceId, 200) || !safeText(value.entryId, 2000)) throw new Error('บริบทกลับไปเทียบรอบตรวจไม่ถูกต้อง');
  return { view: 'review-cycle', referenceId: value.referenceId, entryId: value.entryId };
}

export function reviewCycleHash(referenceId = null) {
  if (referenceId === null) return '#review-cycle';
  if (!safeText(referenceId, 200)) throw new Error('รหัสฉบับอ้างอิงสำหรับเทียบรอบตรวจไม่ถูกต้อง');
  return '#review-cycle/' + encodeURIComponent(referenceId);
}

export function parseReviewCycleHash(hash) {
  if (typeof hash !== 'string') throw new Error('ลิงก์เทียบรอบตรวจไม่ถูกต้อง');
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  if (value === 'review-cycle') return { referenceId: null };
  if (!value.startsWith('review-cycle/')) return null;
  if (value.length > 2200) throw new Error('ลิงก์ฉบับอ้างอิงยาวเกินขอบเขต');
  let referenceId;
  try { referenceId = decodeURIComponent(value.slice('review-cycle/'.length)); }
  catch { throw new Error('อ่านรหัสฉบับอ้างอิงจากลิงก์ไม่ได้'); }
  if (!safeText(referenceId, 200)) throw new Error('รหัสฉบับอ้างอิงในลิงก์ไม่ถูกต้อง');
  return { referenceId };
}

/** URLs carry exact local source identity, never the most recently opened tool. */
export function normalizeReviewSourceTarget(value = {}) {
  const section = value.section ?? 'source';
  if (!SECTIONS.has(section)) throw new Error('ส่วนงานที่ต้องการเปิดไม่อยู่ในขอบเขตห้องทบทวน');
  const result = { section };
  if (value.itemId !== undefined && value.itemId !== null && value.itemId !== '') {
    if (section !== 'review' || !safeText(value.itemId, 80)) throw new Error('รหัสประเด็นตรวจทานไม่ถูกต้อง');
    result.itemId = value.itemId;
  }
  if (value.pending !== undefined && value.pending !== false) {
    if (value.pending !== true || !['review', 'revisions'].includes(section)) throw new Error('ตำแหน่งร่างตรวจทานไม่ถูกต้อง');
    result.pending = true;
  }
  return result;
}

export function reviewSourceHash(sourceId, target = {}, findingId = '', returnContext = null) {
  if (!safeText(sourceId, 200)) throw new Error('รหัสงานต้นทางไม่ถูกต้อง');
  if (findingId && !safeText(findingId, 1600)) throw new Error('รหัสรายการทบทวนไม่ถูกต้อง');
  const normalized = normalizeReviewSourceTarget(target);
  const query = new URLSearchParams({ section: normalized.section });
  if (normalized.itemId) query.set('item', normalized.itemId);
  if (normalized.pending) query.set('pending', '1');
  if (findingId) query.set('finding', findingId);
  const back = normalizeReviewReturnContext(returnContext);
  if (back) { query.set('return', back.view); query.set('reference', back.referenceId); query.set('entry', back.entryId); }
  const hash = '#review-source/' + encodeURIComponent(sourceId) + '?' + query.toString();
  if (hash.length > MAX_SOURCE_HASH_LENGTH) throw new Error('ลิงก์งานต้นทางยาวเกินขอบเขต');
  return hash;
}

export function parseReviewSourceHash(hash) {
  if (typeof hash !== 'string') throw new Error('ลิงก์งานต้นทางไม่ถูกต้อง');
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!value.startsWith('review-source/')) return null;
  if (value.length > MAX_SOURCE_HASH_LENGTH) throw new Error('ลิงก์งานต้นทางยาวเกินขอบเขต');
  const tail = value.slice('review-source/'.length), separator = tail.indexOf('?');
  let sourceId;
  try { sourceId = decodeURIComponent(separator < 0 ? tail : tail.slice(0, separator)); }
  catch { throw new Error('อ่านรหัสงานต้นทางจากลิงก์ไม่ได้'); }
  if (!safeText(sourceId, 200)) throw new Error('รหัสงานต้นทางในลิงก์ไม่ถูกต้อง');
  const query = new URLSearchParams(separator < 0 ? '' : tail.slice(separator + 1));
  for (const key of query.keys()) {
    if (!['section', 'item', 'pending', 'finding', 'return', 'reference', 'entry'].includes(key) || query.getAll(key).length !== 1) throw new Error('ตัวเลือกในลิงก์งานต้นทางไม่ถูกต้อง');
  }
  if (query.has('pending') && query.get('pending') !== '1') throw new Error('ตัวเลือกร่างตรวจทานในลิงก์ไม่ถูกต้อง');
  const target = normalizeReviewSourceTarget({ section: query.get('section') || 'source', itemId: query.get('item'), pending: query.has('pending') });
  const findingId = query.get('finding') || '';
  if (findingId && !safeText(findingId, 1600)) throw new Error('รหัสรายการทบทวนในลิงก์ไม่ถูกต้อง');
  const hasReturn = ['return', 'reference', 'entry'].some(key => query.has(key));
  const returnContext = hasReturn ? normalizeReviewReturnContext({ view: query.get('return'), referenceId: query.get('reference'), entryId: query.get('entry') }) : null;
  return { sourceId, target, findingId, ...(returnContext ? { returnContext } : {}) };
}

export function resolveReviewSource(records, sourceId) {
  if (!safeText(sourceId, 200)) throw new Error('รหัสงานต้นทางไม่ถูกต้อง');
  const matches = (Array.isArray(records) ? records : []).filter(record => record?.id === sourceId);
  if (matches.length === 0) throw new Error('ไม่พบงานต้นทางนี้แล้ว กรุณาตรวจสมาชิกของชุดส่งตรวจ');
  if (matches.length !== 1) throw new Error('มีงานต้นทางใช้รหัสเดียวกันมากกว่าหนึ่งรายการ จึงยังเลือกเปิดงานให้ไม่ได้');
  return matches[0];
}

/** A failed draft write must keep the currently mounted editor available. */
export function preserveReviewSourceDraft(dirty, persist) {
  if (!dirty) return true;
  try { return persist() === true; } catch { return false; }
}
