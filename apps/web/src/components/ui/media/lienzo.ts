import { MAX_IMAGEN } from "@/lib/media/reglas";
import type { DatosReproduccion } from "@/lib/media/tipos";
import { ajustarAMaximo, dimensionesGiradas, type Rect, type Rotacion, recorteReal } from "./transformaciones";

/** Operaciones del navegador con canvas y elementos multimedia. */

/** Lado máximo del lienzo de trabajo, para no agotar la memoria con fotos enormes. */
const LADO_MAX_TRABAJO = 4096;

// Imágenes ya decodificadas, para `use()` en el editor. Acotada para no retener bitmaps sin fin.
const imagenes = new Map<string, Promise<HTMLImageElement | null>>();
const MAX_IMAGENES = 12;

/** Imagen decodificada, o `null` si no se ha podido cargar (el fallo no se guarda: reabrir lo reintenta). */
export function cargarImagen(url: string): Promise<HTMLImageElement | null> {
  let promesa = imagenes.get(url);
  if (!promesa) {
    const img = new Image();
    img.src = url;
    promesa = img.decode().then(
      () => img,
      () => {
        imagenes.delete(url);
        return null;
      },
    );
    imagenes.set(url, promesa);
    if (imagenes.size > MAX_IMAGENES) imagenes.delete(imagenes.keys().next().value as string);
  }
  return promesa;
}

export function olvidarImagen(url: string) {
  imagenes.delete(url);
}

export interface Orientacion {
  rotacion: Rotacion;
  volteoH: boolean;
  volteoV: boolean;
}

/** Dibuja la imagen girada y volteada en el lienzo, reducida si supera el lado máximo de trabajo. */
export function dibujarOrientada(lienzo: HTMLCanvasElement, img: HTMLImageElement, o: Orientacion) {
  const escala = Math.min(1, LADO_MAX_TRABAJO / Math.max(img.naturalWidth, img.naturalHeight));
  const origen = { ancho: Math.round(img.naturalWidth * escala), alto: Math.round(img.naturalHeight * escala) };
  const destino = dimensionesGiradas(origen, o.rotacion);
  lienzo.width = destino.ancho;
  lienzo.height = destino.alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) return;
  ctx.save();
  ctx.translate(destino.ancho / 2, destino.alto / 2);
  ctx.rotate((o.rotacion * Math.PI) / 180);
  ctx.scale(o.volteoH ? -1 : 1, o.volteoV ? -1 : 1);
  ctx.drawImage(img, -origen.ancho / 2, -origen.alto / 2, origen.ancho, origen.alto);
  ctx.restore();
}

/** Exporta el recorte visible (con zoom) a WebP, sin superar el tamaño máximo guardado. */
export function exportarRecorte(base: HTMLCanvasElement, recorte: Rect | null, zoom: number): Promise<Blob> {
  const r = recorteReal(recorte, { ancho: base.width, alto: base.height }, zoom);
  const salida = ajustarAMaximo({ ancho: r.ancho, alto: r.alto }, MAX_IMAGEN);
  const lienzo = document.createElement("canvas");
  lienzo.width = salida.ancho;
  lienzo.height = salida.alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas no disponible"));
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(base, r.x, r.y, r.ancho, r.alto, 0, 0, salida.ancho, salida.alto);
  return new Promise((resolver, rechazar) =>
    lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error("No se pudo exportar"))), "image/webp", 0.95),
  );
}

/** Tiempo máximo para leer los metadatos; el navegador puede aplazar la carga (p. ej., en pestañas ocultas). */
const ESPERA_METADATOS_MS = 5000;

/**
 * Duración y dimensiones de un vídeo o audio local, leídas antes de subirlo. Si el navegador no
 * las da a tiempo, se sube sin ellas: la subida nunca queda bloqueada por este paso.
 */
export function leerDatosReproduccion(archivo: File): Promise<DatosReproduccion> {
  const esVideo = archivo.type.startsWith("video/");
  if (!esVideo && !archivo.type.startsWith("audio/")) return Promise.resolve({});
  return new Promise((resolver) => {
    const url = URL.createObjectURL(archivo);
    const el = document.createElement(esVideo ? "video" : "audio");
    let terminado = false;
    const terminar = (datos: DatosReproduccion) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(limite);
      el.removeAttribute("src");
      URL.revokeObjectURL(url);
      resolver(datos);
    };
    const limite = setTimeout(() => terminar({}), ESPERA_METADATOS_MS);
    el.preload = "metadata";
    el.onloadedmetadata = () =>
      terminar({
        duracion: Number.isFinite(el.duration) ? el.duration : undefined,
        ...(el instanceof HTMLVideoElement
          ? { ancho: el.videoWidth || undefined, alto: el.videoHeight || undefined }
          : {}),
      });
    el.onerror = () => terminar({});
    el.src = url;
  });
}
