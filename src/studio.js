import { catalog, categories } from './catalog.js';
import { escapeHTML as e, format as f } from './utils.js';
import { icon } from './visuals.js';
import { studioDrawing } from './studio-visuals.js';
import { normalizeDocument, documentReviewState } from './document-control.js';
import { reviewRegisterSummary } from './review-register.js';

export function studioHeader({ active = 'catalog', count = 0, logo, version, category = '' }) {
  const label = active === 'handover-history' ? 'ฉบับอ้างอิง / รายการเปลี่ยนแปลง' : active === 'handover' ? 'ชุดส่งตรวจโครงการ' : active === 'projects' ? 'ทะเบียนงาน' : active === 'tool' ? 'พื้นที่วิเคราะห์' : 'ภาพรวมพื้นที่ทำงาน';
  return `<aside class="studio-sidebar" aria-label="แถบนำทาง"><a class="brand studio-sidebar-brand" href="#" aria-label="ENG APP Engineering Studio หน้าหลัก">${logo}</a><nav class="studio-nav" aria-label="เมนูหลัก"><span class="studio-nav-label">WORKSPACE</span><a href="#" class="${active === 'catalog' ? 'active' : ''}" ${active === 'catalog' ? 'aria-current="page"' : ''}>${icon('grid')}<span>ภาพรวม</span></a><a href="#projects" class="${active === 'projects' ? 'active' : ''}" ${active === 'projects' ? 'aria-current="page"' : ''}>${icon('folder')}<span>งานของฉัน</span><span class="nav-count">${count}</span></a><a href="#handover" class="${active.startsWith('handover') ? 'active' : ''}" ${active.startsWith('handover') ? 'aria-current="page"' : ''}>${icon('layers')}<span>ชุดส่งตรวจ</span></a><button data-action="command">${icon('search')}<span>ค้นหา / เปิดเครื่องมือ</span><kbd>⌘ K</kbd></button><span class="studio-nav-label">DISCIPLINES</span>${categories.filter(c => c.id !== 'all').map(c => `<button data-nav-category="${c.id}" class="${category === c.id ? 'active' : ''}">${icon(c.icon)}<span>${e(c.label)}</span></button>`).join('')}<span class="studio-nav-label">REFERENCE</span><a href="#tool/guide">${icon('book')}<span>แนวทางและวิธีคิด</span></a><button data-action="about">${icon('info')}<span>เกี่ยวกับ Studio</span></button></nav><div class="studio-sidebar-bottom"><span class="studio-local-dot"></span><strong>พื้นที่ทำงานส่วนตัว</strong><p>งานเก็บในเบราว์เซอร์นี้<br>สำรองและย้ายงานด้วย JSON</p><span class="studio-version">ENG APP / ${e(version)}</span></div></aside><div class="studio-shell"><header class="site-header studio-header"><div class="header-inner"><a class="brand" href="#" aria-label="ENG APP หน้าหลัก">${logo}</a><div class="studio-location"><span>ENGINEERING STUDIO</span><strong>${label}</strong></div><div class="header-actions"><button class="studio-command-trigger" data-action="command" aria-label="ค้นหางานหรือเครื่องมือ">${icon('search')}<span>ค้นหางานหรือเครื่องมือ</span><kbd>Ctrl K</kbd></button><button class="button light compact" data-action="import" aria-label="เปิดไฟล์งาน">${icon('upload')}<span>เปิดไฟล์งาน</span></button></div></div></header>`;
}

export function studioFooter(version) {
  return `<footer class="site-footer"><div><strong>ENG APP <span class="footer-studio">ENGINEERING STUDIO</span></strong><p>จากข้อมูลที่ตรวจสอบได้ สู่การตัดสินใจที่อธิบายได้</p></div><div><span>รุ่น ${e(version)}</span><a href="https://github.com/saratchai1/eng-app" target="_blank" rel="noopener">เอกสารและซอร์สโค้ด ${icon('external')}</a><button class="link-button" data-action="about">ขอบเขตเครื่องมือ</button></div></footer></div>`;
}

