/* Le dessin au pixel du panier (canevas 5f, validé le 08/11) : tout ce qui est « objet de jeu » vit sur la grille de 3 px, comme les
   gemmes de nos rangs — ballons, panier, sol, bandeau, textes de jeu. La typo, le verre et les cartes restent ceux de la DA V2.
   Fonctions de dessin sur un contexte 2D (aucun React) ; les toiles font 130 × 281 pixels pour une scène de 390 × 843. */
import { ARC, F, MUR, PANNEAU, SOL, proj } from './physique.js';

/** Couleurs de niveau de la DA (rouge, orange bas, or, vert, vert) en 3 tons façon gemme : [teinte, éclat]. */
// Rangs de l'atlas : 0 à 4 = les ballons 1 à 5 (rouge → vert) ; 5 = « Oui » (or : on ne dramatise pas une douleur) ; 6 = « Non » (vert).
export const TEINTES = Object.freeze([['#E05A4A', '#FFB0A6'], ['#E8742A', '#FFC08A'], ['#E8A020', '#FFE08A'], ['#3ECFA0', '#A8F2D6'], ['#3ECFA0', '#A8F2D6'], ['#E8A020', '#FFE08A'], ['#3ECFA0', '#A8F2D6']]);
export const RANGS = TEINTES.length;
export const RANG_OUI = 5;
export const RANG_NON = 6;
export const METAL = Object.freeze(['#84612F', '#DDBF75', '#FFF1BD']);

export const sombre = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * (1 - k));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

/** Les gemmes des rangs (donnees/rangs.js, du vert au platine) : la forme grandit avec le niveau. */
const GEMMES = [
  ['.........', '.........', '....a....', '...aca...', '..acbca..', '...aba...', '....a....', '.........', '.........'],
  ['.........', '....a....', '...aca...', '..accba..', '.acbbbba.', '..abbba..', '...aba...', '....a....', '.........'],
  ['....a....', '...aca...', '..acca...', '.acccba..', 'acccbbbba', '.acbbbba.', '..abbba..', '...aba...', '....a....'],
  ['...aaa...', '..acbca..', '.accbbca.', 'acccbbbca', 'acbcbcbba', '.abcbcba.', '..abcba..', '...aba...', '....a....'],
  ['..aaaaa..', '.acccbba.', 'accccbbba', 'acccbbbba', 'acbcbcbba', 'acbbcbbba', '.abbbbba.', '..abbba..', '...aaa...'],
];

/** Les pixels de la gemme d'un niveau (0 à 4) aux couleurs de ce niveau. */
export function pixelsGemme(niveau) {
  const [b, c] = TEINTES[niveau];
  const a = sombre(b, 0.55);
  const out = [];
  GEMMES[niveau].forEach((ligne, y) => ligne.split('').forEach((ch, x) => {
    if (ch !== '.') out.push({ x, y, c: ch === 'a' ? a : ch === 'b' ? b : c });
  }));
  return out;
}

/* ── Ballons ─────────────────────────────────────────────────────────────────────────────────────────── */

export const N = 19;
export const IMAGES = 24;
// 6 = « O » (oui), 7 = « N » (non).
const CHIFFRES = { 1: ['.x.', 'xx.', '.x.', '.x.', 'xxx'], 2: ['xx.', '..x', '.x.', 'x..', 'xxx'], 3: ['xx.', '..x', '.x.', '..x', 'xx.'], 4: ['x.x', 'x.x', 'xxx', '..x', '..x'], 5: ['xxx', 'x..', 'xx.', '..x', 'xx.'], 6: ['xxx', 'x.x', 'x.x', 'x.x', 'xxx'], 7: ['x.x', 'xxx', 'xxx', 'xxx', 'x.x'] };

/**
 * L'atlas des ballons sur `ctx` (N·24 × N·RANGS) : 24 images de rotation par rang, chaque pixel calculé sur la sphère (la face avant
 * monte en tournant, comme un tir avec effet rétro). Ombrage en 3 tons, coutures assombries (or pour « au top »), chiffre 3×5 cerné.
 */
