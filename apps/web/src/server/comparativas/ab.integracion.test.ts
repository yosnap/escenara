import { describe, expect, test } from "bun:test";
import type { ComparativaVista, PreparacionAB } from "@/lib/comparativas";
import {
  actor,
  ana,
  beto,
  comparisons,
  ctx,
  db,
  depositoDe,
  elegirGanadora,
  enviarEncolados,
  eq,
  escenaId,
  escenaProducida,
  estadoDeProduccion,
  estimarAB,
  filaDeEscena,
  h,
  hayBaseDeDatos,
  intentar,
  lanzarAB,
  MODELOS,
  models,
  olvidarCatalogo,
  pedir,
  peticion,
  proyectoId,
  registrarEntornoAB,
  rutaComparativa,
  rutaComparativaEscena,
  rutaGanadora,
  tareasCreadas,
  terminar,
  trabajosDe,
  ultimoTrabajoDeEscena,
  verComparativa,
} from "./ab-de-prueba";

/**
 * Comparativa A/B de una escena, de principio a fin (el entorno, en `ab-de-prueba.ts`):
 *
 * - la confirmación exige el número de ejecuciones y el coste exactos: sin ellos no se encola nada;
 * - como mucho dos alternativas distintas, cada una un trabajo normal de la cola con su reserva de presupuesto;
 * - los resultados no tocan la escena hasta elegir ganadora, y la ganadora queda en la escena;
 * - nadie ve la comparativa de otro (404).
 */
