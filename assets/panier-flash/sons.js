/* Les sons du panier, synthétisés (Web Audio, aucun fichier) : ondes carrées des consoles pour le jeu, souffle filtré pour le filet,
   la salle (un souffle grave, très bas) et la foule. Tout est muet sans Web Audio ; `fermer()` coupe la salle et libère le contexte. */
export function creerSons() {
  let ctx = null;
  let salle = null;
  let ferme = false; // après fermer(), plus rien ne rouvre de contexte (les applaudissements différés tombent dans le vide)
  const actif = () => {
    if (ferme) return null;
    try {
      if (!ctx) {
        const C = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
        if (!C) return null;
        ctx = new C();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch { return null; }
  };
  const bruit = (c, duree, boucle = false) => {
    const n = Math.floor(c.sampleRate * duree); const b = c.createBuffer(1, n, c.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = b; s.loop = boucle;
    return s;
  };
  const sons = {
    /** À appeler dans un geste : débloque l'audio et lance la salle. */
    debloquer() {
      const c = actif(); if (!c || salle) return;
      const s = bruit(c, 2, true); const f = c.createBiquadFilter(); const g = c.createGain();
      f.type = 'lowpass'; f.frequency.value = 220; g.gain.value = 0.018;
      s.connect(f); f.connect(g); g.connect(c.destination); s.start(); salle = s;
    },
    bip(frequences, ecart, volume, type = 'sine') {
      const c = actif(); if (!c) return;
      frequences.forEach((fq, i) => {
        const o = c.createOscillator(); const g = c.createGain(); const t = c.currentTime + i * ecart;
        o.type = type; o.frequency.value = fq;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(volume, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.34);
      });
    },
    souffle(hz0, hz1, duree, volume) {
      const c = actif(); if (!c) return;
      const s = bruit(c, duree); const f = c.createBiquadFilter(); const g = c.createGain(); const t = c.currentTime;
      f.type = 'bandpass'; f.Q.value = 1.1; f.frequency.setValueAtTime(hz0, t); f.frequency.exponentialRampToValueAtTime(hz1, t + duree);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(volume, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
      s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
    },
    /** La foule : bruit filtré qui gonfle puis retombe ; `grave` = le « oh » d'un raté, sinon une ovation avec applaudissements. */
    foule(volume, duree, grave = false) {
      const c = actif(); if (!c) return;
      const s = bruit(c, duree); const f = c.createBiquadFilter(); const g = c.createGain(); const t = c.currentTime;
      f.type = 'bandpass'; f.Q.value = 0.8;
      f.frequency.setValueAtTime(grave ? 520 : 900, t); f.frequency.exponentialRampToValueAtTime(grave ? 280 : 1500, t + duree * 0.4);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(volume, t + duree * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
      s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
      if (!grave) for (let k = 0; k < 14; k++) setTimeout(() => sons.souffle(2600 + Math.random() * 1800, 1800, 0.05, 0.03), 120 + k * 55 + Math.random() * 40);
    },
    fermer() {
      ferme = true;
      try { if (salle) salle.stop(); } catch { /* déjà arrêtée */ }
      salle = null;
      try { if (ctx) ctx.close(); } catch { /* déjà fermé */ }
      ctx = null;
    },
  };
  return sons;
}
