// Stock public du Lifetime Pass rentrée 2026.
//
// Vue agrégée de la même vérité que la grille numérotée. Cette Function ne
// renvoie aucun email ni identifiant PayPal.

import { lireEtatCampagne, TIER_PRICES, TIER_SIZE, TOTAL } from '../lib/lifetime-ticketing.js';

export { TOTAL };
export const PREMIER_PALIER = TIER_SIZE;

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(body),
});

export const calculerStock = (state = {}) => {
  const sold = Math.max(0, Math.min(TOTAL, Number(state.sold) || 0));
  const remaining = Math.max(0, TOTAL - sold);

  return {
    live: true,
    total: TOTAL,
    sold,
    remaining,
    tier: remaining === 0 ? 'sold_out' : String(TIER_PRICES[Math.min(Math.floor(sold / TIER_SIZE), TIER_PRICES.length - 1)]),
    first_tier_remaining: Math.max(0, PREMIER_PALIER - sold),
  };
};

const handleLegacyRequest = async (req) => {
  if (req.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });

  try {
    return json(200, calculerStock(await lireEtatCampagne()));
  } catch (err) {
    console.error('[lifetime-stock] lecture impossible:', err?.message);
    // Fail closed côté page : sans stock fiable, le CTA reste désactivé pour ne
    // jamais vendre le mauvais palier.
    return json(503, { live: false, error: 'stock_unavailable' });
  }
};

export default async (request) => {
  const response = await handleLegacyRequest({ httpMethod: request.method });
  return new Response(response.body, {
    status: response.statusCode,
    headers: response.headers,
  });
};
