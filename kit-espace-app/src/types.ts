// Formes des réponses de /api/kit-app-sexy/*. Le front ne recalcule rien : complétude, état des
// livraisons et échéance du bonus viennent du serveur.

export type TypeApp = 'app' | 'plateforme' | 'aucune';

export interface Inspiration { url: string; note: string | null }

export interface Dossier {
  nom: string | null;
  lien: string | null;
  type: TypeApp | null;
  pour_qui: string | null;
  couleurs: string[];
  voix: string[];
  inspirations: Inspiration[];
  ecran_matin: string | null;
}

export type EtatLivraison = 'a_venir' | 'en_preparation' | 'disponible';

export interface FichierJoint { nom: string; octets: number }

export interface Livraison {
  slug: string;
  titre: string;
  date: string;
  au_plus_tard?: boolean;
  etat: EtatLivraison;
  fichiers?: FichierJoint[];
}

export interface Moi {
  email: string;
  rang: number | null;
  audit: boolean;
  bonus: boolean;
  source: 'paypal' | 'manuel';
  achete_le: string | null;
  contact: string;
  livraisons: Livraison[];
  dossier: { completude: number; updated_at: string | null };
  captures: { nombre: number; max: number };
  bonus_echeance: string | null;
}

export interface ReponseDossier {
  dossier: Dossier | null;
  rev: number;
  updated_at: string | null;
  completude: number;
}

export type ResultatEcriture =
  | { ok: true; rev: number; updated_at: string; completude: number }
  | { ok: false; conflit: true; dossier: Dossier | null; rev: number; updated_at: string; completude: number };

export interface Capture {
  id: string;
  type: 'image/png' | 'image/jpeg' | 'image/webp';
  octets: number;
  largeur: number | null;
  hauteur: number | null;
  note: string | null;
  created_at: string;
  url: string;
}
