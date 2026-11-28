(function (global) {
  'use strict';

  var supportedTypes = ['Organization', 'LocalBusiness', 'ProfessionalService', 'Service', 'WebSite', 'FAQPage', 'BreadcrumbList'];

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function absoluteUrl(value, label, required) {
    var raw = clean(value);
    if (!raw) {
      if (required) throw new Error(label + ' is required.');
      return '';
    }
    var parsed;
    try { parsed = new URL(raw); }
    catch (error) { throw new Error('Enter a complete URL for ' + label + ', starting with https:// or http://.'); }
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error(label + ' must be a public http:// or https:// URL without sign-in details.');
    }
    if (parsed.hostname.indexOf('.') < 0 || parsed.hostname === 'localhost') {
      throw new Error(label + ' must use a public website domain.');
    }
    return parsed.href;
  }

  function addIf(target, key, value) {
    var normalized = clean(value);
    if (normalized) target[key] = normalized;
  }

  function addUrlIf(target, key, value, label) {
    var normalized = absoluteUrl(value, label, false);
    if (normalized) target[key] = normalized;
  }

  function buildSchema(data) {
    data = data || {};
    var type = clean(data.type);
    if (supportedTypes.indexOf(type) === -1) throw new Error('Choose one of the supported schema types.');

    var schema = { '@context': 'https://schema.org', '@type': type };
    var warnings = [];

    if (type === 'BreadcrumbList') {
      var crumbs = (Array.isArray(data.breadcrumbs) ? data.breadcrumbs : []).map(function (crumb) {
        return { name: clean(crumb && crumb.name), item: absoluteUrl(crumb && crumb.url, 'Each breadcrumb URL', false) };
      }).filter(function (crumb) { return crumb.name || crumb.item; });
      if (crumbs.length < 2) throw new Error('Add at least two breadcrumb labels with their page URLs.');
      crumbs.forEach(function (crumb, index) {
        if (!crumb.name) throw new Error('Add a label for breadcrumb ' + (index + 1) + '.');
        if (!crumb.item) throw new Error('Add a valid URL for breadcrumb “' + crumb.name + '”.');
      });
      schema.itemListElement = crumbs.map(function (crumb, index) {
        return { '@type': 'ListItem', position: index + 1, name: crumb.name, item: crumb.item };
      });
      return { schema: schema, warnings: warnings };
    }

    var name = clean(data.name);
    if (!name) throw new Error('Add the business, website, service or page name.');
    schema.name = name;

    if (type !== 'FAQPage') {
      schema.url = absoluteUrl(data.url, 'Website or page URL', true);
    } else {
      addUrlIf(schema, 'url', data.url, 'Page URL');
    }
    addIf(schema, 'description', data.description);

    if (type === 'Organization' || type === 'LocalBusiness' || type === 'ProfessionalService') {
      addUrlIf(schema, 'logo', data.logo, 'Logo URL');
      var profiles = clean(data.sameAs).split(/[\n,]+/).map(function (item) { return item.trim(); }).filter(Boolean);
      if (profiles.length) schema.sameAs = profiles.map(function (item) { return absoluteUrl(item, 'Profile URL', true); });
    }

    if (type === 'LocalBusiness' || type === 'ProfessionalService') {
      var businessId = schema.url.replace(/\/$/, '') + '#business';
      schema['@id'] = businessId;
      addIf(schema, 'telephone', data.telephone);
      var businessEmail = clean(data.email);
      if (businessEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessEmail)) throw new Error('Enter a valid business email address or leave it blank.');
      addIf(schema, 'email', businessEmail);
      addIf(schema, 'priceRange', data.priceRange);
      var addressFields = {
        streetAddress: 'streetAddress',
        addressLocality: 'addressLocality',
        addressRegion: 'addressRegion',
        postalCode: 'postalCode',
        addressCountry: 'addressCountry'
      };
      var address = { '@type': 'PostalAddress' };
      Object.keys(addressFields).forEach(function (field) { addIf(address, field, data[field]); });
      if (Object.keys(address).length > 1) {
        schema.address = address;
        ['streetAddress', 'addressLocality', 'addressCountry'].forEach(function (field) {
          if (!address[field]) warnings.push('Consider adding ' + field + ' if it is publicly available and relevant.');
        });
      } else {
        warnings.push('A complete public address may be needed for some local-business search features.');
      }
    }

    if (type === 'Service') {
      addIf(schema, 'serviceType', data.serviceType);
      addIf(schema, 'areaServed', data.areaServed);
      var providerName = clean(data.providerName);
      if (!providerName) throw new Error('Add the name of the service provider.');
      var requestedProviderType = clean(data.providerType);
      var providerType = requestedProviderType === 'LocalBusiness' || requestedProviderType === 'ProfessionalService' ? requestedProviderType : 'Organization';
      var provider = { '@type': providerType, name: providerName };
      addUrlIf(provider, 'url', data.providerUrl, 'Provider website');
      schema.provider = provider;
    }

    if (type === 'FAQPage') {
      var faqs = (Array.isArray(data.faqs) ? data.faqs : []).map(function (faq) {
        return { question: clean(faq && faq.question), answer: clean(faq && faq.answer) };
      }).filter(function (faq) { return faq.question || faq.answer; });
      if (!faqs.length) throw new Error('Add at least one complete question and answer.');
      faqs.forEach(function (faq, index) {
        if (!faq.question || !faq.answer) throw new Error('Complete both the question and answer in pair ' + (index + 1) + '.');
      });
      schema.mainEntity = faqs.map(function (faq) {
        return {
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer }
        };
      });
      warnings.push('Only mark up questions and answers that are visible to visitors on this page. Search engines may not show FAQ rich results.');
    }

    return { schema: schema, warnings: warnings };
  }

  global.HtechSchemaBuilder = { buildSchema: buildSchema };

  var app = document.querySelector('[data-schema-app]');
  if (!app) return;

  var form = app.querySelector('[data-schema-form]');
  var typeSelect = app.querySelector('[data-schema-type]');
  var output = app.querySelector('[data-schema-output]');
  var status = app.querySelector('[data-schema-status]');
  var copyButton = app.querySelector('[data-copy-schema]');
  var downloadButton = app.querySelector('[data-download-schema]');
  var nameLabel = app.querySelector('[data-schema-name-label]');
  var currentJson = '';

  var typeNames = {
    Organization: 'Organization name',
    LocalBusiness: 'Business name',
    ProfessionalService: 'Professional service business name',
    Service: 'Service name',
    WebSite: 'Website name',
    FAQPage: 'Page title or label',
    BreadcrumbList: 'Page title or label'
  };
  var typePlaceholders = {
    Organization: 'Your organization name',
    LocalBusiness: 'Your public business name',
    ProfessionalService: 'Your professional service business name',
    Service: 'Name of the service',
    WebSite: 'Name of your website',
    FAQPage: 'Title of the FAQ page',
    BreadcrumbList: 'Page title or label'
  };

  function fieldValue(name) {
    var field = form.elements.namedItem(name);
    return field ? field.value : '';
  }

  function readForm() {
    var faqs = Array.prototype.slice.call(app.querySelectorAll('[data-faq-item]')).map(function (item) {
      return {
        question: item.querySelector('[data-faq-question]').value,
        answer: item.querySelector('[data-faq-answer]').value
      };
    });
    var breadcrumbs = Array.prototype.slice.call(app.querySelectorAll('[data-breadcrumb-item]')).map(function (item) {
      return {
        name: item.querySelector('[data-breadcrumb-name]').value,
        url: item.querySelector('[data-breadcrumb-url]').value
      };
    });
    return {
      type: fieldValue('type'),
      name: fieldValue('name'),
      url: fieldValue('url'),
      description: fieldValue('description'),
      logo: fieldValue('logo'),
      sameAs: fieldValue('sameAs'),
      telephone: fieldValue('telephone'),
      email: fieldValue('email'),
      priceRange: fieldValue('priceRange'),
      streetAddress: fieldValue('streetAddress'),
      addressLocality: fieldValue('addressLocality'),
      addressRegion: fieldValue('addressRegion'),
      postalCode: fieldValue('postalCode'),
      addressCountry: fieldValue('addressCountry'),
      serviceType: fieldValue('serviceType'),
      areaServed: fieldValue('areaServed'),
      providerType: fieldValue('providerType'),
      providerName: fieldValue('providerName'),
      providerUrl: fieldValue('providerUrl'),
      faqs: faqs,
      breadcrumbs: breadcrumbs
    };
  }

  function setStatus(message, kind) {
    status.textContent = message;
    status.className = 'schema-status' + (kind ? ' schema-status--' + kind : '');
  }

  function invalidateOutput() {
    currentJson = '';
    output.value = '';
    copyButton.disabled = true;
    downloadButton.disabled = true;
  }

  function updateTypeFields() {
    var selected = typeSelect.value;
    Array.prototype.forEach.call(app.querySelectorAll('[data-schema-fields]'), function (section) {
      var allowed = section.getAttribute('data-schema-fields').split(',');
      section.hidden = allowed.indexOf(selected) === -1;
    });
    nameLabel.textContent = typeNames[selected] || 'Name';
    app.querySelector('#schema-name').placeholder = typePlaceholders[selected] || 'Enter a name';
    var nameField = app.querySelector('[data-schema-name-field]');
    var urlField = app.querySelector('[data-schema-url-field]');
    var descriptionField = app.querySelector('[data-schema-description-field]');
    nameField.hidden = selected === 'BreadcrumbList';
    urlField.hidden = selected === 'BreadcrumbList';
    descriptionField.hidden = selected === 'FAQPage' || selected === 'BreadcrumbList';
    invalidateOutput();
    setStatus('', '');
  }

  function makeRepeatItem(template, list, selector, maximum) {
    var existing = list.querySelectorAll(selector).length;
    if (existing >= maximum) {
      setStatus('This tool supports up to ' + maximum + ' entries in this section.', 'error');
      return;
    }
    var clone = template.content.cloneNode(true);
    var item = clone.querySelector(selector);
    var suffix = String(Date.now()) + String(existing + 1);
    Array.prototype.forEach.call(item.querySelectorAll('input, textarea'), function (field) {
      var oldId = field.id;
      var base = oldId.replace(/-[^-]+$/, '');
      field.id = base + '-' + suffix;
      var label = item.querySelector('label[for="' + oldId + '"]');
      if (label) label.htmlFor = field.id;
    });
    list.appendChild(clone);
  }

  function handleRepeatClick(event) {
    var button = event.target.closest('button');
    if (!button) return;
    if (button.matches('[data-add-faq]')) {
      makeRepeatItem(app.querySelector('#faq-row-template'), app.querySelector('[data-faq-list]'), '[data-faq-item]', 10);
    } else if (button.matches('[data-add-breadcrumb]')) {
      makeRepeatItem(app.querySelector('#breadcrumb-row-template'), app.querySelector('[data-breadcrumb-list]'), '[data-breadcrumb-item]', 10);
    } else if (button.matches('[data-remove-faq]')) {
      var faqItems = app.querySelectorAll('[data-faq-item]');
      if (faqItems.length > 1) button.closest('[data-faq-item]').remove();
      else button.closest('[data-faq-item]').querySelectorAll('input, textarea').forEach(function (field) { field.value = ''; });
    } else if (button.matches('[data-remove-breadcrumb]')) {
      var crumbItems = app.querySelectorAll('[data-breadcrumb-item]');
      if (crumbItems.length > 1) button.closest('[data-breadcrumb-item]').remove();
      else button.closest('[data-breadcrumb-item]').querySelectorAll('input, textarea').forEach(function (field) { field.value = ''; });
    } else {
      return;
    }
    invalidateOutput();
    setStatus('', '');
  }

  function serialize(result) {
    return JSON.stringify(result.schema, null, 2).replace(/</g, '\\u003c');
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    invalidateOutput();
    try {
      var result = buildSchema(readForm());
      currentJson = serialize(result);
      output.value = currentJson;
      copyButton.disabled = false;
      downloadButton.disabled = false;
      var message = 'JSON-LD created. Check that every detail matches the page before publishing.';
      if (result.warnings.length) message += ' ' + result.warnings.join(' ');
      setStatus(message, result.warnings.length ? 'notice' : 'success');
      output.focus();
    } catch (error) {
      setStatus(error.message || 'Check the fields and try again.', 'error');
      status.focus();
    }
  });

  copyButton.addEventListener('click', function () {
    if (!currentJson) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(currentJson).then(function () { setStatus('JSON-LD copied to your clipboard.', 'success'); }).catch(function () {
        output.focus(); output.select();
        setStatus('Select the highlighted code and copy it.', 'notice');
      });
    } else {
      output.focus(); output.select();
      try {
        if (document.execCommand('copy')) setStatus('JSON-LD copied to your clipboard.', 'success');
        else setStatus('Select the highlighted code and copy it.', 'notice');
      } catch (error) { setStatus('Select the highlighted code and copy it.', 'notice'); }
    }
  });

  downloadButton.addEventListener('click', function () {
    if (!currentJson) return;
    var blob = new Blob([currentJson + '\n'], { type: 'application/ld+json;charset=utf-8' });
    var objectUrl = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = typeSelect.value.toLowerCase() + '-schema.jsonld';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    setStatus('Your .jsonld file has been downloaded.', 'success');
  });

  form.addEventListener('reset', function () {
    window.setTimeout(function () {
      Array.prototype.slice.call(app.querySelectorAll('[data-faq-item], [data-breadcrumb-item]')).slice(1).forEach(function (item) { item.remove(); });
      updateTypeFields();
      invalidateOutput();
      setStatus('Form cleared.', 'success');
    }, 0);
  });

  app.addEventListener('click', handleRepeatClick);
  form.addEventListener('input', function () {
    if (currentJson) {
      invalidateOutput();
      setStatus('Your fields changed. Generate the markup again to update the output.', 'notice');
    }
  });
  typeSelect.addEventListener('change', updateTypeFields);
  updateTypeFields();
})(window);
