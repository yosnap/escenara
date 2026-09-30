import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { segundosDeUnidad } from "@/lib/catalogo";
import {
  type AlternativaVista,
  alternativaPudoCobrarse,
  type ComparativaVista,
  type EstimacionAlternativa,
  MAXIMO_ALTERNATIVAS,
  type PreparacionAB,
} from "@/lib/comparativas";
import { formatoCanta } from "@/lib/direccion";
import { ESTADOS_ACTIVOS } from "@/lib/generacion";
import { falloConCoste } from "@/lib/produccion";
import { eurosPorCreditoDe, leerAjustes } from "../ajustes";
import { escenaPropia } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { db } from "../db/cliente";
import {
  comparisons,
  type FilaComparativa,
  type FilaEscena,
  type FilaProyecto,
  type FilaTrabajo,
  generationJobs,
  media,
  scenes,
} from "../db/esquema";
import { elegirParaTipo } from "../generacion/precios";
import { type Actor, aDto } from "../media/dto";
import { estadoDeProduccion } from "../produccion/consulta";
import { usarVersionDeEscena } from "../produccion/versiones";
import { creditosDelEnvio } from "../prompts/traduccion";
import { modelosElegibles } from "../proveedores/catalogo";

/**
 * **Comparativa A/B con contenido nuevo** de una escena: dos modelos de vídeo animan el **mismo** fotograma aprobado.
 *
 * No es un atajo. Cada alternativa es un clip normal que pasa por `produccion/producir.ts › encolarAnimacion`, es decir,
 * por `generacion/servicio.ts`: la puerta del motor de controles con la escena como sujeto (plan aprobado,
 * consentimiento, derechos, afirmaciones, credencial, cuota y techos de dinero), la comprobación del precio y del sello,
 * la idempotencia y la reserva atómica en la cola. Esto solo añade tres cosas:
 *
 * - **confirmación del número de ejecuciones y del coste total**: si no cuadran con lo que se va a lanzar, no se encola
 *   nada;
 * - **como mucho dos alternativas**, siempre en la escena elegida;
 * - los resultados **no tocan la escena** hasta que el usuario elige ganador, que es elegir esa versión del clip con
 *   todas sus puertas (`produccion/versiones.ts`).
 */

/** Por qué no se puede comparar en esta escena ahora mismo. Vacío si se puede. */
export async function impedimentosDe(escena: FilaEscena, proyecto: FilaProyecto): Promise<string[]> {
  const motivos: string[] = [];
  if (formatoCanta(escena.clipFormat)) {
    motivos.push("Esta escena canta con tu audio: su clip se produce desde el camino de canto y no se compara aquí.");
  }
  if (proyecto.voiceMode === "omni") {
    motivos.push("En modo Omni la escena se genera entera de una vez: no hay fotograma que animar con dos modelos.");
  }
  if (escena.castFormat !== "solo") {
    motivos.push("Esta escena tiene dos personajes: sus clips van por turnos y no se comparan de uno en uno.");
  }
  if (!escena.approvedFrameMediaId) {
    motivos.push("La escena todavía no tiene un fotograma aprobado. Apruébalo en la producción y vuelve aquí.");
  }
  const [enMarcha] = await db()
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.sceneId, escena.id),
        eq(generationJobs.kind, "animacion"),
        inArray(generationJobs.state, [...ESTADOS_ACTIVOS]),
      ),
    )
    .limit(1);
  if (enMarcha) {
    motivos.push("Esta escena ya tiene un clip en marcha: espera a que termine antes de comparar.");
  }
  return motivos;
}

