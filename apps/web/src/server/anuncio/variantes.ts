import { and, asc, eq, sql } from "drizzle-orm";
import type { AnguloVista } from "@/lib/anuncio";
import { ESCENAS_SUGERIDAS } from "@/lib/proyectos";
import { proyectoPropio } from "../asistente/consulta";
import { PROYECTOS_MAXIMOS } from "../asistente/proyectos";
import { db } from "../db/cliente";
import { adBriefs } from "../db/esquema-anuncio";
import { type FilaProyecto, projects } from "../db/esquema-proyectos";
import { exigirClaveIdempotencia, exigirConfirmacion } from "../generacion/comprobaciones";
import { exigirSelloVigente } from "../generacion/precios";
import { dentroDelLimite, quedaCupo } from "../limite";
import { estimarTextoPorMapa } from "../mapa/texto";
import type { Actor } from "../media/servicio";
import type { Buscador } from "../proveedores/codigos";
import { listarAngulos } from "./catalogo";
import { registrarDeclaracion } from "./declaracion";
import { ErrorAnuncio } from "./errores";
import { type PropuestaDeHooks, pedirHooksYGuion, RITMO_HOOKS } from "./guion";
import { exigirVariantesActivas } from "./http";

/**
 * **Variantes por ángulo** (0.27.0): el mismo producto y la misma oferta contados desde ángulos distintos, un
 * ángulo por vídeo.
 *
 * Lo que se crea son **proyectos hermanos** (decisión 1 de las preguntas resueltas): un proyecto es un anuncio y
 * un anuncio tiene un solo ángulo, así que probar cinco ángulos son cinco proyectos con el mismo
 * `variantGroupId`, el mismo producto, la misma oferta y su propio brief. No hay ninguna entidad «campaña» que dar
 * de alta: el grupo es el valor que comparten.
 *
 * Las tres reglas que gobiernan esto:
 *
 * 1. **una sola confirmación de coste, agregada**: se enseña lo que cuesta cada variante y el total, y se confirma
 *    una vez. Cada llamada sigue reservando y cerrando su propio gasto por dentro, que es lo que impide cobrar dos
 *    veces, pero al usuario no se le pide confirmar cinco veces lo que ya confirmó;
 * 2. **subconjunto elegible**: se eligen los ángulos que se quieran, no los doce. Y los que no se pueden pedir se
 *    dicen **antes** de cobrar, con su motivo;
 * 3. **solo texto**: aquí no se genera ni un fotograma ni un clip. Lo que sale son proyectos con su guion en
 *     borrador, para revisar.
 */

/** Tope de variantes por petición. Es el tamaño del catálogo de fábrica: doce ángulos, doce vídeos. */
export const MAXIMO_VARIANTES = 12;

/** Un ángulo del catálogo con si se puede pedir una variante suya ahora mismo, y por qué no. */
export interface AnguloElegible {
  angulo: AnguloVista;
  elegible: boolean;
  /** Por qué no se puede elegir, nombrando lo que falta. Vacío cuando sí se puede. */
  motivo: string;
  /** `true` cuando este ángulo afirma algo comprobable y su variante necesita la declaración de veracidad. */
  exigeDeclaracion: boolean;
}

export interface EstimacionDeVariantes {
  angulos: AnguloElegible[];
  /** Créditos de **una** variante: una llamada de texto por la entrada principal del mapa. */
  creditosPorVariante: number;
  /** `true` si la entrada principal se paga por cuota del plan: entonces no hay créditos que confirmar. */
  porCuota: boolean;
  sello: string;
  nombreProveedor: string;
  modelo: string;
  /** Motivo por el que no se puede pedir nada (mapa sin entradas, modelo sin precio). Vacío si se puede. */
  motivo: string;
  /** `true` cuando el ángulo del proyecto de partida ya tiene declaración y sus hermanos la necesitarán. */
  textoDeclaracionNecesario: boolean;
}

export interface ResultadoDeVariante {
  proyectoId: string;
  titulo: string;
  angulo: string;
  nombreAngulo: string;
  /** La propuesta de esa variante; `null` si su llamada falló. */
  propuesta: PropuestaDeHooks | null;
  /** Qué ha pasado con esta variante cuando no hay propuesta. Vacío si salió bien. */
  error: string;
}

export interface VariantesCreadas {
  /** Identificador del grupo. Todos los hermanos lo comparten, incluido el proyecto de partida. */
  grupoId: string;
  variantes: ResultadoDeVariante[];
}

/**
 * El brief del proyecto de partida. Sin brief no hay nada de lo que variar: es de ahí de donde salen el producto
 * y la oferta que comparten los hermanos.
 */
