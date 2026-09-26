import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { eq, like } from "drizzle-orm";

// Pruebas contra el PostgreSQL local (`bun run services:up`).
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

const { auth } = await import("./auth");
const { crearSesionDePrueba } = await import("./sesion-de-prueba");
const { db } = await import("../db/cliente");
const { sessions, users } = await import("../db/esquema");
const { aplicarMigraciones } = await import("../db/migrar");
const { guardarAjustes, leerAjustes } = await import("../ajustes");

const marca = `cuentas-${crypto.randomUUID().slice(0, 8)}`;
const correo = (n: string) => `${marca}-${n}@escenara.test`;
const clave = "una-clave-larga-de-prueba";

// Cada llamada llega con una x-forwarded-for distinta: en local esa cabecera no se tiene en cuenta
// (sin cabecera de IP configurada en los ajustes) y el test del límite por cuenta comprueba que falsificarla no sirve.
let siguienteIp = Math.floor(Math.random() * 100);
const ipNueva = () => `203.0.113.${(siguienteIp++ % 250) + 1}`;

/** Llama a la API HTTP de Better Auth como lo haría el navegador. */
async function llamar(ruta: string, cuerpo: unknown, cabeceras: Record<string, string> = {}) {
  return (await auth()).handler(
    new Request(`http://localhost:3021/api/auth${ruta}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3021",
        "x-forwarded-for": ipNueva(),
        ...cabeceras,
      },
      body: JSON.stringify(cuerpo),
    }),
  );
}

describe.skipIf(!process.env.DATABASE_URL)("cuentas (Better Auth contra PostgreSQL local)", () => {
  let base: Awaited<ReturnType<typeof crearSesionDePrueba>>;

  beforeAll(async () => {
    await aplicarMigraciones();
    // Garantiza que ya existe una cuenta: las siguientes no son la primera de la instalación.
    base = await crearSesionDePrueba("admin");
  });

  afterAll(async () => {
    await db()
      .delete(users)
      .where(like(users.email, `${marca}-%`));
    await base.borrar();
  });

  test("no se puede entrar sin verificar el correo", async () => {
    await llamar("/sign-up/email", { name: "Sin verificar", email: correo("sinverificar"), password: clave });
    const r = await llamar("/sign-in/email", { email: correo("sinverificar"), password: clave });
    expect(r.status).toBe(403);
    expect(r.headers.getSetCookie()).toEqual([]);
  });

  test("el rol no se puede elegir al registrarse", async () => {
    const r = await llamar("/sign-up/email", {
      name: "Intruso",
      email: correo("intruso"),
      password: clave,
      role: "admin",
    });
    // Better Auth rechaza el alta si se envía `role` (FIELD_NOT_ALLOWED): la cuenta ni siquiera se crea.
    expect(r.status).toBe(400);
    const filas = await db()
      .select()
      .from(users)
      .where(eq(users.email, correo("intruso")));
    expect(filas).toHaveLength(0);
  });

  test("las preferencias solo admiten valores conocidos", async () => {
    const sesion = await crearSesionDePrueba("user");
    try {
      await llamar("/update-user", { tema: "dark", idioma: "en" }, { cookie: sesion.cookie });
      let [fila] = await db()
        .select({ tema: users.tema, idioma: users.idioma })
        .from(users)
        .where(eq(users.email, sesion.email));
      expect(fila).toEqual({ tema: "dark", idioma: "en" });

      await llamar("/update-user", { tema: "rojo", idioma: "klingon" }, { cookie: sesion.cookie });
      [fila] = await db()
        .select({ tema: users.tema, idioma: users.idioma })
        .from(users)
        .where(eq(users.email, sesion.email));
      expect(fila).toEqual({ tema: "system", idioma: "es" });
    } finally {
      await sesion.borrar();
    }
  });

  test("un usuario no puede darse el rol de administrador", async () => {
    const sesion = await crearSesionDePrueba("user");
    try {
      await llamar("/update-user", { role: "admin" }, { cookie: sesion.cookie });
      const [fila] = await db().select({ role: users.role }).from(users).where(eq(users.email, sesion.email));
      expect(fila?.role).toBe("user");
    } finally {
      await sesion.borrar();
    }
  });

  test("con el registro cerrado se rechaza el alta de forma visible y no se crea la cuenta", async () => {
    const [admin] = await db().select({ id: users.id }).from(users).where(eq(users.email, base.email));
    const idAdmin = admin?.id ?? "";
    const antes = (await leerAjustes()).registroAbierto;
    await guardarAjustes({ registroAbierto: false }, idAdmin);
    try {
      const r = await llamar("/sign-up/email", { name: "Cerrado", email: correo("cerrado"), password: clave });
      expect(r.status).toBe(403);
      expect((await r.json()).code).toBe("REGISTRO_CERRADO");
      const filas = await db()
        .select()
        .from(users)
        .where(eq(users.email, correo("cerrado")));
      expect(filas).toHaveLength(0);
    } finally {
      await guardarAjustes({ registroAbierto: antes }, idAdmin);
    }
  });

  test("limita los intentos por cuenta aunque cambie la IP en cada intento", async () => {
    const estados: number[] = [];
    // `llamar` ya envía una x-forwarded-for distinta en cada petición.
    for (let i = 0; i < 12; i++) {
      estados.push((await llamar("/sign-in/email", { email: correo("fuerza"), password: "mala" })).status);
    }
    expect(estados.slice(0, 10).every((e) => e !== 429)).toBe(true);
    expect(estados.slice(10)).toEqual([429, 429]);
  });

  test("una sesión cerrada deja de valer al momento en las rutas protegidas", async () => {
    const { sesionDePeticion } = await import("./sesion");
    const sesion = await crearSesionDePrueba("admin");
    try {
      const peticion = () => new Request("http://localhost:3021/api/media", { headers: { cookie: sesion.cookie } });
      const activa = await sesionDePeticion(peticion());
      expect(activa).not.toBeNull();
      await db()
        .delete(sessions)
        .where(eq(sessions.userId, activa?.user.id ?? ""));
      expect(await sesionDePeticion(peticion())).toBeNull();
    } finally {
      await sesion.borrar();
    }
  });
});
