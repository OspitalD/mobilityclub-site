// Harnais de test du webhook PayPal → Skool.
// Mocke @netlify/blobs et fetch : aucun appel réseau, aucun encaissement.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ── Mock du store Blobs (mémoire) ────────────────────────────────────────────
const blobs = new Map();
const lifetimeBlobs = new Map();
mock.module('@netlify/blobs', {
  namedExports: {
    getStore: (name) => {
      const target = name === 'lifetime_pass_2026' ? lifetimeBlobs : blobs;
      return {
        get: async (k) => (target.has(k) ? target.get(k) : null),
        setJSON: async (k, v) => void target.set(k, v),
      };
    },
  },
});

const { handler, decider, memeMontant, emailValide, montantsAttendus, estMontantLifetime } = await import(
  '../netlify/functions/paypal-to-skool.js'
);

const vider = () => {
  blobs.clear();
  lifetimeBlobs.clear();
};

const SKOOL = 'https://api2.skool.com/groups/mobility-club/webhooks/SECRET-DE-TEST';
process.env.SKOOL_INVITE_WEBHOOK = SKOOL;
process.env.PAYPAL_CLIENT_ID = 'cid';
process.env.PAYPAL_CLIENT_SECRET = 'csec';
process.env.PAYPAL_WEBHOOK_ID = 'whid';

const HEADERS = {
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api.paypal.com/cert',
  'paypal-transmission-id': 'tid',
  'paypal-transmission-sig': 'sig',
  'paypal-transmission-time': '2026-08-04T14:00:00Z',
};

const capture = (montant = '197.00', devise = 'EUR', id = 'CAP-1') => ({
  id: 'WH-1',
  event_type: 'PAYMENT.CAPTURE.COMPLETED',
  resource: {
    id,
    amount: { value: montant, currency_code: devise },
    supplementary_data: { related_ids: { order_id: 'ORD-1' } },
  },
});

// ── Faux PayPal / Skool ──────────────────────────────────────────────────────
let appelsSkool = [];
const brancherFetch = ({ signature = 'SUCCESS', email = 'membre@example.com', skoolOk = true } = {}) => {
  appelsSkool = [];
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 'tok' }));
    if (u.includes('verify-webhook-signature'))
      return new Response(JSON.stringify({ verification_status: signature }));
    if (u.includes('/v2/checkout/orders/'))
      return new Response(JSON.stringify({ payer: { email_address: email } }));
    if (u.startsWith(SKOOL)) {
      appelsSkool.push(u);
      return skoolOk ? new Response('ok') : new Response('nope', { status: 500 });
    }
    throw new Error('appel réseau inattendu: ' + u);
  };
};

const appeler = (evenement, headers = HEADERS) =>
  handler({ httpMethod: 'POST', headers, body: JSON.stringify(evenement) });

// ── Décisions pures ──────────────────────────────────────────────────────────
test('memeMontant : « 197 », « 197.0 », « 197.00 » sont le même montant', () => {
  for (const v of ['197', '197.0', '197.00', 197]) assert.ok(memeMontant(v, '197.00'), String(v));
  for (const v of ['196.99', '1970', '', null, 'abc']) assert.ok(!memeMontant(v, '197.00'), String(v));
});

test('estMontantLifetime : seuls les deux paliers 199 € et 249 € alimentent le stock', () => {
  assert.ok(estMontantLifetime('199'));
  assert.ok(estMontantLifetime('249.00'));
  for (const v of ['100.00', '197.00', '9.00', null]) assert.ok(!estMontantLifetime(v), String(v));
});

test('emailValide rejette ce qui ne partirait nulle part', () => {
  assert.ok(emailValide('a@b.co'));
  for (const v of ['', 'a@b', 'pas-un-email', null, 'a b@c.fr', 'x'.repeat(250) + '@b.co'])
    assert.ok(!emailValide(v), String(v));
});

test('decider : seule une capture de 197 € EUR passe', () => {
  const att = { montant: '197.00', devise: 'EUR' };
  assert.ok(decider(capture(), att).ok);
  assert.equal(decider(capture('9.00'), att).raison, 'montant:9.00');      // librairie Timer
  assert.equal(decider(capture('17.00'), att).raison, 'montant:17.00');    // librairie Timer
  assert.equal(decider(capture('197.00', 'USD'), att).raison, 'devise:USD');
  assert.equal(
    decider({ event_type: 'CHECKOUT.ORDER.APPROVED', resource: {} }, att).raison,
    'type_ignore:CHECKOUT.ORDER.APPROVED'
  );
});

test('decider : une liste de montants ouvre la campagne SANS ouvrir la librairie', () => {
  // Offre de retour des anciens membres : 100 € accepté EN PLUS de l'annuel.
  const att = { montants: ['197.00', '100.00'], devise: 'EUR' };
  assert.ok(decider(capture('197.00'), att).ok);
  assert.ok(decider(capture('100.00'), att).ok);
  assert.ok(decider(capture('100'), att).ok);          // même montant, autre écriture
  // Le garde-fou tient : la librairie du Timer reste dehors.
  assert.equal(decider(capture('9.00'), att).raison, 'montant:9.00');
  assert.equal(decider(capture('14.00'), att).raison, 'montant:14.00');
  assert.equal(decider(capture('17.00'), att).raison, 'montant:17.00');
  assert.equal(decider(capture('100.00', 'USD'), att).raison, 'devise:USD');
});

