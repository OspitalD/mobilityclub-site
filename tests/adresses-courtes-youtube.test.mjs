// /avent et /bilan : adresses courtes des descriptions YouTube (décision 20/11), 302 forcé avec UTM source youtube.
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
const UTM = 'utm_source=youtube&utm_medium=video&utm_campaign=youtube-description';

for (const [court, cible] of [['/avent', '/liste-attente'], ['/bilan', 'https://diagnostic.mobilityclub.co/']]) {
  test(`${court} et ${court}/ → ${cible} en 302 forcé, avec UTM YouTube`, async () => {
    const regles = redirections(await readFile(join(ROOT, 'netlify.toml'), 'utf8'));
    for (const from of [court, `${court}/`]) {
      const r = regles.find((x) => x.from === from);
      assert.ok(r, `règle manquante pour ${from}`);
      assert.equal(r.to, `${cible}?${UTM}`);
      assert.equal(r.status, 302);
      assert.equal(r.force, true);
    }
  });
}

test('la cible de /avent existe', () => {
  assert.ok(existsSync(join(ROOT, 'liste-attente.html')));
});
