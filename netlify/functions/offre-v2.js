import { etatOffre } from '../lib/offre-v2.js';

// no-store : un état d'offre mis en cache par le CDN afficherait l'ancien prix après la fin.
export default async (request) => {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  return new Response(JSON.stringify(etatOffre()), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
