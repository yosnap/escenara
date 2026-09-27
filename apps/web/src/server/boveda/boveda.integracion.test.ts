import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

// Credenciales BYOK contra el PostgreSQL local (`bun run services:up`). Ningún test llama a KIE ni a
// Google: la prueba del proveedor se simula con un `fetch` propio.
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

// El recifrado recorre toda la bóveda, así que estos tests se ejecutan contra una base de datos aparte:
// nunca tocan las credenciales de la instalación de desarrollo.
const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_credenciales");
}

const { and, eq, like } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { providerCredentials, users } = await import("../db/esquema");
const { cifrar, idClaveActual, idClaveDe, olvidarClaves } = await import("./cifrado");
const { borrarCredencial, guardarCredencial, listarCredenciales, probarCredencial, usarCredencial } = await import(
  "./credenciales"
);
const { recifrarBoveda } = await import("./recifrar");
type Buscador = import("./proveedores").Buscador;

// Claves inventadas con la forma de una real, para que pasen la validación de formato.
const CLAVE_ANA = "sk-ana-clave-inventada-de-prueba-aaaa";
const CLAVE_ANA_NUEVA = "sk-ana-clave-inventada-rotada-bbbb";
const CLAVE_BETO = "sk-beto-clave-inventada-de-prueba-cccc";
const TODAS = [CLAVE_ANA, CLAVE_ANA_NUEVA, CLAVE_BETO];

const responder =
  (cuerpo: unknown, estado = 200): Buscador =>
  async () =>
    new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });

/** Respuesta buena de cada proveedor: el sobre con créditos de KIE y la lista de modelos de Google. */
const valida = responder({ code: 200, msg: "success", data: 148 });
const validaGoogle = responder({ models: [{ name: "models/gemini-3-pro" }] });
/** El proveedor devuelve la clave dentro del mensaje de error: el caso que no debe filtrarse. */
const rechaza = (clave: string) => responder({ error: { message: `API key not valid: ${clave}` } }, 401);

/** Ejecuta algo capturando lo que se escriba en consola. */
async function conConsola<T>(accion: () => Promise<T>): Promise<{ valor: T; salida: string }> {
  const original = { log: console.log, warn: console.warn, error: console.error };
  const partes: string[] = [];
  const espia =
    (real: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      partes.push(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : String(a))).join(" "));
      real(...args);
    };
  console.log = espia(original.log);
  console.warn = espia(original.warn);
  console.error = espia(original.error);
  try {
    return { valor: await accion(), salida: partes.join("\n") };
  } finally {
    Object.assign(console, original);
  }
}

const sinSecretos = (texto: string) => {
  for (const clave of TODAS) expect(texto).not.toContain(clave);
};