test('montantsAttendus : défaut inchangé, campagne opt-in, PAYPAL_MONTANTS_ACCEPTES prime', () => {
  // Aucune variable → exactement le comportement d'avant.
  assert.deepEqual(montantsAttendus({}), ['197.00']);
  assert.deepEqual(montantsAttendus({ PAYPAL_MONTANT_ANNUEL: '210.00' }), ['210.00']);
  // Campagne ouverte : liste, espaces tolérés.
  assert.deepEqual(
    montantsAttendus({ PAYPAL_MONTANTS_ACCEPTES: '197.00, 100.00' }),
    ['197.00', '100.00']
  );
  // La liste prime sur l'ancienne variable.
  assert.deepEqual(
    montantsAttendus({ PAYPAL_MONTANTS_ACCEPTES: '100.00', PAYPAL_MONTANT_ANNUEL: '197.00' }),
    ['100.00']
  );
});

// ── Câblage complet ──────────────────────────────────────────────────────────
test('paiement légitime → une invitation Skool, avec le bon email', async () => {
  vider();
  brancherFetch();
  const rep = await appeler(capture());
  assert.equal(rep.statusCode, 200);
  assert.equal(appelsSkool.length, 1);
  assert.ok(appelsSkool[0].includes('email=membre%40example.com'));
});

test('SIGNATURE INVALIDE → 401, aucune invitation', async () => {
  vider();
  brancherFetch({ signature: 'FAILURE' });
  const rep = await appeler(capture());
  assert.equal(rep.statusCode, 401);
  assert.equal(appelsSkool.length, 0);
});

test('en-têtes de signature absents → refusé, aucune invitation', async () => {
  vider();
  brancherFetch();
  const rep = await appeler(capture(), {});
  assert.equal(rep.statusCode, 401);
  assert.equal(appelsSkool.length, 0);
});

test('achat Timer à 9 € → 200 ignoré, aucune invitation', async () => {
  vider();
  brancherFetch();
  const rep = await appeler(capture('9.00'));
  assert.equal(rep.statusCode, 200);
  assert.equal(JSON.parse(rep.body).ignore, 'montant:9.00');
  assert.equal(appelsSkool.length, 0);
});

test('PayPal réémet le même webhook → une seule invitation', async () => {
  vider();
  brancherFetch();
  await appeler(capture());
  await appeler(capture());
  await appeler(capture());
  assert.equal(appelsSkool.length, 1, 'la capture ne doit être honorée qu’une fois');
});

test('capture Lifetime signée → vente réelle comptée une seule fois par capture', async () => {
  vider();
  brancherFetch();
  const avant = process.env.PAYPAL_MONTANTS_ACCEPTES;
  process.env.PAYPAL_MONTANTS_ACCEPTES = '197.00,199.00,249.00';

  await appeler(capture('199.00', 'EUR', 'CAP-LIFE-199'));
  await appeler(capture('199.00', 'EUR', 'CAP-LIFE-199'));
  await appeler(capture('249.00', 'EUR', 'CAP-LIFE-249'));

  if (avant == null) delete process.env.PAYPAL_MONTANTS_ACCEPTES;
  else process.env.PAYPAL_MONTANTS_ACCEPTES = avant;

  assert.deepEqual([...lifetimeBlobs.keys()].sort(), ['199/CAP-LIFE-199', '249/CAP-LIFE-249']);
  assert.equal(lifetimeBlobs.size, 2);
  assert.equal(appelsSkool.length, 2, 'une invitation par capture Lifetime unique');
});

test('Skool en panne → 500 (PayPal réessaiera) et RIEN n’est marqué fait', async () => {
  vider();
  brancherFetch({ skoolOk: false });
  const rep = await appeler(capture());
  assert.equal(rep.statusCode, 500);
  assert.equal(blobs.size, 0, 'un échec ne doit jamais laisser de trace « traité »');

  // Puis Skool revient : la relance de PayPal doit aboutir.
  brancherFetch({ skoolOk: true });
  const rep2 = await appeler(capture());
  assert.equal(rep2.statusCode, 200);
  assert.equal(appelsSkool.length, 1);
});

test('email introuvable → 500, aucune invitation, aucune trace', async () => {
  vider();
  brancherFetch({ email: 'pas-un-email' });
  const rep = await appeler(capture());
  assert.equal(rep.statusCode, 500);
  assert.equal(appelsSkool.length, 0);
  assert.equal(blobs.size, 0);
});

test('variable d’environnement manquante → 500, aucun appel réseau', async () => {
  vider();
  brancherFetch();
  const garde = process.env.SKOOL_INVITE_WEBHOOK;
  delete process.env.SKOOL_INVITE_WEBHOOK;
  const rep = await appeler(capture());
  process.env.SKOOL_INVITE_WEBHOOK = garde;
  assert.equal(rep.statusCode, 500);
  assert.equal(JSON.parse(rep.body).error, 'not_configured');
  assert.equal(appelsSkool.length, 0);
});

test('GET → 405 (le webhook n’est pas une page)', async () => {
  brancherFetch();
  const rep = await handler({ httpMethod: 'GET', headers: {}, body: '' });
  assert.equal(rep.statusCode, 405);
});

test('le secret Skool ne fuit jamais dans la réponse HTTP', async () => {
  vider();
  brancherFetch();
  const reps = [
    await appeler(capture()),
    await appeler(capture('9.00', 'EUR', 'CAP-2')),
    await handler({ httpMethod: 'GET', headers: {}, body: '' }),
  ];
  for (const r of reps) assert.ok(!JSON.stringify(r).includes('SECRET-DE-TEST'));
});
