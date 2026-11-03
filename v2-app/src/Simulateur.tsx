import { useState } from 'react';
import { H, useT } from './i18n';
import { track } from './track';

type Prix = { mensuel: number; vie: number };

/* « Ce que tu paies sur la durée » : à vie maintenant / à vie après le compteur / mensuel. */
export function Simulateur({ prix, apres, fenetre }: { prix: Prix; apres: Prix; fenetre: boolean }) {
  const { t } = useT();
  const [mois, setMois] = useState(24);
  const [vu, setVu] = useState(false);
  const eur = (n: number) => new Intl.NumberFormat(t.locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const lignes = fenetre
    ? [{ k: t.sim_vieNow, v: prix.vie, now: true, vie: true }, { k: t.sim_vieApres, v: apres.vie, vie: true }, { k: t.sim_m, v: prix.mensuel * mois }]
    : [{ k: t.sim_vie, v: prix.vie, now: true, vie: true }, { k: t.sim_m, v: prix.mensuel * mois }];
  const max = Math.max(...lignes.map((l) => l.v));
  const d = t.sim_dur(mois);
  const ecart = prix.mensuel * mois - prix.vie;
  const dire = [
    fenetre ? t.sim_gain(eur(apres.vie - prix.vie)) : null,
    `${t.sim_seuil(Math.ceil(prix.vie / prix.mensuel))} ${ecart >= 0 ? t.sim_plus(d, eur(ecart)) : t.sim_moins(d, eur(prix.mensuel * mois))}`,
  ].filter(Boolean) as string[];

  return (
    <div className="sim">
      <h3>{t.sim_t}</h3>
      <div className="sim-ctl"><label htmlFor="sim-r">{t.sim_l}</label><output htmlFor="sim-r">{d}</output></div>
      <input id="sim-r" type="range" min={6} max={60} step={1} value={mois} aria-valuetext={d}
        style={{ ['--p' as string]: `${((mois - 6) / 54) * 100}%` }}
        onChange={(e) => { setMois(Number(e.target.value) || 24); if (!vu) { setVu(true); track('simulator_used', { months: Number(e.target.value) }); } }} />
      <div className="sim-ends" aria-hidden="true"><span>{t.sim_min}</span><span>{t.sim_max}</span></div>
      <ul className="bars">
        {lignes.map((l) => (
          <li key={l.k} className={`${l.now ? 'now' : ''}${l.vie ? ' vie' : ''}`}>
            <H html={l.k} /><b>{eur(l.v)}</b>
            <span className="bar"><i style={{ width: `${Math.max(1.5, (l.v / max) * 100)}%` }} /></span>
          </li>
        ))}
      </ul>
      <div className="sim-say" aria-live="polite">{dire.map((x) => <H key={x} as="p" html={x} />)}</div>
    </div>
  );
}
