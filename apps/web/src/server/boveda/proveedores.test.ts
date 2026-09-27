import { describe, expect, test } from "bun:test";
import { type Buscador, formatoValido, probarClave } from "./proveedores";

// Ningún test llama a KIE ni a Google: `fetch` se simula y se comprueba qué petición se habría hecho.
const CLAVE = "clave-de-prueba-que-no-existe-0000";

interface Llamada {
  url: string;
  cabeceras: Record<string, string>;
  metodo: string;
}

/** `fetch` simulado que registra la petición y devuelve la respuesta indicada. */
function simular(respuesta: Response | (() => never), registro: Llamada[] = []) {
  const buscar: Buscador = async (url, opciones) => {
    registro.push({
      url,
      cabeceras: { ...((opciones.headers ?? {}) as Record<string, string>) },
      metodo: opciones.method ?? "GET",
    });
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

describe("formato de la clave", () => {
  test("acepta claves plausibles y rechaza lo que no puede ser una", () => {
    expect(formatoValido(CLAVE)).toBe(true);
    expect(formatoValido("corta")).toBe(false);
    expect(formatoValido(`${CLAVE} con espacio`)).toBe(false);
    expect(formatoValido(`${CLAVE}\nsalto`)).toBe(false);
    expect(formatoValido("x".repeat(501))).toBe(false);
  });

  test("una clave con formato imposible no llega al proveedor", async () => {
    const { buscar, registro } = simular(json({ code: 200, data: 1 }));
    expect(await probarClave("kie", "corta", buscar)).toEqual({ ok: false, codigo: "formato" });
    expect(registro).toHaveLength(0);
  });
});

describe("prueba de KIE.ai", () => {
  test("pide el saldo con Bearer y devuelve los créditos", async () => {
    const { buscar, registro } = simular(json({ code: 200, msg: "success", data: 148 }));
    expect(await probarClave("kie", CLAVE, buscar)).toEqual({ ok: true, codigo: "ok", detalle: "148 créditos" });
    expect(registro[0]?.url).toBe("https://api.kie.ai/api/v1/chat/credit");
    expect(registro[0]?.metodo).toBe("GET");
    expect(registro[0]?.cabeceras.Authorization).toBe(`Bearer ${CLAVE}`);
  });

  test("el sobre con code 401 es una clave rechazada", async () => {
    // KIE responde 200 en HTTP y pone el error real en el cuerpo.
    expect(await probarClave("kie", CLAVE, simular(json({ code: 401, msg: "unauthorized" })).buscar)).toEqual({
      ok: false,
      codigo: "rechazada",
    });
  });

  test("el sobre con code 402 es falta de saldo", async () => {
    expect(await probarClave("kie", CLAVE, simular(json({ code: 402, msg: "no credit" })).buscar)).toEqual({
      ok: false,
      codigo: "sin-credito",
    });
  });

  test("un cuerpo que no se entiende no se da por bueno", async () => {
    for (const cuerpo of [{ code: 200, data: "muchos" }, { msg: "vaya" }]) {
      expect(await probarClave("kie", CLAVE, simular(json(cuerpo)).buscar)).toEqual({
        ok: false,
        codigo: "respuesta-inesperada",
      });
    }
    const texto = new Response("no es json", { status: 200 });
    expect(await probarClave("kie", CLAVE, simular(texto).buscar)).toEqual({
      ok: false,
      codigo: "respuesta-inesperada",
    });
  });
});

describe("prueba de Google Gemini", () => {
  test("lista un modelo con la cabecera x-goog-api-key y sin la clave en la URL", async () => {
    const { buscar, registro } = simular(json({ models: [{ name: "models/gemini-3-pro" }] }));
    expect(await probarClave("google", CLAVE, buscar)).toEqual({ ok: true, codigo: "ok" });
    expect(registro[0]?.url).toBe("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1");
    expect(registro[0]?.cabeceras["x-goog-api-key"]).toBe(CLAVE);
    expect(registro[0]?.url).not.toContain(CLAVE);
  });

  test("una clave inválida se traduce a «rechazada»", async () => {
    for (const estado of [400, 401, 403]) {
      const respuesta = json({ error: { message: `API key not valid: ${CLAVE}` } }, estado);
      const resultado = await probarClave("google", CLAVE, simular(respuesta).buscar);
      expect(resultado).toEqual({ ok: false, codigo: "rechazada" });
      // El mensaje del proveedor repetía la clave: no se conserva nada de él.
      expect(JSON.stringify(resultado)).not.toContain(CLAVE);
    }
  });

  test("una lista vacía o un cuerpo raro no se dan por buenos", async () => {
    expect(await probarClave("google", CLAVE, simular(json({})).buscar)).toEqual({
      ok: false,
      codigo: "respuesta-inesperada",
    });
  });
});

describe("fallos comunes a cualquier proveedor", () => {
  test("el exceso de peticiones y los errores del servicio tienen su propio código", async () => {
    expect(await probarClave("kie", CLAVE, simular(json({}, 429)).buscar)).toEqual({ ok: false, codigo: "limite" });
    expect(await probarClave("google", CLAVE, simular(json({}, 500)).buscar)).toEqual({
      ok: false,
      codigo: "error-proveedor",
    });
  });

  test("sin red o con tiempo agotado no se confunden", async () => {
    expect(await probarClave("kie", CLAVE, simular(fallo("TypeError")).buscar)).toEqual({
      ok: false,
      codigo: "sin-red",
    });
    expect(await probarClave("google", CLAVE, simular(fallo("TimeoutError")).buscar)).toEqual({
      ok: false,
      codigo: "tiempo-agotado",
    });
  });
});
