import { asc, eq, inArray, sql } from "drizzle-orm";
import { precioCaducado } from "@/lib/catalogo";
import { EVALUACION_LISTA, type EvaluacionVista, peorEstado } from "@/lib/controles";
import type { ReferenciaIdentidad } from "@/lib/direccion";
import { formatearCreditos } from "@/lib/generacion";
import type { Medio } from "@/lib/media/tipos";
import { duracionParaModelo } from "@/lib/produccion";
import {
  type AfirmacionVista,
  BLOQUEAN_APROBACION,
  type EscenaVista,
  type EstimacionEscena,
  impedimentosDelPlan,
  type PlanVista,
  PRESUPUESTO_MAXIMO,
  type ProyectoDetalle,
  type ProyectoVista,
  puedeAprobarse,
} from "@/lib/proyectos";
import { type Ajustes, eurosPorCreditoDe, leerAjustes } from "../ajustes";
import type { HechosEscena, ParametrosControles } from "../controles/contrato";
import { REGLAS_VERSION } from "../controles/contrato";
import { parametrosDeControles } from "../controles/hechos";
import { evaluarParaMostrar, exigirFrenosDuros } from "../controles/puerta";
import { db, type Ejecutor } from "../db/cliente";
import {
  assistantRuns,
  claims,
  type FilaAfirmacion,
  type FilaEscena,
  type FilaProyecto,
  generationJobs,
  media,
  projects,
  scenes,
  usageLedger,
} from "../db/esquema";
import { type EleccionDeTrabajo, elegirParaTipo } from "../generacion/precios";
import { eleccionDeGeneracion } from "../mapa/generacion";
import { type Actor, aDto } from "../media/servicio";
import { ultimaVersion } from "../personajes/ficha";
import { plantillaVigenteDe } from "../prompts/consulta";
import { ErrorCatalogo } from "../proveedores/contrato";
import {
  afirmacionesDe,
  escenaPropia,
  escenasDe,
  escenasDeProyectos,
  nombreDePersonaje,
  proyectoPropio,
  proyectosDe,
} from "./consulta";
import { ErrorProyecto } from "./errores";
import { estadoDelAsistente } from "./texto";

/**
 * El plan de un proyecto: cuánto se estima que cuesta cada escena, cuánto el proyecto entero y si se puede
 * aprobar (RF14).
 *
 * Tres reglas, y las tres son de dinero:
 *
 * 1. **Una estimación nunca se inventa.** Sale del registro versionado de precios; una escena cuyo modelo no
 *    tiene precio no se estima, y un plan con alguna así no se puede aprobar. Siempre se muestra con la palabra
 *    «estimación» y con la fecha del precio usado (`lib/proyectos.ts`).
 * 2. **Aprobar es un acto explícito** y exige que el total que el usuario tenía delante siga siendo el vigente.
 *    Lo que se aprueba se congela: modelo, sello del precio, versión de la ficha y versión de la plantilla.
 * 3. **Nada se produce sin aprobación.** `exigirEscenaAprobada` es la puerta, y la cruza cualquier camino que
 *    encole una generación a partir de una escena.
 */

/** Modelos con los que se estima el plan: el predeterminado de cada capacidad, con su precio vigente. */
export interface EleccionesDelPlan {
  fotograma: EleccionDeTrabajo | null;
  animacion: EleccionDeTrabajo | null;
}

/**
 * Elige los modelos del plan. Un catálogo sin modelo o sin precio **no es un error**: deja el plan sin
 * estimación y lo dice, en lugar de dejar la página del proyecto inaccesible.
 */
/**
 * Con qué se generarían el fotograma y el clip de una escena. Con `usuarioId` sale de **su mapa de modelos**
 * (0.22.0); sin él, del catálogo de la instalación, que es lo que hacía la 0.21.x. Se le pasa siempre que quien
 * pregunta tiene un actor delante: lo que se estima tiene que ser lo que se va a enviar.
 */
export async function eleccionesDelPlan(usuarioId?: string): Promise<EleccionesDelPlan> {
  const [fotograma, animacion] = await Promise.all([elegir("fotograma", usuarioId), elegir("animacion", usuarioId)]);
  return { fotograma, animacion };
}

