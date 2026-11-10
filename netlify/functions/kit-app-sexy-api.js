// /api/kit-app-sexy/* — espace acheteur du Kit App Sexy : connexion par code, dossier de marque,
// captures, livraisons à date, administration. Toute la logique est dans netlify/lib/kit-espace.js.
//
// Public (aucune auth) :
//   POST request-code { email }          → { sent: true } dans tous les cas (400 invalid_email) ; un code part
//                                          seulement si l'email résout une fiche dont l'accès est ouvert
//   POST verify-code  { email, code }    → { ok: true } + cookie kas_session (401 invalid_code|expired,
//                                          429 too_many_attempts, 403 no_access)
//   POST logout                          → { ok: true } + cookie effacé
// Membre (cookie kas_session ; sans cookie 401 unauthorized ; accès coupé 403 acces_coupe ; une route qui
// modifie avec un Origin étranger : 403 bad_origin) :
//   GET   moi                            → profil, livraisons (a_venir | en_preparation | disponible), dossier, captures
//   GET   dossier                        → { dossier|null, rev, updated_at, completude } (jamais 404)
//   PUT   dossier { dossier, base_rev }  → { rev, updated_at, completude } ; 409 { conflict, dossier, rev, ... }
//   GET   captures                       → { captures: [...], max: 30 }
//   POST  captures (multipart: image, note?, largeur?, hauteur?) → 201 { capture } ; 400 no_file, 413 too_large,
//                                          415 unsupported_type (octets magiques), 409 limite_atteinte
//   GET | PATCH { note } | DELETE  captures/<cid>   (404 pour la capture d'un autre : jamais 403)
//   GET   contenu/<slug>                 → page HTML de la livraison, après contrôle de session ET de date
//   GET   fichier/<slug>/<nom>           → pièce jointe en téléchargement, même règle de date
// Admin (Authorization: Bearer METHODE_IKEA_ADMIN_TOKEN, CORS METHODE_IKEA_ADMIN_ORIGINS) :
//   GET admin/acheteurs · GET|DELETE admin/acheteur · POST|PATCH admin/acces · POST|DELETE admin/alias
//   GET admin/capture?email=&id= · PUT|GET admin/contenu/<slug>[?ouvrir=maintenant]
//   PUT admin/fichier/<slug>/<nom> · POST admin/annoncer { slug }
// Contrat détaillé : scripts/kit-app-sexy.mjs (CLI) et tests/kit-app-sexy-espace.test.mjs.

import { createHash, timingSafeEqual } from 'node:crypto';
import { normaliserEmail } from '../lib/methode-ikea.js';
import {
  CID, CAPTURE_MAX_OCTETS, CAPTURES_MAX, CONTACT, DOSSIER_MAX_OCTETS, FICHIER_MAX_OCTETS, NOM_FICHIER,
  accesOuvert, ajouterAlias, ajouterCapture, ajouterManuel, annoncer, construireMoi, cookieEfface, cookieSession,
  couper, creerJeton, deposerContenu, deposerFichier, detailAdmin, ecrireDossier, emailCodeKit, etatLivraison,
  lireContenu, lireDossier, lireFichier, lireImage, listerAdmin, listerCaptures, noterCapture, noterConnexion,
  nouveauCode, purger, renvoyerBienvenue, resoudreFiche, retirerAlias, rouvrir, sessionKit, supprimerCapture,
  toucherActivite, verifierCode,
} from '../lib/kit-espace.js';
import { dateLisible, livraison } from '../lib/kit-livraisons.js';

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
});

const lireJson = async (req) => {
  const raw = await req.text();
  if (raw.length > 10_000) throw Object.assign(new Error('payload_too_large'), { statusCode: 413 });
  try { return JSON.parse(raw || '{}'); } catch { throw Object.assign(new Error('invalid_json'), { statusCode: 400 }); }
};

const estAdmin = (req) => {
  const attendu = process.env.METHODE_IKEA_ADMIN_TOKEN || '';
  const recu = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (attendu.length < 24 || !recu) return false;
  const h = (v) => createHash('sha256').update(v).digest();
  return timingSafeEqual(h(attendu), h(recu));
};

