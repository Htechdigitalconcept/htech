import json
import os
import unittest
from unittest.mock import patch

from lib import chat_backend


class FakeResponse:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read(self, _limit):
        return b'{"result":"OK"}'


class ChatBackendTests(unittest.TestCase):
    def test_upstash_rest_command_uses_private_bearer_token(self):
        with patch.dict(os.environ, {
            "UPSTASH_REDIS_REST_URL": "https://redis.example",
            "UPSTASH_REDIS_REST_TOKEN": "never-return-this",
        }, clear=True), patch.object(chat_backend, "urlopen", return_value=FakeResponse()) as send:
            self.assertEqual(chat_backend.redis_command("SET", "key", "value", "EX", "60"), "OK")
        request = send.call_args.args[0]
        self.assertEqual(json.loads(request.data), ["SET", "key", "value", "EX", "60"])
        self.assertEqual(request.get_header("Authorization"), "Bearer never-return-this")

    def test_missing_redis_environment_is_reported_without_network(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(chat_backend, "urlopen") as send:
            with self.assertRaises(chat_backend.ChatBackendError) as error:
                chat_backend.redis_command("PING")
        self.assertEqual(error.exception.code, "missing_redis_config")
        send.assert_not_called()

    def test_webhook_secret_is_stable_and_non_plaintext(self):
        secret = chat_backend.webhook_secret("bot-token")
        self.assertEqual(secret, chat_backend.webhook_secret("bot-token"))
        self.assertNotEqual(secret, "bot-token")
        self.assertRegex(secret, r"^[a-f0-9]{64}$")


if __name__ == "__main__":
    unittest.main()
