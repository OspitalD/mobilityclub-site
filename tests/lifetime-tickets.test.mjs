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

test('la série à 249 € expose dix tickets pris et dix tickets libres', async () => {
  captureBlobs = [];
  const response = await handler(new Request('http://localhost/.netlify/functions/lifetime-tickets'));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.live, true);
  assert.equal(payload.price, 249);
  assert.equal(payload.total, 40);
  assert.equal(payload.sold, 30);
  assert.equal(payload.remaining, 10);
  assert.equal(payload.tier, 2);
  assert.equal(payload.tickets.length, 20);
  assert.deepEqual(payload.tickets.filter((ticket) => ticket.status === 'sold').map((ticket) => ticket.number), [1, 5, 7, 8, 10, 13, 14, 15, 18, 20]);
  assert.deepEqual(payload.tickets.filter((ticket) => ticket.status === 'available').map((ticket) => ticket.number), [2, 3, 4, 6, 9, 11, 12, 16, 17, 19]);
});

test('la onzième capture PayPal ajoute un ticket vendu au motif déclaré', async () => {
  captureBlobs = Array.from({ length: 11 }, (_, index) => `249/CAP-${index + 1}`);
  const response = await handler(new Request('http://localhost/.netlify/functions/lifetime-tickets'));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.sold, 31);
  assert.equal(payload.remaining, 9);
  assert.equal(payload.tickets[0].status, 'sold');
  assert.equal(payload.tickets[1].status, 'sold');
  assert.equal(payload.tickets[2].status, 'available');
});
