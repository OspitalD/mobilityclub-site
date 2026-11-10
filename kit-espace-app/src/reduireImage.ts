// Réduction côté navigateur : la Function plafonne à ~6 Mo et le serveur refuse au-delà de 4 Mo. Une
// capture d'écran de téléphone fait 1 à 4 Mo en PNG, quelques centaines de Ko en WEBP.

export const COTE_MAX = 2000;
export const COTE_REPLI = 1600;
// Marge sous les 4 000 000 d'octets du serveur : le multipart ajoute son propre en-tête.
export const OCTETS_MAX = 3_800_000;

export class ImageIllisible extends Error {
  constructor() { super('image_illisible'); this.name = 'ImageIllisible'; }
}

export const dimensionsCibles = (largeur: number, hauteur: number, cote: number) => {
  const echelle = Math.min(1, cote / Math.max(largeur, hauteur));
  return { largeur: Math.max(1, Math.round(largeur * echelle)), hauteur: Math.max(1, Math.round(hauteur * echelle)) };
};

type Source = { source: CanvasImageSource; largeur: number; hauteur: number; liberer: () => void };

const decoder = async (fichier: File): Promise<Source> => {
  try {
    // from-image : la photo d'un téléphone tenu en portrait arrive à l'endroit.
    const bmp = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
    return { source: bmp, largeur: bmp.width, hauteur: bmp.height, liberer: () => bmp.close() };
  } catch {
    // Safari ancien : createImageBitmap sans options ou absent. <img> applique l'orientation EXIF seul.
    const url = URL.createObjectURL(fichier);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { source: img, largeur: img.naturalWidth, hauteur: img.naturalHeight, liberer: () => URL.revokeObjectURL(url) };
    } catch {
      URL.revokeObjectURL(url);
      throw new ImageIllisible();
    }
  }
};

const encoder = (canvas: HTMLCanvasElement, type: string, qualite: number) =>
  new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, qualite));

export interface ImageReduite { blob: Blob; largeur: number; hauteur: number }

export const reduireImage = async (fichier: File): Promise<ImageReduite> => {
  const src = await decoder(fichier);
  try {
    if (!src.largeur || !src.hauteur) throw new ImageIllisible();
    const passe = async (cote: number, qualite: number, type: string): Promise<ImageReduite> => {
      const d = dimensionsCibles(src.largeur, src.hauteur, cote);
      const canvas = document.createElement('canvas');
      canvas.width = d.largeur;
      canvas.height = d.hauteur;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new ImageIllisible();
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src.source, 0, 0, d.largeur, d.hauteur);
      const blob = await encoder(canvas, type, qualite);
      if (!blob) throw new ImageIllisible();
      // La largeur et la hauteur envoyées sont celles de l'image réduite : elles réservent la place des
      // vignettes sans attendre le chargement.
      return { blob, largeur: d.largeur, hauteur: d.hauteur };
    };
    let type = 'image/webp';
    let r = await passe(COTE_MAX, 0.85, type);
    // Safari ancien ne sait pas encoder en WEBP : toBlob rend alors du PNG, d'où la bascule en JPEG.
    if (r.blob.type !== 'image/webp') { type = 'image/jpeg'; r = await passe(COTE_MAX, 0.85, type); }
    if (r.blob.size > OCTETS_MAX) r = await passe(COTE_MAX, 0.75, type);
    if (r.blob.size > OCTETS_MAX) r = await passe(COTE_REPLI, 0.75, type);
    return r;
  } finally {
    src.liberer();
  }
};
