// Harnais de test du webhook PayPal → Skool.
// Mocke @netlify/blobs et fetch : aucun appel réseau, aucun encaissement.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ── Mock du store Blobs (mémoire) ────────────────────────────────────────────
const blobs = new Map();
const lifetimeBlobs = new Map();
const ikeaBlobs = new Map();
mock.module('@netlify/blobs', {
  namedExports: {
    connectLambda: () => {},
    getStore: (opt) => {
      const name = typeof opt === 'string' ? opt : opt?.name;
      const target = name === 'lifetime_pass_2026' ? lifetimeBlobs : name === 'methode_ikea' ? ikeaBlobs : blobs;
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
  ikeaBlobs.clear();
};

const SKOOL = 'https://api2.skool.com/groups/mobility-club/webhooks/SECRET-DE-TEST';
process.env.SKOOL_INVITE_WEBHOOK = SKOOL;
process.env.PAYPAL_CLIENT_ID = 'cid';
process.env.PAYPAL_CLIENT_SECRET = 'csec';
process.env.PAYPAL_WEBHOOK_ID = 'whid';
process.env.RESEND_API_KEY = 're_test';

const HEADERS = {
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api.paypal.com/cert',
  'paypal-transmission-id': 'tid',
  'paypal-transmission-sig': 'sig',
  'paypal-transmission-time': '2026-08-04T14:00:00Z',
};

const capture = (montant = '197.00', devise = 'EUR', id = 'CAP-1', customId = null) => ({
  id: 'WH-1',
  event_type: 'PAYMENT.CAPTURE.COMPLETED',
  resource: {
    id,
    amount: { value: montant, currency_code: devise },
    ...(customId ? { custom_id: customId } : {}),
    supplementary_data: { related_ids: { order_id: 'ORD-1' } },
  },
});

// ── Faux PayPal / Skool ──────────────────────────────────────────────────────
let appelsSkool = [];
let emailsResend = [];
const brancherFetch = ({ signature = 'SUCCESS', email = 'membre@example.com', skoolOk = true } = {}) => {
  appelsSkool = [];
  emailsResend = [];
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.startsWith('https://api.resend.com/')) {
      emailsResend.push(JSON.parse(opts.body));
      return new Response(JSON.stringify({ id: 'mail-1' }));
    }
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
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  const rep = await appeler(capture());
  assert.equal(rep.statusCode, 200);
  assert.equal(appelsSkool.length, 1);
  assert.ok(appelsSkool[0].includes('email=membre%40example.com'));
});

test('SIGNATURE INVALIDE → 401, aucune invitation', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch({ signature: 'FAILURE' });
  const rep = await appeler(capture());
  assert.equal(rep.statusCode, 401);
  assert.equal(appelsSkool.length, 0);
});

test('en-têtes de signature absents → refusé, aucune invitation', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  const rep = await appeler(capture(), {});
  assert.equal(rep.statusCode, 401);
  assert.equal(appelsSkool.length, 0);
});

test('achat Timer à 9 € → 200 ignoré, aucune invitation', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  const rep = await appeler(capture('9.00'));
  assert.equal(rep.statusCode, 200);
  assert.equal(JSON.parse(rep.body).ignore, 'montant:9.00');
  assert.equal(appelsSkool.length, 0);
});

test('PayPal réémet le même webhook → une seule invitation', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  await appeler(capture());
  await appeler(capture());
  await appeler(capture());
  assert.equal(appelsSkool.length, 1, 'la capture ne doit être honorée qu’une fois');
});

test('capture Lifetime signée → vente réelle comptée une seule fois par capture', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
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

test('capture Lifetime numérotée → le webhook conserve le custom_id', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  const avant = process.env.PAYPAL_MONTANTS_ACCEPTES;
  process.env.PAYPAL_MONTANTS_ACCEPTES = '197.00,199.00,249.00';
  const customId = 'MC-LIFE-2026-T1-07-11111111-2222-4333-8444-555555555555';

  await appeler(capture('199.00', 'EUR', 'CAP-NUMBERED', customId));

  if (avant == null) delete process.env.PAYPAL_MONTANTS_ACCEPTES;
  else process.env.PAYPAL_MONTANTS_ACCEPTES = avant;
  assert.equal(lifetimeBlobs.get('199/CAP-NUMBERED').custom_id, customId);
});

test('Skool en panne → 500 (PayPal réessaiera) et RIEN n’est marqué fait', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
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
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch({ email: 'pas-un-email' });
  const rep = await appeler(capture());
  assert.equal(rep.statusCode, 500);
  assert.equal(appelsSkool.length, 0);
  assert.equal(blobs.size, 0);
});

