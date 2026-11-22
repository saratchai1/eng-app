const SECTIONS = new Set(['results', 'review', 'revisions', 'document', 'source']);
const safeText = (value, limit) => typeof value === 'string' && value.length > 0 && value.length <= limit && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);

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

export function reviewSourceHash(sourceId, target = {}, findingId = '') {
  if (!safeText(sourceId, 200)) throw new Error('รหัสงานต้นทางไม่ถูกต้อง');
  if (findingId && !safeText(findingId, 1600)) throw new Error('รหัสรายการทบทวนไม่ถูกต้อง');
  const normalized = normalizeReviewSourceTarget(target);
  const query = new URLSearchParams({ section: normalized.section });
  if (normalized.itemId) query.set('item', normalized.itemId);
  if (normalized.pending) query.set('pending', '1');
  if (findingId) query.set('finding', findingId);
  return '#review-source/' + encodeURIComponent(sourceId) + '?' + query.toString();
}

export function parseReviewSourceHash(hash) {
  if (typeof hash !== 'string') throw new Error('ลิงก์งานต้นทางไม่ถูกต้อง');
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!value.startsWith('review-source/')) return null;
  if (value.length > 6500) throw new Error('ลิงก์งานต้นทางยาวเกินขอบเขต');
  const tail = value.slice('review-source/'.length), separator = tail.indexOf('?');
  let sourceId;
  try { sourceId = decodeURIComponent(separator < 0 ? tail : tail.slice(0, separator)); }
  catch { throw new Error('อ่านรหัสงานต้นทางจากลิงก์ไม่ได้'); }
  if (!safeText(sourceId, 200)) throw new Error('รหัสงานต้นทางในลิงก์ไม่ถูกต้อง');
  const query = new URLSearchParams(separator < 0 ? '' : tail.slice(separator + 1));
  for (const key of query.keys()) {
    if (!['section', 'item', 'pending', 'finding'].includes(key) || query.getAll(key).length !== 1) throw new Error('ตัวเลือกในลิงก์งานต้นทางไม่ถูกต้อง');
  }
  if (query.has('pending') && query.get('pending') !== '1') throw new Error('ตัวเลือกร่างตรวจทานในลิงก์ไม่ถูกต้อง');
  const target = normalizeReviewSourceTarget({ section: query.get('section') || 'source', itemId: query.get('item'), pending: query.has('pending') });
  const findingId = query.get('finding') || '';
  if (findingId && !safeText(findingId, 1600)) throw new Error('รหัสรายการทบทวนในลิงก์ไม่ถูกต้อง');
  return { sourceId, target, findingId };
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
