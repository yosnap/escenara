import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Borrar un proyecto mientras se encola un trabajo suyo, y el worker ante un trabajo cuyo proyecto ya no existe.
 * Es dinero: un trabajo que sobreviviera al borrado saldría hacia el proveedor y se cobraría.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);
process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_carrera_borrado");
}

const { and, eq, sql } = await import("drizzle-orm");
const rutaProyecto = await import("@/app/api/proyectos/[id]/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { guardarCredencial } = await import("../boveda/credenciales");
const { enviarEncolados } = await import("../cola/pasada");
const { accountDeletions, generationJobs, projects, scenes, usageLedger } = await import("../db/esquema");
const { proyectoProducido } = await import("./datos-de-prueba");
const { encolar } = await import("../cola/encolar");
const { borrarPersonaje } = await import("../personajes/borrado");
const { characters } = await import("../db/esquema");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;

let llamadasAlProveedor = 0;
const buscar: Buscador = async (url) => {
  if (url.includes("/chat/credit")) {
    return new Response(JSON.stringify({ code: 200, msg: "success", data: 1000 }), { status: 200 });
  }
  llamadasAlProveedor++;
  throw new Error(`No se debería llamar al proveedor: ${url}`);
};
const h: Herramientas = {
  buscar,
  descargar: async () => {
    throw new Error("No se debería descargar nada.");
  },
};

const pedir = (s: Sesion, url: string, metodo = "GET") =>
  new Request(`http://localhost${url}`, {
    method: metodo,
    headers: { cookie: s.cookie, ...(metodo === "GET" ? {} : { origin: "http://localhost" }) },
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** Petición de encolado real, mínima: sin coste acotado (queda esperando límite), que no reserva nada. */
const peticionDe = (usuarioId: string, valores: { sceneId?: string; characterId?: string }) => ({
  usuarioId,
  claveIdempotencia: crypto.randomUUID(),
  proveedor: "kie" as const,
  acotacion: { acotado: false as const, motivo: "Sin coste acotado en la prueba." },
  valores: {
    userId: usuarioId,
    kind: "fotograma" as const,
    provider: "kie" as const,
    model: "nano-banana-2-lite",
    prompt: "",
    input: {},
    estimatedCredits: 4,
    ...valores,
  },
  sello: "",
  creditosDelEnvio: 4,
  escena: null,
});

const errorDe = (promesa: Promise<unknown>) =>
  promesa.then(
    () => null,
    (e: { estado?: number; message?: string }) => e,
  );

describe.skipIf(!hayBaseDeDatos)("borrar un proyecto a la vez que se encola", () => {
  let ana: Sesion;

  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_carrera_borrado");
    await aplicarMigraciones();
    ana = await crearSesionDePrueba("user");
    await guardarCredencial(ana.id, "kie", `sk-carrera-${randomBytes(10).toString("hex")}`, buscar);
  });

  afterAll(async () => {
    if (ana) await ana.borrar();
  });

  test("un encolado en curso (con la fila del usuario bloqueada) hace que el borrado espere y lo vea: 409", async () => {
    const p = await proyectoProducido({ id: ana.id, esAdmin: false });
    const escena = p.escenas[0] ?? "";
    let soltar = () => {};
    const liberado = new Promise<void>((r) => {
      soltar = r;
    });
    let dentro = () => {};
    const bloqueado = new Promise<void>((r) => {
      dentro = r;
    });
    // Lo que hace `encolar`: bloquear la fila del usuario, insertar el trabajo y confirmar al final.
    const encolado = db().transaction(async (tx) => {
      await tx.execute(sql`select 1 from users where id = ${ana.id} for update`);
      await tx.insert(generationJobs).values({
        userId: ana.id,
        kind: "fotograma",
        provider: "kie",
        model: "nano-banana-2-lite",
        prompt: "",
        input: {},
        sceneId: escena,
        projectId: p.proyectoId,
        state: "en_cola",
        estimatedCredits: 4,
      });
      dentro();
      await liberado;
    });
    await bloqueado;
    const borrado = rutaProyecto.DELETE(pedir(ana, `/api/proyectos/${p.proyectoId}`, "DELETE"), ctx(p.proyectoId));
    await Bun.sleep(300);
    soltar();
    await encolado;
    const respuesta = await borrado;
    expect(respuesta.status).toBe(409);
    // Nada a medias: el proyecto sigue y el trabajo sigue colgando de su escena (no suelto hacia el proveedor).
    expect(await db().select().from(projects).where(eq(projects.id, p.proyectoId))).toHaveLength(1);
    const enCola = await db()
      .select()
      .from(generationJobs)
      .where(and(eq(generationJobs.sceneId, escena), eq(generationJobs.state, "en_cola")));
    expect(enCola).toHaveLength(1);
  });

  test("el worker cierra sin cobro un trabajo cuyo proyecto se ha borrado, sin llamar al proveedor", async () => {
    const p = await proyectoProducido({ id: ana.id, esAdmin: false });
    const [trabajo] = await db()
      .insert(generationJobs)
      .values({
        userId: ana.id,
        kind: "fotograma",
        provider: "kie",
        model: "nano-banana-2-lite",
        prompt: "",
        input: {},
        sceneId: p.escenas[0] ?? null,
        projectId: p.proyectoId,
        state: "en_cola",
        estimatedCredits: 4,
      })
      .returning();
    if (!trabajo) throw new Error("sin trabajo");
    await db().insert(usageLedger).values({
      userId: ana.id,
      jobId: trabajo.id,
      provider: "kie",
      model: "nano-banana-2-lite",
      entryType: "reserva",
      credits: 4,
    });
    // La escena desaparece (como haría la cascada de un borrado que se colara): `scene_id` queda a nulo.
    await db().delete(scenes).where(eq(scenes.projectId, p.proyectoId));

    llamadasAlProveedor = 0;
    await enviarEncolados(h);
    expect(llamadasAlProveedor).toBe(0);
    const [cerrado] = await db().select().from(generationJobs).where(eq(generationJobs.id, trabajo.id));
    expect(cerrado?.state).not.toBe("en_cola");
    expect(cerrado?.sentAt).toBeNull();
    expect(cerrado?.errorMessage).toContain("se ha borrado");
    const apuntes = await db().select().from(usageLedger).where(eq(usageLedger.jobId, trabajo.id));
    const neto = apuntes.reduce((n, a) => n + a.credits, 0);
    expect(apuntes.some((a) => a.entryType === "liberacion")).toBe(true);
    expect(apuntes.filter((a) => a.entryType === "consumo").every((a) => a.credits === 0)).toBe(true);
    expect(neto).toBe(0);
  });

  test("orden inverso con el encolado real: el proyecto ya se ha borrado y encolar en su escena da 409 sin cobrar", async () => {
    const p = await proyectoProducido({ id: ana.id, esAdmin: false });
    const escena = p.escenas[0] ?? "";
    expect(
      (await rutaProyecto.DELETE(pedir(ana, `/api/proyectos/${p.proyectoId}`, "DELETE"), ctx(p.proyectoId))).status,
    ).toBe(200);
    const error = await errorDe(encolar(peticionDe(ana.id, { sceneId: escena })));
    expect(error?.estado).toBe(409);
    expect(error?.message).toContain("se acaba de borrar");
    expect(await db().select().from(generationJobs).where(eq(generationJobs.sceneId, escena))).toHaveLength(0);
  });

  test("borrar un personaje mientras se encola con él: el borrado espera, lo ve y responde 409", async () => {
    const [personaje] = await db()
      .insert(characters)
      .values({ ownerId: ana.id, name: `Carrera ${crypto.randomUUID().slice(0, 6)}`, kind: "persona" })
      .returning();
    if (!personaje) throw new Error("sin personaje");
    let soltar = () => {};
    const liberado = new Promise<void>((r) => {
      soltar = r;
    });
    let dentro = () => {};
    const bloqueado = new Promise<void>((r) => {
      dentro = r;
    });
    const encolado = db().transaction(async (tx) => {
      await tx.execute(sql`select 1 from users where id = ${ana.id} for update`);
      await tx.insert(generationJobs).values({
        userId: ana.id,
        kind: "fotograma",
        provider: "kie",
        model: "nano-banana-2-lite",
        prompt: "",
        input: {},
        characterId: personaje.id,
        requestedCharacterId: personaje.id,
        state: "en_cola",
        estimatedCredits: 4,
      });
      dentro();
      await liberado;
    });
    await bloqueado;
    const borrado = errorDe(borrarPersonaje({ id: ana.id, esAdmin: false }, personaje.id));
    await Bun.sleep(300);
    soltar();
    await encolado;
    const error = await borrado;
    expect(error?.estado).toBe(409);
    expect(await db().select().from(characters).where(eq(characters.id, personaje.id))).toHaveLength(1);
    const trabajos = await db().select().from(generationJobs).where(eq(generationJobs.characterId, personaje.id));
    expect(trabajos.filter((t) => t.state === "en_cola")).toHaveLength(1);
    await db().delete(generationJobs).where(eq(generationJobs.characterId, personaje.id));
  });

  test("orden inverso con el encolado real: el personaje ya se ha borrado y encolar con él da 409", async () => {
    const [personaje] = await db()
      .insert(characters)
      .values({ ownerId: ana.id, name: `Borrado ${crypto.randomUUID().slice(0, 6)}`, kind: "persona" })
      .returning();
    if (!personaje) throw new Error("sin personaje");
    await borrarPersonaje({ id: ana.id, esAdmin: false }, personaje.id);
    const error = await errorDe(encolar(peticionDe(ana.id, { characterId: personaje.id })));
    expect(error?.estado).toBe(409);
    expect(error?.message).toContain("personaje se acaba de borrar");
  });

  test("el worker cierra sin cobro un trabajo cuyo personaje se ha borrado, sin llamar al proveedor ni subir fotos", async () => {
    const [personaje] = await db()
      .insert(characters)
      .values({ ownerId: ana.id, name: `Worker ${crypto.randomUUID().slice(0, 6)}`, kind: "persona" })
      .returning();
    if (!personaje) throw new Error("sin personaje");
    const [trabajo] = await db()
      .insert(generationJobs)
      .values({
        userId: ana.id,
        kind: "fotograma",
        provider: "kie",
        model: "nano-banana-2-lite",
        prompt: "",
        input: { referencias: ["https://ejemplo.invalid/foto.png"] },
        characterId: null,
        requestedCharacterId: personaje.id,
        state: "en_cola",
        estimatedCredits: 4,
      })
      .returning();
    if (!trabajo) throw new Error("sin trabajo");
    await db()
      .insert(usageLedger)
      .values({
        userId: ana.id,
        jobId: trabajo.id,
        provider: "kie",
        model: "nano-banana-2-lite",
        entryType: "reserva",
        credits: 4,
      });
    await db().delete(characters).where(eq(characters.id, personaje.id));
    llamadasAlProveedor = 0;
    await enviarEncolados(h);
    expect(llamadasAlProveedor).toBe(0);
    const [cerrado] = await db().select().from(generationJobs).where(eq(generationJobs.id, trabajo.id));
    expect(cerrado?.sentAt).toBeNull();
    expect(cerrado?.errorMessage).toContain("personaje de este trabajo se ha borrado");
    const apuntes = await db().select().from(usageLedger).where(eq(usageLedger.jobId, trabajo.id));
    expect(apuntes.reduce((n, a) => n + a.credits, 0)).toBe(0);
  });

  test("en la gracia del borrado de la cuenta no sale nada: ni un trabajo encolado antes ni un reintento, y encolar da 409", async () => {
    const bea = await crearSesionDePrueba("user");
    try {
      await guardarCredencial(bea.id, "kie", `sk-gracia-${randomBytes(10).toString("hex")}`, buscar);
      const [enCola, reintento] = await db()
        .insert(generationJobs)
        .values(
          (["en_cola", "en_cola"] as const).map((state) => ({
            userId: bea.id,
            kind: "fotograma" as const,
            provider: "kie" as const,
            model: "nano-banana-2-lite",
            prompt: "",
            input: {},
            state,
            estimatedCredits: 4,
          })),
        )
        .returning();
      // El segundo simula un trabajo que se estaba preparando, falló de forma pasajera y volvió a la cola.
      await db()
        .update(generationJobs)
        .set({ attempts: 1 })
        .where(eq(generationJobs.id, reintento?.id ?? ""));
      for (const t of [enCola, reintento]) {
        await db()
          .insert(usageLedger)
          .values({
            userId: bea.id,
            jobId: t?.id ?? null,
            provider: "kie",
            model: "nano-banana-2-lite",
            entryType: "reserva",
            credits: 4,
          });
      }
      // Borrado programado escrito directamente, sin pasar por la cancelación de la cola al pedirlo.
      await db()
        .insert(accountDeletions)
        .values({
          userId: bea.id,
          scheduledFor: new Date(Date.now() + 86_400_000),
          availableAt: new Date(Date.now() + 86_400_000),
        });
      llamadasAlProveedor = 0;
      await enviarEncolados(h);
      expect(llamadasAlProveedor).toBe(0);
      for (const t of [enCola, reintento]) {
        const [f] = await db()
          .select()
          .from(generationJobs)
          .where(eq(generationJobs.id, t?.id ?? ""));
        expect(f?.sentAt).toBeNull();
        expect(f?.errorMessage).toContain("borrado programado");
        const apuntes = await db()
          .select()
          .from(usageLedger)
          .where(eq(usageLedger.jobId, t?.id ?? ""));
        expect(apuntes.reduce((n, a) => n + a.credits, 0)).toBe(0);
      }
      const error = await errorDe(encolar(peticionDe(bea.id, {})));
      expect(error?.estado).toBe(409);
      expect(error?.message).toContain("borrado programado");
    } finally {
      await bea.borrar();
    }
  });
});
