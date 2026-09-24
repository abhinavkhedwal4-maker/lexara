/**
 * @fileoverview Lexara — Vercel Serverless Function
 * @description Secure Groq API proxy with input validation and
 *              prompt-injection filtering. Deployed at /api/chat via
 *              vercel.json rewrite — the only backend component in
 *              production. Never persists document text or chat content.
 */

'use strict';

const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_MESSAGES = 50;
const MAX_CONTENT  = 8000; // higher than typical chat apps — must fit document excerpts

/**
 * Ordered fallback ladder: primary model first, then progressively more
 * conservative alternatives. Provides resilience against model deprecation,
 * quota exhaustion, and transient availability issues.
 * @type {ReadonlyArray<string>}
 */
const MODEL_LADDER = Object.freeze([
  'llama-3.3-70b-versatile',   // Primary — best reasoning for legal context
  'llama-3.1-8b-instant',      // Fallback 1 — fast, still instruction-following
  'mixtral-8x7b-32768',        // Fallback 2 — wide context window, useful for long docs
]);

/** Patterns indicating an attempt to override the system prompt */
const INJECTION_PATTERNS = [
  /ignore (all |previous |prior )?instructions/gi,
  /disregard (all |previous |your )?(prompts|instructions)/gi,
  /new instructions\s*:/gi,
  /^system\s*:/gim,
  /you are now/gi,
  /\[INST\]|<\|im_start\|>/gi,
];

/**
 * Sanitises a string to prevent XSS injection.
 * @param {string} str
 * @returns {string}
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .slice(0, MAX_CONTENT);
}

/**
 * Neutralises common prompt-injection patterns. Applied only to the LAST
 * user message (not system/document-context messages, which are trusted
 * server-controlled content built by our own frontend).
 * @param {string} str
 * @returns {string}
 */
function sanitizePromptInjection(str) {
  if (typeof str !== 'string') return '';
  return INJECTION_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, '[filtered]'), str);
}

/**
 * Validates the incoming messages array.
 * @param {*} messages
 * @returns {{valid:boolean, sanitized?:Array, error?:string}}
 */
function validateMessages(messages) {
  if (!Array.isArray(messages))       return { valid: false, error: 'messages must be an array' };
  if (messages.length === 0)          return { valid: false, error: 'messages array is empty' };
  if (messages.length > MAX_MESSAGES) return { valid: false, error: 'too many messages' };

  const validRoles = new Set(['user', 'assistant', 'system']);
  const sanitized = [];

  messages.forEach((msg, i) => {
    if (!msg || typeof msg !== 'object') throw new Error('invalid message object');
    if (!validRoles.has(msg.role)) throw new Error(`invalid role: ${msg.role}`);
    if (typeof msg.content !== 'string') throw new Error('content must be string');
    if (!msg.content.trim()) throw new Error('content cannot be empty');

    const isLastUserMessage = msg.role === 'user' && i === messages.length - 1;
    const content = isLastUserMessage
      ? sanitizeString(sanitizePromptInjection(msg.content))
      : sanitizeString(msg.content);

    sanitized.push({ role: msg.role, content });
  });

  return { valid: true, sanitized };
}

/**
 * Attempts a Groq API call against a single model.
 * @param {string} model
 * @param {Array} sanitizedMessages
 * @returns {Promise<{ok:boolean, status:number, reply?:string, error?:string, modelNotFound?:boolean}>}
 */
async function tryGroqModel(model, sanitizedMessages) {
  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: sanitizedMessages,
        temperature: 0.4,
        max_tokens: 900,
        stream: false,
      }),
    });

    const data = await groqRes.json();

    if (!groqRes.ok) {
      const errMsg = data.error?.message || 'Groq API error';
      const modelNotFound = data.error?.code === 'model_not_found' || /does not exist/i.test(errMsg);
      return { ok: false, status: groqRes.status, error: errMsg, modelNotFound };
    }

    const reply = data.choices?.[0]?.message?.content;
    return { ok: true, status: 200, reply: reply || null };
  } catch (err) {
    return { ok: false, status: 502, error: err.message };
  }
}

/**
 * Vercel serverless handler for the /api/chat endpoint.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    res.status(415).json({ error: 'Content-Type must be application/json' });
    return;
  }

  if (!process.env.GROQ_API_KEY) {
    res.status(503).json({ error: 'AI service not configured' });
    return;
  }

  let validation;
  try {
    validation = validateMessages(req.body?.messages);
  } catch (err) {
    res.status(400).json({ error: err.message });
    return;
  }

  if (!validation.valid) {
    res.status(400).json({ error: validation.error || 'Invalid request' });
    return;
  }

  // Build the model ladder: env override first, then the static fallback list
  const envModel = process.env.GROQ_MODEL;
  const ladder = envModel
    ? [envModel, ...MODEL_LADDER.filter((m) => m !== envModel)]
    : [...MODEL_LADDER];

  let lastError = 'Failed to reach AI service. Please try again.';
  let lastStatus = 502;

  for (const model of ladder) {
    const result = await tryGroqModel(model, validation.sanitized);

    if (result.ok) {
      if (!result.reply) {
        res.status(500).json({ error: 'Empty AI response' });
        return;
      }
      res.status(200).json({ reply: result.reply });
      return;
    }

    if (result.modelNotFound) {
      // Model doesn't exist — try next in ladder immediately
      console.warn(`[Groq Fallback] Model "${model}" not found — trying next in ladder`);
      continue;
    }

    // For non-model-not-found errors (rate limits, 5xx), record and try next
    lastError = result.error || lastError;
    lastStatus = result.status || lastStatus;
    console.warn(`[Groq Fallback] Model "${model}" failed (${result.status}): ${result.error}`);
  }

  console.error('[Groq Proxy Error] All models in ladder exhausted:', lastError);
  res.status(lastStatus >= 400 && lastStatus < 600 ? lastStatus : 502).json({ error: lastError });
}