export function dessineAtlas(ctx) {
  const L = [-0.5, 0.62, 0.6]; const ln = Math.hypot(L[0], L[1], L[2]);
  for (let i = 0; i < RANGS; i++) {
    const [b, c] = TEINTES[i]; const a = sombre(b, 0.55); const cout = sombre(b, 0.78); const chiffre = CHIFFRES[i + 1];
    const plein = (u, v) => u >= 0 && u < 3 && v >= 0 && v < 5 && chiffre[v][u] === 'x';
    for (let k = 0; k < IMAGES; k++) {
      const ang = 2 * Math.PI * k / IMAGES; const ca = Math.cos(ang); const sa = Math.sin(ang);
      for (let py = 0; py < N; py++) {
        for (let px = 0; px < N; px++) {
          const nx = (px + 0.5 - N / 2) / (N / 2); const ny = -(py + 0.5 - N / 2) / (N / 2); const r2 = nx * nx + ny * ny;
          if (r2 > 1) continue;
          const nz = Math.sqrt(1 - r2);
          // Repère du ballon : X horizontal, Z vertical, Y profondeur (face caméra = Y négatif).
          const X = nx; const Z = ny * ca - nz * sa; const Y = -(ny * sa + nz * ca);
          const lum = (nx * L[0] + ny * L[1] + nz * L[2]) / ln;
          let col = lum > 0.8 ? c : lum > 0.15 ? b : a;
          if (r2 > 0.84) col = a;
          const w = 0.085;
          const couture = Math.abs(Z) < w || Math.abs(X) < w || Math.abs(Math.abs(X) - 0.6 - 0.22 * Z * Z) < w;
          if (couture) col = i === 4 ? (lum > 0.4 ? METAL[2] : lum > -0.1 ? METAL[1] : METAL[0]) : cout;
          if (Y < -0.2) {
            const cx = Math.floor((X - 0.053) / 0.1053); const cy = Math.floor((0.579 - Z) / 0.1053);
            if (plein(cx, cy)) col = lum > 0.05 ? '#FFFFFF' : '#C9CBC8';
            else if (plein(cx - 1, cy) || plein(cx + 1, cy) || plein(cx, cy - 1) || plein(cx, cy + 1)) col = sombre(b, 0.72);
          }
          if (lum > 0.95 && !couture && X < -0.1) col = '#FFFFFF';
          ctx.fillStyle = col; ctx.fillRect(k * N + px, i * N + py, 1, 1);
        }
      }
    }
  }
}

/* ── Traits ──────────────────────────────────────────────────────────────────────────────────────────── */

function traceur(ctx, ymin = -Infinity) {
  const px = (x, y, c) => { if (y >= ymin) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); } };
  const trait = (x0, y0, x1, y1, c) => {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0); const dy = -Math.abs(y1 - y0); const sx = x0 < x1 ? 1 : -1; const sy = y0 < y1 ? 1 : -1;
    let er = dx + dy;
    for (let k = 0; k < 600; k++) {
      px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * er;
      if (e2 >= dy) { er += dy; x0 += sx; }
      if (e2 <= dx) { er += dx; y0 += sy; }
    }
  };
  return { px, trait };
}

/* ── Sol ─────────────────────────────────────────────────────────────────────────────────────────────── */

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

/** Ligne (en pixels de toile) où le sol rencontre le mur du fond. */
export const ligneMur = () => Math.round(proj(0, SOL, MUR).y / 3);

/**
 * Le sol : 4 bandes de tons DA tramées (Bayer 4×4), lames fuyantes, raquette, cercle et arc en vert club éteint (opaque),
 * flaque de lumière tramée sous le panier. Statique : dessiné une fois.
 */