describe.skipIf(!hayBaseDeDatos)("bóveda de credenciales", () => {
  let ana: Awaited<ReturnType<typeof crearSesionDePrueba>>;
  let beto: Awaited<ReturnType<typeof crearSesionDePrueba>>;

  beforeAll(async () => {
    await aplicarMigraciones();
    [ana, beto] = await Promise.all([crearSesionDePrueba("user"), crearSesionDePrueba("user")]);
  });

  afterAll(async () => {
    await Promise.all([ana.borrar(), beto.borrar()]);
    await db().delete(users).where(like(users.email, "prueba-%@escenara.test"));
    delete process.env.ESCENARA_CLAVE_MAESTRA_ANTERIOR;
    olvidarClaves();
  });

  test("solo se guarda si la prueba pasa, y la respuesta no lleva la clave", async () => {
    const { valor: fallido, salida } = await conConsola(() =>
      guardarCredencial(ana.id, "kie", CLAVE_ANA, rechaza(CLAVE_ANA)),
    );
    expect(fallido).toEqual({ ok: false, motivo: "prueba", codigo: "rechazada" });
    expect(await listarCredenciales(ana.id)).toEqual([]);
    sinSecretos(salida);

    const guardado = await guardarCredencial(ana.id, "kie", CLAVE_ANA, valida);
    expect(guardado.ok).toBe(true);
    if (!guardado.ok) return;
    expect(guardado.credencial).toEqual({
      proveedor: "kie",
      pista: "aaaa",
      estado: "valida",
      ultimoCodigo: "ok",
      ultimoDetalle: "148 créditos",
      alta: expect.any(String),
      ultimaPrueba: expect.any(String),
      ultimaRotacion: null,
    });
    sinSecretos(JSON.stringify(guardado));
  });

  test("la clave no está en claro en la base de datos", async () => {
    const [fila] = await db().select().from(providerCredentials).where(eq(providerCredentials.userId, ana.id));
    expect(fila).toBeDefined();
    sinSecretos(JSON.stringify(fila));
    expect(fila?.secret).toStartWith("v1.");
    expect(fila?.hint).toBe("aaaa");
    // Pero el servidor sí la recupera.
    expect(await usarCredencial(ana.id, "kie")).toBe(CLAVE_ANA);
  });

  test("probar con éxito y con fallo actualiza el estado sin filtrar la clave", async () => {
    const { valor: mal, salida } = await conConsola(() => probarCredencial(ana.id, "kie", rechaza(CLAVE_ANA)));
    expect(mal).toEqual({ ok: false, motivo: "prueba", codigo: "rechazada" });
    sinSecretos(salida);
    sinSecretos(JSON.stringify(mal));
    expect((await listarCredenciales(ana.id))[0]?.estado).toBe("invalida");

    const bien = await probarCredencial(ana.id, "kie", valida);
    expect(bien.ok).toBe(true);
    expect((await listarCredenciales(ana.id))[0]?.estado).toBe("valida");
    sinSecretos(JSON.stringify(bien));
  });

  test("rotar sustituye la clave solo si la nueva funciona", async () => {
    // Una nueva que no vale deja la anterior intacta.
    expect(await guardarCredencial(ana.id, "kie", CLAVE_ANA_NUEVA, rechaza(CLAVE_ANA_NUEVA))).toEqual({
      ok: false,
      motivo: "prueba",
      codigo: "rechazada",
    });
    expect(await usarCredencial(ana.id, "kie")).toBe(CLAVE_ANA);

    const { valor: rotado, salida } = await conConsola(() => guardarCredencial(ana.id, "kie", CLAVE_ANA_NUEVA, valida));
    expect(rotado.ok).toBe(true);
    if (!rotado.ok) return;
    expect(rotado.credencial.pista).toBe("bbbb");
    expect(rotado.credencial.ultimaRotacion).toEqual(expect.any(String));
    expect(await usarCredencial(ana.id, "kie")).toBe(CLAVE_ANA_NUEVA);
    sinSecretos(salida);
    sinSecretos(JSON.stringify(rotado));
  });

  test("sigue habiendo una sola credencial por usuario y proveedor", async () => {
    const filas = await db()
      .select()
      .from(providerCredentials)
      .where(and(eq(providerCredentials.userId, ana.id), eq(providerCredentials.provider, "kie")));
    expect(filas).toHaveLength(1);
  });

  describe("nadie toca las credenciales de otra persona", () => {
    beforeAll(async () => {
      const r = await guardarCredencial(beto.id, "google", CLAVE_BETO, validaGoogle);
      expect(r).toMatchObject({ ok: true });
    });

    test("cada uno solo ve las suyas", async () => {
      expect((await listarCredenciales(ana.id)).map((c) => c.proveedor)).toEqual(["kie"]);
      expect((await listarCredenciales(beto.id)).map((c) => c.proveedor)).toEqual(["google"]);
    });

    test("no se puede usar la clave de otro ni indicando su proveedor", async () => {
      expect(await usarCredencial(ana.id, "google")).toBeNull();
      expect(await usarCredencial(beto.id, "kie")).toBeNull();
    });

    test("no se puede probar ni borrar la de otro", async () => {
      expect(await probarCredencial(ana.id, "google", validaGoogle)).toEqual({
        ok: false,
        motivo: "sin-credencial",
        mensaje: expect.any(String),
      });
      expect(await borrarCredencial(ana.id, "google")).toBe(false);
      // La de Beto sigue ahí, intacta.
      expect(await usarCredencial(beto.id, "google")).toBe(CLAVE_BETO);
    });

    test("un valor cifrado copiado a la fila de otro no se descifra (AAD)", async () => {
      const [deBeto] = await db()
        .select({ secret: providerCredentials.secret })
        .from(providerCredentials)
        .where(eq(providerCredentials.userId, beto.id));
      // Se copia tal cual al hueco de Ana: misma clave maestra, otro contexto.
      await db()
        .insert(providerCredentials)
        .values({ userId: ana.id, provider: "google", secret: deBeto?.secret ?? "", hint: "cccc" });
      const { valor, salida } = await conConsola(() => usarCredencial(ana.id, "google"));
      expect(valor).toBeNull();
      expect(salida).toContain("credencial ilegible");
      sinSecretos(salida);
      // Y al probarla se distingue de «no tienes ninguna»: dice que hay que volver a guardarla.
      const prueba = await probarCredencial(ana.id, "google", validaGoogle);
      expect(prueba).toMatchObject({ ok: false, motivo: "sin-credencial" });
      if (!prueba.ok && prueba.motivo === "sin-credencial") expect(prueba.mensaje).toContain("no se puede leer");
      await borrarCredencial(ana.id, "google");
    });
  });

  test("rotar la clave maestra y recifrar deja todo legible con la nueva", async () => {
    // Situación de partida: una credencial cifrada con una maestra vieja, que pasa a `_ANTERIOR`.
    const vieja = randomBytes(32).toString("base64");
    const secreto = cifrar(CLAVE_BETO, `credencial:${beto.id}:kie`, { ESCENARA_CLAVE_MAESTRA: vieja });
    await db().insert(providerCredentials).values({ userId: beto.id, provider: "kie", secret: secreto, hint: "cccc" });
    expect(idClaveDe(secreto)).not.toBe(idClaveActual());

    // Sin la maestra anterior no hay manera de leerla.
    expect(await usarCredencial(beto.id, "kie")).toBeNull();

    process.env.ESCENARA_CLAVE_MAESTRA_ANTERIOR = vieja;
    olvidarClaves();
    const fallos: string[] = [];
    const resumen = await recifrarBoveda((m) => {
      fallos.push(m);
    });
    expect(resumen.credenciales.recifradas).toBeGreaterThanOrEqual(1);
    sinSecretos(fallos.join("\n"));

    // Ya sin la anterior en el entorno, todo se lee con la actual.
    delete process.env.ESCENARA_CLAVE_MAESTRA_ANTERIOR;
    olvidarClaves();
    expect(await usarCredencial(beto.id, "kie")).toBe(CLAVE_BETO);
    expect(await usarCredencial(beto.id, "google")).toBe(CLAVE_BETO);
    const [fila] = await db()
      .select({ secret: providerCredentials.secret })
      .from(providerCredentials)
      .where(and(eq(providerCredentials.userId, beto.id), eq(providerCredentials.provider, "kie")));
    expect(idClaveDe(fila?.secret ?? "")).toBe(idClaveActual());

    // Y repetirlo no cambia nada: es idempotente.
    expect((await recifrarBoveda(() => {})).credenciales.recifradas).toBe(0);
  });

  test("una credencial que cambia mientras se recifra se respeta y se informa", async () => {
    // Dos filas con la maestra equivocada, en orden conocido (el recifrado ordena por fecha de alta):
    // la primera es ilegible (se cifró con una clave que nadie tiene) y la segunda sí se puede recifrar.
    const perdida = randomBytes(32).toString("base64");
    const vieja = randomBytes(32).toString("base64");
    const [uno, dos] = await Promise.all([crearSesionDePrueba("user"), crearSesionDePrueba("user")]);
    try {
      await db()
        .insert(providerCredentials)
        .values([
          {
            userId: uno.id,
            provider: "kie",
            secret: cifrar(CLAVE_BETO, `credencial:${uno.id}:kie`, { ESCENARA_CLAVE_MAESTRA: perdida }),
            hint: "cccc",
            createdAt: new Date("2026-01-01T00:00:00Z"),
          },
          {
            userId: dos.id,
            provider: "kie",
            secret: cifrar(CLAVE_BETO, `credencial:${dos.id}:kie`, { ESCENARA_CLAVE_MAESTRA: vieja }),
            hint: "cccc",
            createdAt: new Date("2026-01-02T00:00:00Z"),
          },
        ]);
      process.env.ESCENARA_CLAVE_MAESTRA_ANTERIOR = vieja;
      olvidarClaves();

      // Al avisar de la primera (ilegible), alguien sustituye la segunda: su recifrado ya no debe pisarla.
      const fallos: string[] = [];
      let sustituida = false;
      const resumen = await recifrarBoveda(async (mensaje) => {
        fallos.push(mensaje);
        if (sustituida) return;
        sustituida = true;
        expect((await guardarCredencial(dos.id, "kie", CLAVE_ANA_NUEVA, valida)).ok).toBe(true);
      });

      delete process.env.ESCENARA_CLAVE_MAESTRA_ANTERIOR;
      olvidarClaves();
      expect(resumen.credenciales).toMatchObject({ recifradas: 0, ilegibles: 1, cambiadas: 1 });
      expect(fallos.join("\n")).toContain("cambió mientras se recifraba");
      sinSecretos(fallos.join("\n"));
      // La clave nueva se conserva tal cual quedó, no la que el recifrado había leído.
      expect(await usarCredencial(dos.id, "kie")).toBe(CLAVE_ANA_NUEVA);
    } finally {
      await Promise.all([uno.borrar(), dos.borrar()]);
    }
  });

  test("el límite de pruebas por usuario frena al vigésimo primer intento", async () => {
    const intenso = await crearSesionDePrueba("user");
    try {
      // El alta ya gasta una prueba; las siguientes son reintentos sobre la misma clave.
      expect((await guardarCredencial(intenso.id, "kie", CLAVE_BETO, valida)).ok).toBe(true);
      for (let i = 1; i < 20; i++) expect((await probarCredencial(intenso.id, "kie", valida)).ok).toBe(true);
      expect(await probarCredencial(intenso.id, "kie", valida)).toEqual({
        ok: false,
        motivo: "limite",
        mensaje: expect.any(String),
      });
      // También frena el alta de una clave nueva: el límite es de pruebas, no de una acción concreta.
      expect(await guardarCredencial(intenso.id, "google", CLAVE_BETO, validaGoogle)).toMatchObject({
        ok: false,
        motivo: "limite",
      });
      // Y a otra persona no le afecta.
      expect((await guardarCredencial(ana.id, "google", CLAVE_ANA, validaGoogle)).ok).toBe(true);
      await borrarCredencial(ana.id, "google");
    } finally {
      await intenso.borrar();
    }
  });

  test("borrar quita la fila", async () => {
    expect(await borrarCredencial(ana.id, "kie")).toBe(true);
    expect(await listarCredenciales(ana.id)).toEqual([]);
    expect(await usarCredencial(ana.id, "kie")).toBeNull();
  });

  describe("las acciones de credenciales exigen sesión", () => {
    /**
     * Las acciones toman el usuario de la sesión, nunca del navegador: no aceptan un identificador de
     * usuario. Fuera de una petición no hay cabeceras que comprobar, así que fallan antes de tocar nada.
     */
    test("sin sesión no se guarda, ni se prueba, ni se borra", async () => {
      const acciones = await import("@/app/cuenta/acciones-credenciales");
      await expect(acciones.guardarCredencialAccion("kie", CLAVE_ANA)).rejects.toThrow();
      await expect(acciones.probarCredencialAccion("kie")).rejects.toThrow();
      await expect(acciones.borrarCredencialAccion("kie")).rejects.toThrow();
    });

    test("ninguna acción recibe el usuario desde fuera", async () => {
      const codigo = await Bun.file(
        path.resolve(import.meta.dirname, "../../app/cuenta/acciones-credenciales.ts"),
      ).text();
      const cuerpos = [...codigo.matchAll(/export async function (\w+)\(([^)]*)\)[^{]*\{([\s\S]*?)\n\}/g)];
      expect(cuerpos.length).toBeGreaterThanOrEqual(3);
      for (const [, nombre, argumentos, cuerpo] of cuerpos) {
        expect(argumentos as string, `${nombre} recibe un usuario`).not.toMatch(/usuario|userId/i);
        expect((cuerpo as string).indexOf("exigirSesion"), `${nombre} no comprueba la sesión`).toBeGreaterThanOrEqual(
          0,
        );
      }
    });
  });

  test("al borrar la cuenta desaparecen sus credenciales", async () => {
    const efimero = await crearSesionDePrueba("user");
    expect((await guardarCredencial(efimero.id, "kie", CLAVE_BETO, valida)).ok).toBe(true);
    await efimero.borrar();
    const filas = await db().select().from(providerCredentials).where(eq(providerCredentials.userId, efimero.id));
    expect(filas).toEqual([]);
  });
});
