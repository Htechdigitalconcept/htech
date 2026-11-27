import importlib.util
import io
import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "api" / "chat-notify.py"
SPEC = importlib.util.spec_from_file_location("chat_notify", MODULE_PATH)
chat_notify = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(chat_notify)


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

    def test_open_alert_includes_page_without_message(self):
        result = chat_notify._format_notification("open", "/portfolio.html")
        self.assertIn("Htech website chat opened", result)
        self.assertIn("Page: /portfolio.html", result)
        self.assertNotIn("Message:", result)
        self.assertIn("UTC", result)

    def test_first_message_is_included_and_capped(self):
        result = chat_notify._format_notification("first_message", "/contact.html", "Hello\n\x00" + "x" * 700)
        self.assertIn("New first message in Htech website chat", result)
        self.assertIn("Page: /contact.html", result)
        self.assertIn("Hello", result)
        self.assertNotIn("\x00", result)
        message = result.split("Message: ", 1)[1].split("\nTime:", 1)[0]
        self.assertEqual(len(message), chat_notify.MAX_MESSAGE_CHARS)

    def test_invalid_or_empty_first_message_is_rejected(self):
        with self.assertRaises(ValueError):
            chat_notify._format_notification("first_message", "/", "  \x00 ")
        with self.assertRaises(ValueError):
            chat_notify._format_notification("unknown", "/")

    def test_origin_must_match_request_host(self):
        self.assertTrue(chat_notify._same_origin("https://htech-two.vercel.app", "htech-two.vercel.app"))
        self.assertTrue(chat_notify._same_origin("http://localhost:4176", "localhost:4176"))
        self.assertFalse(chat_notify._same_origin("https://attacker.example", "htech-two.vercel.app"))
        self.assertFalse(chat_notify._same_origin(None, "htech-two.vercel.app"))

    def test_missing_secrets_never_attempt_network_request(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(chat_notify._send_telegram("test"))

    def test_handler_sends_valid_first_message_without_returning_message(self):
        payload = {"event": "first_message", "page": "/contact.html", "message": "I need a website"}
        with patch.object(chat_notify, "_send_telegram", return_value=True) as send:
            status, response = self.post(payload)
        self.assertEqual(status, 200)
        self.assertEqual(response, {"ok": True})
        self.assertIn("I need a website", send.call_args.args[0])
        self.assertNotIn("message", response)

    def test_handler_rejects_cross_origin_and_empty_message(self):
        status, _ = self.post({"event": "open", "page": "/"}, {"Origin": "https://attacker.example"})
        self.assertEqual(status, 403)
        with patch.object(chat_notify, "_send_telegram", return_value=True):
            status, _ = self.post({"event": "first_message", "page": "/", "message": " \x00 "})
        self.assertEqual(status, 400)


if __name__ == "__main__":
    unittest.main()
