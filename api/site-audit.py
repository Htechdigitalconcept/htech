"""Bounded, same-origin technical site audit for the Htech Free Tools collection."""
from __future__ import annotations

import json
import re
import time
from collections import defaultdict
from html import unescape
from http.server import BaseHTTPRequestHandler
from urllib.parse import quote, urljoin, urlsplit, urlunsplit

from lib import growth_check_core as _GROWTH

MAX_BODY_BYTES = 4096
MAX_AUDIT_PAGES = 12
MAX_AUDIT_SECONDS = 6.5
MAX_PAGE_BYTES = 300_000
MAX_SITEMAP_BYTES = 180_000
MAX_SITEMAP_URLS = 500
MAX_CANDIDATES = 120
MAX_LINKS_PER_PAGE = 100
PAGE_TIMEOUT = 0.8
PAGE_READ_SECONDS = 1.0
ROBOTS_TIMEOUT = 0.55
ROBOTS_READ_SECONDS = 0.45
USER_AGENT_TOKEN = "htechsiteaudit"
BLOCKED_FILE_SUFFIXES = (
    ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".ico", ".css", ".js",
    ".zip", ".gz", ".xml.gz", ".mp4", ".mp3", ".woff", ".woff2", ".ttf", ".eot",
)
PRIORITY_TERMS = {
    "contact": 100, "booking": 95, "appointment": 95, "service": 90,
    "pricing": 85, "price": 85, "product": 80, "shop": 80, "about": 70,
    "team": 65, "faq": 60, "portfolio": 55, "case-study": 50, "case_study": 50,
}

class AuditError(Exception):
    """Safe user-facing audit error."""


def _internal_url(raw_url: str, base_url: str, site_host: str) -> str | None:
    value = (raw_url or "").strip()
    if not value or len(value) > 2048 or value.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
        return None
    try:
        parsed = urlsplit(urljoin(base_url, value))
        host = (parsed.hostname or "").rstrip(".").encode("idna").decode("ascii").lower()
        port = parsed.port
    except (ValueError, UnicodeError):
        return None
    if parsed.scheme.lower() not in ("http", "https") or not host or parsed.username or parsed.password:
        return None
    if not _GROWTH._same_site(host, site_host):
        return None
    expected_port = 443 if parsed.scheme.lower() == "https" else 80
    if port is not None and port != expected_port:
        return None
    if parsed.path.lower().endswith(BLOCKED_FILE_SUFFIXES):
        return None
    path = quote(parsed.path or "/", safe="/%:@!$&'()*+,;=-._~")
    return urlunsplit((parsed.scheme.lower(), parsed.netloc, path, "", ""))


def _route_priority(url: str, text: str = "") -> int:
    signal = (urlsplit(url).path + " " + text).lower()
    return max((weight for term, weight in PRIORITY_TERMS.items() if term in signal), default=10)


def _parse_robots(text: str) -> tuple[list[str], list[str]]:
    sitemap_urls: list[str] = []
    disallowed: list[str] = []
    agents: list[str] = []
    saw_rule = False
    for raw_line in text.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        key, value = (piece.strip() for piece in line.split(":", 1))
        key = key.lower()
        if key == "user-agent":
            if saw_rule:
                agents = []
                saw_rule = False
            agents.append(value.lower())
        elif key == "sitemap" and value:
            sitemap_urls.append(value)
        elif key == "disallow" and value:
            saw_rule = True
            if "*" in agents or USER_AGENT_TOKEN in agents:
                disallowed.append(value)
    return sitemap_urls, disallowed


def _is_disallowed(url: str, rules: list[str]) -> bool:
    path = urlsplit(url).path or "/"
    for rule in rules:
        if rule == "/":
            return True
        prefix = rule.split("*", 1)[0].rstrip("$")
        if prefix and path.startswith(prefix):
            return True
    return False


