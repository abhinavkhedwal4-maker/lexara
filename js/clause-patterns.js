/**
 * @fileoverview Deterministic clause-risk detection engine
 * @description Pure pattern-matching functions that identify common
 *              risk-bearing clause categories in legal documents — auto-
 *              renewal, indemnification, liability caps, arbitration,
 *              unilateral modification, termination restrictions, and more.
 *              Detection is keyword/regex-based and fully deterministic so
 *              it is testable and auditable independent of any AI model.
 *              The AI layer (see chatbot.js) is only used to *explain* a
 *              clause already flagged here in plain language — it never
 *              decides what counts as risky. This mirrors how safety-
 *              relevant classification should stay out of an LLM.
 *
 * Clause taxonomy grounded in standard contract-review practice — see
 * category comments for the specific risk each pattern targets.
 *
 * IMPORTANT: This is an informational triage tool, not a substitute for
 * review by a qualified lawyer. It flags language patterns worth a
 * closer look — it does not determine enforceability or legal validity,
 * which vary by jurisdiction and specific contract context.
 *
 * @module clause-patterns
 */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum characters of surrounding context captured per flagged clause */
const CONTEXT_WINDOW_CHARS = 400;

/** Minimum sentence length considered for clause extraction (filters noise) */
const MIN_SENTENCE_LENGTH = 20;

/**
 * Risk category definitions. Each category has a set of regex patterns and
 * a base severity. A single document may trigger multiple categories.
 *
 * @typedef {Object} ClauseCategory
 * @property {string} id
 * @property {string} label
 * @property {'low'|'medium'|'high'} severity
 * @property {string} explanation - Plain-language description of the risk
 * @property {RegExp[]} patterns
 */

