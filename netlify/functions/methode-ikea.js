// Méthode IKEA — deux chemins (le HTML de la formation n'est JAMAIS servi sans
// cookie signé + accès en Blobs ; voir netlify/lib/methode-ikea.js pour le pourquoi).
//
//   /methode-ikea            page de vente statique (methode-ikea.html), publique.
//                            Avec le cookie mi_session, netlify.toml la réécrit (200)
//                            vers /methode-ikea/formation : même URL, la formation.
//   /methode-ikea/formation  la formation si la session est valide ; sinon on efface
//                            le cookie et on renvoie vers la page de vente.
//   /methode-ikea/acces      achat (offre + downsell) et connexion par code ;
//                            déjà connecté → /methode-ikea.

import {
  CONTENT_KEY, contact, cookieEfface, lireCookie, offre, placesParMois, placesRestantes, sessionValide, store,
} from '../lib/methode-ikea.js';
import { pageAcces } from '../lib/methode-ikea-acces.js';

const entetes = {
  'Content-Type': 'text/html; charset=utf-8',
  // Contenu par personne : aucun cache partagé (CDN) ni navigateur.
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

const rediriger = (location, extra = {}) =>
  new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store', ...extra } });

export default async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const { pathname } = new URL(req.url);

  const email = await sessionValide(req).catch((err) => {
    console.error('[methode-ikea] session check failed:', err);
    return null;
  });

  if (pathname.startsWith('/methode-ikea/acces')) {
    if (email) return rediriger('/methode-ikea');
    const places = await placesRestantes().catch(() => placesParMois());
    const html = pageAcces({ principale: offre('avec_appels'), downsell: offre('sans_appels'), contact: contact(), places, placesTotal: placesParMois() });
    return new Response(html, { status: 200, headers: entetes });
  }

  // /methode-ikea/formation (direct, ou réécrit depuis /methode-ikea par netlify.toml)
  if (!email) {
    // Cookie présent mais invalide ou accès retiré : on l'efface, sinon la règle de
    // réécriture renverrait ici en boucle. Sans cookie : page de connexion.
    return lireCookie(req)
      ? rediriger('/methode-ikea', { 'Set-Cookie': cookieEfface(req) })
      : rediriger('/methode-ikea/acces?connexion');
  }

  const html = await store().get(CONTENT_KEY, { type: 'text' });
  if (!html) {
    console.error('[methode-ikea] contenu absent : lancer `node scripts/methode-ikea.mjs content <fichier>`');
    return new Response('<!doctype html><meta charset="utf-8"><title>Méthode IKEA</title><p style="font-family:sans-serif;padding:24px">La formation est en cours de mise à jour. Reviens dans quelques minutes.</p>', { status: 503, headers: entetes });
  }
  return new Response(html, { status: 200, headers: entetes });
};

export const config = { path: ['/methode-ikea/acces', '/methode-ikea/formation'] };
