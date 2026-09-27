import { describe, expect, test } from "bun:test";
import { esMimeDeDocumento, limpiarMetadatosDocumento } from "./metadatos-documento";

/**
 * Los documentos de consentimiento se guardan sin recomprimir, así que la limpieza de metadatos trabaja a nivel
 * de contenedor. Lo que hay que demostrar son dos cosas: que el EXIF (con la localización) desaparece y que los
 * datos de imagen salen **byte a byte idénticos**.
 */

const crc32 = (datos: Uint8Array): number => {
  let resto = 0xffffffff;
  for (const byte of datos) {
    resto ^= byte;
    for (let bit = 0; bit < 8; bit++) resto = resto & 1 ? (resto >>> 1) ^ 0xedb88320 : resto >>> 1;
  }
  return (resto ^ 0xffffffff) >>> 0;
};

/** Trozo PNG con su longitud, tipo, datos y CRC. */
function trozoPng(tipo: string, datos: Uint8Array): Uint8Array {
  const salida = new Uint8Array(12 + datos.length);
  const vista = new DataView(salida.buffer);
  vista.setUint32(0, datos.length);
  salida.set(new TextEncoder().encode(tipo), 4);
  salida.set(datos, 8);
  const conTipo = new Uint8Array(4 + datos.length);
  conTipo.set(new TextEncoder().encode(tipo), 0);
  conTipo.set(datos, 4);
  vista.setUint32(8 + datos.length, crc32(conTipo));
  return salida;
}

const unir = (partes: Uint8Array[]) => {
  const salida = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) {
    salida.set(p, i);
    i += p.length;
  }
  return salida;
};

const FIRMA_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PIXELES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

describe("formatos admitidos como documento", () => {
  test("solo JPEG y PNG: son los que se pueden limpiar sin recomprimir", () => {
    expect(esMimeDeDocumento("image/jpeg")).toBe(true);
    expect(esMimeDeDocumento("image/png")).toBe(true);
    for (const mime of ["image/webp", "image/avif", "image/gif", "application/pdf"]) {
      expect(esMimeDeDocumento(mime)).toBe(false);
    }
  });
});

describe("limpieza de metadatos de un PNG", () => {
  const conMetadatos = unir([
    FIRMA_PNG,
    trozoPng("IHDR", new Uint8Array(13)),
    trozoPng("eXIf", new TextEncoder().encode("GPSLatitude=40.4168 GPSLongitude=-3.7038")),
    trozoPng("tEXt", new TextEncoder().encode("Software\0Cámara del móvil")),
    trozoPng("iTXt", new TextEncoder().encode("Comment\0\0\0\0dónde se firmó")),
    trozoPng("tIME", new Uint8Array(7)),
    trozoPng("IDAT", PIXELES),
    trozoPng("IEND", new Uint8Array(0)),
  ]);

  test("quita EXIF, texto y fecha, y deja los datos de imagen intactos", () => {
    const limpio = limpiarMetadatosDocumento(conMetadatos, "image/png");
    const texto = new TextDecoder("latin1").decode(limpio);
    expect(texto).not.toContain("GPSLatitude");
    expect(texto).not.toContain("Cámara del móvil");
    expect(texto).not.toContain("dónde se firmó");
    expect(texto).not.toContain("eXIf");
    expect(limpio.length).toBeLessThan(conMetadatos.length);
    // Sigue siendo un PNG con su IHDR, su IDAT y su IEND, y el IDAT es el mismo byte a byte.
    expect([...limpio.subarray(0, 8)]).toEqual([...FIRMA_PNG]);
    expect(texto).toContain("IHDR");
    expect(texto).toContain("IEND");
    const idat = limpio.indexOf(0x49) >= 0 ? texto.indexOf("IDAT") : -1;
    expect(idat).toBeGreaterThan(0);
    expect([...limpio.subarray(idat + 4, idat + 4 + PIXELES.length)]).toEqual([...PIXELES]);
  });

  test("un PNG sin metadatos no se toca", () => {
    const sinNada = unir([
      FIRMA_PNG,
      trozoPng("IHDR", new Uint8Array(13)),
      trozoPng("IDAT", PIXELES),
      trozoPng("IEND", new Uint8Array(0)),
    ]);
    expect([...limpiarMetadatosDocumento(sinNada, "image/png")]).toEqual([...sinNada]);
  });
});

describe("limpieza de metadatos de un JPEG", () => {
  /** Segmento JPEG con su marcador y su longitud. */
  const segmento = (marcador: number, datos: Uint8Array) =>
    unir([new Uint8Array([0xff, marcador, ((datos.length + 2) >> 8) & 0xff, (datos.length + 2) & 0xff]), datos]);

  const exif = new TextEncoder().encode("Exif\0\0GPSLatitude 40.4168 GPSLongitude -3.7038");
  const conMetadatos = unir([
    new Uint8Array([0xff, 0xd8]), // SOI
    segmento(0xe0, new TextEncoder().encode("JFIF\0")), // APP0: se conserva
    segmento(0xe1, exif), // APP1: EXIF, fuera
    segmento(0xfe, new TextEncoder().encode("hecho con el móvil")), // COM, fuera
    segmento(0xdb, new Uint8Array(64)), // DQT: se conserva
    new Uint8Array([0xff, 0xda, 0x00, 0x08, 0, 1, 0, 0, 0, 0]), // SOS
    PIXELES, // Datos comprimidos
    new Uint8Array([0xff, 0xd9]), // EOI
  ]);

  test("quita EXIF y comentarios, conserva JFIF y los datos comprimidos byte a byte", () => {
    const limpio = limpiarMetadatosDocumento(conMetadatos, "image/jpeg");
    const texto = new TextDecoder("latin1").decode(limpio);
    expect(texto).not.toContain("GPSLatitude");
    expect(texto).not.toContain("hecho con el móvil");
    expect(texto).toContain("JFIF");
    // Los datos comprimidos (desde SOS hasta el final) salen exactamente igual.
    const desdeSos = limpio.subarray(limpio.length - (PIXELES.length + 12));
    expect([...desdeSos.subarray(0, 2)]).toEqual([0xff, 0xda]);
    expect([...limpio.subarray(limpio.length - PIXELES.length - 2, limpio.length - 2)]).toEqual([...PIXELES]);
    expect([...limpio.subarray(limpio.length - 2)]).toEqual([0xff, 0xd9]);
  });

  test("lo que no es JPEG ni PNG se devuelve tal cual", () => {
    const otro = new Uint8Array([1, 2, 3]);
    expect([...limpiarMetadatosDocumento(otro, "image/webp")]).toEqual([...otro]);
  });
});
