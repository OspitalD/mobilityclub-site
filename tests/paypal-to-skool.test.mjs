// Harnais de test du webhook PayPal → compte dans l'app (ex-Skool).
// Mocke @netlify/blobs et fetch : aucun appel réseau, aucun encaissement.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ── Mock du store Blobs (mémoire) ────────────────────────────────────────────
const blobs = new Map();
const lifetimeBlobs = new Map();
const ikeaBlobs = new Map();
const aboBlobs = new Map();
const intentBlobs = new Map();
const journalBlobs = new Map();
mock.module('@netlify/blobs', {
  namedExports: {
    connectLambda: () => {},
    getStore: (opt) => {
      const name = typeof opt === 'string' ? opt : opt?.name;
      const target = name === 'lifetime_pass_2026' ? lifetimeBlobs : name === 'methode_ikea' ? ikeaBlobs
        : name === 'paypal_abonnements' ? aboBlobs : name === 'bascule_intents' ? intentBlobs
        : name === 'bascule_journal' ? journalBlobs : blobs;
      return {
        get: async (k) => (target.has(k) ? structuredClone(target.get(k)) : null),
        setJSON: async (k, v) => void target.set(k, structuredClone(v)),
        delete: async (k) => void target.delete(k),
        list: async ({ prefix = '' } = {}) => ({ blobs: [...target.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
      };
    },
  },
});

const { handler, decider, memeMontant, emailValide, montantsAttendus, estMontantLifetime } = await import(
  '../netlify/functions/paypal-to-skool.js'
);
const { deciderAbonnement, finDeDroit, PLAN_MENSUEL, PLAN_MENSUEL_BASCULE, PLAN_ANNUEL } = await import('../netlify/lib/acces-app.js');
const { choisirIntention } = await import('../netlify/lib/bascule-journal.js');
const { handler: journalHandler } = await import('../netlify/functions/bascule-journal.js');
const { coupuresEchues } = await import('../netlify/functions/paypal-coupures.js');

const vider = () => {
  blobs.clear();
  lifetimeBlobs.clear();
  ikeaBlobs.clear();
  aboBlobs.clear();
  intentBlobs.clear();
  journalBlobs.clear();
};

const JETON_DASHBOARD = 'SECRET-DE-TEST-jeton-dashboard-0123456789';
const DASHBOARD = 'https://app.mobilityclub.co/.netlify/functions/paypal-provision';
process.env.DASHBOARD_PROVISION_TOKEN = JETON_DASHBOARD;
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

// ── Faux PayPal / dashboard ──────────────────────────────────────────────────
// `appelsDashboard` : les corps envoyés à paypal-provision. Le faux dashboard tient
// un mini-état (tier par email) pour vérifier qu'un abonnement MÈNE à un compte.
let appelsDashboard = [];
let emailsResend = [];
let comptes = new Map();
const appelsActiver = () => appelsDashboard.filter((b) => b.action === 'activer');
const appelsCouper = () => appelsDashboard.filter((b) => b.action === 'couper');
const brancherFetch = ({ signature = 'SUCCESS', email = 'membre@example.com', dashboardOk = true, accesAvant = false } = {}) => {
  appelsDashboard = [];
  emailsResend = [];
  comptes = new Map();
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
    if (u === DASHBOARD) {
      if (opts.headers.Authorization !== `Bearer ${JETON_DASHBOARD}`) return new Response('{}', { status: 401 });
      if (!dashboardOk) return new Response('{}', { status: 502 });
      const b = JSON.parse(opts.body);
      appelsDashboard.push(b);
      if (b.action === 'activer') {
        const cree = !comptes.has(b.email);
        comptes.set(b.email, 'programme');
        return new Response(JSON.stringify({ ok: true, compte_cree: cree, acces_avant: accesAvant }));
      }
      const coupe = comptes.get(b.email) === 'programme';
      if (coupe) comptes.set(b.email, 'cancelled');
      return new Response(JSON.stringify({ ok: true, coupe }));
    }
    if (u.includes('/v1/billing/subscriptions/'))
      return new Response(JSON.stringify({ subscriber: { email_address: email, name: { given_name: 'Relu' } } }));
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
test('paiement légitime → compte programme ouvert dans l\'app + email d\'accès', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  const rep = await appeler(capture());
  assert.equal(rep.statusCode, 200);
  assert.equal(appelsActiver().length, 1);
  assert.equal(appelsActiver()[0].email, 'membre@example.com');
  assert.equal(appelsActiver()[0].ref, 'CAP-1');
  assert.equal(comptes.get('membre@example.com'), 'programme');
  assert.equal(emailsResend.length, 1);
  assert.equal(emailsResend[0].subject, 'Ton accès au Mobility Club est ouvert');
  assert.match(emailsResend[0].html, /app\.mobilityclub\.co/);
});

test('SIGNATURE INVALIDE → 401, aucune invitation', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch({ signature: 'FAILURE' });
  const rep = await appeler(capture());
  assert.equal(rep.statusCode, 401);
  assert.equal(appelsDashboard.length, 0);
});

test('en-têtes de signature absents → refusé, aucune invitation', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  const rep = await appeler(capture(), {});
  assert.equal(rep.statusCode, 401);
  assert.equal(appelsDashboard.length, 0);
});

test('achat Timer à 9 € → 200 ignoré, aucune invitation', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  const rep = await appeler(capture('9.00'));
  assert.equal(rep.statusCode, 200);
  assert.equal(JSON.parse(rep.body).ignore, 'montant:9.00');
  assert.equal(appelsDashboard.length, 0);
});

