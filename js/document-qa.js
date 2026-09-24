/**
 * @fileoverview Document Q&A page controller
 * @description A grounded chat interface answering questions strictly from
 *              the loaded document's text. Unlike the general assistant
 *              panel, this conversation is document-first: the system
 *              prompt instructs the model to answer only from the provided
 *              text and to say plainly when something isn't covered.
 * @module document-qa
 */

'use strict';

import { renderNavbar, renderChatPanel, wireGlobalActions, sanitizeString, sanitizePromptInjection, formatMessage } from './shared.js';
import { parseDocument, formatFileSize } from './pdf-parser.js';
import { setActiveDocument, getActiveDocument, clearActiveDocument } from './document-store.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum characters of document text included as grounding context */
const MAX_CONTEXT_CHARS = 10000;

/** Maximum question length */
const MAX_QUESTION_LENGTH = 600;

const QA_SYSTEM_PROMPT = `You are the Lexara Assistant, answering questions about a specific legal document the user has uploaded.

RULES:
- Answer ONLY based on the document text provided. Do not use outside legal knowledge to fill gaps.
- If the answer is not in the document, say so plainly: "I don't see that addressed in this document." Never guess or infer beyond the text.
- When you answer, cite the specific section, clause, or quoted phrase your answer comes from.
- Structure your answers: first give the direct answer in 1-2 sentences, then provide the relevant document excerpt or paraphrase, then (if applicable) note any caveats or related clauses.
- If a question involves a definition (e.g., "what does X mean?"), look for how the document defines it — not the general legal meaning.
- Never tell the user what decision to make. If asked "should I sign" or "is this fair", explain what the document says and redirect to specific questions to ask a licensed attorney.
- Keep answers focused and complete. Do not pad.`;

/**
 * Extracts the most relevant portion of a document for a given question.
 * Uses a keyword-based approach to find sections most likely to contain
 * the answer, rather than always taking the first N characters.
 * @param {string} docText
 * @param {string} question
 * @returns {string}
 */
function extractRelevantContext(docText, question) {
  if (!docText) return '';

  // Extract significant words from the question (skip common stop words)
  const stopWords = new Set(['what', 'who', 'when', 'where', 'how', 'does', 'do', 'is', 'are', 'the', 'a', 'an', 'in', 'of', 'to', 'for', 'this', 'that', 'my', 'i', 'me', 'it', 'and', 'or', 'can', 'will', 'be', 'has', 'have']);
  const keywords = question.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));

  if (keywords.length === 0) return docText.slice(0, MAX_CONTEXT_CHARS);

  // Split document into paragraphs and score each by keyword density
  const paragraphs = docText.split(/\n{2,}/).filter((p) => p.trim().length > 30);
  const scored = paragraphs.map((para, idx) => {
    const lower = para.toLowerCase();
    const score = keywords.reduce((s, kw) => s + (lower.includes(kw) ? 2 : 0), 0)
      // Slight boost to paragraphs near other high-scoring paragraphs
      + (idx > 0 ? 0.5 : 0);
    return { para, score, idx };
  });

  // Always include the first paragraph (preamble/parties) and sort rest by score
  const firstPara = paragraphs[0] || '';
  const rest = scored.slice(1).sort((a, b) => b.score - a.score);

  // Build context from highest-scoring paragraphs up to MAX_CONTEXT_CHARS
  let context = firstPara + '\n\n';
  for (const item of rest) {
    if (context.length + item.para.length + 2 > MAX_CONTEXT_CHARS) break;
    context += item.para + '\n\n';
  }

  const truncated = context.length >= MAX_CONTEXT_CHARS;
  return context.trim() + (truncated ? '\n\n[Additional sections omitted — ask about a specific section for more detail.]' : '');
}

// ─── Init shared UI ────────────────────────────────────────────────────────────

renderNavbar('document-qa', true);
renderChatPanel('This page has a dedicated Q&A chat below that\u2019s grounded in your uploaded document. I\u2019m here for general legal-term questions too.');
wireGlobalActions();

// ─── State ───────────────────────────────────────────────────────────────────

/** @type {string} */
let loadedDocumentText = '';

/** @type {Array<{role: string, content: string}>} */
let qaHistory = [];

