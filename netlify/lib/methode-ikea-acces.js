// Page d'achat / d'accès de /methode-ikea : servie par la Function tant qu'aucune
// session valide n'existe. Structure de l'offre : méthode Hormozi ($100M Offers),
// voir offre-methode-ikea.md (session « App club v2.0 pour formation IKEA »).
//   « Acheter l'accès » : offre principale (97 €, 2 appels inclus, X places par
//     mois). Le downsell (49 €, sans appel) n'apparaît qu'après un « Non merci »,
//     un paiement annulé, ou quand les places du mois sont prises.
//   « J'ai déjà acheté » : email → code à 6 chiffres (Resend) → accès.
// Même langage visuel que le-suivi.html / index.html (mur sombre, jade, Bricolage).

import { ABONNEMENT, affiche, calendly, quart } from './methode-ikea.js';

// ── VALEURS DU STACK : validées par Damien le 2026-10-18 ─────────────────────
// Ne jamais afficher une valeur qu'il ne peut pas défendre. Modifier ici.
const STACK = [
  { titre: 'La formation : 5 modules vidéo', detail: 'Besoins, contexte, sélection, plaisir, template : la méthode de Mobility Pro, celle que j\'applique aux membres du Club.', valeur: 97 },
  { titre: 'Les 6 outils interactifs', detail: 'La liste de courses, le mètre ruban, le rayon et ses 4 scénarios, le coup de cœur, la notice de montage et la nouvelle Matrice de séance. Ils pré-remplissent et vérifient à ta place.', valeur: 120 },
  { titre: 'Les 10 fiches formats et leurs progressions', detail: 'Chaque format de séance, avec son dosage et la suite quand ça devient facile.', valeur: 29 },
  { titre: '2 appels de 30 min avec moi', detail: 'On valide ta routine ensemble, et on corrige le tir si besoin.', valeur: 100, appels: true },
];
const BONUS = 'Inclus aussi : le Bilan articulaire, la librairie de 130 exercices filmés et un timer par format.';

// ── TEXTES ────────────────────────────────────────────────────────────────────
const TEXTES = {
  eyebrow: 'Formation · Mise à jour 2026',
  titre: 'La Méthode IKEA',
  accroche: 'Monte ta routine de mobilité en 5 étapes. Et refais-le pour chaque client.',
  sousTitre: 'Pour les sportifs qui veulent une routine qu\'ils font vraiment, et les coachs qui veulent une méthode à transmettre.',
  objections: [
    ['« Je ne sais pas par où commencer »', 'Module 1 et la liste de courses : une mission principale, deux articulations maximum.'],
    ['« Je n\'ai pas le temps »', 'Module 2 et le mètre ruban : 5 minutes placées dans ta semaine.'],
    ['« Trop d\'exercices sur Insta, lesquels choisir ? »', 'Module 3, le rayon et ses 4 scénarios : les outils prioritaires d\'abord.'],
    ['« J\'abandonne au bout de deux semaines »', 'Module 4 et le coup de cœur : plaisir × efficacité.'],
    ['« Je ne sais pas doser ni assembler »', 'Module 5, la notice de montage et le timer.'],
    ['« Ma séance change tous les jours »', 'La Matrice de séance : un arbre de décision pour chaque jour.'],
    ['« Et si je me trompe ? »', '2 appels de 30 min avec moi (offre à 97 €).'],
    ['Coach : « chaque client est différent »', 'La même méthode, rejouable pour chaque client.'],
  ],
  garantie: {
    titre: 'Garantie notice de montage',
    phrase: 'Si ton meuble ne tient pas debout, je te rembourse.',
    conditions: 'Suis les 5 modules, remplis les outils, puis fais ta routine 3 semaines (au moins 3 séances par semaine). Si tu n\'as toujours pas une routine que tu tiens et qui te fait progresser, écris-moi dans les 30 jours après l\'achat : je te rembourse intégralement. Même garantie sur l\'offre sans appels.',
  },
  downsell: {
    titre: 'Pas besoin des appels ?',
    intro: 'La même formation, les mêmes outils, la même garantie. Sans les 2 appels.',
    refus: 'Non merci, je n\'ai pas besoin des appels',
    retour: 'Finalement, je veux les appels',
  },
};

const valeurTotale = (avecAppels) => STACK.filter((s) => avecAppels || !s.appels).reduce((t, s) => t + s.valeur, 0);
const inclus = (avecAppels) => `<ul class="incl">${STACK.filter((s) => avecAppels || !s.appels).map((s) => `<li>${s.titre}</li>`).join('')}</ul>`;

