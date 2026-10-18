// Méthode IKEA : les 20 tickets mensuels de l'offre avec appels.
//
// Rareté honnête : chaque vente à 97 € (offre avec 2 appels) consomme un ticket
// du mois civil, heure de Paris. Le compteur se remet à zéro le 1er du mois.
// Le downsell à 49 € (sans appels) ne consomme rien : les places mesurent le
// temps d'appel de Damien, pas les ventes.
//
// MÊME FORMAT que la version protégée (branche claude/methode-ikea-paywall-*,
// netlify/lib/methode-ikea.js) : store « methode_ikea », clé quota/AAAA-MM =
// { orders: [ids] }. Une vente y est identifiée par son id de COMMANDE PayPal
// (celui que la version protégée enregistre aussi), sinon par l'id de capture :
// le jour où les deux coexistent, une même vente ne compte qu'une fois.
//
// VARIABLES D'ENVIRONNEMENT
//   METHODE_IKEA_PLACES_APPELS  optionnel, défaut 20
//   METHODE_IKEA_PRIX_APPELS    optionnel, défaut « 97.00 »
//   METHODE_IKEA_ADMIN_TOKEN    requis pour ajouter ou retirer un ticket à la main

import { getStore } from '@netlify/blobs';

export const STORE = 'methode_ikea';
const store = () => getStore({ name: STORE, consistency: 'strong' });

export const placesParMois = () => {
  const n = Number.parseInt(process.env.METHODE_IKEA_PLACES_APPELS ?? '20', 10);
  return Number.isFinite(n) && n >= 0 ? n : 20;
};

export const prixAppels = () => process.env.METHODE_IKEA_PRIX_APPELS || '97.00';

export const moisCourant = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).formatToParts(date);
  return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}`;
};

export const moisValide = (m) => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

const cle = (mois) => `quota/${mois}`;

export const lireMois = async (mois = moisCourant()) => {
  const rec = await store().get(cle(mois), { type: 'json' });
  return { orders: Array.isArray(rec?.orders) ? rec.orders : [] };
};

// Vue publique : aucun identifiant de commande ne sort.
export const etatTickets = (rec, mois) => {
  const places = placesParMois();
  const pris = rec.orders.length;
  return {
    live: true,
    mois,
    places,
    vendues: Math.min(places, pris),
    restantes: Math.max(0, places - pris),
    prochain: pris < places ? pris + 1 : null,
  };
};

export const consommerTicket = async (id, date = new Date()) => {
  const mois = moisCourant(date);
  const rec = await lireMois(mois);
  if (!rec.orders.includes(id)) await store().setJSON(cle(mois), { orders: [...rec.orders, id] });
  return etatTickets(await lireMois(mois), mois);
};

export const retirerTicket = async (id, mois = moisCourant()) => {
  const rec = await lireMois(mois);
  if (rec.orders.includes(id)) await store().setJSON(cle(mois), { orders: rec.orders.filter((o) => o !== id) });
  return etatTickets(await lireMois(mois), mois);
};

// Le dernier ticket ajouté à la main du mois (pour l'annuler sans connaître son id).
export const dernierManuel = (rec) => [...rec.orders].reverse().find((o) => String(o).startsWith('manuel-')) || null;
