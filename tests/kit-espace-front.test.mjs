// Front de l'espace acheteur (kit-espace-app/src) : la logique pure ET le câblage réel.
// Le client api.ts est branché sur la VRAIE Function kit-app-sexy-api.js (Blobs et Resend simulés) :
// ce qu'on vérifie, ce sont des requêtes réellement émises et des réponses réellement servies, pas des
// fonctions isolées. Node exécute les .ts tels quels (types effacés), donc aucun build n'est requis.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { magasin, stores } from './_kit-blobs-mock.mjs';

const { default: fonction } = await import('../netlify/functions/kit-app-sexy-api.js');
const { hashEmail } = await import('../netlify/lib/methode-ikea.js');
const src = (f) => import(`../kit-espace-app/src/${f}`);
const { jourLisible, tailleLisible } = await src('dates.ts');
const { lienSur } = await src('lien.ts');
const { fusionner, sauvegarder, dossierVide } = await src('sauvegarde.ts');
const { actionPrincipale } = await src('accueil.ts');
const { dimensionsCibles } = await src('reduireImage.ts');
const client = await src('api.ts');

const ORIGIN = 'https://www.mobilityclub.co';
const ADMIN = 'admin-token-de-test-suffisamment-long';
let mails;
let jar;
let appelsAdmin;

const kit = () => magasin('kit_app_sexy');
const fiche = (email, extra = {}) => {
  const e = email.toLowerCase();
  kit().set(`buyers/${hashEmail(e)}`, { kind: 'json', v: {
    email: e, rang: 3, audit: true, bonus: true, source: 'paypal', note: null, coupe_at: null, coupe_raison: null, purge_at: null,
    created_at: '2026-11-01T10:00:00.000Z', updated_at: '2026-11-01T10:00:00.000Z', onboarding: null,
    achats: [{ capture_id: `CAP-${e}`, order_id: 'O1', montant: '199.00', paid_at: '2026-11-01T10:00:00.000Z' }], ...extra,
  } });
};
const dernierCode = () => [...mails].reverse().find((m) => /^Ton code Kit App Sexy : \d{6}$/.test(m.subject)).subject.slice(-6);
const admin = (chemin, { method = 'GET', body } = {}) => fonction(new Request(`${ORIGIN}/api/kit-app-sexy/admin/${chemin}`, {
  method, headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
}));

beforeEach(() => {
  stores.clear();
  mails = [];
  jar = '';
  appelsAdmin = 0;
  process.env.METHODE_IKEA_SESSION_SECRET = 'x'.repeat(40);
  process.env.METHODE_IKEA_ADMIN_TOKEN = ADMIN;
  process.env.RESEND_API_KEY = 're_test';
  process.env.URL = ORIGIN;
  // Un navigateur : il garde le cookie HttpOnly tout seul et joint l'Origin aux écritures. Le front ne
  // lit jamais le cookie, donc ce pot à cookies est le seul endroit où il existe dans ces tests.
  globalThis.fetch = async (entree, init = {}) => {
    const url = new URL(String(entree), ORIGIN);
    if (url.href === 'https://api.resend.com/emails') { mails.push(JSON.parse(init.body)); return new Response('{"id":"m"}'); }
    const methode = (init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    if (jar) headers.set('cookie', jar);
    if (methode !== 'GET') headers.set('origin', ORIGIN);
    const res = await fonction(new Request(url, { ...init, headers }));
    const sc = res.headers.get('set-cookie');
    if (sc) jar = /Max-Age=0/.test(sc) ? '' : sc.split(';')[0];
    return res;
  };
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 1)]);
const connecter = async (email = 'ok@exemple.fr') => {
  await client.demanderCode(email);
  await client.verifierCode(email, dernierCode());
};

// ── Logique pure ─────────────────────────────────────────────────────────────
test('dates : jour de Paris, « 1er », et taille lisible', () => {
  assert.equal(jourLisible('2026-11-18T00:00:00+01:00'), '18 novembre');
  assert.equal(jourLisible('2026-11-17T23:30:00Z'), '18 novembre', '23 h 30 UTC = 0 h 30 à Paris');
  assert.equal(jourLisible('2026-12-01T00:00:00+01:00'), '1er décembre');
  assert.equal(tailleLisible(1_572_864), '1,5 Mo');
  assert.equal(tailleLisible(2048), '2 Ko');
  assert.equal(tailleLisible(900), '900 o');
});

