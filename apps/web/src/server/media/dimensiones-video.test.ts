import { describe, expect, test } from "bun:test";
import { dimensionesVideo } from "./dimensiones-video";

const caja = (tipo: string, ...contenido: Uint8Array[]) => {
  const cuerpo = contenido.reduce((n, c) => n + c.length, 0);
  const salida = new Uint8Array(8 + cuerpo);
  new DataView(salida.buffer).setUint32(0, 8 + cuerpo);
  salida.set(new TextEncoder().encode(tipo), 4);
  let pos = 8;
  for (const c of contenido) {
    salida.set(c, pos);
    pos += c.length;
  }
  return salida;
};

/** `tkhd` versión 0 (84 bytes de contenido) con la matriz identidad o girada 90°. */
const tkhd = (ancho: number, alto: number, girado = false) => {
  const datos = new Uint8Array(84);
  const vista = new DataView(datos.buffer);
  const matriz = 40;
  const [a, b, c, d] = girado ? [0, 0x10000, -0x10000, 0] : [0x10000, 0, 0, 0x10000];
  vista.setInt32(matriz, a);
  vista.setInt32(matriz + 4, b);
  vista.setInt32(matriz + 12, c);
  vista.setInt32(matriz + 16, d);
  vista.setInt32(matriz + 32, 0x40000000);
  vista.setUint32(76, ancho * 65536);
  vista.setUint32(80, alto * 65536);
  return caja("tkhd", datos);
};

const mp4 = (...pistas: Uint8Array[]) =>
  new Uint8Array([
    ...caja("ftyp", new TextEncoder().encode("isom")),
    ...caja("moov", ...pistas.map((p) => caja("trak", p))),
  ]);

describe("dimensiones de vídeo desde la cabecera MP4", () => {
  test("lee el vídeo vertical e ignora la pista de audio", () => {
    expect(dimensionesVideo(mp4(tkhd(0, 0), tkhd(720, 1280)))).toEqual({ ancho: 720, alto: 1280 });
  });

  test("un vídeo de móvil girado 90° devuelve las medidas de visualización", () => {
    expect(dimensionesVideo(mp4(tkhd(1920, 1080, true)))).toEqual({ ancho: 1080, alto: 1920 });
  });

  test("sin cabecera válida devuelve null en lugar de fallar", () => {
    expect(dimensionesVideo(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(dimensionesVideo(caja("ftyp", new Uint8Array(4)))).toBeNull();
    expect(dimensionesVideo(mp4(tkhd(0, 0)))).toBeNull();
  });
});
