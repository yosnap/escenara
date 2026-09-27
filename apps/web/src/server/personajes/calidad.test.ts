import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import {
  calcularCobertura,
  DISTANCIA_DUPLICADO,
  distanciaHuella,
  esCasiIgual,
  evaluarCalidad,
  midaCara,
  type UmbralesCalidad,
  vistasMinimas,
} from "@/lib/captura-personaje";
import { analizarImagen } from "./calidad";

/**
 * Control de calidad de las referencias y cobertura de vistas, sin base de datos: son funciones puras y
 * medidas sobre imágenes generadas aquí mismo, así que se pueden leer de una vez y sin ruido.
 *
 * Lo que fija esta prueba es la regla que decide si una foto vale como referencia: **el umbral no es una
 * opinión**, es un número medible, y una imagen plana, movida u oscura tiene que caer siempre del mismo lado.
 */

const UMBRALES: UmbralesCalidad = {
  ladoMinimo: 512,
  nitidezMinima: 8,
  luminosidadMinima: 45,
  luminosidadMaxima: 225,
  caraMinima: 12,
};

/** Imagen con ruido gaussiano: el equivalente medible de una foto enfocada y bien expuesta. */
const conRuido = async (lado = 640, media = 128, desviacion = 40) =>
  new Uint8Array(
    await sharp({
      create: {
        width: lado,
        height: lado,
        channels: 3,
        background: "#808080",
        noise: { type: "gaussian", mean: media, sigma: desviacion },
      },
    })
      .png()
      .toBuffer(),
  );

/**
 * Imagen **con relieve**: un mosaico de bloques con brillos distintos, deterministas a partir de la semilla.
 * Es lo que hace falta para probar la huella perceptual: el ruido puro no tiene estructura y al reescalarlo
 * cada píxel promedia otra cosa, igual que le pasaría a una pared de grano de televisión. Una foto de verdad
 * sí tiene formas, y es su reparto de claros y oscuros lo que la huella sigue.
 */
async function conRelieve(semilla: number, lado = 640, brillo = 1): Promise<Uint8Array> {
  const bloques = 8;
  const paso = Math.floor(lado / bloques);
  const pixeles = new Uint8Array(lado * lado * 3);
  let estado = semilla * 2654435761 + 1;
  const valores = Array.from({ length: bloques * bloques }, () => {
    estado = (estado * 1103515245 + 12345) % 2147483648;
    return 40 + (estado % 180);
  });
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const bloque =
        Math.min(bloques - 1, Math.floor(y / paso)) * bloques + Math.min(bloques - 1, Math.floor(x / paso));
      const valor = Math.max(0, Math.min(255, Math.round((valores[bloque] as number) * brillo)));
      const p = (y * lado + x) * 3;
      pixeles[p] = valor;
      pixeles[p + 1] = valor;
      pixeles[p + 2] = valor;
    }
  }
  return new Uint8Array(
    await sharp(pixeles, { raw: { width: lado, height: lado, channels: 3 } })
      .png()
      .toBuffer(),
  );
}

const plana = async (lado: number, color: string) =>
  new Uint8Array(
    await sharp({ create: { width: lado, height: lado, channels: 3, background: color } })
      .png()
      .toBuffer(),
  );

describe("medidas de calidad de una referencia", () => {
  test("una foto enfocada y bien expuesta pasa el control", async () => {
    const { metricas, huella } = await analizarImagen(await conRuido());
    expect(metricas.ancho).toBe(640);
    expect(metricas.nitidez).toBeGreaterThan(UMBRALES.nitidezMinima);
    expect(metricas.luminosidad).toBeGreaterThan(UMBRALES.luminosidadMinima);
    expect(huella).toHaveLength(16);
    expect(evaluarCalidad(metricas, UMBRALES).aceptada).toBe(true);
  });

  test("una foto pequeña es un mínimo técnico: no se puede usar «de todas formas»", async () => {
    const { metricas } = await analizarImagen(await conRuido(200));
    const veredicto = evaluarCalidad(metricas, UMBRALES);
    expect(veredicto.motivos).toContain("resolucion");
    expect(veredicto.bloqueante).toBe(true);
  });

  test("una foto movida se detecta por la varianza del laplaciano, y eso sí se puede saltar", async () => {
    const borrosa = new Uint8Array(
      await sharp(await conRuido())
        .blur(8)
        .png()
        .toBuffer(),
    );
    const { metricas } = await analizarImagen(borrosa);
    const veredicto = evaluarCalidad(metricas, UMBRALES);
    expect(metricas.nitidez).toBeLessThan(UMBRALES.nitidezMinima);
    expect(veredicto.motivos).toEqual(["nitidez"]);
    expect(veredicto.bloqueante).toBe(false);
  });

  test("la luz se mide por los dos lados: demasiado oscura y demasiado quemada", async () => {
    const oscura = await analizarImagen(await conRuido(640, 12, 6));
    const quemada = await analizarImagen(await conRuido(640, 248, 4));
    expect(evaluarCalidad(oscura.metricas, UMBRALES).motivos).toContain("oscuridad");
    expect(evaluarCalidad(quemada.metricas, UMBRALES).motivos).toContain("quemada");
  });

  test("una cara pequeña avisa solo si el navegador la ha medido", async () => {
    const { metricas } = await analizarImagen(await conRuido());
    expect(evaluarCalidad({ ...metricas, caraRelativa: null }, UMBRALES).aceptada).toBe(true);
    expect(evaluarCalidad({ ...metricas, caraRelativa: 0.05 }, UMBRALES).motivos).toEqual(["cara_pequena"]);
    expect(evaluarCalidad({ ...metricas, caraRelativa: 0.4 }, UMBRALES).aceptada).toBe(true);
    // Con el umbral a 0 la comprobación se desactiva, aunque el navegador la haya medido.
    expect(evaluarCalidad({ ...metricas, caraRelativa: 0.01 }, { ...UMBRALES, caraMinima: 0 }).aceptada).toBe(true);
  });

  test("una imagen que sharp no sabe leer no revienta: devuelve ceros y sin huella", async () => {
    const { metricas, huella } = await analizarImagen(new Uint8Array([1, 2, 3, 4]));
    expect(metricas).toEqual({ ancho: 0, alto: 0, nitidez: 0, luminosidad: 0, caraRelativa: null });
    expect(huella).toBeNull();
  });
});

