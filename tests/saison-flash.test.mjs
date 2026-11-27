// Offre flash /panier (27/11/2026) : un panier marqué = un jeton serveur de 5 min ; la commande PayPal
// n'est créée à 97 € que sur un jeton vivant, et seulement pendant le palier 2.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { stores, magasin } from './_kit-blobs-mock.mjs';

process.env.PAYPAL_CLIENT_ID = 'id';
process.env.PAYPAL_CLIENT_SECRET = 'secret';
const lib = await import('../netlify/lib/saison-edition1.js');
const { handler } = await import('../netlify/functions/saison-checkout.js');

const VENDREDI = Date.parse('2026-11-27T15:00:00Z');
const commandes = [];
globalThis.fetch = async (url, opts = {}) => {
  if (String(url).endsWith('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
  const body = JSON.parse(opts.body || '{}');
  commandes.push(body.purchase_units?.[0]);
  return new Response(JSON.stringify({ id: 'ORDER12345', links: [{ rel: 'payer-action', href: 'https://paypal.test/ok' }] }), { status: 201 });
};

const poster = (body) => handler({ httpMethod: 'POST', body: JSON.stringify(body) }).then((r) => ({ status: r.statusCode, d: JSON.parse(r.body) }));
const lire = () => handler({ httpMethod: 'GET' }).then((r) => JSON.parse(r.body));

const a = (iso) => mock.timers.enable({ apis: ['Date'], now: typeof iso === 'number' ? iso : Date.parse(iso) });
const reset = () => { stores.clear(); commandes.length = 0; mock.timers.reset(); delete process.env.FLASH_PANIER_OFF; };

test('palier 2 : le GET annonce le flash actif à 97 € pour 5 min', async () => {
  reset(); a(VENDREDI);
  const e = await lire();
  assert.equal(e.palier, 2);
  assert.deepEqual(e.flash, { actif: true, prix: 97, duree_ms: 300000 });
});

test('panier marqué → jeton de 5 min, commande PayPal à 97 € marquée FLASH (palier 1 pour le webhook)', async () => {
  reset(); a(VENDREDI);
  const j = await poster({ action: 'flash' });
  assert.equal(j.status, 201);
  assert.equal(Date.parse(j.d.expire_at) - VENDREDI, 5 * 60 * 1000);
  const c = await poster({ action: 'create', renonciation: true, flash: j.d.jeton });
  assert.equal(c.status, 201);
  assert.equal(c.d.prix, 97);
  const u = commandes.at(-1);
  assert.equal(u.amount.value, '97.00');
  assert.match(u.custom_id, /^MC-SAISON-E1-P1-FLASH-/);
  assert.equal(lib.palierDuCustomId(u.custom_id), 1);
  assert.ok(lib.montantSaisonValide(u.amount.value, lib.palierDuCustomId(u.custom_id)));
  assert.ok(lib.estVenteFlash(u.custom_id));
  const trace = magasin(lib.STORE).get(`${lib.PREFIX_COMMANDE}ORDER12345`).v;
  assert.equal(trace.flash, j.d.jeton);
});

test('sans jeton, la commande reste à 119 €', async () => {
  reset(); a(VENDREDI);
  await poster({ action: 'create', renonciation: true });
  assert.equal(commandes.at(-1).amount.value, '119.00');
});

test('jeton expiré (5 min + 30 s de grâce) → 410, rien chez PayPal', async () => {
  reset(); a(VENDREDI);
  const j = await poster({ action: 'flash' });
  mock.timers.setTime(VENDREDI + 5 * 60 * 1000 + 29 * 1000);
  assert.equal((await poster({ action: 'create', renonciation: true, flash: j.d.jeton })).status, 201);
  mock.timers.setTime(VENDREDI + 5 * 60 * 1000 + 31 * 1000);
  const n = commandes.length;
  const c = await poster({ action: 'create', renonciation: true, flash: j.d.jeton });
  assert.equal(c.status, 410);
  assert.equal(commandes.length, n);
});

test('jeton inventé → refusé', async () => {
  reset(); a(VENDREDI);
  assert.equal((await poster({ action: 'create', renonciation: true, flash: '00000000-0000-4000-8000-000000000000' })).status, 410);
  assert.equal((await poster({ action: 'create', renonciation: true, flash: 'nimporte' })).status, 400);
});

test('rejouer le panier avec le même jeton ne rallonge pas le temps', async () => {
  reset(); a(VENDREDI);
  const j = await poster({ action: 'flash' });
  mock.timers.setTime(VENDREDI + 3 * 60 * 1000);
  const r = await poster({ action: 'flash', jeton: j.d.jeton });
  assert.equal(r.d.jeton, j.d.jeton);
  assert.equal(r.d.expire_at, j.d.expire_at);
});

test('portes fermées (après lun. 30/11 23 h 59) ou coupure FLASH_PANIER_OFF → pas de flash', async () => {
  reset(); a('2026-11-30T23:00:01Z');
  assert.equal((await poster({ action: 'flash' })).status, 409);
  assert.equal((await lire()).flash.actif, false);
  reset(); a(VENDREDI); process.env.FLASH_PANIER_OFF = '1';
  assert.equal((await poster({ action: 'flash' })).status, 409);
  assert.equal((await lire()).flash.actif, false);
  delete process.env.FLASH_PANIER_OFF;
});

test('palier 1 encore ouvert → pas de flash (le prix est déjà 97 €)', () => {
  const e = lib.etatSaison({ now: Date.parse('2026-11-20T10:00:00Z'), ventes: { total: 0, palier1: 0 }, env: {} });
  assert.equal(e.flash.actif, false);
});