/** Model checks and human review are intentionally separate signals. */
export function projectSignals(record, definitions) {
  const document = normalizeDocument(record.data?._document);
  const review = documentReviewState(document);
  const definition = definitions[record.toolId];
  const register = { total: 0, open: 0, addressed: 0, closed: 0, needsReview: 0, outstanding: 0, criticalOutstanding: 0, currentValid: false };
  const signals = { document, review, register, calculator: Boolean(definition), metrics: [], assessment: null, issue: false, label: 'พร้อมเปิดทำงาน' };
  if (!definition) return signals;
  const defaults = Object.fromEntries(definition.inputGroups.flatMap(group => group.fields.map(field => [field.key, field.default])));
  const inputs = { ...defaults, ...record.data };
  signals.register = reviewRegisterSummary(definition, record.data?._review, inputs, document);
  try {
    const result = definition.calculate(inputs);
    const checks = result.checks || [];
    const assessment = { pass: checks.filter(c => c.pass === true).length, fail: checks.filter(c => c.pass === false).length, unassessed: checks.filter(c => c.pass !== true && c.pass !== false).length, total: checks.length };
    signals.assessment = assessment;
    signals.metrics = result.summary.slice(0, 2);
    signals.issue = assessment.fail > 0 || assessment.unassessed > 0;
    signals.label = assessment.fail ? `แบบจำลอง: ไม่ผ่าน ${assessment.fail} รายการ` : assessment.unassessed ? `แบบจำลอง: ไม่ประเมิน ${assessment.unassessed} รายการ` : 'ผลคำนวณพร้อมตรวจทาน';
  } catch {
    signals.issue = true;
    signals.label = 'ข้อมูลคำนวณต้องตรวจแก้';
  }
  return signals;
}

function registerSignalMarkup(signals) {
  if (!signals.calculator) return '';
  const register = signals.register;
  const label = !register.total ? 'ทะเบียนตรวจทาน: ยังไม่มีรายการ'
    : register.outstanding ? `ประเด็นค้าง ${register.outstanding}/${register.total}${register.needsReview ? ` · ต้องตรวจซ้ำ ${register.needsReview}` : ''}`
    : `ประเด็นปิดโดยผู้ใช้ ${register.closed}/${register.total}`;
  return `<span class="studio-register-signal${register.outstanding ? ' studio-attention' : ''}">${e(label)}</span>`;
}

