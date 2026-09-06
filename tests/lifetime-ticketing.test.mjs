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

test('la série à 249 € expose dix tickets pris selon le motif de campagne', () => {
  const normalized = normaliserInventaire(inventaireVide(), { 1: 20, 2: 0 });
  const state = etatCampagne(normalized, { 1: 20, 2: 0 });
  assert.equal(state.total, 40);
  assert.equal(state.sold, 30);
  assert.equal(state.remaining, 10);
  assert.equal(state.tier, 2);
  assert.equal(state.price, 249);
  assert.deepEqual(state.tickets.filter((ticket) => ticket.status === 'sold').map((ticket) => ticket.number), [1, 5, 7, 8, 10, 13, 14, 15, 18, 20]);
  assert.deepEqual(state.tickets.filter((ticket) => ticket.status === 'available').map((ticket) => ticket.number), [2, 3, 4, 6, 9, 11, 12, 16, 17, 19]);
});

test('les captures PayPal dépassent le plancher déclaré sans double comptage', () => {
  const normalized = normaliserInventaire(inventaireVide(), { 1: 20, 2: 11 });
  const state = etatCampagne(normalized, { 1: 20, 2: 11 });
  assert.equal(state.tier, 2);
  assert.equal(state.price, 249);
  assert.equal(state.tier_sold, 11);
  assert.equal(state.tickets[0].status, 'sold');
  assert.equal(state.tickets[1].status, 'sold');
  assert.equal(state.tickets[2].status, 'available');
});
