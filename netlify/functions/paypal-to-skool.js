// Webhook PayPal → compte membre dans l'app Mobility Club.
// (Le nom du fichier date de l'époque Skool : il est GARDÉ, c'est l'URL déclarée
// dans le webhook PayPal. Renommer = couper le webhook.)
//
// POURQUOI. Skool est archivé depuis le 22/10/2026 : le Club vit dans l'app. Un
// paiement PayPal ouvre donc le compte dans l'app (palier `programme`, via
// l'endpoint `paypal-provision` du dashboard) et envoie l'email d'accès, sans
// intervention de Damien. Deux portes :
//   • CAPTURE (PAYMENT.CAPTURE.COMPLETED) — annuel 197 €, pass à vie, campagnes ;
//   • ABONNEMENT (BILLING.SUBSCRIPTION.*) — plan mensuel 25 € après 7 jours
//     gratuits (P-43F663568B911461GNLNCJBY). Résiliation : coupure programmée à la
//     fin de la période payée, exécutée par `paypal-coupures` (planifiée).
//
// LE DANGER, ET COMMENT ON LE TIENT. Ce webhook crée des accès payants. Trois verrous :
//   1. SIGNATURE — tout événement non signé par PayPal est rejeté. Sans ce
//      verrou, un POST anonyme suffirait à s'ouvrir un compte gratuitement.
//   2. FILTRE — capture : on n'ouvre QUE sur les montants attendus (le même
//      compte PayPal encaisse la librairie du Timer, 9/14/17 €). Abonnement : QUE
//      sur le plan_id du Club.
//   3. IDEMPOTENCE — PayPal réémet ses webhooks. Une capture ou un événement
//      d'abonnement déjà traité n'est jamais rejoué (stores Blobs).
// Le jeton du dashboard ne vit QUE dans les variables d'environnement Netlify. Il
// ne doit jamais apparaître dans le repo ni dans une réponse HTTP.
//
// VARIABLES D'ENVIRONNEMENT REQUISES (Netlify → Site settings → Environment) :
//   DASHBOARD_PROVISION_TOKEN  jeton de `paypal-provision` (SECRET), cf. netlify/lib/acces-app.js
//   PAYPAL_CLIENT_ID       app REST du dashboard développeur PayPal
//   PAYPAL_CLIENT_SECRET   idem (SECRET)
//   PAYPAL_WEBHOOK_ID      id du webhook créé dans cette même app. Événements à
//                          cocher : PAYMENT.CAPTURE.COMPLETED,
//                          BILLING.SUBSCRIPTION.ACTIVATED / CANCELLED / EXPIRED / SUSPENDED
//   PAYPAL_PLANS_ABONNEMENT  optionnel, défaut P-43F663568B911461GNLNCJBY
//   PAYPAL_MONTANT_ANNUEL  optionnel, défaut « 197.00 »
//   PAYPAL_MONTANTS_ACCEPTES  optionnel, liste séparée par des virgules — sert
//                          aux campagnes à tarif différent (ex. « 197.00,100.00 »
//                          pendant l'offre de retour). Prime sur la variable
//                          ci-dessus. À REMETTRE À « 197.00 » quand la campagne
//                          se termine.
//   PAYPAL_DEVISE          optionnel, défaut « EUR »
//   PAYPAL_ENV             optionnel, « sandbox » pour tester sans encaisser
//   SKOOL_INVITE_WEBHOOK   N'EST PLUS LU (Skool archivé) — peut être supprimée.

import { connectLambda, getStore } from '@netlify/blobs';
import { consommerTicket } from '../lib/methode-ikea-tickets.js';
import { ajouterAcheteur, emailBienvenue, normaliserEmail, offre as offreIkea, store as storeIkea } from '../lib/methode-ikea.js';
import { TIER_PRICES } from '../lib/lifetime-ticketing.js';
import {
  appelerDashboard, deciderAbonnement, emailAccesApp, finDeDroit, storeAbonnements,
} from '../lib/acces-app.js';

// Les montants configurés pour les séries Lifetime. Ils restent séparés de
// PAYPAL_MONTANTS_ACCEPTES : cette variable d'environnement décide si la
// campagne est ouverte, tandis que cette liste décide quelles captures doivent
// alimenter le stock public des séries.
export const MONTANTS_LIFETIME = TIER_PRICES.map((price) => Number(price).toFixed(2));

export const estMontantLifetime = (montant) =>
  MONTANTS_LIFETIME.some((attendu) => memeMontant(montant, attendu));

