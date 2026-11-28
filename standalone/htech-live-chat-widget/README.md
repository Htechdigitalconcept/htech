# Htech Live Chat Widget

A standalone demo and deployable package of the Htech floating website assistant. It includes the feed-backed automatic answers, greeting responses, Telegram owner alerts, visitor-session routing, the Telegram webhook, and temporary Upstash-backed owner replies.

> This package is a shareable copy. The existing Htech website continues using its current widget files; this package does not remove or replace that integration.

## How live replies work

1. A browser tab receives a random chat-session ID.
2. Opening the chat and each visitor message are sent to the configured Telegram chat, with a short session label.
3. In Telegram, use **Reply** on the specific Htech message to answer that visitor. Unthreaded Telegram messages are not routed to a visitor.
4. While the website chat is open, it checks for replies about every 10 seconds and displays them as a direct reply from Ademola.
5. Reply mappings and owner replies expire after 24 hours.

The widget's greeting and feed-based answers still respond immediately. Visitor messages are forwarded to Telegram; owner replies are temporarily stored in Redis so they can be delivered to the correct browser session.

## Deploy as a separate Vercel project

1. Put this folder at the root of a GitHub repository, or select it as the Vercel project root.
2. Import the repository into Vercel and deploy it.
3. In Vercel **Project Settings → Environment Variables**, add these for Production:
   - `TELEGRAM_BOT_TOKEN` — token from Telegram's BotFather. `CHAT_BOT_TOKEN` is also accepted.
   - `TELEGRAM_CHAT_ID` — the private chat ID that should receive messages. Start the bot in Telegram with `/start` first.
   - `UPSTASH_REDIS_REST_URL` — the database's HTTPS REST URL (not a `redis://` or `rediss://` connection string).
   - `UPSTASH_REDIS_REST_TOKEN` — the database's REST token (not its Redis password).
   - Optional `TELEGRAM_WEBHOOK_URL` — only if the production callback URL differs from Vercel's detected production URL.
4. Redeploy after setting or changing environment variables.
5. Open the deployed demo. It registers the Telegram webhook on first use.

Never add real credentials to this repository, `.env.example`, frontend JavaScript, or a chat message. A free Redis plan may have usage limits; check your provider's current quota.

## Local checks

Python 3.10+ and Node.js are sufficient for the included unit tests:

```bash
python -m unittest discover -s tests -p 'test_*.py'
node tests/test_chat_assistant.js
```

The browser-facing backend routes are Vercel Python functions under `api/`. The production Telegram webhook URL is derived from Vercel's production URL unless `TELEGRAM_WEBHOOK_URL` is set.
