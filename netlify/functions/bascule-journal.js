// GET ?since=<ISO> (Bearer BASCULE_JOURNAL_TOKEN) → { ok, lignes: [...] }
//
// Lu par Hermès (Mac de Damien, cron Telegram) : chaque bascule Skool → app
// (activation, résiliation, coupure) avec l'email PayPal, l'email Skool rapproché
// et le type de rapprochement — pour que Damien coupe l'abonnement Skool à la main.
// Lecture seule. Le jeton ne sert qu'ici ; sans lui (ou trop court), tout est refusé.

import { connectLambda } from '@netlify/blobs';
import { storeJournal } from '../lib/bascule-journal.js';
import { timingSafeEqual } from 'node:crypto';

const MAX = 200;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

const egal = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
};

export const handler = async (req) => {
  if (req.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });
  const attendu = process.env.BASCULE_JOURNAL_TOKEN || '';
  const h = req.headers || {};
  const auth = h.authorization || h.Authorization || '';
  const jeton = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (attendu.length < 32 || !egal(jeton, attendu)) return json(401, { error: 'unauthorized' });
  if (req.blobs) connectLambda(req);

  const since = req.queryStringParameters?.since || '';
  const depuis = Number.isFinite(Date.parse(since)) ? new Date(since).toISOString() : '';
  const { blobs = [] } = await storeJournal().list();
  const cles = blobs.map((b) => b.key).filter((k) => k > depuis).sort().slice(-MAX);
  const lignes = (await Promise.all(cles.map((k) => storeJournal().get(k, { type: 'json' }).catch(() => null)))).filter(Boolean);
  return json(200, { ok: true, lignes });
};
