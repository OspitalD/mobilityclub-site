import { useEffect, useState } from 'react';

/* Offre de sortie V2 : lue dans window.MC_SORTIE (posée dans index.html, une seule heure de fin). */
export type Phase = 'fenetre' | 'v2';
type Config = {
  fin: string;
  prix: { mensuel: number; vie: number };
  prix_v2: { mensuel: number; vie: number };
  liens: Record<Phase, { vie: string }>;
};
declare global { interface Window { MC_SORTIE: Config } }

export const OFFRE: Config = window.MC_SORTIE;
const FIN = Date.parse(OFFRE.fin);

export const phaseA = (t = Date.now()): Phase => (t >= FIN ? 'v2' : 'fenetre');

/** Phase courante + compte à rebours HH:MM:SS, rafraîchis chaque seconde ; bascule seule à l'heure de fin. */
export function useOffre() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const phase = phaseA(now);
  const reste = Math.max(0, FIN - now);
  const s = Math.floor(reste / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    phase,
    compteur: `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`,
    prix: phase === 'v2' ? OFFRE.prix_v2 : OFFRE.prix,
    prixApres: OFFRE.prix_v2,
    lienVie: OFFRE.liens[phase].vie,
  };
}

/** 62,25 (fr) / 62.25 (en), sans « ,00 ». */
export function fmt(n: number, lang: 'fr' | 'en') {
  const sep = lang === 'en' ? '.' : ',';
  const x = (Math.round(n * 100) / 100).toFixed(2).replace('.', sep);
  return x.endsWith(sep + '00') ? x.slice(0, -3) : x;
}
