"""Public, bounded website growth scan for the Htech portfolio.

Vercel exposes this handler at POST /api/growth-check. It performs a small,
server-side HTML review only; it does not execute JavaScript or store reports.
"""
from __future__ import annotations

import html
import http.client
import ipaddress
import json
import re
import socket
import ssl
import time
from html.parser import HTMLParser
from urllib.parse import quote, urljoin, urlsplit, urlunsplit
from http.server import BaseHTTPRequestHandler

MAX_BODY_BYTES = 4096
MAX_HTML_BYTES = 850_000
MAX_PAGES = 3
MAX_REDIRECTS = 4
FETCH_TIMEOUT = 2.0
MAX_SCAN_SECONDS = 7.5
USER_AGENT = "Htech Website Growth Check/1.0"
BLOCKED_SUFFIXES = (".localhost", ".local", ".internal", ".test", ".invalid", ".example")
CTA_TERMS = (
    "contact", "get in touch", "book", "schedule", "appointment", "quote", "estimate",
    "call", "buy", "shop", "order", "start a project", "get started", "consult",
    "enquir", "inquir", "request", "apply", "register", "reserve", "subscribe",
)
PRIORITY_LINK_TERMS = {
    "contact": 100, "get in touch": 100, "booking": 95, "appointment": 95,
    "service": 90, "pricing": 85, "price": 85, "product": 80, "shop": 80,
    "about": 70, "team": 65, "faq": 60, "portfolio": 55, "case stud": 50,
}


class ScanError(Exception):
    """A safe, user-facing error from the scan."""
    def __init__(self, message: str, allow_http_fallback: bool = False):
        super().__init__(message)
        self.allow_http_fallback = allow_http_fallback


class PinnedHTTPConnection(http.client.HTTPConnection):
    """HTTP connection pinned to a previously validated public IP address."""
    def __init__(self, host: str, port: int, connect_ip: str, timeout: float):
        super().__init__(host=host, port=port, timeout=timeout)
        self.connect_ip = connect_ip

    def connect(self) -> None:
        self.sock = socket.create_connection((self.connect_ip, self.port), self.timeout)
        if self._tunnel_host:
            self._tunnel()


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    """HTTPS connection pinned to an address while preserving TLS host checks."""
    def __init__(self, host: str, port: int, connect_ip: str, timeout: float):
        super().__init__(host=host, port=port, timeout=timeout, context=ssl.create_default_context())
        self.connect_ip = connect_ip

    def connect(self) -> None:
        raw_socket = socket.create_connection((self.connect_ip, self.port), self.timeout)
        if self._tunnel_host:
            self.sock = raw_socket
            self._tunnel()
            raw_socket = self.sock
        self.sock = self._context.wrap_socket(raw_socket, server_hostname=self.host)


def _normalise_url(raw_url: str) -> tuple[str, str, bool]:
    value = raw_url.strip()
    if not value or len(value) > 2048:
        raise ScanError("Enter a valid public website address, such as example.com.")
    had_scheme = bool(re.match(r"^https?://", value, flags=re.I))
    candidate = value if had_scheme else "https://" + value
    try:
        parsed = urlsplit(candidate)
        hostname = parsed.hostname
        port = parsed.port
    except ValueError as exc:
        raise ScanError("That address does not look valid. Check it and try again.") from exc
    if parsed.scheme.lower() not in ("http", "https") or not hostname:
        raise ScanError("Use a public website address beginning with http:// or https://.")
    if parsed.username or parsed.password:
        raise ScanError("For safety, URLs containing a username or password cannot be scanned.")
    host = hostname.rstrip(".").encode("idna").decode("ascii").lower()
    if host == "localhost" or host.endswith(BLOCKED_SUFFIXES) or "." not in host:
        raise ScanError("Enter a public website domain, not a private or local address.")
    try:
        ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        pass
    else:
        raise ScanError("Enter a public website domain name rather than a raw IP address.")
    expected_port = 443 if parsed.scheme.lower() == "https" else 80
    if port is not None and port != expected_port:
        raise ScanError("For safety, the scanner only checks standard web ports 80 and 443.")
    # Query strings and fragments are intentionally omitted: they are not needed
    # for a public-page review and can contain private tracking or session data.
    path = quote(parsed.path or "/", safe="/%:@!$&'()*+,;=-._~")
    netloc = host
    return urlunsplit((parsed.scheme.lower(), netloc, path, "", "")), host, not had_scheme


