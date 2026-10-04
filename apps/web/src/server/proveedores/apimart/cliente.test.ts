import { describe, expect, test } from "bun:test";
import type { Buscador } from "../codigos";
import {
  consultarTarea,
  crearTarea,
  ErrorApimart,
  ESTADOS_APIMART,
  estadoPropioDeApimart,
  saldoCuenta,
  urlPublicaDeReferencia,
} from "./cliente";

// Ningún test llama a APIMart: cada llamada de verdad gasta saldo del usuario. Se simula `fetch` y se
// comprueba qué petición se habría hecho (endpoints, cabeceras y cuerpo).

const CLAVE = "clave-de-apimart-inventada-para-el-test-0000";

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

/** Crear la tarea devuelve `data` como **array** de un elemento (API real, 2026-10-04). */
const sobreCrea = (taskId: string) => json({ code: 200, data: [{ status: "submitted", task_id: taskId }] });
/** Consultar el estado de una tarea usa `{ code, data }` con objeto (API real, 2026-10-04). */
const sobreTarea = (data: unknown) => json({ code: 200, data });
/** El saldo viene en el propio cuerpo, sin sobre `data` (API real, 2026-10-04). */
const sobreSaldo = (data: Record<string, unknown>) => json({ success: true, ...data });

describe("estados de APIMart", () => {
  test("los cinco estados verificados se traducen a estados propios", () => {
    expect(ESTADOS_APIMART).toEqual(["pending", "processing", "completed", "failed", "cancelled"]);
    expect(ESTADOS_APIMART.map(estadoPropioDeApimart)).toEqual(["enviado", "en_curso", "listo", "fallido", "fallido"]);
  });

  test("un estado que no está verificado nunca se da por listo", () => {
    expect(estadoPropioDeApimart("revising")).toBe("desconocido");
  });
});

describe("crearTarea de APIMart", () => {
  test("vídeo e imagen van a endpoints distintos y la clave solo va en la cabecera", async () => {
    const { buscar, registro } = simular([sobreCrea("task_v"), sobreCrea("task_i")]);
    await expect(crearTarea(CLAVE, "video", { model: "veo3.1-lite-ext" }, buscar)).resolves.toBe("task_v");
    await expect(crearTarea(CLAVE, "imagen", { model: "gpt-image-2.5-flare" }, buscar)).resolves.toBe("task_i");
    expect(registro[0]?.url).toBe("https://api.apimart.ai/v1/videos/generations");
    expect(registro[1]?.url).toBe("https://api.apimart.ai/v1/images/generations");
    expect(registro[0]?.metodo).toBe("POST");
    expect(registro[0]?.cabeceras.Authorization).toBe(`Bearer ${CLAVE}`);
    expect(registro[0]?.cuerpo).toEqual({ model: "veo3.1-lite-ext" });
    // La clave no va en el cuerpo ni en la URL.
    expect(JSON.stringify(registro[0]?.cuerpo ?? "")).not.toContain(CLAVE);
    expect(registro[0]?.url).not.toContain(CLAVE);
  });

  test("el callback_url solo se manda si la instalación lo configura", async () => {
    const { buscar, registro } = simular([sobreCrea("t")]);
    await crearTarea(CLAVE, "video", { model: "veo3.1-lite-ext" }, buscar, "https://instancia.ejemplo/callback");
    expect(registro[0]?.cuerpo).toEqual({
      model: "veo3.1-lite-ext",
      callback_url: "https://instancia.ejemplo/callback",
    });
  });

  test("un fallo del sobre sale como ErrorApimart con código propio, sin texto del proveedor", async () => {
    const { buscar } = simular([
      json({ success: false, code: 400, message: "invalid duration 5, must be one of 4/6/8/10" }),
    ]);
    await expect(crearTarea(CLAVE, "video", { duration: 5 }, buscar)).rejects.toThrow(ErrorApimart);
  });

  test("una respuesta sin task_id no se interpreta como tarea creada", async () => {
    const { buscar } = simular([json({ code: 200, data: [{ status: "submitted", id: "otro-campo" }] })]);
    await expect(crearTarea(CLAVE, "video", {}, buscar)).rejects.toThrow(ErrorApimart);
  });
});

