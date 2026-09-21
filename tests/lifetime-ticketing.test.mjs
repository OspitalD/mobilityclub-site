import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  customIdLifetime,
  etatCampagne,
  inventaireVide,
  lireCustomIdLifetime,
  normaliserInventaire,
} from '../netlify/lib/lifetime-ticketing.js';

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

test('la série à 249 € expose quatorze tickets pris selon le motif de campagne', () => {
  const normalized = normaliserInventaire(inventaireVide(), { 1: 20, 2: 0 });
  const state = etatCampagne(normalized, { 1: 20, 2: 0 });
  assert.equal(state.total, 40);
  assert.equal(state.sold, 34);
  assert.equal(state.remaining, 6);
  assert.equal(state.tier, 2);
  assert.equal(state.price, 249);
  assert.deepEqual(state.tickets.filter((ticket) => ticket.status === 'sold').map((ticket) => ticket.number), [1, 4, 5, 6, 7, 8, 10, 12, 13, 14, 15, 16, 18, 20]);
  assert.deepEqual(state.tickets.filter((ticket) => ticket.status === 'available').map((ticket) => ticket.number), [2, 3, 9, 11, 17, 19]);
});

test('les captures PayPal dépassent le plancher déclaré sans double comptage', () => {
  const normalized = normaliserInventaire(inventaireVide(), { 1: 20, 2: 15 });
  const state = etatCampagne(normalized, { 1: 20, 2: 15 });
  assert.equal(state.tier, 2);
  assert.equal(state.price, 249);
  assert.equal(state.tier_sold, 15);
  assert.equal(state.tickets[0].status, 'sold');
  assert.equal(state.tickets[1].status, 'sold');
  assert.equal(state.tickets[2].status, 'available');
});
