"""Create a live website-chat session and forward visitor activity to Telegram."""
from __future__ import annotations

import json
import re
import time
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlsplit

from lib.chat_backend import (
    SESSION_TTL_SECONDS,
    ChatBackendError,
    ensure_webhook,
    public_error,
    redis_command,
    save_telegram_message,
    telegram_api,
    telegram_credentials,
)

MAX_BODY_BYTES = 4096
MAX_MESSAGE_CHARS = 600
MAX_PAGE_CHARS = 180
RATE_WINDOW_SECONDS = 600
RATE_MAX_EVENTS = 80
_RATE_BUCKETS: dict[str, list[float]] = {}
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _clean_text(value: str, limit: int) -> str:
    return _CONTROL_CHARS.sub("", value).strip()[:limit]


def _valid_session_id(value: object) -> str | None:
    if not isinstance(value, str) or len(value) > 40:
        return None
    try:
        return str(uuid.UUID(value))
    except (ValueError, AttributeError, TypeError):
        return None


def _format_notification(event: str, page: str, message: str, session_id: str) -> str:
    tag = session_id.split("-", 1)[0].upper()
    page = _clean_text(page, MAX_PAGE_CHARS) or "/"
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    if event == "open":
        return ("Website chat opened · " + tag + "\nPage: " + page + "\nTime: " + timestamp +
                "\nReply to this Telegram message to answer this visitor directly.")
    if event == "message":
        message = _clean_text(message, MAX_MESSAGE_CHARS)
        if not message:
            raise ValueError("A visitor message is required.")
        return ("Website visitor · " + tag + "\nPage: " + page + "\nMessage: " + message +
                "\n\nReply directly to this Telegram message to send your response to this visitor.")
    raise ValueError("Unsupported chat notification event.")


def _rate_limited(client_key: str) -> bool:
    now = time.time()
    recent = [stamp for stamp in _RATE_BUCKETS.get(client_key, []) if now - stamp < RATE_WINDOW_SECONDS]
    if len(recent) >= RATE_MAX_EVENTS:
        _RATE_BUCKETS[client_key] = recent
        return True
    recent.append(now)
    _RATE_BUCKETS[client_key] = recent
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
        self._respond(405, {"error": "Use POST to send a chat event."})

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
            self._respond(413, {"error": "The chat request is too large or empty."})
            return
        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._respond(400, {"error": "The chat request could not be read."})
            return
        if not isinstance(payload, dict):
            self._respond(400, {"error": "A chat event is required."})
            return
        session_id = _valid_session_id(payload.get("session_id"))
        event = payload.get("event")
        if event == "first_message":
            event = "message"
        if not session_id or event not in ("open", "message"):
            self._respond(400, {"error": "A valid chat session and event are required."})
            return
        page = payload.get("page", "/")
        message = payload.get("message", "")
        if not isinstance(page, str) or not isinstance(message, str):
            self._respond(400, {"error": "Chat event fields must be text."})
            return
        try:
            notification = _format_notification(event, page, message, session_id)
        except ValueError:
            self._respond(400, {"error": "A non-empty visitor message is required."})
            return
        client_key = (self.headers.get("x-forwarded-for", "anonymous").split(",", 1)[0].strip() or "anonymous")[:80]
        if _rate_limited(client_key):
            self._respond(429, {"error": "Too many chat messages. Please wait before trying again."})
            return
        try:
            token, owner_chat_id = telegram_credentials()
            # Keep the original alert behavior independent of Redis/webhook health.
            telegram_message = telegram_api(token, "sendMessage", {
                "chat_id": owner_chat_id,
                "text": notification,
                "disable_web_page_preview": True,
            })
        except ChatBackendError as exc:
            status, error = public_error(exc.code)
            self._respond(status, {"error": error})
            return
        except Exception:
            self._respond(502, {"error": "The chat event could not be delivered to Telegram."})
            return

        reply_ready = True
        try:
            ensure_webhook(token)
            redis_command("SET", "htech:chat-session:" + session_id,
                          json.dumps({"page": _clean_text(page, MAX_PAGE_CHARS), "updated": int(time.time())}),
                          "EX", str(SESSION_TTL_SECONDS))
            save_telegram_message(telegram_message["message_id"], session_id, owner_chat_id)
        except ChatBackendError as exc:
            reply_ready = False
            print("Htech chat reply routing setup failed: " + exc.code)
        except Exception:
            reply_ready = False
            print("Htech chat reply routing setup failed: unexpected error")
        self._respond(200, {"ok": True, "alert_sent": True, "reply_ready": reply_ready})

    def log_message(self, _format: str, *_args) -> None:
        # Avoid logging visitor message content or identifiers.
        return
