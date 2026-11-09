// Espace acheteur du Kit App Sexy : API /api/kit-app-sexy/* (connexion par code, dossier, captures,
// livraisons à date, administration). Blobs et Resend simulés : aucun réseau, aucun envoi réel.
import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Blobs simulé : JSON, binaire, texte, onlyIfNew, list avec prefix ─────────────
const stores = new Map();
const magasin = (nom) => { if (!stores.has(nom)) stores.set(nom, new Map()); return stores.get(nom); };

mock.module('@netlify/blobs', {
  namedExports: {
    connectLambda: () => {},
    getStore: (opt) => {
      const M = magasin(typeof opt === 'string' ? opt : opt?.name);
      return {
        get: async (key, { type } = {}) => {
          if (!M.has(key)) return null;
          const e = M.get(key);
          if (type === 'json') return e.kind === 'json' ? structuredClone(e.v) : JSON.parse(Buffer.from(e.v).toString('utf8'));
          if (type === 'arrayBuffer') {
            const b = Buffer.from(e.kind === 'json' ? JSON.stringify(e.v) : e.v);
            return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
          }
          return e.kind === 'json' ? JSON.stringify(e.v) : Buffer.from(e.v).toString('utf8');
        },
        set: async (key, value, { onlyIfNew } = {}) => {
          if (onlyIfNew && M.has(key)) return { modified: false };
          M.set(key, { kind: 'raw', v: typeof value === 'string' ? value : Buffer.from(value) });
          return { modified: true };
        },
        setJSON: async (key, value, { onlyIfNew } = {}) => {
          if (onlyIfNew && M.has(key)) return { modified: false };
          M.set(key, { kind: 'json', v: structuredClone(value) });
          return { modified: true };
        },
        delete: async (key) => { M.delete(key); },
        list: async ({ prefix = '' } = {}) => ({ blobs: [...M.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
      };
    },
  },
});

const { default: api } = await import('../netlify/functions/kit-app-sexy-api.js');
const { hashEmail, creerJeton: creerJetonIkea, sessionValide: sessionIkea } = await import('../netlify/lib/methode-ikea.js');
const { traiterVenteKit, emailBienvenueKit } = await import('../netlify/lib/kit-app-sexy.js');

const ORIGIN = 'https://www.mobilityclub.co';
const ADMIN = 'admin-token-de-test-suffisamment-long';
let mails;
const kit = () => magasin('kit_app_sexy');

const appel = async (chemin, { method = 'GET', body, raw, cookie, auth, origin, type = 'application/json', form } = {}) => {
  const headers = {
    ...(cookie ? { cookie } : {}),
    ...(auth ? { authorization: `Bearer ${auth}` } : {}),
    ...(origin ? { origin } : {}),
  };
  let corps;
  if (form) corps = form;
  else if (raw !== undefined) { corps = raw; headers['Content-Type'] = type; }
  else if (body !== undefined) { corps = JSON.stringify(body); headers['Content-Type'] = type; }
  const res = await api(new Request(`${ORIGIN}/api/kit-app-sexy/${chemin}`, { method, headers, ...(corps !== undefined && !['GET', 'HEAD'].includes(method) ? { body: corps } : {}) }));
  const brut = res.status === 204 ? Buffer.alloc(0) : Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get('content-type') || '';
  return {
    status: res.status,
    headers: res.headers,
    buf: brut,
    text: brut.toString('utf8'),
    body: ct.includes('json') ? JSON.parse(brut.toString('utf8')) : null,
    cookie: (res.headers.get('set-cookie') || '').split(';')[0],
    setCookie: res.headers.get('set-cookie') || '',
  };
};
const admin = (chemin, opts = {}) => appel(`admin/${chemin}`, { auth: ADMIN, ...opts });

const fiche = (email, extra = {}) => {
  const e = email.toLowerCase();
  const f = { email: e, rang: 1, audit: true, bonus: true, source: 'paypal', note: null, coupe_at: null, coupe_raison: null, purge_at: null, created_at: '2026-11-01T10:00:00.000Z', updated_at: '2026-11-01T10:00:00.000Z', onboarding: null, achats: [{ capture_id: `CAP-${e}`, order_id: 'O1', montant: '199.00', paid_at: '2026-11-01T10:00:00.000Z' }], ...extra };
  kit().set(`buyers/${hashEmail(e)}`, { kind: 'json', v: f });
  return f;
};

const dernierCode = () => {
  const m = [...mails].reverse().find((x) => /^Ton code Kit App Sexy : \d{6}$/.test(x.subject));
  return m.subject.slice(-6);
};

const connecter = async (email) => {
  const r1 = await appel('request-code', { method: 'POST', body: { email } });
  assert.equal(r1.status, 200);
  const r2 = await appel('verify-code', { method: 'POST', body: { email, code: dernierCode() } });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  return r2.cookie;
};

const PNG = (n = 200) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n, 1)]);
const JPG = (n = 200) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 2)]);
const WEBP = (n = 200) => Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBP'), Buffer.alloc(n, 3)]);

const envoyerImage = (cookie, buf, { type = 'image/png', note, nom = 'a.png', largeur, hauteur, origin } = {}) => {
  const form = new FormData();
  form.set('image', new File([buf], nom, { type }));
  if (note !== undefined) form.set('note', note);
  if (largeur) form.set('largeur', String(largeur));
  if (hauteur) form.set('hauteur', String(hauteur));
  return appel('captures', { method: 'POST', cookie, form, origin });
};

beforeEach(() => {
  stores.clear();
  mails = [];
  process.env.METHODE_IKEA_SESSION_SECRET = 'x'.repeat(40);
  process.env.METHODE_IKEA_ADMIN_TOKEN = ADMIN;
  delete process.env.METHODE_IKEA_ADMIN_ORIGINS;
  process.env.RESEND_API_KEY = 're_test';
  process.env.URL = ORIGIN;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url) === 'https://api.resend.com/emails') {
      mails.push(JSON.parse(options.body));
      return new Response('{"id":"mail"}');
    }
    throw new Error(`fetch inattendu: ${url}`);
  };
});
afterEach(() => { mock.timers.reset(); });

// ── 1. Anti-énumération ──────────────────────────────────────────────────────
test('request-code : email inconnu ou accès coupé → même réponse 200, aucun email', async () => {
  fiche('coupe@exemple.fr', { coupe_at: '2026-11-02T00:00:00.000Z' });
  fiche('ok@exemple.fr');
  const inconnu = await appel('request-code', { method: 'POST', body: { email: 'personne@exemple.fr' } });
  const coupe = await appel('request-code', { method: 'POST', body: { email: 'coupe@exemple.fr' } });
  assert.deepEqual(inconnu.body, { sent: true });
  assert.deepEqual(coupe.body, { sent: true });
  assert.equal(inconnu.status, 200);
  assert.equal(coupe.status, 200);
  assert.equal(mails.length, 0);
  const connu = await appel('request-code', { method: 'POST', body: { email: 'OK@exemple.fr' } });
  assert.deepEqual(connu.body, { sent: true });
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to[0], 'ok@exemple.fr');
  assert.match(mails[0].html, /Il expire dans 10 minutes/);
  assert.doesNotMatch(mails[0].html, /\d{3} \d{3}/, 'code d\'un bloc, sans espace');
  const mauvais = await appel('request-code', { method: 'POST', body: { email: 'pas-un-email' } });
  assert.equal(mauvais.status, 400);
});