test('PayPal réémet le même webhook → une seule invitation', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  await appeler(capture());
  await appeler(capture());
  await appeler(capture());
  assert.equal(appelsActiver().length, 1, 'la capture ne doit être honorée qu’une fois');
  assert.equal(emailsResend.length, 1);
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
  assert.equal(appelsActiver().length, 2, 'une ouverture par capture Lifetime unique');
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

test('dashboard en panne → 500 (PayPal réessaiera) et RIEN n’est marqué fait', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch({ dashboardOk: false });
  const rep = await appeler(capture());
  assert.equal(rep.statusCode, 500);
  assert.equal(blobs.size, 0, 'un échec ne doit jamais laisser de trace « traité »');

  // Puis le dashboard revient : la relance de PayPal doit aboutir.
  brancherFetch({ dashboardOk: true });
  const rep2 = await appeler(capture());
  assert.equal(rep2.statusCode, 200);
  assert.equal(appelsActiver().length, 1);
  assert.equal(emailsResend.length, 1);
});

test('email introuvable → 500, aucune invitation, aucune trace', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch({ email: 'pas-un-email' });
  const rep = await appeler(capture());
  assert.equal(rep.statusCode, 500);
  assert.equal(appelsDashboard.length, 0);
  assert.equal(blobs.size, 0);
});

test('variable d’environnement manquante → 500, aucun appel réseau', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  const garde = process.env.DASHBOARD_PROVISION_TOKEN;
  delete process.env.DASHBOARD_PROVISION_TOKEN;
  const rep = await appeler(capture());
  process.env.DASHBOARD_PROVISION_TOKEN = garde;
  assert.equal(rep.statusCode, 500);
  assert.equal(JSON.parse(rep.body).error, 'not_configured');
  assert.equal(appelsDashboard.length, 0);
});

test('GET → 405 (le webhook n’est pas une page)', async () => {
  brancherFetch();
  const rep = await handler({ httpMethod: 'GET', headers: {}, body: '' });
  assert.equal(rep.statusCode, 405);
});

