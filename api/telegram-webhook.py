"""Receive owner replies from Telegram and route them to the correct website chat."""
from __future__ import annotations

import hmac
import json
from http.server import BaseHTTPRequestHandler

from lib.chat_backend import (
    ChatBackendError,
    public_error,
    redis_command,
    save_owner_reply,
    telegram_api,
    telegram_credentials,
    webhook_secret,
)

MAX_BODY_BYTES = 16384
MAX_REPLY_CHARS = 2000


class handler(BaseHTTPRequestHandler):
    def _respond(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        self._respond(405, {"error": "Telegram webhooks use POST."})

    def do_POST(self) -> None:
        try:
            token, owner_chat_id = telegram_credentials()
        except ChatBackendError as exc:
            status, error = public_error(exc.code)
            self._respond(status, {"error": error})
            return
        received_secret = self.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if not hmac.compare_digest(received_secret, webhook_secret(token)):
            self._respond(403, {"error": "Invalid webhook signature."})
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0 or content_length > MAX_BODY_BYTES:
            self._respond(413, {"error": "Webhook update is too large or empty."})
            return
        try:
            update = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._respond(400, {"error": "Webhook update could not be read."})
            return
        message = update.get("message") if isinstance(update, dict) else None
        if not isinstance(message, dict):
            self._respond(200, {"ok": True, "ignored": True})
            return
        chat = message.get("chat") or {}
        sender = message.get("from") or {}
        if str(chat.get("id", "")) != owner_chat_id or sender.get("is_bot"):
            self._respond(200, {"ok": True, "ignored": True})
            return
        text = message.get("text") or message.get("caption") or ""
        text = str(text).strip()[:MAX_REPLY_CHARS]
        if not text:
            self._respond(200, {"ok": True, "ignored": True})
            return
        replied_to = message.get("reply_to_message") or {}
        target = replied_to.get("message_id")
        target_chat = (replied_to.get("chat") or {}).get("id", owner_chat_id)
        if target is None or str(target_chat) != owner_chat_id:
            try:
                telegram_api(token, "sendMessage", {
                    "chat_id": owner_chat_id,
                    "reply_to_message_id": message.get("message_id"),
                    "text": "To message a website visitor, use Telegram’s Reply action on that visitor’s Htech chat notification.",
                })
            except ChatBackendError:
                pass
            self._respond(200, {"ok": True, "routed": False})
            return
        try:
            session_id = redis_command("GET", "htech:telegram-reply:" + owner_chat_id + ":" + str(target))
            if not session_id:
                self._respond(200, {"ok": True, "routed": False})
                return
            reply_id = str(update.get("update_id", message.get("message_id", "reply")))
            save_owner_reply(str(session_id), reply_id, text)
            telegram_api(token, "sendMessage", {
                "chat_id": owner_chat_id,
                "reply_to_message_id": message.get("message_id"),
                "text": "Sent to the website visitor.",
            })
        except ChatBackendError as exc:
            status, error = public_error(exc.code)
            self._respond(status, {"error": error})
            return
        self._respond(200, {"ok": True, "routed": True})

    def log_message(self, _format: str, *_args) -> None:
        return