const tracerVenteLifetime = async (captureId, montant, eventId, customId) => {
  if (!estMontantLifetime(montant)) return;
  const prix = Number(String(montant).replace(',', '.')).toFixed(0);
  const key = `${prix}/${encodeURIComponent(captureId)}`;

  // La clé contient l'id de capture : réémissions PayPal et retries réécrivent
  // la même entrée, sans gonfler artificiellement le stock vendu.
  await getStore('lifetime_pass_2026').setJSON(key, {
    prix,
    capture_id: captureId,
    event_id: eventId || null,
    custom_id: customId || null,
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
// alors à la commande, qui elle l'a toujours. Le prénom sert à l'email d'accès.
const payeurDeLaCapture = async (token, evenement, orderId) => {
  const p = evenement.resource?.payer;
  if (emailValide(p?.email_address)) return { email: p.email_address, prenom: p.name?.given_name || '' };
  if (!orderId) return null;

  const rep = await fetch(`${api()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!rep.ok) return null;
  const commande = await rep.json();
  const email = commande.payer?.email_address || commande.payment_source?.paypal?.email_address;
  if (!emailValide(email)) return null;
  const nom = commande.payer?.name || commande.payment_source?.paypal?.name;
  return { email, prenom: nom?.given_name || '' };
};

const emailDuPayeur = async (token, evenement, orderId) =>
  (await payeurDeLaCapture(token, evenement, orderId))?.email || null;

// L'événement d'abonnement porte normalement `subscriber` ; sinon on relit
// l'abonnement chez PayPal.
const abonnementComplet = async (token, resource) => {
  if (emailValide(resource?.subscriber?.email_address)) return resource;
  const rep = await fetch(`${api()}/v1/billing/subscriptions/${encodeURIComponent(resource.id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!rep.ok) throw new Error(`abonnement_${rep.status}`);
  return { ...resource, ...(await rep.json()) };
};

// ── Abonnement mensuel ───────────────────────────────────────────────────────
// Store `paypal_abonnements` :
//   abonnes/<email>        { subscription_id, statut, acces_avant, bienvenue_pour }
//   coupures/<sub_id>      { email, subscription_id, fin }   — exécutée par paypal-coupures
//   evenements/<event_id>  trace d'idempotence
// `acces_avant` : le membre avait-il DÉJÀ accès avant PayPal (ancien annuel, coaching…) ?
// Alors la fin de l'abonnement ne le coupe pas — on ne retire pas ce que PayPal n'a pas donné.

/** Coupe l'accès d'un abonné, sauf s'il s'est réabonné entre-temps ou avait accès avant. */
export const executerCoupure = async (S, { email, subscription_id }) => {
  const cleAbonne = `abonnes/${encodeURIComponent(email)}`;
  const abonne = await S.get(cleAbonne, { type: 'json' });
  let resultat;
  if (abonne && abonne.subscription_id !== subscription_id && abonne.statut === 'active') {
    resultat = { saute: 'reabonne' };
  } else if (abonne?.acces_avant) {
    resultat = { saute: 'acces_anterieur' };
  } else {
    const r = await appelerDashboard('couper', { email, ref: subscription_id });
    resultat = { coupe: !!r.coupe };
    await S.setJSON(cleAbonne, { ...(abonne || {}), subscription_id, statut: 'coupe', coupe_at: new Date().toISOString() });
  }
  await S.delete(`coupures/${encodeURIComponent(subscription_id)}`);
  return resultat;
};

export const traiterAbonnement = async (evenement, verdict, token) => {
  const S = storeAbonnements();
  const subId = verdict.subscriptionId;
  const cleEv = `evenements/${encodeURIComponent(evenement.id || `${subId}:${evenement.event_type}`)}`;
  if (await S.get(cleEv, { type: 'json' })) return { deja: true };

  const r = await abonnementComplet(token, evenement.resource);
  const email = normaliserEmail(r.subscriber?.email_address);
  if (!email) throw new Error('email_introuvable');
  const prenom = r.subscriber?.name?.given_name || '';
  const cleAbonne = `abonnes/${encodeURIComponent(email)}`;
  const abonne = await S.get(cleAbonne, { type: 'json' });
  let resultat;

  if (verdict.geste === 'activer') {
    const rep = await appelerDashboard('activer', { email, first_name: prenom, ref: subId });
    const nouveau = abonne?.bienvenue_pour !== subId;
    // L'email n'est marqué envoyé qu'une fois parti : sinon 500 et PayPal réessaie
    // (le provisionnement, lui, est idempotent).
    if (nouveau) await emailAccesApp(email, prenom, { essai: true });
    await S.setJSON(cleAbonne, {
      subscription_id: subId,
      statut: 'active',
      // Un réabonnement garde l'état d'AVANT le tout premier abonnement PayPal.
      acces_avant: abonne ? !!abonne.acces_avant : !!rep.acces_avant,
      bienvenue_pour: subId,
      maj_at: new Date().toISOString(),
    });
    // Réactivation après suspension / résiliation annulée : plus de coupure en attente.
    await S.delete(`coupures/${encodeURIComponent(subId)}`);
    resultat = { activer: true, compte_cree: !!rep.compte_cree, email_envoye: nouveau };
  } else if (verdict.geste === 'programmer_coupure') {
    const fin = finDeDroit(r);
    await S.setJSON(`coupures/${encodeURIComponent(subId)}`, {
      email, subscription_id: subId, fin, programmee_at: new Date().toISOString(),
    });
    if (abonne?.subscription_id === subId) await S.setJSON(cleAbonne, { ...abonne, statut: 'resilie', fin });
    resultat = { coupure_programmee: fin };
  } else {
    resultat = await executerCoupure(S, { email, subscription_id: subId });
  }

  await S.setJSON(cleEv, { type: evenement.event_type, subscription_id: subId, traite_at: new Date().toISOString() });
  return resultat;
};

// ── Méthode IKEA : paiement par lien PayPal hébergé ──────────────────────────
// 97 € = offre avec appels, 49 € = sans appels (montants : METHODE_IKEA_PRIX_APPELS
// / METHODE_IKEA_PRIX_SOLO). Pour chaque capture :
//   1. 97 € : un des 20 tickets du mois est consommé (id de commande, idempotent) ;
//   2. l'acheteur est enregistré : il se connecte à /methode-ikea/acces par code email ;
//   3. l'email de bienvenue part, avec le lien Calendly seulement à 97 €.
// Ces montants n'entrent JAMAIS dans PAYPAL_MONTANTS_ACCEPTES (un an de Club offert).
// Une vente passée par la page /methode-ikea/acces (commande créée par le site) est
// déjà traitée par sa capture côté serveur : on n'y touche pas.
// « Fait » n'est marqué qu'après l'email envoyé : sinon 500, et PayPal réessaie.
export const offreIkeaDuMontant = (montant) =>
  ['avec_appels', 'sans_appels'].map(offreIkea).find((o) => memeMontant(montant, o.prix)) || null;

const origineSite = () => process.env.METHODE_IKEA_ORIGIN || 'https://www.mobilityclub.co';

export const traiterVenteIkea = async (evenement, token) => {
  const r = evenement?.resource || {};
  if (evenement?.event_type !== 'PAYMENT.CAPTURE.COMPLETED') return null;
  if (r.amount?.currency_code !== (process.env.PAYPAL_DEVISE || 'EUR') || !r.id) return null;
  const o = offreIkeaDuMontant(r.amount?.value);
  if (!o) return null;

  const orderId = r.supplementary_data?.related_ids?.order_id || null;
  const S = storeIkea();
  if (orderId && (await S.get(`orders/${encodeURIComponent(orderId)}`, { type: 'json' }))) return { offre: o.id, deja: 'checkout_site' };
  const trace = `paypal_lien/${encodeURIComponent(r.id)}`;
  if (await S.get(trace, { type: 'json' })) return { offre: o.id, deja: 'traite' };

  const quand = new Date(r.create_time || Date.now());
  const date = Number.isNaN(quand.getTime()) ? new Date() : quand;
  if (o.appels) await consommerTicket(orderId || r.id, date);

  const email = normaliserEmail(await emailDuPayeur(token, evenement, orderId));
  if (!email) throw new Error('email_introuvable');
  await ajouterAcheteur(email, {
    source: 'paypal_lien',
    offre: o.id,
    purchase: { offre: o.id, order_id: orderId || r.id, capture_id: r.id, amount: r.amount.value, paid_at: date.toISOString() },
  });
  const envoi = await emailBienvenue(email, origineSite(), { appels: o.appels });
  if (!envoi?.sent) throw new Error('email_bienvenue_non_envoye');
  await S.setJSON(trace, { offre: o.id, order_id: orderId, emailed_at: new Date().toISOString() });
  return { offre: o.id, ok: true };
};

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (req) => {
  if (req.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (req.blobs) connectLambda(req);

  // DASHBOARD_PROVISION_TOKEN n'est exigé qu'au moment d'ouvrir un accès (plus bas) :
  // la Méthode IKEA n'en dépend pas et doit fonctionner même sans lui.
  const requis = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID'];
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

  try {
    const ikea = await traiterVenteIkea(evenement, token);
    if (ikea) console.log('[paypal-to-skool] Méthode IKEA', ikea.offre, ikea.deja || 'accès ouvert');
  } catch (err) {
    // 500 : PayPal réessaie ; ticket et acheteur sont idempotents, l'email n'est marqué envoyé qu'une fois parti.
    console.error('[paypal-to-skool] Méthode IKEA non traitée:', err?.message);
    return json(500, { error: 'methode_ikea_failed' });
  }

  // ── Abonnement mensuel ──
  if (String(evenement?.event_type || '').startsWith('BILLING.SUBSCRIPTION.')) {
    const v = deciderAbonnement(evenement);
    if (!v.ok) {
      console.log('[paypal-to-skool] abonnement ignoré —', v.raison);
      return json(200, { ok: true, ignore: v.raison });
    }
    if (!process.env.DASHBOARD_PROVISION_TOKEN) {
      console.error('[paypal-to-skool] variables manquantes: DASHBOARD_PROVISION_TOKEN');
      return json(500, { error: 'not_configured' });
    }
    try {
      const r = await traiterAbonnement(evenement, v, token);
      console.log('[paypal-to-skool] abonnement', v.geste, v.subscriptionId, JSON.stringify(r));
      return json(200, { ok: true, ...(r.deja ? { deja_traite: true } : {}) });
    } catch (err) {
      // 500 : PayPal réessaie. Rien n'est marqué traité avant la fin.
      console.error('[paypal-to-skool] abonnement non traité:', v.subscriptionId, err?.message);
      return json(500, { error: 'abonnement_failed' });
    }
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
  // même l'ouverture du compte. On l'écrit donc dès que PayPal a
  // signé une capture acceptée. Une panne renvoie 500 pour provoquer un retry.
  try {
    await tracerVenteLifetime(
      verdict.captureId,
      evenement.resource?.amount?.value,
      evenement.id,
      evenement.resource?.custom_id
    );
  } catch (err) {
    console.error('[paypal-to-skool] stock lifetime non écrit:', err?.message);
    return json(500, { error: 'lifetime_stock_failed' });
  }

  if (!process.env.DASHBOARD_PROVISION_TOKEN) {
    console.error('[paypal-to-skool] variables manquantes: DASHBOARD_PROVISION_TOKEN');
    return json(500, { error: 'not_configured' });
  }

  // Nom historique conservé : les captures déjà honorées du temps de Skool y sont
  // tracées, une réémission PayPal ne doit pas les rouvrir une deuxième fois.
  const store = getStore('skool_invites');
  const dejaFait = await store.get(verdict.captureId, { type: 'json' }).catch(() => null);
  if (dejaFait) {
    console.log('[paypal-to-skool] déjà traité:', verdict.captureId);
    return json(200, { ok: true, deja_traite: true });
  }

  const payeur = await payeurDeLaCapture(token, evenement, verdict.orderId);
  const email = normaliserEmail(payeur?.email);
  if (!email) {
    // 500 ⇒ PayPal réessaie. Mieux vaut retenter que marquer « fait » sans avoir
    // invité personne : c'est exactement le cas qui produit un membre fantôme.
    console.error('[paypal-to-skool] email introuvable, capture:', verdict.captureId);
    return json(500, { error: 'email_introuvable' });
  }

  try {
    await appelerDashboard('activer', { email, first_name: payeur.prenom, ref: verdict.captureId });
    await emailAccesApp(email, payeur.prenom);
  } catch (err) {
    console.error('[paypal-to-skool] ouverture du compte échouée:', err?.message);
    return json(500, { error: 'acces_failed' });
  }

  // On ne marque « fait » qu'APRÈS le compte ouvert et l'email parti.
  await store
    .setJSON(verdict.captureId, {
      email,
      montant: evenement.resource?.amount?.value,
      devise: evenement.resource?.amount?.currency_code,
      order_id: verdict.orderId,
      event_id: evenement.id || null,
      acces_app_at: new Date().toISOString(),
    })
    .catch((err) => console.error('[paypal-to-skool] trace non écrite:', err?.message));

  console.log('[paypal-to-skool] compte ouvert pour la capture', verdict.captureId);
  return json(200, { ok: true });
};
