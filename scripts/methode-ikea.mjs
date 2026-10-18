#!/usr/bin/env node
// CLI admin de la Méthode IKEA — parle à /api/methode-ikea/admin/* avec le jeton admin.
//
//   METHODE_IKEA_ADMIN_TOKEN=… node scripts/methode-ikea.mjs <commande>
//
//   list                         liste les acheteurs
//   add <email> [email…]         ajoute des acheteurs (source « admin »)
//   import <fichier>             importe un fichier d'emails (CSV, TXT, export Notion : tout email trouvé)
//   remove <email>               retire un accès (coupe aussi les sessions ouvertes)
//   content <fichier.html>       dépose la formation (ajoute <!doctype>/<html>/<head>/<body> si absents)
//
// Cible : METHODE_IKEA_URL (défaut https://www.mobilityclub.co ; http://localhost:8888 sous netlify dev).
// Le HTML de la formation ne doit JAMAIS être commité : le repo est public.

import { readFile } from 'node:fs/promises';

const BASE = (process.env.METHODE_IKEA_URL || 'https://www.mobilityclub.co').replace(/\/$/, '');
const TOKEN = process.env.METHODE_IKEA_ADMIN_TOKEN || '';

// Le fichier exporté du design n'a ni <!doctype> ni <html>/<head>/<body> : on pose
// le squelette sans toucher au contenu. Tout ce qui précède le premier élément de
// page (meta, title, link, style) va dans <head>, le reste dans <body>.
export const ajouterSquelette = (html) => {
  if (/^\s*<!doctype html>/i.test(html)) return html;
  const m = html.match(/\n<(header|main|nav|div|section|body|article)\b/);
  if (!m) throw new Error('Impossible de repérer le début du <body>.');
  const head = html.slice(0, m.index).trim();
  const body = html.slice(m.index).trim();
  return `<!doctype html>\n<html lang="fr">\n<head>\n${head}\n<meta name="robots" content="noindex, nofollow">\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
};

const appel = async (method, path, body, type = 'application/json') => {
  const res = await fetch(`${BASE}/api/methode-ikea/admin/${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': type },
    ...(body !== undefined ? { body: type === 'application/json' ? JSON.stringify(body) : body } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${data.error || res.statusText}`);
  return data;
};

const emailsDans = (texte) => [...new Set((texte.match(/[^\s@,;<>"'()]+@[^\s@,;<>"'()]+\.[a-z]{2,}/gi) || []).map((e) => e.toLowerCase()))];

const main = async ([cmd, ...args]) => {
  if (!TOKEN) throw new Error('METHODE_IKEA_ADMIN_TOKEN manquant.');
  switch (cmd) {
    case 'list': {
      const { buyers } = await appel('GET', 'buyers');
      for (const b of buyers) console.log(`${b.created_at.slice(0, 10)}  ${b.source.padEnd(7)}  ${b.email}`);
      console.log(`${buyers.length} acheteur(s) — ${BASE}`);
      return;
    }
    case 'add':
    case 'import': {
      const emails = cmd === 'add' ? args : emailsDans(await readFile(args[0], 'utf8'));
      if (!emails.length) throw new Error('Aucun email fourni.');
      const r = await appel('POST', 'buyers', { emails, source: cmd === 'import' ? 'import' : 'admin' });
      console.log(`ajoutés : ${r.added.length} · déjà présents : ${r.existing.length} · invalides : ${r.invalid.length}`);
      if (r.invalid.length) console.log('invalides :', r.invalid.join(', '));
      return;
    }
    case 'remove': {
      const r = await appel('DELETE', 'buyers', { email: args[0] });
      console.log(r.removed ? `retiré : ${args[0]}` : `absent : ${args[0]}`);
      return;
    }
    case 'content': {
      const html = ajouterSquelette(await readFile(args[0], 'utf8'));
      const r = await appel('PUT', 'content', html, 'text/html; charset=utf-8');
      console.log(`formation déposée (${r.bytes} octets) — ${BASE}/methode-ikea`);
      return;
    }
    default:
      console.log('Commandes : list | add <email…> | import <fichier> | remove <email> | content <fichier.html>');
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((err) => { console.error(`Erreur : ${err.message}`); process.exit(1); });
}
