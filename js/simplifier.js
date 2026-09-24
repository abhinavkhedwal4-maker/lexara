/**
 * @fileoverview Document Simplifier page controller
 * @description Loads a document (upload or paste), then sends it to the AI
 *              for a plain-language rewrite at a user-selected reading
 *              level, rendered side-by-side with the original text.
 * @module simplifier
 */

'use strict';

import { renderNavbar, renderChatPanel, wireGlobalActions, sanitizeString } from './shared.js';
import { parseDocument, formatFileSize } from './pdf-parser.js';
import { setActiveDocument, getActiveDocument, clearActiveDocument } from './document-store.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum characters of document text sent per simplify request */
const MAX_SIMPLIFY_CHARS = 12000;

/** Reading-level prompt instructions keyed by level id */
const READING_LEVEL_INSTRUCTIONS = Object.freeze({
  plain: 'Rewrite in clear, plain English suitable for an average adult reader with no legal background. Use everyday words but keep necessary precision. Where the original uses legal jargon, include the original term in parentheses the first time it appears.',
  simple: 'Rewrite using very simple words and short sentences, suitable for someone with limited English proficiency or a lower reading level. Avoid all jargon. Break long sentences into two. Use bullet points where possible.',
  detailed: 'Rewrite in plain language keeping full nuance and detail — suitable for someone who wants a thorough understanding, not just the gist. Preserve section structure, note any important cross-references between sections, and flag any terms that may have special defined meanings.',
});

// ─── Init shared UI ────────────────────────────────────────────────────────────

renderNavbar('simplifier', true);
renderChatPanel('I can help clarify anything in the simplified version, or explain a specific part of the original document in more detail.');
wireGlobalActions();

// ─── State ───────────────────────────────────────────────────────────────────

/** @type {string} */
let currentReadingLevel = 'plain';

/** @type {string} */
let loadedDocumentText = '';

// ─── Restore existing document ────────────────────────────────────────────────

const existingDoc = getActiveDocument();
if (existingDoc) {
  loadedDocumentText = existingDoc.text;
  showDocumentPreview(existingDoc.fileName, existingDoc.pageCount, existingDoc.sizeBytes);
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
});

