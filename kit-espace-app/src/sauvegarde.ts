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
  /**
   * Vrai quand un 409 a été fusionné ET que la fusion contient des champs que l'écran n'avait pas : les
   * composants non contrôlés (assistant) gardent leurs anciennes valeurs et les renverraient au prochain
   * changement, effaçant ce que l'autre appareil vient d'écrire. Il faut les remonter.
   */
  apporteDuServeur: boolean;
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
  if (r1.ok) return { rev: r1.rev, updated_at: r1.updated_at, completude: r1.completude, dossier: a.local, adopteServeur: false, apporteDuServeur: false };
  const fusion = fusionner(a.derniere, a.local, r1.dossier ?? dossierVide());
  const r2 = await a.ecrire(fusion, r1.rev);
  if (r2.ok) return { rev: r2.rev, updated_at: r2.updated_at, completude: r2.completude, dossier: fusion, adopteServeur: false, apporteDuServeur: !egal(fusion, a.local) };
  return { rev: r2.rev, updated_at: r2.updated_at, completude: r2.completude, dossier: r2.dossier ?? dossierVide(), adopteServeur: true, apporteDuServeur: true };
};

// Brouillon local. Il garde la BASE sur laquelle il a été écrit (le dernier dossier sauvegardé ou lu) : c'est
// elle qui dit, au rechargement, quels champs l'acheteur a vraiment touchés. Sans base, un brouillon ancien
// écraserait tout ce qui a été saisi ailleurs entre-temps, sans même provoquer de 409.
export interface Brouillon { base_rev: number; base: Dossier | null; dossier: Dossier }

export const serialiserBrouillon = (baseRev: number, base: Dossier | null, dossier: Dossier): string =>
  JSON.stringify({ base_rev: baseRev, base, dossier } satisfies Brouillon);

export const lireBrouillon = (brut: string | null): Brouillon | null => {
  if (!brut) return null;
  try {
    const v = JSON.parse(brut) as Partial<Brouillon> & Partial<Dossier>;
    if (!v || typeof v !== 'object') return null;
    // Format d'avant la base : le dossier nu. On ne sait pas d'où il part, la base est donc inconnue.
    if (!('dossier' in v) || typeof v.dossier !== 'object' || v.dossier === null) {
      return { base_rev: 0, base: null, dossier: { ...dossierVide(), ...(v as Partial<Dossier>) } };
    }
    return {
      base_rev: typeof v.base_rev === 'number' ? v.base_rev : 0,
      base: v.base ? { ...dossierVide(), ...v.base } : null,
      dossier: { ...dossierVide(), ...v.dossier },
    };
  } catch { return null; }
};

// Au chargement : le brouillon rejoint le serveur par la même fusion que le 409, et non en le remplaçant.
// `sale` dit s'il reste quelque chose à envoyer.
export const restaurer = (a: { brouillon: Brouillon | null; serveur: Dossier | null }): { local: Dossier; sale: boolean } => {
  const serveur = a.serveur ?? dossierVide();
  if (!a.brouillon) return { local: serveur, sale: false };
  const local = fusionner(a.brouillon.base, a.brouillon.dossier, serveur);
  return { local, sale: !egal(local, serveur) };
};
