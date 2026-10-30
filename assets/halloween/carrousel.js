/* Carrousel « 100 % personnalisé » + barre CTA collante (mobile).
   Auto-défilement 5,5 s par étape, pause au toucher / survol / focus / hors écran,
   aucune lecture automatique si prefers-reduced-motion. */
(function () {
  'use strict';
  var DUR = 5500;
  var reduit = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var imgs = document.querySelectorAll('#pscreen img');
  var segs = document.querySelectorAll('#segs .seg');
  var dots = document.querySelectorAll('#dots .dot');
  var lis = document.querySelectorAll('#psteps li');
  var zone = document.getElementById('pphone');
  var cur = 0, ecoule = 0, last = 0, raf = 0;
  var pause = { toucher: false, survol: false, focus: false, hors: true };

  function actif() { return !reduit && !pause.toucher && !pause.survol && !pause.focus && !pause.hors; }
  function rendre() {
    for (var k = 0; k < imgs.length; k++) {
      imgs[k].classList.toggle('on', k === cur);
      dots[k].classList.toggle('on', k === cur);
      lis[k].classList.toggle('on', k === cur);
      if (dots[k].getAttribute('aria-current')) dots[k].removeAttribute('aria-current');
      var p = k < cur ? 1 : k === cur ? (reduit ? 1 : Math.min(ecoule / DUR, 1)) : 0;
      segs[k].firstElementChild.style.transform = 'scaleX(' + p + ')';
    }
    dots[cur].setAttribute('aria-current', 'step');
  }
  function aller(n) { cur = (n + imgs.length) % imgs.length; ecoule = 0; rendre(); }
  function boucle(t) {
    raf = 0;
    if (actif()) {
      ecoule += t - last;
      if (ecoule >= DUR) { cur = (cur + 1) % imgs.length; ecoule = 0; }
      rendre();
    }
    last = t;
    if (!reduit) raf = requestAnimationFrame(boucle);
  }
  function lancer() { if (!raf && !reduit) { last = performance.now(); raf = requestAnimationFrame(boucle); } }

  if (!imgs.length || !zone) return;
  segs.forEach(function (b, i) { b.addEventListener('click', function () { aller(i); }); });
  dots.forEach(function (b, i) { b.addEventListener('click', function () { aller(i); }); });
  lis.forEach(function (li, i) { li.addEventListener('click', function () { aller(i); }); });
  zone.addEventListener('pointerdown', function () { pause.toucher = true; });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (e) { zone.addEventListener(e, function () { pause.toucher = false; }); });
  zone.addEventListener('mouseenter', function () { pause.survol = true; });
  zone.addEventListener('mouseleave', function () { pause.survol = false; });
  zone.addEventListener('focusin', function () { pause.focus = true; });
  zone.addEventListener('focusout', function () { pause.focus = false; });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { pause.hors = !es[0].isIntersecting; }, { threshold: 0.35 }).observe(zone);
  } else { pause.hors = false; }
  window.__persoEtat = function () { return { cur: cur, ecoule: ecoule, pause: pause }; };
  rendre(); lancer();

  /* barre CTA collante : visible une fois le héros dépassé */
  var sticky = document.getElementById('sticky'), hero = document.querySelector('.hero');
  if (sticky && hero && 'IntersectionObserver' in window) {
    /* La barre collante n'apparaît qu'entre le héros et l'appel final : jamais deux boutons verts à l'écran. */
    var vus = { hero: true, fin: false }, fin = document.querySelector('.final');
    var maj = function () { sticky.classList.toggle('show', !vus.hero && !vus.fin); };
    new IntersectionObserver(function (es) { vus.hero = es[0].isIntersecting; maj(); }, { threshold: 0 }).observe(hero);
    if (fin) new IntersectionObserver(function (es) { vus.fin = es[0].isIntersecting; maj(); }, { threshold: 0 }).observe(fin);
  }
})();