/** @type {boolean} */
let isAsking = false;

// ─── Restore existing document ────────────────────────────────────────────────

const existingDoc = getActiveDocument();
if (existingDoc) {
  loadedDocumentText = existingDoc.text;
  showDocumentPreview(existingDoc.fileName, existingDoc.pageCount, existingDoc.sizeBytes);
  revealQaSection();
}

// ─── Upload wiring ─────────────────────────────────────────────────────────────

wireUploadZone();

function wireUploadZone() {
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');

  uploadZone?.addEventListener('click', () => fileInput?.click());
  uploadZone?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput?.click(); }
  });
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
  });

  ['dragover', 'dragenter'].forEach((evt) => {
    uploadZone?.addEventListener(evt, (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    uploadZone?.addEventListener(evt, (e) => { e.preventDefault(); uploadZone.classList.remove('drag-over'); });
  });
  uploadZone?.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileSelected(file);
  });
}

document.getElementById('pasteLoadBtn')?.addEventListener('click', () => {
  const textarea = document.getElementById('pasteInput');
  const text = textarea?.value.trim();
  if (!text) return;

  loadedDocumentText = text;
  setActiveDocument({ fileName: 'Pasted text', text, pageCount: 1, sizeBytes: text.length });
  showDocumentPreview('Pasted text', 1, text.length);
  revealQaSection();
});

document.getElementById('removeDocBtn')?.addEventListener('click', () => {
  clearActiveDocument();
  loadedDocumentText = '';
  qaHistory = [];
  document.getElementById('documentPreviewSection')?.classList.add('hidden');
  document.getElementById('qaSection')?.classList.add('hidden');
  document.getElementById('uploadSection')?.classList.remove('hidden');
});

/**
 * Handles a newly-selected file: parses and stores it.
 * @param {File} file
 * @returns {Promise<void>}
 */
async function handleFileSelected(file) {
  const uploadSection = document.getElementById('uploadSection');
  if (uploadSection) {
    uploadSection.innerHTML = `
      <div class="parsing-state">
        <div class="loading-spinner" role="status" aria-label="Parsing document"></div>
        <p class="parsing-state__label">Reading ${sanitizeString(file.name)}...</p>
      </div>`;
  }

  try {
    const parsed = await parseDocument(file);
    loadedDocumentText = parsed.text;
    setActiveDocument(parsed);
    rebuildUploadSection();
    showDocumentPreview(parsed.fileName, parsed.pageCount, parsed.sizeBytes);
    revealQaSection();
  } catch (err) {
    console.error('[DocumentQA] Parse failed:', err.message);
    rebuildUploadSection();
    const errorEl = document.createElement('p');
    errorEl.className = 'upload-error-msg';
    errorEl.setAttribute('role', 'alert');
    errorEl.textContent = err.message;
    document.getElementById('uploadSection')?.appendChild(errorEl);
  }
}

/** Restores the upload zone markup and re-wires it after a parse attempt. */
function rebuildUploadSection() {
  const uploadSection = document.getElementById('uploadSection');
  if (!uploadSection) return;
  uploadSection.innerHTML = `
    <div class="upload-zone" id="uploadZone" role="button" tabindex="0" aria-label="Upload a PDF or text file to ask about">
      <div class="upload-zone-icon" aria-hidden="true">💬</div>
      <h3>Drag & drop your document here</h3>
      <p>or click to browse — PDF or .txt, up to 10 MB</p>
      <input type="file" id="fileInput" accept=".pdf,.txt,application/pdf,text/plain" aria-label="Choose a file"/>
    </div>
    <p class="privacy-note">🔒 <strong>Your document stays in your browser.</strong> Only the parts relevant to your question are sent to the AI.</p>`;
  wireUploadZone();
}

/**
 * Shows the document preview bar.
 * @param {string} fileName
 * @param {number} pageCount
 * @param {number} sizeBytes
 */