export function studioHomeLead(records, definitions) {
  const enriched = records.map(record => ({ ...record, signals: projectSignals(record, definitions) }));
  const pending = enriched.filter(record => record.signals.review.completed < record.signals.review.total).length;
  const openProjects = enriched.filter(record => record.signals.register.outstanding > 0).length;
  const openItems = enriched.reduce((total, record) => total + record.signals.register.outstanding, 0);
  const rechecks = enriched.reduce((total, record) => total + record.signals.register.needsReview, 0);
  const observations = enriched.filter(record => record.signals.issue).length;
  const calculators = enriched.filter(record => record.signals.calculator).length;
  const latest = enriched.slice().sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)).slice(0, 4);
  return `<section class="studio-hero"><div class="studio-hero-copy"><div class="eyebrow"><span class="orange-line"></span> REVIEW &amp; REVISION / WORKSPACE</div><h1>คิดเป็นระบบ<span>เห็นทุกทางเลือก</span></h1><p>รวมข้อมูล แบบจำลอง และเหตุผลของแต่ละทางเลือก<br class="desktop-only">ให้การตัดสินใจตรวจสอบและส่งต่อได้</p><div class="hero-actions"><button class="button primary" data-action="command">${icon('plus')} เริ่มงานวิศวกรรม</button><a class="text-link" href="#projects">เปิดงานของฉัน ${icon('external')}</a></div><div class="studio-hero-footnote"><span class="studio-hero-rule"></span><span>20 เครื่องมือ · ข้อมูลโครงการ · รายงานการคำนวณ</span></div></div><div class="studio-hero-art"><div class="studio-drawing-header"><span><i aria-hidden="true"></i> ENGINEERING EXPLORER</span><span>CONCEPT / 01</span></div>${studioDrawing()}<div class="drawing-caption"><span>STRUCTURE · SOIL · WATER</span><a href="#tool/retaining-wall">สำรวจแบบจำลองกำแพงกันดิน ${icon('external')}</a></div></div><ol class="studio-work-sequence" aria-label="ลำดับการทำงาน"><li><span class="sequence-index">01</span><div><strong>กำหนดข้อมูล</strong><span>ระบุบริบท หน่วย และสมมติฐาน</span></div>${icon('ruler')}</li><li><span class="sequence-index">02</span><div><strong>สำรวจทางเลือก</strong><span>เปรียบเทียบผลและความไวของตัวแปร</span></div>${icon('layers')}</li><li><span class="sequence-index">03</span><div><strong>ทบทวนและส่งต่อ</strong><span>ตอบประเด็น เก็บฉบับ และส่งรายงาน</span></div>${icon('file')}</li></ol></section><section class="studio-overview" aria-labelledby="overview-title"><div class="section-heading"><div><span class="eyebrow">YOUR REVIEW DESK</span><h2 id="overview-title">ภาพรวมงานที่ต้องดูต่อ</h2></div><span class="section-note">จากงานที่บันทึกและร่างล่าสุดของคุณ</span></div><div class="overview-grid"><a class="overview-card" href="#projects"><span class="overview-label">งานที่บันทึกไว้ ${icon('folder')}</span><strong class="overview-value">${records.length.toString().padStart(2, '0')}</strong><span class="overview-note">เปิด แก้ไข หรือทำสำเนา ${icon('external')}</span></a><a class="overview-card" href="#projects" data-tone="${openProjects ? 'amber' : 'teal'}"><span class="overview-label">งานที่มีประเด็นค้าง ${icon('file')}</span><strong class="overview-value">${openProjects.toString().padStart(2, '0')}</strong><span class="overview-note">${openItems} ประเด็น · ต้องตรวจซ้ำ ${rechecks}</span></a><a class="overview-card" href="#projects" data-tone="${observations ? 'amber' : 'teal'}"><span class="overview-label">งานคำนวณที่มีข้อสังเกต ${icon('ruler')}</span><strong class="overview-value">${observations.toString().padStart(2, '0')}</strong><span class="overview-note">ข้อมูลผิด / ไม่ผ่าน / ไม่ประเมิน จาก ${calculators} งาน</span></a></div><p class="overview-review-note"><span>${icon('check')} รายการยืนยันการตรวจของผู้ใช้</span><strong>ยังไม่ครบ ${pending} งาน</strong><span>แยกจากประเด็นค้างและผลตรวจในแบบจำลอง</span></p></section><section class="studio-project-section"><div class="section-heading"><div><span class="eyebrow">CONTINUE YOUR WORK</span><h2>งานล่าสุด</h2></div><a class="text-link" href="#projects">ทะเบียนงานทั้งหมด ${icon('external')}</a></div>${latest.length ? `<div class="studio-projects-list"><div class="studio-register-head" aria-hidden="true"><span>โครงการ / เอกสาร</span><span>ผลแบบจำลอง / การทบทวน</span></div>${latest.map(record => {
    const tool = catalog.find(t => t.id === record.toolId);
    const s = record.signals;
    const editedAt = typeof record.updatedAt === 'string' && Number.isFinite(Date.parse(record.updatedAt)) ? new Date(record.updatedAt).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' }) : '';
    return `<button class="studio-project-row" data-open-project="${e(record.id)}"><span class="studio-project-icon">${icon(tool?.kind === 'calculator' ? 'ruler' : 'folder')}</span><span class="studio-project-text"><small>${e(s.document.projectCode || tool?.en || '')} · REV ${e(s.document.revision)}</small><strong>${e(record.name)}</strong><span>${e(tool?.title || '')}${record.fromDraft ? ' · มีร่างแก้ไข' : ''}${editedAt ? `<span class="studio-edited-at">แก้ไข ${e(editedAt)}</span>` : ''}</span></span><span class="studio-project-status"><span class="${s.issue ? 'studio-attention' : ''}">${e(s.label)}</span>${registerSignalMarkup(s)}<small>ผู้ใช้ยืนยันการตรวจ ${s.review.completed}/${s.review.total}</small></span><span class="studio-row-arrow" aria-hidden="true">${icon('external')}</span></button>`;
  }).join('')}</div>` : `<div class="studio-empty-project"><div class="studio-empty-icon">${icon('folder')}</div><div><h3>เริ่มต้นจากโจทย์ของคุณ</h3><p>เลือกเครื่องมือ ใส่ข้อมูลโครงการ แล้วบันทึกเพื่อกลับมาตรวจและพัฒนางานต่อ</p></div><button class="button light" data-action="command">สร้างงานแรก ${icon('plus')}</button></div>`}</section><section class="studio-start"><div class="section-heading"><div><span class="eyebrow">CHOOSE YOUR DISCIPLINE</span><h2>ครบเส้นทางการทำงาน</h2></div><a class="text-link" href="#tools">เครื่องมือทั้ง 20 รายการ ${icon('external')}</a></div><div class="discipline-grid">${[
    { id: 'design', index: '01', icon: 'ruler', title: 'โครงสร้างและปฐพี', description: 'ตรวจแรง สำรวจความไวของตัวแปร และเปรียบเทียบทางเลือก' },
    { id: 'cost', index: '02', icon: 'calculator', title: 'ปริมาณและต้นทุน', description: 'เชื่อมมิติของงานกับปริมาณ วัสดุ ค่าแรง และงบประมาณ' },
    { id: 'management', index: '03', icon: 'chart', title: 'แผนงานและคุณภาพ', description: 'ติดตามเส้นทางวิกฤต ความก้าวหน้า และประเด็นหน้างาน' },
  ].map(item => `<button class="discipline-card" data-nav-category="${item.id}"><span class="discipline-index">${item.index} / ${catalog.filter(t => t.category === item.id).length} TOOLS</span><span class="discipline-icon">${icon(item.icon)}</span><h3>${item.title}</h3><p>${item.description}</p><span class="discipline-arrow">ดูเครื่องมือในสาขานี้ ${icon('external')}</span></button>`).join('')}</div></section>`;
}

