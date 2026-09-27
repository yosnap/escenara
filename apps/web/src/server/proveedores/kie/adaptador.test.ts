import { describe, expect, test } from "bun:test";
import type { ModeloVista } from "@/lib/catalogo";
import type { Buscador } from "../codigos";
import { ErrorCatalogo, ErrorProveedor, type MotivoProveedor } from "../contrato";
import { adaptadorKie } from "./adaptador";
import {
  ERROR_CLAVE,
  ERROR_LIMITE,
  ERROR_SERVIDOR,
  ERROR_SIN_CREDITO,
  type Grabacion,
  RESPUESTA_RARA,
  respuestaDe,
  SALDO,
  SUBIDA,
  TAREA_CREADA,
  TAREA_EN_COLA,
  TAREA_FALLIDA,
  TAREA_GENERANDO,
  TAREA_LISTA_IMAGEN,
  TAREA_LISTA_VIDEO,
} from "./grabaciones";

/**
 * Prueba de contrato del adaptador de KIE con **respuestas grabadas** del servicio real: ninguna llamada
 * sale a internet y no se gasta ni un crédito del propietario. Comprueba las dos mitades del contrato de
 * ADR-0015: la entrada que recibe cada modelo (los esquemas que se ejecutaron de verdad) y los errores
 * normalizados.
 *
 * La prueba con el servicio real existe aparte, en `scripts/prueba-real-adaptador.ts`, y solo se ejecuta a
 * mano con una variable de entorno: nunca desde `bun test`.
 */

const CLAVE = "sk-clave-de-kie-inventada-para-el-test";
const URL_REFERENCIA = "https://tempfile.redpandaai.co/escenara/referencias/referencia.png";
const ESCENA = "En una cafetería luminosa, saluda a cámara con una sonrisa.";
const FRASE = "Estamos muy contentos de lanzar esto";

interface Llamada {
  url: string;
  metodo: string;
  cabeceras: Record<string, string>;
  cuerpo: unknown;
}

function simular(...grabaciones: (Grabacion | (() => never))[]) {
  const registro: Llamada[] = [];
  let i = 0;
  const buscar: Buscador = async (url, opciones) => {
    registro.push({
      url,
      metodo: opciones.method ?? "GET",
      cabeceras: { ...((opciones.headers ?? {}) as Record<string, string>) },
      cuerpo: typeof opciones.body === "string" ? JSON.parse(opciones.body) : opciones.body,
    });
    const grabacion = grabaciones[Math.min(i++, grabaciones.length - 1)];
    if (typeof grabacion === "function") grabacion();
    return respuestaDe(grabacion as Grabacion);
  };
  return { buscar, registro };
}

const fallo = (nombre: string) => () => {
  const error = new Error("simulado");
  error.name = nombre;
  throw error;
};

/** Modelo del catálogo con los parámetros que se le comprobaron de verdad. */
function modelo(parcial: Partial<ModeloVista> & Pick<ModeloVista, "modelo">): ModeloVista {
  return {
    id: `fila-${parcial.modelo}`,
    proveedor: "kie",
    nombreProveedor: "KIE.ai",
    nombre: parcial.modelo,
    capacidades: ["image_edit"],
    estado: "compatible",
    conVoz: false,
    unidad: "imagen",
    parametros: {
      duraciones: [],
      proporciones: ["9:16"],
      resoluciones: [],
      formatosReferencia: ["image/jpeg", "image/png", "image/webp"],
      maximoReferencias: 1,
    },
    notas: "",
    evidencia: "",
    version: 1,
    predeterminado: false,
    precio: null,
    actualizado: "2026-09-27T00:00:00.000Z",
    ...parcial,
  };
}

const NANO = modelo({
  modelo: "nano-banana-2-lite",
  parametros: { ...modelo({ modelo: "x" }).parametros, maximoReferencias: 10 },
});
const SEEDREAM = modelo({ modelo: "seedream/4.5-edit" });
const FLARE = modelo({
  modelo: "gpt-image-2-5-flare-image-to-image",
  parametros: { ...modelo({ modelo: "x" }).parametros, resoluciones: ["1K", "2K", "4K"] },
});
const VEO = modelo({
  modelo: "veo3_lite",
  capacidades: ["image_to_video", "text_to_video"],
  conVoz: true,
  unidad: "vídeo de 4 s",
  parametros: {
    duraciones: [4, 6, 8],
    proporciones: ["9:16"],
    resoluciones: ["720p", "1080p"],
    formatosReferencia: ["image/jpeg", "image/png", "image/webp"],
    maximoReferencias: 2,
  },
});
const HAILUO = modelo({
  modelo: "hailuo/2-3-image-to-video-standard",
  capacidades: ["image_to_video"],
  unidad: "vídeo de 6 s",
  parametros: {
    duraciones: [6, 10],
    proporciones: [],
    resoluciones: ["768P", "1080P"],
    formatosReferencia: ["image/jpeg", "image/png", "image/webp"],
    maximoReferencias: 1,
  },
});
const KLING = modelo({
  modelo: "kling/v3-turbo-image-to-video",
  capacidades: ["image_to_video"],
  conVoz: true,
  unidad: "vídeo de 4 s",
  parametros: {
    duraciones: [4],
    proporciones: [],
    resoluciones: ["720p"],
    formatosReferencia: ["image/jpeg", "image/png"],
    maximoReferencias: 1,
  },
});

