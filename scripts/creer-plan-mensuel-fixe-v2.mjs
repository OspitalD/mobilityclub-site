// Crée le plan PayPal V2 « mensuel 30 € SANS essai » (CONTRAT C3) en CLONANT le plan mensuel
// sans essai actuel P-17C (même produit, mêmes préférences) : seul le prix change.
// Sans --creer : affiche ce qui serait créé.
// Usage : PAYPAL_CLIENT_ID=… PAYPAL_CLIENT_SECRET=… node scripts/creer-plan-mensuel-fixe-v2.mjs [--creer]
const API = 'https://api-m.paypal.com';
const CIBLES = [
  { source: 'P-17C64877T6348331UNLCQIVI', prix: '30', nom: 'Mobility Club V2 — Mensuel 30 € sans essai' },
];
const creer = process.argv.includes('--creer');
const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: sec } = process.env;
if (!id || !sec) { console.error('Il manque PAYPAL_CLIENT_ID ou PAYPAL_CLIENT_SECRET.'); process.exit(1); }
const tok = await (await fetch(API + '/v1/oauth2/token', { method: 'POST',
  headers: { Authorization: 'Basic ' + Buffer.from(id + ':' + sec).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=client_credentials' })).json();
if (!tok.access_token) { console.error('Connexion PayPal refusée :', tok.error); process.exit(1); }
const H = { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' };
const resume = (p) => p.billing_cycles.map(c => `${c.tenure_type} ${c.frequency.interval_count} ${c.frequency.interval_unit} × ${c.total_cycles || '∞'} : ${c.pricing_scheme?.fixed_price ? c.pricing_scheme.fixed_price.value + ' ' + c.pricing_scheme.fixed_price.currency_code : 'gratuit'}`).join(' | ');
for (const c of CIBLES) {
  const src = await (await fetch(`${API}/v1/billing/plans/${c.source}`, { headers: H })).json();
  if (!src.id) { console.error('Plan source introuvable', c.source, src.message); process.exit(1); }
  const regulier = src.billing_cycles.filter(b => b.tenure_type === 'REGULAR');
  if (regulier.length !== 1) { console.error('Plan source inattendu (cycles réguliers ≠ 1)', c.source); process.exit(1); }
  const corps = {
    product_id: src.product_id, name: c.nom, description: c.nom, status: 'ACTIVE',
    billing_cycles: src.billing_cycles.map(b => b.tenure_type === 'REGULAR'
      ? { ...b, pricing_scheme: { fixed_price: { value: c.prix, currency_code: b.pricing_scheme.fixed_price.currency_code } } }
      : b),
    payment_preferences: src.payment_preferences, ...(src.taxes ? { taxes: src.taxes } : {}),
  };
  console.log(`\nSource ${c.source} : ${resume(src)}`);
  console.log(`Nouveau « ${c.nom} » : ${resume(corps)}`);
  if (!creer) continue;
  const r = await fetch(`${API}/v1/billing/plans`, { method: 'POST',
    headers: { ...H, Prefer: 'return=representation', 'PayPal-Request-Id': 'mc-v2-fixe-' + c.prix + '-2026-10-25' }, body: JSON.stringify(corps) });
  const p = await r.json();
  if (!p.id) { console.error('Création refusée :', r.status, p.message, JSON.stringify(p.details || [])); process.exit(1); }
  const verif = await (await fetch(`${API}/v1/billing/plans/${p.id}`, { headers: H })).json();
  console.log(`✅ CRÉÉ ${p.id} — statut ${verif.status} — ${resume(verif)}`);
  console.log(`   Lien : https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=${p.id}`);
}
if (!creer) console.log('\nAperçu seulement. Relance avec --creer pour créer le plan.');