/** `true` si el último fotograma o el último clip de la escena (alternativas incluidas) falló con posible cobro. */
export async function trasFalloConCoste(escenaId: string): Promise<boolean> {
  const ultimos: (FilaTrabajo | undefined)[] = await Promise.all(
    (["fotograma", "animacion"] as const).map(async (tipo) => {
      const [fila] = await db()
        .select()
        .from(generationJobs)
        .where(and(eq(generationJobs.sceneId, escenaId), eq(generationJobs.kind, tipo)))
        .orderBy(desc(generationJobs.createdAt))
        .limit(1);
      return fila;
    }),
  );
  return ultimos.some((t) => t !== undefined && t.state === "fallido" && falloConCoste(t.failureReason));
}

/** Lo que el navegador necesita para elegir los dos modelos. No gasta nada ni habla con ningún proveedor. */
export async function prepararAB(actor: Actor, escenaId: unknown): Promise<PreparacionAB> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  const [impedimentos, modelos, ajustes, fotograma, produccion] = await Promise.all([
    impedimentosDe(escena, proyecto),
    modelosElegibles("image_to_video"),
    leerAjustes(),
    escena.approvedFrameMediaId
      ? db()
          .select()
          .from(media)
          .where(and(eq(media.id, escena.approvedFrameMediaId), eq(media.ownerId, actor.id)))
          .limit(1)
      : Promise.resolve([]),
    estadoDeProduccion(actor, proyecto.id),
  ]);
  // Los mismos avisos confirmables que la producción enseña para esta escena, con la misma clave de regla.
  const deLaEscena = produccion.escenas.find((e) => e.id === escena.id);
  const avisos = new Map<string, string>();
  for (const c of [
    ...(deLaEscena?.controles.comprobaciones ?? []),
    ...(deLaEscena?.controlesDelProductoClip?.comprobaciones ?? []),
    ...produccion.controlesDelModelo.comprobaciones,
  ]) {
    if (c.confirmable && !avisos.has(c.regla)) avisos.set(c.regla, c.motivo);
  }
  // Tras un fallo con posible cobro, cada ejecución consume un reintento autorizado (sin atajo, ADR-0024).
  const libres = escena.retryBudget - escena.retriesUsed;
  if (libres < MAXIMO_ALTERNATIVAS && (await trasFalloConCoste(escena.id))) {
    impedimentos.push(
      `El último intento de esta escena falló después de hablar con el proveedor: cada ejecución de la comparativa consume un reintento autorizado y te quedan ${Math.max(0, libres)}. Autoriza al menos ${MAXIMO_ALTERNATIVAS - Math.max(0, libres)} más en la producción.`,
    );
  }
  return {
    escenaId: escena.id,
    proyectoId: proyecto.id,
    orden: escena.sortOrder,
    disponibles: modelos.map((m) => ({
      modelo: m.modelo,
      nombre: m.nombre,
      nombreProveedor: m.nombreProveedor,
      creditos: m.precio?.creditos ?? null,
    })),
    impedimentos,
    umbralAvisoCreditos: ajustes.avisoCreditos,
    conProducto: escena.productId !== null,
    conPersonaje: escena.placeShot !== "solo_lugar" && proyecto.mainCharacterId !== null,
    avisos: [...avisos].map(([regla, motivo]) => ({ regla, motivo })),
    fotograma: fotograma[0] ? aDto(fotograma[0], actor) : null,
  };
}

/**
 * Estimación de cada alternativa con **la misma resolución que usará el envío**: el modelo elegido a mano (sin
 * reservas del mapa) y la tarifa de la duración del proyecto, más la traducción si esta instalación traduce.
 */
