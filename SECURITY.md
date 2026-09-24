# Security Policy

## Threat Model
Lexara processes legal documents, which are inherently sensitive — financial terms, personal names, employment conditions, and other private information may appear in any uploaded file. The assets worth protecting are: the Groq API key, the confidentiality of document content in transit, and service availability. The realistic threats are prompt-injection attempts through chat or document text, abuse of the AI endpoint (cost/DoS), unintended document persistence, and leakage of stack traces or credentials.

## Controls in Place

- **Client-side PDF parsing**: uploaded files are parsed to text entirely in the browser via PDF.js. The raw file is never transmitted to any server.
- **Explicit-action AI calls only**: document text is sent to the AI endpoint only when the user takes a specific action (Explain, Simplify, Ask, Generate Prep Sheet) — never automatically on upload.
- **No default persistence**: document text lives in `sessionStorage` only, cleared when the browser tab closes. Firestore is used exclusively for an opt-in "save my analysis" feature.
- **Secrets**: the Groq API key lives only in Vercel environment variables (or local `.env`), never in the repository, client bundle, or git history.
- **Input validation**: every request to `/api/chat` is validated with a strict schema — unknown roles rejected, empty content rejected, message count capped.
- **Prompt injection filtering**: the last user message in every request is scanned for common override patterns ("ignore previous instructions," "new instructions:," etc.) and neutralized before reaching the model — applied both client-side (`shared.js`) and server-side (`server.js` / `api/chat.js`) as defense in depth.
- **Rate limiting**: two-tier — 100 requests/15min general, 20 requests/15min on the AI endpoint specifically, since AI calls are more expensive and more valuable to an attacker attempting abuse.
- **JSON content-type gate**: POST requests to `/api/chat` must declare `Content-Type: application/json`, blocking cross-site form-based CSRF attempts.
- **Security headers**: `Content-Security-Policy` (no `unsafe-inline` scripts — all interactivity uses `addEventListener`, not inline `onclick`), `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`, `Cache-Control: no-store` on API responses.
- **Path traversal prevention**: static file serving resolves and validates every path stays within the working directory.
- **Output rendering**: all AI responses pass through `sanitizeString()` before being inserted as HTML, preventing a successfully-injected prompt from smuggling markup to the client.
- **Error hygiene**: one central error path returns sanitized `{ error }` bodies; stack traces are logged server-side only.

## OWASP Top 10 (2021) Mapping

| Risk | Status | Our Mitigation |
|---|---|---|
| A01: Broken Access Control | ✅ Mitigated | Firestore Security Rules require authentication for all writes; core features require no auth at all |
| A02: Cryptographic Failures | ✅ Mitigated | HTTPS/HSTS enforced; no document content or sensitive data stored server-side |
| A03: Injection | ✅ Mitigated | Input validation, HTML sanitization, and prompt-injection pattern filtering at every boundary |
| A04: Insecure Design | ✅ Mitigated | Threat model documented above; deterministic clause/diff logic kept out of the LLM by design |
| A05: Security Misconfiguration | ✅ Mitigated | Full security header set; CSP with no `unsafe-inline` scripts |
| A06: Vulnerable Components | ✅ Mitigated | Zero runtime dependencies (only `dotenv` + `eslint` dev-only) |
| A07: Authentication Failures | ✅ Mitigated | Firebase Auth for the opt-in save feature; rate limiting on all endpoints |
| A08: Software/Data Integrity | ✅ Mitigated | CI runs lint + full test suite on every push before merge |
| A09: Logging Failures | ✅ Mitigated | Structured `console.error` with module tags for every failure path |
| A10: SSRF | N/A | No server-side requests to user-supplied URLs anywhere in the app |

## Authentication Decision
Every core feature — simplifying, scanning, comparing, asking questions, and generating a prep sheet — works fully anonymously. Sign-in exists only to gate the optional "save my analysis to my account" feature. This minimizes the amount of personal data the platform ever needs to collect, which matters especially given the sensitivity of the documents involved.

## Known Tradeoff: Prompt-injection filtering is pattern-based, not exhaustive
Pattern-based filtering (`sanitizePromptInjection`) catches common, known injection phrasings but cannot guarantee detection of every possible override attempt. This is combined with a structurally advice-safe system prompt (see `docs/decisions.md`, ADR-2) as a second layer of defense — even a successful injection is constrained by instructions that redirect advice-seeking behaviour rather than relying on injection filtering alone.

## Reporting a Vulnerability
Open a GitHub issue titled `[security]` (no exploit details in the issue itself), or contact the maintainer directly. Response within 48 hours. The same contact is published at `/.well-known/security.txt` (RFC 9116).

## Incident Response
1. **Identify** — confirm the security event via rate-limit or error logs
2. **Contain** — rotate the Groq API key in Vercel environment variables if compromised
3. **Eradicate** — patch the vulnerable code path, add a regression test to `tests/app.test.js`
4. **Recover** — redeploy via `git push origin main`
5. **Review** — document the root cause in `CHANGELOG.md`