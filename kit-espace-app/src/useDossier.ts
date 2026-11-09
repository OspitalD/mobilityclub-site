import { useCallback, useEffect, useRef, useState } from 'react';
import { ErreurApi, ecrireDossier, lireDossier } from './api.ts';
import { dossierVide, fusionner, sauvegarder } from './sauvegarde.ts';
import { cleBrouillon, ecrireLocal, effacerLocal, lireLocal } from './stockage.ts';
import { T } from './textes.ts';
import type { Dossier } from './types.ts';
import { useRetourPremierPlan, useRetourReseau } from './useReseau.ts';

export type EtatSauvegarde = 'repos' | 'attente' | 'envoi' | 'sauve' | 'hors_ligne' | 'erreur';

const DEBOUNCE_MS = 800;
const egal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Sauvegarde automatique du dossier : tout ce que tape l'acheteur part seul, 800 ms après la dernière
// frappe, et à la fermeture de l'onglet. Aucun champ n'est obligatoire.
//
// POURQUOI TANT DE REFS. Les écritures sont asynchrones et l'acheteur continue de taper pendant qu'elles
// volent : l'état React serait périmé dans les callbacks. Les refs gardent la vérité courante (dossier
// local, révision, dernier état sauvegardé, « sale » = modifié depuis la dernière sauvegarde réussie).
export function useDossier(email: string, gerer: (e: unknown) => boolean) {
  const [charge, setCharge] = useState<'chargement' | 'pret' | 'erreur'>('chargement');
  const [dossier, setDossierEtat] = useState<Dossier>(dossierVide());
  const [existe, setExiste] = useState(false);
  const [completude, setCompletude] = useState(0);
  const [etat, setEtat] = useState<EtatSauvegarde>('repos');
  const [message, setMessage] = useState<string | null>(null);
  // Incrémentée quand la version du serveur remplace la mienne : les composants non contrôlés (assistant)
  // se remontent avec cette clé et repartent des bonnes valeurs.
  const [cle, setCle] = useState(0);

  const courant = useRef<Dossier>(dossierVide());
  const rev = useRef(0);
  const derniere = useRef<Dossier | null>(null);
  const sale = useRef(false);
  const enVol = useRef(false);
  const rejouer = useRef(false);
  const minuteur = useRef<number | undefined>(undefined);
  const emailRef = useRef(email);
  emailRef.current = email;
  const gererRef = useRef(gerer);
  gererRef.current = gerer;

  const poser = useCallback((d: Dossier) => { courant.current = d; setDossierEtat(d); }, []);

  const enregistrer = useCallback(async (o: { keepalive?: boolean } = {}) => {
    window.clearTimeout(minuteur.current);
    if (!sale.current) return;
    if (enVol.current) { rejouer.current = true; return; }
    if (!navigator.onLine) { setEtat('hors_ligne'); return; }
    enVol.current = true;
    setEtat('envoi');
    const instantane = courant.current;
    try {
      const r = await sauvegarder({
        local: instantane,
        derniere: derniere.current,
        rev: rev.current,
        ecrire: (d, base) => ecrireDossier(d, base, o),
      });
      rev.current = r.rev;
      setCompletude(r.completude);
      setExiste(true);
      if (r.adopteServeur) {
        // Deux 409 de suite : un autre appareil écrit en même temps. On reprend sa version, et on le dit.
        derniere.current = r.dossier;
        sale.current = false;
        poser(r.dossier);
        setCle((c) => c + 1);
        setMessage(T.dossier.adopte);
        effacerLocal(cleBrouillon(emailRef.current));
      } else {
        derniere.current = r.dossier;
        // Ce que l'acheteur a tapé pendant le vol gagne, mais on garde les champs du serveur venus de la fusion.
        const entreTemps = !egal(courant.current, instantane);
        if (entreTemps) poser(fusionner(instantane, courant.current, r.dossier));
        else poser(r.dossier);
        sale.current = entreTemps;
        setMessage(null);
        if (!entreTemps) effacerLocal(cleBrouillon(emailRef.current));
      }
      setEtat(sale.current ? 'attente' : 'sauve');
    } catch (e) {
      if (e instanceof ErreurApi && e.code === 'reseau') setEtat('hors_ligne');
      else if (gererRef.current(e)) setEtat('erreur');
      else if (e instanceof ErreurApi && (e.statut === 413 || e.code === 'too_large' || e.code === 'payload_too_large')) { setEtat('erreur'); setMessage(T.dossier.trop_long); }
      else { setEtat('erreur'); setMessage(T.erreur); }
    } finally {
      enVol.current = false;
      if (rejouer.current) { rejouer.current = false; if (sale.current) void enregistrer(); }
    }
  }, [poser]);

  const modifier = useCallback((f: (d: Dossier) => Dossier) => {
    const suivant = f(courant.current);
    if (egal(suivant, courant.current)) return;
    poser(suivant);
    sale.current = true;
    setMessage(null);
    setEtat('attente');
    // Brouillon local : si l'onglet meurt ou si la session expire avant l'envoi, rien n'est perdu.
    ecrireLocal(cleBrouillon(emailRef.current), JSON.stringify(suivant));
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => void enregistrer(), DEBOUNCE_MS);
  }, [enregistrer, poser]);

  const charger = useCallback(async () => {
    try {
      const r = await lireDossier();
      rev.current = r.rev;
      derniere.current = r.dossier;
      setCompletude(r.completude);
      setExiste(r.dossier !== null);
      let local = r.dossier ?? dossierVide();
      let brouillon: Dossier | null = null;
      try {
        const b = lireLocal(cleBrouillon(emailRef.current));
        if (b) brouillon = { ...dossierVide(), ...(JSON.parse(b) as Partial<Dossier>) };
      } catch { brouillon = null; }
      if (brouillon && !egal(brouillon, local)) {
        local = brouillon;
        sale.current = true;
        setEtat('attente');
        minuteur.current = window.setTimeout(() => void enregistrer(), DEBOUNCE_MS);
      } else {
        effacerLocal(cleBrouillon(emailRef.current));
        setEtat(r.dossier ? 'sauve' : 'repos');
      }
      poser(local);
      setCharge('pret');
    } catch (e) {
      if (!gererRef.current(e)) setCharge('erreur');
    }
  }, [enregistrer, poser]);

  useEffect(() => { void charger(); }, [charger]);

  // Relecture au retour au premier plan, seulement s'il n'y a rien en attente : un autre appareil a pu écrire.
  const relire = useCallback(async () => {
    if (sale.current || enVol.current) return;
    try {
      const r = await lireDossier();
      if (sale.current || enVol.current || r.rev === rev.current) return;
      rev.current = r.rev;
      derniere.current = r.dossier;
      setCompletude(r.completude);
      setExiste(r.dossier !== null);
      poser(r.dossier ?? dossierVide());
      setCle((c) => c + 1);
    } catch (e) { gererRef.current(e); }
  }, [poser]);
  useRetourPremierPlan(relire);
  useRetourReseau(useCallback(() => { if (sale.current) void enregistrer(); }, [enregistrer]));

  // Fermeture : fetch keepalive survit à la page qui se ferme. visibilitychange couvre Safari mobile, où
  // pagehide n'est pas toujours déclenché quand on change d'application.
  useEffect(() => {
    const vider = () => { if (sale.current) void enregistrer({ keepalive: true }); };
    const cache = () => { if (document.visibilityState === 'hidden') vider(); };
    window.addEventListener('pagehide', vider);
    document.addEventListener('visibilitychange', cache);
    return () => {
      window.removeEventListener('pagehide', vider);
      document.removeEventListener('visibilitychange', cache);
      window.clearTimeout(minuteur.current);
      // Sortie de l'écran (changement de route) : ce qui attend part tout de suite.
      if (sale.current) void enregistrer({ keepalive: true });
    };
  }, [enregistrer]);

  return { charge, dossier, existe, completude, etat, message, cle, modifier, recharger: charger };
}
