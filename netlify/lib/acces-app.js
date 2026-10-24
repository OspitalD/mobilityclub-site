// Accès à l'app Mobility Club ouvert par un paiement PayPal.
//
// POURQUOI. Skool est archivé (22/10/2026) : le Club vit dans l'app
// (app.mobilityclub.co). Un paiement PayPal — abonnement mensuel 25 € après 7 jours
// gratuits, annuel, pass à vie — doit créer le compte membre (palier `programme`)
// sans geste de Damien, et l'abonné doit le SAVOIR : l'email de bienvenue remplace
// l'invitation que Skool envoyait.
//
// Le compte est écrit par le dashboard, pas ici : endpoint
// `paypal-provision` (repo mobility-dashboard), jeton dédié qui n'ouvre QUE cette
// porte (ADMIN_TOKEN n'est jamais confié au site).
//
// VARIABLES (Netlify → mobilityclub-site → Environment) :
//   DASHBOARD_PROVISION_TOKEN  jeton partagé (SECRET) — généré par
//                              scripts/paypal-provision-token-to-blob.sh (dashboard)
//   DASHBOARD_ORIGIN           optionnel, défaut https://app.mobilityclub.co
//   PAYPAL_PLANS_ABONNEMENT    optionnel, plan_id acceptés séparés par des virgules,
//                              défaut = les trois plans de PLANS ci-dessous

import { getStore } from '@netlify/blobs';
import { envoyerEmail } from './methode-ikea.js';

export const PLAN_MENSUEL = 'P-43F663568B911461GNLNCJBY';
export const PLAN_MENSUEL_BASCULE = 'P-17C64877T6348331UNLCQIVI';
export const PLAN_ANNUEL = 'P-4VH08043D1618690PNJJ2Z5A';
export const ESSAI_JOURS = 7;

// Ce que chaque plan promet. `mois` = durée d'une période payée, `essai` = jours
// gratuits au départ. `formule` = le nom côté page /bascule (bascule_intents).
//   • P-43F… 25 €/mois APRÈS 7 jours gratuits (/devenir-membre)
//   • P-17C… 25 €/mois SANS essai (/bascule, anciens abonnés Skool)
//   • P-4VH… 220 €/an (/bascule et /devenir-membre)
export const PLANS = Object.freeze({
  [PLAN_MENSUEL]: { formule: 'mensuel', mois: 1, essai: ESSAI_JOURS },
  [PLAN_MENSUEL_BASCULE]: { formule: 'mensuel', mois: 1, essai: 0 },
  [PLAN_ANNUEL]: { formule: 'annuel', mois: 12, essai: 0 },
});
// Plan inconnu de PLANS mais déclaré par variable : traité comme un mensuel sans essai.
export const planDe = (planId) => PLANS[planId] || { formule: 'mensuel', mois: 1, essai: 0 };

export const plansAbonnement = (env = process.env) =>
  String(env.PAYPAL_PLANS_ABONNEMENT || Object.keys(PLANS).join(',')).split(',').map((s) => s.trim()).filter(Boolean);

export const origineApp = () => (process.env.DASHBOARD_ORIGIN || 'https://app.mobilityclub.co').replace(/\/+$/, '');

export const storeAbonnements = () => getStore('paypal_abonnements');

// ── Décisions pures ───────────────────────────────────────────────────────────

const GESTES = {
  'BILLING.SUBSCRIPTION.ACTIVATED': 'activer',
  // Résilier ne coupe RIEN tout de suite : l'abonné a payé (ou a droit à son essai)
  // jusqu'à la fin de la période. La coupure est programmée, puis exécutée par
  // `paypal-coupures` (fonction planifiée Netlify — elle tourne sans GitHub Actions).
  'BILLING.SUBSCRIPTION.CANCELLED': 'programmer_coupure',
  // Fin d'abonnement ou prélèvements échoués jusqu'à suspension : plus rien n'est payé.
  'BILLING.SUBSCRIPTION.EXPIRED': 'couper',
  'BILLING.SUBSCRIPTION.SUSPENDED': 'couper',
};

