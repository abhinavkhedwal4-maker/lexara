/**
 * @fileoverview Plain-language legal terminology glossary
 * @description Static reference data explaining common legal and contract
 *              terms in everyday language. Supports the Glossary page and
 *              is also referenced by the Risk Scanner to link flagged
 *              clause categories to a fuller explanation.
 *
 * Definitions are general educational information, not legal advice, and
 * may not reflect the specific meaning of a term in your jurisdiction or
 * in a specific document's context.
 *
 * @module legal-glossary-data
 */

'use strict';

/**
 * @typedef {Object} GlossaryTerm
 * @property {string} id
 * @property {string} term
 * @property {string} category      - Broad grouping for filtering
 * @property {string} plainMeaning  - Plain-language explanation
 * @property {string} [example]     - Optional illustrative example
 * @property {string} [relatedClauseId] - Links to a clause-patterns.js category id, if applicable
 */

/** @type {ReadonlyArray<GlossaryTerm>} */
export const GLOSSARY_TERMS = Object.freeze([
  {
    id: 'indemnification',
    term: 'Indemnification',
    category: 'Liability',
    plainMeaning: 'A promise by one party to cover the costs or losses of the other party if certain problems happen — essentially agreeing to "make them whole" for specific types of harm.',
    example: 'A vendor might agree to indemnify a customer against claims that the vendor\u2019s product infringes someone else\u2019s patent.',
    relatedClauseId: 'indemnification',
  },
  {
    id: 'liability-cap',
    term: 'Limitation of Liability',
    category: 'Liability',
    plainMeaning: 'A clause that sets a maximum amount either party can be required to pay if something goes wrong, even if actual damages are higher.',
    example: 'A contract might cap liability at "the total fees paid in the past 12 months."',
    relatedClauseId: 'liability_cap',
  },
  {
    id: 'hold-harmless',
    term: 'Hold Harmless',
    category: 'Liability',
    plainMeaning: 'Similar to indemnification — one party agrees not to hold the other responsible for certain losses or damages.',
  },
  {
    id: 'auto-renewal',
    term: 'Automatic Renewal (Evergreen Clause)',
    category: 'Term & Renewal',
    plainMeaning: 'The contract renews itself for another term unless someone actively cancels before a deadline. Missing that deadline usually means you\u2019re locked in again.',
    relatedClauseId: 'auto_renewal',
  },
  {
    id: 'arbitration',
    term: 'Binding Arbitration',
    category: 'Disputes',
    plainMeaning: 'Instead of going to court, disputes are decided by a private arbitrator. Arbitration decisions are usually final and hard to appeal.',
    relatedClauseId: 'arbitration',
  },
  {
    id: 'class-action-waiver',
    term: 'Class Action Waiver',
    category: 'Disputes',
    plainMeaning: 'You agree to bring any legal claim individually, not as part of a group lawsuit with other people who have the same complaint.',
  },
  {
    id: 'force-majeure',
    term: 'Force Majeure',
    category: 'Performance',
    plainMeaning: 'A clause that excuses a party from fulfilling obligations when extraordinary events outside their control occur — like natural disasters, war, or, in some contracts, pandemics.',
  },
  {
    id: 'severability',
    term: 'Severability',
    category: 'General Provisions',
    plainMeaning: 'If one part of the contract is found illegal or unenforceable, the rest of the contract still stands.',
  },
  {
    id: 'entire-agreement',
    term: 'Entire Agreement (Integration Clause)',
    category: 'General Provisions',
    plainMeaning: 'States that this written document is the complete agreement — any earlier promises, emails, or verbal discussions not included in the document don\u2019t count.',
  },
  {
    id: 'governing-law',
    term: 'Governing Law',
    category: 'Disputes',
    plainMeaning: 'Specifies which state\u2019s or country\u2019s laws will be used to interpret the contract, regardless of where you live.',
  },
  {
    id: 'non-compete',
    term: 'Non-Compete Clause',
    category: 'Restrictions',
    plainMeaning: 'Restricts you from working for a competitor or starting a competing business for a certain time and within a certain area after the agreement ends.',
    relatedClauseId: 'non_compete',
  },
  {
    id: 'non-solicitation',
    term: 'Non-Solicitation Clause',
    category: 'Restrictions',
    plainMeaning: 'Restricts you from trying to hire away employees or take clients from the other party for a period of time.',
  },
  {
    id: 'ip-assignment',
    term: 'IP Assignment / Work for Hire',
    category: 'Intellectual Property',
    plainMeaning: 'Transfers ownership of things you create (writing, code, designs, inventions) to the other party, rather than you keeping ownership.',
    relatedClauseId: 'ip_assignment',
  },
  {
    id: 'confidentiality',
    term: 'Confidentiality / Non-Disclosure',
    category: 'Confidentiality',
    plainMeaning: 'An obligation to keep certain information private and not share it with others, often continuing even after the agreement ends.',
    relatedClauseId: 'confidentiality',
  },
  {
    id: 'personal-guarantee',
    term: 'Personal Guarantee',
    category: 'Liability',
    plainMeaning: 'An individual (not just a business) personally promises to be responsible for an obligation — meaning personal assets could be at risk, not just the business\u2019s.',
    relatedClauseId: 'personal_guarantee',
  },
  {
    id: 'termination-for-cause',
    term: 'Termination for Cause',
    category: 'Term & Renewal',
    plainMeaning: 'The agreement can only be ended early if there\u2019s a specific, defined reason (like a breach of contract) — not just because one party wants out.',
    relatedClauseId: 'termination_restriction',
  },
  {
    id: 'sole-discretion',
    term: 'Sole Discretion',
    category: 'General Provisions',
    plainMeaning: 'One party can make a decision entirely on their own judgment, without needing to justify it or get the other party\u2019s agreement.',
    relatedClauseId: 'unilateral_modification',
  },
  {
    id: 'consequential-damages',
    term: 'Consequential Damages',
    category: 'Liability',
    plainMeaning: 'Indirect losses that result from a breach — like lost profits or business opportunities — as opposed to direct costs. Many contracts exclude these from what can be claimed.',
  },
  {
    id: 'waiver',
    term: 'Waiver',
    category: 'General Provisions',
    plainMeaning: 'Giving up a right you would otherwise have — for example, the right to a jury trial, or the right to enforce a clause if you don\u2019t act on a past violation.',
  },
  {
    id: 'representations-warranties',
    term: 'Representations and Warranties',
    category: 'Performance',
    plainMeaning: 'Statements of fact or promises about the quality/condition of something (a product, a business, information) that the other party is relying on when agreeing to the deal.',
  },
]);

