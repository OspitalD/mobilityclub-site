// Seul test rouge ADMIS avant publication : il tombe tant que Damien n'a pas
// fourni les plan_id PayPal V2. Séparé pour qu'on sache que lui seul est rouge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planV2Manquant } from '../netlify/lib/offre-v2.js';

test('BLOQUANT DEPLOY : plans PayPal V2 manquants', () => {
  assert.deepEqual(planV2Manquant(), [], 'PLANS.v2 contient encore null : renseigner mensuel (30 €) et annuel (275 €)');
});