const contexto = (dialogo = "") => ({ escena: ESCENA, dialogo, urls: [URL_REFERENCIA] });

describe("capacidades del adaptador", () => {
  test("declara lo que KIE sabe hacer hoy en Escenara y nada más", () => {
    expect(adaptadorKie.proveedor).toBe("kie");
    expect(adaptadorKie.capacidades).toEqual(["image_edit", "image_to_video", "text_to_video"]);
    expect(adaptadorKie.admite("image_edit")).toBe(true);
    expect(adaptadorKie.admite("tts")).toBe(false);
  });
});

describe("entrada de cada modelo", () => {
  test("nano-banana-2-lite usa image_urls y proporción", () => {
    expect(adaptadorKie.montarEntrada(NANO, contexto())).toMatchObject({
      image_urls: [URL_REFERENCIA],
      aspect_ratio: "9:16",
    });
  });

  test("seedream pide calidad básica", () => {
    expect(adaptadorKie.montarEntrada(SEEDREAM, contexto())).toMatchObject({
      image_urls: [URL_REFERENCIA],
      aspect_ratio: "9:16",
      quality: "basic",
    });
  });

  test("GPT Flare usa input_urls, no image_urls, y su resolución", () => {
    const entrada = adaptadorKie.montarEntrada(FLARE, contexto());
    expect(entrada).toMatchObject({ input_urls: [URL_REFERENCIA], resolution: "1K" });
    expect(entrada.image_urls).toBeUndefined();
  });

  test("veo3_lite anima el fotograma con duración numérica", () => {
    expect(adaptadorKie.montarEntrada(VEO, contexto(FRASE))).toMatchObject({
      image_urls: [URL_REFERENCIA],
      generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO",
      aspect_ratio: "9:16",
      duration: 4,
      resolution: "720p",
    });
  });

  test("hailuo usa image_url en texto, duración en texto y no acepta proporción", () => {
    const entrada = adaptadorKie.montarEntrada(HAILUO, contexto());
    expect(entrada).toMatchObject({ image_url: URL_REFERENCIA, duration: "6", resolution: "768P" });
    expect(entrada.aspect_ratio).toBeUndefined();
    expect(entrada.image_urls).toBeUndefined();
  });

  test("kling usa image_urls con duración en texto y sin proporción", () => {
    const entrada = adaptadorKie.montarEntrada(KLING, contexto(FRASE));
    expect(entrada).toMatchObject({ image_urls: [URL_REFERENCIA], duration: "4", resolution: "720p" });
    expect(entrada.aspect_ratio).toBeUndefined();
  });

  test("un modelo sin voz nunca recibe lo que dice el personaje", () => {
    expect(JSON.stringify(adaptadorKie.montarEntrada(HAILUO, contexto(FRASE)))).not.toContain(FRASE);
    expect(JSON.stringify(adaptadorKie.montarEntrada(VEO, contexto(FRASE)))).toContain(FRASE);
  });

  test("un modelo del que no se conocen los parámetros no se envía", () => {
    const error = (() => {
      try {
        adaptadorKie.montarEntrada(modelo({ modelo: "modelo-que-nadie-ha-probado" }), contexto());
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ErrorCatalogo);
    expect((error as ErrorCatalogo).estado).toBe(503);
  });
});

describe("peticiones con respuestas grabadas", () => {
  test("la referencia se sube y devuelve su URL temporal", async () => {
    const { buscar, registro } = simular(SUBIDA);
    const archivo = new File([new Uint8Array([1, 2, 3])], "referencia.png", { type: "image/png" });
    expect(await adaptadorKie.subirReferencia({ clave: CLAVE, archivo, buscar })).toBe(URL_REFERENCIA);
    expect(registro[0]?.metodo).toBe("POST");
    expect(registro[0]?.cabeceras.Authorization).toBe(`Bearer ${CLAVE}`);
  });

  test("crear la tarea envía modelo y entrada, y la clave solo va en la cabecera", async () => {
    const { buscar, registro } = simular(TAREA_CREADA);
    const entrada = adaptadorKie.montarEntrada(NANO, contexto());
    const taskId = await adaptadorKie.generarImagen({ clave: CLAVE, modelo: NANO.modelo, entrada, buscar });
    expect(taskId).toBe("2f7a1c9e8b4d4f2ab0c1d2e3f4a5b6c7");
    expect(registro[0]?.url).toContain("/api/v1/jobs/createTask");
    expect(registro[0]?.cuerpo).toMatchObject({ model: NANO.modelo });
    expect(JSON.stringify(registro[0]?.cuerpo)).not.toContain(CLAVE);
  });

  test("el vídeo se pide por el mismo camino que la imagen", async () => {
    const { buscar, registro } = simular(TAREA_CREADA);
    await adaptadorKie.generarVideo({
      clave: CLAVE,
      modelo: VEO.modelo,
      entrada: adaptadorKie.montarEntrada(VEO, contexto(FRASE)),
      buscar,
    });
    expect(registro[0]?.url).toContain("/api/v1/jobs/createTask");
  });

  test("los estados del proveedor se traducen a los propios", async () => {
    const estados = [TAREA_EN_COLA, TAREA_GENERANDO, TAREA_LISTA_VIDEO, TAREA_FALLIDA];
    const propios = [];
    for (const grabacion of estados) {
      const { buscar } = simular(grabacion);
      propios.push((await adaptadorKie.consultar({ clave: CLAVE, taskId: "t", buscar })).estadoPropio);
    }
    expect(propios).toEqual(["enviado", "en_curso", "listo", "fallido"]);
  });

  test("la tarea lista trae sus URL y los créditos que informa el proveedor", async () => {
    const { buscar } = simular(TAREA_LISTA_VIDEO);
    const tarea = await adaptadorKie.consultar({ clave: CLAVE, taskId: "t", buscar });
    expect(tarea).toEqual({
      estado: "success",
      estadoPropio: "listo",
      urls: ["https://tempfile.redpandaai.co/resultados/clip.mp4"],
      creditos: 60,
      haFallado: false,
    });
  });

  test("el fotograma listo informa sus 4 créditos medidos", async () => {
    const { buscar } = simular(TAREA_LISTA_IMAGEN);
    expect((await adaptadorKie.consultar({ clave: CLAVE, taskId: "t", buscar })).creditos).toBe(4);
  });

  test("del fallo del proveedor no se propaga su texto (puede repetir la clave)", async () => {
    const { buscar } = simular(TAREA_FALLIDA);
    const tarea = await adaptadorKie.consultar({ clave: CLAVE, taskId: "t", buscar });
    expect(tarea.haFallado).toBe(true);
    expect(JSON.stringify(tarea)).not.toContain("sk-clave-que-el-proveedor-repite");
  });

  test("el saldo se lee de la respuesta grabada", async () => {
    const { buscar } = simular(SALDO);
    expect(await adaptadorKie.probarCredencial({ clave: CLAVE, buscar })).toBe(214);
  });
});

describe("errores normalizados", () => {
  const casos: [string, Grabacion | (() => never), MotivoProveedor][] = [
    ["clave rechazada", ERROR_CLAVE, "credencial"],
    ["cuenta sin saldo", ERROR_SIN_CREDITO, "saldo"],
    ["demasiadas peticiones", ERROR_LIMITE, "limite"],
    ["error del proveedor", ERROR_SERVIDOR, "contenido"],
    ["respuesta que no se entiende", RESPUESTA_RARA, "respuesta"],
    ["tiempo agotado", fallo("TimeoutError"), "temporal"],
    ["red caída", fallo("TypeError"), "temporal"],
  ];

  for (const [nombre, grabacion, motivo] of casos) {
    test(`${nombre} → motivo ${motivo}`, async () => {
      const { buscar } = simular(grabacion);
      const error = await adaptadorKie.consultar({ clave: CLAVE, taskId: "t", buscar }).catch((e) => e);
      expect(error).toBeInstanceOf(ErrorProveedor);
      expect((error as ErrorProveedor).motivo).toBe(motivo);
      expect((error as ErrorProveedor).proveedor).toBe("kie");
      // El mensaje es para la persona y nunca lleva la clave ni el texto del proveedor.
      expect(`${(error as ErrorProveedor).message}${JSON.stringify(error)}`).not.toContain(CLAVE);
    });
  }

  test("solo los fallos sin respuesta impiden saber si la tarea existe (y por eso no se reenvía)", async () => {
    const sinRespuesta = async (grabacion: Grabacion | (() => never)) => {
      const { buscar } = simular(grabacion);
      const error = await adaptadorKie
        .generarImagen({ clave: CLAVE, modelo: NANO.modelo, entrada: {}, buscar })
        .catch((e) => e);
      return (error as ErrorProveedor).sinRespuesta;
    };
    expect(await sinRespuesta(fallo("TimeoutError"))).toBe(true);
    expect(await sinRespuesta(fallo("TypeError"))).toBe(true);
    expect(await sinRespuesta(ERROR_CLAVE)).toBe(false);
    expect(await sinRespuesta(ERROR_LIMITE)).toBe(false);
  });
});
