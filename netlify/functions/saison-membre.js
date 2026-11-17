// Bouton « Je prends ma place » des membres actuels (/edition-1/membre).
// POST { email } → { statut: 'reservee' | 'deja' | 'pas_membre' | 'ferme' }
// La place gratuite compte dans les 100 places de l'Édition 1 (pas dans les 30 places fondateur).
// Un mail « Ta place est réservée » part à l'adresse saisie : si quelqu'un tape l'email
// d'un autre membre, le vrai membre est prévenu.
import { connectLambda } from '@netlify/blobs';
import { emailPlausible, normaliserEmail, reserverPlaceMembre, store } from '../lib/saison-edition1.js';
import { envoyerEmail } from '../lib/methode-ikea.js';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

const mailConfirmation = (to) =>
  envoyerEmail({
    to,
    subject: 'Ta place est réservée',
    replyTo: 'damien@mobilityclub.co',
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0D0F0E">
  <h1 style="font-size:22px;margin:0 0 16px">Ta place est réservée</h1>
  <p style="font-size:15px;line-height:1.55">Ta place dans l'Édition 1 du Mobility Club (New Year Team) est réservée. Elle est gratuite, puisque tu es déjà membre.</p>
  <p style="font-size:15px;line-height:1.55">La saison démarre le 4 janvier et se termine le 28 mars. D'ici là, rien ne change : le club reste ouvert.</p>
  <p style="font-size:15px;line-height:1.55">À très vite,<br>Damien</p>
  <p style="font-size:12px;color:#8C908D;margin-top:28px">Tu n'as pas demandé à réserver ta place ? Réponds simplement à ce mail.</p>
</div>`,
  });

export const handler = async (req) => {
  if (req.blobs) connectLambda(req);
  if (req.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  const brut = req.isBase64Encoded ? Buffer.from(req.body || '', 'base64').toString('utf8') : req.body || '';
  if (brut.length > 2_000) return json(413, { error: 'payload_too_large' });
  let body;
  try {
    body = JSON.parse(brut || '{}');
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (!emailPlausible(body.email)) return json(400, { error: 'email_invalide' });
  const email = normaliserEmail(body.email);
  try {
    const { statut } = await reserverPlaceMembre({ email, source: 'bouton' }, store());
    if (statut === 'reservee') {
      // Le mail ne bloque jamais la réservation : la place est déjà enregistrée.
      await mailConfirmation(email).catch((err) => console.error('[saison-membre] mail non envoyé:', err?.message));
    }
    return json(200, { statut });
  } catch (err) {
    console.error('[saison-membre] erreur:', err?.message);
    return json(502, { error: 'reservation_failed' });
  }
};
