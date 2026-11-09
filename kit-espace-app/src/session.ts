import { createContext, useContext } from 'react';
import type { Moi } from './types.ts';

export interface Session {
  moi: Moi;
  majMoi: () => Promise<void>;
  /** Traite un 401 (retour à la connexion) ou un 403 acces_coupe (accès fermé). Vrai si l'erreur est prise en charge. */
  gerer: (e: unknown) => boolean;
}

export const SessionCtx = createContext<Session | null>(null);

export const useSession = (): Session => {
  const s = useContext(SessionCtx);
  if (!s) throw new Error('useSession hors de l\'espace connecté');
  return s;
};