test('le jeton du dashboard ne fuit jamais dans la réponse HTTP', async () => {
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

test('Méthode IKEA 97 € : ticket consommé, accès ouvert, email avec le lien Calendly, aucun compte app', async () => {
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
  assert.equal(appelsDashboard.length, 0);
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
  assert.equal(appelsDashboard.length, 0);
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

test('Méthode IKEA : fonctionne même sans DASHBOARD_PROVISION_TOKEN (l\'annuel, lui, reste en 500)', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  const garde = process.env.DASHBOARD_PROVISION_TOKEN;
  delete process.env.DASHBOARD_PROVISION_TOKEN;
  const ikea = await appeler(venteIkea('49.00', 'CAP-SANS-SKOOL', 'ORD-SANS-SKOOL'));
  const annuel = await appeler(capture('197.00', 'EUR', 'CAP-ANNUEL'));
  process.env.DASHBOARD_PROVISION_TOKEN = garde;
  assert.equal(ikea.statusCode, 200);
  assert.equal(emailsResend.length, 1);
  assert.equal(annuel.statusCode, 500);
  assert.equal(JSON.parse(annuel.body).error, 'not_configured');
  assert.equal(appelsDashboard.length, 0);
});

// ── Abonnement mensuel (plan P-43F663568B911461GNLNCJBY, 7 j gratuits puis 25 €) ──
const abo = (type, { plan = PLAN_MENSUEL, sub = 'I-SUB1', evId = `WH-${type}`, email = 'abonne@example.com', billing } = {}) => ({
  id: evId,
  event_type: type,
  resource: {
    id: sub,
    plan_id: plan,
    status: 'ACTIVE',
    start_time: '2026-10-22T10:00:00Z',
    subscriber: { email_address: email, name: { given_name: 'Léa', surname: 'Martin' } },
    ...(billing ? { billing_info: billing } : {}),
  },
});
const ACT = 'BILLING.SUBSCRIPTION.ACTIVATED';
const CAN = 'BILLING.SUBSCRIPTION.CANCELLED';

test('deciderAbonnement : seul le plan du Club, seuls les 4 événements utiles', () => {
  assert.equal(deciderAbonnement(abo(ACT)).geste, 'activer');
  assert.equal(deciderAbonnement(abo(CAN)).geste, 'programmer_coupure');
  assert.equal(deciderAbonnement(abo('BILLING.SUBSCRIPTION.EXPIRED')).geste, 'couper');
  assert.equal(deciderAbonnement(abo('BILLING.SUBSCRIPTION.SUSPENDED')).geste, 'couper');
  assert.equal(deciderAbonnement(abo(ACT, { plan: 'P-AUTRE' })).raison, 'plan:P-AUTRE');
  assert.equal(deciderAbonnement(abo('BILLING.SUBSCRIPTION.CREATED')).raison, 'type_ignore:BILLING.SUBSCRIPTION.CREATED');
});

test('finDeDroit : essai, mois payé, prochaine échéance, bornes', () => {
  const now = Date.parse('2026-10-24T00:00:00Z');
  // Résilié pendant l'essai : accès jusqu'à la fin des 7 jours.
  assert.equal(finDeDroit({ plan_id: PLAN_MENSUEL, start_time: '2026-10-22T10:00:00Z' }, now), '2026-10-29T10:00:00.000Z');
  // Plan de la bascule : pas d'essai, donc pas de 7 jours offerts.
  assert.equal(finDeDroit({ plan_id: PLAN_MENSUEL_BASCULE, start_time: '2026-10-22T10:00:00Z' }, now), new Date(now).toISOString());
  // Dernier paiement le 31/10 → 30/11 (fin de mois gérée).
  assert.equal(finDeDroit({ plan_id: PLAN_MENSUEL, start_time: '2026-10-01T00:00:00Z', billing_info: { last_payment: { time: '2026-10-31T08:00:00Z' } } }, Date.parse('2026-11-01T00:00:00Z')),
    '2026-11-30T08:00:00.000Z');
  // Jamais dans le passé, jamais plus d'un mois + 5 jours devant pour un mensuel.
  assert.equal(finDeDroit({}, now), new Date(now).toISOString());
  assert.equal(finDeDroit({ plan_id: PLAN_MENSUEL, billing_info: { next_billing_time: '2027-10-01T00:00:00Z' } }, now), '2026-11-29T00:00:00.000Z');
  // Annuel : l'année payée est due, pas plus.
  assert.equal(finDeDroit({ plan_id: PLAN_ANNUEL, billing_info: { last_payment: { time: '2026-10-25T09:00:00Z' } } }, Date.parse('2027-03-01T00:00:00Z')),
    '2027-10-25T09:00:00.000Z');
  assert.equal(finDeDroit({ plan_id: PLAN_ANNUEL, billing_info: { next_billing_time: '2030-01-01T00:00:00Z' } }, now), '2027-10-29T00:00:00.000Z');
});

test('ABONNEMENT ACTIVÉ → compte programme créé dans l\'app, email d\'accès « essai », une seule fois', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  const rep = await appeler(abo(ACT));
  assert.equal(rep.statusCode, 200);
  assert.deepEqual(appelsActiver(), [{ action: 'activer', email: 'abonne@example.com', first_name: 'Léa', ref: 'I-SUB1' }]);
  assert.equal(comptes.get('abonne@example.com'), 'programme');
  assert.equal(emailsResend.length, 1);
  assert.match(emailsResend[0].html, /7 jours gratuits/);
  // Réémission PayPal : rien de plus.
  await appeler(abo(ACT));
  assert.equal(appelsActiver().length, 1);
  assert.equal(emailsResend.length, 1);
});

test('abonnement : signature invalide → 401, aucun compte', async () => {
  vider();
  brancherFetch({ signature: 'FAILURE' });
  const rep = await appeler(abo(ACT));
  assert.equal(rep.statusCode, 401);
  assert.equal(appelsDashboard.length, 0);
});

test('abonnement à un autre plan → 200 ignoré, aucun compte', async () => {
  vider();
  brancherFetch();
  const rep = await appeler(abo(ACT, { plan: 'P-TIMER' }));
  assert.equal(rep.statusCode, 200);
  assert.equal(JSON.parse(rep.body).ignore, 'plan:P-TIMER');
  assert.equal(appelsDashboard.length, 0);
});

test('abonnement : dashboard en panne → 500, rien de marqué, la relance aboutit', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch({ dashboardOk: false });
  assert.equal((await appeler(abo(ACT))).statusCode, 500);
  assert.equal(aboBlobs.size, 0);
  brancherFetch();
  assert.equal((await appeler(abo(ACT))).statusCode, 200);
  assert.equal(comptes.get('abonne@example.com'), 'programme');
});

test('abonnement sans subscriber dans l\'événement → relu chez PayPal', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch({ email: 'relu@example.com' });
  const ev = abo(ACT);
  delete ev.resource.subscriber;
  assert.equal((await appeler(ev)).statusCode, 200);
  assert.equal(appelsActiver()[0].email, 'relu@example.com');
});

