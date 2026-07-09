# Mobility Club — Site vitrine (`mobilityclub.co`)

Site vitrine premium, **manifeste**, une seule page, scroll narratif vertical.
**Bilingue FR/EN** (toggle dans le header, sans rechargement, FR par défaut).

- **Fichier unique** : [`index.html`](index.html) — autonome, aucune dépendance runtime.
- **Stack** : HTML + CSS + JS **vanilla**. Voir la justification plus bas.
- **Repo dédié** : ce dossier est totalement séparé du Dashboard. Aucune collision possible.

---

## Pourquoi vanilla (et pas React) ?

Le Dashboard impose React + Babel standalone **parce que c'est une app** (état, routing,
sync, offline). Ici c'est un **site vitrine statique** : du contenu qui défile, un toggle de
langue, des reveals au scroll. React n'apporterait rien et coûterait :

- **+130 Ko** de runtime (React + ReactDOM) pour zéro état applicatif ;
- un temps de boot inutile sur un site dont le seul KPI est « frapper en 3 secondes » ;
- de la complexité (build ou transpilation Babel navigateur) pour un rendu qui est, au fond,
  du HTML sémantique.

**Vanilla = plus léger, plus rapide, plus propre, indexable immédiatement par Google/les
partners YC.** Le premium vient de la rigueur du CSS, pas du framework. Le fichier fait
~50 Ko, se charge instantanément, et reste 100 % modifiable sans outillage.

> À noter : la palette, la typo et les composants **héritent strictement du design system
> Mobility Club** (mêmes variables CSS que le Dashboard). Cohérence de marque totale, sans
> partager une ligne de code avec le repo Dashboard.

---

## Déploiement Netlify (après validation de Damien)

Site statique, aucun build. Deux options :

**A. Git auto-deploy (recommandé)**
1. `git init` (déjà fait localement — voir plus bas), créer un repo GitHub dédié
   (ex. `mobilityclub-site`), `git remote add origin …`, `git push`.
2. Netlify → *Add new site → Import from Git* → sélectionner le repo.
3. Build command : **(vide)** · Publish directory : **`.`** (racine).
4. Chaque push sur `main` redéploie.

**B. Drag & drop** (dépannage rapide)
- Netlify → glisser le dossier `mobilityclub-site/`. Pas d'auto-deploy ensuite.

**DNS** : hors périmètre de ce ticket. Damien pointera `mobilityclub.co` sur Netlify
**après validation du contenu**. Ne rien configurer côté DNS pour l'instant.

### Vérifier en local
```bash
cd mobilityclub-site
python3 -m http.server 8791
# → http://localhost:8791
```

---

## ⚠️ PLACEHOLDERS À COMPLÉTER par Damien

Tout est balisé visuellement dans la page. Rien à retoucher dans l'architecture — juste
remplacer du texte / une image / trois URLs.

### 1. Les 3 URLs de l'écosystème — **en tête du `<script>`, objet `LINKS`**
```js
const LINKS = {
  diagnostic: '[URL_DIAGNOSTIC]',          // ← à remplir
  timer:      'https://mobilitytimer.com', // ← pré-rempli, à CONFIRMER
  club:       '[URL_CLUB]'                  // ← à remplir
};
```

### 2. Photo de Damien — Section 03 « La méthode »
- Bloc balisé `[ PLACEHOLDER · PHOTO DAMIEN ]` (cadre premium, ratio 4/5).
- **Aucune stock photo** volontairement. Fournir une vraie photo, puis remplacer le
  `<div class="photo-slot">…</div>` par une `<img>` (ou un `background-image`) dans le même
  conteneur — le cadre et les proportions sont déjà prêts.

### 3. Stories membres — Section 05 « Résultats membres »
- 3 cards, design **fini**, texte provisoire balisé `[STORY À REMPLIR — FR]` /
  `[STORY TO FILL — EN]` + `[Prénom]/[Name]`, `[Sport]`, `[Durée]/[Duration]`.
- Remplacer les valeurs dans le dictionnaire `I18N` (clés `story1…3`, `story1_who`,
  `story1_sport`, `story1_dur`, etc.), **en FR ET EN**. Retirer le badge `ph_badge`
  (« À remplir ») une fois rempli si souhaité.
- Prévu pour 2 à 3 témoignages (là : 3).

### 4. Pricing — **à confirmer** (Section 06)
Affiché tel que fourni dans le ticket, **doit rester cohérent avec le checkout** :
> Offre de lancement : **20€/mois ou 175€/an** jusqu'au 30 septembre · puis 29€/mois ou 229€/an.

Si le checkout diffère, corriger les clés `pricing_v` / `pricing_then` du dictionnaire `I18N`
(FR **et** EN).

### 5. Liens légaux (footer) — optionnel V1
`Mentions légales`, `Confidentialité · RGPD`, `Contact` pointent vers `#`. À brancher quand
les pages/mailto existeront.

---

## Contenu bilingue — comment ça marche

- Tout le copy vit dans l'objet `I18N = { fr:{…}, en:{…} }` en bas du fichier.
- Chaque élément traduit porte un `data-i18n="clé"`. Le toggle réécrit le contenu **sans
  rechargement** et mémorise le choix (`localStorage`).
- **Règle** : aucune section n'existe dans une seule langue. Les 78 clés sont présentes en
  FR **et** EN. Si tu ajoutes un texte, ajoute la clé dans **les deux** dictionnaires.
- Signatures volontairement en anglais dans les deux langues : `We plan. You move.` (hero
  section 02) — c'est la signature de marque, ne pas traduire.

---

## Structure de la page

| # | Section | Rôle |
|---|---------|------|
| 00 | Hero | Frappe en 3 s · « Chacun son Mobility Club » · 1 CTA mint |
| 01 | Le problème | Créer la tension |
| 02 | Le renversement | `We plan. You move.` — la vision frictionless |
| 03 | La méthode + Damien | Autorité · certifs · **[photo placeholder]** |
| 04 | 1 membre = 1 club | 3 mock-ups CSS épurés (Runner / CrossFitter / Footballeur) |
| 05 | Résultats membres | **[stories placeholder]** — layout fini |
| 06 | Les 3 portes | Diagnostic · Timer · Club + pricing |
| 07 | Footer | Mission + légal |

## Notes techniques
- Palette **strictement** design system Mobility Club (mint `#3ECFA0` = accent unique).
- Fonts : Plus Jakarta Sans + JetBrains Mono (Google Fonts CDN).
- Motion : `IntersectionObserver` (reveals) + hover CSS. **Aucune librairie externe.**
- `prefers-reduced-motion` respecté (reveals désactivés, contenu visible).
- Responsive : `clamp()` + breakpoints 900 px / 560 px. Mobile-first, cibles tactiles ≥ 44 px.
- Mock-ups produit = **représentations CSS épurées**, jamais de vraie capture Dashboard
  (cohérence anti-imposture : on ne montre pas visuellement ce qui n'existe pas encore).
