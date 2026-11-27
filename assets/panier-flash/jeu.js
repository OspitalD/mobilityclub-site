/* Le jeu de l'offre flash /panier (27/11/2026) : un seul ballon de basket, la physique et les pixels du panier validé dans l'app
   (src/v2/ecrans/aujourdhui/panier, 08/11), recopiés tels quels dans ce dossier. On TIRE le ballon vers le bas, on vise, on lâche.
   Un aimant discret grandit à chaque raté : tout le monde finit par marquer. Le panier appelle `surPanier()` une seule fois. */
import { ARC, F, PANNEAU, RB, SLOTS, SOL, TIRAGE_MIN, Y0, Y_REPOS, Z0, avancer, conseil, lancer, proj, trajectoire } from './physique.js';
import { METAL, dessinePanier, dessineSol, dessineTexte, largeurTexte, ligneMur, sombre } from './pixels.js';
import { creerSons } from './sons.js';

export const LARGEUR = 390;
export const HAUTEUR = 760;
/* Deux niveaux, réglés par balayage (simuler sur dy 40..110 × dx −60..60, gestes au hasard) :
   1 (97 €)   : ballon à mi-côté, vent 0,2 à 0,35 m/s affiché, viseur court (8 points, vent compris), aimant qui grandit → ≈ 30–50 % par tir.
   2 (à vie)  : ballon décalé (bord ou mi-côté), vent 0,25 à 0,4 m/s, viseur de 6 points, aimant, essais illimités. */
const NIVEAUX = {
  1: { slots: [1, 3], vent: [0.2, 0.35], viseur: 8, aimant: true },
  // 27/11 soir, Damien : le 2e panier « beaucoup trop dur » (bord + vent fort + sans viseur + 3 essais) → même jeu qu'au 1er,
  // un cran au-dessus : n'importe quelle place décalée, vent un peu plus fort, viseur plus court, aimant, essais illimités.
  2: { slots: [0, 1, 3, 4], vent: [0.25, 0.4], viseur: 6, aimant: true },
};
const tirage = (n) => {
  const slot = n.slots[Math.floor(Math.random() * n.slots.length)];
  const fort = n.vent[0] + Math.random() * (n.vent[1] - n.vent[0]);
  const sens = n.exterieur ? (slot < 2 ? 1 : -1) : (Math.random() < 0.5 ? -1 : 1);
  return { i: slot, vent: Math.round(fort * 100) / 100 * sens };
};
const N = 19;
const IMAGES = 24;
const ORANGE = ['#E8742A', '#FFC08A'];

const cl = (x) => Math.min(1, Math.max(0, x));
const o3 = (x) => 1 - Math.pow(1 - cl(x), 3);
const grille = (v) => Math.round(v / 3) * 3;
const reduit = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();

/** Le ballon de basket : la sphère pixel du panier de l'app (3 tons, coutures), orange, sans chiffre. 24 images de rotation. */
export function atlasBallon() {
  const a = document.createElement('canvas'); a.width = N * IMAGES; a.height = N;
  const ctx = a.getContext('2d');
  const L = [-0.5, 0.62, 0.6]; const ln = Math.hypot(...L);
  const [b, c] = ORANGE; const sb = sombre(b, 0.55); const cout = '#2A1608';
  for (let k = 0; k < IMAGES; k++) {
    const ang = 2 * Math.PI * k / IMAGES; const ca = Math.cos(ang); const sa = Math.sin(ang);
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const nx = (px + 0.5 - N / 2) / (N / 2); const ny = -(py + 0.5 - N / 2) / (N / 2); const r2 = nx * nx + ny * ny;
      if (r2 > 1) continue;
      const nz = Math.sqrt(1 - r2); const X = nx; const Z = ny * ca - nz * sa;
      const lum = (nx * L[0] + ny * L[1] + nz * L[2]) / ln;
      let col = lum > 0.8 ? c : lum > 0.15 ? b : sb;
      if (r2 > 0.84) col = sb;
      const w = 0.085;
      if (Math.abs(Z) < w || Math.abs(X) < w || Math.abs(Math.abs(X) - 0.6 - 0.22 * Z * Z) < w) col = cout;
      if (lum > 0.95 && X < -0.1) col = '#FFFFFF';
      ctx.fillStyle = col; ctx.fillRect(k * N + px, py, 1, 1);
    }
  }
  return a;
}

