import { describe, expect, test } from "bun:test";
import type { PreparacionAB } from "@/lib/comparativas";
import {
  actor,
  ana,
  aprobarFotograma,
  autorizarReintentos,
  barrerLanzamientosColgados,
  cancelarTrabajo,
  comparisons,
  comprometidoDelProyecto,
  confirmacionDeProduccion,
  ctx,
  db,
  depositoDe,
  encolarAlternativa,
  enviarEncolados,
  eq,
  escenaId,
  escenaProducida,
  escenaSinClip,
  estadoDeProduccion,
  estimarAB,
  filaDeEscena,
  generationJobs,
  h,
  hayBaseDeDatos,
  intentar,
  lanzarAB,
  MODELOS,
  pedir,
  peticion,
  projects,
  proyectoId,
  registrarEntornoAB,
  rutaComparativaEscena,
  tareasCreadas,
  trabajosDe,
} from "./ab-de-prueba";

/**
 * Lanzamiento de una comparativa A/B: **todo o nada** y sin choques (el entorno, en `ab-de-prueba.ts`):
 *
 * - si una alternativa no cabe, no sale ninguna y la otra se cancela sin haber llegado al proveedor;
 * - el worker no toma ninguna hasta que están las dos, y lo que se queda a medias lo termina el barrido;
 * - una sola comparativa y ningún otro clip en marcha por escena, también en el peor orden;
 * - tras un fallo con posible cobro, cada alternativa consume un reintento autorizado.
 */
