/**
 * @fileoverview Shared sub-page bootstrap
 * Initialises the scroll progress bar on all sub-pages.
 * Imported as a module so it runs after DOM is ready.
 */

import { renderNavbar, wireGlobalActions } from './shared.js';

/** Initialise scroll progress bar */
function initScrollProgress() {
  const bar = document.getElementById('scrollProgress');
  if (!bar) return;
  const update = () => {
    const st = window.scrollY || document.documentElement.scrollTop;
    const dh = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = dh > 0 ? Math.min((st / dh) * 100, 100) + '%' : '0%';
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

/** Navbar scroll opacity */
function initNavScroll() {
  const nav = document.querySelector('.navbar');
  if (!nav) return;
  const update = () => {
    nav.style.background = window.scrollY > 20
      ? 'rgba(8,8,12,0.92)'
      : 'rgba(8,8,12,0.72)';
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

document.addEventListener('DOMContentLoaded', () => {
  initScrollProgress();
  initNavScroll();
});

export { renderNavbar, wireGlobalActions };
