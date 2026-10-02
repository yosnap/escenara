import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { Transporter } from "nodemailer";

loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error() {} }, true);
const disponible = Boolean(process.env.DATABASE_URL);
if (disponible) {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("QA admin solo admite PostgreSQL local.");
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_generacion");
}
const { eq, inArray, sql } = await import("drizzle-orm");
const { db } = await import("../db/cliente");
const { aplicarMigraciones } = await import("../db/migrar");
const {
  adminEvents,
  adminMailEvents,
  adminUserTrash,
  accountDeletions,
  communityPosts,
  generationJobs,
  sessions,
  usageLedger,
  userPolicies,
  users,
} = await import("../db/esquema");
const { cambiarUsuario, cambiarPolitica } = await import("./acciones-usuario");
const { gestionarPapelera } = await import("./papelera-usuarios");
const { cancelarBorradoPorRestablecimiento } = await import("../datos/cancelar-por-restablecimiento");
const { ejecutarBorradoCuenta } = await import("../datos/borrado-cuenta-worker");
const { consultarConsumo } = await import("./consumo");
const { comunidadAdmin } = await import("./comunidad");
const { resumenAdmin } = await import("./resumen");
const { fichaUsuario, listarUsuarios } = await import("./usuarios");
const { reenviarActivacion } = await import("./correo-activacion");
const { exigirPresupuestoDisponible, reservar } = await import("../presupuesto/reserva");
const { depositoDe } = await import("../presupuesto/deposito");
const { marcarEnviando } = await import("../cola/toma");
const { auth } = await import("../auth/auth");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { fijarTransporte } = await import("../correo");
const admin = crypto.randomUUID(),
  segundo = crypto.randomUUID(),
  pendiente = crypto.randomUUID(),
  usuario = crypto.randomUUID(),
  borrado = crypto.randomUUID(),
  papelera = crypto.randomUUID();
const ids = [admin, segundo, pendiente, usuario, borrado, papelera];
const correo = (id: string) => `${id}@admin-prueba.test`;
const politica = (budgetMode: string, budgetValue: number | null) => ({
  budgetMode,
  budgetValue,
  jobMode: "sin-tope",
  jobValue: null,
});
const motivo = "Validación administrativa local";
let ajustes: Awaited<ReturnType<typeof leerAjustes>>;

