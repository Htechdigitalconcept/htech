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

  function buildReply(query, context, feed) {
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
        '<div class="htech-chat__contact"><span>Want to speak with Ademola?</span><a class="htech-chat__email" href="mailto:htechdigitalconcept@gmail.com?subject=Website%20project%20question">Email me <span aria-hidden="true">↗</span></a><a class="htech-chat__whatsapp" href="https://wa.me/2348137677307" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp Ademola at +234 813 767 7307">WhatsApp <span>+234 813 767 7307</span> <i aria-hidden="true">↗</i></a><a href="https://www.linkedin.com/in/ademolahabeeb/" target="_blank" rel="noopener noreferrer">LinkedIn <span aria-hidden="true">↗</span></a></div>' +
        '<p class="htech-chat__disclaimer">Answers are based on Htech’s published information. No chat messages are stored.</p>' +
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

    function addMessage(text, who) {
      var bubble = root.document.createElement('div');
      bubble.className = 'htech-chat__message htech-chat__message--' + who;
      bubble.textContent = text;
      messages.appendChild(bubble);
      messages.scrollTop = messages.scrollHeight;
    }

    function setOpen(open) {
      launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
      launcher.setAttribute('aria-label', open ? 'Close Htech assistant' : 'Open Htech assistant');
      launcher.querySelector('.htech-chat__launcher-label').textContent = open ? 'Close chat' : 'Ask Htech';
      panel.hidden = !open;
      if (open) input.focus();
      else launcher.focus();
    }

    function updateContactLinks() {
      var body = 'Hi Ademola, I have a website question.\n\n' + transcript.map(function (entry) {
        return (entry.who === 'user' ? 'Me: ' : 'Htech Assistant: ') + entry.text;
      }).join('\n\n');
      emailLink.href = 'mailto:htechdigitalconcept@gmail.com?subject=' + encodeURIComponent('Website question from Htech chat') + '&body=' + encodeURIComponent(body);
      whatsappLink.href = buildWhatsAppUrl(transcript);
    }

    function submitMessage(rawText) {
      var text = String(rawText || '').trim();
      if (!text) return;
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
