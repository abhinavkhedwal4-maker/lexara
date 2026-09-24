/**
 * @fileoverview Firebase configuration and service exports for Lexara
 * @description Initialises Firebase app, Firestore, Auth, and Google
 *              provider. Client config is safe to commit — it is a public
 *              identifier, not a secret; access is enforced by Firebase
 *              Security Rules server-side.
 *
 * Privacy design: Firestore is used ONLY for a user's explicitly-saved
 * analysis history (opt-in). Uploaded document text is never written to
 * Firestore automatically — see document-store.js for the session-only
 * default behaviour.
 *
 * @see https://firebase.google.com/docs/projects/api-keys
 * @module firebase
 */

'use strict';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore }  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

/**
 * Firebase client-side configuration. Replace with your own project's
 * config from the Firebase console before deploying.
 * @type {import('firebase/app').FirebaseOptions}
 */
const FIREBASE_CONFIG = Object.freeze({
  apiKey           : 'AIzaSyB2AnfWR9b8hSgTgcyW9sCQqTi-YDD5dVI',
  authDomain       : 'lexara-fc30c.firebaseapp.com',
  projectId        : 'lexara-fc30c',
  storageBucket    : 'lexara-fc30c.firebasestorage.app',
  messagingSenderId: '265384629331',
  appId            : '1:265384629331:web:1196cbd8948aeda2f3a2a6',
  measurementId    : 'G-CMN3PJ1H8H',
});

// Wrap initialization so a Firebase SDK failure (e.g. network block, bad
// config) cannot throw at module-evaluation time and kill the entire import
// graph — which would silently prevent renderChatPanel() from ever running.
let app, db, auth, provider;
try {
  app      = initializeApp(FIREBASE_CONFIG);
  db       = getFirestore(app);
  auth     = getAuth(app);
  provider = new GoogleAuthProvider();
} catch (err) {
  console.error('[Firebase] Initialization failed — auth and Firestore will be unavailable:', err.message);
  // Leave app/db/auth/provider as undefined; callers check before using them
}

export { db, auth, provider };
