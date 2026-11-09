# Espace acheteur du Kit App Sexy (React 19 + Vite)

Source de la page servie à `www.mobilityclub.co/kit-app-sexy/espace/`. La compilation écrit dans
`../kit-app-sexy/espace/` (versionné) : le site reste sans build côté Netlify (`publish = "."`).

La coquille compilée ne contient AUCUN contenu payant. La vidéo, la grille, le kit d'audit, le dossier de
marque et les captures sont en Blobs et ne sortent que par `/api/kit-app-sexy/*`
(`netlify/functions/kit-app-sexy-api.js`), après contrôle de la session ET de la date.
`tests/kit-espace-coquille.test.mjs` le vérifie sur le build.

## Commandes

    npm install
    npm run build    # tsc --noEmit + vite build, écrit dans ../kit-app-sexy/espace/ (à committer)
    npm run dev      # Vite sur 4931, proxy /api vers netlify dev sur 4930

Pour jouer l'espace avec son API : depuis la racine du dépôt,
`npx netlify-cli@latest dev --port 4930 --offline`, puis ouvrir
`http://localhost:4930/kit-app-sexy/espace/`. Sans `RESEND_API_KEY`, le code à 6 chiffres n'est pas envoyé,
il apparaît dans les logs du serveur. Les vérifications finales se font sur le BUILD servi par netlify dev,
pas sur Vite : la Function refuse (403 `bad_origin`) toute écriture dont l'Origin diffère de l'URL de la
requête, et le proxy de Vite doit réécrire cet en-tête (voir `vite.config.ts`).

## Composants 10K Design (hors dépôt, licence)

Les composants viennent du catalogue 10K Design (accès membre, licence) et ne sont **pas** versionnés
(dépôt public) : `src/components/10k/` est dans `.gitignore`. Pour les réinstaller : connecteur 10K Design,
`get_component` pour chaque slug, puis la commande d'installation lancée DEPUIS `src/components`
(les fichiers arrivent dans `10k/<slug>/`), puis `npm install` (motion est déjà dans package.json).

    web-onboarding-wizard   OnboardingWizard   assistant du dossier de marque (4 étapes)
    web-sheet-modal         SheetModal, Field, EmptyState, CopyButton
    web-count-up            CountUp            le rang d'achat
    web-scroll-reveal       ScrollReveal       apparition au défilement

Non installés exprès : `web-coming-soon` (aucun écran « bientôt » flouté), `web-glass-switch` et
`web-nav-pill` (ce sont des pastilles, interdites par la DA).

**Règle : aucun fichier n'est modifié dans `10k/`.** Une réinstallation écraserait la modification et le
build ne serait plus reproductible. L'adaptation à la DA du club passe uniquement par :
les props (libellés français, `startOnView`, `grouped`...), les enveloppes de `src/ui/` et
`src/styles/adaptations-10k.css`, chargé après les CSS 10K.

Avant chaque commit : `git status --ignored` et `git ls-files kit-espace-app/src/components/10k` (doit être vide).
Ne jamais faire `git add -A` avant d'avoir vérifié que le dossier est bien ignoré.

## Où est quoi

- `src/textes.ts` : toute la copie française, à un seul endroit.
- `src/api.ts` : client typé, erreurs normalisées (`ErreurApi.code`).
- `src/sauvegarde.ts`, `src/useDossier.ts` : sauvegarde automatique, révision, fusion des 409, brouillon local.
- `src/reduireImage.ts` : réduction des captures dans le navigateur (2000 px, WEBP 0,85, sous 3,8 Mo).
- `src/styles/jetons.css` : jetons recopiés à l'identique de `kit-app-sexy/index.html`.
