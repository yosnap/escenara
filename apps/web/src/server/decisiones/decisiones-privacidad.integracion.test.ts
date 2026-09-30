import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Privacidad del registro de decisiones y de la sombra, contra el PostgreSQL local. **Ninguna llamada a TypeSafe**:
 * Jev se simula por su punto de inyección y se guarda lo que se le habría mandado.
 *
 * - ningún nombre de persona ni de producto queda en la base ni sale en el panel, tampoco en las filas viejas que
 *   limpia la migración;
 * - una escena con una persona real no se manda a la sombra;
 * - en las demás, los nombres de los personajes y del producto se sustituyen antes de enviar;
 * - la sombra no se puede encender sin aceptar antes que TypeSafe recibe el texto.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_decisiones");
}

const { eq, sql } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { characters, controlEvaluations, projects, rateLimits, sceneCharacters, scenes, shadowEvaluations, users } =
  await import("../db/esquema");
const { products } = await import("../db/esquema-productos");
const { guardarAjustes } = await import("../ajustes");
const { guardarSecreto } = await import("../boveda/secretos");
const { HERRAMIENTAS_JEV } = await import("../coherencia/decidir");
const { CARPETA_MIGRACIONES } = await import("../db/migrar");
const { exigirControles } = await import("../controles/puerta");
const { esperarSombras, evaluarEnSombra } = await import("./sombra");
const { decisionesRecientes } = await import("./consulta");
const fixtures = await import("../coherencia/fixtures");
type Hechos = import("../controles/contrato").Hechos;

const CLAVE_JEV = "ts-clave-de-la-sombra-inventada-5555";
const PERSONA = "Elisabeth Ruiz";

let enviados: string[] = [];
const buscar = (async (entrada: string | URL | Request, opciones?: RequestInit) => {
  const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.toString() : entrada.url;
  if (!url.startsWith("https://api.typesafe.ai/")) throw new Error(`URL no simulada: ${url}`);
  enviados.push(String(opciones?.body ?? ""));
  return fixtures.respuestaGrabada({
    model: "jev-1.13.0",
    answers: { coherencia: { type: "noul", noul: 0.9 } },
    usage: { input_tokens: 400, output_tokens: 8 },
  });
}) as unknown as typeof fetch;

/** Hechos con el personaje sin poder generar: el motivo del motor lo nombra entre «». */
const hechosConNombre = (): Hechos => ({
  tipo: "fotograma",
  parametros: { exigirCoberturaVistas: false, exigirPrecioFresco: false, maximoAvisos: 3 },
  credencial: { nombreProveedor: "KIE.ai", proveedorAdmitido: true, motivo: null, saldo: 500 },
  modelo: {
    nombre: "Nano Banana 2 Lite",
    maximoReferencias: 6,
    precioComprobado: "2026-09-27",
    precioCaducado: false,
    costeAcotado: true,
    motivoSinAcotar: "",
  },
  personaje: {
    nombre: PERSONA,
    impedimentos: [`El consentimiento de ${PERSONA} está revocado.`],
    vistasSinCubrir: [],
    referenciasSenaladas: 0,
  },
  presupuesto: {
    creditos: 10,
    topeTrabajo: 500,
    disponibleUsuario: 1000,
    retenidoUsuario: 0,
    trabajosEnRevision: 0,
    llamadasDeTextoColgadas: 0,
    revisionesColgadas: 0,
    autorizadoProyecto: 1000,
    comprometidoProyecto: 0,
  },
  cuota: { previstoBytes: 1_000, libresBytes: 10_000_000 },
  escena: {
    planAprobado: true,
    aprobada: false,
    motivoInvalidacion: `Se creó la versión 2 del personaje «${PERSONA}», que cambia el pelo.`,
    guionEnClipMudo: false,
    precioCambiado: false,
    fichaCambiada: true,
    plantillaCambiada: false,
    afirmacionesPorVerificar: 0,
  },
});

