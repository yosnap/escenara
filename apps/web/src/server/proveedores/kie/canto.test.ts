import { describe, expect, test } from "bun:test";
import { esRetratoVertical, segundosFacturados } from "@/lib/canto";
import type { ModeloVista } from "@/lib/catalogo";
import { ErrorCatalogo } from "../contrato";
import { adaptadorKie } from "./adaptador";
import { familiaDeCantoDe, parametrosDeCanto, tarifasDeCanto, unidadDeCanto } from "./canto";
import { traducirTarifas } from "./correspondencia";
import { entradaDeModelo } from "./entradas";
import { respuestaDe, TAREA_CREADA, TAREA_LISTA_VIDEO } from "./grabaciones";
import { buscadorDePrecios, REGISTROS_DE_PRECIO } from "./grabaciones-precios";
import { descargarTarifas } from "./precios-publicos";
import { modelosPublicadosDeKie } from "./publicados";

/** Respuestas grabadas: estos tests no consultan ni cobran a KIE. */
const tarifas = traducirTarifas(await descargarTarifas(buscadorDePrecios(REGISTROS_DE_PRECIO).buscar));
const retrato = "https://tempfile.redpandaai.co/retrato.png";
const audio = "https://tempfile.redpandaai.co/cancion.mp3";

function modelo(
  id: "infinitalk/from-audio" | "kling/v1-avatar-standard",
  segundos: number,
  resolucion: string,
): ModeloVista {
  const familia = familiaDeCantoDe(id);
  if (!familia) throw new Error("Falta la familia de canto");
  return {
    id,
    proveedor: "kie",
    nombreProveedor: "KIE.ai",
    nombre: familia.nombre,
    modelo: id,
    capacidades: ["audio_to_video"],
    estado: "precio_publicado",
    conVoz: true,
    parametros: parametrosDeCanto(familia),
    notas: "",
    evidencia: "",
    version: 1,
    predeterminado: false,
    precio: null,
    tarifas: [],
    unidad: unidadDeCanto(segundos, resolucion),
    actualizado: "2026-09-29T00:00:00.000Z",
  };
}

describe("tarifas publicadas del canto", () => {
  test("traduce la grabación y cobra cada segundo a su resolución", () => {
    const infinitalk = tarifas.filter((t) => t.modelo === "infinitalk/from-audio");
    expect(infinitalk.map((t) => t.creditos).sort((a, b) => a - b)).toEqual([3, 12]);
    const familia = familiaDeCantoDe("infinitalk/from-audio");
    if (!familia) throw new Error("Falta InfiniteTalk");
    const unidades = tarifasDeCanto(familia, infinitalk);
    expect(unidades).toHaveLength(30);
    for (const segundos of [1, 7, 15]) {
      expect(unidades.find((t) => t.unidad === unidadDeCanto(segundos, "480p"))?.creditos).toBe(3 * segundos);
      expect(unidades.find((t) => t.unidad === unidadDeCanto(segundos, "720p"))?.creditos).toBe(12 * segundos);
    }
    expect(unidades.some((t) => t.unidad === unidadDeCanto(16, "480p"))).toBeFalse();
  });

  test("Kling Standard cobra 8 créditos/s solo a 720p", () => {
    const familia = familiaDeCantoDe("kling/v1-avatar-standard");
    if (!familia) throw new Error("Falta Kling Standard");
    const unidades = tarifasDeCanto(
      familia,
      tarifas.filter((t) => t.modelo === "kling/v1-avatar-standard"),
    );
    expect(unidades).toHaveLength(15);
    expect(unidades.find((t) => t.unidad === unidadDeCanto(10, "720p"))?.creditos).toBe(80);
    expect(unidades.some((t) => t.unidad.includes("1080p"))).toBeFalse();
  });

  test("sin tarifa por segundo no inventa un precio", () => {
    const familia = familiaDeCantoDe("infinitalk/from-audio");
    if (!familia) throw new Error("Falta InfiniteTalk");
    const ajenas = tarifas
      .filter((t) => t.modelo === "infinitalk/from-audio")
      .map((t) => ({ ...t, unidadPublicada: "per video" }));
    expect(tarifasDeCanto(familia, ajenas)).toHaveLength(0);
  });

  test("el importador deja ambos modelos elegibles con capacidad exclusiva", async () => {
    const publicados = await modelosPublicadosDeKie(buscadorDePrecios().buscar);
    for (const id of ["infinitalk/from-audio", "kling/v1-avatar-standard"]) {
      const fila = publicados.find((m) => m.modelo === id);
      expect(fila?.montable).toBeTrue();
      expect(fila?.capacidades).toEqual(["audio_to_video"]);
    }
    expect(publicados.find((m) => m.modelo === "kling/ai-avatar-v1-pro")?.montable).toBeFalse();
  });
});

