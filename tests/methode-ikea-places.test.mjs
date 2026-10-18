// Tickets mensuels de la Méthode IKEA : vue publique et saisie admin.
// Mocke @netlify/blobs : aucun appel réseau.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const data = new Map();
mock.module('@netlify/blobs', {
  namedExports: {
    getStore: () => ({
      get: async (k) => (data.has(k) ? structuredClone(data.get(k)) : null),
      setJSON: async (k, v) => void data.set(k, structuredClone(v)),
    }),
  },
});

const { default: handler, jetonValide } = await import('../netlify/functions/methode-ikea-places.js');
const { etatTickets, moisCourant, consommerTicket } = await import('../netlify/lib/methode-ikea-tickets.js');

const TOKEN = 'jeton-admin-de-test-0123456789';
process.env.METHODE_IKEA_ADMIN_TOKEN = TOKEN;
const get = async () => { const r = await handler(new Request('https://x/.netlify/functions/methode-ikea-places')); return [r.status, await r.json()]; };
const post = async (body, auth = `Bearer ${TOKEN}`) => {
  const r = await handler(new Request('https://x/.netlify/functions/methode-ikea-places', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) }));
  return [r.status, await r.json()];
};

test('mois vide : 20 places, prochain ticket n° 1', async () => {
  data.clear();
  const [s, b] = await get();
  assert.equal(s, 200);
  assert.deepEqual(b, { live: true, mois: moisCourant(), places: 20, vendues: 0, restantes: 20, prochain: 1 });
});

test('la vue publique ne laisse sortir aucun identifiant de commande', async () => {
  data.clear();
  await consommerTicket('ORD-SECRET');
  const [, b] = await get();
  assert.ok(!JSON.stringify(b).includes('ORD-SECRET'));
  assert.equal(b.restantes, 19);
  assert.equal(b.prochain, 2);
});

test('complet : 0 restante, plus de prochain ticket, jamais de chiffre négatif', () => {
  const st = etatTickets({ orders: Array.from({ length: 23 }, (_, i) => 'o' + i) }, '2026-10');
  assert.equal(st.restantes, 0);
  assert.equal(st.vendues, 20);
  assert.equal(st.prochain, null);
});

test('le quota suit METHODE_IKEA_PLACES_APPELS', () => {
  process.env.METHODE_IKEA_PLACES_APPELS = '12';
  assert.equal(etatTickets({ orders: ['a'] }, '2026-10').restantes, 11);
  delete process.env.METHODE_IKEA_PLACES_APPELS;
});

test('admin : sans jeton, mauvais jeton ou jeton non configuré → refus', async () => {
  data.clear();
  assert.equal((await post({ action: 'ajouter' }, null))[0], 401);
  assert.equal((await post({ action: 'ajouter' }, 'Bearer faux'))[0], 401);
  delete process.env.METHODE_IKEA_ADMIN_TOKEN;
  assert.equal((await post({ action: 'ajouter' }))[0], 503);
  process.env.METHODE_IKEA_ADMIN_TOKEN = TOKEN;
  assert.equal(data.size, 0);
});

test('admin : ajouter puis retirer le dernier ticket manuel', async () => {
  data.clear();
  await consommerTicket('ORD-PAYPAL');
  const [s1, b1] = await post({ action: 'ajouter' });
  assert.equal(s1, 200);
  assert.equal(b1.restantes, 18);
  const [s2, b2] = await post({ action: 'retirer' });
  assert.equal(s2, 200);
  assert.equal(b2.restantes, 19);
  assert.deepEqual(data.get(`quota/${moisCourant()}`), { orders: ['ORD-PAYPAL'] });
  assert.equal((await post({ action: 'retirer' }))[0], 404);
});

test('admin : retirer une vente précise, refuser un mois mal formé', async () => {
  data.clear();
  await consommerTicket('ORD-A');
  const [, b] = await post({ action: 'retirer', id: 'ORD-A' });
  assert.equal(b.restantes, 20);
  assert.equal((await post({ action: 'retirer', mois: '2026-13' }))[0], 400);
  assert.equal((await post({ action: 'ajouter', mois: '2020-01' }))[0], 400);
});

test('jetonValide : comparaison stricte', () => {
  assert.ok(jetonValide('Bearer abc', 'abc'));
  assert.ok(!jetonValide('Bearer abcd', 'abc'));
  assert.ok(!jetonValide('abc', 'abc'));
  assert.ok(!jetonValide('Bearer abc', ''));
});

test('méthode non prévue → 405', async () => {
  const r = await handler(new Request('https://x/', { method: 'DELETE' }));
  assert.equal(r.status, 405);
});