const nomMois = (offset = 0) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'Europe/Paris' }).format(d);
};

export const pageAcces = ({ principale, downsell, contact, places, placesTotal }) => {
  const complet = places <= 0;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Méthode IKEA · Mobility Club</title>
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="${TEXTES.accroche}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Spectral:ital,wght@1,400;1,500&family=JetBrains+Mono:wght@500;600&display=swap">
<style>
:root{
  --wall:#0D0F0E; --wall-2:#111412; --wall-3:#161a18;
  --line:rgba(255,255,255,.075); --line-2:rgba(255,255,255,.14);
  --chalk:#F5F5F3; --dust:#8C908D; --jade:#3ECFA0; --jade-ink:#0D0F0E; --gold:#E8A020; --red:#E05A4A;
  --f-display:"Bricolage Grotesque","Plus Jakarta Sans",ui-sans-serif,sans-serif;
  --f-body:"Plus Jakarta Sans",ui-sans-serif,system-ui,sans-serif;
  --f-accent:"Spectral",Georgia,"Times New Roman",serif;
  --f-mono:"JetBrains Mono",ui-monospace,Menlo,monospace;
  color-scheme:dark;
}
*{box-sizing:border-box}
body{margin:0;background:var(--wall);color:var(--chalk);font-family:var(--f-body);font-size:17px;line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:inherit}
:focus-visible{outline:2px solid var(--jade);outline-offset:3px}
.wrap{max-width:1120px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.bar{border-bottom:1px solid var(--line)}
.bar .wrap{display:flex;align-items:center;justify-content:space-between;height:64px}
.brand{font-family:var(--f-display);font-weight:800;letter-spacing:-.03em;text-decoration:none;font-size:18px}
.brand b{color:var(--jade)}
.eyebrow{font-family:var(--f-mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--jade)}
h1{font-family:var(--f-display);font-weight:800;line-height:.93;letter-spacing:-.055em;text-wrap:balance;margin:14px 0 20px;font-size:clamp(44px,7vw,88px)}
h2{font-family:var(--f-display);font-weight:700;letter-spacing:-.03em;font-size:22px;margin:0 0 12px}
h3{font-family:var(--f-display);font-weight:800;letter-spacing:-.04em;font-size:clamp(28px,3.4vw,38px);line-height:1;margin:0 0 22px}
.lead{font-size:clamp(20px,2.2vw,24px);line-height:1.3;max-width:26ch;margin:0 0 14px;font-weight:600}
.sub{color:var(--dust);max-width:44ch;margin:0}
.grid{display:grid;grid-template-columns:1.1fr .9fr;grid-template-areas:"hero panel" "details panel";column-gap:56px;padding:72px 0 96px;align-items:start}
.hero{grid-area:hero}
.details{grid-area:details}
.panel{grid-area:panel}
.block{margin-top:64px}
.stack{list-style:none;padding:0;margin:0;border-top:1px solid var(--line)}
.stack li{display:grid;grid-template-columns:1fr auto;gap:4px 20px;padding:18px 0;border-bottom:1px solid var(--line)}
.stack .t{font-weight:700}
.stack .d{grid-column:1;color:var(--dust);font-size:15px}
.stack .v{grid-column:2;grid-row:1;font-family:var(--f-mono);font-size:13px;color:var(--dust);white-space:nowrap}
.stack .call .t::after{content:"offre à 97 €";margin-left:10px;font-family:var(--f-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--jade);border:1px solid rgba(62,207,160,.35);border-radius:999px;padding:2px 8px;vertical-align:2px}
.total{display:flex;justify-content:space-between;gap:16px;padding:18px 0 0;font-family:var(--f-mono);font-size:13px;color:var(--dust)}
.total b{color:var(--chalk)}
.bonus{color:var(--dust);font-size:15px;margin:14px 0 0}
.obj{display:grid;grid-template-columns:1fr 1.2fr;border-top:1px solid var(--line);margin:0}
.obj dt,.obj dd{margin:0;padding:14px 0;border-bottom:1px solid var(--line)}
.obj dt{font-family:var(--f-accent);font-style:italic;font-size:18px;padding-right:20px}
.obj dd{color:var(--dust);font-size:15px}
.guarantee{border:1px solid rgba(62,207,160,.35);border-radius:20px;padding:28px;background:linear-gradient(180deg,rgba(62,207,160,.06),transparent)}
.guarantee .phrase{font-family:var(--f-accent);font-style:italic;font-size:clamp(22px,2.6vw,28px);line-height:1.25;margin:0 0 14px}
.guarantee p{margin:0;color:var(--dust);font-size:15px}
.panel{background:var(--wall-2);border:1px solid var(--line-2);border-radius:20px;padding:28px;position:sticky;top:24px}
.tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;background:var(--wall);border-radius:999px;padding:4px;margin-bottom:26px}
.tabs button{font:600 14px var(--f-body);color:var(--dust);background:none;border:0;border-radius:999px;padding:11px 8px;cursor:pointer}
.tabs button[aria-selected="true"]{background:var(--wall-3);color:var(--chalk);box-shadow:inset 0 0 0 1px var(--line-2)}
.price{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;margin:0 0 4px}
.price b{font-family:var(--f-display);font-size:56px;letter-spacing:-.05em;line-height:1}
.price s{color:var(--dust);font-size:22px;font-family:var(--f-display);font-weight:600}
.price span{color:var(--dust);flex-basis:100%;font-size:14px}
.split{font-size:14px;color:var(--chalk);margin:0 0 14px}
.split b{color:var(--jade)}
.places{display:flex;align-items:center;gap:8px;font-family:var(--f-mono);font-size:12px;letter-spacing:.04em;color:var(--gold);margin:0 0 18px}
.places::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--gold)}
.full{font-size:14px;color:var(--dust);border:1px dashed var(--line-2);border-radius:12px;padding:12px 14px;margin:0 0 20px}
.incl{list-style:none;padding:0;margin:0 0 22px;border-top:1px solid var(--line)}
.incl li{padding:10px 0 10px 26px;border-bottom:1px solid var(--line);position:relative;font-size:15px}
.incl li::before{content:"";position:absolute;left:4px;top:17px;width:10px;height:6px;border-left:2px solid var(--jade);border-bottom:2px solid var(--jade);transform:rotate(-45deg)}
.note{color:var(--dust);font-size:14px;margin:0 0 22px}
label{display:block;font-size:13px;font-weight:600;color:var(--dust);margin:0 0 8px}
input{width:100%;font:500 17px var(--f-body);color:var(--chalk);background:var(--wall);border:1px solid var(--line-2);border-radius:12px;padding:14px 16px;margin:0 0 14px}
input:focus{outline:none;border-color:var(--jade)}
input.code{font-family:var(--f-mono);font-size:26px;letter-spacing:.35em;text-align:center}
.cta{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;font:700 16px var(--f-body);color:var(--jade-ink);background:var(--jade);border:0;border-radius:999px;padding:16px 22px;cursor:pointer;text-decoration:none;transition:transform .2s cubic-bezier(.16,1,.3,1)}
.cta:hover{transform:translateY(-1px)}
.cta[disabled]{opacity:.55;cursor:wait;transform:none}
.cta.ghost{background:none;color:var(--chalk);box-shadow:inset 0 0 0 1px var(--line-2);margin-top:10px}
.link{display:inline-block;background:none;border:0;color:var(--dust);font:500 14px var(--f-body);text-decoration:underline;text-underline-offset:3px;cursor:pointer;padding:12px 0 0}
.help{border-top:1px solid var(--line);margin-top:22px;padding-top:16px;font-size:14px;color:var(--dust)}
.help p{margin:0 0 6px}
.help a{color:var(--chalk)}
.msg{min-height:22px;font-size:14px;margin:14px 0 0;color:var(--dust)}
.msg.err{color:var(--red)}
.msg.ok{color:var(--jade)}
.legal{font-size:12px;color:var(--dust);margin:16px 0 0}
.guar-mini{font-size:13px;color:var(--dust);margin:14px 0 0}
.guar-mini b{color:var(--chalk)}
[hidden]{display:none!important}
footer{border-top:1px solid var(--line);color:var(--dust);font-size:13px}
footer .wrap{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-top:22px;padding-bottom:28px}
@media (max-width:860px){
  .grid{grid-template-columns:1fr;grid-template-areas:"hero" "panel" "details";padding:44px 0 64px}
  .panel{position:static;padding:22px;margin-top:36px}
  .block{margin-top:52px}
  .obj{grid-template-columns:1fr}
  .obj dt{border-bottom:0;padding-bottom:2px}
  .obj dd{padding-top:0}
  .guarantee{padding:22px}
}
</style>
</head>
<body>
<header class="bar"><div class="wrap">
  <a class="brand" href="/methode-ikea">Mobility <b>Club</b></a>
  <span class="eyebrow">Formation</span>
