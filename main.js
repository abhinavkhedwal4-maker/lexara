/**
 * @fileoverview Lexara homepage entry-point
 * Handles navbar rendering, card 3D tilt, staggered card entrance,
 * ambient parallax on hero orbs, scroll progress bar, and animated counters.
 */

import { renderNavbar, renderChatPanel, wireGlobalActions } from './js/shared.js';
import './js/chatbot.js';

// ---- Init ----
renderNavbar('home', false);
renderChatPanel('Hi! I\'m the Lexara Assistant. You can ask me about any legal term, clause type, or concept — or upload a document on one of the tool pages for a full deep-dive analysis.');
wireGlobalActions();

// ---- Staggered card entrance via IntersectionObserver ----
function animateCards() {
  const cards = document.querySelectorAll('.feature-card');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.animation =
            `cardEntrance 0.55s cubic-bezier(0.2,0.8,0.2,1) ${entry.target.dataset.delay || '0s'} both`;
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  cards.forEach((card, i) => {
    card.dataset.delay = `${i * 0.08}s`;
    card.style.opacity = '0';
    observer.observe(card);
  });
}

// ---- 3D Card Tilt ----
function initCardTilt() {
  const cards = document.querySelectorAll('.feature-card, .stat-card');
  cards.forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const cx   = rect.left + rect.width / 2;
      const cy   = rect.top  + rect.height / 2;
      const dx   = (e.clientX - cx) / (rect.width  / 2);  // -1 → 1
      const dy   = (e.clientY - cy) / (rect.height / 2);  // -1 → 1
      const tiltX = dy * -8;
      const tiltY = dx *  8;
      card.style.transform = `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateZ(4px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) translateZ(0)';
      card.style.transition = 'transform 0.5s cubic-bezier(0.2,0.8,0.2,1)';
    });
    card.addEventListener('mouseenter', () => {
      card.style.transition = 'transform 0.12s ease, box-shadow 0.45s ease, border-color 0.35s ease';
    });
  });
}

// ---- Ambient parallax on hero orbs ----
function initHeroParallax() {
  const orbs = document.querySelectorAll('.hero-orb');
  if (!orbs.length) return;
  document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth  - 0.5) * 2;
    const y = (e.clientY / window.innerHeight - 0.5) * 2;
    orbs.forEach((orb, i) => {
      const depth = (i + 1) * 0.4;
      orb.style.transform = `translate(${x * 18 * depth}px, ${y * 12 * depth}px)`;
    });
  });
}

// ---- Navbar scroll shadow + opacity ----
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

// ---- Scroll Progress Bar ----
function initScrollProgress() {
  const bar = document.getElementById('scrollProgress');
  if (!bar) return;
  const update = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    bar.style.width = `${Math.min(pct, 100)}%`;
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

// ---- Animated stat counters (stat-card h4 numbers) ----
function animateStatCards() {
  const statCards = document.querySelectorAll('.stat-card');
  if (!statCards.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.animation = 'cardEntrance 0.6s cubic-bezier(0.2,0.8,0.2,1) both';
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  statCards.forEach((card, i) => {
    card.style.opacity = '0';
    card.style.animationDelay = `${i * 0.1}s`;
    observer.observe(card);
  });
}

// ---- Boot ----
document.addEventListener('DOMContentLoaded', () => {
  animateCards();
  initCardTilt();
  initHeroParallax();
  initNavScroll();
  initScrollProgress();
  animateStatCards();
});