async function briefDePartida(proyecto: FilaProyecto) {
  const [brief] = await db().select().from(adBriefs).where(eq(adBriefs.projectId, proyecto.id)).limit(1);
  if (!brief || !brief.productId || !brief.offerId) {
    throw new ErrorAnuncio(
      409,
      "Para crear variantes por ángulo, este proyecto necesita antes un brief con su producto y su oferta: es lo que los hermanos comparten. Complétalo y vuelve a intentarlo.",
    );
  }
  return brief;
}

/**
 * Los ángulos que se pueden pedir y los que no, con el coste de una variante.
 *
 * Es una **lectura**: no crea ningún proyecto, no llama a ningún proveedor y no reserva nada. El ángulo que ya
 * tiene un hermano del grupo no es elegible: dos hermanos con el mismo ángulo serían el mismo anuncio dos veces.
 */
export async function estimarVariantes(actor: Actor, proyectoId: unknown): Promise<EstimacionDeVariantes> {
  await exigirVariantesActivas();
  const proyecto = await proyectoPropio(actor, proyectoId);
  const brief = await briefDePartida(proyecto);
  const [angulos, estimacion, ocupados] = await Promise.all([
    listarAngulos(),
    estimarTextoPorMapa(actor.id),
    angulosDelGrupo(actor, proyecto),
  ]);
  return {
    angulos: angulos.map((angulo) => ({
      angulo,
      elegible: !ocupados.has(angulo.clave),
      motivo: ocupados.has(angulo.clave)
        ? "Ya tienes un anuncio de este grupo con este ángulo. Abre ese proyecto en lugar de repetirlo."
        : "",
      exigeDeclaracion: angulo.exigeDeclaracion,
    })),
    creditosPorVariante: estimacion.creditos,
    porCuota: estimacion.porCuota,
    sello: estimacion.sello,
    nombreProveedor: estimacion.nombreProveedor,
    modelo: estimacion.modelo,
    motivo: estimacion.hayEntradas ? "" : estimacion.motivo,
    textoDeclaracionNecesario: angulos.some((a) => a.exigeDeclaracion),
  };
}

/** Ángulos que ya ocupan los hermanos del grupo, incluido el del proyecto de partida. */
async function angulosDelGrupo(actor: Actor, proyecto: FilaProyecto): Promise<Set<string>> {
  const ocupados = new Set<string>();
  if (proyecto.anglePresetKey !== "") ocupados.add(proyecto.anglePresetKey);
  if (!proyecto.variantGroupId) return ocupados;
  const hermanos = await db()
    .select({ angulo: projects.anglePresetKey })
    .from(projects)
    .where(eq(projects.variantGroupId, proyecto.variantGroupId));
  for (const hermano of hermanos) if (hermano.angulo !== "") ocupados.add(hermano.angulo);
  return ocupados;
}

/** Los ángulos pedidos, comprobados contra el catálogo, contra el tope y contra los que ya tiene el grupo. */
async function angulosPedidos(
  actor: Actor,
  proyecto: FilaProyecto,
  valor: unknown,
): Promise<{ elegidos: AnguloVista[]; conDeclaracion: AnguloVista[] }> {
  if (!Array.isArray(valor) || valor.length === 0) {
    throw new ErrorAnuncio(400, "Elige al menos un ángulo del que crear una variante.");
  }
  if (valor.length > MAXIMO_VARIANTES) {
    throw new ErrorAnuncio(400, `No se pueden crear más de ${MAXIMO_VARIANTES} variantes de una vez.`);
  }
  const catalogo = await listarAngulos();
  const ocupados = await angulosDelGrupo(actor, proyecto);
  const elegidos: AnguloVista[] = [];
  for (const clave of valor) {
    const angulo = catalogo.find((a) => a.clave === clave);
    if (!angulo) {
      throw new ErrorAnuncio(400, "Uno de los ángulos que has elegido no está en el catálogo o ya no se ofrece.");
    }
    if (ocupados.has(angulo.clave)) {
      throw new ErrorAnuncio(
        409,
        `Ya tienes un anuncio de este grupo con el ángulo «${angulo.nombre}». Quítalo de la selección: dos hermanos con el mismo ángulo serían el mismo anuncio dos veces.`,
      );
    }
    // Dos veces el mismo ángulo en la misma petición es lo mismo: se rechaza igual y se dice cuál.
    if (elegidos.some((e) => e.clave === angulo.clave)) {
      throw new ErrorAnuncio(400, `Has elegido «${angulo.nombre}» dos veces. Cada variante lleva un ángulo distinto.`);
    }
    elegidos.push(angulo);
  }
  return { elegidos, conDeclaracion: elegidos.filter((a) => a.exigeDeclaracion) };
}

