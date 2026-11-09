import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { ErreurApi, envoyerCapture, listerCaptures, noterCapture, supprimerCapture } from '../api.ts';
import { jourLisible } from '../dates.ts';
import { ImageIllisible, reduireImage } from '../reduireImage.ts';
import { useSession } from '../session.ts';
import { T } from '../textes.ts';
import type { Capture } from '../types.ts';
import { useReseau, useRetourPremierPlan } from '../useReseau.ts';
import { Apparait } from '../ui/Apparait.tsx';
import { Bouton } from '../ui/Bouton.tsx';
import { EmptyState, Feuille, Field } from '../ui/Feuille.tsx';
import { Page } from '../ui/Page.tsx';

const C = T.captures;
const TYPES_OK = ['image/png', 'image/jpeg', 'image/webp'];

interface EnCours { cle: number; apercu: string; ratio: number; progres: number }

const messageErreur = (e: unknown): string => {
  if (e instanceof ImageIllisible) return C.illisible;
  if (e instanceof ErreurApi) {
    if (e.code === 'limite_atteinte') return C.limite;
    if (e.code === 'unsupported_type') return C.fauxType;
    if (e.code === 'too_large' || e.statut === 413) return C.tropLourde;
  }
  return T.erreur;
};

export function Captures() {
  const { moi, majMoi, gerer } = useSession();
  const { horsLigne } = useReseau();
  const [liste, setListe] = useState<Capture[] | null>(null);
  const [max, setMax] = useState(moi.captures.max);
  const [enCours, setEnCours] = useState<EnCours[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [ouverte, setOuverte] = useState<Capture | null>(null);
  const [glisse, setGlisse] = useState(false);
  const [erreurChargement, setErreurChargement] = useState(false);
  const entree = useRef<HTMLInputElement>(null);
  // File d'envoi : un fichier à la fois, pour que la progression soit lisible et que le serveur ne reçoive
  // jamais 30 images en parallèle depuis un téléphone.
  const file = useRef<File[]>([]);
  const actif = useRef(false);
  const compteur = useRef(0);
  const listeRef = useRef<Capture[]>([]);
  listeRef.current = liste ?? [];

  const charger = useCallback(async () => {
    try {
      const r = await listerCaptures();
      setListe(r.captures); setMax(r.max); setErreurChargement(false);
    } catch (e) { if (!gerer(e)) setErreurChargement(true); }
  }, [gerer]);

  useEffect(() => { void charger(); }, [charger]);
  // Les captures n'ont pas de révision : au retour au premier plan, on relit la liste si rien ne vole.
  useRetourPremierPlan(useCallback(() => { if (!actif.current) void charger(); }, [charger]));

  const traiter = useCallback(async () => {
    if (actif.current) return;
    actif.current = true;
    while (file.current.length) {
      const fichier = file.current.shift() as File;
      const cle = ++compteur.current;
      const apercu = URL.createObjectURL(fichier);
      setEnCours((l) => [...l, { cle, apercu, ratio: 0.5625, progres: 0 }]);
      try {
        const r = await reduireImage(fichier);
        const c = await envoyerCapture(r.blob, { largeur: r.largeur, hauteur: r.hauteur }, (p) => setEnCours((l) => l.map((x) => (x.cle === cle ? { ...x, progres: p } : x))));
        setListe((l) => [...(l ?? []), c]);
      } catch (e) {
        if (!gerer(e)) setMessages((m) => [...m, messageErreur(e)]);
        if (e instanceof ErreurApi && e.code === 'limite_atteinte') file.current = [];
      } finally {
        URL.revokeObjectURL(apercu);
        setEnCours((l) => l.filter((x) => x.cle !== cle));
      }
    }
    actif.current = false;
    void majMoi();
  }, [gerer, majMoi]);

  const ajouter = useCallback((fichiers: File[]) => {
    if (!fichiers.length || liste === null) return;
    setMessages([]);
    const valides = fichiers.filter((f) => TYPES_OK.includes(f.type) || /^image\//.test(f.type));
    const illisibles = fichiers.length - valides.length;
    // Les places sont contrôlées AVANT tout envoi : on ne découvre pas la limite à la 29e image.
    const places = max - (listeRef.current.length + file.current.length + (actif.current ? 1 : 0));
    const prises = valides.slice(0, Math.max(0, places));
    const msgs: string[] = [];
    if (illisibles) msgs.push(C.illisible);
    if (valides.length > prises.length) msgs.push(places <= 0 ? C.limite : C.surplus(places));
    if (msgs.length) setMessages(msgs);
    file.current.push(...prises);
    if (prises.length) void traiter();
  }, [liste, max, traiter]);

  // Collage (Ctrl+V d'une capture d'écran) : utile sur ordinateur, inoffensif ailleurs.
  useEffect(() => {
    const coller = (e: ClipboardEvent) => {
      const fichiers = [...(e.clipboardData?.files ?? [])];
      if (fichiers.length) { e.preventDefault(); ajouter(fichiers); }
    };
    window.addEventListener('paste', coller);
    return () => window.removeEventListener('paste', coller);
  }, [ajouter]);

  const deposer = (e: DragEvent) => {
    e.preventDefault(); setGlisse(false);
    if (!horsLigne) ajouter([...e.dataTransfer.files]);
  };

  const nombre = (liste?.length ?? 0) + enCours.length;
  const vide = liste !== null && liste.length === 0 && enCours.length === 0;

  return (
    <Page retour>
      <div className="captures">
        <div className="captures-gauche">
          <h1 className="moyen">{C.titre}</h1>
          <p className="chapo">{C.chapo}</p>
          <p className="captures-n it">{C.compteur(nombre, max)}</p>
          {moi.bonus && <p className="or hero-ligne">{moi.bonus_echeance ? C.bonusAvec(jourLisible(moi.bonus_echeance)) : C.bonusSans}</p>}

          <div className={`depot${glisse ? ' glisse-actif' : ''}`} onDragOver={(e) => { e.preventDefault(); setGlisse(true); }} onDragLeave={() => setGlisse(false)} onDrop={deposer}>
            <input ref={entree} className="sr" type="file" accept="image/png,image/jpeg,image/webp" multiple tabIndex={-1} aria-hidden="true"
              onChange={(e) => { ajouter([...(e.target.files ?? [])]); e.target.value = ''; }} />
            <Bouton onClick={() => entree.current?.click()} disabled={horsLigne || liste === null} fleche={false}>{C.ajouter}</Bouton>
            <p className="info">{C.aide}</p>
            <p className="info seul-souris">{C.aideSouris}</p>
            {horsLigne && <p className="info">{C.horsLigne}</p>}
          </div>
          <div className="messages" role="alert" aria-live="assertive">{messages.map((m, i) => <p key={i} className="erreur">{m}</p>)}</div>
        </div>

        <div className="captures-droite">
          {erreurChargement && <div><p className="erreur" role="alert">{T.erreur}</p><button type="button" className="lien" onClick={() => void charger()}>{T.reseau.reessayer}</button></div>}
          {vide && <EmptyState title={C.videTitre} body={C.videCorps} />}
          {!vide && liste !== null && (
            <Apparait>
              <ul className="grille">
                {liste.map((c, i) => (
                  <li key={c.id}>
                    <button type="button" className="vignette" style={{ aspectRatio: c.largeur && c.hauteur ? `${c.largeur} / ${c.hauteur}` : '9 / 16' }} onClick={() => setOuverte(c)} aria-label={C.alt(i + 1) + (c.note ? `, ${c.note}` : '')}>
                      <img src={c.url} alt="" loading="lazy" decoding="async" />
                    </button>
                  </li>
                ))}
                {enCours.map((x) => (
                  <li key={`c${x.cle}`}>
                    <div className="vignette en-cours" style={{ aspectRatio: '9 / 16' }} role="status" aria-label={x.progres > 0 ? C.envoi : C.reduction}>
                      <img src={x.apercu} alt="" />
                      <div className="barre3"><i style={{ width: `${Math.round(x.progres * 100)}%` }} /></div>
                    </div>
                  </li>
                ))}
              </ul>
            </Apparait>
          )}
        </div>
      </div>

      {ouverte && <Detail capture={ouverte} onFermer={() => setOuverte(null)} onNote={(n) => { setListe((l) => (l ?? []).map((x) => (x.id === n.id ? n : x))); }} onSupprimee={(id) => { setListe((l) => (l ?? []).filter((x) => x.id !== id)); setOuverte(null); void majMoi(); }} />}
    </Page>
  );
}

function Detail({ capture, onFermer, onNote, onSupprimee }: { capture: Capture; onFermer: () => void; onNote: (c: Capture) => void; onSupprimee: (id: string) => void }) {
  const { gerer } = useSession();
  const [note, setNote] = useState(capture.note ?? '');
  const [sauvee, setSauvee] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);

  const sauver = async () => {
    if (note === (capture.note ?? '')) return;
    try {
      const c = await noterCapture(capture.id, note);
      onNote(c); setSauvee(true); setErreur(null);
    } catch (e) { if (!gerer(e)) setErreur(T.erreur); }
  };

  const supprimer = async () => {
    try { await supprimerCapture(capture.id); onSupprimee(capture.id); }
    catch (e) {
      // 404 : déjà supprimée depuis un autre appareil, le résultat voulu est atteint.
      if (e instanceof ErreurApi && e.code === 'not_found') onSupprimee(capture.id);
      else if (!gerer(e)) setErreur(T.erreur);
    }
  };

  return (
    <Feuille title={C.feuille} onClose={() => { void sauver(); onFermer(); }}>
      <img className="detail-image" src={capture.url} alt="" />
      <Field label={C.note} hint={C.noteHint}>
        <textarea rows={3} maxLength={280} value={note} onChange={(e) => { setNote(e.target.value); setSauvee(false); }} onBlur={() => void sauver()} />
      </Field>
      <p className="info" role="status" aria-live="polite">{sauvee ? C.noteSauvee : ''}</p>
      {erreur && <p className="erreur" role="alert">{erreur}</p>}
      <div className="detail-actions">
        {!confirmer
          ? <button type="button" className="supprimer" onClick={() => setConfirmer(true)}>{C.supprimer}</button>
          : <>
              <button type="button" className="supprimer" onClick={() => void supprimer()}>{C.confirmer}</button>
              <button type="button" className="lien" onClick={() => setConfirmer(false)}>{C.annuler}</button>
            </>}
      </div>
    </Feuille>
  );
}
