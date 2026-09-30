/**
 * Fichero `.ico` con imágenes PNG dentro (el formato que aceptan todos los navegadores actuales): la cabecera de
 * 6 bytes, una entrada de 16 bytes por imagen y después los PNG tal cual. Así `/favicon.ico`, que el navegador pide
 * por su cuenta aunque la página declare otros iconos, existe y lleva el dibujo de 16 px.
 */
export function icoDePngs(pngs: readonly Uint8Array[]): Uint8Array {
  if (pngs.length === 0) throw new Error("Un .ico necesita al menos una imagen.");
  const cabecera = 6;
  const entrada = 16;
  const total = cabecera + entrada * pngs.length + pngs.reduce((suma, p) => suma + p.byteLength, 0);
  const salida = new Uint8Array(total);
  const vista = new DataView(salida.buffer);
  vista.setUint16(0, 0, true); // reservado
  vista.setUint16(2, 1, true); // tipo: icono
  vista.setUint16(4, pngs.length, true);
  let desplazamiento = cabecera + entrada * pngs.length;
  pngs.forEach((png, i) => {
    const { ancho, alto } = medidasDePng(png);
    const e = cabecera + entrada * i;
    vista.setUint8(e, ancho >= 256 ? 0 : ancho); // 0 significa 256
    vista.setUint8(e + 1, alto >= 256 ? 0 : alto);
    vista.setUint8(e + 2, 0); // sin paleta
    vista.setUint8(e + 3, 0);
    vista.setUint16(e + 4, 1, true); // planos
    vista.setUint16(e + 6, 32, true); // bits por píxel
    vista.setUint32(e + 8, png.byteLength, true);
    vista.setUint32(e + 12, desplazamiento, true);
    salida.set(png, desplazamiento);
    desplazamiento += png.byteLength;
  });
  return salida;
}

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Ancho y alto de un PNG, leídos de su cabecera IHDR. */
export function medidasDePng(png: Uint8Array): { ancho: number; alto: number } {
  if (png.byteLength < 24 || FIRMA_PNG.some((b, i) => png[i] !== b)) throw new Error("No es un PNG.");
  const vista = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { ancho: vista.getUint32(16), alto: vista.getUint32(20) };
}

/** Las imágenes que declara un `.ico`: medidas de cada entrada (0 = 256). */
export function entradasDeIco(ico: Uint8Array): { ancho: number; alto: number; bytes: number }[] {
  const vista = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
  if (vista.getUint16(0, true) !== 0 || vista.getUint16(2, true) !== 1) throw new Error("No es un .ico.");
  return Array.from({ length: vista.getUint16(4, true) }, (_, i) => {
    const e = 6 + 16 * i;
    return { ancho: vista.getUint8(e) || 256, alto: vista.getUint8(e + 1) || 256, bytes: vista.getUint32(e + 8, true) };
  });
}
