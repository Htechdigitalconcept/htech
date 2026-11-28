"""Shared helpers for Telegram-backed live chat and Upstash Redis storage."""
from __future__ import annotations

import hashlib
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SESSION_TTL_SECONDS = 24 * 60 * 60
MAX_REPLY_COUNT = 40
_WEBHOOK_READY = False


class ChatBackendError(Exception):
    """A safe operational error without any secret or visitor content."""
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _first_env(*names: str) -> str:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""


def telegram_credentials() -> tuple[str, str]:
    token = _first_env("TELEGRAM_BOT_TOKEN", "CHAT_BOT_TOKEN", "chat_bot_token", "telegram_bot_token")
    chat_id = _first_env("TELEGRAM_CHAT_ID", "CHAT_ID", "chat_id", "telegram_chat_id")
    if not token or not chat_id:
        raise ChatBackendError("missing_telegram_config")
    return token, chat_id


def redis_command(*command: str) -> object:
    endpoint = _first_env("UPSTASH_REDIS_REST_URL")
    token = _first_env("UPSTASH_REDIS_REST_TOKEN")
    if not endpoint or not token:
        raise ChatBackendError("missing_redis_config")
    request = Request(
        endpoint.rstrip("/") + "/pipeline",
        data=json.dumps([list(command)], ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=4) as response:
            body = json.loads(response.read(16384).decode("utf-8"))
        if not isinstance(body, list) or not body or not isinstance(body[0], dict):
            raise ChatBackendError("redis_command_failed")
        result = body[0]
        if result.get("error"):
            raise ChatBackendError("redis_command_failed")
        return result.get("result")
    except ChatBackendError:
        raise
    except HTTPError as exc:
        raise ChatBackendError("redis_http_" + str(exc.code)) from exc
    except (OSError, TimeoutError, URLError, ValueError) as exc:
        raise ChatBackendError("redis_unavailable") from exc


def telegram_api(token: str, method: str, payload: dict) -> dict:
    request = Request(
        "https://api.telegram.org/bot" + token + "/" + method,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=5) as response:
            body = json.loads(response.read(16384).decode("utf-8"))
        if response.status != 200 or not body.get("ok"):
            raise ChatBackendError("telegram_rejected")
        return body.get("result") or {}
    except ChatBackendError:
        raise
    except HTTPError as exc:
        raise ChatBackendError("telegram_rejected") from exc
    except (OSError, TimeoutError, URLError, ValueError) as exc:
        raise ChatBackendError("telegram_unreachable") from exc


def webhook_secret(token: str) -> str:
    return hashlib.sha256(("htech-live-chat:" + token).encode("utf-8")).hexdigest()


def ensure_webhook(token: str) -> None:
    global _WEBHOOK_READY
    if _WEBHOOK_READY:
        return
    host = _first_env("VERCEL_PROJECT_PRODUCTION_URL") or "htech-two.vercel.app"
    host = host.removeprefix("https://").removeprefix("http://").strip("/")
    webhook_url = _first_env("TELEGRAM_WEBHOOK_URL") or ("https://" + host + "/api/telegram-webhook")
    telegram_api(token, "setWebhook", {
        "url": webhook_url,
        "secret_token": webhook_secret(token),
        "allowed_updates": ["message"],
    })
    _WEBHOOK_READY = True


def save_telegram_message(message_id: int | str, session_id: str, chat_id: str) -> None:
    key = "htech:telegram-reply:" + str(chat_id) + ":" + str(message_id)
    redis_command("SET", key, session_id, "EX", str(SESSION_TTL_SECONDS))


def save_owner_reply(session_id: str, reply_id: str, text: str) -> None:
    key = "htech:chat-replies:" + session_id
    payload = json.dumps({"id": reply_id, "text": text}, ensure_ascii=False, separators=(",", ":"))
    redis_command("LPUSH", key, payload)
    redis_command("LTRIM", key, "0", str(MAX_REPLY_COUNT - 1))
    redis_command("EXPIRE", key, str(SESSION_TTL_SECONDS))


def public_error(code: str) -> tuple[int, str]:
    if code.startswith("redis_http_"):
        try:
            upstream_status = int(code.rsplit("_", 1)[1])
        except ValueError:
            upstream_status = 0
        if upstream_status == 401:
            return 502, "Upstash rejected its REST token (HTTP 401). Check that it belongs to this database."
        if upstream_status == 404:
            return 502, "Upstash could not find this REST endpoint (HTTP 404). Check the REST URL."
        if upstream_status == 429:
            return 502, "Upstash rate-limited the live chat request (HTTP 429). Check the database quota."
        if upstream_status == 400:
            return 502, "Upstash rejected the Redis command (HTTP 400)."
        return 502, "Upstash returned HTTP " + str(upstream_status) + " for the live chat request."
    errors = {
        "missing_telegram_config": (503, "Telegram bot credentials are missing."),
        "missing_redis_config": (503, "The live chat store is not configured."),
        "redis_command_failed": (502, "The live chat store rejected the Redis command."),
        "redis_unavailable": (502, "The live chat store could not be reached. Check the Upstash REST URL and network availability."),
        "telegram_rejected": (502, "Telegram rejected the request. Check the bot and chat configuration."),
        "telegram_unreachable": (502, "Telegram could not be reached."),
    }
    return errors.get(code, (500, "The live chat service could not complete the request."))