describe("entrada de los modelos de canto", () => {
  const contexto = {
    escena: "En una azotea al amanecer.",
    dialogo: "",
    urls: [retrato],
    audiosDeReferencia: [audio],
    segundos: 8,
  };

  test("InfiniteTalk recibe imagen, audio, prompt y resolución confirmada", () => {
    const entrada = entradaDeModelo(modelo("infinitalk/from-audio", 8, "480p"), contexto);
    expect(entrada).toMatchObject({ image_url: retrato, audio_url: audio, resolution: "480p" });
    expect(entrada.prompt).toContain("azotea");
    expect(entrada).not.toHaveProperty("aspect_ratio");
    expect(entrada).not.toHaveProperty("duration");
  });

  test("Kling recibe solo los tres campos que documenta", () => {
    const entrada = entradaDeModelo(modelo("kling/v1-avatar-standard", 8, "720p"), contexto);
    expect(Object.keys(entrada).sort()).toEqual(["audio_url", "image_url", "prompt"]);
  });

  test("sin imagen o audio rechaza antes de pedir al proveedor", () => {
    expect(() => entradaDeModelo(modelo("infinitalk/from-audio", 8, "480p"), { ...contexto, urls: [] })).toThrow(
      ErrorCatalogo,
    );
    expect(() =>
      entradaDeModelo(modelo("infinitalk/from-audio", 8, "480p"), { ...contexto, audiosDeReferencia: [] }),
    ).toThrow(ErrorCatalogo);
  });

  test("el guion hablado no se añade al prompt", () => {
    const entrada = entradaDeModelo(modelo("infinitalk/from-audio", 8, "480p"), {
      ...contexto,
      dialogo: "frase secreta",
    });
    expect(JSON.stringify(entrada)).not.toContain("frase secreta");
  });

  test("la petición y el resultado siguen las respuestas grabadas de KIE", async () => {
    const cuerpos: Record<string, unknown>[] = [];
    const buscar = async (_url: string, opciones: RequestInit): Promise<Response> => {
      if (opciones.method === "POST") {
        cuerpos.push(JSON.parse(String(opciones.body)) as Record<string, unknown>);
        return respuestaDe(TAREA_CREADA);
      }
      return respuestaDe(TAREA_LISTA_VIDEO);
    };
    const entrada = adaptadorKie.montarEntrada(modelo("infinitalk/from-audio", 8, "480p"), contexto);
    const taskId = await adaptadorKie.generarVideo({
      clave: "clave-inventada",
      modelo: "infinitalk/from-audio",
      entrada,
      buscar,
    });
    expect(cuerpos[0]).toMatchObject({
      model: "infinitalk/from-audio",
      input: { image_url: retrato, audio_url: audio, resolution: "480p" },
    });
    const tarea = await adaptadorKie.consultar({ clave: "clave-inventada", taskId, buscar });
    expect(tarea.estadoPropio).toBe("listo");
    expect(tarea.urls[0]).toContain("clip.mp4");
  });
});

test("redondeo del segundo y proporción vertical", () => {
  expect(segundosFacturados(7.3)).toBe(8);
  expect(segundosFacturados(8)).toBe(8);
  expect(esRetratoVertical(1080, 1920)).toBeTrue();
  expect(esRetratoVertical(1920, 1080)).toBeFalse();
});
