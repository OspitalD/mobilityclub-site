import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module('@netlify/blobs', {
  namedExports: {
    getStore: (name) => {
      if (name === 'lifetime_pass_2026') {
        return {
          list: async () => ({ blobs: [] }),
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

test('la fonction moderne expose les 20 tickets libres du premier carnet', async () => {
  const response = await handler(new Request('http://localhost/.netlify/functions/lifetime-tickets'));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.live, true);
  assert.equal(payload.price, 199);
  assert.equal(payload.tickets.length, 20);
  assert.ok(payload.tickets.every((ticket) => ticket.status === 'available'));
});
