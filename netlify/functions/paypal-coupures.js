// Fonction PLANIFIÉE (Netlify, toutes les heures) : exécute les coupures d'accès
// programmées par le webhook PayPal quand un abonné mensuel résilie.
//
// POURQUOI UNE FONCTION PLANIFIÉE. PayPal envoie BILLING.SUBSCRIPTION.CANCELLED le
// jour où l'abonné résilie, puis plus rien. Il a payé (ou a droit à son essai)
// jusqu'à la fin de la période : couper le jour même, ce serait reprendre du
// service réglé. Le webhook range donc la coupure (store `paypal_abonnements`,
// `coupures/<sub_id>` = { email, fin }) et c'est ici qu'elle s'exécute, une fois
// la date passée. Les fonctions planifiées tournent chez Netlify : elles ne
// dépendent PAS de GitHub Actions (à l'arrêt).
//
// Sûreté : chaque coupure revérifie que l'abonné ne s'est pas réabonné entre-temps
// (`executerCoupure`). Une panne du dashboard laisse la coupure en place : elle est
// retentée à l'heure suivante.

import { connectLambda } from '@netlify/blobs';
import { storeAbonnements } from '../lib/acces-app.js';
import { executerCoupure } from './paypal-to-skool.js';
import { journaliser } from '../lib/bascule-journal.js';

export const config = { schedule: '@hourly' };

export const coupuresEchues = async (S, now = Date.now()) => {
  const { blobs = [] } = await S.list({ prefix: 'coupures/' });
  const bilan = { echues: 0, faites: 0, erreurs: 0 };
  for (const { key } of blobs) {
    const c = await S.get(key, { type: 'json' });
    if (!c || !(Date.parse(c.fin) <= now)) continue;
    bilan.echues++;
    try {
      const r = await executerCoupure(S, c);
      bilan.faites++;
      console.log('[paypal-coupures]', c.subscription_id, JSON.stringify(r));
      await journaliser({ type: 'coupure', email_paypal: c.email, ref: c.subscription_id, evenement: 'fin_de_periode', ...r });
    } catch (err) {
      bilan.erreurs++;
      console.error('[paypal-coupures] échec, retenté plus tard:', c.subscription_id, err?.message);
    }
  }
  return bilan;
};

export const handler = async (req) => {
  if (req?.blobs) connectLambda(req);
  const bilan = await coupuresEchues(storeAbonnements());
  return { statusCode: 200, body: JSON.stringify(bilan) };
};
