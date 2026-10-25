import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { etatOffre, FIN_FENETRE, PLANS } from '../netlify/lib/offre-v2.js';
import offreHandler from '../netlify/functions/offre-v2.js';

const fin = Date.parse(FIN_FENETRE);
afterEach(() => { delete process.env.OFFRE_V2_FIN; });

test('avant la fin : phase fenetre, prix 25/220/249, liens anciens plans', () => {
  const e = etatOffre(fin - 1000);
  assert.equal(e.phase, 'fenetre');
  assert.deepEqual(e.prix, { mensuel: 25, annuel: 220, vie: 249, vie_4x: 62.25 });
  assert.equal(e.liens.mensuel_fixe, PLANS.ancien.mensuel_fixe);
  assert.match(e.liens.mensuel_fixe, /plan_id=P-17C64877T6348331UNLCQIVI$/);
  assert.equal(e.prix_v2.vie_4x, 87.5);
  assert.equal(e.liens.mensuel, PLANS.ancien.mensuel);
  assert.equal(e.liens.annuel, PLANS.ancien.annuel);
  assert.equal(e.fin, FIN_FENETRE);
});

test('à la seconde exacte de la fin : phase v2 (fenêtre close)', () => {
  assert.equal(etatOffre(fin - 1).phase, 'fenetre');
  assert.equal(etatOffre(fin).phase, 'v2');
});

test('après la fin : prix 30/275/350 et AUCUN ancien plan dans les liens', () => {
  const e = etatOffre(fin + 1000);
  assert.equal(e.phase, 'v2');
  assert.deepEqual(e.prix, { mensuel: 30, annuel: 275, vie: 350, vie_4x: 87.5 });
  const rendu = JSON.stringify(e.liens);
  assert.ok(!rendu.includes(PLANS.ancien.mensuel.split('=')[1]));
  assert.ok(!rendu.includes(PLANS.ancien.annuel.split('=')[1]));
  assert.equal(e.liens.vie, '/lifetime');
  assert.ok(!rendu.includes('P-17C64877T6348331UNLCQIVI'), 'mensuel fixe 25 € jamais rendu en v2');
  assert.equal(e.liens.mensuel_fixe, PLANS.v2.mensuel_fixe);
  assert.match(e.liens.mensuel_fixe, /plan_id=P-3H171898NK2522001NLPCAUI$/);
});

test('après la fin : les liens sont les plans V2 (essai 7 j / 275 €), jamais un lien vide', () => {
  const e = etatOffre(fin + 1);
  assert.equal(e.liens.mensuel, PLANS.v2.mensuel);
  assert.equal(e.liens.annuel, PLANS.v2.annuel);
  assert.match(e.liens.mensuel, /plan_id=P-3X034647B5061360HNLPBCDY$/);
  assert.match(e.liens.annuel, /plan_id=P-7PX93930RS848432UNLPBCEA$/);
});

test('la copie navigateur de la fin égale FIN_FENETRE (sinon le repli hors ligne bascule à une autre heure)', () => {
  const src = readFileSync(new URL('../assets/js/offre-v2.js', import.meta.url), 'utf8');
  assert.equal(/MC_OFFRE_FIN \|\| '([^']+)'/.exec(src)?.[1], FIN_FENETRE);
});

test('OFFRE_V2_FIN remplace la fin (passé => v2, futur => fenetre)', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  process.env.OFFRE_V2_FIN = '2026-10-25T11:00:00.000Z';
  assert.equal(etatOffre(now).phase, 'v2');
  process.env.OFFRE_V2_FIN = '2026-10-25T13:00:00.000Z';
  const e = etatOffre(now);
  assert.equal(e.phase, 'fenetre');
  assert.equal(e.fin, '2026-10-25T13:00:00.000Z');
  process.env.OFFRE_V2_FIN = 'n-importe-quoi';
  assert.equal(etatOffre(now).fin, FIN_FENETRE);
});

test('la Function renvoie réellement la phase calculée, en no-store', async () => {
  process.env.OFFRE_V2_FIN = '2000-01-01T00:00:00.000Z';
  const r = await offreHandler(new Request('https://x/.netlify/functions/offre-v2'));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const body = await r.json();
  assert.equal(body.phase, 'v2');
  assert.equal(body.prix.vie, 350);
  assert.equal((await offreHandler(new Request('https://x/', { method: 'POST' }))).status, 405);
});
