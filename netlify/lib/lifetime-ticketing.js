import { getStore } from '@netlify/blobs';

export const TOTAL = 20;
export const TIER_SIZE = 20;
export const RESERVATION_MS = 10 * 60 * 1000;

const INVENTORY_STORE = 'lifetime_ticket_inventory_2026';
const INVENTORY_KEY = 'inventory';
const CAPTURE_STORE = 'lifetime_pass_2026';
// Trois ventes ont été conclues avant l'ouverture de la page. Elles occupent les
// tickets 01 à 03 tant que les captures NCP ne les matérialisent pas déjà.
export const PRELAUNCH_SOLD = { 1: 3, 2: 0 };

// Le numéro de carnet reste utile pour l'inventaire, mais le tarif public est
// désormais unique : chaque nouvelle commande numérotée est créée à 249 €.
const prixDuPalier = () => 249;
const cleTicket = (ticket) => String(Number(ticket)).padStart(2, '0');

export const ticketValide = (ticket) =>
  Number.isInteger(Number(ticket)) && Number(ticket) >= 1 && Number(ticket) <= TIER_SIZE;

export const customIdLifetime = ({ tier, ticket, token }) =>
  `MC-LIFE-2026-T${Number(tier)}-${cleTicket(ticket)}-${token}`;

export const lireCustomIdLifetime = (customId) => {
  const match = /^MC-LIFE-2026-T([12])-(\d{2})-([a-f0-9-]{36})$/i.exec(String(customId || ''));
  if (!match || !ticketValide(Number(match[2]))) return null;
  return { tier: Number(match[1]), ticket: Number(match[2]), token: match[3].toLowerCase() };
};

export const inventaireVide = () => ({ version: 1, tiers: { 1: {}, 2: {} } });

const copieInventaire = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  return {
    version: 1,
    tiers: {
      1: { ...(source.tiers?.[1] || source.tiers?.['1'] || {}) },
      2: { ...(source.tiers?.[2] || source.tiers?.['2'] || {}) },
    },
  };
};

const compteStatut = (inventory, tier, status) =>
  Object.values(inventory.tiers[tier]).filter((entry) => entry?.status === status).length;

export const normaliserInventaire = (value, captures = { 1: 0, 2: 0 }, now = Date.now()) => {
  const inventory = copieInventaire(value);

  for (const tier of [1, 2]) {
    for (const [ticket, entry] of Object.entries(inventory.tiers[tier])) {
      if (!ticketValide(Number(ticket)) || !entry || typeof entry !== 'object') {
        delete inventory.tiers[tier][ticket];
        continue;
      }
      if (entry.status === 'reserved' && Date.parse(entry.expires_at || '') <= now) {
        delete inventory.tiers[tier][ticket];
      }
    }

    // Les captures signées restent la vérité comptable. Si une ancienne vente
    // NCP n'avait pas de numéro, on matérialise les premiers numéros libres.
    let missing = Math.max(0, Number(captures[tier] || 0) - compteStatut(inventory, tier, 'sold'));
    for (let ticket = 1; ticket <= TIER_SIZE && missing > 0; ticket++) {
      const key = cleTicket(ticket);
      if (!inventory.tiers[tier][key]) {
        inventory.tiers[tier][key] = { status: 'sold', source: 'paypal_capture_reconcile' };
        missing--;
      }
    }
  }

  return inventory;
};