/**
 * Returns all unique glossary categories, in a sensible display order.
 * @returns {string[]}
 */
export function getGlossaryCategories() {
  const order = [
    'Liability', 'Term & Renewal', 'Disputes', 'Restrictions',
    'Intellectual Property', 'Confidentiality', 'Performance', 'General Provisions',
  ];
  const present = new Set(GLOSSARY_TERMS.map((t) => t.category));
  return order.filter((c) => present.has(c));
}

/**
 * Finds the glossary term linked to a given clause-patterns.js category id.
 * @param {string} clauseId
 * @returns {GlossaryTerm|undefined}
 */
export function getTermByClauseId(clauseId) {
  return GLOSSARY_TERMS.find((t) => t.relatedClauseId === clauseId);
}

/**
 * Memoised search cache — avoids recomputing the same query on repeated calls
 * (e.g. debounced keystrokes that land on the same normalised string).
 * Cleared automatically when the module is first evaluated; size is bounded
 * by the finite vocabulary of search queries a user can type.
 * @type {Map<string, GlossaryTerm[]>}
 */
const _searchCache = new Map();

/**
 * Filters glossary terms by a search query matching term name or meaning.
 * Results are memoised — identical queries return the cached array without
 * re-scanning the dataset.
 * @param {string} query
 * @returns {GlossaryTerm[]}
 */
export function searchGlossary(query) {
  if (!query || !query.trim()) return [...GLOSSARY_TERMS];
  const q = query.trim().toLowerCase();
  if (_searchCache.has(q)) return _searchCache.get(q);
  const result = GLOSSARY_TERMS.filter((t) =>
    t.term.toLowerCase().includes(q) || t.plainMeaning.toLowerCase().includes(q));
  _searchCache.set(q, result);
  return result;
}