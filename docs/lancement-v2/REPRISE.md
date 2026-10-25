# Reprise — page de pré-lancement V2 (fenêtre 24 h) — 25/10/2026

À coller dans la nouvelle session (n'importe quel compte) :
« Lis ~/Projects/mc-worktrees/site-lancement-v2/docs/lancement-v2/REPRISE.md et reprends là où on s'est arrêté. »

## La demande de Damien (verbatim résumé)
Page de pré-lancement V2 sur mobilityclub.co, DA V2 de l'accueil, orientée conversion. Fenêtre de 24 h **qui démarre à l'heure de publication** : on entre aux prix actuels (25 €/mois avec essai 7 j, 220 €/an, 249 € à vie), verrouillés ; ensuite les prix V2 (30 / 275 / 350) s'appliquent partout automatiquement. Vidéo HyperFrames 16:9 20 s + 9:16, MOAT en 3 faits, preuves réelles, FAQ, suivi. Damien ne fait que : OK de publication prod (et cliquer les boutons PayPal pour vérifier). Il veut qu'on fasse tout le reste seul, sans s'arrêter.

## Où est le travail
- Dépôt : `~/Projects/mobilityclub-site` (GitHub `OspitalD/mobilityclub-site`). **Worktree du chantier** : `~/Projects/mc-worktrees/site-lancement-v2`, branche `feat/lancement-v2` (poussée sur GitHub pour la survie, NON fusionnée, NON publiée).
- La loi du chantier : `docs/lancement-v2/CONTRAT.md` (arbitrages A1–A11 + forme des données). Le lire en premier.
- Méthode : skill `chantier-equipe` (lots en séquence, relecteur adverse, juge qui rejoue le filet, ne croire aucun rapport).

## Fait (vérifié)
1. **Plans PayPal V2 créés** (25/10, par Damien via `scripts/creer-plans-v2.mjs` dans le dépôt principal, clones des plans actuels, seul le prix change), ACTIVE : mensuel `P-3X034647B5061360HNLPBCDY` (essai 7 j puis 30 €), annuel `P-7PX93930RS848432UNLPBCEA` (275 €). Rien à créer pour la Lifetime (commande créée par le serveur).
2. **Lot 1 — mécanique d'offre** (commits eb2a60a → 20f18c4) : `netlify/lib/offre-v2.js` (FIN_FENETRE, PLANS, etatOffre), function `offre-v2`, `assets/js/offre-v2.js` (rendu prix/liens/compteur, bascule à l'heure de fin sans rechargement, repli local), câblage de /devenir-membre, /bascule, /lifetime, accueil ; Lifetime 350 € côté serveur en phase v2 ; événements `offer_viewed`, `video_played`, `faq_opened` + variante `lancement` dans `track-site-event`. `npm test` **101/101** (rejoué par le coordinateur). Test de bascule navigateur : `node scripts/verif-offre-pages.mjs` (Playwright du dépôt dashboard) vert.
3. **Preuves** : l'avant/après réel des bilans a été calculé (`docs/lancement-v2/preuve-avant-apres.json`) → n=15, médiane −1 pt, **retiré**. Le « +22 % au retest » de l'accueil est un exemple illustratif → **interdit comme preuve**. Seuls « 330 membres » et « 52 retours membres » sont autorisés.

