import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Causa del fallo de una tarea que el proveedor aceptó y no completó, de punta a punta: la consulta a KIE
 * (simulada, nunca se llama de verdad), el cierre del trabajo en la base de datos, el mensaje de la escena y la
 * vista que recibe el navegador. Lo que se comprueba: la causa propia se guarda y se explica, el texto del
 * proveedor no llega a ningún sitio, y los trabajos antiguos se siguen viendo como antes.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_causa_fallo");
}

const { eq } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, projects, scenes, users } = await import("../db/esquema");
const { products } = await import("../db/esquema-productos");
const { guardarCredencial } = await import("../boveda/credenciales");
const { reconciliar } = await import("./seguimiento");
const { obtenerTrabajo } = await import("./trabajos");
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("./herramientas").Herramientas;

const CLAVE = "sk-clave-de-kie-inventada-para-la-causa";
const MODELO_OMNI = "google/gemini-omni-flash-1-1";
const TEXTO_GOOGLE = "Request blocked: The generation was blocked by Google safety review.";

/** Lo que devolverá `recordInfo` para cada tarea. */
const tareas = new Map<string, { failCode: string; failMsg: string; creditos: number }>();

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const buscar: Buscador = async (url) => {
  if (url.includes("/chat/credit")) return sobre(500);
  if (url.includes("recordInfo")) {
    const taskId = new URL(url).searchParams.get("taskId") ?? "";
    const tarea = tareas.get(taskId);
    if (!tarea) return sobre({ state: "waiting", failMsg: "" });
    return sobre({
      taskId,
      state: "fail",
      resultJson: "",
      failCode: tarea.failCode,
      failMsg: tarea.failMsg,
      creditsConsumed: tarea.creditos,
    });
  }
  throw new Error(`URL no simulada: ${url}`);
};

const h: Herramientas = {
  buscar,
  descargar: async () => {
    throw new Error("Este test no descarga nada.");
  },
};

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;

