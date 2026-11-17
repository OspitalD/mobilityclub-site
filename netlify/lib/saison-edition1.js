// Édition 1 du club à saisons (« New Year Team ») — source de vérité unique des paliers.
// Décisions Damien 17/11/2026 : ouverture le jour même, deux paliers.
//   Palier 1 « fondateur » : 97 €, se ferme à la 30e place vendue OU le jeu. 26/11 23 h 59 (Paris).
//   Palier 2 : 119 €, jusqu'au lun. 30/11 23 h 59 (Paris). Ensuite portes fermées.
// 100 places au total. Prochaine ouverture : 149 €. Jamais de prix barré (L112-1-1).
//
// Un prix n'est JAMAIS calculé côté navigateur : la page lit l'état ici, et la commande
// PayPal est créée au prix du palier en cours au moment du clic (le serveur décide).
import { getStore } from '@netlify/blobs';

export const STORE = 'saison_edition1';
export const PREFIX_VENTE = 'ventes/';
export const PREFIX_COMMANDE = 'commandes/';
export const CUSTOM_PREFIX = 'MC-SAISON-E1-';

// 23 h 59 min 59 s heure de Paris (UTC+1 en novembre).
export const OUVERTURE = '2026-11-17T00:00:00.000Z';
export const FIN_PALIER_1 = '2026-11-26T22:59:59.000Z';
export const FIN_PORTES = '2026-11-30T22:59:59.000Z';

export const PALIERS = {
  1: { prix: 97, places: 30 },
  2: { prix: 119 },
};
export const PLACES_TOTAL = 100;
export const PRIX_PROCHAINE_OUVERTURE = 149;
export const VIE = { prix: 350, quatre_fois: 87.5, lien: '/lifetime' };
export const MONTANTS_SAISON = Object.values(PALIERS).map((p) => p.prix.toFixed(2));

// Places prises hors du site (membres actuels inscrits gratuitement à la main), posées
// dans l'environnement Netlify sans redéployer : SAISON_PLACES_HORS_SITE=12.
const horsSite = (env = process.env) => {
  const n = Number.parseInt(env.SAISON_PLACES_HORS_SITE || '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const lire = (v) => Date.parse(v);

// Pur : testable sans réseau. `ventes` = { total, palier1 } compté dans le store.
export const etatSaison = ({ now = Date.now(), ventes = { total: 0, palier1: 0 }, env = process.env } = {}) => {
  const t = Number(now);
  const vendues = ventes.total + horsSite(env);
  const restantes = Math.max(0, PLACES_TOTAL - vendues);
  const p1Restantes = Math.max(0, PALIERS[1].places - ventes.palier1);
  const avant = t < lire(OUVERTURE);
  const apres = t > lire(FIN_PORTES);
  const ouvert = !avant && !apres && restantes > 0;
  let palier = null;
  if (ouvert) palier = t <= lire(FIN_PALIER_1) && p1Restantes > 0 ? 1 : 2;
  return {
    ouvert,
    palier,
    prix: palier ? PALIERS[palier].prix : null,
    palier1: { prix: PALIERS[1].prix, places_total: PALIERS[1].places, places_restantes: p1Restantes, fin: FIN_PALIER_1 },
    palier2: { prix: PALIERS[2].prix, fin: FIN_PORTES },
    fin_palier: palier === 1 ? FIN_PALIER_1 : palier === 2 ? FIN_PORTES : null,
    places_total: PLACES_TOTAL,
    places_restantes: restantes,
    prix_prochaine_ouverture: PRIX_PROCHAINE_OUVERTURE,
    vie: VIE,
    maintenant: new Date(t).toISOString(),
  };
};

export const store = () => getStore(STORE);

export const compterVentes = async (S = store()) => {
  const { blobs = [] } = await S.list({ prefix: PREFIX_VENTE });
  let palier1 = 0;
  for (const { key } of blobs) {
    const v = await S.get(key, { type: 'json' }).catch(() => null);
    if (v?.palier === 1) palier1++;
  }
  return { total: blobs.length, palier1 };
};

export const estVenteSaison = (customId) => typeof customId === 'string' && customId.startsWith(CUSTOM_PREFIX);

// MC-SAISON-E1-P1-<uuid>
export const palierDuCustomId = (customId) => {
  const m = /^MC-SAISON-E1-P([12])-/.exec(String(customId || ''));
  return m ? Number(m[1]) : null;
};

const memeMontant = (a, b) => {
  const n = (v) => {
    const x = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(x) ? x.toFixed(2) : null;
  };
  return n(a) !== null && n(a) === n(b);
};

export const montantSaisonValide = (montant, palier) =>
  Boolean(PALIERS[palier]) && memeMontant(montant, PALIERS[palier].prix);

// Idempotent : la clé est l'id de capture. Appelé par la capture côté site ET par le
// webhook PayPal (le premier arrivé écrit, l'autre ne fait rien).
export const enregistrerVenteSaison = async ({ captureId, orderId, palier, montant, email = null, source }, S = store()) => {
  const key = `${PREFIX_VENTE}${encodeURIComponent(captureId)}`;
  const deja = await S.get(key, { type: 'json' }).catch(() => null);
  if (deja) return { deja: true };
  await S.setJSON(key, {
    capture_id: captureId,
    order_id: orderId || null,
    palier,
    montant: String(montant),
    email,
    source,
    paid_at: new Date().toISOString(),
  });
  return { deja: false };
};
