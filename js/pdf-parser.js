/**
 * @fileoverview Client-side PDF text extraction
 * @description Uses a locally-served copy of PDF.js (lib/pdf.min.mjs +
 *              lib/pdf.worker.min.mjs) to extract plain text from uploaded
 *              PDF files entirely in the browser. Both files are served from
 *              the same origin, so no CDN tracking-prevention block can occur.
 *
 * Privacy note: parsing happens client-side. The extracted text is only sent
 * to the AI backend when the user explicitly triggers an analysis action —
 * never automatically.
 *
 * @module pdf-parser
 */

'use strict';

/** Maximum accepted file size in bytes (10 MB) */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Maximum number of PDF pages parsed — guards against pathological files */
const MAX_PDF_PAGES = 200;

/**
 * Path to the local PDF.js ESM bundle, relative to the site root.
 * Served by the same origin (localhost:3000 or Vercel), so tracking
 * prevention never applies.
 */
const PDFJS_URL        = '/lib/pdf.min.mjs';
const PDFJS_WORKER_URL = '/lib/pdf.worker.min.mjs';

/** MIME types accepted by the upload zone */
export const ACCEPTED_MIME_TYPES = Object.freeze([
  'application/pdf',
  'text/plain',
]);

/**
 * @typedef {Object} ParsedDocument
 * @property {string} fileName
 * @property {string} text        - Extracted plain text
 * @property {number} pageCount   - Number of pages (1 for .txt files)
 * @property {number} sizeBytes
 */

/**
 * Validates a File object before attempting to parse it.
 * @param {File} file
 * @returns {{valid: boolean, error?: string}}
 */
export function validateFile(file) {
  if (!file) return { valid: false, error: 'No file selected.' };
  if (!ACCEPTED_MIME_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith('.txt')) {
    return { valid: false, error: 'Only PDF and .txt files are supported.' };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: 'File is too large. Maximum size is 10 MB.' };
  }
  if (file.size === 0) {
    return { valid: false, error: 'File appears to be empty.' };
  }
  return { valid: true };
}

/**
 * Parses an uploaded file into plain text. Never uploads the file anywhere.
 *
 * @param {File} file
 * @returns {Promise<ParsedDocument>}
 * @throws {Error} If the file fails validation or cannot be parsed
 */
export async function parseDocument(file) {
  const validation = validateFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  const { text, pageCount } = isPdf
    ? await parsePdfFile(file)
    : await parseTextFile(file);

  if (!text.trim()) {
    throw new Error('No readable text could be extracted from this file. It may be a scanned image without a text layer.');
  }

  return {
    fileName: file.name,
    text: text.trim(),
    pageCount,
    sizeBytes: file.size,
  };
}

/**
 * Extracts text from a PDF file using the locally-hosted PDF.js ESM build.
 * Dynamic import avoids any CDN dependency — both files are served from the
 * same origin so tracking prevention cannot block them.
 * @param {File} file
 * @returns {Promise<{text: string, pageCount: number}>}
 */
async function parsePdfFile(file) {
  let pdfjsLib;
  try {
    pdfjsLib = await import(PDFJS_URL);
  } catch (err) {
    console.error('[pdf-parser] Failed to load PDF.js:', err);
    throw new Error('PDF engine failed to load. Please refresh the page and try again.');
  }

  // Point PDF.js at the locally-hosted worker — same origin, no tracking block
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;

  let pdf;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    pdf = await loadingTask.promise;
  } catch (err) {
    console.error('[pdf-parser] PDF load failed:', err);
    throw new Error('Could not read this PDF. It may be encrypted or corrupted.');
  }

  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const pageTexts = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page    = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(' ');
    pageTexts.push(pageText);
  }

  return { text: pageTexts.join('\n\n'), pageCount: pdf.numPages };
}

/**
 * Reads a plain text file directly.
 * @param {File} file
 * @returns {Promise<{text: string, pageCount: number}>}
 */
function parseTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve({ text: String(reader.result), pageCount: 1 });
    reader.onerror = () => reject(new Error('Could not read the text file.'));
    reader.readAsText(file);
  });
}

/**
 * Formats a byte count into a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
