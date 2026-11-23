// Keep runtime assets pinned to the version in package-lock.json.
const fs = require('node:fs');
fs.mkdirSync('vendor/gsap', { recursive: true });
for (const name of ['gsap.min.js', 'ScrollTrigger.min.js']) {
  const source = fs.readFileSync(`node_modules/gsap/dist/${name}`, 'utf8');
  fs.writeFileSync(`vendor/gsap/${name}`, source.replace(/\/\/# sourceMappingURL=.*$/gm, ''));
}
fs.copyFileSync('node_modules/gsap/README.md', 'vendor/gsap/README.md');