def _sitemap_locations(text: str) -> list[str]:
    matches = re.findall(r"<(?:[A-Za-z0-9_-]+:)?loc\b[^>]*>(.*?)</(?:[A-Za-z0-9_-]+:)?loc\s*>", text, flags=re.I | re.S)
    locations = []
    for match in matches:
        value = unescape(re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", match, flags=re.S)).strip()
        if value and len(value) <= 2048:
            locations.append(value)
    return locations[:MAX_SITEMAP_URLS]


def _fetch_aux(url: str, host: str, allowed_types: tuple[str, ...], max_bytes: int, timeout: float, read_seconds: float, user_agent: str = "HtechSiteAudit/1.0") -> str:
    result = _GROWTH._fetch_page(
        url,
        host,
        accepted_content_types=allowed_types,
        max_bytes=max_bytes,
        timeout=timeout,
        max_read_seconds=read_seconds,
        user_agent=user_agent,
    )
    return result.get("html", "")


def _read_robots(start_url: str, host: str, deadline: float) -> tuple[list[str], list[str]]:
    parsed = urlsplit(start_url)
    origin = urlunsplit((parsed.scheme, parsed.netloc, "/", "", ""))
    robots_url = urljoin(origin, "/robots.txt")
    robots_text = ""
    if time.monotonic() < deadline - 0.7:
        try:
            robots_text = _fetch_aux(
                robots_url, host, ("text/plain", "text/html"), 90_000, ROBOTS_TIMEOUT, ROBOTS_READ_SECONDS, "HtechSiteAudit/1.0"
            )
        except _GROWTH.ScanError:
            pass
    return _parse_robots(robots_text)


def _discover_sitemap(start_url: str, host: str, deadline: float, declared_sitemaps: list[str]) -> tuple[list[str], bool]:
    parsed = urlsplit(start_url)
    origin = urlunsplit((parsed.scheme, parsed.netloc, "/", "", ""))
    candidates: list[str] = []
    for raw in declared_sitemaps + [urljoin(origin, "/sitemap.xml"), urljoin(origin, "/sitemap_index.xml")]:
        candidate = _internal_url(raw, origin, host)
        if candidate and candidate not in candidates:
            candidates.append(candidate)
    collected: list[str] = []
    found = False
    sitemap_types = ("application/xml", "text/xml", "application/xhtml+xml", "text/html")
    requests = 0
    while candidates and requests < 2 and time.monotonic() < deadline - 0.9:
        sitemap_url = candidates.pop(0)
        requests += 1
        try:
            body = _fetch_aux(sitemap_url, host, sitemap_types, MAX_SITEMAP_BYTES, ROBOTS_TIMEOUT, ROBOTS_READ_SECONDS, "HtechSiteAudit/1.0")
        except _GROWTH.ScanError:
            continue
        locations = _sitemap_locations(body)
        if not locations:
            continue
        found = True
        is_index = "<sitemapindex" in body[:5000].lower()
        if is_index:
            nested_candidates = []
            for location in locations[:4]:
                nested = _internal_url(location, sitemap_url, host)
                if nested and nested not in candidates and nested not in nested_candidates:
                    nested_candidates.append(nested)
            candidates = nested_candidates + candidates
        else:
            for location in locations:
                page_url = _internal_url(location, start_url, host)
                if page_url and page_url not in collected:
                    collected.append(page_url)
                    if len(collected) >= MAX_SITEMAP_URLS:
                        break
            break
    return collected, found


def _issue(severity: str, code: str, title: str, message: str, recommendation: str, page_url: str = "") -> dict:
    return {
        "severity": severity,
        "code": code,
        "title": title,
        "message": message,
        "recommendation": recommendation,
        "url": page_url,
    }


def _build_issues(pages: list[dict], fetch_errors: list[dict], sitemap_urls: list[str], linked_urls: set[str]) -> list[dict]:
    issues: list[dict] = []
    title_map: dict[str, list[dict]] = defaultdict(list)
    description_map: dict[str, list[dict]] = defaultdict(list)
    canonical_map: dict[str, list[dict]] = defaultdict(list)

    for page in pages:
        url = page["url"]
        title = page.get("title", "").strip()
        description = page.get("description", "").strip()
        if not title:
            issues.append(_issue("high", "missing_title", "Missing page title", "No HTML title was found on this page.", "Add a unique, descriptive <title> element that accurately summarizes this page.", url))
        else:
            title_map[title.casefold()].append(page)
            if len(title) < 15 or len(title) > 65:
                issues.append(_issue("medium", "title_length", "Review title length", f"The title is {len(title)} characters; common display guidance is roughly 15–65 characters.", "Write a concise, page-specific title. Search display lengths vary, so treat this as a guide, not a rule.", url))
        if not description:
            issues.append(_issue("medium", "missing_description", "Missing meta description", "No meta description was found.", "Add a concise, accurate description that helps people understand this page.", url))
        else:
            description_map[description.casefold()].append(page)
            if len(description) < 70 or len(description) > 170:
                issues.append(_issue("low", "description_length", "Review description length", f"The description is {len(description)} characters; common display guidance is roughly 70–170 characters.", "Use a useful, page-specific summary. Search engines may choose a different snippet.", url))

        h1_count = len(page.get("h1", []))
        if h1_count == 0:
            issues.append(_issue("high", "missing_h1", "No H1 heading detected", "This page has no H1 heading in its returned HTML.", "Add a clear main heading to the page content. JavaScript-rendered headings are not detected by this HTML-only audit.", url))
        elif h1_count > 1:
            issues.append(_issue("medium", "multiple_h1", "Multiple H1 headings", f"Found {h1_count} H1 headings on this page.", "Review the heading structure and make sure the main page topic is clear.", url))

        if page.get("noindex"):
            issues.append(_issue("high", "noindex", "Noindex directive detected", "A robots noindex directive was found; search engines may be asked not to index this page.", "Confirm that this is intentional. Keep noindex on private or staging pages; remove it only from pages meant to appear in search.", url))
        redirect_count = int(page.get("redirects", 0) or 0)
        if redirect_count:
            requested_url = page.get("requested_url") or url
            issues.append(_issue("low", "redirect_chain", "Internal URL redirects", f"{requested_url} redirected {redirect_count} time(s) before the final page was reached.", "Update internal links to point directly to the final URL where practical, and keep redirect chains short.", requested_url))
        canonical = page.get("canonical", "").strip()
        if not canonical:
            issues.append(_issue("medium", "missing_canonical", "Canonical URL not detected", "No canonical link was found in this page’s HTML.", "Add a canonical URL when appropriate and keep it aligned with the preferred public page address.", url))
        else:
            normalized = _internal_url(canonical, url, urlsplit(url).hostname or "")
            canonical_map[normalized or canonical.strip().casefold()].append(page)
            if normalized and normalized.rstrip("/") != url.rstrip("/"):
                issues.append(_issue("medium", "canonical_mismatch", "Canonical points to another URL", f"The canonical URL is {normalized}.", "Check that the canonical target is intentional, reachable, and the preferred version of this page.", url))
            elif not normalized:
                issues.append(_issue("medium", "canonical_external", "Canonical URL is outside the audited site", f"The canonical URL is {canonical[:240]}.", "Verify that the cross-domain canonical is intentional; use a same-site canonical for a normal page.", url))

        viewport = page.get("viewport", "").lower()
        if "width=device-width" not in viewport:
            issues.append(_issue("medium", "missing_viewport", "Mobile viewport not detected", "No device-width viewport declaration was found in the returned HTML.", "Add a responsive viewport meta tag and test the page on a real phone.", url))
        missing_alt = int(page.get("images_missing_alt", 0) or 0)
        if missing_alt:
            issues.append(_issue("medium", "image_alt", "Images missing alt attributes", f"{missing_alt} image(s) have no alt attribute in the returned HTML.", "Add useful alt text to informative images and empty alt text to decorative images.", url))
        if int(page.get("json_ld", 0) or 0) == 0:
            issues.append(_issue("low", "no_jsonld", "No JSON-LD detected", "No JSON-LD script was detected in the returned HTML.", "Consider adding accurate structured data where it fits the page. Structured data is optional and does not guarantee a rich result.", url))
        if page.get("truncated"):
            issues.append(_issue("low", "page_truncated", "Page HTML was truncated", "The audit stopped reading this page at its safe size limit.", "Review this page manually if important content appears late in a very large HTML document.", url))

    for title, group in title_map.items():
        if title and len(group) > 1:
            for page in group:
                issues.append(_issue("high", "duplicate_title", "Duplicate page title", f"This title appears on {len(group)} audited pages.", "Give each important page a distinct title that reflects its unique content.", page["url"]))
    for description, group in description_map.items():
        if description and len(group) > 1:
            for page in group:
                issues.append(_issue("medium", "duplicate_description", "Duplicate meta description", f"This description appears on {len(group)} audited pages.", "Write page-specific descriptions rather than repeating one site-wide summary.", page["url"]))
    for canonical, group in canonical_map.items():
        if canonical and len(group) > 1:
            for page in group:
                issues.append(_issue("medium", "duplicate_canonical", "Canonical shared by multiple pages", f"This canonical target is used by {len(group)} audited pages.", "Confirm that these pages are intentional duplicates or point each page to its correct preferred URL.", page["url"]))

    for error in fetch_errors:
        status = error.get("status")
        error_kind = error.get("kind")
        if error_kind == "redirect_loop":
            issues.append(_issue("medium", "redirect_loop", "Redirect chain could not be followed", "The URL exceeded the scanner’s safe redirect limit.", "Check the URL for a redirect loop or an unusually long chain and make the final destination directly reachable.", error.get("url", "")))
        elif error_kind == "external_redirect":
            issues.append(_issue("medium", "external_redirect", "Internal URL redirects off-site", "The discovered same-site URL redirected outside the audited domain; the crawler stopped there.", "Confirm the redirect is intentional and update the source link if it should lead to a page on this site.", error.get("url", "")))
        elif status in (404, 410):
            issues.append(_issue("high", "broken_internal_url", "Broken internal page discovered", f"The linked or sitemap URL returned HTTP {status}.", "Fix the link, restore the page, or redirect it to the closest relevant live page.", error.get("url", "")))
        elif status and status >= 500:
            issues.append(_issue("medium", "server_error", "Server error on discovered URL", f"The linked or sitemap URL returned HTTP {status} during this scan.", "Retry the URL and check the server logs if the error persists.", error.get("url", "")))

    sitemap_only = [url for url in sitemap_urls if url.rstrip("/") not in {link.rstrip("/") for link in linked_urls} and url.rstrip("/") not in {page["url"].rstrip("/") for page in pages[:1]}]
    for url in sitemap_only[:30]:
        issues.append(_issue("low", "sitemap_unlinked", "Sitemap page not linked in sampled pages", "This sitemap URL was not found among links on the pages scanned. It may be deeper in the site; this is not proof that it is orphaned.", "Check that important pages have relevant internal links.", url))

    unique: dict[tuple[str, str, str], dict] = {}
    for item in issues:
        unique[(item["code"], item.get("url", ""), item["message"])] = item
    severity_order = {"high": 0, "medium": 1, "low": 2}
    return sorted(unique.values(), key=lambda item: (severity_order.get(item["severity"], 9), item.get("url", ""), item["title"]))


def scan_site(raw_url: str) -> dict:
    target, original_host, implicit_https = _GROWTH._normalise_url(raw_url)
    started = time.monotonic()
    deadline = started + MAX_AUDIT_SECONDS
    declared_sitemaps, robots_disallow = _read_robots(target, original_host, deadline)
    if _is_disallowed(target, robots_disallow):
        raise AuditError("The URL path is disallowed for this scanner by the website’s robots.txt rules. Choose an allowed public page.")
    try:
        home_fetch = _GROWTH._fetch_page(target, original_host, max_bytes=MAX_PAGE_BYTES, timeout=PAGE_TIMEOUT, max_read_seconds=PAGE_READ_SECONDS, user_agent="HtechSiteAudit/1.0")
    except _GROWTH.ScanError as https_error:
        if not implicit_https or not target.startswith("https://") or not https_error.allow_http_fallback:
            raise
        http_target = "http://" + target[len("https://"):]
        try:
            home_fetch = _GROWTH._fetch_page(http_target, original_host, max_bytes=MAX_PAGE_BYTES, timeout=PAGE_TIMEOUT, max_read_seconds=PAGE_READ_SECONDS, user_agent="HtechSiteAudit/1.0")
        except _GROWTH.ScanError:
            raise https_error
    home = _GROWTH._analyse_page(home_fetch)
    home["requested_url"] = target
    pages = [home]
    final_host = urlsplit(home["url"]).hostname or original_host
    sitemap_urls, sitemap_found = _discover_sitemap(home["url"], final_host, deadline, declared_sitemaps)

    queued: dict[str, tuple[int, str]] = {}
    seen = {home["url"].rstrip("/")}
    linked_urls: set[str] = set()
    fetch_errors: list[dict] = []
    scanned_set = {home["url"]}

    def enqueue(raw: str, base: str, source: str, linked: bool, score: int | None = None) -> None:
        normalized = _internal_url(raw, base, final_host)
        if not normalized:
            return
        if linked:
            linked_urls.add(normalized)
        if normalized.rstrip("/") in seen or normalized in scanned_set or _is_disallowed(normalized, robots_disallow):
            return
        priority = score if score is not None else _route_priority(normalized)
        previous = queued.get(normalized)
        if previous is None or priority > previous[0]:
            queued[normalized] = (priority, source)

    def add_page_links(page: dict) -> None:
        for link in page.get("links", [])[:MAX_LINKS_PER_PAGE]:
            href = (link.get("href") or "").strip()
            candidate = _internal_url(href, page["url"], final_host)
            if candidate:
                score = _route_priority(candidate, (link.get("text", "") + " " + link.get("label", "")))
                enqueue(candidate, page["url"], page["url"], True, score)

    add_page_links(home)
    for sitemap_url in sitemap_urls:
        enqueue(sitemap_url, home["url"], "sitemap.xml", False, _route_priority(sitemap_url) + 15)

    discovered_count = len(queued)
    while queued and len(pages) < MAX_AUDIT_PAGES and time.monotonic() < deadline - 0.15:
        candidate = max(queued, key=lambda url: queued[url][0])
        _priority, source = queued.pop(candidate)
        key = candidate.rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        try:
            fetched = _GROWTH._fetch_page(
                candidate,
                final_host,
                max_bytes=MAX_PAGE_BYTES,
                timeout=PAGE_TIMEOUT,
                max_read_seconds=PAGE_READ_SECONDS,
                user_agent="HtechSiteAudit/1.0",
            )
        except _GROWTH.ScanError as exc:
            message = str(exc).lower()
            if "redirected too many times" in message:
                fetch_errors.append({"url": candidate, "status": exc.status_code, "source": source, "kind": "redirect_loop"})
            elif "redirected outside its own domain" in message:
                fetch_errors.append({"url": candidate, "status": exc.status_code, "source": source, "kind": "external_redirect"})
            elif exc.status_code in (404, 410) or (exc.status_code and exc.status_code >= 500):
                fetch_errors.append({"url": candidate, "status": exc.status_code, "source": source})
            continue
        if fetched.get("status", 0) < 200 or fetched.get("status", 0) >= 400:
            continue
        if fetched.get("content_type") not in ("text/html", "application/xhtml+xml"):
            continue
        page = _GROWTH._analyse_page(fetched)
        page["requested_url"] = candidate
        pages.append(page)
        scanned_set.add(page["url"])
        add_page_links(page)
        if len(queued) > MAX_CANDIDATES:
            keep = sorted(queued.items(), key=lambda item: item[1][0], reverse=True)[:MAX_CANDIDATES]
            queued = dict(keep)
        discovered_count = max(discovered_count, len(queued) + len(seen))

    issues = _build_issues(pages, fetch_errors, sitemap_urls, linked_urls)
    if not sitemap_found:
        issues.append(_issue("low", "sitemap_not_found", "XML sitemap not discovered", "No same-site XML sitemap was found at a standard location or in robots.txt during this scan.", "If your site has many important pages, consider publishing and submitting an accurate XML sitemap."))
    counts = {level: sum(1 for item in issues if item["severity"] == level) for level in ("high", "medium", "low")}
    page_rows = []
    for page in pages:
        page_rows.append({
            "url": page["url"],
            "requested_url": page.get("requested_url", page["url"]),
            "status": page.get("status", 0),
            "title": page.get("title", "")[:180],
            "title_length": len(page.get("title", "")),
            "description": page.get("description", "")[:240],
            "h1_count": len(page.get("h1", [])),
            "canonical": page.get("canonical", ""),
            "internal_links_found": sum(1 for link in page.get("links", []) if _internal_url(link.get("href", ""), page["url"], final_host)),
            "images_missing_alt": page.get("images_missing_alt", 0),
            "has_json_ld": bool(page.get("json_ld", 0)),
            "redirects": page.get("redirects", 0),
        })
    elapsed_ms = round((time.monotonic() - started) * 1000)
    scope = (
        f"Inspected {len(pages)} HTML page(s), up to {MAX_AUDIT_PAGES}, within a short serverless time budget. "
        "The crawler stays on the entered site, reads public HTML only, honors basic robots.txt Disallow rules, "
        "and does not execute JavaScript, submit forms, access private pages, test Core Web Vitals, or perform security testing. "
        "Results are a sample, not a guarantee of search rankings or a complete audit."
    )
    return {
        "domain": final_host,
        "start_url": home["url"],
        "pages": page_rows,
        "issues": issues,
        "summary": {
            "pages_scanned": len(page_rows),
            "pages_limit": MAX_AUDIT_PAGES,
            "urls_discovered": discovered_count,
            "high": counts["high"],
            "medium": counts["medium"],
            "low": counts["low"],
            "sitemap_found": sitemap_found,
            "robots_disallow_rules": len(robots_disallow),
            "elapsed_ms": elapsed_ms,
            "limited_by_time": bool(queued) and time.monotonic() >= deadline - 0.2,
            "limited_by_pages": bool(queued) and len(pages) >= MAX_AUDIT_PAGES,
        },
        "scope": scope,
    }


_RATE_BUCKETS: dict[str, list[float]] = {}


def _rate_limited(client_key: str) -> bool:
    now = time.time()
    recent = [stamp for stamp in _RATE_BUCKETS.get(client_key, []) if now - stamp < 600]
    if len(recent) >= 3:
        _RATE_BUCKETS[client_key] = recent
        return True
    recent.append(now)
    _RATE_BUCKETS[client_key] = recent
    return False


class handler(BaseHTTPRequestHandler):
    def _respond(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        self._respond(405, {"error": "Use POST to run a site audit."})

    def do_POST(self) -> None:
        origin = self.headers.get("Origin")
        if origin:
            try:
                origin_host = (urlsplit(origin).hostname or "").lower()
                request_host = self.headers.get("Host", "").split(":", 1)[0].lower()
            except ValueError:
                origin_host = ""
                request_host = ""
            if not origin_host or not request_host or origin_host != request_host:
                self._respond(403, {"error": "This auditor only accepts requests from the website where it is hosted."})
                return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0 or content_length > MAX_BODY_BYTES:
            self._respond(413, {"error": "The audit request is too large or empty."})
            return
        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._respond(400, {"error": "We could not read that audit request. Please try again."})
            return
        if not isinstance(payload, dict) or not isinstance(payload.get("url"), str):
            self._respond(400, {"error": "Enter the public website address you want us to audit."})
            return
        client_key = (self.headers.get("x-forwarded-for", "anonymous").split(",", 1)[0].strip() or "anonymous")[:80]
        if _rate_limited(client_key):
            self._respond(429, {"error": "This connection has run several audits recently. Please wait a few minutes and try again."})
            return
        try:
            self._respond(200, scan_site(payload["url"]))
        except _GROWTH.ScanError as exc:
            self._respond(422, {"error": str(exc)})
        except AuditError as exc:
            self._respond(422, {"error": str(exc)})
        except Exception:
            self._respond(500, {"error": "The audit could not finish right now. Please try again or request a manual review."})

    def log_message(self, _format: str, *_args) -> None:
        return
