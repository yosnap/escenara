import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * La gracia del borrado de la cuenta también en las rutas de Better Auth: con el borrado programado no se puede cambiar
 * el correo, la contraseña, las passkeys ni las cuentas vinculadas, ni borrarse saltándose el worker; sí entrar, salir
 * y consultar. Las rutas de administración de la librería están desactivadas siempre. Y el titular recibe un correo al
 * pedir y al cancelar el borrado.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);
process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_gracia_auth");
}

const { eq } = await import("drizzle-orm");
const rutaBorradoCuenta = await import("@/app/api/cuenta/borrado/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { auth } = await import("../auth/auth");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { fijarTransporte } = await import("../correo");
const { rateLimits, users } = await import("../db/esquema");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Transporte = Parameters<typeof fijarTransporte>[0];

const BASE = process.env.BETTER_AUTH_URL ?? "http://localhost:3021";
const enviados: { to: string; subject: string; text: string }[] = [];
const registro = {
  async sendMail(m: { to: string; subject: string; text: string }) {
    enviados.push(m);
    return { accepted: [m.to], rejected: [], messageId: "prueba" };
  },
} as unknown as Transporte;

/** Llamada a una ruta de Better Auth como la haría el navegador. */
async function rutaAuth(ruta: string, metodo: "GET" | "POST", cookie: string | null, cuerpo?: unknown) {
  return (await auth()).handler(
    new Request(`${BASE}/api/auth${ruta}`, {
      method: metodo,
      headers: {
        ...(cookie ? { cookie } : {}),
        origin: BASE,
        ...(cuerpo === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    }),
  );
}

const pedir = (s: Sesion, metodo: "GET" | "POST" | "DELETE", cuerpo?: unknown) =>
  new Request("http://localhost/api/cuenta/borrado", {
    method: metodo,
    headers: {
      cookie: s.cookie,
      ...(metodo === "GET" ? {} : { origin: "http://localhost", "Content-Type": "application/json" }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });

const codigo = async (r: Response) => ((await r.json().catch(() => ({}))) as { code?: string }).code ?? "";

describe.skipIf(!hayBaseDeDatos)("gracia del borrado en Better Auth y avisos por correo", () => {
  const sesiones: Sesion[] = [];

  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_gracia_auth");
    await aplicarMigraciones();
    fijarTransporte(registro);
  });

  afterAll(async () => {
    for (const s of sesiones) await s.borrar();
    // El resto de la suite sigue sin mandar correo de verdad.
    fijarTransporte({
      async sendMail() {
        return { accepted: [], rejected: [], messageId: "prueba" };
      },
    } as unknown as Transporte);
  });

  test("fuera de la gracia nada cambia; dentro, se rechaza todo lo que cambia la identidad o el acceso", async () => {
    await db().delete(rateLimits);
    const ana = await crearSesionDePrueba("user");
    sesiones.push(ana);
    expect((await rutaAuth("/update-user", "POST", ana.cookie, { name: "Ana antes" })).status).toBe(200);

    expect((await rutaBorradoCuenta.POST(pedir(ana, "POST", { frase: "borrar mi cuenta" }))).status).toBe(201);
    const bloqueadas: [string, "GET" | "POST", unknown][] = [
      ["/update-user", "POST", { name: "Ana después" }],
      ["/change-email", "POST", { newEmail: `otra-${randomBytes(4).toString("hex")}@escenara.test` }],
      ["/change-password", "POST", { currentPassword: ana.password, newPassword: "otra-clave-muy-larga-1" }],
      ["/link-social", "POST", { provider: "github" }],
      ["/unlink-account", "POST", { providerId: "credential" }],
      ["/delete-user", "POST", {}],
      ["/passkey/generate-register-options", "GET", undefined],
    ];
    for (const [ruta, metodo, cuerpo] of bloqueadas) {
      const r = await rutaAuth(ruta, metodo, ana.cookie, cuerpo);
      expect({ ruta, estado: r.status }).toEqual({ ruta, estado: 403 });
      expect(await codigo(r)).toBe("CUENTA_EN_BORRADO");
    }
    const [sigue] = await db().select().from(users).where(eq(users.id, ana.id));
    expect(sigue?.name).toBe("Ana antes");
    // Sin sesión tampoco se puede cambiar la contraseña por correo.
    const restablecer = await rutaAuth("/request-password-reset", "POST", null, {
      email: ana.email,
      redirectTo: "/restablecer",
    });
    expect(restablecer.status).toBe(403);
    // Consultar la sesión sí.
    expect((await rutaAuth("/get-session", "GET", ana.cookie)).status).toBe(200);

    // Cancelado el borrado, todo vuelve a funcionar como antes.
    expect((await rutaBorradoCuenta.DELETE(pedir(ana, "DELETE"))).status).toBe(200);
    expect((await rutaAuth("/update-user", "POST", ana.cookie, { name: "Ana de nuevo" })).status).toBe(200);
  });

  test("las rutas de administración de la librería están desactivadas, también para un administrador sin gracia", async () => {
    await db().delete(rateLimits);
    const admin = await crearSesionDePrueba("admin");
    const otra = await crearSesionDePrueba("user");
    sesiones.push(admin, otra);
    for (const [ruta, metodo, cuerpo] of [
      ["/admin/list-users", "GET", undefined],
      ["/admin/remove-user", "POST", { userId: otra.id }],
      ["/admin/impersonate-user", "POST", { userId: otra.id }],
      ["/admin/set-role", "POST", { userId: otra.id, role: "admin" }],
      ["/admin/ban-user", "POST", { userId: otra.id }],
    ] as const) {
      const r = await rutaAuth(ruta, metodo, admin.cookie, cuerpo);
      expect({ ruta, estado: r.status }).toEqual({ ruta, estado: 403 });
    }
    const [sigue] = await db().select().from(users).where(eq(users.id, otra.id));
    expect(sigue?.role).toBe("user");
  });

  test("el titular recibe un correo al pedir el borrado (con la fecha, sin enlace para cancelar sin entrar) y al cancelarlo", async () => {
    await db().delete(rateLimits);
    const bea = await crearSesionDePrueba("user");
    sesiones.push(bea);
    enviados.length = 0;
    expect((await rutaBorradoCuenta.POST(pedir(bea, "POST", { frase: "borrar mi cuenta" }))).status).toBe(201);
    expect((await rutaBorradoCuenta.DELETE(pedir(bea, "DELETE"))).status).toBe(200);
    await Bun.sleep(200);
    const suyos = enviados.filter((m) => m.to === bea.email);
    expect(suyos.map((m) => m.subject)).toEqual([
      "Has pedido borrar tu cuenta de Escenara",
      "Se ha cancelado el borrado de tu cuenta de Escenara",
    ]);
    expect(suyos[0]?.text).toContain("Se borrará todo a partir del");
    expect(suyos[0]?.text).toContain("/cuenta/borrado");
    expect(suyos[0]?.text).not.toMatch(/token|cancelar\?/i);
  });
});
