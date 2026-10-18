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

// /methode-ikea avec cookie est réécrit par netlify.toml vers /methode-ikea/formation.
const ouvrir = async (cookie, chemin = '/methode-ikea/formation') => {
  const res = await page(new Request(`${ORIGIN}${chemin}`, { headers: cookie ? { cookie } : {} }));
  return { status: res.status, html: await res.text(), headers: res.headers };
};
const pageAchat = (cookie) => ouvrir(cookie, '/methode-ikea/acces');

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
  delete process.env.METHODE_IKEA_PLACES_APPELS;
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

// Le code s'affiche d'un bloc, sans espace, pour se copier-coller (retour Damien, 18/10/2026).
const codeEnvoye = () => {
  const { subject, html } = mails.at(-1);
  assert.match(subject, /: \d{6}$/);
  assert.doesNotMatch(html, /\d{3} \d{3}/);
  return subject.match(/(\d{6})$/)[1];
};

test('sans session : page d\'accès, jamais le contenu payant', async () => {
  const r = await pageAchat();
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.html, /CONTENU-PAYANT/);
  assert.match(r.html, /J'ai déjà acheté/);
  assert.match(r.html, /<b>97 €<\/b><s>200 €<\/s>/);
  assert.match(r.html, /4 × 24,25 €/);
  assert.match(r.html, /<b>49 €<\/b><s>100 €<\/s>/);
  assert.match(r.html, /Pas reçu de code \? Contacte-moi/);
  assert.match(r.html, /20 places avec appels sur 20/);
  assert.match(r.html, /Garantie notice de montage/);
  assert.match(r.html, /Valeur totale/);
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
});

test('routage : formation sans cookie → connexion ; cookie invalide → effacé, retour à la page de vente', async () => {
  const sans = await ouvrir();
  assert.equal(sans.status, 302);
  assert.equal(sans.headers.get('location'), '/methode-ikea/acces?connexion');
  const forge = await ouvrir('mi_session=nimporte.quoi');
  assert.equal(forge.status, 302);
  assert.equal(forge.headers.get('location'), '/methode-ikea');
  assert.match(forge.headers.get('set-cookie'), /^mi_session=; .*Max-Age=0/);
  assert.doesNotMatch(forge.html, /CONTENU-PAYANT/);
  // Déjà connecté : la page d'achat renvoie vers la formation.
  await appel('admin/access', { email: 'c@d.fr' }, { auth: ADMIN });
  await appel('request-code', { email: 'c@d.fr' });
  const ok = await appel('verify-code', { email: 'c@d.fr', code: codeEnvoye() });
  const achat = await pageAchat(ok.cookie);
  assert.equal(achat.status, 302);
  assert.equal(achat.headers.get('location'), '/methode-ikea');
});

