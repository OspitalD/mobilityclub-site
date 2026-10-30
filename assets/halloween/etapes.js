/* Bureau : le téléphone collant change d'écran selon l'étape visible. Mobile : chaque étape a son propre écran. */
(function () {
  'use strict';
  var imgs = document.querySelectorAll('.sticky-phone img');
  var steps = document.querySelectorAll('.step');
  if (!imgs.length || !steps.length || !('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      var i = Number(e.target.getAttribute('data-i'));
      for (var k = 0; k < imgs.length; k++) imgs[k].classList.toggle('on', k === i);
    });
  }, { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach(function (s) { io.observe(s); });
})();
