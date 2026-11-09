import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ErreurApi, demanderCode, verifierCode } from '../api.ts';
import { CLE_EMAIL, ecrireLocal } from '../stockage.ts';
import { T } from '../textes.ts';
import { Bandeau } from '../ui/Bandeau.tsx';
import { Bouton } from '../ui/Bouton.tsx';
import { Halo } from '../ui/Halo.tsx';
import { Signature } from '../ui/Signature.tsx';
import { Verre } from '../ui/Verre.tsx';

const ATTENTE_RENVOI = 30;

interface Props { emailInitial: string; expiree: boolean; onConnecte: () => void; onFerme: () => void }

export function Connexion({ emailInitial, expiree, onConnecte, onFerme }: Props) {
  const [etape, setEtape] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(emailInitial);
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [attente, setAttente] = useState(0);
  const champCode = useRef<HTMLInputElement>(null);
  // Le code part tout seul au 6e chiffre : ce verrou évite un second envoi quand le formulaire est aussi soumis.
  const envoye = useRef(false);

  useEffect(() => {
    if (attente <= 0) return;
    const id = window.setTimeout(() => setAttente((a) => a - 1), 1000);
    return () => window.clearTimeout(id);
  }, [attente]);

  useEffect(() => { if (etape === 'code') champCode.current?.focus(); }, [etape]);

  const demander = async (e?: FormEvent) => {
    e?.preventDefault();
    if (enCours) return;
    setErreur(null); setInfo(null); setEnCours(true);
    try {
      await demanderCode(email.trim());
      ecrireLocal(CLE_EMAIL, email.trim());
      setCode(''); envoye.current = false;
      setAttente(ATTENTE_RENVOI);
      // Toujours l'étape du code, même pour un email inconnu : la réponse ne doit jamais trahir qui a acheté.
      setEtape('code');
    } catch (err) {
      setErreur(err instanceof ErreurApi && err.code === 'invalid_email' ? T.connexion.emailIncomplet : T.erreur);
    } finally {
      setEnCours(false);
    }
  };

  const renvoyer = async () => {
    if (attente > 0 || enCours) return;
    setErreur(null); setEnCours(true);
    try {
      await demanderCode(email.trim());
      setCode(''); envoye.current = false; setAttente(ATTENTE_RENVOI); setInfo(T.connexion.codeRenvoye);
    } catch { setErreur(T.erreur); } finally { setEnCours(false); }
  };

  const ouvrir = async (valeur: string) => {
    if (envoye.current || valeur.length !== 6) return;
    envoye.current = true;
    setErreur(null); setInfo(null); setEnCours(true);
    try {
      await verifierCode(email.trim(), valeur);
      onConnecte();
    } catch (err) {
      envoye.current = false;
      setEnCours(false);
      if (!(err instanceof ErreurApi)) { setErreur(T.erreur); return; }
      if (err.code === 'no_access') { onFerme(); return; }
      setCode('');
      champCode.current?.focus();
      setErreur(err.code === 'expired' ? T.connexion.expire : err.code === 'too_many_attempts' ? T.connexion.tropEssais
        : err.code === 'invalid_code' || err.code === 'invalid_request' ? T.connexion.invalide : T.erreur);
    }
  };

  const saisie = (brut: string) => {
    // Un collage « 123 456 » ou « 123-456 » doit marcher : on ne garde que les chiffres.
    const v = brut.replace(/\D/g, '').slice(0, 6);
    setCode(v);
    if (v.length === 6) void ouvrir(v);
  };

  return (
    <>
      <Bandeau />
      <div className="page">
        <header className="w haut"><Signature /></header>
        <main className="w corps">
          <div className="connexion">
            <div className="connexion-texte">
              <h1>{T.connexion.titre}</h1>
              {etape === 'email' ? <p className="chapo">{T.connexion.chapo}</p> : <p className="chapo">{T.connexion.codeEnvoye(email.trim())}</p>}
              <div className="connexion-form">
                <Verre halo>
                  {etape === 'email' ? (
                    <form className="verre-contenu" onSubmit={demander} noValidate>
                      {expiree && <p className="info">{T.connexion.sessionExpiree}</p>}
                      <label className="champ">
                        <span>{T.connexion.champEmail}</span>
                        <input type="email" name="email" autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                          value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(erreur)} aria-describedby={erreur ? 'err-conn' : undefined} />
                      </label>
                      <p id="err-conn" className="erreur" role="alert">{erreur}</p>
                      <Bouton type="submit" disabled={enCours || !email.trim()}>{enCours ? T.connexion.envoi : T.connexion.recevoir}</Bouton>
                    </form>
                  ) : (
                    <form className="verre-contenu" onSubmit={(e) => { e.preventDefault(); void ouvrir(code); }} noValidate>
                      <label className="champ">
                        <span>{T.connexion.champCode}</span>
                        <input ref={champCode} className="code" type="text" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]*"
                          value={code} onChange={(e) => saisie(e.target.value)} aria-invalid={Boolean(erreur)} aria-describedby={erreur ? 'err-conn' : undefined} />
                      </label>
                      <p id="err-conn" className="erreur" role="alert">{erreur}</p>
                      {info && !erreur && <p className="info" role="status">{info}</p>}
                      <Bouton type="submit" disabled={enCours || code.length !== 6}>{enCours ? T.connexion.verification : T.connexion.ouvrir}</Bouton>
                      <div className="liens-code">
                        <button type="button" className="lien" disabled={attente > 0 || enCours} onClick={() => void renvoyer()}>
                          {attente > 0 ? T.connexion.renvoyerDans(attente) : T.connexion.renvoyer}
                        </button>
                        <button type="button" className="lien" onClick={() => { setEtape('email'); setErreur(null); setInfo(null); setCode(''); }}>{T.connexion.changerEmail}</button>
                      </div>
                    </form>
                  )}
                </Verre>
              </div>
              {etape === 'code' && <p className="pied">{T.connexion.aide}</p>}
            </div>
            <figure className="connexion-tel" aria-hidden="true">
              <Halo />
              <div className="tel"><img src="/kit-app-sexy/media/v2-aujourdhui.jpg" alt="" width={390} height={844} decoding="async" /></div>
            </figure>
          </div>
        </main>
      </div>
    </>
  );
}
