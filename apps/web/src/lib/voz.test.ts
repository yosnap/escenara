import { describe, expect, test } from "bun:test";
import {
  avisosDeSubtitulos,
  CARACTERES_POR_LINEA,
  componerSubtitulos,
  creditosDeVoz,
  dividirEnLineas,
  erroresDeSubtitulos,
  esModoVoz,
  firmaDeVoz,
  LIMITES_PARAMETROS_VOZ,
  normalizarTextoDeSubtitulo,
  PARAMETROS_VOZ_POR_DEFECTO,
  parametrosVozDe,
  SEGUNDOS_MINIMOS_SUBTITULO,
  type Subtitulo,
  subtitulosDesdeTexto,
  subtitulosDesdeTranscripcion,
  type VozDelProyecto,
} from "./voz";

/**
 * Reglas de voz y subtítulos que no dependen de la base de datos (RF08, 0.21.0): la firma que decide qué queda
 * invalidado, la lectura de los parámetros de la voz y la composición de los ficheros de subtítulos.
 */

const voz = (cambios: Partial<VozDelProyecto> = {}): VozDelProyecto => ({
  proveedor: "kie",
  modelo: "elevenlabs/text-to-speech-multilingual-v2",
  voz: "Rachel",
  parametros: PARAMETROS_VOZ_POR_DEFECTO,
  fijadaEn: "2026-09-28T00:00:00.000Z",
  ...cambios,
});

describe("modo de voz", () => {
  test("solo hay dos modos y cualquier otra cosa se rechaza", () => {
    expect(esModoVoz("clip")).toBe(true);
    expect(esModoVoz("pista")).toBe(true);
    expect(esModoVoz("mixto")).toBe(false);
    expect(esModoVoz(null)).toBe(false);
  });
});

describe("firma de la voz", () => {
  test("en modo clip la firma no depende de la voz: la pone el modelo de vídeo", () => {
    expect(firmaDeVoz("clip", voz(), "Hola")).toBe(firmaDeVoz("clip", voz({ voz: "Adam" }), "Hola"));
  });

  test("cambiar de modo cambia la firma, así que lo generado deja de corresponder", () => {
    expect(firmaDeVoz("clip", voz(), "Hola")).not.toBe(firmaDeVoz("pista", voz(), "Hola"));
  });

  test("cambiar la voz o cualquiera de sus parámetros cambia la firma", () => {
    const base = firmaDeVoz("pista", voz(), "Hola");
    expect(firmaDeVoz("pista", voz({ voz: "Adam" }), "Hola")).not.toBe(base);
    expect(
      firmaDeVoz("pista", voz({ parametros: { ...PARAMETROS_VOZ_POR_DEFECTO, estabilidad: 0.9 } }), "Hola"),
    ).not.toBe(base);
    expect(
      firmaDeVoz("pista", voz({ parametros: { ...PARAMETROS_VOZ_POR_DEFECTO, velocidad: 1.1 } }), "Hola"),
    ).not.toBe(base);
  });

  test("cambiar el diálogo cambia la firma: el audio decía otra cosa", () => {
    expect(firmaDeVoz("pista", voz(), "Hola")).not.toBe(firmaDeVoz("pista", voz(), "Adiós"));
  });

  test("los espacios de alrededor del diálogo no cuentan: no cambian lo que se oye", () => {
    expect(firmaDeVoz("pista", voz(), "  Hola  ")).toBe(firmaDeVoz("pista", voz(), "Hola"));
  });
});

describe("parámetros de la voz", () => {
  test("lo ilegible se sustituye por el valor por defecto, no por cualquier cosa", () => {
    expect(parametrosVozDe(null)).toEqual(PARAMETROS_VOZ_POR_DEFECTO);
    expect(parametrosVozDe({ estabilidad: "mucha" })).toEqual(PARAMETROS_VOZ_POR_DEFECTO);
  });

  test("un valor fuera de la horquilla documentada no se acepta", () => {
    const { max } = LIMITES_PARAMETROS_VOZ.velocidad;
    expect(parametrosVozDe({ velocidad: max + 1 }).velocidad).toBe(PARAMETROS_VOZ_POR_DEFECTO.velocidad);
    expect(parametrosVozDe({ velocidad: max }).velocidad).toBe(max);
  });

  test("los valores buenos se redondean a dos decimales: son mandos, no medidas", () => {
    expect(parametrosVozDe({ estabilidad: 0.123456 }).estabilidad).toBe(0.12);
  });
});

