// Bouton « Je prends ma place » des membres : liste figée d'empreintes, idempotence, comptage dans les 100.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stores, magasin } from './_kit-blobs-mock.mjs';

process.env.RESEND_API_KEY = '';
const lib = await import('../netlify/lib/saison-edition1.js');
const { handler } = await import('../netlify/functions/saison-membre.js');
const S = () => magasin(lib.STORE);

const preparer = (emails) => {
  stores.clear();
  S().set(lib.CLE_MEMBRES_AUTORISES, { kind: 'json', v: emails.map(lib.empreinte) });
};
const appeler = (email) => handler({ httpMethod: 'POST', body: JSON.stringify({ email }) }).then((r) => ({ ...r, d: JSON.parse(r.body) }));

test('un membre réserve sa place, une seule fois, même avec majuscules et espaces', async () => {
  preparer(['valentin@exemple.fr']);
  assert.equal((await appeler('  Valentin@Exemple.fr ')).d.statut, 'reservee');
  assert.equal((await appeler('valentin@exemple.fr')).d.statut, 'deja');
  const cles = [...S().keys()].filter((k) => k.startsWith(lib.PREFIX_MEMBRE));
  assert.equal(cles.length, 1);
  assert.equal(S().get(cles[0]).v.email, 'valentin@exemple.fr');
});

test('une adresse hors liste est refusée, une adresse invalide aussi', async () => {
  preparer(['membre@exemple.fr']);
  assert.equal((await appeler('inconnu@exemple.fr')).d.statut, 'pas_membre');
  assert.equal((await appeler('pas-un-email')).statusCode, 400);
});

test('les places membres comptent dans les 100, pas dans les 30 places fondateur', async () => {
  preparer(['a@exemple.fr', 'b@exemple.fr']);
  await appeler('a@exemple.fr');
  await appeler('b@exemple.fr');
  const ventes = await lib.compterVentes(lib.store());
  const e = lib.etatSaison({ now: Date.parse('2026-11-18T10:00:00Z'), ventes, env: {} });
  assert.equal(e.places_restantes, 98);
  assert.equal(e.palier1.places_restantes, 30);
  assert.equal(e.palier, 1);
});

test('la page membre existe, appelle saison-membre, et /edition-1 y renvoie', async () => {
  const { readFile } = await import('node:fs/promises');
  const page = await readFile(new URL('../membre-edition-1.html', import.meta.url), 'utf8');
  assert.match(page, /saison-membre/);
  assert.match(page, /noindex/);
  const ed = await readFile(new URL('../edition-1.html', import.meta.url), 'utf8');
  assert.match(ed, /href="\/edition-1\/membre"/);
  const toml = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  assert.match(toml, /from = "\/edition-1\/membre"\s+to = "\/membre-edition-1"\s+status = 200/);
});
