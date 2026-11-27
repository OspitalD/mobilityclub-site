/* Pop-up de l'offre flash « panier » (27/11/2026), posée sur /app/ et /edition-1 par une seule balise :
   <script type="module" src="/assets/flash-popup.js"></script>
   Elle ne s'affiche que si le serveur dit l'offre active (palier 2, portes ouvertes, FLASH_PANIER_OFF absent), une fois par visite,
   jamais au retour de PayPal, jamais après que le visiteur a déjà joué (sauf pour lui rappeler un 97 € encore vivant).
   Styles et polices embarqués : /app/ est un export Next qui n'a ni les jetons V2 de /edition-1 ni Pixelify Sans. */
import { atlasBallon } from './panier-flash/jeu.js';
import { dessinePanier } from './panier-flash/pixels.js';

const API = '/.netlify/functions/saison-checkout';
const CLE = 'mc_flash_panier';
const VU = 'mc_flash_popup_vue';
const DELAI_MS = 6000;

const lire = (st, k) => { try { return st.getItem(k); } catch { return null; } };
const poser = (st, k, v) => { try { st.setItem(k, v); } catch { /* navigation privée */ } };

const CSS = `
.mcf-fond{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;padding:12px;background:rgba(5,6,6,.62);
  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:mcf-in .25s ease both;font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;font-feature-settings:'tnum' 1;-webkit-font-smoothing:antialiased}
@media (min-width:600px){.mcf-fond{align-items:center}}
.mcf-carte{position:relative;width:100%;max-width:400px;padding:22px 20px 18px;text-align:center;color:#F5F5F3;border-radius:30px;isolation:isolate;overflow:hidden;
  background:linear-gradient(160deg,rgba(255,255,255,.10),rgba(255,255,255,.03) 45%,rgba(255,255,255,.05)),#121514;border:1px solid rgba(255,255,255,.14);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 20px 50px rgba(0,0,0,.5);animation:mcf-monte .5s cubic-bezier(.3,1.5,.5,1) both}
.mcf-carte::before{content:"";position:absolute;z-index:-1;left:50%;top:40px;width:220px;height:160px;margin-left:-110px;border-radius:50%;background:#E8A020;opacity:.22;filter:blur(50px)}
.mcf-jeu{font-family:'Pixelify Sans',monospace;font-weight:600;letter-spacing:1.5px;text-transform:uppercase}
.mcf-eyebrow{font-size:13px;color:#FFE08A}
.mcf-pix{display:block;margin:12px auto 4px;width:180px;height:132px;image-rendering:pixelated}
.mcf-titre{margin-top:6px;font-size:28px;font-weight:800;font-style:italic;letter-spacing:-1.1px;line-height:1.05;text-wrap:balance}
.mcf-corps{margin-top:10px;font-size:14px;font-weight:500;line-height:1.45;color:#C9CBC8;text-wrap:balance}
.mcf-corps b{color:#E8A020;font-weight:800}
.mcf-bouton{display:flex;align-items:center;justify-content:center;width:100%;height:54px;margin-top:16px;border:0;border-radius:27px;background:#3ECFA0;color:#0D0F0E;
  font:inherit;font-weight:800;font-size:16px;text-decoration:none;cursor:pointer;transition:transform .16s cubic-bezier(.2,.8,.2,1)}
.mcf-bouton:active{transform:scale(.96)}
.mcf-bouton:focus-visible,.mcf-non:focus-visible{outline:2px solid #3ECFA0;outline-offset:3px}
.mcf-non{margin-top:10px;padding:8px 12px;border:0;background:none;color:#8E918E;font:inherit;font-size:13px;font-weight:800;cursor:pointer}
@keyframes mcf-in{from{opacity:0}}
@keyframes mcf-monte{from{transform:translateY(40px);opacity:0}}
@media (prefers-reduced-motion:reduce){.mcf-fond,.mcf-carte{animation:none}}
`;

