// Après un paiement Édition 1 (saison) ou accès à vie : ouvrir l'accès à l'app directement,
// sans Skool (le club vit dans l'app depuis la V2 ; l'invitation Skool n'est plus configurée).
//   1. compte créé ou réactivé dans le dashboard (admin-provision-user, tier « programme ») ;
//   2. mail de bienvenue ;
//   3. trace idempotente (store acces_app, clé = id de capture) : un webhook rejoué ne renvoie rien.
// VARIABLES : DASHBOARD_ADMIN_TOKEN (SECRET, = ADMIN_TOKEN du site dashboard),
//             DASHBOARD_ORIGIN (défaut https://app.mobilityclub.co).
import { getStore } from '@netlify/blobs';
import { envoyerEmail } from './methode-ikea.js';

export const STORE_ACCES = 'acces_app';
const origineDashboard = () => String(process.env.DASHBOARD_ORIGIN || 'https://app.mobilityclub.co').replace(/\/$/, '');

export const accesConfigure = () => Boolean(process.env.DASHBOARD_ADMIN_TOKEN);

const provisionner = async (email) => {
  const rep = await fetch(`${origineDashboard()}/.netlify/functions/admin-provision-user`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.DASHBOARD_ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, tier: 'programme' }),
  });
  if (!rep.ok) throw new Error(`provision_${rep.status}`);
};

const p = (t) => `<p style="font-size:15px;line-height:1.55;margin:0 0 14px">${t}</p>`;
export const mailBienvenue = ({ email, formule }) => {
  const saison = formule === 'saison';
  return envoyerEmail({
    to: email,
    replyTo: 'damien@mobilityclub.co',
    subject: saison ? 'Bienvenue dans l\'Édition 1' : 'Bienvenue au club, à vie',
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0D0F0E">
  <h1 style="font-size:22px;margin:0 0 16px">${saison ? 'Ta place est prise.' : 'Ton accès à vie est ouvert.'}</h1>
  ${saison
    ? p('Ton accès au club est ouvert dès maintenant, offert jusqu\'au début de la saison, le 4 janvier.') + p('La saison New Year Team dure 12 semaines, du 4 janvier au 28 mars.')
    : p('Tu as accès au club et à toutes les saisons à venir.')}
  ${p('Pour entrer : va sur <a href="https://app.mobilityclub.co" style="color:#1F9E78;font-weight:700">app.mobilityclub.co</a> et connecte-toi avec cette adresse email. Tu reçois un code, c\'est tout.')}
  ${p('Une question ? Réponds simplement à ce mail.')}
  ${p('À très vite,<br>Damien')}
</div>`,
  });
};

// formule : 'saison' | 'vie'. Renvoie { deja } ; lève une erreur si l'accès n'a pas pu être ouvert
// (le webhook renvoie alors 500 et PayPal réessaie).
export const ouvrirAccesApp = async ({ captureId, email, formule, montant }) => {
  const S = getStore(STORE_ACCES);
  const cle = encodeURIComponent(captureId);
  if (await S.get(cle, { type: 'json' }).catch(() => null)) return { deja: true };
  await provisionner(email);
  const envoi = await mailBienvenue({ email, formule });
  if (!envoi?.sent && !envoi?.mock) throw new Error('mail_bienvenue_non_envoye');
  await S.setJSON(cle, { email, formule, montant: String(montant), ouvert_at: new Date().toISOString() });
  return { deja: false };
};
