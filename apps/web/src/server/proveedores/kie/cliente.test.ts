import { describe, expect, test } from "bun:test";
import type { CodigoPrueba } from "@/lib/boveda";
import type { Buscador } from "../codigos";
import {
  consultarTarea,
  crearTarea,
  ErrorKie,
  ESTADOS_KIE,
  estadoPropioDeKie,
  saldoCreditos,
  subirReferencia,
} from "./cliente";
import { entradaAnimacion, entradaFotograma } from "./modelos";

// Ningún test llama a KIE: cada llamada de verdad gasta créditos del usuario. Se simula `fetch` y se
// comprueba qué petición se habría hecho.
const CLAVE = "clave-de-kie-inventada-para-el-test-0000";

interface Llamada {
  url: string;
  metodo: string;
  cabeceras: Record<string, string>;
  cuerpo: unknown;
}

function simular(respuestas: (Response | (() => never))[]) {
  const registro: Llamada[] = [];
  let i = 0;
  const buscar: Buscador = async (url, opciones) => {
    registro.push({
      url,
      metodo: opciones.method ?? "GET",
      cabeceras: { ...((opciones.headers ?? {}) as Record<string, string>) },
      cuerpo: typeof opciones.body === "string" ? JSON.parse(opciones.body) : opciones.body,
    });
    const respuesta = respuestas[Math.min(i++, respuestas.length - 1)];
    if (typeof respuesta === "function") respuesta();
    return respuesta as Response;
  };
  return { buscar, registro };
}

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });

const fallo = (nombre: string) => () => {
  const error = new Error("simulado");
  error.name = nombre;
  throw error;
};

const sobre = (data: unknown) => json({ code: 200, msg: "success", data });

describe("estados de KIE", () => {
  test("los cinco estados documentados se traducen a estados propios", () => {
    expect(ESTADOS_KIE).toEqual(["waiting", "queuing", "generating", "success", "fail"]);
    expect(ESTADOS_KIE.map(estadoPropioDeKie)).toEqual(["enviado", "enviado", "en_curso", "listo", "fallido"]);
  });

  test("un estado que no está documentado nunca se da por listo", () => {
    for (const raro of ["SUCCESS", "done", "", "paused"]) {
      expect(estadoPropioDeKie(raro)).toBe("desconocido");
    }
  });
});

describe("saldo de créditos", () => {
  test("pide el saldo con Bearer y devuelve el número", async () => {
    const { buscar, registro } = simular([sobre(148)]);
    expect(await saldoCreditos(CLAVE, buscar)).toBe(148);
    expect(registro[0]?.url).toBe("https://api.kie.ai/api/v1/chat/credit");
    expect(registro[0]?.cabeceras.Authorization).toBe(`Bearer ${CLAVE}`);
    expect(registro[0]?.url).not.toContain(CLAVE);
  });

  test("un sobre con code distinto de 200 es un error con código propio", async () => {
    const casos: [number, CodigoPrueba][] = [
      [401, "rechazada"],
      [402, "sin-credito"],
      [429, "limite"],
      [500, "error-proveedor"],
    ];
    for (const [code, codigo] of casos) {
      const { buscar } = simular([json({ code, msg: `API key not valid: ${CLAVE}` })]);
      const error = await saldoCreditos(CLAVE, buscar).catch((e) => e);
      expect(error).toBeInstanceOf(ErrorKie);
      expect((error as ErrorKie).codigo).toBe(codigo);
      // El mensaje del proveedor repetía la clave: no se conserva nada de él.
      expect(`${(error as ErrorKie).message}${JSON.stringify(error)}`).not.toContain(CLAVE);
    }
  });

  test("sin red y con tiempo agotado no se confunden", async () => {
    expect(await saldoCreditos(CLAVE, simular([fallo("TypeError")]).buscar).catch((e) => e.codigo)).toBe("sin-red");
    expect(await saldoCreditos(CLAVE, simular([fallo("TimeoutError")]).buscar).catch((e) => e.codigo)).toBe(
      "tiempo-agotado",
    );
  });
});

