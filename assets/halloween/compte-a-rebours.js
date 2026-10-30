/* Compte à rebours Halloween. Fin fixe : samedi 1er novembre 2026, 23 h 59 Paris = 22:59:00Z.
   Jamais de redémarrage : passé la fin, la page bascule en « offre terminée » et y reste. */
(function () {
  'use strict';
  var FIN = Date.parse('2026-11-01T22:59:00Z');
  var els = {
    d: document.getElementById('cd-d'), h: document.getElementById('cd-h'),
    m: document.getElementById('cd-m'), s: document.getElementById('cd-s')
  };
  var timer = null;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function tick() {
    var reste = FIN - Date.now();
    if (!(reste > 0)) {
      document.body.classList.add('is-ended');
      document.title = 'Offre terminée | Mobility Club';
      clearInterval(timer);
      return;
    }
    var s = Math.floor(reste / 1000);
    els.d.textContent = pad(Math.floor(s / 86400));
    els.h.textContent = pad(Math.floor((s % 86400) / 3600));
    els.m.textContent = pad(Math.floor((s % 3600) / 60));
    els.s.textContent = pad(s % 60);
  }
  tick();
  timer = setInterval(tick, 1000);
})();
