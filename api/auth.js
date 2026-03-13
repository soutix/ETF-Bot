'use strict';

/**
 * api/auth.js
 * Server-side authentication endpoint.
 * Password never leaves the server — only a signed token is returned.
 */

const crypto = require('crypto');

const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || '';
const TOKEN_SECRET       = process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS       = 12 * 60 * 60 * 1000; // 12 hours

// ── Token helpers ────────────────────────────────────────────────────────────

function signToken(payload) {
  const data = JSON.stringify(payload);
  const sig  = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('hex');
  return Buffer.from(data).toString('base64') + '.' + sig;
}

function verifyToken(token) {
  try {
    const [b64, sig] = token.split('.');
    if (!b64 || !sig) return null;
    const data     = Buffer.from(b64, 'base64').toString('utf8');
    const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('hex');
    if (sig !== expected) return null;
    const payload = JSON.parse(data);
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {

  // POST /api/auth — login
  if (req.method === 'POST') {
    const { password } = req.body || {};

    if (!password || password !== DASHBOARD_PASSWORD) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    const token = signToken({ iat: Date.now(), exp: Date.now() + TOKEN_TTL_MS });
    return res.status(200).json({ token });
  }

  // GET /api/auth — verify token
  if (req.method === 'GET') {
    const auth  = req.headers.authorization || '';
    const token = auth.replace('Bearer ', '');
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Token invalide ou expiré' });
    return res.status(200).json({ ok: true, exp: payload.exp });
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
};
