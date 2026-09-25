/**
 * @fileoverview Lawyer Prep Sheet page controller
 * @description The platform's signature "advice-safe" feature: rather than
 *              telling the user what to do, this generates a structured
 *              checklist and a list of specific questions to bring to a
 *              licensed attorney, combining the deterministic risk-scan
 *              results with an AI-generated synthesis. Review priority is
 *              computed from the same clause-patterns.js risk score used
 *              on the Risk Scanner page, kept consistent across the app.
 * @module next-steps
 */

'use strict';

import { renderNavbar, renderChatPanel, wireGlobalActions, sanitizeString, triggerFileDownload } from './shared.js';
import { parseDocument, formatFileSize } from './pdf-parser.js';
import { setActiveDocument, getActiveDocument, clearActiveDocument } from './document-store.js';
import { scanDocument, computeDocumentRiskScore, summarizeByCategory } from './clause-patterns.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum characters of document text sent to the AI for prep generation */
const MAX_PREP_CONTEXT_CHARS = 10000;

/** Risk score thresholds mapping to review priority levels */
const PRIORITY_THRESHOLDS = Object.freeze({ low: 25, medium: 55 });

/** Standard checklist items always included, regardless of document content */
const BASELINE_CHECKLIST = Object.freeze([
  'Bring a copy of the document (printed or on a device) to your meeting',
  'Note the date you need to respond or sign by, if any',
  'Write down anything you don\u2019t understand, even if it seems minor',
  'Bring any related correspondence or prior agreements referenced in the document',
]);

// ─── Init shared UI ────────────────────────────────────────────────────────────

renderNavbar('next-steps', true);
renderChatPanel('I can help explain any part of your prep sheet, or draft additional questions you might want to ask.');
wireGlobalActions();

// ─── State ───────────────────────────────────────────────────────────────────

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
  document.getElementById('prepSheetSection')?.classList.add('hidden');
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
    console.error('[NextSteps] Parse failed:', err.message);
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
    <div class="upload-zone" id="uploadZone" role="button" tabindex="0" aria-label="Upload a PDF or text file">
      <div class="upload-zone-icon" aria-hidden="true">📋</div>
      <h3>Drag & drop your document here</h3>
      <p>or click to browse — PDF or .txt, up to 10 MB</p>
      <input type="file" id="fileInput" accept=".pdf,.txt,application/pdf,text/plain" aria-label="Choose a file"/>
    </div>
    <p class="privacy-note">🔒 <strong>Your document stays in your browser.</strong></p>`;
  wireUploadZone();
}

/**
 * Shows the document preview and reveals the Generate button.
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

// ─── Prep sheet generation ─────────────────────────────────────────────────────

document.getElementById('generatePrepBtn')?.addEventListener('click', generatePrepSheet);

/**
 * Generates the full prep sheet: computes review priority from the
 * deterministic clause scan, renders the checklist, and fetches an
 * AI-generated list of specific attorney questions grounded in the
 * document's actual flagged clauses.
 * @returns {Promise<void>}
 */
async function generatePrepSheet() {
  if (!loadedDocumentText) return;

  const btn = document.getElementById('generatePrepBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }

  const flaggedClauses = scanDocument(loadedDocumentText);
  const riskScore = computeDocumentRiskScore(flaggedClauses);
  const categorySummary = summarizeByCategory(flaggedClauses);

  renderPriorityBadge(riskScore);
  renderChecklist(categorySummary, flaggedClauses);

  document.getElementById('prepSheetSection')?.classList.remove('hidden');
  document.getElementById('prepSheetSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  await renderAiQuestions(categorySummary, flaggedClauses);

  if (btn) { btn.disabled = false; btn.textContent = '📋 Generate My Prep Sheet'; }
}

/**
 * Renders the review-priority badge and intro sentence based on risk score.
 * @param {number} riskScore
 */
function renderPriorityBadge(riskScore) {
  const badge = document.getElementById('priorityBadge');
  const intro = document.getElementById('prepIntroText');

  let priority = 'low';
  let label = 'Standard Review';
  let message = 'This document doesn\u2019t show many common risk patterns, but any agreement worth signing is worth a quick review.';

  if (riskScore >= PRIORITY_THRESHOLDS.medium) {
    priority = 'high';
    label = 'Priority Review Recommended';
    message = 'This document contains several clauses worth discussing with an attorney before you sign or agree to it.';
  } else if (riskScore >= PRIORITY_THRESHOLDS.low) {
    priority = 'medium';
    label = 'Worth a Closer Look';
    message = 'A few notable clauses were found. A focused conversation with a lawyer about these specific points could be valuable.';
  }

  if (badge) {
    badge.className = `review-priority-badge ${priority}`;
    badge.textContent = label;
  }
  if (intro) intro.textContent = message;
}

/**
 * Renders the baseline checklist plus any clause-specific prep items.
 * @param {Array<{label: string, severity: string, count: number}>} categorySummary
 */
function renderChecklist(categorySummary, flaggedClauses) {
  const list = document.getElementById('prepChecklist');
  if (!list) return;

  // Build specific checklist items from the actual flagged clauses
  const clauseItems = categorySummary.map((c) => {
    const instances = flaggedClauses.filter((f) => f.categoryId === c.categoryId);
    const firstMatch = instances[0]?.matchedText ? ` — found: "${instances[0].matchedText.slice(0, 60)}"` : '';
    const countNote = c.count > 1 ? ` (${c.count} instances)` : '';
    return `Review the ${c.severity}-severity "${c.label}" clause${countNote}${firstMatch}`;
  });

  // Add high-severity specific actions
  const highSeverity = categorySummary.filter((c) => c.severity === 'high');
  const highPriorityItems = highSeverity.map((c) =>
    `Specifically ask your lawyer to explain the ${c.label} obligations and whether the scope is typical`);

  const allItems = [...BASELINE_CHECKLIST, ...clauseItems, ...highPriorityItems];

  list.innerHTML = allItems.map((item, i) => `
    <li class="prep-checklist-item" role="listitem">
      <input type="checkbox" id="check-${i}" aria-label="${sanitizeString(item)}"/>
      <span>${sanitizeString(item)}</span>
    </li>`).join('');

  list.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', (e) => {
      e.target.closest('.prep-checklist-item')?.classList.toggle('checked', e.target.checked);
    });
  });
}

/**
 * Fetches AI-generated, document-specific questions to ask an attorney,
 * grounded in the flagged clause categories.
 * @param {Array<{label: string, severity: string}>} categorySummary
 * @returns {Promise<void>}
 */
async function renderAiQuestions(categorySummary, flaggedClauses) {
  const container = document.getElementById('prepQuestions');
  if (!container) return;

  container.innerHTML = '<p class="thinking-msg">Generating tailored questions from your document...</p>';

  const excerpt = loadedDocumentText.slice(0, MAX_PREP_CONTEXT_CHARS);
  const flaggedSummary = categorySummary.length > 0
    ? categorySummary.map((c) => {
        const matches = flaggedClauses.filter((f) => f.categoryId === c.categoryId);
        const examples = matches.slice(0, 2).map((m) => `"${m.matchedText.slice(0, 80)}"`).join(', ');
        return `${c.label} (${c.severity} severity${examples ? `, e.g. ${examples}` : ''})`;
      }).join('\n- ')
    : 'none detected by automated scanning';

  const prompt = `A user is preparing to meet with an attorney about this legal document. Automated clause scanning found these issues:
