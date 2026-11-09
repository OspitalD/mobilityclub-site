import { useEffect } from 'react';
import { urlContenu, urlFichier } from '../api.ts';
import { jourLisible, tailleLisible } from '../dates.ts';
import { useSession } from '../session.ts';
import { noterOuverte } from '../stockage.ts';
import { T } from '../textes.ts';
import { Fleche } from '../ui/Bouton.tsx';
import { Page } from '../ui/Page.tsx';
import { Bandeau } from '../ui/Bandeau.tsx';

const L = T.livraison;

export function Livraison({ slug }: { slug: string }) {
  const { moi } = useSession();
  const liv = moi.livraisons.find((l) => l.slug === slug);

  // Slug inconnu : retour à l'accueil. Une livraison ouverte est mémorisée pour que le bouton vert de
  // l'accueil passe à la suite.
  useEffect(() => {
    if (!liv) window.location.hash = '#/';
    else if (liv.etat === 'disponible') noterOuverte(moi.email, liv.slug);
  }, [liv, moi.email]);

  if (!liv) return null;

  if (liv.etat !== 'disponible') {
    return (
      <Page retour>
        <h1 className="moyen">{liv.titre}</h1>
        <p className={`chapo ${liv.etat === 'en_preparation' ? 'violet' : ''}`}>
          {liv.etat === 'en_preparation' ? L.enPreparation : L.arrive(jourLisible(liv.date), Boolean(liv.au_plus_tard))}
        </p>
      </Page>
    );
  }

  return (
    <>
      <Bandeau />
      <div className="lecteur">
        <div className="lecteur-barre">
          <a className="retour" href="#/">{T.retour}</a>
          <a className="lien" href={urlContenu(liv.slug)} target="_blank" rel="noopener noreferrer">{L.nouvelOnglet}</a>
        </div>
        <iframe
          className="lecteur-cadre"
          title={liv.titre}
          src={urlContenu(liv.slug)}
          allow="fullscreen; picture-in-picture; autoplay; encrypted-media"
          allowFullScreen
        />
        {liv.fichiers && liv.fichiers.length > 0 && (
          <section className="w lecteur-fichiers" aria-labelledby="titre-fichiers">
            <h2 id="titre-fichiers">{L.fichiers}</h2>
            <ul className="lignes">
              {liv.fichiers.map((f) => (
                <li key={f.nom}>
                  <a className="ligne" href={urlFichier(liv.slug, f.nom)} download>
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
