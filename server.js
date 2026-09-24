/**
 * @fileoverview Lexara — Local Development Server
 * @description Secure Node.js server mirroring api/chat.js's validation
 *              and Groq-proxy logic exactly, so `npm start` behaves
 *              identically to the Vercel production deployment.
 * @version 1.0.0
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const PORT        = parseInt(process.env.PORT, 10) || 3000;
const MAX_BODY    = 1024 * 80;
const RATE_WINDOW = 60 * 1000;
const GENERAL_RATE_LIMIT = 100;
const AI_RATE_LIMIT      = 20;

/** @type {Map<string, {count:number, reset:number}>} */
const rateLimitStore = new Map();

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',  // local PDF.js ESM bundles
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.txt':  'text/plain; charset=utf-8',
});

const INJECTION_PATTERNS = [
  /ignore (all |previous |prior )?instructions/gi,
  /disregard (all |previous |your )?(prompts|instructions)/gi,
  /new instructions\s*:/gi,
  /^system\s*:/gim,
  /you are now/gi,
];

/**
 * Applies security headers to every response.
 * @param {http.ServerResponse} res
 */
function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' https://www.gstatic.com https://apis.google.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "connect-src 'self' https://api.groq.com https://www.googleapis.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://www.gstatic.com; " +
    "img-src 'self' data: https://*.googleusercontent.com; " +
    "worker-src 'self' blob:; " +
    "frame-src 'self' https://lexara-fc30c.firebaseapp.com https://accounts.google.com;");
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Checks and updates the rate limit counter for a given IP/endpoint tier.
 * @param {string} ip
 * @param {boolean} isAiEndpoint
 * @returns {boolean} True if the request is allowed
 */
function checkRateLimit(ip, isAiEndpoint) {
  const key = isAiEndpoint ? `ai:${ip}` : ip;
  const limit = isAiEndpoint ? AI_RATE_LIMIT : GENERAL_RATE_LIMIT;
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.reset) {
    rateLimitStore.set(key, { count: 1, reset: now + RATE_WINDOW });
    return true;
  }
  if (record.count >= limit) return false;
  record.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.reset) rateLimitStore.delete(key);
  }
}, 5 * 60 * 1000);

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
    .slice(0, 8000);
}

/**
 * Neutralises common prompt-injection patterns.
 * @param {string} str
 * @returns {string}
 */
function sanitizePromptInjection(str) {
  if (typeof str !== 'string') return '';
  return INJECTION_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, '[filtered]'), str);
}

/**
 * Validates the messages array sent to the chat endpoint.
 * @param {Array} messages
 * @returns {{valid:boolean, sanitized?:Array, error?:string}}
 */
function validateMessages(messages) {
  if (!Array.isArray(messages))      return { valid: false, error: 'Messages must be an array' };
  if (messages.length === 0)         return { valid: false, error: 'Messages array is empty' };
  if (messages.length > 50)          return { valid: false, error: 'Too many messages' };

  const validRoles = new Set(['user', 'assistant', 'system']);
  const sanitized = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || typeof msg !== 'object') return { valid: false, error: 'Invalid message object' };
    if (!validRoles.has(msg.role))       return { valid: false, error: `Invalid role: ${msg.role}` };
    if (typeof msg.content !== 'string') return { valid: false, error: 'Content must be string' };
    if (!msg.content.trim())             return { valid: false, error: 'Content cannot be empty' };

    const isLastUserMessage = msg.role === 'user' && i === messages.length - 1;
    const content = isLastUserMessage
      ? sanitizeString(sanitizePromptInjection(msg.content))
      : sanitizeString(msg.content);

    sanitized.push({ role: msg.role, content });
  }

  return { valid: true, sanitized };
}

/**
 * Handles POST /api/chat — proxies validated requests to the Groq API.
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @returns {Promise<void>}
 */
