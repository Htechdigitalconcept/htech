(function () {
  'use strict';

  var app = document.querySelector('[data-migration-app]');
  if (!app) return;
  var form = app.querySelector('[data-migration-form]');
  var oldInput = app.querySelector('[data-old-urls]');
  var newInput = app.querySelector('[data-new-urls]');
  var redirectInput = app.querySelector('[data-redirects]');
  var submitButton = app.querySelector('[data-run-migration]');
  var status = app.querySelector('[data-migration-status]');
  var reportSection = app.querySelector('[data-migration-report]');
  var summaryPanel = app.querySelector('[data-report-summary]');
  var issuesPanel = app.querySelector('[data-report-issues]');
  var rulesPanel = app.querySelector('[data-report-rules]');
  var currentReport = null;
  var MAX_ROWS = 5000;
  var DISPLAY_LIMIT = 300;

  function make(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function setStatus(message, kind) {
    status.textContent = message;
    status.className = 'migration-status' + (kind ? ' migration-status--' + kind : '');
  }

  function splitCsv(text) {
    var rows = [];
    var row = [];
    var cell = '';
    var quoted = false;
    var input = String(text || '').replace(/^\uFEFF/, '');
    for (var i = 0; i < input.length; i += 1) {
      var char = input[i];
      if (quoted) {
        if (char === '"' && input[i + 1] === '"') { cell += '"'; i += 1; }
        else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') { row.push(cell.trim()); cell = ''; }
      else if (char === '\n' || char === '\r') {
        if (char === '\r' && input[i + 1] === '\n') i += 1;
        row.push(cell.trim());
        if (row.some(function (value) { return value; })) rows.push(row);
        row = []; cell = '';
      } else cell += char;
    }
    row.push(cell.trim());
    if (row.some(function (value) { return value; })) rows.push(row);
    return rows;
  }

  function isHeader(row, kind) {
    var first = String(row[0] || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (kind === 'mapping') {
      var second = String(row[1] || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
      return ['source', 'from', 'old_url', 'old', 'redirect_from'].indexOf(first) >= 0 &&
        ['destination', 'to', 'new_url', 'new', 'target', 'redirect_to'].indexOf(second) >= 0;
    }
    return ['url', 'urls', 'old_url', 'new_url', 'source', 'from'].indexOf(first) >= 0;
  }

  function linesToList(text) {
    return String(text || '').split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean).slice(0, MAX_ROWS + 1);
  }

  function fileList(rows) {
    if (rows.length && isHeader(rows[0], 'list')) rows = rows.slice(1);
    return rows.map(function (row) { return String(row[0] || '').trim(); }).filter(Boolean).slice(0, MAX_ROWS + 1).join('\n');
  }

  function fileMappings(rows) {
    if (rows.length && isHeader(rows[0], 'mapping')) rows = rows.slice(1);
    return rows.map(function (row) {
      if (!row[0] && !row[1]) return '';
      return row.map(function (value) { return '"' + String(value || '').replace(/"/g, '""') + '"'; }).join(',');
    }).filter(Boolean).slice(0, MAX_ROWS + 1).join('\n');
  }

  function attachFile(input, target, kind) {
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 1_000_000) {
        setStatus('That file is larger than the 1 MB upload limit.', 'error');
        input.value = '';
        return;
      }
      file.text().then(function (text) {
        var isCsv = /\.csv$/i.test(file.name);
        if (kind === 'list' && !isCsv) target.value = linesToList(text).join('\n');
        else {
          var rows = splitCsv(text);
          target.value = kind === 'mapping' ? fileMappings(rows) : fileList(rows);
        }
        var rowCount = linesToList(target.value).length;
        setStatus('Loaded ' + rowCount.toLocaleString() + ' row(s) from ' + file.name + '. Review the values before comparing.', 'success');
      }).catch(function () {
        setStatus('The file could not be read. Try a plain-text or UTF-8 CSV file.', 'error');
      });
      input.value = '';
    });
  }

  attachFile(app.querySelector('[data-old-file]'), oldInput, 'list');
  attachFile(app.querySelector('[data-new-file]'), newInput, 'list');
  attachFile(app.querySelector('[data-redirect-file]'), redirectInput, 'mapping');

  function clearReport() {
    currentReport = null;
    reportSection.hidden = true;
    summaryPanel.replaceChildren();
    issuesPanel.replaceChildren();
    rulesPanel.replaceChildren();
    app.querySelectorAll('[data-download-vercel], [data-download-apache], [data-download-nginx], [data-download-csv], [data-download-findings]').forEach(function (button) { button.disabled = true; });
  }

  function renderSummary(summary) {
    summaryPanel.replaceChildren();
    [
      ['old_urls', 'Old URLs'], ['new_urls', 'New URLs'], ['unchanged', 'Unchanged URLs'], ['matched', 'Redirects matched'],
      ['missing', 'Missing destinations', 'high'], ['ambiguous', 'Ambiguous paths', 'medium'], ['redirect_rules', 'Rules ready'], ['manual_rules', 'Manual query review', 'medium'], ['redirect_chains', 'Redirect chains', 'medium'], ['redirect_loops', 'Redirect loops', 'high'], ['invalid_rows', 'Invalid rows', 'high']
    ].forEach(function (item) {
      var card = make('div', 'migration-stat' + (item[2] ? ' migration-stat--' + item[2] : ''));
      card.appendChild(make('strong', '', Number(summary[item[0]]) || 0));
      card.appendChild(make('span', '', item[1]));
      summaryPanel.appendChild(card);
    });
  }

  function renderIssue(issue) {
    var level = ['high', 'medium', 'low'].indexOf(issue.severity) >= 0 ? issue.severity : 'low';
    var card = make('article', 'migration-issue migration-issue--' + level);
    card.appendChild(make('span', 'migration-issue__level', level + ' priority'));
    card.appendChild(make('h4', '', issue.title || 'Migration finding'));
    if (issue.source) card.appendChild(make('code', '', issue.source));
    card.appendChild(make('p', '', issue.message || 'Review this mapping.'));
    if (issue.destination) card.appendChild(make('code', '', 'Destination: ' + issue.destination));
    if (issue.recommendation) card.appendChild(make('p', 'migration-issue__recommendation', issue.recommendation));
    return card;
  }

  function renderRules(rules) {
    rulesPanel.replaceChildren();
    if (!rules.length) {
      rulesPanel.appendChild(make('p', 'migration-empty', 'No redirect rules are ready to export. Resolve missing or invalid destinations, then run the comparison again.'));
      return;
    }
    rules.slice(0, DISPLAY_LIMIT).forEach(function (rule) {
      var item = make('article', 'migration-rule');
      item.appendChild(make('code', '', rule.source));
      item.appendChild(make('span', 'migration-rule__arrow', '→'));
      item.appendChild(make('code', '', rule.destination));
      item.appendChild(make('span', 'migration-rule__status', rule.status === 'ready' ? 'Ready · permanent redirect' : 'Manual query review · excluded from platform snippets'));
      rulesPanel.appendChild(item);
    });
    if (rules.length > DISPLAY_LIMIT) rulesPanel.appendChild(make('p', 'migration-truncation', 'Showing ' + DISPLAY_LIMIT + ' of ' + rules.length.toLocaleString() + ' rules. Downloads include the complete ruleset.'));
  }

  function renderReport(data) {
    currentReport = data;
    renderSummary(data.summary || {});
    var issues = Array.isArray(data.issues) ? data.issues : [];
    app.querySelector('[data-report-issue-count]').textContent = issues.length.toLocaleString() + ' finding(s)';
    app.querySelector('[data-report-rule-count]').textContent = (data.rules || []).length.toLocaleString() + ' rule(s)';
    app.querySelector('[data-report-scope]').textContent = data.scope || 'Only the submitted URL text was compared; no site was crawled.';
    issuesPanel.replaceChildren();
    if (!issues.length) issuesPanel.appendChild(make('p', 'migration-empty', 'No issues were detected in the submitted lists. Review all URLs and test the rules in staging before launch.'));
    else issues.slice(0, DISPLAY_LIMIT).forEach(function (issue) { issuesPanel.appendChild(renderIssue(issue)); });
    var truncated = app.querySelector('[data-issue-truncation]');
    truncated.hidden = issues.length <= DISPLAY_LIMIT;
    truncated.textContent = truncated.hidden ? '' : 'Showing ' + DISPLAY_LIMIT + ' of ' + issues.length.toLocaleString() + ' findings. The downloadable CSV includes the full report.';
    renderRules(Array.isArray(data.rules) ? data.rules : []);
    reportSection.hidden = false;
    app.querySelectorAll('[data-download-vercel], [data-download-apache], [data-download-nginx], [data-download-csv], [data-download-findings]').forEach(function (button) { button.disabled = false; });
    reportSection.focus({ preventScroll: true });
    reportSection.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  function download(content, mime, filename) {
    var blob = new Blob([content], { type: mime });
    var objectUrl = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }

  function downloadExport(key, filename, mime) {
    if (!currentReport || !currentReport.exports) return;
    download(currentReport.exports[key] || '', mime, filename);
  }

  app.querySelector('[data-download-vercel]').addEventListener('click', function () { downloadExport('vercel', 'vercel-redirects.json', 'application/json;charset=utf-8'); });
  app.querySelector('[data-download-apache]').addEventListener('click', function () { downloadExport('apache', '.htaccess-migration-rules.txt', 'text/plain;charset=utf-8'); });
  app.querySelector('[data-download-nginx]').addEventListener('click', function () { downloadExport('nginx', 'nginx-migration-rules.conf', 'text/plain;charset=utf-8'); });
  app.querySelector('[data-download-csv]').addEventListener('click', function () { downloadExport('csv', 'migration-redirect-rules.csv', 'text/csv;charset=utf-8'); });
  app.querySelector('[data-download-findings]').addEventListener('click', function () { downloadExport('findings_csv', 'migration-qa-findings.csv', 'text/csv;charset=utf-8'); });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearReport();
    var oldUrls = linesToList(oldInput.value);
    var newUrls = linesToList(newInput.value);
    var redirectRows = splitCsv(redirectInput.value).filter(function (row) { return row.some(function (value) { return value; }); });
    if (redirectRows.length && isHeader(redirectRows[0], 'mapping')) redirectRows = redirectRows.slice(1);
    var redirects = redirectRows.map(function (row) { return { source: row[0] || '', destination: row[1] || '' }; });
    if (oldUrls.length > MAX_ROWS || newUrls.length > MAX_ROWS || redirects.length > MAX_ROWS) {
      setStatus('Each list and redirect mapping is limited to 5,000 rows. Reduce the input and try again.', 'error');
      return;
    }
    if (!oldUrls.length || !newUrls.length) {
      setStatus('Add at least one old URL and one new URL before comparing.', 'error');
      return;
    }
    var requestBody = JSON.stringify({ old_urls: oldUrls, new_urls: newUrls, redirects: redirects });
    if (new Blob([requestBody]).size > 700_000) {
      setStatus("The combined input exceeds this scan's request limit. Shorten or split the lists, then compare again.", 'error');
      return;
    }
    submitButton.disabled = true;
    submitButton.textContent = 'Comparing URL lists…';
    setStatus('Validating URL inventories and checking redirect paths…', 'loading');
    try {
      var response = await fetch('/api/migration-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        cache: 'no-store',
        credentials: 'same-origin'
      });
      var payload = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(payload.error || 'The comparison could not be completed. Please review the inputs and try again.');
      renderReport(payload);
      setStatus('Comparison complete. Review all suggestions and test exported rules in staging.', 'success');
    } catch (error) {
      setStatus(error.message || 'The comparison could not be completed. Please try again.', 'error');
      status.focus();
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = 'Compare URL lists <span class="btn__arrow" aria-hidden="true">→</span>';
    }
  });
})();