// ── 2. Connexion, cookie, moi ────────────────────────────────────────────────
test('code → cookie kas_session (HttpOnly, Path, 180 j) → moi', async () => {
  fiche('ok@exemple.fr', { rang: 2, bonus: true });
  await appel('request-code', { method: 'POST', body: { email: 'ok@exemple.fr' } });
  const v = await appel('verify-code', { method: 'POST', body: { email: 'ok@exemple.fr', code: dernierCode() } });
  assert.equal(v.status, 200);
  assert.match(v.setCookie, /^kas_session=/);
  assert.match(v.setCookie, /HttpOnly/);
  assert.match(v.setCookie, /Path=\/api\/kit-app-sexy(;|$)/);
  assert.match(v.setCookie, /Max-Age=15552000/);
  assert.match(v.setCookie, /SameSite=Lax/);
  assert.match(v.setCookie, /Secure/);

  const moi = await appel('moi', { cookie: v.cookie });
  assert.equal(moi.status, 200);
  assert.equal(moi.body.email, 'ok@exemple.fr');
  assert.equal(moi.body.rang, 2);
  assert.equal(moi.body.bonus, true);
  assert.equal(moi.body.source, 'paypal');
  assert.equal(moi.body.achete_le, '2026-11-01T10:00:00.000Z');
  assert.equal(moi.body.contact, 'founder@mobilityclub.co');
  assert.deepEqual(moi.body.captures, { nombre: 0, max: 30 });
  assert.deepEqual(moi.body.dossier, { completude: 0, updated_at: null });
  assert.equal(moi.body.bonus_echeance, null);
  assert.deepEqual(moi.body.livraisons.map((l) => l.slug), ['video', 'grille', 'audit']);
  assert.equal(moi.body.livraisons[2].au_plus_tard, true);
  assert.equal(moi.headers.get('cache-control'), 'no-store');

  // Le code est à usage unique.
  const rejeu = await appel('verify-code', { method: 'POST', body: { email: 'ok@exemple.fr', code: dernierCode() } });
  assert.equal(rejeu.status, 401);

  const sans = await appel('moi');
  assert.equal(sans.status, 401);
  assert.deepEqual(sans.body, { error: 'unauthorized' });
  const forge = await appel('moi', { cookie: 'kas_session=nimporte.quoi' });
  assert.equal(forge.status, 401);

  const out = await appel('logout', { method: 'POST' });
  assert.equal(out.status, 200);
  assert.match(out.setCookie, /^kas_session=;/);
  assert.match(out.setCookie, /Path=\/api\/kit-app-sexy/);
  assert.match(out.setCookie, /Max-Age=0/);
});

test('activité : première et dernière connexion, compteur ; moi ne réécrit pas plus d\'une fois par heure', async () => {
  fiche('ok@exemple.fr');
  const id = hashEmail('ok@exemple.fr');
  const cookie = await connecter('ok@exemple.fr');
  const a1 = kit().get(`activite/${id}`).v;
  assert.equal(a1.connexions, 1);
  assert.ok(a1.premiere_connexion);
  assert.equal(a1.premiere_capture_at, null);
  const avant = a1.derniere_connexion;
  await appel('moi', { cookie });
  assert.equal(kit().get(`activite/${id}`).v.derniere_connexion, avant, 'moi dans l\'heure : pas de réécriture');
  mock.timers.enable({ apis: ['Date'], now: Date.now() + 2 * 3600 * 1000 });
  await appel('moi', { cookie });
  assert.notEqual(kit().get(`activite/${id}`).v.derniere_connexion, avant, 'moi après une heure : réécrit');
  assert.equal(kit().get(`activite/${id}`).v.connexions, 1, 'moi ne compte pas comme une connexion');
});

// ── 3. Séparation de domaine IKEA ↔ kit ──────────────────────────────────────
test('un jeton IKEA n\'ouvre pas le kit, un jeton kit n\'ouvre pas IKEA', async () => {
  fiche('ok@exemple.fr');
  magasin('methode_ikea').set(`buyers/${hashEmail('ok@exemple.fr')}`, { kind: 'json', v: { email: 'ok@exemple.fr' } });
  const jetonIkea = creerJetonIkea('ok@exemple.fr');
  const contreKit = await appel('moi', { cookie: `kas_session=${jetonIkea}` });
  assert.equal(contreKit.status, 401);

  const cookieKit = await connecter('ok@exemple.fr');
  const jetonKit = cookieKit.split('=')[1];
  const reqIkea = new Request(`${ORIGIN}/methode-ikea/formation`, { headers: { cookie: `mi_session=${jetonKit}` } });
  assert.equal(await sessionIkea(reqIkea), null);
  // Contrôle positif : le vrai jeton IKEA, lui, ouvre IKEA (le montage du test est bon).
  const reqIkeaOk = new Request(`${ORIGIN}/methode-ikea/formation`, { headers: { cookie: `mi_session=${jetonIkea}` } });
  assert.equal(await sessionIkea(reqIkeaOk), 'ok@exemple.fr');
  // Le nom de cookie ne suffit pas non plus : mi_session ne vaut rien côté kit.
  assert.equal((await appel('moi', { cookie: `mi_session=${jetonKit}` })).status, 401);
});

test('sans secret de session (< 32 caractères) : 503, jamais un jeton faible', async () => {
  fiche('ok@exemple.fr');
  process.env.METHODE_IKEA_SESSION_SECRET = 'court';
  const r = await appel('request-code', { method: 'POST', body: { email: 'ok@exemple.fr' } });
  assert.equal(r.status, 503);
  assert.equal(mails.length, 0);
});

// ── 4. Codes : essais, envois, expiration ───────────────────────────────────
test('5 mauvais codes brûlent le code ; 5 envois par fenêtre ; code expiré après 10 minutes', async () => {
  fiche('ok@exemple.fr');
  await appel('request-code', { method: 'POST', body: { email: 'ok@exemple.fr' } });
  const bon = dernierCode();
  const faux = bon === '000000' ? '111111' : '000000';
  const verdicts = [];
  for (let i = 0; i < 5; i++) verdicts.push((await appel('verify-code', { method: 'POST', body: { email: 'ok@exemple.fr', code: faux } })).status);
  assert.deepEqual(verdicts, [401, 401, 401, 401, 429]);
  assert.equal((await appel('verify-code', { method: 'POST', body: { email: 'ok@exemple.fr', code: bon } })).status, 401, 'le bon code est brûlé aussi');

  // Cinq envois au total dans la fenêtre (un a déjà été consommé ci-dessus).
  for (let i = 0; i < 6; i++) await appel('request-code', { method: 'POST', body: { email: 'ok@exemple.fr' } });
  assert.equal(mails.length, 5, 'le 6e envoi est silencieusement refusé');

  // Expiration : on repart d'un autre acheteur.
  fiche('lent@exemple.fr');
  await appel('request-code', { method: 'POST', body: { email: 'lent@exemple.fr' } });
  const code = dernierCode();
  mock.timers.enable({ apis: ['Date'], now: Date.now() + 11 * 60 * 1000 });
  const trop = await appel('verify-code', { method: 'POST', body: { email: 'lent@exemple.fr', code } });
  assert.equal(trop.status, 401);
  assert.equal(trop.body.error, 'expired');
});

test('verify-code : requête invalide → 400 ; fiche coupée entre l\'envoi et la saisie → 403 no_access', async () => {
  fiche('ok@exemple.fr');
  assert.equal((await appel('verify-code', { method: 'POST', body: { email: 'ok@exemple.fr', code: '12' } })).status, 400);
  await appel('request-code', { method: 'POST', body: { email: 'ok@exemple.fr' } });
  const code = dernierCode();
  await admin('acces', { method: 'PATCH', body: { email: 'ok@exemple.fr', coupe: true } });
  const r = await appel('verify-code', { method: 'POST', body: { email: 'ok@exemple.fr', code } });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'no_access');
  assert.equal(r.setCookie, '');
});

