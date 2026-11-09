// Kit App Sexy — enregistrement des ventes (lien PayPal hébergé, webhook paypal-to-skool).
//
// POURQUOI ICI ET PAS DANS LE FLUX « CLUB ». Le kit se vend 199 €, le même montant
// que l'ancienne série Lifetime : sans aiguillage dédié, une vente du kit aurait
// ouvert un accès Club et compté dans le stock Lifetime. Le webhook appelle donc
// traiterVenteKit AVANT toute autre décision, et s'arrête là si c'est une vente du kit.
//
// CE QUE FAIT UNE VENTE :
//   1. l'acheteur est enregistré (store kit_app_sexy, clé = hash de l'email) avec
//      son RANG d'achat : les 15 premiers ont l'audit de 20 min, les 5 premiers le
//      bonus fondateur (page de vente : « dans l'ordre des achats ») ;
//   2. l'email de bienvenue part à l'adresse PayPal (Resend) ;
//   3. Damien reçoit un email « nouvelle vente » avec le rang.
// Idempotent : PayPal réémet ses webhooks, une capture déjà traitée n'est jamais rejouée.
// « Fait » n'est marqué qu'après l'email de bienvenue envoyé : sinon 500, PayPal réessaie.
//
// VARIABLES D'ENVIRONNEMENT :
//   KIT_PRIX        optionnel, montants qui sont des ventes du kit (défaut « 199.00,399.00,499.00 »)
//                   NE JAMAIS les ajouter à PAYPAL_MONTANTS_ACCEPTES (accès Club).
//   KIT_ALERTE      optionnel, qui reçoit l'alerte de vente (défaut founder@mobilityclub.co)
//   RESEND_API_KEY / RESEND_FROM  déjà utilisés par le site

import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { envoyerEmail, normaliserEmail } from './methode-ikea.js';

export const STORE = 'kit_app_sexy';
export const AUDITS = 15;
export const BONUS = 5;

export const store = () => getStore({ name: STORE, consistency: 'strong' });

const memeMontant = (a, b) => {
  const n = (v) => Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n(a)) && Number.isFinite(n(b)) && n(a).toFixed(2) === n(b).toFixed(2);
};

export const montantsKit = (env = process.env) =>
  String(env.KIT_PRIX || '199.00,399.00,499.00').split(',').map((s) => s.trim()).filter(Boolean);

export const estVenteKit = (montant, env = process.env) => montantsKit(env).some((m) => memeMontant(montant, m));

const hash = (email) => createHash('sha256').update(email).digest('hex').slice(0, 32);
export const lireAcheteur = (email) => store().get(`buyers/${hash(email)}`, { type: 'json' });

export const listerAcheteurs = async () => {
  const { blobs } = await store().list({ prefix: 'buyers/' });
  const r = await Promise.all(blobs.map((b) => store().get(b.key, { type: 'json' })));
  return r.filter(Boolean).sort((a, b) => a.rang - b.rang);
};

// Rang = ordre d'arrivée des ventes. Un acheteur qui rachète garde son premier rang.
const enregistrer = async (email, achat) => {
  const S = store();
  const key = `buyers/${hash(email)}`;
  const actuel = await S.get(key, { type: 'json' });
  const now = new Date().toISOString();
  let rang = actuel?.rang;
  if (!rang) {
    const { blobs } = await S.list({ prefix: 'buyers/' });
    rang = blobs.length + 1;
  }
  const record = {
    email,
    rang,
    audit: rang <= AUDITS,
    bonus: rang <= BONUS,
    created_at: actuel?.created_at || now,
    updated_at: now,
    onboarding: actuel?.onboarding || null,
    achats: [...(actuel?.achats || []).filter((a) => a.capture_id !== achat.capture_id), achat],
  };
  await S.setJSON(key, record);
  return record;
};

// ── Emails ────────────────────────────────────────────────────────────────────

const gabarit = (titre, corps) => `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;padding:36px 28px;background:#0D0F0E;color:#F5F5F3;border-radius:20px">
  <div style="font-size:13px;font-weight:700;font-style:italic;color:#3ECFA0;margin-bottom:18px">Kit App Sexy · Damien Ospital</div>
  <h1 style="font-size:26px;line-height:1.15;font-style:italic;font-weight:800;letter-spacing:-.02em;margin:0 0 18px">${titre}</h1>
  ${corps}
</div>`;