test('netlify.toml : /methode-ikea réécrit vers la formation seulement avec le cookie', async () => {
  const { readFile } = await import('node:fs/promises');
  const toml = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  for (const from of ['/methode-ikea', '/methode-ikea/']) {
    const bloc = toml.split('[[redirects]]').find((b) => b.includes(`from = "${from}"`));
    assert.ok(bloc, from);
    assert.match(bloc, /to = "\/methode-ikea\/formation"/);
    assert.match(bloc, /status = 200/);
    assert.match(bloc, /force = true/);
    assert.match(bloc, /conditions = \{Cookie = \["mi_session"\]\}/);
  }
  // Décision du 18/10/2026 : la page de vente garde les liens PayPal hébergés ; le webhook
  // paypal-to-skool ouvre l'accès et envoie l'email de bienvenue. « Me connecter » mène au code.
  const vente = await readFile(new URL('../methode-ikea.html', import.meta.url), 'utf8');
  assert.match(vente, /paypal\.com\/ncp\/payment\/B635FGXCASPJG/);
  assert.match(vente, /paypal\.com\/ncp\/payment\/SMZPBP79P5Y7A/);
  assert.match(vente, /\/methode-ikea\/acces\?connexion/);
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
  assert.equal(order.payment_source.paypal.experience_context.return_url, `${ORIGIN}/methode-ikea/acces?paypal=return`);
  assert.equal(order.payment_source.paypal.experience_context.cancel_url, `${ORIGIN}/methode-ikea/acces?paypal=cancel&offre=avec_appels`);

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

test('quota mensuel : chaque vente avec appels consomme une place, quota atteint → downsell seul', async () => {
  process.env.METHODE_IKEA_PLACES_APPELS = '2';
  for (const email of ['a@q.fr', 'b@q.fr']) {
    await appel('checkout', { email, offre: 'avec_appels' });
    const id = [...orders.keys()].at(-1);
    await appel('capture', { order_id: id });
    await appel('capture', { order_id: id }); // rejeu : ne compte pas deux fois
  }
  // Un accès manuel « avec_appels » ne consomme pas de place.
  await appel('admin/access', { email: 'm@q.fr', offre: 'avec_appels' }, { auth: ADMIN });
  const list = await appel('admin/access', null, { auth: ADMIN, method: 'GET' });
  assert.equal(list.body.quota.places, 2);
  assert.equal(list.body.quota.restantes, 0);
  assert.equal((await appel('checkout', { email: 'c@q.fr', offre: 'avec_appels' })).body.error, 'quota_full');
  assert.equal((await appel('checkout', { email: 'c@q.fr', offre: 'sans_appels' })).status, 201);
  const html = (await pageAchat()).html;
  assert.match(html, /Les 2 places avec appels de \S+ sont prises/);
  assert.match(html, /<div id="offer-avec_appels" hidden>/);
  assert.match(html, /Payer 49 € avec PayPal/);
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

// ── Progression sauvegardée sur le compte ────────────────────────────────────
const connecter = async (email) => {
  await appel('admin/access', { email }, { auth: ADMIN });
  await appel('request-code', { email });
  return (await appel('verify-code', { email, code: codeEnvoye() })).cookie;
};

test('progression : sans session → 401, jamais l\'état d\'un autre', async () => {
  assert.equal((await appel('state', null, { method: 'GET' })).status, 401);
  assert.equal((await appel('state', { state: { a: 1 }, base_rev: 0 }, { method: 'PUT' })).status, 401);
});

test('progression : aller-retour, révision, et un appareil en retard reçoit 409 avec l\'état récent', async () => {
  const cookie = await connecter('sync@test.fr');
  const vide = await appel('state', null, { method: 'GET', cookie });
  assert.deepEqual(vide.body, { state: null, rev: 0 });
  const p1 = await appel('state', { state: { done: { 1: true } }, summary: { modules: 1 }, base_rev: 0 }, { method: 'PUT', cookie });
  assert.equal(p1.status, 200);
  assert.equal(p1.body.rev, 1);
  const lu = await appel('state', null, { method: 'GET', cookie });
  assert.deepEqual(lu.body.state, { done: { 1: true } });
  assert.equal(lu.body.rev, 1);
  // Téléphone : écrit depuis rev 1 → rev 2. Ordinateur resté sur rev 0 → conflit.
  assert.equal((await appel('state', { state: { done: { 1: true, 2: true } }, base_rev: 1 }, { method: 'PUT', cookie })).body.rev, 2);
  const retard = await appel('state', { state: { done: {} }, base_rev: 1 }, { method: 'PUT', cookie });
  assert.equal(retard.status, 409);
  assert.deepEqual(retard.body.state, { done: { 1: true, 2: true } });
  assert.equal(retard.body.rev, 2);
  assert.ok(!JSON.stringify(lu.body).includes('sync@test.fr'));
});

test('progression : état invalide ou trop gros refusé', async () => {
  const cookie = await connecter('gros@test.fr');
  assert.equal((await appel('state', { state: [1, 2], base_rev: 0 }, { method: 'PUT', cookie })).status, 400);
  assert.equal((await appel('state', null, { method: 'PUT', cookie, raw: 'pas du json' })).status, 400);
  assert.equal((await appel('state', null, { method: 'PUT', cookie, raw: JSON.stringify({ state: { x: 'a'.repeat(450_000) } }) })).status, 413);
});

test('progression : retirer l\'accès efface aussi la progression sauvegardée', async () => {
  const cookie = await connecter('parti@test.fr');
  await appel('state', { state: { notes: 'épaule droite' }, base_rev: 0 }, { method: 'PUT', cookie });
  assert.ok([...data.keys()].some((k) => k.startsWith('state/')));
  await appel('admin/access?email=parti@test.fr', null, { method: 'DELETE', auth: ADMIN });
  const restants = [...data.entries()].filter(([k, v]) => k.startsWith('state/') && v.email === 'parti@test.fr');
  assert.equal(restants.length, 0);
});

test('mesure : admin/stats donne l\'entonnoir et la progression de chaque acheteur, jeton exigé', async () => {
  for (const k of [...data.keys()]) if (k.startsWith('buyers/') || k.startsWith('state/')) data.delete(k);
  const c1 = await connecter('actif@test.fr');
  await appel('admin/access', { email: 'dormant@test.fr' }, { auth: ADMIN });
  await appel('state', { state: { x: 1 }, summary: { modules: 5, ready: true, starts: 4, sessions: 3, paliers: 2, last_active: new Date().toISOString() }, base_rev: 0 }, { method: 'PUT', cookie: c1 });
  assert.equal((await appel('admin/stats', null, { method: 'GET' })).status, 401);
  const r = await appel('admin/stats', null, { method: 'GET', auth: ADMIN });
  assert.equal(r.status, 200);
  assert.equal(r.body.funnel.acheteurs, 2);
  assert.equal(r.body.funnel.ont_ouvert, 1);
  assert.equal(r.body.funnel.module_5, 1);
  assert.equal(r.body.funnel.routine_prete, 1);
  assert.equal(r.body.funnel.une_seance_notee, 1);
  assert.equal(r.body.funnel.actifs_7_jours, 1);
  const dormant = r.body.buyers.find((b) => b.email === 'dormant@test.fr');
  assert.equal(dormant.synced, false);
});
