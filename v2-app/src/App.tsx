import { useEffect, useRef, useState } from 'react';
import { LiquidGlassDefs } from './components/10k/web-liquid-glass/LiquidGlass';
import { IPhoneFrame } from './components/10k/web-device-frame/DeviceFrame';
import { StickySteps } from './components/10k/web-sticky-steps/StickySteps';
import { FaqAccordion } from './components/10k/web-faq-accordion/FaqAccordion';
import { ScrollReveal, ScrollRevealGroup } from './components/10k/web-scroll-reveal/ScrollReveal';
import { H, brut, useT } from './i18n';
import { useOffre } from './config-offre';
import { Offre, lancerDemo } from './Offre';
import { track } from './track';

/* Écrans réels, extraits de la démo du 03/11 (assets/v2-demo/, recadrés sur l'app). */
const ECRAN = (n: string) => `/assets/v2-demo/${n}.jpg`;
const ETAPES: { t: 'c1_t' | 'c2_t' | 'c3_t' | 'c4_t' | 'c5_t' | 'c6_t'; p: 'c1_p' | 'c2_p' | 'c3_p' | 'c4_p' | 'c5_p' | 'c6_p'; ecrans: string[] }[] = [
  { t: 'c1_t', p: 'c1_p', ecrans: ['bilan-zone', 'bilan-test'] },
  { t: 'c2_t', p: 'c2_p', ecrans: ['accueil', 'whoop'] },
  { t: 'c3_t', p: 'c3_p', ecrans: ['reglages', 'chrono'] },
  { t: 'c4_t', p: 'c4_p', ecrans: ['force'] },
  { t: 'c5_t', p: 'c5_p', ecrans: ['programme', 'deplacer'] },
  { t: 'c6_t', p: 'c6_p', ecrans: ['progres'] },
];

