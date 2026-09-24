/**
 * @fileoverview Lexara shared frontend utilities
 * @description Common functions used across the Simplifier, Risk Scanner,
 *              Comparator, Document Q&A, Next-Steps and Glossary modules.
 *              Centralising these avoids duplication and keeps behaviour
 *              consistent app-wide.
 * @module shared
 */

'use strict';

/** Maximum characters retained when sanitising free-text input */
const DEFAULT_MAX_LENGTH = 2000;

/**
 * Sanitises a string to prevent XSS injection when rendered as HTML.
 * @param {string} str          - Raw input string
 * @param {number} [maxLength]  - Maximum allowed length after sanitising
 * @returns {string} Sanitised string, safe for innerHTML insertion
 */
export function sanitizeString(str, maxLength = DEFAULT_MAX_LENGTH) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .slice(0, maxLength);
}

/**
 * Detects and neutralises common prompt-injection patterns in user input
 * before it reaches the AI system prompt. Applied before sanitizeString so
 * pattern matching runs against the original text.
 * @param {string} text - Raw user message
 * @returns {string} Text with injection patterns replaced by [filtered]
 */
export function sanitizePromptInjection(text) {
  if (typeof text !== 'string') return '';
  const patterns = [
    /ignore (all |previous |prior )?instructions/gi,
    /disregard (all |previous |your )?(prompts|instructions)/gi,
    /new instructions\s*:/gi,
    /system\s*:/gi,
    /you are now/gi,
    /\[INST\]|<\|im_start\|>/gi,
  ];
  return patterns.reduce((acc, pattern) => acc.replace(pattern, '[filtered]'), text);
}

/**
 * Formats AI-generated message text with lightweight markdown rendering
 * (bold, italic, inline code, paragraphs, lists). All rendered content
 * passes through sanitizeString first to prevent injected HTML.
 * @param {string} text - Raw message text
 * @returns {string} HTML-formatted, sanitised string
 */
export function formatMessage(text) {
  if (typeof text !== 'string') return '';
  const safe = sanitizeString(text, 6000);
  return safe
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, (_, code) =>
      `<code style="background:rgba(201,169,97,0.15);padding:0.1em 0.4em;border-radius:3px;font-family:monospace;">${code}</code>`)
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

/**
 * Debounces a function, delaying invocation until `delay` ms of inactivity.
 * @template {(...args: any[]) => void} F
 * @param {F} fn      - Function to debounce
 * @param {number} [delay] - Delay in milliseconds
 * @returns {F}
 */
