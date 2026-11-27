import importlib.util
import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "api" / "chat-notify.py"
SPEC = importlib.util.spec_from_file_location("chat_notify", MODULE_PATH)
chat_notify = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(chat_notify)
from lib.chat_backend import ChatBackendError, telegram_credentials


class ChatNotificationTests(unittest.TestCase):
    def setUp(self):
        chat_notify._RATE_BUCKETS.clear()

    def post(self, payload, headers=None):
        body = json.dumps(payload).encode("utf-8")
        request = object.__new__(chat_notify.handler)
        request.headers = {
            "Origin": "https://htech-two.vercel.app",
            "Host": "htech-two.vercel.app",
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
            "x-forwarded-for": "203.0.113.10",
        }
        request.headers.update(headers or {})
        request.rfile = io.BytesIO(body)
        request.wfile = io.BytesIO()
        request.status = None
        request.send_response = lambda status: setattr(request, "status", status)
        request.send_header = lambda *_args: None
        request.end_headers = lambda: None
        request.do_POST()
        response = json.loads(request.wfile.getvalue().decode("utf-8"))
        return request.status, response

    def test_open_alert_includes_page_and_reply_instruction(self):
        session_id = "d4a5c6b7-89ab-4cde-a012-3456789abcde"
        result = chat_notify._format_notification("open", "/portfolio.html", "", session_id)
        self.assertIn("Website chat opened", result)
        self.assertIn("Page: /portfolio.html", result)
        self.assertIn("Reply to this Telegram message", result)
        self.assertIn("UTC", result)

    def test_each_visitor_message_is_included_and_capped(self):
        session_id = "d4a5c6b7-89ab-4cde-a012-3456789abcde"
        result = chat_notify._format_notification("message", "/contact.html", "Hello\n\x00" + "x" * 700, session_id)
        self.assertIn("Website visitor", result)
        self.assertIn("Page: /contact.html", result)
        self.assertIn("Hello", result)
        self.assertIn("Reply directly to this Telegram message", result)
        self.assertNotIn("\x00", result)
        message = result.split("Message: ", 1)[1].split("\n\nReply", 1)[0]
        self.assertEqual(len(message), chat_notify.MAX_MESSAGE_CHARS)

    def test_invalid_or_empty_visitor_message_is_rejected(self):
        with self.assertRaises(ValueError):
            chat_notify._format_notification("message", "/", "  \x00 ", "d4a5c6b7-89ab-4cde-a012-3456789abcde")
        with self.assertRaises(ValueError):
            chat_notify._format_notification("unknown", "/", "", "d4a5c6b7-89ab-4cde-a012-3456789abcde")

    def test_origin_must_match_request_host(self):
        self.assertTrue(chat_notify._same_origin("https://htech-two.vercel.app", "htech-two.vercel.app"))
        self.assertTrue(chat_notify._same_origin("http://localhost:4176", "localhost:4176"))
        self.assertFalse(chat_notify._same_origin("https://attacker.example", "htech-two.vercel.app"))
        self.assertFalse(chat_notify._same_origin(None, "htech-two.vercel.app"))

    def test_alternate_secret_names_are_supported(self):
        with patch.dict("os.environ", {"chat_bot_token": "fake-token", "chat_id": "fake-chat"}, clear=True):
            self.assertEqual(telegram_credentials(), ("fake-token", "fake-chat"))

    def test_handler_forwards_visitor_message_and_session_mapping(self):
        session_id = "d4a5c6b7-89ab-4cde-a012-3456789abcde"
        payload = {"event": "message", "session_id": session_id, "page": "/contact.html", "message": "I need a website"}
        with (
            patch.object(chat_notify, "telegram_credentials", return_value=("fake-token", "12345")),
            patch.object(chat_notify, "ensure_webhook"),
            patch.object(chat_notify, "redis_command"),
            patch.object(chat_notify, "telegram_api", return_value={"message_id": 77}) as send,
            patch.object(chat_notify, "save_telegram_message") as save,
        ):
            status, response = self.post(payload)
        self.assertEqual(status, 200)
        self.assertEqual(response, {"ok": True, "alert_sent": True, "reply_ready": True})
        self.assertIn("I need a website", send.call_args.args[2]["text"])
        save.assert_called_once_with(77, session_id, "12345")

    def test_telegram_alert_survives_redis_failure(self):
        payload = {"event": "open", "session_id": "d4a5c6b7-89ab-4cde-a012-3456789abcde", "page": "/"}
        with (
            patch.object(chat_notify, "telegram_credentials", return_value=("fake-token", "12345")),
            patch.object(chat_notify, "telegram_api", return_value={"message_id": 78}) as send,
            patch.object(chat_notify, "ensure_webhook"),
            patch.object(chat_notify, "redis_command", side_effect=ChatBackendError("redis_unavailable")),
        ):
            status, response = self.post(payload)
        self.assertEqual(status, 200)
        self.assertTrue(response["alert_sent"])
        self.assertFalse(response["reply_ready"])
        send.assert_called_once()

    def test_handler_rejects_cross_origin_and_empty_message(self):
        status, _ = self.post({"event": "open", "session_id": "d4a5c6b7-89ab-4cde-a012-3456789abcde", "page": "/"}, {"Origin": "https://attacker.example"})
        self.assertEqual(status, 403)
        status, _ = self.post({"event": "message", "session_id": "d4a5c6b7-89ab-4cde-a012-3456789abcde", "page": "/", "message": " \x00 "})
        self.assertEqual(status, 400)


if __name__ == "__main__":
    unittest.main()
