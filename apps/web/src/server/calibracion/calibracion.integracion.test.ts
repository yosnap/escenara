import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Conjunto etiquetado y calibración contra el PostgreSQL local. **Nada llama a ningún proveedor**: las opiniones de la
 * sombra y de la coherencia se escriben ya registradas, como las dejaría la aplicación, y las etiquetas humanas son
 * afirmaciones resueltas, correcciones y revisiones de verdad.
 *
 * - el conjunto no guarda nombres, correos, identificadores de usuario ni texto libre de nadie;
 * - la partición es determinista y reconstruir no mueve ningún ejemplo;
 * - con muestra insuficiente no se propone umbral; con datos de ejemplo, se propone uno medido en la retenida;
 * - borrar la cuenta (0.47.0) se lleva sus ejemplos y deja los de las demás;
 * - la ruta es solo de quien administra.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_calibracion");
}

const { eq, sql } = await import("drizzle-orm");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const e = await import("../db/esquema");
const { reconstruirConjunto } = await import("./conjunto");
const { leerAjustes } = await import("../ajustes");
const { recalibrar, vistaDeCalibracion } = await import("./calibrar");
const { particionDe, AVISO_SIN_DATOS } = await import("@/lib/calibracion");
const { pasadaDeBorradosDeCuenta } = await import("../datos/borrado-cuenta-worker");
const rutaBorradoCuenta = await import("@/app/api/cuenta/borrado/route");
const rutaCalibracion = await import("@/app/api/admin/calibracion/route");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;

const NOMBRE = "Nuria Vidal Ocaña";
const GUION = `${NOMBRE} dice que la Crema Lumi quita el 90 % de las arrugas en una semana.`;