test('RÉSILIATION → rien n\'est coupé tout de suite ; la fonction planifiée coupe à la fin de période', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  await appeler(abo(ACT));
  const rep = await appeler(abo(CAN, { billing: { last_payment: { time: '2026-10-21T10:00:00Z' } } }));
  assert.equal(rep.statusCode, 200);
  assert.equal(appelsCouper().length, 0, 'résilier ne reprend pas un mois déjà payé');
  assert.equal(comptes.get('abonne@example.com'), 'programme');
  assert.equal(aboBlobs.get('coupures/I-SUB1').fin, '2026-11-21T10:00:00.000Z');

  const S = (await import('@netlify/blobs')).getStore('paypal_abonnements');
  // Avant la date : rien.
  assert.deepEqual(await coupuresEchues(S, Date.parse('2026-11-20T00:00:00Z')), { echues: 0, faites: 0, erreurs: 0 });
  assert.equal(comptes.get('abonne@example.com'), 'programme');
  // Après : coupé, coupure consommée.
  assert.equal((await coupuresEchues(S, Date.parse('2026-11-22T00:00:00Z'))).faites, 1);
  assert.deepEqual(appelsCouper(), [{ action: 'couper', email: 'abonne@example.com', first_name: '', ref: 'I-SUB1' }]);
  assert.equal(comptes.get('abonne@example.com'), 'cancelled');
  assert.equal(aboBlobs.has('coupures/I-SUB1'), false);
});

test('résilié puis réabonné (nouvel abonnement) avant la fin → la coupure est sautée', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  await appeler(abo(ACT));
  await appeler(abo(CAN));
  await appeler(abo(ACT, { sub: 'I-SUB2', evId: 'WH-ACT-2' }));
  const S = (await import('@netlify/blobs')).getStore('paypal_abonnements');
  await coupuresEchues(S, Date.parse('2027-01-01T00:00:00Z'));
  assert.equal(appelsCouper().length, 0);
  assert.equal(comptes.get('abonne@example.com'), 'programme');
  assert.equal(emailsResend.length, 2, 'un nouvel abonnement renvoie le lien d\'accès');
});

