/** Browser-local engineering workflows. Prices and project records are examples. */
const MAX_ROWS = 200;
const MAX_TASKS = 120;
const MAX_PHOTOS = 8;
const MAX_PHOTO_CHARS = 1_500_000;
const VALID_STATUSES = new Set(['pending', 'pass', 'fail', 'na']);
const BOQ_IDS = new Set(['boq-building', 'boq-road', 'boq-irrigation', 'boq-warehouse', 'price-book']);
const TITLES = {
  'boq-building': 'ประมาณราคางานอาคาร', 'boq-road': 'ประมาณราคางานทาง',
  'boq-irrigation': 'ประมาณราคางานชลประทาน', 'boq-warehouse': 'ประมาณราคางานโกดัง',
  'price-book': 'คลังราคาวัสดุและค่าแรง', planning: 'วางแผนงานก่อสร้าง', inspection: 'ตรวจรับบ้านและอาคาร',
};
const numberFormat = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const moneyFormat = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = value => moneyFormat.format(value);
const fmt = value => numberFormat.format(value);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = value => JSON.parse(JSON.stringify(value));
const text = (value, fallback = '', max = 1000) => typeof value === 'string' ? value.slice(0, max) : fallback;
const numericValue = (value, fallback) => typeof value === 'number' || typeof value === 'string' ? value : fallback;
const uid = prefix => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function requireNumber(value, label, { min = 0, max = 1e12, integer = false } = {}) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) {
    throw new Error(`${label}: กรุณากรอกตัวเลข`);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw new Error(`${label}: ต้องเป็น${integer ? 'จำนวนเต็ม' : 'ตัวเลข'}ระหว่าง ${min} ถึง ${max}`);
  }
  return n;
}

/** Prefix user text that could otherwise become a spreadsheet formula. */
export function toCSV(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    const raw = String(value ?? '');
    const safe = typeof value === 'string' && /^[\s]*[=+@\-]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
}

