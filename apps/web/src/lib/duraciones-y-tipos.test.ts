import { describe, expect, test } from "bun:test";
import { duracionesConCoste, type ModeloVista, recortarModelo, segundosDeUnidad, unidadParaDuracion } from "./catalogo";

/**
 * Duración y tipo de imagen (0.23.4). Lo que se prueba aquí es la regla de dinero de las dos cosas: **una
 * duración solo se ofrece si se sabe cobrar**, y la unidad de la tarifa es la que dice cuántos segundos se van
 * a pedir. Sin esto, la pantalla podía ofrecer un clip de 8 s con el precio de uno de 4.
 */

const MODELO: ModeloVista = {
  id: "fila",
  proveedor: "kie",
  nombreProveedor: "KIE.ai",
  modelo: "google/gemini-omni-flash-1-1",
  nombre: "Gemini Omni 1.1 Flash",
  capacidades: ["image_to_video", "text_to_video"],
  estado: "compatible",
  conVoz: true,
  unidad: "clip de 4 s a 720p",
  parametros: {
    duraciones: [4, 6, 8, 10],
    proporciones: ["9:16"],
    resoluciones: ["720p"],
    formatosReferencia: ["image/jpeg"],
    maximoReferencias: 7,
  },
  notas: "",
  evidencia: "",
  version: 1,
  predeterminado: true,
  precio: {
    unidad: "clip de 4 s a 720p",
    creditos: 63,
    fuente: "Medido con dinero real el 2026-09-28",
    publicado: false,
    comprobado: "2026-09-28",
    sello: "kie:google/gemini-omni-flash-1-1:clip de 4 s a 720p@v1",
    caducado: false,
  },
  tarifas: [
    {
      unidad: "clip de 4 s a 720p",
      creditos: 63,
      enUso: true,
      comprobado: "2026-09-28",
      publicado: false,
      fuente: "Medido con dinero real",
      sello: "kie:google/gemini-omni-flash-1-1:clip de 4 s a 720p@v1",
    },
    {
      unidad: "clip de 8 s a 720p",
      creditos: 105,
      enUso: false,
      comprobado: "2026-09-28",
      publicado: true,
      fuente: "Tarifa publicada por kie",
      sello: "kie:google/gemini-omni-flash-1-1:clip de 8 s a 720p@v1",
    },
  ],
  actualizado: "2026-09-28T00:00:00.000Z",
};

describe("la duración es una tarifa más", () => {
  test("la unidad dice cuántos segundos se cobran, y lo que no los nombra no depende de la duración", () => {
    expect(segundosDeUnidad("clip de 8 s a 720p")).toBe(8);
    expect(segundosDeUnidad("vídeo de 6 s")).toBe(6);
    expect(segundosDeUnidad("imagen a 2K")).toBeNull();
    // «4 u 8 s» no nombra una duración concreta: ese modelo cuesta lo mismo dure lo que dure.
    expect(segundosDeUnidad("vídeo de 4 u 8 s")).toBeNull();
  });

  test("solo se ofrecen las duraciones con tarifa registrada, con el precio de cada una", () => {
    expect(duracionesConCoste(MODELO)).toEqual([
      { segundos: 4, creditos: 63, unidad: "clip de 4 s a 720p", publicado: false },
      { segundos: 8, creditos: 105, unidad: "clip de 8 s a 720p", publicado: true },
    ]);
    // 6 y 10 s los admite el modelo, pero todavía no tienen precio: ofrecerlos sería prometer un coste inventado.
    expect(duracionesConCoste(MODELO).map((d) => d.segundos)).not.toContain(6);
    expect(unidadParaDuracion(MODELO, 8)).toBe("clip de 8 s a 720p");
    expect(unidadParaDuracion(MODELO, 6)).toBeNull();
  });

  test("un modelo cuyo precio no depende de la duración las ofrece todas al precio vigente", () => {
    const sinTarifasPorDuracion: ModeloVista = {
      ...MODELO,
      unidad: "vídeo de 4 u 8 s",
      precio: { ...(MODELO.precio as NonNullable<ModeloVista["precio"]>), unidad: "vídeo de 4 u 8 s", creditos: 60 },
      parametros: { ...MODELO.parametros, duraciones: [8, 4] },
      tarifas: [],
    };
    expect(duracionesConCoste(sinTarifasPorDuracion)).toEqual([
      { segundos: 8, creditos: 60, unidad: "vídeo de 4 u 8 s", publicado: false },
      { segundos: 4, creditos: 60, unidad: "vídeo de 4 u 8 s", publicado: false },
    ]);
  });

  test("lo que llega al navegador lleva el coste de cada duración, no solo los segundos", () => {
    const recortado = recortarModelo(MODELO);
    expect(recortado.duraciones).toEqual([4, 8]);
    expect(recortado.duracionesConCoste.map((d) => d.creditos)).toEqual([63, 105]);
  });
});
