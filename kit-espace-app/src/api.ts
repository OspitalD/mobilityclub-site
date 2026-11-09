import type { Capture, Dossier, Moi, ReponseDossier, ResultatEcriture } from './types.ts';

const BASE = '/api/kit-app-sexy';

// Une seule forme d'erreur pour tout le front : `code` est celui du serveur (invalid_code, acces_coupe,
// limite_atteinte...), ou « reseau » quand la requête n'a pas abouti, ou « server_error » pour un 5xx.
export class ErreurApi extends Error {
  readonly statut: number;
  readonly code: string;
  readonly corps: Record<string, unknown>;
  constructor(statut: number, code: string, corps: Record<string, unknown> = {}) {
    super(code);
    this.name = 'ErreurApi';
    this.statut = statut;
    this.code = code;
    this.corps = corps;
  }
}

const versErreur = (statut: number, corps: Record<string, unknown> | null) => {
  const code = typeof corps?.error === 'string' ? corps.error : statut === 401 ? 'unauthorized' : statut >= 500 ? 'server_error' : 'erreur';
  return new ErreurApi(statut, code, corps ?? {});
};

const lireJson = async (res: Response): Promise<Record<string, unknown> | null> => {
  try { return (await res.json()) as Record<string, unknown>; } catch { return null; }
};

// Le front y branche l'état « hors ligne » : un fetch qui lève est une panne réseau, un fetch qui aboutit l'efface.
let ecouteur: ((ok: boolean) => void) | null = null;
export const surResultatReseau = (f: (ok: boolean) => void) => { ecouteur = f; };

interface Options { corps?: unknown; keepalive?: boolean; form?: FormData }

const requete = async (methode: string, chemin: string, o: Options = {}): Promise<Response> => {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (o.form) body = o.form;
  else if (o.corps !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(o.corps); }
  try {
    // Le cookie de session est HttpOnly : le navigateur le joint seul, le front ne le voit jamais.
    const res = await fetch(`${BASE}/${chemin}`, { method: methode, headers, body, credentials: 'same-origin', keepalive: o.keepalive });
    ecouteur?.(true);
    return res;
  } catch {
    ecouteur?.(false);
    throw new ErreurApi(0, 'reseau');
  }
};

const json = async <T>(methode: string, chemin: string, o: Options = {}): Promise<T> => {
  const res = await requete(methode, chemin, o);
  const corps = await lireJson(res);
  if (!res.ok) throw versErreur(res.status, corps);
  return corps as T;
};

export const demanderCode = (email: string) => json<{ sent: true }>('POST', 'request-code', { corps: { email } });
export const verifierCode = (email: string, code: string) => json<{ ok: true }>('POST', 'verify-code', { corps: { email, code } });
export const deconnecter = () => json<{ ok: true }>('POST', 'logout');
export const moi = () => json<Moi>('GET', 'moi');
export const lireDossier = () => json<ReponseDossier>('GET', 'dossier');

// Un 409 n'est pas une panne : c'est la réponse normale d'une écriture partie d'une révision dépassée, et
// elle porte la version du serveur. On la rend comme un résultat pour que la fusion soit explicite.
export const ecrireDossier = async (dossier: Dossier, baseRev: number, o: { keepalive?: boolean } = {}): Promise<ResultatEcriture> => {
  const res = await requete('PUT', 'dossier', { corps: { dossier, base_rev: baseRev }, keepalive: o.keepalive });
  const corps = await lireJson(res);
  if (res.status === 409 && corps?.conflict) return { ok: false, conflit: true, ...(corps as Omit<Extract<ResultatEcriture, { ok: false }>, 'ok' | 'conflit'>) };
  if (!res.ok) throw versErreur(res.status, corps);
  return { ok: true, ...(corps as Omit<Extract<ResultatEcriture, { ok: true }>, 'ok'>) };
};

export const listerCaptures = () => json<{ captures: Capture[]; max: number }>('GET', 'captures');
export const noterCapture = async (id: string, note: string) => (await json<{ capture: Capture }>('PATCH', `captures/${id}`, { corps: { note } })).capture;
export const supprimerCapture = (id: string) => json<{ deleted: true }>('DELETE', `captures/${id}`);

export interface MetaCapture { largeur?: number; hauteur?: number; note?: string }

const extension = (type: string) => (type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg');

const formulaire = (blob: Blob, meta: MetaCapture) => {
  const form = new FormData();
  form.set('image', new File([blob], `capture.${extension(blob.type)}`, { type: blob.type }));
  if (meta.note) form.set('note', meta.note);
  if (meta.largeur) form.set('largeur', String(meta.largeur));
  if (meta.hauteur) form.set('hauteur', String(meta.hauteur));
  return form;
};

// XHR et non fetch : seul XHR donne la progression de l'envoi, que l'écran montre en barre de 3 px sous
// la vignette. Sans XHR (autre environnement), on retombe sur fetch, sans progression.
export const envoyerCapture = (blob: Blob, meta: MetaCapture, onProgress?: (ratio: number) => void): Promise<Capture> => {
  if (typeof XMLHttpRequest === 'undefined') {
    return json<{ capture: Capture }>('POST', 'captures', { form: formulaire(blob, meta) }).then((r) => r.capture);
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/captures`);
    xhr.withCredentials = true;
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onerror = () => { ecouteur?.(false); reject(new ErreurApi(0, 'reseau')); };
    xhr.ontimeout = () => { ecouteur?.(false); reject(new ErreurApi(0, 'reseau')); };
    xhr.onload = () => {
      ecouteur?.(true);
      const corps = (xhr.response ?? null) as Record<string, unknown> | null;
      if (xhr.status >= 200 && xhr.status < 300 && corps?.capture) resolve(corps.capture as Capture);
      else reject(versErreur(xhr.status, corps));
    };
    xhr.send(formulaire(blob, meta));
  });
};

export const urlContenu = (slug: string) => `${BASE}/contenu/${encodeURIComponent(slug)}`;
export const urlFichier = (slug: string, nom: string) => `${BASE}/fichier/${encodeURIComponent(slug)}/${encodeURIComponent(nom)}`;