function downloadCSV(filename, rows) {
  const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const PRESETS = {
  'boq-building': [
    ['คอนกรีตฐานราก', 'ลบ.ม.', 18, 2300, 450],
    ['เหล็กเสริม SD40', 'กก.', 2400, 25, 6],
    ['แบบหล่อคอนกรีต', 'ตร.ม.', 160, 180, 150],
    ['ผนังก่ออิฐมวลเบา', 'ตร.ม.', 280, 280, 160],
    ['ฉาบปูนผนัง', 'ตร.ม.', 560, 75, 95],
  ],
  'boq-road': [
    ['งานขุดดินและขนทิ้ง', 'ลบ.ม.', 450, 0, 95],
    ['วัสดุรองพื้นทาง', 'ลบ.ม.', 220, 420, 85],
    ['หินคลุกพื้นทาง', 'ลบ.ม.', 150, 630, 110],
    ['ผิวทางแอสฟัลต์คอนกรีต', 'ตัน', 180, 2350, 400],
    ['สีตีเส้นจราจร', 'ตร.ม.', 70, 240, 90],
  ],
  'boq-irrigation': [
    ['ขุดดินคลอง', 'ลบ.ม.', 650, 0, 75],
    ['คอนกรีตดาดคลอง', 'ลบ.ม.', 48, 2250, 500],
    ['เหล็กเสริมตะแกรง', 'กก.', 1600, 25, 6],
    ['แบบหล่อข้างคลอง', 'ตร.ม.', 120, 190, 160],
    ['รอยต่อและวัสดุอุดรอยต่อ', 'เมตร', 80, 130, 50],
  ],
  'boq-warehouse': [
    ['โครงสร้างเหล็กรูปพรรณ', 'กก.', 18000, 37, 14],
    ['แผ่นหลังคาเมทัลชีท', 'ตร.ม.', 950, 320, 110],
    ['คอนกรีตพื้นบนดิน', 'ลบ.ม.', 150, 2400, 450],
    ['ตะแกรงเหล็กเสริมพื้น', 'กก.', 4500, 25, 5],
    ['งานทาสีกันสนิม', 'ตร.ม.', 680, 85, 70],
  ],
  'price-book': [
    ['คอนกรีตผสมเสร็จ (ระบุเกรดตามโครงการ)', 'ลบ.ม.', 1, 2300, 450],
    ['เหล็กข้ออ้อย SD40', 'กก.', 1, 25, 6],
    ['อิฐมวลเบา หนา 7.5 ซม.', 'ตร.ม.', 1, 280, 160],
    ['กระเบื้องพื้น', 'ตร.ม.', 1, 350, 220],
    ['สีอะคริลิกผนัง', 'ตร.ม.', 1, 65, 55],
  ],
};

export function normalizeBoqState(source, toolId = 'boq-building') {
  const defaults = PRESETS[toolId] || PRESETS['boq-building'];
  const sourceObject = source && typeof source === 'object' && !Array.isArray(source) ? source : null;
  const rows = Array.isArray(sourceObject?.rows) ? sourceObject.rows.slice(0, MAX_ROWS) : defaults.map((row, i) => ({ id: `R${i + 1}`, name: row[0], unit: row[1], quantity: row[2], material: row[3], labor: row[4] }));
  return {
    version: 1,
    rows: rows.map((row, i) => ({
      id: text(row?.id, `R${i + 1}`, 40), name: text(row?.name, 'รายการใหม่', 180), unit: text(row?.unit, 'หน่วย', 30),
      quantity: toolId === 'price-book' ? 1 : numericValue(row?.quantity, 1), material: numericValue(row?.material, 0), labor: numericValue(row?.labor, 0),
    })),
    overhead: toolId === 'price-book' ? 0 : numericValue(sourceObject?.overhead, 10),
    vat: toolId === 'price-book' ? 0 : numericValue(sourceObject?.vat, 7),
    notes: text(sourceObject?.notes, 'ข้อมูลตัวอย่างสำหรับทดลอง ต้องตรวจปริมาณและแทนราคาจริงของโครงการก่อนใช้งาน', 3000),
  };
}

export function calculateBoq(state) {
  if (!state || !Array.isArray(state.rows) || state.rows.length > MAX_ROWS) throw new Error('รูปแบบรายการ BOQ ไม่ถูกต้อง');
  const overhead = requireNumber(state.overhead, 'ค่าอำนวยการและกำไร (%)', { max: 1000 });
  const vat = requireNumber(state.vat, 'VAT (%)', { max: 100 });
  const rows = state.rows.map((row, index) => {
    if (!row || !text(row.name).trim()) throw new Error(`รายการ ${index + 1}: กรุณากรอกชื่องาน`);
    if (!text(row.unit).trim()) throw new Error(`รายการ ${index + 1}: กรุณากรอกหน่วย`);
    const quantity = requireNumber(row.quantity, `ปริมาณ รายการ ${index + 1}`, { max: 1e9 });
    const material = requireNumber(row.material, `ราคาวัสดุ รายการ ${index + 1}`, { max: 1e9 });
    const labor = requireNumber(row.labor, `ค่าแรง รายการ ${index + 1}`, { max: 1e9 });
    return { ...row, quantity, material, labor, materialTotal: quantity * material, laborTotal: quantity * labor, total: quantity * (material + labor) };
  });
  const material = rows.reduce((sum, row) => sum + row.materialTotal, 0);
  const labor = rows.reduce((sum, row) => sum + row.laborTotal, 0);
  const direct = material + labor;
  const overheadAmount = direct * overhead / 100;
  const beforeVat = direct + overheadAmount;
  const vatAmount = beforeVat * vat / 100;
  const total = beforeVat + vatAmount;
  if (![direct, total].every(Number.isFinite)) throw new Error('ยอดรวมเกินขอบเขตการคำนวณ');
  return { rows, material, labor, direct, overhead, overheadAmount, beforeVat, vat, vatAmount, total };
}

function card(label, value, unit = '', variant = '') {
  return `<div class="wf-stat ${variant}"><span>${esc(label)}</span><strong>${esc(value)}${unit ? `<small>${esc(unit)}</small>` : ''}</strong></div>`;
}

function errorHTML(error) { return `<p class="wf-error" role="alert">${esc(error.message || error)}</p>`; }
function input(label, value, attrs = '') { return `<input aria-label="${esc(label)}" value="${esc(value)}" ${attrs}>`; }
function contextOf(context) {
  return { onChange: typeof context?.onChange === 'function' ? context.onChange : () => {}, notify: typeof context?.notify === 'function' ? context.notify : () => {} };
}

function mountBoq(container, toolId, initialState, context) {
  let state = normalizeBoqState(initialState, toolId);
  const priceBook = toolId === 'price-book';
  const ctx = contextOf(context);
  function renderRows() {
    container.querySelector('[data-wf-rows]').innerHTML = state.rows.map((row, i) => `<tr>
      <td class="wf-row-number">${i + 1}</td>
      <td>${input(`ชื่องาน รายการ ${i + 1}`, row.name, `data-wf-field="name" data-index="${i}" maxlength="180" class="wf-name-input"`)}</td>
      <td>${input(`หน่วย รายการ ${i + 1}`, row.unit, `data-wf-field="unit" data-index="${i}" maxlength="30" class="wf-unit-input"`)}</td>
      ${priceBook ? '' : `<td>${input(`ปริมาณ รายการ ${i + 1}`, row.quantity, `type="number" min="0" step="any" data-wf-field="quantity" data-index="${i}" class="wf-number-input"`)}</td>`}
      <td>${input(`ราคาวัสดุ รายการ ${i + 1}`, row.material, `type="number" min="0" step="any" data-wf-field="material" data-index="${i}" class="wf-number-input"`)}</td>
      <td>${input(`ค่าแรง รายการ ${i + 1}`, row.labor, `type="number" min="0" step="any" data-wf-field="labor" data-index="${i}" class="wf-number-input"`)}</td>
      <td class="wf-money" data-wf-total="${i}">—</td>
      <td><button type="button" class="wf-icon-button" data-wf-action="delete" data-index="${i}" aria-label="ลบรายการ ${i + 1}">×</button></td>
    </tr>`).join('') || `<tr><td colspan="8" class="wf-empty">ยังไม่มีรายการ กด “เพิ่มรายการ” เพื่อเริ่มต้น</td></tr>`;
  }
  function refresh() {
    const error = container.querySelector('[data-wf-errors]');
    try {
      const result = calculateBoq(state);
      error.innerHTML = '';
      container.querySelector('[data-wf-summary]').innerHTML = priceBook
        ? card('รายการในคลัง', result.rows.length, 'รายการ') + card('ราคา', 'กำหนดเอง') + card('ข้อมูล', 'ตัวอย่าง', '', 'wf-warm')
        : card('ค่าวัสดุ', money(result.material), 'บาท') + card('ค่าแรง', money(result.labor), 'บาท') + card('ต้นทุนตรง', money(result.direct), 'บาท') + card('รวมค่าอำนวยการ + VAT', money(result.total), 'บาท', 'wf-emphasis');
      result.rows.forEach((row, i) => { const cell = container.querySelector(`[data-wf-total="${i}"]`); if (cell) cell.textContent = money(priceBook ? row.material + row.labor : row.total); });
      const breakdown = container.querySelector('[data-wf-breakdown]');
      if (breakdown) breakdown.innerHTML = `<span>ต้นทุนตรง <b>${money(result.direct)}</b></span><span>ค่าอำนวยการและกำไร ${fmt(result.overhead)}% <b>${money(result.overheadAmount)}</b></span><span>VAT ${fmt(result.vat)}% ของยอดหลังบวกค่าอำนวยการ <b>${money(result.vatAmount)}</b></span><span class="wf-total-line">รวมทั้งสิ้น <b>${money(result.total)} บาท</b></span>`;
    } catch (e) {
      error.innerHTML = errorHTML(e);
      container.querySelector('[data-wf-summary]').innerHTML = card('ตรวจข้อมูล', 'คำนวณไม่ได้', '', 'wf-warm');
      container.querySelectorAll('[data-wf-total]').forEach(cell => { cell.textContent = '—'; });
      const breakdown = container.querySelector('[data-wf-breakdown]'); if (breakdown) breakdown.innerHTML = '';
    }
  }
  container.innerHTML = `<div class="wf-workspace">
    <div class="wf-notice"><b>${priceBook ? 'คลังราคาที่คุณกำหนดเอง' : 'แบบประมาณราคาของโครงการ'}</b> · ราคาที่ใส่ไว้เป็นตัวอย่าง ${priceBook ? 'ไม่มีการดึงราคาออนไลน์' : 'ค่าอำนวยการนี้เป็นเปอร์เซ็นต์ที่กรอกเอง ไม่ใช่ Factor F หรือแบบฟอร์มรับรองของราชการ'}</div>
    <div class="wf-stats" data-wf-summary aria-live="polite"></div><div data-wf-errors></div>
    <div class="wf-panel"><div class="wf-panel-head"><div><h3>${priceBook ? 'ราคาต่อหน่วย' : 'รายการปริมาณและราคา'}</h3><p>แก้ไขตัวเลขในตาราง ยอดรวมจะคำนวณทันที</p></div><div class="wf-actions"><button type="button" data-wf-action="csv" class="wf-button">ส่งออก CSV</button><button type="button" data-wf-action="add" class="wf-button wf-primary">+ เพิ่มรายการ</button></div></div>
    <div class="wf-scroll"><table class="wf-table wf-boq-table"><thead><tr><th>#</th><th>รายการงาน / วัสดุ</th><th>หน่วย</th>${priceBook ? '' : '<th>ปริมาณ</th>'}<th>วัสดุ/หน่วย (บาท)</th><th>แรง/หน่วย (บาท)</th><th>${priceBook ? 'รวม/หน่วย' : 'รวม (บาท)'}</th><th></th></tr></thead><tbody data-wf-rows></tbody></table></div>
    ${priceBook ? '' : `<div class="wf-cost-footer"><div class="wf-inline-fields"><label>ค่าอำนวยการและกำไร (%)${input('ค่าอำนวยการและกำไร (%)', state.overhead, 'type="number" min="0" max="1000" step="any" data-wf-setting="overhead"')}</label><label>VAT (%)${input('VAT (%)', state.vat, 'type="number" min="0" max="100" step="any" data-wf-setting="vat"')}</label></div><div class="wf-breakdown" data-wf-breakdown></div></div>`}
    </div><label class="wf-notes-label">แหล่งราคา / ข้อสมมติ / หมายเหตุ<textarea data-wf-setting="notes" rows="3" maxlength="3000">${esc(state.notes)}</textarea></label>
    <p class="wf-caption">หน่วยเงิน: บาท · คำนวณจากค่าที่กรอกเต็มความละเอียด แสดงผลทศนิยม 2 ตำแหน่ง · ข้อมูลเก็บในเบราว์เซอร์เมื่อบันทึกโครงการ</p>
  </div>`;
  renderRows(); refresh();
  function onInput(event) {
    const el = event.target;
    if (el.dataset.wfField) {
      const row = state.rows[Number(el.dataset.index)]; if (!row) return;
      row[el.dataset.wfField] = el.value;
    } else if (el.dataset.wfSetting) { state[el.dataset.wfSetting] = el.value; }
    else return;
    refresh(); ctx.onChange();
  }
  function onClick(event) {
    const button = event.target.closest('[data-wf-action]'); if (!button) return;
    const action = button.dataset.wfAction;
    if (action === 'add') {
      if (state.rows.length >= MAX_ROWS) return ctx.notify(`เพิ่มได้ไม่เกิน ${MAX_ROWS} รายการ`);
      state.rows.push({ id: uid('R'), name: 'รายการใหม่', unit: 'หน่วย', quantity: 1, material: 0, labor: 0 });
      renderRows(); refresh(); ctx.onChange();
      container.querySelector(`[data-wf-field="name"][data-index="${state.rows.length - 1}"]`)?.focus();
    } else if (action === 'delete') { state.rows.splice(Number(button.dataset.index), 1); renderRows(); refresh(); ctx.onChange(); }
    else if (action === 'csv') {
      try {
        const result = calculateBoq(state);
        const rows = [[TITLES[toolId]], ['หมายเหตุ', 'ราคาและปริมาณตัวอย่าง / กรอกเอง ไม่ใช่ราคาสดหรือแบบฟอร์มรับรอง'], ['แหล่งราคา / ข้อสมมติ', state.notes], [],
          ['รายการ', 'หน่วย', 'ปริมาณ', 'ค่าวัสดุ/หน่วย', 'ค่าแรง/หน่วย', 'รวม']];
        result.rows.forEach(row => rows.push([row.name, row.unit, priceBook ? 1 : row.quantity, row.material, row.labor, priceBook ? row.material + row.labor : row.total]));
        if (!priceBook) rows.push([], ['ต้นทุนตรง', result.direct], ['ค่าอำนวยการและกำไร (%)', result.overhead], ['ค่าอำนวยการและกำไร (บาท)', result.overheadAmount], ['VAT (%)', result.vat], ['VAT (บาท)', result.vatAmount], ['รวมทั้งสิ้น', result.total]);
        downloadCSV(`${toolId}.csv`, rows); ctx.notify('ส่งออก CSV แล้ว เปิดด้วย Excel ได้');
      } catch (e) { ctx.notify(e.message); }
    }
  }
  container.addEventListener('input', onInput); container.addEventListener('click', onClick);
  return {
    getState: () => clone(state),
    getReport: () => {
      try {
        const r = calculateBoq(state);
        return `<section class="wf-report"><h2>${esc(TITLES[toolId])}</h2><p>ราคาและปริมาณตัวอย่าง/กรอกเอง ไม่ใช่ราคาสดหรือแบบรับรองทางราชการ</p><table><thead><tr><th>รายการ</th><th>หน่วย</th><th>ปริมาณ</th><th>วัสดุ/หน่วย</th><th>แรง/หน่วย</th><th>รวม บาท</th></tr></thead><tbody>${r.rows.map(row => `<tr><td>${esc(row.name)}</td><td>${esc(row.unit)}</td><td>${fmt(priceBook ? 1 : row.quantity)}</td><td>${money(row.material)}</td><td>${money(row.labor)}</td><td>${money(priceBook ? row.material + row.labor : row.total)}</td></tr>`).join('')}</tbody></table>${priceBook ? '' : `<p>ต้นทุนตรง ${money(r.direct)} บาท<br>ค่าอำนวยการและกำไร ${fmt(r.overhead)}% = ${money(r.overheadAmount)} บาท<br>VAT ${fmt(r.vat)}% ของยอดหลังบวกค่าอำนวยการ = ${money(r.vatAmount)} บาท</p><h3>รวมทั้งสิ้น ${money(r.total)} บาท</h3><p>สูตร: ยอดรวม = Σ[ปริมาณ × (วัสดุ/หน่วย + แรง/หน่วย)] × (1 + ค่าอำนวยการ/100) × (1 + VAT/100)</p>`}<p>แหล่งราคา / ข้อสมมติ: ${esc(state.notes)}</p><p>ใช้ค่าที่ไม่ปัดเศษในการรวม แสดงทศนิยม 2 ตำแหน่ง</p></section>`;
      } catch (e) { return errorHTML(e); }
    },
    destroy: () => { container.removeEventListener('input', onInput); container.removeEventListener('click', onClick); },
  };
}

const DEFAULT_TASKS = [
  { id: 'T1', name: 'เตรียมพื้นที่และวางผัง', duration: 5, predecessors: '', progress: 100, budget: 50000 },
  { id: 'T2', name: 'งานฐานราก', duration: 12, predecessors: 'T1', progress: 65, budget: 280000 },
  { id: 'T3', name: 'งานโครงสร้าง', duration: 20, predecessors: 'T2', progress: 0, budget: 600000 },
  { id: 'T4', name: 'ระบบไฟฟ้าและสุขาภิบาล', duration: 14, predecessors: 'T3', progress: 0, budget: 180000 },
  { id: 'T5', name: 'งานสถาปัตยกรรม', duration: 18, predecessors: 'T3', progress: 0, budget: 300000 },
  { id: 'T6', name: 'ทดสอบและส่งมอบ', duration: 4, predecessors: 'T4,T5', progress: 0, budget: 40000 },
];

function parseDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('กรุณาระบุวันเริ่มโครงการ');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('วันเริ่มโครงการไม่ถูกต้อง');
  return parsed;
}
function offsetDate(date, days) {
  const d = parseDate(date); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
function dateTH(date) { return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parseDate(date)); }