def _same_site(host_a: str, host_b: str) -> bool:
    clean_a = host_a.lower().rstrip(".")
    clean_b = host_b.lower().rstrip(".")
    return clean_a == clean_b or clean_a.removeprefix("www.") == clean_b.removeprefix("www.")


def _public_addresses(host: str, port: int) -> list[str]:
    if host == "localhost" or host.endswith(BLOCKED_SUFFIXES):
        raise ScanError("This address is not publicly scannable.")
    try:
        records = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (OSError, socket.gaierror) as exc:
        raise ScanError("We could not find that website. Check the spelling and try again.") from exc
    addresses: list[str] = []
    for record in records:
        address = record[4][0].split("%", 1)[0]
        try:
            ip = ipaddress.ip_address(address)
        except ValueError:
            continue
        if not ip.is_global:
            raise ScanError("That domain resolves to a non-public network address and cannot be scanned.")
        if address not in addresses:
            addresses.append(address)
    # Prefer IPv4 for broad reachability, while still allowing IPv6-only hosts.
    addresses.sort(key=lambda address: ipaddress.ip_address(address).version != 4)
    if not addresses:
        raise ScanError("We could not resolve a public address for that website.")
    return addresses


def _fetch_page(url: str, allowed_host: str) -> dict:
    current = url
    redirects = 0
    for _ in range(MAX_REDIRECTS + 1):
        try:
            parsed = urlsplit(current)
            host = parsed.hostname or ""
            host = host.rstrip(".").encode("idna").decode("ascii").lower()
            scheme = parsed.scheme.lower()
            port = parsed.port or (443 if scheme == "https" else 80)
        except (ValueError, UnicodeError) as exc:
            raise ScanError("The website redirected to an invalid address.") from exc
        if scheme not in ("http", "https") or parsed.username or parsed.password or not _same_site(host, allowed_host):
            raise ScanError("The website redirected outside its own domain. Enter its final public URL directly.")
        if port not in (80, 443) or (scheme == "https" and port != 443) or (scheme == "http" and port != 80):
            raise ScanError("The website uses a non-standard port that this public scan does not access.")
        addresses = _public_addresses(host, port)
        path = quote(parsed.path or "/", safe="/%:@!$&'()*+,;=-._~")
        if parsed.query:
            path += "?" + quote(parsed.query, safe="/?@:!$&'()*+,;=-._~%")
        started = time.monotonic()
        connection = None
        last_error = None
        response = None
        for address in addresses[:2]:
            try:
                cls = PinnedHTTPSConnection if scheme == "https" else PinnedHTTPConnection
                connection = cls(host, port, address, FETCH_TIMEOUT)
                connection.request("GET", path, headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
                    "Accept-Encoding": "identity",
                    "Connection": "close",
                })
                response = connection.getresponse()
                break
            except (OSError, http.client.HTTPException, ssl.SSLError) as exc:
                last_error = exc
                if connection:
                    connection.close()
                connection = None
        if response is None:
            raise ScanError("We could not connect to that site. Check that it is public and try again.", allow_http_fallback=True) from last_error
        try:
            status = response.status
            headers = response.headers
            if status in (301, 302, 303, 307, 308):
                location = headers.get("Location")
                if not location:
                    raise ScanError("The website returned an incomplete redirect.")
                current = urljoin(current, location)
                redirects += 1
                continue
            content_type = headers.get_content_type().lower()
            if status < 200 or status >= 400:
                if status in (401, 403, 429):
                    raise ScanError("The website blocks automated public requests, so it could not be inspected. You can still request a manual review.")
                raise ScanError("The website returned HTTP " + str(status) + " for the page we tried to inspect.")
            if content_type not in ("text/html", "application/xhtml+xml"):
                raise ScanError("That address did not return a public HTML page. Enter the website homepage or a page URL.")
            content_encoding = headers.get("Content-Encoding", "identity").lower()
            if content_encoding not in ("", "identity"):
                raise ScanError("The website returned an encoding this lightweight scanner could not safely read.")
            chunks: list[bytes] = []
            received = 0
            while received <= MAX_HTML_BYTES and time.monotonic() - started < MAX_SCAN_SECONDS:
                chunk = response.read(min(65_536, MAX_HTML_BYTES + 1 - received))
                if not chunk:
                    break
                chunks.append(chunk)
                received += len(chunk)
            body = b"".join(chunks)
            truncated = len(body) > MAX_HTML_BYTES
            body = body[:MAX_HTML_BYTES]
            charset = headers.get_content_charset() or "utf-8"
            try:
                text = body.decode(charset, errors="replace")
            except LookupError:
                text = body.decode("utf-8", errors="replace")
            return {
                "url": current,
                "status": status,
                "html": text,
                "bytes": len(body),
                "truncated": truncated,
                "elapsed_ms": round((time.monotonic() - started) * 1000),
                "redirects": redirects,
                "content_type": content_type,
            }
        finally:
            if connection:
                connection.close()
    raise ScanError("The website redirected too many times. Enter its final public URL directly.")