export function dessineSol(ctx) {
  ctx.clearRect(0, 0, 130, 281);
  const P = (x, z) => { const p = proj(x, SOL, z); return [p.x / 3, p.y / 3]; };
  const j = ligneMur(); const TONS = ['#101312', '#131615', '#161A18', '#1A1E1C'];
  const pool = P(0, 3.3); const prx = 1.5 * F / 3.3 / 3; const pry = 11;
  for (let y = j; y < 281; y++) {
    const v = (y - j) / (281 - j) * (TONS.length - 1); const b = Math.floor(v); const fr = v - b;
    for (let x = 0; x < 130; x++) {
      let c = fr * 16 > BAYER[y % 4][x % 4] ? TONS[Math.min(TONS.length - 1, b + 1)] : TONS[b];
      const d = Math.hypot((x - pool[0]) / prx, (y - pool[1]) / pry);
      if (d < 1 && (1 - d) * 22 > BAYER[y % 4][x % 4]) c = d < 0.45 && (0.45 - d) * 40 > BAYER[(y + 2) % 4][(x + 1) % 4] ? '#2A302D' : '#222724';
      ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1);
    }
  }
  const { trait } = traceur(ctx, j);
  const relie = (pts, c) => { for (let k = 1; k < pts.length; k++) trait(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], c); };
  for (let x = -7; x <= 7.01; x += 0.34) relie([P(x, MUR), P(x, 0.9)], 'rgba(0,0,0,.28)');
  ctx.fillStyle = '#1A1E1C'; ctx.fillRect(0, j, 130, 1);
  const VERT = '#2C7A62';
  relie([P(-0.8, 4.9), P(-0.8, 2.2), P(0.8, 2.2), P(0.8, 4.9)], VERT);
  relie(Array.from({ length: 25 }, (_, k) => P(0.8 * Math.cos(Math.PI * k / 24), 2.2 - 0.8 * Math.sin(Math.PI * k / 24))), VERT);
  relie(Array.from({ length: 49 }, (_, k) => P(2.25 * Math.cos(Math.PI * k / 48), 3.25 - 2.25 * Math.sin(Math.PI * k / 48))), VERT);
  relie([P(-7, 4.9), P(7, 4.9)], VERT);
}

/* ── Panier ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Le panier. `plan` 0 = panneau, filet et arceau de derrière ; 1 = filet et arceau de devant (le ballon passe entre les deux).
 * `etat` = { tire (0..1, le filet s'allonge), onde (le filet ondule), vib (l'arceau tremble), flash (tout vert : ça rentre) }.
 */
export function dessinePanier(ctx, plan, etat) {
  ctx.clearRect(0, 0, 130, 281);
  const { px, trait } = traceur(ctx);
  const c = proj(0, ARC.y, ARC.z); const cx = c.x / 3; const cy = c.y / 3; const rx = F * ARC.r / ARC.z / 3; const ry = 2.6 + etat.vib;
  const vert = etat.flash; const devant = plan === 1;
  if (!devant) {
    const hg = proj(-PANNEAU.x, PANNEAU.y1, PANNEAU.z); const bd = proj(PANNEAU.x, PANNEAU.y0, PANNEAU.z);
    const L = Math.round(hg.x / 3); const T = Math.round(hg.y / 3); const R = Math.round(bd.x / 3); const B = Math.round(bd.y / 3);
    ctx.fillStyle = 'rgba(17,20,18,.86)'; ctx.fillRect(L, T, R - L + 1, B - T + 1);
    for (let i = 0; i < 7; i++) { px(L + 3 + i, T + 9 - i, 'rgba(245,245,243,.14)'); px(L + 6 + i, T + 9 - i, 'rgba(245,245,243,.08)'); }
    ctx.fillStyle = vert ? '#3ECFA0' : '#3A3E3C'; ctx.fillRect(L, T, 1, B - T + 1); ctx.fillRect(R, T, 1, B - T + 1); ctx.fillRect(L, B, R - L + 1, 1);
    ctx.fillStyle = vert ? '#A8F2D6' : '#8E918E'; ctx.fillRect(L, T, R - L + 1, 1);
    ctx.fillStyle = '#060706'; ctx.fillRect(L + 1, B + 1, R - L + 1, 1);
    const c1 = proj(-0.3, 0.25, PANNEAU.z); const c2 = proj(0.3, ARC.y, PANNEAU.z);
    const a1 = Math.round(c1.x / 3); const b1 = Math.round(c1.y / 3); const a2 = Math.round(c2.x / 3); const b2 = Math.round(c2.y / 3);
    ctx.fillStyle = vert ? '#3ECFA0' : '#7A7C7A';
    ctx.fillRect(a1, b1, a2 - a1 + 1, 1); ctx.fillRect(a1, b1, 1, b2 - b1 + 1); ctx.fillRect(a2, b1, 1, b2 - b1 + 1); ctx.fillRect(a1, b2, a2 - a1 + 1, 1);
    ctx.fillStyle = METAL[0]; ctx.fillRect(Math.round(cx) - 2, b2 + 1, 5, Math.max(1, Math.round(cy - ry) - b2));
  }
  // Filet : 4 rangs de nœuds décalés d'un demi-pas, reliés en losanges.
  const PROF = [0, 6, 12, 18]; const RAY = [1, 0.84, 0.72, 0.6]; const ext = 1 + 0.4 * etat.tire;
  const noeud = (r, k) => {
    const a = (k + (r % 2) * 0.5) * Math.PI / 6 + 0.13 + etat.onde * 0.3 * r / 3;
    return [cx + rx * RAY[r] * Math.cos(a), cy + PROF[r] * ext + ry * RAY[r] * Math.sin(a), Math.sin(a)];
  };
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 12; k++) {
      const n0 = noeud(r, k);
      for (const k2 of (r % 2 ? [k, k + 1] : [k, k - 1])) {
        const n1 = noeud(r + 1, k2);
        if ((n0[2] + n1[2] > 0) !== devant) continue;
        trait(n0[0], n0[1], n1[0], n1[1], devant ? (vert ? '#A8F2D6' : '#C9CBC8') : '#4A4D4B');
      }
    }
  }
  // Arceau : deux rangs de pixels, métal or en 3 tons selon l'angle (le métal des plaques), vert au panier.
  for (let q = 0; q <= 72; q++) {
    const a = (devant ? 0 : Math.PI) + Math.PI * q / 72; const v = Math.cos(a - 0.6);
    const col = vert ? (v > 0.3 ? '#A8F2D6' : '#3ECFA0') : v > 0.55 ? METAL[2] : v > -0.3 ? METAL[1] : METAL[0];
    px(cx + rx * Math.cos(a), cy + ry * Math.sin(a), col);
    px(cx + rx * Math.cos(a), cy + 1 + ry * Math.sin(a), devant ? METAL[0] : '#5C4421');
  }
}

