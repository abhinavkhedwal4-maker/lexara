/**
 * @fileoverview Centralized error logging helper for Lexara
 * @description Ensures every module logs errors in an identical,
 *              greppable format: [ModuleName] Action failed: message
 * @module errors
 */

'use strict';

/**
 * Logs an error with a consistent, module-tagged format.
 * @param {string} moduleName - Source module, e.g. 'Risk Scanner'
 * @param {string} action     - What was being attempted
 * @param {Error}  err        - The caught error
 */
export function logError(moduleName, action, err) {
  console.error(`[${moduleName}] ${action} failed:`, err.message);
}