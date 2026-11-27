(function () {
  'use strict';

  var CONTACTS = {
    email: 'htechdigitalconcept@gmail.com',
    emailUrl: 'mailto:htechdigitalconcept@gmail.com',
    upwork: 'upwork.com/freelancers/~01b7d7e1d5bc855117',
    upworkUrl: 'https://www.upwork.com/freelancers/~01b7d7e1d5bc855117',
    linkedin: 'linkedin.com/in/ademolahabeeb',
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
    section.appendChild(make('p', '', 'Add your business name to prepare a branded PDF proposal. Download it and send it to Ademola by email, Upwork or LinkedIn. Your name is used only in the PDF; it is not submitted or stored.'));

    var form = make('form', 'growth-proposal-export__form');
    var label = make('label', 'growth-field');
    var inputId = 'proposal-business-' + Math.random().toString(36).slice(2, 9);
    var inputLabel = make('span', '', 'Business name');
    var input = make('input');
    input.id = inputId;
    input.name = 'businessName';
    input.type = 'text';
    input.autocomplete = 'organization';
    input.maxLength = 70;
    input.required = true;
    input.placeholder = 'Enter your business name';
    input.setAttribute('aria-describedby', inputId + '-hint');
    label.appendChild(inputLabel);
    label.appendChild(input);
    var hint = make('small', 'growth-field__hint', 'The PDF includes your tailored findings or site plan, Htech branding and clickable email, Upwork and LinkedIn details.');
    hint.id = inputId + '-hint';
    label.appendChild(hint);
    form.appendChild(label);

    var actions = make('div', 'growth-proposal-export__actions');
    var button = make('button', 'btn btn--yellow', 'Download personalized PDF');
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
    form.addEventListener('input', function () {
      input.setCustomValidity('');
      button.disabled = isGenerating || !input.value.trim();
      status.textContent = '';
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (isGenerating) return;
      var businessName = input.value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!businessName) {
        input.setCustomValidity('Enter your business name to personalize the PDF.');
        input.reportValidity();
        return;
      }
      input.setCustomValidity('');
      isGenerating = true;
      button.disabled = true;
      button.textContent = 'Preparing your PDF…';
      status.textContent = '';
      createPdf(proposal, businessName).then(function () {
        status.textContent = 'Your PDF is ready. Share it with Ademola to discuss your project.';
      }).catch(function () {
        status.textContent = 'The PDF could not be prepared. Please try again or contact Ademola directly.';
      }).finally(function () {
        isGenerating = false;
        button.disabled = !input.value.trim();
        button.replaceChildren(document.createTextNode('Download personalized PDF '));
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
      image.src = new URL('images/htech-logo-transparent.webp', window.location.href).href;
    });
  }

  function safeFilename(value) {
    var slug = value.normalize ? value.normalize('NFKD') : value;
    slug = slug.replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
    return (slug.slice(0, 54) || 'business') + '-htech-website-proposal.pdf';
  }

  function createPdf(proposal, businessName, shouldDownload) {
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
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(margin, 11, 49, 19, 2, 2, 'F');
        if (logo) doc.addImage(logo, 'PNG', margin + 2, 12.2, 45, 16.5);
        else {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(15);
          doc.setTextColor.apply(doc, COLORS.navy);
          doc.text('Htech', margin + 5, 23);
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
        var preparedForLines = doc.splitTextToSize('Prepared for ' + businessName, pageWidth - margin * 2);
        doc.text(preparedForLines, margin, 62);
        doc.setFontSize(7.4);
        doc.setTextColor(211, 221, 233);
        doc.text('A personalized, practical direction for your website and next business step', margin, 73);
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
            { x: margin + 61, text: CONTACTS.upwork, url: CONTACTS.upworkUrl, width: 62 },
            { x: margin + 127, text: CONTACTS.linkedin, url: CONTACTS.linkedinUrl, width: 50 }
          ];
          columns.forEach(function (item) {
            doc.setTextColor.apply(doc, COLORS.blue);
            doc.text(item.text, item.x, footerTop + 5);
            doc.link(item.x, footerTop + 1, item.width, 6, { url: item.url });
          });
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor.apply(doc, COLORS.muted);
          doc.text('Htech Digital Concepts  |  Share this PDF with Ademola to discuss your project.', margin, footerTop + 11);
          doc.text('Page ' + page + ' of ' + pageCount, pageWidth - margin, footerTop + 11, { align: 'right' });
        }
      }

      drawCover();
      if (proposal.type === 'scan') {
        var report = proposal.report || {};
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
