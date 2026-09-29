import { eq, sql } from "drizzle-orm";
import { formatoCanta } from "@/lib/direccion";
import { PROMPT_MINIMO } from "@/lib/generacion";
import { falloConCoste, type ProduccionVista, trabajoTerminado } from "@/lib/produccion";
import { escenaPropia, escenasDe, proyectoPropio } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { db } from "../db/cliente";
import { characters, type FilaEscena, type FilaProyecto, type FilaTrabajo, products, scenes } from "../db/esquema";
import { direccionDeLaEscena, type PersonajeDirigido, seisCDeLaEscena } from "../direccion/escena";
import { claveDerivada, imagenPropia } from "../generacion/comprobaciones";
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import { crearAnimacion, crearFotograma } from "../generacion/servicio";
import type { Actor } from "../media/servicio";
import { producirEscenaHablada } from "../omni/escena";
import { plantillaVigenteDe } from "../prompts/consulta";
import { invalidarRevisionesDeEscena } from "../revision/resultados";
import { dialogoDelClip } from "../voz/modo";
import { marcarEnProduccion } from "./cierre";
import { escenasPorProducir, estadoDeProduccion, exigirDuracionProducible, ultimoTrabajoDeEscena } from "./consulta";
import { presetsDeProduccion } from "./presets";

/** La derivación de claves vive en `generacion/comprobaciones.ts`: la usan también los dos clips de un podcast. */
export { claveDerivada };

/**
 * Producción de las escenas de un proyecto aprobado (RF06, 0.19.0).
 *
 * **Todo lo que gasta dinero aquí pasa por `generacion/servicio.ts`**, con `escenaId`. Eso no es una comodidad:
 * es lo que garantiza, sin repetir una sola regla, que cada envío cruza la puerta única del motor de controles
 * con la escena como sujeto (plan aprobado, aprobación en pie, afirmaciones verificadas, consentimiento,
 * credencial, cuota y los tres techos de dinero), la idempotencia por confirmación, la reserva atómica con el
 * tope de trabajos y el de escenas en vuelo, la traducción detrás de todas las comprobaciones y la revalidación
 * del despacho antes de enviar. Este fichero **no decide nada de dinero**: decide qué escena toca.
 *
 * Y una regla de alcance: **una escena no toca a las demás**. Regenerar, cancelar o reintentar escriben solo en
 * su propia fila y encolan solo sus propios trabajos.
 */

/** Lo que el navegador confirma para gastar en un trabajo de producción. Es la confirmación de siempre. */
export interface ConfirmacionProduccion {
  /** Casilla «tengo derecho a usar esta imagen». */
  derechos: boolean;
  /** Casilla «tengo derecho a usar esta marca» (0.26.0). Obligatoria en cuanto la escena lleva producto. */
  derechoMarca?: boolean;
  /** Revisión de las referencias del personaje (ADR-0009). */
  sinTerceros: boolean;
  /** Créditos que el usuario tenía delante **por trabajo**. */
  creditosConfirmados: number;
  /** Sello del precio que se mostró: si ha cambiado, el servidor rechaza el envío. */
  selloEstimacion: string;
  /** Clave que firma el navegador. De ella se derivan las de cada escena, así que repetir no cobra dos veces. */
  claveIdempotencia: string;
  avisoUmbralAceptado?: boolean;
  /** Avisos «Necesita ajustes» confirmados expresamente, por su clave de regla. */
  avisosConfirmados?: string[];
}

/**
 * Texto de la escena con el que se compone el prompt del fotograma: lo que se ve (`accion`) y, si está vacío, lo
 * que se cuenta. El prompt final lo compone el servidor y **no se le muestra al usuario** (ADR-0022).
 */
function textoVisualDe(escena: FilaEscena): string {
  const texto = (escena.action.trim() !== "" ? escena.action : escena.scriptText).trim();
  if (texto.length < PROMPT_MINIMO) {
    throw new ErrorProyecto(
      409,
      `La escena ${escena.sortOrder} no describe todavía lo que se ve. Escribe su acción con al menos ${PROMPT_MINIMO} caracteres antes de producirla.`,
    );
  }
  return texto;
}

/**
 * Lo que el protagonista aporta a la dirección: si es una persona real y cómo es su voz.
 *
 * `descripcion` va **vacía** a propósito: la ficha del personaje ya entra en el prompt por su propio camino
 * (`contextoDeVersion`, desde la 0.15.0), y repetirla aquí la diría dos veces. Lo que sí añade la dirección es
 * la instrucción de no retocar a una persona real, que sale de `real`.
 */
