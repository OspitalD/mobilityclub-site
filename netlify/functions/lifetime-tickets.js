import { lireEtatCampagne } from '../lib/lifetime-ticketing.js';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(body),
});

const handleLegacyRequest = async (req) => {
  if (req.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });
  try {
    return json(200, await lireEtatCampagne());
  } catch (err) {
    console.error('[lifetime-tickets] lecture impossible:', err?.message);
    return json(503, { live: false, error: 'tickets_unavailable' });
  }
};

export default async (request) => {
  const response = await handleLegacyRequest({
    httpMethod: request.method,
    headers: Object.fromEntries(request.headers),
    body: await request.text(),
    isBase64Encoded: false,
  });
  return new Response(response.body, {
    status: response.statusCode,
    headers: response.headers,
  });
};
