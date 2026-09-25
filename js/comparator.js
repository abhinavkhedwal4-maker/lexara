/**
 * @fileoverview Document Comparator page controller
 * @description Loads two document versions, runs the pure LCS-based diff
 *              engine (document-diff.js) to find paragraph-level changes,
 *              and renders each change with an optional AI explanation of
 *              its practical significance.
 * @module comparator
 */

'use strict';

import { renderNavbar, renderChatPanel, wireGlobalActions, sanitizeString } from './shared.js';
import { parseDocument, formatFileSize } from './pdf-parser.js';
import { diffDocuments, summarizeDiff, getSubstantiveChanges } from './document-diff.js';

// ─── Init shared UI ────────────────────────────────────────────────────────────

renderNavbar('comparator', true);
renderChatPanel('I can help explain why a specific change between your two documents might matter, or answer general questions about either version.');
wireGlobalActions();

// ─── State ───────────────────────────────────────────────────────────────────

/** @type {{fileName: string, text: string}|null} */
let documentA = null;

/** @type {{fileName: string, text: string}|null} */
let documentB = null;

/** @type {import('./document-diff.js').DiffChange[]} */
let currentChanges = [];

/**
 * AbortController for any in-flight AI change-explanation request.
 * Cancelled automatically when the same panel is toggled closed or a new
 * request supersedes it, preventing dangling fetch promises.
 * @type {AbortController|null}
 */
let explainAbortController = null;

// ─── Upload wiring for both slots ──────────────────────────────────────────────

wireUploadSlot('A');
wireUploadSlot('B');

/**
 * Wires an upload zone + file input for a given slot ('A' or 'B').
 * @param {'A'|'B'} slot
 */
function wireUploadSlot(slot) {
  const zone = document.getElementById(`uploadZone${slot}`);
  const input = document.getElementById(`fileInput${slot}`);

  zone?.addEventListener('click', () => input?.click());
  zone?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input?.click(); }
  });
  input?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(slot, file);
  });

  ['dragover', 'dragenter'].forEach((evt) => {
    zone?.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    zone?.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.remove('drag-over'); });
  });
  zone?.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileSelected(slot, file);
  });

  document.getElementById(`remove${slot}`)?.addEventListener('click', () => removeDocument(slot));
}

/**
 * Handles a file drop/selection for a given slot.
 * @param {'A'|'B'} slot
 * @param {File} file
 * @returns {Promise<void>}
 */
async function handleFileSelected(slot, file) {
  try {
    const parsed = await parseDocument(file);
    if (slot === 'A') documentA = parsed; else documentB = parsed;
    showSlotPreview(slot, parsed.fileName, parsed.pageCount, parsed.sizeBytes);
    updateCompareButtonState();
  } catch (err) {
    console.error(`[Comparator] Parse failed for slot ${slot}:`, err.message);
    showSlotError(slot, err.message);
  }
}

/**
 * Shows an inline parse error for a slot.
 * @param {'A'|'B'} slot
 * @param {string} message
 */
function showSlotError(slot, message) {
  const zone = document.getElementById(`uploadZone${slot}`);
  if (!zone) return;
  const existing = zone.parentElement?.querySelector('.upload-error-msg');
  if (existing) existing.remove();
  const errorEl = document.createElement('p');
  errorEl.className = 'upload-error-msg';
  errorEl.setAttribute('role', 'alert');
  errorEl.textContent = message;
  zone.after(errorEl);
}

/**
 * Shows the loaded-document preview for a slot and hides its upload zone.
 * @param {'A'|'B'} slot
 * @param {string} fileName
 * @param {number} pageCount
 * @param {number} sizeBytes
 */
function showSlotPreview(slot, fileName, pageCount, sizeBytes) {
  document.getElementById(`uploadZone${slot}`)?.classList.add('hidden');
  const preview = document.getElementById(`preview${slot}`);
  preview?.classList.remove('hidden');

  const nameEl = document.getElementById(`previewName${slot}`);
  const metaEl = document.getElementById(`previewMeta${slot}`);
  if (nameEl) nameEl.textContent = sanitizeString(fileName);
  if (metaEl) metaEl.textContent = `${pageCount} page${pageCount === 1 ? '' : 's'} · ${formatFileSize(sizeBytes)}`;
}

/**
 * Clears a loaded document from a slot and restores its upload zone.
 * @param {'A'|'B'} slot
 */
function removeDocument(slot) {
  if (slot === 'A') documentA = null; else documentB = null;
  document.getElementById(`preview${slot}`)?.classList.add('hidden');
  document.getElementById(`uploadZone${slot}`)?.classList.remove('hidden');
  document.getElementById('diffResultsSection')?.classList.add('hidden');
  updateCompareButtonState();
}

/** Enables the Compare button only when both documents are loaded. */
function updateCompareButtonState() {
  const btn = document.getElementById('compareBtn');
  if (btn) btn.disabled = !(documentA && documentB);
}

// ─── Compare action ────────────────────────────────────────────────────────────

document.getElementById('compareBtn')?.addEventListener('click', runComparison);

