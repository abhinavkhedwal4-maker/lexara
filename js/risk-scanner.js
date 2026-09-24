/**
 * @fileoverview Risk Scanner page controller
 * @description Wires file upload / paste input to the PDF parser and the
 *              deterministic clause-detection engine, then renders a
 *              risk-score summary and a list of flagged clauses. Each
 *              clause can optionally be expanded with an AI-generated
 *              plain-language explanation grounded in its exact context.
 * @module risk-scanner
 */

'use strict';

import { renderNavbar, renderChatPanel, wireGlobalActions, sanitizeString } from './shared.js';
import { parseDocument, formatFileSize } from './pdf-parser.js';
import { setActiveDocument, getActiveDocument, clearActiveDocument } from './document-store.js';
import { scanDocument, computeDocumentRiskScore, summarizeByCategory } from './clause-patterns.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** SVG ring circumference for the risk score visual (r=60 → C ≈ 377) */
const RISK_RING_CIRCUMFERENCE = 377;

/** Risk score thresholds for the summary message */
const RISK_THRESHOLDS = Object.freeze({ low: 25, medium: 55 });

// ─── Init shared UI ────────────────────────────────────────────────────────────

renderNavbar('risk-scanner', true);
renderChatPanel('I can help explain any clause in your scanned document, or answer general questions about what a flagged term typically means.');
wireGlobalActions();

// ─── State ───────────────────────────────────────────────────────────────────

/** @type {import('./clause-patterns.js').FlaggedClause[]} */
let currentFlaggedClauses = [];

// ─── Restore a document already loaded on another page ───────────────────────

const existingDoc = getActiveDocument();
if (existingDoc) {
  showDocumentPreview(existingDoc.fileName, existingDoc.pageCount, existingDoc.sizeBytes);
  runScan(existingDoc.text);
}

// ─── Upload zone wiring ────────────────────────────────────────────────────────

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
  uploadZone?.addEventListener(evt, (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  uploadZone?.addEventListener(evt, (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
  });
});
uploadZone?.addEventListener('drop', (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFileSelected(file);
});

document.getElementById('pasteScanBtn')?.addEventListener('click', () => {
  const textarea = document.getElementById('pasteInput');
  const text = textarea?.value.trim();
  if (!text) return;

  setActiveDocument({ fileName: 'Pasted text', text, pageCount: 1, sizeBytes: text.length });
  showDocumentPreview('Pasted text', 1, text.length);
  runScan(text);
});

document.getElementById('removeDocBtn')?.addEventListener('click', () => {
  clearActiveDocument();
  currentFlaggedClauses = [];
  document.getElementById('documentPreviewSection')?.classList.add('hidden');
  document.getElementById('resultsSection')?.classList.add('hidden');
  document.getElementById('uploadSection')?.classList.remove('hidden');
});

// ─── File handling ────────────────────────────────────────────────────────────

/**
 * Handles a newly-selected file: parses it, stores it, and runs the scan.
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
    setActiveDocument(parsed);
    rebuildUploadSection();
    showDocumentPreview(parsed.fileName, parsed.pageCount, parsed.sizeBytes);
    runScan(parsed.text);
  } catch (err) {
    console.error('[RiskScanner] Parse failed:', err.message);
    rebuildUploadSection();
    showUploadError(err.message);
  }
}

/** Restores the original upload zone markup after a parse attempt. */
function rebuildUploadSection() {
  const uploadSection = document.getElementById('uploadSection');
  if (!uploadSection) return;
  uploadSection.innerHTML = `
    <div class="upload-zone" id="uploadZone" role="button" tabindex="0" aria-label="Upload a PDF or text file to scan">
      <div class="upload-zone-icon" aria-hidden="true">📄</div>
      <h3>Drag & drop your document here</h3>
      <p>or click to browse — PDF or .txt, up to 10 MB</p>
      <input type="file" id="fileInput" accept=".pdf,.txt,application/pdf,text/plain" aria-label="Choose a file"/>
    </div>
    <p class="privacy-note">🔒 <strong>Your document stays in your browser.</strong> Nothing is uploaded to a server during scanning.</p>`;

  const newZone = document.getElementById('uploadZone');
  const newInput = document.getElementById('fileInput');
  newZone?.addEventListener('click', () => newInput?.click());
  newInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
  });
}

