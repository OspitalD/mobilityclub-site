// Seuls tests rouges ADMIS avant publication : ils tombent tant que Damien n'a pas
// fourni les plan_id PayPal V2. Séparés (un par plan) pour qu'on sache lesquels sont rouges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANS, planV2Manquant } from '../netlify/lib/offre-v2.js';

test('BLOQUANT DEPLOY : plans PayPal V2 manquants', () => {
  const manquants = planV2Manquant().filter((nom) => nom !== 'mensuel_fixe');
  assert.deepEqual(manquants, [], 'PLANS.v2 contient encore null : renseigner mensuel (30 €) et annuel (275 €)');
});

test('BLOQUANT DEPLOY : plan PayPal V2 mensuel_fixe (30 €/mois SANS essai, /lancement) manquant', () => {
  assert.notEqual(PLANS.v2.mensuel_fixe, null, 'PLANS.v2.mensuel_fixe vaut null : Damien doit créer le plan 30 €/mois sans essai et coller son URL');
  assert.match(PLANS.v2.mensuel_fixe, /plan_id=P-[A-Z0-9]+$/);
});
