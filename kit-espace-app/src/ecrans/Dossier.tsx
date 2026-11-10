import { useCallback, useEffect, useRef, useState } from 'react';
import type { WizardAnswers } from '../components/10k/web-onboarding-wizard/OnboardingWizard.tsx';
import { lienSur } from '../lien.ts';
import { useSession } from '../session.ts';
import { T } from '../textes.ts';
import type { Dossier as TDossier, TypeApp } from '../types.ts';
import { useDossier } from '../useDossier.ts';
import { useReseau } from '../useReseau.ts';
import { Assistant } from '../ui/Assistant.tsx';
import { Bouton } from '../ui/Bouton.tsx';
import { Field } from '../ui/Feuille.tsx';
import { Page } from '../ui/Page.tsx';
import { Progression3px } from '../ui/Progression3px.tsx';

const D = T.dossier;
const MAX_ECRAN = 1000;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const texte = (v: string) => (v.length ? v : null);

const versReponses = (d: TDossier): WizardAnswers => ({
  nom: d.nom ?? '', lien: d.lien ?? '', type: d.type ?? undefined, pour_qui: d.pour_qui ?? '',
  voix_1: d.voix[0] ?? '', voix_2: d.voix[1] ?? '', voix_3: d.voix[2] ?? '',
});

const depuisReponses = (d: TDossier, r: WizardAnswers): TDossier => {
  const s = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '');
  const voix = [s('voix_1'), s('voix_2'), s('voix_3')];
  // Les mots vides en fin de liste n'existent pas côté serveur : les garder ferait croire à une modification.
  while (voix.length && voix[voix.length - 1] === '') voix.pop();
  const type = r.type === 'app' || r.type === 'plateforme' || r.type === 'aucune' ? (r.type as TypeApp) : d.type;
  return { ...d, nom: texte(s('nom')), lien: texte(s('lien')), type, pour_qui: texte(s('pour_qui')), voix };
};

const LIBELLE_ETAT = { repos: '', attente: D.attente, envoi: D.envoi, sauve: D.sauve, hors_ligne: D.horsLigne, erreur: '' } as const;

