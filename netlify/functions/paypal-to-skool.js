// Webhook PayPal → invitation Skool automatique.
//
// POURQUOI. L'annuel (197 €, paiement unique) se paie sur PayPal, mais l'accès
// au Club vit sur Skool. Jusqu'ici Damien envoyait l'invitation à la main après
// chaque paiement. Cette Function ferme la boucle : PayPal encaisse → Skool
// invite, sans intervention.
//
// LE DANGER, ET COMMENT ON LE TIENT. L'URL d'invitation Skool permet à qui la
// détient d'inviter n'importe qui dans le groupe payant. Trois verrous :
//   1. SIGNATURE — tout événement non signé par PayPal est rejeté. Sans ce
//      verrou, un POST anonyme suffirait à se faire inviter gratuitement.
//   2. MONTANT — on n'invite QUE sur le montant exact de l'annuel. Le même
//      compte PayPal encaisse aussi la librairie du Timer (9/14/17 €) : sans
//      ce filtre, un achat à 9 € ouvrirait un an de Club.
//   3. IDEMPOTENCE — PayPal réémet ses webhooks. Une capture déjà traitée n'est
//      jamais rejouée (store Blobs, clé = id de la capture).
// Le secret Skool ne vit QUE dans les variables d'environnement Netlify. Il ne
// doit jamais apparaître dans le repo ni dans une réponse HTTP.
//
// VARIABLES D'ENVIRONNEMENT REQUISES (Netlify → Site settings → Environment) :
//   SKOOL_INVITE_WEBHOOK   l'URL d'invitation Skool (SECRET)
//   PAYPAL_CLIENT_ID       app REST du dashboard développeur PayPal
//   PAYPAL_CLIENT_SECRET   idem (SECRET)
//   PAYPAL_WEBHOOK_ID      id du webhook créé dans cette même app
//   PAYPAL_MONTANT_ANNUEL  optionnel, défaut « 197.00 »
//   PAYPAL_MONTANTS_ACCEPTES  optionnel, liste séparée par des virgules — sert
//                          aux campagnes à tarif différent (ex. « 197.00,100.00 »
//                          pendant l'offre de retour). Prime sur la variable
//                          ci-dessus. À REMETTRE À « 197.00 » quand la campagne
//                          se termine.
//   PAYPAL_DEVISE          optionnel, défaut « EUR »
//   PAYPAL_ENV             optionnel, « sandbox » pour tester sans encaisser

import { getStore } from '@netlify/blobs';

// Les deux montants de la campagne Lifetime. Ils restent séparés de
// PAYPAL_MONTANTS_ACCEPTES : cette variable d'environnement décide si la
// campagne est ouverte, tandis que cette liste décide quelles captures doivent
// alimenter le compteur public des 40 places.
export const MONTANTS_LIFETIME = ['199.00', '249.00'];

export const estMontantLifetime = (montant) =>
  MONTANTS_LIFETIME.some((attendu) => memeMontant(montant, attendu));

const tracerVenteLifetime = async (captureId, montant, eventId) => {
  if (!estMontantLifetime(montant)) return;
  const prix = Number(String(montant).replace(',', '.')).toFixed(0);
  const key = `${prix}/${encodeURIComponent(captureId)}`;

  // La clé contient l'id de capture : réémissions PayPal et retries réécrivent
  // la même entrée, sans gonfler artificiellement le stock vendu.
  await getStore('lifetime_pass_2026').setJSON(key, {
    prix,
    capture_id: captureId,
    event_id: eventId || null,
    paid_at: new Date().toISOString(),
  });
};

const api = () =>
  process.env.PAYPAL_ENV === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

// ── Décisions pures, testables sans réseau ────────────────────────────────────

// Normalise « 197 », « 197.0 », « 197.00 » sur la même forme. Sans ça, une
// écriture différente côté PayPal ferait échouer une comparaison de chaînes et
// l'acheteur resterait sans accès, en silence.
export const memeMontant = (a, b) => {
  const n = (v) => {
    const x = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(x) ? x.toFixed(2) : null;
  };
  const [x, y] = [n(a), n(b)];
  return x !== null && x === y;
};

