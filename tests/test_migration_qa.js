const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'migration-qa.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'assets/js/migration-qa.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api/migration-qa.py'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/migration-qa.css'), 'utf8');

for (const marker of [
  'data-old-urls', 'data-new-urls', 'data-redirects', 'data-old-file', 'data-new-file', 'data-redirect-file',
  'data-download-vercel', 'data-download-apache', 'data-download-nginx', 'data-download-csv', 'data-download-findings'
]) assert(html.includes(marker), 'Migration Lab page should include ' + marker + '.');
for (const detail of [
  "fetch('/api/migration-qa'", 'text/csv', 'vercel-redirects.json', '.htaccess-migration-rules.txt',
  'nginx-migration-rules.conf', 'migration-qa-findings.csv', 'textContent'
]) assert(script.includes(detail), 'Migration Lab client should support ' + detail + '.');
for (const feature of [
  'MAX_URLS_PER_LIST = 5_000', 'redirect_loop', 'redirect_chain', 'missing_destination',
  'duplicate_redirect_source', 'RewriteRule', 'server_name', 'permanent'
]) assert(api.includes(feature), 'Python migration API should implement ' + feature + '.');
assert(css.includes('@media(max-width:620px)'), 'Migration Lab layout should have mobile rules.');
assert(!script.includes('window.location.href ='), 'The migration tool should not navigate to user-provided URLs.');

const pageFiles = [
  'index.html', 'about.html', 'contact.html', 'portfolio.html', 'growth-check.html',
  'schema-builder.html', 'site-audit.html', 'projects/ausim-kids.html', 'projects/daphne-lab.html',
  'projects/esko-wheels.html', 'projects/lunaya.html', 'projects/therapy-legal.html',
  'projects/therapy-practice.html', 'projects/wedding-photography.html'
];
for (const file of pageFiles) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const link = file.startsWith('projects/') ? '../migration-qa.html' : 'migration-qa.html';
  assert(source.includes('href="' + link + '"'), 'Free Tools footer should link to Migration QA from ' + file + '.');
}
console.log('Migration QA frontend, exports, Python analysis and Free Tools navigation verified.');
