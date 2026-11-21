import { catalog, categories } from './catalog.js';
import { escapeHTML as e, format as f } from './utils.js';
import { icon } from './visuals.js';
import { studioDrawing } from './studio-visuals.js';
import { normalizeDocument, documentReviewState } from './document-control.js';

export function studioHeader({ active = 'catalog', count = 0, logo, version, category = '' }) {
  const label = active === 'projects' ? 'ทะเบียนงาน' : active === 'tool' ? 'พื้นที่วิเคราะห์' : 'ภาพรวมพื้นที่ทำงาน';
  return `<aside class="studio-sidebar" aria-label="แถบนำทาง"><a class="brand studio-sidebar-brand" href="#" aria-label="ENG APP Engineering Studio หน้าหลัก">${logo}</a><nav class="studio-nav" aria-label="เมนูหลัก"><span class="studio-nav-label">WORKSPACE</span><a href="#" class="${active === 'catalog' ? 'active' : ''}" ${active === 'catalog' ? 'aria-current="page"' : ''}>${icon('grid')}<span>ภาพรวม</span></a><a href="#projects" class="${active === 'projects' ? 'active' : ''}" ${active === 'projects' ? 'aria-current="page"' : ''}>${icon('folder')}<span>งานของฉัน</span><span class="nav-count">${count}</span></a><button data-action="command">${icon('search')}<span>ค้นหา / เปิดเครื่องมือ</span><kbd>⌘ K</kbd></button><span class="studio-nav-label">DISCIPLINES</span>${categories.filter(c => c.id !== 'all').map(c => `<button data-nav-category="${c.id}" class="${category === c.id ? 'active' : ''}">${icon(c.icon)}<span>${e(c.label)}</span></button>`).join('')}<span class="studio-nav-label">REFERENCE</span><a href="#tool/guide">${icon('book')}<span>แนวทางและวิธีคิด</span></a><button data-action="about">${icon('info')}<span>เกี่ยวกับ Studio</span></button></nav><div class="studio-sidebar-bottom"><span class="studio-local-dot"></span><strong>พื้นที่ทำงานส่วนตัว</strong><p>งานเก็บในเบราว์เซอร์นี้<br>สำรองและย้ายงานด้วย JSON</p><span class="studio-version">ENG APP / ${e(version)}</span></div></aside><div class="studio-shell"><header class="site-header studio-header"><div class="header-inner"><a class="brand" href="#" aria-label="ENG APP หน้าหลัก">${logo}</a><div class="studio-location"><span>ENGINEERING STUDIO</span><strong>${label}</strong></div><div class="header-actions"><button class="studio-command-trigger" data-action="command" aria-label="ค้นหางานหรือเครื่องมือ">${icon('search')}<span>ค้นหางานหรือเครื่องมือ</span><kbd>Ctrl K</kbd></button><button class="button light compact" data-action="import" aria-label="เปิดไฟล์งาน">${icon('upload')}<span>เปิดไฟล์งาน</span></button></div></div></header>`;
}

export function studioFooter(version) {
  return `<footer class="site-footer"><div><strong>ENG APP <span class="footer-studio">ENGINEERING STUDIO</span></strong><p>จากข้อมูลที่ตรวจสอบได้ สู่การตัดสินใจที่อธิบายได้</p></div><div><span>รุ่น ${e(version)}</span><a href="https://github.com/saratchai1/eng-app" target="_blank" rel="noopener">เอกสารและซอร์สโค้ด ${icon('external')}</a><button class="link-button" data-action="about">ขอบเขตเครื่องมือ</button></div></footer></div>`;
}

