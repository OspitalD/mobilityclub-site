/* Démo scroll-telling « ton programme en sept écrans » (page Halloween).
   Le défilement de la page fait avancer les étapes ; le téléphone collant change d'écran
   (fondu + glissement .35 s). Les écrans 1, 2, 3 et 5 sont jouables sans jamais bloquer le scroll.
   Choix de zone (étape 2) reporté aux étapes 4 et 5. Vanilla, sans dépendance. */
(function () {
  'use strict';
  var root = document.getElementById('hd');
  if (!root) return;
  var reduit = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var N = 7;

  var STEPS = [
    { t: 'Ton objectif', p: 'Tu dis ce que tu veux vraiment : calmer une douleur, revenir d\'une blessure, durer, performer.' },
    { t: 'Ta zone', p: 'Tu désignes la zone qui te gêne le plus. Elle passe en premier dans ton programme.' },
    { t: 'Ton bilan', p: 'Un test guidé mesure ton amplitude, photo à l\'appui. Tu sais d\'où tu pars.' },
    { t: 'Ton programme', p: 'Le programme de ta zone, 12 semaines, construit sur ton bilan.' },
    { t: 'Ta fréquence', p: '3, 4 ou 5 séances par semaine : le programme rentre dans ta vie, pas l\'inverse.' },
    { t: 'Ta séance du jour', p: 'Chaque jour, la séance est décidée. Tu lances, sans réfléchir à quoi faire.' },
    { t: 'Ton retest', p: 'À la fin des 12 semaines, tu refais ton bilan : l\'écart est mesuré, pas ressenti.' }
  ];
  var OBJ = ['Calmer une douleur', 'Revenir d\'une blessure', 'Protéger mes articulations dans le temps', 'Performer dans mon sport'];
  var ZONES = [
    { id: 'epaule', n: 'Épaule', l: 'Épaules', y: .20, side: 'l', pts: [[.6056, .2434, 1], [.4073, .2501, 1]], img: 'epaule', pos: '50% 78%' },
    { id: 'hanche', n: 'Hanche', l: 'Hanches', y: .50, side: 'l', pts: [[.5524, .4854, 1], [.4561, .4851, 1]], img: 'hanche' },
    { id: 'colonne', n: 'Colonne', l: 'Colonne', y: .31, side: 'r', pts: [[.5272, .2854, 0], [.5158, .3995, 1]], img: 'colonne' },
    { id: 'chaine', n: 'Chaîne postérieure', l: 'Chaîne postérieure', y: .64, side: 'r', pts: [[.572, .5509, 1], [.4665, .5498, 0]] },
    { id: 'cheville', n: 'Cheville', l: 'Chevilles', y: .88, side: 'l', pts: [[.6042, .8897, 1], [.4245, .8785, 0]], img: 'cheville' }
  ];
  var PALLIERS = ['Bras sous l\'horizontale', 'Bras au-dessus de l\'horizontale (≈120°)', 'Bras proche de la verticale (≈150°)', 'Main à 10–20 cm du mur (≈170°)', 'Main touche le mur, omoplates plaquées'];
  var FREQS = [3, 4, 5];
  var obj = -1, zone = -1, freq = 4, side = 'D', lvl = { D: 3, G: 3 }, current = 0;

  var zi = function () { return zone >= 0 ? zone : 0; };
  var score = function () { return Math.round(46 + ((lvl.D + lvl.G) / 2) / 4 * 40); };
  var calcLine = function () { return '<b>' + freq + ' séances</b> × 12 semaines = <b>' + (freq * 12) + ' séances</b> sur ta zone'; };

  /* ---------- structure ---------- */
  var stepsEl = root.querySelector('.hd-steps');
  var canvas = root.querySelector('.hd-canvas');
  var frame = root.querySelector('.hd-frame');
  var col = root.querySelector('.hd-phonecol');
  var badge = root.querySelector('.hd-badge');
  var dotsEl = root.querySelector('.hd-dots');
  var announce = root.querySelector('.hd-announce');

  var stepEls = STEPS.map(function (s, i) {
    var li = document.createElement('li');
    li.className = 'hd-step' + (i === 0 ? ' on' : '');
    li.setAttribute('aria-label', 'Étape ' + (i + 1) + ' sur ' + N);
    li.innerHTML = '<div class="hd-txt"><h3>' + s.t + '</h3><p>' + s.p + '</p><div class="hd-live" aria-live="polite"></div></div>';
    stepsEl.appendChild(li);
    return li;
  });
  var scr = STEPS.map(function (s, i) {
    var d = document.createElement('div');
    d.className = 'hd-scr';
    d.setAttribute('inert', ''); d.setAttribute('aria-hidden', 'true');
    canvas.appendChild(d);
    return d;
  });
  dotsEl.innerHTML = STEPS.map(function () { return '<i></i>'; }).join('');
  var dotEls = dotsEl.children;

  var segHtml = function (i) {
    var g = Math.min(4, Math.floor(i / (N - 1) * 5)), h = '';
    for (var k = 0; k < 5; k++) h += '<div class="ob-seg' + (k < g ? ' is-done' : (k === g ? ' is-active' : '')) + '"><span></span></div>';
    return h;
  };
  function hdr(i, label) {
    return '<header class="ob-top"><div class="ob-nav"><span class="hd-sp" aria-hidden="true"></span><p class="ob-section">' + label + '</p>' +
      '<span class="ob-count" aria-label="Étape ' + (i + 1) + ' sur ' + N + '">' + (i + 1) + '/' + N + '</span></div>' +
      '<div class="ob-prog" aria-hidden="true">' + segHtml(i) + '</div></header>';
  }
  function setup(el, cls) { el.className = 'hd-scr ob' + (cls ? ' ' + cls : '') + (el.classList.contains('on') ? ' on' : ''); }
  function paintChips(el, sel) {
    Array.prototype.forEach.call(el.querySelectorAll('.ob-chip'), function (c, k) {
      c.classList.toggle('is-selected', k === sel); c.setAttribute('aria-checked', k === sel ? 'true' : 'false');
    });
  }

  /* ---------- texte de gauche qui réagit ---------- */
  function live() {
    var z = ZONES[zi()];
    var t = [
      obj >= 0 ? 'Ici : <b>' + OBJ[obj] + '</b>' : 'À toi : <b>touche une réponse</b> sur le téléphone',
      zone >= 0 ? 'Ici : <b>' + z.n + '</b>' : 'À toi : <b>touche une zone</b> du corps (par défaut : Épaules)',
      'Ici : <b>' + score() + '/100</b> à l\'épaule, glisse le curseur',
      'Ici : <b>' + z.n + '</b>, 12 semaines',
      calcLine(),
      'Décidée <b>chaque matin</b>, d\'après ton bilan',
      'Retest : <b>semaine 12</b>, l\'écart en points'
    ];
    stepEls.forEach(function (li, i) { li.querySelector('.hd-live').innerHTML = t[i]; });
  }

  /* ---------- 1 objectif ---------- */
  function renderObj() {
    var el = scr[0]; setup(el);
    el.innerHTML = hdr(0, 'Onboarding') + '<div class="ob-motion"><h3 class="ob-title">Quel est ton objectif principal ?</h3>' +
      '<div class="ob-list" role="radiogroup" aria-label="Objectif principal">' +
      OBJ.map(function (o) { return '<button type="button" role="radio" class="ob-chip" aria-checked="false"><span class="ob-lab">' + o + '</span></button>'; }).join('') + '</div></div>';
    Array.prototype.forEach.call(el.querySelectorAll('.ob-chip'), function (c, k) {
      c.addEventListener('click', function () { obj = k; paintChips(el, k); live(); });
    });
    paintChips(el, obj);
  }

  /* ---------- 2 zone ---------- */
  function scopeDraw() {
    var el = scr[1], sc = el.querySelector('.vs-scene'), svg = el.querySelector('.vs-cables'); if (!sc || !svg) return;
    var W = sc.offsetWidth, H = sc.offsetHeight; if (!W || !H) return;
    var fw = H * 340 / 410, fl = (W - fw) / 2, o = '';
    ZONES.forEach(function (zn, k) {
      var on = (k === zone), col = on ? '#E8A020' : '#F5F5F3', lab = sc.querySelector('[data-k="' + k + '"]'); if (!lab) return;
      var ly = zn.y * H, lx = zn.side === 'l' ? lab.offsetLeft + lab.offsetWidth + 4 : lab.offsetLeft - 4;
      var pts = zn.pts.map(function (q) { return { x: fl + q[0] * fw, y: q[1] * H, f: q[2] }; });
      pts.forEach(function (q) {
        var op = q.f ? 1 : .38;
        o += on ? '<circle cx="' + q.x + '" cy="' + q.y + '" r="26" fill="url(#vsg)"/><circle cx="' + q.x + '" cy="' + q.y + '" r="6" fill="' + col + '" fill-opacity="' + op + '"/>'
          : '<circle cx="' + q.x + '" cy="' + q.y + '" r="4.2" fill="#0D0F0E" fill-opacity=".55" stroke="#F5F5F3" stroke-opacity="' + (.7 * op) + '" stroke-width="1.4"/>';
      });
      var t = pts.reduce(function (a, b) { return zn.side === 'l' ? (b.x < a.x ? b : a) : (b.x > a.x ? b : a); }), d = zn.side === 'l' ? 1 : -1, op2 = on ? .85 : .32;
      o += '<path d="M' + lx + ' ' + ly + ' C ' + (lx + d * 34) + ' ' + ly + ', ' + (t.x - d * 20) + ' ' + t.y + ', ' + t.x + ' ' + t.y + '" fill="none" stroke="' + col + '" stroke-opacity="' + (op2 * (t.f ? 1 : .6)) + '" stroke-width="1.2" stroke-linecap="round"' + (t.f ? '' : ' stroke-dasharray="2 4"') + '/><circle cx="' + lx + '" cy="' + ly + '" r="2" fill="' + col + '" fill-opacity="' + op2 + '"/>';
    });
    svg.innerHTML = '<defs><radialGradient id="vsg"><stop offset="0" stop-color="#E8A020" stop-opacity=".38"/><stop offset="1" stop-color="#E8A020" stop-opacity="0"/></radialGradient></defs>' + o;
  }
  function scopePaint() {
    var el = scr[1];
    Array.prototype.forEach.call(el.querySelectorAll('.vs-z'), function (b, k) { b.setAttribute('aria-checked', k === zone ? 'true' : 'false'); b.parentElement.classList.toggle('on', k === zone); });
    var f = el.querySelector('.vs-foot');
    if (f) f.innerHTML = zone >= 0 ? '<b>' + ZONES[zone].l + '</b><span>Pas encore mesurée</span>' : '<span class="vs-hint">Touche une zone du corps</span>';
    scopeDraw();
  }
  function pickZone(k) { zone = k; scopePaint(); renderProg(); placeZoom(); live(); }
  function renderZone() {
    var el = scr[1]; setup(el, 'vs-screen');
    var bars = [44, 80, 100, 66, 36].map(function (h, i) { return '<i style="height:' + h + '%;animation-delay:' + (i * .15) + 's"></i>'; }).join('');
    var labs = ZONES.map(function (zn, k) { return '<div class="vs-lab ' + zn.side + '" data-k="' + k + '" style="top:calc(' + (zn.y * 100) + '% - 15px)"><button type="button" role="radio" class="vs-z" aria-checked="false">' + zn.l + '</button><span class="vs-dash" aria-hidden="true">—</span></div>'; }).join('');
    el.innerHTML = '<header class="ob-top"><div class="ob-prog" aria-hidden="true">' + segHtml(1) + '</div></header>' +
      '<div class="ob-motion vs-body"><div class="vs-card"><div class="vs-who"><i></i>Coach</div><h3 class="vs-h">Qu\'est-ce qui te gêne ?</h3></div>' +
      '<div class="vs-row"><div class="vs-cap" aria-hidden="true"><span class="vs-eq">' + bars + '</span></div><div class="vs-field">Ou dis-le avec tes mots</div></div>' +
      '<section class="vs-card vs-bilan" aria-label="Ton dernier bilan"><div class="vs-bhd"><span>Ton dernier bilan</span></div>' +
      '<div class="vs-scene" role="radiogroup" aria-label="Zone qui te gêne"><div class="vs-fig"><img src="/assets/app/v2/corps-repli.webp" alt="" aria-hidden="true" draggable="false" loading="lazy"></div><svg class="vs-cables" aria-hidden="true"></svg>' + labs + '</div>' +
      '<div class="vs-foot" aria-live="polite"></div></section></div>';
    Array.prototype.forEach.call(el.querySelectorAll('.vs-z'), function (b, k) { b.addEventListener('click', function () { pickZone(k); }); });
    var sc = el.querySelector('.vs-scene');
    sc.addEventListener('pointerup', function (e) {
      if (e.target.closest('.vs-lab')) return;
      var W = sc.offsetWidth, H = sc.offsetHeight, r = sc.getBoundingClientRect(), fw = H * 340 / 410, fl = (W - fw) / 2;
      var px = (e.clientX - r.left) * (W / (r.width || W)), py = (e.clientY - r.top) * (H / (r.height || H)), best = -1, bd = 34;
      ZONES.forEach(function (zn, k) { zn.pts.forEach(function (q) { var d = Math.hypot(fl + q[0] * fw - px, q[1] * H - py); if (d < bd) { bd = d; best = k; } }); });
      if (best >= 0) pickZone(best);
    });
    if (typeof ResizeObserver === 'function') new ResizeObserver(scopeDraw).observe(sc);
    scopePaint();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scopeDraw);
  }

  /* ---------- 3 bilan ---------- */
  function diagUpdate() {
    var el = scr[2], q = function (s) { return el.querySelector(s); }, v = lvl[side];
    el.setAttribute('data-side', side === 'D' ? 'droit' : 'gauche');
    q('#hdpal').textContent = PALLIERS[v];
    q('#hdnum').innerHTML = (v + 1) + '<small>/5</small>';
    var sl = q('#hdslide'); sl.value = v; sl.style.setProperty('--fill', (v * 25) + '%');
    Array.prototype.forEach.call(el.querySelectorAll('.dg2-side'), function (t) { t.classList.toggle('on', t.getAttribute('data-side') === side); });
    q('#hdimg').src = '/assets/app/v2/diag/p' + (v + 1) + '.jpg';
    live();
  }
  function renderDiag() {
    var el = scr[2], v = lvl[side]; setup(el, 'dg2'); el.setAttribute('data-side', 'droit');
    el.innerHTML = hdr(2, 'Bilan') + '<div class="ob-motion dg2-motion"><div class="dg2-eyebrow">Épaule · Passif</div><h3 class="dg2-title">Flexion d\'épaule</h3>' +
      '<div class="dg2-photo"><img id="hdimg" src="/assets/app/v2/diag/p' + (v + 1) + '.jpg" alt="Test de flexion d\'épaule, photo du palier" loading="lazy">' +
      '<div class="dg2-sides"><button type="button" class="dg2-side on" data-side="D"><i></i>Côté droit</button><button type="button" class="dg2-side" data-side="G"><i></i>Côté gauche</button></div></div>' +
      '<div class="dg2-sl"><div class="dg2-read"><span class="dg2-num" id="hdnum">' + (v + 1) + '<small>/5</small></span><span class="dg2-lbl" id="hdpal">' + PALLIERS[v] + '</span></div>' +
      '<input type="range" class="dg2-range" min="0" max="4" step="1" value="' + v + '" style="--fill:' + (v * 25) + '%" id="hdslide" aria-label="Ton amplitude"></div></div>';
    Array.prototype.forEach.call(el.querySelectorAll('.dg2-side'), function (t) { t.addEventListener('click', function () { side = t.getAttribute('data-side'); diagUpdate(); }); });
    el.querySelector('#hdslide').addEventListener('input', function (e) { lvl[side] = +e.target.value; diagUpdate(); });
  }

  /* ---------- 4 programme (carte Boutique de la zone choisie) ---------- */
  function renderProg() {
    var el = scr[3], zn = ZONES[zi()]; setup(el, 'ob-progscreen');
    el.innerHTML = hdr(3, 'Programme') + '<div class="ob-motion ob-pbody"><div class="ob-pcard ' + (zn.img ? 'has-photo' : 'hd-body') + '">' +
      (zn.img ? '<img src="/assets/halloween/' + zn.img + '.jpg" alt="" decoding="async"' + (zn.pos ? ' style="object-position:' + zn.pos + '"' : '') + '>' : '<div class="hd-zoom" aria-hidden="true"><img src="/assets/app/v2/corps-repli.webp" alt="" draggable="false"></div><div class="hd-veil" aria-hidden="true"></div>') +
      '<span class="ob-ppill">12 sem.</span><p class="ob-plab">Ta zone la plus faible</p><h3 class="ob-ptitle">' + zn.n + '</h3><p class="ob-psub">3 à 5 séances / sem</p></div>' +
      '<p class="ob-pmeta">12 semaines · 90 €</p><p class="ob-pwhy hd-orange">+ un 2<sup>e</sup> programme offert jusqu\'à samedi minuit</p></div>';
  }

  function placeZoom() {
    var card = scr[3].querySelector('.hd-body'); if (!card) return;
    var zm = card.querySelector('.hd-zoom'), zn = ZONES[zi()], Z = 3;
    var cw = card.offsetWidth, ch = card.offsetHeight; if (!cw || !ch) return;
    var W = cw * Z, H = W * 410 / 340;
    var px = 0, py = 0; zn.pts.forEach(function (q) { px += q[0]; py += q[1]; }); px /= zn.pts.length; py /= zn.pts.length;
    zm.style.cssText = 'width:' + W + 'px;height:' + H + 'px;left:' + (cw / 2 - px * W) + 'px;top:' + (ch * 0.38 - py * H) + 'px';
    zn.pts.forEach(function (q) {
      var g = document.createElement('i'); g.className = 'hd-glow';
      g.style.cssText = 'left:' + (q[0] * 100) + '%;top:' + (q[1] * 100) + '%;opacity:' + (q[2] ? 1 : .55);
      zm.appendChild(g);
    });
  }

  /* ---------- 5 fréquence ---------- */
  function renderFreq() {
    var el = scr[4]; setup(el);
    el.innerHTML = hdr(4, 'Programme') + '<div class="ob-motion"><h3 class="ob-title">Combien de séances par semaine ?</h3><div class="ob-list" role="radiogroup" aria-label="Séances par semaine">' +
      FREQS.map(function (n) { return '<button type="button" role="radio" class="ob-chip" aria-checked="false"><span class="ob-lab">' + n + ' séances</span></button>'; }).join('') +
      '</div><p class="ob-calc" id="hdcalc">' + calcLine() + '</p></div>';
    Array.prototype.forEach.call(el.querySelectorAll('.ob-chip'), function (c, k) {
      c.addEventListener('click', function () { freq = FREQS[k]; paintChips(el, k); el.querySelector('#hdcalc').innerHTML = calcLine(); live(); });
    });
    paintChips(el, FREQS.indexOf(freq));
  }

  /* ---------- 6-7 captures ---------- */
  function renderShot(i, src, alt) {
    scr[i].className = 'hd-scr is-shot';
    scr[i].innerHTML = '<img src="' + src + '" alt="' + alt + '" width="390" height="844" loading="lazy" decoding="async">';
  }

  renderObj(); renderZone(); renderDiag(); renderProg(); renderFreq(); placeZoom();
  renderShot(5, '/assets/app/v2/today-session.jpg', 'Écran Aujourd\'hui : la séance du jour est prête');
  renderShot(6, '/assets/halloween/app-bilan.jpg', 'Écran Bilan : radar et score à refaire après 12 semaines');
  live();

  /* ---------- échelle du canvas (écrans conçus en 320 × 692) ---------- */
  function scale() { canvas.style.setProperty('--k', (frame.clientHeight / 649).toFixed(4)); scopeDraw(); }
  if (typeof ResizeObserver === 'function') new ResizeObserver(scale).observe(frame);
  window.addEventListener('resize', scale, { passive: true });
  scale();

  /* ---------- changement d'écran ---------- */
  function show(i, first) {
    current = i;
    scr.forEach(function (el, k) {
      var on = k === i;
      el.classList.toggle('on', on);
      if (on) { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); } else { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
    });
    stepEls.forEach(function (li, k) { li.classList.toggle('on', k === i); if (k === i) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
    Array.prototype.forEach.call(dotEls, function (d, k) { d.classList.toggle('on', k === i); });
    badge.textContent = i + 1;
    if (!reduit && !first) { badge.classList.remove('pop'); void badge.offsetWidth; badge.classList.add('pop'); }
    announce.textContent = 'Écran ' + (i + 1) + ' sur ' + N + ' : ' + STEPS[i].t;
    if (i === 1) scopeDraw();
  }

  /* ---------- l'étape qui passe au centre (bureau) ou sous le téléphone (mobile) ---------- */
  var mq = window.matchMedia('(min-width: 900px)');
  var ticking = false;
  function tick() {
    ticking = false;
    var ih = window.innerHeight || 800, focal;
    focal = mq.matches ? ih * 0.5 : col.getBoundingClientRect().bottom + 56;
    var best = 0;
    for (var k = 0; k < stepEls.length; k++) {
      if (stepEls[k].getBoundingClientRect().top <= focal) best = k;
    }
    if (best !== current) show(best);
  }
  function schedule() { if (!ticking) { ticking = true; requestAnimationFrame(tick); } }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  show(0, true);
  tick();
  window.__demoEtat = function () { return { current: current, zone: zone, freq: freq }; };
})();