test('EXPIRÉ / SUSPENDU → coupé tout de suite', async () => {
  for (const type of ['BILLING.SUBSCRIPTION.EXPIRED', 'BILLING.SUBSCRIPTION.SUSPENDED']) {
    vider();
    process.env.RESEND_API_KEY = 're_test';
    brancherFetch();
    await appeler(abo(ACT));
    assert.equal((await appeler(abo(type))).statusCode, 200);
    assert.equal(comptes.get('abonne@example.com'), 'cancelled', type);
    // Puis PayPal réactive (prélèvement rattrapé) → rouvert.
    await appeler(abo(ACT, { evId: 'WH-REACT' }));
    assert.equal(comptes.get('abonne@example.com'), 'programme', type);
    assert.equal(emailsResend.length, 1, 'une réactivation du même abonnement ne renvoie pas de bienvenue');
  }
});

test('membre qui avait DÉJÀ accès avant PayPal → la fin d\'abonnement ne le coupe pas', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch({ accesAvant: true });
  await appeler(abo(ACT));
  await appeler(abo('BILLING.SUBSCRIPTION.EXPIRED'));
  assert.equal(appelsCouper().length, 0);
});

test('abonnement sans DASHBOARD_PROVISION_TOKEN → 500, rien de marqué', async () => {
  vider();
  brancherFetch();
  const garde = process.env.DASHBOARD_PROVISION_TOKEN;
  delete process.env.DASHBOARD_PROVISION_TOKEN;
  const rep = await appeler(abo(ACT));
  process.env.DASHBOARD_PROVISION_TOKEN = garde;
  assert.equal(rep.statusCode, 500);
  assert.equal(aboBlobs.size, 0);
});

// ── Bascule Skool → app : plans de la page /bascule, rapprochement, journal ──

test('plans de la bascule acceptés par défaut, sans variable', () => {
  const garde = process.env.PAYPAL_PLANS_ABONNEMENT;
  delete process.env.PAYPAL_PLANS_ABONNEMENT;
  assert.equal(deciderAbonnement(abo(ACT, { plan: PLAN_MENSUEL_BASCULE })).geste, 'activer');
  assert.equal(deciderAbonnement(abo(ACT, { plan: PLAN_ANNUEL })).geste, 'activer');
  if (garde !== undefined) process.env.PAYPAL_PLANS_ABONNEMENT = garde;
});

test('mensuel de la bascule (sans essai) → email d\'accès SANS « 7 jours gratuits »', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  assert.equal((await appeler(abo(ACT, { plan: PLAN_MENSUEL_BASCULE }))).statusCode, 200);
  assert.equal(comptes.get('abonne@example.com'), 'programme');
  assert.doesNotMatch(emailsResend[0].html, /7 jours gratuits/);
});

test('choisirIntention : même email, auto (une seule candidate récente), ambigu, aucun', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const i = (email, plan, h, extra = {}) => ({ email, plan, updated_at: new Date(now - h * 3600e3).toISOString(), ...extra });
  assert.equal(choisirIntention([i('a@x.fr', 'vie', 1)], { emailPaypal: 'a@x.fr', formule: 'annuel', now }).rapprochement, 'meme_email');
  const auto = choisirIntention([i('s@x.fr', 'vie', 1), i('t@x.fr', 'annuel', 1), i('u@x.fr', 'vie', 30)], { emailPaypal: 'p@x.fr', formule: 'vie', now });
  assert.equal(auto.rapprochement, 'auto');
  assert.equal(auto.intention.email, 's@x.fr');
  assert.deepEqual(choisirIntention([i('s@x.fr', 'vie', 1), i('v@x.fr', 'vie', 2)], { emailPaypal: 'p@x.fr', formule: 'vie', now }).candidats, ['s@x.fr', 'v@x.fr']);
  assert.equal(choisirIntention([i('s@x.fr', 'vie', 1, { consumed_by: 'CAP-0' })], { emailPaypal: 'p@x.fr', formule: 'vie', now }).rapprochement, 'aucun');
});