export function Dossier() {
  const { moi, gerer } = useSession();
  const d = useDossier(moi.email, gerer);
  const { horsLigne } = useReseau();
  const [mode, setMode] = useState<'assistant' | 'fiche' | null>(null);
  const [reprises, setReprises] = useState(0);
  const refCouleurs = useRef<HTMLFieldSetElement>(null);
  const defiler = useRef(false);

  // L'assistant démarre seulement si le dossier n'existe pas encore ; ensuite c'est la fiche.
  useEffect(() => { if (d.charge === 'pret' && mode === null) setMode(d.existe ? 'fiche' : 'assistant'); }, [d.charge, d.existe, mode]);
  useEffect(() => {
    if (mode === 'fiche' && defiler.current) {
      defiler.current = false;
      const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      refCouleurs.current?.scrollIntoView({ behavior: reduit ? 'auto' : 'smooth', block: 'start' });
    }
  }, [mode]);

  const surReponses = useCallback((r: WizardAnswers) => d.modifier((x) => depuisReponses(x, r)), [d.modifier]);
  const dos = d.dossier;
  const set = <K extends keyof TDossier>(k: K, v: TDossier[K]) => d.modifier((x) => ({ ...x, [k]: v }));

  if (d.charge !== 'pret') {
    return (
      <Page retour>
        {d.charge === 'chargement'
          ? <div className="barre-haut" role="progressbar" aria-label={T.chargement}><i /></div>
          : <><h1 className="moyen">{D.titre}</h1><p className="erreur" role="alert">{T.erreur}</p><div className="action-simple"><Bouton onClick={() => void d.recharger()}>{T.reseau.reessayer}</Bouton></div></>}
      </Page>
    );
  }

  const lien = lienSur(dos.lien);
  const couleurs = dos.couleurs;
  const voix = [dos.voix[0] ?? '', dos.voix[1] ?? '', dos.voix[2] ?? ''];
  const majVoix = (i: number, v: string) => {
    const a = [...voix]; a[i] = v;
    while (a.length && a[a.length - 1] === '') a.pop();
    set('voix', a);
  };
  const majCouleur = (i: number, v: string) => set('couleurs', couleurs.map((c, j) => (j === i ? v : c)));
  const normaliserHex = (i: number) => {
    const v = couleurs[i].trim();
    if (v && !v.startsWith('#') && HEX.test(`#${v}`)) majCouleur(i, `#${v}`.toLowerCase());
  };
  const majInsp = (i: number, p: Partial<{ url: string; note: string | null }>) => set('inspirations', dos.inspirations.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <Page retour>
      <div className="dossier">
        <div className="dossier-tete">
          <h1 className="moyen">{D.titre}</h1>
          <p className="chapo">{D.chapo}</p>
        </div>

        <aside className="dossier-aside" aria-label={D.titre}>
          <p className="pct"><span className="it vert">{d.completude} %</span> <span className="gris3">{D.rempli}</span></p>
          <Progression3px pct={d.completude} label={D.titre} />
          <p className="etat info" role="status" aria-live="polite">{horsLigne && d.etat !== 'sauve' ? D.horsLigne : LIBELLE_ETAT[d.etat]}</p>
          {d.message && <p className={d.etat === 'erreur' ? 'erreur' : 'info'} role="alert">{d.message}</p>}
          {mode === 'fiche' && <button type="button" className="lien" onClick={() => { setReprises((n) => n + 1); setMode('assistant'); }}>{D.reprendre}</button>}
        </aside>

        <div className="dossier-corps">
          {mode === 'assistant' && (
            <div className="assistant-zone">
              <button type="button" className="lien" onClick={() => setMode('fiche')}>{D.quitter}</button>
              <div className="zone">
                <div className="halo" aria-hidden="true"><i className="hv" /><i className="hp" /><i className="ho" /></div>
                <Assistant
                  key={`${d.cle}-${reprises}`}
                  reponses={versReponses(dos)}
                  onChange={surReponses}
                  onComplete={() => { defiler.current = true; setMode('fiche'); }}
                  onClose={() => setMode('fiche')}
                />
              </div>
            </div>
          )}

          {mode === 'fiche' && (
            <form className="fiche" onSubmit={(e) => e.preventDefault()} noValidate>
              <section className="q">
                <Field label={D.fiche.nom}>
                  <input type="text" value={dos.nom ?? ''} maxLength={80} autoComplete="off" onChange={(e) => set('nom', texte(e.target.value))} />
                </Field>
              </section>

              <fieldset className="q" role="radiogroup" aria-label={D.fiche.type}>
                <legend>{D.fiche.type}</legend>
                <div className="choix">
                  {(['app', 'plateforme', 'aucune'] as const).map((t) => (
                    <button key={t} type="button" role="radio" aria-checked={dos.type === t} className={`choix-ligne${dos.type === t ? ' is-on' : ''}`} onClick={() => set('type', t)}>{D.types[t]}</button>
                  ))}
                </div>
              </fieldset>

              {dos.type !== 'aucune' && (
                <section className="q">
                  <Field label={D.fiche.lien} hint={D.fiche.lienHint}>
                    <input type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={dos.lien ?? ''} maxLength={300} autoComplete="off" onChange={(e) => set('lien', texte(e.target.value))} />
                  </Field>
                  {lien ? <a className="lien" href={lien} target="_blank" rel="noopener noreferrer">{lien.replace(/^https?:\/\//i, '')}</a>
                    : dos.lien ? <p className="info">{D.fiche.nonActif}</p> : null}
                </section>
              )}

              <section className="q">
                <Field label={D.fiche.pourQui} hint={D.fiche.pourQuiHint}>
                  <input type="text" value={dos.pour_qui ?? ''} maxLength={200} autoComplete="off" onChange={(e) => set('pour_qui', texte(e.target.value))} />
                </Field>
              </section>

              <fieldset className="q" ref={refCouleurs}>
                <legend>{D.fiche.couleurs}</legend>
                <p className="indice">{D.fiche.couleursHint}</p>
                <ul className="rangs">
                  {couleurs.map((c, i) => (
                    <li className="rang-ligne" key={i}>
                      <span className="pastille-couleur" style={{ background: HEX.test(c) ? c : 'transparent' }}>
                        <input type="color" aria-label={`${D.fiche.choisirCouleur} ${i + 1}`} value={HEX.test(c) && c.length === 7 ? c : '#000000'} onChange={(e) => majCouleur(i, e.target.value)} />
                      </span>
                      <input className="entree" type="text" aria-label={`${D.fiche.hex} ${i + 1}`} value={c} maxLength={7} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="#3ecfa0"
                        onChange={(e) => majCouleur(i, e.target.value)} onBlur={() => normaliserHex(i)} />
                      <button type="button" className="lien" onClick={() => set('couleurs', couleurs.filter((_, j) => j !== i))}>{D.fiche.retirer}</button>
                    </li>
                  ))}
                </ul>
                {couleurs.length < 5 && <button type="button" className="lien" onClick={() => set('couleurs', [...couleurs, ''])}>{D.fiche.ajouterCouleur}</button>}
              </fieldset>

              <fieldset className="q">
                <legend>{D.fiche.voix}</legend>
                <p className="indice">{D.fiche.voixHint}</p>
                <div className="voix">
                  {[0, 1, 2].map((i) => (
                    <input key={i} className="entree" type="text" aria-label={D.assistant.mot(i + 1)} placeholder={D.assistant.motEx[i]} maxLength={30} autoComplete="off" value={voix[i]} onChange={(e) => majVoix(i, e.target.value)} />
                  ))}
                </div>
              </fieldset>

              <fieldset className="q">
                <legend>{D.fiche.inspirations}</legend>
                <p className="indice">{D.fiche.inspirationsHint}</p>
                <ul className="rangs">
                  {dos.inspirations.map((x, i) => (
                    <li className="insp-ligne" key={i}>
                      <input className="entree" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label={`${D.fiche.lienInsp} ${i + 1}`} placeholder="https://" maxLength={300} value={x.url} onChange={(e) => majInsp(i, { url: e.target.value })} />
                      <input className="entree" type="text" aria-label={`${D.fiche.noteInsp} ${i + 1}`} placeholder={D.fiche.noteInsp} maxLength={280} value={x.note ?? ''} onChange={(e) => majInsp(i, { note: texte(e.target.value) })} />
                      <button type="button" className="lien" onClick={() => set('inspirations', dos.inspirations.filter((_, j) => j !== i))}>{D.fiche.retirer}</button>
                    </li>
                  ))}
                </ul>
                {dos.inspirations.length < 6 && <button type="button" className="lien" onClick={() => set('inspirations', [...dos.inspirations, { url: '', note: null }])}>{D.fiche.ajouterInspiration}</button>}
              </fieldset>

              <section className="q">
                <Field label={D.fiche.ecran} hint={D.fiche.ecranHint}>
                  <textarea rows={6} maxLength={MAX_ECRAN} value={dos.ecran_matin ?? ''} onChange={(e) => set('ecran_matin', texte(e.target.value))} />
                </Field>
                <p className="compteur gris3" aria-hidden="true">{D.fiche.compteur((dos.ecran_matin ?? '').length, MAX_ECRAN)}</p>
              </section>

              <div className="suite"><Bouton href="#/captures">{D.suite}</Bouton></div>
            </form>
          )}
        </div>
      </div>
    </Page>
  );
}