export function normalizePlanningState(source) {
  const raw = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const rows = Array.isArray(raw.tasks) ? raw.tasks.slice(0, MAX_TASKS) : DEFAULT_TASKS;
  return {
    version: 1, startDate: text(raw.startDate, '2026-11-23', 10),
    tasks: rows.map((task, index) => ({
      id: text(task?.id, `T${index + 1}`, 20), name: text(task?.name, 'กิจกรรมใหม่', 180),
      duration: numericValue(task?.duration, 1),
      predecessors: Array.isArray(task?.predecessors) ? task.predecessors.filter(p => typeof p === 'string').join(',').slice(0, 2000) : text(task?.predecessors, '', 2000),
      progress: numericValue(task?.progress, 0), budget: numericValue(task?.budget, 0),
    })), notes: text(raw.notes, 'ตัวอย่างแผนงาน ใช้วันปฏิทินและความสัมพันธ์ Finish-to-Start แบบไม่มี lag', 3000),
  };
}

/** Activity-on-node CPM with Finish-to-Start dependencies and calendar-day durations. */
export function analyzeSchedule(state) {
  parseDate(state?.startDate);
  if (!Array.isArray(state.tasks) || !state.tasks.length || state.tasks.length > MAX_TASKS) throw new Error(`ต้องมีกิจกรรม 1–${MAX_TASKS} รายการ`);
  const byId = new Map();
  const tasks = state.tasks.map((task, index) => {
    const id = text(task?.id).trim();
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(id)) throw new Error(`รหัสกิจกรรม ${index + 1}: ใช้ตัวอักษรอังกฤษ ตัวเลข _ หรือ -`);
    if (byId.has(id)) throw new Error(`รหัสกิจกรรม ${id} ซ้ำกัน`);
    if (!text(task?.name).trim()) throw new Error(`กิจกรรม ${id}: กรุณากรอกชื่อ`);
    const predecessors = [...new Set(text(task.predecessors).split(/[,;\s]+/).filter(Boolean))];
    const result = { id, name: task.name, duration: requireNumber(task.duration, `ระยะเวลา ${id}`, { min: 1, max: 3650, integer: true }), predecessors,
      progress: requireNumber(task.progress, `ความก้าวหน้า ${id}`, { max: 100 }), budget: requireNumber(task.budget, `งบประมาณ ${id}`), successors: [], es: 0, ef: 0, ls: 0, lf: 0, float: 0, critical: false };
    byId.set(id, result); return result;
  });
  for (const task of tasks) {
    for (const parentId of task.predecessors) {
      if (!byId.has(parentId)) throw new Error(`กิจกรรม ${task.id}: ไม่พบกิจกรรมก่อนหน้า ${parentId}`);
      if (parentId === task.id) throw new Error(`กิจกรรม ${task.id} อ้างอิงตัวเอง`);
      byId.get(parentId).successors.push(task.id);
    }
  }
  const incoming = new Map(tasks.map(task => [task.id, task.predecessors.length]));
  const queue = tasks.filter(task => !task.predecessors.length).map(task => task.id);
  const order = [];
  while (queue.length) {
    const task = byId.get(queue.shift()); order.push(task);
    task.es = Math.max(0, ...task.predecessors.map(id => byId.get(id).ef)); task.ef = task.es + task.duration;
    for (const id of task.successors) { incoming.set(id, incoming.get(id) - 1); if (!incoming.get(id)) queue.push(id); }
  }
  if (order.length !== tasks.length) throw new Error('ความสัมพันธ์ของกิจกรรมเป็นวงจร กรุณาแก้รายการกิจกรรมก่อนหน้า');
  const duration = Math.max(...tasks.map(task => task.ef));
  for (const task of [...order].reverse()) {
    task.lf = task.successors.length ? Math.min(...task.successors.map(id => byId.get(id).ls)) : duration;
    task.ls = task.lf - task.duration; task.float = task.ls - task.es; task.critical = task.float === 0;
  }
  const totalBudget = tasks.reduce((sum, task) => sum + task.budget, 0);
  const weight = task => totalBudget > 0 ? task.budget : task.duration;
  const totalWeight = tasks.reduce((sum, task) => sum + weight(task), 0);
  const weightedProgress = tasks.reduce((sum, task) => sum + weight(task) * task.progress, 0) / totalWeight;
  return { tasks, duration, totalBudget, weightedProgress, weightMode: totalBudget > 0 ? 'budget' : 'duration', startDate: state.startDate, endDate: offsetDate(state.startDate, duration - 1), criticalTaskIds: tasks.filter(task => task.critical).map(task => task.id) };
}