export const etatCampagne = (inventory, captures = { 1: 0, 2: 0 }) => {
  const soldByTier = {
    1: Math.max(Number(captures[1] || 0), compteStatut(inventory, 1, 'sold')),
    2: Math.max(Number(captures[2] || 0), compteStatut(inventory, 2, 'sold')),
  };
  const sold = Math.min(TOTAL, soldByTier[1] + soldByTier[2]);
  const soldOut = sold >= TOTAL;
  const tier = 1;
  const tickets = Array.from({ length: TIER_SIZE }, (_, index) => {
    const ticket = index + 1;
    const entry = inventory.tiers[tier][cleTicket(ticket)];
    return {
      number: ticket,
      status: entry?.status === 'sold' ? 'sold' : entry?.status === 'reserved' ? 'reserved' : 'available',
      held_until: entry?.status === 'reserved' ? entry.expires_at : undefined,
    };
  });

  return {
    live: true,
    total: TOTAL,
    sold,
    remaining: Math.max(0, TOTAL - sold),
    sold_out: soldOut,
    tier,
    tier_sold: soldByTier[tier],
    price: prixDuPalier(tier),
    tickets,
  };
};

const lireCaptures = async () => {
  const store = getStore(CAPTURE_STORE);
  const { blobs = [] } = await store.list();
  const captures = await Promise.all(
    blobs.map(async (blob) => ({
      key: String(blob.key),
      data: await store.get(blob.key, { type: 'json', consistency: 'strong' }).catch(() => null),
    }))
  );
  const sansNumero = (capture) => !lireCustomIdLifetime(capture.data?.custom_id);
  const capturesNcp = captures.filter(sansNumero);
  const ventesSansNumero = capturesNcp.filter((capture) =>
    capture.key.startsWith('199/') || capture.key.startsWith('249/')
  ).length;
  return {
    // Les anciens liens NCP n'avaient aucun numéro : leurs captures doivent
    // toujours être matérialisées dans la grille. Les nouvelles commandes
    // numérotées vivent déjà dans l'inventaire atomique et ne sont pas
    // recomptées ici, même si le webhook PayPal arrive avant le retour client.
    // Depuis le passage immédiat à 249 €, le montant ne permet plus de savoir
    // à quel ticket appartient une vente NCP. L'ordre réel des ventes tranche :
    // elles remplissent les 20 numéros dans l'ordre.
    // PRELAUNCH_SOLD est un plancher, pas une vente ajoutée, afin qu'une capture
    // PayPal déjà reçue pour le ticket pré-ouverture ne soit jamais comptée deux fois.
    1: Math.max(PRELAUNCH_SOLD[1], Math.min(TIER_SIZE, ventesSansNumero)),
    2: Math.max(PRELAUNCH_SOLD[2], Math.min(TIER_SIZE, Math.max(0, ventesSansNumero - TIER_SIZE))),
  };
};

const lireInventaire = async () => {
  const store = getStore(INVENTORY_STORE);
  const snapshot = await store.getWithMetadata(INVENTORY_KEY, { type: 'json', consistency: 'strong' });
  return { store, snapshot };
};

export const lireEtatCampagne = async (now = Date.now()) => {
  const [captures, { snapshot }] = await Promise.all([lireCaptures(), lireInventaire()]);
  return etatCampagne(normaliserInventaire(snapshot?.data, captures, now), captures);
};

const muterInventaire = async (mutation, now = Date.now()) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const captures = await lireCaptures();
    const { store, snapshot } = await lireInventaire();
    const inventory = normaliserInventaire(snapshot?.data, captures, now);
    const result = mutation(inventory, captures);
    const options = snapshot?.etag ? { onlyIfMatch: snapshot.etag } : { onlyIfNew: true };
    const write = await store.setJSON(INVENTORY_KEY, inventory, options);
    if (write.modified) return result;
  }
  const error = new Error('inventory_conflict');
  error.code = 'inventory_conflict';
  throw error;
};

