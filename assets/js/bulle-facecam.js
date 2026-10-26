/* Bulle face cam (lancement V2) — composant autonome, sans dépendance.
   Intégration : <script src="/assets/js/bulle-facecam.js" defer></script> en fin de body.
   Options (attributs du script) : data-src="/assets/video/" (dossier des vidéos).
   Événements : facecam_bubble_shown, facecam_opened via window.track (page) ou window.MCTrack. */
(function () {
  "use strict";
  if (window.__mcBulleFacecam) return;
  window.__mcBulleFacecam = true;

  var script = document.currentScript;
  var BASE = (script && script.getAttribute("data-src")) || "/assets/video/";
  var DELAI = 4000, SEUIL_SCROLL = 0.3, CLE_FERME = "mc_facecam_ferme";
  var TXT = {
    fr: { ouvrir: "Écouter le message de Damien (avec le son)", fermer: "Fermer la bulle vidéo", fermerModale: "Fermer la vidéo", titre: "Message de Damien" },
    en: { ouvrir: "Watch Damien’s message (with sound)", fermer: "Close the video bubble", fermerModale: "Close the video", titre: "A message from Damien" }
  };
  function langue() {
    var l = (document.documentElement.lang || "").slice(0, 2).toLowerCase();
    if (l !== "fr" && l !== "en") { try { l = localStorage.getItem("mc_lang"); } catch (e) { l = null; } }
    return l === "en" ? "en" : "fr";
  }
  function suivre(ev) {
    var props = { path: location.pathname };
    try {
      if (typeof window.track === "function") window.track(ev, props);
      else if (typeof window.MCTrack === "function") window.MCTrack(ev, props);
    } catch (e) { /* le suivi ne casse jamais la page */ }
  }
  var reduit = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mobile = window.matchMedia ? window.matchMedia("(max-width:699.98px)") : { matches: false };

  var css =
    ".mcb-bulle{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:calc(16px + env(safe-area-inset-bottom));z-index:60;width:120px;height:120px;" +
    "border-radius:50%;padding:0;border:0;background:#111412;cursor:pointer;box-shadow:0 0 0 2px #3ECFA0,0 0 0 6px rgba(62,207,160,.16),0 10px 40px rgba(0,0,0,.55),0 0 60px rgba(62,207,160,.22);" +
    "transition:transform .45s cubic-bezier(.2,1.4,.4,1),opacity .3s ease;transform:scale(.4);opacity:0;-webkit-tap-highlight-color:transparent}" +
    "@media (min-width:700px){.mcb-bulle{width:150px;height:150px;right:24px;bottom:24px}}" +
    ".mcb-bulle.mcb-in{transform:scale(1);opacity:1}" +
    ".mcb-bulle.mcb-cache{transform:scale(.6);opacity:0;pointer-events:none}" +
    ".mcb-bulle:focus-visible{outline:3px solid #F5F5F3;outline-offset:4px}" +
    ".mcb-bulle:hover{transform:scale(1.05)}" +
    ".mcb-bulle video{display:block;width:100%;height:100%;object-fit:cover;border-radius:50%;pointer-events:none}" +
    ".mcb-x{position:absolute;top:-4px;left:-4px;width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(13,15,14,.86);color:#F5F5F3;" +
    "font:700 18px/1 'Plus Jakarta Sans',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}" +
    ".mcb-x:focus-visible{outline:2px solid #3ECFA0;outline-offset:2px}" +
    ".mcb-wrap{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:calc(16px + env(safe-area-inset-bottom));z-index:60;width:120px;height:120px}" +
    "@media (min-width:700px){.mcb-wrap{width:150px;height:150px;right:24px;bottom:24px}}" +
    ".mcb-wrap .mcb-bulle{position:absolute;inset:0;right:auto;bottom:auto}" +
    ".mcb-wrap.mcb-off{pointer-events:none}.mcb-wrap.mcb-off .mcb-x{opacity:0}" +
    ".mcb-modale{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));" +
    "background:rgba(13,15,14,.82);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);opacity:0;transition:opacity .25s ease}" +
    ".mcb-modale.mcb-in{opacity:1}" +
    ".mcb-cadre{position:relative;height:min(86vh,86dvh,920px);aspect-ratio:9/16;max-width:100%;border-radius:22px;overflow:hidden;background:#0D0F0E;" +
    "border:1px solid rgba(255,255,255,.12);box-shadow:0 0 80px rgba(62,207,160,.22),0 30px 80px rgba(0,0,0,.6);transform:scale(.94);transition:transform .35s cubic-bezier(.2,1.2,.4,1)}" +
    ".mcb-modale.mcb-in .mcb-cadre{transform:scale(1)}" +
    ".mcb-cadre video{display:block;width:100%;height:100%;object-fit:contain;background:#0D0F0E}" +
    ".mcb-modale .mcb-x{top:12px;left:auto;right:12px;width:40px;height:40px;font-size:22px;z-index:2}" +
    "@media (prefers-reduced-motion:reduce){.mcb-bulle,.mcb-modale,.mcb-cadre{transition:none!important}.mcb-bulle{transform:none}.mcb-bulle:hover{transform:none}}";

  var wrap, bulle, vBulle, fermer, modale = null, declencheur = null, montre = false, masqueParCta = false;

  function sources(v, nom) {
    v.innerHTML = "";
    [["webm", "video/webm"], ["mp4", "video/mp4"]].forEach(function (s) {
      var el = document.createElement("source");
      el.src = BASE + nom + "." + s[0]; el.type = s[1]; v.appendChild(el);
    });
  }
  function libelles() {
    var t = TXT[langue()];
    if (bulle) bulle.setAttribute("aria-label", t.ouvrir);
    if (fermer) fermer.setAttribute("aria-label", t.fermer);
    if (modale) {
      modale.setAttribute("aria-label", t.titre);
      modale.querySelector(".mcb-x").setAttribute("aria-label", t.fermerModale);
    }
  }

  function construire() {
    var st = document.createElement("style");
    st.id = "mcb-style"; st.textContent = css; document.head.appendChild(st);
    wrap = document.createElement("div"); wrap.className = "mcb-wrap";
    bulle = document.createElement("button"); bulle.type = "button"; bulle.className = "mcb-bulle";
    vBulle = document.createElement("video");
    vBulle.muted = true; vBulle.defaultMuted = true; vBulle.loop = true; vBulle.playsInline = true;
    vBulle.setAttribute("muted", ""); vBulle.setAttribute("playsinline", ""); vBulle.setAttribute("aria-hidden", "true");
    vBulle.preload = "none"; vBulle.poster = BASE + "facecam-bulle.jpg";
    bulle.appendChild(vBulle);
    fermer = document.createElement("button"); fermer.type = "button"; fermer.className = "mcb-x"; fermer.innerHTML = "&times;";
    wrap.appendChild(bulle); wrap.appendChild(fermer);
    document.body.appendChild(wrap);
    libelles();
    bulle.addEventListener("click", function () { ouvrir(); });
    fermer.addEventListener("click", function () {
      try { sessionStorage.setItem(CLE_FERME, "1"); } catch (e) {}
      vBulle.pause(); wrap.parentNode && wrap.parentNode.removeChild(wrap);
      window.removeEventListener("scroll", planifier); window.removeEventListener("resize", planifier);
    });
  }

  function montrer() {
    if (montre) return;
    montre = true;
    window.removeEventListener("scroll", surScrollInitial);
    construire();
    if (!reduit) { sources(vBulle, "facecam-bulle"); vBulle.load(); var p = vBulle.play(); if (p && p.catch) p.catch(function () {}); }
    requestAnimationFrame(function () { requestAnimationFrame(function () { bulle.classList.add("mcb-in"); verifier(); }); });
    window.addEventListener("scroll", planifier, { passive: true });
    window.addEventListener("resize", planifier);
    suivre("facecam_bubble_shown");
  }

  /* la bulle ne recouvre jamais un CTA principal visible ; sur mobile, elle s’efface sur #offre */
  var rafId = 0;
  function planifier() { if (!rafId) rafId = requestAnimationFrame(function () { rafId = 0; verifier(); }); }
  function chevauche(a, b, m) { return !(a.right + m < b.left || a.left - m > b.right || a.bottom + m < b.top || a.top - m > b.bottom); }
  function verifier() {
    if (!wrap || !wrap.parentNode) return;
    var r = wrap.getBoundingClientRect(), cacher = false, vh = window.innerHeight;
    if (mobile.matches) {
      var o = document.getElementById("offre");
      if (o) { var ro = o.getBoundingClientRect(); if (ro.top < vh && ro.bottom > 0) cacher = true; }
    }
    if (!cacher) {
      var ctas = document.querySelectorAll(".cta.primary, [data-facecam-eviter]");
      for (var i = 0; i < ctas.length; i++) {
        var rc = ctas[i].getBoundingClientRect();
        if (rc.width && rc.bottom > 0 && rc.top < vh && chevauche(r, rc, 8)) { cacher = true; break; }
      }
    }
    if (cacher !== masqueParCta) {
      masqueParCta = cacher;
      bulle.classList.toggle("mcb-cache", cacher);
      wrap.classList.toggle("mcb-off", cacher);
      bulle.tabIndex = cacher ? -1 : 0; fermer.tabIndex = cacher ? -1 : 0;
      if (!reduit) { if (cacher) vBulle.pause(); else { var p = vBulle.play(); if (p && p.catch) p.catch(function () {}); } }
    }
  }

  function focusables() { return modale ? Array.prototype.slice.call(modale.querySelectorAll("button, video[controls]")) : []; }
  function surTouche(e) {
    if (!modale) return;
    if (e.key === "Escape" || e.key === "Esc") { e.preventDefault(); fermerModale(); return; }
    if (e.key === "Tab") {
      var f = focusables(); if (!f.length) return;
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i === f.length - 1 || i === -1)) { e.preventDefault(); f[0].focus(); }
    }
  }
  var debordAvant = "";
  function ouvrir() {
    if (modale) return;
    declencheur = document.activeElement && document.activeElement !== document.body ? document.activeElement : bulle;
    if (!reduit) vBulle.pause();
    modale = document.createElement("div");
    modale.className = "mcb-modale"; modale.setAttribute("role", "dialog"); modale.setAttribute("aria-modal", "true");
    var cadre = document.createElement("div"); cadre.className = "mcb-cadre";
    var x = document.createElement("button"); x.type = "button"; x.className = "mcb-x"; x.innerHTML = "&times;";
    var v = document.createElement("video");
    v.controls = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.preload = "auto"; v.poster = BASE + "facecam-9x16.jpg";
    v.muted = false;
    sources(v, "facecam-9x16");
    cadre.appendChild(v); cadre.appendChild(x); modale.appendChild(cadre);
    document.body.appendChild(modale);
    libelles();
    debordAvant = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    x.addEventListener("click", fermerModale);
    modale.addEventListener("click", function (e) { if (e.target === modale) fermerModale(); });
    document.addEventListener("keydown", surTouche, true);
    v.currentTime = 0;
    var p = v.play(); if (p && p.catch) p.catch(function () {});
    requestAnimationFrame(function () { modale.classList.add("mcb-in"); });
    x.focus();
    suivre("facecam_opened");
  }
  function fermerModale() {
    if (!modale) return;
    var m = modale; modale = null;
    var v = m.querySelector("video"); if (v) { v.pause(); v.removeAttribute("src"); while (v.firstChild) v.removeChild(v.firstChild); v.load(); }
    document.removeEventListener("keydown", surTouche, true);
    document.documentElement.style.overflow = debordAvant;
    m.parentNode && m.parentNode.removeChild(m);
    if (!reduit && wrap && wrap.parentNode && !masqueParCta) { var p = vBulle.play(); if (p && p.catch) p.catch(function () {}); }
    var cible = declencheur && document.contains(declencheur) ? declencheur : bulle;
    if (cible && cible.focus) cible.focus();
  }

  function surScrollInitial() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (h > 0 && window.scrollY / h >= SEUIL_SCROLL) montrer();
  }
  function demarrer() {
    try { if (sessionStorage.getItem(CLE_FERME) === "1") return; } catch (e) {}
    setTimeout(montrer, DELAI);
    window.addEventListener("scroll", surScrollInitial, { passive: true });
    if (window.MutationObserver) new MutationObserver(libelles).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  }
  window.MCBulleFacecam = { montrer: montrer, ouvrir: function () { montrer(); ouvrir(); }, fermer: fermerModale };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer); else demarrer();
})();
