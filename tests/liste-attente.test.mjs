import { test } from 'node:test';
import assert from 'node:assert/strict';
import { magasin } from './_kit-blobs-mock.mjs';

const { handler, STORE } = await import('../netlify/functions/liste-attente.js');

const poster = (body, opts) => handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(body) }, opts);
const sansMailerLite = { env: {}, f: async () => { throw new Error('ne doit pas être appelé'); } };

test('une inscription valide est enregistrée, email normalisé', async () => {
  const r = await poster({ email: '  Paul@Exemple.FR ', prenom: 'Paul', probleme: 'dos' }, sansMailerLite);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(JSON.parse(r.body), { ok: true, deja_inscrit: false });
  const e = magasin(STORE).get('paul@exemple.fr').v;
  assert.equal(e.probleme, 'dos');
  assert.equal(e.prenom, 'Paul');
  assert.equal(e.mailerlite, 'non_configure');
});

test('une réinscription garde la place (first_seen inchangé) et met à jour le problème', async () => {
  const avant = magasin(STORE).get('paul@exemple.fr').v.first_seen;
  const r = await poster({ email: 'paul@exemple.fr', probleme: 'hanches' }, sansMailerLite);
  assert.deepEqual(JSON.parse(r.body), { ok: true, deja_inscrit: true });
  const e = magasin(STORE).get('paul@exemple.fr').v;
  assert.equal(e.first_seen, avant);
  assert.equal(e.probleme, 'hanches');
  assert.equal(e.prenom, 'Paul');
  assert.equal(e.inscriptions, 2);
});

test('email invalide, problème inconnu, méthode GET : refusés', async () => {
  assert.equal((await poster({ email: 'pas-un-email', probleme: 'dos' }, sansMailerLite)).statusCode, 400);
  assert.equal((await poster({ email: 'a@b.fr', probleme: 'pieds' }, sansMailerLite)).statusCode, 400);
  assert.equal((await handler({ httpMethod: 'GET' })).statusCode, 405);
});

test('le champ piège répond ok sans rien enregistrer', async () => {
  const r = await poster({ email: 'robot@spam.io', probleme: 'dos', site: 'http://x' }, sansMailerLite);
  assert.equal(r.statusCode, 200);
  assert.equal(magasin(STORE).has('robot@spam.io'), false);
});

test('MailerLite configuré : abonné poussé dans le groupe avec le problème n° 1', async () => {
  let appel;
  const f = async (url, init) => { appel = { url, init }; return { ok: true }; };
  const env = { MAILERLITE_API_KEY: 'k', MAILERLITE_GROUP_LISTE_ATTENTE: '123' };
  const r = await poster({ email: 'lea@exemple.fr', prenom: 'Léa', probleme: 'epaules' }, { env, f });
  assert.equal(r.statusCode, 200);
  const corps = JSON.parse(appel.init.body);
  assert.deepEqual(corps.groups, ['123']);
  assert.equal(corps.fields.probleme_n1, 'epaules');
  assert.equal(corps.fields.name, 'Léa');
  assert.equal(magasin(STORE).get('lea@exemple.fr').v.mailerlite, 'ok');
});

test('une panne MailerLite ne fait jamais échouer l\'inscription', async () => {
  const f = async () => { throw new Error('réseau'); };
  const env = { MAILERLITE_API_KEY: 'k', MAILERLITE_GROUP_LISTE_ATTENTE: '123' };
  const r = await poster({ email: 'tom@exemple.fr', probleme: 'nuque' }, { env, f });
  assert.equal(r.statusCode, 200);
  assert.equal(magasin(STORE).get('tom@exemple.fr').v.mailerlite, 'echec');
});

test('le prénom est nettoyé (balises, longueur)', async () => {
  await poster({ email: 'x@exemple.fr', prenom: '<b>Jean</b>' + 'a'.repeat(80), probleme: 'dos' }, sansMailerLite);
  const p = magasin(STORE).get('x@exemple.fr').v.prenom;
  assert.ok(!p.includes('<'));
  assert.ok(p.length <= 40);
});
