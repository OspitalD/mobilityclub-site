# Étude de marché — coût d'opportunité (page /bascule)

Recherche Perplexity du 23/10/2026 (fil : https://www.perplexity.ai/search/f779d716-a8ee-43c6-b912-e61f5550a367).
Sert au bloc « Pour comparer » de `bascule.html`. Aucun chiffre de la page ne doit sortir de ce tableau.

## Ce qu'un sportif de 30-50 ans paie de sa poche en France (à la séance)

| Prestation | Fourchette | Prix central (hypothèse, pas une médiane mesurée) | Sources citées |
|---|---|---|---|
| Kiné hors remboursement (prévention, mobilité) | 40-70 € | 55 € | appines, guides pro |
| Ostéopathe, consultation adulte | 40-80 € | 60 € (tarif le plus fréquent relayé par Doctolib) | goodassur |
| Coach sportif personnel, 1 h | 40-80 € | 60 € | azeoo |
| Cours collectif yoga / mobilité | 10-30 € | 20 € | koacher, Yog&Rise (25 €) |

Perplexity précise : pas de médiane nationale disponible, ce sont des points centraux de travail.

## Applications de mobilité (App Store France, relevé du 23/10/2026)

| Appli | Mois | An | À vie |
|---|---|---|---|
| Pliability | 22,99 € | 199,99 € | aucune offre identifiée |
| StretchIt | 29,99 € | 199,99 € | aucune |
| Movement Vault | 15,49 € | 124,99 € | aucune |
| GOWOD Premium | 10,99 € | 98,99 € | aucune |
| Bend (Bowery Digital) | 4,99-9,99 € | 19,99-29,99 € (promos) | aucune |

## Ce que la page en retient

- Accès à vie Mobility Club : 249 € une fois (ou 4 × 62,25 €). Au mois : 25 € × 12 = 300 € par an.
- Les applis de mobilité les plus connues : jusqu'à 200 € par an, chaque année, aucune avec un accès à vie.
- 249 € ≈ le prix de 4 consultations chez l'ostéo (60 €).
- Aucune comparaison de soin : la page ne dit pas que l'app remplace un kiné ou un ostéo (pas de promesse médicale). Depuis b81757b, les concurrents sont nommés dans le tableau ci-dessous, à la demande de Damien.

## Comparatif nominatif (2e recherche Perplexity, 23/10/2026)

Fil : https://www.perplexity.ai/search/6723312c-e38b-4424-b3a0-7371a929dc23 — vérification documentaire publique (sites, centres d'aide, fiches App Store France), pas un test des comptes payants. Perplexity : « non trouvé » ne doit jamais devenir « Non » → la page affiche « — non trouvé dans leur documentation ».

| Critère | Pliability | GOWOD | Fitbod | Runna | Freeletics |
|---|---|---|---|---|---|
| Bilan articulaire qui personnalise | Oui (test mobilité iPhone) | Oui (test par zones) | non trouvé | non trouvé | non trouvé |
| Programme salle/course déjà suivi pris en compte (import) | Partiel (« Build Your Program », pas d'import) | Partiel (mouvements du WOD du jour) | Partiel (saisie manuelle) | Partiel (ajout de courses) | non trouvé |
| Séance adaptée au sport prévu ce jour-là | Partiel | Oui (protocoles « Activate ») | Partiel (échauffement de la séance muscu) | Partiel (jour fixe) | Partiel |
| Assistant vocal qui modifie la séance | non trouvé | non trouvé | non trouvé | non trouvé (annonces audio seulement) | non trouvé |
| Correction vidéo par un coach humain | non trouvé | non trouvé | non trouvé (« Ask a Trainer » sans vidéo) | non trouvé | non trouvé |
| Offre à vie | non trouvé | non trouvé | non trouvé | non trouvé | Oui, web seulement, prix non publié |
| Prix annuel App Store FR | 199,99 € | 98,99 € (promo 84,99 €) | 99,99 € (aussi 81,99 €) | 119,99 € durée non précisée → n.c. | 79,99 / 99,99 € durée non précisée → n.c. |

Mobility Club (vérifié en prod le 23/10 : drapeaux `feature-flags/all` + code origin/main) : bilan intégré, import de programme (program_import 100 %), séance calée sur le sport (PR #483, sans drapeau), coach vocal (voice_onboarding 100 %), retour vidéo coach (video_review 100 %), accès à vie 249 €, annuel 220 € (plan PayPal vérifié par Damien).
