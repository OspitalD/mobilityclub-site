// Kit App Sexy — espace acheteur (/kit-app-sexy/espace/) : toute la logique côté serveur.
//
// POURQUOI CÔTÉ SERVEUR. Le dépôt est PUBLIC et le site est publié depuis « . » : rien de payant ne
// peut vivre dans un fichier commité. La coquille React compilée ne contient aucun texte du kit ; la
// vidéo, la grille, le kit d'audit, les captures et le dossier de marque sont en Blobs et ne sortent
// que par kit-app-sexy-api.js, après contrôle de la session ET de la date.
//
// QUATRE VERROUS (même esprit que la Méthode IKEA, durcis pour une 2e porte sur le même secret) :
//   1. CLÉ DÉRIVÉE. La clé de session est HMAC(METHODE_IKEA_SESSION_SECRET, 'kit-app-sexy/session/v1') :
//      un cookie IKEA ne vaut rien ici et un cookie du kit ne vaut rien chez IKEA, sans nouveau secret.
//   2. FICHE VIVANTE. Le cookie ne suffit pas : la fiche acheteur doit exister, son accès ne pas être
//      coupé, et l'email du cookie rester relié à la fiche (email PayPal ou alias). Retirer un alias ou
//      couper l'accès tue les sessions ouvertes immédiatement.
//   3. DATE CÔTÉ SERVEUR. Les dates de livraison sont dans kit-livraisons.js, pas dans l'environnement.
//   4. PROPRIÉTAIRE. Toute clé de capture ou de dossier est construite avec l'id de la FICHE DE LA
//      SESSION, jamais avec un id fourni par le client : un autre acheteur ne peut pas la nommer.

import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { envoyerEmail, hashEmail, lireCookie, normaliserEmail } from './methode-ikea.js';
import {
  boutonEspace, emailBienvenueKit, gabarit, listerAcheteurs, livraisonsOuvertes, p, store,
} from './kit-app-sexy.js';
import { LIVRAISONS, calculerEtat, livraison } from './kit-livraisons.js';

export { LIVRAISONS };
export const CONTACT = 'founder@mobilityclub.co';
export const COOKIE = 'kas_session';
export const COOKIE_PATH = '/api/kit-app-sexy';
export const SESSION_DAYS = 180;
export const OTP_TTL_SEC = 10 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS = 5;
export const OTP_WINDOW_SEC = 15 * 60;
export const CAPTURES_MAX = 30;
export const CAPTURE_MAX_OCTETS = 4_000_000;
export const FICHIER_MAX_OCTETS = 4_000_000;
export const CONTENU_MAX_OCTETS = 5_000_000;
export const NOTE_MAX = 280;
export const DOSSIER_MAX_OCTETS = 20_000;
export const BONUS_JOURS = 7;

const ID = /^[0-9a-f]{32}$/;
export const CID = /^[a-z0-9]{6,12}-[0-9a-f]{8}$/;
export const NOM_FICHIER = /^[a-z0-9][a-z0-9._-]{0,80}\.(zip|md|pdf|txt|json)$/;
const MIME_FICHIER = { zip: 'application/zip', md: 'text/markdown; charset=utf-8', pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', json: 'application/json' };
const iso = (d = new Date()) => d.toISOString();
const lire = (key) => store().get(key, { type: 'json' });

// ── Session (cookie signé, clé dérivée) ──────────────────────────────────────

const cleSession = () => {
  const s = process.env.METHODE_IKEA_SESSION_SECRET || '';
  return s.length >= 32 ? createHmac('sha256', s).update('kit-app-sexy/session/v1').digest() : null;
};
const cleOuErreur = () => {
  const k = cleSession();
  if (!k) throw Object.assign(new Error('session_secret_missing'), { statusCode: 503 });
  return k;
};

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const signer = (data, key) => createHmac('sha256', key).update(data).digest();

// `d: 'kas'` double la séparation de domaine : même si la clé fuyait ou changeait, un jeton qui
// n'a pas été fabriqué pour le kit n'a pas ce marqueur.
export const creerJeton = ({ k, e }, nowSec = Math.floor(Date.now() / 1000)) => {
  const payload = b64url(JSON.stringify({ k, e, d: 'kas', exp: nowSec + SESSION_DAYS * 86400 }));
  return `${payload}.${b64url(signer(payload, cleOuErreur()))}`;
};

export const lireJeton = (jeton, nowSec = Math.floor(Date.now() / 1000)) => {
  const key = cleSession();
  if (!key || typeof jeton !== 'string') return null;
  const [payload, sig] = jeton.split('.');
  if (!payload || !sig) return null;
  const attendu = signer(payload, key);
  const recu = Buffer.from(sig, 'base64url');
  if (recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.d !== 'kas' || typeof data.exp !== 'number' || data.exp < nowSec) return null;
    const e = normaliserEmail(data.e);
    return ID.test(data.k) && e ? { k: data.k, e } : null;
  } catch {
    return null;
  }
};

