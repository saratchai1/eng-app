import { escapeHTML as e } from './utils.js';
import { icon } from './visuals.js';

export function reviewWorkspaceMarkup() {
  return `<section class="review-desk" aria-labelledby="review-desk-title">
    <header class="review-desk-heading"><div><span class="review-desk-kicker">REVIEW &amp; REVISION / WORKSPACE</span><h2 id="review-desk-title">จากข้อสังเกต สู่ฉบับที่ตรวจต่อได้</h2><p>บันทึกสิ่งที่ต้องแก้ คำตอบ และข้อมูลอ้างอิงของแต่ละฉบับไว้กับงาน</p></div><button type="button" class="button light compact" data-calc-tab="overview">${icon('ruler')} กลับไปแก้ข้อมูล</button></header>
    <dl class="review-desk-counts" aria-label="สถานะการตรวจทานของงาน"><div><dt>ประเด็นค้าง</dt><dd data-desk-count="outstanding">0</dd><small>เปิด / ตอบแล้ว / ต้องตรวจซ้ำ</small></div><div><dt>ต้องตรวจซ้ำ</dt><dd data-desk-count="needsReview">0</dd><small>ข้อมูลเปลี่ยนจากชุดที่ตอบหรือปิด</small></div><div><dt>ฉบับอ้างอิง</dt><dd data-desk-count="revisions">0</dd><small>ข้อมูลและเอกสาร ณ วันที่บันทึก</small></div></dl>
    <div class="review-desk-navigation" role="tablist" aria-label="งานตรวจทาน"><button type="button" role="tab" id="review-page-register" data-review-page="register" aria-selected="true" aria-controls="review-panel-register" tabindex="0"><span>01</span> ประเด็นตรวจทาน</button><button type="button" role="tab" id="review-page-revisions" data-review-page="revisions" aria-selected="false" aria-controls="review-panel-revisions" tabindex="-1"><span>02</span> ประวัติฉบับและผลต่าง</button></div>
    <div id="review-panel-register" class="review-desk-panel" role="tabpanel" aria-labelledby="review-page-register"><div id="calc-review-register"></div></div>
    <div id="review-panel-revisions" class="review-desk-panel" role="tabpanel" aria-labelledby="review-page-revisions" hidden><div id="calc-revisions"></div></div>
    <p class="review-desk-boundary">สถานะมาจากการบันทึกของผู้ใช้ในไฟล์งานนี้ ผู้รับผิดชอบเป็นข้อความที่ระบุเพื่อส่งต่อ ไม่มีการแจ้งเตือนหรือส่งงานให้บุคคลนั้นอัตโนมัติ</p>
  </section>`;
}

/** Keep navigation separate from record editors so a live refresh cannot erase a draft. */
export function mountReviewWorkspace(host) {
  const pages = ['register', 'revisions'];
  const show = (page, focus = false) => {
    if (!pages.includes(page)) return;
    host.querySelectorAll('[data-review-page]').forEach(button => {
      const active = button.dataset.reviewPage === page;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus({ preventScroll: true });
    });
    host.querySelectorAll('.review-desk-panel').forEach(panel => { panel.hidden = panel.id !== 'review-panel-' + page; });
  };
  const click = event => {
    const button = event.target.closest('[data-review-page]');
    if (button) show(button.dataset.reviewPage);
  };
  const keydown = event => {
    if (!event.target.matches('[data-review-page]')) return;
    const index = pages.indexOf(event.target.dataset.reviewPage);
    const next = event.key === 'ArrowRight' ? (index + 1) % pages.length : event.key === 'ArrowLeft' ? (index + pages.length - 1) % pages.length : event.key === 'Home' ? 0 : event.key === 'End' ? pages.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); show(pages[next], true); }
  };
  host.addEventListener('click', click);
  host.addEventListener('keydown', keydown);
  return {
    show,
    refresh(review = {}, revisions = {}) {
      for (const [key, value] of Object.entries({ outstanding: review.outstanding, needsReview: review.needsReview, revisions: revisions.total })) {
        host.querySelector('[data-desk-count="' + key + '"]').textContent = String(Number.isSafeInteger(value) && value >= 0 ? value : 0).padStart(2, '0');
      }
    },
    destroy() { host.removeEventListener('click', click); host.removeEventListener('keydown', keydown); },
  };
}

/** The handover note reports recorded facts; zero records never implies acceptance. */
export function reviewHandoverMarkup(review, revisions) {
  if (!review) return '';
  const count = key => Number.isSafeInteger(review[key]) && review[key] >= 0 ? review[key] : 0;
  const total = count('total'), outstanding = count('outstanding'), stale = count('needsReview');
  const revisionCount = Number.isSafeInteger(revisions?.total) && revisions.total >= 0 ? revisions.total : 0;
  if (!total && !revisionCount) return '';
  return `<section class="review-handover ${outstanding ? 'has-outstanding' : ''}" aria-label="สถานะประเด็นที่ส่งต่อ"><div><span class="review-desk-kicker">REVIEW RECORD / HANDOVER</span><h2>ประเด็นที่ส่งต่อพร้อมฉบับนี้</h2><p>${total ? `บันทึก ${total} ประเด็น · ยังติดตาม ${outstanding} · ผู้ใช้ระบุว่าปิดแล้ว ${count('closed')}` : 'ยังไม่มีรายการข้อสังเกตที่บันทึกไว้'}${stale ? ` · ต้องตรวจซ้ำ ${stale}` : ''}</p></div><dl><div><dt>ประเด็นค้าง</dt><dd>${outstanding}</dd></div><div><dt>ต้องแก้ก่อนส่ง</dt><dd>${count('criticalOutstanding')}</dd></div><div><dt>ฉบับอ้างอิง</dt><dd>${revisionCount}</dd></div></dl><p class="review-handover-note">${revisionCount ? `ฉบับที่เลือกเปรียบเทียบ: ${e(revisions.selectedRevision || 'ยังไม่ได้เลือก')} · ${revisions.includeInReport ? 'แนบประวัติและผลต่างท้ายรายงาน' : 'ยังไม่ได้แนบประวัติและผลต่างในรายงานนี้'}<br>` : ''}สถานะเป็นบันทึกของผู้ใช้ตามข้อมูลอ้างอิง ไม่ใช่การลงนามหรือการอนุมัติแบบ</p></section>`;
}