async function personajeDirigidoDe(proyecto: FilaProyecto): Promise<PersonajeDirigido> {
  const sinPersonaje: PersonajeDirigido = { descripcion: "", real: true, atractivoElegido: false, ejesVoz: {} };
  if (!proyecto.mainCharacterId) return sinPersonaje;
  const [personaje] = await db()
    .select({ virtual: characters.virtual, voiceAxes: characters.voiceAxes, beautyOptIn: characters.beautyOptIn })
    .from(characters)
    .where(eq(characters.id, proyecto.mainCharacterId))
    .limit(1);
  // Sin fila se trata como persona real: es el lado que **no** embellece, y equivocarse hacia ahí no hace daño.
  if (!personaje) return sinPersonaje;
  return {
    descripcion: "",
    real: !personaje.virtual,
    // Solo cuenta en un personaje inventado; el compositor lo vuelve a comprobar por su cuenta.
    atractivoElegido: personaje.virtual && personaje.beautyOptIn,
    ejesVoz: personaje.voiceAxes,
  };
}

/** El protagonista del proyecto es lo que da identidad al fotograma: sin él no se produce. */
function exigirProtagonista(proyecto: FilaProyecto): string {
  if (!proyecto.mainCharacterId) {
    throw new ErrorProyecto(
      409,
      "Este proyecto no tiene protagonista asignado. Elige un personaje con consentimiento vigente antes de producirlo.",
    );
  }
  return proyecto.mainCharacterId;
}

/**
 * Encola lo que toca para **empezar** una escena: su fotograma, o el clip hablado entero cuando el proyecto está
 * en modo `omni` (0.22.0).
 *
 * En modo `omni` no hay fotograma: la identidad y la voz salen del personaje registrado en el proveedor, así que
 * la escena es un solo trabajo. Todo lo demás —confirmación, sello, idempotencia, motor de controles, reserva y
 * topes— es exactamente lo mismo, porque lo hace el mismo camino de dinero.
 */
async function encolarPrimerTrabajo(
  actor: Actor,
  escena: FilaEscena,
  proyecto: FilaProyecto,
  confirmacion: ConfirmacionProduccion,
  clave: string,
  h: Herramientas,
  reintento = false,
): Promise<void> {
  if (formatoCanta(escena.clipFormat)) {
    throw new ErrorProyecto(
      409,
      "Esta escena usa el formato «cantar con tu audio». Confirma el coste de su audio y prodúcela desde /api/escenas/{id}/canto/produccion; el camino normal no sabe sincronizarlo. No se ha cobrado nada.",
    );
  }
  if (escena.castFormat !== "solo" && proyecto.voiceMode !== "omni") {
    throw new ErrorProyecto(
      409,
      "Esta escena tiene dos personajes y necesita el modo Omni. Cambia el modo de voz del proyecto antes de producirla.",
    );
  }
  if (proyecto.voiceMode === "omni") {
    await producirEscenaHablada(
      actor,
      escena,
      proyecto,
      {
        derechos: confirmacion.derechos,
        derechoMarca: confirmacion.derechoMarca,
        sinTerceros: confirmacion.sinTerceros,
        creditosConfirmados: confirmacion.creditosConfirmados,
        selloEstimacion: confirmacion.selloEstimacion,
        claveIdempotencia: clave,
        avisoUmbralAceptado: confirmacion.avisoUmbralAceptado,
        avisosConfirmados: confirmacion.avisosConfirmados,
        reintentoDeEscena: reintento,
      },
      h,
    );
    return;
  }
  await encolarFotograma(actor, escena, proyecto, confirmacion, clave, h, reintento);
}

/** Encola el fotograma de una escena. Toda la decisión de dinero la toma `crearFotograma`. */
async function encolarFotograma(
  actor: Actor,
  escena: FilaEscena,
  proyecto: FilaProyecto,
  confirmacion: ConfirmacionProduccion,
  clave: string,
  h: Herramientas,
  reintento = false,
): Promise<void> {
  const plantilla = await plantillaVigenteDe(actor.id, "image_edit");
  const personaje = await personajeDirigidoDe(proyecto);
  await crearFotograma(
    actor,
    {
      prompt: textoVisualDe(escena),
      personajeId: exigirProtagonista(proyecto),
      escenaId: escena.id,
      reintentoDeEscena: reintento,
      /**
       * El fotograma de una escena se compone con las **6C** y no con la plantilla: la escena trae elegidos
       * el plano, el ángulo, la óptica, la luz y el sitio, y el bloque de anclajes tiene que cerrar el prompt.
       * `vestuario` sale de la ficha del personaje, que ya entra por su propio camino como contexto.
       */
      seisC: await seisCDeLaEscena(actor.id, escena, personaje, ""),
      ...(escena.changeOnly === "ninguno"
        ? {}
        : {
            cambiarSolo: {
              que: escena.changeOnly,
              // Lo nuevo es lo que el usuario ha escrito en la acción de la escena, ya traducido aguas abajo.
              valor: escena.action.trim(),
              conSegundaReferencia: escena.changeOnlyReferenceMediaId !== null,
            },
          }),
      derechos: confirmacion.derechos,
      derechoMarca: confirmacion.derechoMarca,
      sinTerceros: confirmacion.sinTerceros,
      creditosConfirmados: confirmacion.creditosConfirmados,
      selloEstimacion: confirmacion.selloEstimacion,
      avisoUmbralAceptado: confirmacion.avisoUmbralAceptado,
      avisosConfirmados: confirmacion.avisosConfirmados,
      claveIdempotencia: clave,
      // La plantilla vigente es la que congeló la aprobación: si ha cambiado, el control `aprobacion-plantilla` ya
      // lo ha dicho y esta escena no llega hasta aquí. Las opciones obligatorias que declare las resuelve el
      // servidor con el primer preset activo que encaje: producir no tiene botonera.
      ...(plantilla
        ? {
            plantillaId: plantilla.id,
            plantillaVersionId: plantilla.versionId,
            presets: await presetsDeProduccion(actor.id, plantilla, proyecto.clipSeconds, plantilla.versionId),
          }
        : {}),
    },
    h,
  );
}