async function elegir(tipo: "fotograma" | "animacion", usuarioId?: string): Promise<EleccionDeTrabajo | null> {
  try {
    if (usuarioId) return (await eleccionDeGeneracion(usuarioId, tipo)).elegida.eleccion;
    return await elegirParaTipo(tipo);
  } catch (error) {
    if (error instanceof ErrorCatalogo) return null;
    throw error;
  }
}

/**
 * Margen prudente de una elección: se aplica a los modelos que todavía no están `validado`, es decir, a los
 * que no tienen un coste medido y revisado. ADR-0009 avisa de que el prototipo infraestimó ×3, así que aquí se
 * suma margen y se dice que se ha sumado.
 */
const necesitaMargen = (eleccion: EleccionDeTrabajo) => eleccion.modelo.estado !== "validado";

/** Estimación de una escena; `null` si falta alguno de los dos modelos o alguno no tiene precio. */
export function estimarEscena(escena: FilaEscena, elecciones: EleccionesDelPlan, ajustes: Ajustes): EstimacionEscena {
  const { fotograma, animacion } = elecciones;
  if (!fotograma || !animacion) throw new ErrorCatalogo(503, "Faltan modelos con precio para estimar el plan.");
  const margen = [fotograma, animacion].some(necesitaMargen) ? ajustes.asistenteMargenEstimacion : 0;
  const creditosFotograma = Math.ceil(fotograma.precio.creditos);
  const creditosAnimacion = Math.ceil(animacion.precio.creditos);
  const creditos = Math.ceil((creditosFotograma + creditosAnimacion) * (1 + margen / 100));
  // La fecha que se muestra es la **más antigua** de las dos: es la que de verdad puede haber caducado.
  const comprobado = [fotograma.precio.comprobado, animacion.precio.comprobado].sort()[0] ?? "";
  return {
    creditosFotograma,
    creditosAnimacion,
    creditos,
    // Cada mitad se convierte con el cambio **de su** proveedor y luego se suman los euros: sumar primero los
    // créditos de dos proveedores distintos y multiplicar por una sola cifra daría un importe inventado.
    euros:
      (creditosFotograma * eurosPorCreditoDe(ajustes, fotograma.modelo.proveedor) +
        creditosAnimacion * eurosPorCreditoDe(ajustes, animacion.modelo.proveedor)) *
      (1 + margen / 100),
    modeloFotograma: fotograma.modelo.nombre,
    modeloAnimacion: animacion.modelo.nombre,
    // Los segundos que se estiman son los que se van a pedir: la duración del proyecto (que la escena copia) si
    // el modelo la admite, y la suya si no. El precio es el mismo en 4 y en 8 s, así que esto no mueve el coste.
    segundos: duracionParaModelo(animacion.modelo.parametros.duraciones, escena.plannedSeconds),
    comprobado,
    precioAntiguo: precioCaducado(comprobado),
    margen,
    selloFotograma: fotograma.precio.sello,
    selloAnimacion: animacion.precio.sello,
  };
}

const estimacionONula = (escena: FilaEscena, elecciones: EleccionesDelPlan, ajustes: Ajustes) => {
  try {
    return estimarEscena(escena, elecciones, ajustes);
  } catch (error) {
    if (error instanceof ErrorCatalogo) return null;
    throw error;
  }
};

const vistaAfirmacion = (fila: FilaAfirmacion): AfirmacionVista => ({
  id: fila.id,
  escenaId: fila.sceneId,
  texto: fila.text,
  tipo: fila.kind,
  estado: fila.state,
  fuente: fila.source,
  creadoEn: fila.createdAt.toISOString(),
});

/**
 * Lo que hace falta para poder evaluar los controles previos de una escena **sin una consulta por escena**: el
 * sello del precio vigente, las versiones vigentes de ficha y plantilla, y los parámetros de las reglas. Todo
 * eso es del proyecto, no de la escena, así que se lee una vez y se reutiliza.
 */
interface ContextoDeControles {
  selloVigente: string;
  versionPersonaje: string | null;
  versionPlantilla: string | null;
  parametros: ParametrosControles;
}