describe("huella perceptual", () => {
  test("la misma foto recomprimida y reescalada da la misma huella", async () => {
    const original = await conRelieve(7, 960);
    const guardada = new Uint8Array(await sharp(original).resize({ width: 640 }).webp({ quality: 85 }).toBuffer());
    const a = (await analizarImagen(original)).huella as string;
    const b = (await analizarImagen(guardada)).huella as string;
    // No tiene que ser idéntica bit a bit: tiene que caer dentro de la distancia de duplicado.
    expect(distanciaHuella(a, b)).toBeLessThanOrEqual(DISTANCIA_DUPLICADO);
    expect(esCasiIgual(a, b)).toBe(true);
  });

  test("la misma foto un poco más clara sigue siendo la misma foto", async () => {
    const a = (await analizarImagen(await conRelieve(11))).huella as string;
    const b = (await analizarImagen(await conRelieve(11, 640, 1.12))).huella as string;
    expect(esCasiIgual(a, b)).toBe(true);
  });

  test("dos fotos distintas no se confunden", async () => {
    const a = (await analizarImagen(await conRelieve(1))).huella as string;
    const b = (await analizarImagen(await conRelieve(2))).huella as string;
    expect(esCasiIgual(a, b)).toBe(false);
  });

  test("una huella con otro largo o con basura no se compara a la ligera", () => {
    expect(distanciaHuella("abc", "abc")).toBeNull();
    expect(distanciaHuella("zzzzzzzzzzzzzzzz", "0000000000000000")).toBeNull();
    expect(esCasiIgual("", "")).toBe(false);
  });

  test("una imagen plana no tiene relieve: su huella es la misma que otra plana", async () => {
    const a = (await analizarImagen(await plana(640, "#3d6bff"))).huella as string;
    const b = (await analizarImagen(await plana(640, "#ff5a5f"))).huella as string;
    expect(a).toBe("0000000000000000");
    expect(esCasiIgual(a, b)).toBe(true);
  });
});

describe("cobertura de vistas", () => {
  test("las vistas mínimas son las de la decisión 1 de la fase", () => {
    expect(vistasMinimas("persona")).toEqual([
      "frontal",
      "perfil_izquierdo",
      "perfil_derecho",
      "tres_cuartos",
      "cuerpo_completo",
    ]);
    expect(vistasMinimas("animal")).toEqual(["frontal", "perfil", "cuerpo_completo"]);
  });

  test("dice exactamente qué vista falta", () => {
    const cobertura = calcularCobertura("persona", [
      { vistaClave: "frontal", origen: "foto_original" },
      { vistaClave: "perfil_izquierdo", origen: "foto_original" },
      { vistaClave: null, origen: "foto_original" },
    ]);
    expect(cobertura.faltan).toEqual(["perfil_derecho", "tres_cuartos", "cuerpo_completo"]);
    expect(cobertura.sinClasificar).toBe(1);
  });

  test("una vista generada no cubre la vista: la sigue contando como que falta", () => {
    const cobertura = calcularCobertura("animal", [
      { vistaClave: "frontal", origen: "vista_generada" },
      { vistaClave: "perfil", origen: "foto_original" },
      { vistaClave: "cuerpo_completo", origen: "foto_original" },
    ]);
    expect(cobertura.faltan).toEqual(["frontal"]);
    const frontal = cobertura.vistas.find((v) => v.vista === "frontal");
    expect(frontal?.originales).toBe(0);
    expect(frontal?.generadas).toBe(1);
  });

  test("el tamaño de la cara solo se mide donde significa algo", () => {
    expect(midaCara("frontal", "persona")).toBe(true);
    expect(midaCara("tres_cuartos", "persona")).toBe(true);
    // En un cuerpo entero la cara **es** pequeña, y en un animal no hay cara humana que detectar: medirlo
    // daría un aviso falso siempre.
    expect(midaCara("cuerpo_completo", "persona")).toBe(false);
    expect(midaCara("frontal", "animal")).toBe(false);
  });

  test("las vistas de una persona no valen para un animal ni al revés", () => {
    const deAnimal = calcularCobertura("animal", [{ vistaClave: "perfil_izquierdo", origen: "foto_original" }]);
    expect(deAnimal.faltan).toEqual(["frontal", "perfil", "cuerpo_completo"]);
    const dePersona = calcularCobertura("persona", [{ vistaClave: "perfil", origen: "foto_original" }]);
    expect(dePersona.faltan).toHaveLength(5);
  });
});