// Les montants qui ouvrent un accès. UN SEUL par défaut (l'annuel) : le filtre
// existe parce que le même compte PayPal encaisse aussi la librairie du Timer
// (9/14/17 €) — élargir la liste sans raison rouvrirait ce trou.
//
// Une campagne à tarif différent (ex. l'offre de retour des anciens membres,
// /retour-au-club) se déclare ici SANS toucher au code :
//   PAYPAL_MONTANTS_ACCEPTES = "197.00,100.00"
// Sans cette variable, le comportement est exactement celui d'avant : 197,00 €
// seul. Retirer un montant de la liste referme la porte immédiatement — c'est
// ce qu'il faut faire quand une campagne se termine.
export const montantsAttendus = (env = process.env) =>
  String(env.PAYPAL_MONTANTS_ACCEPTES || env.PAYPAL_MONTANT_ANNUEL || '197.00')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// Ce qu'on accepte de provisionner. Renvoie une RAISON en cas de refus : c'est
// elle qu'on retrouvera dans les logs le jour où un membre dira « j'ai payé et
// je n'ai rien reçu ».
// `attendu.montants` (liste) ou `attendu.montant` (valeur unique) : les deux
// écritures sont acceptées, la liste l'emporte.
export const decider = (evenement, attendu) => {
  const type = evenement?.event_type;
  if (type !== 'PAYMENT.CAPTURE.COMPLETED') return { ok: false, raison: `type_ignore:${type}` };

  const r = evenement.resource || {};
  const montant = r.amount?.value;
  const devise = r.amount?.currency_code;
  const acceptes = Array.isArray(attendu?.montants) ? attendu.montants : [attendu?.montant];

  if (devise !== attendu.devise) return { ok: false, raison: `devise:${devise}` };
  if (!acceptes.some((a) => memeMontant(montant, a))) return { ok: false, raison: `montant:${montant}` };
  if (!r.id) return { ok: false, raison: 'capture_sans_id' };

  return { ok: true, captureId: r.id, orderId: r.supplementary_data?.related_ids?.order_id || null };
};

// Un email malformé enverrait une invitation dans le vide. On refuse plutôt que
// de marquer l'achat « traité » avec une adresse inutilisable.
export const emailValide = (e) =>
  typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

// ── Accès réseau ──────────────────────────────────────────────────────────────

const jeton = async () => {
  const cle = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const rep = await fetch(`${api()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${cle}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!rep.ok) throw new Error(`oauth ${rep.status}`);
  return (await rep.json()).access_token;
};

// Vérification côté PayPal : c'est LUI qui tranche, on ne réimplémente aucune
// crypto. Toute réponse autre que SUCCESS ⇒ on jette l'événement.
const signatureValide = async (token, headers, evenement) => {
  const h = (nom) => headers[nom] || headers[nom.toLowerCase()] || null;
  const corps = {
    auth_algo: h('paypal-auth-algo'),
    cert_url: h('paypal-cert-url'),
    transmission_id: h('paypal-transmission-id'),
    transmission_sig: h('paypal-transmission-sig'),
    transmission_time: h('paypal-transmission-time'),
    webhook_id: process.env.PAYPAL_WEBHOOK_ID,
    webhook_event: evenement,
  };
  if (Object.values(corps).some((v) => v == null)) return false;

  const rep = await fetch(`${api()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });
  if (!rep.ok) return false;
  return (await rep.json()).verification_status === 'SUCCESS';
};

