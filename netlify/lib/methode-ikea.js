// Méthode IKEA — socle commun de l'accès protégé (/methode-ikea).
//
// POURQUOI CÔTÉ SERVEUR. Le repo est PUBLIC et le site est publié depuis « . » :
// tout fichier commité est téléchargeable. Le HTML de la formation ne vit donc
// NI dans le repo NI dans le dossier publié : il est rangé dans Netlify Blobs
// (clé content/current, déposée par scripts/methode-ikea.mjs) et seule la
// Function methode-ikea le renvoie, après avoir vérifié un cookie signé.
//
// TROIS VERROUS :
//   1. COOKIE SIGNÉ (HMAC-SHA256, METHODE_IKEA_SESSION_SECRET) — impossible à
//      fabriquer sans le secret ; vérifié à chaque affichage.
//   2. ACHETEUR EN BLOBS — le cookie ne suffit pas : l'email doit encore figurer
//      dans buyers/. Supprimer un acheteur coupe l'accès immédiatement.
//   3. CAPTURE PAYPAL VÉRIFIÉE — l'accès n'est créé qu'après une capture
//      COMPLETED au montant exact, sur une commande que NOUS avons créée.
//
// VARIABLES D'ENVIRONNEMENT (Netlify → Site settings → Environment) :
//   METHODE_IKEA_SESSION_SECRET  secret HMAC des cookies (SECRET, ≥ 32 caractères)
//   METHODE_IKEA_ADMIN_TOKEN     jeton de la CLI admin (SECRET)
//   METHODE_IKEA_PRIX_APPELS     optionnel, défaut « 97.00 » (offre principale, 2 appels inclus)
//   METHODE_IKEA_PRIX_SOLO       optionnel, défaut « 49.00 » (downsell, sans appel)
//                                NE JAMAIS ajouter ces montants à PAYPAL_MONTANTS_ACCEPTES :
//                                ils ouvriraient un an de Club via le webhook paypal-to-skool.
//   METHODE_IKEA_PLACES_APPELS   optionnel, défaut « 20 » (validé par Damien) : nombre de
//                                ventes « avec_appels » par mois civil (heure de Paris). Quota
//                                atteint = seul le downsell reste en vente jusqu'au mois suivant.
//   METHODE_IKEA_CALENDLY        optionnel, lien de réservation des 2 appels (offre à 97 €)
//   METHODE_IKEA_CONTACT         optionnel, email affiché « Pas reçu de code ? »
//   METHODE_IKEA_ADMIN_ORIGINS   optionnel, origines CORS de l'API admin
//                                (défaut « https://app.mobilityclub.co »)
//   RESEND_API_KEY               envoi des codes (SECRET)
//   RESEND_FROM                  ex. « Mobility Club <noreply@mobilityclub.co> »
//                                (domaine vérifié dans Resend)
//   PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_ENV  déjà utilisés par le site

import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { consommerTicket, etatTickets, lireMois, moisCourant, placesParMois } from './methode-ikea-tickets.js';

export const STORE = 'methode_ikea';
export const COOKIE = 'mi_session';
export const SESSION_DAYS = 180;
export const OTP_TTL_SEC = 10 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS = 5;
export const OTP_WINDOW_SEC = 15 * 60;
export const CONTENT_KEY = 'content/current';

export const store = () => getStore({ name: STORE, consistency: 'strong' });

// Deux offres, même accès à la formation. Seule « avec_appels » donne droit aux
// 2 appels de 30 min (lien Calendly dans la confirmation et l'email).
const montant = (env, defaut) => {
  const n = Number(String(env || defaut).replace(',', '.'));
  return (Number.isFinite(n) && n > 0 ? n : Number(defaut)).toFixed(2);
};

export const OFFRES = ['avec_appels', 'sans_appels'];

export const offre = (id) => {
  if (id === 'avec_appels') return { id, prix: montant(process.env.METHODE_IKEA_PRIX_APPELS, '97.00'), barre: '200', appels: true, libelle: 'Méthode IKEA + 2 appels avec Damien' };
  if (id === 'sans_appels') return { id, prix: montant(process.env.METHODE_IKEA_PRIX_SOLO, '49.00'), barre: '100', appels: false, libelle: 'Méthode IKEA' };
  return null;
};

export const affiche = (prix) => (prix.endsWith('.00') ? prix.slice(0, -3) : prix.replace('.', ','));
export const quart = (prix) => (Math.round(Number(prix) * 25) / 100).toFixed(2).replace('.', ',');