/**
 * Encola la animación del fotograma aprobado de una escena. Hereda su escena, su personaje y la versión de la
 * ficha con la que se generó el fotograma: animar tiene que seguir siendo el mismo personaje.
 */
async function encolarAnimacion(
  actor: Actor,
  escena: FilaEscena,
  proyecto: FilaProyecto,
  /**
   * De dónde sale el clip: el trabajo del fotograma generado o, cuando el usuario ha traído una imagen de su
   * biblioteca como fotograma de partida (0.25.1), esa imagen. El servicio comprueba que sea suya al leerla.
   */
  partida: { trabajoPadreId: string } | { medioId: string },
  confirmacion: ConfirmacionProduccion,
  clave: string,
  h: Herramientas,
  reintento = false,
): Promise<void> {
  const plantilla = await plantillaVigenteDe(actor.id, "image_to_video");
  await crearAnimacion(
    actor,
    {
      prompt: textoVisualDe(escena),
      ...partida,
      // Un clip que parte de una imagen de la biblioteca no hereda escena ni personaje de ningún trabajo: se los
      // da la escena, que es de quien es el clip.
      ...("medioId" in partida
        ? { escenaDelProyecto: { escenaId: escena.id, personajeId: proyecto.mainCharacterId } }
        : {}),
      reintentoDeEscena: reintento,
      // La dirección la resuelve el servidor desde la escena: el encuadre, la cámara, el gesto en su momento y
      // la regla de toma única. Sin nada elegido sale un plano a cámara con la cámara quieta, que es lo que
      // salía antes de esta versión.
      direccion: await direccionDeLaEscena(actor.id, escena, proyecto, await personajeDirigidoDe(proyecto)),
      // Lo que dice el personaje va aparte de la descripción visual y solo lo usan los modelos con voz.
      dialogo: dialogoDelClip(escena, proyecto),
      derechos: confirmacion.derechos,
      derechoMarca: confirmacion.derechoMarca,
      sinTerceros: confirmacion.sinTerceros,
      creditosConfirmados: confirmacion.creditosConfirmados,
      selloEstimacion: confirmacion.selloEstimacion,
      avisoUmbralAceptado: confirmacion.avisoUmbralAceptado,
      avisosConfirmados: confirmacion.avisosConfirmados,
      claveIdempotencia: clave,
      ...(plantilla
        ? {
            plantillaId: plantilla.id,
            plantillaVersionId: plantilla.versionId,
            presets: await presetsDeProduccion(actor.id, plantilla, proyecto.clipSeconds, plantilla.versionId),
          }
        : {}),
    },
    h,
  );
}

/**
 * **Segundo paso del producto digital** en una escena: meter la captura dentro de la pantalla apagada.
 *
 * Se encola con el mismo camino de dinero que cualquier otro fotograma —su estimación, su confirmación y su
 * clave propia—, porque es otra generación y se paga aparte. Parte del fotograma que el usuario acaba de
 * aprobar, así que lo que se edita es exactamente lo que ha visto.
 */
async function encolarInsercionDeCaptura(
  actor: Actor,
  escena: FilaEscena,
  proyecto: FilaProyecto,
  medioId: string,
  confirmacion: ConfirmacionProduccion,
  clave: string,
  h: Herramientas,
): Promise<void> {
  const personaje = await personajeDirigidoDe(proyecto);
  await crearFotograma(
    actor,
    {
      prompt: textoVisualDe(escena),
      medioId,
      escenaId: escena.id,
      pasoDigital: "insertar_captura",
      // El compositor de la inserción no usa las seis C (lo que se pide es cambiar solo la pantalla), pero la
      // escena sigue componiéndose por ese camino y no por el de plantilla: así el trabajo queda igual que los
      // demás de la escena.
      seisC: await seisCDeLaEscena(actor.id, escena, personaje, ""),
      derechos: confirmacion.derechos,
      derechoMarca: confirmacion.derechoMarca,
      sinTerceros: confirmacion.sinTerceros,
      creditosConfirmados: confirmacion.creditosConfirmados,
      selloEstimacion: confirmacion.selloEstimacion,
      avisoUmbralAceptado: confirmacion.avisoUmbralAceptado,
      avisosConfirmados: confirmacion.avisosConfirmados,
      claveIdempotencia: clave,
    },
    h,
  );
}

