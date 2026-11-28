const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const context = {
  window: {},
  document: { querySelector: () => null },
  URL,
};
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'schema-builder.js'), 'utf8'),
  context,
  { filename: 'schema-builder.js' },
);
const { buildSchema } = context.window.HtechSchemaBuilder;

const organization = buildSchema({
  type: 'Organization',
  name: 'Example Studio',
  url: 'https://example.com',
  description: 'A small design studio.',
  logo: 'https://example.com/logo.png',
  sameAs: 'https://www.linkedin.com/company/example\nhttps://instagram.com/example',
});
assert.equal(organization.schema['@context'], 'https://schema.org');
assert.equal(organization.schema['@type'], 'Organization');
assert.equal(organization.schema.url, 'https://example.com/');
assert.equal(organization.schema.sameAs.length, 2);

const localBusiness = buildSchema({
  type: 'LocalBusiness',
  name: 'Example Workshop',
  url: 'https://example.com',
  telephone: '+234 800 000 0000',
  addressLocality: 'Lagos',
  addressCountry: 'Nigeria',
});
assert.equal(localBusiness.schema.address['@type'], 'PostalAddress');
assert.equal(localBusiness.schema.address.addressLocality, 'Lagos');
assert.ok(localBusiness.warnings.length > 0, 'partial address should be accompanied by guidance');

const professionalService = buildSchema({
  type: 'ProfessionalService',
  name: 'Example Consulting',
  url: 'https://example.com',
  email: 'hello@example.com',
  addressLocality: 'Lagos',
  addressCountry: 'Nigeria',
});
assert.equal(professionalService.schema['@type'], 'ProfessionalService');
assert.equal(professionalService.schema.address.addressLocality, 'Lagos');

const service = buildSchema({
  type: 'Service',
  name: 'Website design',
  url: 'https://example.com/services/web-design',
  providerType: 'LocalBusiness',
  providerName: 'Example Studio',
  providerUrl: 'https://example.com',
  serviceType: 'Web design',
  areaServed: 'Lagos, Nigeria',
});
assert.equal(service.schema.provider['@type'], 'LocalBusiness');
assert.equal(service.schema.provider.url, 'https://example.com/');
assert.equal(service.schema.areaServed, 'Lagos, Nigeria');

const website = buildSchema({ type: 'WebSite', name: 'Example', url: 'https://example.com' });
assert.equal(website.schema['@type'], 'WebSite');

const faq = buildSchema({
  type: 'FAQPage',
  name: 'Common questions',
  url: 'https://example.com/questions',
  faqs: [{ question: 'How do I start?', answer: 'Contact the team.' }],
});
assert.equal(faq.schema.mainEntity[0]['@type'], 'Question');
assert.equal(faq.schema.mainEntity[0].acceptedAnswer.text, 'Contact the team.');
assert.ok(faq.warnings.some((warning) => warning.includes('may not show FAQ')));

const breadcrumbs = buildSchema({
  type: 'BreadcrumbList',
  breadcrumbs: [
    { name: 'Home', url: 'https://example.com' },
    { name: 'Services', url: 'https://example.com/services' },
  ],
});
assert.equal(breadcrumbs.schema.itemListElement[1].position, 2);
assert.equal(breadcrumbs.schema.itemListElement[1].item, 'https://example.com/services');

assert.throws(
  () => buildSchema({ type: 'Organization', name: 'Example', url: 'javascript:alert(1)' }),
  /public http/,
);
assert.throws(
  () => buildSchema({ type: 'FAQPage', name: 'FAQs', faqs: [{ question: 'Incomplete?', answer: '' }] }),
  /Complete both/,
);
assert.throws(
  () => buildSchema({ type: 'BreadcrumbList', breadcrumbs: [{ name: 'Home', url: 'https://example.com' }] }),
  /at least two/,
);

console.log('Schema builder generation and validation tests passed.');
