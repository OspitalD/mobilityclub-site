// Le serveur garde dossier.lien tel que l'acheteur l'a tapé (épuré, tronqué, jamais validé). Un lien
// « javascript:... » dans un href serait une faille : seul un http(s) devient cliquable, le reste
// s'affiche en texte. Même règle que lienValide côté serveur (netlify/lib/kit-espace.js).
export const lienSur = (valeur: string | null | undefined): string | null => {
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