/** Hechos de una escena a partir de datos ya cargados. Es la misma forma que evalúa la puerta de producción. */
function hechosDeFilaEscena(
  fila: FilaEscena,
  proyecto: FilaProyecto,
  afirmaciones: FilaAfirmacion[],
  contexto: ContextoDeControles,
): HechosEscena {
  return {
    planAprobado: proyecto.planApprovedAt !== null,
    aprobada: fila.state !== "borrador",
    motivoInvalidacion: fila.invalidationReason,
    precioCambiado: fila.approvedFrameStamp !== "" && fila.approvedFrameStamp !== contexto.selloVigente,
    fichaCambiada:
      fila.approvedCharacterVersionId !== null && fila.approvedCharacterVersionId !== contexto.versionPersonaje,
    plantillaCambiada:
      fila.approvedTemplateVersionId !== null && fila.approvedTemplateVersionId !== contexto.versionPlantilla,
    afirmacionesPorVerificar: afirmaciones.filter((a) => a.sceneId === fila.id && a.state === "por_verificar").length,
    guionEnClipMudo: fila.clipFormat === "voz_en_off" && fila.scriptText.trim() !== "",
  };
}

function vistaEscena(
  fila: FilaEscena,
  afirmaciones: FilaAfirmacion[],
  trabajo: TrabajoDeEscena | null,
  estimacion: EstimacionEscena | null,
  controles: EvaluacionVista,
  fotograma: Medio | null = null,
): EscenaVista {
  return {
    id: fila.id,
    proyectoId: fila.projectId,
    orden: fila.sortOrder,
    texto: fila.scriptText,
    accion: fila.action,
    direccion: {
      formatoClip: fila.clipFormat,
      plano: fila.shotType,
      angulo: fila.cameraAngle,
      camara: fila.cameraMove,
      microaccion: fila.microAction,
      momentoMicroaccion: fila.microActionTiming,
      direccionVocal: fila.dialogueDirection,
      optica: fila.opticsPreset,
      luz: fila.lightPreset,
      localizacion: fila.locationPreset,
      registroEstetico: fila.aestheticRegister,
      instruccionesExtra: fila.extraInstructions,
      modoExperto: fila.expertMode,
      descripcionExperta: fila.expertDescription,
    },
    producto: { productoId: fila.productId ?? "", accion: fila.productAction },
    segundos: fila.plannedSeconds,
    estado: fila.state,
    aprobadaEn: fila.approvedAt?.toISOString() ?? null,
    motivoInvalidacion: fila.invalidationReason,
    trabajoId: trabajo?.id ?? null,
    /**
     * Con qué referencia se generó, para que el usuario sepa qué está viendo y qué ha pagado. `null` mientras
     * no haya nada generado: una escena en borrador no se hizo con ninguna.
     */
    referenciaIdentidad: trabajo?.referenciaIdentidad ?? null,
    fotograma,
    estimacion,
    afirmaciones: afirmaciones.filter((a) => a.sceneId === fila.id).map(vistaAfirmacion),
    controles,
  };
}

