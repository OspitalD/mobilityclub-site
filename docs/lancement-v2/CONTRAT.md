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

---

## Refonte « fracture V1 → V2 » (décisions de Damien, 25/10 après-midi) — prime sur ce qui précède pour le message, la vidéo et la page

| # | Sujet | Décision |
|---|---|---|
| B1 | Le pivot | V1 = la mobilité **en plus** (une app de plus, une tâche de plus, elle passe à la trappe). V2 = la mobilité **au cœur** : une seule app pour tout ce qui touche au mouvement. Tu importes ton programme de salle et de course, tu suis tes progrès, la mobilité (méthode Mobility Club) s'y insère et s'y adapte. L'ennemi nommé : le multi-app (on jongle, on n'en garde qu'une ou deux, rien ne se parle). |
| B2 | Phrase V2 | « La mobilité au cœur de ton entraînement. » — titre de la page et fin de la vidéo. EN : « Mobility at the heart of your training. » |
| B3 | Périmètre honnête | Le club couvre le **mouvement** : programme salle (import), programme de course (import), montres (WHOOP connecté ; Garmin et Polar : « bientôt », jamais présentés comme disponibles), suivi des progrès sur ton sport, bilan articulaire, coach vocal, correction vidéo par un humain. Il ne remplace PAS une app de nutrition ni de respiration : on ne les montre jamais comme remplacées. |
| B4 | Vidéos | DEUX vidéos séparées. (a) Motion design (ce chantier) en tête de page. (b) Face cam brute de Damien, filmée par lui plus tard (contient l'aveu « moi le premier, je n'utilisais pas l'app du club ») — l'aveu n'est PAS écrit sur la page. Aucun emplacement vide pour (b) : on l'ajoutera quand elle existera. |
| B5 | Motion design | Construit sur les blueprints HyperFrames (`~/.claude/skills/hyperframes-animation/blueprints/`) : chaos multi-app (`spatial-pan-stations`, stations qui finissent en nœud) → fracture typographique V1/V2 (`kinetic-type-beats`) → hub, mobilité au centre et satellites (`constellation-hub`) → vrais écrans V2 (`device-surface-showcase`, `assets/app/v2/`) → fin (`titlecard-reveal`). 16:9 + 9:16, ~25 s, fin « fenêtre » (« 25 €/mois, verrouillé. Dès la fin du compteur : 30 €/mois. ») et fin « v2 » (sans prix). Muet-lisible (sous-titres intégrés). Chaque fichier < 3 Mo. |
| B6 | Écrans des autres apps | Captures faites par nous à partir de sources publiées (fiches App Store, sites publics) d'apps de **mouvement** (muscu, course, mobilité, montre), floutées LÉGÈREMENT (décision Damien 25/10 : on doit reconnaître les apps — interface, couleurs, logo — sans lire le texte de détail ; ~4–8 px). Aucun nom de marque écrit par nous, aucun texte qui dénigre une app : le message porte sur le fait de jongler, pas sur la qualité d'une app. |
| B7 | Page | `/lancement` réécrite : hero (B2 + vidéo + compteur + CTA) → la fracture V1/V2 → le hub (5–6 briques, vrais écrans) → comparateur → preuve (330 membres, 52 retours, témoignages réels) → offre (mécanique inchangée) → FAQ (4 questions par phase) → pied. FR + EN. |
| B8 | Comparateur | « Ce que tu perds en jonglant » : colonnes « 3 apps séparées (mobilité + muscu + course) » vs « Mobility Club ». Lignes = fonctions (séance de mobilité adaptée à ton entraînement du jour, un seul calendrier, import de ton programme, bilan articulaire, coach vocal qui modifie la séance, correction vidéo humaine, suivi des progrès sur ton sport). Valeurs tirées de `docs/bascule-etude-marche-2026-10-23.md` (« non trouvé » ≠ « Non » : écrire « non trouvé » ou formuler sans affirmer l'absence). Sous le tableau, les prix honnêtes : pile la moins chère relevée (mobilité + muscu) en €/an avec la règle « prix le plus bas relevé », la source et la date ; jamais de cumul gonflé, jamais Runna chiffré (durée non affichée). L'aversion à la perte porte sur la synergie et la régularité, pas sur l'addition. |

## Offre de la page /lancement (décisions de Damien, 25/10 soir) — prime sur A1/A6 pour /lancement uniquement

| # | Sujet | Décision |
|---|---|---|
| C1 | Objectif | Faire entrer du cash. Offre phare = **accès à vie** ; repli = **mensuel**. L'**annuel n'est plus proposé sur /lancement** (moins de friction : deux choix). Les autres pages (/devenir-membre, /bascule, accueil) gardent leur offre A1–A12. |
| C2 | Accès à vie mis en avant | Affiché d'abord en **« 4 × 62,25 € »** (paiement en 4 fois PayPal, mention « sous réserve d'éligibilité et d'acceptation par PayPal », comme /lifetime) **ou 249 € en une fois** ; « Dès la fin du compteur : 350 € (4 × 87,50 €) ». En phase v2 : 350 € / 4 × 87,50 €, sans compteur. Série et stock : A12. |
| C3 | Mensuel = prix fixe, SANS essai gratuit | Fenêtre : 25 €/mois sans essai = plan existant **P-17C64877T6348331UNLCQIVI** (`PLANS.ancien.mensuel_fixe`). Après : 30 €/mois sans essai = plan **à créer par Damien** (`PLANS.v2.mensuel_fixe`, `null` tant qu'il n'existe pas → deploy bloqué par test, comme A11). Le mot « essai » disparaît de /lancement (offre, FAQ, vidéo). |
| C4 | Aversion à la perte + simulateur | Un simulateur « Ce que tu paies sur la durée » (dans l'esprit de celui de l'accueil) : curseur 6 mois → 5 ans ; compare **à vie maintenant (249 €)**, **à vie après le compteur (350 €)**, **mensuel maintenant (25 €/mois)**, **mensuel après (30 €/mois)**. Il affiche l'économie réelle d'entrer maintenant (ex. à vie : 101 € de moins qu'après ; à vie vs mensuel : rentabilisé dès le 10e mois). Tous les chiffres sont calculés depuis offre-v2 (aucun en dur). Phrases vraies, sans exagération ; jamais de prix barré. En phase v2 : le simulateur compare seulement à vie 350 € et mensuel 30 €. |
| C5 | Vidéo | La fin « fenêtre » pousse l'accès à vie : « Accès à vie : 4 × 62,25 €. Dès la fin du compteur : 350 €. » (plus de « 25 €/mois, verrouillé »). Fin « v2 » : sans prix. |
| C6 | Honnêteté V2 (défaut posé, Damien peut le changer) | Au présent seulement ce qui est en prod (import programme salle et course : PDF, photo ou texte collé ; séance adaptée ; bilan ; coach vocal ; correction vidéo). Les écrans V2 non livrés (suivi des progrès sportifs, nouvelle interface) sont annoncés « avec la V2 », jamais au présent. Montres : « WHOOP, Garmin et Polar : bientôt » (WHOOP fermé aux membres au 25/10, drapeau à 0 %). |
