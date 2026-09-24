/**
 * @fileoverview Lexara AI Assistant
 * @description Groq-powered chat assistant for legal document questions.
 *              Structurally enforces "information and assistance, not
 *              legal advice" at the system-prompt level — the model is
 *              explicitly instructed to redirect advice-seeking questions
 *              ("what should I do") toward preparing the user for a
 *              conversation with a qualified lawyer, rather than answering
 *              them directly. This is a product-architecture decision, not
 *              just a disclaimer appended to output.
 * @module chatbot
 */

'use strict';

import { sanitizeString, sanitizePromptInjection, formatMessage } from './shared.js';
import { getActiveDocument } from './document-store.js';

const ENDPOINT       = '/api/chat';
const MAX_MSG_LENGTH = 1000;
const RATE_LIMIT     = 12;
const RATE_WINDOW_MS = 60_000;

/** Maximum characters of the active document included as grounding context per request */
const MAX_DOCUMENT_CONTEXT_CHARS = 10000;

const SYSTEM_PROMPT = `You are the Lexara Assistant — a GenAI legal information tool that helps people understand, analyse, and navigate legal documents in plain language.

WHAT YOU DO:
- Explain what clauses, sections, and defined terms mean in plain language.
- Identify obligations, rights, deadlines, and risks described in the document.
- Help users prepare informed questions to bring to a licensed attorney.
- Compare how specific language differs from what is common or standard (without stating enforceability).

CRITICAL BOUNDARIES — you provide information and assistance, never legal advice:
- Never tell the user what to do, whether to sign, what outcome to expect, or whether something is enforceable in their jurisdiction.
- If asked "what should I do", "should I sign this", or similar: (1) explain the relevant document language and considerations, then (2) say clearly that this is a decision for a licensed attorney, and offer 2-3 specific questions to raise with one.
- If asked about something not covered in the document, say so plainly. Do not fill gaps with assumptions or general legal knowledge.
- You may explain what a clause *typically* does in general contract practice only as background — always clarify this is general context, not a statement about this specific document's enforceability.

HOW TO ANSWER:
- Always ground answers in the document text when available. Quote or paraphrase the specific section.
- Use plain language. Explain any legal term you use.
- Structure: (1) direct answer, (2) relevant document text or paraphrase, (3) any important caveats, (4) a suggested next step or lawyer question.
- Keep responses focused: 2-4 paragraphs. No padding.
- End every substantive answer with one concrete next step the user can take.`;

/** @type {Array<{role:string, content:string}>} */
let conversationHistory = [];

/** @type {Array<number>} */
const messageTimes = [];

/** @type {boolean} */
let isProcessing = false;

/**
 * Checks the client-side rate limit.
 * @returns {boolean}
 */
function checkClientRateLimit() {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  while (messageTimes.length > 0 && messageTimes[0] < cutoff) messageTimes.shift();
  if (messageTimes.length >= RATE_LIMIT) return false;
  messageTimes.push(now);
  return true;
}

/**
 * Validates a message before sending.
 * @param {string} message
 * @returns {{valid:boolean, error?:string}}
 */
function validateMessage(message) {
  if (!message || typeof message !== 'string') return { valid: false, error: 'Please enter a message.' };
  if (message.trim().length === 0) return { valid: false, error: 'Message cannot be empty.' };
  if (message.length > MAX_MSG_LENGTH) return { valid: false, error: `Maximum ${MAX_MSG_LENGTH} characters.` };
  return { valid: true };
}

/**
 * Builds the grounding context block from the active document, if any.
 * Truncates to keep token usage bounded and predictable.
 * @returns {string}
 */
function buildDocumentContext() {
  const doc = getActiveDocument();
  if (!doc || !doc.text) return '';

  const excerpt = doc.text.slice(0, MAX_DOCUMENT_CONTEXT_CHARS);
  const truncatedNote = doc.text.length > MAX_DOCUMENT_CONTEXT_CHARS
    ? `\n\n[Document is ${doc.text.length.toLocaleString()} characters — only the first ${MAX_DOCUMENT_CONTEXT_CHARS.toLocaleString()} shown. Ask about a specific section if you need content from later in the document.]`
    : '';

  const meta = [
    doc.pageCount ? `${doc.pageCount} page${doc.pageCount === 1 ? '' : 's'}` : null,
    doc.sizeBytes ? `${Math.round(doc.sizeBytes / 1024)} KB` : null,
  ].filter(Boolean).join(', ');

  return `\n\nThe user has loaded a document titled "${doc.fileName}"${meta ? ` (${meta})` : ''}. Ground your answers in this text. Cite the relevant section or quote when answering.\n\nDOCUMENT TEXT:\n"""\n${excerpt}${truncatedNote}\n"""`;
}

/**
 * Appends a chat bubble to the messages container.
 * @param {'user'|'ai'} role
 * @param {string} text
 */
