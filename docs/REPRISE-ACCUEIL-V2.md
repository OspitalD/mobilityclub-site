# Reprise : refonte de l'accueil mobilityclub.co (DA V2) — 23/10/2026

À coller dans la nouvelle session (autre compte) :
« Lis docs/REPRISE-ACCUEIL-V2.md dans ~/Projects/mobilityclub-site et reprends là où on s'est arrêté. »

## Où on en est

- Repo : `~/Projects/mobilityclub-site` (GitHub `OspitalD/mobilityclub-site`).
- Branche : `feat/accueil-comparatif` (poussée, **non fusionnée, non publiée**). Tout le travail du lot 1 et du lot 2 est dessus.
- Fichier principal : `index.html` (single-file, bilingue FR/EN via `I18N.fr` / `I18N.en` + attributs `data-i18n`).
- Prévisualisation locale : `python3 -m http.server 8811 --directory ~/Projects/mobilityclub-site` puis http://localhost:8811/index.html (les Netlify Functions répondent 404/501 en local, c'est normal).

## Déjà en ligne (rien à refaire)

- `/bascule` (page de bascule Skool → app) : PR #1, publiée le 23/10. Comparatif 8 applis (dont Freeletics 79,99 €/an validé par Damien), Runna 19,99 €/mois et 119,99 €/an, simulateur par besoin (mobilité, muscu, course, « données santé » bientôt) + réglage Générique / Individualisé. « Tout ça dans le club » validé par Damien : la course et la muscu individualisée arrivent avec SA mise à jour de l'app.
- `/devenir-membre` : annuel 220 € ajouté (PR #2, publiée le 23/10). Grille unique validée : **25 €/mois avec 7 jours d'essai, 220 €/an, 249 € à vie**. Le plan PayPal annuel `P-4VH08043D1618690PNJJ2Z5A` est bien à 220 € (vérifié par Damien).

## Décisions de Damien pour l'accueil (23/10)

1. Promesse du hero : **« Ton coach de mouvement, dans ta poche. »** + sous-titre « Mobilité, muscu, course : un plan qui s'adapte à ton corps et à ta semaine. Tu ouvres, ta séance est prête. »
2. Retirer **seulement** la section « Pourquoi un produit » (fait). **Garder** le Timer dans les 3 portes, **garder** les grands numéros 01-06 et les eyebrows mono (Damien ne les a pas cochés).
3. Captures : utiliser l'**app test V2** maintenant (https://mc-v2-test--dashboardmobilityclub.netlify.app), remplacer par la vraie app à sa mise à jour.
4. Comparatif : sur l'accueil juste après les avis (fait), publié avec le lot 2, pas seul.

## Fait sur la branche

- Lot 1 (commit `9a77497`) : section `#comparer` (comparatif + simulateur), FR/EN, script `renderCompare(lang)` appelé dans `setLang`.
- Lot 2 (commit de reprise) :
  - DA V2 : polices Plus Jakarta seule (+ italique 800) et JetBrains pour les eyebrows (Bricolage et Spectral retirées), titres en italique 800, surfaces `--bg-surface` en verre (dégradé translucide), bordures plus claires, halo violet dans `.bg-atmos`, boutons en pilule.
  - Hero : variante A/B `coach` figée (`const AB.forced = 'coach'`), clés `hero_title_coach` / `hero_sub_coach`, eyebrow « Le club qui te met en mouvement ». La colonne 3D est gardée.
  - « Pourquoi un produit » retirée (le CSS `.whyscale-*` et les clés `ws_*` sont restés, inoffensifs).
  - Nav : lien « Comparer » (`#comparer`).
  - Nouvelle section `#programme` « Ton programme, comme tu veux » (3 façons + pastilles Mobilité / Musculation / Course / Données santé bientôt), placée avant `#fondateur`, FR/EN (clés `pg_*`).
  - Texte du bandeau collant et meta description mis à jour. Traductions mortes de l'ancien bloc prix alignées (25 €, 220 €).

## Reste à faire

1. **Captures V2 : FAITES** dans `assets/app/v2/` (1179 px de large, JPG q85 commités ; les PNG lourds restent en local, non commités). Écrans : `today` (jour de repos), `today-session` (jour d'entraînement « Lower 2 »), `seance`, `seance-force`, `voice`, `plan`, `progress`, `bilan` (+ versions `-full`). La section `#programme` utilise `today-session.jpg` + `plan.jpg`. Défauts vus sur les captures (données de démo) : consignes du bloc force en anglais (`seance-force`), barre du bas qui couvre un bouton sur `progress` et la ligne « Chevilles » sur `bilan`, compteurs eau/protéines/calories à 0 sur `today`. Choisir les captures en conséquence ou recadrer.
2. Remplacer les anciennes captures V1 par les V2 là où c'est pertinent (démo carrousel, section vocal `voice-*.png`, vidéo coach), sans casser le carrousel interactif.
3. Vérifier visuellement toute la page (ordinateur + iPhone 375 px) : pas de défilement horizontal, contrastes du verre, titres italiques qui ne débordent pas, FR et EN.
4. Faire valider Damien en local, puis **demander son OK** avant de publier.

## Publier (après OK de Damien uniquement)

GitHub Actions est en panne (facturation) : le déploiement automatique échoue. Recette manuelle :

```bash
cd ~/Projects/mobilityclub-site && gh pr create --base main --head feat/accueil-comparatif --title "Accueil V2 : DA, hero coach, programme, comparatif"
gh pr merge feat/accueil-comparatif --merge
git worktree add --detach /tmp/site-pub origin/main && cd /tmp/site-pub && npm ci --omit=dev
npx -y netlify-cli@latest deploy --prod --site fc8d69e0-2b8f-44b6-aef8-f9524e80104d --dir=. --functions=netlify/functions --message="accueil V2"
```

Puis vérifier https://www.mobilityclub.co/ (200, nouveau hero, `#comparer`, `#programme`) et retirer le worktree. Une publication = ~15 crédits Netlify : une seule par lot.

## Règles à garder

- Damien rejette le style « IA » : pas de cartes dans des cartes, pas d'icônes en pastilles, rendu épuré.
- Comparatif : « — » veut dire « non trouvé dans leur documentation », jamais « n'existe pas ». Sources : `docs/bascule-etude-marche-2026-10-23.md`.
- WHOOP est encore réservé au compte de Damien : « données santé » reste marqué « bientôt ».