const estLocal = (req) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(req.url);
// Path limité à l'API : la coquille statique n'a pas besoin du cookie, et il ne part pas vers le reste du site.
const attributs = (req) => ['HttpOnly', 'SameSite=Lax', ...(estLocal(req) ? [] : ['Secure'])];
export const cookieSession = (req, jeton) => [`${COOKIE}=${jeton}`, `Path=${COOKIE_PATH}`, `Max-Age=${SESSION_DAYS * 86400}`, ...attributs(req)].join('; ');
export const cookieEfface = (req) => [`${COOKIE}=`, `Path=${COOKIE_PATH}`, 'Max-Age=0', ...attributs(req)].join('; ');

// ── Fiches et alias ──────────────────────────────────────────────────────────

const cleFiche = (id) => `buyers/${id}`;
export const accesOuvert = (fiche) => !fiche.coupe_at;

// L'email tapé résout une fiche directement (email PayPal) ou par alias. Une fiche ne change jamais de clé.
export const resoudreFiche = async (email) => {
  const h = hashEmail(email);
  const direct = await lire(cleFiche(h));
  if (direct) return { id: h, fiche: direct, via: 'email' };
  const alias = await lire(`alias/${h}`);
  if (!alias?.id || !ID.test(alias.id)) return null;
  const fiche = await lire(cleFiche(alias.id));
  return fiche ? { id: alias.id, fiche, via: 'alias' } : null;
};

// → { id, email, fiche } | { erreur: 'unauthorized' | 'acces_coupe' }
export const sessionKit = async (req) => {
  const jeton = lireJeton(lireCookie(req, COOKIE));
  if (!jeton) return { erreur: 'unauthorized' };
  const fiche = await lire(cleFiche(jeton.k));
  if (!fiche) return { erreur: 'unauthorized' };
  // L'email du cookie doit rester relié à CETTE fiche : retirer un alias coupe ses sessions.
  const lie = normaliserEmail(fiche.email) === jeton.e || (await lire(`alias/${hashEmail(jeton.e)}`))?.id === jeton.k;
  if (!lie) return { erreur: 'unauthorized' };
  if (!accesOuvert(fiche)) return { erreur: 'acces_coupe' };
  return { id: jeton.k, email: jeton.e, fiche };
};

// ── Codes à 6 chiffres (mêmes règles que la Méthode IKEA) ────────────────────

const cleCode = (email) => `otp/${hashEmail(email)}`;
const empreinte = (email, code) => createHmac('sha256', cleOuErreur()).update(`${email}:${code}`).digest('hex');

// Retourne le code à envoyer, ou null si le plafond d'envois est atteint.
export const nouveauCode = async (email, nowSec = Math.floor(Date.now() / 1000)) => {
  const actuel = await lire(cleCode(email));
  const fenetre = actuel && actuel.window_reset > nowSec
    ? { sends: actuel.sends || 0, window_reset: actuel.window_reset }
    : { sends: 0, window_reset: nowSec + OTP_WINDOW_SEC };
  if (fenetre.sends >= OTP_MAX_SENDS) return null;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await store().setJSON(cleCode(email), {
    code_hash: empreinte(email, code),
    expires_at: nowSec + OTP_TTL_SEC,
    attempts: 0,
    sends: fenetre.sends + 1,
    window_reset: fenetre.window_reset,
  });
  return code;
};

