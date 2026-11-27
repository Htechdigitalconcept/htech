# Htech floating assistant: updating its information feed

The assistant is a small, feed-backed site widget. It matches visitor questions against published Htech facts and FAQs, then adds practical guidance based on whether the visitor mentions a store, service business, new site or existing site. It does not send chat messages to an AI provider or store them; email contact links can include the visitor's chat so they can choose to share it with Ademola.

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

## Direct contact

The widget offers direct WhatsApp chat with Ademola at `+234 813 767 7307`, email to `htechdigitalconcept@gmail.com`, and his LinkedIn profile. If the visitor has written a request in chat, the WhatsApp link opens with a short prefilled summary; the visitor can edit it and choose whether to send it.
