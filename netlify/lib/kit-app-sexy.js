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
import { LIVRAISONS, calculerEtat, dateLisible } from './kit-livraisons.js';

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

// Rang null (accès manuel) en dernier ; à rang égal, le plus ancien d'abord.
export const listerAcheteurs = async () => {
  const { blobs } = await store().list({ prefix: 'buyers/' });
  const r = await Promise.all(blobs.map((b) => store().get(b.key, { type: 'json' })));
  return r.filter(Boolean).sort((a, b) =>
    (a.rang ?? Infinity) - (b.rang ?? Infinity) || String(a.created_at).localeCompare(String(b.created_at)));
};

// Rang = ordre d'arrivée des ventes. On ne compte plus les fiches (blobs.length + 1) : une
// suppression ou un accès manuel décalait la suite, et deux ventes simultanées lisaient le même
// total. On part de « plus grand rang + 1 » et on RÉSERVE la place de façon atomique (onlyIfNew) :
// celui qui perd la course passe au rang suivant. Compatible avec les données déjà en prod.
const ESSAIS_RANG = 50;
export const attribuerRang = async (email) => {
  const S = store();
  const fiches = await listerAcheteurs();
  let n = 1 + fiches.reduce((max, f) => (Number.isFinite(f.rang) && f.rang > max ? f.rang : max), 0);
  for (let i = 0; i < ESSAIS_RANG; i++, n++) {
    const r = await S.setJSON(`rangs/${n}`, { email, at: new Date().toISOString() }, { onlyIfNew: true });
    // undefined = succès : les doublures de test d'avant la réservation ne renvoient rien.
    if (r?.modified !== false) return n;
    // Plantage entre la réservation et l'écriture de la fiche : le rejeu retrouve SA place,
    // sinon il laisserait un trou dans la suite et décalerait les promesses audit et bonus.
    const deja = await S.get(`rangs/${n}`, { type: 'json' });
    if (deja?.email === email) return n;
  }
  throw new Error('rang_indisponible');
};

// Un acheteur qui rachète garde son premier rang ; une fiche manuelle (rang null) qui achète en reçoit un.
const enregistrer = async (email, achat) => {
  const S = store();
  const key = `buyers/${hash(email)}`;
  const actuel = await S.get(key, { type: 'json' });
  const now = new Date().toISOString();
  const rang = actuel?.rang || await attribuerRang(email);
  const rouvert = Boolean(actuel?.coupe_at);
  const record = {
    ...actuel,
    email,
    rang,
    audit: rang <= AUDITS,
    bonus: rang <= BONUS,
    source: actuel?.source || 'paypal',
    // Une nouvelle capture COMPLETED rouvre l'accès : l'acheteur a payé de nouveau.
    coupe_at: null,
    coupe_raison: null,
    created_at: actuel?.created_at || now,
    updated_at: now,
    onboarding: actuel?.onboarding || null,
    achats: [...(actuel?.achats || []).filter((a) => a.capture_id !== achat.capture_id), achat],
  };
  await S.setJSON(key, record);
  return { record, rouvert };
};

// Livraisons déjà ouvertes : l'email de bienvenue d'un acheteur tardif dit « déjà disponible ».
export const livraisonsOuvertes = async (maintenant = new Date()) => {
  const metas = await Promise.all(LIVRAISONS.map((l) => store().get(`contenus-meta/${l.slug}`, { type: 'json' })));
  return LIVRAISONS.filter((l, i) => calculerEtat(l, metas[i], maintenant) === 'disponible').map((l) => l.slug);
};

// ── Emails ────────────────────────────────────────────────────────────────────

export const gabarit = (titre, corps) => `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;padding:36px 28px;background:#0D0F0E;color:#F5F5F3;border-radius:20px">
  <div style="font-size:13px;font-weight:700;font-style:italic;color:#3ECFA0;margin-bottom:18px">Kit App Sexy · Damien Ospital</div>
  <h1 style="font-size:26px;line-height:1.15;font-style:italic;font-weight:800;letter-spacing:-.02em;margin:0 0 18px">${titre}</h1>
  ${corps}
</div>`;

export const p = (t, c = '#C9CBC8') => `<p style="font-size:15px;line-height:1.6;color:${c};margin:0 0 14px">${t}</p>`;

export const espaceUrl = () => `${process.env.URL || 'https://www.mobilityclub.co'}/kit-app-sexy/espace/`;

