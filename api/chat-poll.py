"""Return Telegram owner replies for one unguessable website-chat session."""
from __future__ import annotations

import json
import uuid
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlsplit

from lib.chat_backend import ChatBackendError, public_error, redis_command


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
        origin = self.headers.get("Origin")
        if origin:
            try:
                source = (urlsplit(origin).hostname or "").lower()
                target = (urlsplit("//" + self.headers.get("Host", "")).hostname or "").lower()
            except ValueError:
                source = target = ""
            if not source or source != target:
                self._respond(403, {"error": "This endpoint only accepts same-site requests."})
                return
        query = parse_qs(urlsplit(self.path).query)
        raw_session_id = (query.get("session_id") or [""])[0]
        try:
            session_id = str(uuid.UUID(raw_session_id))
        except (ValueError, AttributeError, TypeError):
            self._respond(400, {"error": "A valid chat session is required."})
            return
        try:
            raw_messages = redis_command("LRANGE", "htech:chat-replies:" + session_id, "0", "-1") or []
            messages = []
            for raw in raw_messages:
                try:
                    item = json.loads(raw)
                except (TypeError, json.JSONDecodeError):
                    continue
                if isinstance(item, dict) and isinstance(item.get("id"), str) and isinstance(item.get("text"), str):
                    messages.append(item)
            messages.reverse()
        except ChatBackendError as exc:
            status, error = public_error(exc.code)
            self._respond(status, {"error": error})
            return
        self._respond(200, {"messages": messages})

    def do_POST(self) -> None:
        self._respond(405, {"error": "Use GET to check for replies."})

    def log_message(self, _format: str, *_args) -> None:
        return
