const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const assistant = require('../assets/js/chat-assistant.js');
const feed = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/data/chat-assistant-feed.json'), 'utf8'));

assert.equal(assistant.matchAnswer('How much does a WooCommerce store cost?', feed).id, 'pricing');
assert.equal(assistant.matchAnswer('Can you improve my existing website?', feed).id, 'existing-site');
assert.equal(assistant.classifyContext('I want to sell my products online'), 'online-store');
assert.equal(assistant.classifyContext('I run a consulting business and need more bookings'), 'service-business');
assert.equal(assistant.classifyContext('My current site is slow'), 'existing-site');
const personalized = assistant.buildReply('I want a website', 'I want to sell products with an online store', feed);
assert.match(personalized, /online store/i);
assert.match(personalized, /checkout, shipping/i);
assert.match(assistant.buildReply('Is Htech open on Sunday?', '', feed), /could not find a reliable answer/i);
assert.ok(feed.answers.length >= 8);
assert.ok(feed.answers.every((item) => item.id && item.keywords?.length && item.answer));
console.log('Chat assistant feed matching and personalization tests passed.');