class SiteHTMLParser(HTMLParser):
    def __init__(self, page_url: str):
        super().__init__(convert_charrefs=True)
        self.page_url = page_url
        self.title_parts: list[str] = []
        self.in_title = False
        self.description = ""
        self.viewport = ""
        self.og_title = ""
        self.og_description = ""
        self.canonical = ""
        self.lang = ""
        self.noindex = False
        self.headings: list[dict] = []
        self.current_heading: dict | None = None
        self.links: list[dict] = []
        self.current_link: dict | None = None
        self.buttons: list[dict] = []
        self.current_button: dict | None = None
        self.image_count = 0
        self.images_missing_alt = 0
        self.forms = 0
        self.controls: list[dict] = []
        self.label_ids: set[str] = set()
        self.label_depth = 0
        self.email_links = 0
        self.phone_links = 0
        self.json_ld = 0
        self.script_count = 0
        self.landmarks: set[str] = set()
        self.text_parts: list[str] = []
        self.ignore_data = False

    def handle_starttag(self, tag: str, attrs_list: list[tuple[str, str | None]]) -> None:
        attrs = {key.lower(): (value or "") for key, value in attrs_list}
        if tag == "html":
            self.lang = attrs.get("lang", "").strip()
        elif tag in ("header", "nav", "main", "footer"):
            self.landmarks.add(tag)
        elif tag == "title":
            self.in_title = True
        elif tag == "meta":
            name = attrs.get("name", "").lower()
            prop = attrs.get("property", "").lower()
            content = attrs.get("content", "").strip()
            if name == "description": self.description = content
            if name == "viewport": self.viewport = content
            if name == "robots" and "noindex" in content.lower(): self.noindex = True
            if prop == "og:title": self.og_title = content
            if prop == "og:description": self.og_description = content
        elif tag == "link" and "canonical" in attrs.get("rel", "").lower().split():
            self.canonical = attrs.get("href", "")
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.current_heading = {"level": int(tag[1]), "parts": []}
        elif tag == "a":
            self.current_link = {"href": attrs.get("href", ""), "parts": [], "label": attrs.get("aria-label", "")}
            href = attrs.get("href", "").lower()
            if href.startswith("mailto:"): self.email_links += 1
            if href.startswith("tel:"): self.phone_links += 1
        elif tag == "button":
            self.current_button = {"parts": [], "label": attrs.get("aria-label", "")}
        elif tag == "img":
            self.image_count += 1
            if "alt" not in attrs: self.images_missing_alt += 1
        elif tag == "form":
            self.forms += 1
        elif tag == "label":
            self.label_depth += 1
            if attrs.get("for"): self.label_ids.add(attrs["for"])
        elif tag in ("input", "select", "textarea"):
            kind = attrs.get("type", "text").lower() if tag == "input" else tag
            if kind not in ("hidden", "submit", "button", "reset", "image"):
                self.controls.append({"id": attrs.get("id", ""), "implicit": self.label_depth > 0})
        elif tag == "script":
            self.script_count += 1
            if attrs.get("type", "").lower() == "application/ld+json": self.json_ld += 1
            self.ignore_data = True
        elif tag == "style":
            self.ignore_data = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "title": self.in_title = False
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6") and self.current_heading:
            self.headings.append({"level": self.current_heading["level"], "text": _clean_text(" ".join(self.current_heading["parts"]))})
            self.current_heading = None
        elif tag == "a" and self.current_link:
            link = self.current_link
            link["text"] = _clean_text(" ".join(link.pop("parts")))
            self.links.append(link)
            self.current_link = None
        elif tag == "button" and self.current_button:
            button = self.current_button
            button["text"] = _clean_text(" ".join(button.pop("parts")))
            self.buttons.append(button)
            self.current_button = None
        elif tag == "label" and self.label_depth:
            self.label_depth -= 1
        elif tag in ("script", "style"):
            self.ignore_data = False

    def handle_data(self, data: str) -> None:
        if self.in_title: self.title_parts.append(data)
        if self.current_heading is not None: self.current_heading["parts"].append(data)
        if self.current_link is not None: self.current_link["parts"].append(data)
        if self.current_button is not None: self.current_button["parts"].append(data)
        if not self.ignore_data and data.strip() and len(self.text_parts) < 12000:
            self.text_parts.append(data.strip())

    def result(self) -> dict:
        title = _clean_text(" ".join(self.title_parts))
        unlabeled = sum(1 for control in self.controls if not control["implicit"] and control["id"] not in self.label_ids)
        return {
            "url": self.page_url,
            "title": title,
            "description": self.description,
            "viewport": self.viewport,
            "og_title": self.og_title,
            "og_description": self.og_description,
            "canonical": self.canonical,
            "lang": self.lang,
            "noindex": self.noindex,
            "headings": self.headings,
            "h1": [heading["text"] for heading in self.headings if heading["level"] == 1],
            "links": self.links,
            "buttons": self.buttons,
            "images": self.image_count,
            "images_missing_alt": self.images_missing_alt,
            "forms": self.forms,
            "controls": len(self.controls),
            "unlabeled_controls": unlabeled,
            "email_links": self.email_links,
            "phone_links": self.phone_links,
            "json_ld": self.json_ld,
            "scripts": self.script_count,
            "landmarks": sorted(self.landmarks),
            "text_length": sum(len(part) for part in self.text_parts),
            "text": " ".join(self.text_parts).lower(),
        }


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def _parse_page(page: dict) -> dict:
    parser = SiteHTMLParser(page["url"])
    try:
        parser.feed(page["html"])
        parser.close()
    except Exception:
        pass
    parsed = parser.result()
    parsed.update({key: page[key] for key in ("status", "bytes", "truncated", "elapsed_ms", "redirects")})
    return parsed


