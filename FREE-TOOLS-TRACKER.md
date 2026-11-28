# Htech Free Tools — Delivery Tracker

A version-controlled roadmap for the public tools linked from the site footer. The tools are intended to help business owners and create a useful, honest path to Htech services. New entries should preserve privacy, explain scan limits, and avoid promising search rankings or business results.

## Tool roadmap

| Tool | Status | What it does | Next milestone |
|---|---|---|---|
| Growth Check | Live | Reviews a small sample of public pages or creates a first-site blueprint. | Maintain and improve based on user feedback. |
| Structured Data Schema Builder | Live | Creates copy-ready JSON-LD for organizations, businesses, services, websites, FAQs, and breadcrumbs. | Add linked `@graph` generation. |
| Advanced Site Auditor | Live in this release | Python-powered, same-site crawl of up to 12 public pages; checks page metadata, headings, canonical signals, sitemap/robots, duplicates, redirect chains, and discovered broken URLs. Offers CSV and JSON reports. | Monitor scan reliability and tune crawl limits using real-world feedback. |
| Website Migration & Redirect QA Lab | Planned | Compares old/new URL lists, detects missing destinations, redirect chains and loops, then exports redirect rules for Vercel, Apache, or Nginx. | Define supported upload formats and ruleset tests. |
| WooCommerce Catalog Quality Analyzer | Planned | Checks a product CSV for duplicate SKUs, incomplete fields, invalid prices, and image URL problems; exports a review/fix report. | Agree on supported WooCommerce export columns. |
| Accessibility & Frontend Audit Runner | Planned | Runs bounded browser checks for labels, keyboard navigation, contrast, and common responsive issues across selected pages. | Decide the scan engine and safe browser/runtime limits. |

## Release guardrails

- Keep each tool usable without a paid external API where practical; disclose hosting or scan limits clearly.
- Never commit API keys, bot tokens, credentials, or user-submitted reports.
- For URL scanners, allow public HTTP/HTTPS pages only, pin requests to validated public IPs, stay on the entered site, cap pages/bytes/time, avoid form submissions, and honor robots.txt rules.
- Do not claim that a technical signal guarantees ranking, traffic, accessibility compliance, or conversion results.
- A tool is **Live** only after it is merged to `main` and its Vercel production check succeeds.

## Change log

- Added the Advanced Site Auditor as the first Python-backed multi-page tool in this delivery.