describe.skipIf(!hayBaseDeDatos)("lanzamiento de una comparativa A/B", () => {
  registrarEntornoAB();

  test("todo o nada: si la segunda no cabe en el techo del proyecto, no se encola ninguna ni se cobra nada", async () => {
    await escenaProducida();
    const p = await peticion();
    const primera = p.alternativas[0]?.creditos ?? 0;
    // Solo cabe una: el techo del proyecto deja sitio para la primera y no para la segunda.
    await db()
      .update(projects)
      .set({ authorizedCredits: Math.ceil((await comprometidoDelProyecto(proyectoId)) + primera) })
      .where(eq(projects.id, proyectoId));
    const reservadoAntes = (await depositoDe(ana.id)).reservado;
    const antes = new Set((await trabajosDe(escenaId)).map((t) => t.id));
    const trabajosAntes = antes.size;
    const r = await intentar(() => lanzarAB(actor, escenaId, p, h));
    expect(!r.ok && r.estado).toBe(409);
    expect(!r.ok && r.error).toContain("no caben");
    expect(!r.ok && r.error).toMatch(/no se ha cobrado nada/i);
    // La que sí cabía se encoló y se canceló sin salir: su reserva vuelve y el worker no envía nada.
    const nuevos = (await trabajosDe(escenaId)).filter((t) => !antes.has(t.id));
    expect(nuevos).toHaveLength(1);
    expect(nuevos.every((t) => t.state === "cancelado")).toBe(true);
    expect((await depositoDe(ana.id)).reservado).toBe(reservadoAntes);
    expect(await enviarEncolados(h)).toBe(0);
    expect(tareasCreadas).toBe(0);
    // Repetir la misma confirmación no encola la que faltaba: hay que confirmar otra vez.
    const repetida = await intentar(() => lanzarAB(actor, escenaId, p, h));
    expect(!repetida.ok && repetida.error).toContain("ya se intentó");
    expect((await trabajosDe(escenaId)).filter((t) => t.state !== "cancelado")).toHaveLength(trabajosAntes);
  });

  test("mientras no están encoladas todas, el worker no toma ninguna; una colgada se cancela sin cobro", async () => {
    await escenaProducida();
    const reservadoAntes = (await depositoDe(ana.id)).reservado;
    const vista = await lanzarAB(actor, escenaId, await peticion(), h);
    // Como si el lanzamiento se hubiera quedado a medias hace rato.
    await db()
      .update(comparisons)
      .set({ launchedAt: null, createdAt: new Date(Date.now() - 3600_000) })
      .where(eq(comparisons.id, vista.id));
    expect(await enviarEncolados(h)).toBe(0);
    expect(await barrerLanzamientosColgados()).toBe(1);
    const alternativas = await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id));
    expect(
      alternativas.filter((t) => vista.alternativas.some((a) => a.trabajoId === t.id)).map((t) => t.state),
    ).toEqual(["cancelado", "cancelado"]);
    expect((await depositoDe(ana.id)).reservado).toBe(reservadoAntes);
    expect(tareasCreadas).toBe(0);
  });

  test("dos comparativas a la vez en la misma escena: sale una y la otra se rechaza con su causa", async () => {
    await escenaProducida();
    const [a, b] = await Promise.all([peticion(), peticion()]);
    const resultados = await Promise.all([
      intentar(() => lanzarAB(actor, escenaId, a, h)),
      intentar(() => lanzarAB(actor, escenaId, b, h)),
    ]);
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    const rechazo = resultados.find((r) => !r.ok);
    expect(rechazo && !rechazo.ok && rechazo.estado).toBe(409);
    expect(rechazo && !rechazo.ok && rechazo.error).toMatch(/Ya hay una comparación|no ha salido ninguna/);
    const activas = (await trabajosDe(escenaId)).filter((t) => ["en_cola", "esperando_limite"].includes(t.state));
    expect(activas).toHaveLength(2);
    expect(await enviarEncolados(h)).toBe(2);
  });

  test("tras un fallo con posible cobro, la comparativa consume un reintento autorizado por alternativa", async () => {
    await escenaProducida();
    // Último clip de la escena fallido después de hablar con el proveedor.
    await db().insert(generationJobs).values({
      userId: ana.id,
      kind: "animacion",
      provider: "kie",
      model: "veo3_fast",
      prompt: "x",
      input: {},
      sceneId: escenaId,
      state: "fallido",
      failureReason: "contenido",
      errorMessage: "El proveedor lo rechazó.",
      estimatedCredits: 60,
      finishedAt: new Date(),
    });
    // La pantalla lo dice antes de confirmar.
    const r = await rutaComparativaEscena.GET(pedir(ana, `/api/escenas/${escenaId}/comparativa`), ctx(escenaId));
    const { preparacion } = (await r.json()) as { preparacion: PreparacionAB };
    expect(preparacion.impedimentos.join(" ")).toContain("reintento autorizado");
    const sin = await intentar(async () => lanzarAB(actor, escenaId, await peticion(), h));
    expect(!sin.ok && sin.error).toContain("reintento");
    await autorizarReintentos(actor, escenaId, 1);
    const uno = await intentar(async () => lanzarAB(actor, escenaId, await peticion(), h));
    expect(!uno.ok && uno.error).toContain("autoriza al menos 1 más");
    await autorizarReintentos(actor, escenaId, 2);
    const vista = await lanzarAB(actor, escenaId, await peticion(), h);
    expect(vista.ejecucionesReales).toBe(2);
    expect((await filaDeEscena(escenaId)).retriesUsed).toBe(2);
  });

  test("una cancelación a medias la termina el barrido: reserva devuelta y la escena, libre", async () => {
    await escenaProducida();
    const reservadoAntes = (await depositoDe(ana.id)).reservado;
    const vista = await lanzarAB(actor, escenaId, await peticion(), h);
    // Como si la cancelación hubiera puesto su marca y se hubiera interrumpido antes de cancelar los trabajos.
    await db()
      .update(comparisons)
      .set({ launchedAt: null, cancelledAt: new Date() })
      .where(eq(comparisons.id, vista.id));
    expect(await enviarEncolados(h)).toBe(0);
    expect(await barrerLanzamientosColgados()).toBe(1);
    const estados = (await trabajosDe(escenaId))
      .filter((t) => vista.alternativas.some((a) => a.trabajoId === t.id))
      .map((t) => t.state);
    expect(estados).toEqual(["cancelado", "cancelado"]);
    expect((await depositoDe(ana.id)).reservado).toBe(reservadoAntes);
    // Nada más que barrer, y la escena admite otra comparativa.
    expect(await barrerLanzamientosColgados()).toBe(0);
    expect((await lanzarAB(actor, escenaId, await peticion(), h)).ejecucionesReales).toBe(2);
    expect(tareasCreadas).toBe(0);
  });

  test("una alternativa de una comparativa ya cancelada no se encola nunca (barrido entre la primera y la segunda)", async () => {
    await escenaProducida();
    const p = await peticion();
    const vista = await lanzarAB(actor, escenaId, p, h);
    const [fila] = await db().select().from(comparisons).where(eq(comparisons.id, vista.id));
    const segunda = fila?.alternatives[1];
    const trabajoSegunda = vista.alternativas[1]?.trabajoId;
    if (!fila || !segunda || !trabajoSegunda) throw new Error("Falta la segunda alternativa.");
    // Estado del reloj: la primera encolada, el barrido la canceló y la segunda todavía no existe.
    await cancelarTrabajo(ana.id, trabajoSegunda);
    await db().delete(generationJobs).where(eq(generationJobs.id, trabajoSegunda));
    await db()
      .update(comparisons)
      .set({ launchedAt: null, cancelledAt: new Date() })
      .where(eq(comparisons.id, vista.id));
    const intento = await intentar(() => encolarAlternativa(p, segunda));
    expect(!intento.ok && intento.estado).toBe(409);
    expect(!intento.ok && intento.error).toContain("ya se canceló");
    expect((await trabajosDe(escenaId)).some((t) => t.idempotencyKey === segunda.clave)).toBe(false);
  });

  test("un clip normal y una comparativa a la vez en una escena sin clip: nunca salen tres", async () => {
    await escenaSinClip();
    const [ab, normal] = await Promise.all([
      intentar(async () => lanzarAB(actor, escenaId, await peticion(), h)),
      intentar(async () => aprobarFotograma(actor, escenaId, await confirmacionDeProduccion("clip"), h)),
    ]);
    const activos = (await trabajosDe(escenaId)).filter(
      (t) => t.kind === "animacion" && ["en_cola", "esperando_limite"].includes(t.state),
    );
    // O la comparativa (2) o el clip normal (1), nunca las dos cosas.
    expect(ab.ok && normal.ok).toBe(false);
    expect(activos.length).toBe(ab.ok ? 2 : 1);
    const rechazo = ab.ok ? normal : ab;
    expect(!rechazo.ok && rechazo.error).toMatch(/comparativa|comparación|en marcha/);
  });

  test("la cola decide aunque el orden sea el peor: comparativa guardada y clip normal, o clip normal y alternativa", async () => {
    await escenaSinClip();
    const p = await peticion();
    const estimacion = await estimarAB(actor, escenaId, [...MODELOS]);
    const alternativas = estimacion.alternativas.map((a) => ({
      modelo: a.modelo,
      nombre: a.nombre,
      proveedor: a.nombreProveedor,
      segundos: a.segundos,
      creditos: a.creditos,
      sello: a.sello,
      clave: crypto.randomUUID(),
    }));
    // 1) Una comparativa guardada sin lanzar: el clip normal no entra.
    const [guardada] = await db()
      .insert(comparisons)
      .values({
        userId: ana.id,
        projectId: proyectoId,
        sceneId: escenaId,
        idempotencyKey: p.claveIdempotencia,
        alternatives: alternativas,
        plannedRuns: 2,
        estimatedCredits: p.creditosTotalesConfirmados,
      })
      .returning();
    const normal = await intentar(async () =>
      aprobarFotograma(actor, escenaId, await confirmacionDeProduccion("clip"), h),
    );
    expect(!normal.ok && normal.error).toContain("comparativa lanzándose");
    // La producción ya lo enseña mientras se lanza, no solo cuando hay alternativas en marcha.
    expect((await estadoDeProduccion(actor, proyectoId)).escenas[0]?.comparativaEnMarcha).toBe(true);
    // 2) Con un clip normal en marcha, una alternativa no entra.
    await db()
      .delete(comparisons)
      .where(eq(comparisons.id, guardada?.id as string));
    await aprobarFotograma(actor, escenaId, await confirmacionDeProduccion("clip"), h);
    await db().insert(comparisons).values({
      userId: ana.id,
      projectId: proyectoId,
      sceneId: escenaId,
      idempotencyKey: crypto.randomUUID(),
      alternatives: alternativas,
      plannedRuns: 2,
      estimatedCredits: p.creditosTotalesConfirmados,
    });
    const primera = alternativas[0];
    if (!primera) throw new Error("Falta la alternativa.");
    const alternativa = await intentar(() => encolarAlternativa(p, primera));
    expect(!alternativa.ok && alternativa.error).toContain("Ya hay una comparación o un clip en marcha");
  });
});
