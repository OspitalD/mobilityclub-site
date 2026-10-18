import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const data = new Map();

mock.module('@netlify/blobs', {
  namedExports: {
    getStore: () => ({
      get: async (key, { type } = {}) => {
        if (!data.has(key)) return null;
        const v = data.get(key);
        return type === 'json' ? structuredClone(v) : v;
      },
      set: async (key, value) => { data.set(key, value); },
      setJSON: async (key, value) => { data.set(key, structuredClone(value)); },
      delete: async (key) => { data.delete(key); },
      list: async ({ prefix = '' } = {}) => ({ blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
    }),
  },
});

const { default: page } = await import('../netlify/functions/methode-ikea.js');
const { default: api } = await import('../netlify/functions/methode-ikea-api.js');
const { ajouterSquelette } = await import('../scripts/methode-ikea.mjs');

const ORIGIN = 'https://www.mobilityclub.co';
const COURSE = '<!doctype html><html><head><title>Méthode IKEA</title></head><body>CONTENU-PAYANT</body></html>';
let mails, orders, captureOverride;

const appel = async (action, body, { cookie, auth, method = 'POST', raw, origin } = {}) => {
  const res = await api(new Request(`${ORIGIN}/api/methode-ikea/${action}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      ...(origin ? { origin } : {}),
    },
    ...(['GET', 'OPTIONS'].includes(method) ? {} : { body: raw ?? JSON.stringify(body ?? {}) }),
  }));
  return { status: res.status, body: res.status === 204 ? null : await res.json(), headers: res.headers, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
};

const ouvrir = async (cookie) => {
  const res = await page(new Request(`${ORIGIN}/methode-ikea`, { headers: cookie ? { cookie } : {} }));
  return { status: res.status, html: await res.text(), headers: res.headers };
};

const ADMIN = 'admin-token-de-test-suffisamment-long';

beforeEach(() => {
  data.clear();
  mails = [];
  orders = new Map();
  captureOverride = null;
  process.env.METHODE_IKEA_SESSION_SECRET = 'x'.repeat(40);
  process.env.METHODE_IKEA_ADMIN_TOKEN = ADMIN;
  delete process.env.METHODE_IKEA_PRIX_APPELS;
  delete process.env.METHODE_IKEA_PRIX_SOLO;
  delete process.env.METHODE_IKEA_ADMIN_ORIGINS;
  process.env.RESEND_API_KEY = 're_test';
  process.env.PAYPAL_CLIENT_ID = 'id';
  process.env.PAYPAL_CLIENT_SECRET = 'secret';
  process.env.PAYPAL_ENV = 'sandbox';
  data.set('content/current', COURSE);

  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target === 'https://api.resend.com/emails') {
      mails.push(JSON.parse(options.body));
      return new Response('{"id":"mail"}');
    }
    if (target.endsWith('/v1/oauth2/token')) return new Response('{"access_token":"t"}');
    if (target.endsWith('/v2/checkout/orders')) {
      const id = `ORDER${orders.size + 1}AAAA`;
      orders.set(id, JSON.parse(options.body));
      return new Response(JSON.stringify({ id, links: [{ rel: 'payer-action', href: `https://sandbox.paypal.com/checkoutnow?token=${id}` }] }), { status: 201 });
    }
    const m = /\/v2\/checkout\/orders\/([^/]+)\/capture$/.exec(target);
    if (m) {
      const unit = orders.get(m[1]).purchase_units[0];
      const capture = { id: `CAP-${m[1]}`, status: 'COMPLETED', custom_id: unit.custom_id, amount: unit.amount, ...captureOverride };
      return new Response(JSON.stringify({ id: m[1], status: 'COMPLETED', payer: { email_address: 'payer@paypal.test' }, purchase_units: [{ payments: { captures: [capture] } }] }));
    }
    throw new Error(`fetch inattendu: ${target}`);
  };
});

const codeEnvoye = () => mails.at(-1).subject.match(/(\d{3}) (\d{3})/).slice(1).join('');

test('sans session : page d\'accès, jamais le contenu payant', async () => {
  const r = await ouvrir();
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.html, /CONTENU-PAYANT/);
  assert.match(r.html, /J'ai déjà acheté/);
  assert.match(r.html, /<b>97 €<\/b><s>200 €<\/s>/);
  assert.match(r.html, /4 × 24,25 €/);
  assert.match(r.html, /<b>49 €<\/b><s>100 €<\/s>/);
  assert.match(r.html, /Pas reçu de code \? Contacte-moi/);
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
});

test('cookie forgé ou signé avec un autre secret : refusé', async () => {
  await appel('admin/access', { emails: ['a@b.co'] }, { auth: ADMIN });
  const payload = Buffer.from(JSON.stringify({ e: 'a@b.co', exp: 9e9 })).toString('base64url');
  assert.doesNotMatch((await ouvrir(`mi_session=${payload}.AAAA`)).html, /CONTENU-PAYANT/);
  assert.doesNotMatch((await ouvrir(`mi_session=${payload}`)).html, /CONTENU-PAYANT/);
});

test('accès manuel : code par email → session → contenu', async () => {
  await appel('admin/access', { email: 'Client@Exemple.fr', source: 'manuel', note: 'ancien acheteur' }, { auth: ADMIN });
  const sent = await appel('request-code', { email: 'client@exemple.fr' });
  assert.deepEqual(sent.body, { sent: true });
  assert.equal(mails.length, 1);

  const bad = await appel('verify-code', { email: 'client@exemple.fr', code: codeEnvoye() === '000000' ? '111111' : '000000' });
  assert.equal(bad.status, 401);

  const ok = await appel('verify-code', { email: 'client@exemple.fr', code: codeEnvoye() });
  assert.equal(ok.status, 200);
  assert.match(ok.cookie, /^mi_session=/);
  assert.match((await ouvrir(ok.cookie)).html, /CONTENU-PAYANT/);

  // Usage unique.
  assert.equal((await appel('verify-code', { email: 'client@exemple.fr', code: codeEnvoye() })).status, 401);

  // Retirer l'acheteur coupe la session existante.
  await appel('admin/access?email=client%40exemple.fr', null, { auth: ADMIN, method: 'DELETE' });
  assert.doesNotMatch((await ouvrir(ok.cookie)).html, /CONTENU-PAYANT/);
});

test('email inconnu : même réponse, aucun email envoyé', async () => {
  const r = await appel('request-code', { email: 'inconnu@exemple.fr' });
  assert.deepEqual(r.body, { sent: true });
  assert.equal(mails.length, 0);
});

test('5 mauvais codes brûlent le code ; plafond de 5 envois', async () => {
  await appel('admin/access', { emails: ['x@y.fr'] }, { auth: ADMIN });
  await appel('request-code', { email: 'x@y.fr' });
  const good = codeEnvoye();
  const wrong = good === '123456' ? '654321' : '123456';
  for (let i = 0; i < 4; i++) assert.equal((await appel('verify-code', { email: 'x@y.fr', code: wrong })).status, 401);
  assert.equal((await appel('verify-code', { email: 'x@y.fr', code: wrong })).status, 429);
  assert.equal((await appel('verify-code', { email: 'x@y.fr', code: good })).status, 401);
  for (let i = 0; i < 6; i++) await appel('request-code', { email: 'x@y.fr' });
  assert.equal(mails.length, 5);
});

test('achat PayPal 97 € : commande → capture vérifiée → accès avec_appels + Calendly', async () => {
  assert.equal((await appel('checkout', { email: 'neuf@exemple.fr' })).body.error, 'invalid_offer');
  const c = await appel('checkout', { email: 'neuf@exemple.fr', offre: 'avec_appels' });
  assert.equal(c.status, 201);
  assert.match(c.body.approve_url, /ORDER1AAAA/);
  const order = orders.get('ORDER1AAAA');
  assert.equal(order.purchase_units[0].amount.value, '97.00');
  assert.equal(order.payment_source.paypal.experience_context.return_url, `${ORIGIN}/methode-ikea?paypal=return`);
  assert.equal(order.payment_source.paypal.experience_context.cancel_url, `${ORIGIN}/methode-ikea?paypal=cancel&offre=avec_appels`);

  const cap = await appel('capture', { order_id: 'ORDER1AAAA' });
  assert.equal(cap.status, 200);
  assert.match(cap.cookie, /^mi_session=/);
  assert.equal(cap.body.offre, 'avec_appels');
  assert.match(cap.body.calendly, /^https:\/\/calendly\.com\//);
  assert.match((await ouvrir(cap.cookie)).html, /CONTENU-PAYANT/);
  assert.equal(mails.at(-1).subject, 'Ton accès à la Méthode IKEA');
  assert.match(mails.at(-1).html, /calendly\.com/);

  const buyer = JSON.parse(JSON.stringify(data.get([...data.keys()].find((k) => k.startsWith('buyers/')))));
  assert.equal(buyer.email, 'neuf@exemple.fr');
  assert.equal(buyer.purchases[0].payer_email, 'payer@paypal.test');
  assert.equal(buyer.offre, 'avec_appels');
  assert.equal(buyer.source, 'paypal');

  // Rejeu : ok, mais pas de nouveau cookie.
  const replay = await appel('capture', { order_id: 'ORDER1AAAA' });
  assert.equal(replay.body.already_captured, true);
  assert.equal(replay.cookie, '');

  // Déjà acheteur : pas de 2e paiement.
  assert.equal((await appel('checkout', { email: 'neuf@exemple.fr', offre: 'sans_appels' })).body.error, 'already_buyer');
});

test('downsell 49 € : accès identique, sans Calendly', async () => {
  await appel('checkout', { email: 'solo@exemple.fr', offre: 'sans_appels' });
  assert.equal(orders.get('ORDER1AAAA').purchase_units[0].amount.value, '49.00');
  const cap = await appel('capture', { order_id: 'ORDER1AAAA' });
  assert.equal(cap.body.offre, 'sans_appels');
  assert.equal(cap.body.calendly, undefined);
  assert.doesNotMatch(mails.at(-1).html, /calendly/);
  assert.match((await ouvrir(cap.cookie)).html, /CONTENU-PAYANT/);
});

test('capture refusée si montant faux, commande inconnue ou non complétée', async () => {
  await appel('checkout', { email: 'a@exemple.fr', offre: 'avec_appels' });
  // Montant d'une autre offre : refusé aussi.
  captureOverride = { amount: { currency_code: 'EUR', value: '49.00' } };
  const r = await appel('capture', { order_id: 'ORDER1AAAA' });
  assert.equal(r.body.error, 'amount_mismatch');
  assert.equal(r.cookie, '');

  await appel('checkout', { email: 'b@exemple.fr', offre: 'sans_appels' });
  captureOverride = { status: 'PENDING' };
  assert.equal((await appel('capture', { order_id: 'ORDER2AAAA' })).body.error, 'capture_not_completed');

  assert.equal((await appel('capture', { order_id: 'ZZZZZZZZZZ' })).status, 404);
  assert.equal([...data.keys()].filter((k) => k.startsWith('buyers/')).length, 0);
});

test('admin : accorder / lister / révoquer avec offre, source et note', async () => {
  const add = await appel('admin/access', { email: 'Vieux@Client.fr', offre: 'avec_appels', note: 'ancien acheteur 2025' }, { auth: ADMIN });
  assert.deepEqual(add.body.added, ['vieux@client.fr']);
  assert.equal((await appel('admin/access', { email: 'x@y.fr', offre: 'premium' }, { auth: ADMIN })).status, 400);
  assert.equal((await appel('admin/access', { email: 'pas-un-email' }, { auth: ADMIN })).status, 400);
  const list = await appel('admin/access', null, { auth: ADMIN, method: 'GET' });
  assert.equal(list.body.access.length, 1);
  assert.deepEqual(
    (({ email, offre, source, note }) => ({ email, offre, source, note }))(list.body.access[0]),
    { email: 'vieux@client.fr', offre: 'avec_appels', source: 'manuel', note: 'ancien acheteur 2025' },
  );
  const del = await appel('admin/access', { email: 'vieux@client.fr' }, { auth: ADMIN, method: 'DELETE' });
  assert.equal(del.body.removed, true);
  assert.equal((await appel('admin/access', null, { auth: ADMIN, method: 'GET' })).body.access.length, 0);
});

test('admin : CORS ouvert à la console seulement', async () => {
  const pre = await appel('admin/access', null, { method: 'OPTIONS', origin: 'https://app.mobilityclub.co' });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://app.mobilityclub.co');
  assert.match(pre.headers.get('access-control-allow-headers'), /Authorization/);
  const get = await appel('admin/access', null, { method: 'GET', auth: ADMIN, origin: 'https://app.mobilityclub.co' });
  assert.equal(get.headers.get('access-control-allow-origin'), 'https://app.mobilityclub.co');
  const evil = await appel('admin/access', null, { method: 'OPTIONS', origin: 'https://evil.example' });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
});

test('admin : jeton obligatoire, dépôt du contenu', async () => {
  assert.equal((await appel('admin/access', null, { method: 'GET' })).status, 401);
  assert.equal((await appel('admin/access', null, { method: 'GET', auth: 'mauvais-jeton-mauvais-jeton' })).status, 401);
  const put = await appel('admin/content', null, { method: 'PUT', auth: ADMIN, raw: '<!doctype html><p>v2</p>' });
  assert.equal(put.status, 200);
  assert.equal(data.get('content/current'), '<!doctype html><p>v2</p>');
  assert.equal((await appel('admin/content', null, { method: 'PUT', auth: ADMIN, raw: '<p>pas de doctype</p>' })).status, 400);
});

test('squelette HTML ajouté sans toucher au contenu', () => {
  const src = '<meta charset="utf-8">\n<title>Méthode IKEA</title>\n<style>a{}</style>\n\n<header class="bar">x</header>\n<script>1</script>\n';
  const out = ajouterSquelette(src);
  assert.match(out, /^<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">/);
  assert.match(out, /<\/style>\n<meta name="robots" content="noindex, nofollow">\n<\/head>\n<body>\n<header class="bar">x<\/header>\n<script>1<\/script>\n<\/body>\n<\/html>\n$/);
  assert.equal(ajouterSquelette(out), out);
});