const p = (t, c = '#C9CBC8') => `<p style="font-size:15px;line-height:1.6;color:${c};margin:0 0 14px">${t}</p>`;

export const emailBienvenueKit = (to, { audit, bonus }) => envoyerEmail({
  to,
  subject: 'Ton Kit App Sexy est réservé',
  // L'email invite à répondre : sans reply_to, la réponse partirait vers noreply@.
  replyTo: process.env.KIT_ALERTE || 'founder@mobilityclub.co',
  html: gabarit('Merci. Ton kit est réservé.', `
    ${p('Voici ce qui arrive, et quand :', '#F5F5F3')}
    ${p('<b style="color:#F5F5F3">18 novembre</b> · la vidéo V1 contre V2 et la grille des émotions.')}
    ${p('<b style="color:#F5F5F3">25 novembre au plus tard</b> · le kit d\'audit pour Claude.')}
    ${audit ? p('<b style="color:#E8A020">Tu fais partie des 15 premiers</b> : ton audit de 20 min en direct sur ton app est inclus. Je te propose un créneau par email.') : ''}
    ${bonus ? p('<b style="color:#E8A020">Tu fais partie des 5 premiers</b> : je repense trois éléments de ton app, dont un en motion design.') : ''}
    <div style="border-top:1px solid #222;margin:24px 0 18px"></div>
    ${p('Pour préparer la suite, réponds à cet email avec :', '#F5F5F3')}
    ${p('1. le lien de ton app, ou le nom de ta plateforme ;<br>2. une capture de l\'écran que tes clients voient chaque matin.')}
    ${p('Si le kit ne trouve pas 5 choses à corriger dans ton app, tu es remboursé. Tu as 14 jours.', '#8C908D')}
    ${p('Damien', '#F5F5F3')}`),
  devLog: { kit: true, audit, bonus },
});

const emailAlerteVente = (record, achat) => envoyerEmail({
  to: process.env.KIT_ALERTE || 'founder@mobilityclub.co',
  subject: `Kit App Sexy · vente n° ${record.rang} · ${achat.montant} €`,
  html: gabarit(`Vente n° ${record.rang}`, `
    ${p(`<b style="color:#F5F5F3">${record.email}</b> · ${achat.montant} € · ${new Date(achat.paid_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`)}
    ${p(`Audit 20 min : ${record.audit ? 'oui' : 'non'} · Bonus fondateur : ${record.bonus ? 'oui' : 'non'}`)}
    ${p(`Capture PayPal : ${achat.capture_id}`, '#8C908D')}`),
});

// ── Webhook ───────────────────────────────────────────────────────────────────

// Renvoie null si l'événement n'est pas une vente du kit (le webhook continue alors son chemin).
export const traiterVenteKit = async (evenement, emailDuPayeur) => {
  const r = evenement?.resource || {};
  if (evenement?.event_type !== 'PAYMENT.CAPTURE.COMPLETED') return null;
  if (r.amount?.currency_code !== (process.env.PAYPAL_DEVISE || 'EUR') || !r.id) return null;
  if (!estVenteKit(r.amount?.value)) return null;

  const S = store();
  const trace = `ventes/${encodeURIComponent(r.id)}`;
  if (await S.get(trace, { type: 'json' })) return { deja: 'traite' };

  const orderId = r.supplementary_data?.related_ids?.order_id || null;
  const email = normaliserEmail(await emailDuPayeur(orderId));
  if (!email) throw new Error('email_introuvable');

  const quand = new Date(r.create_time || Date.now());
  const achat = {
    capture_id: r.id,
    order_id: orderId,
    montant: r.amount.value,
    paid_at: (Number.isNaN(quand.getTime()) ? new Date() : quand).toISOString(),
  };
  const record = await enregistrer(email, achat);
  const envoi = await emailBienvenueKit(email, record);
  if (!envoi?.sent) throw new Error('email_bienvenue_non_envoye');
  // L'alerte à Damien ne bloque jamais l'acheteur : un échec se loggue, sans 500.
  await emailAlerteVente(record, achat).catch((err) => console.error('[kit-app-sexy] alerte vente:', err?.message));
  await S.setJSON(trace, { rang: record.rang, emailed_at: new Date().toISOString() });
  return { ok: true, rang: record.rang };
};
