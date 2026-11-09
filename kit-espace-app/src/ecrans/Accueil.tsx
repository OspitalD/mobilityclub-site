import { useEffect, useMemo } from 'react';
import { deconnecter } from '../api.ts';
import { actionPrincipale } from '../accueil.ts';
import { jourLisible } from '../dates.ts';
import { useSession } from '../session.ts';
import { lireOuvertes } from '../stockage.ts';
import { T } from '../textes.ts';
import type { Livraison } from '../types.ts';
import { Apparait } from '../ui/Apparait.tsx';
import { Bouton, Fleche } from '../ui/Bouton.tsx';
import { Page } from '../ui/Page.tsx';
import { Progression3px } from '../ui/Progression3px.tsx';
import { Rang } from '../ui/Rang.tsx';
import { Verre } from '../ui/Verre.tsx';

// Les livraisons qui tombent le même jour se lisent ensemble : « 18 novembre » porte la vidéo et la grille.
const grouper = (livraisons: Livraison[]) => {
  const groupes = new Map<string, Livraison[]>();
  for (const l of livraisons) groupes.set(jourLisible(l.date), [...(groupes.get(jourLisible(l.date)) ?? []), l]);
  return [...groupes.entries()].map(([jour, items]) => ({ jour, items, auPlusTard: items.some((i) => i.au_plus_tard) }));
};

export function Accueil() {
  const { moi, majMoi } = useSession();
  // Les chiffres de l'accueil viennent d'un GET moi frais à chaque arrivée : on revient souvent du dossier ou des captures.
  useEffect(() => { void majMoi(); }, [majMoi]);

  const action = useMemo(() => actionPrincipale(moi, lireOuvertes(moi.email)), [moi]);
  const groupes = useMemo(() => grouper(moi.livraisons), [moi.livraisons]);
  const A = T.accueil;

  const deco = async () => {
    try { await deconnecter(); } catch { /* le cookie sera refusé de toute façon à la prochaine requête */ }
    window.location.reload();
  };

  return (
    <Page>
      <div className="accueil">
        <Apparait className="accueil-hero">
          <Verre halo>
            <div className="hero">
              {moi.rang !== null ? (
                <>
                  <h1 className="hero-titre">{A.acheteur}</h1>
                  <div className="hero-rang"><Rang valeur={moi.rang} /></div>
                </>
              ) : (
                <h1 className="hero-titre grand">{A.manuel}</h1>
              )}
              {moi.audit && <p className="or hero-ligne">{A.audit}</p>}
              {moi.bonus && <p className="or hero-ligne">{moi.bonus_echeance ? A.bonusAvec(jourLisible(moi.bonus_echeance)) : A.bonusSans}</p>}
              {action && (
                <div className="hero-action">
                  {action.type === 'livraison' && <Bouton href={`#/livraison/${action.slug}`}>{A.ouvrir(action.titre)}</Bouton>}
                  {action.type === 'dossier' && <Bouton href="#/dossier">{action.commencer ? A.commencerDossier : A.completerDossier}</Bouton>}
                  {action.type === 'captures' && <Bouton href="#/captures">{A.deposer}</Bouton>}
                </div>
              )}
            </div>
          </Verre>
        </Apparait>

        <div className="accueil-suite">
          <Apparait delai={0.06}>
            <div className="lignes">
              <a className="ligne" href="#/dossier">
                <span className="t">{A.dossier}</span>
                <span className="v vert">{A.dossierPct(moi.dossier.completude)}</span>
                <Progression3px pct={moi.dossier.completude} label={A.dossier} />
              </a>
              <a className="ligne dernier" href="#/captures">
                <span className="t">{A.captures}</span>
                <span className="v">{A.capturesN(moi.captures.nombre, moi.captures.max)}</span>
                <Progression3px pct={(100 * moi.captures.nombre) / moi.captures.max} label={A.captures} />
              </a>
            </div>
          </Apparait>

          <Apparait delai={0.1}>
            <section className="frise" aria-labelledby="titre-frise">
              <h2 id="titre-frise">{A.livraisons}</h2>
              <div className="lignes">
                {groupes.map((g) => (
                  <div className="jour-groupe" key={g.jour}>
                    <p className="jour it">{g.jour}{g.auPlusTard && <span className="jour-suffixe"> {A.auPlusTard}</span>}</p>
                    <ul className="jour-liste">
                      {g.items.map((l) => (
                        <li key={l.slug} className={`liv ${l.etat}`}>
                          {l.etat === 'disponible' ? (
                            <a className="liv-lien" href={`#/livraison/${l.slug}`}>
                              <span><span className="liv-titre">{l.titre}</span><span className="liv-etat">{A.disponible}</span></span>
                              <span className="fleche"><Fleche /></span>
                            </a>
                          ) : (
                            <>
                              <span className="liv-titre">{l.titre}</span>
                              <span className="liv-etat">{l.etat === 'en_preparation' ? A.enPreparation : A.aVenir(jourLisible(l.date), Boolean(l.au_plus_tard))}</span>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          </Apparait>
        </div>
      </div>

      <p className="pied">{A.garantie}</p>
      <button type="button" className="lien" onClick={() => void deco()}>{A.deconnexion}</button>
    </Page>
  );
}
