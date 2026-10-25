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

test('la variante de hero servie par la page (coach) est acceptée, une inconnue est refusée', async () => {
  const avecVariante = (variant) =>
    handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ event: 'page_view', variant, vid: 'abcd1234' }) });
  assert.equal((await avecVariante('coach')).statusCode, 200);
  assert.equal((await avecVariante('inconnue')).statusCode, 400);
});

test('les événements de la page de lancement et sa variante sont acceptés et stockés', async () => {
  records.length = 0;
  for (const event of ['offer_viewed', 'video_played', 'faq_opened']) {
    const response = await handler({
      httpMethod: 'POST', headers: {},
      body: JSON.stringify({ event, variant: 'lancement', vid: 'abcd1234', props: { path: '/lancement', lang: 'fr' } }),
    });
    assert.equal(response.statusCode, 200, event);
  }
  assert.deepEqual(records.map((r) => r.value.event), ['offer_viewed', 'video_played', 'faq_opened']);
  assert.ok(records.every((r) => r.value.variant === 'lancement'));
  // La whitelist reste fermée : un événement non prévu est toujours refusé.
  assert.equal((await envoyer('inconnu', {})).statusCode, 400);
});