// → 'ok' | 'invalid' | 'expired' | 'too_many_attempts'
export const verifierCode = async (email, code, nowSec = Math.floor(Date.now() / 1000)) => {
  const rec = await lire(cleCode(email));
  if (!rec || !rec.code_hash) return 'invalid';
  if (rec.expires_at < nowSec) {
    await store().setJSON(cleCode(email), { ...rec, code_hash: null });
    return 'expired';
  }
  if (!timingSafeEqual(Buffer.from(rec.code_hash, 'hex'), Buffer.from(empreinte(email, String(code)), 'hex'))) {
    const attempts = (rec.attempts || 0) + 1;
    // Au 5e échec le code est brûlé, même s'il est bon ensuite : il faut en redemander un.
    await store().setJSON(cleCode(email), { ...rec, attempts, code_hash: attempts >= OTP_MAX_ATTEMPTS ? null : rec.code_hash });
    return attempts >= OTP_MAX_ATTEMPTS ? 'too_many_attempts' : 'invalid';
  }
  // Usage unique ; on garde le compteur d'envois pour le plafond.
  await store().setJSON(cleCode(email), { ...rec, code_hash: null });
  return 'ok';
};

// ── Activité ─────────────────────────────────────────────────────────────────

export const lireActivite = (id) => lire(`activite/${id}`);

export const noterConnexion = async (id, maintenant = new Date()) => {
  const a = await lireActivite(id);
  const now = iso(maintenant);
  await store().setJSON(`activite/${id}`, {
    premiere_connexion: a?.premiere_connexion || now,
    derniere_connexion: now,
    connexions: (a?.connexions || 0) + 1,
    premiere_capture_at: a?.premiere_capture_at || null,
  });
};

// `moi` s'appelle à chaque ouverture : on n'écrit pas plus d'une fois par heure.
export const toucherActivite = async (id, maintenant = new Date()) => {
  const a = await lireActivite(id);
  if (!a || maintenant.getTime() - Date.parse(a.derniere_connexion) < 3600_000) return;
  await store().setJSON(`activite/${id}`, { ...a, derniere_connexion: iso(maintenant) });
};

// ── Dossier de marque ────────────────────────────────────────────────────────

// Épure une chaîne : contrôles retirés (sauf \n si `lignes`), trim, troncature, vide → null.
// Jamais de refus pour une longueur : le serveur tronque, c'est la sauvegarde automatique qui écrit.
const epurer = (v, max, { lignes = false } = {}) => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\r\n?/g, '\n').replace(lignes ? /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g : /[\u0000-\u001F\u007F-\u009F]/g, '');
  const t = [...s.trim()].slice(0, max).join('').trim();
  return t || null;
};

