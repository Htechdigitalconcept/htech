"""Python analysis API for migration URL and redirect quality checks."""
from __future__ import annotations

import csv
import io
import ipaddress
import json
import re
import time
from collections import defaultdict
from http.server import BaseHTTPRequestHandler
from urllib.parse import quote, urlsplit, urlunsplit

MAX_BODY_BYTES = 750_000
MAX_URLS_PER_LIST = 5_000
MAX_REDIRECTS = 5_000
MAX_URL_LENGTH = 2_048


class MigrationError(ValueError):
    """Safe user-facing migration validation error."""


def _canonical_url(raw: object, label: str) -> str:
    value = str(raw or "").strip()
    if not value or len(value) > MAX_URL_LENGTH or any(ord(char) < 32 for char in value):
        raise MigrationError(f"{label} must be a complete public URL under {MAX_URL_LENGTH} characters.")
    try:
        parsed = urlsplit(value)
        hostname = (parsed.hostname or "").rstrip(".").encode("idna").decode("ascii").lower()
        port = parsed.port
    except (ValueError, UnicodeError):
        raise MigrationError(f"{label} must be a valid http:// or https:// URL.") from None
    if parsed.scheme.lower() not in ("http", "https") or not hostname or parsed.username or parsed.password:
        raise MigrationError(f"{label} must be an absolute http:// or https:// URL without credentials.")
    if hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal")) or "." not in hostname:
        raise MigrationError(f"{label} must use a public website domain, not a local address.")
    if len(hostname) > 253 or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", part) for part in hostname.split(".")):
        raise MigrationError(f"{label} must use a valid public website domain.")
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise MigrationError(f"{label} cannot use a private or reserved IP address.")
    scheme = parsed.scheme.lower()
    default_port = 443 if scheme == "https" else 80
    if port is not None and port != default_port:
        raise MigrationError(f"{label} must use the standard http(s) port.")
    netloc = hostname if port is None or port == default_port else f"{hostname}:{port}"
    path = quote(parsed.path or "/", safe="/%:@!$&'()*+,;=-._~")
    query = quote(parsed.query, safe="=&;/:?@!$'()*+,%-._~")
    # Fragments are browser-only and never reach a web server; preserve query strings.
    return urlunsplit((scheme, netloc, path, query, ""))


def _path_key(url: str) -> tuple[str, str]:
    parsed = urlsplit(url)
    path = parsed.path or "/"
    if path != "/":
        path = path.rstrip("/") or "/"
    return path, parsed.query


def _display_path(url: str) -> str:
    parsed = urlsplit(url)
    return (parsed.path or "/") + ("?" + parsed.query if parsed.query else "")


def _parse_url_list(items: object, label: str) -> tuple[list[str], list[dict]]:
    if not isinstance(items, list):
        raise MigrationError(f"{label} must be supplied as a list of URLs.")
    if len(items) > MAX_URLS_PER_LIST:
        raise MigrationError(f"{label} is limited to {MAX_URLS_PER_LIST:,} URLs per scan.")
    valid: list[str] = []
    issues: list[dict] = []
    seen: set[str] = set()
    for index, raw in enumerate(items, start=1):
        if not str(raw or "").strip():
            continue
        try:
            url = _canonical_url(raw, f"{label} row {index}")
        except MigrationError as exc:
            issues.append({"severity": "high", "code": "invalid_url", "title": "Invalid URL", "message": str(exc), "source": str(raw)[:MAX_URL_LENGTH], "destination": "", "recommendation": "Correct this row to an absolute public http:// or https:// URL, then run the comparison again."})
            continue
        if url in seen:
            issues.append({"severity": "medium", "code": "duplicate_url", "title": f"Duplicate {label.lower()} URL", "message": f"This URL appears more than once: {url}", "source": url, "destination": "", "recommendation": "Remove duplicate rows so the migration inventory has one entry per URL."})
            continue
        seen.add(url)
        valid.append(url)
    return valid, issues


def _issue(severity: str, code: str, title: str, message: str, source: str = "", destination: str = "", recommendation: str = "") -> dict:
    return {"severity": severity, "code": code, "title": title, "message": message, "source": source, "destination": destination, "recommendation": recommendation}


