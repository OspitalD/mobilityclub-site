/* Barre CTA collante (mobile) : visible une fois le héros dépassé, masquée sur l'appel final. */
(function () {
  'use strict';
  /* barre CTA collante : visible une fois le héros dépassé */
  var sticky = document.getElementById('sticky'), hero = document.querySelector('.hero');
  if (sticky && hero && 'IntersectionObserver' in window) {
    /* La barre collante n'apparaît qu'entre le héros et l'appel final : jamais deux boutons verts à l'écran. */
    var vus = { hero: true, fin: false, demo: false }, demo = document.getElementById('hd'), fin = document.querySelector('.final');
    var maj = function () { sticky.classList.toggle('show', !vus.hero && !vus.fin && !vus.demo); };
    new IntersectionObserver(function (es) { vus.hero = es[0].isIntersecting; maj(); }, { threshold: 0 }).observe(hero);
    /* Pendant la démo, le téléphone et le texte d'étape ont toute la hauteur : pas de barre par-dessus. */
    if (demo) new IntersectionObserver(function (es) { vus.demo = es[0].isIntersecting; maj(); }, { threshold: 0 }).observe(demo);
    if (fin) new IntersectionObserver(function (es) { vus.fin = es[0].isIntersecting; maj(); }, { threshold: 0 }).observe(fin);
  }
})();
