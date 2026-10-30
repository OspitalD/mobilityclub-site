// Prouve l'EFFET du câblage : chaque page rend, dans le navigateur, les bons prix ET les bons href
// pour la phase servie par la vraie Function offre-v2. Hors `npm test` (exige Chromium) :
//   node scripts/verif-offre-pages.mjs
import { chromium } from '/Users/damienospital/Projects/mobility-dashboard/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import offre from '../netlify/functions/offre-v2.js';
import { PLANS } from '../netlify/lib/offre-v2.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webm': 'video/webm', '.mp4': 'video/mp4' };
const PAGES = { '/': 'index.html', '/devenir-membre': 'devenir-membre.html', '/bascule': 'bascule.html', '/lifetime': 'lifetime.html', '/mon-ticket': 'mon-ticket.html', '/lancement': 'lancement.html' };

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  try {
    const file = PAGES[path] || path.slice(1);
    const body = await readFile(join(ROOT, file));
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
const echecs = [];
const verifier = (ok, msg) => { if (!ok) echecs.push(msg); console.log(ok ? 'ok  ' : 'FAIL', msg); };

const anciens = [PLANS.ancien.mensuel, PLANS.ancien.annuel, 'P-17C64877T6348331UNLCQIVI', 'KT93SVXG954UE', '5LSVN4S2KGSM4'].map((l) => l.split(/[=/]/).pop());

async function ouvrir(chemin, { fin, serveurEnPanne = false, stock = null, checkout = null }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(base)) return u.includes('/.netlify/functions/offre-v2') ? null : route.continue();
    return route.abort(); // aucune ressource externe
  });
  await page.route('**/.netlify/functions/offre-v2', async (route) => {
    if (serveurEnPanne) return route.abort();
    process.env.OFFRE_V2_FIN = fin;
    const r = await offre(new Request('http://x/'));
    await route.fulfill({ status: 200, contentType: 'application/json', body: await r.text(), headers: { 'cache-control': 'no-store' } });
  });
  // Stocks Lifetime : on laisse le serveur répondre au prix de la phase.
  await page.route('**/.netlify/functions/lifetime-tickets', (route) => (stock
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stock) })
    : route.abort()));
  if (checkout) await page.route('**/.netlify/functions/lifetime-checkout', (route) => route.fulfill(checkout));
  await page.addInitScript((f) => { window.MC_OFFRE_FIN = f; }, fin);
  await page.goto(base + chemin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-offre'), null, { timeout: 5000 });
  await page.waitForTimeout(300);
  return page;
}
// Texte présent dans le DOM rendu (display:none exclu ; visibility:hidden inclus : il sera révélé).
const texteRendu = (page) => page.evaluate(() => {
  const out = [];
  const marche = (n) => {
    if (n.nodeType === 3) { out.push(n.textContent); return; }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE|TEMPLATE)$/.test(n.tagName)) return;
    if (getComputedStyle(n).display === 'none') return;
    for (const c of n.childNodes) marche(c);
  };
  marche(document.body);
  return out.join(' ').replace(/\s+/g, ' ');
});
// Stock simulé : en fenêtre la série 249 € (tier 2, compté sur 40), en v2 la seule série 350 € (tier 3, sur 20).
const stockFaux = (prix, soldOut = false) => {
  const pris = soldOut ? 20 : 3;
  const v2 = prix === 350;
  return {
    live: true, tier: v2 ? 3 : 2, price: prix, tier_sold: pris, sold: v2 ? pris : 20 + pris, total: v2 ? 20 : 40,
    remaining: 20 - pris, sold_out: soldOut,
    tickets: Array.from({ length: 20 }, (_, i) => ({ number: i + 1, status: i < pris ? 'sold' : 'available' })),
  };
};
const hrefs = (page) => page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
const PASSE = '2000-01-01T00:00:00.000Z';
const FUTUR = '2099-01-01T00:00:00.000Z';