/** La vignette : le panier de l'app (deux plans) et le ballon orange juste au-dessus du cercle. */
function vignette(canvas) {
  const W = 60; const H = 44; // pixels de jeu (×3 à l'écran)
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const p0 = document.createElement('canvas'); p0.width = 130; p0.height = 281;
  const p1 = document.createElement('canvas'); p1.width = 130; p1.height = 281;
  const e = { tire: 0, onde: 0, vib: 0, flash: false };
  dessinePanier(p0.getContext('2d'), 0, e); dessinePanier(p1.getContext('2d'), 1, e);
  // Cadrage autour du panneau et du cercle (le cercle est vers x 65, y 105 dans la toile 130 × 281).
  const sx = 35; const sy = 70;
  ctx.drawImage(p0, sx, sy, W, H, 0, 0, W, H);
  const a = atlasBallon();
  ctx.drawImage(a, 3 * 19, 0, 19, 19, 21, 4, 13, 13);
  ctx.drawImage(p1, sx, sy, W, H, 0, 0, W, H);
}

function ouvrir({ gagne }) {
  if (document.querySelector('.mcf-fond')) return;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  if (!document.querySelector('link[data-mcf]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.mcf = '1';
    l.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,500;0,800;1,800&family=Pixelify+Sans:wght@600&display=swap';
    document.head.appendChild(l);
  }
  const fond = document.createElement('div'); fond.className = 'mcf-fond';
  fond.innerHTML = `
    <div class="mcf-carte" role="dialog" aria-modal="true" aria-labelledby="mcf-titre">
      <p class="mcf-eyebrow mcf-jeu">Offre flash · 5 min</p>
      <canvas class="mcf-pix" aria-hidden="true"></canvas>
      <h2 class="mcf-titre" id="mcf-titre">${gagne ? 'Ton 97 € t’attend.' : 'Un panier, 2 semaines offertes.'}</h2>
      <p class="mcf-corps">${gagne
        ? 'Ton panier est marqué. Il te reste quelques minutes pour prendre ta place à <b>97 €</b>.'
        : 'Mets le ballon dans le panier&nbsp;: la saison Édition&nbsp;1 repasse à <b>97&nbsp;€</b> pendant 5&nbsp;minutes.'}</p>
      <a class="mcf-bouton" href="/panier">${gagne ? 'Reprendre' : 'Jouer'}</a>
      <button class="mcf-non" type="button">Plus tard</button>
    </div>`;
  document.body.appendChild(fond);
  try { vignette(fond.querySelector('.mcf-pix')); } catch { fond.querySelector('.mcf-pix').remove(); }
  const fermer = () => { fond.remove(); document.removeEventListener('keydown', echap); };
  const echap = (e) => { if (e.key === 'Escape') fermer(); };
  fond.querySelector('.mcf-non').addEventListener('click', fermer);
  fond.addEventListener('click', (e) => { if (e.target === fond) fermer(); });
  document.addEventListener('keydown', echap);
  fond.querySelector('.mcf-bouton').focus({ preventScroll: true });
}

(async () => {
  const q = new URLSearchParams(location.search);
  if (q.get('paypal') || q.get('flash') === '0') return;
  const forcer = q.get('flash') === '1';
  let deja = null; try { deja = JSON.parse(lire(localStorage, CLE) || 'null'); } catch { deja = null; }
  const vivant = deja && deja.jeton && !deja.fini && Date.parse(deja.expire_at) > Date.now();
  if (deja && deja.jeton && !vivant) return; // déjà joué, temps écoulé : on ne relance pas
  if (!forcer && !vivant && lire(sessionStorage, VU)) return;
  let etat = null;
  try { etat = await fetch(API, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)); } catch { return; }
  if (!etat || !etat.flash || !etat.flash.actif) return;
  setTimeout(() => { poser(sessionStorage, VU, '1'); ouvrir({ gagne: vivant }); }, forcer ? 300 : DELAI_MS);
})();
