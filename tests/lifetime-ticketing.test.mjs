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
  inventory.tiers[1]['07'] = {
    status: 'reserved',
    token: '11111111-2222-4333-8444-555555555555',
    expires_at: '2026-09-01T08:00:00.000Z',
  };
  const normalized = normaliserInventaire(inventory, { 1: 0, 2: 0 }, Date.parse('2026-09-01T08:00:01.000Z'));
  assert.equal(etatCampagne(normalized, { 1: 0, 2: 0 }).tickets[6].status, 'available');
});

test('les 20 ventes à 199 € ouvrent un second carnet entièrement libre', () => {
  const normalized = normaliserInventaire(inventaireVide(), { 1: 20, 2: 0 });
  const state = etatCampagne(normalized, { 1: 20, 2: 0 });
  assert.equal(state.total, 40);
  assert.equal(state.sold, 20);
  assert.equal(state.remaining, 20);
  assert.equal(state.tier, 2);
  assert.equal(state.price, 249);
  assert.ok(state.tickets.every((ticket) => ticket.status === 'available'));
});

test('une capture à 249 € occupe le premier ticket du second carnet', () => {
  const normalized = normaliserInventaire(inventaireVide(), { 1: 20, 2: 1 });
  const state = etatCampagne(normalized, { 1: 20, 2: 1 });
  assert.equal(state.tier, 2);
  assert.equal(state.price, 249);
  assert.equal(state.tier_sold, 1);
  assert.equal(state.tickets[0].status, 'sold');
  assert.ok(state.tickets.slice(1).every((ticket) => ticket.status === 'available'));
});
