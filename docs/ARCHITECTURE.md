# Architecture

A user opens any page — all served statically from Vercel's edge network. When they upload a PDF or paste text, `pdf-parser.js` extracts the text entirely in the browser using PDF.js — the raw file never leaves the client. The extracted text is held in `document-store.js` (sessionStorage-backed) so it can be reused across pages within the same tab without re-uploading.

On the Risk Scanner page, the document text is passed to `clause-patterns.js`, a pure, deterministic pattern-matching engine that flags common risk-bearing clause categories (auto-renewal, indemnification, arbitration, liability caps, etc.) using regex patterns grounded in standard contract-review taxonomy. This detection never touches the AI — it is the same kind of safety-relevant classification that stays testable and repeatable regardless of model behaviour.

Only when a user explicitly requests it (clicking "Explain this clause," "Simplify," "Ask a question," or "Generate my prep sheet") does document text get sent to `/api/chat` — a Vercel serverless function that validates and sanitizes the request, filters prompt-injection patterns from the user's message, and proxies to Groq's LLaMA 3.3 70B with a system prompt that structurally enforces the "information and assistance, not advice" boundary described in `SECURITY.md` and `README.md`.

The Document Comparator uses a second pure function, `document-diff.js` — a paragraph-level LCS (Longest Common Subsequence) diff — to determine what changed between two document versions before any AI involvement. The AI is only invoked afterward, to explain the practical significance of a change the deterministic diff already found.

Firebase Auth and Firestore are used only for the optional "save my analysis" feature — sign-in is never required to use any core feature, and no document text is written to Firestore automatically.

Browser (HTML5 + Vanilla JS ES Modules + PDF.js)
├── index.html Landing page
├── pages/simplifier Plain-language rewriting
├── pages/risk-scanner Clause detection + AI explanation
├── pages/comparator Document diffing + AI significance notes
├── pages/document-qa Grounded chat over the loaded document
├── pages/next-steps Lawyer Prep Sheet generator
└── pages/glossary Static plain-language term reference
│
│ POST /api/chat (validated, sanitized, rate-limited)
▼
Vercel Serverless Function (api/chat.js)
│
▼
Groq API — LLaMA 3.3 70B Versatile
│
Firebase Auth + Firestore (opt-in only)
└── Google Sign-In → saved analysis history


**Why parse PDFs client-side instead of server-side?** Legal documents are sensitive by nature. Never having the raw file touch a server — parsing entirely in the browser via PDF.js — is both a genuine privacy improvement and a meaningful trust signal for a legal-assistance tool specifically.

**Why keep clause detection out of the LLM?** Deterministic, regex-based detection means the same document always produces the same flagged clauses, which is testable without mocking an AI model and auditable by a human reviewer. The AI's role is explanation, not classification — this mirrors best practice for any safety- or compliance-relevant logic in a GenAI product.

**Why Vanilla JS over a framework?** Eliminates build tooling, keeps the Vercel deployment purely static + one serverless function, and loads fast on any connection.