export async function estimarUna(proyecto: FilaProyecto, modelo: string): Promise<EstimacionAlternativa> {
  const ajustes = await leerAjustes();
  const pedidos = proyecto.clipSeconds;
  try {
    const { modelo: m, precio } = await elegirParaTipo("animacion", modelo, { segundos: pedidos });
    const deLaTarifa = segundosDeUnidad(precio.unidad);
    const creditos = await creditosDelEnvio(Math.ceil(precio.creditos));
    return {
      modelo: m.modelo,
      nombre: m.nombre,
      nombreProveedor: m.nombreProveedor,
      conVoz: m.conVoz,
      segundos: deLaTarifa ?? pedidos,
      creditos,
      euros: creditos * eurosPorCreditoDe(ajustes, m.proveedor),
      sello: precio.sello,
      comprobado: precio.comprobado,
      precioAntiguo: m.precio?.caducado ?? false,
      impedimento:
        // Sin duraciones declaradas el coste no se puede acotar y el clip esperaría un límite aparte: rompería el
        // «todo o nada» de la comparativa, así que no se admite.
        m.parametros.duraciones.length === 0
          ? `${m.nombre} no declara duraciones, así que su coste no se puede acotar antes de enviarlo: no se puede comparar generando con él.`
          : deLaTarifa !== null && deLaTarifa !== pedidos
            ? `${m.nombre} no tiene precio registrado para un clip de ${pedidos} s, que es la duración de este proyecto.`
            : null,
    };
  } catch (error) {
    return {
      modelo,
      nombre: modelo,
      nombreProveedor: "",
      conVoz: false,
      segundos: null,
      creditos: 0,
      euros: 0,
      sello: "",
      comprobado: "",
      precioAntiguo: false,
      impedimento: error instanceof Error ? error.message : "Ese modelo no se puede usar ahora mismo.",
    };
  }
}

/** Estima las alternativas elegidas. No gasta nada: lee el catálogo de la instalación. */
export async function estimarAB(actor: Actor, escenaId: unknown, modelos: readonly string[]) {
  const { proyecto } = await escenaPropia(actor, escenaId);
  if (modelos.length !== MAXIMO_ALTERNATIVAS || new Set(modelos).size !== modelos.length) {
    throw new ErrorProyecto(400, "Elige dos modelos distintos para comparar.");
  }
  const alternativas = await Promise.all(modelos.map((m) => estimarUna(proyecto, m)));
  return {
    alternativas,
    ejecuciones: alternativas.length,
    creditosTotales: alternativas.reduce((s, a) => s + a.creditos, 0),
  };
}

// ── Leer y elegir ──────────────────────────────────────────────────────────────────────────────────────────

export async function vistaDeComparativa(actor: Actor, fila: FilaComparativa): Promise<ComparativaVista> {
  const claves = fila.alternatives.map((a) => a.clave);
  const trabajos = await db()
    .select()
    .from(generationJobs)
    .where(and(eq(generationJobs.userId, actor.id), inArray(generationJobs.idempotencyKey, claves)));
  const medioIds = trabajos.flatMap((t) => (t.resultMediaId ? [t.resultMediaId] : []));
  const medios = medioIds.length
    ? await db()
        .select()
        .from(media)
        .where(and(inArray(media.id, medioIds), eq(media.ownerId, actor.id)))
    : [];
  // La ganadora es la que la escena usa **ahora**, se eligiera aquí o desde sus versiones.
  const [escena] = await db()
    .select({ clip: scenes.clipJobId })
    .from(scenes)
    .where(eq(scenes.id, fila.sceneId))
    .limit(1);
  const enUso = trabajos.find((t) => t.id === escena?.clip)?.id ?? null;
  const alternativas: AlternativaVista[] = fila.alternatives.map((a) => {
    const t = trabajos.find((x) => x.idempotencyKey === a.clave);
    const medio = t?.resultMediaId ? medios.find((m) => m.id === t.resultMediaId) : undefined;
    return {
      modelo: a.modelo,
      nombre: a.nombre,
      creditosConfirmados: a.creditos,
      trabajoId: t?.id ?? null,
      estado: t?.state ?? null,
      creditosConsumidos: t?.consumedCredits ?? null,
      // El mensaje del trabajo ya es apto para el usuario (lo escribe el cierre, nunca el proveedor en crudo).
      error: t?.state === "fallido" || t?.state === "cancelado" ? (t.errorMessage ?? "") : "",
      pudoCobrarse: t ? alternativaPudoCobrarse(t.state, t.failureReason, t.consumedCredits) : false,
      medio: medio && medio.deletedAt === null ? aDto(medio, actor) : null,
      elegida: t !== undefined && enUso === t.id,
    };
  });
  return {
    id: fila.id,
    escenaId: fila.sceneId,
    proyectoId: fila.projectId,
    ejecucionesPrevistas: fila.plannedRuns,
    ejecucionesReales: trabajos.length,
    creditosEstimados: fila.estimatedCredits,
    creditosConsumidos: trabajos.reduce((s, t) => s + (t.consumedCredits ?? 0), 0),
    alternativas,
    ganadorId: enUso,
    creadaEn: fila.createdAt.toISOString(),
    terminada: trabajos.every((t) => !ESTADOS_ACTIVOS.includes(t.state)),
  };
}

