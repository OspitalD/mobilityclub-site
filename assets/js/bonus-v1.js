/* Bonus de rattrapage (/lancement, décision Damien 26/10).
   Après la fin de la fenêtre, une pop-up propose de rouvrir les prix V1 pendant 5 min,
   une seule fois par visiteur. Le bonus vient du serveur (e.bonus de offre-v2, null hors
   période) ; ce script ne fait que le proposer, puis réapplique l'offre « fenêtre » avec
   une fin à +5 min : compteur, prix, liens et bascule réutilisent offre-v2.js.
   Une fois par visiteur = compté dans son navigateur (localStorage). Le vrai verrou
   reste la désactivation des anciens plans PayPal, mercredi matin.
   Intégration : <script src="/assets/js/bonus-v1.js" defer></script> après offre-v2.js. */
(function () {
  "use strict";
  if (window.__mcBonusV1 || !window.MCOffre) return;
  window.__mcBonusV1 = true;

  var CLE = "mc_bonus_v1", DELAI_POPUP = 1500;
  var TXT = {
    fr: {
      titre: "Tu arrives juste après la fin.",
      corps: function (p) { return "Je te rouvre les prix de la V1 pendant 5 minutes, une seule fois : l’accès à vie à " + p.vie + " € (ou 4 × " + p.vie_4x + " €) au lieu de " + p.vie_v2 + " €, le mensuel à " + p.mensuel + " € au lieu de " + p.mensuel_v2 + " €."; },
      activer: "Activer mes 5 minutes", non: "Non merci", fermer: "Fermer", barre: "Prix V1 réactivés"
    },
    en: {
      titre: "You just missed the deadline.",
      corps: function (p) { return "I’m reopening the V1 prices for 5 minutes, one time only: lifetime access at €" + p.vie + " (or 4 × €" + p.vie_4x + ") instead of €" + p.vie_v2 + ", monthly at €" + p.mensuel + " instead of €" + p.mensuel_v2 + "."; },
      activer: "Start my 5 minutes", non: "No thanks", fermer: "Close", barre: "V1 prices back on"
    }
  };
  function langue() { return /^en/i.test(document.documentElement.lang || "") ? "en" : "fr"; }
  function fmt(n) {
    var sep = langue() === "en" ? "." : ",";
    var s = (Math.round(n * 100) / 100).toFixed(2).replace(".", sep);
    return s.slice(-3) === sep + "00" ? s.slice(0, -3) : s;
  }
  function suivre(ev, props) {
    try { if (typeof window.track === "function") window.track(ev, Object.assign({ path: location.pathname }, props || {})); } catch (e) { /* le suivi ne casse jamais la page */ }
  }
  function lire() { try { return JSON.parse(localStorage.getItem(CLE) || "null"); } catch (e) { return null; } }
  function ecrire(v) { try { localStorage.setItem(CLE, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function maintenant() { return Date.now() + (MCOffre.decalage ? MCOffre.decalage() : 0); }

  var css =
    ".mcbo-fond{position:fixed;inset:0;z-index:110;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(13,15,14,.78);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);opacity:0;transition:opacity .25s ease}" +
    ".mcbo-fond.mcbo-in{opacity:1}" +
    ".mcbo-boite{position:relative;width:100%;max-width:440px;padding:28px 24px 22px;text-align:center;background:#111412;transform:translateY(12px);transition:transform .35s cubic-bezier(.2,1.2,.4,1)}" +
    ".mcbo-fond.mcbo-in .mcbo-boite{transform:none}" +
    ".mcbo-boite h2{margin:0 0 12px;font-size:22px;line-height:1.2;font-weight:800;color:#F5F5F3}" +
    ".mcbo-boite p{margin:0 0 22px;font-size:15px;line-height:1.55;color:#B9BBB9}" +
    ".mcbo-chrono{font-size:40px;font-weight:800;letter-spacing:-.5px;color:#E8A020;margin:0 0 18px;font-variant-numeric:tabular-nums}" +
    ".mcbo-boite .cta{width:100%}" +
    ".mcbo-non{display:block;margin:12px auto 0;padding:8px 12px;background:none;border:0;color:#7A7C7A;font:500 14px/1 inherit;font-family:inherit;cursor:pointer}" +
    ".mcbo-non:hover{color:#F5F5F3}" +
    ".mcbo-x{position:absolute;top:10px;right:10px;width:36px;height:36px;border-radius:50%;border:0;background:transparent;color:#7A7C7A;font:400 24px/1 system-ui,sans-serif;cursor:pointer}" +
    ".mcbo-x:hover{color:#F5F5F3}" +
    ".mcbo-barre{position:fixed;top:0;left:0;right:0;z-index:70;display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 16px;padding-top:max(10px,env(safe-area-inset-top));background:#E8A020;color:#0D0F0E;font-weight:700;font-size:14px;text-decoration:none}" +
    ".mcbo-barre b{font-variant-numeric:tabular-nums;font-size:16px}" +
    "@media (prefers-reduced-motion:reduce){.mcbo-fond,.mcbo-boite{transition:none!important}}";
  function style() {
    if (document.getElementById("mcbo-style")) return;
    var st = document.createElement("style"); st.id = "mcbo-style"; st.textContent = css; document.head.appendChild(st);
  }

  var popup = null, barre = null, propose = false, actif = null, avant = null;

  function etatBonus(e, b) {
    return {
      phase: "fenetre",
      fin: new Date(b.fin).toISOString(),
      maintenant: new Date(maintenant()).toISOString(),
      prix: b.prix,
      prix_v2: e.prix_v2,
      liens: { mensuel: e.liens && e.liens.mensuel, annuel: e.liens && e.liens.annuel, vie: b.liens.vie, mensuel_fixe: b.liens.mensuel_fixe },
      __bonus: true
    };
  }

  function afficherBarre(b) {
    style();
    if (!barre) {
      barre = document.createElement("a");
      barre.className = "mcbo-barre"; barre.href = "#offre";
      barre.innerHTML = "<span></span><b data-offre-compteur></b>";
      document.body.appendChild(barre);
    }
    barre.firstChild.textContent = TXT[langue()].barre;
    barre.lastChild.textContent = MCOffre.texteCompteur({ fin: new Date(b.fin).toISOString() });
  }
  function retirerBarre() { if (barre && barre.parentNode) barre.parentNode.removeChild(barre); barre = null; }

  function activerSur(e, b) {
    actif = b;
    afficherBarre(b);
    MCOffre.appliquerOffre(etatBonus(e, b));
    clearTimeout(activerSur.t);
    activerSur.t = setTimeout(function () { actif = null; retirerBarre(); }, Math.max(0, b.fin - maintenant()) + 60);
  }

  function fermerPopup() {
    if (!popup) return;
    document.removeEventListener("keydown", surTouche, true);
    popup.parentNode && popup.parentNode.removeChild(popup);
    popup = null;
    if (avant && avant.focus && document.contains(avant)) avant.focus();
  }
  function surTouche(ev) {
    if (ev.key === "Escape" || ev.key === "Esc") { ev.preventDefault(); fermerPopup(); return; }
    if (ev.key === "Tab" && popup) {
      var f = popup.querySelectorAll("button"), i = Array.prototype.indexOf.call(f, document.activeElement);
      if (ev.shiftKey && i <= 0) { ev.preventDefault(); f[f.length - 1].focus(); }
      else if (!ev.shiftKey && i === f.length - 1) { ev.preventDefault(); f[0].focus(); }
    }
  }

  function proposer(e) {
    if (propose || popup) return;
    propose = true;
    setTimeout(function () {
      var cur = MCOffre.etat();
      if (!cur || cur.phase !== "v2" || !cur.bonus || lire()) return;
      e = cur;
      style();
      var t = TXT[langue()], p = e.bonus.prix, v2 = e.prix_v2 || {};
      avant = document.activeElement;
      popup = document.createElement("div");
      popup.className = "mcbo-fond";
      popup.setAttribute("role", "dialog"); popup.setAttribute("aria-modal", "true"); popup.setAttribute("aria-labelledby", "mcbo-titre");
      popup.innerHTML =
        "<div class=\"mcbo-boite glass\">" +
        "<button type=\"button\" class=\"mcbo-x\"></button>" +
        "<h2 id=\"mcbo-titre\"></h2><div class=\"mcbo-chrono\">05:00</div><p></p>" +
        "<button type=\"button\" class=\"cta primary mcbo-oui\"></button>" +
        "<button type=\"button\" class=\"mcbo-non\"></button></div>";
      popup.querySelector("h2").textContent = t.titre;
      popup.querySelector("p").textContent = t.corps({ vie: fmt(p.vie), vie_4x: fmt(p.vie_4x), mensuel: fmt(p.mensuel), vie_v2: fmt(v2.vie || 350), mensuel_v2: fmt(v2.mensuel || 30) });
      popup.querySelector(".mcbo-oui").textContent = t.activer;
      popup.querySelector(".mcbo-non").textContent = t.non;
      popup.querySelector(".mcbo-x").textContent = "×";
      popup.querySelector(".mcbo-x").setAttribute("aria-label", t.fermer);
      document.body.appendChild(popup);
      popup.addEventListener("click", function (ev) { if (ev.target === popup) fermerPopup(); });
      popup.querySelector(".mcbo-x").addEventListener("click", fermerPopup);
      popup.querySelector(".mcbo-non").addEventListener("click", fermerPopup);
      popup.querySelector(".mcbo-oui").addEventListener("click", function () {
        var cur2 = MCOffre.etat();
        var bonus = (cur2 && cur2.bonus) || e.bonus;
        var debut = maintenant();
        var b = { debut: debut, fin: debut + bonus.duree_ms, prix: bonus.prix, liens: bonus.liens };
        if (!ecrire(b)) { fermerPopup(); return; } // sans stockage, impossible de tenir « une seule fois »
        fermerPopup();
        suivre("bonus_activated");
        activerSur(cur2 || e, b);
        var o = document.getElementById("offre");
        if (o && o.scrollIntoView) o.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      document.addEventListener("keydown", surTouche, true);
      requestAnimationFrame(function () { popup && popup.classList.add("mcbo-in"); });
      popup.querySelector(".mcbo-oui").focus();
      suivre("bonus_shown");
    }, DELAI_POPUP);
  }

  MCOffre.onChange(function (e) {
    if (!e || e.__bonus || e.phase !== "v2") return;
    var b = lire();
    if (b) {
      // Bonus déjà pris : actif tant que ses 5 min courent, consommé ensuite.
      // Différé : appliqué pendant l'appliquerOffre en cours, son programmer() final
      // (phase v2) annulerait la bascule de fin des 5 min.
      if (b.fin && maintenant() < b.fin && b.liens && b.prix) setTimeout(function () { activerSur(MCOffre.etat() && !MCOffre.etat().__bonus ? MCOffre.etat() : e, b); }, 0);
      else { actif = null; retirerBarre(); }
      return;
    }
    if (e.bonus && !e.local) proposer(e);
  });

  document.addEventListener("click", function (ev) {
    if (!actif) return;
    var a = ev.target && ev.target.closest && ev.target.closest("[data-offre-lien]");
    if (a) suivre("bonus_plan_clicked", { plan: a.getAttribute("data-offre-lien") });
  }, true);
})();
