// Lifetime en phase V2 : 350 € quel que soit le palier, côté serveur (checkout ET état renvoyé).
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

const { default: checkout } = await import('../netlify/functions/lifetime-checkout.js');
const { default: tickets } = await import('../netlify/functions/lifetime-tickets.js');
const { etatCampagne, inventaireVide, normaliserInventaire } = await import('../netlify/lib/lifetime-ticketing.js');

const PASSE = '2000-01-01T00:00:00.000Z';
const FUTUR = '2099-01-01T00:00:00.000Z';

const call = async (payload) => {
  const response = await checkout(new Request('http://localhost/.netlify/functions/lifetime-checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }));
  return { statusCode: response.status, body: await response.json() };
};

let orders;
let montantCapture; // null = le montant de l'ordre
beforeEach(() => {
  stores.clear();
  etagSequence = 0;
  orders = new Map();
  montantCapture = null;
  process.env.PAYPAL_CLIENT_ID = 'client-test';
  process.env.PAYPAL_CLIENT_SECRET = 'secret-test';
  process.env.PAYPAL_MONTANTS_ACCEPTES = '199.00,249.00,350.00';
  process.env.PAYPAL_ENV = 'sandbox';
  process.env.LIFETIME_RETURN_ORIGIN = 'http://localhost:8888';
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.endsWith('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 'a' }));
    if (target.endsWith('/v2/checkout/orders') && options.method === 'POST') {
      const id = `ORDER${orders.size + 1}`;
      orders.set(id, JSON.parse(options.body));
      return new Response(JSON.stringify({ id, links: [{ rel: 'payer-action', href: `https://paypal.test/${id}` }] }), { status: 201 });
    }
    const m = /\/v2\/checkout\/orders\/([^/]+)\/capture$/.exec(target);
    if (m && options.method === 'POST') {
      const unit = orders.get(m[1]).purchase_units[0];
      return new Response(JSON.stringify({ id: m[1], status: 'COMPLETED', purchase_units: [{ payments: { captures: [{
        id: `CAP-${m[1]}`, status: 'COMPLETED', custom_id: unit.custom_id,
        amount: montantCapture ? { ...unit.amount, value: montantCapture } : unit.amount,
      }] } }] }));
    }
    throw new Error(`appel inattendu: ${target}`);
  };
});

test('phase v2 : lifetime-tickets annonce 350 €', async () => {
  process.env.OFFRE_V2_FIN = PASSE;
  const payload = await (await tickets(new Request('http://localhost/x'))).json();
  assert.equal(payload.price, 350);
});

test('fenêtre : lifetime-tickets annonce toujours 249 €', async () => {
  process.env.OFFRE_V2_FIN = FUTUR;
  const payload = await (await tickets(new Request('http://localhost/x'))).json();
  assert.equal(payload.price, 249);
});

test('phase v2 : l’ordre PayPal est créé à 350,00 € et la capture est enregistrée', async () => {
  process.env.OFFRE_V2_FIN = PASSE;
  const created = await call({ action: 'create', ticket: 19 });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.price, 350);
  assert.equal(orders.get('ORDER1').purchase_units[0].amount.value, '350.00');
  const reservation = bucket('lifetime_ticket_inventory_2026').get('inventory').data.tiers[2]['19'];
  const captured = await call({ action: 'capture', tier: 2, ticket: 19, reservation: reservation.token, order_id: 'ORDER1' });
  assert.equal(captured.statusCode, 200);
  assert.equal(bucket('lifetime_ticket_inventory_2026').get('inventory').data.tiers[2]['19'].status, 'sold');
});

test('phase v2 : 350 € est refusé tant que le montant n’est pas autorisé côté PayPal (libère le ticket)', async () => {
  process.env.OFFRE_V2_FIN = PASSE;
  process.env.PAYPAL_MONTANTS_ACCEPTES = '199.00,249.00';
  const r = await call({ action: 'create', ticket: 19 });
  assert.equal(r.statusCode, 503);
  assert.equal(r.body.price, 350);
  assert.equal(bucket('lifetime_ticket_inventory_2026').get('inventory').data.tiers[2]['19'], undefined);
});

test('le prix est unique en v2 quel que soit le palier (état pur)', () => {
  process.env.OFFRE_V2_FIN = PASSE;
  const inv = normaliserInventaire(inventaireVide(), { 1: 0, 2: 0 });
  assert.equal(etatCampagne(inv, { 1: 0, 2: 0 }).price, 350);
  // palier 1 non complet : on retire les ventes déclarées du palier 1 pour forcer tier=1
  const inv1 = { version: 2, tiers: { 1: {}, 2: {} } };
  const etat = etatCampagne(inv1, { 1: 0, 2: 0 });
  assert.equal(etat.tier, 1);
  assert.equal(etat.price, 350);
});

test('réservé à 249 € dans la fenêtre, payé après la fin : honoré à 249 €', async () => {
  process.env.OFFRE_V2_FIN = FUTUR;
  assert.equal((await call({ action: 'create', ticket: 19 })).body.price, 249);
  const reservation = bucket('lifetime_ticket_inventory_2026').get('inventory').data.tiers[2]['19'];
  process.env.OFFRE_V2_FIN = PASSE; // la fenêtre se ferme pendant le paiement PayPal
  const captured = await call({ action: 'capture', tier: 2, ticket: 19, reservation: reservation.token, order_id: 'ORDER1' });
  assert.equal(captured.statusCode, 200);
  assert.equal(bucket('lifetime_ticket_inventory_2026').get('inventory').data.tiers[2]['19'].status, 'sold');
});

test('un montant capturé différent du montant réservé reste refusé', async () => {
  process.env.OFFRE_V2_FIN = PASSE;
  await call({ action: 'create', ticket: 19 });
  const reservation = bucket('lifetime_ticket_inventory_2026').get('inventory').data.tiers[2]['19'];
  montantCapture = '249.00';
  const captured = await call({ action: 'capture', tier: 2, ticket: 19, reservation: reservation.token, order_id: 'ORDER1' });
  assert.notEqual(captured.statusCode, 200);
  assert.notEqual(bucket('lifetime_ticket_inventory_2026').get('inventory').data.tiers[2]['19'].status, 'sold');
});
