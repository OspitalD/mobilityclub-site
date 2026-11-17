// Checkout de la saison Édition 1 (/edition-1).
//   GET                              → état des paliers et des places (lu par la page)
//   POST {action:'create', renonciation:true} → commande PayPal au prix du palier EN COURS
//   POST {action:'capture', order_id} → capture au retour de PayPal + vente enregistrée
// L'invitation au club part du webhook paypal-to-skool (custom_id MC-SAISON-E1-…),
// jamais d'ici : un seul chemin d'accès, idempotent.
import { randomUUID } from 'node:crypto';
import { connectLambda } from '@netlify/blobs';
import {
  CUSTOM_PREFIX,
  PREFIX_COMMANDE,
  compterVentes,
  enregistrerVenteSaison,
  etatSaison,
  montantSaisonValide,
  palierDuCustomId,
  store,
} from '../lib/saison-edition1.js';

const paypalBase = () =>
  process.env.PAYPAL_ENV === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

const siteOrigin = () =>
  String(process.env.SAISON_RETURN_ORIGIN || process.env.URL || 'https://www.mobilityclub.co').replace(/\/$/, '');

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

const parseBody = (req) => {
  const raw = req.isBase64Encoded ? Buffer.from(req.body || '', 'base64').toString('utf8') : req.body || '';
  if (raw.length > 10_000) throw Object.assign(new Error('payload_too_large'), { statusCode: 413 });
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw Object.assign(new Error('invalid_json'), { statusCode: 400 });
  }
};

const etatCourant = async (S) => etatSaison({ ventes: await compterVentes(S) });

const creer = async (body, S) => {
  if (body.renonciation !== true) return json(400, { error: 'renonciation_requise' });
  const etat = await etatCourant(S);
  if (!etat.ouvert) return json(409, { error: 'ferme' });

  const token = randomUUID();
  const customId = `${CUSTOM_PREFIX}P${etat.palier}-${token}`;
  const value = etat.prix.toFixed(2);
  const libelle = `Mobility Club — Saison Édition 1 (New Year Team)${etat.palier === 1 ? ' — prix fondateur' : ''}`;
  const { response, data } = await paypalRequest('/v2/checkout/orders', {
    requestId: `saison-create-${token}`,
    body: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: `saison-e1-p${etat.palier}`,
          custom_id: customId,
          description: libelle,
          amount: { currency_code: 'EUR', value, breakdown: { item_total: { currency_code: 'EUR', value } } },
          items: [{ name: libelle, quantity: '1', category: 'DIGITAL_GOODS', unit_amount: { currency_code: 'EUR', value } }],
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
            return_url: `${siteOrigin()}/edition-1?paypal=return`,
            cancel_url: `${siteOrigin()}/edition-1?paypal=cancel`,
          },
        },
      },
    },
  });
  if (!response.ok) throw new Error(`paypal_create_${response.status}`);
  const approveUrl = data.links?.find((l) => ['payer-action', 'approve'].includes(l.rel))?.href;
  if (!data.id || !approveUrl) throw new Error('paypal_create_incomplete');

  // Trace de la commande : la capture vérifie que l'order vient bien d'ici, au bon prix,
  // et garde la preuve de la renonciation à la rétractation (L221-28).
  await S.setJSON(`${PREFIX_COMMANDE}${encodeURIComponent(data.id)}`, {
    order_id: data.id,
    custom_id: customId,
    palier: etat.palier,
    prix: value,
    renonciation_at: new Date().toISOString(),
  });
  return json(201, { ok: true, palier: etat.palier, prix: etat.prix, approve_url: approveUrl });
};

const capturer = async (body, S) => {
  const orderId = String(body.order_id || '');
  if (!/^[A-Z0-9]{8,40}$/.test(orderId)) return json(400, { error: 'invalid_order' });
  const commande = await S.get(`${PREFIX_COMMANDE}${encodeURIComponent(orderId)}`, { type: 'json' }).catch(() => null);
  if (!commande) return json(404, { error: 'commande_inconnue' });

  let result = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    requestId: `saison-capture-${orderId}`,
  });
  // 422 = déjà capturée (double clic, retour rejoué) : on relit la commande.
  if (!result.response.ok && result.response.status === 422) {
    result = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: 'GET' });
  }
  if (!result.response.ok) throw new Error(`paypal_capture_${result.response.status}`);
  const capture = result.data?.purchase_units?.[0]?.payments?.captures?.[0];
  if (result.data.status !== 'COMPLETED' || capture?.status !== 'COMPLETED') return json(402, { error: 'paiement_incomplet' });

  const palier = palierDuCustomId(capture.custom_id) || commande.palier;
  if (!montantSaisonValide(capture.amount?.value, palier)) {
    console.error('[saison-checkout] montant inattendu', capture.amount?.value, 'palier', palier);
    return json(409, { error: 'montant_inattendu' });
  }
  await enregistrerVenteSaison(
    {
      captureId: capture.id,
      orderId,
      palier,
      montant: capture.amount.value,
      email: result.data.payer?.email_address || null,
      source: 'capture_site',
    },
    S
  );
  return json(200, { ok: true, palier, prix: Number(capture.amount.value) });
};

export const handler = async (req) => {
  if (req.blobs) connectLambda(req);
  const S = store();
  try {
    if (req.httpMethod === 'GET') return json(200, await etatCourant(S));
    if (req.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) return json(503, { error: 'paypal_not_configured' });
    const body = parseBody(req);
    if (body.action === 'create') return await creer(body, S);
    if (body.action === 'capture') return await capturer(body, S);
    return json(400, { error: 'invalid_action' });
  } catch (err) {
    console.error('[saison-checkout] erreur:', err?.message);
    return json(err?.statusCode || 502, { error: 'checkout_failed' });
  }
};