// ── 5. Alias ─────────────────────────────────────────────────────────────────
test('alias : connexion par l\'autre email, mêmes données ; retrait de l\'alias → sessions coupées', async () => {
  fiche('paypal@exemple.fr');
  const a = await admin('alias', { method: 'POST', body: { email: 'paypal@exemple.fr', autre: 'perso@exemple.fr' } });
  assert.equal(a.status, 200);
  assert.equal(a.body.ok, true);
  assert.equal(a.body.id, hashEmail('paypal@exemple.fr'));

  const cookieAlias = await connecter('perso@exemple.fr');
  assert.equal(mails.at(-1).to[0], 'perso@exemple.fr', 'le code part à l\'email tapé');
  const moi = await appel('moi', { cookie: cookieAlias });
  assert.equal(moi.body.email, 'perso@exemple.fr');
  const put = await appel('dossier', { method: 'PUT', cookie: cookieAlias, body: { dossier: { nom: 'Mon App' }, base_rev: 0 } });
  assert.equal(put.status, 200);
  const cookiePrincipal = await connecter('paypal@exemple.fr');
  assert.equal((await appel('dossier', { cookie: cookiePrincipal })).body.dossier.nom, 'Mon App');

  assert.equal((await admin('alias', { method: 'POST', body: { email: 'paypal@exemple.fr', autre: 'perso@exemple.fr' } })).body.error, 'alias_existe');
  fiche('autre-acheteur@exemple.fr');
  const deja = await admin('alias', { method: 'POST', body: { email: 'paypal@exemple.fr', autre: 'autre-acheteur@exemple.fr' } });
  assert.equal(deja.status, 409);
  assert.equal(deja.body.error, 'deja_acheteur');
  assert.equal((await admin('alias', { method: 'POST', body: { email: 'absent@exemple.fr', autre: 'x@exemple.fr' } })).status, 404);

  const retire = await admin('alias', { method: 'DELETE', body: { autre: 'perso@exemple.fr' } });
  assert.deepEqual(retire.body, { removed: true });
  assert.equal((await appel('moi', { cookie: cookieAlias })).status, 401);
  assert.equal((await appel('moi', { cookie: cookiePrincipal })).status, 200, 'la session principale ne bouge pas');
  mails.length = 0;
  await appel('request-code', { method: 'POST', body: { email: 'perso@exemple.fr' } });
  assert.equal(mails.length, 0, 'plus de code pour un alias retiré');
});

// ── 6. Coupure / réouverture ─────────────────────────────────────────────────
test('coupure douce : 403 acces_coupe partout, la fiche et le rang restent ; réouverture', async () => {
  fiche('ok@exemple.fr', { rang: 3 });
  const cookie = await connecter('ok@exemple.fr');
  assert.equal((await appel('captures', { cookie })).status, 200);
  const c = await admin('acces', { method: 'PATCH', body: { email: 'ok@exemple.fr', coupe: true, raison: 'remboursé' } });
  assert.equal(c.status, 200);
  assert.ok(c.body.coupe_at);
  for (const chemin of ['moi', 'dossier', 'captures', 'contenu/video']) {
    const r = await appel(chemin, { cookie });
    assert.equal(r.status, 403, chemin);
  }
  assert.deepEqual((await appel('moi', { cookie })).body, { error: 'acces_coupe', contact: 'founder@mobilityclub.co' });
  const f = kit().get(`buyers/${hashEmail('ok@exemple.fr')}`).v;
  assert.equal(f.rang, 3);
  assert.equal(f.coupe_raison, 'remboursé');
  mails.length = 0;
  await appel('request-code', { method: 'POST', body: { email: 'ok@exemple.fr' } });
  assert.equal(mails.length, 0);

  const r = await admin('acces', { method: 'PATCH', body: { email: 'ok@exemple.fr', coupe: false } });
  assert.equal(r.body.coupe_at, null);
  assert.equal((await appel('moi', { cookie })).status, 200, 'la session ouverte revit à la réouverture');
  assert.equal((await admin('acces', { method: 'PATCH', body: { email: 'absent@exemple.fr', coupe: true } })).status, 404);
});

// ── 7. Dossier de marque ─────────────────────────────────────────────────────
test('dossier : cas zéro, aller-retour, révision, 409', async () => {
  fiche('ok@exemple.fr');
  const cookie = await connecter('ok@exemple.fr');
  const zero = await appel('dossier', { cookie });
  assert.equal(zero.status, 200);
  assert.deepEqual(zero.body, { dossier: null, rev: 0, updated_at: null, completude: 0 });
  assert.deepEqual((await appel('captures', { cookie })).body, { captures: [], max: 30 });

  const p1 = await appel('dossier', { method: 'PUT', cookie, body: { dossier: { nom: 'Mon App', type: 'app' }, base_rev: 0 } });
  assert.equal(p1.status, 200);
  assert.equal(p1.body.rev, 1);
  assert.equal(p1.body.completude, 25);
  const lu = await appel('dossier', { cookie });
  assert.equal(lu.body.dossier.nom, 'Mon App');
  assert.equal(lu.body.rev, 1);
  assert.equal(lu.body.completude, 25);
  assert.equal((await appel('moi', { cookie })).body.dossier.completude, 25);

  const perime = await appel('dossier', { method: 'PUT', cookie, body: { dossier: { nom: 'Autre onglet' }, base_rev: 0 } });
  assert.equal(perime.status, 409);
  assert.equal(perime.body.conflict, true);
  assert.equal(perime.body.dossier.nom, 'Mon App', 'le 409 rend la version du serveur');
  assert.equal(perime.body.rev, 1);
  assert.equal((await appel('dossier', { cookie })).body.dossier.nom, 'Mon App', 'rien n\'a été écrasé');

  const p2 = await appel('dossier', { method: 'PUT', cookie, body: { dossier: { nom: 'Mon App 2', type: 'app' }, base_rev: 1 } });
  assert.equal(p2.body.rev, 2);

  assert.equal((await appel('dossier', { method: 'PUT', cookie, body: { dossier: [], base_rev: 2 } })).body.error, 'invalid_dossier');
  assert.equal((await appel('dossier', { method: 'PUT', cookie, body: { base_rev: 2 } })).body.error, 'invalid_dossier');
  assert.equal((await appel('dossier', { method: 'PUT', cookie, raw: '{pas du json' })).body.error, 'invalid_json');
  const gros = await appel('dossier', { method: 'PUT', cookie, body: { dossier: { ecran_matin: 'é'.repeat(11000) }, base_rev: 2 } });
  assert.equal(gros.status, 413);
  assert.equal(gros.body.error, 'too_large');
  assert.equal((await appel('dossier', { cookie })).body.rev, 2);
});