/**
 * Shows an inline error message in the upload section.
 * @param {string} message
 */
function showUploadError(message) {
  const uploadSection = document.getElementById('uploadSection');
  const errorEl = document.createElement('p');
  errorEl.className = 'upload-error-msg';
  errorEl.setAttribute('role', 'alert');
  errorEl.textContent = message;
  uploadSection?.appendChild(errorEl);
}

/**
 * Shows the document preview bar and hides the upload zone.
 * @param {string} fileName
 * @param {number} pageCount
 * @param {number} sizeBytes
 */
function showDocumentPreview(fileName, pageCount, sizeBytes) {
  document.getElementById('uploadSection')?.classList.add('hidden');
  const previewSection = document.getElementById('documentPreviewSection');
  previewSection?.classList.remove('hidden');

  const nameEl = document.getElementById('previewFileName');
  const metaEl = document.getElementById('previewFileMeta');
  if (nameEl) nameEl.textContent = sanitizeString(fileName);
  if (metaEl) metaEl.textContent = `${pageCount} page${pageCount === 1 ? '' : 's'} · ${formatFileSize(sizeBytes)}`;
}

// ─── Scanning ─────────────────────────────────────────────────────────────────

/**
 * Runs the deterministic clause scan on the given text and renders results.
 * @param {string} text
 */
function runScan(text) {
  currentFlaggedClauses = scanDocument(text);
  const score = computeDocumentRiskScore(currentFlaggedClauses);
  const categorySummary = summarizeByCategory(currentFlaggedClauses);

  renderRiskScore(score);
  renderCategoryCounts(categorySummary);
  renderClauseList(currentFlaggedClauses);

  document.getElementById('resultsSection')?.classList.remove('hidden');
}

/**
 * Renders the animated risk score ring and summary text.
 * @param {number} score - 0-100
 */
function renderRiskScore(score) {
  const numEl = document.getElementById('riskScoreNum');
  const textEl = document.getElementById('riskSummaryText');
  const circle = document.getElementById('riskRingCircle');

  if (numEl) numEl.textContent = String(score);

  if (textEl) {
    if (score === 0) {
      textEl.textContent = 'No common risk patterns were detected in this document. This does not guarantee the document has no issues — a full legal review may still be worthwhile for important agreements.';
    } else if (score < RISK_THRESHOLDS.low) {
      textEl.textContent = `A few clauses worth a quick look were found. Most documents contain some of these — review the flagged items below.`;
    } else if (score < RISK_THRESHOLDS.medium) {
      textEl.textContent = `Several clauses were flagged that are worth understanding before you sign. Review each one below and consider discussing the higher-severity items with a lawyer.`;
    } else {
      textEl.textContent = `This document contains multiple higher-severity clause patterns. We'd recommend having a licensed attorney review this document before proceeding.`;
    }
  }

  if (circle) {
    const offset = RISK_RING_CIRCUMFERENCE - (RISK_RING_CIRCUMFERENCE * score) / 100;
    setTimeout(() => {
      circle.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)';
      circle.style.strokeDashoffset = String(offset);
      let strokeColor = 'var(--gold)';
      if (score >= RISK_THRESHOLDS.medium) strokeColor = 'var(--risk-high)';
      else if (score >= RISK_THRESHOLDS.low) strokeColor = 'var(--risk-medium)';
      circle.style.stroke = strokeColor;
    }, 150);
  }
}

/**
 * Renders the high/medium/low category count pills.
 * @param {Array<{severity: string, count: number}>} categorySummary
 */
function renderCategoryCounts(categorySummary) {
  const row = document.getElementById('categoryCountRow');
  if (!row) return;

  const counts = { high: 0, medium: 0, low: 0 };
  categorySummary.forEach((c) => { counts[c.severity] += c.count; });

  row.innerHTML = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => `
      <span class="category-count-chip risk-badge ${severity}">${count} ${severity}</span>`)
    .join('');
}

/**
 * Renders the full list of flagged clause cards.
 * @param {import('./clause-patterns.js').FlaggedClause[]} clauses
 */
