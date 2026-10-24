// Journal des bascules (Skool → app) et rapprochement email PayPal ↔ email Skool.
//
// POURQUOI. Sur /bascule, l'abonné Skool donne son email Skool AVANT de partir payer
// (store `bascule_intents`, clé = email Skool, cf. bascule-intent.js). Le paiement
// arrive ensuite avec l'email PayPal, qui peut être différent. Or le compte que le
// membre connaît dans l'app est souvent celui de son email Skool. Deux besoins :
//   1. ouvrir AUSSI l'accès sur l'email Skool quand on peut relier les deux sans
//      ambiguïté ;
//   2. prévenir Damien (Hermès, Telegram) de chaque bascule, avec l'email Skool,
//      pour qu'il coupe l'abonnement Skool à la main (Skool n'a pas d'API pour ça).
//
// RAPPROCHEMENT (du plus sûr au moins sûr) :
//   • `meme_email`  une intention existe pour l'email PayPal lui-même ;
//   • `auto`        UNE SEULE intention non consommée, même formule, de moins de
//                   FENETRE_H heures : on la relie et on ouvre aussi cet email ;
//   • `ambigu`      plusieurs candidates : on n'ouvre rien de plus, Damien tranche ;
//   • `aucun`       paiement hors /bascule (ou email Skool jamais saisi).
//
// Le journal (store `bascule_journal`, clé `<ISO>_<type>_<ref>`) est lu par Hermès via la
// function `bascule-journal` (GET, Bearer BASCULE_JOURNAL_TOKEN).

import { getStore } from '@netlify/blobs';

export const FENETRE_H = 6;
export const storeIntentions = () => getStore('bascule_intents');
export const storeJournal = () => getStore('bascule_journal');

/** Choix pur : quelle intention relier à ce paiement ? */
export const choisirIntention = (intentions, { emailPaypal, formule, now = Date.now() }) => {
  const propre = intentions.find((i) => i.email === emailPaypal);
  if (propre) return { rapprochement: 'meme_email', intention: propre, candidats: [] };
  const candidats = intentions.filter((i) => !i.consumed_by && i.plan === formule
    && now - Date.parse(i.updated_at) <= FENETRE_H * 3600e3 && now >= Date.parse(i.updated_at) - 60e3);
  if (candidats.length === 1) return { rapprochement: 'auto', intention: candidats[0], candidats: [] };
  if (candidats.length > 1) return { rapprochement: 'ambigu', intention: null, candidats: candidats.map((i) => i.email) };
  return { rapprochement: 'aucun', intention: null, candidats: [] };
};

const lireIntentions = async (S) => {
  const { blobs = [] } = await S.list();
  const toutes = await Promise.all(blobs.map(({ key }) => S.get(key, { type: 'json' }).catch(() => null)));
  return toutes.filter((i) => i && i.email);
};

/**
 * Relie le paiement à une intention /bascule, la marque consommée, et renvoie
 * l'email Skool à ouvrir en plus (ou null). Ne jette jamais : un rapprochement
 * raté ne doit pas faire échouer l'ouverture du compte payeur.
 */
export const rapprocherSkool = async ({ emailPaypal, formule, ref, now = Date.now() }) => {
  try {
    const S = storeIntentions();
    const choix = choisirIntention(await lireIntentions(S), { emailPaypal, formule, now });
    if (choix.intention) {
      await S.setJSON(choix.intention.email, { ...choix.intention, consumed_by: ref, consumed_at: new Date(now).toISOString() });
    }
    return {
      rapprochement: choix.rapprochement,
      email_skool: choix.intention?.email || null,
      candidats: choix.candidats,
    };
  } catch (err) {
    console.error('[bascule-journal] rapprochement impossible:', err?.message);
    return { rapprochement: 'erreur', email_skool: null, candidats: [] };
  }
};

/** Écrit une ligne de journal. Ne jette jamais. */
export const journaliser = async (ligne, now = Date.now()) => {
  const at = new Date(now).toISOString();
  try {
    await storeJournal().setJSON(`${at}_${ligne.type || 'evt'}_${String(ligne.ref || 'sans-ref').slice(0, 60)}`, { at, ...ligne });
  } catch (err) {
    console.error('[bascule-journal] ligne non écrite:', err?.message);
  }
};
