"""Send chat-open and first-message alerts to the site owner's Telegram bot.

Vercel exposes this handler at POST /api/chat-notify. Telegram credentials are
read only from server-side environment variables; visitor text is not stored.
"""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

MAX_BODY_BYTES = 4096
MAX_MESSAGE_CHARS = 600
MAX_PAGE_CHARS = 180
RATE_WINDOW_SECONDS = 600
RATE_MAX_EVENTS = 40
_RATE_BUCKETS: dict[str, list[float]] = {}
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _clean_text(value: str, limit: int) -> str:
    return _CONTROL_CHARS.sub("", value).strip()[:limit]


def _format_notification(event: str, page: str, message: str = "") -> str:
    page = _clean_text(page, MAX_PAGE_CHARS) or "/"
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    if event == "open":
        return "Htech website chat opened\nPage: " + page + "\nTime: " + timestamp
    if event == "first_message":
        message = _clean_text(message, MAX_MESSAGE_CHARS)
        if not message:
            raise ValueError("A first message is required for this event.")
        return "New first message in Htech website chat\nPage: " + page + "\nMessage: " + message + "\nTime: " + timestamp
    raise ValueError("Unsupported chat notification event.")


def _rate_limited(client_key: str) -> bool:
    now = time.time()
    recent = [stamp for stamp in _RATE_BUCKETS.get(client_key, []) if now - stamp < RATE_WINDOW_SECONDS]
    if len(recent) >= RATE_MAX_EVENTS:
        _RATE_BUCKETS[client_key] = recent
        return True
    recent.append(now)
    _RATE_BUCKETS[client_key] = recent
    # Periodically discard inactive keys so a warm serverless instance stays small.
    if len(_RATE_BUCKETS) > 1000:
        for key in list(_RATE_BUCKETS):
            if not any(now - stamp < RATE_WINDOW_SECONDS for stamp in _RATE_BUCKETS[key]):
                _RATE_BUCKETS.pop(key, None)
    return False


def _same_origin(origin: str | None, request_host: str) -> bool:
    if not origin or not request_host:
        return False
    try:
        parsed = urlsplit(origin)
        origin_host = (parsed.hostname or "").rstrip(".").lower()
        host = (urlsplit("//" + request_host).hostname or "").rstrip(".").lower()
    except ValueError:
        return False
    return parsed.scheme in ("http", "https") and bool(origin_host) and origin_host == host


def _send_telegram(message: str) -> bool:
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or os.environ.get("CHAT_BOT_TOKEN") or "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        return False
    endpoint = "https://api.telegram.org/bot" + token + "/sendMessage"
    request = Request(
        endpoint,
        data=json.dumps({"chat_id": chat_id, "text": message}, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=4) as response:
            result = json.loads(response.read(4096).decode("utf-8"))
            return response.status == 200 and bool(result.get("ok"))
    except (OSError, TimeoutError, URLError, ValueError):
        return False


class handler(BaseHTTPRequestHandler):
    def _respond(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        self._respond(405, {"error": "Use POST to send a chat notification."})

    def do_POST(self) -> None:
        if not _same_origin(self.headers.get("Origin"), self.headers.get("Host", "")):
            self._respond(403, {"error": "This endpoint only accepts requests from the website where it is hosted."})
            return
        if self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json":
            self._respond(415, {"error": "A JSON request is required."})
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0 or content_length > MAX_BODY_BYTES:
            self._respond(413, {"error": "The chat notification request is too large or empty."})
            return
        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._respond(400, {"error": "The chat notification request could not be read."})
            return
        if not isinstance(payload, dict) or payload.get("event") not in ("open", "first_message"):
            self._respond(400, {"error": "Unsupported chat notification event."})
            return
        event = payload["event"]
        message = payload.get("message", "")
        page = payload.get("page", "/")
        if not isinstance(message, str) or not isinstance(page, str):
            self._respond(400, {"error": "The chat notification fields must be text."})
            return
        try:
            notification = _format_notification(event, page, message)
        except ValueError:
            self._respond(400, {"error": "A first chat message is required."})
            return
        client_key = (self.headers.get("x-forwarded-for", "anonymous").split(",", 1)[0].strip() or "anonymous")[:80]
        if _rate_limited(client_key):
            self._respond(429, {"error": "Too many chat notifications. Please try again later."})
            return
        if not _send_telegram(notification):
            self._respond(503, {"error": "The chat notification could not be sent."})
            return
        self._respond(200, {"ok": True})

    def log_message(self, _format: str, *_args) -> None:
        # Do not log visitor messages, IP addresses, or notification contents.
        return
