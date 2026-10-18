// Page d'accès de /methode-ikea : servie par la Function tant qu'aucune session
// valide n'existe. Deux chemins :
//   « Acheter l'accès » : offre principale (97 €, 2 appels inclus). Après un
//     « Non merci » ou un paiement annulé, et jamais en même temps : downsell
//     (49 €, sans appel). Email → PayPal → capture vérifiée → accès.
//   « J'ai déjà acheté » : email → code à 6 chiffres (Resend) → accès.
// Même langage visuel que le-suivi.html / index.html (mur sombre, jade, Bricolage).

import { CALENDLY, affiche, quart } from './methode-ikea.js';

// ── TEXTES PROVISOIRES ────────────────────────────────────────────────────────
// La structure et le texte de l'offre sont en cours de rédaction dans une autre
// session. Tous les textes commerciaux sont ici, pour être remplacés en un seul endroit.
const TEXTES = {
  eyebrow: 'Formation · Mise à jour 2026',
  titre: 'La Méthode IKEA',
  accroche: 'Cinq étapes pour créer des routines de mobilité personnalisées, rapides et efficaces.',
  principale: {
    titre: 'L\'offre complète',
    inclus: [
      'La formation en 5 modules vidéo',
      '5 outils pour monter ta routine',
      'La librairie de 130 exercices',
      '2 appels de 30 min avec Damien',
    ],
    refus: 'Non merci, je n\'ai pas besoin des appels',
  },
  downsell: {
    titre: 'Sans les appels',
    intro: 'La même formation et les mêmes outils, sans les 2 appels.',
    inclus: [
      'La formation en 5 modules vidéo',
      '5 outils pour monter ta routine',
      'La librairie de 130 exercices',
    ],
    retour: 'Finalement, je veux les appels',
  },
};

const MODULES = [
  ['01', 'Identifier ses besoins', 'La liste de courses'],
  ['02', 'Connaître son contexte', 'Le mètre ruban'],
  ['03', 'Sélection des exercices', 'Le rayon'],
  ['04', 'Le plaisir', 'Le coup de cœur'],
  ['05', 'Template de routine', 'La notice de montage'],
];

const liste = (items) => `<ul class="incl">${items.map((t) => `<li>${t}</li>`).join('')}</ul>`;

export const pageAcces = ({ principale, downsell, contact }) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Méthode IKEA · Mobility Club</title>
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="${TEXTES.accroche}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap">
<style>
:root{
  --wall:#0D0F0E; --wall-2:#111412; --wall-3:#161a18;
  --line:rgba(255,255,255,.075); --line-2:rgba(255,255,255,.14);
  --chalk:#F5F5F3; --dust:#8C908D; --jade:#3ECFA0; --jade-ink:#0D0F0E; --red:#E05A4A;
  --f-display:"Bricolage Grotesque","Plus Jakarta Sans",ui-sans-serif,sans-serif;
  --f-body:"Plus Jakarta Sans",ui-sans-serif,system-ui,sans-serif;
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
.lead{color:var(--dust);font-size:19px;max-width:34ch;margin:0}
.grid{display:grid;grid-template-columns:1.1fr .9fr;gap:56px;padding:72px 0 96px;align-items:start}
.mods{list-style:none;padding:0;margin:40px 0 0;border-top:1px solid var(--line)}
.mods li{display:grid;grid-template-columns:44px 1fr auto;gap:12px;align-items:baseline;padding:16px 0;border-bottom:1px solid var(--line)}
.mods .n{font-family:var(--f-mono);font-size:13px;color:var(--jade)}
.mods .t{font-weight:600}
.mods .tool{font-family:var(--f-mono);font-size:12px;color:var(--dust);text-align:right}
.panel{background:var(--wall-2);border:1px solid var(--line-2);border-radius:20px;padding:28px;position:sticky;top:24px}
.tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;background:var(--wall);border-radius:999px;padding:4px;margin-bottom:26px}
.tabs button{font:600 14px var(--f-body);color:var(--dust);background:none;border:0;border-radius:999px;padding:11px 8px;cursor:pointer}
.tabs button[aria-selected="true"]{background:var(--wall-3);color:var(--chalk);box-shadow:inset 0 0 0 1px var(--line-2)}
.price{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;margin:0 0 4px}
.price b{font-family:var(--f-display);font-size:56px;letter-spacing:-.05em;line-height:1}
.price s{color:var(--dust);font-size:22px;font-family:var(--f-display);font-weight:600}
.price span{color:var(--dust);flex-basis:100%;font-size:14px}
.split{font-size:14px;color:var(--chalk);margin:0 0 18px}
.split b{color:var(--jade)}
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
[hidden]{display:none!important}
footer{border-top:1px solid var(--line);color:var(--dust);font-size:13px}
footer .wrap{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-top:22px;padding-bottom:28px}
@media (max-width:860px){
  .grid{grid-template-columns:1fr;gap:40px;padding:44px 0 64px}
  .panel{position:static;padding:22px}
  .mods li{grid-template-columns:36px 1fr}
  .mods .tool{grid-column:2;text-align:left}
}
</style>
</head>
<body>
<header class="bar"><div class="wrap">
  <a class="brand" href="/">Mobility <b>Club</b></a>
  <span class="eyebrow">Formation</span>
