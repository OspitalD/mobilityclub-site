import { T } from '../textes.ts';

// Signature en haut de chaque écran, comme .signature de la page de vente. Le médaillon est une image
// publique du site (déjà servie par la page de vente), pas un contenu du kit.
export function Signature({ lien = false }: { lien?: boolean }) {
  const contenu = (<><img className="medaillon" src="/kit-app-sexy/media/damien.jpg" alt="" width={40} height={40} />{T.marque}</>);
  return lien ? <a className="signature" href="#/">{contenu}</a> : <p className="signature">{contenu}</p>;
}
