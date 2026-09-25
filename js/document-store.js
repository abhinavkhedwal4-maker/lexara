/**
 * @fileoverview Shared document state across Lexara pages
 * @description Holds the currently loaded document (from upload or paste)
 *              in memory so a user can, for example, upload a document on
 *              the Risk Scanner page and immediately ask questions about it
 *              on the Document Q&A page without re-uploading.
 *
 * Privacy note: this store is intentionally in-memory only (sessionStorage
 * as a soft fallback for page navigation within the same tab) — nothing
 * here is persisted to a server or Firestore unless the user explicitly
 * opts in via a "Save analysis" action on a specific page.
 *
 * @module document-store
 */

'use strict';

/** sessionStorage key for the active document (survives navigation, not tab close) */
const STORAGE_KEY = 'lexara_active_document';

/** Maximum characters retained — guards against sessionStorage quota issues */
const MAX_STORED_CHARS = 500_000;

/**
 * @typedef {Object} ActiveDocument
 * @property {string} fileName
 * @property {string} text
 * @property {number} pageCount
 * @property {number} sizeBytes
 * @property {number} loadedAt - Timestamp (ms)
 */

/**
 * Stores the currently active document for cross-page reuse within the
 * same browser tab session.
 * @param {{fileName: string, text: string, pageCount: number, sizeBytes: number}} doc
 */
export function setActiveDocument(doc) {
  const record = {
    fileName: doc.fileName,
    text: doc.text.slice(0, MAX_STORED_CHARS),
    pageCount: doc.pageCount,
    sizeBytes: doc.sizeBytes,
    loadedAt: Date.now(),
  };

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch (err) {
    // Quota exceeded or storage disabled — document still usable for the
    // current page via the in-memory reference held by the caller.
    console.error('[DocumentStore] Could not persist document for cross-page reuse:', err.message);
  }
}

/**
 * Retrieves the currently active document, if any.
 * @returns {ActiveDocument|null}
 */
export function getActiveDocument() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('[DocumentStore] Could not read stored document:', err.message);
    return null;
  }
}

/**
 * Clears the currently active document from memory and storage.
 * Called when the user explicitly removes an uploaded document.
 */
export function clearActiveDocument() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('[DocumentStore] Could not clear stored document:', err.message);
  }
}

/**
 * Returns true if a document is currently loaded.
 * Uses a lightweight sessionStorage key-existence check instead of
 * a full JSON.parse round-trip, keeping this hot-path O(1).
 * @returns {boolean}
 */
export function hasActiveDocument() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}