/** Los pasos de datos de la migración 0057, tal cual están en su fichero. */
async function pasosDeDatosDeLaMigracion(): Promise<string[]> {
  const fichero = await readFile(path.join(CARPETA_MIGRACIONES, "0057_decisiones-registradas-y-sombra.sql"), "utf8");
  return fichero
    .split("--> statement-breakpoint")
    .map((sentencia) => sentencia.trim())
    .filter((sentencia) => sentencia.startsWith('UPDATE "control_evaluations"'));
}

describe.skipIf(!hayBaseDeDatos)("privacidad de las decisiones y de la sombra", () => {
  let usuarioId = "";
  let proyectoId = "";
  let escenaId = "";

  beforeAll(async () => {
    await aplicarMigraciones();
    await db().delete(users);
    usuarioId = (await crearSesionDePrueba("user")).id;
    HERRAMIENTAS_JEV.buscar = buscar;
    await guardarSecreto("typesafeApiKey", CLAVE_JEV, null);
  });

  beforeEach(async () => {
    await db().delete(controlEvaluations);
    await db().delete(projects);
    await db().delete(characters);
    await db().delete(rateLimits);
    enviados = [];
    const [proyecto] = await db().insert(projects).values({ userId: usuarioId, title: "Anuncio" }).returning();
    proyectoId = proyecto?.id ?? "";
    const [escena] = await db()
      .insert(scenes)
      .values({
        projectId: proyectoId,
        sortOrder: 1,
        scriptText: "Nuria Vidal dice que la Crema Lumi quita el 90 % de las arrugas.",
      })
      .returning();
    escenaId = escena?.id ?? "";
    await guardarAjustes({ sombraEncargadoAceptado: true, sombraActiva: true }, null);
  });

  afterEach(async () => {
    await esperarSombras();
  });

  afterAll(async () => {
    HERRAMIENTAS_JEV.buscar = undefined;
    await guardarAjustes({ sombraActiva: false, sombraEncargadoAceptado: false }, null);
  });

  test("un motivo con el nombre de una persona no queda en la base ni sale en el panel", async () => {
    await expect(
      exigirControles({ usuarioId, sujeto: "trabajo", sujetoId: null, tipo: "fotograma" }, hechosConNombre()),
    ).rejects.toThrow(PERSONA);
    const [fila] = await db().select().from(controlEvaluations).where(eq(controlEvaluations.userId, usuarioId));
    expect(fila).toBeDefined();
    expect(JSON.stringify(fila)).not.toContain("Elisabeth");
    expect(JSON.stringify(fila?.rules)).toContain("«el personaje»");
    expect(JSON.stringify(await decisionesRecientes())).not.toContain("Elisabeth");
  });

  test("la migración oculta los nombres de las filas viejas sin borrarlas, y corrige su puerta", async () => {
    const [vieja] = await db()
      .insert(controlEvaluations)
      .values({
        userId: usuarioId,
        subject: "montaje",
        subjectId: null,
        jobKind: "montaje",
        state: "bloqueado",
        rulesVersion: "2026-09-29.1",
        rules: [
          {
            regla: "consentimiento",
            estado: "bloqueado",
            motivo: "«Elisabeth» no se puede usar para generar todavía.",
            accion: "Revísalo en «Tu cuenta».",
          },
        ],
        confirmed: [],
        action: "",
      })
      .returning();
    const pasos = await pasosDeDatosDeLaMigracion();
    expect(pasos).toHaveLength(2);
    for (let vez = 0; vez < 2; vez++) {
      for (const paso of pasos) await db().execute(sql.raw(paso));
    }
    const [limpia] = await db()
      .select()
      .from(controlEvaluations)
      .where(eq(controlEvaluations.id, vieja?.id ?? ""));
    expect(limpia?.rules[0]?.motivo).toBe("«nombre oculto» no se puede usar para generar todavía.");
    // Las citas fijas del motor se quedan.
    expect(limpia?.rules[0]?.accion).toBe("Revísalo en «Tu cuenta».");
    expect(limpia?.gate).toBe("frenos");
  });

  test("el panel oculta los nombres aunque una fila vieja se haya quedado sin limpiar", async () => {
    await db()
      .insert(controlEvaluations)
      .values({
        userId: usuarioId,
        subject: "escena",
        subjectId: escenaId,
        jobKind: "fotograma",
        state: "bloqueado",
        rulesVersion: "2026-09-29.1",
        rules: [
          { regla: "consentimiento", estado: "bloqueado", motivo: "Las referencias de «Elisa» no cubren.", accion: "" },
        ],
        confirmed: [],
      });
    const [decision] = await decisionesRecientes();
    expect(decision?.reglas[0]?.motivo).toBe("Las referencias de «nombre oculto» no cubren.");
  });

  test("una escena con una persona real no se manda a la sombra, tenga o no consentimiento", async () => {
    const [real] = await db()
      .insert(characters)
      .values({ ownerId: usuarioId, name: PERSONA, kind: "persona", virtual: false })
      .returning();
    await db()
      .update(projects)
      .set({ mainCharacterId: real?.id ?? null })
      .where(eq(projects.id, proyectoId));
    const peticion = {
      evaluacionId: "",
      usuarioId,
      sujeto: "escena" as const,
      sujetoId: escenaId,
      reglaAfirmaciones: false,
    };
    expect(await evaluarEnSombra(peticion)).toBe("persona-real");

    // También si va en el reparto y no como protagonista.
    await db().update(projects).set({ mainCharacterId: null }).where(eq(projects.id, proyectoId));
    await db()
      .insert(sceneCharacters)
      .values({ sceneId: escenaId, characterId: real?.id ?? "" });
    expect(await evaluarEnSombra(peticion)).toBe("persona-real");
    expect(enviados).toHaveLength(0);
  });

  test("con personajes inventados, sus nombres y el del producto se sustituyen antes de enviar", async () => {
    const [inventada] = await db()
      .insert(characters)
      .values({ ownerId: usuarioId, name: "Nuria Vidal", kind: "persona", virtual: true })
      .returning();
    const [producto] = await db().insert(products).values({ ownerId: usuarioId, name: "Crema Lumi" }).returning();
    await db()
      .update(projects)
      .set({ mainCharacterId: inventada?.id ?? null })
      .where(eq(projects.id, proyectoId));
    await db()
      .update(scenes)
      .set({ productId: producto?.id ?? null })
      .where(eq(scenes.id, escenaId));
    const hechos = hechosConNombre();
    hechos.personaje = { nombre: "Nuria Vidal", impedimentos: [], vistasSinCubrir: [], referenciasSenaladas: 0 };
    if (hechos.escena) Object.assign(hechos.escena, { aprobada: true, fichaCambiada: false, motivoInvalidacion: "" });
    await exigirControles({ usuarioId, sujeto: "escena", sujetoId: escenaId, tipo: "fotograma" }, hechos);
    await esperarSombras();
    expect(enviados).toHaveLength(1);
    const cuerpo = enviados[0] ?? "";
    expect(cuerpo).not.toContain("Nuria");
    expect(cuerpo).not.toContain("Lumi");
    expect(cuerpo).toContain("persona 1");
    expect(cuerpo).toContain("el producto");
    expect(cuerpo).not.toContain("image");
    const [sombra] = await db().select().from(shadowEvaluations).where(eq(shadowEvaluations.userId, usuarioId));
    expect(sombra?.verdict).toBe("no_pasa");
  });

  test("no se puede encender la sombra sin aceptar que TypeSafe recibe el texto", async () => {
    await guardarAjustes({ sombraActiva: false, sombraEncargadoAceptado: false }, null);
    await expect(guardarAjustes({ sombraActiva: true }, null)).rejects.toThrow("TypeSafe");
    expect(
      await evaluarEnSombra({
        evaluacionId: "",
        usuarioId,
        sujeto: "escena",
        sujetoId: escenaId,
        reglaAfirmaciones: false,
      }),
    ).toBe("apagada");
    expect(enviados).toHaveLength(0);
  });
});
