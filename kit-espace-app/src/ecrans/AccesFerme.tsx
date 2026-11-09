import { CONTACT, T } from '../textes.ts';
import { Copier } from '../ui/Feuille.tsx';
import { Page } from '../ui/Page.tsx';

// Aucune autre donnée que le contact : l'accès est coupé (remboursement, purge), l'écran ne doit rien dire de plus.
export function AccesFerme() {
  return (
    <Page centre>
      <h1>{T.ferme.titre}</h1>
      <p className="chapo">{T.ferme.ecris} <a className="lien-mail" href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
      <div className="action-simple"><Copier valeur={CONTACT} /></div>
    </Page>
  );
}