/* ── Texte pixel ─────────────────────────────────────────────────────────────────────────────────────── */

/* Police maison 5×7 (+2 rangs pour les accents), majuscules : la même grille que tout le jeu, sans police à charger (hors ligne). */
const G7 = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.', C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.', E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#', I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.',
  J: '..###|...#.|...#.|...#.|#..#.|#..#.|.##..', K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#', O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....', Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..', U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..', W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.', 2: '.###.|#...#|....#|...#.|..#..|.#...|#####',
  3: '####.|....#|....#|.###.|....#|....#|####.', 4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
  6: '.###.|#....|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...', 8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  9: '.###.|#...#|#...#|.####|....#|....#|.###.', '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..', '·': '.....|.....|.....|..#..|.....|.....|.....',
  '◆': '.....|..#..|.###.|#####|.###.|..#..|.....', '.': '.....|.....|.....|.....|.....|.....|..#..', "'": '..#..|..#..|.....|.....|.....|.....|.....',
};
const ACCENTS = { À: ['A', '.#...|..#..'], É: ['E', '...#.|..#..'], È: ['E', '.#...|..#..'], Ê: ['E', '..#..|.#.#.'] };
const ESPACE = 3;

const glyphe = (ch) => {
  if (ACCENTS[ch]) { const [base, haut] = ACCENTS[ch]; return [...haut.split('|'), ...G7[base].split('|')]; }
  const g = G7[ch];
  return g ? ['.....', '.....', ...g.split('|')] : null;
};

/** Largeur en pixels de police d'un texte (majuscules ; un caractère inconnu compte comme une espace). */
export function largeurTexte(texte) {
  let w = 0;
  for (const ch of texte.toUpperCase()) w += glyphe(ch) ? 6 : ESPACE + 1;
  return Math.max(0, w - 1);
}
export const HAUTEUR_TEXTE = 9;

/** Écrit `texte` en pixels à (x, y) sur `ctx`, en `couleur`. */
export function dessineTexte(ctx, texte, x, y, couleur) {
  ctx.fillStyle = couleur;
  let cx = x;
  for (const ch of texte.toUpperCase()) {
    const g = glyphe(ch);
    if (!g) { cx += ESPACE + 1; continue; }
    g.forEach((ligne, r) => { for (let k = 0; k < 5; k++) if (ligne[k] === '#') ctx.fillRect(cx + k, y + r, 1, 1); });
    cx += 6;
  }
}
