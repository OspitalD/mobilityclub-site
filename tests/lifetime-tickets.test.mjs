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

test('le premier carnet complet ouvre 20 tickets libres à 249 €', async () => {
  captureBlobs = [];
  const response = await handler(new Request('http://localhost/.netlify/functions/lifetime-tickets'));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.live, true);
  assert.equal(payload.price, 249);
  assert.equal(payload.total, 40);
  assert.equal(payload.sold, 20);
  assert.equal(payload.remaining, 20);
  assert.equal(payload.tier, 2);
  assert.equal(payload.tickets.length, 20);
  assert.ok(payload.tickets.every((ticket) => ticket.status === 'available'));
});

test('une capture PayPal historique à 249 € prend le premier ticket du second carnet', async () => {
  captureBlobs = ['249/CAP-PREOUVERTURE'];
  const response = await handler(new Request('http://localhost/.netlify/functions/lifetime-tickets'));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.sold, 21);
  assert.equal(payload.remaining, 19);
  assert.equal(payload.tickets[0].status, 'sold');
  assert.ok(payload.tickets.slice(1).every((ticket) => ticket.status === 'available'));
});
