# Architecture Decision Records

## ADR-1: Deterministic clause detection stays out of the LLM
Risk-bearing clause categories (auto-renewal, indemnification, arbitration, liability caps, and others) are detected via regex pattern matching in `clause-patterns.js`, not by asking the AI "is this risky?" The AI is only invoked afterward to explain a clause the deterministic engine already flagged. This keeps the "what counts as worth reviewing" decision testable, repeatable, and auditable independent of model behaviour or prompt drift.

## ADR-2: "Assistance, not advice" is enforced at the system-prompt level, not just a UI disclaimer
Every AI system prompt in the app (`chatbot.js`, `risk-scanner.js`, `simplifier.js`, `document-qa.js`, `next-steps.js`) explicitly instructs the model to redirect advice-seeking questions ("what should I do," "should I sign this") toward preparing the user for a conversation with a licensed attorney, rather than answering directly. This is a structural product decision, not an appended disclaimer — the boundary is enforced by what the model is instructed to do, not just what the page says around it.

## ADR-3: PDF parsing happens entirely client-side
Using PDF.js loaded via CDN, uploaded files are parsed to plain text in the browser and never transmitted to any server during parsing. Only the document *text* — and only the specific excerpt relevant to a user's explicit action — is later sent to the AI endpoint when the user requests an analysis. This is both a privacy improvement and a meaningful trust signal for a legal-document tool.

## ADR-4: Document state is session-scoped, not persisted by default
`document-store.js` uses `sessionStorage`, not Firestore, as the default home for an active document. This lets a document loaded on one page be reused on another (e.g., scan a document for risk, then immediately ask questions about it) without requiring sign-in or creating a persistent record the user didn't explicitly ask for.

## ADR-5: Vanilla JS over a framework
Chosen to eliminate build tooling entirely — the app deploys as static files plus one serverless function, with zero build step and instant local startup. Trade-off: less compile-time type safety than a TypeScript stack, offset by strict JSDoc typing and a zero-dependency, fully deterministic test suite covering all pure logic (`clause-patterns.js`, `document-diff.js`).

## ADR-6: Groq over other LLM providers
Selected for inference speed. A user reviewing a lease or contract wants a fast, low-friction answer to "what does this mean" — slow responses undermine the accessibility goal of the product.

## ADR-7: One shared chat component, reused across all pages
`chatbot.js` and `shared.js` are imported by every page rather than duplicated, so input validation, prompt-injection filtering, and rate-limiting logic exists in exactly one place across the entire platform.