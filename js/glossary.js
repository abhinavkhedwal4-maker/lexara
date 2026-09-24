/**
 * @fileoverview Legal Glossary page controller
 * @description Renders the searchable, filterable glossary of plain-
 *              language legal term definitions from legal-glossary-data.js.
 *              Pure client-side filtering — no AI calls needed for this
 *              page, keeping it instant and always available even if the
 *              AI backend is unreachable.
 * @module glossary
 */

'use strict';

import { renderNavbar, renderChatPanel, wireGlobalActions, debounce, sanitizeString } from './shared.js';
import { getGlossaryCategories, searchGlossary } from './legal-glossary-data.js';

// ─── Init shared UI ────────────────────────────────────────────────────────────

renderNavbar('glossary', true);
renderChatPanel('Ask me to explain any legal term in more detail, or how it might apply to a specific situation.');
wireGlobalActions();

// ─── State ───────────────────────────────────────────────────────────────────

/** @type {string} Currently active category filter, or 'all' */
let activeCategory = 'all';

/** @type {string} Current search query */
let searchQuery = '';

// ─── Category filters ──────────────────────────────────────────────────────────

renderCategoryFilters();

/** Renders the category filter pills, including an "All" option. */
function renderCategoryFilters() {
  const container = document.getElementById('categoryFilters');
  if (!container) return;

  const categories = ['all', ...getGlossaryCategories()];

  container.innerHTML = categories.map((cat) => `
    <button class="category-filter-btn${cat === activeCategory ? ' active' : ''}" data-category="${cat}" aria-pressed="${cat === activeCategory}">
      ${cat === 'all' ? 'All Terms' : cat}
    </button>`).join('');

  container.querySelectorAll('.category-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.category;
      renderCategoryFilters();
      renderResults();
    });
  });
}

// ─── Search ───────────────────────────────────────────────────────────────────

const searchInput = document.getElementById('glossarySearchInput');
const handleSearch = debounce((query) => {
  searchQuery = query;
  renderResults();
}, 200);

searchInput?.addEventListener('input', (e) => handleSearch(e.target.value));

// ─── Rendering ────────────────────────────────────────────────────────────────

/** Renders the glossary term grid based on current search + category filter. */
function renderResults() {
  const grid = document.getElementById('glossaryGrid');
  if (!grid) return;

  let results = searchGlossary(searchQuery);
  if (activeCategory !== 'all') {
    results = results.filter((t) => t.category === activeCategory);
  }

  if (results.length === 0) {
    grid.innerHTML = `<div class="glossary-no-results">No terms match your search. Try a different keyword.</div>`;
    return;
  }

  grid.innerHTML = results.map((term) => `
    <div class="glossary-term-card" role="listitem">
      <div class="glossary-term-header">
        <span class="glossary-term-name">${sanitizeString(term.term)}</span>
        <span class="glossary-term-category">${sanitizeString(term.category)}</span>
      </div>
      <p class="glossary-term-meaning">${sanitizeString(term.plainMeaning)}</p>
      ${term.example ? `<p class="glossary-term-example">${sanitizeString(term.example)}</p>` : ''}
    </div>`).join('');
}

renderResults();