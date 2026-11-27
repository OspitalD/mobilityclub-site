import { useEffect } from 'react';
import { urlPersoFichier, urlPersoPage } from '../api.ts';
import { tailleLisible } from '../dates.ts';
import { useSession } from '../session.ts';
import { T } from '../textes.ts';
import { Bandeau } from '../ui/Bandeau.tsx';
import { Fleche } from '../ui/Bouton.tsx';

const R = T.rendu;

// La page personnelle de l'acheteur, dans le même lecteur que les livraisons. Le serveur ne la sert qu'à
// la session de CET acheteur : l'iframe d'un autre recevrait un 404.
export function Rendu() {
  const { moi } = useSession();
  const page = moi.perso?.page;
  useEffect(() => { if (!page) window.location.hash = '#/'; }, [page]);
  if (!page || !moi.perso) return null;

  return (
    <>
      <Bandeau />
      <div className="lecteur">
        <div className="lecteur-barre">
          <a className="retour" href="#/">{T.retour}</a>
          <a className="lien" href={urlPersoPage()} target="_blank" rel="noopener noreferrer">{T.livraison.nouvelOnglet}</a>
        </div>
        <iframe className="lecteur-cadre" title={page.titre || R.page} src={urlPersoPage()} allow="fullscreen" allowFullScreen />
        {moi.perso.fichiers.length > 0 && (
          <section className="w lecteur-fichiers" aria-labelledby="titre-fichiers-rendu">
            <h2 id="titre-fichiers-rendu">{R.fichiers}</h2>
            <ul className="lignes">
              {moi.perso.fichiers.map((f) => (
                <li key={f.nom}>
                  <a className="ligne" href={urlPersoFichier(f.nom)} download>
                    <span className="t">{f.nom}</span>
                    <span className="info">{tailleLisible(f.octets)} <span className="fleche"><Fleche /></span></span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
