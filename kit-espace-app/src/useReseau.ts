import { useEffect, useSyncExternalStore } from 'react';
import { surResultatReseau } from './api.ts';

// Deux sources de vérité pour « hors ligne » : navigator.onLine (rapide mais menteur sur un wifi sans
// internet) et le dernier fetch (TypeError = pas de réseau, quoi que dise le navigateur). Un fetch qui
// aboutit remet tout au vert.
interface Etat { enLigne: boolean; panne: boolean }
let etat: Etat = { enLigne: typeof navigator === 'undefined' ? true : navigator.onLine, panne: false };
const ecouteurs = new Set<() => void>();
const maj = (p: Partial<Etat>) => {
  const suivant = { ...etat, ...p };
  if (suivant.enLigne === etat.enLigne && suivant.panne === etat.panne) return;
  etat = suivant;
  ecouteurs.forEach((f) => f());
};

export const brancherReseau = () => {
  surResultatReseau((ok) => maj({ panne: !ok }));
  window.addEventListener('online', () => maj({ enLigne: true, panne: false }));
  window.addEventListener('offline', () => maj({ enLigne: false }));
};

export const useReseau = () => {
  const e = useSyncExternalStore((f) => { ecouteurs.add(f); return () => ecouteurs.delete(f); }, () => etat, () => etat);
  return { horsLigne: !e.enLigne || e.panne, enLigne: e.enLigne };
};

// Le téléphone revient de veille ou l'onglet repasse devant : un autre appareil a pu écrire entre-temps.
export const useRetourPremierPlan = (rappel: () => void) => {
  useEffect(() => {
    const f = () => { if (document.visibilityState === 'visible') rappel(); };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [rappel]);
};

// Quand le réseau revient (événement online), pour renvoyer ce qui attendait.
export const useRetourReseau = (rappel: () => void) => {
  useEffect(() => {
    window.addEventListener('online', rappel);
    return () => window.removeEventListener('online', rappel);
  }, [rappel]);
};
