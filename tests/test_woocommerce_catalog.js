const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'woocommerce-catalog.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'assets/js/woocommerce-catalog.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api/woocommerce-catalog.py'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/woocommerce-catalog.css'), 'utf8');
for (const marker of [
  'data-catalog-file', 'data-run-catalog', 'data-download-findings', 'data-download-template',
  'data-catalog-issues', 'data-catalog-summary', 'data-filter="high"'
]) assert(html.includes(marker), 'Catalog analyzer page should expose ' + marker + '.');
for (const term of [
  "fetch('/api/woocommerce-catalog'", "'text/csv; charset=utf-8'", 'woocommerce-catalog-findings.csv',
  'woocommerce-catalog-sample-template.csv', 'textContent', '25_000', "if (/^\\s*[=+\\-@]/.test(text))"
]) assert(script.includes(term), 'Catalog client should support ' + term + '.');
for (const term of [
  'MAX_CSV_BYTES = 3_000_000', 'MAX_ROWS = 5_000', 'duplicate_sku', 'missing_regular_price',
  'invalid_image_url', 'sale_not_below_regular', 'Cache-Control', 'no-store, max-age=0'
]) assert(api.includes(term), 'Catalog Python API should implement ' + term + '.');
assert(css.includes('@media(max-width:620px)'), 'Catalog analyzer should have mobile-responsive styles.');
assert(!script.includes('window.location.href ='), 'The catalog checker must not navigate to CSV-provided URLs.');

const pages = [
  'index.html', 'about.html', 'contact.html', 'portfolio.html', 'growth-check.html',
  'schema-builder.html', 'site-audit.html', 'migration-qa.html', 'projects/ausim-kids.html',
  'projects/daphne-lab.html', 'projects/esko-wheels.html', 'projects/lunaya.html',
  'projects/therapy-legal.html', 'projects/therapy-practice.html', 'projects/wedding-photography.html'
];
for (const file of pages) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const link = file.startsWith('projects/') ? '../woocommerce-catalog.html' : 'woocommerce-catalog.html';
  assert(source.includes('href="' + link + '"'), 'Free Tools footer should link to the catalog analyzer from ' + file + '.');
}
console.log('WooCommerce catalog analyzer UI, bounded API, exports and Free Tools navigation verified.');
