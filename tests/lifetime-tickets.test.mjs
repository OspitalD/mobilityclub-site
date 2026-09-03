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

test('les trois ventes déclarées occupent les tickets 01 à 03', async () => {
  captureBlobs = [];
  const response = await handler(new Request('http://localhost/.netlify/functions/lifetime-tickets'));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.live, true);
  assert.equal(payload.price, 249);
  assert.equal(payload.total, 20);
  assert.equal(payload.sold, 3);
  assert.equal(payload.remaining, 17);
  assert.equal(payload.tickets.length, 20);
  assert.equal(payload.tickets[0].status, 'sold');
  assert.equal(payload.tickets[1].status, 'sold');
  assert.equal(payload.tickets[2].status, 'sold');
  assert.ok(payload.tickets.slice(3).every((ticket) => ticket.status === 'available'));
});

test('une capture PayPal historique ne gonfle pas les trois ventes déclarées', async () => {
  captureBlobs = ['249/CAP-PREOUVERTURE'];
  const response = await handler(new Request('http://localhost/.netlify/functions/lifetime-tickets'));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.sold, 3);
  assert.equal(payload.remaining, 17);
  assert.equal(payload.tickets[0].status, 'sold');
  assert.equal(payload.tickets[1].status, 'sold');
  assert.equal(payload.tickets[2].status, 'sold');
});