</div></header>

<main class="wrap grid">
  <section>
    <span class="eyebrow">${TEXTES.eyebrow}</span>
    <h1>${TEXTES.titre}</h1>
    <p class="lead">${TEXTES.accroche}</p>
    <ol class="mods">
      ${MODULES.map(([n, t, tool]) => `<li><span class="n">${n}</span><span class="t">${t}</span><span class="tool">${tool}</span></li>`).join('\n      ')}
    </ol>
  </section>

  <aside class="panel" aria-label="Accéder à la formation">
    <div class="tabs" role="tablist" id="tabs">
      <button type="button" role="tab" id="tab-buy" aria-selected="true" aria-controls="pane-buy">Acheter l'accès</button>
      <button type="button" role="tab" id="tab-login" aria-selected="false" aria-controls="pane-login">J'ai déjà acheté</button>
    </div>

    <div id="pane-buy" role="tabpanel" aria-labelledby="tab-buy">
      <div id="offer-avec_appels">
        <h2>${TEXTES.principale.titre}</h2>
        <p class="price"><b>${affiche(principale.prix)} €</b><s>${principale.barre} €</s><span>une fois · accès à vie</span></p>
        <p class="split">ou <b>4 × ${quart(principale.prix)} €</b> avec le paiement en 4X PayPal</p>
        ${liste(TEXTES.principale.inclus)}
      </div>
      <div id="offer-sans_appels" hidden>
        <h2>${TEXTES.downsell.titre}</h2>
        <p class="note">${TEXTES.downsell.intro}</p>
        <p class="price"><b>${affiche(downsell.prix)} €</b><s>${downsell.barre} €</s><span>une fois · accès à vie</span></p>
        ${liste(TEXTES.downsell.inclus)}
      </div>
      <form id="f-buy" novalidate>
        <label for="buy-email">Ton email (il servira à te connecter)</label>
        <input id="buy-email" type="email" autocomplete="email" inputmode="email" required>
        <button class="cta" type="submit" id="buy-cta">Payer ${affiche(principale.prix)} € avec PayPal</button>
      </form>
      <button class="link" type="button" id="to-down">${TEXTES.principale.refus}</button>
      <button class="link" type="button" id="to-main" hidden>${TEXTES.downsell.retour}</button>
      <p class="legal" id="legal-4x">Paiement en 4X sous réserve d'éligibilité et d'acceptation par PayPal.</p>
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
        <p class="note" style="color:var(--chalk)">Tes 2 appels de 30 min avec Damien sont inclus. Réserve le premier quand tu veux.</p>
        <a class="cta" id="done-calendly" href="${CALENDLY}" target="_blank" rel="noopener">Réserver mon appel</a>
      </div>
      <a class="cta" id="done-open" href="/methode-ikea">Ouvrir la formation</a>
    </div>

    <p class="msg" id="msg" role="status" aria-live="polite"></p>
  </aside>
</main>

<footer><div class="wrap"><span>Mobility Club · Méthode IKEA</span><a href="mailto:${contact}">Une question ? ${contact}</a></div></footer>

<script>
(function(){
  var API = '/api/methode-ikea/';
  var PRIX = { avec_appels: '${affiche(principale.prix)}', sans_appels: '${affiche(downsell.prix)}' };
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

  // Offre principale d'abord ; le downsell n'apparaît qu'après un refus ou un paiement annulé.
  var offre = 'avec_appels';
  function montrer(id){
    offre = id;
    var down = id === 'sans_appels';
    $('offer-avec_appels').hidden = down; $('offer-sans_appels').hidden = !down;
    $('to-down').hidden = down; $('to-main').hidden = !down; $('legal-4x').hidden = down;
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
      msg('Le paiement n\\'a pas pu démarrer. Réessaie dans un instant.', 'err');
    }).catch(reseau(f));
  };

  function confirmation(d){
    $('tabs').hidden = true; $('pane-buy').hidden = true; $('pane-login').hidden = true; $('pane-done').hidden = false;
    $('done-calls').hidden = !d.calendly;
    if (d.calendly) { $('done-calendly').href = d.calendly; $('done-open').className = 'cta ghost'; }
    msg('');
  }

  // Retours de PayPal : ?paypal=cancel&offre=… ou ?paypal=return&token=<order id>
  var q = new URLSearchParams(location.search);
  if (q.get('paypal') === 'cancel') {
    history.replaceState(null, '', '/methode-ikea');
    montrer('sans_appels');
    msg('Paiement annulé, rien n\\'a été prélevé.');
  }
  if (q.get('paypal') === 'return' && q.get('token')) {
    busy($('f-buy'), true);
    msg('Validation du paiement… Ne ferme pas cette page.');
    post('capture', { order_id: q.get('token') }).then(function(d){
      history.replaceState(null, '', '/methode-ikea');
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
