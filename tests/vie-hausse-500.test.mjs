// Hausse de l'accès à vie annoncée par mail le 26/11/2026 : 350 € jusqu'au jeudi 23 h 59 59 (Paris),
// 500 € dès vendredi 0 h (Paris). Une seule horloge : caisse, état de la saison et état de l'offre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prixVie, etatOffre, HAUSSE_VIE } from '../netlify/lib/offre-v2.js';
import { etatCampagne, inventaireVide } from '../netlify/lib/lifetime-ticketing.js';
import { etatSaison } from '../netlify/lib/saison-edition1.js';

const avant = Date.parse('2026-11-26T22:59:59.000Z'); // jeu. 23 h 59 59 Paris
const apres = Date.parse('2026-11-26T23:00:00.000Z'); // ven. 0 h 00 Paris

test('la hausse tombe à minuit pile, heure de Paris', () => {
  assert.equal(HAUSSE_VIE, '2026-11-26T23:00:00.000Z');
  assert.equal(prixVie(avant), 350);
  assert.equal(prixVie(apres), 500);
});

test("l'état de l'offre suit la même horloge (prix et paiement en 4 fois)", () => {
  assert.equal(etatOffre(avant).prix.vie, 350);
  assert.equal(etatOffre(apres).prix.vie, 500);
  assert.equal(etatOffre(apres).prix.vie_4x, 125);
  assert.equal(etatOffre(apres).prix_v2.vie, 500);
});

test('la caisse à vie (série en vente) vend à 500 € après minuit', () => {
  assert.equal(etatCampagne(inventaireVide(), { 1: 20, 2: 20 }, avant).price, 350);
  assert.equal(etatCampagne(inventaireVide(), { 1: 20, 2: 20 }, apres).price, 500);
});

test("l'état de la saison annonce le bon prix à vie", () => {
  const env = {};
  assert.deepEqual(etatSaison({ now: avant, env }).vie, { prix: 350, quatre_fois: 87.5, lien: '/lifetime' });
  assert.deepEqual(etatSaison({ now: apres, env }).vie, { prix: 500, quatre_fois: 125, lien: '/lifetime' });
});