export interface PeticionDeVariantes {
  angulos: unknown;
  claveIdempotencia: unknown;
  /** Créditos **totales** que el usuario tenía delante: los de una variante por las que ha elegido. */
  creditosConfirmados?: unknown;
  selloEstimacion?: unknown;
  /**
   * Declaración de veracidad para los ángulos elegidos que la exigen. Tiene que ser expresamente `true`: se
   * registra una declaración por variante, con su texto, su fecha y su IP, igual que la del brief.
   */
  declaraVeracidad?: unknown;
}

/**
 * Crea las variantes: un proyecto hermano por ángulo, cada uno con su brief, y les pide sus hooks y su guion.
 *
 * El coste se confirma **una vez** y es el agregado. Después, cada variante hace su propia llamada con su propia
 * clave de idempotencia derivada de la confirmación: si una falla, las demás siguen y la que falló dice por qué,
 * en lugar de dejar el grupo a medias sin explicación.
 */
export async function crearVariantes(
  actor: Actor,
  proyectoId: unknown,
  peticion: PeticionDeVariantes,
  httpPeticion: Request,
  buscar: Buscador = fetch,
): Promise<VariantesCreadas> {
  await exigirVariantesActivas();
  const proyecto = await proyectoPropio(actor, proyectoId);
  const brief = await briefDePartida(proyecto);
  const clave = exigirClaveIdempotencia(peticion.claveIdempotencia);
  const { elegidos, conDeclaracion } = await angulosPedidos(actor, proyecto, peticion.angulos);

  /**
   * Los ángulos que afirman algo comprobable piden la declaración de veracidad, y las variantes son proyectos que
   * todavía no existen: no puede haber una declaración previa de ellos. Así que se declara **aquí**, para todos
   * los elegidos que la exigen, y se registra una por variante con su texto entero.
   */
  if (conDeclaracion.length > 0 && peticion.declaraVeracidad !== true) {
    const nombres = conDeclaracion.map((a) => `«${a.nombre}»`).join(", ");
    throw new ErrorAnuncio(
      400,
      `${nombres} ${conDeclaracion.length === 1 ? "afirma" : "afirman"} algo que se puede comprobar, así que para crear ${conDeclaracion.length === 1 ? "esa variante" : "esas variantes"} tienes que declarar que lo que afirmas es cierto. Acepta la declaración o quita ${conDeclaracion.length === 1 ? "ese ángulo" : "esos ángulos"} de la selección.`,
    );
  }

  const estimacion = await estimarTextoPorMapa(actor.id);
  if (!estimacion.hayEntradas) throw new ErrorAnuncio(409, estimacion.motivo);
  if (!estimacion.porCuota) {
    // La confirmación es **agregada**: lo que cuesta una variante por las que se han elegido.
    exigirConfirmacion(peticion.creditosConfirmados, estimacion.creditos * elegidos.length);
    exigirSelloVigente(peticion.selloEstimacion, estimacion.sello, true);
  }
  // Que quepan todas se comprueba **antes** de gastar ritmo: si no caben, no se ha consumido nada de nadie.
  await exigirHuecoDeProyectos(actor, elegidos.length);
  // Sin ningún hueco de ritmo no se empieza; el resto se gasta llamada a llamada (crear doce variantes son doce).
  if (!(await quedaCupo(`anuncio:hooks:${actor.id}`, RITMO_HOOKS))) {
    throw new ErrorAnuncio(
      429,
      "Has pedido demasiados hooks esta hora y ahora no cabe ninguna variante. Espera un rato y vuelve a intentarlo.",
    );
  }

  const grupoId = proyecto.variantGroupId ?? crypto.randomUUID();
  // El proyecto de partida entra en su propio grupo: es el primer hermano, no algo aparte.
  if (proyecto.variantGroupId === null) {
    await db().update(projects).set({ variantGroupId: grupoId }).where(eq(projects.id, proyecto.id));
  }

  const variantes: ResultadoDeVariante[] = [];
  for (const angulo of elegidos) {
    // Si el ritmo se agota a mitad de tanda, las que faltan no se crean ni se cobran: se dice cuáles.
    if (!(await dentroDelLimite(`anuncio:hooks:${actor.id}`, RITMO_HOOKS))) {
      variantes.push({
        proyectoId: "",
        titulo: "",
        angulo: angulo.clave,
        nombreAngulo: angulo.nombre,
        propuesta: null,
        error:
          "No se ha creado: pasarías del ritmo de peticiones al modelo de texto de esta hora. No se ha cobrado nada.",
      });
      continue;
    }
    const hermano = await crearHermano(actor, proyecto, brief, angulo, grupoId);
    if (angulo.exigeDeclaracion) {
      await registrarDeclaracion(actor, hermano.id, angulo.clave, true, httpPeticion);
    }
    variantes.push(await pedirGuionDeVariante(actor, hermano, angulo, clave, buscar, estimacion.porCuota));
  }
  return { grupoId, variantes };
}