// CORS de l'API admin : uniquement la console (app.mobilityclub.co par défaut). Pas de cookie côté
// admin : l'autorisation passe par le jeton Bearer.
const corsAdmin = (req) => {
  const origin = req.headers.get('origin');
  const permises = String(process.env.METHODE_IKEA_ADMIN_ORIGINS || 'https://app.mobilityclub.co')
    .split(',').map((o) => o.trim()).filter(Boolean);
  if (!origin || !permises.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, PUT, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
};

// Défense en plus de SameSite=Lax : une requête qui modifie et vient d'un autre site est refusée.
// Pas d'en-tête Origin (curl, tests) : on laisse passer, c'est la session qui garde.
const origineOk = (req) => {
  const o = req.headers.get('origin');
  if (!o) return true;
  try { return new URL(o).origin === new URL(req.url).origin; } catch { return false; }
};
const MODIFIE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const urlCapture = (c) => ({ ...c, url: `/api/kit-app-sexy/captures/${c.id}` });

// En-têtes d'une image rendue à son propriétaire : jamais interprétée comme autre chose qu'une image.
const enTetesImage = (type, octets) => ({
  'Content-Type': type,
  'Content-Length': String(octets),
  'Cache-Control': 'private, max-age=3600',
  'X-Content-Type-Options': 'nosniff',
  'Content-Disposition': 'inline',
  'Content-Security-Policy': "default-src 'none'",
});

const reponseImage = (r) => new Response(r.octets, { status: 200, headers: enTetesImage(r.fiche.type, r.octets.length) });

// Pages servies dans l'iframe de l'espace : un refus s'y affiche en clair, jamais en JSON brut.
const ENTETES_PAGE = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Frame-Options': 'SAMEORIGIN',
};

