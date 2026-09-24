# Contributing to Lexara

Thanks for your interest. This document explains how to set up the project, the quality bar every change must clear, and how to open a pull request.

## Setup

```bash
npm install
cp .env.example .env      # add your GROQ_API_KEY
npm test
npm start                 # http://localhost:3000
```

## Project Layout
Feature-per-page architecture: each page under `pages/` has one matching JS controller in `js/` and one CSS file in `css/`. Shared logic (sanitization, chat, navbar/chat-panel rendering) lives in `js/shared.js`. Pure, deterministic logic (`clause-patterns.js`, `document-diff.js`, `pdf-parser.js`) is kept dependency-free and fully unit tested — no DOM access, no fetch calls, no AI calls. See `docs/ARCHITECTURE.md` for the full request lifecycle and `docs/decisions.md` for the reasoning behind key choices.

## Quality Bar (run before pushing — CI enforces both)

| Command | What it checks |
|---|---|
| `npm run lint` | ESLint, zero warnings required |
| `npm test` | Full test suite — clause detection, diffing, security, data integrity |

## Code Style
- No inline event handlers (`onclick=""`, etc.) — use `data-action` attributes wired through `wireGlobalActions()` in `js/shared.js`. This keeps the CSP free of `unsafe-inline` on scripts.
- Every exported function requires a complete JSDoc block: description, `@param` for every parameter, `@returns`.
- One responsibility per function — page controllers only render DOM and wire events; all calculation/detection logic lives in the pure modules (`clause-patterns.js`, `document-diff.js`).
- Never add advice-giving language to an AI system prompt. If a new feature involves the AI making a recommendation, it must be framed as "here's what to ask a lawyer," not "here's what you should do."

## Tests
Add tests to `tests/app.test.js`, mirroring the pure function you're testing line-for-line where practical. Cover the happy path, edge cases (empty input, extreme values), and any new clause pattern or diff scenario you introduce.

## Commit Conventions
Conventional Commits, imperative mood: `feat(risk-scanner): add non-solicitation clause pattern`, `fix(comparator): handle empty document diff correctly`.

## Reporting Security Issues
Do not open a public issue with exploit details. Follow `SECURITY.md`.