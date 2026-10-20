import { mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { hashPassword } from "better-auth/crypto";
import { esCuentaDedicada } from "./cuenta-dedicada";

/** Alta administrativa local, explícita e idempotente. Nunca imprime contraseñas ni claves de IA. */
const raiz = path.resolve(import.meta.dirname, "../../..");
loadEnvConfig(raiz, true, console, true);
// Opciones para dar de alta otras cuentas dedicadas (p. ej. la de tutoriales, sin rol de administración). Sin ellas,
// el alta es la de siempre: cuenta «Demos», administradora, con su acceso en `docs/privado/demos`.
function opcion(nombre: string, porDefecto: string): string {
  const i = process.argv.indexOf(nombre);
  if (i < 0) return porDefecto;
  const valor = process.argv[i + 1];
  if (!valor || valor.startsWith("--")) throw new Error(`${nombre} necesita un valor.`);
  return valor;
}
const nombre = opcion("--nombre", "Demos");
const rol = opcion("--rol", "admin");
const carpetaPrivada = opcion("--carpeta", "demos");
if (rol !== "admin" && rol !== "user") throw new Error("--rol solo admite «admin» o «user».");
if (!/^[a-z0-9-]+$/.test(carpetaPrivada)) throw new Error("--carpeta es un nombre simple dentro de docs/privado.");
const [destino, origen] = process.argv
  .slice(2)
  .filter((a, i, todos) => !a.startsWith("--") && !todos[i - 1]?.startsWith("--"));
if (!destino || !origen || destino === origen) {
  throw new Error(
    "Uso: bun scripts/preparar-cuenta-demos.ts CORREO_DESTINO CORREO_ADMIN_ORIGEN [--nombre N] [--rol admin|user] [--carpeta demos]",
  );
}
const { and, eq } = await import("drizzle-orm");
const { db, olvidarConexion } = await import("../src/server/db/cliente");
const { accounts, openaiProviders, providerCredentials, users } = await import("../src/server/db/esquema");
const { cifrar, descifrar } = await import("../src/server/boveda/cifrado");

let accesoNuevo: string | null = null;
try {
  const [admin] = await db().select().from(users).where(eq(users.email, origen));
  if (admin?.role !== "admin") throw new Error("La cuenta de origen no es administradora.");
  const [existente] = await db().select().from(users).where(eq(users.email, destino));
  // No convertir ni resetear una cuenta existente por accidente: el alta es para una cuenta dedicada.
  if (existente && existente.role !== rol)
    throw new Error(`La cuenta de destino existe con otro rol (se esperaba ${rol}).`);
  // Solo se reutiliza una cuenta que dio de alta este script: un correo equivocado no copia claves a una persona.
  if (existente && !esCuentaDedicada(raiz, existente.id, [carpetaPrivada]))
    throw new Error(
      `La cuenta de destino ya existe y no es dedicada: falta su acceso en docs/privado/${carpetaPrivada}.`,
    );
  const usuarioId = existente?.id ?? crypto.randomUUID();
  const credenciales = await db().select().from(providerCredentials).where(eq(providerCredentials.userId, admin.id));
  const compatibles = await db().select().from(openaiProviders).where(eq(openaiProviders.userId, admin.id));
  // Se comprueba todo el material antes de crear la cuenta. Un fallo de bóveda no deja una copia parcial.
  const claves = credenciales.map((c) => ({
    ...c,
    secret: cifrar(
      descifrar(c.secret, `credencial:${admin.id}:${c.provider}`),
      `credencial:${usuarioId}:${c.provider}`,
    ),
  }));
  const servicios = compatibles.map((c) => {
    const id = crypto.randomUUID();
    return {
      ...c,
      id,
      secret: cifrar(descifrar(c.secret, `compatible:${admin.id}:${c.id}`), `compatible:${usuarioId}:${id}`),
    };
  });
  const carpeta = path.join(raiz, "docs/privado", carpetaPrivada, usuarioId);
  await mkdir(carpeta, { recursive: true, mode: 0o700 });
  let passwordHash: string | null = null;
  if (!existente) {
    const password = crypto.randomUUID() + crypto.randomUUID();
    passwordHash = await hashPassword(password);
    accesoNuevo = path.join(carpeta, "acceso.json");
    const archivo = await open(accesoNuevo, "wx", 0o600);
    try {
      await archivo.writeFile(JSON.stringify({ email: destino, password, usuarioId }, null, 2));
    } finally {
      await archivo.close();
    }
  }
  await db().transaction(async (tx) => {
    if (!existente && passwordHash) {
      // El operador provisiona expresamente su cuenta: no se depende de SMTP ni de un registro público abierto.
      await tx.insert(users).values({ id: usuarioId, email: destino, name: nombre, role: rol, emailVerified: true });
      await tx
        .insert(accounts)
        .values({ userId: usuarioId, accountId: usuarioId, providerId: "credential", password: passwordHash });
    }
    for (const c of claves) {
      await tx
        .insert(providerCredentials)
        .values({
          userId: usuarioId,
          provider: c.provider,
          secret: c.secret,
          hint: c.hint,
          status: c.status,
          lastTestCode: c.lastTestCode,
          lastTestDetail: c.lastTestDetail,
          testedAt: c.testedAt,
        })
        .onConflictDoNothing({ target: [providerCredentials.userId, providerCredentials.provider] });
    }
    for (const c of servicios) {
      await tx
        .insert(openaiProviders)
        .values({
          id: c.id,
          userId: usuarioId,
          name: c.name,
          baseUrl: c.baseUrl,
          secret: c.secret,
          hint: c.hint,
          models: c.models,
          quotaBilling: c.quotaBilling,
          status: c.status,
          lastTestCode: c.lastTestCode,
          lastTestDetail: c.lastTestDetail,
          testedAt: c.testedAt,
          sortOrder: c.sortOrder,
        })
        .onConflictDoNothing({ target: [openaiProviders.userId, openaiProviders.name] });
    }
    // Verifica los contextos reales de destino, sin mostrar el valor de los secretos.
    const copiadas = await tx.select().from(providerCredentials).where(eq(providerCredentials.userId, usuarioId));
    for (const c of copiadas) descifrar(c.secret, `credencial:${usuarioId}:${c.provider}`);
    const serviciosCopiados = await tx.select().from(openaiProviders).where(eq(openaiProviders.userId, usuarioId));
    for (const c of serviciosCopiados) descifrar(c.secret, `compatible:${usuarioId}:${c.id}`);
    const [login] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, usuarioId), eq(accounts.providerId, "credential")));
    if (!login) throw new Error("La cuenta no tiene acceso por contraseña.");
  });
  console.log(JSON.stringify({ email: destino, usuarioId, carpetaPrivada: carpeta, cuentaNueva: !existente }));
  accesoNuevo = null;
} catch (error) {
  if (accesoNuevo) await unlink(accesoNuevo);
  throw error;
} finally {
  await olvidarConexion();
}