## En cours au moment de l'écriture (agents du compte précédent — ils MEURENT avec la session)
Vérifier ce qui a été commité avec `git -C ~/Projects/mc-worktrees/site-lancement-v2 log --oneline 20f18c4..HEAD` et `git status`.
- **Lot 3 — vidéo HyperFrames** : projet dans `docs/lancement-v2/video/`, rendus attendus dans `assets/video/` : `lancement-16x9-fenetre.{mp4,webm,jpg}`, `lancement-16x9-v2.{mp4,webm,jpg}` (fin SANS prix), `lancement-9x16-fenetre.{mp4,webm,jpg}`, chacun < 3 Mo. Séquence : problème 0–3 s → 3 faits du MOAT sur vrais écrans (`assets/app/v2/`) 3–14 s → preuve « 330 membres · 52 retours membres » 14–17 s → fin (fenêtre : « 25 €/mois, verrouillé. Dès la fin du compteur : 30 €. », jamais de prix barré). Contrôles visuels dans `docs/lancement-v2/video/controle/`. Si absent ou incomplet : relancer un agent avec les skills hyperframes (lire `~/.claude/skills/hyperframes/SKILL.md` d'abord).
- **Lot 2 — page `lancement.html`** (servie à `/lancement`) : FR + EN, hero vidéo + compteur, 3 faits MOAT avec vrais écrans, preuve + 4–6 témoignages de `TESTIMONIALS` (index.html), bloc offre (prix fenêtre + « verrouillé » + « Dès la fin du compteur : X € », pas de prix barré ; en phase v2 : nouveaux prix seuls, « La V2 est lancée »), FAQ 4 questions (texte rétractation arbitré : annulable à tout moment depuis PayPal, essai 7 j, délai légal de rétractation de 14 jours), suivi. Aucun prix en dur : tout passe par `data-offre-*`.
- **Relecture adverse du lot 1** (lecture seule) : chemins par lesquels un ancien prix reste accessible après la fin ; **provisionnement des nouveaux plan_id** (un abonné V2 doit obtenir l'accès app : grep des anciens plan_id dans `netlify/functions` du site, `~/Projects/mobilityclub-site-paypal-app`, et `~/Projects/mobility-dashboard/netlify/functions`) ; exploitabilité de la règle Lifetime « réservé à 249 € → payable à 249 € » ; textes /lifetime « 20 tickets par série, puis le prix monte » faux en phase v2. Si son rapport est perdu : relancer la relecture (opus) sur `git diff a04120d..20f18c4 -- . ':!docs' ':!assets/video'`.

## Reste à faire, dans l'ordre
1. Récupérer/terminer lots 2 et 3 ; corriger les constats bloquants/majeurs de la relecture (correcteur qui REPRODUIT avant de corriger).
2. Relecture adverse du lot 2 (page) et de la vidéo.
3. Intégration : `npm test` (chiffres exacts), `node scripts/verif-offre-pages.mjs` (passé/futur), `docs/ecrans-v2-recrees/verifier-page.mjs` sur `/lancement` ET l'accueil (1280 et 375 px, FR et EN), Lighthouse mobile `/lancement` (LCP < 2,5 s, CLS = 0), vidéos < 3 Mo. ⚠️ Ne JAMAIS vérifier avec un style qui force l'affichage : vrai Chromium seulement (leçon du 24/10 : apostrophe non échappée = page entière cassée, masquée par la vérif forcée). `node --check` sur chaque `<script>` inline.
4. Juge final (rejoue le filet) + convergence (ce qui a été demandé et n'est pas livré).
5. Montrer la page à Damien (local : `npx -y serve -n -l 8811 ~/Projects/mc-worktrees/site-lancement-v2`, ouvrir `/lancement` ; Cmd+Maj+R contre le cache), puis **demander son OK de publication**.

## Publier (seulement après l'OK explicite de Damien) — l'ordre compte
1. Poser l'heure de fin = maintenant + 24 h, **aux deux endroits** (un test vérifie qu'ils sont égaux) : `FIN_FENETRE` dans `netlify/lib/offre-v2.js` et la copie `window.MC_OFFRE_FIN ||` en tête de `assets/js/offre-v2.js`. `npm test` vert, commit.
2. Ajouter `350.00` à la variable Netlify `PAYPAL_MONTANTS_ACCEPTES` (valeur actuelle `197.00,100.00,199.00,249.00`) : `npx -y netlify-cli@latest env:set PAYPAL_MONTANTS_ACCEPTES "197.00,100.00,199.00,249.00,350.00" --context production --site fc8d69e0-2b8f-44b6-aef8-f9524e80104d`. Sans ça, la Lifetime renvoie 503 en phase v2.
3. PR `feat/lancement-v2` → main, fusion, puis publication manuelle (GitHub Actions est en panne) depuis une copie propre :
   ```
   git -C ~/Projects/mobilityclub-site fetch origin && git -C ~/Projects/mobilityclub-site worktree add --detach /tmp/site-pub origin/main && cd /tmp/site-pub && npm ci --omit=dev
   npx -y netlify-cli@latest deploy --prod --site fc8d69e0-2b8f-44b6-aef8-f9524e80104d --dir=. --functions=netlify/functions --message="lancement V2"
   ```
   (Si le classifieur bloque `deploy --prod`, donner la commande à Damien dans un bloc bash.)
4. Vérifier la prod dans un vrai Chromium : `/lancement`, `/devenir-membre`, `/bascule`, `/lifetime`, accueil → prix fenêtre + compteur ; `GET /.netlify/functions/offre-v2` → phase `fenetre` et la bonne `fin` ; aucun 400 sur `track-site-event`. Retirer la copie `/tmp/site-pub`.
5. Faire cliquer à Damien chaque bouton PayPal (montant + récurrence).

## Après la fenêtre (H+24)
- Vérifier la bascule en prod (phase `v2`, nouveaux prix et liens partout, plus aucun ancien plan_id dans le DOM).
- Damien **désactive les anciens plans** dans PayPal (filet pour les liens déjà copiés ; les abonnés en cours gardent leur prix) : mensuel 25 `P-43F663568B911461GNLNCJBY`, annuel 220 `P-4VH08043D1618690PNJJ2Z5A`, mensuel sans essai `P-17C64877T6348331UNLCQIVI`, et le lien de paiement Lifetime 249 `KT93SVXG954UE` / 199 `5LSVN4S2KGSM4`. ⚠️ Avant de désactiver : vérifier qu'aucune autre offre active (/retour-au-club, /le-suivi) n'utilise l'un de ces plans.
- Lire le parcours dans `site_events` : page_view → offer_viewed → plan_clicked → purchase_confirmed sur `/lancement`.

## Règles à garder
- Pas de prix barré 30 € (jamais pratiqué) ; une seule heure de fin pour tous ; jamais de compteur qui repart.
- Damien rejette le style « IA » : pas de cartes dans des cartes, pas d'icônes en pastilles, pas d'eyebrows mono.
- Chaînes JS : guillemets doubles ou apostrophe typographique ’.
- Commits par nom de fichier, jamais `git add -A`.

---

## Point du 25/10 fin d'après-midi (session suivante)
- FAIT et vérifié (108/108 site, 105/105 paypal-app, verif-offre-pages vert, LCP 2,2 s) : lots 1–3, relectures adverses lot 1 + page, corrections (commits 7d46386 → bef2f6b) ; dépôt paypal-app : plans V2 reconnus (c78cbcb, branche feat/paypal-abonnement-app, local).
- Décisions Damien : Lifetime V2 = série 3 de 20 tickets à 350 € (A12) ; bootcamp fermé (302 → /lancement) ; refonte « fracture V1 → V2 » = section B1–B8 du CONTRAT (phrase « La mobilité au cœur de ton entraînement. », deux vidéos séparées, comparateur « Ce que tu perds en jonglant » sans cumul gonflé, captures floutées d'apps de mouvement, publication quand TOUT est prêt, face cam de Damien incluse).
- EN COURS : Lot V (vidéo motion, projet docs/lancement-v2/video-v2/, mêmes noms dans assets/video/ + 9x16-v2) et Lot P (réécriture lancement.html + comparateur + /lancement dans verif-offre-pages.mjs). Si perdus : relancer depuis B1–B8.
- Ensuite : relecture adverse V et P → corrections → intégration (filet complet) → aperçu à Damien → attendre sa face cam → OK de publication.
