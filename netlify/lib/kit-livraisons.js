// Kit App Sexy — calendrier des livraisons, sans aucune dépendance au stockage.
//
// POURQUOI UN FICHIER À PART. L'email de bienvenue (kit-app-sexy.js) doit savoir quelles
// livraisons sont déjà ouvertes, et l'espace (kit-espace.js) importe lui-même kit-app-sexy.js :
// mettre le calendrier dans kit-espace.js créerait un import circulaire. Ici, rien que des
// constantes et une fonction pure.
//
// LES DATES SONT FIGÉES DANS LE CODE (heure de Paris). Ce sont des promesses publiques de la page
// de vente : aucune variable d'environnement ne doit pouvoir les avancer en prod. Damien peut ouvrir
// une livraison AVANT sa date (ouvert_des), jamais la repousser.

export const LIVRAISONS = [
  { slug: 'video', titre: 'La vidéo V1 contre V2', date: '2026-11-18T00:00:00+01:00' },
  { slug: 'grille', titre: 'La grille des émotions', date: '2026-11-18T00:00:00+01:00' },
  { slug: 'audit', titre: "Le kit d'audit pour Claude", date: '2026-11-25T00:00:00+01:00', au_plus_tard: true },
];

export const livraison = (slug) => LIVRAISONS.find((l) => l.slug === slug) || null;

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// « 18 novembre », jour de Paris (la date promise est à minuit heure de Paris).
export const dateLisible = (iso) => {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'numeric' })
    .formatToParts(new Date(iso));
  const jour = Number(parts.find((x) => x.type === 'day').value);
  const mois = Number(parts.find((x) => x.type === 'month').value);
  return `${jour === 1 ? '1er' : jour} ${MOIS[mois - 1]}`;
};

// disponible : contenu déposé ET (date passée OU ouverture anticipée) ; en_preparation : date passée mais
// rien de déposé ; a_venir : sinon. `meta` = contenus-meta/<slug> (null si rien déposé).
export const calculerEtat = (liv, meta, maintenant = new Date()) => {
  const t = maintenant.getTime();
  const date = Date.parse(liv.date);
  const ouvertDes = meta?.ouvert_des ? Math.min(date, Date.parse(meta.ouvert_des)) : date;
  if (meta && t >= ouvertDes) return 'disponible';
  if (t >= date) return 'en_preparation';
  return 'a_venir';
};