document.getElementById('removeDocBtn')?.addEventListener('click', () => {
  clearActiveDocument();
  loadedDocumentText = '';
  document.getElementById('documentPreviewSection')?.classList.add('hidden');
  document.getElementById('resultsSection')?.classList.add('hidden');
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
  } catch (err) {
    console.error('[Simplifier] Parse failed:', err.message);
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
    <div class="upload-zone" id="uploadZone" role="button" tabindex="0" aria-label="Upload a PDF or text file to simplify">
      <div class="upload-zone-icon" aria-hidden="true">📖</div>
      <h3>Drag & drop your document here</h3>
      <p>or click to browse — PDF or .txt, up to 10 MB</p>
      <input type="file" id="fileInput" accept=".pdf,.txt,application/pdf,text/plain" aria-label="Choose a file"/>
    </div>
    <p class="privacy-note">🔒 <strong>Your document stays in your browser.</strong> It's only sent to the AI when you click Simplify.</p>`;
  wireUploadZone();
}

/**
 * Shows the document preview and reveals the reading-level controls.
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

// ─── Reading level selector ────────────────────────────────────────────────────

document.querySelectorAll('.reading-level-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.reading-level-btn').forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-checked', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-checked', 'true');
    currentReadingLevel = btn.dataset.level;
  });
});

// ─── Simplify action ───────────────────────────────────────────────────────────

document.getElementById('simplifyBtn')?.addEventListener('click', runSimplify);

/**
 * Sends the loaded document to the AI for a plain-language rewrite at the
 * selected reading level, then renders the original and simplified text
 * side by side.
 * @returns {Promise<void>}
 */
async function runSimplify() {
  if (!loadedDocumentText) return;

  const btn = document.getElementById('simplifyBtn');
  const originalPanel = document.getElementById('originalTextPanel');
  const simplifiedPanel = document.getElementById('simplifiedTextPanel');
  const resultsSection = document.getElementById('resultsSection');

  if (btn) { btn.disabled = true; btn.textContent = 'Simplifying...'; }
  if (originalPanel) originalPanel.textContent = loadedDocumentText.slice(0, MAX_SIMPLIFY_CHARS);
  if (simplifiedPanel) simplifiedPanel.innerHTML = '<p class="panel-loading-msg">Generating plain-language version...</p>';
  resultsSection?.classList.remove('hidden');
  resultsSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const excerpt = loadedDocumentText.slice(0, MAX_SIMPLIFY_CHARS);
  const truncatedNote = loadedDocumentText.length > MAX_SIMPLIFY_CHARS
    ? '\n\n[Document truncated — ask the assistant about sections not shown here.]'
    : '';

  const instruction = READING_LEVEL_INSTRUCTIONS[currentReadingLevel] ?? READING_LEVEL_INSTRUCTIONS.plain;
  const prompt = `${instruction}

Rewrite the following legal document text. Preserve section headings and paragraph structure where possible. Do not add advice, opinions, or interpretations beyond what the text says.

After the rewrite, add a section titled "KEY POINTS" that lists in plain language:
- The main obligations each party must fulfil
- Any important deadlines, dates, or notice periods mentioned
- Any defined terms that carry special meaning in the contract

Document:
"""
${excerpt}
"""${truncatedNote}`;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: `You are the Lexara Assistant. Your job is to rewrite legal document text in plain language at the requested reading level.
Rules:
- Preserve all section headings and paragraph order exactly.
- Never omit, skip, or summarise away any obligation, right, or condition — plain-language rewrites must be complete.
- After the plain-language rewrite, add a "KEY POINTS" section that extracts: main obligations per party, important deadlines/notice periods, and defined terms with their plain-language meaning.
- Never add legal advice or tell the user what to do.`,
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { reply } = await res.json();
    if (!reply) throw new Error('Empty response');

    if (simplifiedPanel) {
      // Split on KEY POINTS section to style it separately
      const keyPointsMatch = reply.match(/KEY POINTS\s*\n([\s\S]*)/i);
      const mainText = keyPointsMatch ? reply.slice(0, reply.search(/KEY POINTS/i)) : reply;
      const keyPoints = keyPointsMatch ? keyPointsMatch[1] : null;

      const mainHtml = mainText
        .split(/\n\n+/)
        .filter((p) => p.trim())
        .map((para) => {
          const trimmed = para.trim();
          // Detect headings (all-caps line or ends with colon and is short)
          if (/^[A-Z][A-Z\s\d.:-]{4,50}$/.test(trimmed) || (/^[A-Z]/.test(trimmed) && trimmed.endsWith(':') && trimmed.length < 80)) {
            return `<h4 class="simplifier-section-heading">${sanitizeString(trimmed)}</h4>`;
          }
          return `<p>${sanitizeString(trimmed)}</p>`;
        })
        .join('');

      let keyPointsHtml = '';
      if (keyPoints) {
        const items = keyPoints.trim().split('\n').filter((l) => l.trim());
        const rendered = items.map((line) => {
          const clean = line.replace(/^[-•*]\s*/, '').trim();
          return clean ? `<li>${sanitizeString(clean)}</li>` : '';
        }).join('');
        keyPointsHtml = `
          <div class="simplifier-key-points">
            <h4 class="simplifier-key-points-title">📌 Key Points</h4>
            <ul>${rendered}</ul>
          </div>`;
      }

      simplifiedPanel.innerHTML = mainHtml + keyPointsHtml;
    }
  } catch (err) {
    console.error('[Simplifier] Simplify error:', err.message);
    if (simplifiedPanel) {
      simplifiedPanel.innerHTML = '<p class="panel-error-msg">⚠️ Could not generate a simplified version. Please try again.</p>';
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨ Simplify'; }
  }
}