// ── Rareté honnête : places avec appels par mois ─────────────────────────────
// Compteur réel : clé quota/AAAA-MM = ids des commandes « avec_appels » capturées
// ce mois-ci. Idempotent (une capture rejouée ne compte qu'une fois). Les accès
// ajoutés à la main ne comptent pas : seules les ventes consomment des places.
// Une seule implémentation du quota : netlify/lib/methode-ikea-tickets.js (lue aussi
// par la page de vente et alimentée par le webhook PayPal des liens hébergés).
export { placesParMois, moisCourant };
export const placesRestantes = async (date = new Date()) => (etatTickets(await lireMois(moisCourant(date)), moisCourant(date))).restantes;
const consommerPlace = (orderId, date = new Date()) => consommerTicket(orderId, date);

export const ABONNEMENT = 'https://www.mobilityclub.co/devenir-membre';

export const calendly = () => process.env.METHODE_IKEA_CALENDLY || 'https://calendly.com/damienospitaltraining/bilan-gratuit-de-30min-avec-damien';
export const contact = () => process.env.METHODE_IKEA_CONTACT || 'damien@mobilityclub.co';

// ── Emails ────────────────────────────────────────────────────────────────────

export const normaliserEmail = (value) => {
  const email = String(value ?? '').trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};

export const hashEmail = (email) => createHash('sha256').update(email).digest('hex').slice(0, 32);
const buyerKey = (email) => `buyers/${hashEmail(email)}`;

export const lireAcheteur = async (email) => store().get(buyerKey(email), { type: 'json' });

export const ajouterAcheteur = async (email, infos = {}) => {
  const key = buyerKey(email);
  const actuel = await store().get(key, { type: 'json' });
  const now = new Date().toISOString();
  const record = {
    email,
    created_at: actuel?.created_at || now,
    updated_at: now,
    source: actuel?.source || infos.source || 'manuel',
    // Une fois « avec_appels », toujours « avec_appels » (on ne retire pas les appels).
    offre: actuel?.offre === 'avec_appels' || infos.offre === 'avec_appels' ? 'avec_appels' : 'sans_appels',
    note: infos.note ?? actuel?.note ?? null,
    // Dédoublonné par commande : une capture rejouée n'ajoute pas un 2e achat.
    purchases: [
      ...(actuel?.purchases || []).filter((p) => p.order_id !== infos.purchase?.order_id),
      ...(infos.purchase ? [infos.purchase] : []),
    ],
  };
  await store().setJSON(key, record);
  return { record, created: !actuel };
};

export const supprimerAcheteur = async (email) => {
  const existe = await lireAcheteur(email);
  if (existe) await store().delete(buyerKey(email));
  return Boolean(existe);
};

export const listerAcheteurs = async () => {
  const { blobs } = await store().list({ prefix: 'buyers/' });
  const records = await Promise.all(blobs.map((b) => store().get(b.key, { type: 'json' })));
  return records.filter(Boolean)
    .map((r) => ({ source: 'manuel', offre: 'sans_appels', note: null, purchases: [], ...r }))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
};

// ── Session (cookie signé) ────────────────────────────────────────────────────

const secret = () => {
  const s = process.env.METHODE_IKEA_SESSION_SECRET || '';
  return s.length >= 32 ? s : null;
};

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const signer = (data, key) => createHmac('sha256', key).update(data).digest();

export const creerJeton = (email, nowSec = Math.floor(Date.now() / 1000)) => {
  const key = secret();
  if (!key) throw Object.assign(new Error('session_secret_missing'), { statusCode: 503 });
  const payload = b64url(JSON.stringify({ e: email, exp: nowSec + SESSION_DAYS * 86400 }));
  return `${payload}.${b64url(signer(payload, key))}`;
};

export const lireJeton = (jeton, nowSec = Math.floor(Date.now() / 1000)) => {
  const key = secret();
  if (!key || typeof jeton !== 'string') return null;
  const [payload, sig] = jeton.split('.');
  if (!payload || !sig) return null;
  const attendu = signer(payload, key);
  const recu = Buffer.from(sig, 'base64url');
  if (recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.exp !== 'number' || data.exp < nowSec) return null;
    return normaliserEmail(data.e);
  } catch {
    return null;
  }
};

export const lireCookie = (req, name = COOKIE) => {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
};

const estLocal = (req) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(req.url);

export const cookieSession = (req, jeton) =>
  [`${COOKIE}=${jeton}`, 'Path=/', `Max-Age=${SESSION_DAYS * 86400}`, 'HttpOnly', 'SameSite=Lax', ...(estLocal(req) ? [] : ['Secure'])].join('; ');

