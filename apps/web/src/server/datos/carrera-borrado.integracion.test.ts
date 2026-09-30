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
const { generationJobs, projects, scenes, usageLedger } = await import("../db/esquema");
const { proyectoProducido } = await import("./datos-de-prueba");

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
});
