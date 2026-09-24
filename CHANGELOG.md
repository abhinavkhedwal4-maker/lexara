# Changelog

## [1.0.0]
- Initial release: 6 modules — Simplifier, Risk Scanner, Comparator, Ask My Document, Lawyer Prep Sheet, Glossary
- Client-side PDF parsing via PDF.js — documents never touch the server during upload
- Deterministic clause-risk detection engine (`clause-patterns.js`) covering 10 common risk categories, grounded in standard contract-review practice
- Deterministic paragraph-level document diff engine (`document-diff.js`) using LCS
- Structurally advice-safe AI system prompts across all modules — redirects advice-seeking questions toward lawyer-prep guidance
- Prompt-injection filtering applied client-side and server-side
- Two-tier rate limiting (general vs. AI endpoints)
- Full security header set including CSP with no `unsafe-inline` scripts
- Zero-dependency test suite covering clause detection, diffing, and security validation
- Firebase Auth + Firestore for opt-in analysis saving only — no core feature requires sign-in