for (const [phase, fin, attendu] of [['v2', PASSE, { m: '30', a: '275', v: '350' }], ['fenetre', FUTUR, { m: '25', a: '220', v: '249' }]]) {
  // devenir-membre
  let p = await ouvrir('/devenir-membre', { fin });
  let texte = await p.innerText('.access-choices');
  const liens = await hrefs(p);
  verifier(texte.includes(`${attendu.m} €/mois`) && texte.includes(`${attendu.a} €/an`), `devenir-membre [${phase}] prix ${attendu.m}/${attendu.a}`);
  verifier(await p.$eval('[data-access-choice="monthly_trial"]', (a) => a.getAttribute('href')) === (phase === 'v2' ? PLANS.v2.mensuel : PLANS.ancien.mensuel), `devenir-membre [${phase}] href mensuel`);
  if (phase === 'v2') verifier(!liens.some((l) => anciens.some((x) => l.includes(x))), 'devenir-membre [v2] aucun ancien plan dans les href');
  await p.close();

  // bascule
  p = await ouvrir('/bascule', { fin });
  texte = await p.innerText('#plans');
  // Décision 30/10 : /bascule garde ses prix et liens fondateurs quelle que soit la phase.
  verifier(texte.includes('249 €') && texte.includes('220 €') && texte.includes('25 €'), `bascule [${phase}] cartes fondateurs 25/220/249`);
  const cfg = await p.evaluate(() => ({ vie: window.MC_BASCULE.LIEN_VIE, men: window.MC_BASCULE.LIEN_MENSUEL, an: window.MC_BASCULE.LIEN_ANNUEL }));
  verifier(cfg.vie.includes('KT93SVXG954UE') && cfg.men.includes('P-17C64877T6348331UNLCQIVI') && cfg.an.includes('P-4VH08043D1618690PNJJ2Z5A'), `bascule [${phase}] liens fondateurs`);
  await p.close();

  // lifetime (stock injoignable : le repli doit afficher le prix de la phase)
  p = await ouvrir('/lifetime', { fin });
  // textContent : le tarif est masqué (visibility) tant que le nom n'est pas saisi, innerText l'ignorerait.
  const prixLifetime = await p.$$eval('[data-offre-prix="vie"]', (els) => els.map((e) => e.textContent.trim()));
  verifier(prixLifetime.length >= 4 && prixLifetime.every((t) => t === attendu.v), `lifetime [${phase}] prix ${attendu.v} affiché sans stock (${prixLifetime.join(',')})`);
  await p.close();

  // lancement (C1–C4) : deux choix seulement, à vie en phare (4 × prix/4) + mensuel fixe SANS essai ; jamais d’annuel ni d’« essai »
  p = await ouvrir('/lancement', { fin });
  texte = await p.innerText('#offre');
  const prixL = await p.$$eval('#offre [data-offre-prix="mensuel"], #offre [data-offre-prix="vie"], #offre [data-offre-prix="vie-4x"]', (els) => els.map((e) => e.textContent.trim()));
  const quatre = phase === 'v2' ? '87,50' : '62,25';
  verifier(prixL.join('/') === `${quatre}/${attendu.v}/${attendu.m}`, `lancement [${phase}] prix ${prixL.join('/')} (4 ×, vie, mensuel)`);
  verifier(!(await p.$$('#offre [data-offre-prix="annuel"], #offre [data-offre-lien="annuel"], #offre [data-offre-lien="mensuel"]')).length, `lancement [${phase}] deux choix : ni annuel ni mensuel avec essai`);
  const toutTexte = await texteRendu(p);
  verifier(!/essai|annuel|\/an\b/i.test(texte) && !/essai/i.test(toutTexte), `lancement [${phase}] aucun « essai » sur la page, aucun annuel dans l’offre`);
  if (phase === 'fenetre') verifier(/verrouillé/.test(texte) && texte.includes('Dès la fin du compteur') && texte.includes('4 × 87,50'), 'lancement [fenetre] « verrouillé » + prix d’après (350 € / 4 × 87,50 €, 30 €/mois)');
  else verifier(texte.includes('La V2 est lancée') && !/verrouillé|Dès la fin du compteur/.test(texte), 'lancement [v2] « La V2 est lancée », ni « verrouillé » ni prix d’après');
  const lienL = await p.$$eval('[data-offre-lien]', (as) => Object.fromEntries(as.map((a) => [a.dataset.offreLien, a.getAttribute('href')])));
  const attenduL = { mensuel_fixe: phase === 'v2' ? (PLANS.v2.mensuel_fixe ?? '/devenir-membre') : PLANS.ancien.mensuel_fixe, vie: '/lifetime' };
  verifier(Object.keys(attenduL).every((k) => lienL[k] === attenduL[k]) && Object.keys(lienL).length === 2, `lancement [${phase}] href ${JSON.stringify(lienL)}`);
  if (phase === 'v2') {
    const dom = await p.content();
    verifier(!/P-43F|P-4VH|P-17C|KT93/.test(dom) && !(await hrefs(p)).some((l) => anciens.some((x) => l.includes(x))), 'lancement [v2] aucun ancien plan dans le DOM');
  }
  // simulateur : montants calculés depuis l’offre servie
  for (const mois of [6, 10, 24]) {
    await p.$eval('#sim-r', (r, v) => { r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); }, mois);
    const barres = await p.$$eval('#sim-bars b', (bs) => bs.map((b) => Number(b.dataset.v)));
    const say = (await p.innerText('#sim-say')).replace(/\s/g, ' ');
    const att = phase === 'v2' ? [350, 30 * mois] : [249, 350, 25 * mois, 30 * mois];
    const seuil = phase === 'v2' ? 12 : 10;
    verifier(JSON.stringify(barres) === JSON.stringify(att) && say.includes(`dès le ${seuil}`) && (phase === 'v2' ? !say.includes('101') : say.includes('101 €')), `lancement [${phase}] simulateur ${mois} mois : ${barres.join('/')} — ${say}`);
  }
  const src = await p.$eval('#hv', async (v) => { for (let i = 0; i < 40 && !v.currentSrc; i++) await new Promise((r) => setTimeout(r, 50)); return v.currentSrc; });
  verifier(src.includes(`lancement-16x9-${phase}.`), `lancement [${phase}] vidéo ${src.split('/').pop()}`);
  const compteurs = await p.$$eval('[data-offre-compteur]', (els) => els.filter((e) => e.offsetParent).length);
  verifier(phase === 'v2' ? compteurs === 0 : compteurs === 2, `lancement [${phase}] compteurs visibles : ${compteurs}`);
  await p.close();

  // accueil
  p = await ouvrir('/', { fin });
  const cta = await p.$$eval('[data-offre-lien="achat"]', (as) => as.map((a) => a.getAttribute('href')));
  verifier(cta.length === 6 && cta.every((h) => h === (phase === 'v2' ? '/devenir-membre' : '/lancement')), `accueil [${phase}] 6 CTA -> ${phase === 'v2' ? '/devenir-membre' : '/lancement'} (${cta.join(',')})`);
  await p.close();
}