/**
 * `true` cuando lo que toca después de este fotograma **no** es el clip, sino insertar la captura: la escena
 * lleva un producto digital y lo que hay hecho es el fotograma de la pantalla apagada.
 */
async function faltaInsertarLaCaptura(escena: FilaEscena, fotograma: FilaTrabajo): Promise<boolean> {
  if (escena.productId === null || fotograma.digitalStep !== "pantalla_negra") return false;
  // El producto vigente tiene que seguir siendo digital: si se cambió por uno físico después de la pantalla
  // apagada, no hay captura que meter y se sigue por el camino normal del clip en vez de bloquear la escena.
  const [producto] = await db()
    .select({ kind: products.kind })
    .from(products)
    .where(eq(products.id, escena.productId))
    .limit(1);
  return producto?.kind === "digital";
}

// ── Reintentos de lo que pudo cobrarse ────────────────────────────────────────────────────────────────────

/** Los dos trabajos vigentes de una escena: el último fotograma y la última animación. */
const ultimosTrabajos = (escenaId: string): Promise<[FilaTrabajo | null, FilaTrabajo | null]> =>
  Promise.all([ultimoTrabajoDeEscena(escenaId, "fotograma"), ultimoTrabajoDeEscena(escenaId, "animacion")]);

/** `true` si alguno de esos trabajos falló **después** de hablar con el proveedor, así que pudo cobrarse. */
const trasFalloConCoste = (trabajos: readonly (FilaTrabajo | null)[]): boolean =>
  trabajos.some((t) => t !== null && t.state === "fallido" && falloConCoste(t.failureReason));

/**
 * Decide si este envío es un **reintento de lo que pudo cobrarse** y, si lo es, comprueba que la escena tenga
 * presupuesto autorizado para él (ADR-0024). Lo cruzan igual regenerar, producir una escena suelta y volver a
 * animar un fotograma aprobado: sin esto, cualquiera de esos caminos sería un reintento gratis para el usuario y
 * una segunda factura para su cuenta.
 *
 * **Aquí no se consume nada**: solo se responde temprano y con el motivo. El consumo va en la misma transacción
 * que reserva y da de alta el trabajo (`cola/encolar.ts`), que es la única que puede hacerlo sin que dos envíos
 * simultáneos gasten el mismo reintento y sin perderlo si el alta se deshace.
 */
function esReintentoAutorizado(escena: FilaEscena, trabajos: readonly (FilaTrabajo | null)[]): boolean {
  if (!trasFalloConCoste(trabajos)) return false;
  if (escena.retriesUsed >= escena.retryBudget) {
    throw new ErrorProyecto(
      409,
      `El último intento de esta escena falló después de hablar con el proveedor, así que puede haberse cobrado. Escenara no reintenta nada por su cuenta: autoriza un presupuesto de reintentos para esta escena (llevas ${escena.retriesUsed} de ${escena.retryBudget}) y vuelve a pedirlo.`,
    );
  }
  return true;
}

/**
 * Produce el proyecto: encola los fotogramas de sus escenas aprobadas **hasta donde deja el tope de escenas en
 * vuelo**. Lo que no cabe no se pierde: se queda esperando y se encola en la siguiente pasada del usuario.
 *
 * Si un envío se rechaza, se para ahí y se devuelve el estado tal como ha quedado, con el motivo del primero que
 * no pudo salir: encadenar rechazos idénticos no informa de nada y sí gasta ritmo.
 */
