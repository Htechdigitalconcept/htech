"""Bounded, in-memory WooCommerce CSV catalog quality analysis."""
from __future__ import annotations

import csv
import io
import ipaddress
import json
import re
import time
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlsplit

MAX_CSV_BYTES = 3_000_000
MAX_ROWS = 5_000
MAX_COLUMNS = 100
MAX_FINDINGS = 2_500
MAX_CELL_CHARS = 256_000

ALIASES = {
    "name": {"name", "productname", "title"},
    "sku": {"sku", "productsku", "stockkeepingunit"},
    "type": {"type", "producttype"},
    "regular_price": {"regularprice", "price"},
    "sale_price": {"saleprice"},
    "categories": {"categories", "category", "productcategories"},
    "images": {"images", "image", "imageurls", "productimages"},
    "description": {"description", "longdescription", "productdescription"},
    "short_description": {"shortdescription", "excerpt"},
    "published": {"published", "status", "poststatus"},
    "stock_status": {"stockstatus", "instock"},
    "stock_quantity": {"stock", "stockquantity", "quantity"},
}


def _header_key(value: object) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lstrip("\ufeff").lower())


def _add_issue(issues: list[dict], row: int, severity: str, code: str, title: str, message: str, recommendation: str, sku: str = "", name: str = "") -> None:
    issues.append({
        "row": row,
        "severity": severity,
        "code": code,
        "title": title,
        "sku": sku[:120],
        "product_name": name[:160],
        "message": message[:350],
        "recommendation": recommendation[:350],
    })


def _parse_price(value: str) -> Decimal | None:
    raw = str(value or "").strip()
    if not raw or not re.fullmatch(r"(?:\d+(?:\.\d*)?|\.\d+)", raw):
        return None
    try:
        number = Decimal(raw)
    except (InvalidOperation, ValueError):
        return None
    if not number.is_finite() or number < 0:
        return None
    return number


def _valid_image_url(value: str) -> bool:
    raw = str(value or "").strip()
    if not raw or len(raw) > 2048 or any(ord(char) < 32 for char in raw):
        return False
    try:
        parsed = urlsplit(raw)
        hostname = (parsed.hostname or "").rstrip(".").encode("idna").decode("ascii").lower()
        _port = parsed.port
    except (ValueError, UnicodeError):
        return False
    if parsed.scheme.lower() not in ("http", "https") or not hostname or parsed.username or parsed.password:
        return False
    if hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal")) or "." not in hostname:
        return False
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        address = None
    return address is None or address.is_global