def _priority_pages(home: dict, home_url: str, site_host: str) -> list[str]:
    scored: dict[str, int] = {}
    base = urlsplit(home_url)
    for link in home.get("links", []):
        href = (link.get("href") or "").strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        try:
            absolute = urljoin(home_url, href)
            parsed = urlsplit(absolute)
        except ValueError:
            continue
        if parsed.scheme not in ("http", "https") or not parsed.hostname or not _same_site(parsed.hostname, site_host):
            continue
        if parsed.path.lower().endswith((".pdf", ".jpg", ".jpeg", ".png", ".webp", ".svg", ".css", ".js", ".zip")):
            continue
        path = quote(parsed.path or "/", safe="/%:@!$&'()*+,;=-._~")
        candidate = urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))
        if parsed.path.rstrip("/") == base.path.rstrip("/") and parsed.netloc == base.netloc:
            continue
        signal = (href + " " + link.get("text", "") + " " + link.get("label", "")).lower()
        priority = max((weight for word, weight in PRIORITY_LINK_TERMS.items() if word in signal), default=0)
        if priority:
            scored[candidate] = max(scored.get(candidate, 0), priority)
    return [url for url, _ in sorted(scored.items(), key=lambda pair: (-pair[1], pair[0]))[:MAX_PAGES - 1]]


