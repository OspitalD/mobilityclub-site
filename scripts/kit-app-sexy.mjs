#!/usr/bin/env node
// CLI admin du Kit App Sexy — parle à /api/kit-app-sexy/admin/* avec le jeton admin (celui de la Méthode IKEA).
//
//   METHODE_IKEA_ADMIN_TOKEN=… node scripts/kit-app-sexy.mjs <commande>
//
//   list                                        un acheteur par ligne + contenus + rangs manquants
//   show <email>                                fiche, dossier de marque, captures, activité
//   add <email…> [--note "…"] [--bienvenue]     accès manuel (jamais de rang) ; --bienvenue renvoie l'email avec
//                                               le lien de l'espace (c'est le rattrapage de l'ancien email)
//   couper <email> [--raison "…"]               coupe l'accès (remboursement) ; la fiche et le rang restent
//   rouvrir <email>                             rouvre l'accès
//   alias <email-paypal> <autre-email>          l'acheteur se connecte avec un autre email
//   purger <email>                              efface dossier, captures, activité (RGPD) ; garde email, rang, achats
//   contenu <slug> <fichier.html> [--maintenant]  dépose une livraison (video | grille | audit) ; --maintenant l'ouvre
//                                               avant sa date (jamais après : les dates promises sont figées)
//   fichier <slug> <chemin>                     pièce jointe d'une livraison (zip, md, pdf, txt, json ≤ 4 Mo)
//   annoncer <slug>                             email d'annonce à tous les acheteurs (idempotent, par lots de 25)
//   capture <email> <id> [--sortie chemin]      télécharge une capture déposée par l'acheteur
//   perso <email> <fichier>                     « Ton rendu » : fichier pour CET acheteur seul (zip, md, pdf ≤ 4 Mo)
//   perso-page <email> <dossier>                « Ton rendu » : page HTML + images/polices du dossier, servie à
//                                               cet acheteur connecté seulement (remplace la page précédente)
//   perso-retirer <email> <nom|page>            retire un fichier du rendu, ou toute la page avec « page »
//   (aucune commande perso n'envoie d'email : prévenir l'acheteur reste une décision de Damien)
//
// Cible : KIT_APP_SEXY_URL, sinon METHODE_IKEA_URL, sinon https://www.mobilityclub.co (http://localhost:4930 en local).
// Le contenu payant ne doit JAMAIS être commité : le dépôt est public.

import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { ajouterSquelette } from './methode-ikea.mjs';

const BASE = (process.env.KIT_APP_SEXY_URL || process.env.METHODE_IKEA_URL || 'https://www.mobilityclub.co').replace(/\/$/, '');
const TOKEN = process.env.METHODE_IKEA_ADMIN_TOKEN || '';

const requete = async (method, chemin, corps, type = 'application/json') => {
  const res = await fetch(`${BASE}/api/kit-app-sexy/admin/${chemin}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(corps !== undefined ? { 'Content-Type': type } : {}) },
    ...(corps !== undefined ? { body: type === 'application/json' ? JSON.stringify(corps) : corps } : {}),
  });
  return res;
};

const appel = async (...args) => {
  const res = await requete(...args);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${data.error || res.statusText}`);
  return data;
};

const option = (args, nom) => {
  const i = args.indexOf(`--${nom}`);
  return i === -1 ? undefined : args.splice(i, 2)[1];
};
const drapeau = (args, nom) => {
  const i = args.indexOf(`--${nom}`);
  if (i !== -1) args.splice(i, 1);
  return i !== -1;
};