function ganttHTML(result) {
  const marks = Array.from({ length: 6 }, (_, i) => `<span>${Math.round(result.duration * i / 5)}</span>`).join('');
  return `<div class="wf-gantt-scroll"><div class="wf-gantt"><div class="wf-gantt-head"><span>กิจกรรม</span><div>${marks}</div></div>${result.tasks.map(task => `<div class="wf-gantt-row"><span title="${esc(task.name)}">${esc(task.id)} · ${esc(task.name)}</span><div class="wf-gantt-track"><div class="wf-gantt-bar ${task.critical ? 'wf-critical' : ''}" style="left:${task.es / result.duration * 100}%;width:${task.duration / result.duration * 100}%" title="${esc(`${task.name}: ${task.duration} วัน, float ${task.float} วัน`)}"><i style="width:${task.progress}%"></i><b>${task.duration} วัน</b></div></div></div>`).join('')}</div></div><div class="wf-legend"><span><i class="wf-critical-key"></i>กิจกรรมวิกฤต (Float = 0)</span><span><i class="wf-normal-key"></i>กิจกรรมที่มีเวลาสำรอง</span><span>สีเข้มในแถบ = ความก้าวหน้าที่กรอก</span></div>`;
}

function mountPlanning(container, initialState, context) {
  let state = normalizePlanningState(initialState);
  const ctx = contextOf(context);
  function renderRows() {
    container.querySelector('[data-wf-task-rows]').innerHTML = state.tasks.map((task, i) => `<tr>
      <td>${input(`รหัสกิจกรรม ${i + 1}`, task.id, `data-wf-task="id" data-index="${i}" maxlength="20" class="wf-task-id"`)}</td>
      <td>${input(`ชื่อกิจกรรม ${i + 1}`, task.name, `data-wf-task="name" data-index="${i}" maxlength="180" class="wf-name-input"`)}</td>
      <td>${input(`ระยะเวลา ${task.id}`, task.duration, `type="number" min="1" max="3650" step="1" data-wf-task="duration" data-index="${i}" class="wf-small-input"`)}</td>
      <td>${input(`กิจกรรมก่อนหน้า ${task.id}`, task.predecessors, `data-wf-task="predecessors" data-index="${i}" maxlength="2000" placeholder="เช่น T1,T2" class="wf-pred-input"`)}</td>
      <td>${input(`ความก้าวหน้า ${task.id}`, task.progress, `type="number" min="0" max="100" step="any" data-wf-task="progress" data-index="${i}" class="wf-small-input"`)}</td>
      <td>${input(`งบประมาณ ${task.id}`, task.budget, `type="number" min="0" step="any" data-wf-task="budget" data-index="${i}" class="wf-number-input"`)}</td>
      <td class="wf-money" data-wf-float="${i}">—</td>
      <td><button type="button" class="wf-icon-button" data-wf-action="delete-task" data-index="${i}" aria-label="ลบกิจกรรม ${esc(task.id)}">×</button></td>
    </tr>`).join('') || '<tr><td colspan="8" class="wf-empty">เพิ่มกิจกรรมเพื่อเริ่มวางแผน</td></tr>';
  }
  function refresh() {
    const errors = container.querySelector('[data-wf-errors]');
    try {
      const r = analyzeSchedule(state); errors.innerHTML = '';
      container.querySelector('[data-wf-summary]').innerHTML = card('ระยะเวลาโครงการ', r.duration, 'วัน') + card('วันเสร็จตามแผน', dateTH(r.endDate)) + card('งบประมาณรวม', money(r.totalBudget), 'บาท') + card('ความก้าวหน้าถ่วงน้ำหนัก', fmt(r.weightedProgress), '%', 'wf-emphasis');
      container.querySelector('[data-wf-chart]').innerHTML = ganttHTML(r);
      container.querySelector('[data-wf-schedule-note]').textContent = `ถ่วงน้ำหนักด้วย${r.weightMode === 'budget' ? 'งบประมาณแต่ละกิจกรรม' : 'ระยะเวลา เนื่องจากงบประมาณทุกกิจกรรมเป็นศูนย์'} · กิจกรรมวิกฤต: ${r.criticalTaskIds.join(', ')} · จุด 0 คือวันเริ่มโครงการ`;
      r.tasks.forEach((task, i) => { const el = container.querySelector(`[data-wf-float="${i}"]`); if (el) { el.textContent = `${task.float} วัน`; el.classList.toggle('wf-critical-text', task.critical); } });
    } catch (e) {
      errors.innerHTML = errorHTML(e); container.querySelector('[data-wf-summary]').innerHTML = card('ตรวจแผนงาน', 'คำนวณไม่ได้', '', 'wf-warm');
      container.querySelector('[data-wf-chart]').innerHTML = '<div class="wf-empty">แก้ไขข้อมูลด้านบนเพื่อสร้างแผน Gantt</div>';
      container.querySelector('[data-wf-schedule-note]').textContent = '';
      container.querySelectorAll('[data-wf-float]').forEach(el => { el.textContent = '—'; });
    }
  }
  container.innerHTML = `<div class="wf-workspace"><div class="wf-notice"><b>แผน Gantt + Critical Path</b> · ใช้วันปฏิทิน ความสัมพันธ์ Finish-to-Start แบบไม่มี lag และไม่มีข้อจำกัดทรัพยากร</div>
    <div class="wf-stats" data-wf-summary aria-live="polite"></div><div data-wf-errors></div>
    <div class="wf-panel"><div class="wf-panel-head"><div><h3>กิจกรรมของโครงการ</h3><p>ใส่รหัสกิจกรรมก่อนหน้า คั่นด้วยจุลภาค เช่น T1,T2</p></div><div class="wf-actions"><button type="button" data-wf-action="csv" class="wf-button">ส่งออก CSV</button><button type="button" data-wf-action="add-task" class="wf-button wf-primary">+ เพิ่มกิจกรรม</button></div></div>
    <label class="wf-date-label">วันเริ่มโครงการ${input('วันเริ่มโครงการ', state.startDate, 'type="date" data-wf-setting="startDate"')}</label>
    <div class="wf-scroll"><table class="wf-table wf-planning-table"><thead><tr><th>รหัส</th><th>กิจกรรม</th><th>วัน</th><th>กิจกรรมก่อนหน้า</th><th>สำเร็จ %</th><th>งบประมาณ</th><th>Float</th><th></th></tr></thead><tbody data-wf-task-rows></tbody></table></div></div>
    <div class="wf-panel"><div class="wf-panel-head"><div><h3>ภาพรวมแผนงาน</h3><p>ตำแหน่งแถบคำนวณจากกิจกรรมก่อนหน้าโดยอัตโนมัติ</p></div></div><div data-wf-chart></div><p class="wf-caption" data-wf-schedule-note></p></div>
    <label class="wf-notes-label">หมายเหตุของแผน<textarea data-wf-setting="notes" rows="3" maxlength="3000">${esc(state.notes)}</textarea></label>
  </div>`;
  renderRows(); refresh();
  function onInput(event) {
    const el = event.target;
    if (el.dataset.wfTask) { const task = state.tasks[Number(el.dataset.index)]; if (!task) return; task[el.dataset.wfTask] = el.value; }
    else if (el.dataset.wfSetting) state[el.dataset.wfSetting] = el.value;
    else return;
    refresh(); ctx.onChange();
  }
  function onClick(event) {
    const button = event.target.closest('[data-wf-action]'); if (!button) return;
    if (button.dataset.wfAction === 'add-task') {
      if (state.tasks.length >= MAX_TASKS) return ctx.notify(`รองรับไม่เกิน ${MAX_TASKS} กิจกรรม`);
      let i = state.tasks.length + 1; while (state.tasks.some(task => task.id === `T${i}`)) i++;
      state.tasks.push({ id: `T${i}`, name: 'กิจกรรมใหม่', duration: 5, predecessors: '', progress: 0, budget: 0 });
      renderRows(); refresh(); ctx.onChange();
    } else if (button.dataset.wfAction === 'delete-task') { state.tasks.splice(Number(button.dataset.index), 1); renderRows(); refresh(); ctx.onChange(); }
    else if (button.dataset.wfAction === 'csv') {
      try {
        const r = analyzeSchedule(state);
        downloadCSV('construction-plan.csv', [['แผนงานแบบ CPM — วันปฏิทิน / FS ไม่มี lag'], ['หมายเหตุ', state.notes], ['วันเริ่ม', r.startDate], ['วันเสร็จ', r.endDate], ['ความก้าวหน้าถ่วงน้ำหนัก (%)', r.weightedProgress], [], ['รหัส', 'กิจกรรม', 'ระยะเวลา (วัน)', 'กิจกรรมก่อนหน้า', 'เริ่ม', 'เสร็จ', 'Float (วัน)', 'วิกฤต', 'ความก้าวหน้า (%)', 'งบประมาณ'], ...r.tasks.map(task => [task.id, task.name, task.duration, task.predecessors.join(','), offsetDate(state.startDate, task.es), offsetDate(state.startDate, task.ef - 1), task.float, task.critical ? 'ใช่' : 'ไม่ใช่', task.progress, task.budget])]);
        ctx.notify('ส่งออกแผนงาน CSV แล้ว');
      } catch (e) { ctx.notify(e.message); }
    }
  }
  container.addEventListener('input', onInput); container.addEventListener('click', onClick);
  return {
    getState: () => clone(state),
    getReport: () => {
      try {
        const r = analyzeSchedule(state);
        return `<section class="wf-report"><h2>แผนงานก่อสร้าง</h2><p>${esc(dateTH(r.startDate))} – ${esc(dateTH(r.endDate))} · ${r.duration} วันปฏิทิน<br>ความก้าวหน้าถ่วงน้ำหนักด้วย${r.weightMode === 'budget' ? 'งบประมาณ' : 'ระยะเวลา'} ${fmt(r.weightedProgress)}% · งบประมาณ ${money(r.totalBudget)} บาท</p><table><thead><tr><th>รหัส / กิจกรรม</th><th>ก่อนหน้า</th><th>วันเริ่ม</th><th>วันเสร็จ</th><th>Float</th><th>สำเร็จ</th><th>งบประมาณ</th></tr></thead><tbody>${r.tasks.map(task => `<tr><td>${esc(task.id)} · ${esc(task.name)}${task.critical ? ' [วิกฤต]' : ''}</td><td>${esc(task.predecessors.join(', '))}</td><td>${offsetDate(r.startDate, task.es)}</td><td>${offsetDate(r.startDate, task.ef - 1)}</td><td>${task.float} วัน</td><td>${fmt(task.progress)}%</td><td>${money(task.budget)}</td></tr>`).join('')}</tbody></table><p>วิธีคำนวณ: ES = max(EF ของกิจกรรมก่อนหน้า); EF = ES + ระยะเวลา; LF = min(LS ของกิจกรรมถัดไป); LS = LF − ระยะเวลา; Float = LS − ES. กิจกรรมวิกฤตมี Float = 0</p><p>ขอบเขต: วันปฏิทิน, Finish-to-Start, ไม่มี lag และไม่ปรับแผนตามข้อจำกัดทรัพยากร วันเสร็จเป็นวันสุดท้ายของกิจกรรม รวมวันเริ่ม</p><p>${esc(state.notes)}</p></section>`;
      } catch (e) { return errorHTML(e); }
    },
    destroy: () => { container.removeEventListener('input', onInput); container.removeEventListener('click', onClick); },
  };
}

