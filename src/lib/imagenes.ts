import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";
import type { Plan } from "./schema";
import type { ImagenOptimizada } from "./publico";

/**
 * Optimiza las fotos de src/assets/planes: AVIF y WebP con varios anchos (srcset) y un JPEG de respaldo.
 * Si un plan apunta a un archivo que no existe, el build falla.
 */
const modulos = import.meta.glob<{ default: ImageMetadata }>("/src/assets/planes/*.{jpg,jpeg,png,webp}", { eager: true });
const ANCHOS = [480, 800, 1200];

function buscar(nombre: string): ImageMetadata | undefined {
  const ruta = Object.keys(modulos).find((r) => r.endsWith(`/${nombre}`));
  return ruta ? modulos[ruta].default : undefined;
}

async function conjunto(meta: ImageMetadata, formato: "avif" | "webp" | "jpeg") {
  const utiles = ANCHOS.filter((w) => w <= meta.width);
  const anchos = utiles.length ? utiles : [meta.width];
  const imgs = await Promise.all(anchos.map((w) => getImage({ src: meta, width: w, format: formato, quality: 70 })));
  return {
    srcset: imgs.map((im, i) => `${im.src} ${anchos[i]}w`).join(", "),
    src: imgs[Math.min(1, imgs.length - 1)].src,
  };
}

export async function optimizar(img: Plan["imagen"]): Promise<ImagenOptimizada | undefined> {
  if (!img) return undefined;
  const meta = buscar(img.src);
  if (!meta) throw new Error(`Imagen no encontrada en src/assets/planes: ${img.src}`);
  const [avif, webp, jpeg] = await Promise.all([conjunto(meta, "avif"), conjunto(meta, "webp"), conjunto(meta, "jpeg")]);
  return {
    alt: img.alt,
    licencia: img.licencia,
    credito: img.credito,
    origen: img.origen,
    ancho: meta.width,
    alto: meta.height,
    avif: avif.srcset,
    webp: webp.srcset,
    jpeg: jpeg.srcset,
    src: jpeg.src,
  };
}