test('variable d’environnement manquante → 500, aucun appel réseau', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
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
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  const reps = [
    await appeler(capture()),
    await appeler(capture('9.00', 'EUR', 'CAP-2')),
    await handler({ httpMethod: 'GET', headers: {}, body: '' }),
  ];
  for (const r of reps) assert.ok(!JSON.stringify(r).includes('SECRET-DE-TEST'));
});

// ── Méthode IKEA : lien PayPal hébergé → ticket, accès, email de bienvenue ───
const venteIkea = (montant, cap, ord, quand = '2026-10-18T09:00:00Z') => {
  const ev = capture(montant, 'EUR', cap);
  ev.resource.create_time = quand;
  ev.resource.supplementary_data.related_ids.order_id = ord;
  return ev;
};
const acheteurs = () => [...ikeaBlobs.entries()].filter(([k]) => k.startsWith('buyers/')).map(([, v]) => v);

test('Méthode IKEA 97 € : ticket consommé, accès ouvert, email avec le lien Calendly, aucune invitation Skool', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch({ email: 'Acheteur.97@Example.com' });
  const rep = await appeler(venteIkea('97.00', 'CAP-97', 'ORD-97'));
  assert.equal(rep.statusCode, 200);
  assert.deepEqual(ikeaBlobs.get('quota/2026-10'), { orders: ['ORD-97'] });
  const [a] = acheteurs();
  assert.equal(a.email, 'acheteur.97@example.com');
  assert.equal(a.offre, 'avec_appels');
  assert.equal(a.source, 'paypal_lien');
  assert.equal(emailsResend.length, 1);
  assert.deepEqual(emailsResend[0].to, ['acheteur.97@example.com']);
  assert.match(emailsResend[0].html, /\/methode-ikea\/acces\?connexion/);
  assert.match(emailsResend[0].html, /calendly\.com/);
  assert.equal(appelsSkool.length, 0);
});

test('Méthode IKEA 49 € : accès ouvert, email SANS lien d\'appel, aucun ticket consommé', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch({ email: 'acheteur.49@example.com' });
  const rep = await appeler(venteIkea('49.00', 'CAP-49', 'ORD-49'));
  assert.equal(rep.statusCode, 200);
  assert.equal(ikeaBlobs.has('quota/2026-10'), false);
  assert.equal(acheteurs()[0].offre, 'sans_appels');
  assert.equal(emailsResend.length, 1);
  assert.doesNotMatch(emailsResend[0].html, /calendly/i);
  assert.equal(appelsSkool.length, 0);
});

test('Méthode IKEA : un webhook rejoué n\'envoie qu\'un email et ne compte qu\'un ticket', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  const ev = venteIkea('97.00', 'CAP-R', 'ORD-R');
  await appeler(ev);
  await appeler(ev);
  assert.equal(emailsResend.length, 1);
  assert.deepEqual(ikeaBlobs.get('quota/2026-10'), { orders: ['ORD-R'] });
});

test('Méthode IKEA : une commande passée par la page /methode-ikea/acces n\'est pas traitée deux fois', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  ikeaBlobs.set('orders/ORD-SITE', { status: 'captured' });
  await appeler(venteIkea('97.00', 'CAP-S', 'ORD-SITE'));
  assert.equal(emailsResend.length, 0);
  assert.equal(acheteurs().length, 0);
});

test('Méthode IKEA : sans clé d\'envoi d\'email, 500 pour que PayPal réessaie, rien n\'est marqué fait', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  delete process.env.RESEND_API_KEY;
  const rep = await appeler(venteIkea('49.00', 'CAP-NOKEY', 'ORD-NOKEY'));
  process.env.RESEND_API_KEY = 're_test';
  assert.equal(rep.statusCode, 500);
  assert.equal(ikeaBlobs.has('paypal_lien/CAP-NOKEY'), false);
  const rep2 = await appeler(venteIkea('49.00', 'CAP-NOKEY', 'ORD-NOKEY'));
  assert.equal(rep2.statusCode, 200);
  assert.equal(emailsResend.length, 1);
});

test('Méthode IKEA : les autres montants ne touchent à rien', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  for (const m of ['9.00', '17.00', '96.99']) await appeler(venteIkea(m, 'CAP-' + m, 'ORD-' + m));
  assert.equal(ikeaBlobs.size, 0);
  assert.equal(emailsResend.length, 0);
});

test('Méthode IKEA : une vente le 31 au soir, heure de Paris, compte pour le bon mois', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  await appeler(venteIkea('97.00', 'CAP-N', 'ORD-N', '2026-10-31T23:30:00Z'));
  assert.deepEqual(ikeaBlobs.get('quota/2026-11'), { orders: ['ORD-N'] });
});