export async function producirProyecto(
  actor: Actor,
  proyectoId: unknown,
  confirmacion: ConfirmacionProduccion,
  h: Herramientas = HERRAMIENTAS,
): Promise<ProduccionVista> {
  const estado = await estadoDeProduccion(actor, proyectoId);
  if (estado.impedimentos.length > 0) throw new ErrorProyecto(409, estado.impedimentos[0] ?? "No se puede producir.");
  const pendientes = escenasPorProducir(estado.escenas, estado.modoVoz);
  if (pendientes.length === 0) {
    throw new ErrorProyecto(409, "No hay ninguna escena pendiente de producir en este proyecto.");
  }
  if (pendientes.some((escena) => escena.reparto !== null)) {
    throw new ErrorProyecto(
      409,
      "Hay escenas con dos personajes pendientes. Confirma cada una en su tarjeta: el podcast cuesta dos clips y necesita su estimación total propia.",
    );
  }
  const caben = Math.max(0, estado.maximoEnVuelo - estado.enVuelo);
  if (caben === 0) {
    throw new ErrorProyecto(
      429,
      `Ya tienes ${estado.enVuelo} ${estado.enVuelo === 1 ? "escena" : "escenas"} produciéndose y esta instalación permite ${estado.maximoEnVuelo} a la vez. Espera a que termine alguna.`,
    );
  }
  const { proyecto, escenas } = await escenasDelProyecto(actor, estado.proyectoId);
  const porId = new Map(escenas.map((e) => [e.id, e]));
  let encoladas = 0;
  for (const pendiente of pendientes.slice(0, caben)) {
    const escena = porId.get(pendiente.id);
    if (!escena) continue;
    try {
      await encolarPrimerTrabajo(
        actor,
        escena,
        proyecto,
        confirmacion,
        // La clave lleva también el último trabajo de la escena: si no, repetir el clic después de un fallo
        // devolvería ese mismo trabajo fallido (el corte de idempotencia) y el botón no haría nada.
        claveDerivada(
          confirmacion.claveIdempotencia,
          proyecto.voiceMode === "omni" ? "escena-hablada" : "fotograma",
          escena.id,
          (proyecto.voiceMode === "omni" ? pendiente.animacion?.id : pendiente.fotograma?.id) ?? "primera",
        ),
        h,
      );
    } catch (error) {
      /**
       * Si ya se ha encolado alguna, se para aquí y se devuelve el estado tal como ha quedado: lo encolado es un
       * hecho con su reserva apartada, y responder un error dejaría al usuario creyendo que no se ha hecho nada.
       * Si no se ha encolado ninguna, el error se propaga tal cual: es la respuesta a lo que pidió.
       */
      if (encoladas === 0) throw error;
      break;
    }
    encoladas++;
  }
  if (encoladas === 0) {
    // Ninguna de las pendientes seguía estando ahí al ir a encolarla: alguien las cambió entre la lectura y el
    // envío. No se ha gastado nada, y decirlo es más útil que devolver un estado viejo como si hubiera ido bien.
    throw new ErrorProyecto(
      409,
      "Las escenas pendientes han cambiado mientras se preparaba el envío y no se ha encolado ninguna. Vuelve a cargar la página para ver cómo están ahora.",
    );
  }
  await marcarEnProduccion(proyecto.id);
  return estadoDeProduccion(actor, proyecto.id);
}

/**
 * Produce una sola escena: su fotograma, y nada de las demás. Si su último intento pudo cobrarse, esto es un
 * reintento y consume uno de los autorizados: reenviar lo que quizá se pagó no es gratis por venir de otro botón.
 */
export async function producirEscena(
  actor: Actor,
  escenaId: unknown,
  confirmacion: ConfirmacionProduccion,
  h: Herramientas = HERRAMIENTAS,
): Promise<ProduccionVista> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  await exigirDuracionProducible(actor, proyecto);
  const anteriores = await ultimosTrabajos(escena.id);
  const omni = proyecto.voiceMode === "omni";
  await encolarPrimerTrabajo(
    actor,
    escena,
    proyecto,
    confirmacion,
    // Con el último trabajo dentro: repetir tras un fallo tiene que encargar otro, no devolver el fallido.
    claveDerivada(
      confirmacion.claveIdempotencia,
      omni ? "escena-hablada" : "fotograma",
      escena.id,
      (omni ? anteriores[1]?.id : anteriores[0]?.id) ?? "primera",
    ),
    h,
    esReintentoAutorizado(escena, anteriores),
  );
  await marcarEnProduccion(proyecto.id);
  return estadoDeProduccion(actor, proyecto.id);
}

/**
 * Aprueba el fotograma de una escena y encola su animación. Las dos cosas van juntas porque son la misma
 * decisión del usuario: «este fotograma es el bueno, anímalo». El coste del clip se confirma igual que cualquier
 * otro, así que aprobar sin querer gastar no es posible.
 *
 * Vale también para **volver a animar** un fotograma que ya estaba aprobado y se quedó sin clip porque su envío se
 * rechazó: aprobar otra vez el mismo fotograma no encarga dos clips (la clave se deriva de él). Y si la animación
 * anterior falló con coste posible, esto es un reintento y consume uno de los autorizados.
 */
