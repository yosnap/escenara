import { chmod } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/** Datos sintéticos y servidor aislado de QA. No emplear BD ni proveedores reales. */
loadEnvConfig(path.resolve(import.meta.dirname, "../../.."), true, { info() {}, error() {} }, true);
const original = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "[::1]"].includes(original.hostname)) throw new Error("QA solo local.");
process.env.BETTER_AUTH_URL = "http://localhost:3041";
process.env.ESCENARA_QA_LOCAL = "1";
const produccion = process.argv.includes("--produccion");
if (produccion) delete process.env.ESCENARA_QA_LOCAL;
const { usarBaseDeDatosDePrueba } = await import("../src/server/db/bd-de-prueba");
await usarBaseDeDatosDePrueba("escenara_pruebas_admin_qa");
const { db } = await import("../src/server/db/cliente");
const { aplicarMigraciones } = await import("../src/server/db/migrar");
await aplicarMigraciones();
const { guardarAjustes } = await import("../src/server/ajustes");
await guardarAjustes(
  {
    registroAbierto: true,
    smtpHost: "localhost",
    smtpPuerto: 1021,
    smtpSeguro: false,
    smtpUsuario: "",
    comunidadActiva: true,
  },
  null,
);
const { fijarTransporte } = await import("../src/server/correo");
// El alta de fixtures no envía correo; el servidor separado sí usa Mailpit.
fijarTransporte({
  async sendMail() {
    return { accepted: [], rejected: [], messageId: "qa" };
  },
} as unknown as import("nodemailer").Transporter);
const { crearSesionDePrueba } = await import("../src/server/auth/sesion-de-prueba");
const { users, generationJobs, usageLedger, accountDeletions } = await import("../src/server/db/esquema");
const { eq } = await import("drizzle-orm");
const cuentas: Record<string, Awaited<ReturnType<typeof crearSesionDePrueba>>> = {};
for (const nombre of ["admin", "admin2", "pendiente", "usuario", "bloqueado", "borrado", "papelera"]) {
  const u = await crearSesionDePrueba(nombre.startsWith("admin") ? "admin" : "user");
  cuentas[nombre] = u;
  await db()
    .update(users)
    .set({
      name: `Demo ${nombre}`,
      emailVerified: !["pendiente", "papelera"].includes(nombre),
      banned: nombre === "bloqueado",
    })
    .where(eq(users.id, u.id));
  if (nombre === "borrado")
    await db()
      .insert(accountDeletions)
      .values({
        userId: u.id,
        scheduledFor: new Date(Date.now() + 7 * 86400000),
        availableAt: new Date(Date.now() + 7 * 86400000),
      });
}
const usuario = cuentas.usuario!;
for (const estado of ["listo", "desconocido", "enviado"] as const) {
  const [trabajo] = await db()
    .insert(generationJobs)
    .values({
      userId: usuario.id,
      kind: "fotograma",
      provider: "kie",
      model: "modelo-local-qa",
      state: estado,
      prompt: "Ejemplo sintético",
      input: {},
      estimatedCredits: 4,
    })
    .returning();
  await db()
    .insert(usageLedger)
    .values({
      userId: usuario.id,
      jobId: trabajo!.id,
      provider: "kie",
      model: "modelo-local-qa",
      entryType: estado === "listo" ? "consumo" : "reserva",
      credits: 4,
      amountEur: 0.04,
      informed: estado === "listo",
    });
}
await db().insert(usageLedger).values({
  userId: usuario.id,
  provider: "google",
  model: "modelo-local-qa",
  entryType: "ajuste",
  credits: 0.25,
  amountEur: null,
});
await Bun.write(
  "/tmp/escenara-admin-qa.json",
  JSON.stringify({ cuentas, url: process.env.BETTER_AUTH_URL, databaseUrl: process.env.DATABASE_URL }),
);
await chmod("/tmp/escenara-admin-qa.json", 0o600);
console.log("QA preparada en /tmp/escenara-admin-qa.json. Web local en puerto 3041.");
// Hereda configuración del entorno, pero el PostgreSQL del hijo es exclusivamente la BD aislada.
const hijo = Bun.spawn(["bun", "--bun", "next", ...(produccion ? ["start"] : ["dev", "--webpack"]), "--port", "3041"], {
  cwd: path.resolve(import.meta.dirname, ".."),
  env: process.env,
  stdout: "inherit",
  stderr: "inherit",
});
await hijo.exited;