export const reserverTicket = async ({ ticket, token, now = Date.now() }) => {
  if (!ticketValide(ticket) || !/^[a-f0-9-]{36}$/i.test(String(token || ''))) {
    const error = new Error('invalid_ticket');
    error.code = 'invalid_ticket';
    throw error;
  }

  return muterInventaire((inventory, captures) => {
    const state = etatCampagne(inventory, captures);
    const tier = state.tier;
    const key = cleTicket(ticket);
    const activeReservations = compteStatut(inventory, tier, 'reserved');
    const capacityUsed = Math.max(Number(captures[tier] || 0), compteStatut(inventory, tier, 'sold')) + activeReservations;
    if (state.sold_out || capacityUsed >= TIER_SIZE || inventory.tiers[tier][key]) {
      const error = new Error('ticket_unavailable');
      error.code = 'ticket_unavailable';
      throw error;
    }

    const expiresAt = new Date(now + RESERVATION_MS).toISOString();
    inventory.tiers[tier][key] = {
      status: 'reserved',
      token: String(token).toLowerCase(),
      created_at: new Date(now).toISOString(),
      expires_at: expiresAt,
      price: prixDuPalier(tier),
    };
    return { tier, ticket: Number(ticket), token: String(token).toLowerCase(), price: prixDuPalier(tier), expires_at: expiresAt };
  }, now);
};

export const attacherCommande = async ({ tier, ticket, token, orderId, now = Date.now() }) =>
  muterInventaire((inventory) => {
    const key = cleTicket(ticket);
    const entry = inventory.tiers?.[tier]?.[key];
    if (entry?.status !== 'reserved' || entry.token !== String(token).toLowerCase()) {
      const error = new Error('reservation_lost');
      error.code = 'reservation_lost';
      throw error;
    }
    entry.order_id = orderId;
    return { ...entry, tier: Number(tier), ticket: Number(ticket) };
  }, now);

export const libererReservation = async ({ tier, ticket, token, now = Date.now() }) =>
  muterInventaire((inventory) => {
    const key = cleTicket(ticket);
    const entry = inventory.tiers?.[tier]?.[key];
    if (entry?.status === 'reserved' && entry.token === String(token).toLowerCase()) delete inventory.tiers[tier][key];
    return { released: true };
  }, now);

export const lireReservation = async ({ tier, ticket, token, orderId, now = Date.now() }) => {
  const captures = await lireCaptures();
  const { snapshot } = await lireInventaire();
  const inventory = normaliserInventaire(snapshot?.data, captures, now);
  const entry = inventory.tiers?.[tier]?.[cleTicket(ticket)];
  if (!entry || entry.token !== String(token).toLowerCase() || (orderId && entry.order_id !== orderId)) return null;
  return { ...entry, tier: Number(tier), ticket: Number(ticket) };
};

export const enregistrerVente = async ({ tier, ticket, token, orderId, captureId, customId, price, now = Date.now() }) => {
  const parsed = lireCustomIdLifetime(customId);
  if (!parsed || parsed.tier !== Number(tier) || parsed.ticket !== Number(ticket) || parsed.token !== String(token).toLowerCase()) {
    const error = new Error('capture_mismatch');
    error.code = 'capture_mismatch';
    throw error;
  }
  if (Number(price) !== prixDuPalier(tier)) {
    const error = new Error('capture_amount_mismatch');
    error.code = 'capture_amount_mismatch';
    throw error;
  }

  const sold = await muterInventaire((inventory) => {
    const key = cleTicket(ticket);
    const entry = inventory.tiers?.[tier]?.[key];
    if (entry?.status === 'sold' && entry.capture_id === captureId) return entry;
    if (entry?.status !== 'reserved' || entry.token !== String(token).toLowerCase() || entry.order_id !== orderId) {
      const error = new Error('reservation_lost');
      error.code = 'reservation_lost';
      throw error;
    }
    inventory.tiers[tier][key] = {
      status: 'sold',
      token: String(token).toLowerCase(),
      order_id: orderId,
      capture_id: captureId,
      paid_at: new Date(now).toISOString(),
      price: Number(price),
    };
    return inventory.tiers[tier][key];
  }, now);

  await getStore(CAPTURE_STORE).setJSON(`${Number(price)}/${encodeURIComponent(captureId)}`, {
    prix: String(Number(price)),
    capture_id: captureId,
    order_id: orderId,
    custom_id: customId,
    paid_at: sold.paid_at,
  });
  return { ...sold, tier: Number(tier), ticket: Number(ticket) };
};