</div></header>

<main class="wrap grid">
  <section class="hero">
    <span class="eyebrow">${TEXTES.eyebrow}</span>
    <h1>${TEXTES.titre}</h1>
    <p class="lead">${TEXTES.accroche}</p>
    <p class="sub">${TEXTES.sousTitre}</p>
  </section>

  <div class="details">
    <section class="block" aria-labelledby="h-stack">
      <h3 id="h-stack">Ce que tu reçois</h3>
      <ul class="stack">
        ${STACK.map((s) => `<li${s.appels ? ' class="call"' : ''}><span class="t">${s.titre}</span><span class="v">valeur ${s.valeur} €</span><span class="d">${s.detail}</span></li>`).join('\n        ')}
      </ul>
      <div class="total"><span>Valeur totale</span><span><b>${valeurTotale(true)} €</b> · aujourd'hui ${affiche(principale.prix)} €</span></div>
      <p class="bonus">${BONUS}</p>
    </section>

    <section class="block" aria-labelledby="h-obj">
      <h3 id="h-obj">Ce qui t'a arrêté jusqu'ici</h3>
      <dl class="obj">
        ${TEXTES.objections.map(([o, r]) => `<dt>${o}</dt><dd>${r}</dd>`).join('\n        ')}
      </dl>
    </section>

    <section class="block guarantee" aria-labelledby="h-gar">
      <span class="eyebrow" id="h-gar">${TEXTES.garantie.titre}</span>
      <p class="phrase" style="margin-top:12px">${TEXTES.garantie.phrase}</p>
      <p>${TEXTES.garantie.conditions}</p>
    </section>
  </div>

  <aside class="panel" aria-label="Accéder à la formation">
    <div class="tabs" role="tablist" id="tabs">
      <button type="button" role="tab" id="tab-buy" aria-selected="true" aria-controls="pane-buy">Acheter l'accès</button>
      <button type="button" role="tab" id="tab-login" aria-selected="false" aria-controls="pane-login">J'ai déjà acheté</button>
    </div>

    <div id="pane-buy" role="tabpanel" aria-labelledby="tab-buy">
      <div id="offer-avec_appels"${complet ? ' hidden' : ''}>
        <h2>Formation + 2 appels</h2>
        <p class="price"><b>${affiche(principale.prix)} €</b><s>${principale.barre} €</s><span>une fois · accès à vie</span></p>
        <p class="split">ou <b>4 × ${quart(principale.prix)} €</b> avec le paiement en 4X PayPal</p>
        <p class="places">${places} place${places > 1 ? 's' : ''} avec appels sur ${placesTotal} en ${nomMois()}</p>
        ${inclus(true)}
      </div>
      <div id="offer-sans_appels"${complet ? '' : ' hidden'}>
        ${complet ? `<p class="full">Les ${placesTotal} places avec appels de ${nomMois()} sont prises. Elles rouvrent en ${nomMois(1)}. En attendant, l'offre sans appels reste ouverte.</p>` : ''}
        <h2>${TEXTES.downsell.titre}</h2>
        <p class="note">${TEXTES.downsell.intro}</p>
        <p class="price"><b>${affiche(downsell.prix)} €</b><s>${downsell.barre} €</s><span>une fois · accès à vie</span></p>
        ${inclus(false)}
      </div>
      <form id="f-buy" novalidate>
        <label for="buy-email">Ton email (il servira à te connecter)</label>
        <input id="buy-email" type="email" autocomplete="email" inputmode="email" required>
        <button class="cta" type="submit" id="buy-cta">Payer ${affiche(complet ? downsell.prix : principale.prix)} € avec PayPal</button>
      </form>
      <button class="link" type="button" id="to-down"${complet ? ' hidden' : ''}>${TEXTES.downsell.refus}</button>
      <button class="link" type="button" id="to-main" hidden>${TEXTES.downsell.retour}</button>
      <p class="guar-mini"><b>${TEXTES.garantie.titre}</b> : remboursé sous 30 jours si ta routine ne tient pas debout.</p>
      <p class="legal" id="legal-4x"${complet ? ' hidden' : ''}>Paiement en 4X sous réserve d'éligibilité et d'acceptation par PayPal.</p>
    </div>

    <div id="pane-login" role="tabpanel" aria-labelledby="tab-login" hidden>
      <form id="f-email" novalidate>
        <p class="note">Entre l'email utilisé pour ton achat : on t'envoie un code à 6 chiffres.</p>
        <label for="login-email">Email</label>
        <input id="login-email" type="email" autocomplete="email" inputmode="email" required>
        <button class="cta" type="submit">Recevoir mon code</button>
      </form>
      <form id="f-code" novalidate hidden>
        <p class="note">Si <b id="sent-to"></b> a un accès, tu vas recevoir un code. Il expire dans 10 minutes (pense aux spams).</p>
        <label for="login-code">Code à 6 chiffres</label>
        <input id="login-code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required>
        <button class="cta" type="submit">Ouvrir la formation</button>
        <button class="link" type="button" id="restart">Changer d'email ou renvoyer un code</button>
        <div class="help">
          <p>Pas reçu de code ? Contacte-moi : <a href="mailto:${contact}">${contact}</a></p>
          <p>Pas encore acheté ? <button class="link" type="button" id="code-to-buy" style="padding:0">Acheter l'accès</button></p>
        </div>
      </form>
    </div>

    <div id="pane-done" hidden>
      <span class="eyebrow">Paiement validé</span>
      <h2 style="margin-top:10px">Ton accès est ouvert</h2>
      <p class="note">Un email de confirmation part à ton adresse. Tu te reconnectes à tout moment avec un code envoyé par email.</p>
      <div id="done-calls" hidden>
        <p class="note" style="color:var(--chalk)">Tes 2 appels de 30 min avec moi sont inclus. Réserve le premier quand tu veux.</p>
        <a class="cta" id="done-calendly" href="${calendly()}" target="_blank" rel="noopener">Réserver mon appel</a>
      </div>
      <a class="cta" id="done-open" href="/methode-ikea">Ouvrir la formation</a>
    </div>

    <p class="msg" id="msg" role="status" aria-live="polite"></p>
  </aside>