// Mêmes règles que le serveur (netlify/lib/kit-espace.js) : on refuse AVANT d'envoyer quoi que ce soit.
const CHEMIN_PAGE = /^(?:[A-Za-z0-9][A-Za-z0-9._-]{0,80}\/){0,3}[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(html|css|js|png|jpe?g|webp|gif|svg|avif|ico|woff2?|ttf|otf|json|mp4|webm)$/;
const MAX_OCTETS = 4_000_000;
const MAX_PAGE = 20_000_000;

// Fichiers de la page, chemins relatifs avec « / ». Les dossiers et fichiers cachés (.netlify, .DS_Store) sont ignorés.
export const fichiersDuDossier = async (racine) => {
  const out = [];
  const parcourir = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const complet = join(dir, e.name);
      if (e.isDirectory()) await parcourir(complet);
      else if (e.isFile()) out.push({ chemin: relative(racine, complet).split(sep).join('/'), complet, octets: (await stat(complet)).size });
    }
  };
  await parcourir(racine);
  return out.sort((a, b) => a.chemin.localeCompare(b.chemin));
};

const q = (email) => `email=${encodeURIComponent(email || '')}`;

const jour = (iso) => (iso ? String(iso).slice(0, 10) : null);

// Une ligne par acheteur : « n°rang|manuel  email  audit/bonus  dossier NN %  captures N  dernière connexion  [COUPÉ] ».
export const ligneAcheteur = (a) => {
  const droits = [a.audit && 'audit', a.bonus && 'bonus'].filter(Boolean).join('/') || '-';
  const echeance = a.bonus && a.premiere_capture_at ? `  bonus avant ${jour(a.bonus_echeance)}` : '';
  return [
    String(a.rang == null ? 'manuel' : `n°${a.rang}`).padEnd(7),
    a.email.padEnd(34),
    droits.padEnd(11),
    `dossier ${String(a.completude).padStart(3)} %`,
    `captures ${String(a.captures).padStart(2)}`,
    `dernière connexion ${jour(a.derniere_connexion) || 'jamais'}`,
  ].join('  ') + echeance + (a.coupe ? `  [COUPÉ${a.coupe_raison ? ` : ${a.coupe_raison}` : ''}]` : '');
};

// Les rangs manquants (suppression, double webhook rejoué en même temps) font reculer d'un cran les
// promesses « 15 premiers » et « 5 premiers » : on les rend visibles pour que Damien corrige à la main.
export const rangsManquants = (acheteurs) => {
  const rangs = new Set(acheteurs.map((a) => a.rang).filter((r) => Number.isInteger(r)));
  const max = Math.max(0, ...rangs);
  return Array.from({ length: max }, (_, i) => i + 1).filter((n) => !rangs.has(n));
};

export const lignesContenus = (contenus, ouverts) => contenus.map((c) => {
  const aAnnoncer = c.etat === 'disponible' && c.annonces < ouverts;
  const alerte = aAnnoncer ? `  À ANNONCER : node scripts/kit-app-sexy.mjs annoncer ${c.slug}` : (c.etat === 'en_preparation' ? '  EN PRÉPARATION : date passée, rien déposé' : '');
  return `${c.slug.padEnd(7)}  ${jour(c.date)}  ${c.etat.padEnd(14)}  annonces ${c.annonces}/${ouverts}  ${c.octets == null ? 'rien déposé' : `${c.octets} octets`}${c.ouvert_des ? `  ouvert dès ${jour(c.ouvert_des)}` : ''}${alerte}`;
});

