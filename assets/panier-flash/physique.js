/* La physique du panier de la forme du jour (canevas 5c → 5f, validé le 08/11), en module PUR : ni React ni DOM, testée par node:test.
   Monde en mètres vu par une caméra en perspective (f = 380 px, centre optique 195 × 290 dans une scène de 390 × 844) :
   gravité, rebonds sur l'arceau (un tore) et sur le panneau, paniers par la planche. Difficulté légère, réglée par balayage :
   la visée vise D'OFFICE l'arceau depuis le ballon choisi (le geste de côté ne fait que corriger, inversé comme une fronde), l'arceau
   est large (0,3 m de rayon pour un ballon de 0,12) et un aimant discret, seulement en descente près du cercle, grandit après
   chaque raté. Le ralenti au cercle (×0,4) et l'image figée de 80 ms au panier vivent ici : ils changent le temps du monde. */

export const F = 380;
export const CX = 195;
export const CY = 290;
export const RB = 0.12;
export const Z0 = 1.6;
/** Le ballon au repos est centré à y = 640 px (assez haut pour laisser au pouce la place de tirer) : sa hauteur dans le monde s'en déduit. */
export const Y_REPOS = 640;
export const Y0 = -(Y_REPOS - CY) * Z0 / F;
/** Le sol est sous les ballons ; le mur du fond à 7,5 m. */
export const SOL = Y0 - RB;
export const MUR = 7.5;
/** Abscisses (px) des cinq ballons au repos, de 1 (vidé) à 5 (au top). */
export const SLOTS = Object.freeze([43, 119, 195, 271, 347]);
// Deux ballons (la manche « douleur » : oui / non), à mi-chemin du centre et des ballons 2 et 4.
export const SLOTS2 = Object.freeze([127, 263]);
export const ARC = Object.freeze({ y: -0.2, z: 3.2, r: 0.3 });
export const PANNEAU = Object.freeze({ z: 3.58, x: 0.75, y0: -0.35, y1: 0.65 });
const G = -9.8;
const DT = 1 / 240;
/** Tirer de 130 px vers le bas = pleine puissance (08/11 : 170 px, c'était serré pour le doigt — Damien). */
export const TIRAGE_MAX = 130;
/** En dessous de 22 px de tirage, le geste est un toucher, pas un tir. */
export const TIRAGE_MIN = 22;

export const proj = (x, y, z) => ({ x: CX + F * x / z, y: CY - F * y / z, s: F / z });
export const xRepos = (i, slots = SLOTS) => (slots[i] - CX) * Z0 / F;

/** La vitesse au lâcher depuis le geste (dx, dy en px de scène). p ∈ [0, 1] : la puissance. */
export function vitesse(dx, dy, x0) {
  const p = Math.min(1, Math.max(0, dy) / TIRAGE_MAX);
  const vz = 1.45 + 1.4 * p;
  const t = (ARC.z - Z0) / vz;
  // Réglé par balayage pour garder la difficulté d'avant avec les ballons plus hauts : 46 % des dosages marquent depuis les bords,
  // 68 % depuis 2 et 4, 82 % depuis le centre (avant : 38 / 62 / 86).
  return { x: -x0 / t - dx / TIRAGE_MAX * 0.8, y: 4.7 + 2.0 * p, z: vz, p };
}

/** Un ballon qui part du repos `i` (parmi `slots`) avec le geste (dx, dy). `evts` reçoit les chocs (planche, cerceau, panier) pour le son. */
export function lancer(i, dx, dy, slots = SLOTS) {
  const x0 = xRepos(i, slots);
  const v = vitesse(dx, dy, x0);
  return { x: x0, y: Y0, z: Z0, vx: v.x, vy: v.y, vz: v.z, tourne: 0, vtourne: 9 + 8 * v.p, age: 0, marque: null, planche: false, cerceau: 0, passe: null, hautMax: Y0, evts: [], sons: {}, trace: [], traceT: -1 };
}

const evenement = (b, type, temps) => {
  // Un même choc ne sonne qu'une fois par dixième de seconde (un ballon qui frotte l'arceau ne mitraille pas).
  if (b.sons[type] !== undefined && temps - b.sons[type] < 0.1) return;
  b.sons[type] = temps;
  b.evts.push(type);
};

function aimant(b, dt, rates) {
  if (b.vy >= 0) return;
  const qx = b.x; const qz = b.z - ARC.z; const d = Math.hypot(qx, qz); const haut = b.y - ARC.y;
  if (haut > 0 && haut < 0.55 && d < ARC.r + RB * 1.3) {
    const k = 9 + 7 * Math.min(3, rates);
    b.vx -= qx * k * dt; b.vz -= qz * k * dt;
  }
}

