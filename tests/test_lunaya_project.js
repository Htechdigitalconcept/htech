const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const project = fs.readFileSync(path.join(root, 'projects/lunaya.html'), 'utf8');
const portfolio = fs.readFileSync(path.join(root, 'portfolio.html'), 'utf8');
const projectCss = fs.readFileSync(path.join(root, 'assets/css/lunaya-project.css'), 'utf8');

assert(project.includes('https://www.lunaya.info/'), 'Lunaya project page should link to the live store.');
assert(project.includes('../images/lunaya/lunaya-homepage-hero.webp'), 'Project page should show the supplied homepage hero image.');
assert(project.includes('../images/lunaya/lunaya-full-page.webp'), 'Project page should include the full-page screenshot.');
assert(project.includes('<details class="lunaya-fullpage">'), 'Full-page screenshot should be available in an accessible disclosure.');
assert(!project.includes('Screenshots for this project have not been supplied'), 'Remove the old placeholder once screenshots are available.');
assert(portfolio.includes('projects/lunaya.html') && portfolio.includes('images/lunaya/lunaya-homepage-hero.webp'), 'Lunaya should appear as a screenshot-backed portfolio card.');
const listStart = portfolio.indexOf('<div class="project-list');
const listEnd = portfolio.indexOf('<div class="work-foot', listStart);
assert(!portfolio.slice(listStart, listEnd).includes('Lunaya'), 'Lunaya should not be duplicated in the text-only project list.');
assert(projectCss.includes('@media(max-width:620px)'), 'Lunaya showcase should adapt to mobile layouts.');
for (const image of ['images/lunaya/lunaya-homepage-hero.webp', 'images/lunaya/lunaya-full-page.webp']) {
  const asset = fs.statSync(path.join(root, image));
  assert(asset.size < 500_000, 'Optimized Lunaya screenshot should stay lightweight: ' + image);
}
console.log('Lunaya project link, supplied screenshots and portfolio integration verified.');