describe("consultarTarea de APIMart", () => {
  test("una tarea completada devuelve las URLs (un array), los créditos y el coste en USD", async () => {
    const { buscar, registro } = simular([
      sobreTarea({
        status: "completed",
        credits_cost: 0.7,
        cost: 0.07,
        result: { videos: [{ expires_at: 1791235057, url: ["https://getapib.org/f/video/1.mp4"] }] },
      }),
    ]);
    const estado = await consultarTarea(CLAVE, "task_01", buscar);
    expect(registro[0]?.url).toBe("https://api.apimart.ai/v1/tasks/task_01?language=en");
    expect(estado.estadoPropio).toBe("listo");
    expect(estado.urls).toEqual(["https://getapib.org/f/video/1.mp4"]);
    expect(estado.creditos).toBe(0.7);
    expect(estado.costoUsd).toBe(0.07);
    expect(estado.haFallado).toBe(false);
    expect(estado.causaFallo).toBeNull();
  });

  test("una imagen completada se lee de result.images igual que el vídeo", async () => {
    const { buscar } = simular([
      sobreTarea({
        status: "completed",
        credits_cost: 0.1253,
        result: { images: [{ url: ["https://getapib.org/f/img/1.png"] }] },
      }),
    ]);
    const estado = await consultarTarea(CLAVE, "task_02", buscar);
    expect(estado.urls).toEqual(["https://getapib.org/f/img/1.png"]);
  });

  test("una tarea fallida marca el fallo y traduce la causa sin conservar el texto", async () => {
    const { buscar } = simular([
      json({
        success: true,
        code: 200,
        data: {
          status: "failed",
          error: { code: 400, message: "The generation was blocked by safety review", type: "error" },
        },
      }),
    ]);
    const estado = await consultarTarea(CLAVE, "task_03", buscar);
    expect(estado.haFallado).toBe(true);
    expect(estado.estadoPropio).toBe("fallido");
    expect(estado.urls).toEqual([]);
    expect(estado.causaFallo).toBe("bloqueo_seguridad");
  });

  test("un estado en curso no devuelve nada que cobrar ni que descargar", async () => {
    const { buscar } = simular([sobreTarea({ status: "processing", progress: 60 })]);
    const estado = await consultarTarea(CLAVE, "task_04", buscar);
    expect(estado.estadoPropio).toBe("en_curso");
    expect(estado.urls).toEqual([]);
    expect(estado.creditos).toBeNull();
  });
});

describe("saldo de APIMart", () => {
  test("el saldo disponible sale de /user/balance en USD", async () => {
    const { buscar, registro } = simular([sobreSaldo({ remain_balance: 9.19881, remain_credits: 91.9881 })]);
    await expect(saldoCuenta(CLAVE, buscar)).resolves.toBe(9.19881);
    expect(registro[0]?.url).toBe("https://api.apimart.ai/v1/user/balance");
    expect(registro[0]?.cabeceras.Authorization).toBe(`Bearer ${CLAVE}`);
  });

  test("un 401 del sobre sale con el código «rechazada»", async () => {
    const { buscar } = simular([json({ success: false, code: 401, message: "invalid api key" })]);
    // Un solo intento: el cuerpo de la respuesta simulada se consume una vez.
    const error = await saldoCuenta(CLAVE, buscar).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorApimart);
    expect((error as ErrorApimart).codigo).toBe("rechazada");
  });
});

describe("URL pública de referencia (ADR-0044)", () => {
  test("sin endpoint público la instalación no puede usar APIMart, y lo dice sin llamar a nadie", () => {
    expect(() =>
      urlPublicaDeReferencia("media/2026/09/x.webp", {
        endpointPublico: undefined,
        region: "us-east-1",
        bucket: "escenara",
        claveAcceso: "k",
        secreto: "s",
      }),
    ).toThrow(/S3_ENDPOINT_PUBLIC/);
  });

  test("con endpoint público firma una URL GET que expira (no se sube nada)", () => {
    const url = urlPublicaDeReferencia("media/2026/09/x.webp", {
      endpointPublico: "https://almacen.ejemplo",
      region: "us-east-1",
      bucket: "escenara",
      claveAcceso: "clave-para-firmar",
      secreto: "secreto-para-firmar",
    });
    // SeaweedFS/S3 firman el GET: la URL lleva la clave, el bucket y la expiración.
    expect(url).toContain("https://almacen.ejemplo");
    expect(url).toContain("media/2026/09/x.webp");
    expect(url).toContain("X-Amz-Expires");
  });
});