async function handleChatAPI(req, res) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    respondJSON(res, 415, { error: 'Content-Type must be application/json' });
    return;
  }

  const body = await readRequestBody(req);

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    respondJSON(res, 400, { error: 'Invalid JSON in request body' });
    return;
  }

  const validation = validateMessages(parsed.messages);
  if (!validation.valid) {
    console.error('[Validation Error]', validation.error);
    respondJSON(res, 400, { error: validation.error });
    return;
  }

  if (!process.env.GROQ_API_KEY) {
    console.error('[Config Error] GROQ_API_KEY not set');
    respondJSON(res, 503, { error: 'AI service not configured' });
    return;
  }

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        messages: validation.sanitized,
        temperature: 0.4,
        max_tokens: 900,
        stream: false,
      }),
    });

    const data = await groqRes.json();

    if (!groqRes.ok) {
      const errMsg = data.error?.message || 'Groq API error';
      if (data.error?.code === 'model_not_found' || /does not exist/i.test(errMsg)) {
        console.error('[Groq Config] GROQ_MODEL is invalid or deprecated:', process.env.GROQ_MODEL || 'openai/gpt-oss-120b', '—', errMsg);
      } else {
        console.error('[Groq Error]', errMsg);
      }
      respondJSON(res, groqRes.status, { error: errMsg });
      return;
    }

    const reply = data.choices?.[0]?.message?.content;
    if (!reply) {
      respondJSON(res, 500, { error: 'Empty AI response' });
      return;
    }

    respondJSON(res, 200, { reply });
  } catch (err) {
    console.error('[Groq Fetch Error]', err.message);
    respondJSON(res, 502, { error: 'Failed to reach AI service' });
  }
}

/**
 * Reads and size-limits the incoming request body.
 * @param {http.IncomingMessage} req
 * @returns {Promise<string>}
 */
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error('Request body too large')); return; }
      data += chunk.toString();
    });
    req.on('end', () => resolve(data));
    req.on('error', (err) => reject(err));
  });
}

/**
 * Sends a JSON response with the given status code.
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {Object} payload
 */
function respondJSON(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

/** @type {Map<string, Buffer>} */
const fileCache = new Map();

/**
 * Serves a static file with path-traversal protection and caching.
 * @param {string} filePath
 * @param {http.ServerResponse} res
 */
function serveStaticFile(filePath, res) {
  const resolved = path.resolve(filePath);
  const cwd = path.resolve('.');
  if (!resolved.startsWith(cwd)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  if (filePath.endsWith('security.txt')) {
    res.setHeader('Cache-Control', 'no-cache');
  }

  if (fileCache.has(filePath)) {
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' });
    res.end(fileCache.get(filePath));
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
      res.end(err.code === 'ENOENT' ? '404 Not Found' : 'Internal Server Error');
      return;
    }
    fileCache.set(filePath, content);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url === '/.well-known/security.txt') {
    serveStaticFile('./.well-known/security.txt', res);
    return;
  }

  const ip = req.socket.remoteAddress || 'unknown';
  const isApiRoute = req.url.startsWith('/api/');
  if (isApiRoute && !checkRateLimit(ip, true)) {
    respondJSON(res, 429, { error: 'Too many requests. Please slow down.' });
    return;
  }
  if (!isApiRoute && !checkRateLimit(ip, false)) {
    respondJSON(res, 429, { error: 'Too many requests. Please slow down.' });
    return;
  }

  if (req.url === '/api/chat' && req.method === 'POST') {
    try {
      await handleChatAPI(req, res);
    } catch (err) {
      console.error('[Server Error]', err);
      if (!res.headersSent) respondJSON(res, 500, { error: 'Internal server error' });
    }
    return;
  }

  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = `.${path.normalize(`/${urlPath}`)}`;
  serveStaticFile(filePath, res);
});

server.listen(PORT, () => {
  const groq = process.env.GROQ_API_KEY ? '✅ Loaded' : '❌ Missing — check .env';
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  const lines = [
    '⚖️  Lexara Server v1.0',
    `URL:   http://localhost:${PORT}`,
    `Groq:  ${groq}`,
    `Model: ${model}`,
  ];

  const width = Math.max(...lines.map((l) => [...l].length)) + 4;
  const pad = (str) => `║  ${str}${' '.repeat(width - [...str].length - 2)}║`;
  const bar = '═'.repeat(width);

  console.log(`\n╔${bar}╗`);
  lines.forEach((l, i) => {
    console.log(pad(l));
    if (i === 0) console.log(`╠${bar}╣`);
  });
  console.log(`╚${bar}╝\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} in use.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

module.exports = { validateMessages, sanitizeString, sanitizePromptInjection, checkRateLimit };