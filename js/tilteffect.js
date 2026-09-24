/* ============================================
   LEXARA — 3D TILT EFFECT (vanilla JS, no deps)
   Add to any page after style.css is loaded:
     <script type="module" src="../js/tilt-effect.js"></script>
   Auto-applies to .feature-card, .stat-card, .clause-card,
   .glossary-term-card, .comparison-panel — add data-tilt="false"
   to any element to opt it out.
   ============================================ */

const TILT_SELECTOR = '.feature-card, .stat-card, .clause-card, .glossary-term-card, .comparison-panel';
const MAX_TILT_DEG = 8;
const MAX_LIFT_PX = 10;

function initTilt(el) {
  if (el.dataset.tilt === 'false' || el.dataset.tiltBound === 'true') return;
  el.dataset.tiltBound = 'true';
  el.style.transformStyle = 'preserve-3d';
  el.style.willChange = 'transform';

  let frame = null;

  const handleMove = (e) => {
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;  // 0 -> 1
    const py = (e.clientY - rect.top) / rect.height;   // 0 -> 1

    const rotateY = (px - 0.5) * MAX_TILT_DEG * 2;
    const rotateX = (0.5 - py) * MAX_TILT_DEG * 2;

    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      el.style.transform =
        `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-${MAX_LIFT_PX}px) translateZ(10px)`;
    });
  };

  const reset = () => {
    if (frame) cancelAnimationFrame(frame);
    el.style.transition = 'transform 0.5s cubic-bezier(0.2,0.8,0.2,1)';
    el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0) translateZ(0)';
    setTimeout(() => { el.style.transition = ''; }, 500);
  };

  el.addEventListener('mouseenter', () => { el.style.transition = ''; });
  el.addEventListener('mousemove', handleMove);
  el.addEventListener('mouseleave', reset);
}

function scanAndBind() {
  document.querySelectorAll(TILT_SELECTOR).forEach(initTilt);
}

// Respect reduced-motion preference
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!prefersReducedMotion) {
  document.addEventListener('DOMContentLoaded', scanAndBind);
  // Re-scan when JS-rendered content (clause cards, glossary terms, etc.) is added later
  const observer = new MutationObserver(() => scanAndBind());
  observer.observe(document.body, { childList: true, subtree: true });
}