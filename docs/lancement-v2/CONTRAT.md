# Contrat — pré-lancement V2 (fenêtre 24 h)

Branche `feat/lancement-v2`, worktree `~/Projects/mc-worktrees/site-lancement-v2`, base `a04120d`, filet de départ 85/85 (`npm test`).
Site 100 % statique + Netlify Functions (aucun build). Publication manuelle (netlify-cli), une seule fois, sur OK de Damien.

## Arbitrages (ne se renégocient pas)

| # | Sujet | Décision |
|---|---|---|
| A1 | Prix | Fenêtre : 25 €/mois (essai 7 j) · 220 €/an · 249 € à vie. Après : 30 €/mois (essai 7 j) · 275 €/an · 350 € à vie. |
| A2 | Fenêtre | 24 h qui commencent à la publication. UNE heure de fin, constante dans le code (`netlify/lib/offre-v2.js`, `FIN_FENETRE`), posée juste avant le deploy = heure de publication + 24 h. Jamais calculée par visiteur, jamais remise à zéro. |
| A3 | Droit | Pas de prix barré 30 € (jamais pratiqué). Formulation : « Dès la fin du compteur : 30 €/mois. Jusque-là : 25 €/mois, verrouillé. » Le verrouillage est vrai : un abonnement PayPal garde le prix de son plan tant qu'il court. |
| A4 | Après la fenêtre | Le serveur dit la phase (`fenetre` / `v2`). La page de lancement, /devenir-membre, /bascule, /lifetime et l'accueil affichent les prix et liens de la phase. Après la fin, aucun lien vers les anciens plans n'est rendu. Damien désactive ensuite les anciens plans dans PayPal (filet pour les liens déjà copiés). |
| A5 | Lifetime | Fenêtre : prix du palier courant (249 €). Phase v2 : 350 € quel que soit le palier, côté serveur (`lifetime-checkout` + `lifetime-tickets`). Le montant `350.00` est ajouté à `PAYPAL_MONTANTS_ACCEPTES` au deploy. /bascule envoie la Lifetime vers /lifetime en phase v2 (son lien de paiement fixe à 249 € n'est plus rendu). |
| A6 | Mensuel sans essai (/bascule) | En phase v2, /bascule utilise le plan mensuel 30 € AVEC essai (un seul plan mensuel V2). |
| A7 | Hors périmètre | /retour-au-club, /le-suivi, /methode-ikea, /prevente, /offre-flash : offres distinctes, inchangées. |
| A8 | Langues | Page de lancement FR + EN (toggle comme l'accueil). |
| A9 | Page | `/lancement` (fichier `lancement.html`). Pas de menu, pas de lien Timer/Diagnostic. Un seul objectif : clic sur un plan. Pendant la fenêtre, le CTA principal de l'accueil pointe vers /lancement. |
| A10 | Preuves | Uniquement : « 330 membres », « 52 retours membres » (témoignages réels de l'accueil). RETIRÉS (décision 25/10) : l'avant/après agrégé (n=15, médiane −1 pt, IC du delta contient 0 — voir preuve-avant-apres.json) et le « +22 % au retest », qui est un EXEMPLE illustratif sur l'accueil, pas une mesure. |
| A11 | Plans PayPal V2 | Créés le 25/10 par Damien via scripts/creer-plans-v2.mjs (clones des plans actuels, seul le prix change), ACTIVE : mensuel P-3X034647B5061360HNLPBCDY (essai 7 j puis 30 €), annuel P-7PX93930RS848432UNLPBCEA (275 €). |
| A12 | Lifetime en V2 (décision 25/10) | Nouvelle série 3 : 20 tickets à 350 € (`TIER_PRICES = [199, 249, 350]`). En phase v2, seule cette série est vendue et comptée (`total` 20) ; les séries 1–2 et leurs ventes ne bougent pas. 20 vendus → « Accès à vie complet ». |

## Forme des données (figée)

`GET /.netlify/functions/offre-v2` → `Cache-Control: no-store`
```json
{
  "phase": "fenetre" | "v2",
  "fin": "2026-10-26T15:00:00.000Z",
  "maintenant": "2026-10-25T15:00:00.000Z",
  "prix": { "mensuel": 25, "annuel": 220, "vie": 249 },
  "prix_v2": { "mensuel": 30, "annuel": 275, "vie": 350 },
  "liens": { "mensuel": "<url plan>", "annuel": "<url plan>", "vie": "/lifetime" }
}
```
- `netlify/lib/offre-v2.js` exporte `FIN_FENETRE`, `PLANS` (anciens + V2), `etatOffre(now = Date.now())` pure → l'objet ci-dessus. Seule source de vérité des prix et liens pour toutes les pages et pour `lifetime-checkout`.
- Override de test : variable d'env `OFFRE_V2_FIN` (ISO) remplace `FIN_FENETRE` si définie (sert au test de bascule local ; jamais posée en prod).
- Les plans V2 que Damien crée sont des constantes `PLANS.v2.mensuel` / `PLANS.v2.annuel` ; tant qu'elles valent `null`, `etatOffre` en phase v2 renvoie `liens.mensuel = '/devenir-membre'` … et la page affiche « bientôt » — le deploy est BLOQUÉ tant qu'elles sont `null` (test qui le vérifie).

Côté pages : un petit script partagé `assets/js/offre-v2.js` :
- `chargerOffre()` → fetch de la fonction ; repli si échec = calcul local à partir de la même `FIN` embarquée (`window.MC_OFFRE_FIN`) et des mêmes prix.
- `appliquerOffre(etat)` remplit `[data-offre-prix="mensuel|annuel|vie"]`, `[data-offre-lien=...]` (href), `[data-offre-phase="fenetre|v2"]` (montre/cache), `[data-offre-compteur]`.
- Programme un re-rendu à `fin` (bascule sans rechargement).

## Mesure

`track-site-event` : ajouter `offer_viewed`, `video_played`, `faq_opened`, et la variante `lancement`. Les événements existants `plan_clicked`, `checkout_started`, `purchase_confirmed` servent au parcours. Test qui envoie chaque nouvel événement → 200.

## Preuves attendues (porte de sortie)

1. `npm test` : 85 + nouveaux, 0 échec (chiffres cités).
2. Tests purs de `etatOffre` : avant / à la seconde / après `fin` ; mutation testée (neutraliser la comparaison → un test tombe).
3. Test de bascule Playwright : `OFFRE_V2_FIN` dans le passé et dans le futur → la page de lancement, /devenir-membre, /bascule, /lifetime, l'accueil affichent les bons prix ET les bons href ; en phase v2, aucun href ne contient un ancien plan_id ni le lien 249.
4. `docs/ecrans-v2-recrees/verifier-page.mjs` vert sur /lancement et l'accueil : ordinateur + 375 px, FR + EN.
5. Lighthouse mobile /lancement : LCP < 2,5 s, CLS = 0 ; vidéos < 3 Mo chacune.