def _parse_redirects(rows: object, old_set: set[str], new_set: set[str], issues: list[dict]) -> dict[str, str]:
    if rows is None:
        return {}
    if not isinstance(rows, list):
        raise MigrationError("Redirect mappings must be a list of source/destination pairs.")
    if len(rows) > MAX_REDIRECTS:
        raise MigrationError(f"Redirect mappings are limited to {MAX_REDIRECTS:,} rows.")
    redirects: dict[str, str] = {}
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            issues.append(_issue("high", "invalid_redirect_row", "Invalid redirect mapping", f"Redirect mapping row {index} must contain source and destination values."))
            continue
        raw_source = row.get("source", row.get("from", ""))
        raw_destination = row.get("destination", row.get("to", ""))
        if not str(raw_source or "").strip() and not str(raw_destination or "").strip():
            continue
        try:
            source = _canonical_url(raw_source, f"Redirect row {index} source")
            destination = _canonical_url(raw_destination, f"Redirect row {index} destination")
        except MigrationError as exc:
            issues.append(_issue("high", "invalid_redirect_url", "Invalid redirect URL", str(exc), str(raw_source)[:MAX_URL_LENGTH], str(raw_destination)[:MAX_URL_LENGTH], "Correct both mapping URLs to absolute public http:// or https:// addresses."))
            continue
        if source in redirects:
            issues.append(_issue("high", "duplicate_redirect_source", "Conflicting redirect source", f"More than one mapping uses this source: {source}", source, destination, "Keep one destination per source URL before deploying redirect rules."))
            continue
        redirects[source] = destination
        if source not in old_set and source not in new_set:
            issues.append(_issue("low", "source_not_in_inventory", "Redirect source not in supplied URL lists", "This redirect source was not present in either supplied URL inventory.", source, destination, "Confirm the source is intentional or add it to an appropriate URL list."))
    return redirects


def _csv_export(rules: list[dict]) -> str:
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(["source", "destination", "status"])
    for rule in rules:
        writer.writerow([rule["source"], rule["destination"], rule["status"]])
    return stream.getvalue()