/** Plan a partir de las escenas ya estimadas. Los impedimentos los compone `lib/proyectos.ts`. */
export function planDeEscenas(
  proyecto: FilaProyecto,
  escenasVista: EscenaVista[],
  _ajustes: Ajustes,
  creditosAsistente = 0,
): PlanVista {
  const estimables = escenasVista.filter((e) => e.estimacion !== null);
  const totalCreditos = estimables.reduce((suma, e) => suma + (e.estimacion?.creditos ?? 0), 0);
  const porVerificar = escenasVista.flatMap((e) => e.afirmaciones).filter((a) => a.estado === "por_verificar");
  const bloqueantes = porVerificar.filter((a) => BLOQUEAN_APROBACION.includes(a.tipo));
  const fechas = estimables.map((e) => e.estimacion?.comprobado ?? "").filter((f) => f !== "");
  const plan: PlanVista = {
    creditosAsistente,
    totalCreditos,
    // Se suman los **euros** ya calculados de cada escena, no sus créditos: pueden ser de proveedores distintos.
    totalEuros: estimables.reduce((suma, e) => suma + (e.estimacion?.euros ?? 0), 0),
    presupuestoCreditos: proyecto.authorizedCredits,
    escenasSinEstimacion: escenasVista.length - estimables.length,
    afirmacionesPorVerificar: porVerificar.length,
    afirmacionesBloqueantes: bloqueantes.length,
    comprobado: fechas.sort()[0] ?? "",
    margen: Math.max(0, ...estimables.map((e) => e.estimacion?.margen ?? 0)),
    impedimentos: [],
    // El estado global es el peor de sus escenas: es lo que 0.19.0 usará para habilitar el botón de producir.
    estadoControl: peorEstado(escenasVista.map((e) => e.controles.estado)),
  };
  plan.impedimentos = impedimentosDelPlan({
    totalEscenas: escenasVista.length,
    escenasSinEstimacion: plan.escenasSinEstimacion,
    // Lo que ya se ha gastado el asistente cuenta contra el presupuesto del proyecto: es dinero del mismo bote.
    totalCreditos: plan.totalCreditos + plan.creditosAsistente,
    presupuestoCreditos: plan.presupuestoCreditos,
    afirmacionesBloqueantes: plan.afirmacionesBloqueantes,
  });
  return plan;
}

/**
 * Créditos que ya se ha gastado el asistente en este proyecto (decisión provisional del propietario, 2026-09-27:
 * su gasto también consume el presupuesto del proyecto y se muestra en el plan).
 *
 * Se suman los consumos y las reservas vivas de sus llamadas: lo apartado también está comprometido.
 */
async function gastoDelAsistente(proyectoId: string, ejecutor: Ejecutor = db()): Promise<number> {
  const [fila] = await ejecutor
    .select({
      total: sql<number>`coalesce(sum(case when ${usageLedger.entryType} in ('reserva', 'liberacion', 'consumo', 'ajuste') then ${usageLedger.credits} else 0 end), 0)::float8`,
    })
    .from(usageLedger)
    .innerJoin(assistantRuns, eq(assistantRuns.id, usageLedger.assistantRunId))
    .where(eq(assistantRuns.projectId, proyectoId));
  return Math.max(0, fila?.total ?? 0);
}

/**
 * Créditos que el proyecto lleva comprometidos: lo del asistente más lo de los trabajos de sus escenas (reservas
 * vivas y consumos). Es lo que se compara con su presupuesto autorizado.
 */
export async function comprometidoDelProyecto(proyectoId: string): Promise<number> {
  const [fila] = await db()
    .select({
      total: sql<number>`coalesce(sum(case when ${usageLedger.entryType} in ('reserva', 'liberacion', 'consumo', 'ajuste') then ${usageLedger.credits} else 0 end), 0)::float8`,
    })
    .from(usageLedger)
    .innerJoin(generationJobs, eq(generationJobs.id, usageLedger.jobId))
    .innerJoin(scenes, eq(scenes.id, generationJobs.sceneId))
    .where(eq(scenes.projectId, proyectoId));
  return Math.max(0, fila?.total ?? 0) + (await gastoDelAsistente(proyectoId));
}

/**
 * Techo del proyecto tal como lo necesita el motor de controles: cuánto se autorizó y cuánto lleva
 * comprometido. **El presupuesto autorizado de un proyecto es un tope que se aplica al gastar** (decisión
 * provisional del propietario, 2026-09-27), no solo una condición para aprobar el plan: entre la aprobación y
 * la producción puede haber pasado cualquier cosa (más escenas, otro precio, llamadas al asistente).
 *
 * `0` = sin tope propio del proyecto; manda solo el presupuesto del usuario y el tope por trabajo.
 */
export async function techoDelProyecto(
  proyectoId: string,
): Promise<{ autorizado: number | null; comprometido: number }> {
  const [fila] = await db()
    .select({ autorizado: projects.authorizedCredits })
    .from(projects)
    .where(eq(projects.id, proyectoId))
    .limit(1);
  const autorizado = fila?.autorizado ?? 0;
  if (autorizado <= 0) return { autorizado: null, comprometido: 0 };
  return { autorizado, comprometido: await comprometidoDelProyecto(proyectoId) };
}