const pageMessage = (status, titre, texte) => new Response(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${titre}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;box-sizing:border-box;padding:24px;background:#0D0F0E;color:#F5F5F3;font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif}main{max-width:30rem}h1{margin:0 0 .6rem;font-size:1.5rem;font-style:italic;font-weight:800;letter-spacing:-.02em}p{margin:0;color:#8C908D;line-height:1.6}</style></head>
<body><main><h1>${titre}</h1><p>${texte}</p></main></body></html>`, {
  status,
  headers: { ...ENTETES_PAGE, 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'" },
});

const pageContenu = (html) => new Response(html, { status: 200, headers: { ...ENTETES_PAGE, 'Content-Security-Policy': "frame-ancestors 'self'" } });

// ── Public ────────────────────────────────────────────────────────────────────

const demanderCode = async (req) => {
  const email = normaliserEmail((await lireJson(req)).email);
  if (!email) return json(400, { error: 'invalid_email' });
  // Inconnu ou coupé : même réponse, aucun envoi (anti-énumération).
  const r = await resoudreFiche(email);
  if (r && accesOuvert(r.fiche)) {
    const code = await nouveauCode(email);
    if (code) await emailCodeKit(email, code).catch((err) => console.error('[kit-espace] email code:', err?.message));
  }
  return json(200, { sent: true });
};

const validerCode = async (req) => {
  const body = await lireJson(req);
  const email = normaliserEmail(body.email);
  const code = String(body.code ?? '');
  if (!email || !/^\d{6}$/.test(code)) return json(400, { error: 'invalid_request' });
  const verdict = await verifierCode(email, code);
  if (verdict !== 'ok') return json(verdict === 'too_many_attempts' ? 429 : 401, { error: verdict === 'invalid' ? 'invalid_code' : verdict });
  // La fiche a pu disparaître ou être coupée entre l'envoi et la saisie.
  const r = await resoudreFiche(email);
  if (!r || !accesOuvert(r.fiche)) return json(403, { error: 'no_access' });
  await noterConnexion(r.id);
  return json(200, { ok: true }, { 'Set-Cookie': cookieSession(req, creerJeton({ k: r.id, e: email })) });
};

// ── Membre ────────────────────────────────────────────────────────────────────

const refus = (session) => (session.erreur === 'acces_coupe'
  ? json(403, { error: 'acces_coupe', contact: CONTACT })
  : json(401, { error: 'unauthorized' }));

const moi = async (_req, s) => {
  await toucherActivite(s.id);
  return json(200, await construireMoi(s));
};

const dossier = async (req, s) => {
  if (req.method === 'GET') return json(200, await lireDossier(s.id));
  if (req.method !== 'PUT') return json(405, { error: 'method_not_allowed' });
  if (Number(req.headers.get('content-length') || 0) > DOSSIER_MAX_OCTETS) return json(413, { error: 'too_large' });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > DOSSIER_MAX_OCTETS) return json(413, { error: 'too_large' });
  let body; try { body = JSON.parse(raw || '{}'); } catch { return json(400, { error: 'invalid_json' }); }
  if (!body.dossier || typeof body.dossier !== 'object' || Array.isArray(body.dossier)) return json(400, { error: 'invalid_dossier' });
  const r = await ecrireDossier(s.id, { dossier: body.dossier, base_rev: Number.isInteger(body.base_rev) ? body.base_rev : 0 });
  if (r.conflit) return json(409, { conflict: true, ...r.actuel });
  return json(200, { rev: r.record.rev, updated_at: r.record.updated_at, completude: r.record.completude });
};

const capturesListe = async (req, s) => {
  if (req.method === 'GET') return json(200, { captures: (await listerCaptures(s.id)).map(urlCapture), max: CAPTURES_MAX });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  // Contrôlé AVANT la lecture : Netlify coupe autour de 6 Mo, on refuse tôt ce qu'on ne servira pas.
  if (Number(req.headers.get('content-length') || 0) > 4_500_000) return json(413, { error: 'too_large' });
  let form; try { form = await req.formData(); } catch { return json(400, { error: 'no_file' }); }
  const image = form.get('image');
  if (!image || typeof image === 'string' || typeof image.arrayBuffer !== 'function') return json(400, { error: 'no_file' });
  if (image.size > CAPTURE_MAX_OCTETS) return json(413, { error: 'too_large' });
  const r = await ajouterCapture(s.id, {
    octets: Buffer.from(await image.arrayBuffer()),
    note: form.get('note'), largeur: form.get('largeur'), hauteur: form.get('hauteur'),
  });
  if (r.erreur === 'too_large') return json(413, { error: 'too_large' });
  if (r.erreur === 'unsupported_type') return json(415, { error: 'unsupported_type' });
  if (r.erreur === 'limite_atteinte') return json(409, { error: 'limite_atteinte', max: CAPTURES_MAX });
  return json(201, { capture: urlCapture(r.capture) });
};

const capture = async (req, s, cid) => {
  if (req.method === 'GET') {
    // L'id de la fiche vient de la session, jamais de la requête : la capture d'un autre est introuvable.
    if (!CID.test(cid)) return json(400, { error: 'invalid_id' });
    const r = await lireImage(s.id, cid);
    return r ? reponseImage(r) : json(404, { error: 'not_found' });
  }
  if (req.method === 'PATCH') {
    const body = await lireJson(req);
    const maj = await noterCapture(s.id, cid, body.note);
    return maj ? json(200, { capture: urlCapture(maj) }) : json(404, { error: 'not_found' });
  }
  if (req.method === 'DELETE') return (await supprimerCapture(s.id, cid)) ? json(200, { deleted: true }) : json(404, { error: 'not_found' });
  return json(405, { error: 'method_not_allowed' });
};

// Le contenu payant ne sort que si la session est valide ET que la date est passée (ou la livraison
// ouverte par Damien). Avant la date, la réponse ne contient aucun octet du contenu.
const contenu = async (_req, s, slug) => {
  const liv = livraison(slug);
  if (!liv) return pageMessage(404, 'Introuvable', 'Cette page n\'existe pas.');
  const etat = await etatLivraison(slug);
  if (etat === 'a_venir') return pageMessage(403, 'Pas encore', `Disponible le ${dateLisible(liv.date)}.`);
  if (etat === 'en_preparation') return pageMessage(404, 'C\'est le jour', 'Je finis la mise en ligne, reviens dans quelques heures.');
  const html = await lireContenu(slug);
  return html ? pageContenu(html) : pageMessage(404, 'C\'est le jour', 'Je finis la mise en ligne, reviens dans quelques heures.');
};

const fichier = async (_req, s, slug, nom) => {
  const liv = livraison(slug);
  if (!liv || !NOM_FICHIER.test(nom)) return json(404, { error: 'not_found' });
  const etat = await etatLivraison(slug);
  if (etat === 'a_venir') return json(403, { error: 'pas_encore' });
  if (etat !== 'disponible') return json(404, { error: 'not_found' });
  const f = await lireFichier(slug, nom);
  if (!f) return json(404, { error: 'not_found' });
  return new Response(f.octets, {
    status: 200,
    headers: {
      'Content-Type': f.type, 'Content-Length': String(f.octets.length),
      'Content-Disposition': `attachment; filename="${nom}"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    },
  });
};

