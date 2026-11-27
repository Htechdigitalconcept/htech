const assert = require('assert');
const path = require('path');

const jspdf = require('../assets/js/vendor/jspdf.umd.min.js');
global.window = { location: { href: 'https://htech.example/growth-check.html' } };
let requestedPdfLibrary = '';
const testPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAGAQMAAADNIO3CAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAABlBMVEUXaeD////5V/n6AAAAAWJLR0QB/wIt3gAAAAd0SU1FB+oLGwcbB7neO3cAAAANSURBVAjXY2D+wICKADCNBbMNd1HPAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTExLTI3VDA3OjI3OjA3KzAwOjAw50l1sAAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0xMS0yN1QwNzoyNzowNyswMDowMJYUzQwAAAAASUVORK5CYII=';
global.document = {
  createElement(tag) {
    if (tag === 'script') return {};
    assert.strictEqual(tag, 'canvas');
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toDataURL: () => testPng
    };
  },
  head: {
    appendChild(script) {
      requestedPdfLibrary = script.src;
      global.window.jspdf = jspdf;
      if (script.onload) script.onload();
    }
  }
};
global.Image = class ImageWithCanvas {
  constructor() { this.naturalWidth = 523; this.naturalHeight = 191; }
  set src(_value) {
    if (this.onload) this.onload();
  }
};

require('../assets/js/growth-proposal.js');

async function verify() {
  const scanReport = {
    domain: 'example.com',
    final_url: 'https://example.com/',
    score: 72,
    rating: 'Room to improve',
    summary: { good: 5, attention: 4, priority: 2 },
    scanned_pages: [
      { title: 'Home', url: 'https://example.com/' },
      { title: 'Services', url: 'https://example.com/services/' },
      { title: 'Contact', url: 'https://example.com/contact/' }
    ],
    checks: Array.from({ length: 11 }, (_, index) => ({
      id: 'check-' + index,
      category: index % 2 ? 'Conversion' : 'Search & discovery',
      title: 'Website finding ' + (index + 1),
      status: index < 5 ? 'good' : index < 9 ? 'attention' : 'priority',
      evidence: 'A sample, evidence-backed observation for this website check.',
      recommendation: 'Review this improvement with the business and agree a practical next step.'
    })),
    scope: 'This is a limited public HTML scan, not a complete audit.'
  };
  const scanDoc = await window.GrowthProposal.createPdf({ type: 'scan', report: scanReport }, 'Example Business', false);
  const scanBytes = Buffer.from(scanDoc.output('arraybuffer'));
  assert(scanBytes.subarray(0, 5).toString() === '%PDF-', 'Scan proposal should be a valid PDF.');
  assert(scanDoc.getNumberOfPages() >= 2, 'Longer scan reports should paginate without clipping findings.');
  const scanPdfText = scanDoc.output();
  assert(scanPdfText.includes('/Annots') && scanPdfText.includes('mailto:htechdigitalconcept@gmail.com'), 'PDF footer should include a clickable email link.');
  assert(scanPdfText.includes('https://www.upwork.com/freelancers/~01b7d7e1d5bc855117'), 'PDF footer should include the Upwork link.');
  assert(scanPdfText.includes('https://www.linkedin.com/in/ademolahabeeb/'), 'PDF footer should include the LinkedIn link.');

  const blueprintDoc = await window.GrowthProposal.createPdf({
    type: 'blueprint',
    industry: 'retail or product business',
    goalTitle: 'Sell products online',
    goalDescription: 'Show products and accept orders.',
    plan: {
      label: 'sell products online',
      promise: 'Give customers a clear route to purchase.',
      pages: [['Storefront', 'Show the product range.'], ['Product pages', 'Explain each item.'], ['Checkout', 'Make ordering easy.']],
      features: ['Secure payments', 'Order confirmations'],
      why: ['A direct sales channel', 'Better product discovery', 'Clear customer support']
    }
  }, 'Example Retail Co', false);
  const blueprintBytes = Buffer.from(blueprintDoc.output('arraybuffer'));
  assert(blueprintBytes.subarray(0, 5).toString() === '%PDF-', 'Blueprint proposal should be a valid PDF.');
  assert(blueprintDoc.getNumberOfPages() >= 1, 'Blueprint proposal should contain a page.');

  const source = require('fs').readFileSync(path.join(__dirname, '..', 'assets/js/growth-proposal.js'), 'utf8').toLowerCase();
  assert(requestedPdfLibrary.endsWith('/assets/js/vendor/jspdf.umd.min.js'), 'The PDF library should load locally only when a PDF is requested.');
  assert(source.includes('input.required = true'), 'The PDF must require a business name.');
  assert(source.includes('button.disabled = true'), 'The PDF download must not be enabled before the name is entered.');
  for (const detail of [
    'websites that turn visitors into customers',
    'images/htech-logo-transparent.webp',
    'htechdigitalconcept@gmail.com',
    'https://www.upwork.com/freelancers/~01b7d7e1d5bc855117',
    'https://www.linkedin.com/in/ademolahabeeb/'
  ]) assert(source.includes(detail), 'PDF must include brand detail: ' + detail);
  console.log('Growth Check scan and blueprint PDFs generated successfully.');
}

verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