/** @type {ReadonlyArray<ClauseCategory>} */
export const CLAUSE_CATEGORIES = Object.freeze([
  {
    id: 'auto_renewal',
    label: 'Automatic Renewal',
    severity: 'medium',
    explanation: 'This contract may renew automatically unless you actively cancel it by a specified deadline — missing that window can lock you in for another full term with potential fees.',
    patterns: [
      /automatically renew/i,
      /auto[\s-]?renew/i,
      /evergreen (term|clause|contract)/i,
      /shall renew for (a|an|successive|additional)/i,
      /unless (either party|subscriber|you|customer) provides? (written )?notice of non-?renewal/i,
      /renew(s|ed)? automatically/i,
      /renewal notice period/i,
      /notice of cancellation.{0,60}prior to (renewal|expir)/i,
    ],
  },
  {
    id: 'indemnification',
    label: 'Indemnification',
    severity: 'high',
    explanation: 'You may be required to cover the other party\u2019s losses, damages, or legal costs in certain situations — sometimes with no dollar cap, creating open-ended financial exposure even for third-party claims.',
    patterns: [
      /indemnif(y|ication|ied|ies)/i,
      /hold (harmless|the .{0,40} harmless)/i,
      /defend,?\s*indemnify/i,
      /indemnify,?\s*defend/i,
      /reimburse .{0,60} (losses|damages|costs|expenses)/i,
      /liable for (any|all) (losses|damages|claims)/i,
      /shall bear (the )?cost of/i,
    ],
  },
  {
    id: 'liability_cap',
    label: 'Limitation of Liability',
    severity: 'medium',
    explanation: 'This clause limits how much either party can recover if something goes wrong. Verify the cap amount is reasonable, and watch for carve-outs that remove the cap for specific claim types (e.g., IP infringement, fraud).',
    patterns: [
      /limitation of liability/i,
      /liab(le|ility) shall not exceed/i,
      /in no event shall .{0,60} be liable/i,
      /aggregate liability/i,
      /uncapped liability/i,
      /consequential.{0,30}damages/i,
      /indirect.{0,30}damages/i,
      /punitive damages/i,
      /special damages/i,
      /incidental damages/i,
      /cap on (damages|liability)/i,
      /maximum liability/i,
    ],
  },
  {
    id: 'arbitration',
    label: 'Mandatory Arbitration',
    severity: 'high',
    explanation: 'Disputes may need to go through private arbitration instead of a court, potentially waiving your right to a jury trial or class action. Arbitration can limit discovery, restrict appeals, and may favour repeat parties.',
    patterns: [
      /binding arbitration/i,
      /mandatory arbitration/i,
      /waive.{0,50}(jury trial|right to a jury|jury right)/i,
      /class action waiver/i,
      /shall be resolved (exclusively )?by arbitration/i,
      /JAMS|AAA arbitration|ICC arbitration/i,
      /disputes?.{0,60}(submitted to|governed by|settled by) arbitration/i,
      /arbitrator shall have (exclusive )?jurisdiction/i,
      /no class arbitration/i,
    ],
  },
  {
    id: 'unilateral_modification',
    label: 'Unilateral Modification',
    severity: 'medium',
    explanation: 'One party may change the terms without your direct consent. Check how much advance notice is required, whether continued use counts as acceptance, and what your options are if you disagree with a change.',
    patterns: [
      /(reserves? the right to|may) (modify|amend|change|update|revise) .{0,50} at (its|their|our) (sole )?discretion/i,
      /sole (and absolute )?discretion/i,
      /without (prior |advance )?notice/i,
      /at any time (and )?without (obligation|liability|consent)/i,
      /continued (use|access) (constitutes?|means) acceptance/i,
      /may update (these|this|the) (terms|agreement|policy)/i,
      /reserves? the right to (change|alter|modify)/i,
    ],
  },
  {
    id: 'termination_restriction',
    label: 'Termination Restrictions',
    severity: 'medium',
    explanation: 'Your ability to exit this agreement may be limited or costly — e.g., only allowed \u201cfor cause,\u201d with an early-termination fee, long notice requirement, or after a mandatory minimum commitment period.',
    patterns: [
      /terminat(e|ion) (only )?for cause/i,
      /early termination fee/i,
      /non-cancelable/i,
      /no right to terminate/i,
      /minimum (term|period|commitment) of/i,
      /termination (fee|penalty|charge)/i,
      /written notice of .{0,30}(days|months).{0,30}prior to termination/i,
      /may not terminate.{0,60}without cause/i,
      /irrevocable (commitment|obligation|term)/i,
    ],
  },
  {
    id: 'non_compete',
    label: 'Non-Compete / Non-Solicitation',
    severity: 'medium',
    explanation: 'This may restrict what work, clients, employers, or industries you can engage with after this agreement ends. Scope, duration, and geographic reach vary widely — and enforceability depends heavily on jurisdiction.',
    patterns: [
      /non-?compete/i,
      /non-?solicitation/i,
      /shall not (compete|solicit|engage in (a )?similar business)/i,
      /restrictive covenant/i,
      /covenant not to compete/i,
      /not (to |directly or indirectly )?(hire|employ|solicit) .{0,30}(employee|personnel|staff)/i,
      /not (to )?work for .{0,40}(competitor|competing)/i,
      /garden leave/i,
    ],
  },
  {
    id: 'ip_assignment',
    label: 'Intellectual Property Assignment',
    severity: 'high',
    explanation: 'This may transfer ownership of work you create, inventions, or IP rights to the other party — including potentially work done on your own time. Verify the exact scope and whether it extends beyond the engagement.',
    patterns: [
      /assigns? (all |any )?(right|title and interest)/i,
      /work[\s-]for[\s-]hire/i,
      /(intellectual property|IP) (shall (be|remain|vest)|belongs? to|is owned by)/i,
      /irrevocable,? (worldwide,? )?perpetual (license|licence)/i,
      /all inventions.{0,60}(belong|assigned|vest)/i,
      /moral rights.{0,60}waive/i,
      /assign(s|ment) of copyright/i,
      /all right.{0,20}title.{0,20}interest.{0,40}(assign|transfer|vest)/i,
    ],
  },
  {
    id: 'personal_guarantee',
    label: 'Personal Guarantee',
    severity: 'high',
    explanation: 'You (as an individual) may be personally responsible for obligations beyond any business entity\u2019s liability — this can expose personal assets if the business cannot meet its obligations.',
    patterns: [
      /personal(ly)? guarantee/i,
      /jointly and severally liable/i,
      /in (my|his|her|their) individual capacity/i,
      /personal liability/i,
      /guarantor/i,
      /personally liable/i,
      /guarantee(d|s|or) the (payment|performance|obligations)/i,
    ],
  },
  {
    id: 'confidentiality',
    label: 'Confidentiality Obligations',
    severity: 'low',
    explanation: 'This creates an ongoing duty to keep certain information private. Note the breadth of what counts as confidential, how long the obligation lasts after the agreement ends, and any permitted exceptions.',
    patterns: [
      /confidential information/i,
      /non-?disclosure/i,
      /shall (keep|maintain|hold|treat).{0,30}confidential/i,
      /proprietary information/i,
      /trade secret/i,
      /confidentiality obligation/i,
      /disclose.{0,60}(only|solely|strictly) (on a )?need.to.know/i,
    ],
  },
  {
    id: 'governing_law',
    label: 'Governing Law & Jurisdiction',
    severity: 'low',
    explanation: 'This determines which state\u2019s or country\u2019s law applies to any dispute, and where legal proceedings must take place. If it\u2019s a distant forum, enforcing your rights may be much more expensive.',
    patterns: [
      /governed by (the laws of|laws of the (state|country|jurisdiction))/i,
      /governing law/i,
      /jurisdiction (of|in) .{0,40}(court|tribunal)/i,
      /exclusive jurisdiction/i,
      /venue shall be/i,
      /choice of law/i,
      /courts of .{0,50}(shall have|have exclusive)/i,
    ],
  },
  {
    id: 'data_privacy',
    label: 'Data Collection & Privacy',
    severity: 'medium',
    explanation: 'This affects what personal data is collected, how it is used, who it is shared with, and for how long it is retained. Broad data-sharing rights or indefinite retention periods may have significant privacy implications.',
    patterns: [
      /collect(s|ion of).{0,60}personal (data|information)/i,
      /share.{0,60}(third.party|partner|affiliate)/i,
      /data retention/i,
      /process(ing)? (personal|your) (data|information)/i,
      /sell(s|ing).{0,40}(data|information)/i,
      /data (breach|security incident)/i,
      /GDPR|CCPA|HIPAA|FERPA/i,
      /opt.out.{0,40}(data|marketing|sharing)/i,
    ],
  },
  {
    id: 'payment_penalty',
    label: 'Late Payment & Penalties',
    severity: 'medium',
    explanation: 'Late or missed payments may trigger significant penalties, interest charges, or contract suspension. Check the grace period, the interest rate, and whether failure to pay constitutes an immediate material breach.',
    patterns: [
      /late (payment )?fee/i,
      /interest.{0,40}(per (month|annum|day)|monthly|annually).{0,40}(overdue|outstanding|unpaid)/i,
      /penalty.{0,40}(late|overdue|default)/i,
      /(overdue|outstanding) (balance|invoice|amount).{0,60}interest/i,
      /acceleration.{0,60}(payment|amounts? due)/i,
      /failure to pay.{0,60}(breach|default|terminat)/i,
      /default interest/i,
    ],
  },
  {
    id: 'force_majeure',
    label: 'Force Majeure',
    severity: 'low',
    explanation: 'This allows either party to delay or cancel obligations due to unforeseeable events (e.g., natural disasters, pandemics). Check what events are covered, how long the excuse lasts, and whether you can exit if performance is suspended too long.',
    patterns: [
      /force majeure/i,
      /acts? of god/i,
      /beyond.{0,30}(reasonable )?control/i,
      /(pandemic|epidemic|natural disaster|war|terrorism|government action).{0,60}(excuse|relieve|suspend)/i,
      /impossibility of performance/i,
      /frustration of (contract|purpose)/i,
    ],
  },
  {
    id: 'assignment',
    label: 'Assignment of Contract',
    severity: 'medium',
    explanation: 'This determines whether the other party can transfer their rights and obligations under this contract to someone else (e.g., in a sale or merger) without your consent. Broad assignment rights can mean you end up in a contract with an unknown party.',
    patterns: [
      /may assign.{0,80}(without (your |prior )?(written )?consent)/i,
      /assigns? (this agreement|its (rights|obligations))/i,
      /assignment (of this agreement|of (rights|obligations))/i,
      /transfer(s|red)? (its|their).{0,30}(rights|obligations|interest)/i,
      /in the event of (a (merger|acquisition|sale)|change of control)/i,
      /successor(s)? (in interest|and assign)/i,
    ],
  },
  {
    id: 'warranty_disclaimer',
    label: 'Warranty Disclaimer',
    severity: 'medium',
    explanation: 'The other party may be disclaiming all warranties — meaning the product or service is provided \u201cas is\u201d with no guaranteed quality, fitness, or accuracy. This can significantly limit your recourse if something doesn\u2019t work as expected.',
    patterns: [
      /as.is.{0,30}(basis|condition|without warranty)/i,
      /no (warranty|warranties|guarantee|guarantees)/i,
      /disclaim(s|er|ed) (all |any |implied )?warrant(y|ies)/i,
      /without (any |express |implied )?warranty/i,
      /merchantability/i,
      /fitness for (a )?particular purpose/i,
      /does not warrant/i,
    ],
  },
]);

