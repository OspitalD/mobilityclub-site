import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  customIdLifetime,
  etatCampagne,
  inventaireVide,
  lireCustomIdLifetime,
  normaliserInventaire,
} from '../netlify/lib/lifetime-ticketing.js';

// Ces assertions décrivent la fenêtre (249 €) : on épingle la phase pour qu'elles ne dépendent pas de l'horloge.
process.env.OFFRE_V2_FIN = '2099-01-01T00:00:00.000Z';

test('custom_id PayPal transporte exactement le palier, le ticket et la réservation', () => {
  const token = '11111111-2222-4333-8444-555555555555';
  const customId = customIdLifetime({ tier: 2, ticket: 7, token });
  assert.equal(customId, 'MC-LIFE-2026-T2-07-11111111-2222-4333-8444-555555555555');
  assert.deepEqual(lireCustomIdLifetime(customId), { tier: 2, ticket: 7, token });
  assert.equal(lireCustomIdLifetime('nimporte-quoi'), null);
});

test('une réservation expirée redevient disponible', () => {
  const inventory = inventaireVide();
  inventory.tiers[2]['02'] = {
    status: 'reserved',
    token: '11111111-2222-4333-8444-555555555555',
    expires_at: '2026-09-01T08:00:00.000Z',
  };
  const normalized = normaliserInventaire(inventory, { 1: 0, 2: 0 }, Date.parse('2026-09-01T08:00:01.000Z'));
  assert.equal(etatCampagne(normalized, { 1: 0, 2: 0 }).tickets[1].status, 'available');
});

test('la série à 249 € expose quinze tickets pris selon le motif de campagne', () => {
  const normalized = normaliserInventaire(inventaireVide(), { 1: 20, 2: 0 });
  const state = etatCampagne(normalized, { 1: 20, 2: 0 });
  assert.equal(state.total, 40);
  assert.equal(state.sold, 35);
  assert.equal(state.remaining, 5);
  assert.equal(state.tier, 2);
  assert.equal(state.price, 249);
  assert.deepEqual(state.tickets.filter((ticket) => ticket.status === 'sold').map((ticket) => ticket.number), [1, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 18, 20]);
  assert.deepEqual(state.tickets.filter((ticket) => ticket.status === 'available').map((ticket) => ticket.number), [2, 3, 11, 17, 19]);
});

test('les captures PayPal dépassent le plancher déclaré sans double comptage', () => {
  const normalized = normaliserInventaire(inventaireVide(), { 1: 20, 2: 16 });
  const state = etatCampagne(normalized, { 1: 20, 2: 16 });
  assert.equal(state.tier, 2);
  assert.equal(state.price, 249);
  assert.equal(state.tier_sold, 16);
  assert.equal(state.tickets[0].status, 'sold');
  assert.equal(state.tickets[1].status, 'sold');
  assert.equal(state.tickets[2].status, 'available');
});

// ── Phase V2 : une nouvelle série de 20 tickets à 350 €, les séries de la fenêtre restent figées ──
const enPhase = (fin, fn) => {
  const garde = process.env.OFFRE_V2_FIN;
  process.env.OFFRE_V2_FIN = fin;
  try { return fn(); } finally { process.env.OFFRE_V2_FIN = garde; }
};
const PASSE = '2000-01-01T00:00:00.000Z';

test('séries : 199 € et 249 € inchangées, la série V2 coûte le prix Lifetime V2', async () => {
  const { TIER_PRICES, TIER_V2, TIERS_FENETRE } = await import('../netlify/lib/lifetime-ticketing.js');
  const { PRIX_V2 } = await import('../netlify/lib/offre-v2.js');
  assert.deepEqual(TIER_PRICES.slice(0, 2), [199, 249]);
  assert.deepEqual(TIERS_FENETRE, [1, 2]);
  assert.equal(TIER_PRICES[TIER_V2 - 1], PRIX_V2.vie);
  assert.equal(TIER_PRICES.length, 3);
});

test('phase v2 : la série affichée est la série 350 €, comptée seule (0/20), les tickets 249 € libres ne sont plus proposés', () => enPhase(PASSE, () => {
  const state = etatCampagne(normaliserInventaire(inventaireVide(), { 1: 20, 2: 0 }), { 1: 20, 2: 0 });
  assert.equal(state.tier, 3);
  assert.equal(state.price, 350);
  assert.equal(state.total, 20);
  assert.equal(state.sold, 0);
  assert.equal(state.tier_sold, 0);
  assert.equal(state.remaining, 20);
  assert.equal(state.sold_out, false);
  assert.equal(state.tickets.filter((t) => t.status === 'available').length, 20);
}));

test('phase v2 : la série 350 € ferme à 20 ventes', () => enPhase(PASSE, () => {
  const inventory = inventaireVide();
  inventory.tiers[3] = Object.fromEntries(Array.from({ length: 19 }, (_, i) => [String(i + 1).padStart(2, '0'), { status: 'sold' }]));
  let state = etatCampagne(normaliserInventaire(inventory, { 1: 20, 2: 15 }), { 1: 20, 2: 15 });
  assert.equal(state.sold_out, false);
  assert.equal(state.tier_sold, 19);
  inventory.tiers[3]['20'] = { status: 'sold' };
  state = etatCampagne(normaliserInventaire(inventory, { 1: 20, 2: 15 }), { 1: 20, 2: 15 });
  assert.equal(state.sold_out, true);
  assert.equal(state.remaining, 0);
  assert.equal(state.tier, 3);
}));

test('fenêtre : la série 350 € n’ouvre jamais, même quand la série 249 € est complète', () => {
  const state = etatCampagne(normaliserInventaire(inventaireVide(), { 1: 20, 2: 20 }), { 1: 20, 2: 20 });
  assert.equal(state.tier, 2);
  assert.equal(state.price, 249);
  assert.equal(state.total, 40);
  assert.equal(state.sold_out, true);
});