def _findings_csv(issues: list[dict]) -> str:
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(["Priority", "Issue", "Source URL", "Destination URL", "Details", "Recommendation"])
    for issue in issues:
        values = [issue["severity"], issue["title"], issue["source"], issue["destination"], issue["message"], issue["recommendation"]]
        writer.writerow(["'" + value if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")) else value for value in values])
    return stream.getvalue()


def _exports(rules: list[dict], issues: list[dict]) -> dict:
    vercel = []
    apache_lines = ["# Htech Migration & Redirect QA Lab export", "RewriteEngine On"]
    nginx_groups: dict[str, list[dict]] = defaultdict(list)
    platform_rules = [rule for rule in rules if rule["status"] == "ready"]
    source_paths = {(urlsplit(rule["source"]).hostname or "", urlsplit(rule["source"]).path or "/") for rule in platform_rules}
    for rule in platform_rules:
        source_parts = urlsplit(rule["source"])
        # Vercel redirect sources are path patterns. Host changes need to be routed to this project first.
        vercel.append({"source": source_parts.path or "/", "destination": rule["destination"], "permanent": True})
        host_pattern = re.escape(source_parts.hostname or "")
        if source_parts.port:
            host_pattern += ":" + str(source_parts.port)
        source_path = source_parts.path or "/"
        path_pattern = re.escape(source_path.lstrip("/") or "")
        slash_variant_exists = (source_parts.hostname or "", source_path.rstrip("/")) in source_paths
        if source_path.endswith("/") and source_path != "/" and path_pattern and not slash_variant_exists:
            path_pattern = path_pattern.rstrip("/") + "/?"
        elif not path_pattern:
            path_pattern = ""
        apache_lines.extend([
            f"RewriteCond %{{HTTP_HOST}} ^{host_pattern}$ [NC]",
            f"RewriteRule ^{path_pattern}$ {rule['destination']} [R=301,L,NE]",
        ])
        nginx_groups[source_parts.hostname or ""].append({"path": source_path, "destination": rule["destination"]})
        no_slash_path = source_path.rstrip("/")
        if source_path not in ("", "/") and source_path.endswith("/") and (source_parts.hostname or "", no_slash_path) not in source_paths:
            nginx_groups[source_parts.hostname or ""].append({"path": no_slash_path, "destination": rule["destination"]})
    nginx_lines = ["# Htech Migration & Redirect QA Lab export"]
    for host, entries in sorted(nginx_groups.items()):
        nginx_lines.extend(["", "server {", f"    server_name {host};"])
        for item in entries:
            escaped_dest = item["destination"].replace("\\", "\\\\").replace('"', '\\"')
            escaped_path = item["path"].replace('"', '\\"')
            nginx_lines.extend([f'    location = "{escaped_path}" {{', f'        return 301 "{escaped_dest}";', "    }"])
        nginx_lines.append("}")
    return {
        "vercel": json.dumps({"redirects": vercel}, ensure_ascii=False, indent=2) + "\n",
        "apache": "\n".join(apache_lines) + "\n",
        "nginx": "\n".join(nginx_lines) + "\n",
        "csv": _csv_export(rules),
        "findings_csv": _findings_csv(issues),
    }


def analyse_migration(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise MigrationError("Provide the old URL list and new URL list to compare.")
    old_urls, issues = _parse_url_list(payload.get("old_urls"), "Old")
    new_urls, new_issues = _parse_url_list(payload.get("new_urls"), "New")
    issues.extend(new_issues)
    if not old_urls:
        raise MigrationError("Add at least one valid URL to the old URL list.")
    if not new_urls:
        raise MigrationError("Add at least one valid URL to the new URL list.")

    old_set, new_set = set(old_urls), set(new_urls)
    new_by_path: dict[tuple[str, str], list[str]] = defaultdict(list)
    for url in new_urls:
        new_by_path[_path_key(url)].append(url)

    redirects = _parse_redirects(payload.get("redirects", []), old_set, new_set, issues)
    resolved_map: dict[str, str] = {}
    matched = 0
    unchanged = 0
    missing = 0
    ambiguous = 0

    for old_url in old_urls:
        if old_url in new_set:
            unchanged += 1
            continue
        explicit_target = redirects.get(old_url)
        if explicit_target:
            resolved_map[old_url] = explicit_target
            matched += 1
            continue
        candidates = new_by_path.get(_path_key(old_url), [])
        if len(candidates) == 1:
            resolved_map[old_url] = candidates[0]
            matched += 1
            issues.append(_issue("low", "suggested_same_path", "Same-path redirect suggested", "No explicit mapping was supplied; this unique matching path on the new site is suggested as the destination.", old_url, candidates[0], "Confirm that the new page has equivalent content before publishing a permanent redirect."))
        elif len(candidates) > 1:
            ambiguous += 1
            issues.append(_issue("medium", "ambiguous_path", "More than one matching destination", "The URL path exists more than once across the new-site domains, so an automatic choice would be unsafe.", old_url, "", "Add an explicit source,destination mapping for this URL."))
        else:
            missing += 1
            issues.append(_issue("high", "missing_destination", "No destination found", "No explicit redirect or unique same-path URL was found in the new-site inventory.", old_url, "", "Add a relevant destination to the redirect mappings, or intentionally retire this URL with an appropriate response."))

    # Explicit redirect definitions override path suggestions and may include intermediate hops.
    combined = dict(resolved_map)
    combined.update(redirects)
    rules_by_source: dict[str, dict] = {}
    loop_sources: set[str] = set()
    chain_sources: set[str] = set()
    broken_sources: set[str] = set()
    for source in combined:
        current = source
        visited: list[str] = []
        while current in combined:
            if current in visited:
                loop_start = visited.index(current)
                loop_sources.update(visited[loop_start:])
                break
            visited.append(current)
            current = combined[current]
        if source in loop_sources or current in loop_sources:
            loop_sources.add(source)
            issues.append(_issue("high", "redirect_loop", "Redirect loop detected", "Following this mapping returns to a URL already visited: " + " → ".join(visited + [current]), source, combined[source], "Break the loop and make every redirect terminate at a final URL in the new-site list."))
            continue
        if len(visited) > 1:
            chain_sources.add(source)
            issues.append(_issue("medium", "redirect_chain", "Redirect chain detected", "This path traverses " + str(len(visited)) + " redirect(s) before its final destination.", source, current, "Update the source to point directly to the final destination and avoid unnecessary hops."))
        if current not in new_set:
            broken_sources.add(source)
            issues.append(_issue("high", "destination_not_in_new_list", "Redirect target is not in new URL list", "The final redirect destination does not appear in the supplied new-site inventory.", source, current, "Check the destination URL or add the intended final URL to the new-site inventory."))
            continue
        rules_by_source[source] = {"source": source, "destination": current, "status": "unchanged" if source == current else "ready"}

    # Export a canonical, chain-free redirect set. Do not include rules that loop or end outside the new inventory.
    rules = [rule for source, rule in rules_by_source.items() if source not in loop_sources and source not in broken_sources and rule["source"] != rule["destination"]]
    for rule in rules:
        if urlsplit(rule["source"]).query:
            rule["status"] = "manual_query_review"
            issues.append(_issue("medium", "query_source_review", "Query-specific source needs manual review", "The generated platform snippets match URL paths, not a specific source query string; this rule is kept out of platform exports to avoid a broader redirect than intended.", rule["source"], rule["destination"], "Create and test a platform-specific query match manually, or remove the query from the source if the redirect should apply to every request at this path."))
    rules.sort(key=lambda item: (urlsplit(item["source"]).hostname or "", _display_path(item["source"])))
    ready_rule_count = sum(1 for rule in rules if rule["status"] == "ready")
    manual_rule_count = len(rules) - ready_rule_count
    counts = {level: sum(1 for issue in issues if issue["severity"] == level) for level in ("high", "medium", "low")}
    return {
        "summary": {
            "old_urls": len(old_urls), "new_urls": len(new_urls), "unchanged": unchanged,
            "matched": matched, "missing": missing, "ambiguous": ambiguous,
            "redirect_rules": ready_rule_count, "manual_rules": manual_rule_count, "redirect_chains": len(chain_sources), "redirect_loops": len(loop_sources),
            "invalid_rows": sum(1 for issue in issues if issue["code"] in ("invalid_url", "invalid_redirect_url")),
            "high": counts["high"], "medium": counts["medium"], "low": counts["low"],
        },
        "issues": issues,
        "rules": rules,
        "exports": _exports(rules, issues),
        "scope": "Compared the submitted URL lists only; no websites were fetched and no files or reports were stored. Unique path matches are suggestions, not a substitute for checking page intent. Redirect snippets should be reviewed in staging before launch.",
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
        self._respond(405, {"error": "Use POST to compare migration URL lists."})

    def do_POST(self) -> None:
        origin = self.headers.get("Origin")
        if origin:
            try:
                origin_host = (urlsplit(origin).hostname or "").lower()
                request_host = self.headers.get("Host", "").split(":", 1)[0].lower()
            except ValueError:
                origin_host = request_host = ""
            if not origin_host or not request_host or origin_host != request_host:
                self._respond(403, {"error": "This tool only accepts requests from the website where it is hosted."})
                return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0 or content_length > MAX_BODY_BYTES:
            self._respond(413, {"error": "The request is empty or too large. Keep the combined lists under 750 KB."})
            return
        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._respond(400, {"error": "We could not read these migration inputs. Please try again."})
            return
        if not isinstance(payload, dict):
            self._respond(400, {"error": "Provide the old and new URL lists to compare."})
            return
        client_key = (self.headers.get("x-forwarded-for", "anonymous").split(",", 1)[0].strip() or "anonymous")[:80]
        if _rate_limited(client_key):
            self._respond(429, {"error": "This connection has run several comparisons recently. Please wait a few minutes and try again."})
            return
        try:
            self._respond(200, analyse_migration(payload))
        except MigrationError as exc:
            self._respond(422, {"error": str(exc)})
        except Exception:
            self._respond(500, {"error": "The comparison could not finish right now. Please try again."})

    def log_message(self, _format: str, *_args) -> None:
        return
