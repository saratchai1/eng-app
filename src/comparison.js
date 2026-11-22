import { escapeHTML as e, format as f } from './utils.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fieldsOf = definition => definition.inputGroups.flatMap(group => group.fields);

/** Store inputs, not calculated answers, so restored comparisons use the current model. */
export function captureBaseline(definition, inputs, name, now = new Date().toISOString()) {
  const values = Object.fromEntries(fieldsOf(definition).map(field => [field.key, inputs[field.key]]));
  definition.calculate(values);
  return { schemaVersion: 1, toolId: definition.id, name: String(name || 'ค่าอ้างอิง A').slice(0, 80), capturedAt: now, inputs: values };
}

export function restoreBaseline(definition, value) {
  if (!object(value) || value.schemaVersion !== 1 || value.toolId !== definition.id || !object(value.inputs)) return null;
  if (!fieldsOf(definition).every(field => Object.hasOwn(value.inputs, field.key))) return null;
  if (typeof value.capturedAt !== 'string' || !Number.isFinite(Date.parse(value.capturedAt))) return null;
  try { return captureBaseline(definition, value.inputs, value.name, value.capturedAt); }
  catch { return null; }
}

export function compareCalculations(definition, baseline, currentInputs) {
  const reference = restoreBaseline(definition, baseline);
  if (!reference) throw new Error('ค่าอ้างอิง A ไม่ตรงกับขอบเขตของเครื่องมือนี้ กรุณาบันทึกค่า A ใหม่');
  const before = definition.calculate(reference.inputs);
  const after = definition.calculate(currentInputs);
  const rows = after.summary.map(item => {
    const previous = before.summary.find(row => row.label === item.label && (row.unit || '') === (item.unit || ''));
    const numeric = previous && Number.isFinite(previous.value) && Number.isFinite(item.value);
    const rawDelta = numeric ? item.value - previous.value : null;
    const delta = numeric && Math.abs(rawDelta) <= 1e-12 * Math.max(1, Math.abs(previous.value), Math.abs(item.value)) ? 0 : rawDelta;
    return { label: item.label, unit: item.unit || '', digits: item.digits ?? 2, before: previous?.value ?? null, after: item.value, delta, percent: numeric && previous.value !== 0 ? delta / Math.abs(previous.value) * 100 : null };
  });
  const changedInputs = fieldsOf(definition).filter(field => reference.inputs[field.key] !== currentInputs[field.key]).map(field => ({ ...field, before: reference.inputs[field.key], after: currentInputs[field.key] }));
  const checks = (after.checks || []).map(check => ({ ...check, before: before.checks?.find(row => row.label === check.label)?.pass ?? null }));
  return { rows, changedInputs, checks };
}

const valueText = (value, digits = 2) => value === null || value === undefined ? 'ไม่ประเมิน' : f(value, digits);
const deltaText = (value, digits = 3) => value === null ? '—' : (value > 0 ? '+' : '') + f(value, digits);
const statusText = value => value === true ? 'ผ่าน' : value === false ? 'ไม่ผ่าน' : 'ไม่ประเมิน';
const inputText = (field, value) => field.type === 'select' ? field.options.find(option => option.value === value)?.label || value : f(value, 5);

export function comparisonMarkup(definition, baseline, inputs, { report = false, valid = true } = {}) {
  const actions = report ? '' : '<div class="comparison-actions"><button type="button" class="button light compact" data-compare="capture" ' + (!valid ? 'disabled' : '') + '>บันทึกค่าปัจจุบันเป็น A</button>' + (baseline ? '<button type="button" class="button light compact" data-compare="restore">คืนค่า A</button><button type="button" class="link-button" data-compare="clear">ล้างค่า A</button>' : '') + '</div>';
  if (!baseline) return report ? '' : '<section class="comparison-panel comparison-empty" aria-label="เปรียบเทียบค่าคำนวณ"><div><span class="comparison-kicker">COMPARE OPTIONS</span><h3>ลองปรับ แล้วเทียบให้เห็น</h3><p>เก็บค่าชุดนี้เป็น A แล้วปรับข้อมูล เพื่อดูผลต่างพร้อมกัน</p></div>' + actions + '</section>';
  let comparison;
  try { comparison = valid ? compareCalculations(definition, baseline, inputs) : null; } catch { comparison = null; }
  const caption = '<div class="comparison-title"><div><span class="comparison-kicker">A ↔ CURRENT</span><h3>ค่าฐาน A กับค่าปัจจุบัน</h3><p>ค่า A: ' + e(baseline.name) + '</p></div>' + actions + '</div>';
  if (!comparison) return '<section class="comparison-panel" aria-label="เปรียบเทียบค่าคำนวณ">' + caption + '<p class="comparison-note">เก็บค่า A ไว้แล้ว กรอกข้อมูลปัจจุบันให้ครบเพื่อดูผลต่าง</p></section>';
  const table = '<div class="table-scroll"><table class="comparison-table"><thead><tr><th>ผลลัพธ์ / หน่วย</th><th>ค่า A</th><th>ปัจจุบัน</th><th>ผลต่าง</th></tr></thead><tbody>' + comparison.rows.map(row => '<tr><th scope="row">' + e(row.label) + '<small>' + e(row.unit) + '</small></th><td>' + e(valueText(row.before, row.digits)) + '</td><td><strong>' + e(valueText(row.after, row.digits)) + '</strong></td><td>' + e(deltaText(row.delta, Math.max(row.digits, 3))) + (row.delta !== null && row.unit === '%' ? '<small>จุดเปอร์เซ็นต์</small>' : '') + (row.percent === null ? '' : '<small>' + e(deltaText(row.percent, 2)) + '% เทียบ A</small>') + '</td></tr>').join('') + '</tbody></table></div>';
  const changes = comparison.changedInputs.length ? '<div class="comparison-inputs"><strong>ปรับข้อมูล ' + comparison.changedInputs.length + ' รายการ</strong><ul>' + comparison.changedInputs.map(field => '<li><span>' + e(field.label) + '</span><span>' + e(inputText(field, field.before)) + ' → <b>' + e(inputText(field, field.after)) + '</b> ' + e(field.unit || '') + '</span></li>').join('') + '</ul></div>' : '<p class="comparison-note">ข้อมูลปัจจุบันเหมือนค่า A</p>';
  const checks = comparison.checks.length ? '<div class="comparison-checks">' + comparison.checks.map(check => '<div><span>' + e(check.label) + '</span><span class="comparison-status ' + (check.pass === true ? 'is-pass' : check.pass === false ? 'is-fail' : '') + '">' + statusText(check.before) + ' → ' + statusText(check.pass) + '</span></div>').join('') + '</div>' : '';
  return '<section class="comparison-panel" aria-label="เปรียบเทียบค่าคำนวณ">' + caption + table + changes + checks + '<p class="comparison-note">ผลต่าง = ปัจจุบัน − A · % เทียบกับขนาดของค่า A; ไม่แสดง % เมื่อ A = 0 · ค่าที่เพิ่มขึ้นไม่ได้หมายถึงผลที่ดีขึ้นเสมอ</p></section>';
}