test('À VIE 249 € via /bascule, email PayPal ≠ email Skool → les DEUX comptes ouverts, intention consommée, journal écrit', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch({ email: 'paypal@example.com' });
  intentBlobs.set('skool@example.com', { email: 'skool@example.com', plan: 'vie', first_seen: new Date().toISOString(), updated_at: new Date().toISOString(), clicks: 1 });
  process.env.PAYPAL_MONTANTS_ACCEPTES = '197.00,100.00,199.00,249.00'; // valeur de prod au 24/10
  const rep = await appeler(capture('249.00', 'EUR', 'CAP-VIE'));
  delete process.env.PAYPAL_MONTANTS_ACCEPTES;
  assert.equal(rep.statusCode, 200);
  assert.deepEqual(appelsActiver().map((b) => b.email), ['paypal@example.com', 'skool@example.com']);
  assert.equal(intentBlobs.get('skool@example.com').consumed_by, 'CAP-VIE');
  const [ligne] = [...journalBlobs.values()];
  assert.equal(ligne.type, 'activation');
  assert.equal(ligne.formule, 'vie');
  assert.equal(ligne.rapprochement, 'auto');
  assert.equal(ligne.email_skool, 'skool@example.com');
  assert.equal(ligne.skool_ouvert, true);
  // Jamais de coupure programmée pour un achat à vie.
  assert.equal([...aboBlobs.keys()].filter((k) => k.startsWith('coupures/')).length, 0);
});

test('deux intentions candidates → seul le payeur est ouvert, Damien tranche via le journal', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch({ email: 'paypal@example.com' });
  const t = new Date().toISOString();
  intentBlobs.set('s1@example.com', { email: 's1@example.com', plan: 'vie', updated_at: t });
  intentBlobs.set('s2@example.com', { email: 's2@example.com', plan: 'vie', updated_at: t });
  process.env.PAYPAL_MONTANTS_ACCEPTES = '197.00,100.00,199.00,249.00';
  assert.equal((await appeler(capture('249.00', 'EUR', 'CAP-VIE2'))).statusCode, 200);
  delete process.env.PAYPAL_MONTANTS_ACCEPTES;
  assert.deepEqual(appelsActiver().map((b) => b.email), ['paypal@example.com']);
  const [ligne] = [...journalBlobs.values()];
  assert.equal(ligne.rapprochement, 'ambigu');
  assert.deepEqual(ligne.candidats.sort(), ['s1@example.com', 's2@example.com']);
});

test('annuel de la bascule : résiliation → coupure à la fin de l\'année payée, journalisée', async () => {
  vider();
  process.env.RESEND_API_KEY = 're_test';
  brancherFetch();
  await appeler(abo(ACT, { plan: PLAN_ANNUEL, sub: 'I-AN' }));
  const last = new Date(Date.now() - 30 * 86400e3).toISOString();
  await appeler(abo(CAN, { plan: PLAN_ANNUEL, sub: 'I-AN', billing: { last_payment: { time: last } } }));
  const fin = Date.parse(aboBlobs.get('coupures/I-AN').fin);
  assert.ok(fin - Date.now() > 300 * 86400e3, 'l\'année payée est respectée');
  assert.deepEqual([...journalBlobs.values()].map((l) => l.type).sort(), ['activation', 'resiliation']);
});

test('bascule-journal : jeton exigé, filtre since', async () => {
  vider();
  journalBlobs.set('2026-10-25T10:00:00.000Z_A', { at: '2026-10-25T10:00:00.000Z', type: 'activation' });
  journalBlobs.set('2026-10-25T12:00:00.000Z_B', { at: '2026-10-25T12:00:00.000Z', type: 'activation' });
  process.env.BASCULE_JOURNAL_TOKEN = 'j'.repeat(40);
  const get = (auth, since) => journalHandler({ httpMethod: 'GET', headers: auth ? { authorization: auth } : {}, queryStringParameters: since ? { since } : {} });
  assert.equal((await get(null)).statusCode, 401);
  assert.equal((await get('Bearer mauvais')).statusCode, 401);
  const ok = await get(`Bearer ${'j'.repeat(40)}`, '2026-10-25T11:00:00Z');
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(JSON.parse(ok.body).lignes.map((l) => l.at), ['2026-10-25T12:00:00.000Z']);
  delete process.env.BASCULE_JOURNAL_TOKEN;
  assert.equal((await get(`Bearer ${'j'.repeat(40)}`)).statusCode, 401, 'sans variable : fermé');
});