/** Un pas d'intégration. `collisions` faux : la trajectoire montrée pendant la visée (ni chocs ni aimant). */
export function pas(b, dt, collisions = true, rates = 0, temps = 0) {
  b.vy += G * dt;
  if (collisions) aimant(b, dt, rates);
  const avantY = b.y;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  if (!collisions) return;
  // Panneau : un plan vertical derrière l'arceau.
  if (b.z + RB > PANNEAU.z && b.vz > 0 && Math.abs(b.x) < PANNEAU.x && b.y > PANNEAU.y0 && b.y < PANNEAU.y1) {
    b.z = PANNEAU.z - RB; b.vz = -b.vz * 0.5; b.vx *= 0.8; b.planche = true; evenement(b, 'planche', temps);
  }
  // Arceau : on repousse le ballon sur la normale au point le plus proche du cercle.
  const qx = b.x; const qz = b.z - ARC.z; const d = Math.hypot(qx, qz) || 1e-6;
  const kx = qx / d * ARC.r; const kz = ARC.z + qz / d * ARC.r;
  const nx = b.x - kx; const ny = b.y - ARC.y; const nz = b.z - kz; const dist = Math.hypot(nx, ny, nz);
  if (dist < RB + 0.012) {
    const ux = nx / dist; const uy = ny / dist; const uz = nz / dist; const vn = b.vx * ux + b.vy * uy + b.vz * uz;
    if (vn < 0) { b.vx -= 1.55 * vn * ux; b.vy -= 1.55 * vn * uy; b.vz -= 1.55 * vn * uz; b.cerceau += 1; evenement(b, 'cerceau', temps); }
    const pousse = RB + 0.012 - dist; b.x += ux * pousse; b.y += uy * pousse; b.z += uz * pousse;
  }
  // Panier : le centre traverse le plan de l'arceau, en descendant, à l'intérieur du cercle.
  if (b.marque === null && avantY > ARC.y && b.y <= ARC.y && d < ARC.r - RB * 0.35) {
    b.marque = temps; b.vx *= 0.3; b.vz *= 0.3; b.vy *= 0.55; evenement(b, 'panier', temps);
  }
  if (b.marque !== null && b.y < ARC.y - 0.1 && b.y > ARC.y - 0.45) b.vy = Math.max(b.vy, -2.2); // le filet freine
  if (!b.passe && avantY > ARC.y && b.y <= ARC.y) b.passe = { d, z: b.z, x: b.x };
  b.hautMax = Math.max(b.hautMax, b.y);
}

/**
 * Avance le vol de `dt` secondes réelles ; `temps` est l'horloge réelle (s). Rend vrai quand le vol est FINI (le ballon est retombé).
 * Ralenti ×0,4 à l'approche du cercle ; image figée 80 ms quand ça rentre. `fige` faux : ni ralenti ni image figée.
 */
export function avancer(b, dt, rates, temps, fige = true) {
  const d = Math.hypot(b.x, b.z - ARC.z); const h = b.y - ARC.y;
  let k = 1;
  if (fige && b.marque !== null && temps - b.marque < 0.08) k = 0;
  else if (fige && b.marque === null && b.vy < 0 && h < 0.4 && h > -0.2 && d < ARC.r + 0.25) k = 0.4;
  if (b.traceT < 0 || temps - b.traceT > 0.03) { b.trace.push({ x: b.x, y: b.y, z: b.z }); b.traceT = temps; if (b.trace.length > 9) b.trace.shift(); }
  const dm = dt * k;
  if (dm > 0) {
    const n = Math.max(1, Math.round(dm / DT));
    for (let q = 0; q < n; q++) pas(b, dm / n, true, rates, temps);
    b.tourne += b.vtourne * dm; b.age += dm;
  }
  return b.y < Y0 - 0.25 || b.age > 3.2 || b.z < 1.0;
}

/** Le conseil après un raté : trop court, trop fort (planche), de côté, ou trop long (retombe derrière). */
export function conseil(b) {
  if (b.hautMax < ARC.y + 0.05) return 'Un peu plus fort';
  // La planche dit « trop fort » ; sinon le côté passe avant la profondeur : un tir dévié qui retombe aussi derrière l'arceau doit
  // entendre « vise au centre », pas « moins fort ».
  if (b.planche) return 'Un peu moins fort';
  if (b.passe && Math.abs(b.passe.x) > ARC.r * 0.8) return 'Vise un peu plus au centre';
  if (b.passe && b.passe.z > ARC.z + 0.08) return 'Un peu moins fort';
  return 'Un peu plus fort';
}

/** Les points de la trajectoire montrée pendant la visée (la même physique, sans chocs), un toutes les 40 ms. */
export function trajectoire(i, dx, dy, slots = SLOTS) {
  const b = lancer(i, dx, dy, slots);
  const points = [];
  for (let k = 0; k < 140; k++) {
    pas(b, 1 / 120, false);
    if (k % 5 === 4) points.push(proj(b.x, b.y, b.z));
    if (b.z > PANNEAU.z || (b.vy < 0 && b.y < ARC.y - 0.5)) break;
  }
  return points;
}

/** Un tir joué jusqu'au bout à pas fixes (tests, réglage) : { marque, planche, conseil }. */
export function simuler(i, dx, dy, rates = 0, slots = SLOTS) {
  const b = lancer(i, dx, dy, slots);
  let temps = 0;
  for (let k = 0; k < 2000; k++) {
    temps += 1 / 60;
    if (avancer(b, 1 / 60, rates, temps)) break;
  }
  return { marque: b.marque !== null, planche: b.planche, conseil: b.marque !== null ? '' : conseil(b) };
}
