// Le bootcamp est fermé (décision 25/10) : /bootcamp ne doit plus servir d'abonnement
// (plan P-17C…) et toute URL /bootcamp* part, en permanent, vers /lancement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

// Lecture minimale des blocs [[redirects]] de netlify.toml (clé = "valeur" | booléen | nombre).
const redirections = (toml) =>
  toml.split(/^\[\[redirects\]\]\s*$/m).slice(1).map((bloc) => {
    const r = {};
    for (const ligne of bloc.split('\n')) {
      if (/^\s*\[/.test(ligne)) break;
      const m = /^\s*(\w+)\s*=\s*(.+?)\s*$/.exec(ligne.replace(/#.*$/, ''));
      if (m) r[m[1]] = /^".*"$/.test(m[2]) ? m[2].slice(1, -1) : m[2] === 'true' ? true : m[2] === 'false' ? false : Number(m[2]);
    }
    return r;
  });

test('/bootcamp et /bootcamp/* → /lancement en 302, forcé (le fichier statique ne masque pas la règle)', async () => {
  const regles = redirections(await readFile(join(ROOT, 'netlify.toml'), 'utf8'));
  for (const from of ['/bootcamp', '/bootcamp/*']) {
    const r = regles.find((x) => x.from === from);
    assert.ok(r, `règle manquante pour ${from}`);
    assert.equal(r.to, '/lancement');
    assert.equal(r.status, 302);
    assert.equal(r.force, true);
  }
});

test('le dossier bootcamp/ n’est plus publié', () => {
  assert.equal(existsSync(join(ROOT, 'bootcamp', 'index.html')), false);
});

test('aucune page publiée ne renvoie vers /bootcamp', async () => {
  const pages = (await readdir(ROOT)).filter((f) => f.endsWith('.html'));
  for (const p of pages) {
    const html = await readFile(join(ROOT, p), 'utf8');
    assert.ok(!/href=["'][^"']*\/bootcamp/i.test(html), `${p} contient un lien vers /bootcamp`);
  }
});
