import { T } from '../textes.ts';
import { Bouton } from '../ui/Bouton.tsx';
import { Page } from '../ui/Page.tsx';

export function Reseau({ onReessayer, message }: { onReessayer: () => void; message?: string }) {
  return (
    <Page centre>
      <h1>{T.reseau.titre}</h1>
      <p className="chapo">{message ?? T.reseau.chapo}</p>
      <div className="action-simple"><Bouton onClick={onReessayer}>{T.reseau.reessayer}</Bouton></div>
    </Page>
  );
}