describe.skipIf(!hayBaseDeDatos)("comparativa A/B de una escena", () => {
  registrarEntornoAB();

  test("sin fotograma aprobado no se puede comparar, y se dice qué hacer", async () => {
    const r = await rutaComparativaEscena.GET(pedir(ana, `/api/escenas/${escenaId}/comparativa`), ctx(escenaId));
    const { preparacion } = (await r.json()) as { preparacion: PreparacionAB };
    expect(preparacion.impedimentos.join(" ")).toContain("fotograma aprobado");
    expect(preparacion.disponibles.map((d) => d.modelo)).toEqual(expect.arrayContaining([...MODELOS]));
    const intento = await intentar(async () => lanzarAB(actor, escenaId, await peticion(), h));
    expect(!intento.ok && intento.estado).toBe(409);
    expect(!intento.ok && intento.error).toContain("No se ha encolado nada");
    expect(await trabajosDe(escenaId)).toHaveLength(0);
    expect(tareasCreadas).toBe(0);
  });

  test("la estimación dice cuántas ejecuciones y cuánto, y no gasta nada", async () => {
    await escenaProducida();
    const antes = { trabajos: (await trabajosDe(escenaId)).length, tareas: tareasCreadas };
    const e = await estimarAB(actor, escenaId, [...MODELOS]);
    expect(e.ejecuciones).toBe(2);
    expect(e.creditosTotales).toBe(e.alternativas.reduce((s, a) => s + a.creditos, 0));
    for (const a of e.alternativas) {
      expect(a.creditos).toBeGreaterThan(0);
      expect(a.sello).not.toBe("");
      expect(a.impedimento).toBeNull();
    }
    expect((await trabajosDe(escenaId)).length).toBe(antes.trabajos);
    expect(tareasCreadas).toBe(antes.tareas);
  });

  test("sin confirmar el número exacto de ejecuciones o el coste total no se encola nada", async () => {
    await escenaProducida();
    const antes = { trabajos: (await trabajosDe(escenaId)).length, reservado: (await depositoDe(ana.id)).reservado };
    for (const cambios of [
      { ejecucionesConfirmadas: 1 },
      { ejecucionesConfirmadas: 3 },
      { creditosTotalesConfirmados: 1 },
    ]) {
      const r = await intentar(async () => lanzarAB(actor, escenaId, await peticion(cambios), h));
      expect(!r.ok && r.estado).toBe(409);
      expect(!r.ok && r.error).toContain("No se ha encolado nada");
    }
    // Un precio que ya no es el que se vio tampoco sale.
    const base = await peticion();
    const caducado = {
      ...base,
      alternativas: base.alternativas.map((a, i) => (i === 1 ? { ...a, sello: "kie:veo3_lite:viejo@v0" } : a)),
    };
    const r = await intentar(() => lanzarAB(actor, escenaId, caducado, h));
    expect(!r.ok && r.error).toContain("ha cambiado");
    // Sin la casilla de derechos, la puerta de siempre lo frena y no queda ninguna comparativa a medias.
    const sinDerechos = await intentar(async () => lanzarAB(actor, escenaId, await peticion({ derechos: false }), h));
    expect(sinDerechos.ok).toBe(false);
    expect(!sinDerechos.ok && sinDerechos.error).toContain("no ha salido ninguna");
    expect((await trabajosDe(escenaId)).length).toBe(antes.trabajos);
    expect((await depositoDe(ana.id)).reservado).toBe(antes.reservado);
    // Ninguna comparativa lanzada: como mucho, una marcada como no lanzada.
    const lanzadas = await db().select().from(comparisons).where(eq(comparisons.userId, ana.id));
    expect(lanzadas.filter((c) => c.launchedAt !== null)).toHaveLength(0);
    expect(tareasCreadas).toBe(0);
  });

  test("como mucho dos alternativas, y no el mismo modelo dos veces", async () => {
    await escenaProducida();
    const base = await peticion();
    const tres = await rutaComparativaEscena.POST(
      pedir(ana, `/api/escenas/${escenaId}/comparativa`, "POST", {
        ...base,
        alternativas: [...base.alternativas, { modelo: "kling/v3-turbo-image-to-video", creditos: 10, sello: "x" }],
        ejecucionesConfirmadas: 3,
      }),
      ctx(escenaId),
    );
    expect(tres.status).toBe(400);
    expect(((await tres.json()) as { error: string }).error).toContain("como mucho 2");
    const repetido = await rutaComparativaEscena.POST(
      pedir(ana, `/api/escenas/${escenaId}/comparativa`, "POST", {
        ...base,
        alternativas: [base.alternativas[0], base.alternativas[0]],
      }),
      ctx(escenaId),
    );
    expect(repetido.status).toBe(400);
  });

  test("confirmada, encola dos trabajos normales con su reserva y no toca la escena", async () => {
    const antes = await escenaProducida();
    const reservadoAntes = (await depositoDe(ana.id)).reservado;
    const p = await peticion();
    const vista = await lanzarAB(actor, escenaId, p, h);
    expect(vista.ejecucionesPrevistas).toBe(2);
    expect(vista.ejecucionesReales).toBe(2);
    expect(vista.creditosEstimados).toBe(p.creditosTotalesConfirmados);
    const alternativas = (await trabajosDe(escenaId)).filter((t) =>
      vista.alternativas.some((a) => a.trabajoId === t.id),
    );
    expect(alternativas.map((t) => t.model).sort()).toEqual([...MODELOS].sort());
    expect(alternativas.every((t) => t.kind === "animacion" && t.reservationId !== null)).toBe(true);
    // La reserva es la de siempre: lo confirmado, apartado en el presupuesto.
    expect((await depositoDe(ana.id)).reservado - reservadoAntes).toBe(p.creditosTotalesConfirmados);
    // La escena sigue con su clip, y la producción sigue viendo el suyo como el último.
    const despues = await filaDeEscena(escenaId);
    expect(despues.clipJobId).toBe(antes.clipJobId);
    expect((await ultimoTrabajoDeEscena(escenaId, "animacion"))?.id).toBe(antes.clipJobId as string);
    expect((await estadoDeProduccion(actor, proyectoId)).escenas[0]?.comparativaEnMarcha).toBe(true);

    // El worker las envía como cualquier clip: su revalidación antes de subir nada tampoco las confunde con el clip
    // de la escena.
    expect(await enviarEncolados(h)).toBe(2);
    expect(tareasCreadas).toBe(2);

    // El doble envío devuelve la misma comparativa y no encola nada más.
    const otra = await lanzarAB(actor, escenaId, p, h);
    expect(otra.id).toBe(vista.id);
    expect((await trabajosDe(escenaId)).length).toBe(alternativas.length + 2);
    expect(await db().select().from(comparisons).where(eq(comparisons.userId, ana.id))).toHaveLength(1);
  });

  test("los resultados se ven lado a lado sin tocar la escena, y la ganadora queda en ella", async () => {
    const antes = await escenaProducida();
    const vista = await lanzarAB(actor, escenaId, await peticion(), h);
    const [a, b] = vista.alternativas;
    if (!a?.trabajoId || !b?.trabajoId) throw new Error("Faltan las alternativas.");
    await terminar(a.trabajoId, "success");
    await terminar(b.trabajoId, "fail");

    const escena = await filaDeEscena(escenaId);
    expect(escena.clipJobId).toBe(antes.clipJobId);
    // El fallo de una alternativa no es un fallo del clip de la escena.
    expect(escena.lastFailureReason).toBe("");

    const leida = await verComparativa(actor, vista.id);
    expect(leida.terminada).toBe(true);
    const [lista, fallida] = leida.alternativas;
    expect(lista?.estado).toBe("listo");
    expect(lista?.medio?.url).toBeTruthy();
    expect(fallida?.estado).toBe("fallido");
    expect(fallida?.error).not.toBe("");
    // Falló después de hablar con el proveedor: puede haberse cobrado, y se dice.
    expect(fallida?.pudoCobrarse).toBe(true);

    const noLista = await intentar(() => elegirGanadora(actor, vista.id, b.trabajoId));
    expect(!noLista.ok && noLista.estado).toBe(409);

    const elegida = await elegirGanadora(actor, vista.id, a.trabajoId);
    expect(elegida.ganadorId).toBe(a.trabajoId);
    expect(elegida.alternativas[0]?.elegida).toBe(true);
    const final = await filaDeEscena(escenaId);
    expect(final.clipJobId).toBe(a.trabajoId);
    expect(final.state).toBe("producida");
  });

  test("se puede elegir una alternativa terminada aunque la otra siga en marcha", async () => {
    await escenaProducida();
    const vista = await lanzarAB(actor, escenaId, await peticion(), h);
    const [a] = vista.alternativas;
    if (!a?.trabajoId) throw new Error("Falta la alternativa.");
    await terminar(a.trabajoId, "success");
    const elegida = await elegirGanadora(actor, vista.id, a.trabajoId);
    expect(elegida.ganadorId).toBe(a.trabajoId);
    expect((await filaDeEscena(escenaId)).clipJobId).toBe(a.trabajoId);
  });

  test("un modelo sin duraciones declaradas no se puede comparar generando", async () => {
    await escenaProducida();
    const [fila] = await db().select().from(models).where(eq(models.modelId, MODELOS[1]));
    if (!fila) throw new Error("Falta el modelo.");
    const parametros = JSON.parse(fila.parameters) as Record<string, unknown>;
    await db()
      .update(models)
      .set({ parameters: JSON.stringify({ ...parametros, duraciones: [] }) })
      .where(eq(models.id, fila.id));
    olvidarCatalogo();
    try {
      const e = await estimarAB(actor, escenaId, [...MODELOS]);
      expect(e.alternativas[1]?.impedimento).toContain("no declara duraciones");
    } finally {
      await db().update(models).set({ parameters: fila.parameters }).where(eq(models.id, fila.id));
      olvidarCatalogo();
    }
  });

  test("nadie ve ni elige en la comparativa de otro: 404 sin revelar nada", async () => {
    await escenaProducida();
    const vista = await lanzarAB(actor, escenaId, await peticion(), h);
    const deOtro = await rutaComparativa.GET(pedir(beto, `/api/comparativas/${vista.id}`), ctx(vista.id));
    expect(deOtro.status).toBe(404);
    const escenaAjena = await rutaComparativaEscena.GET(
      pedir(beto, `/api/escenas/${escenaId}/comparativa`),
      ctx(escenaId),
    );
    expect(escenaAjena.status).toBe(404);
    const estimacionAjena = await rutaComparativaEscena.GET(
      pedir(beto, `/api/escenas/${escenaId}/comparativa?modelos=${MODELOS.join(",")}`),
      ctx(escenaId),
    );
    expect(estimacionAjena.status).toBe(404);
    const ganadora = await rutaGanadora.POST(
      pedir(beto, `/api/comparativas/${vista.id}/ganadora`, "POST", { trabajoId: vista.alternativas[0]?.trabajoId }),
      ctx(vista.id),
    );
    expect(ganadora.status).toBe(404);
    const lanzarAjena = await rutaComparativaEscena.POST(
      pedir(beto, `/api/escenas/${escenaId}/comparativa`, "POST", await peticion()),
      ctx(escenaId),
    );
    expect(lanzarAjena.status).toBe(404);
    const propia = (await (
      await rutaComparativa.GET(pedir(ana, `/api/comparativas/${vista.id}`), ctx(vista.id))
    ).json()) as ComparativaVista;
    expect(propia.id).toBe(vista.id);
  });
});