export const main = async ([cmd, ...args]) => {
  if (!TOKEN) throw new Error('METHODE_IKEA_ADMIN_TOKEN manquant.');
  switch (cmd) {
    case 'list': {
      const { acheteurs, contenus, acheteurs_ouverts: ouverts } = await appel('GET', 'acheteurs');
      for (const a of acheteurs) console.log(ligneAcheteur(a));
      const trous = rangsManquants(acheteurs);
      if (trous.length) console.log(`Rangs manquants : ${trous.join(', ')} (à corriger à la main)`);
      console.log('');
      for (const l of lignesContenus(contenus, ouverts)) console.log(l);
      console.log(`${acheteurs.length} acheteurs (${ouverts} accès ouverts) — ${BASE}`);
      return;
    }
    case 'show': {
      const d = await appel('GET', `acheteur?email=${encodeURIComponent(args[0] || '')}`);
      console.log(JSON.stringify(d, null, 2));
      return;
    }
    case 'add': {
      const note = option(args, 'note');
      const bienvenue = drapeau(args, 'bienvenue');
      if (!args.length) throw new Error('Aucun email fourni.');
      const r = await appel('POST', 'acces', { emails: args, note, bienvenue });
      console.log(`ajoutés : ${r.ajoutes.length} · déjà présents : ${r.existants.length} · invalides : ${r.invalides.length}${bienvenue ? ` · emails de bienvenue : ${r.bienvenue_envoyee.length}` : ''}`);
      if (r.invalides.length) console.log('invalides :', r.invalides.join(', '));
      return;
    }
    case 'couper': {
      const raison = option(args, 'raison');
      const r = await appel('PATCH', 'acces', { email: args[0], coupe: true, raison });
      console.log(`accès coupé : ${r.email} (${r.coupe_at})`);
      return;
    }
    case 'rouvrir': {
      const r = await appel('PATCH', 'acces', { email: args[0], coupe: false });
      console.log(`accès rouvert : ${r.email}`);
      return;
    }
    case 'alias': {
      if (args.length < 2) throw new Error('Usage : alias <email-paypal> <autre-email>');
      await appel('POST', 'alias', { email: args[0], autre: args[1] });
      console.log(`alias posé : ${args[1]} ouvre la fiche de ${args[0]}`);
      return;
    }
    case 'purger': {
      await appel('DELETE', 'acheteur', { email: args[0] });
      console.log(`purgé : ${args[0]} (dossier, captures, activité effacés ; email, rang, achats gardés)`);
      return;
    }
    case 'contenu': {
      const maintenant = drapeau(args, 'maintenant');
      const [slug, fichier] = args;
      if (!slug || !fichier) throw new Error('Usage : contenu <slug> <fichier.html> [--maintenant]');
      const html = ajouterSquelette(await readFile(fichier, 'utf8'));
      const r = await appel('PUT', `contenu/${slug}${maintenant ? '?ouvrir=maintenant' : ''}`, html, 'text/html; charset=utf-8');
      console.log(`${slug} déposé (${r.octets} octets), état : ${r.etat}`);
      if (r.etat !== 'disponible') console.log('pas encore ouvert aux acheteurs : il s\'ouvrira à sa date.');
      return;
    }
    case 'fichier': {
      const [slug, chemin] = args;
      if (!slug || !chemin) throw new Error('Usage : fichier <slug> <chemin>');
      const r = await appel('PUT', `fichier/${slug}/${encodeURIComponent(basename(chemin).toLowerCase())}`, await readFile(chemin), 'application/octet-stream');
      console.log(`${basename(chemin).toLowerCase()} déposé (${r.octets} octets)`);
      return;
    }
    case 'annoncer': {
      const slug = args[0];
      let total = 0, restants = 0;
      do {
        const r = await appel('POST', 'annoncer', { slug });
        total += r.envoyes.length;
        restants = r.restants;
        console.log(`lot : ${r.envoyes.length} envoyés · ${r.deja} déjà annoncés · ${r.echecs.length} échecs · ${r.restants} restants`);
        if (r.echecs.length) { console.log('échecs :', r.echecs.join(', '), '(relance la commande pour réessayer)'); break; }
        if (!r.envoyes.length) break;
      } while (restants > 0);
      console.log(`annonce ${slug} : ${total} emails envoyés`);
      return;
    }
    case 'capture': {
      const sortie = option(args, 'sortie');
      const [email, id] = args;
      const res = await requete('GET', `capture?email=${encodeURIComponent(email || '')}&id=${encodeURIComponent(id || '')}`);
      if (!res.ok) throw new Error(`${res.status} capture introuvable`);
      const chemin = sortie || `capture-${id}.${(res.headers.get('content-type') || '').split('/')[1] || 'bin'}`;
      await writeFile(chemin, Buffer.from(await res.arrayBuffer()));
      console.log(`capture enregistrée : ${chemin}`);
      return;
    }
    case 'perso': {
      const [email, chemin] = args;
      if (!email || !chemin) throw new Error('Usage : perso <email> <fichier>');
      const nom = basename(chemin).toLowerCase();
      const r = await appel('PUT', `perso/${encodeURIComponent(nom)}?${q(email)}`, await readFile(chemin), 'application/octet-stream');
      console.log(`${nom} déposé pour ${email} (${r.octets} octets) — visible par cet acheteur seulement, aucun email envoyé`);
      return;
    }
    case 'perso-page': {
      const [email, dossier] = args;
      if (!email || !dossier) throw new Error('Usage : perso-page <email> <dossier>');
      const fichiers = await fichiersDuDossier(dossier);
      const index = fichiers.find((f) => f.chemin === 'index.html');
      if (!index) throw new Error(`Pas de index.html dans ${dossier}.`);
      const refuses = fichiers.filter((f) => !CHEMIN_PAGE.test(f.chemin));
      if (refuses.length) throw new Error(`Noms refusés (lettres, chiffres, . _ - ; types web) : ${refuses.map((f) => f.chemin).join(', ')}`);
      const gros = fichiers.filter((f) => f.octets > MAX_OCTETS);
      if (gros.length) throw new Error(`Trop gros (> 4 Mo) : ${gros.map((f) => f.chemin).join(', ')}`);
      const total = fichiers.reduce((s, f) => s + f.octets, 0);
      if (total > MAX_PAGE) throw new Error(`Page trop lourde : ${total} octets (max ${MAX_PAGE}).`);
      const html = await readFile(index.complet, 'utf8');
      const titre = (/<title>([^<]*)<\/title>/i.exec(html)?.[1] || '').trim();
      // On repart de zéro : un ancien élément retiré du dossier ne doit pas rester en ligne.
      await appel('DELETE', `perso/page?${q(email)}`);
      // index.html en DERNIER : c'est lui qui rend la page visible, une fois toutes ses images en place.
      for (const f of [...fichiers.filter((x) => x !== index), index]) {
        const chemin = f.chemin.split('/').map(encodeURIComponent).join('/');
        await appel('PUT', `perso-page/${chemin}?${q(email)}${f === index && titre ? `&titre=${encodeURIComponent(titre)}` : ''}`, await readFile(f.complet), 'application/octet-stream');
      }
      console.log(`page déposée pour ${email} : ${fichiers.length} fichiers, ${total} octets${titre ? ` (« ${titre} »)` : ''} — visible par cet acheteur seulement, aucun email envoyé`);
      return;
    }
    case 'perso-retirer': {
      const [email, nom] = args;
      if (!email || !nom) throw new Error('Usage : perso-retirer <email> <nom|page>');
      const r = await appel('DELETE', `perso/${encodeURIComponent(nom === 'page' ? nom : nom.toLowerCase())}?${q(email)}`);
      console.log(r.retires ? `retiré pour ${email} : ${nom}${nom === 'page' ? ` (${r.retires} fichiers)` : ''}` : `rien à retirer : ${nom}`);
      return;
    }
    default:
      console.log('Commandes : list | show <email> | add <email…> [--note …] [--bienvenue] | couper <email> [--raison …] | rouvrir <email> | alias <email-paypal> <autre> | purger <email> | contenu <slug> <fichier.html> [--maintenant] | fichier <slug> <chemin> | annoncer <slug> | capture <email> <id> [--sortie chemin] | perso <email> <fichier> | perso-page <email> <dossier> | perso-retirer <email> <nom|page>');
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((err) => { console.error(`Erreur : ${err.message}`); process.exit(1); });
}
