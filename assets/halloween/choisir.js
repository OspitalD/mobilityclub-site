/* Page de sélection Halloween : poche à 2 programmes (glisser-déposer, toucher, clavier),
   prix 90 € / 49 € selon les catégories, paiement par lien PayPal fixe. Aucun appel serveur. */
(function () {
  'use strict';

  /* ===== Liens de paiement PayPal de Damien (un par combinaison) ===== */
  var LIEN_ARTI_ARTI = 'https://www.paypal.com/ncp/payment/DTPGVKVNVUWFN'; // Articulation × 2 → 90 €
  var LIEN_ARTI_WARM = 'https://www.paypal.com/ncp/payment/5ZJNN3XXPTA22'; // Articulation + Warm Up → 90 €
  var LIEN_WARM_WARM = 'https://www.paypal.com/ncp/payment/GMPJCDHDK2VVQ'; // Warm Up × 2 → 49 €
  /* ================================================================== */

  var FIN = Date.parse('2026-11-01T22:59:00Z');
  var CLE = 'mc_halloween_selection';

  /* Liens réels uniquement : https PayPal. Tant qu'un lien est provisoire, aucun bouton de paiement actif. */
  function lienValide(u) { return /^https:\/\/(www\.)?(paypal\.com|paypal\.me|paypal\.link)\/\S+$/i.test(u); }

  var CAT = {
    articulation: { nom: 'Articulation', prix: 90, desc: 'Une zone. Bilan de ta zone, 3, 4 ou 5 séances par semaine, 12 semaines.' },
    warmup: { nom: 'Warm Up', prix: 49, desc: 'Un mouvement. Bilan de la zone, durée par séance au choix, 12 semaines.' }
  };
  var PROGRAMMES = [
    { id: 'art-epaule', cat: 'articulation', titre: 'Épaule', img: 'epaule', pos: '50% 78%' },
    { id: 'art-hanche', cat: 'articulation', titre: 'Hanche', img: 'hanche' },
    { id: 'art-cheville', cat: 'articulation', titre: 'Cheville', img: 'cheville' },
    { id: 'art-colonne', cat: 'articulation', titre: 'Colonne', img: 'colonne' },
    { id: 'wu-squat', cat: 'warmup', titre: 'Squat', img: 'squat' },
    { id: 'wu-developpe', cat: 'warmup', titre: 'Développé', img: 'colonne' },
    { id: 'wu-tractions', cat: 'warmup', titre: 'Tractions', img: 'epaule', pos: '50% 78%' },
    { id: 'wu-souleve', cat: 'warmup', titre: 'Soulevé de terre', img: 'hanche' },
    { id: 'wu-course', cat: 'warmup', titre: 'Course', img: 'cheville' },
    { id: 'wu-padel', cat: 'warmup', titre: 'Padel', img: 'sol' }
  ];
  var PAR_ID = {};
  PROGRAMMES.forEach(function (p) { p.prix = CAT[p.cat].prix; PAR_ID[p.id] = p; });

  /* Fenêtre Halloween : hors fenêtre, retour à la page « terminé ». */
  if (Date.now() >= FIN) { location.replace('/halloween'); return; }

  var sel = [];            // ids dans l'ordre d'ajout, 2 max
  var reduit = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (id) { return document.getElementById(id); };
  var poche = $('poche'), covers = $('covers'), recap = $('recap'), cta = $('cta'), note = $('note'), msg = $('msg'), live = $('live');

  function eur(n) { return n + ' €'; }

  /* Prix de la poche : 2 programmes = le plus cher, 1 programme = non payable. */
  function calcul() {
    if (sel.length < 2) return null;
    var a = PAR_ID[sel[0]], b = PAR_ID[sel[1]];
    var total = Math.max(a.prix, b.prix);
    var offert = a.prix < b.prix ? a : b.prix < a.prix ? b : b; // le moins cher, à égalité le 2e ajouté
    var paye = offert === a ? b : a;
    return { total: total, paye: paye, offert: offert, somme: a.prix + b.prix, lien: a.cat === 'articulation' && b.cat === 'articulation' ? LIEN_ARTI_ARTI : a.cat === 'warmup' && b.cat === 'warmup' ? LIEN_WARM_WARM : LIEN_ARTI_WARM };
  }

  function annoncer(t) { live.textContent = t; }
  function message(t) { msg.textContent = t || ''; }

  /* ---------- rendu ---------- */
  function rendreEtagères() {
    var h = '';
    Object.keys(CAT).forEach(function (c) {
      h += '<section class="shelf" aria-labelledby="sh-' + c + '"><h2 id="sh-' + c + '">' + CAT[c].nom + ' · ' + eur(CAT[c].prix) + '</h2><p class="d">' + CAT[c].desc + '</p><div class="row">';
      PROGRAMMES.filter(function (p) { return p.cat === c; }).forEach(function (p) {
        h += '<div class="pack' + (p.img ? '' : ' sans-photo') + '" role="button" tabindex="0" aria-pressed="false" data-id="' + p.id + '" aria-label="' + p.titre + ', ' + CAT[c].nom + ', ' + eur(p.prix) + '. Entrée pour ajouter à la poche.">' +
          (p.img ? '<img src="/assets/halloween/' + p.img + '.jpg" alt="" draggable="false" loading="lazy"' + (p.pos ? ' style="object-position:' + p.pos + '"' : '') + ' />' : '') +
          '<b>' + p.titre + '</b><span class="pr">' + eur(p.prix) + '</span></div>';
      });
      h += '</div></section>';
    });
    $('shelves').innerHTML = h;
  }

  function coverHTML(p, i, estOffert, neuf) {
    return '<div class="cover s' + i + (neuf ? ' pop' : '') + '" data-id="' + p.id + '">' +
      (p.img ? '<img src="/assets/halloween/' + p.img + '.jpg" alt=""' + (p.pos ? ' style="object-position:' + p.pos + '"' : '') + ' />' : '<div style="position:absolute;inset:0;background:radial-gradient(90% 70% at 50% 100%,rgba(232,116,42,.4),transparent 70%),linear-gradient(160deg,#1d201e,#111412)"></div>') +
      '<b>' + p.titre + '<small>' + CAT[p.cat].nom + '</small></b>' +
      (estOffert ? '<span class="off">Offert</span>' : '<span class="cprice">' + eur(p.prix) + '</span>') +
      '<button class="x" type="button" aria-label="Retirer ' + p.titre + ' de la poche" data-retirer="' + p.id + '">×</button></div>';
  }

  var dernierAjout = null;
  var dernierMontant = null;
  function montantRoulant(avant, apres) {
    if (avant === null || avant === apres || reduit) return '<span class="ra">' + eur(apres) + '</span>';
    var monte = apres > avant, a = eur(avant), b = eur(apres);
    return '<span class="ra"><span class="ra-sr">' + b + '</span><span class="ra-vp" aria-hidden="true"><span class="ra-tr ' + (monte ? 'ra-up' : 'ra-down') + '">' +
      '<span class="ra-row">' + (monte ? a : b) + '</span><span class="ra-row">' + (monte ? b : a) + '</span></span></span></span>';
  }
  function rendre() {
    var c = calcul();
    poche.className = 'fan pk n' + sel.length + (sel.length ? '' : ' vide') + (poche.classList.contains('over') ? ' over' : '');
    covers.innerHTML = sel.map(function (id, i) {
      var estOffert = c && c.offert.id === id;
      return coverHTML(PAR_ID[id], i, estOffert, id === dernierAjout);
    }).join('');
    dernierAjout = null;
    document.querySelectorAll('.pack').forEach(function (el) {
      var dedans = sel.indexOf(el.getAttribute('data-id')) >= 0;
      el.classList.toggle('in', dedans);
      el.setAttribute('aria-pressed', dedans ? 'true' : 'false');
    });
    /* récap */
    var h = '';
    if (!sel.length) h = '<li><span>Ta poche est vide.</span></li>';
    else if (sel.length === 1) h = '<li><span>' + PAR_ID[sel[0]].titre + '</span><b>' + eur(PAR_ID[sel[0]].prix) + '</b></li>';
    else h = '<li><span>' + c.paye.titre + '</span><b>' + eur(c.paye.prix) + '</b></li>' +
      '<li><span>' + c.offert.titre + '</span><b>offert (valeur ' + eur(c.offert.prix) + ')</b></li>' +
      '';
    /* « À payer » roule à chaque changement (RollingAmount, 10K web-count-up). */
    var montant = c ? c.total : sel.length === 1 ? PAR_ID[sel[0]].prix : 0;
    h += '<li class="tot"><span>À payer</span><span>' + montantRoulant(dernierMontant, montant) + '</span></li>';
    dernierMontant = montant;
    recap.innerHTML = h;
    majBouton(c);
  }

  /* ---------- bouton de paiement ---------- */
  var lienCourant = null;
  function majBouton(c) {
    var el = $('cta');
    var neuf;
    if (!c) {
      neuf = document.createElement('button'); neuf.type = 'button'; neuf.disabled = true;
      neuf.textContent = sel.length ? 'Ajoute ton 2ᵉ programme, il est offert' : 'Choisis tes 2 programmes';
    } else if (!lienValide(c.lien)) {
      neuf = document.createElement('button'); neuf.type = 'button'; neuf.disabled = true;
      neuf.textContent = 'Paiement bientôt disponible';
      lienCourant = null;
    } else {
      neuf = document.createElement('a'); neuf.href = c.lien; neuf.rel = 'noopener';
      neuf.textContent = 'Payer ' + eur(c.total);
      neuf.addEventListener('click', function () { memoriser(c); });
      lienCourant = c.lien;
    }
    neuf.className = 'cta'; neuf.id = 'cta';
    el.replaceWith(neuf); cta = neuf;
  }

  function memoriser(c) {
    try {
      localStorage.setItem(CLE, JSON.stringify({ ids: sel.slice(), titres: sel.map(function (i) { return PAR_ID[i].titre; }), total: c.total, ts: Date.now() }));
    } catch (e) { /* le stockage peut être bloqué : le paiement n'en dépend pas */ }
  }

  /* ---------- actions ---------- */
  function ajouter(id) {
    if (sel.indexOf(id) >= 0) return true;
    if (sel.length >= 2) { message('Ta poche est pleine : retire un programme d\'abord.'); annoncer('Ta poche est pleine. Retire un programme d\'abord.'); return false; }
    message(''); sel.push(id); dernierAjout = id; rendre();
    annoncer(PAR_ID[id].titre + ' ajouté à ta poche.' + (sel.length === 2 ? ' ' + descriptionTotal() : ' Ajoute un deuxième programme, il est offert.'));
    return true;
  }
  function retirer(id) {
    var i = sel.indexOf(id); if (i < 0) return;
    sel.splice(i, 1); message(''); rendre(); annoncer(PAR_ID[id].titre + ' retiré de ta poche.');
  }
  function descriptionTotal() { var c = calcul(); return c ? 'Total ' + c.total + ' euros, ' + c.offert.titre + ' offert.' : ''; }
  function basculer(id) { if (sel.indexOf(id) >= 0) retirer(id); else ajouter(id); }

  /* ---------- glisser-déposer (pointer events : souris et doigt) ---------- */
  var drag = null;
  function surPoche(x, y) {
    var r = poche.getBoundingClientRect(), m = 24;
    return x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m;
  }
  function demarrerGlisse(d, e) {
    var r = d.el.getBoundingClientRect();
    var g = d.el.cloneNode(true);
    g.removeAttribute('id'); g.className = 'pack ghost'; g.style.width = r.width + 'px'; g.style.height = r.height + 'px'; g.style.left = r.left + 'px'; g.style.top = r.top + 'px'; g.setAttribute('aria-hidden', 'true');
    document.body.appendChild(g);
    d.ghost = g; d.dx = e.clientX - r.left; d.dy = e.clientY - r.top; d.rect = r; d.actif = true; d.vx = 0;
    d.el.style.opacity = '.3';
    document.body.style.userSelect = 'none';
    deplacer(e);
  }
  function deplacer(e) {
    var d = drag; if (!d || !d.actif) return;
    var x = e.clientX - d.dx, y = e.clientY - d.dy;
    var tilt = reduit ? 0 : Math.max(-12, Math.min(12, (e.clientX - d.lastX) * 1.2 || d.vx * .8));
    d.vx = tilt; d.lastX = e.clientX;
    d.ghost.style.left = x + 'px'; d.ghost.style.top = y + 'px';
    d.ghost.style.transform = reduit ? '' : 'rotate(' + tilt + 'deg) scale(1.07)';
    poche.classList.toggle('over', surPoche(e.clientX, e.clientY));
  }
  function finirGlisse(e, annule) {
    var d = drag; drag = null; if (!d) return;
    clearTimeout(d.timer);
    document.body.style.userSelect = '';
    if (!d.actif) return;
    var dedans = !annule && surPoche(e.clientX, e.clientY);
    poche.classList.remove('over');
    var g = d.ghost, el = d.el;
    var nettoyer = function () { g.remove(); el.style.opacity = ''; };
    if (dedans) {
      if (!ajouter(el.getAttribute('data-id'))) { retour(g, d, nettoyer); return; }
      if (reduit) { nettoyer(); return; }
      var pr = poche.getBoundingClientRect();
      g.classList.add('back');
      g.style.transform = 'translate(' + ((pr.left + pr.width / 2) - (parseFloat(g.style.left) + d.rect.width / 2)) + 'px,' + ((pr.top + pr.height * .55) - (parseFloat(g.style.top) + d.rect.height / 2)) + 'px) scale(.45)';
      g.style.opacity = '0';
      setTimeout(nettoyer, 300);
    } else retour(g, d, nettoyer);
    d.estClic = false;
  }
  function retour(g, d, fin) {
    if (reduit) { fin(); return; }
    g.classList.add('back');
    g.style.left = d.rect.left + 'px'; g.style.top = d.rect.top + 'px'; g.style.transform = 'scale(1)';
    setTimeout(fin, 300);
  }

  document.addEventListener('pointerdown', function (e) {
    if (e.button && e.button !== 0) return;
    var el = e.target.closest && e.target.closest('.pack');
    if (!el || el.classList.contains('ghost')) return;
    drag = { el: el, id: e.pointerId, x0: e.clientX, y0: e.clientY, lastX: e.clientX, actif: false, tactile: e.pointerType === 'touch' || e.pointerType === 'pen', estClic: true };
    /* doigt : appui long (170 ms) pour saisir, sinon le défilement horizontal reste libre */
    if (drag.tactile) {
      var d = drag;
      d.timer = setTimeout(function () { if (drag === d && !d.actif) { d.estClic = false; demarrerGlisse(d, { clientX: d.x0, clientY: d.y0 }); } }, 170);
    }
  });
  document.addEventListener('pointermove', function (e) {
    var d = drag; if (!d || e.pointerId !== d.id) return;
    if (!d.actif) {
      var dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
      if (d.tactile) { if (dist > 8) { clearTimeout(d.timer); drag = null; } return; }
      if (dist > 5) { d.estClic = false; demarrerGlisse(d, e); }
      return;
    }
    deplacer(e);
  });
  document.addEventListener('pointerup', function (e) {
    var d = drag; if (!d || e.pointerId !== d.id) return;
    if (!d.actif) { clearTimeout(d.timer); var el = d.el; var clic = d.estClic; drag = null; if (clic) basculer(el.getAttribute('data-id')); return; }
    finirGlisse(e, false);
  });
  document.addEventListener('pointercancel', function (e) { if (drag && drag.actif) finirGlisse(e, true); else if (drag) { clearTimeout(drag.timer); drag = null; } });
  /* pendant la prise au doigt, on bloque le défilement */
  document.addEventListener('touchmove', function (e) { if (drag && drag.actif) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', function (e) { if (e.target.closest && e.target.closest('.pack')) e.preventDefault(); });

  /* clavier : Entrée ou Espace sur un paquet */
  document.addEventListener('keydown', function (e) {
    var el = e.target.closest && e.target.closest('.pack');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); basculer(el.getAttribute('data-id')); }
  });
  covers.addEventListener('click', function (e) {
    var b = e.target.closest('[data-retirer]'); if (b) retirer(b.getAttribute('data-retirer'));
  });

  /* restaure une sélection mémorisée si la personne revient (retour navigateur depuis PayPal) */
  function restaurer() {
    try {
      var s = JSON.parse(localStorage.getItem(CLE) || 'null');
      if (s && s.ids && Date.now() - s.ts < 6 * 3600 * 1000) s.ids.slice(0, 2).forEach(function (id) { if (PAR_ID[id] && sel.indexOf(id) < 0) sel.push(id); });
    } catch (e) { /* ignoré */ }
  }

  rendreEtagères(); restaurer(); rendre();
  window.__choisir = { etat: function () { return { sel: sel.slice(), calc: calcul() }; } };
})();
