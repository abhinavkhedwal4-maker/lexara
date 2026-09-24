# Changelog

All notable changes to Lexara are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.1.0] — 2025

### Added
- **Model fallback ladder** in `api/chat.js` and `server.js`: primary model (`llama-3.3-70b-versatile`) automatically falls back to `llama-3.1-8b-instant`, then `mixtral-8x7b-32768` on model-not-found or transient errors — provides resilience against model deprecation and quota exhaustion without surfacing errors to users.
- **`GET /api/health` endpoint** in `server.js`: returns `{status, hasGroqKey, model, modelLadder, timestamp}` for infrastructure health checks and deployment verification.
- **Expanded injection pattern coverage**: added `[INST]` and `<|im_start|>` token injection patterns (common in instruction-tuned model jailbreak attempts) to both client-side (`shared.js`) and server-side (`api/chat.js`, `server.js`) filters.
- **Expanded test suite** to 63 tests: new suites covering server validation logic, rate limiter behaviour, injection pattern coverage, model ladder logic, and document similarity detection.

### Changed
- `GROQ_MODEL` default corrected from `openai/gpt-oss-120b` to `llama-3.3-70b-versatile` in `.env.example`, `server.js`, and `api/chat.js`.
- `.env.example` upgraded with inline documentation for each variable, Groq API key format hint, and fallback ladder explanation.
- `README.md` significantly expanded: Table of Contents, Executive Summary, full Problem Statement alignment table, system architecture ASCII diagrams, QA verification suite (20 manual test cases), threat model matrix, and Evaluation Map covering all 6 judging criteria.
- `server.js` version bumped to `1.1.0`.
- `validateMessages()` in `api/chat.js` now explicitly returns a `valid: false` response path (defence-in-depth check) in addition to the existing throw path.

### Fixed
- `api/chat.js` `validateMessages` catch block was not returning a response when validation threw — added explicit `validation.valid` check after the try/catch.

---

## [1.0.0] — 2025

### Added
- Initial release: 6 modules — Simplifier, Risk Scanner, Comparator, Ask My Document, Lawyer Prep Sheet, Glossary
- Client-side PDF parsing via PDF.js — documents never touch the server during upload
- Deterministic clause-risk detection engine (`clause-patterns.js`) covering 16 common risk categories, grounded in standard contract-review practice
- Deterministic paragraph-level document diff engine (`document-diff.js`) using LCS
- Structurally advice-safe AI system prompts across all modules — redirects advice-seeking questions toward lawyer-prep guidance
- Prompt-injection filtering applied client-side and server-side (5 patterns)
- Two-tier rate limiting (general vs. AI endpoints) with Map-based store and auto-cleanup
- Full security header set including CSP with no `unsafe-inline` scripts
- Zero-dependency test suite (34 tests) covering clause detection, diffing, and security validation
- Firebase Auth + Firestore for opt-in analysis saving only — no core feature requires sign-in
- `SECURITY.md` with full threat model, OWASP Top 10 mapping, and incident response playbook
- Architecture Decision Records (`docs/decisions.md`, ADR-1 through ADR-7)
