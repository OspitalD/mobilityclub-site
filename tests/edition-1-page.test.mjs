// Page de vente /edition-1 (Édition 1 du club à saisons) : garde-fous de contenu et de contrat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const PAGE = join(ROOT, 'edition-1.html');
const html = () => readFile(PAGE, 'utf8');

test('la page edition-1.html existe', () => {
  assert.equal(existsSync(PAGE), true);
});

test('la case de renonciation (L221-28) est présente et le bouton part désactivé', async () => {
  const h = await html();
  assert.match(h, /<input type="checkbox" id="renonciation"/);
  assert.ok(h.includes("Je demande l'accès immédiat au club et je renonce à mon droit de rétractation de 14&nbsp;jours."));
  assert.match(h, /<button[^>]*id="payer"[^>]*disabled/);
  assert.ok(h.includes('Paiement unique, ou en 4 fois avec PayPal.'));
});

test('aucun prix barré (L112-1-1) : ni <s>, ni <del>, ni <strike>, ni line-through', async () => {
  const h = await html();
  assert.doesNotMatch(h, /<(s|del|strike)[\s>]/i);
  assert.doesNotMatch(h, /line-through/i);
});

test('la page lit et paie via la Function saison-checkout', async () => {
  const h = await html();
  assert.ok(h.includes('/.netlify/functions/saison-checkout'));
  assert.match(h, /action: 'create', renonciation: true/);
  assert.match(h, /action: 'capture', order_id/);
  assert.ok(h.includes('Ta place est prise.'));
  assert.ok(h.includes("Paiement annulé, ta place n'est pas prise."));
  assert.ok(h.includes("Le paiement n\\'a pas pu démarrer, réessaie dans une minute."));
  assert.ok(h.includes('/liste-attente'));
  assert.ok(h.includes('Les portes sont fermées'));
});

test('textes interdits absents', async () => {
  const h = (await html()).toLowerCase();
  for (const interdit of ['dès la semaine 1', 'objectif en semaine 8', '33 %', '33&nbsp;%', '1,7 séance', 'sans douleur']) {
    assert.equal(h.includes(interdit), false, `texte interdit trouvé : ${interdit}`);
  }
});

test('repli sans API : 97 € affiché et compteurs masqués par défaut', async () => {
  const h = await html();
  assert.match(h, /id="prix">97&nbsp;€</);
  for (const id of ['places', 'cases', 'decompte']) {
    assert.match(h, new RegExp(`id="${id}"[^>]*hidden`), `${id} doit être masqué tant que l'API n'a pas répondu`);
  }
});

test('textes de la fiche repris mot pour mot', async () => {
  const h = (await html()).replace(/&nbsp;/g, ' ');
  for (const t of [
    '12 semaines pour bouger libre.',
    'Tiens ta promesse 12 semaines, et ta zone la plus raide progresse.',
    'Bilan articulaire complet au jour 1 et au jour 84',
    'Rituel d\'entrée, 4 semaines pour poser les fondations',
    'Tu veux ne plus jamais te poser la question ? <a href="/lifetime">L\'accès à vie : 350 €, ou 4 × 87,50 €.</a>',
  ]) assert.ok(h.includes(t), `manquant : ${t}`);
});

test('la récompense est au centre, mot pour mot, avec sa précision « en crédit » et le podium (remis par Damien le 17/11)', async () => {
  const h = (await html()).replace(/&nbsp;/g, ' ').replace(/<\/?em>/g, '');
  assert.ok(h.includes('Réalise 80 % de ton plan et tu récupères 50 % de ce que tu as payé.'));
  assert.ok(h.includes('Versés en crédit sur ta prochaine saison ou sur l\'accès à vie.'));
  assert.ok(h.includes('Une séance compte quand tu la fais avec le minuteur de l\'app.'));
  assert.ok(h.replace(/<\/?b>/g, '').includes('Podium de la saison : 299 € · 149 € · 75 € en crédits'), 'podium 299/149/75 € attendu');
});

test('chaque <img> pointe vers un fichier existant du dépôt (écrans réels de sites/mc2/)', async () => {
  const h = await html();
  const srcs = [...h.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(srcs.filter((s) => s.includes('/sites/mc2/')).length >= 5, 'au moins 5 écrans réels attendus');
  for (const s of srcs) {
    assert.ok(!/^https?:|^data:/.test(s), `image externe inattendue : ${s}`);
    assert.ok(existsSync(join(ROOT, s.replace(/^\//, ''))), `fichier introuvable : ${s}`);
  }
});

test('vidéo du concept : lecteur prévu, jamais affiché sans fichier (repli « Vidéo bientôt »)', async () => {
  const h = await html();
  assert.match(h, /<video[^>]*controls[^>]*playsinline[^>]*preload="metadata"[^>]*data-src="\/assets\/edition-1\/concept\.mp4"/);
  assert.doesNotMatch(h, /<video[^>]*\ssrc=/, 'la source vidéo ne doit être posée qu’après vérification du fichier');
  assert.ok(h.includes('Vidéo bientôt'));
});

test('les CGV de l\'Édition 1 sont liées depuis la case et le pied de page', async () => {
  const { readFile } = await import('node:fs/promises');
  const h = await readFile(new URL('../edition-1.html', import.meta.url), 'utf8');
  assert.equal((h.match(/href="\/cgv-edition-1"/g) || []).length, 2);
  const cgv = await readFile(new URL('../cgv-edition-1.html', import.meta.url), 'utf8');
  assert.match(cgv, /L221-28/);
  assert.match(cgv, /97 €/);
  assert.match(cgv, /119 €/);
});
