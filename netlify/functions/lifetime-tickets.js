import { lireEtatCampagne } from '../lib/lifetime-ticketing.js';
import { connectLambda } from '@netlify/blobs';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(body),
});

export const handler = async (req) => {
  if (req.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });
  if (req.blobs) connectLambda(req);
  try {
    return json(200, await lireEtatCampagne());
  } catch (err) {
    console.error('[lifetime-tickets] lecture impossible:', err?.message);
    return json(503, { live: false, error: 'tickets_unavailable' });
  }
};
