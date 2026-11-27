const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(require('path').join(__dirname, '..', 'assets/js/growth-check.js'), 'utf8');

function readDeclaration(name, nextMarker) {
  const start = source.indexOf('var ' + name + ' = ');
  const end = source.indexOf(nextMarker, start);
  assert(start >= 0 && end > start, 'Could not locate ' + name + ' in growth-check.js');
  const declaration = source.slice(start, end);
  return vm.runInNewContext(declaration + '\n' + name);
}

const industryGoals = readDeclaration('industryGoalOptions', '\n\n  function updateGoalsForIndustry');
const plans = readDeclaration('goalPlans', '\n\n  function buildBlueprint');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'growth-check.html'), 'utf8');

assert.match(html, /data-growth-entry[^>]*aria-labelledby/, 'The initial step should ask about the visitor’s starting point.');
assert.match(html, /data-growth-scan-form[^>]*hidden/, 'The website scan form must stay hidden until selected.');
assert.match(html, /data-growth-blueprint-form hidden/, 'The no-website path must stay hidden until selected.');
assert.match(html, /data-growth-goal-fieldset hidden/, 'Business goals should remain hidden until a business type is selected.');

assert.strictEqual(Object.keys(industryGoals).length, 8, 'Every supported business type should have a goal profile.');
for (const [industry, profile] of Object.entries(industryGoals)) {
  assert(profile.goals.length >= 2, industry + ' should have multiple relevant goals.');
  for (const goal of profile.goals) {
    assert(plans[goal.key], industry + ' references an unknown blueprint plan: ' + goal.key);
    assert(goal.title && goal.description, industry + ' goal cards need clear, tailored copy.');
  }
}
assert(!industryGoals.retail.goals.some((goal) => goal.key === 'bookings'), 'Retail should not be offered appointment bookings.');
assert(industryGoals.hospitality.goals.some((goal) => /reservation/i.test(goal.title)), 'Hospitality should have a reservation goal.');
assert(industryGoals['health-practice'].goals.some((goal) => goal.key === 'bookings'), 'Health practices should have an appointment goal.');

console.log('Growth Check business-goal profiles passed.');