describe.skipIf(!hayBaseDeDatos)("causa del fallo del proveedor", () => {
  let ana: Sesion;

  beforeAll(async () => {
    await aplicarMigraciones();
    ana = await crearSesionDePrueba("user");
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
  });

  afterAll(async () => {
    if (ana?.email) await db().delete(users).where(eq(users.email, ana.email));
  });

  /** Trabajo ya enviado a KIE, con o sin escena y producto, cuya tarea falla con lo que se le diga. */
  async function trabajoQueFalla(
    fallo: { failCode: string; failMsg: string; creditos: number },
    { conEscena }: { conEscena: boolean },
  ) {
    let sceneId: string | null = null;
    let productId: string | null = null;
    if (conEscena) {
      const [producto] = await db()
        .insert(products)
        .values({
          ownerId: ana.id,
          name: `Crema ${crypto.randomUUID().slice(0, 8)}`,
          description: "Bote blanco.",
          kind: "fisico",
        })
        .returning();
      const [proyecto] = await db().insert(projects).values({ userId: ana.id, title: "Anuncio" }).returning();
      const [escena] = await db()
        .insert(scenes)
        .values({ projectId: proyecto?.id ?? "", sortOrder: 0, productId: producto?.id ?? null })
        .returning();
      sceneId = escena?.id ?? null;
      productId = producto?.id ?? null;
    }
    const taskId = `tarea_${crypto.randomUUID()}`;
    tareas.set(taskId, fallo);
    const [fila] = await db()
      .insert(generationJobs)
      .values({
        userId: ana.id,
        kind: "animacion",
        provider: "kie",
        model: MODELO_OMNI,
        prompt: "Presenta la crema a cámara.",
        input: {},
        estimatedCredits: 40,
        state: "enviado",
        taskId,
        sceneId,
        productId,
      })
      .returning();
    if (!fila) throw new Error("No se ha podido crear el trabajo de prueba.");
    return { id: fila.id, sceneId };
  }

  test("el bloqueo de seguridad se guarda como causa propia, con su mensaje, y sin el texto del proveedor", async () => {
    const { id, sceneId } = await trabajoQueFalla(
      { failCode: "400", failMsg: `${TEXTO_GOOGLE} (key ${CLAVE})`, creditos: 0 },
      { conEscena: true },
    );
    const vista = await reconciliar({ id: ana.id, esAdmin: false }, id, h);

    expect(vista.estado).toBe("fallido");
    expect(vista.motivoFallo).toBe("contenido");
    expect(vista.causaFallo).toBe("bloqueo_seguridad");
    expect(vista.error).toContain("El filtro de seguridad de Gemini Omni 1.1 Flash (vídeo), en KIE.ai, bloqueó");
    expect(vista.error).toContain("bloqueó la generación (no se ha cobrado nada)");
    expect(vista.error).toContain("quitar el producto o usar menos fotos suyas");

    const [fila] = await db().select().from(generationJobs).where(eq(generationJobs.id, id));
    expect(fila?.failureReason).toBe("contenido");
    expect(fila?.failureCause).toBe("bloqueo_seguridad");
    expect(fila?.consumedCredits).toBe(0);
    const [escena] = await db()
      .select()
      .from(scenes)
      .where(eq(scenes.id, sceneId ?? ""));
    expect(escena?.lastFailureReason).toContain(
      "El filtro de seguridad de Gemini Omni 1.1 Flash (vídeo), en KIE.ai, bloqueó",
    );
    expect(escena?.lastFailureReason).toContain("No se ha vuelto a enviar nada.");

    // Nada del texto del proveedor en la fila, en la escena ni en lo que ve el navegador.
    const todo = JSON.stringify({ fila, escena, vista }).toLowerCase();
    for (const trozo of [CLAVE.toLowerCase(), "google safety review", "request blocked"]) {
      expect(todo).not.toContain(trozo);
    }
  });

  test("un fallo que no se reconoce se cierra con el mensaje genérico de siempre y sin la clave repetida", async () => {
    const { id, sceneId } = await trabajoQueFalla(
      { failCode: "500", failMsg: `generation failed for request with key ${CLAVE}`, creditos: 0 },
      { conEscena: true },
    );
    const vista = await reconciliar({ id: ana.id, esAdmin: false }, id, h);
    expect(vista.causaFallo).toBe("desconocida");
    expect(vista.error).toBe("El proveedor no ha podido completar la generación. No se ha vuelto a enviar nada.");
    const [escena] = await db()
      .select()
      .from(scenes)
      .where(eq(scenes.id, sceneId ?? ""));
    expect(escena?.lastFailureReason).toBe(
      "El proveedor no ha podido completar la generación. No se ha vuelto a enviar nada: si quieres reintentarlo, autoriza un presupuesto de reintentos.",
    );
    const [fila] = await db().select().from(generationJobs).where(eq(generationJobs.id, id));
    expect(JSON.stringify({ fila, vista, escena })).not.toContain(CLAVE);
  });

  test("sin producto no se sugiere quitarlo", async () => {
    const { id } = await trabajoQueFalla({ failCode: "400", failMsg: TEXTO_GOOGLE, creditos: 0 }, { conEscena: false });
    const vista = await reconciliar({ id: ana.id, esAdmin: false }, id, h);
    expect(vista.causaFallo).toBe("bloqueo_seguridad");
    expect(vista.error).not.toContain("producto");
    expect(vista.error).toContain("Prueba a: cambiar la descripción o generar con otro modelo.");
  });

  test("un trabajo antiguo que falló por contenido se sigue viendo como antes, sin causa", async () => {
    const [fila] = await db()
      .insert(generationJobs)
      .values({
        userId: ana.id,
        kind: "animacion",
        provider: "kie",
        model: MODELO_OMNI,
        prompt: "Clip antiguo.",
        input: {},
        estimatedCredits: 40,
        state: "fallido",
        taskId: `antigua_${crypto.randomUUID()}`,
        failureReason: "contenido",
        errorMessage: "El proveedor no ha podido completar la generación. No se ha vuelto a enviar nada.",
        finishedAt: new Date(),
      })
      .returning();
    const vista = await obtenerTrabajo(ana.id, fila?.id ?? "");
    expect(vista.motivoFallo).toBe("contenido");
    expect(vista.causaFallo).toBeNull();
    expect(vista.error).toBe("El proveedor no ha podido completar la generación. No se ha vuelto a enviar nada.");
  });
});
