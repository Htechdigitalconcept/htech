# Htech floating assistant: updating its information feed

The assistant is a feed-backed site widget. It matches questions against published Htech facts and FAQs and adds practical guidance based on the visitor's business context. Standalone greetings receive a welcome message. Chat messages are sent to Ademola through Telegram; website chat sessions and owner replies are kept temporarily in Redis for up to 24 hours so Telegram replies can return to the correct visitor.

## Update the bundled feed

Edit `assets/data/chat-assistant-feed.json` and redeploy the site. Keep the top-level keys `schemaVersion`, `business`, `profile`, `answers` and `personalizedGuidance`.

Each `answers` item has:

- `id`: unique, URL-safe identifier.
- `title`: a short internal topic label.
- `keywords`: words or phrases visitors may type. Add common wording and spelling variants.
- `answer`: the verified answer shown to visitors.

`personalizedGuidance` has keys `online-store`, `service-business`, `existing-site`, `new-site` and `general`. Keep its values as short, practical additions that can safely follow any answer. Do not put private information, unverified prices, client details or promises in the public feed.

## Use a separately hosted public JSON feed

1. Publish a CORS-enabled JSON file with the same schema.
2. Set `window.HTECH_CHAT_FEED_URL` in `assets/js/chat-assistant-config.js` to its HTTPS URL.
3. Keep the URL publicly readable and ensure the feed host allows this site's origin. If it cannot be fetched, the assistant will say the feed is unavailable rather than invent an answer.

The bundled file is served publicly with the website, so editing it and redeploying is the simplest option. The feed is not a generative AI model: answers come from the verified entries, with simple keyword matching and context-specific guidance. A generative AI integration would need a secure server-side API and credentials; those must not be placed in browser JavaScript.

## Telegram live chat and replies

Every tab receives a random chat-session ID. Opening the chat and each visitor message generates a Telegram message tagged with a short session label. To reply to one visitor, use Telegram's native **Reply** action on that visitor's Htech message. The webhook maps Telegram's replied-to message back to that exact browser session. Unthreaded Telegram messages are not sent to a visitor. In the website chat, Ademola's first reply is labelled as a direct response from him. The FAQ assistant still answers greetings and known questions immediately.

Redis stores the session mapping and up to 40 owner replies per chat for 24 hours. Messages are forwarded to the owner bot chat; the website does not keep a permanent transcript. The widget tells visitors that chat messages go to Telegram and replies are retained temporarily.

Set these Vercel Production environment variables:

- `TELEGRAM_BOT_TOKEN` (or `CHAT_BOT_TOKEN`) and `TELEGRAM_CHAT_ID` for the owner's bot conversation. The owner must send `/start` to the bot first.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for the Redis database.
- Optional `TELEGRAM_WEBHOOK_URL` if the production callback URL is not `https://htech-two.vercel.app/api/telegram-webhook`.

The app registers the Telegram webhook when a visitor first opens the chat. Never put credentials in browser JavaScript or commit them. After changing environment variables, redeploy the Vercel project.

## Direct contact

The widget offers icon-only shortcuts to WhatsApp, email and Ademola's LinkedIn profile. The phone number is not displayed in the chat UI. If the visitor has written a request in chat, the WhatsApp link opens with a short prefilled summary; the visitor can edit it and choose whether to send it.
