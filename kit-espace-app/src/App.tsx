import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErreurApi, moi as chargerMoi } from './api.ts';
import { Accueil } from './ecrans/Accueil.tsx';
import { AccesFerme } from './ecrans/AccesFerme.tsx';
import { Captures } from './ecrans/Captures.tsx';
import { Connexion } from './ecrans/Connexion.tsx';
import { Dossier } from './ecrans/Dossier.tsx';
import { Livraison } from './ecrans/Livraison.tsx';
import { Reseau } from './ecrans/Reseau.tsx';
import { SessionCtx, type Session } from './session.ts';
import { CLE_EMAIL, lireLocal } from './stockage.ts';
import { T } from './textes.ts';
import type { Moi } from './types.ts';
import { useRetourPremierPlan } from './useReseau.ts';
import { Bandeau } from './ui/Bandeau.tsx';
import { Signature } from './ui/Signature.tsx';

type Etat =
  | { t: 'chargement' }
  | { t: 'connexion'; email: string; expiree: boolean }
  | { t: 'ferme' }
  | { t: 'reseau'; message?: string }
  | { t: 'ok'; moi: Moi };

const lireRoute = () => {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  if (a === 'dossier') return { nom: 'dossier' as const };
  if (a === 'captures') return { nom: 'captures' as const };
  if (a === 'livraison' && b) return { nom: 'livraison' as const, slug: decodeURIComponent(b) };
  return { nom: 'accueil' as const };
};

const useRoute = () => {
  const [route, setRoute] = useState(lireRoute);
  useEffect(() => {
    const f = () => { setRoute(lireRoute()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return route;
};

export function App() {
  const [etat, setEtat] = useState<Etat>({ t: 'chargement' });
  const route = useRoute();
  const dernierChargement = useRef(0);
  const emailRef = useRef('');
  // Route d'avant la perte de session : la reconnexion y revient au lieu de renvoyer sur l'accueil.
  const routeAvant = useRef('#/');
  const memoriserRoute = () => { routeAvant.current = window.location.hash || '#/'; };

  // 401 : retour à la connexion, email prérempli (le brouillon du dossier reste en localStorage). 403 acces_coupe :
  // écran fermé. Le reste (réseau, 500) est laissé à l'écran qui a appelé.
  const gerer = useCallback((e: unknown): boolean => {
    if (!(e instanceof ErreurApi)) return false;
    if (e.statut === 401) {
      memoriserRoute();
      setEtat({ t: 'connexion', email: emailRef.current || lireLocal(CLE_EMAIL) || '', expiree: true });
      return true;
    }
    if (e.statut === 403 && e.code === 'acces_coupe') { setEtat({ t: 'ferme' }); return true; }
    return false;
  }, []);

  const charger = useCallback(async () => {
    try {
      const m = await chargerMoi();
      dernierChargement.current = Date.now();
      emailRef.current = m.email;
      setEtat({ t: 'ok', moi: m });
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 401) { memoriserRoute(); setEtat({ t: 'connexion', email: lireLocal(CLE_EMAIL) || '', expiree: false }); }
      else if (gerer(e)) return;
      else setEtat({ t: 'reseau', message: e instanceof ErreurApi && e.code === 'reseau' ? undefined : T.erreur });
    }
  }, [gerer]);

  useEffect(() => { void charger(); }, [charger]);

  const majMoi = useCallback(async () => {
    // Un GET moi tout juste fait (arrivée depuis la connexion) n'a pas besoin d'être refait.
    if (Date.now() - dernierChargement.current < 1500) return;
    try {
      const m = await chargerMoi();
      dernierChargement.current = Date.now();
      setEtat((x) => (x.t === 'ok' ? { t: 'ok', moi: m } : x));
    } catch (e) { gerer(e); }
  }, [gerer]);

  const etatRef = useRef(etat);
  etatRef.current = etat;
  useRetourPremierPlan(useCallback(() => { if (etatRef.current.t === 'ok') void majMoi(); }, [majMoi]));

  const session = useMemo<Session | null>(() => (etat.t === 'ok' ? { moi: etat.moi, majMoi, gerer } : null), [etat, majMoi, gerer]);

  if (etat.t === 'chargement') {
    // Fond, signature et barre de 3 px : pas de squelette en cartes.
    return (
      <>
        <div className="barre-haut" role="progressbar" aria-label={T.chargement}><i /></div>
        <div className="page"><header className="w haut"><Signature /></header></div>
        <Bandeau />
      </>
    );
  }
  if (etat.t === 'connexion') {
    return <Connexion emailInitial={etat.email} expiree={etat.expiree} onFerme={() => setEtat({ t: 'ferme' })} onConnecte={() => { window.location.hash = routeAvant.current; dernierChargement.current = 0; setEtat({ t: 'chargement' }); void charger(); }} />;
  }
  if (etat.t === 'ferme') return <AccesFerme />;
  if (etat.t === 'reseau') return <Reseau message={etat.message} onReessayer={() => { setEtat({ t: 'chargement' }); void charger(); }} />;

  return (
    <SessionCtx.Provider value={session}>
      {route.nom === 'dossier' ? <Dossier />
        : route.nom === 'captures' ? <Captures />
        : route.nom === 'livraison' ? <Livraison slug={route.slug} />
        : <Accueil />}
    </SessionCtx.Provider>
  );
}