def _check(key: str, category: str, title: str, status: str, evidence: str, recommendation: str = "") -> dict:
    return {"id": key, "category": category, "title": title, "status": status, "evidence": evidence, "recommendation": recommendation}


def _build_checks(pages: list[dict]) -> list[dict]:
    home = pages[0]
    all_links = [link for page in pages for link in page["links"]]
    all_buttons = [button for page in pages for button in page["buttons"]]
    cta_texts = []
    for item in all_links + all_buttons:
        text = (item.get("text", "") + " " + item.get("label", "")).strip().lower()
        if text and any(term in text for term in CTA_TERMS):
            cta_texts.append(_clean_text(item.get("text", "") or item.get("label", "")))
    cta_texts = list(dict.fromkeys(cta_texts))
    cta_links = [link for link in all_links if any(term in (link.get("text", "") + " " + link.get("label", "")).lower() for term in CTA_TERMS)]
    broken_cta_links = [link for link in cta_links if not link.get("href", "").strip() or link.get("href", "").strip().lower() in ("#", "javascript:void(0)") or link.get("href", "").strip().lower().startswith("javascript:")]
    contact_links = [link for link in all_links if any(term in (link.get("href", "") + " " + link.get("text", "")).lower() for term in ("contact", "book", "booking", "appointment", "get in touch"))]
    emails = sum(page["email_links"] for page in pages)
    phones = sum(page["phone_links"] for page in pages)
    forms = sum(page["forms"] for page in pages)
    inputs = sum(page["controls"] for page in pages)
    unlabeled = sum(page["unlabeled_controls"] for page in pages)
    image_count = sum(page["images"] for page in pages)
    missing_alt = sum(page["images_missing_alt"] for page in pages)
    all_text = " ".join(page["text"] for page in pages)
    checks = []

    secure = urlsplit(home["url"]).scheme == "https"
    checks.append(_check(
        "security", "Trust & security", "Secure connection", "good" if secure else "priority",
        "The scanned page ends on HTTPS." if secure else "The scanned page ends on HTTP, so the connection is not encrypted.",
        "Enable an SSL certificate and redirect every HTTP page to its HTTPS version." if not secure else "Keep HTTPS enforced across every page and form.",
    ))

    title = home["title"]
    description = home["description"]
    metadata_missing = []
    if not title: metadata_missing.append("page title")
    if not description: metadata_missing.append("meta description")
    metadata_weak = []
    if title and not 15 <= len(title) <= 65: metadata_weak.append("title length")
    if description and not 70 <= len(description) <= 170: metadata_weak.append("description length")
    if metadata_missing:
        meta_status = "priority"
        meta_evidence = "Missing " + " and ".join(metadata_missing) + " on the homepage."
    elif metadata_weak:
        meta_status = "attention"
        meta_evidence = "Title: " + str(len(title)) + " characters; description: " + str(len(description)) + " characters. Review " + " and ".join(metadata_weak) + "."
    else:
        meta_status = "good"
        meta_evidence = "Homepage title and meta description are present and within common display-length ranges."
    meta_action = "Write a distinct, customer-focused page title and meta description." if meta_status != "good" else "Keep titles and descriptions specific to each important page."
    checks.append(_check("metadata", "Search & discovery", "Search appearance", meta_status, meta_evidence, meta_action))

    index_signals = []
    missing_index_signals = []
    if home["lang"]: index_signals.append("language")
    else: missing_index_signals.append("language")
    if home["canonical"]: index_signals.append("canonical URL")
    else: missing_index_signals.append("canonical URL")
    if home["og_title"] and home["og_description"]: index_signals.append("social-sharing metadata")
    else: missing_index_signals.append("social-sharing metadata")
    if home["noindex"]:
        index_status = "priority"
        index_evidence = "A noindex directive was found; the site may be intentionally hidden from search."
        index_action = "If this is the public production site, remove the noindex directive; keep it only for staging or private pages."
    elif missing_index_signals:
        index_status = "attention"
        index_evidence = "Detected " + (", ".join(index_signals) if index_signals else "none of the standard language, canonical or social-sharing signals") + "; missing " + ", ".join(missing_index_signals) + "."
        index_action = "Set the page language, a self-referencing canonical URL and Open Graph title/description for dependable indexing and link previews."
    else:
        index_status = "good"
        index_evidence = "Language, canonical URL and social-sharing metadata are present; no noindex directive was detected."
        index_action = "Keep canonical and sharing metadata aligned with the final public URL."
    checks.append(_check("indexing", "Search & discovery", "Indexing & link previews", index_status, index_evidence, index_action))

    viewport_ok = "width=device-width" in home.get("viewport", "").lower()
    checks.append(_check(
        "mobile", "Mobile experience", "Mobile viewport setup", "good" if viewport_ok else "priority",
        "A device-width viewport declaration is present." if viewport_ok else "No device-width viewport declaration was found in the homepage HTML.",
        "Add a responsive viewport declaration and test the main pages on real phone sizes." if not viewport_ok else "Check tap targets, text sizing, sticky elements and forms on a real phone.",
    ))

    h1_count = len(home["h1"])
    levels = [heading["level"] for heading in home["headings"]]
    skipped = any(level > previous + 1 for previous, level in zip(levels, levels[1:]))
    if h1_count == 1 and not skipped:
        structure_status = "good"
        structure_evidence = "One primary heading was found; no skipped heading levels were detected in the sampled markup."
    elif h1_count == 0:
        structure_status = "priority"
        structure_evidence = "No H1 heading was found on the homepage."
    else:
        structure_status = "attention"
        structure_evidence = str(h1_count) + " H1 headings found" + ("; heading levels appear to skip." if skipped else ".")
    checks.append(_check("structure", "Clarity & structure", "Page hierarchy", structure_status, structure_evidence,
                         "Give each page one clear H1 and organize supporting sections in a logical H2/H3 order." if structure_status != "good" else "Keep one descriptive H1 per page and use headings to make long sections easy to scan."))

    cta_home = any(any(term in (item.get("text", "") + " " + item.get("label", "")).lower() for term in CTA_TERMS) for item in home["links"] + home["buttons"])
    broken_cta_count = len(broken_cta_links)
    if broken_cta_count:
        cta_status = "priority"
        cta_evidence = str(broken_cta_count) + " action-oriented link(s) have no usable destination (empty, fragment-only or JavaScript href)."
        cta_action = "Give each action link a real destination or use a button with a working interaction; verify the full journey on mobile."
    elif cta_texts and cta_home:
        cta_status = "good" if len(cta_texts) >= 2 else "attention"
        cta_evidence = str(len(cta_texts)) + " distinct action labels were detected across the scanned pages; a homepage action was found."
        cta_action = "Keep the main action specific and consistent; check that each button leads to the expected destination."
    else:
        cta_status = "priority"
        cta_evidence = "No clear action-oriented link or button text was detected on the homepage."
        cta_action = "Add one prominent, specific next step on the homepage and repeat it where visitors are ready to act."
    checks.append(_check("actions", "Conversion", "Calls to action", cta_status, cta_evidence, cta_action))

    contact_evidence_parts = []
    if contact_links: contact_evidence_parts.append("a contact/booking route");
    if forms: contact_evidence_parts.append(str(forms) + " form" + ("s" if forms != 1 else ""))
    if emails or phones: contact_evidence_parts.append("direct email/phone links")
    contact_ok = bool(contact_evidence_parts)
    contact_status = "good" if contact_ok else "priority"
    contact_evidence = "Detected " + ", ".join(contact_evidence_parts) + " in the scanned pages." if contact_ok else "No obvious contact route, enquiry form, email link or phone link was detected in the scanned pages."
    checks.append(_check("contact", "Conversion", "Contact & enquiry path", contact_status, contact_evidence,
                         "Make it easy to reach you: add a clear contact page or booking route and a short, tested enquiry form." if not contact_ok else "Test every enquiry route on a phone and explain what happens after someone submits it."))

    if image_count == 0:
        image_status = "attention"
        image_evidence = "No inline images were found in the sampled HTML; background images are not assessed."
    else:
        ratio = missing_alt / image_count
        image_status = "good" if ratio == 0 else "attention" if ratio <= 0.2 else "priority"
        image_evidence = str(image_count - missing_alt) + " of " + str(image_count) + " sampled images include an alt attribute; empty alt text is treated as intentional decoration."
    checks.append(_check("images", "Accessibility", "Image descriptions", image_status, image_evidence,
                         "Add concise, useful alt text to informative images and use empty alt text only for decorative images." if image_status != "good" else "Keep alt text meaningful and avoid repeating surrounding copy."))

    proof_terms = ("testimonial", "review", "case stud", "client result", "portfolio", "certified", "award", "trusted by", "years of experience")
    detected_proof = [term for term in proof_terms if term in all_text]
    proof_status = "good" if len(detected_proof) >= 2 else "attention"
    proof_evidence = "Visible credibility language was detected (" + ", ".join(detected_proof[:4]) + ")." if detected_proof else "The sampled text did not clearly expose reviews, client outcomes, credentials or other trust proof. Image-only proof may not be detectable."
    checks.append(_check("proof", "Trust & credibility", "Visible proof", proof_status, proof_evidence,
                         "Place specific client feedback, outcomes, credentials or relevant work close to important service and enquiry decisions." if proof_status != "good" else "Keep proof specific, current and close to the decision it supports."))

    if forms and unlabeled:
        form_status = "priority" if unlabeled / max(inputs, 1) > 0.35 else "attention"
        form_evidence = str(forms) + " form(s) and " + str(unlabeled) + " potentially unlabeled form field(s) were found. This is a source-markup check, not a full accessibility audit."
    elif forms:
        form_status = "good"
        form_evidence = str(forms) + " form(s) and no unlabeled text-entry controls were detected in the sampled markup."
    elif contact_ok:
        form_status = "attention"
        form_evidence = "A contact route exists, but no HTML form was found in the scanned pages. This may be intentional."
    else:
        form_status = "priority"
        form_evidence = "No form or direct contact route was detected in the sampled pages."
    checks.append(_check("forms", "Accessibility & leads", "Forms and input labels", form_status, form_evidence,
                         "Give every input a programmatic label, keep forms short and show a clear confirmation after submission." if form_status != "good" else "Test keyboard use, error messages and confirmation states on each form."))

    response_ms = home["elapsed_ms"]
    html_kb = round(home["bytes"] / 1024)
    response_status = "good" if response_ms < 1200 and html_kb < 350 else "attention" if response_ms < 2600 and html_kb < 700 else "priority"
    response_evidence = "Our scanner received " + str(html_kb) + " KB of homepage HTML in " + str(response_ms) + " ms. This is a server-to-server response sample, not a visitor speed test or Core Web Vitals measurement."
    if home["truncated"]:
        response_status = "attention"
        response_evidence += " The response exceeded the scanner's safe inspection limit."
    checks.append(_check("delivery", "Delivery", "Initial page response", response_status, response_evidence,
                         "Review large page payloads and assets, then validate real-user speed and Core Web Vitals with a dedicated performance tool." if response_status != "good" else "Confirm real-user speed with field data; this lightweight scan cannot measure image loading or Core Web Vitals."))

    return checks


