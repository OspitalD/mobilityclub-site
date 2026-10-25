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
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const PAGES = { '/': 'index.html', '/devenir-membre': 'devenir-membre.html', '/bascule': 'bascule.html', '/lifetime': 'lifetime.html' };

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

async function ouvrir(chemin, { fin, serveurEnPanne = false }) {
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
  await page.route('**/.netlify/functions/lifetime-tickets', (route) => route.abort());
  await page.addInitScript((f) => { window.MC_OFFRE_FIN = f; }, fin);
  await page.goto(base + chemin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-offre'), null, { timeout: 5000 });
  await page.waitForTimeout(300);
  return page;
}
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
  verifier(texte.includes(`${attendu.v} €`) && texte.includes(`${attendu.a} €`) && texte.includes(`${attendu.m} €`), `bascule [${phase}] cartes ${attendu.m}/${attendu.a}/${attendu.v}`);
  const cfg = await p.evaluate(() => ({ vie: window.MC_BASCULE.LIEN_VIE, men: window.MC_BASCULE.LIEN_MENSUEL, an: window.MC_BASCULE.LIEN_ANNUEL }));
  if (phase === 'v2') verifier(cfg.vie === '/lifetime' && cfg.men === PLANS.v2.mensuel && cfg.an === PLANS.v2.annuel && ![cfg.men, cfg.an, cfg.vie].some((l) => anciens.some((x) => l.includes(x))), 'bascule [v2] Lifetime -> /lifetime, aucun ancien plan (A5, A6)');
  else verifier(cfg.vie.includes('KT93SVXG954UE') && cfg.men.includes('P-17C64877T6348331UNLCQIVI'), 'bascule [fenetre] liens inchangés');
  await p.close();

  // lifetime (stock injoignable : le repli doit afficher le prix de la phase)
  p = await ouvrir('/lifetime', { fin });
  // textContent : le tarif est masqué (visibility) tant que le nom n'est pas saisi, innerText l'ignorerait.
  const prixLifetime = await p.$$eval('[data-offre-prix="vie"]', (els) => els.map((e) => e.textContent.trim()));
  verifier(prixLifetime.length >= 4 && prixLifetime.every((t) => t === attendu.v), `lifetime [${phase}] prix ${attendu.v} affiché sans stock (${prixLifetime.join(',')})`);
  await p.close();

  // accueil
  p = await ouvrir('/', { fin });
  const cta = await p.$$eval('[data-offre-lien="achat"]', (as) => as.map((a) => a.getAttribute('href')));
  verifier(cta.length === 6 && cta.every((h) => h === (phase === 'v2' ? '/devenir-membre' : '/lancement')), `accueil [${phase}] 6 CTA -> ${phase === 'v2' ? '/devenir-membre' : '/lancement'} (${cta.join(',')})`);
  await p.close();
}

// repli : fetch en panne, page ouverte après la fin => jamais d'ancien plan
const p = await ouvrir('/devenir-membre', { fin: PASSE, serveurEnPanne: true });
verifier(!(await hrefs(p)).some((l) => anciens.some((x) => l.includes(x))), 'repli local [fetch KO, après la fin] : aucun ancien plan rendu');
await p.close();

await browser.close();
server.close();
console.log(echecs.length ? `\n${echecs.length} échec(s)` : '\ntout est vert');
process.exit(echecs.length ? 1 : 0);
