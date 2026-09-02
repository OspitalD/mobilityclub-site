// Stock public du Lifetime Pass rentrée 2026.
//
// Chaque capture PayPal signée à 199 € ou 249 € crée une clé idempotente dans
// le store `lifetime_pass_2026` : `199/<captureId>` ou `249/<captureId>`.
// Cette Function ne renvoie que des agrégats. Aucun email ni identifiant PayPal
// ne quitte le serveur.

import { connectLambda, getStore } from '@netlify/blobs';

export const TOTAL = 40;
export const PREMIER_PALIER = 20;

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(body),
});

export const calculerStock = (keys = []) => {
  const tier199 = keys.filter((key) => String(key).startsWith('199/')).length;
  const tier249 = keys.filter((key) => String(key).startsWith('249/')).length;
  const sold = Math.min(TOTAL, tier199 + tier249);
  const remaining = Math.max(0, TOTAL - sold);

  return {
    live: true,
    total: TOTAL,
    sold,
    remaining,
    tier: remaining === 0 ? 'sold_out' : sold < PREMIER_PALIER ? '199' : '249',
    first_tier_remaining: Math.max(0, PREMIER_PALIER - sold),
  };
};

export const handler = async (req) => {
  if (req.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });
  if (req.blobs) connectLambda(req);

  try {
    const store = getStore('lifetime_pass_2026');
    const { blobs = [] } = await store.list();
    return json(200, calculerStock(blobs.map((blob) => blob.key)));
  } catch (err) {
    console.error('[lifetime-stock] lecture impossible:', err?.message);
    // Fail closed côté page : sans stock fiable, le CTA reste désactivé pour ne
    // jamais vendre le mauvais palier.
    return json(503, { live: false, error: 'stock_unavailable' });
  }
};