def _analyse_page(fetch_result: dict) -> dict:
    return _parse_page(fetch_result)


def scan_website(raw_url: str) -> dict:
    target, original_host, implicit_https = _normalise_url(raw_url)
    started = time.monotonic()
    try:
        home_fetch = _fetch_page(target, original_host)
    except ScanError as https_error:
        if not implicit_https or not target.startswith("https://") or not https_error.allow_http_fallback:
            raise
        http_target = "http://" + target[len("https://"):]
        try:
            home_fetch = _fetch_page(http_target, original_host)
        except ScanError:
            raise https_error
    home = _analyse_page(home_fetch)
    pages = [home]
    final_host = urlsplit(home["url"]).hostname or original_host
    for candidate in _priority_pages(home, home["url"], final_host):
        if len(pages) >= MAX_PAGES or time.monotonic() - started > MAX_SCAN_SECONDS:
            break
        try:
            fetched = _fetch_page(candidate, final_host)
            if fetched["status"] >= 200 and fetched["status"] < 400:
                pages.append(_analyse_page(fetched))
        except ScanError:
            continue
    checks = _build_checks(pages)
    weights = {"good": 1.0, "attention": 0.62, "priority": 0.2}
    score = round(sum(weights.get(check["status"], 0.2) for check in checks) / max(len(checks), 1) * 100)
    rating = "Strong foundations" if score >= 82 else "Room to improve" if score >= 60 else "Several important opportunities"
    good_count = sum(1 for check in checks if check["status"] == "good")
    priority_count = sum(1 for check in checks if check["status"] == "priority")
    opportunities = sorted(checks, key=lambda check: ({"priority": 0, "attention": 1, "good": 2}[check["status"]], check["category"]))
    page_summaries = []
    for page in pages:
        page_summaries.append({
            "url": page["url"],
            "title": page["title"][:150],
            "heading": (page["h1"][0] if page["h1"] else "")[:150],
            "status": page["status"],
        })
    return {
        "domain": final_host,
        "final_url": home["url"],
        "score": score,
        "rating": rating,
        "scanned_pages": page_summaries,
        "checks": checks,
        "summary": {"good": good_count, "attention": len(checks) - good_count - priority_count, "priority": priority_count},
        "scope": "Live HTML review of the homepage and up to two high-priority same-domain links. JavaScript-rendered content, private pages, third-party scripts, images, visitor speed and Core Web Vitals are not fully tested.",
    }


