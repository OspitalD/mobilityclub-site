import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

let entries = [];
let listError = null;

mock.module('@netlify/blobs', {
  namedExports: {
    connectLambda: () => {},
    getStore: () => ({
      list: async () => {
        if (listError) throw listError;
        return { blobs: entries.map((key) => ({ key, etag: 'etag' })) };
      },
    }),
  },
});

const { calculerStock, handler } = await import('../netlify/functions/lifetime-stock.js');

const keys = (count, price = 199) =>
  Array.from({ length: count }, (_, index) => `${price}/CAP-${price}-${index + 1}`);

const body = (response) => JSON.parse(response.body);

test('0 vente → premier palier à 199 € et 40 places', () => {
  assert.deepEqual(calculerStock([]), {
    live: true,
    total: 40,
    sold: 0,
    remaining: 40,
    tier: '199',
    first_tier_remaining: 20,
  });
});

test('la 20e capture bascule réellement le palier à 249 €', () => {
  assert.equal(calculerStock(keys(19)).tier, '199');
  const stock = calculerStock(keys(20));
  assert.equal(stock.tier, '249');
  assert.equal(stock.sold, 20);
  assert.equal(stock.remaining, 20);
  assert.equal(stock.first_tier_remaining, 0);
});

test('40 captures ferment l’offre et les anciennes clés sont ignorées', () => {
  const stock = calculerStock([
    ...keys(20, 199),
    ...keys(20, 249),
    '197/CAP-ANNUEL',
    '100/CAP-RETOUR',
  ]);
  assert.equal(stock.tier, 'sold_out');
  assert.equal(stock.sold, 40);
  assert.equal(stock.remaining, 0);
});

test('GET renvoie seulement les agrégats publics', async () => {
  entries = [...keys(3, 199), '197/CAP-ANNUEL'];
  listError = null;
  const response = await handler({ httpMethod: 'GET' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(body(response).sold, 3);
  assert.ok(!response.body.includes('CAP-'));
});

test('panne Blobs → 503 fail closed, aucun faux stock', async () => {
  listError = new Error('blobs indisponible');
  const response = await handler({ httpMethod: 'GET' });
  listError = null;
  assert.equal(response.statusCode, 503);
  assert.deepEqual(body(response), { live: false, error: 'stock_unavailable' });
});

test('POST est refusé', async () => {
  const response = await handler({ httpMethod: 'POST' });
  assert.equal(response.statusCode, 405);
});
