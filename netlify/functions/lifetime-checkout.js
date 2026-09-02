import { randomUUID } from 'node:crypto';
import {
  attacherCommande,
  customIdLifetime,
  enregistrerVente,
  libererReservation,
  lireReservation,
  reserverTicket,
  ticketValide,
} from '../lib/lifetime-ticketing.js';

const paypalBase = () =>
  process.env.PAYPAL_ENV === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

const montantAccepte = (price) =>
  String(process.env.PAYPAL_MONTANTS_ACCEPTES || process.env.PAYPAL_MONTANT_ANNUEL || '197.00')
    .split(',')
    .map((value) => Number(value.trim().replace(',', '.')))
    .some((value) => Number.isFinite(value) && value === Number(price));

const accessToken = async () => {
  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) throw new Error(`paypal_oauth_${response.status}`);
  return (await response.json()).access_token;
};

const siteOrigin = () =>
  String(process.env.LIFETIME_RETURN_ORIGIN || process.env.URL || 'https://www.mobilityclub.co').replace(/\/$/, '');

const parseBody = (req) => {
  const raw = req.isBase64Encoded ? Buffer.from(req.body || '', 'base64').toString('utf8') : req.body || '';
  if (raw.length > 10_000) throw Object.assign(new Error('payload_too_large'), { statusCode: 413 });
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw Object.assign(new Error('invalid_json'), { statusCode: 400 });
  }
};

const paypalRequest = async (path, { method = 'POST', body, requestId } = {}) => {
  const token = await accessToken();
  const response = await fetch(`${paypalBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
};

const creerCommande = async (reservation) => {
  const customId = customIdLifetime(reservation);
  const query = new URLSearchParams({
    paypal: 'return',
    tier: String(reservation.tier),
    ticket: String(reservation.ticket),
    reservation: reservation.token,
  });
  const cancelQuery = new URLSearchParams(query);
  cancelQuery.set('paypal', 'cancel');
  const value = Number(reservation.price).toFixed(2);
  const { response, data } = await paypalRequest('/v2/checkout/orders', {
    requestId: `life-create-${reservation.token}`,
    body: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: `lifetime-${reservation.tier}-${String(reservation.ticket).padStart(2, '0')}`,
          custom_id: customId,
          description: `Mobility Club Lifetime Pass — Ticket ${String(reservation.ticket).padStart(2, '0')}`,
          amount: {
            currency_code: 'EUR',
            value,
            breakdown: { item_total: { currency_code: 'EUR', value } },
          },
          items: [
            {
              name: `Lifetime Pass Mobility Club — Ticket ${String(reservation.ticket).padStart(2, '0')}`,
              quantity: '1',
              category: 'DIGITAL_GOODS',
              unit_amount: { currency_code: 'EUR', value },
            },
          ],
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'Mobility Club',
            locale: 'fr-FR',
            landing_page: 'NO_PREFERENCE',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW',
            return_url: `${siteOrigin()}/lifetime?${query}`,
            cancel_url: `${siteOrigin()}/lifetime?${cancelQuery}`,
          },
        },
      },
    },
  });
  if (!response.ok) throw new Error(`paypal_create_${response.status}`);
  const approveUrl = data.links?.find((link) => ['payer-action', 'approve'].includes(link.rel))?.href;
  if (!data.id || !approveUrl) throw new Error('paypal_create_incomplete');
  return { orderId: data.id, approveUrl, customId };
};

const extraireCapture = (order) => order?.purchase_units?.[0]?.payments?.captures?.[0] || null;

const capturerCommande = async ({ orderId, reservation }) => {
  let result = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    requestId: `life-capture-${reservation.token}`,
  });
  if (!result.response.ok && result.response.status === 422) {
    result = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: 'GET' });
  }
  if (!result.response.ok) throw new Error(`paypal_capture_${result.response.status}`);
  const capture = extraireCapture(result.data);
  if (result.data.status !== 'COMPLETED' || capture?.status !== 'COMPLETED') throw new Error('paypal_capture_incomplete');
  return capture;
};

const creer = async (body) => {
  if (!ticketValide(body.ticket)) return json(400, { error: 'invalid_ticket' });
  const token = randomUUID();
  let reservation;
  try {
    reservation = await reserverTicket({ ticket: Number(body.ticket), token });
  } catch (err) {
    if (err?.code === 'ticket_unavailable') return json(409, { error: 'ticket_unavailable' });
    throw err;
  }
  if (!montantAccepte(reservation.price)) {
    await libererReservation(reservation).catch(() => {});
    return json(503, { error: 'price_not_configured', price: reservation.price });
  }

  try {
    const order = await creerCommande(reservation);
    await attacherCommande({ ...reservation, orderId: order.orderId });
    return json(201, {
      ok: true,
      tier: reservation.tier,
      ticket: reservation.ticket,
      price: reservation.price,
      expires_at: reservation.expires_at,
      approve_url: order.approveUrl,
    });
  } catch (err) {
    await libererReservation(reservation).catch(() => {});
    throw err;
  }
};

const capturer = async (body) => {
  const tier = Number(body.tier), ticket = Number(body.ticket);
  if (![1, 2].includes(tier) || !ticketValide(ticket) || !body.reservation || !body.order_id) {
    return json(400, { error: 'invalid_capture_request' });
  }
  const reservation = await lireReservation({
    tier,
    ticket,
    token: body.reservation,
    orderId: body.order_id,
  });
  if (!reservation) return json(409, { error: 'reservation_expired' });
  if (reservation.status === 'sold') return json(200, { ok: true, ticket, tier, already_captured: true });

  const capture = await capturerCommande({ orderId: body.order_id, reservation: { ...reservation, token: body.reservation } });
  await enregistrerVente({
    tier,
    ticket,
    token: body.reservation,
    orderId: body.order_id,
    captureId: capture.id,
    customId: capture.custom_id,
    price: capture.amount?.value,
  });
  return json(200, { ok: true, ticket, tier });
};

const liberer = async (body) => {
  const tier = Number(body.tier), ticket = Number(body.ticket);
  if (![1, 2].includes(tier) || !ticketValide(ticket) || !body.reservation) return json(400, { error: 'invalid_release_request' });
  await libererReservation({ tier, ticket, token: body.reservation });
  return json(200, { ok: true });
};

const handleLegacyRequest = async (req) => {
  if (req.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  const required = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'];
  if (required.some((name) => !process.env[name])) return json(503, { error: 'paypal_not_configured' });

  try {
    const body = parseBody(req);
    if (body.action === 'create') return await creer(body);
    if (body.action === 'capture') return await capturer(body);
    if (body.action === 'release') return await liberer(body);
    return json(400, { error: 'invalid_action' });
  } catch (err) {
    console.error('[lifetime-checkout] erreur:', err?.message);
    return json(err?.statusCode || 502, { error: 'checkout_failed' });
  }
};

export default async (request) => {
  const response = await handleLegacyRequest({
    httpMethod: request.method,
    headers: Object.fromEntries(request.headers),
    body: await request.text(),
    isBase64Encoded: false,
  });
  return new Response(response.body, {
    status: response.statusCode,
    headers: response.headers,
  });
};