// Textes Lifetime : en v2 rien ne promet une hausse par série ; le compteur ne compte que la série 350 €
// (« 3/20 tickets à 350 € déjà pris » est alors vrai) ; série vendue => « Accès à vie complet ».
const INTERDITS_V2 = ['Puis le prix monte', 'tarif supérieur', 'Le prix monte par', 'prochain tarif'];
for (const soldOut of [false, true]) {
  for (const chemin of ['/lifetime', '/devenir-membre', '/mon-ticket']) {
    const pg = await ouvrir(chemin, { fin: PASSE, stock: stockFaux(350, soldOut) });
    const t = await texteRendu(pg);
    const trouves = INTERDITS_V2.filter((x) => t.includes(x));
    verifier(!trouves.length, `${chemin} [v2${soldOut ? ', série complète' : ''}] aucun texte de hausse de prix (${trouves.join(' | ') || 'rien'})`);
    if (soldOut) verifier(t.includes('Accès à vie complet'), `${chemin} [v2, série complète] « Accès à vie complet »`);
    if (chemin === '/lifetime' && !soldOut) verifier(t.includes('3 /20 tickets à 350 € déjà pris') && t.includes('série 03'), '/lifetime [v2] compteur de la série 350 € (3/20), série 03');
    await pg.close();
  }
}
{
  const pg = await ouvrir('/lifetime', { fin: FUTUR, stock: stockFaux(249) });
  const t = await texteRendu(pg);
  verifier(t.includes('Puis le prix monte') && t.includes('tickets à 249 € déjà pris'), '/lifetime [fenetre] textes de série conservés');
  await pg.close();
}

// mon-ticket : prix de la phase (stock injoignable), meta sans prix.
for (const [phase, fin, v] of [['v2', PASSE, '350'], ['fenetre', FUTUR, '249']]) {
  const pg = await ouvrir('/mon-ticket', { fin });
  const prix = await pg.$$eval('[data-price]', (els) => els.map((e) => e.textContent.trim()));
  verifier(prix.length >= 3 && prix.every((x) => x === v), `mon-ticket [${phase}] prix ${v} (${prix.join(',')})`);
  const meta = await pg.$eval('meta[name="description"]', (m) => m.content);
  verifier(!/\d+\s*€/.test(meta), `mon-ticket [${phase}] meta description sans prix`);
  await pg.close();
}

// lifetime-checkout 503 price_not_configured : message clair, pas l'erreur générique.
{
  const pg = await ouvrir('/lifetime', {
    fin: PASSE,
    stock: stockFaux(350),
    checkout: { status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'price_not_configured', price: 350 }) },
  });
  await pg.fill('input[name="first_name"]', 'Jeanne');
  await pg.fill('input[name="last_name"]', 'Essai');
  await pg.click('[data-identity-submit]');
  await pg.click('[data-ticket-number="5"]');
  await pg.locator('[data-pay]:visible').first().click();
  await pg.waitForFunction(() => /indisponible/i.test(document.querySelector('[data-take-label]').textContent), null, { timeout: 5000 });
  const msg = await pg.innerText('[data-take-message]');
  verifier(/quelques minutes/.test(msg) && /écris-nous/i.test(msg), `lifetime 503 price_not_configured : message clair (« ${msg} »)`);
  await pg.close();
}

// bascule : plus de date limite affichée (décision 30/10).
{
  const pg = await ouvrir('/bascule', { fin: '2026-10-26T18:00:00.000Z' });
  verifier(!(await pg.$('#deadline')) && !(await pg.innerText('body')).includes('26 octobre'), 'bascule sans date limite');
  await pg.close();
}

// repli : fetch en panne, page ouverte après la fin => jamais d'ancien plan
const p = await ouvrir('/devenir-membre', { fin: PASSE, serveurEnPanne: true });
verifier(!(await hrefs(p)).some((l) => anciens.some((x) => l.includes(x))), 'repli local [fetch KO, après la fin] : aucun ancien plan rendu');
await p.close();

await browser.close();
server.close();
console.log(echecs.length ? `\n${echecs.length} échec(s)` : '\ntout est vert');
process.exit(echecs.length ? 1 : 0);
