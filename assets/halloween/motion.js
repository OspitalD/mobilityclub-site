/* Motion de la page Halloween — portage sans React de deux composants 10K Design :
   - BlurText (web-video-hero) : titres révélés mot à mot, flou 10 px → 5 px → net, montée avec léger dépassement,
     0,7 s par mot, 0,1 s entre deux mots ;
   - ScrollReveal / ScrollRevealGroup (web-scroll-reveal) : blocs en « fade-up » (40 px, flou 8 px) au défilement,
     courbe [0.22, 1, 0.36, 1], 0,7 s, cascade de 0,08 s, seuil 15 %, marge basse −8 %, rattrapage au retour d'onglet.
   Rien ne se cache si JavaScript ne tourne pas, ni si « réduire les animations » est demandé. */
(function () {
  'use strict';
  var reduit = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduit || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('mo');

  /* ---------- BlurText ---------- */
  function decouperMots(el) {
    var i = 0;
    (function parcourir(n) {
      Array.prototype.slice.call(n.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var morceaux = c.textContent.split(/(\s+)/);
          var frag = document.createDocumentFragment();
          morceaux.forEach(function (m) {
            if (!m) return;
            if (/^\s+$/.test(m)) { frag.appendChild(document.createTextNode(m)); return; }
            var s = document.createElement('span');
            s.className = 'bw'; s.textContent = m; s.style.setProperty('--i', i++);
            frag.appendChild(s);
          });
          n.replaceChild(frag, c);
        } else if (c.nodeType === 1 && c.tagName !== 'BR') parcourir(c);
      });
    })(el);
    el.classList.add('bt');
  }
  var titres = document.querySelectorAll('.hero h1, #t-pb, #t-perso, #t-cats, #t-faq, .final h2.live');
  Array.prototype.forEach.call(titres, decouperMots);

  /* ---------- ScrollReveal / Group ---------- */
  var GROUPES = ['.hero .lede', '.hero .fan', '.hero .tiles', '.probleme p', '.pb-list li', '.ba p', '.perso-sub', '.psteps li',
    '.pphone', '.offer', '.clubline', '.faq details', '.final .lede', '.prix li', '.risque', '.cta-row'];
  var parent = new Map();
  GROUPES.forEach(function (sel) {
    Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
      if (el.classList.contains('sr')) return;
      var p = el.parentElement, n = parent.get(p) || 0;
      parent.set(p, n + 1);
      el.classList.add('sr');
      el.style.setProperty('--d', (Math.min(n, 6) * 0.08) + 's');
    });
  });

  var io = new IntersectionObserver(function (entrees) {
    entrees.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      io.unobserve(e.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  Array.prototype.forEach.call(document.querySelectorAll('.sr, .bt'), function (el) { io.observe(el); });

  /* Retour d'onglet ou restauration bfcache : ce qui est déjà à l'écran apparaît tout de suite. */
  function rattraper() {
    if (document.visibilityState !== 'visible') return;
    var h = window.innerHeight || 1;
    Array.prototype.forEach.call(document.querySelectorAll('.sr:not(.in), .bt:not(.in)'), function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < h * 0.95 && r.bottom > h * 0.05) el.classList.add('in');
    });
  }
  document.addEventListener('visibilitychange', rattraper);
  window.addEventListener('pageshow', rattraper);
})();