export async function aprobarFotograma(
  actor: Actor,
  escenaId: unknown,
  confirmacion: ConfirmacionProduccion,
  h: Herramientas = HERRAMIENTAS,
): Promise<ProduccionVista> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  if (formatoCanta(escena.clipFormat)) {
    throw new ErrorProyecto(
      409,
      "Una escena de canto usa el retrato del personaje y no tiene fotograma que aprobar. Produce su clip desde el camino de canto. No se ha cobrado nada.",
    );
  }
  if (proyecto.voiceMode === "omni") {
    throw new ErrorProyecto(
      409,
      "En modo Omni no hay fotograma que aprobar: cada escena se genera entera con la cara y la voz registradas del protagonista. Produce la escena directamente.",
    );
  }
  await exigirDuracionProducible(actor, proyecto);
  const [fotograma, animacion] = await ultimosTrabajos(escena.id);
  if (fotograma?.state !== "listo" || !fotograma.resultMediaId) {
    throw new ErrorProyecto(409, "Espera a que el fotograma de esta escena esté listo y guardado antes de aprobarlo.");
  }
  /**
   * Primero se apunta la aprobación y después se gasta, y no al revés: si el encolado del clip se rechaza (por un
   * tope, por el presupuesto del proyecto), queda una escena con su fotograma aprobado y sin clip, que es un estado
   * correcto y del que se sale volviendo a pulsar. Al contrario, un clip pagado cuya aprobación no se hubiera
   * guardado sería dinero gastado sin nada que lo explique.
   */
  await db()
    .update(scenes)
    .set({ approvedFrameMediaId: fotograma.resultMediaId, approvedFrameJobId: fotograma.id, updatedAt: new Date() })
    .where(eq(scenes.id, escena.id));
  /**
   * **Producto digital**: entre el fotograma y el clip va el paso de insertar la captura. Se aprueba el
   * fotograma de la pantalla apagada, se paga la inserción, y cuando esa está lista se vuelve a aprobar: ese
   * segundo «aprobar» es el que encarga el clip. Los dos pasos se ven y se confirman por separado.
   */
  if (await faltaInsertarLaCaptura(escena, fotograma)) {
    await encolarInsercionDeCaptura(
      actor,
      escena,
      proyecto,
      fotograma.resultMediaId,
      confirmacion,
      claveDerivada(confirmacion.claveIdempotencia, "insercion", fotograma.id),
      h,
    );
    return estadoDeProduccion(actor, proyecto.id);
  }
  /**
   * La clave lleva el fotograma aprobado —aprobar dos veces el mismo no encarga dos clips— y **también la última
   * animación**: si el clip anterior falló sin coste, repetir tiene que encargar otro y no devolver el fallido.
   * Que no salgan dos clips a la vez desde dos pestañas lo garantiza la transacción que encola, no esta lectura.
   */
  await encolarAnimacion(
    actor,
    escena,
    proyecto,
    { trabajoPadreId: fotograma.id },
    confirmacion,
    claveDerivada(confirmacion.claveIdempotencia, "animacion", fotograma.id, animacion?.id ?? "primera"),
    h,
    esReintentoAutorizado(escena, [animacion]),
  );
  return estadoDeProduccion(actor, proyecto.id);
}

/**
 * **Otro clip con el mismo fotograma** (0.25.1). El fotograma ya está aprobado y pagado, así que para probar otra
 * dirección o cambiar el texto no hace falta volver a generarlo: se anima otra vez el mismo.
 *
 * Qué se conserva: **todo**. Los clips anteriores siguen en la biblioteca y en el historial de la escena; aquí
 * no se borra ni se sustituye ningún archivo. Lo que se toma es lo que la escena tiene guardado **ahora**: su
 * dirección y su texto, que es justo lo que el usuario acaba de cambiar.
 *
 * Qué cuesta: un clip, con su estimación y su confirmación, como cualquier otro gasto. La clave se deriva del
 * fotograma **y del último clip**, así que repetir el clic no encarga dos y pedir otro después de uno terminado
 * sí encarga uno nuevo.
 */