/** Que quepan todas: crear seis proyectos cuando solo cabe uno dejaría el grupo a medias. */
async function exigirHuecoDeProyectos(actor: Actor, cuantos: number): Promise<void> {
  const [{ total: suyos } = { total: 0 }] = await db()
    .select({ total: sql<number>`count(*)::int` })
    .from(projects)
    .where(eq(projects.userId, actor.id));
  if (suyos + cuantos > PROYECTOS_MAXIMOS) {
    throw new ErrorAnuncio(
      409,
      `Tienes ${suyos} proyectos y el máximo son ${PROYECTOS_MAXIMOS}: estas ${cuantos} variantes no caben. Borra algún proyecto o elige menos ángulos.`,
    );
  }
}

/**
 * Un hermano: copia del proyecto de partida —formato, idea, protagonista, duración, acento y presupuesto— con su
 * propio brief, el **mismo** producto y la **misma** oferta, y su propio ángulo.
 *
 * El proyecto y su brief se escriben en la misma transacción, con la copia denormalizada del ángulo incluida: un
 * hermano a medias sería un proyecto vacío en la lista de alguien.
 */
async function crearHermano(
  actor: Actor,
  origen: FilaProyecto,
  brief: typeof adBriefs.$inferSelect,
  angulo: AnguloVista,
  grupoId: string,
): Promise<FilaProyecto> {
  return db().transaction(async (tx) => {
    // Dos tandas a la vez sobre el mismo grupo se turnan aquí: la segunda ve el ángulo que dejó la primera.
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, origen.id)).for("update");
    const ocupados = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.variantGroupId, grupoId), eq(projects.anglePresetKey, angulo.clave)))
      .limit(1);
    if (ocupados.length > 0) {
      throw new ErrorAnuncio(
        409,
        `Ya existe una variante de este grupo con el ángulo «${angulo.nombre}» (otra petición se ha adelantado). No se ha cobrado nada por esta.`,
      );
    }
    const [hermano] = await tx
      .insert(projects)
      .values({
        userId: actor.id,
        title: `${origen.title} · ${angulo.nombre}`.slice(0, 200),
        format: origen.format,
        idea: origen.idea,
        mainCharacterId: origen.mainCharacterId,
        authorizedCredits: origen.authorizedCredits,
        clipSeconds: origen.clipSeconds,
        speechAccent: origen.speechAccent,
        variantGroupId: grupoId,
        anglePresetKey: angulo.clave,
      })
      .returning();
    if (!hermano) throw new ErrorAnuncio(500, "La variante no se ha podido crear. Vuelve a intentarlo.");
    await tx.insert(adBriefs).values({
      projectId: hermano.id,
      productId: brief.productId,
      offerId: brief.offerId,
      audience: brief.audience,
      betterSelf: brief.betterSelf,
      anglePresetKey: angulo.clave,
      notes: brief.notes,
    });
    return hermano;
  });
}

/** Pide el guion de una variante. Un fallo suyo no tira las demás: se anota y se sigue. */
async function pedirGuionDeVariante(
  actor: Actor,
  hermano: FilaProyecto,
  angulo: AnguloVista,
  claveConfirmacion: string,
  buscar: Buscador,
  porCuota: boolean,
): Promise<ResultadoDeVariante> {
  const comun = {
    proyectoId: hermano.id,
    titulo: hermano.title,
    angulo: angulo.clave,
    nombreAngulo: angulo.nombre,
  };
  try {
    const propuesta = await pedirHooksYGuion(actor, hermano, {
      // Derivada de la confirmación y del ángulo: repetir la petición entera no vuelve a cobrar ninguna variante.
      claveIdempotencia: `variantes:${claveConfirmacion}:${angulo.clave}`,
      escenas: ESCENAS_SUGERIDAS[hermano.format],
      buscar,
      porCuota,
    });
    return { ...comun, propuesta, error: "" };
  } catch (error) {
    // Sin propuesta no hay nada que ver en ese proyecto: no se deja un hermano vacío en la lista de nadie.
    await db()
      .delete(projects)
      .where(eq(projects.id, hermano.id))
      .catch(() => undefined);
    if (error instanceof ErrorAnuncio) {
      return { ...comun, proyectoId: "", titulo: "", propuesta: null, error: error.message };
    }
    throw error;
  }
}

/** Los hermanos de un grupo, con su ángulo: es lo que compara dos campañas del mismo producto. */
export async function hermanosDelGrupo(actor: Actor, proyectoId: unknown): Promise<FilaProyecto[]> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  if (!proyecto.variantGroupId) return [proyecto];
  // El dueño va en el mismo `where` que el grupo: un grupo no es una autorización, es una agrupación.
  return db()
    .select()
    .from(projects)
    .where(and(eq(projects.variantGroupId, proyecto.variantGroupId), eq(projects.userId, actor.id)))
    .orderBy(asc(projects.createdAt));
}