test('lienSur : seul un http(s) devient un href, jamais javascript: ni data:', () => {
  for (const mauvais of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'vbscript:x', ' javascript:alert(1)', 'java script:alert(1)', '', null, undefined, 'a b.com']) {
    assert.equal(lienSur(mauvais), null, String(mauvais));
  }
  assert.equal(lienSur('monapp.com'), 'https://monapp.com');
  assert.equal(lienSur('http://monapp.com/x'), 'http://monapp.com/x');
  assert.equal(lienSur('HTTPS://Monapp.com'), 'HTTPS://Monapp.com');
  assert.equal(lienSur('localhost:3000'), 'https://localhost:3000');
});

test('fusion 409 : ce que j\'ai changé gagne, le reste vient du serveur', () => {
  const base = { ...dossierVide(), nom: 'Avant', pour_qui: 'mes clients' };
  const local = { ...base, nom: 'Mon app', couleurs: ['#3ecfa0'] };
  const serveur = { ...base, pour_qui: 'des sportifs', ecran_matin: 'La séance du jour', nom: 'Nom du téléphone' };
  const f = fusionner(base, local, serveur);
  assert.equal(f.nom, 'Mon app', 'modifié ici : gagne');
  assert.deepEqual(f.couleurs, ['#3ecfa0']);
  assert.equal(f.pour_qui, 'des sportifs', 'non touché ici : serveur');
  assert.equal(f.ecran_matin, 'La séance du jour');
  assert.deepEqual(fusionner(null, { ...dossierVide(), nom: 'X' }, serveur).nom, 'X', 'sans base, tout ce qui est rempli ici gagne');
});

test('action principale : un seul bouton vert, dans l\'ordre du contrat', () => {
  const moi = (o = {}) => ({
    dossier: { completude: 0 }, captures: { nombre: 0, max: 30 },
    livraisons: [{ slug: 'video', titre: 'La vidéo V1 contre V2', etat: 'a_venir' }], ...o,
  });
  assert.deepEqual(actionPrincipale(moi(), new Set()), { type: 'dossier', commencer: true });
  assert.deepEqual(actionPrincipale(moi({ dossier: { completude: 40 } }), new Set()), { type: 'dossier', commencer: false });
  assert.deepEqual(actionPrincipale(moi({ dossier: { completude: 100 } }), new Set()), { type: 'captures' });
  assert.equal(actionPrincipale(moi({ dossier: { completude: 100 }, captures: { nombre: 2, max: 30 } }), new Set()), null);
  const dispo = moi({ livraisons: [{ slug: 'video', titre: 'La vidéo V1 contre V2', etat: 'disponible' }] });
  assert.deepEqual(actionPrincipale(dispo, new Set()), { type: 'livraison', slug: 'video', titre: 'La vidéo V1 contre V2' });
  assert.deepEqual(actionPrincipale(dispo, new Set(['video'])), { type: 'dossier', commencer: true }, 'déjà ouverte : on passe à la suite');
});

test('réduction d\'image : plus grand côté borné, ratio gardé, jamais agrandi', () => {
  assert.deepEqual(dimensionsCibles(4000, 3000, 2000), { largeur: 2000, hauteur: 1500 });
  assert.deepEqual(dimensionsCibles(3000, 6000, 2000), { largeur: 1000, hauteur: 2000 });
  assert.deepEqual(dimensionsCibles(1000, 500, 2000), { largeur: 1000, hauteur: 500 });
  assert.deepEqual(dimensionsCibles(4000, 3000, 1600), { largeur: 1600, hauteur: 1200 });
});

test('textes : aucun tiret long ni emoji dans le source du front', () => {
  const lister = (d) => readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    if (p.includes(`${join('src', 'components')}`) ) return [];
    return statSync(p).isDirectory() ? lister(p) : /\.(tsx?|css|html)$/.test(n) ? [p] : [];
  });
  const fichiers = [...lister('kit-espace-app/src'), 'kit-espace-app/index.html'];
  assert.ok(fichiers.length > 10);
  for (const f of fichiers) {
    const t = readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /—/, `${f} contient un tiret long`);
    assert.doesNotMatch(t, /\p{Extended_Pictographic}/u, `${f} contient un emoji`);
  }
});