export async function otroClipDeEscena(
  actor: Actor,
  escenaId: unknown,
  confirmacion: ConfirmacionProduccion,
  h: Herramientas = HERRAMIENTAS,
): Promise<ProduccionVista> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  if (formatoCanta(escena.clipFormat)) {
    throw new ErrorProyecto(
      409,
      "Para obtener otro clip cantado, confirma el coste del audio desde la producción de canto. No se ha cobrado nada.",
    );
  }
  if (proyecto.voiceMode === "omni") {
    throw new ErrorProyecto(
      409,
      "En modo Omni la escena se genera entera de una vez, así que no hay fotograma que volver a animar: regenera la escena para probar otra dirección.",
    );
  }
  await exigirDuracionProducible(actor, proyecto);
  const [fotograma, animacion] = await ultimosTrabajos(escena.id);
  // Se anima el fotograma **aprobado**: es el que el usuario dio por bueno, y es el que ya tiene clip.
  const aprobadoMedioId = escena.approvedFrameMediaId;
  if (!aprobadoMedioId) {
    throw new ErrorProyecto(
      409,
      "Esta escena todavía no tiene un fotograma aprobado que animar. Aprueba su fotograma —o elige una imagen tuya como fotograma de partida— y se encolará su clip.",
    );
  }
  // Un fotograma traído de la biblioteca no tiene trabajo que lo generara: se anima la imagen directamente.
  const partida = escena.approvedFrameJobId
    ? { trabajoPadreId: escena.approvedFrameJobId }
    : { medioId: aprobadoMedioId };
  // Un clip todavía vivo se cobraría dos veces si se encolara otro al lado: se dice y no se gasta.
  if (animacion !== null && !["listo", "fallido", "cancelado"].includes(animacion.state)) {
    throw new ErrorProyecto(409, "Esta escena ya tiene un clip en marcha: espera a que termine antes de pedir otro.");
  }
  await encolarAnimacion(
    actor,
    escena,
    proyecto,
    partida,
    confirmacion,
    claveDerivada(confirmacion.claveIdempotencia, "otro-clip", aprobadoMedioId, animacion?.id ?? "primera"),
    h,
    esReintentoAutorizado(escena, [fotograma, animacion]),
  );
  return estadoDeProduccion(actor, proyecto.id);
}

/**
 * Regenera **una** escena: encola otro fotograma suyo y nada más. Las demás escenas no se tocan, ni su estado ni
 * sus medios.
 *
 * Lo que se conserva: **todos** los trabajos anteriores con sus medios, que pasan a ser versiones en el historial
 * de la escena (`consulta.ts › versionesDe`). Lo que se invalida: el fotograma aprobado y el clip de esta escena,
 * porque ya no corresponden a lo que se va a generar; **su revisión de continuidad**, porque lo que se revisó era el
 * clip anterior; y si la escena estaba `producida`, vuelve a `aprobada`.
 *
 * Y los reintentos: si el último trabajo de la escena falló **con coste posible**, regenerar consume un reintento
 * y exige que el usuario haya autorizado presupuesto para ellos (decisión provisional del propietario,
 * 2026-09-27: cero automáticos). Una regeneración voluntaria sobre algo que salió bien no consume ninguno.
 */
export async function regenerarEscena(
  actor: Actor,
  escenaId: unknown,
  confirmacion: ConfirmacionProduccion,
  h: Herramientas = HERRAMIENTAS,
): Promise<ProduccionVista> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  await exigirDuracionProducible(actor, proyecto);
  const anteriores = await ultimosTrabajos(escena.id);
  const enMarcha = anteriores.find((t) => t !== null && !trabajoTerminado(t.state));
  if (enMarcha) {
    throw new ErrorProyecto(
      409,
      "Esta escena tiene un trabajo en marcha. Espera a que termine o cancélalo antes de regenerarla.",
    );
  }

  // La clave se deriva también del último trabajo: así cada regeneración es una confirmación distinta, y repetir
  // **la misma** regeneración (doble clic) devuelve el trabajo que ya existe.
  const clave = claveDerivada(
    confirmacion.claveIdempotencia,
    "regenerar",
    escena.id,
    anteriores[0]?.id ?? "sin-fotograma",
  );
  /**
   * Se encola **antes** de invalidar. El envío puede rechazarse por cosas que no dependen de esta escena (el tope
   * de escenas en vuelo, el techo del proyecto, un control `Bloqueado`, un sello de precio caducado), y haber
   * invalidado ya el fotograma aprobado y el clip dejaría al usuario sin un clip que pagó a cambio de un envío que
   * no salió. Así, un rechazo deja la escena exactamente como estaba.
   */
  await encolarPrimerTrabajo(
    actor,
    escena,
    proyecto,
    confirmacion,
    clave,
    h,
    esReintentoAutorizado(escena, anteriores),
  );
  /**
   * Quitar el clip de la escena e **invalidar su revisión van en la misma transacción**, con la fila de la escena
   * bloqueada. Son el mismo hecho contado dos veces («lo revisado ya no es lo que hay»), y separarlas dejaba una
   * ventana en la que la escena ya no tenía clip pero su revisión seguía vigente: en ese hueco, un crítico técnico
   * del clip anterior seguía bloqueando la exportación de algo que ya no existía.
   *
   * El bloqueo es además el otro lado del cerrojo de `revision/resultados.ts › exigirClipVigente`: una revisión que
   * se estuviera guardando a la vez espera aquí y, al leer la escena, ve que el clip ya no es el que revisó.
   */
  await db().transaction(async (tx) => {
    await tx.select({ id: scenes.id }).from(scenes).where(eq(scenes.id, escena.id)).limit(1).for("update");
    await tx
      .update(scenes)
      .set({
        // Lo aprobado y el clip ya no corresponden a lo que se va a generar. Los medios **no se borran**: siguen
        // en la biblioteca y en el historial de versiones de la escena.
        approvedFrameMediaId: null,
        approvedFrameJobId: null,
        clipMediaId: null,
        clipJobId: null,
        state: escena.state === "producida" ? "aprobada" : escena.state,
        // El motivo del fallo anterior ya no es verdad, pero el trabajo nuevo pudo fallar mientras se llegaba aquí y
        // haber escrito el suyo: solo se borra el que se leyó, nunca uno más reciente.
        lastFailureReason: sql`case when ${scenes.lastFailureReason} = ${escena.lastFailureReason} then '' else ${scenes.lastFailureReason} end`,
        changedSinceGeneration: false,
        updatedAt: new Date(),
      })
      .where(eq(scenes.id, escena.id));
    /**
     * La revisión **no se borra**: se marca con su motivo, así que el historial sigue explicando qué se dio por
     * bueno y cuándo dejó de valer. Todo esto va después del encolado por la misma razón de siempre: un envío
     * rechazado tiene que dejar la escena exactamente como estaba, revisión incluida.
     */
    await invalidarRevisionesDeEscena(
      escena.id,
      "Se regeneró la escena, así que lo revisado ya no es el clip que hay. Vuelve a comprobarlo cuando esté listo.",
      tx,
    );
  });
  await marcarEnProduccion(proyecto.id);
  return estadoDeProduccion(actor, proyecto.id);
}

