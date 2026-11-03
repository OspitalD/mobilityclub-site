/* Suivi first-party, même format que le reste du site, sans PII.
   Événements et variante déjà acceptés par track-site-event (aucun changement serveur). */
const URL_SUIVI = '/.netlify/functions/track-site-event';

function visiteur(): string | null {
  try {
    let v = localStorage.getItem('mc_vid');
    if (!v) { v = Math.random().toString(36).slice(2, 12); localStorage.setItem('mc_vid', v); }
    return v;
  } catch { return null; }
}

export function track(event: string, props: Record<string, string | number> = {}) {
  try {
    const body = JSON.stringify({ event, variant: 'lancement', vid: visiteur(), props: { path: '/v2', lang: document.documentElement.lang || 'fr', ...props } });
    if (navigator.sendBeacon) navigator.sendBeacon(URL_SUIVI, new Blob([body], { type: 'application/json' }));
    else fetch(URL_SUIVI, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
  } catch { /* le suivi ne casse jamais la page */ }
}
