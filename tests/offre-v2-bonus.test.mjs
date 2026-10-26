import test from 'node:test';
import assert from 'node:assert/strict';
import { etatOffre, FIN_FENETRE, FIN_BONUS, PLANS } from '../netlify/lib/offre-v2.js';

test('bonus V1 : absent pendant la fenêtre', () => {
  assert.equal(etatOffre(Date.parse(FIN_FENETRE) - 1000).bonus, null);
});

test('bonus V1 : proposé après la fin, prix et liens V1, 5 min', () => {
  const e = etatOffre(Date.parse(FIN_FENETRE) + 1000);
  assert.equal(e.phase, 'v2');
  assert.equal(e.bonus.duree_ms, 5 * 60 * 1000);
  assert.equal(e.bonus.prix.vie, 249);
  assert.equal(e.bonus.prix.mensuel, 25);
  assert.equal(e.bonus.liens.vie, PLANS.ancien.vie);
  assert.equal(e.bonus.liens.mensuel_fixe, PLANS.ancien.mensuel_fixe);
  // Les liens principaux restent ceux de la V2 : le bonus ne s'applique que sur demande.
  assert.equal(e.liens.mensuel_fixe, PLANS.v2.mensuel_fixe);
});

test('bonus V1 : plus proposé à partir de mercredi matin', () => {
  assert.equal(etatOffre(Date.parse(FIN_BONUS)).bonus, null);
});