// ── Client branché sur la vraie Function ─────────────────────────────────────
test('connexion : un code envoyé par email ouvre la session, un faux code est refusé', async () => {
  fiche('ok@exemple.fr');
  await assert.rejects(client.demanderCode('pas-un-email'), (e) => e.code === 'invalid_email' && e.statut === 400);
  assert.deepEqual(await client.demanderCode('personne@exemple.fr'), { sent: true });
  assert.equal(mails.length, 0, 'email inconnu : même réponse, aucun envoi');
  await client.demanderCode('ok@exemple.fr');
  assert.equal(mails.length, 1);
  await assert.rejects(client.verifierCode('ok@exemple.fr', '000000'), (e) => e.code === 'invalid_code' && e.statut === 401);
  await assert.rejects(client.moi(), (e) => e.code === 'unauthorized' && e.statut === 401, 'sans cookie : 401');
  await client.verifierCode('ok@exemple.fr', dernierCode());
  const moi = await client.moi();
  assert.equal(moi.email, 'ok@exemple.fr');
  assert.equal(moi.rang, 3);
  assert.equal(moi.captures.max, 30);
  await client.deconnecter();
  await assert.rejects(client.moi(), (e) => e.code === 'unauthorized');
});

test('accès coupé : toute session ouverte reçoit acces_coupe avec le contact', async () => {
  fiche('ok@exemple.fr');
  await connecter();
  const r = await admin('acces', { method: 'PATCH', body: { email: 'ok@exemple.fr', coupe: true, raison: 'remboursé' } });
  assert.equal(r.status, 200);
  await assert.rejects(client.moi(), (e) => e.code === 'acces_coupe' && e.statut === 403 && e.corps.contact === 'founder@mobilityclub.co');
  await assert.rejects(client.lireDossier(), (e) => e.code === 'acces_coupe');
});

test('dossier : cas zéro sans 404, premier PUT à rev 0, complétude lue du serveur', async () => {
  fiche('ok@exemple.fr');
  await connecter();
  assert.deepEqual(await client.lireDossier(), { dossier: null, rev: 0, updated_at: null, completude: 0 });
  const r = await client.ecrireDossier({ ...dossierVide(), nom: 'Mon app', type: 'app' }, 0);
  assert.equal(r.ok, true);
  assert.equal(r.rev, 1);
  assert.equal(r.completude, 25, '2 critères sur 8');
  const relu = await client.lireDossier();
  assert.equal(relu.dossier.nom, 'Mon app');
  assert.equal(relu.rev, 1);
});

test('deux appareils : le 409 est fusionné champ par champ et un seul nouveau PUT part', async () => {
  fiche('ok@exemple.fr');
  await connecter();
  // L'appareil A a sauvegardé le nom ; l'appareil B, resté à rev 0, a écrit « pour qui ».
  await client.ecrireDossier({ ...dossierVide(), nom: 'Écrit sur le téléphone' }, 0);
  let puts = 0;
  const ecrire = (d, rev) => { puts += 1; return client.ecrireDossier(d, rev); };
  const local = { ...dossierVide(), pour_qui: 'Écrit sur l\'ordinateur' };
  const r = await sauvegarder({ local, derniere: null, rev: 0, ecrire });
  assert.equal(puts, 2, 'un PUT refusé, un PUT fusionné');
  assert.equal(r.adopteServeur, false);
  assert.equal(r.rev, 2);
  assert.equal(r.dossier.nom, 'Écrit sur le téléphone');
  assert.equal(r.dossier.pour_qui, 'Écrit sur l\'ordinateur');
  const serveur = await client.lireDossier();
  assert.equal(serveur.dossier.nom, 'Écrit sur le téléphone');
  assert.equal(serveur.dossier.pour_qui, 'Écrit sur l\'ordinateur');
});

