(function (root) {
  'use strict';

  // Set window.HTECH_CHAT_FEED_URL before this script to use a public JSON feed.
  // The remote feed must allow browser CORS requests. The bundled JSON is the default.
  var FEED_URL = root.HTECH_CHAT_FEED_URL || '/assets/data/chat-assistant-feed.json';
  var FALLBACK_ANSWER = 'I could not find a reliable answer to that in the current Htech information feed. Tell me a little about your business and what you need, or message Ademola directly using the contact options below.';
  var STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'about', 'can', 'do', 'for', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'the', 'to', 'what', 'with', 'you', 'your']);

  function normalize(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function tokens(value) {
    return normalize(value).split(/\s+/).filter(function (word) {
      return word.length > 1 && !STOP_WORDS.has(word);
    });
  }

  function matchAnswer(query, feed) {
    var normalizedQuery = normalize(query);
    var queryTokens = tokens(query);
    var records = (feed && Array.isArray(feed.answers)) ? feed.answers : [];
    var best = null;
    var bestScore = 0;

    records.forEach(function (record) {
      var score = 0;
      (record.keywords || []).forEach(function (keyword) {
        var normalizedKeyword = normalize(keyword);
        if (!normalizedKeyword) return;
        if (normalizedQuery.indexOf(normalizedKeyword) !== -1) score += normalizedKeyword.indexOf(' ') !== -1 ? 4 : 2;
        else {
          var keywordTokens = tokens(keyword);
          var overlaps = keywordTokens.filter(function (word) { return queryTokens.indexOf(word) !== -1; }).length;
          if (overlaps) score += overlaps / keywordTokens.length;
        }
      });
      if (score > bestScore) {
        best = record;
        bestScore = score;
      }
    });
    return best;
  }

  function classifyContext(value) {
    var text = normalize(value);
    if (/\b(shop|store|product|products|retail|sell|selling|ecommerce|e commerce|woocommerce)\b/.test(text)) return 'online-store';
    if (/\b(existing|current|redesign|broken|slow|update|improve|fix|already have|my site)\b/.test(text)) return 'existing-site';
    if (/\b(service|services|consultant|consulting|appointment|booking|bookings|clients|leads|enquir)\b/.test(text)) return 'service-business';
    if (/\b(new|starting|launch|building|build|need a website|website from scratch)\b/.test(text)) return 'new-site';
    return 'general';
  }

  function isGreeting(query) {
    var greeting = normalize(query).replace(/\s+/g, ' ').trim();
    return /^(hi|hello|hey|hiya|howdy|yo|what s up|whats up|good morning|good afternoon|good evening)( there)?$/.test(greeting);
  }

  function buildReply(query, context, feed) {
    if (isGreeting(query)) {
      return 'Hi! Welcome to Htech Digital Concepts. I can help with website design, WordPress, online stores, improving an existing website, or getting in touch with Ademola. What can I help you with today?';
    }
    var record = matchAnswer(query, feed);
    if (!record || !record.answer) return FALLBACK_ANSWER;
    var reply = record.answer;
    var guidance = feed && feed.personalizedGuidance;
    var category = classifyContext((context || '') + ' ' + query);
    var personalized = guidance && (guidance[category] || guidance.general);
    if (personalized) reply += '\n\nTo tailor this to your request: ' + personalized;
    return reply;
  }

  function buildWhatsAppUrl(messages) {
    var request = (messages || []).filter(function (entry) { return entry.who === 'user'; })
      .map(function (entry) { return String(entry.text || '').trim(); })
      .filter(Boolean).join(' / ').slice(0, 700);
    var message = 'Hi Ademola, I came from the Htech website assistant and would like to discuss a website project.';
    if (request) message += '\n\nHere is what I am looking for: ' + request;
    return 'https://wa.me/2348137677307?text=' + encodeURIComponent(message);
  }

  function createWidget() {
    if (!root.document || root.document.getElementById('htech-chat')) return;
    var host = root.document.createElement('div');
    host.id = 'htech-chat';
    host.className = 'htech-chat';
    host.innerHTML = '<button class="htech-chat__launcher" type="button" aria-expanded="false" aria-controls="htech-chat-panel" aria-label="Open Htech assistant"><span class="htech-chat__launcher-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v10a2.5 2.5 0 0 1-2.5 2.5H10l-5.5 4v-6.2A2.5 2.5 0 0 1 4 14z"></path><path d="M8 9h8M8 13h5"></path></svg></span><span class="htech-chat__launcher-label">Ask Htech</span></button>' +
      '<section class="htech-chat__panel" id="htech-chat-panel" role="dialog" aria-label="Htech website assistant" aria-modal="false" hidden>' +
        '<header class="htech-chat__head"><div class="htech-chat__avatar" aria-hidden="true">H</div><div class="htech-chat__identity"><strong>Htech Assistant</strong><span><i></i> Here to help with your website</span></div><button class="htech-chat__close" type="button" aria-label="Close chat">&times;</button></header>' +
        '<div class="htech-chat__messages" role="log" aria-live="polite" aria-relevant="additions text"></div>' +
        '<div class="htech-chat__quick" aria-label="Suggested questions"><button type="button" data-chat-prompt="I need a website for my service business">Service website</button><button type="button" data-chat-prompt="I want to sell products online with a store">Online store</button><button type="button" data-chat-prompt="I need help improving my existing website">Improve my website</button></div>' +
        '<form class="htech-chat__form"><label class="htech-chat__sr-only" for="htech-chat-input">Ask a question or describe your website goal</label><textarea id="htech-chat-input" name="message" rows="1" maxlength="600" placeholder="Ask a question or share your goal…" required></textarea><button type="submit" aria-label="Send message"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-5 16-3-7zM12 13l8-9"></path></svg></button></form>' +
        '<div class="htech-chat__contact"><span class="htech-chat__contact-label">Speak directly with Ademola</span>' +
        '<a class="htech-chat__icon-link htech-chat__email" href="mailto:htechdigitalconcept@gmail.com?subject=Website%20project%20question" aria-label="Email Ademola" title="Email Ademola"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m4 7 8 6 8-6"></path></svg><span class="htech-chat__sr-only">Email Ademola</span></a>' +
        '<a class="htech-chat__icon-link htech-chat__icon-link--whatsapp htech-chat__whatsapp" href="https://wa.me/2348137677307" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp Ademola" title="WhatsApp Ademola"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.2A8.5 8.5 0 1 1 20 11.5Z"></path><path d="M9 8.5c.4 2.1 2 3.7 4 4.5l1.2-1 2 1c-.2 1.3-1.1 2-2.3 2-3.1-.2-6.3-3.3-6.5-6.3 0-1.2.7-2.1 2-2.3l1 2z"></path></svg><span class="htech-chat__sr-only">WhatsApp Ademola</span></a>' +
        '<a class="htech-chat__icon-link htech-chat__icon-link--linkedin" href="https://www.linkedin.com/in/ademolahabeeb/" target="_blank" rel="noopener noreferrer" aria-label="Message Ademola on LinkedIn" title="Message Ademola on LinkedIn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h3v10H5z"></path><circle cx="6.5" cy="5.8" r="1.6"></circle><path d="M11 9h3v1.4c.7-1 1.7-1.7 3.2-1.7 2.6 0 3.8 1.6 3.8 4.7V19h-3v-5c0-1.6-.5-2.5-1.9-2.5-1.5 0-2.1 1-2.1 2.5v5h-3z"></path></svg><span class="htech-chat__sr-only">Message Ademola on LinkedIn</span></a></div>' +
        '<p class="htech-chat__disclaimer">Answers use Htech’s published information. Chat messages go to Ademola via Telegram; replies are kept temporarily for up to 24 hours so they can appear here.</p>' +
      '</section>';
    root.document.body.appendChild(host);

    var launcher = host.querySelector('.htech-chat__launcher');
    var panel = host.querySelector('.htech-chat__panel');
    var closeButton = host.querySelector('.htech-chat__close');
    var messages = host.querySelector('.htech-chat__messages');
    var form = host.querySelector('.htech-chat__form');
    var input = host.querySelector('#htech-chat-input');
    var emailLink = host.querySelector('.htech-chat__email');
    var whatsappLink = host.querySelector('.htech-chat__whatsapp');
    var feed = null;
    var context = '';
    var transcript = [];
    var notificationSent = Object.create(null);
    var ownerReplyIds = new Set();
    var ownerHasReplied = false;
    var replyPollTimer = null;
    var replyPollInProgress = false;
    var chatSessionId = getChatSessionId();

    function getChatSessionId() {
      var key = 'htech-live-chat-session-v1';
      try {
        var saved = root.sessionStorage && root.sessionStorage.getItem(key);
        if (saved) return saved;
      } catch (_storageError) {}
      var bytes = new Uint8Array(16);
      if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(bytes);
      else for (var i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
      var id = Array.prototype.map.call(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
      id = id.slice(0, 8) + '-' + id.slice(8, 12) + '-4' + id.slice(13, 16) + '-a' + id.slice(17, 20) + '-' + id.slice(20);
      try { if (root.sessionStorage) root.sessionStorage.setItem(key, id); } catch (_storageError) {}
      return id;
    }

    function notifyOwner(eventName, messageText) {
      if (typeof root.fetch !== 'function') return;
      var isOpenEvent = eventName === 'open';
      var storageKey = 'htech-chat-notified-v3-open';
      if (isOpenEvent) {
        try { if (root.sessionStorage && root.sessionStorage.getItem(storageKey) === '1') return; } catch (_storageError) {}
        if (notificationSent.open) return;
        notificationSent.open = true;
      }
      var payload = {
        event: eventName,
        page: root.location && root.location.pathname ? root.location.pathname : '/',
        session_id: chatSessionId
      };
      if (eventName === 'message') payload.message = String(messageText || '').trim().slice(0, 600);
      try {
        root.fetch('/api/chat-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        }).then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (data) { return { response: response, data: data }; });
        }).then(function (result) {
          if (!result.response.ok) {
            if (isOpenEvent) notificationSent.open = false;
            if (root.console && root.console.warn) root.console.warn('Telegram chat notification was not delivered (HTTP ' + result.response.status + '): ' + (result.data.error || 'unknown error'));
            return;
          }
          if (result.data.reply_ready === false && root.console && root.console.warn) {
            root.console.warn('Telegram alert sent, but live replies are not ready (' + (result.data.reply_routing_error || 'unknown error') + ').');
          }
          if (isOpenEvent) {
            try { if (root.sessionStorage) root.sessionStorage.setItem(storageKey, '1'); } catch (_storageError) {}
          }
        }).catch(function () {
          if (isOpenEvent) notificationSent.open = false;
          if (root.console && root.console.warn) root.console.warn('Telegram chat notification could not reach the notification endpoint.');
        });
      } catch (_requestError) {
        if (isOpenEvent) notificationSent.open = false;
      }
    }

    function addMessage(text, who) {
      var bubble = root.document.createElement('div');
      bubble.className = 'htech-chat__message htech-chat__message--' + who;
      bubble.textContent = text;
      messages.appendChild(bubble);
      messages.scrollTop = messages.scrollHeight;
    }

    function pollOwnerReplies() {
      if (replyPollInProgress || typeof root.fetch !== 'function') return;
      replyPollInProgress = true;
      root.fetch('/api/chat-poll?session_id=' + encodeURIComponent(chatSessionId), { cache: 'no-store' })
        .then(function (response) { if (!response.ok) throw new Error('Poll failed: ' + response.status); return response.json(); })
        .then(function (data) {
          (data.messages || []).forEach(function (reply) {
            if (!reply || !reply.id || typeof reply.text !== 'string' || ownerReplyIds.has(reply.id)) return;
            ownerReplyIds.add(reply.id);
            if (!ownerHasReplied) {
              addMessage('Ademola has joined the chat and is replying to you directly.', 'owner');
              ownerHasReplied = true;
            }
            addMessage(reply.text, 'owner');
            transcript.push({ who: 'owner', text: reply.text });
          });
          if (data.messages && data.messages.length) updateContactLinks();
        })
        .catch(function () {})
        .then(function () { replyPollInProgress = false; });
    }

    function startReplyPolling() {
      if (replyPollTimer) return;
      pollOwnerReplies();
      replyPollTimer = root.setInterval(pollOwnerReplies, 10000);
    }

    function stopReplyPolling() {
      if (!replyPollTimer) return;
      root.clearInterval(replyPollTimer);
      replyPollTimer = null;
    }

    function setOpen(open) {
      launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
      launcher.setAttribute('aria-label', open ? 'Close Htech assistant' : 'Open Htech assistant');
      launcher.querySelector('.htech-chat__launcher-label').textContent = open ? 'Close chat' : 'Ask Htech';
      panel.hidden = !open;
      if (open) {
        notifyOwner('open');
        startReplyPolling();
        input.focus();
      } else {
        stopReplyPolling();
        launcher.focus();
      }
    }

    function updateContactLinks() {
      var body = 'Hi Ademola, I have a website question.\n\n' + transcript.map(function (entry) {
        return (entry.who === 'user' ? 'Me: ' : entry.who === 'owner' ? 'Ademola: ' : 'Htech Assistant: ') + entry.text;
      }).join('\n\n');
      emailLink.href = 'mailto:htechdigitalconcept@gmail.com?subject=' + encodeURIComponent('Website question from Htech chat') + '&body=' + encodeURIComponent(body);
      whatsappLink.href = buildWhatsAppUrl(transcript);
    }

    function submitMessage(rawText) {
      var text = String(rawText || '').trim().slice(0, 600);
      if (!text) return;
      notifyOwner('message', text);
      addMessage(text, 'user');
      transcript.push({ who: 'user', text: text });
      context = (context + ' ' + text).trim().slice(-1800);
      updateContactLinks();
      var reply = feed ? buildReply(text, context, feed) : 'I’m loading Htech’s information. Please try again in a moment, or contact Ademola directly below.';
      addMessage(reply, 'assistant');
      transcript.push({ who: 'assistant', text: reply });
      updateContactLinks();
      messages.scrollTop = messages.scrollHeight;
    }

    launcher.addEventListener('click', function () { setOpen(launcher.getAttribute('aria-expanded') !== 'true'); });
    closeButton.addEventListener('click', function () { setOpen(false); });
    root.document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && launcher.getAttribute('aria-expanded') === 'true') setOpen(false);
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      submitMessage(input.value);
      input.value = '';
      input.style.height = '';
    });
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    host.querySelectorAll('[data-chat-prompt]').forEach(function (button) {
      button.addEventListener('click', function () { submitMessage(button.getAttribute('data-chat-prompt')); });
    });
    addMessage('Hi, I’m Htech’s website assistant. Ask about services, project fit, process or pricing—or tell me what your business needs. I’ll use your request to make the guidance more relevant.', 'assistant');

    root.fetch(FEED_URL, { cache: 'no-cache' }).then(function (response) {
      if (!response.ok) throw new Error('Information feed returned ' + response.status);
      return response.json();
    }).then(function (data) {
      if (!data || !Array.isArray(data.answers)) throw new Error('Information feed format is invalid');
      feed = data;
    }).catch(function (error) {
      feed = { answers: [] };
      if (root.console && root.console.warn) root.console.warn('Htech assistant could not load its information feed.', error);
      addMessage('The Htech information feed is temporarily unavailable. I do not want to guess—please use the contact links below and Ademola will help directly.', 'assistant');
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { matchAnswer: matchAnswer, classifyContext: classifyContext, buildReply: buildReply, buildWhatsAppUrl: buildWhatsAppUrl };
  }
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', createWidget, { once: true });
    else createWidget();
  }
})(typeof window !== 'undefined' ? window : globalThis);