// L'événement de capture ne porte pas toujours l'email du payeur : on remonte
// alors à la commande, qui elle l'a toujours.
const emailDuPayeur = async (token, evenement, orderId) => {
  const direct = evenement.resource?.payer?.email_address;
  if (emailValide(direct)) return direct;
  if (!orderId) return null;

  const rep = await fetch(`${api()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!rep.ok) return null;
  const commande = await rep.json();
  const email = commande.payer?.email_address || commande.payment_source?.paypal?.email_address;
  return emailValide(email) ? email : null;
};

const inviterSurSkool = async (email) => {
  const base = process.env.SKOOL_INVITE_WEBHOOK;
  const url = `${base}${base.includes('?') ? '&' : '?'}email=${encodeURIComponent(email)}`;
  const rep = await fetch(url, { method: 'GET' });
  // On ne loggue jamais `url` : elle contient le secret.
  if (!rep.ok) throw new Error(`skool ${rep.status}`);
};

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (req) => {
  if (req.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const requis = ['SKOOL_INVITE_WEBHOOK', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID'];
  const manquantes = requis.filter((v) => !process.env[v]);
  if (manquantes.length) {
    // Fail closed : mal configuré = on n'invite personne. 500 ⇒ PayPal réessaie,
    // donc rien n'est perdu une fois les variables posées.
    console.error('[paypal-to-skool] variables manquantes:', manquantes.join(', '));
    return json(500, { error: 'not_configured' });
  }

  const brut = req.isBase64Encoded
    ? Buffer.from(req.body || '', 'base64').toString('utf8')
    : req.body || '';
  if (brut.length > 100_000) return json(413, { error: 'payload_too_large' });

  let evenement;
  try {
    evenement = JSON.parse(brut || '{}');
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  let token;
  try {
    token = await jeton();
  } catch (err) {
    console.error('[paypal-to-skool] oauth:', err?.message);
    return json(500, { error: 'paypal_oauth_failed' });
  }

  if (!(await signatureValide(token, req.headers || {}, evenement))) {
    // 401 et non 500 : ce n'est pas une panne, c'est un événement qu'on refuse.
    console.warn('[paypal-to-skool] signature refusée, id:', evenement?.id);
    return json(401, { error: 'signature_invalide' });
  }

  // Paiement en 4× (PayPal Pay Later) : PayPal règle le marchand en UNE fois,
  // la capture porte donc le montant total (100,00 €) et non 25,00 €. Rien de
  // spécial à prévoir ici — à confirmer sur la première vraie transaction.
  const attendu = {
    montants: montantsAttendus(),
    devise: process.env.PAYPAL_DEVISE || 'EUR',
  };
  const verdict = decider(evenement, attendu);
  if (!verdict.ok) {
    // 200 volontaire : l'événement est légitime, il ne nous concerne pas.
    // Un 500 ferait boucler PayPal sur chaque vente du Timer.
    console.log('[paypal-to-skool] ignoré —', verdict.raison);
    return json(200, { ok: true, ignore: verdict.raison });
  }

  // Le stock représente les paiements réellement capturés, pas les clics ni
  // même la réussite de l'invitation Skool. On l'écrit donc dès que PayPal a
  // signé une capture acceptée. Une panne renvoie 500 pour provoquer un retry.
  try {
    await tracerVenteLifetime(
      verdict.captureId,
      evenement.resource?.amount?.value,
      evenement.id
    );
  } catch (err) {
    console.error('[paypal-to-skool] stock lifetime non écrit:', err?.message);
    return json(500, { error: 'lifetime_stock_failed' });
  }

  const store = getStore('skool_invites');
  const dejaFait = await store.get(verdict.captureId, { type: 'json' }).catch(() => null);
  if (dejaFait) {
    console.log('[paypal-to-skool] déjà traité:', verdict.captureId);
    return json(200, { ok: true, deja_traite: true });
  }

  const email = await emailDuPayeur(token, evenement, verdict.orderId);
  if (!email) {
    // 500 ⇒ PayPal réessaie. Mieux vaut retenter que marquer « fait » sans avoir
    // invité personne : c'est exactement le cas qui produit un membre fantôme.
    console.error('[paypal-to-skool] email introuvable, capture:', verdict.captureId);
    return json(500, { error: 'email_introuvable' });
  }

  try {
    await inviterSurSkool(email);
  } catch (err) {
    console.error('[paypal-to-skool] invitation échouée:', err?.message);
    return json(500, { error: 'skool_failed' });
  }

  // On ne marque « fait » qu'APRÈS l'invitation réussie.
  await store
    .setJSON(verdict.captureId, {
      email,
      montant: evenement.resource?.amount?.value,
      devise: evenement.resource?.amount?.currency_code,
      order_id: verdict.orderId,
      event_id: evenement.id || null,
      invite_at: new Date().toISOString(),
    })
    .catch((err) => console.error('[paypal-to-skool] trace non écrite:', err?.message));

  console.log('[paypal-to-skool] invitation envoyée pour la capture', verdict.captureId);
  return json(200, { ok: true });
};
