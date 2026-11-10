// /kit est l'adresse courte du Kit App Sexy (décision 10/11) : /kit et /kit/ → /kit-app-sexy/ en 302 forcé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
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

test('/kit et /kit/ → /kit-app-sexy/ en 302, forcé', async () => {
  const regles = redirections(await readFile(join(ROOT, 'netlify.toml'), 'utf8'));
  for (const from of ['/kit', '/kit/']) {
    const r = regles.find((x) => x.from === from);
    assert.ok(r, `règle manquante pour ${from}`);
    assert.equal(r.to, '/kit-app-sexy/');
    assert.equal(r.status, 302);
    assert.equal(r.force, true);
  }
});

test('la cible de /kit existe', () => {
  assert.ok(existsSync(join(ROOT, 'kit-app-sexy', 'index.html')));
});
