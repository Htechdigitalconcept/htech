const assert = require('assert');
const fs = require('fs');
const path = require('path');
const jspdf = require('../assets/js/vendor/jspdf.umd.min.js');

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAGAQMAAADNIO3CAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAABlBMVEUXaeD////5V/n6AAAAAWJLR0QB/wIt3gAAAAd0SU1FB+oLGwcbB7neO3cAAAANSURBVAjXY2D+wICKADCNBbMNd1HPAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTExLTI3VDA3OjI3OjA3KzAwOjAw50l1sAAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0xMS0yN1QwNzoyNzowNyswMDowMJYUzQwAAAAASUVORK5CYII=';
let requestedLibrary = '';
let downloadedName = '';
jspdf.jsPDF.prototype.save = function (name) { downloadedName = name; return this; };
global.window = { location: { href: 'https://htech.example/site-audit.html' } };
global.document = {
  createElement(tag) {
    if (tag === 'script') return {};
    assert.strictEqual(tag, 'canvas');
    return { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => png };
  },
  head: { appendChild(script) {
    requestedLibrary = script.src;
    global.window.jspdf = jspdf;
    script.onload();
  } }
};
global.Image = class {
  constructor() { this.naturalWidth = 523; this.naturalHeight = 191; }
  set src(_value) { this.onload(); }
};
require('../assets/js/site-audit-pdf.js');

async function verify() {
  const report = {
    domain: 'example.com',
    summary: { pages_scanned: 12, urls_discovered: 38, high: 1, medium: 2, low: 3, sitemap_found: true, robots_disallow_rules: 2, limited_by_pages: true },
    issues: Array.from({ length: 24 }, (_, i) => ({
      severity: ['high', 'medium', 'low'][i % 3],
      title: 'Finding ' + (i + 1) + ': duplicate SEO title',
      url: 'https://example.com/page-' + (i + 1),
      message: 'This issue has useful audit evidence that should be retained in the downloadable report.',
      recommendation: 'Write a distinct title that describes this page and its purpose.'
    })),
    pages: Array.from({ length: 12 }, (_, i) => ({
      title: 'Audited page ' + (i + 1), url: 'https://example.com/page-' + (i + 1), status: 200,
      title_length: 62, h1_count: 1, images_missing_alt: 2, has_json_ld: i % 2 === 0, redirects: 0
    })),
    scope: 'Bounded public HTML scan: up to twelve pages, with no JavaScript execution.'
  };

  const pdf = await window.SiteAuditPdf.download(report);
  assert(pdf && Buffer.from(pdf.output('arraybuffer')).subarray(0, 5).toString() === '%PDF-', 'The exporter should create a valid PDF document.');
  assert(pdf.getNumberOfPages() >= 3, 'Long reports should paginate findings and the page inventory.');
  assert(requestedLibrary.endsWith('/assets/js/vendor/jspdf.umd.min.js'), 'The locally bundled jsPDF asset should be used.');
  assert(fs.readFileSync(path.join(__dirname, '..', 'assets/js/site-audit-pdf.js'), 'utf8').includes("+ '-seo-audit.pdf'"), 'The generated PDF should have a safe audit-specific filename.');
  const renderedContent = JSON.stringify(pdf.internal.pages);
  assert(renderedContent.includes('Finding 1: duplicate SEO title'), 'The PDF should contain the full finding details.');
  assert(renderedContent.includes('Audited page 12'), 'The PDF should include the crawl inventory.');
  assert(renderedContent.includes('Scope and limitations'), 'The PDF should explain the scan scope.');

  // Also create the doc directly from the generated browser download through a test click hook above.
  assert.strictEqual(typeof window.SiteAuditPdf.download, 'function', 'The PDF exporter should be available to the audit UI.');
  const html = fs.readFileSync(path.join(__dirname, '..', 'site-audit.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'assets/js/site-audit.js'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets/js/site-audit-pdf.js'), 'utf8');
  assert(html.includes('data-export-pdf') && html.includes('Download branded PDF'), 'The report should expose a branded PDF control.');
  assert(app.includes("app.querySelector('[data-export-pdf]').addEventListener('click', exportPdf)"), 'The PDF button should be wired to the current report.');
  for (const phrase of ['Advanced Site Audit', 'Prioritized findings', 'Crawl inventory', 'Scope and limitations', 'htechdigitalconcept@gmail.com', 'https://www.linkedin.com/in/ademolahabeeb/']) {
    assert(source.includes(phrase), 'The branded PDF should include: ' + phrase);
  }
  assert(source.includes('images/htech-logo.webp') && source.includes('WEBSITES THAT TURN VISITORS INTO CUSTOMERS'), 'The PDF should use the Growth Checker brand assets and language.');
  console.log('Advanced Site Auditor PDF export wiring and branded report content verified.');
}

verify().catch((error) => { console.error(error); process.exitCode = 1; });