/**
 * El mismo tope, para los caminos que **no** pasan por el motor de generación porque no encolan un trabajo: la
 * llamada al asistente de guion, que también cuesta y también sale del mismo bote. La regla es la del motor
 * (`controles/motor.ts › presupuesto-proyecto`), aplicada aquí con los hechos de este proyecto.
 */
export async function exigirTopeDelProyecto(proyectoId: string, creditos: number): Promise<void> {
  const techo = await techoDelProyecto(proyectoId);
  if (techo.autorizado === null) return;
  exigirFrenosDuros({
    tipo: "fotograma",
    presupuesto: {
      creditos,
      topeTrabajo: null,
      disponibleUsuario: null,
      retenidoUsuario: 0,
      trabajosEnRevision: 0,
      llamadasDeTextoColgadas: 0,
      revisionesColgadas: 0,
      autorizadoProyecto: techo.autorizado,
      comprometidoProyecto: techo.comprometido,
    },
    parametros: await parametrosDeControles(),
  });
}

/** Trabajo de generación asociado a cada escena, si lo hay. El más reciente manda. */
async function trabajosPorEscena(escenaIds: string[]): Promise<Map<string, TrabajoDeEscena>> {
  if (escenaIds.length === 0) return new Map();
  const filas = await db()
    .select({
      id: generationJobs.id,
      escenaId: generationJobs.sceneId,
      medioId: generationJobs.resultMediaId,
      referenciaIdentidad: generationJobs.identityReferenceKind,
    })
    .from(generationJobs)
    .where(inArray(generationJobs.sceneId, escenaIds))
    .orderBy(asc(generationJobs.createdAt));
  const mapa = new Map<string, TrabajoDeEscena>();
  for (const fila of filas) {
    if (fila.escenaId) {
      mapa.set(fila.escenaId, {
        id: fila.id,
        medioId: fila.medioId,
        referenciaIdentidad: fila.referenciaIdentidad,
      });
    }
  }
  return mapa;
}

/** Último trabajo de una escena, con la referencia de identidad que usó: es lo que se le enseña al usuario. */
interface TrabajoDeEscena {
  id: string;
  medioId: string | null;
  referenciaIdentidad: ReferenciaIdentidad;
}

/**
 * Fotogramas reales de las escenas para el storyboard (0.19.0): el aprobado si hay uno y, si no, el último que se
 * generó. Una consulta para todas las escenas, y el DTO de siempre con su URL temporal.
 */
async function fotogramasDeEscenas(
  actor: Actor,
  escenas: readonly FilaEscena[],
  trabajos: Map<string, TrabajoDeEscena>,
): Promise<Map<string, Medio>> {
  const porEscena = new Map<string, string>();
  for (const escena of escenas) {
    const id = escena.approvedFrameMediaId ?? trabajos.get(escena.id)?.medioId ?? null;
    if (id) porEscena.set(escena.id, id);
  }
  const ids = [...new Set(porEscena.values())];
  if (ids.length === 0) return new Map();
  const filas = await db().select().from(media).where(inArray(media.id, ids));
  const porId = new Map(filas.map((fila) => [fila.id, aDto(fila, actor)]));
  const resultado = new Map<string, Medio>();
  for (const [escenaId, medioId] of porEscena) {
    const dto = porId.get(medioId);
    if (dto) resultado.set(escenaId, dto);
  }
  return resultado;
}

export async function vistaDeProyecto(fila: FilaProyecto, totalEscenas: number, totalEstimado: number) {
  const proyecto: ProyectoVista = {
    id: fila.id,
    titulo: fila.title,
    formato: fila.format,
    estado: fila.state,
    idea: fila.idea,
    concepto: fila.concept,
    personajeId: fila.mainCharacterId,
    personajeNombre: await nombreDePersonaje(fila.mainCharacterId),
    presupuestoCreditos: fila.authorizedCredits,
    segundosClip: fila.clipSeconds,
    acento: fila.speechAccent,
    totalEscenas,
    totalEstimado,
    creadoEn: fila.createdAt.toISOString(),
    actualizadoEn: fila.updatedAt.toISOString(),
  };
  return proyecto;
}

