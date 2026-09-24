/**
 * @fileoverview Google Authentication module for Lexara
 * @description Wraps Firebase Auth — sign-in, sign-out, and state listener.
 *              Sign-in is entirely optional: every analysis feature works
 *              fully anonymously. Authentication only gates the opt-in
 *              "Save analysis to my account" feature.
 * @module auth
 */

'use strict';

import { auth, provider } from './firebase.js';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

/**
 * Registers authentication state callbacks and begins listening for changes.
 * @param {function(import('firebase/auth').User): void} onLogin  - Called with the User when signed in
 * @param {function(): void}                             onLogout - Called when signed out
 * @returns {function(): void} Unsubscribe function — call to stop listening
 */
export function initAuth(onLogin, onLogout) {
  if (!auth) {
    // Firebase unavailable — call onLogout immediately so the UI shows Sign In
    onLogout();
    return () => {};   // no-op unsubscribe
  }
  return onAuthStateChanged(auth, (user) => {
    if (user) onLogin(user);
    else onLogout();
  });
}

/**
 * Opens a Google sign-in popup and returns the authenticated user.
 * @returns {Promise<import('firebase/auth').User>}
 * @throws {Error} Re-throws Firebase auth errors for the caller to handle
 */
export async function loginWithGoogle() {
  if (!auth || !provider) {
    throw new Error('Firebase Auth is not available. Check your connection and refresh.');
  }
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err) {
    console.error('[Auth] Sign-in failed:', err.code, err.message);
    throw err;
  }
}

/**
 * Signs the current user out.
 * @returns {Promise<void>}
 * @throws {Error} Re-throws Firebase auth errors for the caller to handle
 */
export async function logout() {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (err) {
    console.error('[Auth] Sign-out failed:', err.code, err.message);
    throw err;
  }
}

/**
 * Returns the currently authenticated user, or null if signed out.
 * @returns {import('firebase/auth').User|null}
 */
export function getCurrentUser() {
  return auth.currentUser;
}