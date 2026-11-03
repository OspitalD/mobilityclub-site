import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { ComingSoon } from './components/10k/web-coming-soon/ComingSoon';
import { GlassPanel } from './components/10k/web-liquid-glass/LiquidGlass';
import { Beam } from './components/10k/web-beam-card/BeamCard';
import { RollingAmount } from './components/10k/web-count-up/RollingAmount';
import { H, useT } from './i18n';
import { OFFRE, fmt, useOffre } from './config-offre';
import { track } from './track';
import { Simulateur } from './Simulateur';

/* Prix de l'accès à vie : caché tant que la démo n'est pas finie (verrou), puis bloc de glace à 350 €
   que l'on brise en 3 taps pour révéler 249 €. Mémorisé dans le navigateur (mc_v2_prix).
   Après l'offre (phase v2) : pas de jeu, l'offre à 350 € s'affiche directement. */
export type EtatPrix = 'verrou' | 'glace' | 'casse';
const CLE = 'mc_v2_prix';
const TAPS = 3;
const reduit = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function lire(): EtatPrix {
  try {
    const m = localStorage.getItem(CLE);
    return m === 'casse' ? 'casse' : m === 'vu' ? 'glace' : 'verrou';
  } catch { return 'verrou'; }
}
function ecrire(v: 'vu' | 'casse') { try { localStorage.setItem(CLE, v); } catch { /* la page marche quand même */ } }

/** Progression de la démo : temps réellement atteint (le plus loin), et fin. */
export function useDemo(video: HTMLVideoElement | null, onFin: () => void) {
  const [vu, setVu] = useState({ max: 0, duree: 365 });
  useEffect(() => {
    if (!video) return;
    let max = 0;
    const maj = () => {
      if (video.currentTime > max) max = video.currentTime;
      const d = video.duration || 365;
      setVu({ max, duree: d });
      if (d - max <= 2) onFin();
    };
    video.addEventListener('timeupdate', maj);
    video.addEventListener('loadedmetadata', maj);
    video.addEventListener('ended', onFin);
    return () => { video.removeEventListener('timeupdate', maj); video.removeEventListener('loadedmetadata', maj); video.removeEventListener('ended', onFin); };
  }, [video, onFin]);
  return vu;
}

export function lancerDemo(video: HTMLVideoElement | null) {
  if (!video) return;
  video.scrollIntoView({ behavior: reduit() ? 'auto' : 'smooth', block: 'center' });
  video.play().catch(() => {});
}

function dureeTexte(s: number) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60), r = s % 60;
  return (m ? `${m} min ` : '') + (m && r < 10 ? '0' : '') + `${r} s`;
}