/**
 * **Fotograma de partida traído de la biblioteca** (0.25.1): en lugar de generar un fotograma y pagarlo, el
 * usuario elige una imagen suya —un fotograma de otro día, una vista del personaje, una foto que subió— y la
 * escena la toma como fotograma aprobado. Desde ahí se dirige y se anima como cualquier otra.
 *
 * Qué comprueba: que la imagen exista, sea suya y sea una imagen (`imagenPropia` responde 404 para una ajena,
 * que es lo que cierra el acceso a la biblioteca de otro). Nada más: aquí **no se gasta nada**, solo se apunta
 * cuál es el fotograma de la escena. El coste que se confirma después es el del clip y solo el del clip.
 *
 * Qué pasa si luego se edita la escena: exactamente lo mismo que con un fotograma generado. `approvedFrameMediaId`
 * es lo que mira la edición para marcar `changedSinceGeneration`, así que la invalidación es la misma.
 */
export async function usarFotogramaDeBiblioteca(
  actor: Actor,
  escenaId: unknown,
  medioId: unknown,
): Promise<ProduccionVista> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  if (escena.state === "producida") {
    throw new ErrorProyecto(
      409,
      "Esta escena ya está producida. Regenérala si quieres partir de otro fotograma: así lo generado antes se conserva en su historial.",
    );
  }
  if (typeof medioId !== "string" || medioId === "") {
    throw new ErrorProyecto(400, "Elige una imagen de tu biblioteca para usarla como fotograma.");
  }
  // De quién es la imagen lo decide esta lectura: una ajena responde 404 y no se llega a escribir nada.
  const medio = await imagenPropia(actor.id, medioId);
  await db()
    .update(scenes)
    .set({
      approvedFrameMediaId: medio.id,
      // No lo generó ningún trabajo de esta escena: se anima la imagen directamente.
      approvedFrameJobId: null,
      referenceImageMediaId: medio.id,
      updatedAt: new Date(),
    })
    .where(eq(scenes.id, escena.id));
  return estadoDeProduccion(actor, proyecto.id);
}

/**
 * Autoriza reintentos de pago para una escena. Es lo único que permite volver a intentar algo que pudo cobrarse,
 * y lo autoriza siempre el usuario **en número de reintentos**, escena a escena.
 */
export async function autorizarReintentos(
  actor: Actor,
  escenaId: unknown,
  reintentos: unknown,
): Promise<ProduccionVista> {
  if (typeof reintentos !== "number" || !Number.isInteger(reintentos) || reintentos < 0 || reintentos > 10) {
    throw new ErrorProyecto(400, "Indica de 0 a 10 reintentos autorizados para esta escena.");
  }
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  // Se autoriza a partir de los ya consumidos —«dos más», no «dos en total», que sería no autorizar nada— y se
  // calcula en la base de datos, para no partir de un recuento que pudo cambiar mientras se leía.
  await db()
    .update(scenes)
    .set({ retryBudget: sql`${scenes.retriesUsed} + ${reintentos}`, updatedAt: new Date() })
    .where(eq(scenes.id, escena.id));
  return estadoDeProduccion(actor, proyecto.id);
}

/** Escenas del proyecto en orden, con su proyecto ya comprobado como propio. */
async function escenasDelProyecto(
  actor: Actor,
  proyectoId: string,
): Promise<{ proyecto: FilaProyecto; escenas: FilaEscena[] }> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  return { proyecto, escenas: await escenasDe(proyecto.id) };
}