describe("subtítulos", () => {
  test("los tiempos imposibles se rechazan con el número del subtítulo", () => {
    const errores = erroresDeSubtitulos([
      { desde: 2, hasta: 1, texto: "Al revés" },
      { desde: 3, hasta: 4, texto: "   " },
    ]);
    expect(errores.some((e) => e.includes("1") && e.includes("acaba antes"))).toBe(true);
    expect(errores.some((e) => e.includes("2") && e.includes("vacío"))).toBe(true);
  });

  test("un solapamiento con el anterior se rechaza", () => {
    const errores = erroresDeSubtitulos([
      { desde: 0, hasta: 2, texto: "Uno" },
      { desde: 1, hasta: 3, texto: "Dos" },
    ]);
    expect(errores.some((e) => e.includes("empieza antes"))).toBe(true);
  });

  test("los avisos de legibilidad avisan pero no son errores", () => {
    const corto: Subtitulo[] = [{ desde: 0, hasta: SEGUNDOS_MINIMOS_SUBTITULO / 2, texto: "Rápido" }];
    expect(erroresDeSubtitulos(corto)).toEqual([]);
    expect(avisosDeSubtitulos(corto)).toHaveLength(1);
  });

  test("dividir en líneas no parte palabras y respeta el máximo", () => {
    const texto = "palabra ".repeat(20).trim();
    for (const linea of dividirEnLineas(texto).split("\n")) {
      expect(linea.length).toBeLessThanOrEqual(CARACTERES_POR_LINEA);
      expect(linea.startsWith(" ")).toBe(false);
    }
  });

  test("la propuesta desde el texto reparte el tiempo y acaba justo en la duración", () => {
    const propuestos = subtitulosDesdeTexto("Primera frase. Segunda frase mucho más larga que la primera.", 8);
    expect(propuestos).toHaveLength(2);
    expect(propuestos[0]?.desde).toBe(0);
    expect(propuestos.at(-1)?.hasta).toBe(8);
    // La frase larga ocupa más tiempo que la corta: el reparto es por caracteres, no a partes iguales.
    const [uno, dos] = propuestos;
    if (!uno || !dos) throw new Error("Faltan subtítulos propuestos.");
    expect(dos.hasta - dos.desde).toBeGreaterThan(uno.hasta - uno.desde);
  });

  test("sin duración medida no se propone nada en lugar de inventar tiempos", () => {
    expect(subtitulosDesdeTexto("Una frase.", 0)).toEqual([]);
  });

  test("de la transcripción se descartan los segmentos vacíos o con tiempos imposibles", () => {
    expect(
      subtitulosDesdeTranscripcion([
        { desde: 0, hasta: 1, texto: "Vale" },
        { desde: 2, hasta: 2, texto: "Sin duración" },
        { desde: 3, hasta: 4, texto: "  " },
      ]),
    ).toEqual([{ desde: 0, hasta: 1, texto: "Vale" }]);
  });
});

describe("normalizar el texto de un subtítulo", () => {
  test("la secuencia de los tiempos dentro del texto no abre un bloque nuevo", () => {
    const sucio = "Dijo 00:00:01,000 --> 00:00:02,000 y se fue";
    expect(normalizarTextoDeSubtitulo(sucio)).not.toContain("-->");
    expect(componerSubtitulos([{ orden: 1, segundos: 4, subtitulos: [{ desde: 0, hasta: 1, texto: sucio }] }], "srt"))
      // Un solo bloque: el único "-->" del fichero es el de los tiempos de verdad.
      .toMatch(/^1\n00:00:00,000 --> 00:00:01,000\n[^\n]+\n$/);
  });

  test("una línea en blanco dentro del texto no parte el fichero", () => {
    expect(normalizarTextoDeSubtitulo("Primera\n\n\nSegunda")).toBe("Primera\nSegunda");
  });

  test("los saltos de Windows se colapsan y los espacios de los extremos se quitan", () => {
    expect(normalizarTextoDeSubtitulo("  Hola \r\n  mundo  ")).toBe("Hola\nmundo");
  });

  test("un bloque que queda vacío tras normalizar no se emite y no descoloca la numeración", () => {
    const srt = componerSubtitulos(
      [
        {
          orden: 1,
          segundos: 4,
          subtitulos: [
            { desde: 0, hasta: 1, texto: "   \r\n  " },
            { desde: 1, hasta: 2, texto: "Lo único que se lee" },
          ],
        },
      ],
      "srt",
    );
    expect(srt).toBe("1\n00:00:01,000 --> 00:00:02,000\nLo único que se lee\n");
  });
});

describe("ficheros de subtítulos", () => {
  const escenas = [
    { orden: 2, segundos: 4, subtitulos: [{ desde: 0, hasta: 1.5, texto: "Segunda escena" }] },
    { orden: 1, segundos: 4, subtitulos: [{ desde: 0.5, hasta: 2, texto: "Primera\nescena" }] },
  ];

  test("el SRT numera los bloques y corre los tiempos escena a escena", () => {
    const srt = componerSubtitulos(escenas, "srt");
    expect(srt).toContain("1\n00:00:00,500 --> 00:00:02,000\nPrimera\nescena");
    // La segunda escena empieza a los 4 s de la primera: 0 s suyos son 4 s del montaje.
    expect(srt).toContain("2\n00:00:04,000 --> 00:00:05,500\nSegunda escena");
  });

  test("el WebVTT lleva su cabecera, punto en los milisegundos y sin numerar", () => {
    const vtt = componerSubtitulos(escenas, "vtt");
    expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
    expect(vtt).toContain("00:00:00.500 --> 00:00:02.000");
    expect(vtt).not.toContain("1\n00:00:00.500");
  });

  test("la división de líneas que decidió quien edita se respeta tal cual", () => {
    expect(componerSubtitulos(escenas, "srt")).toContain("Primera\nescena");
  });
});

describe("coste de la voz por carácter", () => {
  test("escala con la longitud del diálogo sobre el precio medido", () => {
    // 22 créditos medidos sobre 79 caracteres: 3.000 caracteres son unas 38 veces más.
    const monologo = "a".repeat(3000);
    expect(creditosDeVoz("eleven_multilingual_v2", 22, monologo)).toBe(Math.ceil((22 * 3000) / 79));
  });

  test("nunca baja de la tarifa registrada y los modelos por llamada no escalan", () => {
    expect(creditosDeVoz("eleven_multilingual_v2", 22, "Hola.")).toBe(22);
    expect(creditosDeVoz("eleven_multilingual_v2", 22, "")).toBe(22);
    expect(creditosDeVoz("modelo-por-llamada", 10, "a".repeat(3000))).toBe(10);
  });
});
