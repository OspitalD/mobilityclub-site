# Page /edition-1 — contenu (source : fiche Club à saisons 82ZGCfCNDriA9zvphXHPqm + décisions Damien 17/11)

Tout texte ci-dessous qui n'est pas marqué « fiche » est NOUVEAU → à relire par Damien.

## Décisions du 17/11 (Damien, QCM)
- Ouverture AUJOURD'HUI 17/11 (au lieu du 27/11).
- Palier 1 « fondateur » : saison à 97 €, se ferme à la 30e place vendue OU le jeudi 26/11 à 23 h 59 (premier des deux).
- Palier 2 : saison à 119 €, jusqu'au lundi 30/11 à 23 h 59. Ensuite portes fermées ; prochaine ouverture 149 € (fiche).
- 100 places pour l'Édition 1 (fiche).
- Accès à vie : 350 € (4 × 87,50 € avec PayPal), via /lifetime existant.
- Adresse : www.mobilityclub.co/edition-1

## Blocs de la page (ordre)
1. Héros
   - Surtitre : « Édition 1 · New Year Team »
   - Titre (fiche, nom) : « 12 semaines pour bouger libre. »
   - Promesse (fiche) : « Tiens ta promesse 12 semaines, et ta zone la plus raide progresse. »
   - Sous-texte (nouveau) : « Le Mobility Club arrête l'abonnement. À la place : une saison de 12 semaines, du 4 janvier au 28 mars 2027. 100 places. »
2. Palier en cours (données live de `/.netlify/functions/saison-checkout`, GET) : prix, places fondateur restantes, date de fin du palier, places restantes sur 100. Ligne suivante : « Ensuite : 119 € jusqu'au lundi 30/11, 23 h 59. À la prochaine ouverture : 149 €. » JAMAIS de prix barré (L112-1-1).
3. Ce que tu reçois — tableau « ce que ça te coûterait sans le club » (fiche, mot pour mot) :
   - Programme 100 % personnalisé de 12 semaines, ajusté à la main par Damien à la demande, avec 3 bilans vidéo (J1, S6, J84) — 400 € (Le Suivi, coaching individuel de Damien : 400 € les 12 semaines)
   - Bilan articulaire complet au jour 1 et au jour 84 — 200 € (un professionnel te le facture ~100 €, 2 bilans)
   - Rituel d'entrée, 4 semaines pour poser les fondations — 39 €
   - Total : ≈ 640 €
   - Inclus (fiche, adapté à l'ouverture du 17/11) : accès au club offert dès aujourd'hui jusqu'au 4/01, 1 live par semaine avec replay, contenu exclusif de la saison, classement à la promesse tenue, bilan du jour 84, carte des douleurs, guide « Tenir 12 semaines »
   - Ce qui ne s'achète pas (fiche) : titre « Première promotion », numéro de membre, plaque de rang
4. Comment ça se passe (nouveau, 4 étapes) :
   1. Tu prends ta place : l'accès au club s'ouvre tout de suite.
   2. 4 janvier : bilan du jour 1, ton programme est construit pour toi.
   3. 12 semaines : un live chaque semaine, Damien ajuste ton programme à la demande.
   4. Jour 84 : ton bilan, et le classement de la promesse tenue.
5. Ce qui te revient (fiche, décision 23) : podium à la promesse tenue 299 € / 149 € / 75 € en crédits ; titre « Promesse tenue » à 80 % ou plus. [GARANTIE À TRANCHER PAR DAMIEN — ne rien promettre d'autre]
6. Ancrage à vie, UNE ligne (fiche) : « Tu veux ne plus jamais te poser la question ? L'accès à vie : 350 €, ou 4 × 87,50 €. » → /lifetime
7. Déjà membre ? (nouveau) : « Ton inscription à l'Édition 1 est gratuite tant que ton abonnement est actif. Réponds au mail d'ouverture pour réserver ta place. »
8. FAQ courte (nouveau) :
   - Paiement unique, rien ne se reconduit.
   - Et après la semaine 12 ? Tu repasses en gratuit, ton historique et ton bilan restent lisibles, et tu es prioritaire à la prochaine ouverture. (décision 14)
   - Paiement en 4 fois : oui, avec PayPal.
9. CTA final + case obligatoire (L221-28) :
   « Je demande l'accès immédiat au club et je renonce à mon droit de rétractation de 14 jours. » Bouton grisé tant que la case n'est pas cochée.
   Bouton : « Prendre ma place — 97 € » (prix live du palier).

## RETOURS DAMIEN 17/11 (priment sur tout ce qui précède)
1. « Pas assez clair » → la page doit se comprendre en 10 secondes, en haut, sans défiler :
   CE QUE C'EST (une saison de 12 semaines, programme perso ajusté par Damien) · COMBIEN (97 € fondateur) · CE QUI TE REVIENT (80 % → 50 %) · LE BOUTON.
   Puis une section par élément de l'offre, chacune avec UN écran réel de l'app. Phrases courtes, un seul message par bloc, pas de jargon.
2. Écrans réels de l'app repris de www.mobilityclub.co/app/ — fichiers déjà dans le dépôt, `sites/mc2/` (NE PAS redessiner d'écran) :
   - Ta séance est prête chaque jour → `hero-aujourdhui.webp` (ou `today-padel.webp`)
   - Damien ajuste ton programme → `voix-4-ajustee.webp` et retour vidéo `video-1-retour.webp`
   - Bilan J1 / J84 → `mesure-bilan.webp`, avant/après `preuve-avant.webp` / `preuve-apres.webp`
   - Ta promesse se coche séance après séance → `tapes-7-serie.webp`
   - Damien (fondateur) → `fondateur-damien.webp`
   Afficher les écrans dans un cadre de téléphone simple (CSS), comme sur /app.
3. Vidéo de Damien qui explique le concept, en HAUT de page (sous le titre, avant le prix). Fichier pas encore fourni : prévoir un lecteur `<video controls playsinline preload="metadata">` qui lit `assets/edition-1/concept.mp4` avec affiche `assets/edition-1/concept-poster.webp` ; tant que le fichier n'existe pas, afficher `fondateur-damien.webp` avec la mention « Vidéo bientôt » (jamais un lecteur cassé). Format vertical 9:16 probable.
4. Récompense AU CENTRE de l'offre (mots de Damien) : « Réalise 80 % de ton plan et tu récupères 50 % de ce que tu as payé. »
   Précision en petit dessous (décision 19, jamais en argent) : « Versés en crédit sur ta prochaine saison ou sur l'accès à vie. » [à confirmer par Damien]
   Le podium 299/149/75 € disparaît de la page (décision 23 : pas de cumul) [à confirmer].
   Comment c'est mesuré, une ligne : « Une séance compte quand tu la fais avec le minuteur de l'app. »

## Interdits
- « dès la semaine 1 », « objectif en semaine 8 », 33 % / 1,7 séance, prix barré, « sans douleur » dans le nom.
- Aucun avis membre inventé ni reformulé.
