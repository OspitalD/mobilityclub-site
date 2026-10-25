import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { etatOffre, FIN_FENETRE, PLANS } from '../netlify/lib/offre-v2.js';
import offreHandler from '../netlify/functions/offre-v2.js';

const fin = Date.parse(FIN_FENETRE);
afterEach(() => { delete process.env.OFFRE_V2_FIN; });

test('avant la fin : phase fenetre, prix 25/220/249, liens anciens plans', () => {
  const e = etatOffre(fin - 1000);
  assert.equal(e.phase, 'fenetre');
  assert.deepEqual(e.prix, { mensuel: 25, annuel: 220, vie: 249 });
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
  assert.deepEqual(e.prix, { mensuel: 30, annuel: 275, vie: 350 });
  const rendu = JSON.stringify(e.liens);
  assert.ok(!rendu.includes(PLANS.ancien.mensuel.split('=')[1]));
  assert.ok(!rendu.includes(PLANS.ancien.annuel.split('=')[1]));
  assert.equal(e.liens.vie, '/lifetime');
});

test('plans V2 non créés : repli sur /devenir-membre, jamais un lien null', () => {
  const e = etatOffre(fin + 1);
  if (PLANS.v2.mensuel === null) assert.equal(e.liens.mensuel, '/devenir-membre');
  assert.ok(e.liens.mensuel && e.liens.annuel);
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