</main>

<footer><div class="wrap"><span>Mobility Club · Méthode IKEA · <a href="${ABONNEMENT}">L'abonnement</a></span><a href="mailto:${contact}">Une question ? ${contact}</a></div></footer>

<script>
(function(){
  var API = '/api/methode-ikea/';
  var PRIX = { avec_appels: '${affiche(principale.prix)}', sans_appels: '${affiche(downsell.prix)}' };
  var COMPLET = ${complet ? 'true' : 'false'};
  var $ = function(id){ return document.getElementById(id); };
  var msg = function(text, kind){ var m = $('msg'); m.textContent = text || ''; m.className = 'msg' + (kind ? ' ' + kind : ''); };
  var post = function(action, body){
    return fetch(API + action, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(body || {}) })
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(d){ d._status = r.status; return d; }); });
  };
  var busy = function(form, on){ var b = form.querySelector('.cta'); if (b) b.disabled = on; };
  var emailOk = function(v){ return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v); };
  var reseau = function(f){ return function(){ if (f) busy(f, false); msg('Connexion impossible. Vérifie ton réseau.', 'err'); }; };

  function tab(which){
    var buy = which === 'buy';
    $('tab-login').setAttribute('aria-selected', String(!buy));
    $('tab-buy').setAttribute('aria-selected', String(buy));
    $('pane-login').hidden = buy; $('pane-buy').hidden = !buy;
    msg('');
  }
  $('tab-login').onclick = function(){ tab('login'); };
  $('tab-buy').onclick = function(){ tab('buy'); };

  // Offre principale d'abord ; le downsell n'apparaît qu'après un refus, un
  // paiement annulé, ou quand les places avec appels du mois sont prises.
  var offre = COMPLET ? 'sans_appels' : 'avec_appels';
  function montrer(id){
    if (COMPLET) id = 'sans_appels';
    offre = id;
    var down = id === 'sans_appels';
    $('offer-avec_appels').hidden = down; $('offer-sans_appels').hidden = !down;
    $('to-down').hidden = down; $('to-main').hidden = !down || COMPLET; $('legal-4x').hidden = down;
    $('buy-cta').textContent = 'Payer ' + PRIX[id] + ' € avec PayPal';
  }
  $('to-down').onclick = function(){ montrer('sans_appels'); msg(''); };
  $('to-main').onclick = function(){ montrer('avec_appels'); msg(''); };

  var currentEmail = '';
  $('f-email').onsubmit = function(e){
    e.preventDefault();
    var email = $('login-email').value.trim().toLowerCase();
    if (!emailOk(email)) return msg('Cet email ne semble pas valide.', 'err');
    busy(this, true); var f = this;
    post('request-code', { email: email }).then(function(d){
      busy(f, false);
      if (d._status !== 200) return msg('Envoi impossible pour le moment. Réessaie dans une minute.', 'err');
      currentEmail = email; $('sent-to').textContent = email;
      $('f-email').hidden = true; $('f-code').hidden = false; $('login-code').focus();
      msg('');
    }).catch(reseau(f));
  };
  $('restart').onclick = function(){ $('f-code').hidden = true; $('f-email').hidden = false; $('login-code').value = ''; msg(''); };
  $('code-to-buy').onclick = function(){ tab('buy'); $('buy-email').value = currentEmail; };
  $('f-code').onsubmit = function(e){
    e.preventDefault();
    var code = $('login-code').value.replace(/\\D/g, '');
    if (code.length !== 6) return msg('Le code fait 6 chiffres.', 'err');
    busy(this, true); var f = this;
    post('verify-code', { email: currentEmail, code: code }).then(function(d){
      if (d.ok) { msg('C\\'est bon, ouverture…', 'ok'); return location.replace('/methode-ikea'); }
      busy(f, false);
      var t = { expired:'Code expiré : demande-en un nouveau.', too_many_attempts:'Trop d\\'essais : demande un nouveau code.' }[d.error];
      msg(t || 'Code incorrect.', 'err');
    }).catch(reseau(f));
  };

  $('f-buy').onsubmit = function(e){
    e.preventDefault();
    var email = $('buy-email').value.trim().toLowerCase();
    if (!emailOk(email)) return msg('Cet email ne semble pas valide.', 'err');
    busy(this, true); var f = this;
    post('checkout', { email: email, offre: offre }).then(function(d){
      if (d.approve_url) { msg('Redirection vers PayPal…'); return location.assign(d.approve_url); }
      busy(f, false);
      if (d.error === 'already_buyer') { tab('login'); $('login-email').value = email; return msg('Cet email a déjà accès : connecte-toi avec un code.', 'ok'); }
      if (d.error === 'quota_full') { COMPLET = true; montrer('sans_appels'); return msg('La dernière place avec appels de ce mois vient de partir. L\\'offre sans appels reste ouverte.', 'err'); }
      msg('Le paiement n\\'a pas pu démarrer. Réessaie dans un instant.', 'err');
    }).catch(reseau(f));
  };

  function confirmation(d){
    $('tabs').hidden = true; $('pane-buy').hidden = true; $('pane-login').hidden = true; $('pane-done').hidden = false;
    $('done-calls').hidden = !d.calendly;
    if (d.calendly) { $('done-calendly').href = d.calendly; $('done-open').className = 'cta ghost'; }
    msg('');
  }

  // Arrivée depuis la page de vente : ?offre=sans_appels (bouton 49 €) ou ?connexion.
  // Retours de PayPal : ?paypal=cancel&offre=… ou ?paypal=return&token=<order id>
  var q = new URLSearchParams(location.search);
  if (q.get('offre') === 'sans_appels' && !q.get('paypal')) montrer('sans_appels');
  if (q.has('connexion')) { tab('login'); $('login-email').focus(); }
  else if (q.has('offre')) $('buy-email').focus();
  if (q.get('paypal') === 'cancel') {
    history.replaceState(null, '', '/methode-ikea/acces');
    montrer('sans_appels');
    msg('Paiement annulé, rien n\\'a été prélevé.');
  }
  if (q.get('paypal') === 'return' && q.get('token')) {
    busy($('f-buy'), true);
    msg('Validation du paiement… Ne ferme pas cette page.');
    post('capture', { order_id: q.get('token') }).then(function(d){
      history.replaceState(null, '', '/methode-ikea/acces');
      busy($('f-buy'), false);
      if (d.ok && !d.already_captured) return confirmation(d);
      if (d.ok) { tab('login'); return msg('Paiement déjà validé : connecte-toi avec ton email pour ouvrir la formation.', 'ok'); }
      msg('Paiement non confirmé. Ne repaie pas : écris-moi à ${contact} avec ton email.', 'err');
    }).catch(function(){ busy($('f-buy'), false); msg('Vérification impossible. Recharge la page sans repayer.', 'err'); });
  }
})();
</script>
</body>
</html>`;
};
