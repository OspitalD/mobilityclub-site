# Page /v2 — offre de sortie V2 (React 19 + Vite)

Source de la page servie à `mobilityclub.co/v2/`. La compilation écrit dans `../v2/` (versionné) :
le site reste sans build côté Netlify (`publish = "."`).

## Composants 10K Design (hors dépôt)

Les composants viennent du catalogue 10K Design (accès membre, licence) et ne sont **pas** versionnés
(dépôt public). Ils vivent dans `src/components/10k/` en local. Pour les réinstaller : via le connecteur
10K Design (`get_component` → commande d'installation lancée depuis `src/components`) :

`web-liquid-glass`, `web-coming-soon`, `web-beam-card`, `web-count-up`, `web-device-frame`,
`web-sticky-steps`, `web-faq-accordion`, `web-scroll-reveal`.

## Commandes

    npm install
    npm run build    # tsc + vite → ../v2/

## Réglages de l'offre

`index.html` → `window.MC_SORTIE` : heure de fin (une seule pour tout le monde), prix, lien PayPal 249 €.
Après la fin : la page affiche l'accès à vie à 350 € (lien `/lifetime`), sans le jeu de la glace.

## Médias

- Démo : `/assets/video/v2-demo.mp4` (export Tella recompressé 720×1280) + affiche `v2-demo.jpg`
- Écrans : `/assets/v2-demo/*.jpg` (extraits de la démo, recadrés sur l'app)
- Son du bris : `/assets/audio/verre.mp3` — « Glass Smash.wav » par chewiesmissus, CC0 (freesound.org/s/244238)
