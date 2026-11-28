(function () {
  'use strict';

  var app = document.querySelector('[data-catalog-app]');
  if (!app) return;
  var form = app.querySelector('[data-catalog-form]');
  var fileInput = app.querySelector('[data-catalog-file]');
  var runButton = app.querySelector('[data-run-catalog]');
  var status = app.querySelector('[data-catalog-status]');
  var reportSection = app.querySelector('[data-catalog-report]');
  var summaryPanel = app.querySelector('[data-catalog-summary]');
  var issuesPanel = app.querySelector('[data-catalog-issues]');
  var currentReport = null;
  var activeFilter = 'all';
  var MAX_FILE_BYTES = 3_000_000;
  var DISPLAY_LIMIT = 300;
  var template = 'Type,SKU,Name,Published,Regular price,Sale price,Categories,Images,Description\r\nsimple,TSHIRT-001,Example cotton T-shirt,1,29.95,,Clothing > T-shirts,https://example.com/tshirt.jpg,Soft cotton crew-neck T-shirt.\r\n';

  function make(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function setStatus(message, kind) {
    status.textContent = message;
    status.className = 'catalog-status' + (kind ? ' catalog-status--' + kind : '');
  }

  function clearReport() {
    currentReport = null;
    reportSection.hidden = true;
    summaryPanel.replaceChildren();
    issuesPanel.replaceChildren();
    app.querySelector('[data-download-findings]').disabled = true;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  function checkFile(file) {
    if (!file) return 'Choose a CSV file first.';
    if (!/\.csv$/i.test(file.name)) return 'Choose a file with the .csv extension.';
    if (!file.size) return 'The selected CSV is empty.';
    if (file.size > MAX_FILE_BYTES) return 'This file exceeds the 3 MB limit. Export a smaller product selection and try again.';
    return '';
  }

  fileInput.addEventListener('change', function () {
    clearReport();
    var file = fileInput.files && fileInput.files[0];
    var problem = checkFile(file);
    runButton.disabled = !!problem;
    if (problem) {
      app.querySelector('[data-file-label]').textContent = file ? file.name : 'Choose a WooCommerce product CSV';
      app.querySelector('[data-file-meta]').textContent = problem;
      setStatus(problem, 'error');
      return;
    }
    app.querySelector('[data-file-label]').textContent = file.name;
    app.querySelector('[data-file-meta]').textContent = formatBytes(file.size) + ' · Ready to analyze';
    setStatus('File selected. It will only be uploaded after you run the analysis.', 'success');
  });

  function addSummaryCard(value, label, modifier) {
    var card = make('div', 'catalog-stat' + (modifier ? ' catalog-stat--' + modifier : ''));
    card.appendChild(make('strong', '', String(value)));
    card.appendChild(make('span', '', label));
    summaryPanel.appendChild(card);
  }

  function renderSummary(summary) {
    summaryPanel.replaceChildren();
    addSummaryCard(summary.products_scanned || 0, 'Products analyzed');
    addSummaryCard(summary.duplicate_sku_groups || 0, 'Duplicate SKU groups', summary.duplicate_sku_groups ? 'high' : '');
    addSummaryCard(summary.missing_field_findings || 0, 'Missing field findings', summary.missing_field_findings ? 'medium' : '');
    addSummaryCard(summary.invalid_price_findings || 0, 'Price findings', summary.invalid_price_findings ? 'high' : '');
    addSummaryCard(summary.invalid_image_urls || 0, 'Invalid image URLs', summary.invalid_image_urls ? 'medium' : '');
    addSummaryCard(summary.high || 0, 'High priority', 'high');
    addSummaryCard(summary.medium || 0, 'Medium priority', 'medium');
    addSummaryCard(summary.low || 0, 'Low priority', 'low');
  }

  function renderIssue(issue) {
    var severity = ['high', 'medium', 'low'].indexOf(issue.severity) >= 0 ? issue.severity : 'low';
    var card = make('article', 'catalog-issue catalog-issue--' + severity);
    card.appendChild(make('span', 'catalog-issue__level', severity + ' priority'));
    card.appendChild(make('h4', '', issue.title || 'Catalog finding'));
    var product = [issue.sku ? 'SKU ' + issue.sku : '', issue.product_name || ''].filter(Boolean).join(' · ');
    card.appendChild(make('p', 'catalog-issue__meta', 'CSV row ' + (issue.row || '—') + (product ? ' · ' + product : '')));
    card.appendChild(make('p', '', issue.message || 'Review this product row.'));
    if (issue.recommendation) card.appendChild(make('p', 'catalog-issue__action', issue.recommendation));
    return card;
  }

  function renderIssues() {
    if (!currentReport) return;
    issuesPanel.replaceChildren();
    var issues = Array.isArray(currentReport.issues) ? currentReport.issues : [];
    if (activeFilter !== 'all') issues = issues.filter(function (issue) { return issue.severity === activeFilter; });
    if (!issues.length) {
      issuesPanel.appendChild(make('p', 'catalog-empty', activeFilter === 'all' ? 'No catalog issues were detected in the analyzed rows. Review the export columns and sample a few products before importing catalog changes.' : 'No ' + activeFilter + '-priority findings were reported.'));
      return;
    }
    issues.slice(0, DISPLAY_LIMIT).forEach(function (issue) { issuesPanel.appendChild(renderIssue(issue)); });
  }

  function renderReport(data) {
    currentReport = data;
    activeFilter = 'all';
    renderSummary(data.summary || {});
    app.querySelector('[data-catalog-scope]').textContent = data.scope || 'The file was processed in memory and was not saved.';
    var summary = data.summary || {};
    var limited = app.querySelector('[data-catalog-limited]');
    limited.hidden = !summary.rows_truncated;
    limited.textContent = summary.rows_truncated ? 'The file exceeded the 5,000-row analysis cap. This report covers the first 5,000 non-blank product rows only.' : '';
    var truncated = app.querySelector('[data-findings-truncated]');
    truncated.hidden = !summary.findings_truncated && (summary.findings_total || 0) <= DISPLAY_LIMIT;
    truncated.textContent = truncated.hidden ? '' : 'Showing up to ' + DISPLAY_LIMIT + ' findings on screen and ' + (summary.findings_returned || 0).toLocaleString() + ' in the CSV. ' + (summary.findings_truncated ? 'The analyzer reached its report cap; some findings were not returned.' : 'The full returned findings are in the CSV download.');
    var columns = Array.isArray(data.columns_recognized) ? data.columns_recognized : [];
    app.querySelector('[data-catalog-columns]').textContent = columns.length ? 'Recognized CSV fields: ' + columns.join(', ') + (summary.blank_rows_skipped ? ' · Blank rows skipped: ' + summary.blank_rows_skipped : '') : '';
    var filters = app.querySelectorAll('[data-filter]');
    filters.forEach(function (button) { button.setAttribute('aria-pressed', button.getAttribute('data-filter') === 'all' ? 'true' : 'false'); });
    app.querySelector('[data-download-findings]').disabled = false;
    reportSection.hidden = false;
    renderIssues();
    reportSection.focus({ preventScroll: true });
    reportSection.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  function download(content, mime, name) {
    var blob = new Blob([content], { type: mime });
    var objectUrl = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }

  function csvCell(value) {
    var text = String(value == null ? '' : value);
    if (/^\s*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  app.querySelector('[data-download-findings]').addEventListener('click', function () {
    if (!currentReport) return;
    var rows = [['Priority', 'CSV row', 'Issue', 'SKU', 'Product name', 'Details', 'Recommended action']];
    (currentReport.issues || []).forEach(function (issue) {
      rows.push([issue.severity, issue.row, issue.title, issue.sku, issue.product_name, issue.message, issue.recommendation]);
    });
    var csv = '\ufeff' + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
    download(csv, 'text/csv;charset=utf-8', 'woocommerce-catalog-findings.csv');
  });
  app.querySelector('[data-download-template]').addEventListener('click', function () {
    download(template, 'text/csv;charset=utf-8', 'woocommerce-catalog-sample-template.csv');
  });

  app.querySelector('[data-catalog-report]').addEventListener('click', function (event) {
    var button = event.target.closest('[data-filter]');
    if (!button) return;
    activeFilter = button.getAttribute('data-filter');
    app.querySelectorAll('[data-filter]').forEach(function (filter) {
      filter.setAttribute('aria-pressed', filter === button ? 'true' : 'false');
    });
    renderIssues();
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearReport();
    var file = fileInput.files && fileInput.files[0];
    var problem = checkFile(file);
    if (problem) {
      setStatus(problem, 'error');
      fileInput.focus();
      return;
    }
    runButton.disabled = true;
    runButton.textContent = 'Analyzing product rows…';
    setStatus('Parsing the CSV, checking catalog fields and validating price and image formats…', 'loading');
    var controller = new AbortController();
    var timeout = window.setTimeout(function () { controller.abort(); }, 25_000);
    try {
      var response = await fetch('/api/woocommerce-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
        body: file,
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'same-origin'
      });
      var payload = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(payload.error || 'The catalog could not be analyzed. Check the CSV and try again.');
      renderReport(payload);
      setStatus('Catalog analysis complete. Review findings in context before changing your store.', 'success');
    } catch (error) {
      var message = error.name === 'AbortError' ? 'The analysis exceeded the time limit. Try a smaller CSV export.' : (error.message || 'The catalog could not be analyzed. Please try again.');
      setStatus(message, 'error');
      status.focus();
    } finally {
      window.clearTimeout(timeout);
      runButton.disabled = !fileInput.files || !fileInput.files.length || !!checkFile(fileInput.files[0]);
      runButton.innerHTML = 'Analyze catalog <span class="btn__arrow" aria-hidden="true">→</span>';
    }
  });
})();