const pedir = (s: Sesion, url: string, metodo = "GET", cuerpo?: unknown) =>
  new Request(`http://localhost${url}`, {
    method: metodo,
    headers: {
      cookie: s.cookie,
      ...(metodo === "GET" ? {} : { origin: "http://localhost", "Content-Type": "application/json" }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });

/**
 * Una escena de `usuario` con una opinión de la sombra sobre su guion y lo que resolvió la persona. `bien` decide si
 * la sombra acierta con confianza alta o se equivoca con confianza baja: es lo que da forma a la calibración.
 */
async function escenaConOpinion(usuarioId: string, proyectoId: string, orden: number, bien: boolean) {
  const [escena] = await db()
    .insert(e.scenes)
    .values({ projectId: proyectoId, sortOrder: orden, scriptText: GUION, action: `${NOMBRE} sonríe a cámara` })
    .returning({ id: e.scenes.id });
  if (!escena) throw new Error("No se ha creado la escena.");
  const [evaluacion] = await db()
    .insert(e.controlEvaluations)
    .values({
      userId: usuarioId,
      subject: "escena",
      subjectId: escena.id,
      jobKind: "fotograma",
      state: "listo",
      rulesVersion: "reglas-prueba",
      rules: [],
      confirmed: [],
      action: "permite",
    })
    .returning({ id: e.controlEvaluations.id });
  if (!evaluacion) throw new Error("No se ha creado la evaluación.");
  // Acierta: la sombra frena (encaja bajo) con confianza alta y la persona verificó la afirmación (había que frenar).
  // Falla: deja pasar con confianza baja y la persona también la verificó.
  const [sombra] = await db()
    .insert(e.shadowEvaluations)
    .values({
      controlEvaluationId: evaluacion.id,
      userId: usuarioId,
      subjectId: escena.id,
      evaluator: "jev",
      question: "afirmacion_verificable",
      questionsVersion: "sombra-1",
      model: "jev-1.13.0",
      verdict: bien ? "no_pasa" : "revisar",
      fit: bien ? 0.1 : 0.8,
      confidence: bien ? 0.93 : 0.55,
      threshold: 0.75,
      evidence: `Jev ve que ${NOMBRE} promete un 90 %.`,
      inputHash: `huella-${escena.id}`,
    })
    .returning({ id: e.shadowEvaluations.id });
  if (!sombra) throw new Error("No se ha creado la sombra.");
  await db()
    .insert(e.claims)
    .values({
      sceneId: escena.id,
      text: GUION,
      kind: "cifra",
      state: "verificada",
      source: `Estudio enviado por ${NOMBRE}`,
      resolvedBy: usuarioId,
      resolvedAt: new Date(),
    });
  return { escenaId: escena.id, sombraId: sombra.id };
}

/** Una decisión de coherencia del resultado corregida por la persona: etiqueta no independiente. */
async function resultadoCorregido(usuarioId: string, proyectoId: string, escenaId: string) {
  const [decision] = await db()
    .insert(e.coherenceDecisions)
    .values({
      userId: usuarioId,
      check: "resultado",
      mode: "sombra",
      subject: "escena",
      subjectId: escenaId,
      projectId: proyectoId,
      verdict: "pasa",
      confidence: 0.9,
      threshold: 0.75,
      fit: 0.8,
      probabilities: { si: 0.8, no: 0.2 },
      facts: `Se ve a ${NOMBRE} en una cocina.`,
      evidence: `El clip muestra a ${NOMBRE} como dice la descripción.`,
      decisionModel: "jev-1.13.0",
      rulesVersion: "coherencia-5",
      correction: "se_equivoca",
      correctedAt: new Date(),
      correctedBy: usuarioId,
    })
    .returning({ id: e.coherenceDecisions.id });
  if (!decision) throw new Error("No se ha creado la decisión.");
  return decision.id;
}

async function proyectoDe(usuarioId: string) {
  const [p] = await db()
    .insert(e.projects)
    .values({ userId: usuarioId, title: `Anuncio de ${NOMBRE}` })
    .returning({ id: e.projects.id });
  if (!p) throw new Error("No se ha creado el proyecto.");
  return p.id;
}

describe.skipIf(!hayBaseDeDatos)("conjunto etiquetado y calibración", () => {
  let ana: Sesion;
  let admin: Sesion;

  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_calibracion");
    await aplicarMigraciones();
    admin = await crearSesionDePrueba("admin");
  });

  beforeEach(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_calibracion");
    await db().delete(e.labeledExamples);
    await db().delete(e.calibrationRuns);
    await db().delete(e.coherenceDecisions);
    await db().delete(e.controlEvaluations);
    await db().delete(e.projects);
    await db().delete(e.rateLimits);
    ana = await crearSesionDePrueba("user");
  });

  afterAll(async () => {
    await db().delete(e.users).where(eq(e.users.email, admin.email));
  });

  test("el conjunto no contiene nombres, correos, identificadores de usuario ni texto libre", async () => {
    const proyecto = await proyectoDe(ana.id);
    const { escenaId } = await escenaConOpinion(ana.id, proyecto, 1, true);
    await resultadoCorregido(ana.id, proyecto, escenaId);
    const resumen = await reconstruirConjunto();
    expect(resumen).toEqual({ afirmacion_verificable: 1, resultado: 1 });

    const filas = (await db().execute(sql`select row_to_json(l)::text as fila from labeled_examples l`)) as unknown as {
      fila: string;
    }[];
    expect(filas).toHaveLength(2);
    const [usuario] = await db().select().from(e.users).where(eq(e.users.id, ana.id));
    const prohibidos = [
      ana.id,
      ana.email,
      usuario?.name ?? "",
      escenaId,
      proyecto,
      NOMBRE,
      "Nuria",
      "Crema Lumi",
      "arrugas",
      "cocina",
      "@",
    ].filter((p) => p.length > 0);
    for (const { fila } of filas) {
      for (const p of prohibidos) expect(fila.toLowerCase()).not.toContain(p.toLowerCase());
    }
    // Solo estas columnas: si alguien añade una, este test obliga a mirar qué guarda.
    const columnas = (await db().execute(
      sql`select column_name from information_schema.columns where table_name = 'labeled_examples' order by column_name`,
    )) as unknown as { column_name: string }[];
    expect(columnas.map((c) => c.column_name)).toEqual([
      "coherence_decision_id",
      "confidence",
      "created_at",
      "fit",
      "id",
      "label",
      "label_independent",
      "model",
      "partition",
      "question",
      "questions_version",
      "shadow_evaluation_id",
    ]);
  });

  test("la partición es determinista y reconstruir no mueve ningún ejemplo", async () => {
    const proyecto = await proyectoDe(ana.id);
    for (let i = 1; i <= 12; i++) await escenaConOpinion(ana.id, proyecto, i, i % 2 === 0);
    await reconstruirConjunto();
    const primera = await db().select().from(e.labeledExamples);
    await reconstruirConjunto();
    const segunda = await db().select().from(e.labeledExamples);
    expect(segunda).toHaveLength(primera.length);
    const porOrigen = new Map(primera.map((f) => [f.shadowEvaluationId, f.partition]));
    for (const f of segunda) {
      expect(f.partition).toBe(porOrigen.get(f.shadowEvaluationId) as string);
      expect(f.partition).toBe(particionDe(f.shadowEvaluationId as string));
    }
  });

  test("una afirmación sin resolver no da etiqueta y no entra", async () => {
    const proyecto = await proyectoDe(ana.id);
    const { escenaId } = await escenaConOpinion(ana.id, proyecto, 1, true);
    await db().update(e.claims).set({ state: "por_verificar" }).where(eq(e.claims.sceneId, escenaId));
    expect((await reconstruirConjunto()).afirmacion_verificable).toBe(0);
  });

  test("con muestra insuficiente no se propone umbral y se dice por qué", async () => {
    const proyecto = await proyectoDe(ana.id);
    for (let i = 1; i <= 6; i++) await escenaConOpinion(ana.id, proyecto, i, true);
    const resultado = await recalibrar();
    expect(resultado.afirmacion_verificable.umbral).toBeNull();
    expect(resultado.afirmacion_verificable.suficiente).toBe(false);
    expect(resultado.afirmacion_verificable.motivo).toContain(AVISO_SIN_DATOS);
    const vista = await vistaDeCalibracion();
    const afirmaciones = vista.preguntas.find((p) => p.pregunta === "afirmacion_verificable");
    expect(afirmaciones?.ultima?.umbral).toBeNull();
    expect(afirmaciones?.ultima?.suficiente).toBe(false);
    expect(vista.laya).toEqual({ minimo: 200, conCorreccion: 6 });
  });

  test("con datos de ejemplo propone un umbral medido en la retenida y lo guarda con su fecha y su muestra", async () => {
    const proyecto = await proyectoDe(ana.id);
    for (let i = 1; i <= 120; i++) await escenaConOpinion(ana.id, proyecto, i, i % 3 !== 0);
    const ajustesAntes = await leerAjustes();
    const { afirmacion_verificable: r } = await recalibrar();
    const [guardada] = await db()
      .select()
      .from(e.calibrationRuns)
      .where(eq(e.calibrationRuns.question, "afirmacion_verificable"));
    expect(r.suficiente).toBe(true);
    // Las opiniones equivocadas tienen confianza 0,55: el primer umbral que las deja fuera es 0,6.
    expect(r.umbral).toBe(0.6);
    expect(r.muestraCalibracion + r.muestraRetenida).toBe(120);
    expect(r.enRetenido?.falsosPermisos).toBe(0);
    expect(r.enRetenido?.precision).toBe(1);
    expect(guardada?.proposedThreshold).toBeCloseTo(0.6);
    expect(guardada?.calibrationSize).toBe(r.muestraCalibracion);
    expect(guardada?.holdoutSize).toBe(r.muestraRetenida);
    expect(guardada?.createdAt).toBeInstanceOf(Date);
    // Un cálculo por pregunta, y ningún ajuste de la instalación cambia: proponer no activa nada.
    expect(await db().select().from(e.calibrationRuns)).toHaveLength(2);
    expect(await leerAjustes()).toEqual(ajustesAntes);
  });

  test("borrar la cuenta se lleva sus ejemplos del conjunto y deja los de las demás", async () => {
    const otra = await crearSesionDePrueba("user");
    const deAna = await escenaConOpinion(ana.id, await proyectoDe(ana.id), 1, true);
    const deOtra = await escenaConOpinion(otra.id, await proyectoDe(otra.id), 1, true);
    await reconstruirConjunto();
    expect(await db().select().from(e.labeledExamples)).toHaveLength(2);

    expect(
      (await rutaBorradoCuenta.POST(pedir(ana, "/api/cuenta/borrado", "POST", { frase: "borrar mi cuenta" }))).status,
    ).toBe(201);
    await db()
      .update(e.accountDeletions)
      .set({ scheduledFor: new Date(Date.now() - 1000), availableAt: new Date(Date.now() - 1000) })
      .where(eq(e.accountDeletions.userId, ana.id));
    expect(await pasadaDeBorradosDeCuenta("worker-de-prueba", async () => {})).toBe("completado");

    const quedan = await db().select().from(e.labeledExamples);
    expect(quedan.map((f) => f.shadowEvaluationId)).toEqual([deOtra.sombraId]);
    expect(quedan.some((f) => f.shadowEvaluationId === deAna.sombraId)).toBe(false);
    // Y al reconstruir no vuelve: su origen ya no existe.
    await reconstruirConjunto();
    expect((await db().select().from(e.labeledExamples)).map((f) => f.shadowEvaluationId)).toEqual([deOtra.sombraId]);
    await db().delete(e.users).where(eq(e.users.id, otra.id));
  });

  test("la ruta es solo de quien administra: a cualquier otra cuenta le responde 404", async () => {
    expect((await rutaCalibracion.GET(pedir(ana, "/api/admin/calibracion"), undefined)).status).toBe(404);
    expect((await rutaCalibracion.POST(pedir(ana, "/api/admin/calibracion", "POST", {}), undefined)).status).toBe(404);
    const vista = await rutaCalibracion.POST(pedir(admin, "/api/admin/calibracion", "POST", {}), undefined);
    expect(vista.status).toBe(200);
    const cuerpo = (await vista.json()) as { preguntas: { pregunta: string }[] };
    expect(cuerpo.preguntas.map((p) => p.pregunta)).toEqual(["afirmacion_verificable", "resultado"]);
  });
});