export const cookieEfface = (req) =>
  [`${COOKIE}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax', ...(estLocal(req) ? [] : ['Secure'])].join('; ');

// Session valide = cookie signé non expiré ET acheteur toujours présent en Blobs.
export const sessionValide = async (req) => {
  const email = lireJeton(lireCookie(req));
  if (!email) return null;
  const acheteur = await lireAcheteur(email);
  return acheteur ? email : null;
};

// ── Codes à 6 chiffres ────────────────────────────────────────────────────────

const otpKey = (email) => `otp/${hashEmail(email)}`;
const hashCode = (email, code) => createHmac('sha256', secret() || 'dev').update(`${email}:${code}`).digest('hex');

// Retourne le code à envoyer, ou null si le plafond d'envois est atteint.
export const nouveauCode = async (email, nowSec = Math.floor(Date.now() / 1000)) => {
  const key = otpKey(email);
  const actuel = await store().get(key, { type: 'json' });
  const fenetre = actuel && actuel.window_reset > nowSec
    ? { sends: actuel.sends || 0, window_reset: actuel.window_reset }
    : { sends: 0, window_reset: nowSec + OTP_WINDOW_SEC };
  if (fenetre.sends >= OTP_MAX_SENDS) return null;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await store().setJSON(key, {
    code_hash: hashCode(email, code),
    expires_at: nowSec + OTP_TTL_SEC,
    attempts: 0,
    sends: fenetre.sends + 1,
    window_reset: fenetre.window_reset,
  });
  return code;
};

// → 'ok' | 'invalid' | 'expired' | 'too_many_attempts'
export const verifierCode = async (email, code, nowSec = Math.floor(Date.now() / 1000)) => {
  const key = otpKey(email);
  const rec = await store().get(key, { type: 'json' });
  if (!rec || !rec.code_hash) return 'invalid';
  if (rec.expires_at < nowSec) {
    await store().setJSON(key, { ...rec, code_hash: null });
    return 'expired';
  }
  const attendu = Buffer.from(rec.code_hash, 'hex');
  const recu = Buffer.from(hashCode(email, String(code)), 'hex');
  if (!timingSafeEqual(attendu, recu)) {
    const attempts = (rec.attempts || 0) + 1;
    // Au 5e échec le code est brûlé : il faut en redemander un.
    await store().setJSON(key, { ...rec, attempts, code_hash: attempts >= OTP_MAX_ATTEMPTS ? null : rec.code_hash });
    return attempts >= OTP_MAX_ATTEMPTS ? 'too_many_attempts' : 'invalid';
  }
  // Usage unique ; on garde le compteur d'envois pour le plafond.
  await store().setJSON(key, { ...rec, code_hash: null });
  return 'ok';
};

// ── Emails (Resend) ───────────────────────────────────────────────────────────

const gabaritEmail = (titre, corps) => `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0D0F0E;color:#F5F5F3;border-radius:16px;text-align:center">
  <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#3ECFA0;margin-bottom:16px">Méthode IKEA · Mobility Club</div>
  <h1 style="font-size:22px;margin:0 0 16px">${titre}</h1>
  ${corps}
  <p style="font-size:12px;color:#8C908D;margin-top:28px">Tu n'es pas à l'origine de cet email ? Ignore-le simplement.</p>
</div>`;

export const envoyerEmail = async ({ to, subject, html, devLog }) => {
  const key = process.env.RESEND_API_KEY || '';
  if (!key) {
    // Jamais de code dans les logs de prod : seulement sous `netlify dev`.
    if (process.env.NETLIFY_DEV === 'true') console.log('[methode-ikea] (mock email)', { to, subject, ...devLog });
    else console.error('[methode-ikea] RESEND_API_KEY manquante — email non envoyé');
    return { mock: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'Mobility Club <noreply@mobilityclub.co>',
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`resend_${res.status}`);
  return { sent: true };
};

export const emailCode = (to, code) => {
  // Sans espace : le code doit se copier-coller d'un bloc (retour Damien, 18/10/2026).
  const lisible = code;
  return envoyerEmail({
    to,
    subject: `Ton code Méthode IKEA : ${lisible}`,
    devLog: { code },
    html: gabaritEmail('Ton code d\'accès', `
      <p style="font-size:15px;color:#8C908D;margin:0 0 20px">Saisis ce code sur la page de la formation. Il expire dans 10 minutes.</p>
      <div style="font-family:'JetBrains Mono',Menlo,monospace;font-size:34px;letter-spacing:.2em;color:#3ECFA0;background:#111412;border-radius:12px;padding:18px 0">${lisible}</div>`),
  });
};

export const emailBienvenue = (to, origin, { appels } = {}) => envoyerEmail({
  to,
  subject: 'Ton accès à la Méthode IKEA',
  devLog: { calendly: Boolean(appels) },
  html: gabaritEmail('Ton accès est ouvert', `
    <p style="font-size:15px;color:#8C908D;margin:0 0 24px">Merci pour ton achat. Tu retrouves la formation à tout moment ici, en te connectant avec cet email (${to}).</p>
    <a href="${origin}/methode-ikea/acces?connexion" style="display:inline-block;background:#3ECFA0;color:#0D0F0E;font-weight:700;text-decoration:none;padding:14px 26px;border-radius:999px">Ouvrir la Méthode IKEA</a>
    ${appels ? `<p style="font-size:15px;color:#F5F5F3;margin:28px 0 12px">Tes 2 appels de 30 min avec moi sont inclus. Réserve le premier quand tu veux :</p>
    <a href="${calendly()}" style="color:#3ECFA0;font-weight:700">Réserver mon appel avec Damien</a>` : ''}
    <p style="font-size:14px;color:#8C908D;margin:32px 0 6px;border-top:1px solid #222;padding-top:20px">Un jour, tu ne voudras plus monter ta routine toi-même ? Le Mobility Club te prescrit ta séance chaque jour.</p>
    <a href="${ABONNEMENT}" style="color:#F5F5F3;font-size:14px">Découvrir l'abonnement Mobility Club</a>`),
});

