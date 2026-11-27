(function () {
  'use strict';

  var app = document.querySelector('[data-growth-app]');
  if (!app) return;

  var entryPanel = app.querySelector('[data-growth-entry]');
  var pathChoices = Array.prototype.slice.call(app.querySelectorAll('[data-growth-path-choice]'));
  var pathNav = app.querySelector('[data-growth-path-nav]');
  var pathLabel = app.querySelector('[data-growth-path-label]');
  var changePathButton = app.querySelector('[data-growth-change-path]');
  var scanForm = app.querySelector('[data-growth-scan-form]');
  var blueprintForm = app.querySelector('[data-growth-blueprint-form]');
  var industrySelect = app.querySelector('#blueprint-industry');
  var goalFieldset = app.querySelector('[data-growth-goal-fieldset]');
  var goalGrid = app.querySelector('[data-growth-goals]');
  var goalHint = app.querySelector('[data-growth-goal-hint]');
  var blueprintSubmit = app.querySelector('[data-growth-blueprint-submit]');
  var scanUrl = app.querySelector('[data-growth-scan-url]');
  var scanButton = app.querySelector('[data-growth-scan-submit]');
  var loading = app.querySelector('[data-growth-scan-loading]');
  var loadingMessage = app.querySelector('[data-growth-loading-message]');
  var errorBox = app.querySelector('[data-growth-scan-error]');
  var errorMessage = app.querySelector('[data-growth-error-message]');
  var scanResults = app.querySelector('[data-growth-scan-results]');
  var blueprintResults = app.querySelector('[data-growth-blueprint-results]');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var activeController = null;
  var loadingTimer = null;
  var loadingMessages = [
    'Connecting securely to the public website…',
    'Reading page structure and important links…',
    'Checking mobile, search, accessibility and conversion signals…',
    'Prioritizing practical improvements for your site…'
  ];

  function make(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function scrollToResult(element) {
    if (!element) return;
    element.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    window.requestAnimationFrame(function () {
      element.setAttribute('tabindex', '-1');
      element.focus({ preventScroll: true });
    });
  }

  function clearResults() {
    if (scanResults) {
      scanResults.hidden = true;
      scanResults.replaceChildren();
    }
    if (blueprintResults) {
      blueprintResults.hidden = true;
      blueprintResults.replaceChildren();
    }
    if (errorBox) errorBox.hidden = true;
    if (loading) loading.hidden = true;
    if (scanButton) scanButton.disabled = false;
  }

  function stopLoading() {
    if (loadingTimer) window.clearInterval(loadingTimer);
    loadingTimer = null;
    if (loading) loading.hidden = true;
    if (scanButton) scanButton.disabled = false;
  }

  function cancelPendingWork() {
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
    stopLoading();
    clearResults();
  }

  function focusFormHeading(form) {
    var heading = form && form.querySelector('.growth-path-heading h3');
    if (!heading) return;
    window.requestAnimationFrame(function () {
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
    });
  }

  function showPath(mode) {
    if (mode !== 'scan' && mode !== 'blueprint') return;
    cancelPendingWork();
    if (entryPanel) entryPanel.hidden = true;
    if (pathNav) pathNav.hidden = false;
    if (scanForm) scanForm.hidden = mode !== 'scan';
    if (blueprintForm) blueprintForm.hidden = mode !== 'blueprint';
    if (pathLabel) pathLabel.textContent = mode === 'scan' ? 'LIVE WEBSITE SCAN' : 'FIRST-WEBSITE BLUEPRINT';
    focusFormHeading(mode === 'scan' ? scanForm : blueprintForm);
  }

  function returnToPathPicker() {
    cancelPendingWork();
    if (entryPanel) entryPanel.hidden = false;
    if (pathNav) pathNav.hidden = true;
    if (scanForm) scanForm.hidden = true;
    if (blueprintForm) blueprintForm.hidden = true;
    if (entryPanel) scrollToResult(entryPanel);
  }

  function updateBlueprintSubmit() {
    if (!blueprintSubmit) return;
    var hasIndustry = !!(industrySelect && industrySelect.value);
    var hasGoal = !!(goalGrid && goalGrid.querySelector('input[name="goal"]:checked'));
    blueprintSubmit.disabled = !(hasIndustry && hasGoal);
  }

  function normaliseWebsiteUrl(raw) {
    var value = raw.trim();
    if (!value || value.length > 2048) throw new Error('Enter the public website address you want us to inspect.');
    var candidate = /^https?:\/\//i.test(value) ? value : 'https://' + value;
    var parsed;
    try { parsed = new URL(candidate); }
    catch (error) { throw new Error('That address does not look valid. Try a domain such as example.com.'); }
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error('Enter a public website URL using http:// or https://, without sign-in details.');
    }
    if (parsed.hostname.indexOf('.') < 0 || parsed.hostname === 'localhost') {
      throw new Error('Enter a public website domain, not a local or private address.');
    }
    return parsed.href;
  }

  function showError(message) {
    stopLoading();
    if (errorMessage) errorMessage.textContent = message;
    if (errorBox) {
      errorBox.hidden = false;
      scrollToResult(errorBox);
    }
  }

  function beginLoading() {
    clearResults();
    if (scanButton) scanButton.disabled = true;
    if (loading) loading.hidden = false;
    var stepLabels = loading ? Array.prototype.slice.call(loading.querySelectorAll('.growth-scan-loading__steps span')) : [];
    var index = 0;
    function showCurrent() {
      if (loadingMessage) loadingMessage.textContent = loadingMessages[index % loadingMessages.length];
      stepLabels.forEach(function (label, labelIndex) {
        label.classList.toggle('is-active', labelIndex === Math.min(2, Math.floor(index / 2)));
      });
      index += 1;
    }
    showCurrent();
    loadingTimer = window.setInterval(showCurrent, 2300);
  }

  function statusLabel(status) {
    return status === 'good' ? 'Detected' : status === 'attention' ? 'Opportunity' : 'Needs review';
  }

  function renderFinding(check) {
    var allowedStatus = check.status === 'good' || check.status === 'attention' ? check.status : 'priority';
    var card = make('article', 'growth-finding growth-finding--' + allowedStatus);
    var top = make('div', 'growth-finding__top');
    top.appendChild(make('span', 'growth-finding__category', check.category || 'Website signal'));
    top.appendChild(make('span', 'growth-finding__status', statusLabel(allowedStatus)));
    card.appendChild(top);
    card.appendChild(make('h5', '', check.title || 'Website check'));
    card.appendChild(make('p', '', check.evidence || 'No further details were returned for this check.'));
    if (check.recommendation) card.appendChild(make('p', 'growth-finding__action', check.recommendation));
    return card;
  }

  function renderScan(data) {
    scanResults.replaceChildren();
    var checks = Array.isArray(data.checks) ? data.checks : [];
    var strengths = checks.filter(function (check) { return check.status === 'good'; });
    var opportunities = checks.filter(function (check) { return check.status !== 'good'; }).sort(function (a, b) {
      var order = { priority: 0, attention: 1 };
      return (order[a.status] === undefined ? 2 : order[a.status]) - (order[b.status] === undefined ? 2 : order[b.status]);
    });
    var score = Math.max(0, Math.min(100, Number(data.score) || 0));
    var summary = data.summary || {};
    var pages = Array.isArray(data.scanned_pages) ? data.scanned_pages : [];
    var wrapper = make('div', 'growth-scan-report');

    var header = make('div', 'growth-scan-report__top');
    var ring = make('div', 'growth-live-score');
    ring.style.setProperty('--growth-score', score + '%');
    ring.setAttribute('role', 'img');
    ring.setAttribute('aria-label', 'Website foundations score: ' + score + ' out of 100');
    var ringInner = make('div', 'growth-live-score__inner');
    ringInner.appendChild(make('strong', '', String(score)));
    ringInner.appendChild(make('small', '', 'Foundation score'));
    ring.appendChild(ringInner);
    header.appendChild(ring);

    var headerText = make('div', 'growth-scan-report__copy');
    headerText.appendChild(make('span', 'growth-scan-report__eyebrow', 'LIVE SCAN · ' + String(data.domain || 'YOUR WEBSITE').toUpperCase()));
    headerText.appendChild(make('h3', '', data.rating || 'Website scan complete'));
    headerText.appendChild(make('p', '', 'We reviewed ' + pages.length + ' public page' + (pages.length === 1 ? '' : 's') + ' and found practical signals in your site structure, content and customer journey.'));
    var stats = make('div', 'growth-scan-report__stats');
    stats.appendChild(make('span', '', (Number(summary.good) || 0) + ' signals working well'));
    stats.appendChild(make('span', '', (Number(summary.attention) || 0) + ' opportunities'));
    stats.appendChild(make('span', '', (Number(summary.priority) || 0) + ' priority fixes'));
    headerText.appendChild(stats);
    header.appendChild(headerText);
    wrapper.appendChild(header);

    function appendSection(title, list) {
      if (!list.length) return;
      var section = make('section', 'growth-scan-report__section');
      var heading = make('h4', '', title);
      section.appendChild(heading);
      var grid = make('div', 'growth-check-grid');
      list.forEach(function (check) { grid.appendChild(renderFinding(check)); });
      section.appendChild(grid);
      wrapper.appendChild(section);
    }
    appendSection('What is already working', strengths);
    appendSection('What to improve next', opportunities);

    if (pages.length) {
      var pagesSection = make('section', 'growth-scan-report__section');
      pagesSection.appendChild(make('h4', '', 'Public pages inspected'));
      var pageList = make('div', 'growth-scan-pages');
      pages.forEach(function (page) {
        var pageName = page.title || (function () {
          try { return new URL(page.url).pathname || '/'; }
          catch (error) { return 'Scanned page'; }
        })();
        pageList.appendChild(make('span', 'growth-scan-page', pageName));
      });
      pagesSection.appendChild(pageList);
      wrapper.appendChild(pagesSection);
    }

    var footer = make('div', 'growth-scan-report__footer');
    footer.appendChild(make('p', '', 'Want help turning these findings into a stronger website?'));
    var contact = make('a', 'btn btn--yellow', 'Talk through my scan');
    contact.href = 'contact.html?source=website-scan';
    contact.appendChild(make('span', 'btn__arrow', '→'));
    footer.appendChild(contact);
    wrapper.appendChild(footer);
    wrapper.appendChild(make('p', 'growth-scan-report__scope', data.scope || 'This scan reviews public HTML only. It is not a complete security, accessibility, or performance audit.'));
    var again = make('button', 'growth-scan-again', 'Scan another website');
    again.type = 'button';
    again.addEventListener('click', function () {
      clearResults();
      if (scanUrl) {
        scanUrl.value = '';
        scanUrl.focus();
      }
      if (scanForm) scanForm.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    });
    wrapper.appendChild(again);
    scanResults.appendChild(wrapper);
    scanResults.hidden = false;
    scrollToResult(scanResults);
  }

  var businessTypes = {
    'professional-service': 'professional or service business',
    consultant: 'consulting or specialist business',
    'health-practice': 'health, wellness or appointment-based practice',
    retail: 'retail or product business',
    hospitality: 'hospitality, food or accommodation business',
    creative: 'creative studio or personal brand',
    'local-business': 'local business or trade',
    other: 'growing business'
  };
  var industryGoalOptions = {
    'professional-service': {
      hint: 'Service businesses usually need a clear route from understanding the offer to making an enquiry or consultation.',
      goals: [
        { key: 'enquiries', title: 'Get more qualified enquiries', description: 'Explain your services and make it easy for the right clients to get in touch.' },
        { key: 'bookings', title: 'Book more consultations', description: 'Let prospective clients choose a consultation or discovery-call time.' },
        { key: 'trust', title: 'Build confidence before contact', description: 'Show your expertise, process and proof of work clearly.' }
      ]
    },
    consultant: {
      hint: 'For a specialist practice, the website should turn expertise into a clear, confident next step.',
      goals: [
        { key: 'enquiries', title: 'Attract better-fit clients', description: 'Explain who you help, the outcome and how to start a conversation.' },
        { key: 'bookings', title: 'Book discovery sessions', description: 'Give potential clients a clear way to schedule an introductory session.' },
        { key: 'trust', title: 'Demonstrate your expertise', description: 'Present your approach, credentials and useful client outcomes.' }
      ]
    },
    'health-practice': {
      hint: 'Appointment and care journeys work best when services, practitioner credentials and booking steps are easy to understand.',
      goals: [
        { key: 'bookings', title: 'Increase appointment bookings', description: 'Help people choose a service and request or book an appointment.' },
        { key: 'enquiries', title: 'Answer questions and enquiries', description: 'Explain suitability, preparation and how to ask a private question.' },
        { key: 'trust', title: 'Build patient confidence', description: 'Make practitioner credentials, care approach and essential information clear.' }
      ]
    },
    retail: {
      hint: 'For a product business, the priorities are product discovery, a confident purchase and easy access to store information.',
      goals: [
        { key: 'sales', title: 'Sell products online', description: 'Show products, accept secure orders and explain delivery and returns.' },
        { key: 'local', title: 'Bring more people to my shop', description: 'Help nearby customers find your location, opening hours and product range.' },
        { key: 'trust', title: 'Make shoppers feel confident', description: 'Show product details, policies, reviews and support before purchase.' }
      ]
    },
    hospitality: {
      hint: 'Hospitality websites should make it simple to discover the experience, check practical details and reserve or order.',
      goals: [
        { key: 'bookings', title: 'Get more reservations', description: 'Show availability, key details and a straightforward reservation route.' },
        { key: 'sales', title: 'Take online food or product orders', description: 'Present the menu or range and make ordering clear on mobile.' },
        { key: 'local', title: 'Help nearby guests find us', description: 'Make location, hours, directions and the experience easy to discover.' }
      ]
    },
    creative: {
      hint: 'A creative business needs to show its point of view, make the work easy to explore and turn interest into an opportunity.',
      goals: [
        { key: 'enquiries', title: 'Win more project enquiries', description: 'Show what you create and make it easy to discuss a new project.' },
        { key: 'trust', title: 'Showcase my work and credibility', description: 'Present selected projects, your process and client feedback.' },
        { key: 'sales', title: 'Sell creative products online', description: 'Offer prints, products or digital work through a simple shop.' }
      ]
    },
    'local-business': {
      hint: 'Local customers need to know what you do, where you work and how quickly they can reach or book you.',
      goals: [
        { key: 'local', title: 'Be easier to find nearby', description: 'Make your services, locations, hours and contact details visible.' },
        { key: 'enquiries', title: 'Get more service requests', description: 'Collect useful details about the job and respond to potential customers.' },
        { key: 'bookings', title: 'Book more local jobs', description: 'Let customers request a visit or select an available service time.' }
      ]
    },
    other: {
      hint: 'Choose the result that matters most right now. Your recommendations will be shaped around it.',
      goals: [
        { key: 'enquiries', title: 'Get more enquiries', description: 'Attract and qualify potential clients.' },
        { key: 'bookings', title: 'Get more bookings', description: 'Let customers choose a time or service.' },
        { key: 'sales', title: 'Sell online', description: 'Show products and accept orders.' },
        { key: 'trust', title: 'Build credibility', description: 'Explain your value and earn trust.' },
        { key: 'local', title: 'Grow locally', description: 'Help nearby customers find and reach you.' }
      ]
    }
  };

  function updateGoalsForIndustry() {
    if (!industrySelect || !goalGrid || !goalFieldset) return;
    var industryKey = industrySelect.value;
    var configuration = industryGoalOptions[industryKey];
    goalGrid.replaceChildren();
    if (!configuration) {
      goalFieldset.hidden = true;
      if (goalHint) goalHint.textContent = '';
      updateBlueprintSubmit();
      return;
    }
    if (goalHint) goalHint.textContent = configuration.hint;
    configuration.goals.forEach(function (goal, index) {
      var label = make('label', 'growth-goal-card');
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'goal';
      input.value = goal.key;
      input.required = true;
      input.addEventListener('change', function () {
        goalGrid.querySelectorAll('.growth-goal-card').forEach(function (card) {
          card.classList.toggle('is-selected', !!card.querySelector('input:checked'));
        });
        updateBlueprintSubmit();
      });
      label.appendChild(input);
      var copy = make('span', 'growth-goal-card__copy');
      copy.appendChild(make('b', '', goal.title));
      copy.appendChild(make('small', '', goal.description));
      if (index === 0) copy.appendChild(make('i', 'growth-goal-card__tag', 'Suggested starting point'));
      label.appendChild(copy);
      goalGrid.appendChild(label);
    });
    goalFieldset.hidden = false;
    updateBlueprintSubmit();
  }

  var goalPlans = {
    enquiries: {
      label: 'generate more qualified enquiries',
      promise: 'Make your value clear, answer the right questions and give prospective clients a direct way to start a conversation.',
      pages: [
        ['A focused homepage', 'State who you help, the outcome you offer and one clear way to enquire.'],
        ['Service pages', 'Explain each core service, who it suits, what is included and what happens next.'],
        ['About and credibility', 'Introduce the people behind the business, relevant experience and working approach.'],
        ['Proof of work', 'Show specific reviews, case studies or examples that help customers evaluate fit.'],
        ['Contact and enquiry', 'Use a short, accessible brief form with clear response expectations and direct contact options.']
      ],
      features: ['Short enquiry form that asks only what you need to qualify a lead', 'Tap-to-call or WhatsApp action if your customers use it', 'Relevant testimonials near service explanations and enquiry prompts', 'Thank-you message that confirms what happens after submission'],
      why: ['A consistent home for your offer', 'A clear path from interest to enquiry', 'Space to demonstrate credibility before the first conversation']
    },
    bookings: {
      label: 'make it easier for customers to reserve or book',
      promise: 'Help customers understand the experience or service, check practical details and reserve a suitable time without unnecessary back-and-forth.',
      pages: [
        ['Booking-led homepage', 'Explain what customers can book, who it is for and how to get started.'],
        ['Service, menu or experience details', 'Describe the options, availability, pricing approach and useful preparation details.'],
        ['People, place or credentials', 'Introduce the team, venue or practitioners and set clear expectations.'],
        ['Reservations and booking', 'Make it easy to choose a service, date or time and receive a clear confirmation.'],
        ['FAQs and contact', 'Answer common questions and make an alternate contact route easy to find.']
      ],
      features: ['Mobile-friendly booking or reservation flow with clear availability', 'Confirmation and reminder messages with useful next steps', 'Short booking form that collects only necessary information', 'Clear cancellation, payment and privacy information before confirmation'],
      why: ['A dependable booking route outside social messages', 'Clear service or experience details before a customer chooses', 'Fewer avoidable questions about availability and preparation']
    },
    sales: {
      label: 'sell products online',
      promise: 'Give customers a simple way to discover products, understand what they are buying and complete a secure order.',
      pages: [
        ['Storefront homepage', 'Show your range, best starting points and the reason to choose your products.'],
        ['Product collections', 'Organize products so shoppers can find relevant items quickly.'],
        ['Product detail pages', 'Use accurate images, options, specifications, availability and delivery details.'],
        ['Cart and checkout', 'Keep the purchase steps clear, mobile-friendly and transparent about costs.'],
        ['Shipping, returns and support', 'Explain fulfilment, returns and how a customer can get help after purchase.']
      ],
      features: ['Product catalogue with useful categories and search/filtering where appropriate', 'Secure payment options and transparent delivery costs', 'Stock, order confirmation and customer email notifications', 'Mobile checkout testing and clear returns information'],
      why: ['A direct destination for product discovery and orders', 'Control over how the range, pricing and brand story are presented', 'A structured place to support customers before and after purchase']
    },
    trust: {
      label: 'build credibility with new customers',
      promise: 'Explain your expertise, make your approach visible and give prospective customers evidence they can assess for themselves.',
      pages: [
        ['Clear homepage', 'Summarize who you help, your area of expertise and how to explore further.'],
        ['About and team', 'Show the people, credentials, values and experience behind the business.'],
        ['Service detail', 'Explain your process, scope, suitability and what a customer can expect.'],
        ['Case studies or reviews', 'Share specific work, client feedback or outcomes with context and permission.'],
        ['FAQs and contact', 'Answer common concerns and provide a professional next step.']
      ],
      features: ['Credibility markers that can be verified, not vague claims', 'Case studies or testimonials placed near relevant services', 'Clear policies, business details and privacy information', 'Consistent visual identity and accessible contact options'],
      why: ['A place to explain your business in your own words', 'More context than a short social profile can provide', 'A professional reference to share with referrals and prospective clients']
    },
    local: {
      label: 'help nearby customers find and reach you',
      promise: 'Make the essentials—what you do, where you work and how to contact you—easy to find on a phone.',
      pages: [
        ['Local homepage', 'Name your services and service area clearly, with a visible call or enquiry action.'],
        ['Services and areas', 'Describe your main services and the locations you genuinely serve.'],
        ['About and proof', 'Show experience, team details, local reviews or examples of relevant work.'],
        ['Contact and directions', 'Publish accurate hours, location, map and click-to-call details where appropriate.'],
        ['FAQs', 'Answer practical questions about availability, travel areas, pricing approach or preparation.']
      ],
      features: ['Accurate business name, location, hours and phone information', 'Tap-to-call and map directions tested on mobile', 'Local service-area pages with useful, original content', 'A link to current customer reviews and clear enquiry handling'],
      why: ['A useful destination for people who find you through referrals or local search', 'Clear location and service information before a customer calls', 'A consistent place to direct customers from maps, social profiles and offline materials']
    }
  };

  function buildBlueprint() {
    var formData = new FormData(blueprintForm);
    var industryValue = String(formData.get('industry') || 'other');
    var goalValue = String(formData.get('goal') || 'enquiries');
    var industry = businessTypes[industryValue] || businessTypes.other;
    var plan = goalPlans[goalValue] || goalPlans.enquiries;
    var industryConfiguration = industryGoalOptions[industryValue] || industryGoalOptions.other;
    var selectedGoal = industryConfiguration.goals.find(function (goal) { return goal.key === goalValue; }) || industryConfiguration.goals[0];
    var goalTitle = selectedGoal ? selectedGoal.title : plan.label;
    blueprintResults.replaceChildren();

    var header = make('div', 'growth-blueprint__header');
    header.appendChild(make('span', '', 'FIRST-WEBSITE BLUEPRINT · ' + industry.toUpperCase() + ' · ' + goalTitle.toUpperCase()));
    header.appendChild(make('h3', '', 'Your first-site plan for ' + goalTitle.toLowerCase() + '.'));
    header.appendChild(make('p', '', 'Tailored for a ' + industry + '. ' + (selectedGoal ? selectedGoal.description : '') + ' ' + plan.promise));
    blueprintResults.appendChild(header);

    var columns = make('div', 'growth-blueprint__columns');
    var pageColumn = make('section', 'growth-blueprint__column');
    pageColumn.appendChild(make('span', '', 'A PRACTICAL FIRST SITE MAP'));
    var pageList = make('ol', 'growth-blueprint__list');
    plan.pages.forEach(function (item) {
      var li = make('li');
      li.appendChild(make('b', '', item[0]));
      li.appendChild(make('small', '', item[1]));
      pageList.appendChild(li);
    });
    pageColumn.appendChild(pageList);
    columns.appendChild(pageColumn);

    var featureColumn = make('section', 'growth-blueprint__column');
    featureColumn.appendChild(make('span', '', 'FUNCTIONALITY TO PLAN FOR'));
    var featureList = make('ul', 'growth-blueprint__features');
    plan.features.forEach(function (feature) { featureList.appendChild(make('li', '', feature)); });
    featureColumn.appendChild(featureList);
    columns.appendChild(featureColumn);
    blueprintResults.appendChild(columns);

    var whySection = make('section', 'growth-blueprint__why-section');
    whySection.appendChild(make('p', 'growth-report__section-label', 'Why a website can help support this goal'));
    var reasons = make('div', 'growth-blueprint__why');
    plan.why.forEach(function (reason, index) {
      var article = make('article');
      article.appendChild(make('b', '', ['A clear home for your business', 'A smoother customer journey', 'A foundation you can build on'][index]));
      article.appendChild(make('p', '', reason + '. Results depend on your market, offer and ongoing work; a website is a useful platform, not a guarantee.'));
      reasons.appendChild(article);
    });
    whySection.appendChild(reasons);
    blueprintResults.appendChild(whySection);

    var footer = make('div', 'growth-scan-report__footer');
    footer.appendChild(make('p', '', 'Ready to plan the first version around your business?'));
    var contact = make('a', 'btn btn--yellow', 'Plan my first website');
    contact.href = 'contact.html?source=first-website-blueprint';
    contact.appendChild(make('span', 'btn__arrow', '→'));
    footer.appendChild(contact);
    blueprintResults.appendChild(footer);
    blueprintResults.hidden = false;
    scrollToResult(blueprintResults);
  }

  pathChoices.forEach(function (button) {
    button.addEventListener('click', function () { showPath(button.getAttribute('data-growth-path-choice')); });
  });
  if (changePathButton) changePathButton.addEventListener('click', returnToPathPicker);
  if (industrySelect) industrySelect.addEventListener('change', updateGoalsForIndustry);

  if (scanForm) {
    scanForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!scanForm.reportValidity()) return;
      try { normaliseWebsiteUrl(scanUrl.value); }
      catch (error) {
        if (errorMessage) errorMessage.textContent = error.message;
        if (errorBox) errorBox.hidden = false;
        scrollToResult(errorBox);
        return;
      }
      scanUrl.setCustomValidity('');
      activeController = new AbortController();
      beginLoading();
      fetch('/api/growth-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ url: scanUrl.value.trim() }),
        signal: activeController.signal,
        credentials: 'same-origin'
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (payload) {
          if (!response.ok) throw new Error(payload.error || 'The scan could not be completed. Please try again.');
          return payload;
        });
      }).then(function (payload) {
        activeController = null;
        stopLoading();
        renderScan(payload);
      }).catch(function (error) {
        activeController = null;
        if (error.name === 'AbortError') return;
        showError(error.message || 'We could not reach the scanner. Please check your connection and try again.');
      });
    });
    if (scanUrl) scanUrl.addEventListener('input', function () { scanUrl.setCustomValidity(''); });
  }

  if (blueprintForm) {
    blueprintForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!blueprintForm.reportValidity()) return;
      clearResults();
      buildBlueprint();
    });
  }

  updateBlueprintSubmit();
})();
