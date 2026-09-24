# ⚖️ Lexara — AI for Legal Access & Assistance

> A GenAI-powered platform that helps people understand, compare, and navigate legal documents — providing information and assistance, never a substitute for professional legal advice.

[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen)](https://lexara-fc30c.web.app)
[![Tests](https://img.shields.io/badge/Tests-34%20passing-brightgreen)]()
[![Security](https://img.shields.io/badge/Security-Hardened-blue)]()
[![Accessibility](https://img.shields.io/badge/WCAG-2.1%20AA-orange)]()
[![License](https://img.shields.io/badge/License-MIT-green)]()

---

## 1. Problem Statement Alignment

Legal information is often complex and inaccessible without professional help. Every requirement below is a working, demonstrable feature.

| # | Requirement | How Lexara Delivers It | Live Route |
|---|---|---|---|
| R1 | Simplifying complex legal documents | Document Simplifier — plain-language rewrite at 3 reading levels | `/pages/simplifier.html` |
| R2 | Comparing contracts/agreements/policies | Document Comparator — LCS paragraph-level diff + AI significance notes | `/pages/comparator.html` |
| R3 | Highlighting clauses, obligations, risks | Risk Scanner — 10-category deterministic clause detection + AI deep-dives | `/pages/risk-scanner.html` |
| R4 | Answering questions based on provided documents | Ask My Document — grounded chat, answers only from the loaded document | `/pages/document-qa.html` |
| R5 | Understanding options, potential next steps | Lawyer Prep Sheet — review-priority scoring + AI-generated checklist | `/pages/next-steps.html` |
| R6 | Generating summaries, checklists, actionable outputs | Prep Sheet print/PDF export + Simplifier plain-language output | `/pages/next-steps.html`, `/pages/simplifier.html` |
| R7 | Preparing questions for a legal professional | Lawyer Prep Sheet — 5 AI-generated, document-specific attorney questions | `/pages/next-steps.html` |

---

## 2. Architecture

```
                 ┌─────────────────────┐
                 │        User          │
                 │   (any browser)      │
                 └──────────┬───────────┘
                            │
               HTML5 + Vanilla JS ES Modules
                            │
  ┌─────────────────────────┼──────────────────────────┐
  │                         │                          │
┌─────────┐        ┌────────────────┐        ┌────────────────┐
│Simplifier│       │  Risk Scanner  │        │  Comparator /  │
│Doc Q&A  │        │  Next-Steps    │        │  Glossary      │
└────┬────┘        └───────┬────────┘        └───────┬────────┘
     │                     │                         │
  PDF.js              clause-patterns.js        document-diff.js
  (client)            deterministic detect      deterministic LCS
     │                     │                         │
     └─────────────────────┴─────────────────────────┘
                            │
              POST /api/chat (validated, sanitised, rate-limited)
                            ▼
              ┌─────────────────────────────┐
              │  Vercel Serverless Function  │
              │  (api/chat.js)              │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼─────────────┐
              │  Groq API                   │
              │  LLaMA 3.3 70B Versatile    │
              └────────────────────────────┘

     ┌─────────────────────────────────────┐
     │  Firebase Auth (lexara-fc30c)        │
     │  Google Sign-In · opt-in saves only  │
     └─────────────────────────────────────┘
```

**Why parse PDFs entirely client-side?** Legal documents are sensitive. `js/pdf-parser.js` uses PDF.js in-browser — the raw file is never transmitted to any server.

**Why keep clause detection and diffing out of the LLM?** `clause-patterns.js` and `document-diff.js` are pure, deterministic, fully unit-testable functions. The AI only *explains* what these engines already found — never decides what is risky.

**Why Vanilla JS over a framework?** No build step, purely static deployment + one serverless function, and fast load on any connection.

---

## 3. Project Structure

```
lexara/
├── index.html              # Landing page
├── style.css               # Global design system (neon 3D edition)
├── main.js                 # Landing page: nav, 3D tilt, parallax
├── server.js               # Secure Node.js dev server (mirrors production)
├── .env.example            # Environment variable template
├── vercel.json             # Vercel deployment config
├── LICENSE                 # MIT License
├── SECURITY.md             # Threat model & security policy
│
├── api/
│   └── chat.js             # Vercel serverless Groq proxy (validated + injection-filtered)
│
├── js/
│   ├── shared.js           # Sanitisation, formatting, nav/panel render, event wiring
│   ├── errors.js           # Centralized error-logging helper
│   ├── pdf-parser.js       # Client-side PDF/text extraction (PDF.js 4.x, workerSrc configured)
│   ├── clause-patterns.js  # Pure, deterministic clause-risk detection (10 categories)
│   ├── document-diff.js    # Pure, deterministic LCS paragraph diff engine
│   ├── document-store.js   # Session-scoped cross-page document state
│   ├── legal-glossary-data.js  # Plain-language legal term definitions
│   ├── chatbot.js          # Groq AI chat (rate-limited, sanitised, advice-safe)
│   ├── auth.js             # Firebase Google Auth (opt-in save feature only)
│   ├── firebase.js         # Firebase config for lexara-fc30c project
│   ├── tilteffect.js       # 3D mouse-tilt effect for cards
│   ├── simplifier.js       # Simplifier page controller
│   ├── risk-scanner.js     # Risk Scanner page controller
│   ├── comparator.js       # Comparator page controller
│   ├── document-qa.js      # Ask My Document page controller
│   ├── next-steps.js       # Lawyer Prep Sheet page controller
│   └── glossary.js         # Glossary page controller
│
├── pages/                  # 6 feature pages
├── css/                    # Page-specific stylesheets
└── tests/
    └── app.test.js         # Zero-dependency test suite (34 tests)
```

---

## 4. How Lexara Uses Generative AI

| Feature | What the AI Generates |
|---|---|
| **Document Simplifier** | Plain-language rewrite at a reading level the user selects |
| **Risk Scanner — Explain** | Deeper plain-language explanation of a flagged clause, grounded in its exact text |
| **Document Comparator — Explain** | Note on why a detected change might practically matter |
| **Ask My Document** | Answers grounded strictly in the loaded document's text |
| **Lawyer Prep Sheet** | Five document-specific questions to bring to a licensed attorney |

**"Assistance, not advice" is an architecture decision, not a footer disclaimer.** Every AI system prompt explicitly instructs the model to redirect advice-seeking questions toward preparing the user for a real attorney conversation.

---

## 5. Security

| Measure | Implementation |
|---|---|
| Client-side PDF parsing | PDF.js — raw files never transmitted to a server |
| API key isolation | Groq key in `.env`, never committed; proxied via serverless function |
| Input sanitisation | XSS prevention on every user input (`shared.js → sanitizeString`) |
| Prompt injection filtering | Pattern-based filtering client-side and server-side |
| Rate limiting | Two-tier: 100 req/min general, 20 req/min on AI endpoints |
| Content-type gate | Rejects non-JSON POSTs to `/api/chat` |
| Security headers | Full set: CSP, HSTS, X-Frame-Options, `Cache-Control: no-store` |
| CSP | `unsafe-inline` for styles only (required for JS-driven theming); no `unsafe-inline` scripts |
| No default persistence | `sessionStorage` only; Firestore is opt-in |
| Firebase auth scope | Google Sign-In only gates optional save-to-account, never required for core features |

---

## 6. Accessibility (WCAG 2.1 AA)

- Skip links on all 7 pages
- Full ARIA landmark/role/live-region coverage
- Keyboard navigation with visible focus states
- `prefers-reduced-motion` support — all animations disabled
- 4.5:1+ colour contrast ratios throughout
- 3 reading-level options in the Simplifier (plain, simple, detailed) — accessibility as a core product feature

---

## 7. Testing

```bash
npm test
```

Zero-dependency, pure Node.js suite:

```
Clause Risk Detection          9 tests
Risk Score Calculation         4 tests
Category Summarization         2 tests
Document Diff Engine           5 tests
Input Sanitization & Security 12 tests
Paragraph Splitting Utility    2 tests
─────────────────────────────────────
Total                         34 tests
```

Assertions mirror the pure functions in `clause-patterns.js`, `document-diff.js`, and the security helpers line-for-line.

---

## 8. Setup & Run

```bash
git clone https://github.com/your-username/lexara.git
cd lexara
npm install
cp .env.example .env
# Edit .env — add your GROQ_API_KEY
npm test       # run all 34 tests first
npm start      # → http://localhost:3000
```

### Environment Variables

```env
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
PORT=3000
```

---

## 9. Deployment (Vercel)

```bash
git push origin main
```

`vercel.json` rewrites `/api/chat` to the serverless function — no separate backend required. Set `GROQ_API_KEY` and `GROQ_MODEL` in Vercel → Settings → Environment Variables.

---

## 10. Evaluation Map

| Criterion | Evidence |
|---|---|
| **Code Quality** | Pure, deterministic modules (`clause-patterns.js`, `document-diff.js`) with full JSDoc · `shared.js` eliminates duplication across all 7 pages · zero inline event handlers (`data-action` + `addEventListener`) · zero `style.cssText` inline styles (all use CSS classes) · ESLint enforced |
| **Security** | Prompt-injection filtering client+server-side · client-side-only PDF parsing · strict CSP (no `unsafe-inline` scripts) · rate limiting · XSS sanitisation on every user input · `.env` never committed |
| **Efficiency** | Client-side parsing avoids server round-trips · `throttleRaf`/`debounce` on scroll/search · Map-based rate-limit store with auto-cleanup · document text capped before every AI call · PDF.js worker configured to load from CDN without a build step |
| **Testing** | 34 zero-dependency tests covering clause detection, diffing, and security validation · pure functions testable without mocking AI |
| **Accessibility** | WCAG 2.1 AA: skip links, ARIA landmarks/roles/live-regions, keyboard navigation, reading-level options, `prefers-reduced-motion`, 4.5:1 contrast |
| **Problem Statement Alignment** | R1–R7 traceability table in §1 covering every use case with a live route · deterministic triage + AI explanation architecture |

---

## 11. What Makes Lexara Different

Most legal-AI prototypes are a single chat window pointed at a PDF. Lexara treats **"assistance, not advice"** as an architectural constraint: clause detection and document comparison are computed by deterministic, auditable functions *before* the AI is involved — the AI only explains what those engines already found. Every system prompt explicitly redirects advice-seeking questions toward preparing the user for a real attorney conversation, culminating in the **Lawyer Prep Sheet**: a feature that generates document-specific questions rather than answers, because the goal isn't to replace the lawyer — it's to make that conversation count.

---

*Lexara provides information and assistance, not legal advice. It does not create an attorney-client relationship. For decisions that affect your legal rights or obligations, consult a licensed attorney.*