// ─── Detection ────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} FlaggedClause
 * @property {string} categoryId
 * @property {string} label
 * @property {'low'|'medium'|'high'} severity
 * @property {string} explanation
 * @property {string} matchedText   - The specific phrase that triggered the match
 * @property {string} context       - Surrounding sentence(s) for display
 * @property {number} position      - Character offset in the source document
 */

/**
 * Splits document text into candidate sentences for clause-level context
 * extraction. Intentionally simple (period/newline based) — legal
 * documents vary too much in structure for a general sentence tokenizer
 * to be reliably better than this for our purposes.
 * @param {string} text
 * @returns {string[]}
 */
function splitIntoSentences(text) {
  return text
    .split(/(?<=[.;])\s+(?=[A-Z(])|\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_SENTENCE_LENGTH);
}

/**
 * Extracts a display-friendly context window around a match position.
 * @param {string} text
 * @param {number} matchIndex
 * @param {number} matchLength
 * @returns {string}
 */
function extractContext(text, matchIndex, matchLength) {
  const start = Math.max(0, matchIndex - CONTEXT_WINDOW_CHARS / 2);
  const end = Math.min(text.length, matchIndex + matchLength + CONTEXT_WINDOW_CHARS / 2);
  const prefix = start > 0 ? '\u2026' : '';
  const suffix = end < text.length ? '\u2026' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

/**
 * Scans document text for every clause category and returns all matches
 * found, each with surrounding context for display. Pure function — same
 * input always produces the same output, which is what makes this testable
 * without mocking an AI model.
 *
 * @param {string} documentText - Full plain-text content of the document
 * @returns {FlaggedClause[]} All flagged clauses, unsorted
 */
export function scanDocument(documentText) {
  if (typeof documentText !== 'string' || !documentText.trim()) return [];

  const flagged = [];

  CLAUSE_CATEGORIES.forEach((category) => {
    category.patterns.forEach((pattern) => {
      const globalPattern = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
      let match;
      // eslint-disable-next-line no-cond-assign
      while ((match = globalPattern.exec(documentText)) !== null) {
        flagged.push({
          categoryId: category.id,
          label: category.label,
          severity: category.severity,
          explanation: category.explanation,
          matchedText: match[0],
          context: extractContext(documentText, match.index, match[0].length),
          position: match.index,
        });
        // Prevent infinite loops on zero-length matches
        if (match[0].length === 0) globalPattern.lastIndex++;
      }
    });
  });

  return dedupeByCategory(flagged);
}

/**
 * Collapses multiple matches within the same category that are extremely
 * close together (same clause matched by more than one pattern), keeping
 * only the first occurrence per category per ~500-character neighbourhood.
 * @param {FlaggedClause[]} flagged
 * @returns {FlaggedClause[]}
 */
function dedupeByCategory(flagged) {
  const DEDUPE_DISTANCE = 500;
  const sorted = [...flagged].sort((a, b) => a.position - b.position);
  const result = [];

  sorted.forEach((clause) => {
    const isDuplicate = result.some(
      (existing) =>
        existing.categoryId === clause.categoryId &&
        Math.abs(existing.position - clause.position) < DEDUPE_DISTANCE,
    );
    if (!isDuplicate) result.push(clause);
  });

  return result;
}

/**
 * Computes an overall 0-100 document risk score from its flagged clauses.
 * Higher scores indicate more, and more severe, risk-bearing language was
 * found — this is a triage signal, not a legal determination.
 *
 * @param {FlaggedClause[]} flaggedClauses
 * @returns {number} Risk score, 0-100
 */
export function computeDocumentRiskScore(flaggedClauses) {
  if (flaggedClauses.length === 0) return 0;

  const SEVERITY_WEIGHTS = { low: 5, medium: 12, high: 22 };
  const rawScore = flaggedClauses.reduce(
    (sum, clause) => sum + (SEVERITY_WEIGHTS[clause.severity] ?? 0),
    0,
  );

  return Math.min(Math.round(rawScore), 100);
}

/**
 * Groups flagged clauses by category, returning one entry per category
 * with a count of how many times it appeared.
 * @param {FlaggedClause[]} flaggedClauses
 * @returns {Array<{categoryId: string, label: string, severity: string, count: number}>}
 */
export function summarizeByCategory(flaggedClauses) {
  const map = new Map();

  flaggedClauses.forEach((clause) => {
    const existing = map.get(clause.categoryId);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(clause.categoryId, {
        categoryId: clause.categoryId,
        label: clause.label,
        severity: clause.severity,
        count: 1,
      });
    }
  });

  return [...map.values()].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });
}

/**
 * Splits a document into candidate sentences — exported for reuse by the
 * simplifier module, which processes text sentence-by-sentence.
 * @param {string} text
 * @returns {string[]}
 */
export { splitIntoSentences };