export function App() {
  const { t, lang, setLang } = useT();
  const offre = useOffre();
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const lu = useRef(0);

  useEffect(() => { track('page_view'); }, []);
  useEffect(() => { document.title = offre.phase === 'fenetre' ? (lang === 'fr' ? 'Mobility Club V2 — Offre de sortie' : 'Mobility Club V2 — Release offer') : 'Mobility Club V2'; }, [lang, offre.phase]);

  /* vidéo regardée : 5 s de lecture réelle cumulée, une fois */
  useEffect(() => {
    if (!video) return;
    let dernier: number | null = null, fait = false;
    const maj = () => {
      if (fait) return;
      const x = video.currentTime;
      if (dernier !== null && x > dernier && x - dernier < 1.5) lu.current += x - dernier;
      dernier = x;
      if (lu.current >= 5) { fait = true; track('video_played'); }
    };
    video.addEventListener('timeupdate', maj);
    return () => video.removeEventListener('timeupdate', maj);
  }, [video]);

  const etapes = ETAPES.map((e) => ({
    title: brut(t[e.t]),
    body: brut(t[e.p]),
    visual: (
      <div className={`telephones${e.ecrans.length > 1 ? ' duo' : ''}`}>
        {e.ecrans.map((n) => (
          <IPhoneFrame key={n} aspect="560 / 833"><img src={ECRAN(n)} alt="" loading="lazy" decoding="async" /></IPhoneFrame>
        ))}
      </div>
    ),
  }));

  const rangees = [1, 2, 3, 4, 5, 6, 7] as const;
  const faq = [
    { question: brut(offre.phase === 'fenetre' ? t.q_prix : t.q_prix_v), answer: <H html={offre.phase === 'fenetre' ? t.a_prix : t.a_prix_v} /> },
    { question: brut(t.q_apps), answer: <H html={t.a_apps} /> },
    { question: brut(t.q_temps), answer: <H html={t.a_temps} /> },
    { question: brut(t.q_annul), answer: <H html={t.a_annul} /> },
  ];

  return (
    <>
      <LiquidGlassDefs scale={-36} blur={6} />
      <div className="wrap langbar">
        <button className="lang" type="button" aria-label={t.aria_lang} onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}>{t.lang_btn}</button>
      </div>
      <main>
        {/* 1. démo */}
        <section className="hero" aria-label="Mobility Club V2">
          <div className="wrap">
            <ScrollRevealGroup stagger={0.08} variant="fade-up">
              <H as="p" className="kicker" html={t.kicker} />
              <H as="h1" html={t.h1} />
              <H as="p" className="promise" html={t.promise} />
            </ScrollRevealGroup>
            <div className="video" id="video">
              <video ref={setVideo} controls playsInline preload="metadata" width={720} height={1280} poster="/assets/video/v2-demo.jpg" aria-label="Démo de la V2">
                <source src="/assets/video/v2-demo.mp4" type="video/mp4" />
              </video>
            </div>
            {offre.phase === 'fenetre' && (
              <div className="count"><div className="t">{offre.compteur}</div><p>{t.count_label}</p></div>
            )}
            <button type="button" className="cta primary" onClick={() => lancerDemo(video)}>{t.hero_cta}</button>
          </div>
        </section>

        {/* 2. le prix, juste sous la démo */}
        <Offre video={video} />

        {/* 3. V1 → V2 */}
        <section aria-label="V1 et V2">
          <div className="wrap">
            <div className="split">
              <ScrollReveal variant="fade-up" className="v1"><span className="v" aria-hidden="true">V1</span><H as="h3" html={t.v1_t} /><H as="p" html={t.v1_p} /></ScrollReveal>
              <ScrollReveal variant="fade-up" delay={0.1} className="v2"><span className="v" aria-hidden="true">V2</span><H as="h3" html={t.v2_t} /><H as="p" html={t.v2_p} /></ScrollReveal>
            </div>
            <ScrollReveal><H as="p" className="enemy" html={t.enemy} /></ScrollReveal>
          </div>
        </section>

        {/* 4. ce qu'il y a dans la V2 : scroll-telling 10K « StickySteps » + cadres iPhone 10K */}
        <StickySteps id="v2" className="etapes" heading={t.hub_h} intro={t.hub_p} steps={etapes} stepLabel={t.step} />
        <ScrollReveal className="wrap bientot"><b>{t.soon_t}</b><p>{t.soon_p}</p></ScrollReveal>

        {/* 5. comparatif (relevé du 23/10/2026, docs/bascule-etude-marche-2026-10-23.md) */}
        <section aria-label="Comparer">
          <div className="wrap">
            <ScrollReveal className="cmp-head"><H as="h2" html={t.cmp_h} /><H as="p" className="lead" html={t.cmp_p} /></ScrollReveal>
            <ScrollReveal className="cmp" variant="scale-up">
              <div className="row th"><span /><span><H html={t.col_sep} /><small><H html={t.col_sep_s} /></small></span><span className="us">Mobility Club</span></div>
              {rangees.map((i) => {
                const k = `r${i}` as 'r1';
                const s = (t as unknown as Record<string, string>)[`r${i}_s`];
                const u = (t as unknown as Record<string, string>)[`r${i}_u`] ?? t.inc;
                return (
                  <div className="row" key={i}>
                    <H className="f" html={t[k]} />
                    <span className="sep"><span className="m-lbl">3 apps&nbsp;: </span><H html={s} /></span>
                    <span className="us"><span className="m-lbl">Mobility Club&nbsp;: </span><H html={u} /></span>
                  </div>
                );
              })}
            </ScrollReveal>
            <H as="p" className="cmp-note" html={t.cmp_note} />
            <H as="p" className="cmp-price" html={t.cmp_price} />
            <ScrollReveal><H as="p" className="cmp-loss" html={t.cmp_loss} /></ScrollReveal>
          </div>
        </section>

        {/* 6. preuve */}
        <section aria-label="Membres">
          <div className="wrap">
            <div className="numbers">
              <div><b>330</b><H html={t.n_members} /></div>
              <div><b>52</b><H html={t.n_feedback} /></div>
            </div>
            <ScrollRevealGroup className="quotes" stagger={0.07} variant="fade-up">
              {(['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const).map((q, i) => (
                <blockquote key={q}><H as="q" html={t[q]} /><cite>{['Guillaume', 'Pauline', 'Émilie', 'Sarah', 'Marie', 'Karin'][i]}</cite></blockquote>
              ))}
            </ScrollRevealGroup>
          </div>
        </section>

        {/* 7. FAQ : 10K « FaqAccordion » */}
        <FaqAccordion items={faq} title={t.faq_t} className="faq-v2" />
      </main>
      <footer>
        <div className="wrap">
          <span>© 2026 Mobility Club</span>
          <span><a href="/confidentialite"><H html={t.f_priv} /></a> · <a href="mailto:damien@mobilityclub.co">damien@mobilityclub.co</a></span>
        </div>
      </footer>
    </>
  );
}
