// La page de confidentialité doit dire ce que l'app fait vraiment de chaque donnée.
// Chaque garde ci-dessous correspond à un engagement pris auprès d'un membre ou d'un
// fournisseur de données (WHOOP, Garmin, Polar) : la casser, c'est mentir sur la page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../confidentialite.html', import.meta.url), 'utf8');
const texte = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

function section(titre) {
  const debut = texte.indexOf(titre);
  assert.ok(debut >= 0, `section « ${titre} » absente`);
  const suite = texte.slice(debut + titre.length);
  const fin = suite.search(/ \d+( bis| ter| quater| quinquies)?\. [A-ZÀ-Ý]/);
  return fin >= 0 ? suite.slice(0, fin) : suite;
}

test('Supabase est déclaré comme sous-traitant, avec sa région et son effacement', () => {
  const s = section('4. Avec qui nous partageons');
  assert.match(s, /Supabase/);
  assert.match(s, /Francfort/);
  assert.match(s, /suppression de ton compte/i);
});

test('WHOOP : lu à l\'affichage, jamais conservé ni copié pour l\'analyse', () => {
  const s = section('2. WHOOP');
  assert.match(s, /au moment où tu ouvres l'app/);
  assert.match(s, /jamais conserv/i);
  assert.doesNotMatch(s, /Supabase/);
});

test('Garmin ne dit plus « uniquement Netlify » et annonce le relevé journalier', () => {
  const s = section('2 ter. Garmin');
  assert.doesNotMatch(s, /uniquement sur nos serveurs \(Netlify\)/);
  assert.match(s, /relevé (quotidien|journalier)/);
  assert.match(s, /Supabase/);
});

test('Polar a sa section, son relevé journalier et son effacement', () => {
  const s = section('2 quater. Polar');
  assert.match(s, /relevé (quotidien|journalier)/);
  assert.match(s, /efface/);
  assert.match(texte, /<li> ?Polar|Polar<\/strong> —|Polar —/);
});

test('Apple Santé n\'est pas déclaré tant que l\'app iPhone ne le lit pas', () => {
  assert.doesNotMatch(texte, /Apple Santé|HealthKit/);
});

test('Aucun envoi des données capteurs pour entraîner une IA', () => {
  for (const titre of ['2 ter. Garmin', '2 quater. Polar']) {
    assert.match(section(titre), /entraîner un modèle d'intelligence artificielle/);
  }
});
