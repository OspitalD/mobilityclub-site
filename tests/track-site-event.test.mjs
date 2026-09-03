import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const records = [];
mock.module('@netlify/blobs', {
  namedExports: {
    connectLambda: () => {},
    getStore: () => ({
      setJSON: async (key, value) => void records.push({ key, value }),
    }),
  },
});

const { handler } = await import('../netlify/functions/track-site-event.js');

const envoyer = (event, props) =>
  handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ event, props, vid: 'abcd1234' }),
  });

test('les quatre étapes de conversion Lifetime sont acceptées et mesurées', async () => {
  records.length = 0;

  for (const event of ['identity_completed', 'ticket_selected', 'checkout_started', 'purchase_confirmed']) {
    const response = await envoyer(event, {
      ticket: '07', tier: 1, price: 199,
      first_name: 'Damien', last_name: 'Ospital', email: 'jamais@stocke.fr',
    });
    assert.equal(response.statusCode, 200);
  }

  assert.equal(records.length, 4);
  assert.deepEqual(records[0].value.props, { ticket: '07', tier: '1', price: '199' });
  assert.ok(!JSON.stringify(records).includes('jamais@stocke.fr'));
  assert.ok(!JSON.stringify(records).includes('Damien'));
});
