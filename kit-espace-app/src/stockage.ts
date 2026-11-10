// localStorage ne sert qu'à des commodités par appareil, toujours dans un try/catch : navigation privée,
// données bloquées ou quota plein ne doivent jamais casser l'espace. Rien d'important n'y vit seul.
export const lireLocal = (cle: string): string | null => {
  try { return window.localStorage.getItem(cle); } catch { return null; }
};
export const ecrireLocal = (cle: string, valeur: string) => {
  try { window.localStorage.setItem(cle, valeur); } catch { /* sans stockage, le brouillon reste en mémoire */ }
};
export const effacerLocal = (cle: string) => {
  try { window.localStorage.removeItem(cle); } catch { /* idem */ }
};

export const CLE_EMAIL = 'kas-email';
export const cleBrouillon = (email: string) => `kas-brouillon-${email.trim().toLowerCase()}`;
const cleOuvertes = (email: string) => `kas-ouvertes-${email.trim().toLowerCase()}`;

export const lireOuvertes = (email: string): Set<string> => {
  try {
    const v = JSON.parse(lireLocal(cleOuvertes(email)) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch { return new Set(); }
};
export const noterOuverte = (email: string, slug: string) => {
  const s = lireOuvertes(email);
  s.add(slug);
  ecrireLocal(cleOuvertes(email), JSON.stringify([...s]));
};

// Déconnexion : le brouillon et les livraisons ouvertes ne restent pas sur un appareil partagé.
// L'email (CLE_EMAIL) est gardé : il sert seulement à préremplir la connexion.
export const effacerDonneesAppareil = (email: string) => {
  effacerLocal(cleBrouillon(email));
  effacerLocal(cleOuvertes(email));
};
