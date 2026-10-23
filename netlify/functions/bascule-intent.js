// POST { email, plan } → { ok: true }
// Page /bascule (abonnés Skool → app) : note l'email Skool et la formule choisie
// JUSTE AVANT le départ vers PayPal. Sert à relier le paiement au compte et à
// savoir quel abonnement Skool couper. Ce n'est PAS une preuve de paiement :
// le paiement se vérifie côté PayPal.
//
// Store `bascule_intents`, clé = email normalisé (dernier choix gagne).

import { connectLambda, getStore } from '@netlify/blobs';

const PLANS = new Set(['annuel', 'vie', 'mensuel']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

export const handler = async (req) => {
  if (req.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (req.blobs) connectLambda(req);
  if ((req.body || '').length > 1024) return json(413, { error: 'payload_too_large' });

  let payload;
  try {
    payload = JSON.parse(req.body || '{}');
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const plan = String(payload.plan || '');
  if (!EMAIL.test(email) || email.length > 254) return json(400, { error: 'invalid_email' });
  if (!PLANS.has(plan)) return json(400, { error: 'unknown_plan' });

  const store = getStore('bascule_intents');
  const previous = await store.get(email, { type: 'json' }).catch(() => null);
  const now = new Date().toISOString();
  await store.setJSON(email, {
    email,
    plan,
    first_seen: previous?.first_seen || now,
    updated_at: now,
    clicks: (previous?.clicks || 0) + 1,
  });

  return json(200, { ok: true });
};
