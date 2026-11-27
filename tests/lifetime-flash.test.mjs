// 2e panier de l'offre flash : la caisse à vie réserve le premier ticket libre à 350 € (500 − 150) sur un jeton vivant.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const stores = new Map();
let etag = 0;
const bucket = (n) => { if (!stores.has(n)) stores.set(n, new Map()); return stores.get(n); };
mock.module('@netlify/blobs', {
  namedExports: {
    connectLambda: () => {},
    getStore: (name) => {
      const d = bucket(typeof name === 'string' ? name : name.name);
      return {
        list: async ({ prefix = '' } = {}) => ({ blobs: [...d.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
        get: async (key) => structuredClone(d.get(key)?.data ?? null),
        getWithMetadata: async (key) => (d.has(key) ? { data: structuredClone(d.get(key).data), etag: d.get(key).etag } : null),
        setJSON: async (key, value, o = {}) => {
          const cur = d.get(key);
          if (o.onlyIfNew && cur) return { modified: false };
          if (o.onlyIfMatch && cur?.etag !== o.onlyIfMatch) return { modified: false };
          d.set(key, { data: structuredClone(value), etag: `e${++etag}` });
          return { modified: true };
        },
      };
    },
  },
});

process.env.PAYPAL_CLIENT_ID = 'id';
process.env.PAYPAL_CLIENT_SECRET = 'secret';
process.env.PAYPAL_MONTANTS_ACCEPTES = '197.00,100.00,249.00,350.00,500.00';
const VENDREDI = Date.parse('2026-11-27T15:00:00Z');
mock.timers.enable({ apis: ['Date'], now: VENDREDI });

const lib = await import('../netlify/lib/saison-edition1.js');
const { default: handler } = await import('../netlify/functions/lifetime-checkout.js');
const commandes = [];
globalThis.fetch = async (url, o = {}) => {
  if (String(url).endsWith('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 't' }));
  commandes.push(JSON.parse(o.body).purchase_units[0]);
  return new Response(JSON.stringify({ id: 'ORDERLIFE1', links: [{ rel: 'payer-action', href: 'https://paypal.test/ok' }] }), { status: 201 });
};
const appeler = async (payload) => {
  const r = await handler(new Request('http://x/.netlify/functions/lifetime-checkout', { method: 'POST', body: JSON.stringify(payload) }));
  return { status: r.status, d: await r.json() };
};
const poserJeton = (id, vie) => bucket(lib.STORE).set(`${lib.PREFIX_FLASH}${id}`, { data: {
  id, cree_at: new Date(VENDREDI).toISOString(), expire_at: new Date(VENDREDI + 300000).toISOString(),
  ...(vie ? { vie: { cree_at: new Date(VENDREDI).toISOString(), expire_at: new Date(VENDREDI + 300000).toISOString() } } : {}),
} });
const ID = '11111111-1111-4111-8111-111111111111';

test('jeton du 2e panier → commande à vie à 350 €, ticket choisi par le serveur', async () => {
  stores.clear(); poserJeton(ID, true);
  const r = await appeler({ action: 'create', flash: ID, return_path: '/lifetime' });
  assert.equal(r.status, 201);
  assert.equal(r.d.price, 350);
  assert.equal(commandes.at(-1).amount.value, '350.00');
  assert.match(commandes.at(-1).custom_id, /^MC-LIFE-2026-T3-\d{2}-/);
});

test('1er panier seulement (pas de 2e) → 410', async () => {
  stores.clear(); poserJeton(ID, false);
  assert.equal((await appeler({ action: 'create', flash: ID })).status, 410);
});

test('2e panier expiré → 410 ; sans jeton le prix reste 500 €', async () => {
  stores.clear(); poserJeton(ID, true);
  mock.timers.setTime(VENDREDI + 6 * 60 * 1000);
  assert.equal((await appeler({ action: 'create', flash: ID })).status, 410);
  const r = await appeler({ action: 'create', ticket: 2 });
  assert.equal(r.d.price, 500);
  mock.timers.setTime(VENDREDI);
});