/** Model checks and human review are intentionally separate signals. */
export function projectSignals(record, definitions) {
  const document = normalizeDocument(record.data?._document);
  const review = documentReviewState(document);
  const definition = definitions[record.toolId];
  const signals = { document, review, calculator: Boolean(definition), metrics: [], assessment: null, issue: false, label: 'พร้อมเปิดทำงาน' };
  if (!definition) return signals;
  try {
    const defaults = Object.fromEntries(definition.inputGroups.flatMap(group => group.fields.map(field => [field.key, field.default])));
    const result = definition.calculate({ ...defaults, ...record.data });
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

export function studioHomeLead(records, definitions) {
  const enriched = records.map(record => ({ ...record, signals: projectSignals(record, definitions) }));
  const pending = enriched.filter(record => record.signals.review.completed < record.signals.review.total).length;
  const observations = enriched.filter(record => record.signals.issue).length;
  const calculators = enriched.filter(record => record.signals.calculator).length;
  const latest = enriched.slice().sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)).slice(0, 4);
  return `<section class="studio-hero"><div class="studio-hero-copy"><div class="eyebrow"><span class="orange-line"></span> ENGINEER WITH CLARITY</div><h1>มองให้ครบ<br>คิดให้ชัด<span>ก่อนตัดสินใจ</span></h1><p>พื้นที่ทำงานสำหรับวิศวกรที่ต้องการทั้งคำตอบ<br class="desktop-only">และเหตุผลที่อยู่เบื้องหลัง ตั้งแต่คำนวณถึงรายงาน</p><div class="hero-actions"><button class="button primary" data-action="command">${icon('plus')} เริ่มงานวิศวกรรม</button><a class="text-link" href="#projects">เปิดงานของฉัน ${icon('external')}</a></div><div class="studio-hero-principles"><span>${icon('layers')} สำรวจทางเลือก</span><span>${icon('book')} ตรวจที่มา</span><span>${icon('file')} ส่งต่องาน</span></div></div><div class="studio-hero-art">${studioDrawing()}<div class="drawing-caption"><span>SECTION 01 / CIVIL ENGINEERING</span><a href="#tool/retaining-wall">เปิดแบบจำลองกำแพงกันดิน ${icon('external')}</a></div></div></section><section class="studio-overview" aria-labelledby="overview-title"><div class="section-heading"><div><span class="eyebrow">PROJECT INTELLIGENCE</span><h2 id="overview-title">สถานะงานในพื้นที่นี้</h2></div><span class="section-note">จากงานที่บันทึกและร่างล่าสุดของคุณ</span></div><div class="overview-grid"><a class="overview-card" href="#projects"><span class="overview-label">งานที่บันทึกไว้ ${icon('folder')}</span><strong class="overview-value">${records.length.toString().padStart(2, '0')}</strong><span class="overview-note">เปิด แก้ไข หรือทำสำเนาทางเลือก ${icon('external')}</span></a><a class="overview-card" href="#projects" data-tone="amber"><span class="overview-label">งานที่ยังตรวจทานไม่ครบ ${icon('file')}</span><strong class="overview-value">${pending.toString().padStart(2, '0')}</strong><span class="overview-note">ตามรายการตรวจทานที่ผู้ใช้ยืนยัน</span></a><a class="overview-card" href="#projects" data-tone="${observations ? 'amber' : 'teal'}"><span class="overview-label">งานคำนวณที่มีข้อสังเกต ${icon('ruler')}</span><strong class="overview-value">${observations.toString().padStart(2, '0')}</strong><span class="overview-note">ข้อมูลผิด / ไม่ผ่าน / ไม่ประเมิน จาก ${calculators} งานคำนวณ</span></a></div></section><section class="studio-project-section"><div class="section-heading"><div><span class="eyebrow">CONTINUE YOUR WORK</span><h2>งานล่าสุด</h2></div><a class="text-link" href="#projects">ทะเบียนงานทั้งหมด ${icon('external')}</a></div>${latest.length ? `<div class="studio-projects-list">${latest.map(record => {
    const tool = catalog.find(t => t.id === record.toolId);
    const s = record.signals;
    return `<button class="studio-project-row" data-open-project="${e(record.id)}"><span class="studio-project-icon">${icon(tool?.kind === 'calculator' ? 'ruler' : 'folder')}</span><span class="studio-project-text"><small>${e(s.document.projectCode || tool?.en || '')} · REV ${e(s.document.revision)}</small><strong>${e(record.name)}</strong><span>${e(tool?.title || '')}${record.fromDraft ? ' · มีร่างแก้ไข' : ''}</span></span><span class="studio-project-status"><span class="${s.issue ? 'studio-attention' : ''}">${e(s.label)}</span><small>ผู้ใช้ตรวจทาน ${s.review.completed}/${s.review.total}</small></span><span class="studio-row-arrow" aria-hidden="true">${icon('external')}</span></button>`;
  }).join('')}</div>` : `<div class="studio-empty-project"><div class="studio-empty-icon">${icon('folder')}</div><div><h3>เริ่มต้นจากโจทย์ของคุณ</h3><p>เลือกเครื่องมือ ใส่ข้อมูลโครงการ แล้วบันทึกเพื่อกลับมาตรวจและพัฒนางานต่อ</p></div><button class="button light" data-action="command">สร้างงานแรก ${icon('plus')}</button></div>`}</section><section class="studio-start"><div class="section-heading"><div><span class="eyebrow">CHOOSE YOUR DISCIPLINE</span><h2>ครบเส้นทางการทำงาน</h2></div><a class="text-link" href="#tools">เครื่องมือทั้ง 20 รายการ ${icon('external')}</a></div><div class="discipline-grid">${[
    { id: 'design', index: '01', icon: 'ruler', title: 'โครงสร้างและปฐพี', description: 'ตรวจแรง สำรวจความไวของตัวแปร และเปรียบเทียบทางเลือก' },
    { id: 'cost', index: '02', icon: 'calculator', title: 'ปริมาณและต้นทุน', description: 'เชื่อมมิติของงานกับปริมาณ วัสดุ ค่าแรง และงบประมาณ' },
    { id: 'management', index: '03', icon: 'chart', title: 'แผนงานและคุณภาพ', description: 'ติดตามเส้นทางวิกฤต ความก้าวหน้า และประเด็นหน้างาน' },
  ].map(item => `<button class="discipline-card" data-nav-category="${item.id}"><span class="discipline-index">${item.index} / ${catalog.filter(t => t.category === item.id).length} TOOLS</span><span class="discipline-icon">${icon(item.icon)}</span><h3>${item.title}</h3><p>${item.description}</p><span class="discipline-arrow" aria-hidden="true">${icon('external')}</span></button>`).join('')}</div></section>`;
}

