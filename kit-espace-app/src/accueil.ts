import type { Moi } from './types.ts';

export type ActionPrincipale =
  | { type: 'livraison'; slug: string; titre: string }
  | { type: 'dossier'; commencer: boolean }
  | { type: 'captures' }
  | null;

// Une seule action verte sur l'accueil, choisie dans cet ordre : ce qui vient d'arriver, puis le dossier,
// puis les captures. `ouvertes` est la mémoire locale des livraisons déjà ouvertes : sans elle, le bouton
// « Ouvrir la vidéo » resterait vert pour toujours et masquerait la suite.
export const actionPrincipale = (moi: Pick<Moi, 'livraisons' | 'dossier' | 'captures'>, ouvertes: ReadonlySet<string>): ActionPrincipale => {
  const neuve = moi.livraisons.find((l) => l.etat === 'disponible' && !ouvertes.has(l.slug));
  if (neuve) return { type: 'livraison', slug: neuve.slug, titre: neuve.titre };
  if (moi.dossier.completude < 100) return { type: 'dossier', commencer: moi.dossier.completude === 0 };
  if (moi.captures.nombre === 0) return { type: 'captures' };
  return null;
};
