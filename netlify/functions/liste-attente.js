// POST { email, prenom?, probleme } → { ok: true, deja_inscrit: boolean }
//
// Liste d'attente de l'Édition 1 du club à saisons (« le club ferme ses portes », 16/11/2026).
// La liste entre en premier le jeudi 26/11 à 20 h, avant l'ouverture publique du 27/11.
//
// Deux destinations :
//   1. Netlify Blobs, store `liste_attente_edition1`, clé = email normalisé. C'est la vérité :
//      l'ordre d'arrivée (`first_seen`) fixe la priorité, une réinscription ne fait jamais
//      perdre sa place.
//   2. MailerLite (best effort) si MAILERLITE_API_KEY et MAILERLITE_GROUP_LISTE_ATTENTE sont posées
//      sur le site : l'abonné rejoint le groupe, avec son problème n° 1 en champ. Un échec
//      MailerLite ne fait jamais échouer l'inscription (on note `mailerlite: 'echec'`).
//
// Aucune donnée n'est renvoyée à la page en dehors de { ok, deja_inscrit } : pas de rang,
// pas de compteur (on n'affiche jamais un chiffre faible).

import { connectLambda, getStore } from '@netlify/blobs';

export const STORE = 'liste_attente_edition1';
export const PROBLEMES = Object.freeze([
  'dos',
  'hanches',
  'epaules',
  'nuque',
  'genoux_chevilles',
  'raideur_generale',
  'performance_sport',
]);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

export const nettoyerPrenom = (valeur) =>
  String(valeur || '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 40);

export const envoyerMailerLite = async ({ email, prenom, probleme }, env = process.env, f = fetch) => {
  const cle = env.MAILERLITE_API_KEY;
  const groupe = env.MAILERLITE_GROUP_LISTE_ATTENTE;
  if (!cle || !groupe) return 'non_configure';

  const corps = {
    email,
    groups: [String(groupe)],
    fields: { ...(prenom ? { name: prenom } : {}), probleme_n1: probleme },
  };
  const res = await f('https://connect.mailerlite.com/api/subscribers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${cle}`,
    },
    body: JSON.stringify(corps),
  });
  return res.ok ? 'ok' : 'echec';
};

export const handler = async (req, { env = process.env, f = fetch } = {}) => {
  if (req.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (req.blobs) connectLambda(req);
  if ((req.body || '').length > 2048) return json(413, { error: 'payload_too_large' });

  let payload;
  try {
    payload = JSON.parse(req.body || '{}');
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  // Champ piège : invisible pour un humain, rempli par les robots.
  if (payload.site) return json(200, { ok: true, deja_inscrit: false });

  const email = String(payload.email || '').trim().toLowerCase();
  const probleme = String(payload.probleme || '');
  const prenom = nettoyerPrenom(payload.prenom);
  if (!EMAIL.test(email) || email.length > 254) return json(400, { error: 'invalid_email' });
  if (!PROBLEMES.includes(probleme)) return json(400, { error: 'unknown_probleme' });

  const store = getStore(STORE);
  const precedent = await store.get(email, { type: 'json' }).catch(() => null);
  const maintenant = new Date().toISOString();

  let mailerlite = 'echec';
  try {
    mailerlite = await envoyerMailerLite({ email, prenom, probleme }, env, f);
  } catch (err) {
    console.warn('[liste-attente] MailerLite :', err?.message || err);
  }

  await store.setJSON(email, {
    email,
    prenom: prenom || precedent?.prenom || '',
    probleme,
    first_seen: precedent?.first_seen || maintenant,
    updated_at: maintenant,
    inscriptions: (precedent?.inscriptions || 0) + 1,
    mailerlite,
  });

  return json(200, { ok: true, deja_inscrit: Boolean(precedent) });
};
