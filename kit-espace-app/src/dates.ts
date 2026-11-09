// Toutes les dates visibles sont celles de Paris, quel que soit le fuseau du téléphone : la date promise
// à l'acheteur est « à minuit heure de Paris ». Le front n'a aucune date en dur, il formate celles de GET moi.

export const jourLisible = (iso: string): string => {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' }).formatToParts(new Date(iso));
  const jour = Number(parts.find((p) => p.type === 'day')?.value);
  const mois = parts.find((p) => p.type === 'month')?.value ?? '';
  return `${jour === 1 ? '1er' : jour} ${mois}`;
};

export const tailleLisible = (octets: number): string => {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
};
