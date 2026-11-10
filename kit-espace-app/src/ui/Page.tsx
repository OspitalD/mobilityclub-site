import type { ReactNode } from 'react';
import { T } from '../textes.ts';
import { Bandeau } from './Bandeau.tsx';
import { Signature } from './Signature.tsx';

// Coquille de chaque écran : bandeau hors ligne, signature, lien de retour sur les écrans intérieurs.
export function Page({ children, retour = false, centre = false }: { children: ReactNode; retour?: boolean; centre?: boolean }) {
  return (
    <>
      <Bandeau />
      <div className={`page${centre ? ' centre' : ''}`}>
        <header className="w haut">
          <Signature lien={retour} />
          {retour && <a className="retour" href="#/">{T.retour}</a>}
        </header>
        <main className="w corps">{children}</main>
      </div>
    </>
  );
}