function decor() {
  const j = ligneMur() * 3; const pool = proj(0, SOL, 3.3);
  const tribune = [];
  for (let k = 0; k < 60; k++) {
    const r = ((k * 9301 + 49297) % 233280) / 233280; const r2 = ((k * 7919 + 1237) % 1000) / 1000;
    tribune.push({ x: grille(-10 + r * 410), y: grille(120 + r2 * (j - 160)), k });
  }
  const hg = proj(-0.22, PANNEAU.y1, PANNEAU.z); const hd = proj(0.22, PANNEAU.y1, PANNEAU.z);
  return { j, tribune, pool, hg, hd };
}

/**
 * Monte le jeu dans `toile` (canvas). `surPanier(niveau)` au panier ; `surConseil(texte, restants)` après un raté (restants = essais
 * qui restent au niveau 2, null sinon) ; `surVise(bool)` quand le joueur tient le ballon.
 * Rend { arreter(), niveau(n) (relance au niveau n), bloquer() }.
 */
export function monterJeu(toile, { surPanier, surConseil, surVise, bloque = false }) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  toile.width = LARGEUR * dpr; toile.height = HAUTEUR * dpr;
  const ctx = toile.getContext('2d');
  // La scène 390 × 760 tient dans son parent (le plus petit des deux rapports) : les gestes sont ramenés à cette échelle.
  const taille = () => {
    const p = toile.parentElement.getBoundingClientRect(); if (!p.width || !p.height) return;
    const k = Math.min(p.width / LARGEUR, p.height / HAUTEUR);
    toile.style.width = `${LARGEUR * k}px`; toile.style.height = `${HAUTEUR * k}px`;
  };
  taille();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(taille) : null;
  if (ro) ro.observe(toile.parentElement); else window.addEventListener('resize', taille);
  const sol = document.createElement('canvas'); sol.width = 130; sol.height = 281; dessineSol(sol.getContext('2d'));
  const plan0 = document.createElement('canvas'); plan0.width = 130; plan0.height = 281;
  const plan1 = document.createElement('canvas'); plan1.width = 130; plan1.height = 281;
  const atlas = atlasBallon();
  const d = decor();
  const sons = creerSons();
  const j = { mode: 'repos', vise: null, b: null, rates: 0, marqueT: null, gagne: bloque, toucheT: -9, niveau: 1, essais: null, ...tirage(NIVEAUX[1]) };
  const ventLabel = document.createElement('canvas');
  let t0 = performance.now(); let horloge = 0; let id = 0; let actif = true;

  const versScene = (e) => {
    const r = toile.getBoundingClientRect();
    return { x: (e.clientX - r.left) * LARGEUR / r.width, y: (e.clientY - r.top) * HAUTEUR / r.height };
  };
  let depart = null;
  const bas = (e) => {
    if (j.gagne || j.mode === 'vol') return;
    sons.debloquer();
    const p = versScene(e);
    // Prise large : tout le bas de la scène attrape le ballon (le pouce n'a pas à viser le ballon lui-même).
    if (p.y < Y_REPOS - 130) return;
    depart = p; j.mode = 'vise'; j.vise = { dx: 0, dy: 0 }; j.toucheT = horloge;
    try { toile.setPointerCapture(e.pointerId); } catch { /* accessoire */ }
    surVise && surVise(true);
    e.preventDefault();
  };
  const bouge = (e) => {
    if (j.mode !== 'vise' || !depart) return;
    const p = versScene(e); j.vise = { dx: p.x - depart.x, dy: p.y - depart.y };
    e.preventDefault();
  };
  const haut = () => {
    if (j.mode !== 'vise') return;
    const v = j.vise; depart = null; surVise && surVise(false);
    if (!v || v.dy < TIRAGE_MIN) { j.mode = 'repos'; j.vise = null; return; }
    j.b = lancer(j.i, v.dx, v.dy, SLOTS, j.vent); j.mode = 'vol'; j.vise = null;
    sons.souffle(700, 1800, 0.22, 0.05);
  };
  toile.addEventListener('pointerdown', bas);
  toile.addEventListener('pointermove', bouge);
  toile.addEventListener('pointerup', haut);
  toile.addEventListener('pointercancel', haut);
  toile.style.touchAction = 'none';

  const tic = () => {
    if (!actif) return;
    const tt = (performance.now() - t0) / 1000; const dt = Math.min(0.05, tt - horloge); horloge = tt;
    if (j.mode === 'vol') {
      const b = j.b;
      const fini = avancer(b, dt, NIVEAUX[j.niveau].aimant ? j.rates : -1, tt, !reduit);
      for (const e of b.evts.splice(0)) {
        if (e === 'planche') sons.bip([110, 82], 0.02, 0.06, 'triangle');
        if (e === 'cerceau') { sons.bip([1568, 2349], 0, 0.025, 'triangle'); sons.bip([196], 0, 0.04, 'triangle'); }
        if (e === 'panier') {
          sons.souffle(5200, 900, 0.32, 0.2); sons.bip([988, 1319], 0.08, 0.035, 'square');
          setTimeout(() => sons.bip([523, 659, 784, 1047], 0.06, 0.04), 340); sons.foule(0.13, 1.6);
          try { navigator.vibrate && navigator.vibrate([20, 40, 60]); } catch { /* accessoire */ }
          j.marqueT = tt;
          if (!j.gagne) { j.gagne = true; surPanier && surPanier(j.niveau); }
        }
      }
      if (fini) {
        if (b.marque === null) {
          j.rates += 1; sons.foule(0.06, 0.7, true);
          if (j.essais !== null) j.essais -= 1;
          const fini2 = j.essais !== null && j.essais <= 0;
          if (fini2) j.gagne = true; // plus d'essai : le jeu s'arrête, la page reprend la main
          surConseil && surConseil(conseil(b), j.essais);
        }
        j.mode = 'repos'; j.b = j.gagne && b.marque !== null ? b : null;
        if (j.gagne && b.marque !== null) j.mode = 'fin';
        // Nouveau tir : nouvelle place et nouveau vent.
        if (!j.gagne) Object.assign(j, tirage(NIVEAUX[j.niveau]));
      }
    }
    peindre(tt);
    id = requestAnimationFrame(tic);
  };

  function peindre(tt) {
    const vol = j.mode === 'vol' || j.mode === 'fin' ? j.b : null;
    const mt = j.marqueT !== null ? tt - j.marqueT : -1;
    const tire = mt >= 0 && mt < 0.5 ? Math.sin(Math.PI * mt / 0.5) : 0;
    const onde = mt >= 0 ? Math.exp(-mt / 0.4) * Math.sin(mt * 24) : 0;
    const vib = vol && vol.cerceau && j.mode === 'vol' ? 0.8 * Math.sin(tt * 70) * Math.exp(-((vol.age) % 0.5) / 0.15) : 0;
    const etat = { tire, onde, vib, flash: mt >= 0 && mt < 1.2 && Math.floor(mt * 8) % 2 === 0 };
    dessinePanier(plan0.getContext('2d'), 0, etat);
    dessinePanier(plan1.getContext('2d'), 1, etat);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0D0F0E'; ctx.fillRect(0, 0, LARGEUR, HAUTEUR);

    // Caméra : léger zoom pendant le vol, tremblement par paliers au panier.
    let zoom = 1; let sx = 0; let sy = 0;
    if (!reduit) {
      if (j.mode === 'vol' && vol) zoom = 1 + 0.06 * o3(vol.age / 0.7);
      if (mt >= 0 && mt < 0.34) { const k = Math.floor(mt * 24); sx = [0, 4, -4, 3, -3, 2, -2, 1, 0][k] || 0; sy = [0, -3, 3, -2, 2, -1, 1, 0, 0][k] || 0; }
    }
    const c0 = proj(0, ARC.y, ARC.z);
    ctx.save();
    ctx.translate(c0.x + sx, c0.y + sy); ctx.scale(zoom, zoom); ctx.translate(-c0.x, -c0.y);

    // Mur : lumières de tribune (carrés sur la grille) puis cône du projecteur.
    for (const p of d.tribune) {
      const on = 0.05 + 0.05 * ((Math.floor(tt * 2 + p.k) % 5) === 0) + (etat.flash ? 0.12 : 0);
      ctx.fillStyle = `rgba(245,245,243,${on.toFixed(3)})`; ctx.fillRect(p.x, p.y, 3, 3);
    }
    ctx.drawImage(sol, 0, 0, 390, 843);
    ctx.fillStyle = mt >= 0 && mt < 2 ? 'rgba(62,207,160,.10)' : 'rgba(255,255,255,.06)';
    ctx.beginPath(); ctx.moveTo(175, -20); ctx.lineTo(215, -20);
    ctx.lineTo(d.pool.x + 1.4 * d.pool.s, d.pool.y); ctx.lineTo(d.pool.x - 1.4 * d.pool.s, d.pool.y); ctx.closePath(); ctx.fill();
    // Bras du panneau.
    ctx.fillStyle = '#2A2E2C'; ctx.fillRect(grille(d.hg.x), -20, 3, d.hg.y + 20); ctx.fillRect(grille(d.hd.x), -20, 3, d.hd.y + 20);

    // Le ballon.
    let bx = SLOTS[j.i]; let by = Y_REPOS; let sc = F / Z0; let image = 0; let entre = false; let opacite = 1;
    if (j.mode === 'vise' && j.vise) {
      const v = j.vise; const l = Math.hypot(v.dx, v.dy); const k = l > 0 ? Math.min(1, 70 / l) : 1;
      bx += v.dx * 0.42 * k; by += v.dy * 0.42 * k;
    } else if (j.mode === 'repos' && !reduit) {
      // Le ballon respire au repos (invite à le prendre), par paliers de 3 px.
      by -= grille(3 * Math.max(0, Math.sin(tt * 3)));
    }
    if (vol) {
      const p = proj(vol.x, vol.y, vol.z); bx = p.x; by = p.y; sc = p.s;
      image = Math.floor(((vol.tourne / (2 * Math.PI)) % 1 + 1) % 1 * IMAGES);
      entre = vol.z > ARC.z - ARC.r && vol.y < ARC.y + RB;
      if (j.mode === 'fin') opacite = Math.max(0, 1 - (tt - j.marqueT - 1) / 0.4);
    }
    const dia = 2 * RB * sc;
    // Ombre au sol.
    {
      const fp = vol ? proj(vol.x, SOL, vol.z) : { x: SLOTS[j.i], y: Y_REPOS + 34, s: F / Z0 };
      const hh = vol ? vol.y - Y0 : 0; const w = vol ? 2 * RB * fp.s : 54;
      ctx.fillStyle = `rgba(0,0,0,${(0.55 * Math.max(0, 1 - hh / 2.4) * opacite).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(fp.x, vol ? fp.y - 4 : fp.y, w / 2, w / 7, 0, 0, Math.PI * 2); ctx.fill();
    }
    const ballon = () => {
      if (opacite <= 0) return;
      ctx.globalAlpha = opacite;
      ctx.drawImage(atlas, image * N, 0, N, N, Math.round(bx - dia / 2), Math.round(by - dia / 2), Math.round(dia), Math.round(dia));
      ctx.globalAlpha = 1;
    };
    ctx.drawImage(plan0, 0, 0, 390, 843);
    if (entre) ballon();
    ctx.drawImage(plan1, 0, 0, 390, 843);
    if (!entre) ballon();

    // Trajectoire pendant la visée ; traînée en vol.
    const nv = NIVEAUX[j.niveau];
    if (j.mode === 'vise' && j.vise && j.vise.dy > 10 && nv.viseur > 0) {
      trajectoire(j.i, j.vise.dx, j.vise.dy, SLOTS, j.vent).slice(0, nv.viseur).forEach((p, q) => {
        const sz = q < 6 ? 6 : q < 16 ? 4.5 : 3;
        ctx.fillStyle = `rgba(245,245,243,${Math.max(0.14, 0.9 - q * 0.03).toFixed(2)})`;
        ctx.fillRect(grille(p.x) - sz / 2, grille(p.y) - sz / 2, sz, sz);
      });
    }
    if (vol && j.mode === 'vol') vol.trace.forEach((q, k, l) => {
      const p = proj(q.x, q.y, q.z); const sz = Math.round(2 + 7 * k / l.length);
      ctx.fillStyle = ORANGE[0]; ctx.globalAlpha = 0.5 * k / l.length;
      ctx.fillRect(grille(p.x) - sz / 2, grille(p.y) - sz / 2, sz, sz); ctx.globalAlpha = 1;
    });

    // Éclats au panier : carrés à la cadence des consoles (1/12 s).
    if (mt >= 0 && mt < 1) {
      const v = Math.floor(mt * 12) / 12; const dd = 1 - Math.pow(1 - v, 2.4);
      for (let k = 0; k < 26; k++) {
        if (v > 0.75 && k % 2) continue;
        const a = -Math.PI / 2 + (k - 12.5) * 0.15; const dist = (42 + (k % 4) * 16) * dd; const sz = v > 0.6 ? 3 : k % 3 ? 6 : 9;
        ctx.fillStyle = ['#3ECFA0', METAL[2], '#A8F2D6', METAL[1]][k % 4];
        ctx.fillRect(grille(c0.x + Math.cos(a) * dist * 1.5) - sz / 2, grille(c0.y - 6 + Math.sin(a) * dist + 80 * v * v) - sz / 2, sz, sz);
      }
    }
    ctx.restore();

    // Le vent : « VENT » en pixels + une flèche dont la longueur dit la force (un cran = 0,1 m/s), sous le panier.
    if (!j.gagne || j.mode === 'vol') {
      const crans = Math.max(1, Math.round(Math.abs(j.vent) * 10)); const sens = Math.sign(j.vent) || 1;
      const txt = 'VENT'; const lw = largeurTexte(txt);
      if (ventLabel.width !== lw) { ventLabel.width = lw; ventLabel.height = 9; const c2 = ventLabel.getContext('2d'); dessineTexte(c2, txt, 0, 0, '#8E918E'); }
      const L = crans * 12; const y = 448; const w = lw * 3 + 9 + L + 9; const x0 = Math.round((LARGEUR - w) / 2 / 3) * 3;
      ctx.drawImage(ventLabel, x0, y - 6, lw * 3, 27);
      const xa = x0 + lw * 3 + 9; ctx.fillStyle = '#FFE08A';
      ctx.fillRect(xa, y + 3, L, 3);
      const pointe = sens > 0 ? xa + L : xa - 3;
      for (let k = 0; k < 3; k++) ctx.fillRect(pointe + (sens > 0 ? -3 * k : 3 * k), y + 3 - 3 * k, 3, 3 + 6 * k);
    }
  }

  id = requestAnimationFrame(tic);
  const stop = () => { actif = false; if (ro) ro.disconnect(); cancelAnimationFrame(id); sons.fermer(); };
  window.addEventListener('pagehide', stop, { once: true });
  const niveau = (n) => {
    Object.assign(j, { mode: 'repos', vise: null, b: null, marqueT: null, gagne: false, niveau: n, rates: 0, essais: NIVEAUX[n].essais ?? null, ...tirage(NIVEAUX[n]) });
  };
  const bloquer = () => { j.gagne = true; };
  return { arreter: stop, etat: j, niveau, bloquer };
}
