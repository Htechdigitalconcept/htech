# Htech Free Tools — Delivery Tracker

A version-controlled roadmap for the public tools linked from the site footer. The tools are intended to help business owners and create a useful, honest path to Htech services. New entries should preserve privacy, explain scan limits, and avoid promising search rankings or business results.

## Tool roadmap

| Tool | Status | What it does | Next milestone |
|---|---|---|---|
| Growth Check | Live | Reviews a small sample of public pages or creates a first-site blueprint. | Maintain and improve based on user feedback. |
| Structured Data Schema Builder | Live | Creates copy-ready JSON-LD for organizations, businesses, services, websites, FAQs, and breadcrumbs. | Add linked `@graph` generation. |
| Advanced Site Auditor | Live in this release | Python-powered, same-site crawl of up to 12 public pages; checks page metadata, headings, canonical signals, sitemap/robots, duplicates, redirect chains, and discovered broken URLs. Offers CSV, JSON, and branded PDF reports. | Monitor scan reliability and tune crawl limits using real-world feedback. |
| Website Migration & Redirect QA Lab | Live | Python-powered comparison of old/new URL inventories with optional CSV redirect mappings; flags missing, ambiguous, invalid, duplicate, chained, and looping redirects. Builds reviewed, chain-free exports for Vercel, Apache, Nginx, and CSV. Supports pasted URL lists plus .txt/.csv uploads, with 5,000-row caps and no site crawling or persistent storage. | Monitor real-world usability and improve platform-specific exports based on feedback. |
| WooCommerce Catalog Quality Analyzer | Live | Python-backed analysis of standard WooCommerce product CSV exports for duplicate SKUs, missing fields, invalid regular/sale prices, and malformed image URL formats. Offers a prioritized findings CSV and sample template; supports UTF-8/Windows-1252 with a 3 MB/5,000-row cap and ephemeral processing. | Monitor supported exports and refine catalog checks based on feedback. |
| Accessibility & Frontend Audit Runner | Planned | Runs bounded browser checks for labels, keyboard navigation, contrast, and common responsive issues across selected pages. | Decide the scan engine and safe browser/runtime limits. |

## Release guardrails

- Keep each tool usable without a paid external API where practical; disclose hosting or scan limits clearly.
- Never commit API keys, bot tokens, credentials, or user-submitted reports.
- For URL scanners, allow public HTTP/HTTPS pages only, pin requests to validated public IPs, stay on the entered site, cap pages/bytes/time, avoid form submissions, and honor robots.txt rules.
- Do not claim that a technical signal guarantees ranking, traffic, accessibility compliance, or conversion results.
- A tool is **Live** only after it is merged to `main` and its Vercel production check succeeds.

## Change log

- Added the Advanced Site Auditor as the first Python-backed multi-page tool in this delivery.
- Added the Website Migration & Redirect QA Lab in PR #42 and deployed it after merge; the merged revision's Vercel production check passed.
- Added the WooCommerce Catalog Quality Analyzer in PR #44; the merged revision passed its Vercel production check and is live.
