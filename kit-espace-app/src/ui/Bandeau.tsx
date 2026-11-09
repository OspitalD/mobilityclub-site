import { T } from '../textes.ts';
import { useReseau } from '../useReseau.ts';

// Discret : une ligne en haut, pas une alerte. role=status annonce l'état sans couper la lecture.
export function Bandeau() {
  const { horsLigne } = useReseau();
  return <div role="status" aria-live="polite">{horsLigne && <p className="bandeau">{T.hors_ligne}</p>}</div>;
}
