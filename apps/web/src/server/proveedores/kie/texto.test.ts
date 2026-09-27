import { describe, expect, test } from "bun:test";
import type { CodigoPrueba } from "@/lib/boveda";
import type { Buscador } from "../codigos";
import { ErrorKie } from "./cliente";
import { generarTextoKie } from "./texto";

/**
 * Cliente del modelo de texto de KIE. **Ningún test llama al proveedor**: se simula.
 *
 * Lo que se fija aquí son las dos cosas que cuestan dinero si se hacen mal:
 *
 * - **cada fallo se traduce a su código propio** y del proveedor no se conserva ni una palabra de su texto (puede
 *   repetir dentro del mensaje la clave que recibió). De esos códigos depende después si el gasto se apunta como
 *   «no ha costado nada» (lista blanca) o se conserva la estimación;
 * - **los créditos informados no se pierden nunca**, ni cuando la respuesta no se entiende: es el único dato real
 *   del coste que da el proveedor.
 */

const CLAVE = "sk-clave-inventada-para-el-test";
const MODELO = "gpt-5-6-sol";

const respuesta = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });

const conEstado =
  (estado: number): Buscador =>
  async () =>
    respuesta({ error: `clave ${CLAVE} rechazada` }, estado);

const pedir = (buscar: Buscador) => generarTextoKie(CLAVE, MODELO, "Traduce.", "Hola.", buscar);

const mensaje = (salida: unknown, extra: Record<string, unknown> = {}) =>
  respuesta({ output: salida, status: "completed", ...extra });

const bloqueDeTexto = (texto: string) => ({ type: "message", content: [{ type: "output_text", text: texto }] });

describe("lo que se le envía al proveedor", () => {
  test("la clave va en la cabecera y nunca en la URL, y el cuerpo lleva el modelo y los dos papeles", async () => {
    let urlVista = "";
    let cabeceras: Record<string, string> = {};
    let cuerpo: Record<string, unknown> = {};
    const buscar: Buscador = async (url, init) => {
      urlVista = url;
      cabeceras = init.headers as Record<string, string>;
      cuerpo = JSON.parse(String(init.body)) as Record<string, unknown>;
      return mensaje([bloqueDeTexto("Hello.")], { credits_consumed: 0.48 });
    };
    const resultado = await generarTextoKie(CLAVE, MODELO, "Traduce al inglés.", "Hola a todos.", buscar);
    expect(urlVista).toBe("https://api.kie.ai/codex/v1/responses");
    expect(urlVista).not.toContain(CLAVE);
    expect(cabeceras.Authorization).toBe(`Bearer ${CLAVE}`);
    expect(cuerpo.model).toBe(MODELO);
    expect(cuerpo.stream).toBe(false);
    expect(cuerpo.input).toEqual([
      { role: "system", content: "Traduce al inglés." },
      { role: "user", content: "Hola a todos." },
    ]);
    expect(resultado).toEqual({ texto: "Hello.", creditos: 0.48 });
  });
});

describe("respuestas correctas", () => {
  test("junta los bloques de mensaje y descarta el razonamiento", async () => {
    const buscar: Buscador = async () =>
      mensaje(
        [
          { type: "reasoning", content: [{ type: "output_text", text: "esto no es la respuesta" }] },
          bloqueDeTexto("Primera parte. "),
          bloqueDeTexto("Segunda parte."),
        ],
        { credits_consumed: 1.5 },
      );
    const resultado = await pedir(buscar);
    expect(resultado.texto).toBe("Primera parte. Segunda parte.");
    expect(resultado.texto).not.toContain("razonamiento");
    expect(resultado.texto).not.toContain("esto no es la respuesta");
    expect(resultado.creditos).toBe(1.5);
  });

  test("una respuesta con solo razonamiento deja el texto vacío, y sus créditos se conservan", async () => {
    const buscar: Buscador = async () => mensaje([{ type: "reasoning", content: [] }], { credits_consumed: 0.9 });
    // Texto vacío = respuesta inservible para quien llama, que cerrará el gasto con los créditos informados en
    // lugar de perderlos.
    expect(await pedir(buscar)).toEqual({ texto: "", creditos: 0.9 });
  });

  test("sin créditos informados se devuelve `null`, no un cero que parecería gratis", async () => {
    const buscar: Buscador = async () => mensaje([bloqueDeTexto("Hello.")]);
    expect(await pedir(buscar)).toEqual({ texto: "Hello.", creditos: null });
  });

  test("unos créditos que no son un número se tratan como desconocidos", async () => {
    const buscar: Buscador = async () => mensaje([bloqueDeTexto("Hello.")], { credits_consumed: "mucho" });
    expect((await pedir(buscar)).creditos).toBeNull();
  });

  test("un `output` que no es una lista deja el texto vacío en lugar de inventarlo", async () => {
    const buscar: Buscador = async () => mensaje("Hello.", { credits_consumed: 2 });
    expect(await pedir(buscar)).toEqual({ texto: "", creditos: 2 });
  });
});

describe("fallos del proveedor", () => {
  const casos: [number, CodigoPrueba][] = [
    // Los tres primeros **prueban** que no hubo ejecución: son los que permiten apuntar «no ha costado nada».
    [400, "rechazada"],
    [401, "rechazada"],
    [403, "rechazada"],
    [402, "sin-credito"],
    [429, "limite"],
    // Un 5xx no prueba nada: puede haber fallado después de ejecutar, así que no entra en la lista blanca.
    [500, "error-proveedor"],
    [503, "error-proveedor"],
  ];

  for (const [estado, codigo] of casos) {
    test(`un ${estado} se traduce a «${codigo}» y no conserva el texto del proveedor`, async () => {
      const fallo = await pedir(conEstado(estado)).catch((e: unknown) => e);
      expect(fallo).toBeInstanceOf(ErrorKie);
      expect((fallo as InstanceType<typeof ErrorKie>).codigo).toBe(codigo);
      expect((fallo as Error).message).not.toContain(CLAVE);
    });
  }

  test("un cuerpo que no es JSON es «respuesta-inesperada»", async () => {
    const buscar: Buscador = async () => new Response("<html>vaya</html>", { status: 200 });
    const fallo = await pedir(buscar).catch((e: unknown) => e);
    expect((fallo as InstanceType<typeof ErrorKie>).codigo).toBe("respuesta-inesperada");
  });

  test("la red caída es «sin-red»", async () => {
    const buscar: Buscador = async () => {
      throw new TypeError("fetch failed");
    };
    const fallo = await pedir(buscar).catch((e: unknown) => e);
    expect((fallo as InstanceType<typeof ErrorKie>).codigo).toBe("sin-red");
  });

  test("el tiempo agotado es «tiempo-agotado», que nunca se da por rechazo probado", async () => {
    const buscar: Buscador = async () => {
      const error = new Error("The operation timed out.");
      error.name = "TimeoutError";
      throw error;
    };
    const fallo = await pedir(buscar).catch((e: unknown) => e);
    expect((fallo as InstanceType<typeof ErrorKie>).codigo).toBe("tiempo-agotado");
  });

  test("el cliente corta por su cuenta: la petición lleva señal de tiempo", async () => {
    let señal: AbortSignal | null = null;
    const buscar: Buscador = async (_url, init) => {
      señal = init.signal ?? null;
      return mensaje([bloqueDeTexto("Hello.")]);
    };
    await pedir(buscar);
    expect(señal).not.toBeNull();
    expect((señal as unknown as AbortSignal).aborted).toBe(false);
  });
});