test('dossier : le serveur normalise sans refuser (couleurs, liens, troncatures)', async () => {
  fiche('ok@exemple.fr');
  const cookie = await connecter('ok@exemple.fr');
  const insp = [
    { url: 'javascript:alert(1)', note: 'piégé' },
    { url: 'data:text/html,<b>x</b>', note: 'piégé' },
    { url: 'https://a.example/x', note: 'n'.repeat(500) },
    { url: 'b.example/y' },
    ...[3, 4, 5, 6, 7, 8].map((i) => ({ url: `https://c${i}.example`, note: `n${i}` })),
  ];
  const r = await appel('dossier', {
    method: 'PUT', cookie,
    body: {
      base_rev: 0,
      dossier: {
        nom: `  ${'N'.repeat(200)}  `,
        lien: 'monapp.fr',
        type: 'inconnu',
        pour_qui: 'p'.repeat(300),
        couleurs: ['#ABC', '#3ECFA0', 'zzz', '#3ecfa0', 'rouge', '#111111', '#222222', '#333333', '#444444', '#555555'],
        voix: ['  direct ', '', 'chaleureux', 'x'.repeat(60), 'quatrième'],
        inspirations: insp,
        ecran_matin: `ligne 1\r\nligne\u0007 2\n${'x'.repeat(2000)}`,
        inconnu: 'ignoré',
      },
    },
  });
  assert.equal(r.status, 200);
  const d = (await appel('dossier', { cookie })).body.dossier;
  assert.equal(d.nom.length, 80);
  assert.match(d.nom, /^N+$/);
  assert.equal(d.lien, 'monapp.fr', 'lien stocké tel quel');
  assert.equal(d.type, null);
  assert.equal(d.pour_qui.length, 200);
  assert.deepEqual(d.couleurs, ['#aabbcc', '#3ecfa0', '#111111', '#222222', '#333333']);
  assert.equal(d.voix.length, 3);
  assert.equal(d.voix[0], 'direct');
  assert.deepEqual(d.voix.slice(1, 3).map((v) => v.length <= 30), [true, true]);
  assert.ok(d.inspirations.length <= 6);
  assert.ok(d.inspirations.every((i) => /^https?:\/\//.test(i.url)), 'aucune URL javascript: ou data: conservée');
  assert.ok(d.inspirations.every((i) => !i.note || i.note.length <= 280));
  assert.equal(d.inspirations[0].note.length, 280);
  assert.equal(d.ecran_matin.length, 1000);
  assert.ok(d.ecran_matin.startsWith('ligne 1\nligne 2\n'));
  assert.ok(!('inconnu' in d));
  assert.deepEqual(Object.keys(d).sort(), ['couleurs', 'ecran_matin', 'inspirations', 'lien', 'nom', 'pour_qui', 'type', 'voix']);
});

test('dossier : complétude 0, 100 et cas « pas encore d\'app »', async () => {
  fiche('ok@exemple.fr');
  const cookie = await connecter('ok@exemple.fr');
  const vide = await appel('dossier', { method: 'PUT', cookie, body: { dossier: {}, base_rev: 0 } });
  assert.equal(vide.body.completude, 0);

  const complet = {
    nom: 'Mon App', lien: 'https://monapp.fr', type: 'app', pour_qui: 'Des coureurs de 40 ans',
    couleurs: ['#3ecfa0'], voix: ['direct', 'calme', 'précis'], inspirations: [{ url: 'https://exemple.fr', note: 'le ton' }],
    ecran_matin: 'La séance du jour',
  };
  const p = await appel('dossier', { method: 'PUT', cookie, body: { dossier: complet, base_rev: 1 } });
  assert.equal(p.body.completude, 100);
  // Deux mots de voix : le champ n'est pas rempli.
  const deux = await appel('dossier', { method: 'PUT', cookie, body: { dossier: { ...complet, voix: ['direct', 'calme'] }, base_rev: 2 } });
  assert.equal(deux.body.completude, 88, '7 sur 8');
  // Lien invalide : il ne compte pas.
  const mauvais = await appel('dossier', { method: 'PUT', cookie, body: { dossier: { ...complet, lien: 'pas un lien' }, base_rev: 3 } });
  assert.equal(mauvais.body.completude, 88);
  // Pas encore d'app : le lien sort du total (7 sur 7).
  const sansApp = await appel('dossier', { method: 'PUT', cookie, body: { dossier: { ...complet, type: 'aucune', lien: null }, base_rev: 4 } });
  assert.equal(sansApp.body.completude, 100);
});

test('mutations côté membre : un Origin étranger est refusé, l\'origine du site passe', async () => {
  fiche('ok@exemple.fr');
  const cookie = await connecter('ok@exemple.fr');
  const mal = await appel('dossier', { method: 'PUT', cookie, origin: 'https://evil.example', body: { dossier: { nom: 'X' }, base_rev: 0 } });
  assert.equal(mal.status, 403);
  assert.equal(mal.body.error, 'bad_origin');
  const malImage = await envoyerImage(cookie, PNG(), { origin: 'https://evil.example' });
  assert.equal(malImage.status, 403);
  const bien = await appel('dossier', { method: 'PUT', cookie, origin: ORIGIN, body: { dossier: { nom: 'X' }, base_rev: 0 } });
  assert.equal(bien.status, 200);
  assert.equal((await appel('dossier', { cookie })).body.dossier.nom, 'X');
});

// ── 8. Captures ──────────────────────────────────────────────────────────────
test('captures : PNG, JPEG, WEBP acceptés ; octets rendus identiques avec les bons en-têtes', async () => {
  fiche('ok@exemple.fr');
  const cookie = await connecter('ok@exemple.fr');
  const cas = [[PNG(), 'image/png'], [JPG(), 'image/jpeg'], [WEBP(), 'image/webp']];
  const ids = [];
  for (const [buf, type] of cas) {
    // Le type déclaré par le navigateur est faux exprès : seuls les octets comptent.
    const r = await envoyerImage(cookie, buf, { type: 'application/octet-stream', nom: 'x.bin', note: `note ${type}`, largeur: 1000, hauteur: 2000 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.capture.type, type);
    assert.equal(r.body.capture.octets, buf.length);
    assert.equal(r.body.capture.largeur, 1000);
    assert.equal(r.body.capture.note, `note ${type}`);
    assert.match(r.body.capture.id, /^[a-z0-9]{6,12}-[0-9a-f]{8}$/);
    ids.push(r.body.capture.id);
  }
  const liste = await appel('captures', { cookie });
  assert.equal(liste.body.captures.length, 3);
  assert.equal(liste.body.max, 30);
  assert.equal(liste.body.captures[0].url, `/api/kit-app-sexy/captures/${liste.body.captures[0].id}`);
  assert.equal((await appel('moi', { cookie })).body.captures.nombre, 3);

  const img = await appel(`captures/${ids[0]}`, { cookie });
  assert.equal(img.status, 200);
  assert.deepEqual(img.buf, PNG());
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
  assert.match(img.headers.get('cache-control'), /private/);
  assert.match(img.headers.get('content-disposition'), /inline/);
  assert.match(img.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal((await appel('captures/pas-un-id', { cookie })).status, 400);
});

test('captures : le type réel est lu dans les octets (faux JPEG → 415), taille, fichier absent', async () => {
  fiche('ok@exemple.fr');
  const cookie = await connecter('ok@exemple.fr');
  const faux = await envoyerImage(cookie, Buffer.from('<script>alert(1)</script>'), { type: 'image/jpeg', nom: 'a.jpg' });
  assert.equal(faux.status, 415);
  assert.equal(faux.body.error, 'unsupported_type');
  const svg = await envoyerImage(cookie, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), { type: 'image/svg+xml', nom: 'a.svg' });
  assert.equal(svg.status, 415);
  const gif = await envoyerImage(cookie, Buffer.from('GIF89a000'), { type: 'image/png', nom: 'a.png' });
  assert.equal(gif.status, 415);
  const riffSansWebp = await envoyerImage(cookie, Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WAVE'), Buffer.alloc(50)]), { type: 'image/webp' });
  assert.equal(riffSansWebp.status, 415, 'RIFF seul ne suffit pas : WEBP exigé en 8..11');
  const gros = await envoyerImage(cookie, PNG(4_000_001));
  assert.equal(gros.status, 413);
  assert.equal(gros.body.error, 'too_large');
  const limite = await envoyerImage(cookie, PNG(3_999_990));
  assert.equal(limite.status, 201, '4 000 000 octets pile passent');
  const sansFichier = await appel('captures', { method: 'POST', cookie, form: (() => { const f = new FormData(); f.set('note', 'x'); return f; })() });
  assert.equal(sansFichier.status, 400);
  assert.equal(sansFichier.body.error, 'no_file');
  // Le content-length est contrôlé avant la lecture du corps.
  const form = new FormData(); form.set('image', new File([PNG()], 'a.png'));
  const res = await api(new Request(`${ORIGIN}/api/kit-app-sexy/captures`, { method: 'POST', headers: { cookie, 'content-length': '4600000' }, body: form }));
  assert.equal(res.status, 413);
  assert.equal((await appel('captures', { cookie })).body.captures.length, 1, 'rien n\'a été écrit par les refus');
});

test('captures : 30 au plus, la 31e est refusée (409) ; écriture concurrente : une seule gagne', async () => {
  fiche('ok@exemple.fr');
  const cookie = await connecter('ok@exemple.fr');
  for (let i = 0; i < 29; i++) assert.equal((await envoyerImage(cookie, PNG(50 + i))).status, 201);
  // Deux envois en même temps pour la 30e place : un seul passe, jamais 31 images.
  const [a, b] = await Promise.all([envoyerImage(cookie, PNG(10)), envoyerImage(cookie, PNG(11))]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  const trente1 = await envoyerImage(cookie, PNG());
  assert.equal(trente1.status, 409);
  assert.equal(trente1.body.error, 'limite_atteinte');
  assert.equal((await appel('captures', { cookie })).body.captures.length, 30);
  const id = hashEmail('ok@exemple.fr');
  const images = [...kit().keys()].filter((k) => k.startsWith(`images/${id}/`));
  assert.equal(images.length, 30, 'l\'écriture annulée n\'a laissé aucune image orpheline');
});

test('captures : un autre acheteur obtient 404 (jamais 403) ; note ; suppression ; première capture conservée', async () => {
  fiche('a@exemple.fr');
  fiche('b@exemple.fr', { rang: 2 });
  const ca = await connecter('a@exemple.fr');
  const cb = await connecter('b@exemple.fr');
  const r = await envoyerImage(ca, PNG(), { note: 'ma capture' });
  const cid = r.body.capture.id;
  const idA = hashEmail('a@exemple.fr');
  const premiere = kit().get(`activite/${idA}`).v.premiere_capture_at;
  assert.ok(premiere);

  assert.equal((await appel(`captures/${cid}`, { cookie: cb })).status, 404);
  assert.equal((await appel(`captures/${cid}`, { method: 'PATCH', cookie: cb, body: { note: 'volée' } })).status, 404);
  assert.equal((await appel(`captures/${cid}`, { method: 'DELETE', cookie: cb })).status, 404);
  assert.equal((await appel(`captures/${cid}`, { cookie: ca })).status, 200, 'la capture de A est intacte');
  assert.equal((await appel('captures', { cookie: cb })).body.captures.length, 0);

  const n = await appel(`captures/${cid}`, { method: 'PATCH', cookie: ca, body: { note: '  nouvelle note ' } });
  assert.equal(n.body.capture.note, 'nouvelle note');
  assert.equal((await appel(`captures/${cid}`, { method: 'PATCH', cookie: ca, body: { note: null } })).body.capture.note, null);
  assert.equal((await appel('captures/zzzzzz-00000000', { method: 'PATCH', cookie: ca, body: { note: 'x' } })).status, 404);

  const d = await appel(`captures/${cid}`, { method: 'DELETE', cookie: ca });
  assert.deepEqual(d.body, { deleted: true });
  assert.equal((await appel(`captures/${cid}`, { cookie: ca })).status, 404);
  assert.deepEqual([...kit().keys()].filter((k) => k.includes(`/${idA}/`) && (k.startsWith('captures/') || k.startsWith('images/'))), []);
  assert.equal(kit().get(`activite/${idA}`).v.premiere_capture_at, premiere, 'date de la première capture gardée après suppression');
  await envoyerImage(ca, PNG());
  assert.equal(kit().get(`activite/${idA}`).v.premiere_capture_at, premiere, 'jamais réécrite');

  // L'admin, lui, lit n'importe quelle capture.
  const liste = (await appel('captures', { cookie: ca })).body.captures;
  const adm = await admin(`capture?email=a@exemple.fr&id=${liste[0].id}`);
  assert.equal(adm.status, 200);
  assert.deepEqual(adm.buf, PNG());
  assert.equal((await appel(`admin/capture?email=a@exemple.fr&id=${liste[0].id}`)).status, 401);
});

test('bonus fondateur : échéance = première capture + 7 jours, seulement pour les 5 premiers', async () => {
  fiche('bonus@exemple.fr', { rang: 2, bonus: true });
  fiche('audit@exemple.fr', { rang: 8, bonus: false });
  const cb = await connecter('bonus@exemple.fr');
  const ca = await connecter('audit@exemple.fr');
  assert.equal((await appel('moi', { cookie: cb })).body.bonus_echeance, null);
  await envoyerImage(cb, PNG());
  await envoyerImage(ca, PNG());
  const premiere = kit().get(`activite/${hashEmail('bonus@exemple.fr')}`).v.premiere_capture_at;
  const attendu = new Date(Date.parse(premiere) + 7 * 864e5).toISOString();
  assert.equal((await appel('moi', { cookie: cb })).body.bonus_echeance, attendu);
  assert.equal((await appel('moi', { cookie: ca })).body.bonus_echeance, null);
  const liste = await admin('acheteurs');
  const ligne = liste.body.acheteurs.find((x) => x.email === 'bonus@exemple.fr');
  assert.equal(ligne.bonus_echeance, attendu);
  assert.equal(ligne.premiere_capture_at, premiere);
});

// ── 9. Livraisons à date ─────────────────────────────────────────────────────
const PAGE = (secret) => `<!doctype html><html><head><title>x</title></head><body>${secret}</body></html>`;
const fixer = (iso) => { mock.timers.reset(); mock.timers.enable({ apis: ['Date'], now: Date.parse(iso) }); };

test('livraisons : rien avant la date, « en préparation » sans dépôt, servi après dépôt', async () => {
  fiche('ok@exemple.fr');
  const cookie = await connecter('ok@exemple.fr');
  assert.equal((await admin('contenu/video', { method: 'PUT', raw: PAGE('SECRET-VIDEO'), type: 'text/html' })).status, 200);
  assert.equal((await admin('contenu/audit', { method: 'PUT', raw: PAGE('SECRET-AUDIT'), type: 'text/html' })).status, 200);

  fixer('2026-11-17T22:59:00Z'); // 17/11 à 23 h 59 à Paris
  const tot = await appel('contenu/video', { cookie });
  assert.equal(tot.status, 403);
  assert.match(tot.text, /Disponible le 18 novembre/);
  assert.doesNotMatch(tot.text, /SECRET-VIDEO/, 'aucun octet du contenu avant la date');
  assert.match(tot.headers.get('content-type'), /text\/html/);
  const moiTot = await appel('moi', { cookie });
  assert.deepEqual(moiTot.body.livraisons.map((l) => l.etat), ['a_venir', 'a_venir', 'a_venir']);
  assert.doesNotMatch(JSON.stringify(moiTot.body), /SECRET/);
  assert.equal((await appel('contenu/audit', { cookie })).status, 403);

  fixer('2026-11-17T23:00:00Z'); // 18/11 à 00 h 00 à Paris
  const jour = await appel('contenu/video', { cookie });
  assert.equal(jour.status, 200);
  assert.match(jour.text, /SECRET-VIDEO/);
  assert.equal(jour.headers.get('cache-control'), 'private, no-store');
  assert.equal(jour.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.match(jour.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.match(jour.headers.get('x-robots-tag'), /noindex/);
  assert.match(jour.headers.get('vary'), /Cookie/i);
  const grille = await appel('contenu/grille', { cookie });
  assert.equal(grille.status, 404);
  assert.match(grille.text, /C'est le jour/);
  assert.match(grille.headers.get('content-type'), /text\/html/);
  const moiJour = await appel('moi', { cookie });
  assert.deepEqual(moiJour.body.livraisons.map((l) => l.etat), ['disponible', 'en_preparation', 'a_venir']);

  assert.equal((await admin('contenu/grille', { method: 'PUT', raw: PAGE('SECRET-GRILLE'), type: 'text/html' })).status, 200);
  assert.equal((await appel('contenu/grille', { cookie })).status, 200);

  fixer('2026-11-20T12:00:00Z');
  assert.equal((await appel('contenu/audit', { cookie })).status, 403, 'audit : pas avant le 25/11');
  assert.equal((await appel('contenu/inconnu', { cookie })).status, 404);
  assert.equal((await appel('contenu/video')).status, 401);
});

test('livraisons : le kit d\'audit peut être ouvert plus tôt (ouvrir=maintenant), jamais repoussé', async () => {
  fiche('ok@exemple.fr');
  const cookie = await connecter('ok@exemple.fr');
  fixer('2026-11-20T12:00:00Z');
  const r = await admin('contenu/audit?ouvrir=maintenant', { method: 'PUT', raw: PAGE('SECRET-AUDIT'), type: 'text/html' });
  assert.equal(r.status, 200);
  assert.equal(r.body.etat, 'disponible');
  assert.match((await appel('contenu/audit', { cookie })).text, /SECRET-AUDIT/);
  assert.ok(kit().get('contenus-meta/audit').v.ouvert_des);
  // Redéposer sans « ouvrir » ne referme pas ce qui est ouvert.
  await admin('contenu/audit', { method: 'PUT', raw: PAGE('SECRET-AUDIT-2'), type: 'text/html' });
  assert.match((await appel('contenu/audit', { cookie })).text, /SECRET-AUDIT-2/);

  // Après la date promise, « ouvrir » ne pose rien : la date seule fait foi.
  await admin('contenu/video?ouvrir=maintenant', { method: 'PUT', raw: PAGE('V'), type: 'text/html' });
  assert.equal(kit().get('contenus-meta/video').v.ouvert_des, null, 'le 20/11, la vidéo (18/11) est déjà due : rien à avancer');
  fixer('2026-11-26T12:00:00Z');
  await admin('contenu/grille?ouvrir=maintenant', { method: 'PUT', raw: PAGE('G'), type: 'text/html' });
  assert.equal(kit().get('contenus-meta/grille').v.ouvert_des, null);
});

test('fichiers du kit d\'audit : même règle de date, téléchargement, noms et types contrôlés', async () => {
  fiche('ok@exemple.fr');
  const cookie = await connecter('ok@exemple.fr');
  const zip = Buffer.from('PK-contenu-du-kit');
  fixer('2026-11-24T12:00:00Z');
  assert.equal((await admin('contenu/audit', { method: 'PUT', raw: PAGE('A'), type: 'text/html' })).status, 200);
  assert.equal((await admin('fichier/audit/kit.zip', { method: 'PUT', raw: zip, type: 'application/zip' })).status, 200);
  assert.equal((await admin('fichier/audit/evil.exe', { method: 'PUT', raw: zip, type: 'application/octet-stream' })).body.error, 'invalid_name');
  assert.equal((await admin('fichier/audit/Kit.ZIP', { method: 'PUT', raw: zip })).body.error, 'invalid_name');
  assert.equal((await admin('fichier/audit/..%2Fx.zip', { method: 'PUT', raw: zip })).status, 400);
  assert.equal((await admin('fichier/inconnu/a.zip', { method: 'PUT', raw: zip })).status, 400);
  assert.equal((await admin('fichier/audit/gros.zip', { method: 'PUT', raw: Buffer.alloc(4_000_001), type: 'application/zip' })).status, 413);
  assert.equal((await appel('fichier/audit/kit.zip', { cookie })).status, 403, 'la veille : refusé');
  assert.equal((await appel('moi', { cookie })).body.livraisons[2].fichiers, undefined);

  fixer('2026-11-25T08:00:00Z');
  const f = await appel('fichier/audit/kit.zip', { cookie });
  assert.equal(f.status, 200);
  assert.deepEqual(f.buf, zip);
  assert.match(f.headers.get('content-disposition'), /^attachment; filename="kit\.zip"/);
  assert.equal(f.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual((await appel('moi', { cookie })).body.livraisons[2].fichiers, [{ nom: 'kit.zip', octets: zip.length }]);
  assert.equal((await appel('fichier/audit/absent.zip', { cookie })).status, 404);
  assert.equal((await appel('fichier/audit/kit.zip')).status, 401);
});

// ── 10. Administration ───────────────────────────────────────────────────────
test('admin : jeton exigé partout, CORS limité, méthode inconnue 405', async () => {
  fiche('ok@exemple.fr');
  for (const [chemin, method] of [['acheteurs', 'GET'], ['acheteur?email=ok@exemple.fr', 'GET'], ['acces', 'POST'], ['acces', 'PATCH'], ['alias', 'POST'], ['acheteur', 'DELETE'], ['contenu/video', 'PUT'], ['contenu/video', 'GET'], ['fichier/audit/a.zip', 'PUT'], ['annoncer', 'POST'], ['capture?email=ok@exemple.fr&id=x', 'GET']]) {
    const sans = await appel(`admin/${chemin}`, { method, body: {} });
    assert.equal(sans.status, 401, `${method} ${chemin}`);
    const mauvais = await appel(`admin/${chemin}`, { method, body: {}, auth: 'mauvais-jeton-mauvais-jeton-mauvais' });
    assert.equal(mauvais.status, 401, `${method} ${chemin} (mauvais jeton)`);
  }
  // Un cookie de membre n'est pas un jeton admin.
  const cookie = await connecter('ok@exemple.fr');
  assert.equal((await appel('admin/acheteurs', { cookie })).status, 401);
  assert.equal((await admin('acheteurs', { method: 'DELETE' })).status, 405);
  assert.equal((await admin('nimporte-quoi')).status, 404);

  process.env.METHODE_IKEA_ADMIN_TOKEN = 'court';
  assert.equal((await admin('acheteurs')).status, 401, 'jeton serveur trop court : admin fermé');
  process.env.METHODE_IKEA_ADMIN_TOKEN = ADMIN;

  const pre = await api(new Request(`${ORIGIN}/api/kit-app-sexy/admin/acheteurs`, { method: 'OPTIONS', headers: { origin: 'https://app.mobilityclub.co' } }));
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://app.mobilityclub.co');
  assert.match(pre.headers.get('access-control-allow-methods'), /PATCH/);
  const ko = await api(new Request(`${ORIGIN}/api/kit-app-sexy/admin/acheteurs`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));
  assert.equal(ko.headers.get('access-control-allow-origin'), null);
});

test('admin : liste des acheteurs, détail, ajout manuel sans rang puis vente PayPal au rang 1', async () => {
  const ajout = await admin('acces', { method: 'POST', body: { emails: ['Manuel@Exemple.fr', 'pas-un-email'], note: 'ami' } });
  assert.equal(ajout.status, 200);
  assert.deepEqual(ajout.body.ajoutes, ['manuel@exemple.fr']);
  assert.deepEqual(ajout.body.invalides, ['pas-un-email']);
  const f = kit().get(`buyers/${hashEmail('manuel@exemple.fr')}`).v;
  assert.equal(f.rang, null);
  assert.equal(f.source, 'manuel');
  assert.equal(f.audit, false);
  assert.equal(f.bonus, false);
  assert.equal(f.note, 'ami');
  assert.deepEqual(f.achats, []);
  assert.equal(mails.length, 0, 'pas d\'email sans --bienvenue');

  // Un ajout répété ne change rien (sauf la note fournie).
  const encore = await admin('acces', { method: 'POST', body: { email: 'manuel@exemple.fr' } });
  assert.deepEqual(encore.body.existants, ['manuel@exemple.fr']);
  assert.equal(kit().get(`buyers/${hashEmail('manuel@exemple.fr')}`).v.note, 'ami');

  // Il ne prend aucune place dans l'ordre des achats.
  const vente = await traiterVenteKit({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAP-A', amount: { value: '199.00', currency_code: 'EUR' }, supplementary_data: { related_ids: { order_id: 'O-A' } } } }, async () => 'payeur@exemple.fr');
  assert.equal(vente.rang, 1);
  const p = kit().get(`buyers/${hashEmail('payeur@exemple.fr')}`).v;
  assert.equal(p.rang, 1);
  assert.equal(p.audit && p.bonus, true);
  assert.equal(p.source, 'paypal');

  // L'accès manuel qui paie ensuite reçoit le rang suivant.
  const vente2 = await traiterVenteKit({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAP-B', amount: { value: '199.00', currency_code: 'EUR' }, supplementary_data: { related_ids: { order_id: 'O-B' } } } }, async () => 'manuel@exemple.fr');
  assert.equal(vente2.rang, 2);
  assert.equal(kit().get(`buyers/${hashEmail('manuel@exemple.fr')}`).v.achats.length, 1);
  assert.equal(kit().get(`buyers/${hashEmail('manuel@exemple.fr')}`).v.note, 'ami', 'la note de l\'ajout manuel survit à l\'achat');

  fiche('sans-rang@exemple.fr', { rang: null, audit: false, bonus: false, source: 'manuel', achats: [] });
  const liste = await admin('acheteurs');
  assert.equal(liste.status, 200);
  assert.deepEqual(liste.body.acheteurs.map((a) => a.email), ['payeur@exemple.fr', 'manuel@exemple.fr', 'sans-rang@exemple.fr'], 'par rang, rang null en dernier');
  const l = liste.body.acheteurs[0];
  for (const champ of ['email', 'rang', 'audit', 'bonus', 'source', 'created_at', 'achats', 'montant_total', 'coupe', 'coupe_raison', 'completude', 'captures', 'premiere_capture_at', 'bonus_echeance', 'derniere_connexion', 'connexions', 'alias']) assert.ok(champ in l, champ);
  assert.equal(l.montant_total, '199.00');
  assert.equal(l.achats, 1);
  assert.deepEqual(liste.body.contenus.map((c) => c.slug), ['video', 'grille', 'audit']);
  for (const champ of ['slug', 'date', 'etat', 'octets', 'depose_le', 'ouvert_des', 'annonces']) assert.ok(champ in liste.body.contenus[0], champ);

  const det = await admin('acheteur?email=payeur@exemple.fr');
  assert.equal(det.status, 200);
  assert.equal(det.body.acheteur.email, 'payeur@exemple.fr');
  assert.equal(det.body.dossier, null);
  assert.equal(det.body.rev, 0);
  assert.deepEqual(det.body.captures, []);
  assert.equal((await admin('acheteur?email=inconnu@exemple.fr')).status, 404);
  assert.equal((await admin('acheteur?email=pas-un-email')).status, 400);
});

test('admin : add --bienvenue renvoie l\'email d\'accès à un acheteur existant, sauf s\'il est coupé', async () => {
  fiche('ok@exemple.fr');
  fiche('coupe@exemple.fr', { rang: 2, coupe_at: '2026-11-03T00:00:00.000Z' });
  const r = await admin('acces', { method: 'POST', body: { emails: ['ok@exemple.fr', 'coupe@exemple.fr', 'nouveau@exemple.fr'], bienvenue: true } });
  assert.deepEqual(r.body.bienvenue_envoyee.sort(), ['nouveau@exemple.fr', 'ok@exemple.fr']);
  assert.equal(mails.length, 2);
  assert.ok(mails.every((m) => m.subject === 'Ton Kit App Sexy est réservé'));
});

test('admin : purge efface dossier, captures, activité, alias, code ; garde email, rang, achats', async () => {
  fiche('ok@exemple.fr', { rang: 4, note: 'secret perso' });
  const id = hashEmail('ok@exemple.fr');
  await admin('alias', { method: 'POST', body: { email: 'ok@exemple.fr', autre: 'perso@exemple.fr' } });
  const cookie = await connecter('ok@exemple.fr');
  await appel('dossier', { method: 'PUT', cookie, body: { dossier: { nom: 'Mon App' }, base_rev: 0 } });
  await envoyerImage(cookie, PNG());
  await appel('request-code', { method: 'POST', body: { email: 'perso@exemple.fr' } });
  fiche('autre@exemple.fr', { rang: 5 });
  const cAutre = await connecter('autre@exemple.fr');
  await envoyerImage(cAutre, PNG());
  await appel('dossier', { method: 'PUT', cookie: cAutre, body: { dossier: { nom: 'Autre' }, base_rev: 0 } });
  const avantAutre = [...kit().keys()].filter((k) => k.includes(hashEmail('autre@exemple.fr'))).length;

  const r = await admin('acheteur', { method: 'DELETE', body: { email: 'ok@exemple.fr' } });
  assert.deepEqual(r.body, { purge: true });
  const restes = [...kit().keys()].filter((k) => k.includes(id) && !k.startsWith('buyers/'));
  assert.deepEqual(restes, [], 'rien d\'autre que la fiche');
  assert.equal([...kit().keys()].filter((k) => k.startsWith('alias/')).length, 0);
  assert.equal([...kit().keys()].some((k) => k === `otp/${hashEmail('perso@exemple.fr')}`), false);
  const f = kit().get(`buyers/${id}`).v;
  assert.equal(f.email, 'ok@exemple.fr');
  assert.equal(f.rang, 4);
  assert.equal(f.achats.length, 1);
  assert.ok(f.coupe_at && f.purge_at);
  assert.equal(f.note, null);
  assert.equal((await appel('moi', { cookie })).status, 403);
  assert.equal([...kit().keys()].filter((k) => k.includes(hashEmail('autre@exemple.fr'))).length, avantAutre, 'l\'autre acheteur n\'est pas touché');
  assert.equal((await admin('acheteur', { method: 'DELETE', body: { email: 'inconnu@exemple.fr' } })).status, 404);
});

test('admin : dépôt de contenu invalide refusé ; annonce idempotente par lots, 409 tant que pas ouvert', async () => {
  const mauvais = await admin('contenu/video', { method: 'PUT', raw: 'pas du html', type: 'text/html' });
  assert.equal(mauvais.status, 400);
  assert.equal(mauvais.body.error, 'invalid_html');
  assert.equal((await admin('contenu/video', { method: 'PUT', raw: `<!doctype html>${'x'.repeat(5_000_001)}`, type: 'text/html' })).status, 400);
  assert.equal((await admin('contenu/inconnu', { method: 'PUT', raw: PAGE('x'), type: 'text/html' })).body.error, 'invalid_slug');
  assert.equal(kit().has('contenus/video'), false);

  for (let i = 1; i <= 27; i++) fiche(`m${i}@exemple.fr`, { rang: i, audit: i <= 15, bonus: i <= 5 });
  fiche('coupe@exemple.fr', { rang: 28, coupe_at: '2026-11-03T00:00:00.000Z' });

  fixer('2026-11-18T12:00:00Z');
  const pasOuvert = await admin('annoncer', { method: 'POST', body: { slug: 'video' } });
  assert.equal(pasOuvert.status, 409);
  assert.equal(pasOuvert.body.error, 'pas_ouvert', 'jour J mais contenu pas déposé');
  assert.equal(mails.length, 0);
  const avant = await admin('annoncer', { method: 'POST', body: { slug: 'audit' } });
  assert.equal(avant.status, 409);

  await admin('contenu/video', { method: 'PUT', raw: PAGE('V'), type: 'text/html' });
  const a1 = await admin('annoncer', { method: 'POST', body: { slug: 'video' } });
  assert.equal(a1.status, 200);
  assert.equal(a1.body.envoyes.length, 25);
  assert.equal(a1.body.restants, 2);
  assert.equal(a1.body.deja, 0);
  assert.equal(mails.length, 25);
  assert.match(mails[0].subject, /La vidéo V1 contre V2 est arrivée/);
  assert.match(mails[0].html, /Ouvrir mon espace/);
  const a2 = await admin('annoncer', { method: 'POST', body: { slug: 'video' } });
  assert.equal(a2.body.envoyes.length, 2);
  assert.equal(a2.body.restants, 0);
  assert.equal(a2.body.deja, 25);
  const a3 = await admin('annoncer', { method: 'POST', body: { slug: 'video' } });
  assert.equal(a3.body.envoyes.length, 0, 'idempotent : rien n\'est renvoyé');
  assert.equal(a3.body.deja, 27);
  assert.equal(mails.length, 27, 'le coupé n\'a rien reçu');
  assert.ok(!mails.some((m) => m.to[0] === 'coupe@exemple.fr'));
  const liste = await admin('acheteurs');
  assert.equal(liste.body.contenus.find((c) => c.slug === 'video').annonces, 27);
  // Un échec d'envoi n'est pas marqué envoyé : il sera retenté.
  fiche('nouveau@exemple.fr', { rang: 29 });
  const fetchOk = globalThis.fetch;
  globalThis.fetch = async (url, opts) => (String(url).includes('resend') ? new Response('ko', { status: 500 }) : fetchOk(url, opts));
  const a4 = await admin('annoncer', { method: 'POST', body: { slug: 'video' } });
  assert.deepEqual(a4.body.echecs, ['nouveau@exemple.fr']);
  assert.equal(a4.body.envoyes.length, 0);
  globalThis.fetch = fetchOk;
  const a5 = await admin('annoncer', { method: 'POST', body: { slug: 'video' } });
  assert.deepEqual(a5.body.envoyes, ['nouveau@exemple.fr']);
});

// ── 11. Rang ─────────────────────────────────────────────────────────────────
const evenement = (id) => ({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id, amount: { value: '199.00', currency_code: 'EUR' }, supplementary_data: { related_ids: { order_id: `O-${id}` } } } });

test('rang : trois ventes simultanées reçoivent trois rangs distincts', async () => {
  const r = await Promise.all([1, 2, 3].map((i) => traiterVenteKit(evenement(`CAP-${i}`), async () => `c${i}@exemple.fr`)));
  assert.deepEqual(r.map((x) => x.rang).sort(), [1, 2, 3]);
  const rangs = [...kit().entries()].filter(([k]) => k.startsWith('buyers/')).map(([, e]) => e.v.rang).sort();
  assert.deepEqual(rangs, [1, 2, 3]);
  assert.deepEqual([...kit().keys()].filter((k) => k.startsWith('rangs/')).sort(), ['rangs/1', 'rangs/2', 'rangs/3']);
});

test('rang : des données déjà en prod (sans rangs/) reprennent à max + 1, un rachat garde son rang', async () => {
  fiche('a@exemple.fr', { rang: 1 });
  fiche('b@exemple.fr', { rang: 2 });
  fiche('c@exemple.fr', { rang: 7 }); // trou laissé par une suppression
  const r = await traiterVenteKit(evenement('CAP-N'), async () => 'nouveau@exemple.fr');
  assert.equal(r.rang, 8);
  const rachat = await traiterVenteKit(evenement('CAP-M'), async () => 'a@exemple.fr');
  assert.equal(rachat.rang, 1);
  assert.equal(kit().get(`buyers/${hashEmail('a@exemple.fr')}`).v.achats.length, 2);
  assert.equal([...kit().keys()].some((k) => k === 'rangs/1'), false, 'un rachat ne réserve aucun nouveau rang');
});

test('rang : une réservation d\'un autre est sautée ; la sienne, restée orpheline, est reprise sans trou', async () => {
  magasin('kit_app_sexy').set('rangs/1', { kind: 'json', v: { email: 'ancien@exemple.fr', at: '2026-11-01T00:00:00.000Z' } });
  const r = await traiterVenteKit(evenement('CAP-1'), async () => 'x@exemple.fr');
  assert.equal(r.rang, 2);
  // Plantage après la réservation, avant l'écriture de la fiche : le rejeu retrouve SON rang.
  magasin('kit_app_sexy').delete(`buyers/${hashEmail('x@exemple.fr')}`);
  magasin('kit_app_sexy').delete('ventes/CAP-1');
  const rejeu = await traiterVenteKit(evenement('CAP-1'), async () => 'x@exemple.fr');
  assert.equal(rejeu.rang, 2);
});

test('rachat après coupure : l\'accès se rouvre, l\'alerte le dit', async () => {
  fiche('ok@exemple.fr', { rang: 2, coupe_at: '2026-11-03T00:00:00.000Z', coupe_raison: 'remboursé' });
  await traiterVenteKit(evenement('CAP-R'), async () => 'ok@exemple.fr');
  const f = kit().get(`buyers/${hashEmail('ok@exemple.fr')}`).v;
  assert.equal(f.coupe_at, null);
  assert.equal(f.coupe_raison, null);
  assert.equal(f.rang, 2);
  const alerte = mails.find((m) => m.subject.startsWith('Kit App Sexy · vente'));
  assert.match(alerte.html, /accès rouvert/i);
});

// ── 12. Email de bienvenue ───────────────────────────────────────────────────
test('email de bienvenue : lien de l\'espace, plus de demande de captures par réponse', async () => {
  await traiterVenteKit(evenement('CAP-W'), async () => 'ok@exemple.fr');
  const m = mails.find((x) => x.subject === 'Ton Kit App Sexy est réservé');
  assert.equal(m.reply_to, 'founder@mobilityclub.co');
  assert.match(m.html, /href="https:\/\/www\.mobilityclub\.co\/kit-app-sexy\/espace\/"/);
  assert.match(m.html, /Ouvrir mon espace/);
  assert.match(m.html, /ok@exemple\.fr/);
  assert.doesNotMatch(m.html, /réponds à cet email/i);
  assert.match(m.html, /18 novembre/);
  assert.match(m.html, /25 novembre au plus tard/);
  assert.match(m.html, /15 premiers/);
  assert.match(m.html, /5 premiers/);
  assert.match(m.html, /dépose tes captures dans ton espace/);
  assert.match(m.html, /5 choses à corriger/);
  assert.match(m.html, /14 jours/);
});

test('email de bienvenue : une livraison déjà ouverte est annoncée « déjà disponible » ; rang 20 sans audit ni bonus', async () => {
  fixer('2026-11-19T12:00:00Z');
  await admin('contenu/video', { method: 'PUT', raw: PAGE('V'), type: 'text/html' });
  await admin('contenu/grille', { method: 'PUT', raw: PAGE('G'), type: 'text/html' });
  for (let i = 1; i <= 19; i++) fiche(`m${i}@exemple.fr`, { rang: i });
  await traiterVenteKit(evenement('CAP-T'), async () => 'tard@exemple.fr');
  const m = mails.find((x) => x.subject === 'Ton Kit App Sexy est réservé');
  assert.match(m.html, /déjà disponible dans ton espace/);
  assert.match(m.html, /25 novembre au plus tard/, 'le kit d\'audit n\'est pas ouvert : sa date reste');
  assert.doesNotMatch(m.html, /15 premiers|5 premiers/);
  assert.equal(kit().get(`buyers/${hashEmail('tard@exemple.fr')}`).v.rang, 20);
  assert.equal(typeof emailBienvenueKit, 'function');
});

// ── 13. CLI : le câblage jusqu'à l'API ───────────────────────────────────────
test('CLI : add --bienvenue, list, couper, contenu, annoncer parlent à l\'API réelle', async () => {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  process.env.KIT_APP_SEXY_URL = 'http://cli.test';
  const { main, rangsManquants } = await import('../scripts/kit-app-sexy.mjs');
  const suivant = globalThis.fetch;
  globalThis.fetch = (url, opts) => (String(url).startsWith('http://cli.test') ? api(new Request(url, opts)) : suivant(url, opts));
  const sortie = [];
  const log = mock.method(console, 'log', (...a) => sortie.push(a.join(' ')));
  try {
    fiche('a@exemple.fr', { rang: 1 });
    fiche('c@exemple.fr', { rang: 3 });
    await main(['add', 'b@exemple.fr', '--note', 'ami', '--bienvenue']);
    assert.match(sortie.at(-1), /ajoutés : 1 .*emails de bienvenue : 1/);
    assert.equal(mails.at(-1).to[0], 'b@exemple.fr');
    assert.equal(kit().get(`buyers/${hashEmail('b@exemple.fr')}`).v.note, 'ami');

    await main(['couper', 'c@exemple.fr', '--raison', 'remboursé']);
    sortie.length = 0;
    await main(['list']);
    const texte = sortie.join('\n');
    assert.match(texte, /n°1 +a@exemple\.fr +audit\/bonus +dossier +0 % +captures +0 +dernière connexion jamais/);
    assert.match(texte, /manuel +b@exemple\.fr/);
    assert.match(texte, /n°3 +c@exemple\.fr.*\[COUPÉ : remboursé\]/);
    assert.match(texte, /Rangs manquants : 2/);
    assert.deepEqual(rangsManquants([{ rang: 1 }, { rang: 4 }, { rang: null }]), [2, 3]);

    fixer('2026-11-18T12:00:00Z');
    const fichier = join(await mkdtemp(join(tmpdir(), 'kas-')), 'video.html');
    await writeFile(fichier, '<div>PAGE-VIDEO</div>\n<div>suite</div>');
    await main(['contenu', 'video', fichier]);
    assert.match(sortie.at(-1), /video déposé .* état : disponible/);
    mails.length = 0;
    await main(['annoncer', 'video']);
    assert.equal(mails.length, 2, 'a et b ; c est coupé');
    sortie.length = 0;
    await main(['list']);
    assert.match(sortie.join('\n'), /video +2026-11-18 +disponible +annonces 2\/2/);
    assert.doesNotMatch(sortie.join('\n'), /À ANNONCER : node scripts\/kit-app-sexy\.mjs annoncer video/);
  } finally {
    log.mock.restore();
    globalThis.fetch = suivant;
  }
});
