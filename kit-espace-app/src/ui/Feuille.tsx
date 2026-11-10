// Enveloppes françaises des composants web-sheet-modal : libellés par défaut, aucune modification du
// composant (il est réinstallé tel quel, voir README). Le look vient de adaptations-10k.css.
import type { ComponentProps } from 'react';
import { CopyButton, EmptyState, Field, SheetModal } from '../components/10k/web-sheet-modal/SheetModal.tsx';
import { T } from '../textes.ts';

export function Feuille(props: ComponentProps<typeof SheetModal>) {
  return <SheetModal closeLabel={T.fermer} {...props} />;
}

export function Copier({ valeur }: { valeur: string }) {
  return <CopyButton value={valeur} label={T.ferme.copier} copiedLabel={T.ferme.copie} failedLabel={T.ferme.echec} />;
}

export { EmptyState, Field };