- ${flaggedSummary}

Full document text:
"""
${excerpt}
"""

Generate exactly 8 specific, numbered questions this person should ask their lawyer. Requirements:
1. Each question must reference specific language, clauses, or sections actually found in the document above.
2. Questions should address: (a) clarifying ambiguous obligations, (b) understanding the risks of flagged clauses, (c) negotiation opportunities, and (d) anything unusual compared to standard practice.
3. Do NOT answer the questions — only list them.
4. Prioritise the highest-severity flagged clauses first.
5. Write each question as if speaking to the attorney directly (e.g., "The contract says X — does this mean I am personally liable if...?").`;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are the Lexara Assistant. Generate specific, document-grounded attorney consultation questions. Every question must reference actual text from the document. Never answer the questions yourself.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { reply } = await res.json();
    if (!reply) throw new Error('Empty response');

    const questions = reply.split(/\n(?=\d+[.)]\s)/).filter((q) => q.trim());
    container.innerHTML = questions.map((q, i) => `
      <div class="prep-question-card" role="listitem">
        <span class="prep-question-num">${i + 1}.</span>
        <span>${sanitizeString(q.replace(/^\d+[.)]\s*/, '').trim())}</span>
      </div>`).join('');
  } catch (err) {
    console.error('[NextSteps] AI questions error:', err.message);
    container.innerHTML = '<p class="panel-error-msg">⚠️ Could not generate tailored questions. Try the chat assistant for help drafting questions.</p>';
  }
}

// ─── Print / export ────────────────────────────────────────────────────────────

document.getElementById('printPrepBtn')?.addEventListener('click', () => window.print());

/**
 * Exports the generated prep sheet as a date-stamped Markdown file.
 * Uses triggerFileDownload which releases the Blob URL immediately after
 * download to avoid memory leaks on repeated exports.
 */
document.getElementById('exportMdBtn')?.addEventListener('click', () => {
  const fileName = document.getElementById('previewFileName')?.textContent || 'document';
  const priorityBadge = document.getElementById('priorityBadge')?.textContent || '';
  const introText = document.getElementById('prepIntroText')?.textContent || '';

  // Collect checklist items
  const checklistItems = [...document.querySelectorAll('.prep-checklist-item span')]
    .map((el) => `- [ ] ${el.textContent.trim()}`)
    .join('\n');

  // Collect AI questions
  const questionItems = [...document.querySelectorAll('.prep-question-card span:last-child')]
    .map((el, i) => `${i + 1}. ${el.textContent.trim()}`)
    .join('\n');

  const dateStr = new Date().toISOString().split('T')[0];
  const markdown = [
    `# ⚖️ Lexara — Lawyer Prep Sheet`,
    `**Document**: ${fileName}`,
    `**Generated**: ${new Date().toLocaleString()}`,
    `**Review Priority**: ${priorityBadge}`,
    '',
    `> ${introText}`,
    '',
    '---',
    '',
    '## ✅ Pre-Meeting Checklist',
    '',
    checklistItems || '*(No checklist items generated)*',
    '',
    '---',
    '',
    '## 💬 Questions to Ask Your Attorney',
    '',
    questionItems || '*(No questions generated — generate a prep sheet first)*',
    '',
    '---',
    '',
    '*Lexara provides information and assistance, not legal advice.*',
    '*Consult a licensed attorney for decisions affecting your legal rights.*',
  ].join('\n');

  triggerFileDownload(markdown, `lexara-prep-sheet-${dateStr}.md`, 'text/markdown');
});