/** Proyectos del actor con su total estimado, para la lista. Una consulta de escenas para todos, no una por fila. */
export async function listarProyectos(actor: Actor): Promise<ProyectoVista[]> {
  const [filas, elecciones, ajustes] = await Promise.all([
    proyectosDe(actor),
    eleccionesDelPlan(actor.id),
    leerAjustes(),
  ]);
  const escenasPorProyecto = await escenasDeProyectos(filas.map((f) => f.id));
  return Promise.all(
    filas.map((fila) => {
      const suyas = escenasPorProyecto.get(fila.id) ?? [];
      const total = suyas.reduce(
        (suma, escena) => suma + (estimacionONula(escena, elecciones, ajustes)?.creditos ?? 0),
        0,
      );
      return vistaDeProyecto(fila, suyas.length, total);
    }),
  );
}

/** Contexto de los controles del proyecto: se lee una vez y vale para todas sus escenas. */
async function contextoDeControles(
  actor: Actor,
  proyecto: FilaProyecto,
  elecciones: EleccionesDelPlan,
): Promise<ContextoDeControles> {
  const [vigente, parametros] = await Promise.all([versionesACongelar(actor, proyecto), parametrosDeControles()]);
  return {
    selloVigente: elecciones.fotograma?.precio.sello ?? "",
    versionPersonaje: vigente.versionPersonaje,
    versionPlantilla: vigente.versionPlantilla,
    parametros,
  };
}

/** Proyecto completo: escenas, afirmaciones y plan. Es lo que pinta `/proyectos/[id]`. */
export async function detalleProyecto(actor: Actor, id: unknown): Promise<ProyectoDetalle> {
  const fila = await proyectoPropio(actor, id);
  const [filasEscena, elecciones, ajustes, asistente, creditosAsistente] = await Promise.all([
    escenasDe(fila.id),
    eleccionesDelPlan(actor.id),
    leerAjustes(),
    estadoDelAsistente(actor.id),
    gastoDelAsistente(fila.id),
  ]);
  const ids = filasEscena.map((e) => e.id);
  const [afirmaciones, trabajos, contexto] = await Promise.all([
    afirmacionesDe(ids),
    trabajosPorEscena(ids),
    contextoDeControles(actor, fila, elecciones),
  ]);
  const fotogramas = await fotogramasDeEscenas(actor, filasEscena, trabajos);
  const escenasVista = filasEscena.map((escena) =>
    vistaEscena(
      escena,
      afirmaciones,
      trabajos.get(escena.id) ?? null,
      estimacionONula(escena, elecciones, ajustes),
      // Los controles de la escena se evalúan con el **mismo motor** que cierra la puerta al producirla, con
      // datos que ya están cargados: ni una consulta más por escena.
      evaluarParaMostrar({
        tipo: "fotograma",
        parametros: contexto.parametros,
        escena: hechosDeFilaEscena(escena, fila, afirmaciones, contexto),
      }),
      fotogramas.get(escena.id) ?? null,
    ),
  );
  const plan = planDeEscenas(fila, escenasVista, ajustes, creditosAsistente);
  return {
    proyecto: await vistaDeProyecto(fila, escenasVista.length, plan.totalCreditos),
    escenas: escenasVista,
    plan,
    asistenteDisponible: asistente.disponible,
    motivoAsistente: asistente.motivo,
    estimacionAsistente: asistente.estimacion,
  };
}

// ── Aprobación ────────────────────────────────────────────────────────────────────────────────────────────

export interface PeticionAprobacion {
  /** Presupuesto autorizado del proyecto, en créditos. Se fija al aprobar (decisión 3 de la fase). */
  presupuestoCreditos: number;
  /** Total estimado que el usuario tenía delante. Si el vigente es otro, no se aprueba y se vuelve a mostrar. */
  totalConfirmado: number;
}

