/**
 * @fileoverview Pure, deterministic line/paragraph diff engine
 * @description Implements a simple LCS (Longest Common Subsequence) based
 *              diff over paragraphs, used to compare two document versions
 *              before any AI involvement. This keeps "what changed" as a
 *              deterministic fact, with the AI only explaining *why a
 *              change might matter* — mirroring how clause-patterns.js
 *              keeps risk detection out of the LLM's hands.
 * @module document-diff
 */

'use strict';

/** Minimum paragraph length considered for diffing (filters blank lines/noise) */
const MIN_PARAGRAPH_LENGTH = 15;
/** Maximum LCS cells before switching to the bounded linear comparison path. */
const MAX_LCS_CELLS = 1_000_000;

/**
 * @typedef {Object} DiffChange
 * @property {'added'|'removed'|'modified'|'unchanged'} type
 * @property {string} [oldText]
 * @property {string} [newText]
 */

/**
 * Splits document text into paragraphs for comparison.
 * @param {string} text
 * @returns {string[]}
 */
function splitIntoParagraphs(text) {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length >= MIN_PARAGRAPH_LENGTH);
}

/**
 * Computes the Longest Common Subsequence table between two arrays.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number[][]}
 */
function computeLcsTable(a, b) {
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      table[i][j] = a[i - 1] === b[j - 1]
        ? table[i - 1][j - 1] + 1
        : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  return table;
}

/**
 * Backtracks through an LCS table to produce a sequence of diff operations.
 * @param {number[][]} table
 * @param {string[]} a
 * @param {string[]} b
 * @returns {DiffChange[]}
 */
function backtrackDiff(table, a, b) {
  const changes = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      changes.unshift({ type: 'unchanged', oldText: a[i - 1], newText: b[j - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
      changes.unshift({ type: 'added', newText: b[j - 1] });
      j--;
    } else if (i > 0) {
      changes.unshift({ type: 'removed', oldText: a[i - 1] });
      i--;
    }
  }

  return changes;
}

/**
 * Merges an adjacent removed+added pair that are similar enough to be
 * treated as a single "modified" paragraph rather than two separate
 * changes — makes the output far more readable for near-identical edits.
 * @param {DiffChange[]} changes
 * @returns {DiffChange[]}
 */
function mergeModifications(changes) {
  const merged = [];
  for (let i = 0; i < changes.length; i++) {
    const current = changes[i];
    const next = changes[i + 1];

    if (current.type === 'removed' && next?.type === 'added' && areSimilar(current.oldText, next.newText)) {
      merged.push({ type: 'modified', oldText: current.oldText, newText: next.newText });
      i++; // skip the consumed 'added' entry
    } else {
      merged.push(current);
    }

  }
  return merged;
}

/**
 * Compares paragraphs by position when an exact LCS would exceed the memory
 * budget. This keeps large-document comparisons responsive and still exposes
 * every changed paragraph as added, removed, or modified.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {DiffChange[]}
 */
function compareByPosition(a, b) {
  const fallbackChanges = [];
  const sharedLength = Math.min(a.length, b.length);

  for (let index = 0; index < sharedLength; index++) {
    if (a[index] === b[index]) {
      fallbackChanges.push({ type: 'unchanged', oldText: a[index], newText: b[index] });
    } else {
      fallbackChanges.push({ type: 'modified', oldText: a[index], newText: b[index] });
    }
  }
  for (let index = sharedLength; index < a.length; index++) {
    fallbackChanges.push({ type: 'removed', oldText: a[index] });
  }
  for (let index = sharedLength; index < b.length; index++) {
    fallbackChanges.push({ type: 'added', newText: b[index] });
  }
  return fallbackChanges;
}

/**
 * Rough similarity check — two paragraphs are "similar" if they share a
 * meaningful fraction of the same words, used only to decide whether a
 * consecutive removed+added pair should display as one modification.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function areSimilar(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 && intersection / union > 0.35;
}

/**
 * Compares two document texts paragraph-by-paragraph and returns a list
 * of changes (added, removed, modified, unchanged). Pure function.
 *
 * @param {string} originalText
 * @param {string} revisedText
 * @returns {DiffChange[]}
 */
export function diffDocuments(originalText, revisedText) {
  const paragraphsA = splitIntoParagraphs(originalText);
  const paragraphsB = splitIntoParagraphs(revisedText);

  if (paragraphsA.length * paragraphsB.length > MAX_LCS_CELLS) {
    return compareByPosition(paragraphsA, paragraphsB);
  }

  const lcsTable = computeLcsTable(paragraphsA, paragraphsB);
  const rawChanges = backtrackDiff(lcsTable, paragraphsA, paragraphsB);
  return mergeModifications(rawChanges);
}

/**
 * Summarises a diff result into added/removed/modified counts.
 * @param {DiffChange[]} changes
 * @returns {{added: number, removed: number, modified: number, unchanged: number}}
 */
export function summarizeDiff(changes) {
  return changes.reduce(
    (acc, change) => {
      acc[change.type] = (acc[change.type] || 0) + 1;
      return acc;
    },
    { added: 0, removed: 0, modified: 0, unchanged: 0 },
  );
}

/**
 * Returns only the substantive changes (excludes unchanged paragraphs).
 * @param {DiffChange[]} changes
 * @returns {DiffChange[]}
 */
export function getSubstantiveChanges(changes) {
  return changes.filter((c) => c.type !== 'unchanged');
}