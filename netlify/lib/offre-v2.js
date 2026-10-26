// Source de vérité unique de l'offre de lancement V2 (prix, liens, phase).
// Toutes les pages, lifetime-checkout et lifetime-tickets lisent la phase ICI :
// deux horloges ou deux tables de prix finiraient par se contredire en prod.

// UNE heure de fin pour tout le monde (jamais calculée par visiteur, jamais
// remise à zéro). Provisoire : reposée juste avant le deploy = publication + 24 h.
export const FIN_FENETRE = '2026-10-26T19:00:00.000Z';

const PAYPAL_PLAN = (id) => `https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=${id}`;

export const PLANS = {
  ancien: {
    mensuel: PAYPAL_PLAN('P-43F663568B911461GNLNCJBY'), // 25 €/mois, essai 7 j
    annuel: PAYPAL_PLAN('P-4VH08043D1618690PNJJ2Z5A'), // 220 €/an
    // Pendant la fenêtre : lien de paiement PayPal direct à 249 € (décision Damien 25/10 : /lifetime
    // affichait « complet », l'achat doit rester possible sans passer par les tickets).
    vie: 'https://www.paypal.com/ncp/payment/KT93SVXG954UE',
    mensuel_fixe: PAYPAL_PLAN('P-17C64877T6348331UNLCQIVI'), // 25 €/mois SANS essai (/lancement, C3)
  },
  // Un plan à null bloque le deploy via tests/offre-v2-deploy.test.mjs, pas via une vérification à l'exécution.
  v2: {
    mensuel: PAYPAL_PLAN('P-3X034647B5061360HNLPBCDY'), // 30 €/mois, essai 7 j
    annuel: PAYPAL_PLAN('P-7PX93930RS848432UNLPBCEA'), // 275 €/an
    vie: '/lifetime',
    mensuel_fixe: PAYPAL_PLAN('P-3H171898NK2522001NLPCAUI'), // 30 €/mois, sans essai (/lancement, C3)
  },
};

export const PRIX_FENETRE = { mensuel: 25, annuel: 220, vie: 249 };
export const PRIX_V2 = { mensuel: 30, annuel: 275, vie: 350 };

// Paiement en 4 fois PayPal de l'accès à vie, arrondi au centime (62,25 / 87,50).
const avec4x = (prix) => ({ ...prix, vie_4x: Math.round((prix.vie * 100) / 4) / 100 });

// Lu à chaque appel (pas à l'import) : le test de bascule pose l'override
// après le chargement du module.
const finEffective = () => {
  const brut = process.env.OFFRE_V2_FIN;
  return brut && Number.isFinite(Date.parse(brut)) ? new Date(brut).toISOString() : FIN_FENETRE;
};

export const planV2Manquant = () => Object.entries(PLANS.v2).filter(([, lien]) => lien === null).map(([nom]) => nom);

export const etatOffre = (now = Date.now()) => {
  const fin = finEffective();
  const maintenant = Number(now);
  // `>=` : à la seconde pile de la fin, la fenêtre est close (le compteur affiche 00:00:00).
  const phase = maintenant >= Date.parse(fin) ? 'v2' : 'fenetre';
  const plans = phase === 'v2' ? PLANS.v2 : PLANS.ancien;
  return {
    phase,
    fin,
    maintenant: new Date(maintenant).toISOString(),
    prix: avec4x(phase === 'v2' ? PRIX_V2 : PRIX_FENETRE),
    prix_v2: avec4x(PRIX_V2),
    liens: {
      // Plan V2 pas encore créé : on renvoie vers la page d'achat plutôt que vers un ancien plan.
      mensuel: plans.mensuel ?? '/devenir-membre',
      annuel: plans.annuel ?? '/devenir-membre',
      vie: plans.vie,
      mensuel_fixe: plans.mensuel_fixe ?? '/devenir-membre',
    },
  };
};
