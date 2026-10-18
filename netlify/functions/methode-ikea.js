// GET /methode-ikea — la formation si la session est valide, sinon la page d'accès.
// Le HTML de la formation n'est JAMAIS servi sans cookie signé + acheteur en Blobs
// (voir netlify/lib/methode-ikea.js pour le pourquoi).

import { CONTENT_KEY, prixAffiche, sessionValide, store } from '../lib/methode-ikea.js';
import { pageAcces } from '../lib/methode-ikea-acces.js';

const entetes = {
  'Content-Type': 'text/html; charset=utf-8',
  // Contenu par personne : aucun cache partagé (CDN) ni navigateur.
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

export default async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const email = await sessionValide(req).catch((err) => {
    console.error('[methode-ikea] session check failed:', err);
    return null;
  });

  if (!email) return new Response(pageAcces({ prix: prixAffiche() }), { status: 200, headers: entetes });

  const html = await store().get(CONTENT_KEY, { type: 'text' });
  if (!html) {
    console.error('[methode-ikea] contenu absent : lancer `node scripts/methode-ikea.mjs content <fichier>`');
    return new Response('<!doctype html><meta charset="utf-8"><title>Méthode IKEA</title><p style="font-family:sans-serif;padding:24px">La formation est en cours de mise à jour. Reviens dans quelques minutes.</p>', { status: 503, headers: entetes });
  }
  return new Response(html, { status: 200, headers: entetes });
};

export const config = { path: ['/methode-ikea', '/methode-ikea/'] };