describe.skipIf(!disponible)("administración SQL y correo local", () => {
  beforeAll(async () => {
    await aplicarMigraciones();
    ajustes = await leerAjustes();
    await db()
      .insert(users)
      .values(
        ids.map((id, i) => ({
          id,
          name: `Admin QA ${i}`,
          email: correo(id),
          role: i < 2 ? "admin" : "user",
          emailVerified: id !== pendiente,
        })),
      );
    await db()
      .insert(accountDeletions)
      .values({
        userId: borrado,
        scheduledFor: new Date(Date.now() + 86400000),
        availableAt: new Date(Date.now() + 86400000),
      });
  });
  afterAll(async () => {
    fijarTransporte({
      async sendMail() {
        return { accepted: [], rejected: [], messageId: "prueba" };
      },
    } as unknown as Transporter);
    const propios = await db()
      .select({ id: adminEvents.id })
      .from(adminEvents)
      .where(inArray(adminEvents.actorId, ids));
    for (const id of ids) await db().delete(users).where(eq(users.id, id));
    // Auditoría queda saneada por trigger. Limpiar solo eventos propios de esta prueba.
    if (propios.length)
      await db()
        .delete(adminEvents)
        .where(
          inArray(
            adminEvents.id,
            propios.map((e) => e.id),
          ),
        );
  });

  test("DTO, filtros combinados y permiso del servicio", async () => {
    await expect(listarUsuarios(usuario, {})).rejects.toThrow("administrativo");
    const lista = await listarUsuarios(admin, { q: correo(pendiente), verificado: "no", rol: "user" });
    expect(lista.total).toBe(1);
    expect(lista.filas[0]?.id).toBe(pendiente);
    expect(Object.keys(lista.filas[0] ?? {})).not.toContain("password");
    const ficha = await fichaUsuario(admin, borrado);
    expect(ficha?.usuario.borrado).toBe(true);
    expect(ficha?.plazo).toBeDefined();
  });
  test("activación idempotente, protección del borrado y motivo", async () => {
    const op = crypto.randomUUID();
    await cambiarUsuario(admin, pendiente, "activar", motivo, op);
    await cambiarUsuario(admin, pendiente, "activar", motivo, op);
    const [u] = await db().select().from(users).where(eq(users.id, pendiente));
    expect(u?.emailVerified).toBe(true);
    const eventos = await db().select().from(adminEvents).where(eq(adminEvents.operationId, op));
    expect(eventos).toHaveLength(1);
    await expect(cambiarUsuario(admin, borrado, "desbloquear", motivo, crypto.randomUUID())).rejects.toThrow("borrado");
    await expect(cambiarUsuario(admin, borrado, "bloquear", motivo, crypto.randomUUID())).rejects.toThrow("borrado");
    await expect(cambiarUsuario(usuario, pendiente, "bloquear", motivo, crypto.randomUUID())).rejects.toThrow(
      "administradora",
    );
    await expect(cambiarUsuario(admin, admin, "bloquear", motivo, crypto.randomUUID())).rejects.toThrow("propia");
  });
  test("fallo de auditoría revierte bloqueo y revocación", async () => {
    await db()
      .insert(sessions)
      .values({ userId: usuario, token: crypto.randomUUID(), expiresAt: new Date(Date.now() + 86400000) });
    await db().execute(
      sql.raw(
        `CREATE FUNCTION admin_qa_fallo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason = 'qa-forzar-fallo' THEN RAISE EXCEPTION 'fallo auditado de prueba'; END IF; RETURN NEW; END $$`,
      ),
    );
    await db().execute(
      sql.raw(
        "CREATE TRIGGER admin_qa_fallo BEFORE INSERT ON admin_events FOR EACH ROW EXECUTE FUNCTION admin_qa_fallo()",
      ),
    );
    try {
      await expect(
        cambiarUsuario(admin, usuario, "bloquear", "qa-forzar-fallo", crypto.randomUUID()),
      ).rejects.toThrow();
      const [u] = await db().select().from(users).where(eq(users.id, usuario));
      expect(u?.banned).toBe(false);
      expect(await db().select().from(sessions).where(eq(sessions.userId, usuario))).toHaveLength(1);
    } finally {
      await db().execute(sql.raw("DROP TRIGGER admin_qa_fallo ON admin_events; DROP FUNCTION admin_qa_fallo()"));
    }
  });
  test("bloqueo revoca sesiones y cierra fronteras; desbloquear no las restaura", async () => {
    const [job] = await db()
      .insert(generationJobs)
      .values({
        userId: usuario,
        kind: "fotograma",
        provider: "kie",
        model: "qa",
        state: "preparando",
        prompt: "Sintético",
        input: {},
        estimatedCredits: 4,
        idempotencyKey: crypto.randomUUID(),
        lockedBy: "qa",
        lockedUntil: new Date(Date.now() + 60000),
      })
      .returning();
    await cambiarUsuario(admin, usuario, "bloquear", motivo, crypto.randomUUID());
    expect(await db().select().from(sessions).where(eq(sessions.userId, usuario))).toHaveLength(0);
    await expect(marcarEnviando(job!.id, "qa")).rejects.toThrow("bloqueada");
    await expect(
      db().transaction(async (tx) => {
        await tx.execute(sql`select id from users where id = ${usuario} for update`);
        await exigirPresupuestoDisponible(tx, usuario, 1, ajustes);
      }),
    ).rejects.toThrow("bloqueada");
    await expect(
      db()
        .insert(sessions)
        .values({ userId: usuario, token: crypto.randomUUID(), expiresAt: new Date(Date.now() + 86400000) })
        .then(() => {}),
    ).rejects.toThrow();
    await cambiarUsuario(admin, usuario, "desbloquear", motivo, crypto.randomUUID());
    expect(await db().select().from(sessions).where(eq(sessions.userId, usuario))).toHaveLength(0);
    expect(await marcarEnviando(job!.id, "qa")).toBe(true);
    await cambiarUsuario(admin, usuario, "bloquear", motivo, crypto.randomUUID());
    const [enVuelo] = await db().select().from(generationJobs).where(eq(generationJobs.id, job!.id));
    expect(enVuelo?.state).toBe("enviando");
    await cambiarUsuario(admin, usuario, "desbloquear", motivo, crypto.randomUUID());
  });
  test("constraints de política y cuentas existentes heredan", async () => {
    for (const datos of [
      politica("limite", null),
      politica("limite", -1),
      politica("limite", Number.POSITIVE_INFINITY),
      politica("otro", null),
      politica("heredar", 3),
    ]) {
      await expect(
        db()
          .insert(userPolicies)
          .values({ userId: usuario, ...datos })
          .then(() => {}),
      ).rejects.toThrow();
    }
    const d = await depositoDe(usuario);
    expect(d.autorizado).toBe(ajustes.presupuestoCreditos > 0 ? ajustes.presupuestoCreditos : null);
    await expect(
      cambiarPolitica(admin, crypto.randomUUID(), politica("limite", 4), motivo, crypto.randomUUID()),
    ).rejects.toThrow();
  });
  test("dos reservas concurrentes no superan override; reducción conserva ledger", async () => {
    await cambiarPolitica(admin, usuario, politica("limite", 5), motivo, crypto.randomUUID());
    const operacion = () =>
      db().transaction(async (tx) => {
        await tx.execute(sql`select id from users where id = ${usuario} for update`);
        const [trabajo] = await tx
          .insert(generationJobs)
          .values({
            userId: usuario,
            kind: "fotograma",
            provider: "kie",
            model: "qa",
            prompt: "Sintético",
            input: {},
            estimatedCredits: 4,
          })
          .returning();
        return reservar(
          tx,
          { usuarioId: usuario, trabajoId: trabajo!.id, proveedor: "kie", modelo: "qa", creditos: 4, sello: "qa" },
          ajustes,
        );
      });
    const resultados = await Promise.allSettled([operacion(), operacion()]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await cambiarPolitica(admin, usuario, politica("limite", 1), motivo, crypto.randomUUID());
    expect((await depositoDe(usuario)).disponible).toBe(0);
    expect((await depositoDe(usuario)).reservado).toBe(4);
  });
  test("SMTP aceptado, fallido, incierto; token auténtico y frecuencia", async () => {
    await db().update(users).set({ emailVerified: false }).where(eq(users.id, pendiente));
    let capturado = "";
    fijarTransporte({
      async sendMail(m: { text: string; to: string }) {
        capturado = m.text;
        return { accepted: [m.to], rejected: [], messageId: "qa" };
      },
    } as unknown as Transporter);
    const op = crypto.randomUUID();
    expect(await reenviarActivacion(admin, pendiente, motivo, op)).toBe("aceptado");
    expect(await reenviarActivacion(admin, pendiente, motivo, op)).toBe("aceptado");
    await expect(reenviarActivacion(admin, pendiente, motivo, crypto.randomUUID())).rejects.toThrow("minuto");
    const url = new URL(capturado.match(/https?:\/\/\S+/)![0]);
    expect(url.pathname).toBe("/api/auth/verify-email");
    const token = url.searchParams.get("token")!;
    const respuesta = await (await auth()).api.verifyEmail({
      query: { token, callbackURL: "/entrar" },
      asResponse: true,
    });
    expect(respuesta.status).toBeLessThan(400);
    expect((await db().select().from(users).where(eq(users.id, pendiente)))[0]?.emailVerified).toBe(true);
    const evento = (await db().select().from(adminEvents).where(eq(adminEvents.operationId, op)))[0];
    expect(JSON.stringify(evento)).not.toContain(token);
    const tokens = await db().select().from(adminMailEvents).where(eq(adminMailEvents.operationId, op));
    expect(JSON.stringify(tokens)).not.toContain(token);
    await db().delete(adminMailEvents).where(eq(adminMailEvents.userId, pendiente));
    await db().update(users).set({ emailVerified: false }).where(eq(users.id, pendiente));
    fijarTransporte({
      async sendMail() {
        throw Object.assign(new Error("SMTP rechazado"), { responseCode: 550 });
      },
    } as unknown as Transporter);
    expect(await reenviarActivacion(admin, pendiente, motivo, crypto.randomUUID())).toBe("fallido");
    await db().delete(adminMailEvents).where(eq(adminMailEvents.userId, pendiente));
    fijarTransporte({
      async sendMail() {
        throw new Error("Conexión cortada");
      },
    } as unknown as Transporter);
    expect(await reenviarActivacion(admin, pendiente, motivo, crypto.randomUUID())).toBe("incierto");
    expect((await db().select().from(users).where(eq(users.id, pendiente)))[0]?.emailVerified).toBe(false);
  });
  test("token caducado y aceptación SMTP seguida de fallo SQL", async () => {
    const { createEmailVerificationToken } = await import("better-auth/api");
    const instancia = await auth();
    const ctx = await instancia.$context;
    const token = await createEmailVerificationToken(ctx.secret, correo(pendiente), undefined, -1);
    const respuesta = await instancia.api.verifyEmail({ query: { token }, asResponse: true });
    expect(respuesta.status).toBeGreaterThanOrEqual(400);
    await db().delete(adminMailEvents).where(eq(adminMailEvents.userId, pendiente));
    const op = crypto.randomUUID();
    let envios = 0;
    fijarTransporte({
      async sendMail(m: { to: string }) {
        envios++;
        return { accepted: [m.to], rejected: [], messageId: "qa" };
      },
    } as unknown as Transporter);
    await db().execute(
      sql.raw(
        `CREATE FUNCTION admin_qa_fallo_mail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation_id = '${op}'::uuid THEN RAISE EXCEPTION 'fallo resultado SQL'; END IF; RETURN NEW; END $$`,
      ),
    );
    await db().execute(
      sql.raw(
        "CREATE TRIGGER admin_qa_fallo_mail BEFORE UPDATE ON admin_mail_events FOR EACH ROW EXECUTE FUNCTION admin_qa_fallo_mail()",
      ),
    );
    try {
      expect(await reenviarActivacion(admin, pendiente, motivo, op)).toBe("incierto");
      expect(await reenviarActivacion(admin, pendiente, motivo, op)).toBe("solicitado");
      expect(envios).toBe(1);
      expect((await db().select().from(adminMailEvents).where(eq(adminMailEvents.operationId, op)))[0]?.state).toBe(
        "solicitado",
      );
    } finally {
      await db().execute(
        sql.raw("DROP TRIGGER admin_qa_fallo_mail ON admin_mail_events; DROP FUNCTION admin_qa_fallo_mail()"),
      );
    }
  });
  test("paginación estable y acotada con fechas iguales", async () => {
    const prefijo = `qa-pagina-${crypto.randomUUID()}`;
    const nuevos = Array.from({ length: 60 }, () => ({
      id: crypto.randomUUID(),
      name: prefijo,
      email: `${crypto.randomUUID()}@pagina.test`,
      createdAt: new Date("2026-09-01T00:00:00Z"),
    }));
    await db().insert(users).values(nuevos);
    try {
      const primera = await listarUsuarios(admin, { q: prefijo, pagina: "1" });
      const segunda = await listarUsuarios(admin, { q: prefijo, pagina: "2" });
      expect(primera.total).toBe(60);
      expect(primera.filas).toHaveLength(25);
      expect(segunda.filas).toHaveLength(25);
      expect(new Set([...primera.filas, ...segunda.filas].map((u) => u.id)).size).toBe(50);
      const repetida = await listarUsuarios(admin, { q: prefijo, pagina: "1" });
      expect(repetida.filas.map((u) => u.id)).toEqual(primera.filas.map((u) => u.id));
    } finally {
      await db()
        .delete(users)
        .where(
          inArray(
            users.id,
            nuevos.map((u) => u.id),
          ),
        );
    }
  });
  test("ledger: proveedores, euros históricos y contadores de entidades", async () => {
    await db()
      .insert(usageLedger)
      .values([
        {
          userId: pendiente,
          provider: "kie",
          model: "qa",
          entryType: "consumo",
          credits: 100,
          amountEur: 0.5,
          informed: true,
        },
        {
          userId: pendiente,
          provider: "google",
          model: "qa",
          entryType: "consumo",
          credits: 200,
          amountEur: null,
          informed: false,
        },
      ]);
    const consumo = await consultarConsumo(admin, { usuario: pendiente });
    expect(consumo.total).toBe(0);
    expect(consumo.agregados.find((a) => a.proveedor === "kie")?.euros).toBe(0.5);
    expect(consumo.agregados.find((a) => a.proveedor === "google")?.euros).toBeNull();
    expect(consumo.agregados.find((a) => a.proveedor === "google")?.sin_euros).toBe(1);
  });
  test("configuración concurrente por patch no pierde cambios", async () => {
    const base = await leerAjustes();
    const nuevo = base.retencionCorreosDias === 30 ? 31 : 30;
    try {
      await guardarAjustes({ retencionCorreosDias: nuevo }, admin, { retencionCorreosDias: base.retencionCorreosDias });
      await expect(
        guardarAjustes({ retencionCorreosDias: 90 }, segundo, { retencionCorreosDias: base.retencionCorreosDias }),
      ).rejects.toThrow("Recarga");
      await guardarAjustes({ retencionAuditoriaDias: 60 }, segundo, {
        retencionAuditoriaDias: base.retencionAuditoriaDias,
      });
      expect((await leerAjustes()).retencionCorreosDias).toBe(nuevo);
    } finally {
      await guardarAjustes(
        { retencionCorreosDias: base.retencionCorreosDias, retencionAuditoriaDias: base.retencionAuditoriaDias },
        null,
      );
    }
  });
  test("minimización al borrar cuenta conserva evento sin motivo privado", async () => {
    const id = crypto.randomUUID();
    await db()
      .insert(users)
      .values({ id, name: "Temporal", email: correo(id) });
    const op = crypto.randomUUID();
    await cambiarUsuario(admin, id, "activar", "Motivo sintético a minimizar", op);
    await db().delete(users).where(eq(users.id, id));
    const [evento] = await db().select().from(adminEvents).where(eq(adminEvents.operationId, op));
    expect(evento?.targetId).toBeNull();
    expect(evento?.reason).toBe("Cuenta eliminada");
    expect(evento?.changes).toEqual({});
  });
  test("cambio de política concurrente espera a la reserva y conserva el compromiso", async () => {
    await cambiarPolitica(admin, usuario, politica("limite", 5), motivo, crypto.randomUUID());
    let liberar = () => {};
    let avisar = () => {};
    const espera = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    const tomado = new Promise<void>((resolver) => {
      avisar = resolver;
    });
    const reserva = db().transaction(async (tx) => {
      await tx.execute(sql`select id from users where id = ${usuario} for update`);
      avisar();
      await espera;
      const [trabajo] = await tx
        .insert(generationJobs)
        .values({
          userId: usuario,
          kind: "fotograma",
          provider: "kie",
          model: "qa",
          prompt: "Sintético",
          input: {},
          estimatedCredits: 1,
        })
        .returning();
      if (!trabajo) throw new Error("Fixture ausente.");
      await reservar(
        tx,
        { usuarioId: usuario, trabajoId: trabajo.id, proveedor: "kie", modelo: "qa", creditos: 1, sello: "qa" },
        ajustes,
      );
    });
    await tomado;
    const cambio = cambiarPolitica(admin, usuario, politica("limite", 1), motivo, crypto.randomUUID());
    liberar();
    await Promise.all([reserva, cambio]);
    const deposito = await depositoDe(usuario);
    expect(deposito.reservado).toBe(5);
    expect(deposito.disponible).toBe(0);
    await expect(
      db().transaction(async (tx) => {
        await tx.execute(sql`select id from users where id = ${usuario} for update`);
        await exigirPresupuestoDisponible(tx, usuario, 1, ajustes);
      }),
    ).rejects.toThrow();
  });
  test("resumen y comunidad cuentan entidades dentro del intervalo y paginan sin datos privados", async () => {
    const fecha = new Date("2050-01-15T12:00:00Z");
    await db()
      .insert(communityPosts)
      .values(
        Array.from({ length: 30 }, (_, i) => ({
          authorId: i % 2 ? admin : pendiente,
          kind: "plantilla" as const,
          title: `Publicación sintética ${i}`,
          description: "Texto privado que no debe llegar al DTO",
          signature: "Demo",
          consentText: "Declaración sintética de QA",
          consentAt: fecha,
          createdAt: fecha,
          state: "pendiente" as const,
        })),
      );
    const filtros = { desde: "2050-01-01", hasta: "2050-02-01", estado: "pendiente" };
    const pagina = await comunidadAdmin(admin, filtros);
    expect(pagina.total).toBe(30);
    expect(pagina.autores).toBe(2);
    expect(pagina.filas).toHaveLength(25);
    expect(pagina.filas.every((fila) => !("description" in fila))).toBe(true);
    const otra = await comunidadAdmin(admin, { ...filtros, pagina: "2" });
    expect(otra.filas).toHaveLength(5);
    expect(otra.filas.some((fila) => pagina.filas.some((p) => p.id === fila.id))).toBe(false);
    const resumen = await resumenAdmin(admin, filtros);
    const bloque = resumen.bloques[2];
    expect(bloque.status).toBe("fulfilled");
    if (bloque.status === "fulfilled") expect(bloque.value).toEqual([{ estado: "pendiente", n: 30, autores: 2 }]);
    expect(resumen.bloques[1].status).toBe("fulfilled");
  });
  test("eliminados conserva la cuenta, revoca sesiones, filtra y restaura sin recuperar sesiones", async () => {
    await db()
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: papelera,
        token: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 86400000),
      });
    await expect(gestionarPapelera(usuario, papelera, "eliminar", motivo, crypto.randomUUID())).rejects.toThrow();
    await expect(gestionarPapelera(admin, admin, "eliminar", motivo, crypto.randomUUID())).rejects.toThrow();
    const op = crypto.randomUUID();
    await gestionarPapelera(admin, papelera, "eliminar", motivo, op);
    await gestionarPapelera(admin, papelera, "eliminar", motivo, op);
    expect((await db().select().from(users).where(eq(users.id, papelera)))[0]?.banned).toBe(true);
    expect(await db().select().from(sessions).where(eq(sessions.userId, papelera))).toHaveLength(0);
    expect(await db().select().from(accountDeletions).where(eq(accountDeletions.userId, papelera))).toHaveLength(0);
    expect((await listarUsuarios(admin, { q: correo(papelera) })).total).toBe(0);
    expect((await listarUsuarios(admin, { q: correo(papelera) })).contadores).toEqual({
      activos: 0,
      eliminados: 1,
      todos: 1,
    });
    expect((await listarUsuarios(admin, { q: correo(papelera), papelera: "si" })).filas[0]?.eliminado).toBe(true);
    expect((await listarUsuarios(admin, { q: correo(papelera), papelera: "todos" })).total).toBe(1);
    await expect(cambiarUsuario(admin, papelera, "desbloquear", motivo, crypto.randomUUID())).rejects.toThrow();
    // Ni una escritura externa del flag de bloqueo permite crear sesión estando en la papelera.
    await db().update(users).set({ banned: false }).where(eq(users.id, papelera));
    await expect(
      db()
        .insert(sessions)
        .values({
          id: crypto.randomUUID(),
          userId: papelera,
          token: crypto.randomUUID(),
          expiresAt: new Date(Date.now() + 86400000),
        })
        .execute(),
    ).rejects.toThrow();
    await gestionarPapelera(admin, papelera, "restaurar", motivo, crypto.randomUUID());
    expect((await db().select().from(users).where(eq(users.id, papelera)))[0]?.banned).toBe(false);
    expect(await db().select().from(adminUserTrash).where(eq(adminUserTrash.userId, papelera))).toHaveLength(0);
    expect(await db().select().from(sessions).where(eq(sessions.userId, papelera))).toHaveLength(0);
    expect((await listarUsuarios(admin, { q: correo(papelera) })).total).toBe(1);
    expect((await listarUsuarios(admin, { q: correo(papelera) })).contadores).toEqual({
      activos: 1,
      eliminados: 0,
      todos: 1,
    });
  });
  test("restaurar conserva el bloqueo previo y el definitivo exige plazo y autorización explícita", async () => {
    await db().update(users).set({ banned: true, banReason: "Bloqueo previo" }).where(eq(users.id, papelera));
    await gestionarPapelera(admin, papelera, "eliminar", motivo, crypto.randomUUID());
    await gestionarPapelera(admin, papelera, "restaurar", motivo, crypto.randomUUID());
    expect((await db().select().from(users).where(eq(users.id, papelera)))[0]?.banReason).toBe("Bloqueo previo");
    await gestionarPapelera(admin, papelera, "eliminar", motivo, crypto.randomUUID());
    await db()
      .update(adminUserTrash)
      .set({ eligibleAt: new Date(Date.now() + 86400000) })
      .where(eq(adminUserTrash.userId, papelera));
    await expect(gestionarPapelera(admin, papelera, "definitivo", motivo, crypto.randomUUID())).rejects.toThrow(
      "plazo",
    );
    await db()
      .update(adminUserTrash)
      .set({ eligibleAt: new Date(Date.now() - 1000) })
      .where(eq(adminUserTrash.userId, papelera));
    const op = crypto.randomUUID();
    await gestionarPapelera(admin, papelera, "definitivo", motivo, op);
    await gestionarPapelera(admin, papelera, "definitivo", motivo, op);
    expect(await db().select().from(accountDeletions).where(eq(accountDeletions.userId, papelera))).toHaveLength(1);
    expect(await db().select().from(users).where(eq(users.id, papelera))).toHaveLength(1);
    expect(
      (await db().select().from(adminUserTrash).where(eq(adminUserTrash.userId, papelera)))[0]?.permanentRequestedAt,
    ).not.toBeNull();
    await expect(gestionarPapelera(admin, papelera, "restaurar", motivo, crypto.randomUUID())).rejects.toThrow(
      "autorizado",
    );
    expect(await cancelarBorradoPorRestablecimiento(papelera)).toBe(false);
    const [pedido] = await db()
      .update(accountDeletions)
      .set({ lockedBy: "qa-admin", lockedUntil: new Date(Date.now() + 60000) })
      .where(eq(accountDeletions.userId, papelera))
      .returning();
    if (!pedido) throw new Error("Falta el borrado sintético.");
    const objetos: string[] = [];
    expect(
      await ejecutarBorradoCuenta(pedido, "qa-admin", async (clave) => {
        objetos.push(clave);
      }),
    ).toBe("completado");
    expect(await db().select().from(users).where(eq(users.id, papelera))).toHaveLength(0);
    expect(await db().select().from(adminUserTrash).where(eq(adminUserTrash.userId, papelera))).toHaveLength(0);
    expect(objetos).toHaveLength(0);
    await db().delete(accountDeletions).where(eq(accountDeletions.id, pedido.id));
  });
  test("acciones concurrentes no permiten que dos admins se bloqueen mutuamente", async () => {
    const resultados = await Promise.allSettled([
      cambiarUsuario(admin, segundo, "bloquear", motivo, crypto.randomUUID()),
      cambiarUsuario(segundo, admin, "bloquear", motivo, crypto.randomUUID()),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const filas = await db().select().from(users).where(sql`${users.id} in (${admin}, ${segundo})`);
    expect(filas.filter((u) => !u.banned)).toHaveLength(1);
  });
});