describe("subida de la referencia", () => {
  test("envía el archivo como formulario y devuelve la URL de descarga", async () => {
    const { buscar, registro } = simular([sobre({ downloadUrl: "https://tempfile.kie.ai/a.png" })]);
    const archivo = new File([new Uint8Array([1, 2, 3])], "referencia.png", { type: "image/png" });
    expect(await subirReferencia(CLAVE, archivo, buscar)).toBe("https://tempfile.kie.ai/a.png");
    expect(registro[0]?.url).toBe("https://kieai.redpandaai.co/api/file-stream-upload");
    expect(registro[0]?.metodo).toBe("POST");
    expect(registro[0]?.cuerpo).toBeInstanceOf(FormData);
  });

  test("una respuesta sin URL no se da por buena", async () => {
    const { buscar } = simular([sobre({})]);
    expect(await subirReferencia(CLAVE, new File([""], "x.png"), buscar).catch((e) => e.codigo)).toBe(
      "respuesta-inesperada",
    );
  });
});

describe("creación de la tarea", () => {
  test("envía modelo y entrada y devuelve el identificador de la tarea", async () => {
    const { buscar, registro } = simular([sobre({ taskId: "task_123" })]);
    const entrada = entradaFotograma("una escena", ["https://tempfile.kie.ai/a.png"]);
    expect(await crearTarea(CLAVE, "nano-banana-2-lite", entrada, buscar)).toBe("task_123");
    expect(registro[0]?.url).toBe("https://api.kie.ai/api/v1/jobs/createTask");
    expect(registro[0]?.metodo).toBe("POST");
    expect(registro[0]?.cuerpo).toMatchObject({
      model: "nano-banana-2-lite",
      input: { image_urls: ["https://tempfile.kie.ai/a.png"], aspect_ratio: "9:16" },
    });
  });

  test("la entrada de la animación lleva la duración pedida, 9:16 y 720p, con el fotograma como primero", () => {
    expect(entradaAnimacion("se mueve", "", "https://tempfile.kie.ai/a.png", 8)).toMatchObject({
      image_urls: ["https://tempfile.kie.ai/a.png"],
      generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO",
      aspect_ratio: "9:16",
      duration: 8,
      resolution: "720p",
    });
    expect(entradaAnimacion("se mueve", "", "https://tempfile.kie.ai/a.png", 4).duration).toBe(4);
  });

  test("una tarea sin identificador no se da por creada", async () => {
    const { buscar } = simular([sobre({ taskId: "" })]);
    expect(await crearTarea(CLAVE, "m", {}, buscar).catch((e) => e.codigo)).toBe("respuesta-inesperada");
  });
});

describe("consulta de la tarea", () => {
  test("pide recordInfo con el identificador y traduce el estado intermedio", async () => {
    const { buscar, registro } = simular([sobre({ state: "generating" })]);
    expect(await consultarTarea(CLAVE, "task_123", buscar)).toEqual({
      estado: "generating",
      estadoPropio: "en_curso",
      urls: [],
      creditos: null,
      haFallado: false,
    });
    expect(registro[0]?.url).toBe("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task_123");
    expect(registro[0]?.metodo).toBe("GET");
  });

  test("una tarea correcta devuelve las URL y los créditos consumidos", async () => {
    const { buscar } = simular([
      sobre({
        state: "success",
        resultJson: JSON.stringify({ resultUrls: ["https://tempfile.kie.ai/r.png"] }),
        creditsConsumed: 4,
      }),
    ]);
    expect(await consultarTarea(CLAVE, "task_123", buscar)).toEqual({
      estado: "success",
      estadoPropio: "listo",
      urls: ["https://tempfile.kie.ai/r.png"],
      creditos: 4,
      haFallado: false,
    });
  });

  test("una tarea fallida no propaga el texto del proveedor", async () => {
    const { buscar } = simular([sobre({ state: "fail", failMsg: `fallo con la clave ${CLAVE}`, creditsConsumed: 0 })]);
    const tarea = await consultarTarea(CLAVE, "task_123", buscar);
    expect(tarea.haFallado).toBe(true);
    expect(tarea.estadoPropio).toBe("fallido");
    expect(JSON.stringify(tarea)).not.toContain(CLAVE);
  });

  test("«listo» sin resultado legible no se da por bueno", async () => {
    for (const resultJson of [undefined, "no es json", JSON.stringify({ resultUrls: [] })]) {
      const { buscar } = simular([sobre({ state: "success", resultJson })]);
      expect(await consultarTarea(CLAVE, "t", buscar).catch((e) => e.codigo)).toBe("respuesta-inesperada");
    }
  });

  test("un estado desconocido del proveedor se informa como desconocido, no como listo", async () => {
    const { buscar } = simular([sobre({ state: "paused" })]);
    const tarea = await consultarTarea(CLAVE, "t", buscar);
    expect(tarea.estadoPropio).toBe("desconocido");
    expect(tarea.urls).toEqual([]);
  });
});