/**
 * Aprueba el plan del proyecto. Todo pasa en una transacción con la fila del proyecto bloqueada: dos
 * aprobaciones a la vez no pueden congelar precios distintos.
 *
 * Lo que comprueba, en este orden: que el presupuesto es un número válido, que el total sigue siendo el que se
 * confirmó, y que no queda ningún impedimento (escenas sin estimar, presupuesto corto o afirmaciones de salud
 * sin revisar). Solo entonces congela cada escena y marca el proyecto como planificado.
 */
export async function aprobarPlan(actor: Actor, id: unknown, peticion: PeticionAprobacion): Promise<ProyectoDetalle> {
  const presupuesto = peticion.presupuestoCreditos;
  // El mismo tope que al crear el proyecto: un presupuesto sin techo no es un presupuesto.
  if (!Number.isInteger(presupuesto) || presupuesto <= 0 || presupuesto > PRESUPUESTO_MAXIMO) {
    throw new ErrorProyecto(
      400,
      `Indica cuántos créditos autorizas como máximo para este proyecto (de 1 a ${PRESUPUESTO_MAXIMO}).`,
    );
  }
  const proyecto = await proyectoPropio(actor, id);
  const proyectoId = proyecto.id;
  const ajustes = await leerAjustes();
  const elecciones = await eleccionesDelPlan(actor.id);
  // Lo que se congela además del modelo y el precio: con qué versión de la ficha y de la plantilla se iba a
  // componer el prompt. Sin guardarlas, «la ficha ha cambiado desde que aprobaste» no se podría comprobar.
  const congelado = await versionesACongelar(actor, proyecto);
  await db().transaction(async (tx) => {
    const [fila] = await tx.select().from(projects).where(eq(projects.id, proyectoId)).limit(1).for("update");
    if (!fila) throw new ErrorProyecto(404, "Ese proyecto no existe.");
    const filasEscena = await escenasDe(proyectoId, tx);
    const ids = filasEscena.map((e) => e.id);
    const afirmaciones = ids.length === 0 ? [] : await tx.select().from(claims).where(inArray(claims.sceneId, ids));
    const escenasVista = filasEscena.map((escena) =>
      // Aquí solo interesa el coste: la aprobación se está decidiendo en esta misma transacción, así que los
      // controles de la escena se dejan vacíos y los recalcula `detalleProyecto` al devolver el resultado.
      vistaEscena(
        escena,
        afirmaciones,
        null,
        estimacionONula(escena, elecciones, ajustes),
        EVALUACION_LISTA(REGLAS_VERSION),
      ),
    );
    // El presupuesto que se está fijando es el que manda en la comprobación, no el que había guardado.
    const plan = planDeEscenas(
      { ...fila, authorizedCredits: presupuesto },
      escenasVista,
      ajustes,
      await gastoDelAsistente(proyectoId, tx),
    );
    if (plan.totalCreditos !== peticion.totalConfirmado) {
      throw new ErrorProyecto(
        409,
        `El coste estimado ha cambiado desde que lo viste (ahora son ${formatearCreditos(plan.totalCreditos)}). Revisa el plan y vuelve a aprobarlo.`,
      );
    }
    if (!puedeAprobarse(plan)) throw new ErrorProyecto(409, plan.impedimentos[0] ?? "El plan no se puede aprobar.");

    const ahora = new Date();
    for (const escena of filasEscena) {
      const estimacion = estimacionONula(escena, elecciones, ajustes);
      if (!estimacion) continue;
      await tx
        .update(scenes)
        .set({
          state: escena.state === "producida" ? "producida" : "aprobada",
          approvedBy: actor.id,
          approvedAt: ahora,
          approvedFrameModel: elecciones.fotograma?.modelo.modelo ?? "",
          approvedAnimationModel: elecciones.animacion?.modelo.modelo ?? "",
          approvedFrameStamp: estimacion.selloFotograma,
          approvedAnimationStamp: estimacion.selloAnimacion,
          approvedCharacterVersionId: congelado.versionPersonaje,
          approvedTemplateVersionId: congelado.versionPlantilla,
          estimatedCredits: estimacion.creditos,
          invalidationReason: "",
          updatedAt: ahora,
        })
        .where(eq(scenes.id, escena.id));
    }
    await tx
      .update(projects)
      .set({
        authorizedCredits: presupuesto,
        state: fila.state === "en_produccion" || fila.state === "listo" ? fila.state : "planificado",
        planApprovedBy: actor.id,
        planApprovedAt: ahora,
        updatedAt: ahora,
      })
      .where(eq(projects.id, proyectoId));
  });
  return detalleProyecto(actor, proyectoId);
}