// Nom de fichier encodé de travers (%E0%A4%A) : null, pour répondre 404 au lieu de planter.
const decoder = (v) => { try { return decodeURIComponent(v); } catch { return null; } };

// → { handler, htmlErreurs } si la route membre existe
const routeMembre = (action) => {
  if (action === 'moi') return { run: moi };
  if (action === 'dossier') return { run: dossier };
  if (action === 'captures') return { run: capturesListe };
  let m = /^captures\/([^/]+)$/.exec(action);
  if (m) return { run: (req, s) => capture(req, s, m[1]) };
  m = /^contenu\/([^/]+)$/.exec(action);
  if (m) return { run: (req, s) => contenu(req, s, m[1]), page: true };
  m = /^fichier\/([^/]+)\/([^/]+)$/.exec(action);
  if (m) {
    const nom = decoder(m[2]);
    return { run: nom === null ? async () => json(404, { error: 'not_found' }) : (req, s) => fichier(req, s, m[1], nom) };
  }
  return null;
};

const membre = async (req, route) => {
  if (MODIFIE.has(req.method) && !origineOk(req)) return json(403, { error: 'bad_origin' });
  const s = await sessionKit(req);
  if (s.erreur) {
    if (!route.page) return refus(s);
    return s.erreur === 'acces_coupe'
      ? pageMessage(403, 'Accès fermé', `Écris-moi : ${CONTACT}.`)
      : pageMessage(401, 'Connexion nécessaire', 'Ouvre ton espace et connecte-toi avec l\'email de ton achat.');
  }
  return route.run(req, s);
};

// ── Admin ─────────────────────────────────────────────────────────────────────

const emailDe = async (req) => {
  const q = new URL(req.url).searchParams.get('email');
  return normaliserEmail(q ?? (await lireJson(req)).email);
};

const adminAcces = async (req) => {
  if (req.method === 'POST') {
    const body = await lireJson(req);
    const brut = Array.isArray(body.emails) ? body.emails : [body.email];
    const ajoutes = [], existants = [], invalides = [], bienvenue = [];
    for (const raw of brut) {
      const email = normaliserEmail(raw);
      if (!email) { invalides.push(String(raw ?? '')); continue; }
      const { created } = await ajouterManuel(email, { note: body.note });
      (created ? ajoutes : existants).push(email);
      // Le moyen de renvoyer le lien de l'espace à qui a reçu l'ancien email.
      if (body.bienvenue === true && (await renvoyerBienvenue(email))) bienvenue.push(email);
    }
    if (!ajoutes.length && !existants.length) return json(400, { error: 'invalid_email', invalides });
    return json(200, { ajoutes, existants, invalides, bienvenue_envoyee: bienvenue });
  }
  if (req.method === 'PATCH') {
    const body = await lireJson(req);
    const email = normaliserEmail(body.email);
    if (!email || typeof body.coupe !== 'boolean') return json(400, { error: 'invalid_request' });
    const f = body.coupe ? await couper(email, body.raison) : await rouvrir(email);
    return f ? json(200, { email: f.email, coupe_at: f.coupe_at || null }) : json(404, { error: 'not_found' });
  }
  return json(405, { error: 'method_not_allowed' });
};

const adminAlias = async (req) => {
  const body = await lireJson(req);
  if (req.method === 'POST') {
    const email = normaliserEmail(body.email), autre = normaliserEmail(body.autre);
    if (!email || !autre) return json(400, { error: 'invalid_email' });
    const r = await ajouterAlias(email, autre);
    if (r.erreur === 'not_found') return json(404, { error: 'not_found' });
    if (r.erreur) return json(409, { error: r.erreur });
    return json(200, { ok: true, id: r.id });
  }
  if (req.method === 'DELETE') {
    const autre = normaliserEmail(body.autre);
    if (!autre) return json(400, { error: 'invalid_email' });
    return json(200, { removed: await retirerAlias(autre) });
  }
  return json(405, { error: 'method_not_allowed' });
};