const DEFAULT_INSPECTION = [
  ['โครงสร้าง', 'รอยร้าวเสา คาน พื้น และผนัง'], ['โครงสร้าง', 'แนวและระดับพื้นอาคาร'],
  ['สถาปัตยกรรม', 'กระเบื้องพื้นและยาแนว'], ['สถาปัตยกรรม', 'ผิวผนังและงานสี'],
  ['สถาปัตยกรรม', 'ประตู หน้าต่าง และอุปกรณ์'], ['สถาปัตยกรรม', 'ฝ้าเพดานและรอยต่อ'],
  ['สุขาภิบาล', 'การรั่วซึมของจุดต่อท่อและสุขภัณฑ์'], ['สุขาภิบาล', 'การระบายน้ำและระดับพื้นห้องน้ำ'],
  ['ไฟฟ้า', 'สภาพหน้ากากปลั๊กและสวิตช์'], ['ไฟฟ้า', 'ป้ายกำกับวงจรในตู้ไฟ'],
  ['ภายนอก', 'รางน้ำและทางระบายน้ำภายนอก'], ['ภายนอก', 'พื้นที่รอบอาคารและรั้ว'],
];
const STATUS_LABEL = { pending: 'ยังไม่ตรวจ', pass: 'ผ่าน', fail: 'ต้องแก้ไข', na: 'ไม่เกี่ยวข้อง' };
const isImageData = value => typeof value === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value) && value.length < 400000;