/**
 * Versiones que congela una aprobación: la de la ficha del protagonista y la de la plantilla con la que se
 * compondría el prompt. `null` cuando el proyecto no tiene protagonista o la instalación no tiene plantilla.
 */
async function versionesACongelar(
  actor: Actor,
  proyecto: FilaProyecto,
): Promise<{ versionPersonaje: string | null; versionPlantilla: string | null }> {
  const version = proyecto.mainCharacterId ? await ultimaVersion(proyecto.mainCharacterId) : null;
  const plantilla = await plantillaVigenteDe(actor.id, "image_edit");
  return { versionPersonaje: version?.id ?? null, versionPlantilla: plantilla?.versionId ?? null };
}

/**
 * Hechos de una escena para el motor de controles: si el plan está aprobado, si la escena sigue aprobada, si lo
 * que se congeló (sello del precio, versión de la ficha y versión de la plantilla) sigue siendo lo vigente y
 * cuántas afirmaciones le quedan por verificar.
 *
 * Aquí **no se decide nada**: las reglas están en `controles/motor.ts`, que es el único sitio donde se decide
 * si algo se puede generar.
 */
export async function hechosDeEscena(
  actor: Actor,
  escenaId: unknown,
): Promise<{ escena: FilaEscena; hechos: HechosEscena }> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  const [elecciones, vigente, afirmaciones] = await Promise.all([
    eleccionesDelPlan(actor.id),
    versionesACongelar(actor, proyecto),
    afirmacionesDe([escena.id]),
  ]);
  const selloVigente = elecciones.fotograma?.precio.sello ?? "";
  return {
    escena,
    hechos: {
      planAprobado: proyecto.planApprovedAt !== null,
      aprobada: escena.state !== "borrador",
      motivoInvalidacion: escena.invalidationReason,
      precioCambiado: escena.approvedFrameStamp !== "" && escena.approvedFrameStamp !== selloVigente,
      fichaCambiada:
        escena.approvedCharacterVersionId !== null && escena.approvedCharacterVersionId !== vigente.versionPersonaje,
      plantillaCambiada:
        escena.approvedTemplateVersionId !== null && escena.approvedTemplateVersionId !== vigente.versionPlantilla,
      afirmacionesPorVerificar: afirmaciones.filter((a) => a.state === "por_verificar").length,
      guionEnClipMudo: escena.clipFormat === "voz_en_off" && escena.scriptText.trim() !== "",
    },
  };
}

/**
 * Puerta de producción de una escena: aplica **las reglas del motor** sobre los hechos de esa escena.
 *
 * **Es una puerta parcial, y a propósito.** Solo aporta el grupo `escena`, así que solo aplica las reglas de la
 * escena: plan aprobado, aprobación en pie (precio, ficha y plantilla congelados) y afirmaciones por verificar.
 * **No aplica los frenos de credencial, de saldo, de cuota ni de presupuesto**, porque en este punto no hay
 * modelo elegido ni coste que comparar: esas reglas dependen del envío concreto.
 *
 * Por eso **no basta para autorizar un gasto**. Quien encola pasa por la puerta completa
 * (`controles/puerta.ts › exigirControles`), que exige **todos** los grupos de hechos y falla si falta alguno.
 * Esta se usa para dos cosas: cortar temprano un camino que produce una escena, y pintar el estado de cada
 * escena en el plan del proyecto.
 */
export async function exigirEscenaAprobada(actor: Actor, escenaId: unknown): Promise<FilaEscena> {
  const { escena, hechos } = await hechosDeEscena(actor, escenaId);
  exigirFrenosDuros({ tipo: "fotograma", escena: hechos, parametros: await parametrosDeControles() });
  return escena;
}
