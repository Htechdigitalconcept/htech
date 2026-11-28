import importlib.util
import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "api" / "chat-poll.py"
SPEC = importlib.util.spec_from_file_location("chat_poll", MODULE_PATH)
chat_poll = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(chat_poll)


class ChatPollTests(unittest.TestCase):
    def get(self, path):
        request = object.__new__(chat_poll.handler)
        request.path = path
        request.headers = {"Host": "htech-two.vercel.app"}
        request.wfile = io.BytesIO()
        request.status = None
        request.send_response = lambda status: setattr(request, "status", status)
        request.send_header = lambda *_args: None
        request.end_headers = lambda: None
        request.do_GET()
        result = json.loads(request.wfile.getvalue().decode("utf-8"))
        return request.status, result

    def test_returns_owner_replies_in_original_order(self):
        session_id = "d4a5c6b7-89ab-4cde-a012-3456789abcde"
        newest = json.dumps({"id": "2", "text": "Second reply"})
        oldest = json.dumps({"id": "1", "text": "First reply"})
        with patch.object(chat_poll, "redis_command", return_value=[newest, oldest]):
            status, result = self.get("/api/chat-poll?session_id=" + session_id)
        self.assertEqual(status, 200)
        self.assertEqual([message["text"] for message in result["messages"]], ["First reply", "Second reply"])

    def test_rejects_invalid_session_ids(self):
        status, _ = self.get("/api/chat-poll?session_id=guessable")
        self.assertEqual(status, 400)


if __name__ == "__main__":
    unittest.main()