_RATE_BUCKETS: dict[str, list[float]] = {}


def _rate_limited(client_key: str) -> bool:
    now = time.time()
    recent = [stamp for stamp in _RATE_BUCKETS.get(client_key, []) if now - stamp < 600]
    if len(recent) >= 8:
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
        self._respond(405, {"error": "Use POST to run a website scan."})

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
                self._respond(403, {"error": "This scanner only accepts requests from the website where it is hosted."})
                return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0 or content_length > MAX_BODY_BYTES:
            self._respond(413, {"error": "The scan request is too large or empty."})
            return
        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._respond(400, {"error": "We could not read that scan request. Please try again."})
            return
        if not isinstance(payload, dict) or not isinstance(payload.get("url"), str):
            self._respond(400, {"error": "Add the public website address you want us to review."})
            return
        client_key = (self.headers.get("x-forwarded-for", "anonymous").split(",", 1)[0].strip() or "anonymous")[:80]
        if _rate_limited(client_key):
            self._respond(429, {"error": "This connection has run several scans recently. Please wait a few minutes and try again."})
            return
        try:
            result = scan_website(payload["url"])
            self._respond(200, result)
        except ScanError as exc:
            self._respond(422, {"error": str(exc)})
        except Exception:
            # Do not expose internal network, DNS, or server details to callers.
            self._respond(500, {"error": "The scan could not be completed just now. Please try again or request a manual review."})

    def log_message(self, _format: str, *_args) -> None:
        # Avoid logging submitted URLs or client data from this lightweight tool.
        return


def _main_for_tests() -> None:
    """No local server is started automatically by the deployed function."""
    raise SystemExit("This module is intended to run as a Vercel serverless function.")
