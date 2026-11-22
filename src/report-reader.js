import { escapeHTML as e } from './utils.js';

const STYLE_FILES = ['styles', 'specials', 'workflows', 'refinements', 'studio', 'sensitivity', 'document-control', 'technical-diagrams', 'design-options', 'report-reader', 'review-register', 'revisions', 'review-workspace', 'handover', 'handover-history', 'review-room', 'review-cycle'];

/** Headings come from the application's escaped report renderers, not imported HTML. */
export function indexReportContent(content, ownerDocument = document) {
  const template = ownerDocument.createElement('template');
  template.innerHTML = content;
  for (const table of template.content.querySelectorAll('table')) {
    if (table.closest('.table-scroll, .options-table-wrap, .study-table-wrap, .report-table-scroll')) continue;
    const wrapper = ownerDocument.createElement('div');
    wrapper.className = 'report-table-scroll';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'ตารางรายงาน — เลื่อนแนวนอนเพื่อดูครบทุกคอลัมน์');
    table.before(wrapper);
    wrapper.append(table);
  }
  const headings = [...template.content.querySelectorAll('.document-cover h1, .document-report-body h2, .document-report-body h3')];
  const sections = headings.map((heading, index) => {
    const id = 'report-section-' + (index + 1);
    heading.id = id;
    heading.tabIndex = -1;
    return { id, label: index === 0 ? 'หน้าปกและข้อมูลเอกสาร' : heading.textContent.trim(), level: heading.tagName === 'H3' ? 2 : 1 };
  });
  return { content: template.innerHTML, sections };
}

export function reportNavigationMarkup(sections) {
  return `<aside class="report-index" aria-label="สารบัญรายงาน"><div class="report-index-label"><span>DOCUMENT MAP</span><strong>สารบัญรายงาน</strong></div><nav>${sections.map((section, index) => `<button type="button" class="report-index-link level-${section.level}" data-report-section="${e(section.id)}"${index === 0 ? ' aria-current="location"' : ''}><span>${String(index + 1).padStart(2, '0')}</span>${e(section.label)}</button>`).join('')}</nav><p>ผลคำนวณและข้อมูลเอกสาร<br>ตามข้อมูลและเวลาที่ระบุ</p></aside><label class="report-mobile-index"><span>ไปยังส่วนของรายงาน</span><select aria-label="ไปยังส่วนของรายงาน">${sections.map(section => `<option value="${e(section.id)}">${e(section.label)}</option>`).join('')}</select></label>`;
}

export function mountReportReader(modal) {
  const page = modal.querySelector('.report-preview');
  const select = modal.querySelector('.report-mobile-index select');
  const go = id => {
    const target = page.querySelector('#' + id);
    if (!target) return;
    page.scrollTo({ top: target.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop - 28, behavior: 'auto' });
    target.focus({ preventScroll: true });
    modal.querySelectorAll('[data-report-section]').forEach(button => {
      if (button.dataset.reportSection === id) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
    });
    if (select) select.value = id;
  };
  const click = event => {
    const button = event.target.closest('[data-report-section]');
    if (button) go(button.dataset.reportSection);
  };
  const change = () => go(select.value);
  modal.addEventListener('click', click);
  select?.addEventListener('change', change);
  return () => { modal.removeEventListener('click', click); select?.removeEventListener('change', change); };
}

export async function loadReportStyles(fetcher = fetch) {
  const styles = await Promise.all(STYLE_FILES.map(async name => {
    const response = await fetcher(new URL('./' + name + '.css', import.meta.url));
    if (!response.ok) throw new Error('โหลดรูปแบบรายงานไม่ครบ กรุณาลองดาวน์โหลดอีกครั้ง');
    return response.text();
  }));
  // All stylesheet files are embedded explicitly. Offline reports never need @import requests.
  return styles.join('\n').replace(/@import\s+(?:url\([^)]*\)|["'][^"']*["'])\s*;/gi, '');
}

/** A frozen technical deliverable: no app scripts, account, network, or recalculation. */
export function standaloneReportHTML({ title, content, sections = [], styles }) {
  const safeStyles = String(styles).replace(/<\/style/gi, '<\\/style');
  const toc = sections.map(section => `<a href="#${e(section.id)}">${e(section.label)}</a>`).join('');
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'"><title>${e(title)} — ENG APP technical report</title><style>${safeStyles}</style></head><body class="standalone-report printing-report"><header class="standalone-toolbar"><div><strong>ENG APP / TECHNICAL REPORT</strong><span>สำเนารายงาน ณ เวลาที่ส่งออก · ใช้ Ctrl / ⌘ + P เพื่อพิมพ์หรือบันทึก PDF</span></div><p>ข้อมูลคงที่ · เปิดอ่านได้ออฟไลน์</p></header><nav class="standalone-toc" aria-label="สารบัญรายงาน">${toc}</nav><main id="print-root" class="report-preview standalone-page">${content}</main><footer class="standalone-foot">รายงานนี้เป็นสำเนาผลคำนวณตามข้อมูลและเวลาที่ระบุ การแก้แบบต้องกลับไปคำนวณและส่งออกรายงานใหม่จาก ENG APP</footer></body></html>`;
}