const adminContenu = async (req, slug) => {
  if (req.method === 'GET') {
    // Aperçu pour Damien : sans règle de date.
    if (!livraison(slug)) return json(400, { error: 'invalid_slug' });
    const html = await lireContenu(slug);
    return html ? pageContenu(html) : json(404, { error: 'not_found' });
  }
  if (req.method !== 'PUT') return json(405, { error: 'method_not_allowed' });
  const ouvrir = new URL(req.url).searchParams.get('ouvrir') === 'maintenant';
  const r = await deposerContenu(slug, await req.text(), { ouvrirMaintenant: ouvrir });
  return r.erreur ? json(400, { error: r.erreur }) : json(200, { ok: true, octets: r.octets, etat: r.etat });
};

const adminFichier = async (req, slug, nom) => {
  if (req.method !== 'PUT') return json(405, { error: 'method_not_allowed' });
  if (Number(req.headers.get('content-length') || 0) > FICHIER_MAX_OCTETS + 1000) return json(413, { error: 'too_large' });
  const r = await deposerFichier(slug, nom, Buffer.from(await req.arrayBuffer()));
  if (r.erreur === 'too_large') return json(413, { error: 'too_large' });
  return r.erreur ? json(400, { error: r.erreur }) : json(200, { ok: true, octets: r.octets });
};

const adminRoute = async (req, action) => {
  let m;
  if (action === 'admin/acheteurs') return req.method === 'GET' ? json(200, await listerAdmin()) : json(405, { error: 'method_not_allowed' });
  if (action === 'admin/acheteur') {
    if (req.method === 'GET') {
      const email = normaliserEmail(new URL(req.url).searchParams.get('email'));
      if (!email) return json(400, { error: 'invalid_email' });
      const d = await detailAdmin(email);
      if (!d) return json(404, { error: 'not_found' });
      const { id: _id, ...reste } = d;
      return json(200, reste);
    }
    if (req.method === 'DELETE') {
      const email = await emailDe(req);
      if (!email) return json(400, { error: 'invalid_email' });
      return (await purger(email)) ? json(200, { purge: true }) : json(404, { error: 'not_found' });
    }
    return json(405, { error: 'method_not_allowed' });
  }
  if (action === 'admin/acces') return adminAcces(req);
  if (action === 'admin/alias') return adminAlias(req);
  if (action === 'admin/capture') {
    if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    const u = new URL(req.url).searchParams;
    const email = normaliserEmail(u.get('email'));
    const r = email ? await resoudreFiche(email) : null;
    const img = r ? await lireImage(r.id, u.get('id') || '') : null;
    return img ? reponseImage(img) : json(404, { error: 'not_found' });
  }
  if ((m = /^admin\/contenu\/([^/]+)$/.exec(action))) return adminContenu(req, m[1]);
  if ((m = /^admin\/fichier\/([^/]+)\/([^/]+)$/.exec(action))) { const nom = decoder(m[2]); return nom === null ? json(404, { error: 'not_found' }) : adminFichier(req, m[1], nom); }
  if (action === 'admin/annoncer') {
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    const r = await annoncer(String((await lireJson(req)).slug ?? ''));
    return r.erreur ? json(409, { error: r.erreur }) : json(200, r);
  }
  return json(404, { error: 'not_found' });
};

const admin = async (req, action) => {
  const cors = corsAdmin(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const avecCors = (res) => { for (const [k, v] of Object.entries(cors)) res.headers.set(k, v); return res; };
  if (!estAdmin(req)) return avecCors(json(401, { error: 'unauthorized' }));
  return avecCors(await adminRoute(req, action));
};

// ── Routage ───────────────────────────────────────────────────────────────────

const PUBLIC = { 'request-code': demanderCode, 'verify-code': validerCode };

export default async (req) => {
  const action = new URL(req.url).pathname.replace(/^\/api\/kit-app-sexy\/?/, '').replace(/\/$/, '');
  try {
    if (action.startsWith('admin/')) return await admin(req, action);
    if (action === 'logout' || PUBLIC[action]) {
      if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
      if (action === 'logout') return json(200, { ok: true }, { 'Set-Cookie': cookieEfface(req) });
      return await PUBLIC[action](req);
    }
    const route = routeMembre(action);
    if (!route) return json(404, { error: 'not_found' });
    return await membre(req, route);
  } catch (err) {
    console.error('[kit-espace] erreur:', action, err);
    const status = err.statusCode || 500;
    return json(status, { error: status === 500 ? 'server_error' : err.message });
  }
};

export const config = { path: '/api/kit-app-sexy/*' };