export function debounce(fn, delay = 300) {
  let timeoutId;
  return function debounced(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Wraps a function so it only ever runs once per animation frame — used to
 * throttle scroll/resize handlers without dropping the final call.
 * @template {(...args: any[]) => void} F
 * @param {F} fn - Function to throttle
 * @returns {F}
 */
export function throttleRaf(fn) {
  let frameId = null;
  return function throttled(...args) {
    if (frameId) return;
    frameId = requestAnimationFrame(() => {
      fn(...args);
      frameId = null;
    });
  };
}

/**
 * Clamps a numeric value between a minimum and maximum.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Toggles the AI assistant panel open/closed and manages ARIA state.
 * Shared across every page that includes the chat panel markup.
 * @returns {boolean} True if the panel is now open
 */
export function toggleChat() {
  const panel = document.getElementById('chatPanel');
  const overlay = document.getElementById('chatOverlay');
  const btn = document.getElementById('chatToggleBtn');
  if (!panel) return false;

  const isOpen = panel.classList.toggle('active');
  overlay?.classList.toggle('active', isOpen);
  overlay?.setAttribute('aria-hidden', String(!isOpen));
  btn?.setAttribute('aria-expanded', String(isOpen));
  document.body.style.overflow = isOpen ? 'hidden' : '';

  if (isOpen) {
    const input = panel.querySelector('#chatInput');
    if (input) setTimeout(() => input.focus(), 50);
  }
  return isOpen;
}

/**
 * Renders the shared navigation bar into the page.
 * Eliminates duplicated markup across all 7 pages.
 * @param {string} activePage - Current page id, e.g. 'simplifier', 'home'
 * @param {boolean} isSubPage - True if page lives under /pages/ (needs ../ prefix)
 */
export function renderNavbar(activePage, isSubPage) {
  const root = isSubPage ? '../' : '';
  const pagesRoot = isSubPage ? '' : 'pages/';

  const links = [
    { id: 'home', label: 'Home', href: `${root}index.html` },
    { id: 'simplifier', label: 'Simplifier', href: `${pagesRoot}simplifier.html` },
    { id: 'risk-scanner', label: 'Risk Scanner', href: `${pagesRoot}risk-scanner.html` },
    { id: 'comparator', label: 'Comparator', href: `${pagesRoot}comparator.html` },
    { id: 'document-qa', label: 'Ask My Document', href: `${pagesRoot}document-qa.html` },
    { id: 'next-steps', label: 'Next Steps', href: `${pagesRoot}next-steps.html` },
    { id: 'glossary', label: 'Glossary', href: `${pagesRoot}glossary.html` },
  ];

  const navHTML = `
    <a class="nav-logo" href="${root}index.html" aria-label="Lexara home">
      <span class="logo-icon" aria-hidden="true">\u2696\uFE0F</span>
      <span class="logo-text">Lex<span class="accent-letter">a</span>ra</span>
    </a>
    <ul class="nav-links" role="menubar">
      ${links.map((l) => `
        <li role="none"><a href="${l.href}" class="${l.id === activePage ? 'active' : ''}" ${l.id === activePage ? 'aria-current="page"' : ''} role="menuitem">${l.label}</a></li>
      `).join('')}
    </ul>
    <div class="nav-right">
      <button class="chat-toggle-btn" data-action="toggle-chat" aria-label="Open AI assistant" aria-expanded="false" id="chatToggleBtn">
        \u2696\uFE0F Ask Lexara
      </button>
      <button class="login-btn" id="loginBtn" aria-label="Sign in with Google">Sign In</button>
      <div class="user-info hidden" id="userInfo">
        <img src="" alt="Profile picture" class="user-avatar" id="userAvatar"/>
        <span id="userName"></span>
        <button data-action="logout" aria-label="Sign out">Sign Out</button>
      </div>
    </div>`;

  const nav = document.querySelector('.navbar');
  if (nav) nav.innerHTML = navHTML;
}

/**
 * Renders the shared AI chat panel into the page.
 * Eliminates duplicated markup across all 7 pages.
 * @param {string} greeting - Page-specific opening message from the assistant
 */
export function renderChatPanel(greeting) {
  const panel = document.getElementById('chatPanel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="chat-header">
      <div class="chat-header-info">
        <div class="chat-avatar" aria-hidden="true">\u2696\uFE0F</div>
        <div>
          <div class="chat-name">Lexara Assistant</div>
          <div class="chat-status"><span class="status-dot" aria-hidden="true"></span> Powered by Groq</div>
        </div>
      </div>
      <button class="chat-close" data-action="close-chat" aria-label="Close chat">\u2715</button>
    </div>
    <div class="chat-messages" id="chatMessages" role="log" aria-live="polite">
      <div class="chat-bubble ai">
        <div class="bubble-avatar" aria-hidden="true">\u2696\uFE0F</div>
        <div class="bubble-content"><p>${greeting}</p></div>
      </div>
    </div>
    <div class="chat-input-area">
      <div class="chat-input-wrapper">
        <label for="chatInput" class="sr-only">Type your message</label>
        <textarea id="chatInput" placeholder="Ask Lexara about your document..." rows="1" aria-label="Chat message"></textarea>
        <button class="send-btn" data-action="send-message" id="sendBtn" aria-label="Send message">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <div class="chat-footer-note">Powered by Groq \u00B7 Not a substitute for professional legal advice</div>
    </div>`;
}

/**
 * Wires all data-action buttons using event delegation — replaces inline
 * onclick="" handlers across the app with proper addEventListener usage,
 * which also allows a strict Content-Security-Policy with no
 * 'unsafe-inline' script directive.
 */
export function wireGlobalActions() {
  // Wire Sign In button (rendered by renderNavbar — no data-action, uses id)
  document.addEventListener('click', (e) => {
    if (e.target.closest('#loginBtn')) {
      window.handleLogin?.();
      return;
    }

    const target = e.target.closest('[data-action]');
    if (!target) return;

    const actions = {
      'toggle-chat': () => toggleChat(),
      'close-chat':  () => toggleChat(),
      'send-message': () => window.sendMessage?.(),
      logout: () => window.handleLogout?.(),
    };

    actions[target.dataset.action]?.();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'chatInput' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      window.sendMessage?.();
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'chatInput') {
      window.autoResize?.(e.target);
    }
  });
}

/**
 * Auto-resizes a textarea to fit its content, up to a max height.
 * @param {HTMLTextAreaElement} el
 */
export function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
}
if (typeof window !== 'undefined') window.autoResize = autoResize;

// ──────────────────────────────────────────────────────────────────────────────
// AUTH BOOTSTRAP
// Imported lazily so pages without Firebase never block on network requests.
// Sets window.handleLogin / window.handleLogout consumed by wireGlobalActions.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Updates the navbar Sign In / user-info UI to reflect auth state.
 * @param {import('firebase/auth').User|null} user
 */
function updateNavAuthUI(user) {
  const loginBtn = document.getElementById('loginBtn');
  const userInfo = document.getElementById('userInfo');
  const userAvatar = document.getElementById('userAvatar');
  const userName = document.getElementById('userName');

  if (user) {
    loginBtn?.classList.add('hidden');
    if (userInfo) userInfo.classList.remove('hidden');
    if (userAvatar) {
      userAvatar.src = user.photoURL || '';
      userAvatar.alt = `${user.displayName || 'User'} profile picture`;
    }
    if (userName) userName.textContent = user.displayName?.split(' ')[0] || 'User';
  } else {
    loginBtn?.classList.remove('hidden');
    userInfo?.classList.add('hidden');
  }
}

/**
 * Bootstraps Firebase Auth on every page. Lazy-imports auth.js so the
 * Firebase SDK is only loaded when this module runs (it's always loaded).
 */
async function bootAuth() {
  try {
    const { initAuth, loginWithGoogle, logout } = await import('./auth.js');

    initAuth(
      (user) => updateNavAuthUI(user),
      ()     => updateNavAuthUI(null),
    );

    window.handleLogin = async () => {
      try {
        await loginWithGoogle();
        // updateNavAuthUI is called via onAuthStateChanged listener above
      } catch (err) {
        if (err.code !== 'auth/popup-closed-by-user') {
          console.error('[Auth] Login error:', err.message);
        }
      }
    };

    window.handleLogout = async () => {
      try {
        await logout();
      } catch (err) {
        console.error('[Auth] Logout error:', err.message);
      }
    };
  } catch (err) {
    // Firebase unavailable (e.g. offline, blocked) — auth is optional
    console.warn('[Auth] Firebase unavailable — sign-in disabled:', err.message);
  }
}

// Kick off auth on every page automatically when shared.js is imported
bootAuth();