function appendMessage(role, text) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  bubble.setAttribute('role', 'article');
  bubble.setAttribute('aria-label', `${role === 'ai' ? 'Lexara Assistant' : 'You'}: ${text.slice(0, 50)}`);

  const avatar = document.createElement('div');
  avatar.className = 'bubble-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = role === 'ai' ? '\u2696\uFE0F' : 'YOU';

  const content = document.createElement('div');
  content.className = 'bubble-content';
  if (role === 'user') {
    const p = document.createElement('p');
    p.textContent = text;
    content.appendChild(p);
  } else {
    content.innerHTML = formatMessage(text);
  }

  bubble.appendChild(avatar);
  bubble.appendChild(content);
  container.appendChild(bubble);
  requestAnimationFrame(() => bubble.scrollIntoView({ behavior: 'smooth', block: 'end' }));
}

/**
 * Shows a typing indicator bubble.
 * @returns {string|null}
 */
function showTyping() {
  const container = document.getElementById('chatMessages');
  if (!container) return null;

  const id = `typing-${Date.now()}`;
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble ai';
  bubble.id = id;
  bubble.setAttribute('role', 'status');
  bubble.setAttribute('aria-label', 'Lexara Assistant is thinking...');
  bubble.innerHTML = `
    <div class="bubble-avatar" aria-hidden="true">\u2696\uFE0F</div>
    <div class="bubble-content bubble-content--typing">
      <div class="typing-indicator" aria-hidden="true">
        <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
      </div>
    </div>`;
  container.appendChild(bubble);
  requestAnimationFrame(() => bubble.scrollIntoView({ behavior: 'smooth', block: 'end' }));
  return id;
}

/**
 * Removes a typing indicator bubble.
 * @param {string|null} id
 */
function removeTyping(id) {
  if (id) document.getElementById(id)?.remove();
}

/**
 * Sets the send button's disabled/busy state.
 * @param {boolean} disabled
 */
function setSendButtonState(disabled) {
  const btn = document.getElementById('sendBtn');
  if (!btn) return;
  btn.disabled = disabled;
  btn.setAttribute('aria-busy', String(disabled));
  btn.setAttribute('aria-label', disabled ? 'Sending...' : 'Send message');
}

/**
 * Announces a message to screen readers via a live region.
 * @param {string} message
 */
function announceToScreenReader(message) {
  let el = document.getElementById('sr-announcer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sr-announcer';
    el.setAttribute('aria-live', 'assertive');
    el.setAttribute('aria-atomic', 'true');
    el.className = 'sr-only';
    document.body.appendChild(el);
  }
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = message; });
}

/**
 * Sends the current chat input to the Lexara Assistant and renders the
 * response, grounded in the active document if one is loaded.
 * @returns {Promise<void>}
 */
async function sendMessage() {
  if (isProcessing) return;

  const input = document.getElementById('chatInput');
  if (!input) return;

  const rawText = input.value;
  const validation = validateMessage(rawText);
  if (!validation.valid) { announceToScreenReader(validation.error); return; }

  if (!checkClientRateLimit()) {
    appendMessage('ai', "You're sending messages too quickly. Please wait a moment before trying again.");
    return;
  }

  const message = sanitizeString(sanitizePromptInjection(rawText), MAX_MSG_LENGTH);
  isProcessing = true;

  appendMessage('user', rawText.trim());
  input.value = '';
  window.autoResize?.(input);
  setSendButtonState(true);

  conversationHistory.push({ role: 'user', content: message });
  const typingId = showTyping();

  try {
    const documentContext = buildDocumentContext();
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}${documentContext}` },
          ...conversationHistory,
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${response.status}`);
    }

    const data = await response.json();
    const reply = data.reply;
    if (!reply || typeof reply !== 'string') throw new Error('Empty response from the assistant.');

    conversationHistory.push({ role: 'assistant', content: reply });
    removeTyping(typingId);
    appendMessage('ai', reply);
    announceToScreenReader('Lexara Assistant responded.');
  } catch (error) {
    removeTyping(typingId);
    appendMessage('ai', `${error.message} Make sure the server is running and try again.`);
    conversationHistory.pop();
    console.error('[Lexara Assistant Error]', error);
  } finally {
    isProcessing = false;
    setSendButtonState(false);
    input.focus();
  }
}

window.sendMessage = sendMessage;

window.clearChat = function clearChat() {
  conversationHistory = [];
  const container = document.getElementById('chatMessages');
  if (!container) return;
  container.innerHTML = `
    <div class="chat-bubble ai" role="article">
      <div class="bubble-avatar" aria-hidden="true">\u2696\uFE0F</div>
      <div class="bubble-content"><p>Chat cleared. How can I help with your document?</p></div>
    </div>`;
  announceToScreenReader('Chat cleared.');
};