def analyze_catalog(csv_text: str) -> dict:
    if not isinstance(csv_text, str) or not csv_text.strip():
        raise ValueError("Choose a non-empty WooCommerce CSV export to analyze.")
    if len(csv_text.encode("utf-8")) > MAX_CSV_BYTES:
        raise ValueError("This CSV exceeds the 3 MB file limit.")
    try:
        csv.field_size_limit(MAX_CELL_CHARS)
        reader = csv.DictReader(io.StringIO(csv_text, newline=""), strict=True)
        headers = reader.fieldnames or []
        if not headers or len(headers) > MAX_COLUMNS:
            raise ValueError("The CSV must include a header row with no more than 100 columns.")
        mapped: dict[str, str] = {}
        for header in headers:
            normalized = _header_key(header)
            for field, aliases in ALIASES.items():
                if normalized in aliases and field not in mapped:
                    mapped[field] = header
        if not ("name" in mapped or "sku" in mapped):
            raise ValueError("We could not recognize product name or SKU columns. Use a WooCommerce product export or a CSV with Name and SKU headers.")
        rows: list[dict] = []
        row_numbers: list[int] = []
        blank_rows = 0
        truncated_rows = False
        for csv_row_number, row in enumerate(reader, start=2):
            if not row or not any(str(value or "").strip() for value in row.values() if value is not None):
                blank_rows += 1
                continue
            if len(rows) >= MAX_ROWS:
                truncated_rows = True
                break
            if None in row:
                raise ValueError(f"CSV row {csv_row_number} contains more values than the header. Check the quoting and commas in that row.")
            rows.append({field: str(row.get(header) or "").strip() for field, header in mapped.items()})
            row_numbers.append(csv_row_number)
    except csv.Error as exc:
        raise ValueError("The CSV could not be parsed. Check its quote marks, commas, and header row.") from exc
    if not rows:
        raise ValueError("The CSV has a header but no product rows to analyze.")

    issues: list[dict] = []
    available_fields = sorted(mapped)
    column_requirements = [
        ("name", "Product name"), ("sku", "SKU"), ("regular_price", "Regular price"),
        ("categories", "Categories"), ("images", "Images"), ("description", "Description"),
    ]
    for field, label in column_requirements:
        if field not in mapped:
            severity = "high" if field in ("name", "sku", "regular_price") else "low"
            _add_issue(issues, 1, severity, "missing_column", f"{label} column not found", f"No recognized {label.lower()} column was present in the CSV header.", f"Include a {label.lower()} column in your export to check this field.")

    sku_rows: dict[str, list[tuple[int, str, str]]] = defaultdict(list)
    for index, row in enumerate(rows):
        csv_row_number = row_numbers[index]
        sku = row.get("sku", "").strip()
        name = row.get("name", "").strip()
        product_type = (row.get("type", "simple") or "simple").strip().lower()
        is_published = (row.get("published", "1") or "1").strip().lower() not in {"0", "false", "no", "draft", "-1", "private"}

        if "name" in mapped and not name:
            _add_issue(issues, csv_row_number, "high", "missing_name", "Missing product name", "This product row has no name.", "Add a clear, distinct product name before publishing the listing.", sku, name)
        if "sku" in mapped:
            if not sku:
                _add_issue(issues, csv_row_number, "medium", "missing_sku", "Missing SKU", "This product row has no SKU.", "Add a unique SKU if your store uses SKUs for inventory, fulfilment, or integrations.", sku, name)
            else:
                sku_rows[sku.casefold()].append((csv_row_number, sku, name))
        if "categories" in mapped and not row.get("categories", "").strip():
            _add_issue(issues, csv_row_number, "low", "missing_category", "No category assigned", "This product has no category value in the export.", "Assign a relevant category where it helps shoppers browse the catalog.", sku, name)
        if "description" in mapped and not row.get("description", "").strip():
            _add_issue(issues, csv_row_number, "low", "missing_description", "Missing product description", "The long description is blank in this export.", "Add accurate product details, specifications, and use information where useful.", sku, name)
        if "images" in mapped:
            image_values = [item.strip() for item in row.get("images", "").split(",") if item.strip()]
            if not image_values:
                _add_issue(issues, csv_row_number, "medium", "missing_images", "No product images", "No image URL was found in this product row.", "Add an appropriate product image and confirm it displays well on mobile and desktop.", sku, name)
            else:
                for image_url in image_values:
                    if not _valid_image_url(image_url):
                        _add_issue(issues, csv_row_number, "medium", "invalid_image_url", "Invalid image URL format", f"This image value is not a valid public HTTP(S) URL: {image_url[:180]}", "Use a complete http:// or https:// image URL. This analyzer checks its format only; it does not request the image.", sku, name)

        if "regular_price" in mapped and is_published and product_type not in {"variable", "grouped", "external"}:
            regular_raw = row.get("regular_price", "").strip()
            regular = _parse_price(regular_raw)
            if not regular_raw:
                _add_issue(issues, csv_row_number, "high", "missing_regular_price", "Missing regular price", "This published product has no regular price.", "Add a valid regular price, or confirm the product type and publish state are correct.", sku, name)
            elif regular is None:
                _add_issue(issues, csv_row_number, "high", "invalid_regular_price", "Invalid regular price", f"The regular price is not a non-negative numeric amount: {regular_raw[:100]}", "Use a plain numeric amount with a period as the decimal separator, for example 49.95.", sku, name)
            sale_raw = row.get("sale_price", "").strip()
            if sale_raw:
                sale = _parse_price(sale_raw)
                if sale is None:
                    _add_issue(issues, csv_row_number, "high", "invalid_sale_price", "Invalid sale price", f"The sale price is not a non-negative numeric amount: {sale_raw[:100]}", "Use a plain numeric sale amount or clear the sale-price field.", sku, name)
                elif regular is not None and sale >= regular:
                    _add_issue(issues, csv_row_number, "medium", "sale_not_below_regular", "Sale price is not below regular price", "The sale price must be lower than the regular price to represent a discount.", "Lower the sale price or remove it if this is not intended to be a sale.", sku, name)

    duplicate_sku_groups = 0
    duplicate_sku_products = 0
    for group in sku_rows.values():
        if len(group) > 1:
            duplicate_sku_groups += 1
            duplicate_sku_products += len(group)
            for csv_row_number, sku, name in group:
                _add_issue(issues, csv_row_number, "high", "duplicate_sku", "Duplicate SKU", f"SKU {sku[:120]} is used by {len(group)} product rows.", "Assign a unique SKU to each product or variation, then check connected stock and order systems.", sku, name)

    findings_total = len(issues)
    returned_issues = issues[:MAX_FINDINGS]
    counts = {level: sum(1 for issue in issues if issue["severity"] == level) for level in ("high", "medium", "low")}
    missing_field_codes = {"missing_column", "missing_name", "missing_sku", "missing_category", "missing_description", "missing_images"}
    invalid_price_codes = {"missing_regular_price", "invalid_regular_price", "invalid_sale_price", "sale_not_below_regular"}
    return {
        "summary": {
            "products_scanned": len(rows), "blank_rows_skipped": blank_rows, "rows_truncated": truncated_rows,
            "duplicate_sku_groups": duplicate_sku_groups, "duplicate_sku_products": duplicate_sku_products,
            "missing_field_findings": sum(1 for issue in issues if issue["code"] in missing_field_codes),
            "invalid_price_findings": sum(1 for issue in issues if issue["code"] in invalid_price_codes),
            "invalid_image_urls": sum(1 for issue in issues if issue["code"] == "invalid_image_url"),
            "high": counts["high"], "medium": counts["medium"], "low": counts["low"],
            "findings_total": findings_total, "findings_returned": len(returned_issues), "findings_truncated": findings_total > len(returned_issues),
        },
        "columns_recognized": available_fields,
        "issues": returned_issues,
        "scope": "The uploaded CSV was inspected in memory only. The analyzer does not connect to WooCommerce, visit image URLs, verify inventory or taxes, or save the file or report. Findings are data-quality prompts; review them in your store context before making changes.",
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
        self._respond(405, {"error": "Use POST to analyze a WooCommerce CSV export."})

    def do_POST(self) -> None:
        origin = self.headers.get("Origin")
        if origin:
            try:
                origin_host = (urlsplit(origin).hostname or "").lower()
                request_host = self.headers.get("Host", "").split(":", 1)[0].lower()
            except ValueError:
                origin_host = request_host = ""
            if not origin_host or not request_host or origin_host != request_host:
                self._respond(403, {"error": "This tool only accepts uploads from the website where it is hosted."})
                return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0 or content_length > MAX_CSV_BYTES:
            self._respond(413, {"error": "The CSV is empty or exceeds the 3 MB upload limit."})
            return
        raw = self.rfile.read(content_length)
        if len(raw) != content_length:
            self._respond(400, {"error": "The CSV upload was incomplete. Please try again."})
            return
        try:
            try:
                csv_text = raw.decode("utf-8-sig")
            except UnicodeDecodeError:
                csv_text = raw.decode("cp1252")
        except UnicodeDecodeError:
            self._respond(400, {"error": "Use a UTF-8 or Windows-1252 encoded CSV file."})
            return
        client_key = (self.headers.get("x-forwarded-for", "anonymous").split(",", 1)[0].strip() or "anonymous")[:80]
        if _rate_limited(client_key):
            self._respond(429, {"error": "This connection has run several catalog checks recently. Please wait a few minutes and try again."})
            return
        try:
            self._respond(200, analyze_catalog(csv_text))
        except ValueError as exc:
            self._respond(422, {"error": str(exc)})
        except Exception:
            self._respond(500, {"error": "The catalog analysis could not finish right now. Please try again."})

    def log_message(self, _format: str, *_args) -> None:
        return