export function Offre({ video }: { video: HTMLVideoElement | null }) {
  const { t, lang } = useT();
  const offre = useOffre();
  const [etat, setEtat] = useState<EtatPrix>(lire);
  const zone = useRef<HTMLDivElement>(null);
  const [chute, setChute] = useState(false);

  const debloquer = useCallback((source: string) => {
    setEtat((e) => {
      if (e !== 'verrou') return e;
      ecrire('vu');
      track('cta_clicked', { cta: `prix_debloque_${source}` });
      window.setTimeout(() => zone.current?.scrollIntoView({ behavior: reduit() ? 'auto' : 'smooth', block: 'center' }), 250);
      return 'glace';
    });
  }, []);
  const finDemo = useCallback(() => debloquer('video'), [debloquer]);
  const demo = useDemo(video, finDemo);

  const ouvert = offre.phase === 'v2';
  const vue = ouvert ? 'ouvert' : etat;

  return (
    <section id="offre" className="offre" aria-label="Offre" data-prix={vue}>
      <div className="wrap">
        <div className="offer-top">
          <H as="h2" html={ouvert ? t.offer_h_v : t.offer_h_f} />
        </div>

        {vue === 'verrou' && (
          <div className="verrou" ref={zone}>
            <ComingSoon
              badge={t.lock_badge}
              title={t.lock_t}
              note=""
              action={
                <div className="verrou-actions">
                  <div className="verrou-piste" aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, demo.max / demo.duree)})` }} /></div>
                  <p className="verrou-r">{t.lock_left} {dureeTexte(demo.duree - demo.max)}</p>
                  <button type="button" className="cta primary" onClick={() => lancerDemo(video)}>{t.lock_cta}</button>
                  <button type="button" className="verrou-passer" onClick={() => debloquer('passer')}><H html={t.lock_skip} /></button>
                </div>
              }
            >
              <div className="glace-fantome" aria-hidden="true"><span className="g-prix">350&nbsp;€</span></div>
            </ComingSoon>
          </div>
        )}

        {(vue === 'glace' || vue === 'casse' || vue === 'ouvert') && (
          <div className="scene-stack" ref={vue === 'glace' ? zone : undefined}>
            {(vue === 'glace' || chute) && (
              <div className="glace-couche" key="glace">
                <Glace onBrise={() => {
                  ecrire('casse'); setChute(true); setEtat('casse'); track('cta_clicked', { cta: 'prix_brise' });
                  window.setTimeout(() => setChute(false), 1700);
                }} />
                {vue === 'glace' && <p className="glace-aide"><span>{t.tap_hint}</span></p>}
              </div>
            )}
            {(vue === 'casse' || vue === 'ouvert') && (
              <div className={`plan-zone${vue === 'casse' ? ' revele' : ''}`} key="plan">
                <Beam colorVariant="ocean" size="md" borderRadius={26} duration={4}>
                  <div className="plan plan-vie">
                    <div className="name">{t.p_v}{!ouvert && <> · <span>{t.p_v_sortie}</span></>}</div>
                    <div className="price vert"><PrixQuiRoule cible={offre.prix.vie} depart={chute ? OFFRE.prix_v2.vie : offre.prix.vie} />&nbsp;€</div>
                    <div className="once">{t.or_4x} {fmt(offre.prix.vie / 4, lang)}&nbsp;€</div>
                    {!ouvert && (
                      <>
                        <div className="after"><H html={t.after} /> <b>{offre.prixApres.vie}&nbsp;€ (4 × {fmt(offre.prixApres.vie / 4, lang)}&nbsp;€)</b></div>
                        <div className="count petit"><div className="t">{offre.compteur}</div><p>{t.count_label}</p></div>
                      </>
                    )}
                    <H as="p" className="note" html={t.p_v_note} />
                    <a className="cta primary" href={offre.lienVie} onClick={() => track('plan_clicked', { plan: 'vie' })}>{t.cta_v}</a>
                    <H as="p" className="legal" html={t.legal_4x} />
                    <p className="abo"><a href="/devenir-membre"><H html={t.abo} /></a></p>
                  </div>
                </Beam>
                <Simulateur prix={offre.prix} apres={offre.prixApres} fenetre={!ouvert} />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** 350 → 249 : le montant roule (10K « RollingAmount »), en plusieurs crans pour l'effet odomètre. */
function PrixQuiRoule({ cible, depart }: { cible: number; depart: number }) {
  const [v, setV] = useState(depart);
  useEffect(() => {
    if (depart === cible || reduit()) { setV(cible); return; }
    const crans = [depart, 320, 290, 270, 255, cible];
    const ids = crans.map((c, i) => window.setTimeout(() => setV(c), 260 + i * 150));
    return () => ids.forEach(window.clearTimeout);
  }, [cible, depart]);
  return <RollingAmount value={v} duration={140} format={(n) => String(Math.round(n))} />;
}

/* ── Le bloc de glace ── */
const NS = 'http://www.w3.org/2000/svg';
const BORD: [number, number][] = [[0, 0], [24, 0], [49, 0], [73, 0], [100, 0], [100, 33], [100, 66], [100, 100], [74, 100], [50, 100], [25, 100], [0, 100], [0, 66], [0, 33]];

function Glace({ onBrise }: { onBrise: () => void }) {
  const { t } = useT();
  const bouton = useRef<HTMLButtonElement>(null);
  const fissures = useRef<SVGSVGElement>(null);
  const eclats = useRef<HTMLDivElement>(null);
  const [taps, setTaps] = useState(0);
  const [brise, setBrise] = useState(false);
  const audio = useRef<AudioContext | null>(null);

  const vibrer = (m: number | number[]) => { try { navigator.vibrate?.(m); } catch { /* pas de vibreur */ } };

  /* « tic » de glace synthétisé : bruit filtré de 60 ms */
  const tic = (force: number) => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = (audio.current ??= new AC());
      const n = Math.floor(ctx.sampleRate * 0.06);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (let k = 0; k < n; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / n) ** 3;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2600 + force * 900;
      const g = ctx.createGain(); g.gain.value = 0.35 + force * 0.15;
      src.connect(f); f.connect(g); g.connect(ctx.destination); src.start();
    } catch { /* pas d'audio */ }
  };

  const trait = (d: string, cls = 'f') => {
    const svg = fissures.current; if (!svg) return;
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d); p.setAttribute('class', cls);
    svg.appendChild(p);
    const L = p.getTotalLength();
    p.style.strokeDasharray = `${L}`; p.style.strokeDashoffset = `${L}`;
    p.getBoundingClientRect();
    p.style.transition = reduit() ? 'none' : 'stroke-dashoffset .28s cubic-bezier(.22,1,.36,1)';
    p.style.strokeDashoffset = '0';
  };

  /* rayons brisés depuis le point d'impact (viewBox 100 × 74) */
  const fissurer = (x: number, y: number, n: number, longueur: number, rang: number) => {
    const depart = (rang * 37) % 360;
    for (let k = 0; k < n; k++) {
      const a = ((depart + k * (360 / n) + (k % 2 ? 11 : -9)) * Math.PI) / 180;
      const l = longueur * (0.7 + ((k * 7) % 5) / 10);
      const mx = x + Math.cos(a) * l * 0.45 + Math.sin(a) * 2.2, my = y + Math.sin(a) * l * 0.45 - Math.cos(a) * 2.2;
      trait(`M${x.toFixed(1)} ${y.toFixed(1)}L${mx.toFixed(1)} ${my.toFixed(1)}L${(x + Math.cos(a) * l).toFixed(1)} ${(y + Math.sin(a) * l).toFixed(1)}`);
    }
    if (rang > 1) {
      const r = 6 + rang * 2;
      let d = '';
      for (let j = 0; j <= 8; j++) { const b = (j / 8) * Math.PI * 2, rr = r * (j % 2 ? 1.15 : 0.9); d += `${j ? 'L' : 'M'}${(x + Math.cos(b) * rr).toFixed(1)} ${(y + Math.sin(b) * rr * 0.9).toFixed(1)}`; }
      trait(d, 'f f-anneau');
    }
  };

  const secouer = (amp: number) => {
    if (reduit()) return;
    bouton.current?.animate([
      { transform: 'translate(0,0) rotate(0)' },
      { transform: `translate(${amp}px,${-amp / 2}px) rotate(${amp / 10}deg)` },
      { transform: `translate(${-amp}px,${amp / 3}px) rotate(${-amp / 12}deg)` },
      { transform: `translate(${amp / 2}px,0) rotate(0)` },
      { transform: 'translate(0,0) rotate(0)' },
    ], { duration: 260, easing: 'cubic-bezier(.36,.07,.19,.97)' });
  };

  /* éclats : copies du bloc découpées en éventail depuis le point d'impact */
  const briser = (px: number, py: number, w: number, h: number) => {
    setBrise(true);
    vibrer([30, 40, 70]);
    try { const s = new Audio('/assets/audio/verre.mp3'); s.volume = 0.7; s.play().catch(() => {}); } catch { /* pas d'audio */ }
    const couche = eclats.current, modele = bouton.current?.querySelector('.glace-corps');
    const ix = (px / w) * 100, iy = (py / h) * 100;
    if (!reduit() && couche && modele) {
      BORD.forEach((a, k) => {
        const b = BORD[(k + 1) % BORD.length];
        const e = document.createElement('div');
        e.className = 'eclat';
        e.appendChild(modele.cloneNode(true));
        e.style.clipPath = `polygon(${ix}% ${iy}%,${a[0]}% ${a[1]}%,${b[0]}% ${b[1]}%)`;
        couche.appendChild(e);
        const cx = (ix + a[0] + b[0]) / 3 - ix, cy = (iy + a[1] + b[1]) / 3 - iy, n = Math.hypot(cx, cy) || 1;
        const dist = 220 + ((k * 53) % 7) * 40, dx = (cx / n) * dist, dy = (cy / n) * dist * 0.8;
        const rot = (k % 2 ? 1 : -1) * (18 + ((k * 13) % 40));
        e.animate([
          { transform: 'translate(0,0) rotate(0)', opacity: 1, filter: 'blur(0)' },
          { transform: `translate(${dx * 0.7}px,${dy * 0.7 - 40}px) rotate(${rot * 0.6}deg)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${dx}px,${dy + 420}px) rotate(${rot}deg)`, opacity: 0, filter: 'blur(3px)' },
        ], { duration: 1100 + (k % 4) * 90, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }).onfinish = () => e.remove();
      });
      for (let s = 0; s < 16; s++) {
        const p = document.createElement('i');
        p.className = 'paillette'; p.style.left = `${px}px`; p.style.top = `${py}px`;
        couche.appendChild(p);
        const ang = (s / 16) * Math.PI * 2 + (s % 3) * 0.2, dd = 90 + ((s * 37) % 140);
        p.animate([
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(ang) * dd}px), calc(-50% + ${Math.sin(ang) * dd}px)) scale(0)`, opacity: 0 },
        ], { duration: 700 + (s % 5) * 60, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' }).onfinish = () => p.remove();
      }
    }
    /* la carte apparaît pendant que les éclats tombent : on laisse la couche vivre 1,4 s */
    window.setTimeout(onBrise, reduit() ? 0 : 160);
  };

  const onTap = (ev: MouseEvent<HTMLButtonElement>) => {
    if (brise || !bouton.current) return;
    const r = bouton.current.getBoundingClientRect();
    const cx = ev.clientX || r.left + r.width * 0.58, cy = ev.clientY || r.top + r.height * 0.46;
    const px = cx - r.left, py = cy - r.top;
    const n = taps + 1;
    setTaps(n);
    if (n === 1) track('cta_clicked', { cta: 'prix_tape' });
    if (n < TAPS && !reduit()) {
      fissurer((px / r.width) * 100, (py / r.height) * 74, 5 + n * 2, 26 + n * 14, n);
      bouton.current.style.setProperty('--givre', String(0.16 + n * 0.16));
      secouer(4 + n * 3);
      vibrer(n === 1 ? 12 : 22);
      tic(n);
      return;
    }
    briser(px, py, r.width, r.height);
  };

  return (
    <div className="scene-prix">
      <div className="glace-cadre">
        <GlassPanel as="button" type="button" ref={bouton} variant="lens" radius={40} tone="dark" pressable
          className={`glace${brise ? ' brise' : ''}`} aria-label={t.aria_glace} onClick={onTap}>
          <span className="glace-corps">
            <span className="g-ey">{t.g_ey}</span>
            <span className="g-prix">{OFFRE.prix_v2.vie}&nbsp;€</span>
            <span className="g-sous">{t.g_sous}</span>
          </span>
          <svg ref={fissures} className="glace-fissures" viewBox="0 0 100 74" preserveAspectRatio="none" aria-hidden="true" />
        </GlassPanel>
        <div ref={eclats} className="glace-eclats" aria-hidden="true" />
      </div>
      <span className={`glace-points${brise ? ' cache' : ''}`} aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} className={i < taps ? 'on' : ''} />)}</span>
    </div>
  );
}
