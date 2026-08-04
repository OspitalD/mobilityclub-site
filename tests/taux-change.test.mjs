// Harnais du taux USD→EUR. Aucun appel réseau réel.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const blobs = new Map();
mock.module('@netlify/blobs', {
  namedExports: {
    getStore: () => ({
      get: async (k) => (blobs.has(k) ? blobs.get(k) : null),
      setJSON: async (k, v) => void blobs.set(k, v),
    }),
  },
});

const { handler, tauxPlausible } = await import('../netlify/functions/taux-change.js');

const GET = () => handler({ httpMethod: 'GET' });
const corps = (rep) => JSON.parse(rep.body);

const brancher = ({ frankfurter = 0.86843, erapi = 0.87, plantage = false } = {}) => {
  globalThis.fetch = async (url) => {
    if (plantage) throw new Error('réseau coupé');
    const u = String(url);
    if (u.includes('frankfurter')) {
      if (frankfurter === null) return new Response('nope', { status: 500 });
      return new Response(JSON.stringify({ date: '2026-08-04', rates: { EUR: frankfurter } }));
    }
    if (u.includes('er-api')) {
      if (erapi === null) return new Response('nope', { status: 500 });
      return new Response(
        JSON.stringify({ time_last_update_utc: 'Tue, 04 Aug 2026 00:02:31 +0000', rates: { EUR: erapi } })
      );
    }
    throw new Error('appel inattendu: ' + u);
  };
};

test('tauxPlausible borne ce qu’un USD→EUR peut valoir', () => {
  for (const v of [0.86843, 0.51, 1.49]) assert.ok(tauxPlausible(v), String(v));
  for (const v of [0, -1, 0.4, 1.6, 100, null, '0.9', NaN, Infinity]) assert.ok(!tauxPlausible(v), String(v));
});

test('cas nominal : taux de la source primaire, mis en cache', async () => {
  blobs.clear();
  brancher();
  const rep = await GET();
  assert.equal(rep.statusCode, 200);
  const d = corps(rep);
  assert.equal(d.rate, 0.86843);
  assert.equal(d.source, 'frankfurter');
  assert.equal(d.stale, false);
  assert.equal(blobs.size, 1);
  // Le prix affiché en découle : 25 $ → 22 € (arrondi VERS LE HAUT).
  assert.equal(Math.ceil(25 * d.rate), 22);
});

test('deuxième appel : servi du cache, sans retoucher au réseau', async () => {
  blobs.clear();
  brancher();
  await GET();
  let appels = 0;
  const vrai = globalThis.fetch;
  globalThis.fetch = async (u) => { appels++; return vrai(u); };
  const d = corps(await GET());
  assert.equal(appels, 0, 'un taux frais ne doit pas déclencher d’appel');
  assert.equal(d.rate, 0.86843);
});

test('source primaire HS → bascule sur la secondaire', async () => {
  blobs.clear();
  brancher({ frankfurter: null });
  const d = corps(await GET());
  assert.equal(d.source, 'er-api');
  assert.equal(d.rate, 0.87);
});

test('taux aberrant → refusé, on passe à la source suivante', async () => {
  blobs.clear();
  brancher({ frankfurter: 87 }); // format changé : centimes au lieu d’unités
  const d = corps(await GET());
  assert.equal(d.source, 'er-api', 'un taux hors bornes ne doit jamais sortir');
});

test('tout est HS mais on a un taux d’hier → servi, marqué périmé', async () => {
  blobs.clear();
  brancher();
  await GET();
  blobs.set('usd-eur', { ...blobs.get('usd-eur'), fetched_at: '2020-01-01T00:00:00.000Z' });
  brancher({ plantage: true });
  const rep = await GET();
  assert.equal(rep.statusCode, 200);
  assert.equal(corps(rep).stale, true);
});

test('tout est HS et aucun historique → 503, la page n’affichera aucun euro', async () => {
  blobs.clear();
  brancher({ plantage: true });
  const rep = await GET();
  assert.equal(rep.statusCode, 503);
  assert.equal(corps(rep).error, 'taux_indisponible');
});

test('POST → 405', async () => {
  brancher();
  assert.equal((await handler({ httpMethod: 'POST' })).statusCode, 405);
});

test('une réponse servie est mise en cache par le CDN, une erreur ne l’est pas', async () => {
  blobs.clear();
  brancher();
  assert.match((await GET()).headers['Netlify-CDN-Cache-Control'], /max-age=21600/);
  blobs.clear();
  brancher({ plantage: true });
  assert.equal((await GET()).headers['Cache-Control'], 'no-store');
});