/** Que faire de cet événement d'abonnement ? Renvoie une RAISON en cas de refus. */
export const deciderAbonnement = (evenement, plans = plansAbonnement()) => {
  const type = evenement?.event_type;
  const geste = GESTES[type];
  if (!geste) return { ok: false, raison: `type_ignore:${type}` };
  const r = evenement.resource || {};
  // Le même compte PayPal pourrait porter d'autres plans un jour : seul le plan du
  // Club ouvre l'app.
  if (!plans.includes(r.plan_id)) return { ok: false, raison: `plan:${r.plan_id}` };
  if (!r.id) return { ok: false, raison: 'abonnement_sans_id' };
  return { ok: true, geste, subscriptionId: r.id };
};

const ajouterMois = (ms, n = 1) => {
  const d = new Date(ms);
  const jour = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(jour, dernier));
  return d.getTime();
};
const ms = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? t : null; };

/**
 * Jusqu'à quand l'abonné résilié garde l'accès. La plus lointaine de :
 *   - la prochaine échéance annoncée par PayPal (si elle figure encore) ;
 *   - le dernier paiement + une période du plan (1 mois, ou 12 pour l'annuel) ;
 *   - le début de l'abonnement + les jours d'essai promis par le plan.
 * Jamais avant maintenant, jamais plus d'une période (+ 5 jours) devant : une date
 * aberrante ne doit pas offrir un an à un mensuel.
 */
export const finDeDroit = (resource, now = Date.now()) => {
  const plan = planDe(resource?.plan_id);
  const b = resource?.billing_info || {};
  const candidats = [
    ms(b.next_billing_time),
    ms(b.last_payment?.time) != null ? ajouterMois(ms(b.last_payment.time), plan.mois) : null,
    ms(resource?.start_time) != null && plan.essai ? ms(resource.start_time) + plan.essai * 86400e3 : null,
  ].filter((v) => v != null);
  const fin = candidats.length ? Math.max(...candidats) : now;
  const plafond = ajouterMois(now, plan.mois) + 5 * 86400e3;
  return new Date(Math.min(Math.max(fin, now), plafond)).toISOString();
};

// ── Réseau ────────────────────────────────────────────────────────────────────

/** Appelle `paypal-provision` sur le dashboard. Jette si la réponse n'est pas 200. */
export const appelerDashboard = async (action, { email, first_name = '', ref = null }) => {
  const token = process.env.DASHBOARD_PROVISION_TOKEN;
  if (!token) throw new Error('dashboard_non_configure');
  const rep = await fetch(`${origineApp()}/.netlify/functions/paypal-provision`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, email, first_name, ref }),
  });
  if (!rep.ok) throw new Error(`dashboard_${rep.status}`);
  return rep.json();
};

const echapper = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** L'email qui remplace l'invitation Skool. Jette si l'envoi échoue (⇒ 500, PayPal réessaie). */
export const emailAccesApp = async (to, prenom, { essai = false } = {}) => {
  const app = origineApp();
  const salut = prenom ? `Bienvenue ${echapper(prenom)} !` : 'Bienvenue dans le Club !';
  const envoi = await envoyerEmail({
    to,
    subject: 'Ton accès au Mobility Club est ouvert',
    devLog: { app },
    html: `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0D0F0E;color:#F5F5F3;border-radius:16px;text-align:center">
  <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#3ECFA0;margin-bottom:16px">Mobility Club</div>
  <h1 style="font-size:22px;margin:0 0 16px">${salut}</h1>
  <p style="font-size:15px;color:#8C908D;margin:0 0 24px">${essai ? 'Tes 7 jours gratuits commencent maintenant. ' : ''}Ton compte est prêt. Connecte-toi avec cet email (${echapper(to)}) : tu recevras un code, pas de mot de passe.</p>
  <a href="${app}" style="display:inline-block;background:#3ECFA0;color:#0D0F0E;font-weight:700;text-decoration:none;padding:14px 26px;border-radius:999px">Ouvrir l'app</a>
  <p style="font-size:12px;color:#8C908D;margin-top:28px">Tu n'es pas à l'origine de cet email ? Réponds-nous simplement.</p>
</div>`,
  });
  if (!envoi?.sent) throw new Error('email_acces_non_envoye');
};
