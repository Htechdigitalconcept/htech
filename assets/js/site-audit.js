(function () {
  'use strict';

  var app = document.querySelector('[data-site-audit-app]');
  if (!app) return;

  var form = app.querySelector('[data-audit-form]');
  var urlInput = app.querySelector('#audit-url');
  var submitButton = app.querySelector('[data-audit-submit]');
  var status = app.querySelector('[data-audit-status]');
  var report = app.querySelector('[data-audit-report]');
  var domainLabel = app.querySelector('[data-audit-domain]');
  var summaryPanel = app.querySelector('[data-audit-summary]');
  var issuesPanel = app.querySelector('[data-audit-issues]');
  var pagesPanel = app.querySelector('[data-audit-pages]');
  var scopeLabel = app.querySelector('[data-audit-scope]');
  var limitedNote = app.querySelector('[data-audit-limited]');
  var currentReport = null;
  var activeFilter = 'all';
  var loadingTimer = null;
  var loadingMessageIndex = 0;
  var loadingMessages = [
    'Checking the public homepage and basic robots.txt rules…',
    'Looking for the sitemap and same-site pages…',
    'Reviewing page titles, headings, canonicals and links…',
    'Prioritizing issues from the pages reached within the scan limit…'
  ];

  function make(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function setStatus(message, kind) {
    status.textContent = message;
    status.className = 'audit-status' + (kind ? ' audit-status--' + kind : '');
  }

  function normalizeUrl(value) {
    var raw = String(value || '').trim();
    if (!raw || raw.length > 2048) throw new Error('Enter a public website URL to start the audit.');
    var parsed;
    try { parsed = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); }
    catch (error) { throw new Error('That address does not look valid. Try a domain such as example.com.'); }
    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error('Use a public http:// or https:// website address without sign-in details.');
    }
    if (parsed.hostname.indexOf('.') < 0 || parsed.hostname === 'localhost') {
      throw new Error('Enter a public website domain, not a local address.');
    }
    parsed.hash = '';
    return parsed.href;
  }

  function clearReport() {
    currentReport = null;
    report.hidden = true;
    summaryPanel.replaceChildren();
    issuesPanel.replaceChildren();
    pagesPanel.replaceChildren();
    limitedNote.hidden = true;
  }

  function setLoading(isLoading) {
    if (loadingTimer) window.clearInterval(loadingTimer);
    loadingTimer = null;
    submitButton.disabled = isLoading;
    submitButton.innerHTML = isLoading ? 'Scanning public pages <span class="btn__arrow" aria-hidden="true">…</span>' : 'Run my site audit <span class="btn__arrow" aria-hidden="true">→</span>';
    if (!isLoading) return;
    loadingMessageIndex = 0;
    setStatus(loadingMessages[loadingMessageIndex], 'loading');
    loadingTimer = window.setInterval(function () {
      loadingMessageIndex = (loadingMessageIndex + 1) % loadingMessages.length;
      setStatus(loadingMessages[loadingMessageIndex], 'loading');
    }, 2500);
  }

  function addStat(value, label, modifier) {
    var stat = make('div', 'audit-stat' + (modifier ? ' audit-stat--' + modifier : ''));
    stat.appendChild(make('strong', 'audit-stat__value', String(value)));
    stat.appendChild(make('span', 'audit-stat__label', label));
    summaryPanel.appendChild(stat);
  }

  function renderSummary(data) {
    var summary = data.summary || {};
    summaryPanel.replaceChildren();
    addStat(summary.pages_scanned || 0, 'Pages inspected');
    addStat(summary.urls_discovered || 0, 'Same-site URLs found');
    addStat(summary.high || 0, 'High priority', 'high');
    addStat(summary.medium || 0, 'Medium priority', 'medium');
    addStat(summary.low || 0, 'Low priority', 'low');
    var sitemap = make('div', 'audit-stat');
    sitemap.appendChild(make('strong', 'audit-stat__value', summary.sitemap_found ? 'Found' : 'Not found'));
    sitemap.appendChild(make('span', 'audit-stat__label', 'XML sitemap'));
    summaryPanel.appendChild(sitemap);
    var robots = make('div', 'audit-stat');
    robots.appendChild(make('strong', 'audit-stat__value', String(summary.robots_disallow_rules || 0)));
    robots.appendChild(make('span', 'audit-stat__label', 'Robots disallow rules'));
    summaryPanel.appendChild(robots);
  }

  function safeHttpUrl(value) {
    try {
      var parsed = new URL(value);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
    } catch (error) { /* An invalid returned link is shown as plain text. */ }
    return '';
  }

  function renderIssue(issue) {
    var level = issue.severity === 'high' || issue.severity === 'medium' ? issue.severity : 'low';
    var card = make('article', 'audit-issue audit-issue--' + level);
    card.appendChild(make('span', 'audit-issue__severity', level + ' priority'));
    card.appendChild(make('h4', '', issue.title || 'Site issue'));
    card.appendChild(make('p', '', issue.message || 'Review this page manually.'));
    card.appendChild(make('p', 'audit-issue__action', issue.recommendation || 'Review the page and confirm the best next step.'));
    var href = safeHttpUrl(issue.url || '');
    if (href) {
      var link = make('a', 'audit-issue__url', issue.url);
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      card.appendChild(link);
    }
    return card;
  }

  function renderIssues() {
    if (!currentReport) return;
    issuesPanel.replaceChildren();
    var issues = Array.isArray(currentReport.issues) ? currentReport.issues : [];
    if (activeFilter !== 'all') issues = issues.filter(function (issue) { return issue.severity === activeFilter; });
    if (!issues.length) {
      var message = activeFilter === 'all' ? 'No issues were detected in the sampled pages. This does not guarantee the whole site is issue-free.' : 'No ' + activeFilter + '-priority findings in this scan.';
      issuesPanel.appendChild(make('p', 'audit-empty', message));
      return;
    }
    issues.forEach(function (issue) { issuesPanel.appendChild(renderIssue(issue)); });
  }

  function renderPages(data) {
    pagesPanel.replaceChildren();
    (Array.isArray(data.pages) ? data.pages : []).forEach(function (page) {
      var item = make('article', 'audit-page');
      item.appendChild(make('strong', 'audit-page__title', page.title || 'No page title detected'));
      item.appendChild(make('span', 'audit-page__status', 'HTTP ' + (page.status || '—')));
      var href = safeHttpUrl(page.url || '');
      if (href) {
        var link = make('a', 'audit-page__url', page.url);
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        item.appendChild(link);
      }
      item.appendChild(make('span', 'audit-page__meta',
        'Title: ' + (page.title_length || 0) + ' chars · H1s: ' + (page.h1_count || 0) +
        ' · Images without alt: ' + (page.images_missing_alt || 0) +
        ' · ' + (page.has_json_ld ? 'JSON-LD detected' : 'No JSON-LD detected') +
        ' · Redirects: ' + (page.redirects || 0)
      ));
      pagesPanel.appendChild(item);
    });
  }

  function renderReport(data) {
    currentReport = data;
    activeFilter = 'all';
    domainLabel.textContent = data.domain ? 'Results for ' + data.domain : 'Website audit results';
    renderSummary(data);
    renderIssues();
    renderPages(data);
    scopeLabel.textContent = data.scope || 'This is a limited sample of public HTML, not a complete technical, security or performance audit.';
    var wasLimited = !!(data.summary && (data.summary.limited_by_time || data.summary.limited_by_pages));
    limitedNote.hidden = !wasLimited;
    if (!limitedNote.hidden) {
      limitedNote.textContent = data.summary.limited_by_time
        ? 'The free scan time limit was reached. This report covers only the pages fetched so far; run another scan later or request a deeper manual review.'
        : 'The free scan reached its 12-page cap. This report is a sample, not a complete crawl of the site.';
    }
    report.hidden = false;
    report.focus({ preventScroll: true });
    report.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  function csvCell(value) {
    var text = String(value == null ? '' : value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function downloadBlob(content, type, name) {
    var blob = new Blob([content], { type: type });
    var objectUrl = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }

  function safeFileSlug(value) {
    return String(value || 'site-audit').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'site-audit';
  }

  function exportCsv() {
    if (!currentReport) return;
    var rows = [['Priority', 'Finding', 'Page URL', 'Details', 'Suggested next step']];
    (currentReport.issues || []).forEach(function (issue) {
      rows.push([issue.severity, issue.title, issue.url, issue.message, issue.recommendation]);
    });
    var csv = '\ufeff' + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
    downloadBlob(csv, 'text/csv;charset=utf-8', safeFileSlug(currentReport.domain) + '-site-audit-issues.csv');
  }

  function exportJson() {
    if (!currentReport) return;
    downloadBlob(JSON.stringify(currentReport, null, 2) + '\n', 'application/json;charset=utf-8', safeFileSlug(currentReport.domain) + '-site-audit.json');
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearReport();
    var url;
    try { url = normalizeUrl(urlInput.value); }
    catch (error) {
      setStatus(error.message, 'error');
      urlInput.focus();
      return;
    }

    setLoading(true);
    try {
      var controller = new AbortController();
      var timeout = window.setTimeout(function () { controller.abort(); }, 14_000);
      var response;
      try {
        response = await fetch('/api/site-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url }),
          signal: controller.signal,
          cache: 'no-store',
          credentials: 'same-origin'
        });
      } finally {
        window.clearTimeout(timeout);
      }
      var payload = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(payload.error || 'The audit could not be completed. Please try again.');
      renderReport(payload);
      setStatus('Audit complete. The report covers only the public pages reached during this scan.', 'success');
    } catch (error) {
      var message = error.name === 'AbortError' ? 'The scan took longer than the free time limit. Try again later or request a manual review.' : (error.message || 'The audit could not be completed. Please try again.');
      setStatus(message, 'error');
      status.focus();
    } finally {
      setLoading(false);
    }
  });

  app.querySelector('[data-audit-report]').addEventListener('click', function (event) {
    var button = event.target.closest('[data-filter]');
    if (!button) return;
    activeFilter = button.getAttribute('data-filter');
    Array.prototype.forEach.call(app.querySelectorAll('[data-filter]'), function (filter) {
      filter.setAttribute('aria-pressed', filter === button ? 'true' : 'false');
    });
    renderIssues();
  });
  app.querySelector('[data-export-csv]').addEventListener('click', exportCsv);
  app.querySelector('[data-export-json]').addEventListener('click', exportJson);
})();
