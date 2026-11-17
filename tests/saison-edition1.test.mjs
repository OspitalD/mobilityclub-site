import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etatSaison, palierDuCustomId, montantSaisonValide, FIN_PALIER_1, FIN_PORTES } from '../netlify/lib/saison-edition1.js';

const at = (iso) => Date.parse(iso);
const v = (total, palier1 = total) => ({ total, palier1 });

test('17/11 : palier 1 à 97 €, 30 places fondateur, 100 places', () => {
  const e = etatSaison({ now: at('2026-11-17T10:00:00Z'), ventes: v(0), env: {} });
  assert.equal(e.ouvert, true);
  assert.equal(e.palier, 1);
  assert.equal(e.prix, 97);
  assert.equal(e.palier1.places_restantes, 30);
  assert.equal(e.places_restantes, 100);
  assert.equal(e.fin_palier, FIN_PALIER_1);
});

test('30e place fondateur vendue → palier 2 à 119 € avant la date', () => {
  const e = etatSaison({ now: at('2026-11-18T10:00:00Z'), ventes: v(30), env: {} });
  assert.equal(e.palier, 2);
  assert.equal(e.prix, 119);
  assert.equal(e.fin_palier, FIN_PORTES);
});

test('jeu. 26/11 23 h 59 Paris passé → palier 2 même avec des places fondateur', () => {
  assert.equal(etatSaison({ now: at('2026-11-26T22:59:59Z'), ventes: v(5), env: {} }).palier, 1);
  assert.equal(etatSaison({ now: at('2026-11-26T23:00:00Z'), ventes: v(5), env: {} }).palier, 2);
});

test('lun. 30/11 23 h 59 Paris passé → fermé', () => {
  assert.equal(etatSaison({ now: at('2026-11-30T22:59:59Z'), ventes: v(40, 30), env: {} }).ouvert, true);
  const e = etatSaison({ now: at('2026-11-30T23:00:00Z'), ventes: v(40, 30), env: {} });
  assert.equal(e.ouvert, false);
  assert.equal(e.prix, null);
});

test('100 places prises (site + hors site) → fermé', () => {
  const e = etatSaison({ now: at('2026-11-20T10:00:00Z'), ventes: v(90, 30), env: { SAISON_PLACES_HORS_SITE: '10' } });
  assert.equal(e.places_restantes, 0);
  assert.equal(e.ouvert, false);
});

test('custom_id et montants', () => {
  assert.equal(palierDuCustomId('MC-SAISON-E1-P1-abc'), 1);
  assert.equal(palierDuCustomId('MC-SAISON-E1-P2-abc'), 2);
  assert.equal(palierDuCustomId('MC-LIFE-2026-T3-01-x'), null);
  assert.ok(montantSaisonValide('97.00', 1));
  assert.ok(montantSaisonValide('119', 2));
  assert.ok(!montantSaisonValide('97.00', 2));
  assert.ok(!montantSaisonValide('49.00', 1));
});
