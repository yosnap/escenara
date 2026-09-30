import { describe, expect, test } from "bun:test";
import {
  avisoDeRecorte,
  ENCUADRE_CENTRADO,
  encuadreAutomatico,
  encuadreDe,
  encuadreValido,
  FORMATOS_MONTAJE,
  formatoDeProporcion,
  formatosDe,
  formatosGenerables,
  formatosValidos,
  mismoEncuadre,
  motivoFormatoNoGenerable,
  PLATAFORMA_DE_FORMATO,
  PROPORCION_DE_FORMATO,
  planoConservado,
  RESOLUCION_MONTAJE,
  ZONA_SEGURA_DE_FORMATO,
} from "./formatos";
import { ZONA_SEGURA } from "./voz";

describe("los formatos de salida", () => {
  test("cada formato tiene su proporción, su resolución de lado corto 1080 y su nombre de plataforma", () => {
    for (const formato of FORMATOS_MONTAJE) {
      const { ancho, alto } = RESOLUCION_MONTAJE[formato];
      const [pa, pb] = PROPORCION_DE_FORMATO[formato].split(":").map(Number) as [number, number];
      expect(Math.min(ancho, alto)).toBe(1080);
      expect(ancho / alto).toBeCloseTo(pa / pb, 3);
      expect(PLATAFORMA_DE_FORMATO[formato]).toContain(`(${PROPORCION_DE_FORMATO[formato]})`);
      expect(formatoDeProporcion(PROPORCION_DE_FORMATO[formato])).toBe(formato);
    }
    expect(formatoDeProporcion("3:4")).toBeNull();
  });

  test("el vertical conserva la zona segura de siempre: sus subtítulos y su etiqueta no se mueven", () => {
    expect(ZONA_SEGURA_DE_FORMATO.vertical_9_16).toEqual({ ...ZONA_SEGURA });
  });

  test("los nombres del selector son los que pidió el propietario", () => {
    expect(Object.values(PLATAFORMA_DE_FORMATO)).toEqual([
      "Reels · TikTok · Stories (9:16)",
      "Instagram feed y carrusel (4:5)",
      "Cuadrado (1:1)",
      "YouTube · horizontal (16:9)",
    ]);
  });
});

describe("los formatos de un proyecto", () => {
  test("una lista válida no tiene repetidos ni desconocidos, y el primero es el principal", () => {
    expect(formatosValidos(["horizontal_16_9", "vertical_9_16"])).toEqual(["horizontal_16_9", "vertical_9_16"]);
    expect(formatosValidos([])).toBeNull();
    expect(formatosValidos(["vertical_9_16", "vertical_9_16"])).toBeNull();
    expect(formatosValidos(["panoramico"])).toBeNull();
    expect(formatosValidos("vertical_9_16")).toBeNull();
  });

  test("lo ilegible de la base de datos se lee como el vertical de siempre", () => {
    expect(formatosDe(null)).toEqual(["vertical_9_16"]);
    expect(formatosDe(["cuadrado_1_1"])).toEqual(["cuadrado_1_1"]);
  });
});

describe("el encuadre", () => {
  test("el automático del vertical es el de siempre (bandas); el de los demás, recorte centrado", () => {
    expect(encuadreAutomatico("vertical_9_16")).toEqual({ modo: "bandas" });
    for (const formato of ["vertical_4_5", "cuadrado_1_1", "horizontal_16_9"] as const) {
      expect(encuadreAutomatico(formato)).toEqual(ENCUADRE_CENTRADO);
    }
  });

  test("se usa el guardado de esa escena en ese formato y, si no hay, el automático", () => {
    const encuadres = { horizontal_16_9: { e1: { modo: "recorte" as const, x: 10, y: 0 } } };
    expect(encuadreDe(encuadres, "horizontal_16_9", "e1")).toEqual({ modo: "recorte", x: 10, y: 0 });
    expect(encuadreDe(encuadres, "horizontal_16_9", "e2")).toEqual(ENCUADRE_CENTRADO);
    expect(encuadreDe(encuadres, "vertical_9_16", "e1")).toEqual({ modo: "bandas" });
  });

  test("solo se acepta un encuadre bien formado, con posiciones enteras de 0 a 100", () => {
    expect(encuadreValido({ modo: "bandas", x: 3 })).toEqual({ modo: "bandas" });
    expect(encuadreValido({ modo: "recorte", x: 0, y: 100 })).toEqual({ modo: "recorte", x: 0, y: 100 });
    for (const malo of [null, "centrado", { modo: "recorte", x: 101, y: 0 }, { modo: "recorte", x: 5.5, y: 0 }]) {
      expect(encuadreValido(malo)).toBeNull();
    }
    expect(mismoEncuadre({ modo: "recorte", x: 50, y: 50 }, ENCUADRE_CENTRADO)).toBe(true);
    expect(mismoEncuadre({ modo: "bandas" }, ENCUADRE_CENTRADO)).toBe(false);
  });

  test("un vertical llevado a 16:9 conserva un tercio del plano, y se avisa; a 4:5, casi todo y no", () => {
    expect(planoConservado(720, 1280, "horizontal_16_9")).toBeCloseTo(0.316, 2);
    expect(planoConservado(720, 1280, "vertical_4_5")).toBeCloseTo(0.703, 2);
    const medidas = { ancho: 720, alto: 1280 };
    expect(avisoDeRecorte(ENCUADRE_CENTRADO, medidas, "horizontal_16_9")).toContain("deja fuera el 68 % del plano");
    expect(avisoDeRecorte(ENCUADRE_CENTRADO, medidas, "vertical_4_5")).toBeNull();
    // Con bandas no se pierde nada del plano, y sin medidas no se inventa un aviso.
    expect(avisoDeRecorte({ modo: "bandas" }, medidas, "horizontal_16_9")).toBeNull();
    expect(avisoDeRecorte(ENCUADRE_CENTRADO, { ancho: null, alto: null }, "horizontal_16_9")).toBeNull();
  });
});

describe("en qué formato se puede generar con los modelos elegidos", () => {
  const veo = { nombre: "Veo 3 Lite", proporciones: ["9:16", "16:9"] };
  const banana = { nombre: "Nano Banana 2 Lite", proporciones: ["9:16"] };
  const hailuo = { nombre: "Hailuo 2.3", proporciones: [] };

  test("un modelo que no declara la proporción no la admite, y se dice cuál y qué admite", () => {
    expect(motivoFormatoNoGenerable("horizontal_16_9", [veo])).toBeNull();
    expect(motivoFormatoNoGenerable("horizontal_16_9", [veo, banana])).toContain("Nano Banana 2 Lite solo admite 9:16");
    expect(motivoFormatoNoGenerable("cuadrado_1_1", [hailuo])).toContain("Hailuo 2.3 no admite elegir proporción");
    expect(motivoFormatoNoGenerable("vertical_4_5", [veo])).toContain("no se puede generar en 4:5");
  });

  test("el vertical no se comprueba: es lo que se ha generado siempre", () => {
    expect(motivoFormatoNoGenerable("vertical_9_16", [hailuo])).toBeNull();
    expect(formatosGenerables([banana]).vertical_9_16).toBeNull();
    expect(formatosGenerables([banana]).horizontal_16_9).not.toBeNull();
  });
});