export function projectSignalMarkup(signals) {
  return `<div class="project-document-meta"><span>${e(signals.document.projectCode || 'ยังไม่ระบุรหัสโครงการ')}</span><span>REV ${e(signals.document.revision)}</span></div><div class="project-metric-preview">${signals.metrics.map(metric => `<div><small>${e(metric.label)}</small><strong>${metric.value === null || !Number.isFinite(metric.value) ? 'ไม่ประเมิน' : e(f(metric.value, metric.digits ?? 2))} <span>${e(metric.unit || '')}</span></strong></div>`).join('')}</div><div class="project-review-strip"><span class="${signals.issue ? 'studio-attention' : ''}">${e(signals.label)}</span><small>ผู้ใช้ตรวจทาน ${signals.review.completed}/${signals.review.total}</small></div>`;
}

export function calculationOverview(result) {
  const checks = result.checks || [];
  const fail = checks.filter(c => c.pass === false).length;
  const unassessed = checks.filter(c => c.pass !== true && c.pass !== false).length;
  const pass = checks.filter(c => c.pass === true).length;
  return `<section class="studio-insight-summary ${fail || unassessed ? 'has-observation' : ''}" aria-label="สรุปการตรวจในแบบจำลอง"><span class="insight-icon">${icon(fail || unassessed ? 'info' : 'layers')}</span><div><span class="eyebrow">MODEL REVIEW</span><strong>${fail ? `มี ${fail} รายการที่ไม่ผ่านเกณฑ์ที่กำหนด` : unassessed ? `มี ${unassessed} รายการที่แบบจำลองไม่ประเมิน` : checks.length ? 'ผลตรวจตามแบบจำลองพร้อมให้ทบทวน' : 'ผลปริมาณพร้อมให้ตรวจทาน'}</strong><p>${checks.length ? `ผ่าน ${pass} · ไม่ผ่าน ${fail} · ไม่ประเมิน ${unassessed} — เฉพาะรายการในแบบจำลองนี้` : 'ตรวจหน่วย มิติ และสมมติฐานให้ตรงกับข้อมูลโครงการ'}</p></div><button class="link-button" data-calc-tab="methods">ดูขอบเขตและวิธีคิด ${icon('external')}</button></section>`;
}
