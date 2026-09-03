import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const stores = new Map();
let etagSequence = 0;
const bucket = (name) => {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name);
};

mock.module('@netlify/blobs', {
  namedExports: {
    connectLambda: () => {},
    getStore: (name) => {
      const data = bucket(typeof name === 'string' ? name : name.name);
      return {
        list: async () => ({ blobs: [...data.entries()].map(([key, value]) => ({ key, etag: value.etag })) }),
        get: async (key) => structuredClone(data.get(key)?.data ?? null),
        getWithMetadata: async (key) => {
          const value = data.get(key);
          return value ? { data: structuredClone(value.data), metadata: {}, etag: value.etag } : null;
        },
        setJSON: async (key, value, options = {}) => {
          const current = data.get(key);
          if (options.onlyIfNew && current) return { modified: false };
          if (options.onlyIfMatch && current?.etag !== options.onlyIfMatch) return { modified: false };
          const etag = `etag-${++etagSequence}`;
          data.set(key, { data: structuredClone(value), etag });
          return { modified: true, etag };
        },
      };
    },
  },
});

const { default: handler } = await import('../netlify/functions/lifetime-checkout.js');

const call = async (payload) => {
  const response = await handler(new Request('http://localhost/.netlify/functions/lifetime-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers),
    body: await response.text(),
  };
};
const body = (response) => JSON.parse(response.body);

let orders;
beforeEach(() => {
  stores.clear();
  etagSequence = 0;
  orders = new Map();
  process.env.PAYPAL_CLIENT_ID = 'client-test';
  process.env.PAYPAL_CLIENT_SECRET = 'secret-test';
  process.env.PAYPAL_MONTANTS_ACCEPTES = '199.00,249.00';
  process.env.PAYPAL_ENV = 'sandbox';
  process.env.LIFETIME_RETURN_ORIGIN = 'http://localhost:8888';

  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.endsWith('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 'access-test' }));
    if (target.endsWith('/v2/checkout/orders') && options.method === 'POST') {
      const payload = JSON.parse(options.body);
      const id = `ORDER${orders.size + 1}`;
      orders.set(id, payload);
      return new Response(JSON.stringify({
        id,
        status: 'PAYER_ACTION_REQUIRED',
        links: [{ rel: 'payer-action', href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` }],
      }), { status: 201 });
    }
    const captureMatch = /\/v2\/checkout\/orders\/([^/]+)\/capture$/.exec(target);
    if (captureMatch && options.method === 'POST') {
      const id = decodeURIComponent(captureMatch[1]);
      const payload = orders.get(id);
      const unit = payload.purchase_units[0];
      return new Response(JSON.stringify({
        id,
        status: 'COMPLETED',
        purchase_units: [{ payments: { captures: [{
          id: `CAP-${id}`,
          status: 'COMPLETED',
          custom_id: unit.custom_id,
          amount: unit.amount,
        }] } }],
      }));
    }
    throw new Error(`appel PayPal inattendu: ${target}`);
  };
});

test('choix libre → réservation atomique → ordre PayPal numéroté → capture', async () => {
  const created = await call({ action: 'create', ticket: 19, return_path: '/devenir-membre' });
  assert.equal(created.statusCode, 201);
  assert.equal(body(created).ticket, 19);
  assert.match(body(created).approve_url, /ORDER1/);

  const inventory = bucket('lifetime_ticket_inventory_2026').get('inventory').data;
  const reservation = inventory.tiers[2]['19'];
  assert.equal(reservation.status, 'reserved');
  assert.equal(reservation.order_id, 'ORDER1');
  assert.match(orders.get('ORDER1').payment_source.paypal.experience_context.return_url, /\/devenir-membre\?paypal=return/);

  const duplicate = await call({ action: 'create', ticket: 19 });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(body(duplicate).error, 'ticket_unavailable');

  const captured = await call({
    action: 'capture',
    tier: 2,
    ticket: 19,
    reservation: reservation.token,
    order_id: 'ORDER1',
  });
  assert.equal(captured.statusCode, 200);
  assert.equal(body(captured).ok, true);
  assert.equal(bucket('lifetime_ticket_inventory_2026').get('inventory').data.tiers[2]['19'].status, 'sold');
  assert.equal(orders.get('ORDER1').purchase_units[0].amount.value, '249.00');
  assert.ok(bucket('lifetime_pass_2026').has('249/CAP-ORDER1'));
});

test('le webhook arrivé avant le retour client ne crée aucun ticket fantôme', async () => {
  const created = await call({ action: 'create', ticket: 19 });
  const inventory = bucket('lifetime_ticket_inventory_2026').get('inventory').data;
  const reservation = inventory.tiers[2]['19'];
  const customId = orders.get('ORDER1').purchase_units[0].custom_id;

  // PayPal peut notifier le webhook pendant que la réponse de capture revient.
  bucket('lifetime_pass_2026').set('249/CAP-ORDER1', {
    data: { capture_id: 'CAP-ORDER1', custom_id: customId },
    etag: 'webhook-first',
  });

  const captured = await call({
    action: 'capture',
    tier: 2,
    ticket: 19,
    reservation: reservation.token,
    order_id: 'ORDER1',
  });
  assert.equal(created.statusCode, 201);
  assert.equal(captured.statusCode, 200);

  const state = bucket('lifetime_ticket_inventory_2026').get('inventory').data;
  assert.ok(Array.from({ length: 20 }, (_, index) => state.tiers[1][String(index + 1).padStart(2, '0')].status === 'sold').every(Boolean));
  assert.equal(state.tiers[2]['19'].status, 'sold');
});

test('au 19e paiement à 249 €, une seule réservation peut occuper la dernière place', async () => {
  const captures = bucket('lifetime_pass_2026');
  for (let index = 1; index <= 19; index++) captures.set(`249/CAP-${index}`, { data: {}, etag: `paid-${index}` });

  const last = await call({ action: 'create', ticket: 20 });
  assert.equal(last.statusCode, 201);
  assert.equal(body(last).price, 249);

  const overflow = await call({ action: 'create', ticket: 19 });
  assert.equal(overflow.statusCode, 409);
});

test('un prix absent de la configuration PayPal libère immédiatement le ticket', async () => {
  process.env.PAYPAL_MONTANTS_ACCEPTES = '197.00';
  const response = await call({ action: 'create', ticket: 19 });
  assert.equal(response.statusCode, 503);
  assert.equal(body(response).error, 'price_not_configured');
  assert.equal(bucket('lifetime_ticket_inventory_2026').get('inventory').data.tiers[2]['19'], undefined);
});

test('aucun secret PayPal ne sort dans les erreurs', async () => {
  globalThis.fetch = async () => new Response('nope', { status: 500 });
  const response = await call({ action: 'create', ticket: 19 });
  assert.equal(response.statusCode, 502);
  assert.ok(!response.body.includes('secret-test'));
});
