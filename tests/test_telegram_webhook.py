import importlib.util
import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "api" / "telegram-webhook.py"
SPEC = importlib.util.spec_from_file_location("telegram_webhook", MODULE_PATH)
webhook = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(webhook)
from lib.chat_backend import webhook_secret


class TelegramWebhookTests(unittest.TestCase):
    def post(self, update, secret):
        body = json.dumps(update).encode("utf-8")
        request = object.__new__(webhook.handler)
        request.headers = {"X-Telegram-Bot-Api-Secret-Token": secret, "Content-Length": str(len(body))}
        request.rfile = io.BytesIO(body)
        request.wfile = io.BytesIO()
        request.status = None
        request.send_response = lambda status: setattr(request, "status", status)
        request.send_header = lambda *_args: None
        request.end_headers = lambda: None
        request.do_POST()
        return request.status, json.loads(request.wfile.getvalue().decode("utf-8"))

    def test_threaded_owner_reply_routes_to_correct_website_session(self):
        update = {
            "update_id": 9001,
            "message": {
                "message_id": 81,
                "chat": {"id": 12345},
                "from": {"id": 12345, "is_bot": False},
                "text": "I can help with that.",
                "reply_to_message": {"message_id": 77, "chat": {"id": 12345}},
            },
        }
        with (
            patch.object(webhook, "telegram_credentials", return_value=("token", "12345")),
            patch.object(webhook, "redis_command", return_value="d4a5c6b7-89ab-4cde-a012-3456789abcde"),
            patch.object(webhook, "save_owner_reply") as save,
            patch.object(webhook, "telegram_api", return_value={}),
        ):
            status, result = self.post(update, webhook_secret("token"))
        self.assertEqual(status, 200)
        self.assertTrue(result["routed"])
        save.assert_called_once_with("d4a5c6b7-89ab-4cde-a012-3456789abcde", "9001", "I can help with that.")

    def test_rejects_invalid_telegram_signature(self):
        with patch.object(webhook, "telegram_credentials", return_value=("token", "12345")):
            status, _ = self.post({}, "wrong-secret")
        self.assertEqual(status, 403)


if __name__ == "__main__":
    unittest.main()
