# Méthode IKEA : API admin des accès

Contrat de l'API qui accorde, liste et révoque les accès à la formation `/methode-ikea`.
Elle est utilisée par la console de Damien (`console/index.html`, repo mobility-dashboard, servie sur `https://app.mobilityclub.co`) et par `scripts/methode-ikea.mjs`.
Code : `netlify/functions/methode-ikea-api.js` (site vitrine).

## Base et authentification

- Base : `https://www.mobilityclub.co/api/methode-ikea/admin`
- En-tête obligatoire : `Authorization: Bearer <METHODE_IKEA_ADMIN_TOKEN>`
  - Variable d'environnement Netlify du **site vitrine** (≥ 24 caractères), saisie par Damien.
  - La console doit avoir ce même jeton. Il ne doit jamais être commité ni exposé dans une page publique.
- Corps et réponses en JSON (`Content-Type: application/json`), toujours avec `Cache-Control: no-store`.
- Pas de cookie : l'admin ne dépend pas de la session acheteur.

## CORS

- Origines autorisées : `METHODE_IKEA_ADMIN_ORIGINS`, une liste séparée par des virgules. Par défaut : `https://app.mobilityclub.co`.
  Pour tester la console en local, ajouter par exemple `http://localhost:8888`.
- Le préflight `OPTIONS` répond `204` avec :
  - `Access-Control-Allow-Origin: <origine>`
  - `Access-Control-Allow-Methods: GET, POST, DELETE, PUT, OPTIONS`
  - `Access-Control-Allow-Headers: Authorization, Content-Type`
  - `Access-Control-Max-Age: 600`
- Une origine absente de la liste ne reçoit aucun en-tête CORS, et le navigateur bloque la requête.

## Objet « accès »

```json
{
  "email": "client@exemple.fr",
  "offre": "avec_appels",
  "source": "paypal",
  "note": "ancien acheteur 2025",
  "created_at": "2026-10-18T11:20:00.000Z",
  "updated_at": "2026-10-18T11:20:00.000Z",
  "purchases": [
    {
      "offre": "avec_appels",
      "order_id": "5O190127TN364715T",
      "capture_id": "3C679366HH908993F",
      "amount": "97.00",
      "payer_email": "payer@paypal.com",
      "paid_at": "2026-10-18T11:20:00.000Z"
    }
  ]
}
```

| Champ | Valeurs |
|---|---|
| `offre` | `avec_appels` (97 €, 2 appels de 30 min, lien Calendly) ou `sans_appels` (49 €). Même accès à la formation. Une fois `avec_appels`, l'accès le reste. |
| `source` | `paypal` (créé par une capture vérifiée) ou `manuel` (console/CLI) |
| `note` | texte libre (≤ 500 caractères) ou `null` |
| `purchases` | captures PayPal ; `[]` pour un ajout manuel |

L'email est toujours normalisé en minuscules, sans espaces. C'est la clé de l'accès.

## Endpoints

### `GET /access` : lister

`200` → `{ "access": [ <accès>, … ], "quota": { "mois": "2026-10", "places": 20, "restantes": 17 } }`, trié du plus ancien au plus récent.

`quota` donne l'état des places avec appels pour le mois civil en cours (heure de Paris). `places` vient de la variable `METHODE_IKEA_PLACES_APPELS` (20 par défaut, à valider). Seules les ventes PayPal `avec_appels` consomment une place : un accès ajouté à la main n'en consomme pas.

### `POST /access` : accorder

Corps (un email, ou plusieurs avec `emails`) :

```json
{ "email": "client@exemple.fr", "offre": "avec_appels", "source": "manuel", "note": "ancien acheteur" }
```

- `offre` est optionnel, `sans_appels` par défaut. Une autre valeur donne `400 { "error": "invalid_offer" }`.
- `source` est optionnel, `manuel` par défaut. Valeurs acceptées : `manuel`, `paypal`.
- `note` est optionnel.
- `200` → `{ "added": ["…"], "existing": ["…"], "invalid": [], "access": [ <accès>, … ] }`
  - Un email déjà présent est mis à jour (`existing`) : passage éventuel à `avec_appels`, nouvelle note. La date de création est conservée.
- `400 { "error": "invalid_email", "invalid": ["…"] }` si aucun email n'est valide.

### `DELETE /access?email=<email>` : révoquer

Accepte aussi le corps `{ "email": "…" }`.
`200` → `{ "removed": true|false, "email": "…" }`. La révocation coupe immédiatement les sessions ouvertes, car chaque affichage revérifie l'accès.

### `PUT /content` : déposer la formation (CLI uniquement)

Corps : le HTML complet (`Content-Type: text/html`), qui doit commencer par `<!doctype html>`, avec une limite de 5 Mo.
`200` → `{ "ok": true, "bytes": 742110 }`. À utiliser via `node scripts/methode-ikea.mjs content <fichier>`.

## Erreurs communes

| Statut | Corps | Cause |
|---|---|---|
| 401 | `{ "error": "unauthorized" }` | jeton absent, faux ou `METHODE_IKEA_ADMIN_TOKEN` non configuré |
| 400 | `{ "error": "invalid_json" }` | corps illisible |
| 404 | `{ "error": "not_found" }` | route inconnue |
| 405 | `{ "error": "method_not_allowed" }` | méthode non prévue |
| 500 | `{ "error": "server_error" }` | voir les logs de la Function `methode-ikea-api` |

## Exemple (console)

```js
const API = 'https://www.mobilityclub.co/api/methode-ikea/admin';
const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
await fetch(`${API}/access`, { method: 'POST', headers: h, body: JSON.stringify({ email, offre: 'avec_appels', note: 'ancien acheteur' }) });
const { access } = await (await fetch(`${API}/access`, { headers: h })).json();
await fetch(`${API}/access?email=${encodeURIComponent(email)}`, { method: 'DELETE', headers: h });
```