/** Runs the diff engine and renders the results. */
function runComparison() {
  if (!documentA || !documentB) return;

  currentChanges = diffDocuments(documentA.text, documentB.text);
  const summary = summarizeDiff(currentChanges);
  const substantive = getSubstantiveChanges(currentChanges);

  renderDiffSummary(summary, substantive.length);
  renderDiffChangeList(substantive);

  document.getElementById('diffResultsSection')?.classList.remove('hidden');
  document.getElementById('diffResultsSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Renders the summary stat row.
 * @param {{added: number, removed: number, modified: number}} summary
 * @param {number} totalChanges
 */
function renderDiffSummary(summary, totalChanges) {
  const textEl = document.getElementById('diffSummaryText');
  const addedEl = document.getElementById('addedCount');
  const removedEl = document.getElementById('removedCount');
  const modifiedEl = document.getElementById('modifiedCount');

  if (textEl) {
    textEl.textContent = totalChanges === 0
      ? 'No substantive paragraph-level differences were found between these two documents.'
      : `Found ${totalChanges} substantive change${totalChanges === 1 ? '' : 's'} between the two versions.`;
  }
  if (addedEl) addedEl.textContent = String(summary.added);
  if (removedEl) removedEl.textContent = String(summary.removed);
  if (modifiedEl) modifiedEl.textContent = String(summary.modified);
}

/**
 * Renders the full list of substantive changes.
 * @param {import('./document-diff.js').DiffChange[]} changes
 */
function renderDiffChangeList(changes) {
  const list = document.getElementById('diffChangeList');
  if (!list) return;

  if (changes.length === 0) {
    list.innerHTML = `<div class="no-clauses-found"><div class="icon" aria-hidden="true">✓</div><p>These documents appear substantively identical at the paragraph level.</p></div>`;
    return;
  }

  list.innerHTML = changes.map((change, i) => `
    <div class="diff-change-card ${change.type}" role="listitem">
      <span class="diff-change-type ${change.type}">${change.type}</span>
      <div class="diff-change-text">${renderChangeText(change)}</div>
      <button class="clause-ai-explain-btn" data-change-index="${i}" aria-expanded="false">🤖 Why might this matter?</button>
      <div class="diff-ai-note hidden" id="diffAiNote-${i}" aria-live="polite"></div>
    </div>`).join('');

  list.querySelectorAll('.clause-ai-explain-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleExplainChange(btn, changes));
  });
}

/**
 * Renders the display text for a single change entry.
 * @param {import('./document-diff.js').DiffChange} change
 * @returns {string}
 */
function renderChangeText(change) {
  if (change.type === 'added') return `<ins>${sanitizeString(change.newText, 600)}</ins>`;
  if (change.type === 'removed') return `<del>${sanitizeString(change.oldText, 600)}</del>`;
  return `<del>${sanitizeString(change.oldText, 400)}</del><br>${'\u2192'} <ins>${sanitizeString(change.newText, 400)}</ins>`;
}

/**
 * Fetches an AI explanation of why a specific change might matter.
 * Cancels any previously in-flight request before starting a new one.
 * @param {HTMLButtonElement} btn
 * @param {import('./document-diff.js').DiffChange[]} changes
 * @returns {Promise<void>}
 */
async function handleExplainChange(btn, changes) {
  const index = parseInt(btn.dataset.changeIndex, 10);
  const change = changes[index];
  const noteEl = document.getElementById(`diffAiNote-${index}`);
  if (!change || !noteEl) return;

  const isOpen = !noteEl.classList.contains('hidden');
  if (isOpen) {
    // Cancel any in-flight request before hiding the panel
    if (explainAbortController) {
      explainAbortController.abort();
      explainAbortController = null;
    }
    noteEl.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
    return;
  }

  // Cancel any previously in-flight explain request before starting a new one
  if (explainAbortController) {
    explainAbortController.abort();
  }
  explainAbortController = new AbortController();
  const { signal } = explainAbortController;

  noteEl.classList.remove('hidden');
  btn.setAttribute('aria-expanded', 'true');
  noteEl.textContent = 'Thinking...';

  // Build surrounding context from both documents
  const aExcerpt = documentA?.text?.slice(0, 2000) || '';
  const bExcerpt = documentB?.text?.slice(0, 2000) || '';

  const prompt = `You are reviewing a change between two versions of a legal document.

Change type: ${change.type.toUpperCase()}
${change.oldText ? `REMOVED / ORIGINAL text:\n"${change.oldText.slice(0, 600)}"` : ''}
${change.newText ? `\nADDED / NEW text:\n"${change.newText.slice(0, 600)}"` : ''}

Document A (original) opening:
"""${aExcerpt}"""

Document B (revised) opening:
"""${bExcerpt}"""

Analyse this change thoroughly and respond in this exact format:
**What changed:** (1-2 sentences explaining exactly what was added, removed, or modified in plain language)
**Practical significance:** (1-2 sentences on how this change shifts rights, obligations, risk, or protection for either party)
**Who benefits:** (one sentence — does this change favour one party over the other, or is it neutral?)
**Ask your lawyer:** (one specific question about this change to raise with an attorney)

Do not give a recommendation on what to do. Stay grounded in the text.`;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are the Lexara Assistant. Provide structured, thorough analysis of document changes in plain language. Always use the exact structured format. Never advise the user what to do.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { reply } = await res.json();
    noteEl.innerHTML = reply
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  } catch (err) {
    if (err.name === 'AbortError') return; // Request was intentionally cancelled
    console.error('[Comparator] AI explain error:', err.message);
    noteEl.textContent = '⚠️ Could not load explanation.';
  }
}