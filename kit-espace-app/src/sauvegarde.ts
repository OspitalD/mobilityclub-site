import type { Dossier, ResultatEcriture } from './types.ts';

export const dossierVide = (): Dossier => ({
  nom: null, lien: null, type: null, pour_qui: null, couleurs: [], voix: [], inspirations: [], ecran_matin: null,
});

const CHAMPS = Object.keys(dossierVide()) as (keyof Dossier)[];
const egal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Fusion champ par champ après un 409. `base` est le dossier de la dernière sauvegarde réussie (ou lue) :
// un champ différent de la base a été modifié ICI depuis, il gagne ; les autres viennent du serveur. Sans
// ça, un onglet resté ouvert écraserait en silence ce qui a été écrit sur le téléphone.
export const fusionner = (base: Dossier | null, local: Dossier, serveur: Dossier): Dossier => {
  const b = base ?? dossierVide();
  const r: Dossier = { ...serveur };
  for (const k of CHAMPS) if (!egal(local[k], b[k])) (r as unknown as Record<string, unknown>)[k] = local[k];
  return r;
};

export interface ResultatSauvegarde {
  rev: number;
  updated_at: string;
  completude: number;
  dossier: Dossier;
  /** Vrai quand deux 409 de suite ont forcé à reprendre la version du serveur telle quelle. */
  adopteServeur: boolean;
}

// Un PUT, et au plus UN nouveau PUT après fusion. Au deuxième 409, un autre appareil écrit en même
// temps que nous : insister ferait une boucle, on adopte donc la version du serveur et on le dit.
export const sauvegarder = async (a: {
  local: Dossier;
  derniere: Dossier | null;
  rev: number;
  ecrire: (d: Dossier, baseRev: number) => Promise<ResultatEcriture>;
}): Promise<ResultatSauvegarde> => {
  const r1 = await a.ecrire(a.local, a.rev);
  if (r1.ok) return { rev: r1.rev, updated_at: r1.updated_at, completude: r1.completude, dossier: a.local, adopteServeur: false };
  const fusion = fusionner(a.derniere, a.local, r1.dossier ?? dossierVide());
  const r2 = await a.ecrire(fusion, r1.rev);
  if (r2.ok) return { rev: r2.rev, updated_at: r2.updated_at, completude: r2.completude, dossier: fusion, adopteServeur: false };
  return { rev: r2.rev, updated_at: r2.updated_at, completude: r2.completude, dossier: r2.dossier ?? dossierVide(), adopteServeur: true };
};