test('deuxième 409 de suite : le front adopte la version du serveur et le dit', async () => {
  fiche('ok@exemple.fr');
  await connecter();
  await client.ecrireDossier({ ...dossierVide(), nom: 'Serveur' }, 0);
  let puts = 0;
  // Un autre appareil écrit entre notre PUT refusé et notre PUT fusionné.
  const ecrire = async (d, rev) => {
    puts += 1;
    if (puts === 2) await client.ecrireDossier({ ...dossierVide(), nom: 'Encore plus récent' }, 1);
    return client.ecrireDossier(d, rev);
  };
  const r = await sauvegarder({ local: { ...dossierVide(), pour_qui: 'Local' }, derniere: null, rev: 0, ecrire });
  assert.equal(r.adopteServeur, true);
  assert.equal(r.dossier.nom, 'Encore plus récent');
  assert.equal(r.dossier.pour_qui, null, 'la version du serveur remplace la mienne');
  assert.equal(puts, 2, 'pas de troisième essai');
});

test('captures : envoi, liste, note, suppression, faux type et limite de 30', async () => {
  fiche('ok@exemple.fr');
  await connecter();
  assert.deepEqual(await client.listerCaptures(), { captures: [], max: 30 });
  const c = await client.envoyerCapture(new Blob([PNG], { type: 'image/png' }), { largeur: 640, hauteur: 1136, note: 'Écran du matin' });
  assert.match(c.id, /^[a-z0-9]{6,12}-[0-9a-f]{8}$/);
  assert.equal(c.url, `/api/kit-app-sexy/captures/${c.id}`);
  const img = await fetch(c.url);
  assert.equal(img.headers.get('content-type'), 'image/png');
  const n = await client.noterCapture(c.id, 'Nouvelle note');
  assert.equal(n.note, 'Nouvelle note');
  await assert.rejects(
    client.envoyerCapture(new Blob([Buffer.from('<svg onload=alert(1)>')], { type: 'image/png' }), {}),
    (e) => e.code === 'unsupported_type' && e.statut === 415,
  );
  await client.supprimerCapture(c.id);
  assert.equal((await client.listerCaptures()).captures.length, 0);
  await assert.rejects(client.supprimerCapture(c.id), (e) => e.code === 'not_found');
  for (let i = 0; i < 30; i += 1) await client.envoyerCapture(new Blob([PNG], { type: 'image/png' }), {});
  await assert.rejects(client.envoyerCapture(new Blob([PNG], { type: 'image/png' }), {}), (e) => e.code === 'limite_atteinte' && e.statut === 409);
  assert.equal((await client.moi()).captures.nombre, 30);
});

test('panne réseau : une erreur normalisée « reseau », pas une exception brute', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(client.moi(), (e) => e.code === 'reseau' && e.statut === 0);
});

// ── Brouillon hors ligne et fusion (constats du correcteur du lot 2) ─────────
// Le brouillon garde la base sur laquelle il a été écrit. Sans elle, au rechargement le brouillon ENTIER
// remplaçait le dossier : les champs remplis ailleurs entre-temps disparaissaient, sans aucun 409 (la
// révision lue était à jour). Ces tests rejouent le cas de bout en bout contre la vraie Function.
const { restaurer, lireBrouillon, serialiserBrouillon } = await src('sauvegarde.ts');

test('brouillon : le format garde la base et la révision, l\'ancien format (dossier nu) reste lisible', () => {
  const base = { ...dossierVide(), nom: 'Avant' };
  const d = { ...base, nom: 'Du métro' };
  const lu = lireBrouillon(serialiserBrouillon(4, base, d));
  assert.deepEqual(lu, { base_rev: 4, base, dossier: d });
  const ancien = lireBrouillon(JSON.stringify({ ...dossierVide(), nom: 'Vieux brouillon' }));
  assert.equal(ancien.dossier.nom, 'Vieux brouillon');
  assert.equal(ancien.base, null, 'sans base connue : seuls les champs remplis ici gagneront');
  assert.equal(lireBrouillon('pas du json'), null);
  assert.equal(lireBrouillon(null), null);
});

