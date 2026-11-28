(function () {
  'use strict';

  var COLORS = {
    navy: [7, 27, 51], blue: [23, 105, 224], yellow: [255, 193, 7],
    ink: [24, 37, 53], muted: [99, 111, 126], line: [225, 230, 237],
    soft: [246, 248, 251], red: [181, 68, 54], orange: [186, 112, 22], green: [35, 132, 99]
  };
  var libraryPromise = null;
  var MARGIN = 17;

  function ensureLibrary() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    if (libraryPromise) return libraryPromise;
    libraryPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = new URL('assets/js/vendor/jspdf.umd.min.js', window.location.href).href;
      script.async = true;
      script.onload = function () {
        if (window.jspdf && window.jspdf.jsPDF) resolve();
        else reject(new Error('PDF library failed to initialize.'));
      };
      script.onerror = function () { reject(new Error('PDF library could not be loaded.')) };
      document.head.appendChild(script);
    }).catch(function (error) {
      libraryPromise = null;
      throw error;
    });
    return libraryPromise;
  }

  function loadLogo() {
    return new Promise(function (resolve) {
      var image = new Image();
      image.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          canvas.getContext('2d').drawImage(image, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (error) { resolve(null); }
      };
      image.onerror = function () { resolve(null); };
      image.src = new URL('images/htech-logo.webp', window.location.href).href;
    });
  }

  function safeSlug(value) {
    var slug = String(value || 'site-audit');
    if (slug.normalize) slug = slug.normalize('NFKD');
    return (slug.replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 54) || 'site-audit') + '-seo-audit.pdf';
  }

  function createReport(data, logo) {
    var JsPDF = window.jspdf.jsPDF;
    var doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    var width = doc.internal.pageSize.getWidth();
    var height = doc.internal.pageSize.getHeight();
    var contentWidth = width - MARGIN * 2;
    var footerTop = height - 19;
    var y = 0;
    var issues = Array.isArray(data.issues) ? data.issues : [];
    var pages = Array.isArray(data.pages) ? data.pages : [];
    var summary = data.summary || {};
    var date = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

    doc.setProperties({
      title: 'Advanced SEO and Site Architecture Audit - ' + (data.domain || 'Website'),
      subject: 'Prioritized technical SEO audit findings',
      author: 'Htech Digital Concepts - Ademola Habeeb',
      creator: 'Htech Advanced Site Auditor'
    });

    function setColor(method, color) { doc[method].apply(doc, color); }
    function textLines(text, textWidth, size, style) {
      doc.setFont('helvetica', style || 'normal');
      doc.setFontSize(size || 8);
      return doc.splitTextToSize(String(text == null || text === '' ? 'Not reported' : text), textWidth);
    }
    function startContentPage() {
      doc.addPage();
      setColor('setFillColor', COLORS.navy);
      doc.rect(0, 0, width, 15, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      setColor('setTextColor', [255, 255, 255]);
      doc.text('HTECH DIGITAL CONCEPTS  |  ADVANCED SITE AUDIT', MARGIN, 9.5);
      y = 23;
    }
    function ensureSpace(required) {
      if (y + required <= footerTop - 4) return;
      startContentPage();
    }
    function sectionTitle(title) {
      ensureSpace(13);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      setColor('setTextColor', COLORS.navy);
      doc.text(title, MARGIN, y + 5);
      setColor('setDrawColor', COLORS.yellow);
      doc.setLineWidth(1.1);
      doc.line(MARGIN, y + 8, MARGIN + 15, y + 8);
      y += 14;
    }
    function paragraph(text, options) {
      options = options || {};
      var size = options.size || 8;
      var lineHeight = options.lineHeight || 4;
      var lines = textLines(text, options.width || contentWidth, size, options.style || 'normal');
      var at = 0;
      while (at < lines.length) {
        var capacity = Math.max(1, Math.floor((footerTop - 5 - y) / lineHeight));
        if (!capacity) { startContentPage(); continue; }
        var chunk = lines.slice(at, at + capacity);
        doc.setFont('helvetica', options.style || 'normal');
        doc.setFontSize(size);
        setColor('setTextColor', options.color || COLORS.ink);
        doc.text(chunk, options.x || MARGIN, y + size * 0.38);
        y += chunk.length * lineHeight;
        at += chunk.length;
        if (at < lines.length) startContentPage();
      }
      y += options.after === undefined ? 2 : options.after;
    }
    function drawCover() {
      setColor('setFillColor', COLORS.navy);
      doc.rect(0, 0, width, 80, 'F');
      if (logo) doc.addImage(logo, 'PNG', MARGIN, 12, 49, 16.3);
      else {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(16); setColor('setTextColor', [255, 255, 255]);
        doc.text('Htech', MARGIN, 23);
      }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setColor('setTextColor', [255, 255, 255]);
      doc.text('ADEMOLA HABEEB', 75, 18);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      doc.text('Website Designer and WordPress Developer', 75, 24);
      setColor('setTextColor', COLORS.yellow); doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
      doc.text('WEBSITES THAT TURN VISITORS INTO CUSTOMERS', MARGIN, 42);
      setColor('setTextColor', [255, 255, 255]); doc.setFontSize(19);
      doc.text('Advanced Site Audit', MARGIN, 56);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text('SEO and site architecture report', MARGIN, 64);
      doc.setFontSize(8); doc.text('Website: ' + String(data.domain || data.url || 'Public website'), MARGIN, 72);
      doc.setFontSize(7.4); setColor('setTextColor', [211, 221, 233]);
      doc.text('A prioritized review of public pages reached during this bounded scan', MARGIN, 78);
      setColor('setTextColor', [211, 221, 233]); doc.setFontSize(7);
      doc.text('PREPARED ' + date.toUpperCase(), width - MARGIN, 18, { align: 'right' });
      y = 91;
    }
    function drawSummary() {
      var cards = [
        { label: 'PAGES INSPECTED', value: summary.pages_scanned || pages.length },
        { label: 'URLS DISCOVERED', value: summary.urls_discovered || 0 },
        { label: 'HIGH PRIORITY', value: summary.high || 0, color: COLORS.red },
        { label: 'MEDIUM PRIORITY', value: summary.medium || 0, color: COLORS.orange },
        { label: 'LOW PRIORITY', value: summary.low || 0, color: COLORS.blue },
        { label: 'XML SITEMAP', value: summary.sitemap_found ? 'Found' : 'Not found' }
      ];
      var gap = 3;
      var cardWidth = (contentWidth - gap * 2) / 3;
      var cardHeight = 19;
      ensureSpace(cardHeight * 2 + gap + 4);
      cards.forEach(function (card, index) {
        var col = index % 3;
        var row = Math.floor(index / 3);
        var x = MARGIN + col * (cardWidth + gap);
        var top = y + row * (cardHeight + gap);
        setColor('setFillColor', COLORS.soft); setColor('setDrawColor', COLORS.line);
        doc.roundedRect(x, top, cardWidth, cardHeight, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(14); setColor('setTextColor', card.color || COLORS.blue);
        doc.text(String(card.value), x + 4, top + 8);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(5.8); setColor('setTextColor', COLORS.muted);
        doc.text(card.label, x + 4, top + 14);
      });
      y += cardHeight * 2 + gap + 5;
      paragraph('Robots.txt disallow rules: ' + (summary.robots_disallow_rules || 0) + '. ' +
        (summary.limited_by_time ? 'The scan ended at its time limit.' : summary.limited_by_pages ? 'The scan reached its page limit.' : 'The scan completed within its configured limits.'),
        { size: 7.5, color: COLORS.muted, after: 4 });
    }
    function issueCard(issue) {
      var severity = ['high', 'medium', 'low'].indexOf(issue.severity) >= 0 ? issue.severity : 'low';
      var accent = severity === 'high' ? COLORS.red : severity === 'medium' ? COLORS.orange : COLORS.blue;
      var titleLines = textLines(issue.title || 'Site issue', contentWidth - 12, 8.5, 'bold');
      var urlLines = textLines(issue.url || 'Site-wide', contentWidth - 12, 6.5, 'normal');
      var messageLines = textLines(issue.message || 'Review this finding manually.', contentWidth - 12, 7.2, 'normal');
      var actionLines = textLines(issue.recommendation || 'Review the page and confirm the best next step.', contentWidth - 12, 7.2, 'normal');
      var totalLines = titleLines.length + urlLines.length + messageLines.length + actionLines.length;
      var cardHeight = 9 + totalLines * 3.5 + 3;
      if (cardHeight > footerTop - 28) {
        paragraph(issue.title || 'Site issue', { size: 8.5, style: 'bold', color: COLORS.navy, after: 1 });
        paragraph('Priority: ' + severity.toUpperCase() + ' | ' + (issue.url || 'Site-wide'), { size: 6.5, color: COLORS.muted, after: 1 });
        paragraph(issue.message || 'Review this finding manually.', { size: 7.2, after: 1 });
        paragraph('Suggested action: ' + (issue.recommendation || 'Review the page and confirm the best next step.'), { size: 7.2, color: COLORS.blue, after: 3 });
        return;
      }
      ensureSpace(cardHeight + 2);
      setColor('setFillColor', COLORS.soft); setColor('setDrawColor', COLORS.line);
      doc.roundedRect(MARGIN, y, contentWidth, cardHeight, 2, 2, 'FD');
      setColor('setFillColor', accent); doc.roundedRect(MARGIN, y, 2, cardHeight, 1, 1, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6); setColor('setTextColor', accent);
      doc.text(severity.toUpperCase() + ' PRIORITY', MARGIN + 6, y + 5);
      var textY = y + 10;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); setColor('setTextColor', COLORS.navy);
      doc.text(titleLines, MARGIN + 6, textY); textY += titleLines.length * 3.5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); setColor('setTextColor', COLORS.muted);
      doc.text(urlLines, MARGIN + 6, textY + 0.5); textY += urlLines.length * 3.5 + 1;
      doc.setFontSize(7.2); setColor('setTextColor', COLORS.ink);
      doc.text(messageLines, MARGIN + 6, textY); textY += messageLines.length * 3.5 + 1;
      setColor('setTextColor', COLORS.blue);
      doc.text(actionLines, MARGIN + 6, textY);
      y += cardHeight + 3;
    }
    function drawPages() {
      pages.forEach(function (page, index) {
        var title = String(page.title || 'No page title detected');
        var url = String(page.url || 'Unknown URL');
        var meta = 'HTTP ' + (page.status || '—') + '  |  Title length: ' + (page.title_length || 0) +
          '  |  H1s: ' + (page.h1_count || 0) + '  |  Images missing alt: ' + (page.images_missing_alt || 0) +
          '  |  JSON-LD: ' + (page.has_json_ld ? 'Yes' : 'No') + '  |  Redirects: ' + (page.redirects || 0);
        var titleLines = textLines(title, contentWidth - 10, 7.5, 'bold');
        var urlLines = textLines(url, contentWidth - 10, 6.2, 'normal');
        var metaLines = textLines(meta, contentWidth - 10, 6.2, 'normal');
        var blockHeight = 5 + (titleLines.length + urlLines.length + metaLines.length) * 3.3;
        ensureSpace(blockHeight + 2);
        setColor('setFillColor', COLORS.soft); setColor('setDrawColor', COLORS.line);
        doc.roundedRect(MARGIN, y, contentWidth, blockHeight, 1.5, 1.5, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setColor('setTextColor', COLORS.navy);
        var textY = y + 4;
        doc.text(titleLines, MARGIN + 5, textY); textY += titleLines.length * 3.3;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2); setColor('setTextColor', COLORS.blue);
        doc.text(urlLines, MARGIN + 5, textY); textY += urlLines.length * 3.3;
        setColor('setTextColor', COLORS.muted); doc.text(metaLines, MARGIN + 5, textY);
        y += blockHeight + 2;
      });
    }
    function addFooter() {
      var count = doc.getNumberOfPages();
      for (var page = 1; page <= count; page += 1) {
        doc.setPage(page);
        setColor('setDrawColor', COLORS.line); doc.setLineWidth(0.3);
        doc.line(MARGIN, footerTop, width - MARGIN, footerTop);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); setColor('setTextColor', COLORS.blue);
        doc.text('htechdigitalconcept@gmail.com', MARGIN, footerTop + 5);
        doc.link(MARGIN, footerTop + 1, 58, 6, { url: 'mailto:htechdigitalconcept@gmail.com' });
        doc.text('Connect on LinkedIn', MARGIN + 66, footerTop + 5);
        doc.link(MARGIN + 66, footerTop + 1, 47, 6, { url: 'https://www.linkedin.com/in/ademolahabeeb/' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); setColor('setTextColor', COLORS.muted);
        doc.text('Htech Digital Concepts  |  Website Design and WordPress Development', MARGIN, footerTop + 11);
        doc.text('Page ' + page + ' of ' + count, width - MARGIN, footerTop + 11, { align: 'right' });
      }
    }

    drawCover();
    sectionTitle('Audit snapshot');
    drawSummary();
    sectionTitle('Prioritized findings (' + issues.length + ')');
    if (!issues.length) paragraph('No issues were detected in the sampled pages. This does not guarantee the whole site is issue-free.', { size: 8, color: COLORS.muted, after: 4 });
    else issues.forEach(issueCard);
    if (pages.length) {
      sectionTitle('Crawl inventory (' + pages.length + ' pages)');
      drawPages();
    }
    sectionTitle('Scope and limitations');
    paragraph(data.scope || 'This report covers a bounded sample of public HTML pages reached during this scan. It is not a complete technical, security, performance, or accessibility audit.', { size: 7.5, color: COLORS.muted, after: 2 });
    addFooter();
    return doc;
  }

  window.SiteAuditPdf = {
    download: function (report) {
      if (!report) return Promise.reject(new Error('Run an audit before downloading a PDF.'));
      return ensureLibrary().then(loadLogo).then(function (logo) {
        var doc = createReport(report, logo);
        doc.save(safeSlug(report.domain));
        return doc;
      });
    }
  };
})();
