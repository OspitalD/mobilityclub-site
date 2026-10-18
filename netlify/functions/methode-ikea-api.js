// /api/methode-ikea/* — connexion par code, achat PayPal, administration.
//
// Public :
//   POST request-code { email }         → { sent: true } (toujours, anti-énumération)
//   POST verify-code  { email, code }   → { ok: true } + cookie de session
//   POST checkout     { email }         → { approve_url } (commande PayPal)
//   POST capture      { order_id }      → { ok: true } + cookie (capture vérifiée)
//   POST logout                         → efface le cookie
// Admin (Authorization: Bearer METHODE_IKEA_ADMIN_TOKEN) — utilisé par scripts/methode-ikea.mjs :
//   GET    admin/buyers                 → { buyers: [...] }
//   POST   admin/buyers { emails, source }
//   DELETE admin/buyers { email }
//   PUT    admin/content  (corps = HTML de la formation)

import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CONTENT_KEY, ajouterAcheteur, capturerCommande, cookieEfface, cookieSession, creerCommande,
  creerJeton, emailBienvenue, emailCode, listerAcheteurs, lireAcheteur, normaliserEmail,
  nouveauCode, store, supprimerAcheteur, verifierCode,
} from '../lib/methode-ikea.js';

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
});

const lireJson = async (req) => {
  const raw = await req.text();
  if (raw.length > 10_000) throw Object.assign(new Error('payload_too_large'), { statusCode: 413 });
  try { return JSON.parse(raw || '{}'); } catch { throw Object.assign(new Error('invalid_json'), { statusCode: 400 }); }
};

const estAdmin = (req) => {
  const attendu = process.env.METHODE_IKEA_ADMIN_TOKEN || '';
  const recu = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (attendu.length < 24 || !recu) return false;
  const h = (v) => createHash('sha256').update(v).digest();
  return timingSafeEqual(h(attendu), h(recu));
};

// ── Public ────────────────────────────────────────────────────────────────────

const demanderCode = async (req) => {
  const email = normaliserEmail((await lireJson(req)).email);
  if (!email) return json(400, { error: 'invalid_email' });
  // Pas d'acheteur → on ne dit rien (même réponse), on n'envoie rien.
  if (await lireAcheteur(email)) {
    const code = await nouveauCode(email);
    if (code) await emailCode(email, code).catch((err) => console.error('[methode-ikea] email code failed:', err));
  }
  return json(200, { sent: true });
};

const validerCode = async (req) => {
  const body = await lireJson(req);
  const email = normaliserEmail(body.email);
  const code = String(body.code ?? '');
  if (!email || !/^\d{6}$/.test(code)) return json(400, { error: 'invalid_request' });
  const verdict = await verifierCode(email, code);
  if (verdict !== 'ok') return json(verdict === 'too_many_attempts' ? 429 : 401, { error: verdict === 'invalid' ? 'invalid_code' : verdict });
  if (!(await lireAcheteur(email))) return json(403, { error: 'no_access' });
  return json(200, { ok: true }, { 'Set-Cookie': cookieSession(req, creerJeton(email)) });
};

const commander = async (req) => {
  const email = normaliserEmail((await lireJson(req)).email);
  if (!email) return json(400, { error: 'invalid_email' });
  // Évite un double paiement : l'acheteur est renvoyé vers la connexion.
  if (await lireAcheteur(email)) return json(409, { error: 'already_buyer' });
  const { approveUrl } = await creerCommande({ email, origin: new URL(req.url).origin });
  return json(201, { approve_url: approveUrl });
};

const capturer = async (req) => {
  const orderId = String((await lireJson(req)).order_id ?? '');
  if (!/^[A-Z0-9]{8,40}$/.test(orderId)) return json(400, { error: 'invalid_order' });
  const result = await capturerCommande(orderId);
  if (result.error) {
    console.error('[methode-ikea] capture refused:', orderId, result.error);
    return json(result.error === 'unknown_order' ? 404 : 402, { error: result.error });
  }
  // Rejeu (rechargement, autre appareil) : pas de nouveau cookie sur la seule
  // foi d'un order id — l'acheteur se connecte avec son code.
  if (result.status === 'already_captured') return json(200, { ok: true, already_captured: true });
  await emailBienvenue(result.email, new URL(req.url).origin).catch((err) => console.error('[methode-ikea] welcome email failed:', err));
  return json(200, { ok: true }, { 'Set-Cookie': cookieSession(req, creerJeton(result.email)) });
};

// ── Admin ─────────────────────────────────────────────────────────────────────

const adminBuyers = async (req) => {
  if (req.method === 'GET') return json(200, { buyers: await listerAcheteurs() });
  const body = await lireJson(req);
  if (req.method === 'DELETE') {
    const email = normaliserEmail(body.email);
    if (!email) return json(400, { error: 'invalid_email' });
    return json(200, { removed: await supprimerAcheteur(email) });
  }
  if (req.method === 'POST') {
    const emails = Array.isArray(body.emails) ? body.emails : [];
    const source = ['import', 'admin', 'gift'].includes(body.source) ? body.source : 'admin';
    const added = [], existing = [], invalid = [];
    for (const raw of emails) {
      const email = normaliserEmail(raw);
      if (!email) { invalid.push(String(raw)); continue; }
      const { created } = await ajouterAcheteur(email, { source });
      (created ? added : existing).push(email);
    }
    return json(200, { added, existing, invalid });
  }
  return json(405, { error: 'method_not_allowed' });
};

const adminContent = async (req) => {
  if (req.method !== 'PUT') return json(405, { error: 'method_not_allowed' });
  const html = await req.text();
  if (!/^\s*<!doctype html>/i.test(html) || html.length > 5_000_000) return json(400, { error: 'invalid_html' });
  await store().set(CONTENT_KEY, html);
  return json(200, { ok: true, bytes: Buffer.byteLength(html) });
};

// ── Routage ───────────────────────────────────────────────────────────────────

const PUBLIC = { 'request-code': demanderCode, 'verify-code': validerCode, checkout: commander, capture: capturer };

export default async (req) => {
  const action = new URL(req.url).pathname.replace(/^\/api\/methode-ikea\/?/, '').replace(/\/$/, '');
  try {
    if (action.startsWith('admin/')) {
      if (!estAdmin(req)) return json(401, { error: 'unauthorized' });
      if (action === 'admin/buyers') return await adminBuyers(req);
      if (action === 'admin/content') return await adminContent(req);
      return json(404, { error: 'not_found' });
    }
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    if (action === 'logout') return json(200, { ok: true }, { 'Set-Cookie': cookieEfface(req) });
    const handler = PUBLIC[action];
    if (!handler) return json(404, { error: 'not_found' });
    return await handler(req);
  } catch (err) {
    console.error('[methode-ikea] error:', action, err);
    const status = err.statusCode || 500;
    return json(status, { error: status === 500 ? 'server_error' : err.message });
  }
};

export const config = { path: '/api/methode-ikea/*' };
