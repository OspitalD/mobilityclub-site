/* Offre de lancement V2 côté navigateur. Sans module, sans dépendance.
   Source de vérité = GET /.netlify/functions/offre-v2 ; ce script ne fait que
   l'afficher. Attributs : data-offre-prix="mensuel|annuel|vie|annuel-mois|vie-4x"
   (+ data-offre-eur pour suffixer " €"), data-offre-prix-v2="mensuel|annuel|vie"
   (prix d'après la fenêtre, lus de e.prix_v2), data-offre-lien, data-offre-phase,
   data-offre-compteur. window.MC_OFFRE_FIN (ISO) = heure de fin embarquée. */
(function () {
  'use strict';
  // Une seule copie navigateur de la fin (tests/offre-v2-pages.test.mjs la compare à FIN_FENETRE).
  // Sert de repli si le fetch échoue ; une page peut la surcharger avant ce script.
  window.MC_OFFRE_FIN = window.MC_OFFRE_FIN || '2026-10-26T18:00:00.000Z';
  var URL_OFFRE = '/.netlify/functions/offre-v2';
  var PRIX = {
    fenetre: { mensuel: 25, annuel: 220, vie: 249 },
    v2: { mensuel: 30, annuel: 275, vie: 350 }
  };
  var listeners = [];
  var etat = null;        // dernier état appliqué
  var decalage = 0;       // serveur - client (ms) : le compteur suit l'horloge serveur
  var timerFin = null;
  var timerTick = null;

  // Séparateur décimal selon la langue de la page : 18,33 (fr) / 18.33 (en).
  function fmt(n) {
    var sep = /^en/i.test(document.documentElement.lang || '') ? '.' : ',';
    var s = (Math.round(n * 100) / 100).toFixed(2).replace('.', sep);
    return s.slice(-3) === sep + '00' ? s.slice(0, -3) : s;
  }
  function maintenant() { return Date.now() + decalage; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Repli sans réseau. Pourquoi des liens v2 génériques : le navigateur ne connaît
  // pas les plan_id V2 ; mieux vaut renvoyer vers la page d'achat que rendre un ancien plan.
  function etatLocal() {
    var fin = window.MC_OFFRE_FIN;
    var t = maintenant();
    var phase = fin && t >= Date.parse(fin) ? 'v2' : 'fenetre';
    return {
      phase: phase,
      fin: fin || null,
      maintenant: new Date(t).toISOString(),
      prix: PRIX[phase],
      prix_v2: PRIX.v2,
      liens: phase === 'v2'
        ? { mensuel: '/devenir-membre', annuel: '/devenir-membre', vie: '/lifetime' }
        : null, // fenêtre : on garde les href du HTML (les anciens plans)
      local: true
    };
  }

  function valeurPrix(cle, e) {
    var p = e.prix;
    if (cle === 'annuel-mois') return fmt(p.annuel / 12);
    if (cle === 'vie-4x') return fmt(p.vie / 4);
    return p[cle] == null ? null : fmt(p[cle]);
  }

  function texteCompteur(e) {
    var reste = e.fin ? Date.parse(e.fin) - maintenant() : 0;
    // Jamais négatif ni reparti de zéro : on plafonne à 00:00:00.
    if (!(reste > 0)) return '00:00:00';
    var s = Math.floor(reste / 1000);
    return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
  }

  function rafraichirCompteurs() {
    if (!etat) return;
    var els = document.querySelectorAll('[data-offre-compteur]');
    var t = texteCompteur(etat);
    for (var i = 0; i < els.length; i++) els[i].textContent = t;
  }

  function appliquerOffre(e) {
    etat = e;
    var i, els, v;
    els = document.querySelectorAll('[data-offre-prix]');
    for (i = 0; i < els.length; i++) {
      v = valeurPrix(els[i].getAttribute('data-offre-prix'), e);
      if (v != null) els[i].textContent = v + (els[i].hasAttribute('data-offre-eur') ? ' €' : '');
    }
    els = document.querySelectorAll('[data-offre-prix-v2]');
    for (i = 0; i < els.length; i++) {
      v = e.prix_v2 && e.prix_v2[els[i].getAttribute('data-offre-prix-v2')];
      if (v != null) els[i].textContent = fmt(v);
    }
    els = document.querySelectorAll('[data-offre-lien]');
    for (i = 0; i < els.length; i++) {
      var cle = els[i].getAttribute('data-offre-lien');
      // « achat » = le CTA principal des pages vitrine : la page de lancement pendant
      // la fenêtre, la page d'achat ensuite. Dérivé de la phase, pas du contrat de liens.
      v = cle === 'achat' ? (e.phase === 'fenetre' ? '/lancement' : '/devenir-membre') : e.liens && e.liens[cle];
      if (v) {
        els[i].setAttribute('href', v);
        // Un lien interne ne s'ouvre pas dans un nouvel onglet.
        if (v.charAt(0) === '/') { els[i].removeAttribute('target'); }
      }
    }
    els = document.querySelectorAll('[data-offre-phase]');
    for (i = 0; i < els.length; i++) {
      var visible = els[i].getAttribute('data-offre-phase') === e.phase;
      els[i].hidden = !visible;
      els[i].style.display = visible ? '' : 'none';
    }
    document.documentElement.setAttribute('data-offre', e.phase);
    rafraichirCompteurs();
    for (i = 0; i < listeners.length; i++) { try { listeners[i](e); } catch (err) { /* un abonné cassé ne doit pas bloquer les autres */ } }
    programmer(e);
  }

  // Bascule sans rechargement à l'heure de fin, puis reconfirmation serveur.
  function programmer(e) {
    clearTimeout(timerFin);
    if (e.phase !== 'fenetre' || !e.fin) return;
    var delai = Date.parse(e.fin) - maintenant();
    timerFin = setTimeout(function () {
      appliquerOffre(etatLocal());
      chargerOffre().then(appliquerOffre);
    }, delai > 0 ? Math.min(delai, 2147483000) + 50 : 1000); // 1 s mini : évite une boucle si les horloges divergent
  }

  function chargerOffre() {
    var t0 = Date.now();
    return fetch(URL_OFFRE, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('offre ' + r.status); return r.json(); })
      .then(function (e) {
        if (!e || !e.phase || !e.prix) throw new Error('offre invalide');
        decalage = Date.parse(e.maintenant) - Math.round((t0 + Date.now()) / 2);
        return e;
      })
      .catch(function () { return etatLocal(); });
  }

  function demarrer() {
    // Passe locale immédiate : un visiteur arrivé après la fin ne doit pas voir
    // (ni cliquer) l'ancien lien pendant que le fetch est en vol.
    if (window.MC_OFFRE_FIN) appliquerOffre(etatLocal());
    chargerOffre().then(appliquerOffre);
    clearInterval(timerTick);
    timerTick = setInterval(rafraichirCompteurs, 1000);
  }

  window.MCOffre = {
    chargerOffre: chargerOffre,
    appliquerOffre: appliquerOffre,
    onChange: function (cb) { listeners.push(cb); if (etat) cb(etat); },
    etat: function () { return etat; },
    texteCompteur: texteCompteur
  };
  window.chargerOffre = chargerOffre;
  window.appliquerOffre = appliquerOffre;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