export const boutonEspace = () => `<a href="${espaceUrl()}" style="display:inline-block;background:#3ECFA0;color:#0D0F0E;font-weight:700;text-decoration:none;padding:14px 26px;border-radius:999px;margin:6px 0 18px">Ouvrir mon espace</a>`;

// Le texte de garantie suit les CGV (articles 5 et 6) : ne pas le durcir ici sans toucher aux CGV.
export const emailBienvenueKit = (to, { audit, bonus }, ouvertes = []) => {
  const quand = (slugs, texte) => (slugs.every((s) => ouvertes.includes(s))
    ? `<b style="color:#F5F5F3">${texte}</b> · déjà disponible dans ton espace.`
    : null);
  const l = (slug) => LIVRAISONS.find((x) => x.slug === slug);
  const lignes = [
    quand(['video', 'grille'], 'La vidéo V1 contre V2 et la grille des émotions')
      || `<b style="color:#F5F5F3">${dateLisible(l('video').date)}</b> · la vidéo V1 contre V2 et la grille des émotions.`,
    quand(['audit'], "Le kit d'audit pour Claude")
      || `<b style="color:#F5F5F3">${dateLisible(l('audit').date)} au plus tard</b> · le kit d'audit pour Claude.`,
  ];
  return envoyerEmail({
    to,
    subject: 'Ton Kit App Sexy est réservé',
    // L'email invite à écrire en cas de souci : sans reply_to, la réponse partirait vers noreply@.
    replyTo: process.env.KIT_ALERTE || 'founder@mobilityclub.co',
    html: gabarit('Merci. Ton kit est réservé.', `
    ${p('Ton espace est ouvert. Tout arrive là, et je te préviens par email à chaque livraison :', '#F5F5F3')}
    ${boutonEspace()}
    ${p(`Connecte-toi avec cet email (${to}). Tu reçois un code à 6 chiffres, sans mot de passe.`, '#8C908D')}
    <div style="border-top:1px solid #222;margin:18px 0"></div>
    ${lignes.map((x) => p(x)).join('')}
    ${audit ? p('<b style="color:#E8A020">Tu fais partie des 15 premiers</b> : ton audit de 20 min en direct sur ton app est inclus. Je te propose un créneau par email.') : ''}
    ${bonus ? p('<b style="color:#E8A020">Tu fais partie des 5 premiers</b> : dépose tes captures dans ton espace, je te renvoie 3 éléments repensés sous 7 jours, dont un en motion design.') : ''}
    ${p('Dans ton espace, tu remplis ton dossier de marque (couleurs, voix, inspirations) et tu déposes les captures de ton app.')}
    ${p("Si le kit ne trouve pas 5 choses à corriger dans ton app, tu es remboursé. Écris-moi dans les 14 jours qui suivent l'arrivée du kit d'audit.", '#8C908D')}
    ${p('Damien', '#F5F5F3')}`),
    devLog: { kit: true, audit, bonus, espace_url: espaceUrl() },
  });
};

const emailAlerteVente = (record, achat, rouvert = false) => envoyerEmail({
  to: process.env.KIT_ALERTE || 'founder@mobilityclub.co',
  subject: `Kit App Sexy · vente n° ${record.rang} · ${achat.montant} €${rouvert ? ' · accès rouvert' : ''}`,
  html: gabarit(`Vente n° ${record.rang}`, `
    ${p(`<b style="color:#F5F5F3">${record.email}</b> · ${achat.montant} € · ${new Date(achat.paid_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`)}
    ${p(`Audit 20 min : ${record.audit ? 'oui' : 'non'} · Bonus fondateur : ${record.bonus ? 'oui' : 'non'}`)}
    ${rouvert ? p('<b style="color:#E8A020">Accès rouvert</b> : cet acheteur avait été coupé, il a repayé.') : ''}
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
  const { record, rouvert } = await enregistrer(email, achat);
  const envoi = await emailBienvenueKit(email, record, await livraisonsOuvertes());
  if (!envoi?.sent) throw new Error('email_bienvenue_non_envoye');
  // L'alerte à Damien ne bloque jamais l'acheteur : un échec se loggue, sans 500.
  await emailAlerteVente(record, achat, rouvert).catch((err) => console.error('[kit-app-sexy] alerte vente:', err?.message));
  await S.setJSON(trace, { rang: record.rang, emailed_at: new Date().toISOString() });
  return { ok: true, rang: record.rang };
};