function renderClauseList(clauses) {
  const list = document.getElementById('clauseList');
  if (!list) return;

  if (clauses.length === 0) {
    list.innerHTML = `
      <div class="no-clauses-found">
        <div class="icon" aria-hidden="true">✓</div>
        <p>No common risk patterns detected. Remember: this is a pattern-based triage tool, not a complete legal review.</p>
      </div>`;
    return;
  }

  list.innerHTML = clauses.map((clause, i) => `
    <div class="clause-card severity-${clause.severity}" role="listitem">
      <div class="clause-card-header">
        <span class="clause-card-title">${clause.label}</span>
        <span class="risk-badge ${clause.severity}">${clause.severity}</span>
      </div>
      <p class="clause-explanation">${clause.explanation}</p>
      <div class="clause-context">${highlightMatch(clause.context, clause.matchedText)}</div>
      <button class="clause-ai-explain-btn" data-clause-index="${i}" aria-expanded="false">
        🤖 Deep-dive: what does this mean for me?
      </button>
      <div class="clause-ai-explanation hidden" id="aiExplain-${i}" aria-live="polite"></div>
    </div>`).join('');

  list.querySelectorAll('.clause-ai-explain-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleExplainClick(btn));
  });
}

/**
 * Wraps the matched phrase in a highlight <mark> within its context string.
 * @param {string} context
 * @param {string} matchedText
 * @returns {string}
 */
function highlightMatch(context, matchedText) {
  const safeContext = sanitizeString(context, 1000);
  const safeMatch = sanitizeString(matchedText, 200);
  if (!safeMatch) return safeContext;
  const escaped = safeMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safeContext.replace(new RegExp(`(${escaped})`, 'i'), '<mark>$1</mark>');
}

/**
 * Fetches an AI-generated deeper explanation for a specific flagged clause.
 * @param {HTMLButtonElement} btn
 * @returns {Promise<void>}
 */
async function handleExplainClick(btn) {
  const index = parseInt(btn.dataset.clauseIndex, 10);
  const clause = currentFlaggedClauses[index];
  const explainEl = document.getElementById(`aiExplain-${index}`);
  if (!clause || !explainEl) return;

  const isOpen = !explainEl.classList.contains('hidden');
  if (isOpen) {
    explainEl.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
    return;
  }

  explainEl.classList.remove('hidden');
  btn.setAttribute('aria-expanded', 'true');
  explainEl.innerHTML = '<p class="thinking-msg">Thinking...</p>';

  // Include broader document context around this clause for better grounding
  const docText = (getActiveDocument()?.text || '');
  const windowSize = 1500;
  const clauseStart = Math.max(0, clause.position - windowSize);
  const clauseEnd = Math.min(docText.length, clause.position + windowSize);
  const surroundingContext = docText.slice(clauseStart, clauseEnd);

  const prompt = `You are analysing a specific clause found in a legal document. Provide a thorough plain-language analysis for a non-lawyer.

Clause category: ${clause.label} (severity: ${clause.severity})
Exact text flagged: "${clause.matchedText}"
Immediate context: "${clause.context}"
Broader document section:
"""
${surroundingContext}
"""

Provide your analysis in this exact structure:
**What this clause does:** (1-2 sentences explaining what the clause actually does in plain language)
**Why it matters:** (1-2 sentences on the practical risk or implication for the reader)
**What to watch for:** (2-3 bullet points of specific things to scrutinise — e.g., missing carve-outs, one-sided scope, absence of a dollar cap)
**Questions for your lawyer:** (2 specific questions to ask an attorney about this clause, referencing the actual text)

Do not tell the user what decision to make. Stay grounded in the document text provided.`;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are the Lexara Assistant. Deliver structured, deep-dive plain-language analysis of legal clauses. Always use the exact structured format requested. Never give advice on what to do.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { reply } = await res.json();
    // Render with basic markdown bold/bullets
    explainEl.innerHTML = reply
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  } catch (err) {
    console.error('[RiskScanner] AI explain error:', err.message);
    explainEl.innerHTML = '<p class="panel-error-msg">⚠️ Could not load explanation. Try the chat assistant instead.</p>';
  }
}