export function normalizeInspectionState(source) {
  const raw = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const rows = Array.isArray(raw.items) ? raw.items.slice(0, MAX_ROWS) : DEFAULT_INSPECTION.map((row, i) => ({ id: `I${i + 1}`, group: row[0], title: row[1], status: 'pending', note: '', photos: [] }));
  let count = 0; let total = 0;
  return {
    version: 1, property: text(raw.property, 'บ้านตัวอย่าง A-01', 180), inspector: text(raw.inspector, '', 120),
    items: rows.map((item, i) => ({
      id: text(item?.id, `I${i + 1}`, 40), group: text(item?.group, 'ทั่วไป', 80), title: text(item?.title, 'รายการตรวจใหม่', 250),
      status: VALID_STATUSES.has(item?.status) ? item.status : 'pending', note: text(item?.note, '', 2000),
      photos: (Array.isArray(item?.photos) ? item.photos : []).filter(isImageData).slice(0, 2).filter(photo => {
        if (!isImageData(photo) || count >= MAX_PHOTOS || total + photo.length > MAX_PHOTO_CHARS) return false;
        count++; total += photo.length; return true;
      }),
    })),
  };
}

export function inspectionSummary(state) {
  if (!state || !Array.isArray(state.items) || state.items.length > MAX_ROWS) throw new Error('รูปแบบรายการตรวจไม่ถูกต้อง');
  const summary = { total: state.items.length, pending: 0, pass: 0, fail: 0, na: 0, photos: 0, percent: 0 };
  state.items.forEach((item, index) => {
    if (!item || !VALID_STATUSES.has(item.status)) throw new Error(`สถานะรายการตรวจ ${index + 1} ไม่ถูกต้อง`);
    if (!text(item.title).trim()) throw new Error(`กรุณากรอกชื่อรายการตรวจ ${index + 1}`);
    summary[item.status]++; summary.photos += Array.isArray(item.photos) ? item.photos.length : 0;
  });
  summary.percent = summary.total ? (summary.total - summary.pending) / summary.total * 100 : 0;
  return summary;
}

function readPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('รองรับภาพ JPG, PNG หรือ WebP'));
    if (file.size > 2 * 1024 * 1024) return reject(new Error('ภาพต้องมีขนาดไม่เกิน 2 MB'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('อ่านภาพไม่สำเร็จ'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('ไฟล์ภาพไม่สมบูรณ์'));
      image.onload = () => {
        try {
          if (!image.naturalWidth || !image.naturalHeight) throw new Error('อ่านขนาดภาพไม่สำเร็จ');
          const scale = Math.min(1, 960 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          const data = canvas.toDataURL('image/jpeg', .68);
          if (!isImageData(data)) throw new Error('ภาพยังมีขนาดใหญ่เกินไป กรุณาลดขนาดภาพก่อนแนบ');
          resolve(data);
        } catch (e) { reject(e); }
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function mountInspection(container, initialState, context) {
  let state = normalizeInspectionState(initialState); let filter = 'all'; let destroyed = false;
  const ctx = contextOf(context);
  function refreshSummary() {
    try {
      const r = inspectionSummary(state);
      container.querySelector('[data-wf-summary]').innerHTML = card('รายการตรวจ', r.total, 'รายการ') + card('ผ่าน', r.pass, 'รายการ') + card('ต้องแก้ไข', r.fail, 'รายการ', r.fail ? 'wf-warm' : '') + card('ตรวจแล้ว', fmt(r.percent), '%', 'wf-emphasis');
      container.querySelector('[data-wf-errors]').innerHTML = '';
    } catch (e) { container.querySelector('[data-wf-errors]').innerHTML = errorHTML(e); }
  }
  function renderItems() {
    const visible = state.items.map((item, i) => ({ item, i })).filter(({ item }) => filter === 'all' || item.status === filter);
    container.querySelector('[data-wf-inspection-items]').innerHTML = visible.map(({ item, i }) => `<article class="wf-inspection-item wf-status-${item.status}" data-wf-inspection-item="${i}">
      <div class="wf-inspection-item-top"><div class="wf-inspection-titles"><input aria-label="หมวด รายการตรวจ ${i + 1}" data-wf-item="group" data-index="${i}" value="${esc(item.group)}" maxlength="80" class="wf-group-input"><input aria-label="ชื่อรายการตรวจ ${i + 1}" data-wf-item="title" data-index="${i}" value="${esc(item.title)}" maxlength="250" class="wf-title-input"></div><button type="button" class="wf-icon-button" data-wf-action="delete-item" data-index="${i}" aria-label="ลบรายการตรวจ ${i + 1}">×</button></div>
      <div class="wf-status-actions" role="group" aria-label="สถานะ ${esc(item.title)}">${Object.entries(STATUS_LABEL).map(([status, label]) => `<button type="button" data-wf-action="status" data-status="${status}" data-index="${i}" aria-pressed="${item.status === status}" class="wf-status-button ${item.status === status ? 'wf-selected' : ''} wf-status-button-${status}">${label}</button>`).join('')}</div>
      <textarea aria-label="บันทึกข้อบกพร่อง รายการ ${i + 1}" data-wf-item="note" data-index="${i}" rows="2" maxlength="2000" placeholder="ตำแหน่ง / สิ่งที่พบ / งานที่ต้องแก้ไข">${esc(item.note)}</textarea>
      <div class="wf-photo-row">${item.photos.map((photo, p) => `<figure><img src="${photo}" alt="หลักฐานรายการตรวจ ${i + 1} ภาพ ${p + 1}"><button type="button" data-wf-action="delete-photo" data-index="${i}" data-photo="${p}" aria-label="ลบภาพ ${p + 1} ของรายการตรวจ ${i + 1}">×</button></figure>`).join('')}<label class="wf-photo-button">+ แนบภาพ<input aria-label="แนบภาพ รายการตรวจ ${i + 1}" type="file" accept="image/jpeg,image/png,image/webp" data-wf-photo="${i}" ${item.photos.length >= 2 ? 'disabled' : ''}></label></div>
    </article>`).join('') || '<p class="wf-empty">ไม่มีรายการในสถานะที่เลือก</p>';
  }
  container.innerHTML = `<div class="wf-workspace"><div class="wf-notice"><b>แบบตรวจและบันทึกข้อบกพร่อง</b> · ผลตรวจเป็นข้อมูลที่ผู้ตรวจกรอก ไม่ใช่ผลวิเคราะห์หรือการรับรองความปลอดภัยของอาคาร</div>
    <div class="wf-stats" data-wf-summary aria-live="polite"></div><div data-wf-errors></div>
    <div class="wf-panel"><div class="wf-panel-head"><div><h3>ข้อมูลการตรวจ</h3><p>บันทึกตำแหน่ง สิ่งที่พบ และหลักฐานก่อนส่งต่องานแก้ไข</p></div><div class="wf-actions"><button type="button" class="wf-button" data-wf-action="csv">ส่งออก CSV</button><button type="button" class="wf-button wf-primary" data-wf-action="add-item">+ เพิ่มรายการตรวจ</button></div></div>
    <div class="wf-inline-fields wf-inspection-meta"><label>ชื่อบ้าน / อาคาร / ห้อง${input('ชื่อบ้าน / อาคาร / ห้อง', state.property, 'data-wf-setting="property" maxlength="180"')}</label><label>ผู้ตรวจ${input('ผู้ตรวจ', state.inspector, 'data-wf-setting="inspector" maxlength="120" placeholder="ระบุชื่อผู้ตรวจ"')}</label></div>
    <div class="wf-inspection-toolbar"><label>แสดงรายการ<select aria-label="กรองรายการตรวจ" data-wf-filter><option value="all">ทั้งหมด</option><option value="fail">ต้องแก้ไข</option><option value="pending">ยังไม่ตรวจ</option><option value="pass">ผ่าน</option><option value="na">ไม่เกี่ยวข้อง</option></select></label><p>ภาพ JPG/PNG/WebP ≤ 2 MB · 2 ภาพ/รายการ · รวมไม่เกิน 8 ภาพ<br>ย่อภาพก่อนเก็บในเครื่อง กรุณาเก็บต้นฉบับแยกไว้</p></div></div>
    <div class="wf-inspection-grid" data-wf-inspection-items></div>
  </div>`;
  renderItems(); refreshSummary();
  function onInput(event) {
    const el = event.target;
    if (el.dataset.wfItem) { const item = state.items[Number(el.dataset.index)]; if (!item) return; item[el.dataset.wfItem] = el.value; }
    else if (el.dataset.wfSetting) state[el.dataset.wfSetting] = el.value;
    else return;
    refreshSummary(); ctx.onChange();
  }
  async function onChange(event) {
    const el = event.target;
    if (el.hasAttribute('data-wf-filter')) { filter = el.value; renderItems(); return; }
    if (!el.hasAttribute('data-wf-photo') || !el.files?.length) return;
    const item = state.items[Number(el.dataset.wfPhoto)]; if (!item) return;
    const file = el.files[0]; el.value = '';
    if (item.photos.length >= 2 || state.items.reduce((sum, current) => sum + current.photos.length, 0) >= MAX_PHOTOS) return ctx.notify('แนบได้ 2 ภาพต่อรายการ และรวมไม่เกิน 8 ภาพ');
    try {
      const data = await readPhoto(file); if (destroyed || !state.items.includes(item)) return;
      const photoChars = state.items.reduce((sum, current) => sum + current.photos.reduce((s, photo) => s + photo.length, 0), 0);
      if (photoChars + data.length > MAX_PHOTO_CHARS) throw new Error('ภาพรวมมีขนาดเกินพื้นที่ที่กำหนด กรุณาลดจำนวนภาพ');
      if (item.photos.length >= 2 || state.items.reduce((sum, current) => sum + current.photos.length, 0) >= MAX_PHOTOS) throw new Error('ครบจำนวนภาพที่รองรับแล้ว');
      item.photos.push(data); renderItems(); refreshSummary(); ctx.onChange(); ctx.notify('แนบภาพแล้ว ภาพเก็บอยู่ในเบราว์เซอร์นี้');
    } catch (e) { ctx.notify(e.message); }
  }
  function onClick(event) {
    const button = event.target.closest('[data-wf-action]'); if (!button) return;
    const action = button.dataset.wfAction; const i = Number(button.dataset.index); const item = state.items[i];
    if (action === 'add-item') {
      if (state.items.length >= MAX_ROWS) return ctx.notify(`รองรับไม่เกิน ${MAX_ROWS} รายการ`);
      state.items.push({ id: uid('I'), group: 'ทั่วไป', title: 'รายการตรวจใหม่', status: 'pending', note: '', photos: [] }); filter = 'all'; container.querySelector('[data-wf-filter]').value = 'all';
    } else if (action === 'delete-item') state.items.splice(i, 1);
    else if (action === 'status' && item && VALID_STATUSES.has(button.dataset.status)) item.status = button.dataset.status;
    else if (action === 'delete-photo' && item) item.photos.splice(Number(button.dataset.photo), 1);
    else if (action === 'csv') {
      try {
        inspectionSummary(state);
        downloadCSV('inspection-checklist.csv', [['รายงานตรวจอาคาร — ผลตามที่ผู้ตรวจกรอก'], ['บ้าน/อาคาร', state.property], ['ผู้ตรวจ', state.inspector], ['ภาพหลักฐานอยู่ในไฟล์โครงการ JSON และรายงานพิมพ์ ไม่รวมใน CSV'], [], ['หมวด', 'รายการตรวจ', 'สถานะ', 'บันทึก', 'จำนวนภาพ'], ...state.items.map(row => [row.group, row.title, STATUS_LABEL[row.status], row.note, row.photos.length])]);
        ctx.notify('ส่งออก CSV แล้ว ภาพแนบอยู่ในไฟล์โครงการและรายงานพิมพ์');
      } catch (e) { ctx.notify(e.message); }
      return;
    } else return;
    renderItems(); refreshSummary(); ctx.onChange();
  }
  container.addEventListener('input', onInput); container.addEventListener('change', onChange); container.addEventListener('click', onClick);
  return {
    getState: () => clone(state),
    getReport: () => {
      try {
        const r = inspectionSummary(state);
        return `<section class="wf-report"><h2>รายงานตรวจรับบ้านและอาคาร</h2><p>สถานที่: ${esc(state.property)}<br>ผู้ตรวจ: ${esc(state.inspector || 'ไม่ได้ระบุ')}</p><p>ทั้งหมด ${r.total} รายการ · ผ่าน ${r.pass} · ต้องแก้ไข ${r.fail} · ยังไม่ตรวจ ${r.pending} · ไม่เกี่ยวข้อง ${r.na}</p><p>ผลเป็นข้อมูลที่ผู้ตรวจกรอก ไม่ใช่ผลวิเคราะห์หรือใบรับรองความปลอดภัยของอาคาร</p>${state.items.map((item, index) => `<section class="wf-report-inspection"><h3>${index + 1}. ${esc(item.group)} · ${esc(item.title)}</h3><p><b>${esc(STATUS_LABEL[item.status])}</b> — ${esc(item.note || 'ไม่มีบันทึกเพิ่มเติม')}</p>${item.photos.map((photo, i) => `<img src="${photo}" alt="หลักฐาน ${index + 1} ภาพ ${i + 1}" class="wf-report-photo">`).join('')}</section>`).join('')}</section>`;
      } catch (e) { return errorHTML(e); }
    },
    destroy: () => { destroyed = true; container.removeEventListener('input', onInput); container.removeEventListener('change', onChange); container.removeEventListener('click', onClick); },
  };
}

export function mountWorkflow(container, toolId, initialState = null, context = {}) {
  if (!container?.querySelector) throw new Error('ต้องระบุ container สำหรับเครื่องมือ');
  if (BOQ_IDS.has(toolId)) return mountBoq(container, toolId, initialState, context);
  if (toolId === 'planning') return mountPlanning(container, initialState, context);
  if (toolId === 'inspection') return mountInspection(container, initialState, context);
  throw new Error(`ไม่พบ workflow: ${toolId}`);
}