// ── PayPal (commande unique, capture vérifiée côté serveur) ───────────────────

const paypalBase = () =>
  process.env.PAYPAL_ENV === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

const paypalToken = async () => {
  const id = process.env.PAYPAL_CLIENT_ID, sec = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !sec) throw Object.assign(new Error('paypal_not_configured'), { statusCode: 503 });
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${sec}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`paypal_oauth_${res.status}`);
  return (await res.json()).access_token;
};

const paypal = async (path, { method = 'POST', body, requestId } = {}) => {
  const token = await paypalToken();
  const res = await fetch(`${paypalBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { res, data: await res.json().catch(() => ({})) };
};

const orderKey = (orderId) => `orders/${encodeURIComponent(orderId)}`;

export const creerCommande = async ({ email, origin, offre: o }) => {
  const value = o.prix;
  const customId = `methode-ikea:${randomUUID()}`;
  const { res, data } = await paypal('/v2/checkout/orders', {
    requestId: customId,
    body: {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: 'methode-ikea',
        custom_id: customId,
        description: `${o.libelle} — accès à vie`,
        amount: { currency_code: 'EUR', value, breakdown: { item_total: { currency_code: 'EUR', value } } },
        items: [{ name: o.libelle, quantity: '1', category: 'DIGITAL_GOODS', unit_amount: { currency_code: 'EUR', value } }],
      }],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'Mobility Club',
            locale: 'fr-FR',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW',
            return_url: `${origin}/methode-ikea/acces?paypal=return`,
            cancel_url: `${origin}/methode-ikea/acces?paypal=cancel&offre=${o.id}`,
          },
        },
      },
    },
  });
  if (!res.ok) throw new Error(`paypal_create_${res.status}`);
  const approveUrl = data.links?.find((l) => ['payer-action', 'approve'].includes(l.rel))?.href;
  if (!data.id || !approveUrl) throw new Error('paypal_create_incomplete');
  await store().setJSON(orderKey(data.id), {
    email, offre: o.id, custom_id: customId, amount: value, status: 'created', created_at: new Date().toISOString(),
  });
  return { orderId: data.id, approveUrl };
};

// → { status: 'captured', email, capture } | { status: 'already_captured', email } | { error }
export const capturerCommande = async (orderId) => {
  const commande = await store().get(orderKey(orderId), { type: 'json' });
  if (!commande) return { error: 'unknown_order' };
  if (commande.status === 'captured') return { status: 'already_captured', email: commande.email, offre: commande.offre };

  let { res, data } = await paypal(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    requestId: `mi-capture-${orderId}`,
  });
  // 422 = déjà capturée (double clic, rechargement) : on relit la commande.
  if (!res.ok && res.status === 422) ({ res, data } = await paypal(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: 'GET' }));
  if (!res.ok) return { error: `paypal_capture_${res.status}` };

  const unit = data.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  const montantOk = capture?.amount?.currency_code === 'EUR' && Number(capture?.amount?.value) === Number(commande.amount);
  if (data.status !== 'COMPLETED' || capture?.status !== 'COMPLETED') return { error: 'capture_not_completed' };
  if (!montantOk) return { error: 'amount_mismatch' };
  if ((capture.custom_id || unit?.custom_id) !== commande.custom_id) return { error: 'custom_id_mismatch' };

  await ajouterAcheteur(commande.email, {
    source: 'paypal',
    offre: commande.offre,
    purchase: {
      offre: commande.offre,
      order_id: orderId,
      capture_id: capture.id,
      amount: capture.amount.value,
      payer_email: data.payer?.email_address || null,
      paid_at: new Date().toISOString(),
    },
  });
  if (commande.offre === 'avec_appels') await consommerPlace(orderId);
  await store().setJSON(orderKey(orderId), { ...commande, status: 'captured', capture_id: capture.id, captured_at: new Date().toISOString() });
  return { status: 'captured', email: commande.email, offre: commande.offre, capture };
};