test('brouillon ancien et serveur modifié ailleurs : les champs non touchés restent ceux du serveur', async () => {
  fiche('ok@exemple.fr');
  await connecter();
  // Téléphone hors ligne : brouillon « nom » écrit sur un dossier vide (rev 0).
  const brouillon = lireBrouillon(serialiserBrouillon(0, null, { ...dossierVide(), nom: 'Du métro' }));
  // Le soir, l'ordinateur remplit couleurs et inspirations (rev 1).
  const soir = { ...dossierVide(), couleurs: ['#3ecfa0', '#e8a020', '#b990e0'], inspirations: [{ url: 'https://exemple.fr/a', note: 'a' }] };
  await client.ecrireDossier(soir, 0);
  // Le lendemain, le téléphone rouvre le dossier.
  const lu = await client.lireDossier();
  const r = restaurer({ brouillon, serveur: lu.dossier });
  assert.equal(r.local.nom, 'Du métro', 'ce que j\'ai changé gagne');
  assert.deepEqual(r.local.couleurs, soir.couleurs, 'ce que je n\'ai pas touché vient du serveur');
  assert.deepEqual(r.local.inspirations, soir.inspirations);
  assert.equal(r.sale, true, 'le nom du brouillon reste à envoyer');
  // L'effet : le PUT qui part ensuite n'efface rien sur le serveur.
  await sauvegarder({ local: r.local, derniere: lu.dossier, rev: lu.rev, ecrire: client.ecrireDossier });
  const fin = (await client.lireDossier()).dossier;
  assert.equal(fin.nom, 'Du métro');
  assert.deepEqual(fin.couleurs, soir.couleurs);
  assert.deepEqual(fin.inspirations, soir.inspirations);
});

test('brouillon identique au serveur : rien à renvoyer', () => {
  const s = { ...dossierVide(), nom: 'Pareil' };
  const r = restaurer({ brouillon: { base_rev: 1, base: s, dossier: { ...s } }, serveur: s });
  assert.equal(r.sale, false);
  assert.deepEqual(restaurer({ brouillon: null, serveur: null }), { local: dossierVide(), sale: false });
});

test('fusion réussie au premier 409 : le résultat dit que le serveur a apporté des champs (l\'assistant doit être remonté)', async () => {
  fiche('ok@exemple.fr');
  await connecter();
  await client.ecrireDossier({ ...dossierVide(), pour_qui: 'Écrit sur l\'ordinateur' }, 0);
  const apporte = await sauvegarder({ local: { ...dossierVide(), nom: 'Mon app' }, derniere: null, rev: 0, ecrire: client.ecrireDossier });
  assert.equal(apporte.dossier.pour_qui, 'Écrit sur l\'ordinateur');
  assert.equal(apporte.apporteDuServeur, true);
  // Sans conflit, ou si la fusion n'apporte rien de différent, l'assistant garde son état.
  const direct = await sauvegarder({ local: { ...apporte.dossier, nom: 'Encore' }, derniere: apporte.dossier, rev: apporte.rev, ecrire: client.ecrireDossier });
  assert.equal(direct.apporteDuServeur, false);
  await client.ecrireDossier({ ...direct.dossier, nom: 'Autre appareil' }, direct.rev);
  const memeChamp = await sauvegarder({ local: { ...direct.dossier, nom: 'Gagne ici' }, derniere: direct.dossier, rev: direct.rev, ecrire: client.ecrireDossier });
  assert.equal(memeChamp.apporteDuServeur, false, 'conflit, mais ma version a gagné sur tous les champs : rien de neuf pour l\'écran');
});

test('déconnexion : brouillon et livraisons ouvertes effacés, l\'email gardé pour le préremplissage', async () => {
  const mem = new Map();
  globalThis.window = { localStorage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) } };
  const st = await src('stockage.ts');
  st.ecrireLocal(st.CLE_EMAIL, 'a@b.fr');
  st.ecrireLocal(st.cleBrouillon('A@b.fr'), '{}');
  st.noterOuverte('a@b.fr', 'video');
  assert.equal(typeof st.effacerDonneesAppareil, 'function');
  st.effacerDonneesAppareil('A@b.fr');
  assert.deepEqual([...mem.keys()], [st.CLE_EMAIL]);
  delete globalThis.window;
});
