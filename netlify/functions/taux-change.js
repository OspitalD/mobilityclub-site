// GET → { rate, date, source, stale } : taux USD→EUR du jour.
//
// POURQUOI. Skool ne facture qu'en dollars (25 $/mois). Un visiteur français a
// besoin d'un ordre de grandeur en euros — mais un taux figé dans le HTML
// redevient faux tout seul, et un chiffre faux sur une page de vente, c'est le
// défaut qu'on s'interdit ici.
//
// CE QUE CE CHIFFRE N'EST PAS. Le taux BCE n'est pas celui que la banque du
// membre appliquera : elle a le sien, plus d'éventuels frais de change. La page
// doit donc toujours présenter l'euro comme INDICATIF et arrondir VERS LE HAUT
// — on n'annonce jamais moins que ce qui sera débité.
//
// DÉGRADATION. Trois niveaux, du meilleur au pire : source du jour → dernier
// taux connu (Blobs) → 503. En 503 la page n'affiche simplement aucun euro :
// elle reste juste, elle est seulement moins bavarde. Jamais de chiffre inventé.

import { connectLambda, getStore } from '@netlify/blobs';

const CLE = 'usd-eur';
const FRAICHEUR_MS = 12 * 60 * 60 * 1000; // au-delà, on retente la source

// Les deux sources renvoient des formes différentes : on normalise ici pour que
// le reste du code n'ait qu'un seul cas à connaître.
const SOURCES = [
  {
    nom: 'frankfurter',
    url: 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR',
    lire: (d) => ({ rate: d?.rates?.EUR, date: d?.date }),
  },
  {
    nom: 'er-api',
    url: 'https://open.er-api.com/v6/latest/USD',
    lire: (d) => ({ rate: d?.rates?.EUR, date: d?.time_last_update_utc?.slice(5, 16) }),
  },
];

// Un taux USD→EUR plausible vit entre 0,5 et 1,5. Hors de cette fourchette, la
// source s'est trompée (ou a changé de format) : on refuse plutôt que d'afficher
// un prix absurde.
export const tauxPlausible = (r) => typeof r === 'number' && Number.isFinite(r) && r > 0.5 && r < 1.5;

// `cdn` = durée de mise en cache CÔTÉ CDN, en secondes. Sans elle, chaque visite
// réveillerait la Function pour un chiffre qui bouge une fois par jour.
const json = (statusCode, body, cdn) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': cdn ? 'public, max-age=3600' : 'no-store',
    ...(cdn
      ? { 'Netlify-CDN-Cache-Control': `public, max-age=${cdn}, stale-while-revalidate=86400` }
      : {}),
  },
  body: JSON.stringify(body),
});

const CDN_FRAIS = 21600; // 6 h — le taux BCE ne bouge qu'une fois par jour ouvré
const CDN_PERIME = 900;  // 15 min — un taux périmé doit pouvoir se réparer vite

const interroger = async () => {
  for (const s of SOURCES) {
    try {
      const rep = await fetch(s.url, { signal: AbortSignal.timeout(4000) });
      if (!rep.ok) continue;
      const { rate, date } = s.lire(await rep.json());
      if (tauxPlausible(rate)) return { rate, date: date || null, source: s.nom };
    } catch {
      // Source muette ou lente : on passe à la suivante sans bruit.
    }
  }
  return null;
};

export const handler = async (req) => {
  if (req.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });
  if (req.blobs) connectLambda(req);

  let store = null;
  try {
    store = getStore('taux_change');
  } catch {
    // Hors contexte Netlify (test local) : on fonctionne sans cache.
  }

  const connu = store ? await store.get(CLE, { type: 'json' }).catch(() => null) : null;
  const frais = connu && Date.now() - new Date(connu.fetched_at).getTime() < FRAICHEUR_MS;
  if (frais) return json(200, { ...connu, stale: false }, CDN_FRAIS);

  const neuf = await interroger();
  if (neuf) {
    const record = { ...neuf, fetched_at: new Date().toISOString() };
    if (store) await store.setJSON(CLE, record).catch(() => {});
    return json(200, { ...record, stale: false }, CDN_FRAIS);
  }

  // Sources injoignables : mieux vaut le taux d'hier que pas de taux du tout.
  if (connu) return json(200, { ...connu, stale: true }, CDN_PERIME);

  return json(503, { error: 'taux_indisponible' });
};
