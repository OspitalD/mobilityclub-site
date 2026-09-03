import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

let entries = [];
let listError = null;

mock.module('@netlify/blobs', {
  namedExports: {
    connectLambda: () => {},
    getStore: (name) => name === 'lifetime_pass_2026' ? {
      list: async () => {
        if (listError) throw listError;
        return { blobs: entries.map((key) => ({ key, etag: 'etag' })) };
      },
      get: async () => ({}),
    } : {
      getWithMetadata: async () => null,
    },
  },
});

const { calculerStock, default: handler } = await import('../netlify/functions/lifetime-stock.js');

const keys = (count, price = 199) =>
  Array.from({ length: count }, (_, index) => `${price}/CAP-${price}-${index + 1}`);

const body = (response) => JSON.parse(response.body);

test('un état vide expose immédiatement le tarif unique à 249 €', () => {
  assert.deepEqual(calculerStock({ sold: 0 }), {
    live: true,
    total: 20,
    sold: 0,
    remaining: 20,
    tier: '249',
    first_tier_remaining: 20,
  });
});

test('le dernier ticket reste à 249 € puis ferme l’offre', () => {
  assert.equal(calculerStock({ sold: 19 }).tier, '249');
  const stock = calculerStock({ sold: 20 });
  assert.equal(stock.tier, 'sold_out');
  assert.equal(stock.sold, 20);
  assert.equal(stock.remaining, 0);
  assert.equal(stock.first_tier_remaining, 0);
});

test('le stock reste borné à 20 ventes', () => {
  const stock = calculerStock({ sold: 40 });
  assert.equal(stock.tier, 'sold_out');
  assert.equal(stock.sold, 20);
  assert.equal(stock.remaining, 0);
});

test('GET renvoie seulement les agrégats publics', async () => {
  entries = [...keys(3, 199), '197/CAP-ANNUEL'];
  listError = null;
  const native = await handler(new Request('http://localhost/.netlify/functions/lifetime-stock'));
  const response = { statusCode: native.status, headers: Object.fromEntries(native.headers), body: await native.text() };
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(body(response).sold, 3);
  assert.ok(!response.body.includes('CAP-'));
});

test('panne Blobs → 503 fail closed, aucun faux stock', async () => {
  listError = new Error('blobs indisponible');
  const native = await handler(new Request('http://localhost/.netlify/functions/lifetime-stock'));
  const response = { statusCode: native.status, body: await native.text() };
  listError = null;
  assert.equal(response.statusCode, 503);
  assert.deepEqual(body(response), { live: false, error: 'stock_unavailable' });
});

test('POST est refusé', async () => {
  const response = await handler(new Request('http://localhost/.netlify/functions/lifetime-stock', { method: 'POST' }));
  assert.equal(response.status, 405);
});
