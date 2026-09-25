import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

let captureBlobs = [];

mock.module('@netlify/blobs', {
  namedExports: {
    getStore: (name) => {
      if (name === 'lifetime_pass_2026') {
        return {
          list: async () => ({ blobs: captureBlobs.map((key) => ({ key })) }),
          get: async () => null,
        };
      }
      return {
        getWithMetadata: async () => null,
      };
    },
  },
});

const { default: handler } = await import('../netlify/functions/lifetime-tickets.js');

test('la série à 249 € expose quinze tickets pris et cinq tickets libres', async () => {
  captureBlobs = [];
  const response = await handler(new Request('http://localhost/.netlify/functions/lifetime-tickets'));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.live, true);
  assert.equal(payload.price, 249);
  assert.equal(payload.total, 40);
  assert.equal(payload.sold, 35);
  assert.equal(payload.remaining, 5);
  assert.equal(payload.tier, 2);
  assert.equal(payload.tickets.length, 20);
  assert.deepEqual(payload.tickets.filter((ticket) => ticket.status === 'sold').map((ticket) => ticket.number), [1, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 18, 20]);
  assert.deepEqual(payload.tickets.filter((ticket) => ticket.status === 'available').map((ticket) => ticket.number), [2, 3, 11, 17, 19]);
});

test('la seizième capture PayPal ajoute un ticket vendu au motif déclaré', async () => {
  captureBlobs = Array.from({ length: 16 }, (_, index) => `249/CAP-${index + 1}`);
  const response = await handler(new Request('http://localhost/.netlify/functions/lifetime-tickets'));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.sold, 36);
  assert.equal(payload.remaining, 4);
  assert.equal(payload.tickets[0].status, 'sold');
  assert.equal(payload.tickets[1].status, 'sold');
  assert.equal(payload.tickets[2].status, 'available');
});
