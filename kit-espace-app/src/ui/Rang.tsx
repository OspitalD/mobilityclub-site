import { CountUp } from '../components/10k/web-count-up/CountUp.tsx';

// Le rang d'achat, en or. startOnView=false : le héros est déjà à l'écran à l'ouverture, le compteur
// démarre tout de suite au lieu d'attendre un défilement qui n'arrivera pas.
export function Rang({ valeur }: { valeur: number }) {
  return <CountUp value={valeur} prefix="n° " locale="fr-FR" grouped={false} startOnView={false} duration={1400} className="rang" />;
}
