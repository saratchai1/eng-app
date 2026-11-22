import test from 'node:test';
import assert from 'node:assert/strict';
import { loadReportStyles, standaloneReportHTML, reportNavigationMarkup } from '../src/report-reader.js';

test('offline report escapes identity and navigation, blocks execution and needs no app script', () => {
  const html = standaloneReportHTML({
    title: '</title><script>alert(1)</script>',
    content: '<section><h1 id="report-section-1">Test</h1><p>φMn = 210.27 kN·m</p></section>',
    sections: [{ id: 'report-section-1', label: '<img src=x onerror=alert(1)>' }],
    styles: 'body{color:green}',
  });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /style-src 'unsafe-inline'/);
  assert.match(html, /ข้อมูลคงที่/);
  assert.match(html, /φMn = 210.27 kN·m/);
  assert.doesNotMatch(html, /<script|<link|<img/);
  assert.match(html, /&lt;\/title&gt;&lt;script&gt;/);
  assert.match(html, /class="standalone-report printing-report"/);
});

test('embedded style cannot terminate its HTML container', () => {
  const html = standaloneReportHTML({ title: 'Report', content: '<p>Known report</p>', styles: '/* </style><script>bad</script> */' });
  assert.equal((html.match(/<\/style>/gi) || []).length, 1);
  assert.match(html, /<\\\/style>/);
});

test('report styles embed every local stylesheet and discard imports', async () => {
  const urls = [];
  const styles = await loadReportStyles(async url => {
    urls.push(String(url));
    return { ok: true, text: async () => String(url).endsWith('/styles.css') ? '@import url("./specials.css"); body{color:green}' : '/* embedded */' };
  });
  assert.equal(urls.length, 17);
  assert.ok(urls.every(url => /\/src\/[a-z-]+\.css$/.test(url)));
  assert.ok(urls.some(url => url.endsWith('/design-options.css')));
  assert.ok(urls.some(url => url.endsWith('/technical-diagrams.css')));
  assert.ok(urls.some(url => url.endsWith('/review-register.css')));
  assert.ok(urls.some(url => url.endsWith('/revisions.css')));
  assert.ok(urls.some(url => url.endsWith('/review-workspace.css')));
  assert.ok(urls.some(url => url.endsWith('/handover.css')));
  assert.ok(urls.some(url => url.endsWith('/handover-history.css')));
  assert.ok(urls.some(url => url.endsWith('/review-room.css')));
  assert.ok(urls.some(url => url.endsWith('/review-cycle.css')));
  assert.doesNotMatch(styles, /@import/);
  assert.match(styles, /body\{color:green\}/);
});

test('a missing stylesheet blocks export rather than silently producing incomplete reports', async () => {
  await assert.rejects(loadReportStyles(async url => ({ ok: !String(url).endsWith('/document-control.css'), text: async () => '' })), /โหลดรูปแบบรายงานไม่ครบ/);
});

test('report navigation uses buttons inside the app and escapes headings', () => {
  const markup = reportNavigationMarkup([{ id: 'report-section-1', label: '<b>Project</b>', level: 1 }]);
  assert.match(markup, /data-report-section="report-section-1"/);
  assert.match(markup, /&lt;b&gt;Project&lt;\/b&gt;/);
  assert.doesNotMatch(markup, /href=/);
  assert.match(markup, /select aria-label="ไปยังส่วนของรายงาน"/);
});
