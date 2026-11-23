const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');

test('essential content is present before JavaScript runs', () => {
  assert.equal((html.match(/<article class="case">/g) || []).length, 5);
  for (const text of ['Websites and', 'online stores', 'that bring you', 'customers.']) {
    assert.ok(html.includes(`>${text}</span>`));
  }
  assert.match(html, /data-n="30" data-s="\+">30\+/);
});
test('local references and section anchors resolve', () => {
  for (const [, ref] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (ref.startsWith('#')) assert.ok(html.includes(`id="${ref.slice(1)}"`), ref);
    else if (!ref.startsWith('https://')) assert.ok(fs.existsSync(ref), ref);
  }
});
test('inline JavaScript parses', () => {
  for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(script);
});
test('vendored runtime matches pinned upstream package', () => {
  for (const file of ['gsap.min.js', 'ScrollTrigger.min.js']) {
    const source = fs.readFileSync(`node_modules/gsap/dist/${file}`, 'utf8');
    assert.equal(fs.readFileSync(`vendor/gsap/${file}`, 'utf8'), source.replace(/\/\/# sourceMappingURL=.*$/gm, ''));
  }
});