// Renvoie l'URL http(s) (https:// ajouté si le schéma manque) ou null. « javascript: » et consorts
// ne sont jamais valides : c'est ce qui décide si un lien peut devenir un href.
export const lienValide = (valeur) => {
  const s = typeof valeur === 'string' ? valeur.trim() : '';
  if (!s || /\s/.test(s)) return null;
  const schema = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  // « localhost:3000 » ressemble à un schéma : un port juste après les deux-points n'en est pas un.
  if (schema && !/^https?$/i.test(schema[1]) && !/^\d+([/?#]|$)/.test(s.slice(schema[0].length))) return null;
  const url = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) && u.hostname ? url : null;
  } catch {
    return null;
  }
};

const TYPES = ['app', 'plateforme', 'aucune'];

export const normaliserDossier = (brut) => {
  const d = brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
  const liste = (v) => (Array.isArray(v) ? v : []);
  const couleurs = [];
  for (const c of liste(d.couleurs)) {
    let h = typeof c === 'string' ? c.trim().toLowerCase() : '';
    if (/^#[0-9a-f]{3}$/.test(h)) h = `#${[...h.slice(1)].map((x) => x + x).join('')}`;
    if (/^#[0-9a-f]{6}$/.test(h) && !couleurs.includes(h)) couleurs.push(h);
  }
  const inspirations = [];
  for (const i of liste(d.inspirations)) {
    const url = lienValide(epurer(i?.url, 300));
    if (url) inspirations.push({ url, note: epurer(i.note, 280) });
  }
  return {
    nom: epurer(d.nom, 80),
    lien: lienValide(epurer(d.lien, 300)),
    type: TYPES.includes(d.type) ? d.type : null,
    pour_qui: epurer(d.pour_qui, 200),
    couleurs: couleurs.slice(0, 5),
    voix: liste(d.voix).map((m) => epurer(m, 30)).filter(Boolean).slice(0, 3),
    inspirations: inspirations.slice(0, 6),
    ecran_matin: epurer(d.ecran_matin, 1000, { lignes: true }),
  };
};

// La complétude vient d'ici et d'ici seulement : le front l'affiche sans la recalculer.
export const completude = (d) => {
  if (!d) return 0;
  const aucune = d.type === 'aucune';
  const champs = [
    Boolean(d.nom),
    ...(aucune ? [] : [Boolean(lienValide(d.lien))]),
    Boolean(d.type),
    Boolean(d.pour_qui),
    d.couleurs.length >= 1,
    d.voix.length === 3,
    d.inspirations.length >= 1,
    Boolean(d.ecran_matin),
  ];
  return Math.round((100 * champs.filter(Boolean).length) / champs.length);
};

// Le dossier vit dans sa propre clé : la sauvegarde automatique (plusieurs écritures par minute) ne
// doit jamais réécrire la fiche que le webhook de vente modifie.
const cleDossier = (id) => `dossiers/${id}`;

export const lireDossier = async (id) => {
  const rec = await lire(cleDossier(id));
  return rec
    ? { dossier: rec.dossier, rev: rec.rev, updated_at: rec.updated_at, completude: rec.completude }
    : { dossier: null, rev: 0, updated_at: null, completude: 0 };
};

// Révision par compteur, comme la progression IKEA : une écriture partie d'une version dépassée est
// refusée et le front adopte la version du serveur.
export const ecrireDossier = async (id, { dossier, base_rev: baseRev }) => {
  const actuel = await lire(cleDossier(id));
  const rev = actuel?.rev || 0;
  if (actuel && baseRev !== rev) return { conflit: true, actuel: await lireDossier(id) };
  const norme = normaliserDossier(dossier);
  const record = { rev: rev + 1, updated_at: iso(), completude: completude(norme), dossier: norme };
  await store().setJSON(cleDossier(id), record);
  return { record };
};

// ── Captures ─────────────────────────────────────────────────────────────────

const cleCapture = (id, cid) => `captures/${id}/${cid}`;
const cleImage = (id, cid) => `images/${id}/${cid}`;

// Le type vient des octets, jamais de l'extension ni du type déclaré : un faux JPEG qui contient du
// HTML ou du SVG ne doit pas être servi comme une image.
export const typeParOctets = (buf) => {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
};

const entier = (v, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
};

const bufferVersArrayBuffer = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

export const listerCaptures = async (id) => {
  const { blobs } = await store().list({ prefix: `captures/${id}/` });
  const fiches = (await Promise.all(blobs.map((b) => lire(b.key)))).filter(Boolean);
  return fiches.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
};

const nombreCaptures = async (id) => (await store().list({ prefix: `captures/${id}/` })).blobs.length;

// → { capture } | { erreur: 'too_large' | 'unsupported_type' | 'limite_atteinte' }
export const ajouterCapture = async (id, { octets, note, largeur, hauteur }) => {
  if (octets.length > CAPTURE_MAX_OCTETS) return { erreur: 'too_large' };
  const type = typeParOctets(octets);
  if (!type) return { erreur: 'unsupported_type' };
  if ((await nombreCaptures(id)) >= CAPTURES_MAX) return { erreur: 'limite_atteinte' };

  const cid = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const fiche = {
    id: cid, type, octets: octets.length, largeur: entier(largeur, 10000), hauteur: entier(hauteur, 10000),
    note: epurer(note, NOTE_MAX), created_at: iso(),
  };
  // Image d'abord, fiche ensuite : la liste fait foi par les fiches, une image sans fiche est invisible.
  await store().set(cleImage(id, cid), bufferVersArrayBuffer(octets));
  await store().setJSON(cleCapture(id, cid), fiche);

  // Deux envois simultanés peuvent passer le premier contrôle : on recompte APRÈS l'écriture et
  // celui qui dépasse la 30e place est retiré (fiche d'abord, puis image). L'ordre (created_at, id) est
  // celui des écritures à la milliseconde près : les deux concurrents voient la même liste et le même
  // dernier, donc un seul est retiré. Si les deux se retiraient, la place resterait libre mais
  // l'acheteur n'aurait rien perdu ; si aucun ne se retirait, on dépasserait 30 : c'est ce cas qu'on évite.
  const place = (await listerCaptures(id)).findIndex((c) => c.id === cid);
  if (place === -1 || place >= CAPTURES_MAX) {
    await store().delete(cleCapture(id, cid));
    await store().delete(cleImage(id, cid));
    return { erreur: 'limite_atteinte' };
  }
  // Gardée une fois pour toutes : c'est elle qui lance le délai de 7 jours du bonus fondateur.
  const a = await lireActivite(id);
  if (!a?.premiere_capture_at) {
    await store().setJSON(`activite/${id}`, {
      premiere_connexion: iso(), derniere_connexion: iso(), connexions: 0, ...a, premiere_capture_at: fiche.created_at,
    });
  }
  return { capture: fiche };
};

export const lireImage = async (id, cid) => {
  if (!CID.test(cid)) return null;
  const fiche = await lire(cleCapture(id, cid));
  if (!fiche) return null;
  const donnees = await store().get(cleImage(id, cid), { type: 'arrayBuffer' });
  return donnees ? { fiche, octets: Buffer.from(donnees) } : null;
};

export const noterCapture = async (id, cid, note) => {
  if (!CID.test(cid)) return null;
  const fiche = await lire(cleCapture(id, cid));
  if (!fiche) return null;
  const maj = { ...fiche, note: epurer(note, NOTE_MAX) };
  await store().setJSON(cleCapture(id, cid), maj);
  return maj;
};

export const supprimerCapture = async (id, cid) => {
  if (!CID.test(cid)) return false;
  if (!(await lire(cleCapture(id, cid)))) return false;
  // Fiche d'abord : si l'image résiste, elle reste invisible plutôt qu'une fiche sans image.
  await store().delete(cleCapture(id, cid));
  await store().delete(cleImage(id, cid));
  return true;
};

// ── Livraisons ───────────────────────────────────────────────────────────────

const cleMeta = (slug) => `contenus-meta/${slug}`;
export const etatLivraison = async (slug, maintenant = new Date()) => {
  const liv = livraison(slug);
  return liv ? calculerEtat(liv, await lire(cleMeta(slug)), maintenant) : null;
};

export const fichiersDe = async (slug) => {
  const { blobs } = await store().list({ prefix: `fichiers-meta/${slug}/` });
  const metas = await Promise.all(blobs.map((b) => lire(b.key)));
  return blobs.map((b, i) => ({ nom: b.key.split('/').pop(), octets: metas[i]?.octets ?? 0 })).sort((a, b) => a.nom.localeCompare(b.nom));
};

// → { octets, etat } | { erreur: 'invalid_slug' | 'invalid_html' }
export const deposerContenu = async (slug, html, { ouvrirMaintenant = false, maintenant = new Date() } = {}) => {
  const liv = livraison(slug);
  if (!liv) return { erreur: 'invalid_slug' };
  if (typeof html !== 'string' || !/^\s*<!doctype html>/i.test(html) || Buffer.byteLength(html) > CONTENU_MAX_OCTETS) return { erreur: 'invalid_html' };
  const avant = await lire(cleMeta(slug));
  // On ne peut qu'AVANCER l'ouverture : après la date promise, « ouvrir » ne pose rien, et redéposer
  // une version corrigée ne referme pas ce qui était ouvert.
  const avance = ouvrirMaintenant && maintenant.getTime() < Date.parse(liv.date) ? iso(maintenant) : null;
  const ouvertDes = [avant?.ouvert_des, avance].filter(Boolean).sort()[0] || null;
  const meta = { octets: Buffer.byteLength(html), depose_le: iso(maintenant), ouvert_des: ouvertDes };
  await store().set(`contenus/${slug}`, html);
  await store().setJSON(cleMeta(slug), meta);
  return { octets: meta.octets, etat: calculerEtat(liv, meta, maintenant) };
};

export const lireContenu = (slug) => (livraison(slug) ? store().get(`contenus/${slug}`, { type: 'text' }) : null);

// → { octets } | { erreur: 'invalid_slug' | 'invalid_name' | 'too_large' }
export const deposerFichier = async (slug, nom, octets) => {
  if (!livraison(slug)) return { erreur: 'invalid_slug' };
  if (!NOM_FICHIER.test(nom)) return { erreur: 'invalid_name' };
  if (octets.length > FICHIER_MAX_OCTETS) return { erreur: 'too_large' };
  const type = MIME_FICHIER[nom.split('.').pop()];
  await store().set(`fichiers/${slug}/${nom}`, bufferVersArrayBuffer(octets));
  await store().setJSON(`fichiers-meta/${slug}/${nom}`, { type, octets: octets.length, depose_le: iso() });
  return { octets: octets.length };
};

export const lireFichier = async (slug, nom) => {
  if (!livraison(slug) || !NOM_FICHIER.test(nom)) return null;
  const meta = await lire(`fichiers-meta/${slug}/${nom}`);
  const donnees = meta ? await store().get(`fichiers/${slug}/${nom}`, { type: 'arrayBuffer' }) : null;
  return donnees ? { octets: Buffer.from(donnees), type: meta.type } : null;
};

// ── Vue de l'acheteur connecté ───────────────────────────────────────────────

export const bonusEcheance = (fiche, activite) => (fiche.bonus && activite?.premiere_capture_at
  ? iso(new Date(Date.parse(activite.premiere_capture_at) + BONUS_JOURS * 864e5))
  : null);

export const construireMoi = async ({ id, email, fiche }, maintenant = new Date()) => {
  const [metas, dossier, nombre, activite] = await Promise.all([
    Promise.all(LIVRAISONS.map((l) => lire(cleMeta(l.slug)))),
    lireDossier(id),
    nombreCaptures(id),
    lireActivite(id),
  ]);
  const livraisons = await Promise.all(LIVRAISONS.map(async (l, i) => {
    const etat = calculerEtat(l, metas[i], maintenant);
    return {
      slug: l.slug, titre: l.titre, date: l.date, au_plus_tard: Boolean(l.au_plus_tard), etat,
      // Rien de plus qu'un nom de fichier, et seulement une fois la livraison ouverte.
      ...(etat === 'disponible' ? { fichiers: await fichiersDe(l.slug) } : {}),
    };
  }));
  return {
    email,
    rang: fiche.rang ?? null,
    audit: Boolean(fiche.audit),
    bonus: Boolean(fiche.bonus),
    source: fiche.source || 'paypal',
    achete_le: fiche.achats?.[0]?.paid_at || null,
    contact: CONTACT,
    livraisons,
    dossier: { completude: dossier.completude, updated_at: dossier.updated_at },
    captures: { nombre, max: CAPTURES_MAX },
    bonus_echeance: bonusEcheance(fiche, activite),
  };
};

// ── Administration ───────────────────────────────────────────────────────────

const toutesLesCles = async (prefix) => (await store().list({ prefix })).blobs.map((b) => b.key);

const aliasParFiche = async () => {
  const cles = await toutesLesCles('alias/');
  const docs = (await Promise.all(cles.map((c) => lire(c)))).filter(Boolean);
  const par = new Map();
  for (const a of docs) par.set(a.id, [...(par.get(a.id) || []), a.email]);
  return par;
};

export const listerAdmin = async (maintenant = new Date()) => {
  const fiches = await listerAcheteurs();
  const [alias, clesCaptures, clesAnnonces] = await Promise.all([aliasParFiche(), toutesLesCles('captures/'), toutesLesCles('annonces/')]);
  const compteCaptures = new Map();
  for (const c of clesCaptures) { const id = c.split('/')[1]; compteCaptures.set(id, (compteCaptures.get(id) || 0) + 1); }
  const acheteurs = await Promise.all(fiches.map(async (f) => {
    const id = hashEmail(f.email);
    const [d, a] = await Promise.all([lire(cleDossier(id)), lireActivite(id)]);
    const achats = f.achats || [];
    return {
      email: f.email,
      rang: f.rang ?? null,
      audit: Boolean(f.audit),
      bonus: Boolean(f.bonus),
      source: f.source || 'paypal',
      created_at: f.created_at,
      achats: achats.length,
      montant_total: achats.reduce((s, x) => s + (Number(x.montant) || 0), 0).toFixed(2),
      coupe: Boolean(f.coupe_at),
      coupe_raison: f.coupe_raison || null,
      completude: d?.completude ?? 0,
      captures: compteCaptures.get(id) || 0,
      premiere_capture_at: a?.premiere_capture_at || null,
      bonus_echeance: bonusEcheance(f, a),
      derniere_connexion: a?.derniere_connexion || null,
      connexions: a?.connexions || 0,
      alias: alias.get(id) || [],
    };
  }));
  const contenus = await Promise.all(LIVRAISONS.map(async (l) => {
    const meta = await lire(cleMeta(l.slug));
    return {
      slug: l.slug, date: l.date, etat: calculerEtat(l, meta, maintenant),
      octets: meta?.octets ?? null, depose_le: meta?.depose_le ?? null, ouvert_des: meta?.ouvert_des ?? null,
      annonces: clesAnnonces.filter((c) => c.startsWith(`annonces/${l.slug}/`)).length,
    };
  }));
  return { acheteurs, contenus, acheteurs_ouverts: fiches.filter(accesOuvert).length };
};

export const detailAdmin = async (email) => {
  const r = await resoudreFiche(email);
  if (!r) return null;
  const [dossier, captures, activite, alias, clesAnnonces] = await Promise.all([
    lireDossier(r.id), listerCaptures(r.id), lireActivite(r.id), aliasParFiche(), toutesLesCles('annonces/'),
  ]);
  return {
    id: r.id,
    acheteur: r.fiche,
    dossier: dossier.dossier,
    rev: dossier.rev,
    completude: dossier.completude,
    captures,
    activite,
    alias: alias.get(r.id) || [],
    annonces: clesAnnonces.filter((c) => c.endsWith(`/${r.id}`)).map((c) => c.split('/')[1]),
  };
};

export const ajouterManuel = async (email, { note } = {}) => {
  const existant = await resoudreFiche(email);
  const noteEpuree = note == null ? null : epurer(String(note), 500);
  if (existant) {
    if (noteEpuree) await store().setJSON(cleFiche(existant.id), { ...existant.fiche, note: noteEpuree, updated_at: iso() });
    return { created: false, fiche: { ...existant.fiche, ...(noteEpuree ? { note: noteEpuree } : {}) } };
  }
  const now = iso();
  // rang null : un accès manuel ne prend JAMAIS de place dans l'ordre des achats (audit 15, bonus 5).
  const fiche = {
    email, rang: null, audit: false, bonus: false, source: 'manuel', note: noteEpuree,
    coupe_at: null, coupe_raison: null, purge_at: null, created_at: now, updated_at: now, onboarding: null, achats: [],
  };
  await store().setJSON(cleFiche(hashEmail(email)), fiche);
  return { created: true, fiche };
};

const reecrireFiche = async (email, changement) => {
  const r = await resoudreFiche(email);
  if (!r) return null;
  const fiche = { ...r.fiche, ...changement, updated_at: iso() };
  await store().setJSON(cleFiche(r.id), fiche);
  return fiche;
};

// Coupure douce : la fiche n'est JAMAIS supprimée, le rang reste figé et les places d'audit et de
// bonus d'un acheteur remboursé ne sont pas réattribuées.
export const couper = (email, raison) => reecrireFiche(email, { coupe_at: iso(), coupe_raison: epurer(raison, 200) });
export const rouvrir = (email) => reecrireFiche(email, { coupe_at: null, coupe_raison: null });

// → { id } | { erreur: 'not_found' | 'deja_acheteur' | 'alias_existe' }
export const ajouterAlias = async (email, autre) => {
  const r = await resoudreFiche(email);
  if (!r) return { erreur: 'not_found' };
  const h = hashEmail(autre);
  if (await lire(cleFiche(h))) return { erreur: 'deja_acheteur' };
  if (await lire(`alias/${h}`)) return { erreur: 'alias_existe' };
  await store().setJSON(`alias/${h}`, { id: r.id, email: autre, created_at: iso() });
  return { id: r.id };
};

export const retirerAlias = async (autre) => {
  const h = hashEmail(autre);
  if (!(await lire(`alias/${h}`))) return false;
  await store().delete(`alias/${h}`);
  await store().delete(`otp/${h}`);
  return true;
};

// Effacement RGPD : tout ce que l'acheteur a déposé part ; restent email, rang et achats
// (comptabilité, ordre des rangs). La fiche est coupée : plus d'accès, plus d'envoi.
export const purger = async (email) => {
  const r = await resoudreFiche(email);
  if (!r) return false;
  const S = store();
  const cles = [
    cleDossier(r.id), `activite/${r.id}`, `otp/${hashEmail(r.fiche.email)}`,
    ...(await toutesLesCles(`captures/${r.id}/`)),
    ...(await toutesLesCles(`images/${r.id}/`)),
    ...(await toutesLesCles('annonces/')).filter((c) => c.endsWith(`/${r.id}`)),
  ];
  for (const cle of await toutesLesCles('alias/')) {
    const a = await lire(cle);
    if (a?.id === r.id) cles.push(cle, `otp/${hashEmail(a.email)}`);
  }
  for (const cle of cles) await S.delete(cle);
  const now = iso();
  await S.setJSON(cleFiche(r.id), {
    ...r.fiche, note: null, onboarding: null, coupe_at: r.fiche.coupe_at || now,
    coupe_raison: r.fiche.coupe_raison || 'purge', purge_at: now, updated_at: now,
  });
  return true;
};

// ── Emails ───────────────────────────────────────────────────────────────────

export const emailCodeKit = (to, code) => envoyerEmail({
  to,
  // Sans espace : le code doit se copier-coller d'un bloc (retour Damien sur l'IKEA).
  subject: `Ton code Kit App Sexy : ${code}`,
  devLog: { code },
  html: gabarit("Ton code d'accès", `
    ${p('Saisis ce code dans ton espace. Il expire dans 10 minutes.', '#8C908D')}
    <div style="font-family:'JetBrains Mono',Menlo,monospace;font-size:34px;letter-spacing:.2em;color:#3ECFA0;background:#111412;border-radius:12px;padding:18px 0;text-align:center;margin:0 0 18px">${code}</div>
    ${p("Tu n'es pas à l'origine de cette demande ? Ignore cet email.", '#8C908D')}`),
});

export const emailAnnonceKit = (to, liv) => envoyerEmail({
  to,
  subject: `${liv.titre} est ${liv.slug === 'audit' ? 'arrivé' : 'arrivée'}`,
  replyTo: process.env.KIT_ALERTE || CONTACT,
  devLog: { annonce: liv.slug },
  html: gabarit(`${liv.titre} est ${liv.slug === 'audit' ? 'arrivé' : 'arrivée'}`, `
    ${p('C\'est dans ton espace, connecte-toi avec cet email.', '#F5F5F3')}
    ${boutonEspace()}
    ${p('Damien', '#F5F5F3')}`),
});

// Annonce par email (les CGV disent « livré par e-mail »). Idempotente : annonces/<slug>/<id> garde
// la trace de chaque envoi, un appel répété ne renvoie rien. Par lots pour rester sous le délai d'une
// Function ; un échec d'envoi n'est pas tracé, il sera retenté au prochain appel.
export const annoncer = async (slug, lot = 25, maintenant = new Date()) => {
  const liv = livraison(slug);
  if (!liv || (await etatLivraison(slug, maintenant)) !== 'disponible') return { erreur: 'pas_ouvert' };
  const envoyes = [], echecs = [];
  let deja = 0, restants = 0;
  for (const f of (await listerAcheteurs()).filter(accesOuvert)) {
    const cle = `annonces/${slug}/${hashEmail(f.email)}`;
    if (await lire(cle)) { deja++; continue; }
    if (envoyes.length + echecs.length >= lot) { restants++; continue; }
    try {
      await emailAnnonceKit(f.email, liv);
      await store().setJSON(cle, { envoye_at: iso() });
      envoyes.push(f.email);
    } catch (err) {
      console.error('[kit-espace] annonce non envoyée:', slug, err?.message);
      echecs.push(f.email);
    }
  }
  return { envoyes, deja, echecs, restants };
};

// Renvoie l'email de bienvenue (nouvel email : lien de l'espace), p. ex. à qui a reçu l'ancien.
export const renvoyerBienvenue = async (email) => {
  const r = await resoudreFiche(email);
  if (!r || !accesOuvert(r.fiche)) return false;
  const res = await emailBienvenueKit(email, r.fiche, await livraisonsOuvertes());
  return Boolean(res?.sent || res?.mock);
};
