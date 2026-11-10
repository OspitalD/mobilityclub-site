// Garde-fous de la coquille compilée /kit-app-sexy/espace/. Le dépôt est PUBLIC et le site est servi
// depuis « . » : tout fichier versionné est téléchargeable par n'importe qui. Ces tests protègent donc
// trois choses : la licence 10K Design, l'absence de tout contenu payant dans le build, et le
// poids de la page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const RACINE = new URL('..', import.meta.url).pathname;
const ESPACE = join(RACINE, 'kit-app-sexy/espace');
const lire = (p) => readFileSync(join(RACINE, p), 'utf8');
const git = (...args) => execFileSync('git', args, { cwd: RACINE, encoding: 'utf8' });
const compiles = () => readdirSync(join(ESPACE, 'app')).filter((f) => /\.(js|css)$/.test(f));

test('la coquille existe et charge ses fichiers sous /kit-app-sexy/espace/app/', () => {
  assert.ok(existsSync(join(ESPACE, 'index.html')), 'kit-app-sexy/espace/index.html manquant : lancer npm run build dans kit-espace-app');
  const html = lire('kit-app-sexy/espace/index.html');
  assert.match(html, /\/kit-app-sexy\/espace\/app\/[^"']+\.js/);
  assert.match(html, /<meta name="robots" content="noindex,nofollow"/);
  assert.match(html, /<html lang="fr"/);
  assert.match(html, /id="racine"/);
  assert.ok(compiles().some((f) => f.endsWith('.js')) && compiles().some((f) => f.endsWith('.css')));
});

test('licence 10K : le dossier est ignoré par git et aucun fichier n\'est versionné', () => {
  assert.match(lire('.gitignore'), /^kit-espace-app\/src\/components\/10k\/$/m);
  assert.equal(git('ls-files', 'kit-espace-app/src/components/10k').trim(), '');
  assert.equal(git('ls-files', '--cached', '--others', '--exclude-standard', 'kit-espace-app/src/components/10k').trim(), '', 'même non suivi, il ne doit pas être ajoutable');
});

test('aucun contenu payant ni clé de stockage dans le build ni dans la coquille', () => {
  for (const f of compiles()) {
    const t = readFileSync(join(ESPACE, 'app', f), 'utf8');
    assert.doesNotMatch(t, /contenus\//, `${f} : chemin de stockage des contenus`);
    assert.doesNotMatch(t, /contenus-meta|fichiers-meta|kit_app_sexy|METHODE_IKEA|ADMIN_TOKEN/, `${f} : clé de stockage ou secret`);
    assert.doesNotMatch(t, /api\.resend\.com|Bearer /, `${f} : appel admin ou email`);
  }
  const html = lire('kit-app-sexy/espace/index.html');
  assert.doesNotMatch(html, /mux\.com|youtube\.com|youtu\.be|vimeo\.com/i, 'aucune URL de vidéo dans la coquille');
});

test('le build ne connaît des livraisons que ce que l\'API lui dit : aucune date ni titre en dur', () => {
  for (const f of compiles().filter((x) => x.endsWith('.js'))) {
    const t = readFileSync(join(ESPACE, 'app', f), 'utf8');
    for (const titre of ['La vidéo V1 contre V2', 'La grille des émotions', 'Le kit d’audit pour Claude', 'Le kit d\'audit pour Claude']) {
      assert.ok(!t.includes(titre), `${f} contient le titre « ${titre} » : il doit venir de GET moi`);
    }
    assert.doesNotMatch(t, /2026-11-(18|25)/, `${f} : date de livraison en dur`);
  }
});

test('poids : moins de 250 Ko gzip pour le JS et le CSS réunis', () => {
  const total = compiles().reduce((s, f) => s + gzipSync(readFileSync(join(ESPACE, 'app', f))).length, 0);
  assert.ok(total < 250 * 1024, `${Math.round(total / 1024)} Ko gzip`);
});

test('netlify.toml : espace hors index et page d\'entrée jamais figée en cache', () => {
  const t = lire('netlify.toml');
  assert.match(t, /for = "\/kit-app-sexy\/espace\/\*"[\s\S]{0,200}X-Robots-Tag = "noindex, nofollow, noarchive"/);
  assert.match(t, /for = "\/kit-app-sexy\/espace\/index\.html"[\s\S]{0,200}Cache-Control = "public, max-age=0, must-revalidate"/);
  assert.match(t, /for = "\/kit-app-sexy\/espace\/"[\s\S]{0,200}Cache-Control = "public, max-age=0, must-revalidate"/);
});
