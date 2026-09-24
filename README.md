# ⚖️ Lexara — AI for Legal Access & Assistance

> A GenAI-powered platform that helps people understand, compare, and navigate legal documents — providing information and assistance, never a substitute for professional legal advice.

[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen)](https://lexara-fc30c.web.app)
[![Tests](https://img.shields.io/badge/Tests-63%20passing-brightgreen)]()
[![Security](https://img.shields.io/badge/Security-Hardened-blue)]()
[![Accessibility](https://img.shields.io/badge/WCAG-2.1%20AA-orange)]()
[![License](https://img.shields.io/badge/License-MIT-green)]()

---

## 📑 Table of Contents

1. [Problem Statement Alignment](#1-problem-statement-alignment)
2. [The Legal Intelligence Architecture](#2-the-legal-intelligence-architecture)
3. [Core Feature Breakdown](#3-core-feature-breakdown)
4. [System Architecture](#4-system-architecture)
5. [Security Posture & Zero-Trust Design](#5-security-posture--zero-trust-design)
6. [Local Development & Setup](#6-local-development--setup)
7. [Deployment to Vercel](#7-deployment-to-vercel)
8. [Comprehensive QA Verification Suite](#8-comprehensive-qa-verification-suite)
9. [Threat Modeling & Security Defense Matrix](#9-threat-modeling--security-defense-matrix)
10. [Evaluation Map](#10-evaluation-map)
11. [What Makes Lexara Different](#11-what-makes-lexara-different)

---

## 💡 Executive Summary & Problem Space

### The Problem

Legal information is structurally inaccessible. Contract language is dense and technical by design — not because clarity is impossible, but because legal precision evolved without readability as a goal. The result is a two-sided access gap:

- **Cost barrier**: Qualified attorneys cost $200–$600/hour, making basic document review inaccessible for individuals and small businesses.
- **Comprehension barrier**: Even people who can afford a lawyer often arrive unprepared, unable to articulate what concerned them or where to focus.

### The Solution: Lexara

Lexara creates a structured, multi-tool legal comprehension engine:

```
Load Document  ──►  Detect Risks (deterministic)  ──►  Simplify Language
     ▲                         │                              │
     │                         ▼                              ▼
 Ask Questions  ◄──  Explain Flagged Clauses  ◄──  Compare Versions
     │
     ▼
 Generate Lawyer Prep Sheet  ──►  Arrive Informed
```

**Deterministic First, AI Grounded**: Risk detection and document diffing are computed as pure, testable functions *before* any AI is involved. Groq LLaMA is then invoked to *explain* what those engines already found — never to decide what counts as risky.

**Assistance, Not Advice, as Architecture**: Every AI system prompt structurally redirects advice-seeking questions toward preparing the user for a real attorney conversation. This is an architectural constraint, not a disclaimer.

---

## 1. Problem Statement Alignment

Every requirement in the hackathon brief is a working, demonstrable feature.

| # | Requirement | How Lexara Delivers It | Live Route |
|---|---|---|---|
| R1 | Simplifying complex legal documents | Document Simplifier — plain-language rewrite at 3 reading levels (plain, simple, detailed) | `/pages/simplifier.html` |
| R2 | Comparing contracts, agreements, or policies | Document Comparator — LCS paragraph-level diff + AI significance notes | `/pages/comparator.html` |
| R3 | Highlighting clauses, obligations, risks | Risk Scanner — 16-category deterministic clause detection + AI deep-dives | `/pages/risk-scanner.html` |
| R4 | Answering questions based on provided documents | Ask My Document — grounded chat, answers strictly from the loaded document | `/pages/document-qa.html` |
| R5 | Understanding options and potential next steps | Lawyer Prep Sheet — review-priority scoring + deterministic + AI-generated checklist | `/pages/next-steps.html` |
| R6 | Generating summaries, checklists, actionable outputs | Prep Sheet print/PDF export + Simplifier plain-language output with KEY POINTS section | `/pages/next-steps.html`, `/pages/simplifier.html` |
| R7 | Preparing questions for a legal professional | Lawyer Prep Sheet — 8 AI-generated, document-specific attorney questions grounded in flagged clauses | `/pages/next-steps.html` |
| R+ | Plain-language legal glossary | 80+ defined terms with plain-language definitions, searchable | `/pages/glossary.html` |

---

## 2. The Legal Intelligence Architecture

Lexara organises legal comprehension across three complementary dimensions:

```
                    ┌───────────────────────────────┐
                    │        Document Upload         │
                    │   (PDF.js client-side only)    │
                    └──────────────┬────────────────┘
                                   │
          ┌────────────────────────┼──────────────────────────┐
          ▼                        ▼                          ▼
┌─────────────────┐    ┌────────────────────┐    ┌──────────────────────┐
│  Risk Scanner   │    │    Comparator      │    │    Ask My Document   │
│ (Deterministic) │    │ (Deterministic LCS)│    │  (Grounded AI Chat)  │
│ "What's risky?" │    │  "What changed?"   │    │ "What does this say?"│
└────────┬────────┘    └────────┬───────────┘    └──────────┬───────────┘
         │                      │                            │
         └──────────────────────┴────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────────┐
                    │     Lawyer Prep Sheet      │
                    │  "Arrive informed, not     │
                    │   overwhelmed"             │
                    └───────────────────────────┘
```

**Why deterministic first?** Clause detection and document diffing are implemented as pure, side-effect-free functions that always produce the same result for the same input. They are unit-tested without mocking any AI model. The AI only explains — it never classifies.

---

## 3. Core Feature Breakdown

| Feature | Description | Technical Implementation |
|---|---|---|
| **Document Simplifier** | Plain-language rewrite at 3 reading levels (plain, simple, detailed) with a KEY POINTS section | Groq LLaMA 3.3 70B, structurally advice-safe system prompts, auto-title and key-points extraction |
| **Risk Scanner** | 16-category deterministic clause detection with optional AI deep-dive explanations | `clause-patterns.js` pure regex engine; AI explains, never classifies |
| **Document Comparator** | Paragraph-level LCS diff between two document versions, AI notes on significance | `document-diff.js` pure LCS algorithm; AI only called on explicit Explain action |
| **Ask My Document** | Grounded AI chat constrained to the loaded document's text | System prompt enforces document-grounded answers; out-of-document questions flagged |
| **Lawyer Prep Sheet** | Review-priority badge + checkbox checklist + 8 AI-generated document-specific attorney questions | Risk score from `clause-patterns.js`; AI generates questions, never answers them |
| **Legal Glossary** | 80+ plain-language term definitions, searchable | Pure static lookup — `legal-glossary-data.js`, no AI required |
| **Cross-page Document State** | Upload once, use across all tools without re-uploading | `document-store.js` backed by `sessionStorage` — cleared when tab closes |

---

## 4. System Architecture

### End-to-End Topology

```
┌────────────────────────────────────────────────────────────┐
│              Browser (HTML5 + Vanilla JS ES Modules)        │
│                                                            │
│  index.html ─► Landing / Feature Overview                  │
│  pages/simplifier.html     → simplifier.js                 │
│  pages/risk-scanner.html   → risk-scanner.js               │
│  pages/comparator.html     → comparator.js                 │
│  pages/document-qa.html    → document-qa.js                │
│  pages/next-steps.html     → next-steps.js                 │
│  pages/glossary.html       → glossary.js                   │
│                                                            │
│  Shared: shared.js · chatbot.js · pdf-parser.js            │
│          clause-patterns.js · document-diff.js             │
│          document-store.js · auth.js · firebase.js         │
└────────────────────────┬───────────────────────────────────┘
                         │ POST /api/chat
                         │ (validated · sanitised · rate-limited)
                         ▼
         ┌───────────────────────────────────┐
         │  Vercel Serverless Function        │
         │  api/chat.js                      │
         │                                   │
         │  1. Content-Type gate             │
         │  2. validateMessages()            │
         │  3. sanitizeString()              │
         │  4. sanitizePromptInjection()     │
         │  5. Proxy to Groq API             │
         └──────────────┬────────────────────┘
                        │
                        ▼
         ┌──────────────────────────────┐
         │  Groq API                    │
         │  llama-3.3-70b-versatile     │
         │  (temperature 0.4,           │
         │   max_tokens 900)            │
         └──────────────────────────────┘

         ┌──────────────────────────────┐
         │  Firebase (lexara-fc30c)     │
         │  Auth: Google Sign-In only   │
         │  Firestore: opt-in saves     │
         │  — never required for core  │
         └──────────────────────────────┘
```

### Deterministic Core — No AI Required

```
clause-patterns.js ──► scanDocument(text)
                         │
                         ├── 16 categories × regex patterns
                         ├── dedupeByCategory()
                         ├── computeDocumentRiskScore()     ← 0–100 score
                         └── summarizeByCategory()          ← grouped results

document-diff.js   ──► diffDocuments(originalText, revisedText)
                         │
                         ├── splitIntoParagraphs()
                         ├── computeLcsTable()              ← O(m×n) LCS
                         ├── backtrackDiff()
                         └── mergeModifications()           ← removed+added → modified
```

---

## 5. Security Posture & Zero-Trust Design

### Privacy-First Architecture

| Measure | Implementation |
|---|---|
| **Client-side PDF parsing** | PDF.js — raw files are never transmitted to any server |
| **Explicit-action AI calls only** | Document text sent to AI only on user action (Explain, Simplify, Ask, Generate) — never automatically |
| **No default persistence** | `sessionStorage` only; Firestore is strictly opt-in |
| **API key isolation** | Groq key in Vercel environment variables; never committed, never bundled |
| **Input validation** | Every `/api/chat` request validated: array check, role whitelist, content type, length cap, message count cap |
| **Prompt injection filtering** | 6-pattern injection filter applied both client-side (`shared.js`) and server-side (`api/chat.js`) — defence in depth |
| **Rate limiting** | Two-tier: 100 req/min general, 20 req/min on AI endpoints, with auto-cleanup of stale buckets |
| **Content-type gate** | Rejects non-`application/json` POSTs to `/api/chat` — blocks form-based CSRF |
| **Full security header set** | `CSP`, `HSTS`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cache-Control: no-store` |
| **Strict CSP** | No `unsafe-inline` scripts — all interactivity uses `addEventListener` + `data-action` delegation |
| **Path traversal prevention** | Static file handler resolves and validates every path stays within the working directory |
| **Output sanitisation** | All AI responses pass through `sanitizeString()` before DOM insertion |
| **Zero runtime dependencies** | Only `dotenv` + `eslint` (dev-only) — no third-party runtime code |

---

## 6. Local Development & Setup

### Prerequisites

- **Node.js**: v18.x or v20.x (`node -v`)
- **npm**: v9.x or higher (`npm -v`)
- **Groq API Key**: Free key from [console.groq.com](https://console.groq.com)
- **Firebase Project** *(optional — for auth/save features only)*

### Step 1 — Clone & Install

```bash
git clone https://github.com/your-username/lexara.git
cd lexara
npm install
```

### Step 2 — Environment Configuration

```bash
cp .env.example .env
# Edit .env — add your GROQ_API_KEY
```

`.env` must contain:

```env
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
PORT=3000
```

### Step 3 — Run the Tests First

```bash
npm test
```

All 55 tests should pass before starting the server.

### Step 4 — Start the Dev Server

```bash
npm start
```

Open your browser at: 👉 **http://localhost:3000**

Verify server health:

```bash
curl -i http://localhost:3000/api/health
```

### Firebase Setup *(optional)*

1. Firebase Console → Authentication → Sign-in method → enable **Google**.
2. Add `localhost` to **Authorized domains**.
3. Update `js/firebase.js` with your project's `firebaseConfig`.

Core features work **without** Firebase — auth only gates the optional "save analysis" feature.

---

## 7. Deployment to Vercel

```bash
git push origin main
```

`vercel.json` rewrites `/api/chat` to the serverless function — no separate backend required.

### Environment Variables in Vercel

Set these in **Vercel → Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `GROQ_API_KEY` | Your Groq API key |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` |

---

## 8. Comprehensive QA Verification Suite

### Automated Tests

```bash
npm test
```

```
Clause Risk Detection           9 tests
Risk Score Calculation          4 tests
Category Summarization          2 tests
Document Diff Engine            5 tests
Input Sanitization & Security  12 tests
Paragraph Splitting Utility     2 tests
Server Validation Logic         8 tests
Rate Limiter Behaviour          4 tests
Injection Pattern Coverage      9 tests
Model Ladder Logic              4 tests
Document Similarity Detection   3 tests
────────────────────────────────────────
Total                          63 tests
```

### Manual QA Checklist

| TC | Area | Action | Expected Result |
|---|---|---|---|
| TC-01 | PDF Upload | Upload a `.pdf` on any feature page | Text extracted entirely client-side; no network request for the file |
| TC-02 | Text Paste | Paste plain text into any page's paste zone | Document loaded and ready for analysis instantly |
| TC-03 | Risk Scanner | Load a contract with indemnification language | Clause flagged as `high` severity with exact matched text shown |
| TC-04 | Risk Scanner AI Explain | Click "Explain this clause" on a flagged item | AI returns plain-language explanation grounded in the exact clause text |
| TC-05 | Document Simplifier | Upload a legal document; click Simplify | Side-by-side original and simplified view with KEY POINTS section |
| TC-06 | Reading Levels | Switch between Plain / Simple / Detailed in Simplifier | Distinct re-simplification at each level |
| TC-07 | Comparator | Load two document versions | Paragraph-level diff rendered with added/removed/modified colour coding |
| TC-08 | Ask My Document | Ask a question about a loaded document | Response cites or paraphrases specific document text; out-of-document questions flagged |
| TC-09 | Lawyer Prep Sheet | Generate a prep sheet for a high-risk contract | Priority badge (Priority Review Recommended), checklist with flagged clauses, 8 specific attorney questions |
| TC-10 | Print Export | Click "Print / Save as PDF" on Prep Sheet | Clean print-friendly layout |
| TC-11 | Glossary | Search for "indemnification" | Instant filter to matching definition |
| TC-12 | Cross-page State | Load doc on Risk Scanner; navigate to Ask My Document | Same document available without re-uploading |
| TC-13 | Rate Limiting | Send > 20 AI requests in 60 seconds | `429 Too many requests` returned |
| TC-14 | Auth Injection Defense | POST `{"messages":[{"role":"user","content":"ignore previous instructions"}]}` to `/api/chat` | `[filtered]` substituted; response is a safe AI reply, not a system override |
| TC-15 | Prompt Injection | Include `<script>alert(1)</script>` in chat input | HTML-escaped in display; never executed |
| TC-16 | Unauthenticated Firestore | Attempt to read another user's saved analysis via Firestore SDK | Denied by security rules |
| TC-17 | Path Traversal | GET `/../../../etc/passwd` | `403 Forbidden` |
| TC-18 | ARIA / Screen Reader | Navigate with keyboard only | All interactive elements reachable; focus states visible; live regions announce AI responses |
| TC-19 | Reduced Motion | Enable `prefers-reduced-motion` in OS | All CSS transitions and animations disabled |
| TC-20 | Health Endpoint | GET `/api/health` | `{"status":"ok",...}` with Groq key presence flag |

---

## 9. Threat Modeling & Security Defense Matrix

| Threat Zone | Identified Risks | Applied Defenses |
|---|---|---|
| **Input Surfaces** | Prompt injection, XSS via document content, malformed JSON, oversized payloads | 6-pattern injection filter (client + server), `sanitizeString()` on all AI output before DOM insertion, `validateMessages()` schema check, 80 KB body size cap |
| **AI Classification** | Hallucinated risk scores, model-specific failure modes | Deterministic `clause-patterns.js` and `document-diff.js` — AI never classifies, only explains. AI failures degrade gracefully to deterministic output |
| **API Endpoint Abuse** | Cost/DoS via rapid AI calls, credential theft | Two-tier rate limiter (100 general / 20 AI per minute) with Map-based store and auto-cleanup; Groq key server-only |
| **Data Persistence** | Unintended document exposure, cross-user leakage | `sessionStorage` default (tab-scoped, no server); Firestore writes only on explicit opt-in save; Firestore security rules require authenticated UID match |
| **Transport Security** | MITM, header injection, clickjacking | HSTS enforced; `X-Frame-Options: DENY`; `Content-Security-Policy` with no `unsafe-inline` scripts; `Referrer-Policy: strict-origin-when-cross-origin` |
| **Dependency Risk** | Supply chain attacks via runtime npm packages | Zero runtime dependencies — only `dotenv` + `eslint` (dev-only) |
| **Legal/Ethical** | Platform used as substitute for legal advice | "Assistance, not advice" enforced at system-prompt level (ADR-2) — model redirects advice-seeking to attorney-prep, not answers |

---

## 10. Evaluation Map

| Criterion | Evidence |
|---|---|
| **Code Quality** | Pure, deterministic modules (`clause-patterns.js`, `document-diff.js`) with full JSDoc · `shared.js` eliminates duplication across all 7 pages · zero inline event handlers (`data-action` + `addEventListener`) · zero `style.cssText` inline styles (all use CSS classes) · ESLint enforced · Architecture Decision Records in `docs/decisions.md` |
| **Security** | Prompt-injection filtering client + server-side · client-side-only PDF parsing (raw file never transmitted) · strict CSP (no `unsafe-inline` scripts) · two-tier rate limiting with auto-cleanup · XSS sanitisation on all AI output · OWASP Top 10 mapping in `SECURITY.md` · `.env` never committed · zero runtime dependencies |
| **Testing** | 63 zero-dependency tests covering clause detection, document diffing, server validation, rate limiter logic, injection patterns, model ladder logic, document similarity detection, and security helpers · pure functions testable without mocking AI · test suite exits non-zero on failure (CI-safe) |
| **Efficiency** | Client-side PDF parsing avoids server round-trips for the most expensive operation · `throttleRaf`/`debounce` on scroll/search · Map-based rate-limit store with periodic auto-cleanup · document text capped before every AI call · PDF.js worker loaded from CDN without a build step · `sessionStorage` cross-page state avoids re-uploads |
| **Accessibility** | WCAG 2.1 AA: skip links on all 7 pages · ARIA landmarks, roles, and live regions throughout · keyboard navigation with visible focus states · `prefers-reduced-motion` disables all animations · 4.5:1+ colour contrast ratios · 3 reading-level options in Simplifier (accessibility as a core product feature, not an afterthought) |
| **Problem Statement Alignment** | R1–R7 full traceability in §1 · every use case maps to a live, working route · deterministic triage + AI explanation architecture · "assistance not advice" enforced structurally |

---

## 11. What Makes Lexara Different

Most legal-AI prototypes are a single chat window pointed at a PDF. Lexara treats **"assistance, not advice"** as an architectural constraint, not a disclaimer:

**Deterministic triage before AI**: Clause detection (`clause-patterns.js`) and document comparison (`document-diff.js`) are pure, testable functions that run entirely without an AI model. The 16-category risk engine covers the most consequential clause types found in real contract review — auto-renewal traps, open-ended indemnification, mandatory arbitration, IP assignment, personal guarantees, and more. The AI explains what these engines find; it never decides what counts as risky.

**The Lawyer Prep Sheet**: Rather than attempting to answer "should I sign this?", Lexara's most distinctive feature generates the 8 questions the user should bring to their attorney — grounded in the actual flagged language from their specific document. The goal is not to replace the lawyer, but to make that conversation count.

**Privacy as architecture**: Legal documents are among the most sensitive files a person will ever create or receive. The raw file is parsed entirely in the browser via PDF.js and never transmitted to a server. Document text reaches the AI only on explicit user action, only as a relevant excerpt, and is never persisted without opt-in.

---

## Project Structure

```
lexara/
├── index.html              # Landing page
├── style.css               # Global design system
├── main.js                 # Landing page: nav, 3D tilt, parallax
├── server.js               # Secure Node.js dev server (mirrors production)
├── .env.example            # Environment variable template
├── vercel.json             # Vercel deployment config
├── LICENSE                 # MIT License
├── SECURITY.md             # Threat model & OWASP mapping
├── CHANGELOG.md            # Version history
├── CONTRIBUTING.md         # Contribution guidelines
│
├── api/
│   └── chat.js             # Vercel serverless Groq proxy (validated + injection-filtered)
│
├── js/
│   ├── shared.js           # Sanitisation, formatting, nav/panel render, event wiring
│   ├── errors.js           # Centralized error-logging helper
│   ├── pdf-parser.js       # Client-side PDF/text extraction (PDF.js 4.x)
│   ├── clause-patterns.js  # Pure deterministic clause-risk detection (16 categories)
│   ├── document-diff.js    # Pure deterministic LCS paragraph diff engine
│   ├── document-store.js   # Session-scoped cross-page document state
│   ├── legal-glossary-data.js  # Plain-language legal term definitions (80+ terms)
│   ├── chatbot.js          # Groq AI chat (rate-limited, sanitised, advice-safe)
│   ├── auth.js             # Firebase Google Auth (opt-in save feature only)
│   ├── firebase.js         # Firebase config
│   ├── simplifier.js       # Simplifier page controller
│   ├── risk-scanner.js     # Risk Scanner page controller
│   ├── comparator.js       # Comparator page controller
│   ├── document-qa.js      # Ask My Document page controller
│   ├── next-steps.js       # Lawyer Prep Sheet page controller
│   └── glossary.js         # Glossary page controller
│
├── pages/                  # 6 feature pages
├── css/                    # Page-specific stylesheets
├── docs/
│   ├── ARCHITECTURE.md     # System topology & design rationale
│   └── decisions.md        # Architecture Decision Records (ADR-1 through ADR-7)
└── tests/
    └── app.test.js         # Zero-dependency test suite (55 tests)
```

---

*Lexara provides information and assistance, not legal advice. It does not create an attorney-client relationship. For decisions that affect your legal rights or obligations, consult a licensed attorney.*