function showDocumentPreview(fileName, pageCount, sizeBytes) {
  document.getElementById('uploadSection')?.classList.add('hidden');
  document.getElementById('documentPreviewSection')?.classList.remove('hidden');

  const nameEl = document.getElementById('previewFileName');
  const metaEl = document.getElementById('previewFileMeta');
  if (nameEl) nameEl.textContent = sanitizeString(fileName);
  if (metaEl) metaEl.textContent = `${pageCount} page${pageCount === 1 ? '' : 's'} · ${formatFileSize(sizeBytes)}`;
}

/** Reveals the Q&A conversation section. */
function revealQaSection() {
  document.getElementById('qaSection')?.classList.remove('hidden');
}

// ─── Suggested questions ──────────────────────────────────────────────────────

document.querySelectorAll('.suggested-question-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const question = btn.dataset.question;
    const input = document.getElementById('qaInput');
    if (input) input.value = question;
    askQuestion(question);
  });
});

// ─── Ask flow ─────────────────────────────────────────────────────────────────

document.getElementById('qaSendBtn')?.addEventListener('click', () => {
  const input = document.getElementById('qaInput');
  const question = input?.value.trim();
  if (question) askQuestion(question);
});

document.getElementById('qaInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const question = e.target.value.trim();
    if (question) askQuestion(question);
  }
});

/**
 * Sends a question to the AI, grounded in the loaded document text, and
 * renders the exchange in the conversation panel.
 * @param {string} question
 * @returns {Promise<void>}
 */
async function askQuestion(question) {
  if (isAsking || !loadedDocumentText) return;
  if (question.length > MAX_QUESTION_LENGTH) return;

  isAsking = true;
  const messagesEl = document.getElementById('qaMessages');
  const input = document.getElementById('qaInput');
  const sendBtn = document.getElementById('qaSendBtn');

  document.querySelector('.qa-empty-state')?.remove();
  appendQaBubble('user', question);
  if (input) input.value = '';
  if (sendBtn) sendBtn.disabled = true;

  const typingId = `qa-typing-${Date.now()}`;
  const typingBubble = document.createElement('div');
  typingBubble.className = 'qa-message-bubble ai';
  typingBubble.id = typingId;
  typingBubble.innerHTML = `
    <div class="qa-message-avatar" aria-hidden="true">⚖️</div>
    <div class="qa-message-content thinking-state">Reading your document...</div>`;
  messagesEl?.appendChild(typingBubble);
  typingBubble.scrollIntoView({ behavior: 'smooth', block: 'end' });

  const safeQuestion = sanitizeString(sanitizePromptInjection(question), MAX_QUESTION_LENGTH);
  qaHistory.push({ role: 'user', content: safeQuestion });

  // Use keyword-aware extraction to find the most relevant document sections
  const relevantContext = extractRelevantContext(loadedDocumentText, question);
  const documentContext = `\n\nDocument text (most relevant sections for this question):\n"""\n${relevantContext}\n"""`;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: `${QA_SYSTEM_PROMPT}${documentContext}` },
          ...qaHistory,
        ],
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { reply } = await res.json();
    if (!reply) throw new Error('Empty response');

    qaHistory.push({ role: 'assistant', content: reply });
    document.getElementById(typingId)?.remove();
    appendQaBubble('ai', reply);
  } catch (err) {
    console.error('[DocumentQA] Ask error:', err.message);
    document.getElementById(typingId)?.remove();
    appendQaBubble('ai', 'Sorry, I could not process that question. Please try again.');
    qaHistory.pop();
  } finally {
    isAsking = false;
    if (sendBtn) sendBtn.disabled = false;
  }
}

/**
 * Appends a Q&A conversation bubble.
 * @param {'user'|'ai'} role
 * @param {string} text
 */
function appendQaBubble(role, text) {
  const messagesEl = document.getElementById('qaMessages');
  if (!messagesEl) return;

  const bubble = document.createElement('div');
  bubble.className = `qa-message-bubble ${role}`;
  bubble.setAttribute('role', 'article');
  bubble.innerHTML = `
    <div class="qa-message-avatar" aria-hidden="true">${role === 'ai' ? '⚖️' : 'YOU'}</div>
    <div class="qa-message-content">${role === 'ai' ? formatMessage(text) : `<p>${sanitizeString(text)}</p>`}</div>`;
  messagesEl.appendChild(bubble);
  bubble.scrollIntoView({ behavior: 'smooth', block: 'end' });
}