/** Una comparativa del usuario. Una ajena responde 404, igual que una que no existe. */
async function comparativaPropia(actor: Actor, id: unknown): Promise<FilaComparativa> {
  const [fila] =
    typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)
      ? await db()
          .select()
          .from(comparisons)
          .where(and(eq(comparisons.id, id), eq(comparisons.userId, actor.id)))
          .limit(1)
      : [];
  if (!fila) throw new ErrorProyecto(404, "Esa comparativa no existe.");
  return fila;
}

export async function verComparativa(actor: Actor, id: unknown): Promise<ComparativaVista> {
  return vistaDeComparativa(actor, await comparativaPropia(actor, id));
}

/** La última comparativa de una escena del usuario; `null` si no tiene ninguna. */
export async function ultimaComparativaDeEscena(actor: Actor, escenaId: unknown): Promise<ComparativaVista | null> {
  const { escena } = await escenaPropia(actor, escenaId);
  const [fila] = await db()
    .select()
    .from(comparisons)
    // Una que no llegó a lanzarse no tiene nada que enseñar: se ofrece otra.
    .where(and(eq(comparisons.sceneId, escena.id), eq(comparisons.userId, actor.id), isNull(comparisons.cancelledAt)))
    .orderBy(desc(comparisons.createdAt))
    .limit(1);
  return fila ? vistaDeComparativa(actor, fila) : null;
}

/**
 * Elige la ganadora: pasa a ser el clip de la escena con **todas** las puertas de elegir una versión (consentimiento
 * vigente, reparto, declaraciones, montaje nuevo y revisión invalidada). No cuesta nada ni llama a ningún proveedor.
 */
export async function elegirGanadora(actor: Actor, id: unknown, trabajoId: unknown): Promise<ComparativaVista> {
  const fila = await comparativaPropia(actor, id);
  if (typeof trabajoId !== "string") throw new ErrorProyecto(400, "Indica en «trabajoId» qué alternativa eliges.");
  const [trabajo] = await db()
    .select({ id: generationJobs.id, estado: generationJobs.state })
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.id, trabajoId),
        eq(generationJobs.userId, actor.id),
        inArray(
          generationJobs.idempotencyKey,
          fila.alternatives.map((a) => a.clave),
        ),
      ),
    )
    .limit(1);
  if (!trabajo) throw new ErrorProyecto(404, "Esa alternativa no es de esta comparativa.");
  if (trabajo.estado !== "listo") {
    throw new ErrorProyecto(
      409,
      "Esa alternativa todavía no tiene un clip terminado: espera a que acabe para elegirla.",
    );
  }
  // La otra alternativa puede seguir en marcha: al terminar se queda como versión y no tapa la elección.
  await usarVersionDeEscena(actor, fila.sceneId, trabajo.id);
  await db()
    .update(comparisons)
    .set({ chosenJobId: trabajo.id, chosenAt: new Date() })
    .where(eq(comparisons.id, fila.id));
  return vistaDeComparativa(actor, { ...fila, chosenJobId: trabajo.id });
}
