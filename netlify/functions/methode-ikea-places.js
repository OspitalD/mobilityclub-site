// Tickets mensuels de la Méthode IKEA (offre à 97 € avec appels).
//
//   GET  → { live, mois, places, vendues, restantes, prochain } — public, aucun
//          email ni identifiant PayPal. Lu par la page /methode-ikea.
//   POST → ajout ou retrait d'un ticket à la main, Bearer METHODE_IKEA_ADMIN_TOKEN.
//          Corps : { "action": "ajouter" }                    vente passée hors webhook
//                  { "action": "retirer" }                    annule le dernier ajout manuel
//                  { "action": "retirer", "id": "<id>" }      retire une vente précise
//                  "mois": "AAAA-MM" optionnel (défaut : mois en cours, heure de Paris)
//
// Les ventes par PayPal sont comptées automatiquement par paypal-to-skool.js.

import { timingSafeEqual } from 'node:crypto';
import {
  consommerTicket, dernierManuel, etatTickets, lireMois, moisCourant, moisValide, retirerTicket,
} from '../lib/methode-ikea-tickets.js';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export const jetonValide = (entete, attendu) => {
  if (!attendu || typeof entete !== 'string' || !entete.startsWith('Bearer ')) return false;
  const a = Buffer.from(entete.slice(7));
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
};

export default async (request) => {
  if (request.method === 'GET') {
    try {
      const mois = moisCourant();
      return json(200, etatTickets(await lireMois(mois), mois));
    } catch (err) {
      console.error('[methode-ikea-places] lecture impossible:', err?.message);
      // La page garde alors son texte fixe : jamais de faux chiffre.
      return json(503, { live: false, error: 'places_unavailable' });
    }
  }

  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const attendu = process.env.METHODE_IKEA_ADMIN_TOKEN;
  if (!attendu) return json(503, { error: 'not_configured' });
  if (!jetonValide(request.headers.get('authorization'), attendu)) return json(401, { error: 'unauthorized' });

  let corps;
  try { corps = JSON.parse((await request.text()) || '{}'); } catch { return json(400, { error: 'invalid_json' }); }
  const mois = corps.mois ?? moisCourant();
  if (!moisValide(mois)) return json(400, { error: 'mois_invalide' });

  if (corps.action === 'ajouter') {
    if (mois !== moisCourant()) return json(400, { error: 'ajout_mois_courant_seulement' });
    return json(200, await consommerTicket(`manuel-${Date.now()}`));
  }
  if (corps.action === 'retirer') {
    const id = corps.id || dernierManuel(await lireMois(mois));
    if (!id) return json(404, { error: 'aucun_ticket_manuel' });
    return json(200, await retirerTicket(String(id), mois));
  }
  return json(400, { error: 'action_inconnue' });
};
