(function () {
  'use strict';

  var CONTACTS = {
    email: 'htechdigitalconcept@gmail.com',
    emailUrl: 'mailto:htechdigitalconcept@gmail.com',
    upworkUrl: 'https://www.upwork.com/freelancers/~01b7d7e1d5bc855117',
    linkedinUrl: 'https://www.linkedin.com/in/ademolahabeeb/'
  };
  var COLORS = {
    navy: [7, 27, 51],
    blue: [23, 105, 224],
    yellow: [255, 193, 7],
    ink: [24, 37, 53],
    muted: [99, 111, 126],
    line: [225, 230, 237],
    soft: [246, 248, 251],
    green: [35, 132, 99],
    orange: [186, 112, 22],
    red: [181, 68, 54]
  };

  function make(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function attach(container, proposal) {
    if (!container || !proposal) return;
    var section = make('section', 'growth-proposal-export');
    section.setAttribute('aria-labelledby', 'growth-proposal-title');
    section.appendChild(make('span', 'growth-proposal-export__eyebrow', 'YOUR PERSONALIZED PDF'));
    var heading = make('h4', '', 'Take this plan with you.');
    heading.id = 'growth-proposal-title';
    section.appendChild(heading);
    section.appendChild(make('p', '', 'Add your name and business name to create a proposal addressed to you, from Ademola. The names are used only in the downloaded PDF; they are not submitted or stored.'));

    var form = make('form', 'growth-proposal-export__form');
    var fields = make('div', 'growth-proposal-export__fields');
    var ownerId = 'proposal-owner-' + Math.random().toString(36).slice(2, 9);
    var businessId = 'proposal-business-' + Math.random().toString(36).slice(2, 9);
    function addNameField(id, name, labelText, placeholder, autocomplete, maxLength) {
      var label = make('label', 'growth-field');
      var caption = make('span', '', labelText);
      var input = make('input');
      input.id = id;
      input.name = name;
      input.type = 'text';
      input.autocomplete = autocomplete;
      input.maxLength = maxLength;
      input.required = true;
      input.placeholder = placeholder;
      label.appendChild(caption);
      label.appendChild(input);
      fields.appendChild(label);
      return input;
    }
    var ownerInput = addNameField(ownerId, 'recipientName', 'Your name', 'Your name', 'name', 70);
    var businessInput = addNameField(businessId, 'businessName', 'Business name', 'Your business name', 'organization', 70);
    var hint = make('small', 'growth-field__hint', 'The PDF is written from Ademola to you, using your scan findings or business goals. It includes Htech branding and clickable email, Upwork and LinkedIn details.');
    hint.id = businessId + '-hint';
    businessInput.setAttribute('aria-describedby', businessId + '-hint');
    fields.appendChild(hint);
    form.appendChild(fields);

    var actions = make('div', 'growth-proposal-export__actions');
    var button = make('button', 'btn btn--yellow', 'Download personalized proposal PDF');
    button.type = 'submit';
    button.disabled = true;
    button.appendChild(make('span', 'btn__arrow', '↓'));
    actions.appendChild(button);
    var status = make('span', 'growth-proposal-export__status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    actions.appendChild(status);
    form.appendChild(actions);
    var isGenerating = false;
    function cleanName(field) {
      return field.value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function refreshDownloadState() {
      ownerInput.setCustomValidity('');
      businessInput.setCustomValidity('');
      button.disabled = isGenerating || !cleanName(ownerInput) || !cleanName(businessInput);
      status.textContent = '';
    }
    form.addEventListener('input', refreshDownloadState);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (isGenerating) return;
      var recipientName = cleanName(ownerInput);
      var businessName = cleanName(businessInput);
      if (!recipientName) {
        ownerInput.setCustomValidity('Enter your name so the proposal can be addressed to you.');
        ownerInput.reportValidity();
        return;
      }
      if (!businessName) {
        businessInput.setCustomValidity('Enter your business name to personalize the proposal.');
        businessInput.reportValidity();
        return;
      }
      isGenerating = true;
      button.disabled = true;
      button.textContent = 'Preparing your PDF…';
      status.textContent = '';
      createPdf(proposal, businessName, recipientName).then(function () {
        status.textContent = 'Your PDF is ready. Share it with Ademola to discuss your project.';
      }).catch(function () {
        status.textContent = 'The PDF could not be prepared. Please try again or contact Ademola directly.';
      }).finally(function () {
        isGenerating = false;
        button.disabled = !cleanName(ownerInput) || !cleanName(businessInput);
        button.replaceChildren(document.createTextNode('Download personalized proposal PDF '));
        button.appendChild(make('span', 'btn__arrow', '↓'));
      });
    });
    section.appendChild(form);
    container.appendChild(section);
  }

  var pdfLibraryPromise = null;

  function ensurePdfLibrary() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    if (pdfLibraryPromise) return pdfLibraryPromise;
    pdfLibraryPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = new URL('assets/js/vendor/jspdf.umd.min.js', window.location.href).href;
      script.async = true;
      script.onload = function () {
        if (window.jspdf && window.jspdf.jsPDF) resolve();
        else reject(new Error('PDF library failed to initialize'));
      };
      script.onerror = function () { reject(new Error('PDF library could not be loaded')); };
      document.head.appendChild(script);
    }).catch(function (error) {
      pdfLibraryPromise = null;
      throw error;
    });
    return pdfLibraryPromise;
  }

  function logoAsPng() {
    return new Promise(function (resolve) {
      var image = new Image();
      image.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          var context = canvas.getContext('2d');
          context.drawImage(image, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (error) {
          resolve(null);
        }
      };
      image.onerror = function () { resolve(null); };
      image.src = new URL('images/htech-logo.webp', window.location.href).href;
    });
  }

  function safeFilename(value) {
    var slug = value.normalize ? value.normalize('NFKD') : value;
    slug = slug.replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
    return (slug.slice(0, 54) || 'business') + '-htech-website-proposal.pdf';
  }

  function createPdf(proposal, businessName, recipientName, shouldDownload) {
    return ensurePdfLibrary().then(logoAsPng).then(function (logo) {
      var JsPDF = window.jspdf.jsPDF;
      var doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      var pageWidth = doc.internal.pageSize.getWidth();
      var pageHeight = doc.internal.pageSize.getHeight();
      var margin = 17;
      var contentWidth = pageWidth - margin * 2;
      var footerTop = pageHeight - 19;
      var y = 0;
      var date = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
      var kind = proposal.type === 'scan' ? 'Website improvement proposal' : 'First website proposal';

      doc.setProperties({
        title: kind + ' for ' + businessName,
        subject: 'Personalized website growth plan',
        author: 'Htech Digital Concepts - Ademola Habeeb',
        creator: 'Htech Website Growth Check'
      });

      function newPageHeader() {
        doc.setFillColor.apply(doc, COLORS.navy);
        doc.rect(0, 0, pageWidth, 15, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text('HTECH DIGITAL CONCEPTS  |  WEBSITE GROWTH PLAN', margin, 9.5);
        y = 23;
      }

      function ensureSpace(height) {
        if (y + height <= footerTop - 4) return;
        doc.addPage();
        newPageHeader();
      }

      function textLines(text, width, size, style) {
        doc.setFont('helvetica', style || 'normal');
        doc.setFontSize(size || 9);
        return doc.splitTextToSize(String(text || ''), width);
      }

      function paragraph(text, options) {
        options = options || {};
        var size = options.size || 9;
        var lineHeight = options.lineHeight || size * 0.48;
        var lines = textLines(text, options.width || contentWidth, size, options.style || 'normal');
        var height = lines.length * lineHeight + (options.after === undefined ? 3 : options.after);
        ensureSpace(height);
        doc.setFont('helvetica', options.style || 'normal');
        doc.setFontSize(size);
        doc.setTextColor.apply(doc, options.color || COLORS.ink);
        doc.text(lines, options.x || margin, y);
        y += height;
      }

      function sectionTitle(title) {
        ensureSpace(12);
        doc.setFillColor.apply(doc, COLORS.yellow);
        doc.rect(margin, y - 2.5, 2, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor.apply(doc, COLORS.navy);
        doc.text(String(title).toUpperCase(), margin + 5, y + 2);
        y += 9;
      }

      function bullet(text) {
        var lines = textLines(text, contentWidth - 9, 8.5, 'normal');
        var height = lines.length * 4.1 + 3;
        ensureSpace(height);
        doc.setFillColor.apply(doc, COLORS.blue);
        doc.circle(margin + 1.3, y - 1, 0.8, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor.apply(doc, COLORS.ink);
        doc.text(lines, margin + 6, y);
        y += height;
      }

      function findingCard(check, number) {
        var status = check.status || 'attention';
        var accent = status === 'good' ? COLORS.green : status === 'priority' ? COLORS.red : COLORS.orange;
        var evidenceLines = textLines(check.evidence, contentWidth - 16, 8, 'normal');
        var titleLines = textLines(check.title, contentWidth - 16, 9.3, 'bold');
        var recommendationLines = check.recommendation ? textLines(check.recommendation, contentWidth - 16, 8, 'normal') : [];
        var cardHeight = 9 + titleLines.length * 4.3 + evidenceLines.length * 3.9 + (recommendationLines.length ? recommendationLines.length * 3.9 + 9 : 3);
        ensureSpace(cardHeight + 3);
        doc.setFillColor.apply(doc, COLORS.soft);
        doc.setDrawColor.apply(doc, COLORS.line);
        doc.roundedRect(margin, y - 3, contentWidth, cardHeight, 2, 2, 'FD');
        doc.setFillColor.apply(doc, accent);
        doc.roundedRect(margin, y - 3, 2, cardHeight, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.7);
        doc.setTextColor.apply(doc, accent);
        var statusText = status === 'good' ? 'WORKING WELL' : status === 'priority' ? 'PRIORITY' : 'OPPORTUNITY';
        doc.text((number ? number + '  |  ' : '') + String(check.category || 'Website finding').toUpperCase() + '  |  ' + statusText, margin + 7, y + 2);
        var cursor = y + 7;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.3);
        doc.setTextColor.apply(doc, COLORS.ink);
        doc.text(titleLines, margin + 7, cursor);
        cursor += titleLines.length * 4.3 + 1;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor.apply(doc, COLORS.muted);
        doc.text(evidenceLines, margin + 7, cursor);
        cursor += evidenceLines.length * 3.9 + 1;
        if (recommendationLines.length) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.7);
          doc.setTextColor.apply(doc, COLORS.navy);
          doc.text('NEXT STEP', margin + 7, cursor + 1);
          cursor += 4;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor.apply(doc, COLORS.ink);
          doc.text(recommendationLines, margin + 7, cursor);
        }
        y += cardHeight + 4;
      }

      function listCard(item, index) {
        var title = Array.isArray(item) ? item[0] : item.title;
        var description = Array.isArray(item) ? item[1] : item.description;
        var titleLines = textLines((index ? String(index).padStart(2, '0') + '  ' : '') + title, contentWidth - 14, 8.8, 'bold');
        var descriptionLines = textLines(description, contentWidth - 14, 8, 'normal');
        var cardHeight = 9 + titleLines.length * 4 + descriptionLines.length * 3.8;
        ensureSpace(cardHeight + 2);
        doc.setFillColor.apply(doc, COLORS.soft);
        doc.setDrawColor.apply(doc, COLORS.line);
        doc.roundedRect(margin, y - 2, contentWidth, cardHeight, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.8);
        doc.setTextColor.apply(doc, COLORS.navy);
        doc.text(titleLines, margin + 6, y + 3);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor.apply(doc, COLORS.muted);
        doc.text(descriptionLines, margin + 6, y + 3 + titleLines.length * 4);
        y += cardHeight + 4;
      }

      function drawCover() {
        doc.setFillColor.apply(doc, COLORS.navy);
        doc.rect(0, 0, pageWidth, 77, 'F');
        if (logo) doc.addImage(logo, 'PNG', margin, 12, 49, 16.3);
        else {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(15);
          doc.setTextColor(255, 255, 255);
          doc.text('Htech', margin + 3, 23);
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text('ADEMOLA HABEEB', 74, 18);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.6);
        doc.text('Website Designer and WordPress Developer', 74, 24);
        doc.setTextColor.apply(doc, COLORS.yellow);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text('WEBSITES THAT TURN VISITORS INTO CUSTOMERS', margin, 41);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.text(kind, margin, 53);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('Prepared for ' + recipientName, margin, 62);
        doc.setFontSize(8);
        doc.text('Business: ' + businessName, margin, 68);
        doc.setFontSize(7.4);
        doc.setTextColor(211, 221, 233);
        doc.text('A personalized, practical direction for your website and next business step', margin, 74);
        doc.setTextColor.apply(doc, COLORS.muted);
        doc.text('PREPARED ' + date.toUpperCase(), pageWidth - margin, 18, { align: 'right' });
        y = 88;
      }

      function drawScorePanel(report) {
        var summary = report.summary || {};
        var panelY = y;
        ensureSpace(30);
        panelY = y;
        doc.setFillColor.apply(doc, COLORS.soft);
        doc.setDrawColor.apply(doc, COLORS.line);
        doc.roundedRect(margin, panelY - 2, contentWidth, 27, 3, 3, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(23);
        doc.setTextColor.apply(doc, COLORS.blue);
        doc.text(String(Number(report.score) || 0), margin + 8, panelY + 10);
        doc.setFontSize(7);
        doc.setTextColor.apply(doc, COLORS.muted);
        doc.text('FOUNDATION SCORE / 100', margin + 8, panelY + 16);
        doc.setFontSize(11);
        doc.setTextColor.apply(doc, COLORS.navy);
        doc.text(report.rating || 'Website scan complete', margin + 54, panelY + 5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.7);
        doc.setTextColor.apply(doc, COLORS.ink);
        doc.text((report.scanned_pages || []).length + ' public pages reviewed', margin + 54, panelY + 11);
        doc.text((Number(summary.good) || 0) + ' strengths   |   ' + (Number(summary.attention) || 0) + ' opportunities   |   ' + (Number(summary.priority) || 0) + ' priority fixes', margin + 54, panelY + 17);
        y += 31;
      }

      function addSignature() {
        paragraph('Kind regards,', { size: 8.5, after: 1 });
        paragraph('Ademola Habeeb', { size: 9, style: 'bold', color: COLORS.navy, after: 1 });
        paragraph('Htech Digital Concepts | Website Designer and WordPress Developer', { size: 7.7, color: COLORS.muted, after: 4 });
      }

      function addScanMessage(report, businessName, recipientName) {
        var checks = Array.isArray(report.checks) ? report.checks : [];
        var strengths = checks.filter(function (check) { return check.status === 'good'; });
        var improvements = checks.filter(function (check) { return check.status !== 'good'; }).sort(function (a, b) {
          var order = { priority: 0, attention: 1 };
          return (order[a.status] === undefined ? 2 : order[a.status]) - (order[b.status] === undefined ? 2 : order[b.status]);
        });
        var context = report.proposal_context || {};
        var contextualFindings = Array.isArray(context.top_findings) ? context.top_findings : [];
        var contextualStrengths = Array.isArray(context.strengths) ? context.strengths : [];
        var findingsForMessage = contextualFindings.length ? contextualFindings : improvements;
        var strengthsForMessage = contextualStrengths.length ? contextualStrengths : strengths.map(function (check) { return check.title; });
        var domain = report.domain || report.final_url || 'the public website';
        sectionTitle('A personal note from Ademola');
        paragraph('Dear ' + recipientName + ',', { size: 9.5, style: 'bold', after: 3 });
        if (findingsForMessage.length) {
          var observed = findingsForMessage.slice(0, 3).map(function (check) { return String(check.title || '').toLowerCase(); }).filter(Boolean).join(', ');
          paragraph('I prepared this proposal for ' + businessName + ' after the Growth Check scanned its public pages at ' + domain + '. The clearest opportunities identified are ' + observed + '.', { size: 8.5, after: 3 });
          if (context.focus) paragraph('Together, these point to ' + context.focus + '.', { size: 8.5, after: 3 });
          if (strengthsForMessage.length) {
            var strengthsText = strengthsForMessage.slice(0, 2).map(function (title) { return String(title).toLowerCase(); }).join(' and ');
            paragraph('It also found positive foundations in ' + strengthsText + ', which we can build on.', { size: 8.5, after: 3 });
          }
          var firstFinding = findingsForMessage[0];
          var secondFinding = findingsForMessage[1];
          var firstAction = String(firstFinding.action || firstFinding.recommendation || firstFinding.title || '').replace(/[\s.!?]+$/g, '');
          var secondAction = secondFinding && String(secondFinding.action || secondFinding.recommendation || secondFinding.title || '').replace(/[\s.!?]+$/g, '');
          paragraph('My recommendation is to begin with this action: ' + firstAction + '.' + (secondAction ? ' A second priority is: ' + secondAction + '.' : '') + ' I would validate these findings with you and agree the most useful scope before setting a timeline or investment.', { size: 8.5, after: 3 });
        } else {
          paragraph('I prepared this proposal for ' + businessName + ' after the Growth Check scanned its public pages at ' + domain + '. It found solid foundations across the checks it could perform and did not flag an urgent issue in the sampled HTML.', { size: 8.5, after: 3 });
          paragraph('A manual review can still check how well the site supports your customers and business priorities. I would confirm that context with you before recommending any work or investment.', { size: 8.5, after: 3 });
        }
        paragraph('This is a lightweight public-page scan, not a complete technical audit. I would confirm each finding with you, then design and build a focused improvement plan for ' + businessName + '.', { size: 8, color: COLORS.muted, after: 3 });
        addSignature();
      }

      function addBlueprintMessage(proposal, businessName, recipientName) {
        var plan = proposal.plan || {};
        var pages = Array.isArray(plan.pages) ? plan.pages : [];
        var features = Array.isArray(plan.features) ? plan.features : [];
        var pageNames = pages.slice(0, 3).map(function (item) { return Array.isArray(item) ? item[0] : item.title; }).filter(Boolean);
        var featureNames = features.slice(0, 2);
        sectionTitle('A personal note from Ademola');
        paragraph('Dear ' + recipientName + ',', { size: 9.5, style: 'bold', after: 3 });
        paragraph('Based on what you shared about ' + businessName + ' and your business type (' + (proposal.industry || 'growing business') + '), I have shaped this first-site proposal around your selected goal: ' + (proposal.goalTitle || 'a useful online presence') + '.', { size: 8.5, after: 3 });
        if (pageNames.length) {
          paragraph('A focused first version could begin with ' + pageNames.join(', ') + (pageNames.length === 3 ? ', plus the supporting pages in the plan below.' : '.'), { size: 8.5, after: 3 });
        }
        if (featureNames.length) paragraph('To support that outcome, I would prioritize ' + featureNames.join(' and ') + ', then add other functionality only where it serves your customers.', { size: 8.5, after: 3 });
        paragraph('I can work with you to confirm your audience, offer and content, then design and build the agreed site and test the important journeys before launch. We would confirm the final scope, timeline and investment together before work begins.', { size: 8.5, after: 3 });
        paragraph('This is a starting proposal shaped around your stated goal, not a promise of a particular business result. The final plan should reflect your requirements and resources.', { size: 8, color: COLORS.muted, after: 3 });
        addSignature();
      }

      function addFooter() {
        var pageCount = doc.getNumberOfPages();
        for (var page = 1; page <= pageCount; page += 1) {
          doc.setPage(page);
          doc.setDrawColor.apply(doc, COLORS.line);
          doc.line(margin, footerTop, pageWidth - margin, footerTop);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor.apply(doc, COLORS.muted);
          var columns = [
            { x: margin, text: CONTACTS.email, url: CONTACTS.emailUrl, width: 57 },
            { x: margin + 61, text: 'Message me on Upwork', url: CONTACTS.upworkUrl, width: 62 },
            { x: margin + 127, text: 'Message me on LinkedIn', url: CONTACTS.linkedinUrl, width: 50 }
          ];
          columns.forEach(function (item) {
            doc.setTextColor.apply(doc, COLORS.blue);
            doc.text(item.text, item.x, footerTop + 5);
            doc.link(item.x, footerTop + 1, item.width, 6, { url: item.url });
          });
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor.apply(doc, COLORS.muted);
          doc.text('Htech Digital Concepts  |  Website Design and WordPress Development', margin, footerTop + 11);
          doc.text('Page ' + page + ' of ' + pageCount, pageWidth - margin, footerTop + 11, { align: 'right' });
        }
      }

      drawCover();
      if (proposal.type === 'scan') {
        var report = proposal.report || {};
        addScanMessage(report, businessName, recipientName);
        sectionTitle('Website scan snapshot');
        drawScorePanel(report);
        paragraph('Website reviewed: ' + (report.final_url || report.domain || 'Public website') + '. This scan checks public HTML only and is intended as a practical starting point, not a complete technical audit.', { size: 8.2, color: COLORS.muted, after: 5 });

        var checks = Array.isArray(report.checks) ? report.checks : [];
        var strengths = checks.filter(function (check) { return check.status === 'good'; });
        var improvements = checks.filter(function (check) { return check.status !== 'good'; }).sort(function (a, b) {
          var order = { priority: 0, attention: 1 };
          return (order[a.status] === undefined ? 2 : order[a.status]) - (order[b.status] === undefined ? 2 : order[b.status]);
        });
        sectionTitle('What is already working');
        if (strengths.length) strengths.forEach(function (check, index) { findingCard(check, index + 1); });
        else paragraph('The scan did not identify clear strengths in the sampled HTML. A manual review can add context that a lightweight scanner may miss.', { size: 8.5, color: COLORS.muted });
        sectionTitle('Recommended improvements');
        if (improvements.length) improvements.forEach(function (check, index) { findingCard(check, index + 1); });
        else paragraph('No priority findings were returned. There may still be opportunities that require a manual review or real-user testing.', { size: 8.5, color: COLORS.muted });
        if (Array.isArray(report.scanned_pages) && report.scanned_pages.length) {
          sectionTitle('Public pages inspected');
          report.scanned_pages.forEach(function (page) { bullet((page.title || page.url || 'Page') + (page.url ? ' - ' + page.url : '')); });
        }
        sectionTitle('Suggested project approach');
        [
          'Review the highest-priority findings together and confirm which ones matter most to your customers.',
          'Agree a focused scope, content needs, timeline and investment before work begins.',
          'Design, build and test the agreed improvements across mobile and desktop, then prepare the site for launch.'
        ].forEach(bullet);
        paragraph(report.scope || 'This scan is guidance based on a small sample of public HTML. It does not measure Core Web Vitals or guarantee business outcomes.', { size: 7.3, color: COLORS.muted, after: 0 });
      } else {
        var plan = proposal.plan || {};
        addBlueprintMessage(proposal, businessName, recipientName);
        sectionTitle('Your business direction');
        paragraph('Business: ' + (proposal.industry || 'Growing business'), { size: 9.2, style: 'bold', after: 2 });
        paragraph('Primary goal: ' + (proposal.goalTitle || plan.label || 'Build a stronger website'), { size: 9.2, style: 'bold', color: COLORS.blue, after: 3 });
        paragraph(proposal.goalDescription || plan.promise || '', { size: 8.6, color: COLORS.muted, after: 4 });

        sectionTitle('Recommended first-site map');
        (plan.pages || []).forEach(function (item, index) { listCard(item, index + 1); });
        sectionTitle('Functionality to plan for');
        (plan.features || []).forEach(bullet);
        sectionTitle('How this website can support your goal');
        (plan.why || []).forEach(bullet);
        sectionTitle('A practical project approach');
        [
          'Confirm your audience, offer, content and the first version of the site that best supports the chosen goal.',
          'Agree the page structure, functionality, timeline and investment before design and development begin.',
          'Design and build the website, then test the key journeys on mobile and desktop before launch.'
        ].forEach(bullet);
        paragraph('A website is a useful platform for your business, not a guarantee of enquiries, bookings, sales or search rankings. The final scope should reflect your audience, resources and priorities.', { size: 7.5, color: COLORS.muted, after: 0 });
      }

      addFooter();
      if (shouldDownload !== false) doc.save(safeFilename(businessName));
      return doc;
    });
  }

  window.GrowthProposal = { attach: attach, createPdf: createPdf };
})();
