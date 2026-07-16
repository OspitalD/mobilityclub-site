// POST { event, variant?, props? } → { ok: true }
// Collecteur d'events du site vitrine. ANONYME par nature : le site n'a pas d'auth
// (contrairement au dashboard, dont `track-event.js` exige un JWT). Aucune donnée
// personnelle n'est acceptée ici — voir SANITIZE.
//
// Persiste en Blob (store `site_events`, key = `YYYY-MM-DD/<event>/<ts>-<rand>`).
// Le préfixe par date rend le dépouillement requêtable par `list({ prefix })`,
// comme la console coach le fait déjà sur les autres stores.

import { getStore } from '@netlify/blobs';

// Whitelist stricte : un endpoint public non authentifié n'accepte que ce qu'on
// a prévu de lire. Tout le reste est rejeté (et non stocké silencieusement).
const EVENTS = new Set([
  'page_view',          // arrivée sur le site
  'hero_variant_viewed', // hero affiché + variante servie (A/B)
  'cta_clicked',        // clic sur un CTA (hero, sticky, header)
  'door_clicked',       // clic sur une des 3 portes (diagnostic / timer / club)
  'plan_clicked',       // clic sur un plan payant (PayPal)
]);

const VARIANTS = new Set(['vision', 'friction']);

// Longueur max d'une valeur de props. Coupe court aux payloads gonflés.
const MAX_VAL = 64;

// N'accepte que des props scalaires courtes et connues. Pas d'objets imbriqués,
// pas d'email, pas de texte libre : ce store ne doit jamais devenir un puits à PII.
const ALLOWED_PROPS = new Set(['cta', 'door', 'plan', 'lang', 'path']);

const sanitize = (props) => {
  if (!props || typeof props !== 'object' || Array.isArray(props)) return {};
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    if (!ALLOWED_PROPS.has(k)) continue;
    if (typeof v !== 'string' && typeof v !== 'number') continue;
    out[k] = String(v).slice(0, MAX_VAL);
  }
  return out;
};

// vid = identifiant visiteur pseudonyme généré côté client (audience measurement
// first-party). On impose le format pour qu'il ne puisse pas servir de champ libre.
const isVid = (v) => typeof v === 'string' && /^[a-z0-9]{8,24}$/.test(v);

const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

export const handler = async (req) => {
  if (req.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  // Garde-fou taille : le body d'un event légitime pèse quelques centaines d'octets.
  if ((req.body || '').length > 2048) return json(413, { error: 'payload_too_large' });

  let payload;
  try {
    payload = JSON.parse(req.body || '{}');
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const { event, variant, vid, props } = payload;
  if (!EVENTS.has(event)) return json(400, { error: 'unknown_event' });
  if (variant != null && !VARIANTS.has(variant)) return json(400, { error: 'unknown_variant' });

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 10);

  const record = {
    event,
    variant: variant ?? null,
    vid: isVid(vid) ? vid : null,
    props: sanitize(props),
    created_at: now.toISOString(),
    // Pays fourni par le CDN Netlify — agrégat, pas une localisation individuelle.
    country: req.headers?.['x-country'] || null,
  };

  try {
    await getStore('site_events').setJSON(`${day}/${event}/${now.getTime()}-${rand}`, record);
  } catch (err) {
    // Un event perdu ne doit JAMAIS casser la page. On log et on répond ok.
    console.error('[track-site-event] write failed:', err?.message);
  }

  return json(200, { ok: true });
};