export function projectSignalMarkup(signals) {
  return `<div class="project-document-meta"><span>${e(signals.document.projectCode || 'ยังไม่ระบุรหัสโครงการ')}</span><span>REV ${e(signals.document.revision)}</span></div><div class="project-metric-preview">${signals.metrics.map(metric => `<div><small>${e(metric.label)}</small><strong>${metric.value === null || !Number.isFinite(metric.value) ? 'ไม่ประเมิน' : e(f(metric.value, metric.digits ?? 2))} <span>${e(metric.unit || '')}</span></strong></div>`).join('')}</div><div class="project-review-strip"><div class="project-review-signal-group"><span class="${signals.issue ? 'studio-attention' : ''}">${e(signals.label)}</span>${registerSignalMarkup(signals)}</div><small>ผู้ใช้ยืนยันการตรวจ ${signals.review.completed}/${signals.review.total}</small></div>`;
}

/** Only literal booleans count as assessed checks. Priorities are observations, never approval. */
export function calculationReview(result) {
  const checks = Array.isArray(result?.checks) ? result.checks.filter(check => check && typeof check === 'object') : [];
  const fail = checks.filter(c => c.pass === false).length;
  const unassessed = checks.filter(c => c.pass !== true && c.pass !== false).length;
  const pass = checks.filter(c => c.pass === true).length;
  const observations = [...checks.filter(c => c.pass === false), ...checks.filter(c => c.pass !== true && c.pass !== false)];
  return { pass, fail, unassessed, total: checks.length, observations: observations.slice(0, 3).map(check => ({ label: String(check.label || 'รายการตรวจ'), status: check.pass === false ? 'fail' : 'unassessed' })), remaining: Math.max(0, observations.length - 3), state: fail ? 'fail' : unassessed ? 'unassessed' : checks.length ? 'assessed' : 'quantity' };
}

export function calculationOverview(result) {
  const review = calculationReview(result);
  const titles = { fail: 'ทบทวนประเด็นที่ไม่ผ่านก่อนใช้ผล', unassessed: 'มีประเด็นที่ต้องประเมินเพิ่มเติม', assessed: 'ผลตรวจตามแบบจำลองพร้อมให้ทบทวน', quantity: 'ตรวจปริมาณกับข้อมูลโครงการ' };
  return `<section class="studio-insight-summary studio-review-brief ${review.fail || review.unassessed ? 'has-observation' : ''}" data-review-status="${review.state}" aria-label="สรุปการตรวจในแบบจำลอง"><div class="studio-review-brief-heading"><span class="eyebrow">REVIEW BRIEF / CURRENT MODEL</span><strong>${titles[review.state]}</strong><p>${review.total ? 'ผลตรวจเฉพาะเกณฑ์ในแบบจำลองนี้ แยกจากการยืนยันตรวจทานโดยผู้ใช้' : 'แบบจำลองนี้แสดงปริมาณ ตรวจมิติ หน่วย และสมมติฐานก่อนนำผลไปใช้'}</p></div>${review.total ? `<dl class="studio-review-counts" aria-label="จำนวนผลตรวจ"><div class="review-count-pass"><dt>ผ่าน</dt><dd>${review.pass}</dd></div><div class="review-count-fail"><dt>ไม่ผ่าน</dt><dd>${review.fail}</dd></div><div class="review-count-unassessed"><dt>ไม่ประเมิน</dt><dd>${review.unassessed}</dd></div></dl>` : ''}${review.observations.length ? `<div class="studio-review-agenda"><span class="review-agenda-label">ประเด็นที่ต้องดูต่อ</span><ul>${review.observations.map(item => `<li class="review-agenda-${item.status}">${icon('info')}<span>${e(item.label)}</span><small>${item.status === 'fail' ? 'ไม่ผ่าน' : 'ไม่ประเมิน'}</small></li>`).join('')}</ul>${review.remaining ? `<span class="review-agenda-more">และอีก ${review.remaining} รายการในผลตรวจด้านล่าง</span>` : ''}</div>` : ''}<div class="studio-review-brief-footer"><span>${review.total ? 'ผลคำนวณเปลี่ยนตามข้อมูลปัจจุบัน' : 'ตรวจรายละเอียดผลและที่มาของการคำนวณ'}</span><button class="link-button" data-calc-tab="methods">ดูขอบเขตและวิธีคิด ${icon('external')}</button></div></section>`;
}
