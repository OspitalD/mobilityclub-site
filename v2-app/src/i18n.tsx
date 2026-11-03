import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import base from './textes-lancement.json';

/* Textes FR / EN. Ceux du comparatif, des avis et de la FAQ viennent de /lancement (textes-lancement.json) ;
   le reste suit la démo du 03/11. Chaînes de confiance (écrites ici) : le HTML léger (&nbsp;, <b>) est rendu tel quel. */
export type Lang = 'fr' | 'en';

const PAGE = {
  fr: {
    kicker: 'Mobility Club <span>V2</span>',
    h1: 'La mobilité <span>au cœur</span> de ton entraînement.',
    promise: 'Toute ta pratique sportive au même endroit, avec ta mobilité intégrée et adaptée.',
    hero_cta: 'Lancer la démo',
    count_label: 'avant la fin de l’offre de sortie',
    offer_h_f: 'Ton prix de sortie',
    offer_h_v: 'L’offre de sortie est terminée',
    lock_badge: 'Prix verrouillé',
    lock_t: 'Ton prix se débloque à la fin de la démo.',
    lock_left: 'Encore',
    lock_cta: 'Lancer la démo',
    lock_skip: 'Déjà vue&nbsp;? Débloquer le prix',
    g_ey: 'Accès à vie',
    g_sous: 'dès samedi',
    tap_hint: 'Tape pour briser le prix',
    aria_glace: 'Accès à vie, 350 € dès samedi. Tape pour briser le prix.',
    p_v: 'Accès à vie',
    p_v_sortie: 'Offre de sortie',
    or_4x: 'ou 4 ×',
    abo: 'Tu préfères un abonnement&nbsp;? 30&nbsp;€/mois, 7 jours d’essai',
    v1_p: 'Une app qui ne fait que de la mobilité. Même moi, après des mois à la construire, je ne l’utilisais pas.',
    v2_p: 'Une app qui rassemble toute ta pratique sportive, avec la mobilité intégrée et adaptée à elle. Course, musculation, prépa physique&nbsp;: tout est dans le club.',
    hub_h: 'Ce qu’il y a dans la V2',
    hub_p: 'Ce que tu viens de voir dans la démo, écran par écran. L’app s’utilise sur ton téléphone.',
    step: (i: number, n: number) => `Étape ${i + 1} sur ${n}`,
    c1_t: 'Ton bilan articulaire',
    c1_p: 'Une zone ou le bilan complet, et tu peux dire à voix haute pourquoi tu le fais : les tests suivent ta demande. Une démo, ton amplitude côté droit puis gauche, deux ou trois questions. À la fin : ton score articulaire, et ton programme fait pour toi.',
    c2_t: 'Tout ton entraînement, sur un écran',
    c2_p: 'Ta séance du jour, ta mobilité et ta montre en un coup d’œil. WHOOP en haut de l’écran ; avec Garmin ou Polar, ta course est dans l’app dès que tu rentres.',
    c3_t: 'La mobilité dans ton échauffement',
    c3_p: 'Tu règles tes sports, la durée mini et maxi, le nombre de séances par semaine. Au lancement : un chrono calé sur l’exercice, la vidéo d’exécution et les consignes.',
    c4_t: 'Ta séance de force, guidée',
    c4_p: 'Derrière la mobilité, toute ta séance : tu valides tes séries, le chrono de repos s’affiche, tu changes d’exercice si la machine est prise.',
    c5_t: 'Ton programme, importé',
    c5_p: 'PDF, Excel, Numbers, capture, photo, ou construit dans l’app : la mobilité s’adapte à lui. Une séance tombe mal ? Tu la déplaces, rien d’autre à faire.',
    c6_t: 'Tes progrès, pendant des années',
    c6_p: 'Score articulaire, poids, pas, évolution de tes charges, course à pied : au même endroit, de quoi te challenger.',
    soon_t: 'Bientôt',
    soon_p: 'Une bibliothèque de routines et de respiration : pour te réveiller, contre le stress, pour mieux t’endormir. Puis la nutrition.',
    faq_t: ['Questions', 'fréquentes'] as [string, string],
    lang_btn: 'EN', aria_lang: 'English version',
    sim_dur: (m: number) => (m % 12 === 0 ? (m === 12 ? '1 an' : `${m / 12} ans`) : `${m} mois`),
    sim_vieNow: 'À vie, maintenant', sim_vieApres: 'À vie, après le compteur', sim_vie: 'À vie', sim_m: 'Mensuel (30&nbsp;€/mois)',
    sim_gain: (x: string) => `Entrer maintenant&nbsp;: <b>${x} de moins</b> qu’après le compteur.`,
    sim_seuil: (n: number) => `L’accès à vie est rentabilisé dès le ${n}<sup>e</sup>&nbsp;mois.`,
    sim_plus: (d: string, x: string) => `Sur ${d}, il te coûte ${x} de moins que le mensuel.`,
    sim_moins: (d: string, x: string) => `Sur ${d}, le mensuel reste moins cher&nbsp;: ${x}.`,
    locale: 'fr-FR',
    a_prix: 'Le prix de sortie ne vaut que jusqu’à la fin du compteur. Ensuite, l’accès à vie repasse à 350&nbsp;€. Pris maintenant, il est payé une fois pour toutes&nbsp;: aucun abonnement, et les évolutions de l’app sont incluses.',
    a_apps: 'Ton programme de salle et de course s’importe dans le club, avec ta mobilité. Garde ton app de course pour enregistrer tes sorties (GPS). La nutrition reste dans ton app&nbsp;: le club ne la remplace pas. Côté montre, WHOOP, Garmin et Polar sont connectés&nbsp;: tes activités arrivent dans l’app.',
    a_annul: 'L’accès à vie se paie une fois, en un ou quatre versements&nbsp;: il n’y a pas d’abonnement à arrêter. Tu disposes du délai légal de rétractation de 14&nbsp;jours.',
  },
  en: {
    kicker: 'Mobility Club <span>V2</span>',
    h1: 'Mobility <span>at the heart</span> of your training.',
    promise: 'All your training in one place, with your mobility built in and adapted to it.',
    hero_cta: 'Play the demo',
    count_label: 'until the release offer ends',
    offer_h_f: 'Your release price',
    offer_h_v: 'The release offer has ended',
    lock_badge: 'Price locked',
    lock_t: 'Your price unlocks at the end of the demo.',
    lock_left: 'Time left:',
    lock_cta: 'Play the demo',
    lock_skip: 'Already watched it? Unlock the price',
    g_ey: 'Lifetime access',
    g_sous: 'from Saturday',
    tap_hint: 'Tap to break the price',
    aria_glace: 'Lifetime access, €350 from Saturday. Tap to break the price.',
    p_v: 'Lifetime access',
    p_v_sortie: 'Release offer',
    or_4x: 'or 4 ×',
    abo: 'Prefer a subscription? €30/month, 7-day trial',
    v1_p: 'An app that only did mobility. Even I, after months building it, wasn’t using it.',
    v2_p: 'An app that brings all your training together, with mobility built in and adapted to it. Running, strength, conditioning: it’s all in the club.',
    hub_h: 'What’s inside V2',
    hub_p: 'What you just saw in the demo, screen by screen. The app runs on your phone.',
    step: (i: number, n: number) => `Step ${i + 1} of ${n}`,
    c1_t: 'Your joint assessment',
    c1_p: 'One area or the full assessment, and you can say out loud why you’re doing it: the tests follow your request. A demo, your range right side then left, two or three questions. At the end: your joint score, and a programme made for you.',
    c2_t: 'All your training, on one screen',
    c2_p: 'Today’s session, your mobility and your watch at a glance. WHOOP at the top of the screen; with Garmin or Polar, your run is in the app as soon as you’re back.',
    c3_t: 'Mobility inside your warm-up',
    c3_p: 'Set your sports, minimum and maximum duration, sessions per week. When you start: a timer matched to the exercise, the how-to video and the cues.',
    c4_t: 'Your strength session, guided',
    c4_p: 'After mobility, your whole session: log your sets, the rest timer shows up, swap an exercise if the machine is taken.',
    c5_t: 'Your programme, imported',
    c5_p: 'PDF, Excel, Numbers, screenshot, photo, or built in the app: mobility adapts to it. A session lands on a bad day? Move it, nothing else to do.',
    c6_t: 'Your progress, for years',
    c6_p: 'Joint score, weight, steps, how your lifts evolve, running: in one place, enough to push yourself.',
    soon_t: 'Coming soon',
    soon_p: 'A library of routines and breathing work: to wake up, against stress, to sleep better. Then nutrition.',
    faq_t: ['Frequently asked', 'questions'] as [string, string],
    lang_btn: 'FR', aria_lang: 'Version française',
    sim_dur: (m: number) => (m % 12 === 0 ? (m === 12 ? '1 year' : `${m / 12} years`) : `${m} months`),
    sim_vieNow: 'Lifetime, now', sim_vieApres: 'Lifetime, after the countdown', sim_vie: 'Lifetime', sim_m: 'Monthly (€30/month)',
    sim_gain: (x: string) => `Joining now: <b>${x} less</b> than after the countdown.`,
    sim_seuil: (n: number) => `Lifetime access pays for itself from month ${n}.`,
    sim_plus: (d: string, x: string) => `Over ${d}, it costs you ${x} less than the monthly plan.`,
    sim_moins: (d: string, x: string) => `Over ${d}, the monthly plan is still cheaper: ${x}.`,
    locale: 'en-GB',
    a_prix: 'The release price only holds until the countdown ends. After that, lifetime access goes back to €350. Taken now, it’s paid once and for all: no subscription, and app updates are included.',
    a_apps: 'Your gym and running program can be imported into the club, alongside your mobility. Keep your running app to record your runs (GPS). Nutrition stays in your own app: the club doesn’t replace it. For watches, WHOOP, Garmin and Polar are connected: your activities land in the app.',
    a_annul: 'Lifetime access is paid once, in one or four instalments: there’s no subscription to stop. You have the legal 14-day withdrawal period.',
  },
};

type Base = typeof base.fr;
export type Textes = (typeof PAGE)['fr'] & Base;
export const TEXTES: Record<Lang, Textes> = {
  fr: { ...base.fr, ...PAGE.fr },
  en: { ...(base.en as Base), ...PAGE.en },
};

const Ctx = createContext<{ lang: Lang; t: Textes; setLang: (l: Lang) => void }>({ lang: 'fr', t: TEXTES.fr, setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try { return localStorage.getItem('mc_lang') === 'en' ? 'en' : 'fr'; } catch { return 'fr'; }
  });
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem('mc_lang', lang); } catch { /* stockage refusé */ }
  }, [lang]);
  return <Ctx.Provider value={{ lang, t: TEXTES[lang], setLang }}>{children}</Ctx.Provider>;
}
export const useT = () => useContext(Ctx);

/** Version texte brut (pour les composants qui prennent une chaîne) : entités décodées, balises retirées. */
export const brut = (s: string) => s.replace(/&nbsp;/g, '\u00a0').replace(/<[^>]+>/g, '');

/** Texte de confiance avec HTML léger. */
export function H({ html, as: Tag = 'span', className }: { html: string; as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'q' | 'b' | 'div'; className?: string }) {
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
