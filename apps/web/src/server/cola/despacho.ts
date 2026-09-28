import { and, eq, inArray, isNull } from "drizzle-orm";
import { PROVEEDORES_PUBLICOS } from "@/lib/boveda";
import { CAPACIDAD_DE_TIPO, type ModeloVista } from "@/lib/catalogo";
import {
  type IntentoDeVoz,
  mensajeDeCambioDeProveedor,
  mensajeDeFalloDeVoz,
  sugerenciaDeReserva,
} from "@/lib/diagnostico-voz";
import { mensajeDeFalloDeProveedor } from "@/lib/diagnostico-proveedor";
import { type ParametrosVoz, parametrosVozDe } from "@/lib/voz";
import { leerAjustes } from "../ajustes";
import { usarCredencialValida } from "../boveda/credenciales";
import { hechosDePersonajeCitado, parametrosDeControles } from "../controles/hechos";
import { evaluar, frenosQueGatean } from "../controles/motor";
import { mensajeDeFreno } from "../controles/puerta";
import { db } from "../db/cliente";
import { type FilaMedio, type FilaTrabajo, generationJobs, media, usageLedger } from "../db/esquema";
import { archivoDe } from "../generacion/comprobaciones";
import { olvidarSaldo } from "../generacion/estimacion";
import type { Herramientas } from "../generacion/herramientas";
import { cerrarVozSincrona } from "../generacion/seguimiento";
import { referenciaCompatible } from "../media/conversion-referencia";
import { mediosDeReferenciaVigentes } from "../personajes/consulta";
import { cerrarTrabajoYGasto } from "../presupuesto/reserva";
import { registrarFalloDeEscena } from "../produccion/cierre";
import { type Adaptador, ErrorProveedor, type VozPedida } from "../proveedores/contrato";
import { resolver } from "../proveedores/registro";
import { alternativaDeVoz, creditosDeLaOpcion } from "../voz/eleccion";
import { prepararCallback } from "./callback";
import { marcarEnviando, reintentar, renovarToma } from "./toma";

/**
 * Envío al proveedor de un trabajo que el worker ya ha tomado. Es el único sitio desde el que se crea una
 * tarea en el proveedor, y está partido en dos mitades que **no se mezclan**:
 *
 * 1. **Preparar** (estado `preparando`): resolver el modelo, la credencial y la referencia, y montar la
 *    entrada. Nada de esto toca al proveedor con dinero, así que un fallo aquí se puede reintentar.
 * 2. **Llamar y persistir** (estado `enviando`): se marca la fila **antes** de llamar, se llama una sola vez
 *    y después solo se reintenta **la escritura** del identificador de la tarea, nunca la llamada.
 *
 * Las reglas duras, desde 0.10.0 y ahora también frente a fallos de la base de datos:
 *
 * - en cuanto se ha llamado al proveedor, el trabajo **no puede volver a la cola** bajo ninguna circunstancia:
 *   los únicos destinos son `enviado` (se sabe la tarea), `desconocido` (no se sabe) o `fallido` con la
 *   reserva suelta (el proveedor rechazó la petición y no creó nada);
 * - si se obtiene el `taskId` pero no se puede guardar, se insiste en la escritura y, si aun así no se
 *   consigue, se registra el `taskId` en el log (sin ninguna clave) y el trabajo queda `desconocido` con la
 *   reserva retenida: se ha pagado y hay que resolverlo a mano, pero nunca se reenvía. Si ni eso se puede
 *   escribir, la fila se queda en `enviando` **con su toma puesta** y la recoge `recuperarHuerfanos`, que la
 *   deja en `desconocido`: por eso `soltarToma` no suelta nunca una fila `enviando`;
 * - un fallo que sí cierra el trabajo suelta la reserva, porque no ha habido gasto.
 */

/** Motivo normalizado del fallo, tomado del propio esquema para que no pueda desviarse de la enumeración. */
type MotivoFalloTrabajo = NonNullable<FilaTrabajo["failureReason"]>;

/** Intentos de escritura del `taskId` y espera entre ellos. Corto: es la propia base de datos, no una red. */
const INTENTOS_ESCRITURA = 5;
const MS_ENTRE_ESCRITURAS = 200;

export interface Despachado {
  fila: FilaTrabajo;
  enviado: boolean;
}

const detalle = (error: unknown) => (error instanceof Error ? error.message : String(error));

const espera = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

export async function despachar(fila: FilaTrabajo, workerId: string, h: Herramientas): Promise<Despachado> {
  // ── Mitad 1: preparar. Un fallo aquí no ha costado nada y se puede reintentar.
  let preparado: Preparado;
  try {
    preparado = await preparar(fila, workerId, h);
  } catch (error) {
    if (error instanceof ErrorSinCredencial) {
      return { fila: await cerrarSinCoste(fila, "credencial", error.message), enviado: false };
    }
    // El personaje ya no se puede usar: se cierra sin coste y **no se reintenta**. Reintentar esperaría a que
    // alguien volviera a dar un consentimiento que precisamente se ha retirado.
    if (error instanceof ErrorPersonajeNoUsable) {
      return { fila: await cerrarSinCoste(fila, error.motivo, error.message), enviado: false };
    }
    console.error(`[cola] no se ha podido preparar el trabajo ${fila.id}: ${detalle(error)}`);
    await reintentar(fila, "No se ha podido preparar el envío. Se volverá a intentar.", "interno");
    return { fila: (await filaDe(fila.id)) ?? fila, enviado: false };
  }

  // ── Frontera: se marca la fila como «llamada en curso» y se renueva la toma antes de llamar. Si la fila ya
  // no es de este worker, otro la tiene: no se llama al proveedor.
  if (!(await marcarEnviando(fila.id, workerId))) {
    console.warn(`[cola] el trabajo ${fila.id} ya no es de este worker: no se envía`);
    return { fila: (await filaDe(fila.id)) ?? fila, enviado: false };
  }

  // ── Mitad 2: llamar al proveedor. A partir de aquí no hay vuelta a la cola.
  let llamada: Llamada;
  try {
    llamada = await llamarAlProveedor(fila, preparado, h);
  } catch (error) {
    /**
     * Cambio **automático** al proveedor de voz de reserva (decisión firme del propietario, 2026-09-28).
     *
     * Solo cuando el fallo **prueba** que el primero no creó nada y por tanto no cobró (`rechazoProbado`): ahí y
     * solo ahí se puede enviar a otro sin arriesgar un doble cobro. Un 5xx, un tiempo agotado o una respuesta que
     * no se entiende **no** prueban nada, así que esos siguen el camino de siempre (`desconocido`, reserva
     * retenida) y nunca se reenvían a nadie.
     *
     * El dinero está acotado por el tope que el usuario vio para la reserva, en su moneda, guardado al encolar
     * (`relevoDeVoz`), así que el cambio nunca gasta más de lo que el usuario tenía delante.
     */
    const reserva = await relevoDeVoz(fila, error, h);
    if (reserva) return reserva;
    return { fila: await tratarFalloDeLlamada(fila, error, h), enviado: false };
  }
  // El saldo del proveedor acaba de cambiar: la próxima estimación lo vuelve a preguntar.
  olvidarSaldo(fila.userId);

  // ── Persistencia del identificador, con reintentos **solo de la escritura**.
  const guardada = await guardarTarea(fila, llamada.taskId, preparado.callbackTokenHash);
  if (!guardada) return { fila: await marcarTareaPerdida(fila, llamada.taskId), enviado: false };
  /**
   * Proveedor **síncrono** (ElevenLabs, 0.21.0): el audio ya está aquí, así que el trabajo se cierra en esta
   * misma pasada en lugar de esperar a una consulta que no existe. Se hace **después** de guardar el
   * identificador para que, si el proceso se cayera justo ahora, quede constancia de que se llamó y se pagó.
   *
   * El cierre es el de siempre (`cerrarVozSincrona` → `guardarResultado`): mismo apunte de gasto, mismo medio en
   * la biblioteca y mismos enganches de escena y de muestra. Aquí no se repite ni una regla.
   */
  if (llamada.inmediata) {
    return { fila: await cerrarVozSincrona(guardada, llamada.inmediata), enviado: true };
  }
  return { fila: guardada, enviado: true };
}

/** Lo que hace falta para llamar al proveedor, ya resuelto y sin tocar la base de datos. */
interface Preparado {
  adaptador: Adaptador;
  clave: string;
  entrada: Record<string, unknown>;
  /** URL de callback que se le da al proveedor, o `undefined` si esta instalación no los usa. */
  callbackUrl?: string;
  /** Huella del token de esa URL, que se guarda con el trabajo. */
  callbackTokenHash?: string;
}

/** La credencial del usuario no sirve: no es un fallo reintentable, es algo que tiene que arreglar él. */
class ErrorSinCredencial extends Error {}

/**
 * El personaje del trabajo ya no puede generar (consentimiento revocado o rechazado, referencias por debajo
 * del mínimo, o un modelo que dejó de aceptar referencias). No es reintentable: el trabajo se cierra sin coste.
 */
class ErrorPersonajeNoUsable extends Error {
  constructor(
    mensaje: string,
    readonly motivo: MotivoFalloTrabajo = "consentimiento",
  ) {
    super(mensaje);
    this.name = "ErrorPersonajeNoUsable";
  }
}

async function preparar(fila: FilaTrabajo, workerId: string, h: Herramientas): Promise<Preparado> {
  const { modelo, adaptador } = await resolver(CAPACIDAD_DE_TIPO[fila.kind], fila.model);
  // ── Reevaluación de los controles previos, **antes** de subir nada. El encolado los evaluó, pero entre
  // encolar y enviar el usuario puede haber revocado el consentimiento o borrado fotos, y en un reintento puede
  // haber pasado más rato todavía. Sin esto, revocar no impediría que la cara saliera hacia el proveedor: solo
  // impediría pedir trabajos nuevos, que es la mitad de la regla.
  //
  // Se reevalúan las reglas que **pueden haber cambiado sin que el usuario pida nada** y que se pueden decidir
  // con lo que hay en la fila: el consentimiento del personaje y si el modelo sigue aceptando referencias. Las
  // de dinero no: su reserva ya está apartada desde el encolado, y volver a compararlas aquí rechazaría un
  // trabajo por su propia reserva.
  // Una pista de voz no lleva personaje ni referencias, así que no hay nada que revalidar: sus reglas son las del
  // dinero, y esas ya se decidieron al encolar con su reserva apartada.
  if (fila.characterId && fila.kind !== "voz") {
    const freno = frenosQueGatean(
      evaluar({
        tipo: fila.kind,
        parametros: await parametrosDeControles(),
        // Si la ficha del personaje ya no está, esto bloquea en lugar de dejar pasar: un borrado a medias no
        // puede convertirse en un envío sin consentimiento.
        personaje: await hechosDePersonajeCitado(fila.characterId),
        modelo: {
          nombre: modelo.nombre,
          maximoReferencias: modelo.parametros.maximoReferencias,
          // El precio y la acotación se decidieron al encolar y su reserva ya está apartada: volver a
          // juzgarlos aquí rechazaría el trabajo por su propio apartado.
          precioComprobado: "",
          precioCaducado: false,
          costeAcotado: true,
          motivoSinAcotar: "",
        },
      }),
    )[0];
    if (freno) {
      throw new ErrorPersonajeNoUsable(
        `${mensajeDeFreno(freno)} No se ha enviado nada y no se te ha cobrado.`,
        freno.regla === "consentimiento" ? "consentimiento" : "interno",
      );
    }
  }
  const credencial = await usarCredencialValida(fila.userId, fila.provider);
  if (!credencial.ok) {
    const nombre = PROVEEDORES_PUBLICOS[fila.provider].nombre;
    throw new ErrorSinCredencial(
      `No hay una clave de ${nombre} utilizable en tu cuenta. Añádela en «Tu cuenta» y vuelve a pedir el trabajo.`,
    );
  }
  /**
   * Una pista de voz (0.21.0) no lleva ninguna imagen: no hay nada que subir ni que revalidar contra las fotos de
   * un personaje. Lo que se le manda es **el texto y la voz que quedaron guardados al encolar**, nunca los que
   * diga el proyecto ahora: lo que se paga tiene que ser lo que el usuario confirmó.
   */
  if (fila.kind === "voz") {
    const voz = vozDe(fila);
    const entradaVoz = adaptador.montarEntrada(modelo, {
      escena: "",
      dialogo: dialogoDe(fila),
      urls: [],
      ...(voz === null ? {} : { voz }),
    });
    const callbackVoz = await prepararCallback(fila);
    return { adaptador, clave: credencial.clave, entrada: entradaVoz, ...callbackVoz };
  }
  // Un trabajo con personaje lleva **varias** referencias (0.13.0); uno con imagen suelta, una sola. Se
  // suben en el mismo orden que se guardaron: la primera es la que más peso tiene en la identidad.
  const origenes = await mediosDeReferencia(fila, Math.max(1, modelo.parametros.maximoReferencias));
  const urls: string[] = [];
  for (const origen of origenes) {
    // Cada subida renueva la toma: con diez referencias, la preparación puede pasar de los tres minutos que
    // dura, y una toma caducada dejaría que otro worker preparase el mismo trabajo en paralelo.
    if (!(await renovarToma(fila.id, workerId))) {
      throw new Error(`El trabajo ${fila.id} ha dejado de ser de este worker mientras se preparaba.`);
    }
    urls.push(await subirReferencia(adaptador, credencial.clave, origen, modelo, h));
  }
  /**
   * La entrada se vuelve a montar aquí (las URL del proveedor caducan y no se guardan), pero **la duración es la
   * que se decidió al encolar**, no la que declare hoy el catálogo: es la que se estimó, la que confirmó el
   * usuario y la del proyecto. Volver a deducirla cambiaría el clip que se paga.
   */
  const segundos = segundosDe(fila);
  const entrada = adaptador.montarEntrada(modelo, {
    escena: fila.prompt,
    dialogo: dialogoDe(fila),
    urls,
    ...(segundos === null ? {} : { segundos }),
  });
  const callback = await prepararCallback(fila);
  return { adaptador, clave: credencial.clave, entrada, ...callback };
}

/** Lo que devuelve la llamada: el identificador siempre, y el audio ya hecho si el proveedor es síncrono. */
type Llamada = VozPedida;

async function llamarAlProveedor(fila: FilaTrabajo, preparado: Preparado, h: Herramientas): Promise<Llamada> {
  const peticion = {
    clave: preparado.clave,
    modelo: fila.model,
    entrada: preparado.entrada,
    buscar: h.buscar,
    callbackUrl: preparado.callbackUrl,
  };
  if (fila.kind === "animacion") return { taskId: await preparado.adaptador.generarVideo(peticion) };
  if (fila.kind !== "voz") return { taskId: await preparado.adaptador.generarImagen(peticion) };
  const generarVoz = preparado.adaptador.generarVoz;
  if (!generarVoz) {
    // El adaptador dejó de ofrecer voz entre encolar y enviar. No se ha llamado a nadie, así que es un fallo sin
    // coste: `interno` es el motivo que cierra el trabajo soltando su reserva.
    throw new ErrorProveedor(fila.provider, "formato", "Este proveedor ya no puede generar voz en esta instalación.");
  }
  return generarVoz.call(preparado.adaptador, peticion);
}

/**
 * Voz y parámetros con los que se encoló la pista, tal como quedaron en la entrada guardada. `null` si el trabajo
 * no los trae: sin voz, el adaptador rechaza la petición en lugar de inventarse un timbre.
 */
function vozDe(fila: FilaTrabajo): { voz: string; parametros: ParametrosVoz } | null {
  const guardada = (fila.input as { voz?: unknown }).voz;
  if (!guardada || typeof guardada !== "object") return null;
  const { voz, parametros } = guardada as { voz?: unknown; parametros?: unknown };
  if (typeof voz !== "string" || voz === "") return null;
  return { voz, parametros: parametrosVozDe(parametros) };
}

/**
 * Guarda el identificador de la tarea, insistiendo si la base de datos falla. Devuelve la fila guardada o
 * `null` si no se ha conseguido. **No reintenta la llamada al proveedor**: eso ya ha pasado.
 */
async function guardarTarea(
  fila: FilaTrabajo,
  taskId: string,
  callbackTokenHash: string | undefined,
): Promise<FilaTrabajo | null> {
  for (let intento = 1; intento <= INTENTOS_ESCRITURA; intento++) {
    try {
      const [enviada] = await db()
        .update(generationJobs)
        .set({
          taskId,
          state: "enviado",
          // La tarea existe en el proveedor: es la segunda etapa real.
          stage: "enviado",
          sentAt: new Date(),
          errorMessage: null,
          failureReason: null,
          lockedBy: null,
          lockedUntil: null,
          ...(callbackTokenHash ? { callbackTokenHash } : {}),
        })
        // Solo se marca si seguía sin tarea: dos despachos del mismo trabajo no se pisan.
        .where(and(eq(generationJobs.id, fila.id), isNull(generationJobs.taskId)))
        .returning();
      if (enviada) return enviada;
      // Ya tenía tarea (otro despacho la guardó): se devuelve lo que hay, sin tocar nada.
      return await filaDe(fila.id);
    } catch (error) {
      console.error(`[cola] intento ${intento} de guardar la tarea del trabajo ${fila.id}: ${detalle(error)}`);
      if (intento < INTENTOS_ESCRITURA) await espera(MS_ENTRE_ESCRITURAS * intento);
    }
  }
  return null;
}

/**
 * El proveedor ha aceptado el trabajo pero no se ha podido guardar su identificador. Se registra el `taskId`
 * en el log (nunca la clave) para poder resolverlo a mano y se deja el trabajo en revisión con la reserva
 * retenida. Si ni eso se puede escribir, al menos queda el registro.
 */
async function marcarTareaPerdida(fila: FilaTrabajo, taskId: string): Promise<FilaTrabajo> {
  console.error(
    `[cola] TAREA CREADA Y NO GUARDADA · trabajo=${fila.id} usuario=${fila.userId} proveedor=${fila.provider} tarea=${taskId} · el trabajo queda en revisión y NO se reenviará`,
  );
  const nombre = PROVEEDORES_PUBLICOS[fila.provider].nombre;
  const mensaje = `El trabajo se ha encargado a ${nombre}, pero no se ha podido guardar su identificador. No se reenviará: quien administra esta instalación lo resolverá con el registro del servidor.`;
  for (let intento = 1; intento <= INTENTOS_ESCRITURA; intento++) {
    try {
      const [fallida] = await db()
        .update(generationJobs)
        .set({
          state: "desconocido",
          failureReason: "temporal",
          errorMessage: mensaje,
          lockedBy: null,
          lockedUntil: null,
          finishedAt: new Date(),
        })
        // Solo si la fila sigue como la dejamos: en `enviando` y sin tarea guardada. Si otro camino ya la ha
        // movido (la escritura del identificador que creíamos fallida acabó entrando, por ejemplo), no se pisa.
        .where(and(eq(generationJobs.id, fila.id), eq(generationJobs.state, "enviando"), isNull(generationJobs.taskId)))
        .returning();
      if (fallida) return fallida;
      // No ha afectado a ninguna fila: se relee y se devuelve la de verdad, no una inventada.
      return (await filaDe(fila.id)) ?? fila;
    } catch (error) {
      console.error(`[cola] intento ${intento} de marcar en revisión el trabajo ${fila.id}: ${detalle(error)}`);
      if (intento < INTENTOS_ESCRITURA) await espera(MS_ENTRE_ESCRITURAS * intento);
    }
  }
  // La base de datos no responde ni para esto. La fila se queda en `enviando` **con su toma puesta**
  // (`soltarToma` no toca ese estado), así que caducará y `recuperarHuerfanos` la dejará en `desconocido` con
  // la reserva retenida, sin reenviarla. Lo que se devuelve aquí es solo para el registro de esta pasada.
  return { ...fila, state: "desconocido", failureReason: "temporal", errorMessage: mensaje };
}

/**
 * Intenta el trabajo de voz con el **proveedor de reserva** tras un rechazo probado del primero. Devuelve `null`
 * cuando no procede: no es un trabajo de voz, el fallo no prueba que no se haya cobrado, este usuario no tiene
 * credencial del otro proveedor o esta instalación no tiene ningún modelo suyo utilizable.
 *
 * Cambia el proveedor y el modelo **de la misma fila**, así que no hay un trabajo nuevo, ni una reserva nueva, ni
 * una confirmación nueva: es el mismo gasto que el usuario ya autorizó, encaminado a otro sitio.
 */
async function relevoDeVoz(fila: FilaTrabajo, error: unknown, h: Herramientas): Promise<Despachado | null> {
  if (fila.kind !== "voz") return null;
  if (!(error instanceof ErrorProveedor) || !error.rechazoProbado) return null;
  const alternativa = await alternativaDeVoz(fila.userId, fila.provider);
  if (!alternativa) return null;
  const fallido: IntentoDeVoz = {
    proveedor: fila.provider,
    modelo: fila.model,
    codigo: error.codigo,
    cobro: "sin-cobro",
  };
  /**
   * **El relevo solo puede ir a donde el usuario ya autorizó.** Al encolar se le enseñó, en la moneda del
   * proveedor de reserva, cuánto costaría este diálogo allí, y esa cifra quedó en la entrada del trabajo. Los
   * créditos de dos proveedores no se comparan entre sí, así que el tope es ese y solo ese:
   *
   * - si al encolar no había reserva (el usuario añadió su clave después), no se cambia;
   * - si la alternativa de ahora es otro proveedor u otro modelo, no se cambia;
   * - si lo que cuesta ahora el diálogo allí supera lo que vio, no se cambia.
   *
   * En los tres casos se falla sin coste diciendo qué se podía haber probado y por qué no.
   */
  const autorizada = reservaAutorizada(fila);
  const nombre = PROVEEDORES_PUBLICOS[alternativa.modelo.proveedor as FilaTrabajo["provider"]].nombre;
  const creditosAlternativa = creditosDeLaOpcion(alternativa, dialogoDe(fila));
  const motivoSinRelevo =
    autorizada === null ||
    autorizada.proveedor !== alternativa.modelo.proveedor ||
    autorizada.modelo !== alternativa.modelo.modelo
      ? `Se podía haber probado con ${nombre}, pero cuando pediste esta voz no tenías ${nombre} disponible y no autorizaste su coste: no se cambia de proveedor sin que lo hayas visto. Vuelve a pedir la voz de esta escena y se te mostrará lo que cuesta con ${nombre}.`
      : creditosAlternativa > autorizada.creditos
        ? `Se podía haber probado con ${nombre}, pero generar este diálogo allí cuesta ahora ${creditosAlternativa} créditos de ${nombre} y tú autorizaste ${autorizada.creditos}: no se cambia de proveedor para gastar más de lo que viste. Vuelve a pedir la voz de esta escena y se te mostrará el coste actualizado.`
        : null;
  if (motivoSinRelevo !== null || autorizada === null) {
    return {
      fila: await cerrarSinCoste(fila, error.motivo, mensajeDeFalloDeVoz([fallido], motivoSinRelevo ?? "")),
      enviado: false,
    };
  }
  console.warn(
    `[cola] relevo de voz en el trabajo ${fila.id}: ${fila.provider} → ${alternativa.modelo.proveedor} (${error.codigo})`,
  );
  const [cambiada] = await db()
    .update(generationJobs)
    .set({
      provider: alternativa.modelo.proveedor as FilaTrabajo["provider"],
      model: alternativa.modelo.modelo,
      estimatedCredits: autorizada.creditos,
    })
    .where(and(eq(generationJobs.id, fila.id), eq(generationJobs.state, "enviando"), isNull(generationJobs.taskId)))
    .returning();
  if (!cambiada) return null;
  /**
   * La reserva ya apartada pasa a nombre del proveedor nuevo **y a su importe autorizado**, en su moneda: el
   * cierre copia proveedor, modelo e importe de la reserva, así que sin esto el usuario vería en su historial un
   * cobro de KIE que en realidad le hizo ElevenLabs, o un tope expresado en la moneda equivocada.
   */
  await db()
    .update(usageLedger)
    .set({
      provider: alternativa.modelo.proveedor as FilaTrabajo["provider"],
      model: alternativa.modelo.modelo,
      priceStamp: alternativa.precio.sello,
      credits: autorizada.creditos,
      amountEur: autorizada.creditos * (await leerAjustes()).eurosPorCredito,
    })
    .where(and(eq(usageLedger.jobId, cambiada.id), eq(usageLedger.entryType, "reserva")));
  let preparado: Preparado;
  try {
    preparado = await preparar(cambiada, cambiada.lockedBy ?? "", h);
  } catch (segundoError) {
    return { fila: await tratarFalloDeLlamada(cambiada, segundoError, h, [fallido]), enviado: false };
  }
  let llamada: Llamada;
  try {
    llamada = await llamarAlProveedor(cambiada, preparado, h);
  } catch (segundoError) {
    return { fila: await tratarFalloDeLlamada(cambiada, segundoError, h, [fallido]), enviado: false };
  }
  olvidarSaldo(cambiada.userId);
  const guardada = await guardarTarea(cambiada, llamada.taskId, preparado.callbackTokenHash);
  if (!guardada) return { fila: await marcarTareaPerdida(cambiada, llamada.taskId), enviado: false };
  // Quien paga tiene derecho a saber en qué cuenta se ha gastado y por qué, aunque haya salido bien.
  const aviso = mensajeDeCambioDeProveedor(fallido, {
    proveedor: alternativa.modelo.proveedor as FilaTrabajo["provider"],
    modelo: alternativa.modelo.modelo,
  });
  await db().update(generationJobs).set({ errorMessage: aviso }).where(eq(generationJobs.id, guardada.id));
  const conAviso = { ...guardada, errorMessage: aviso };
  if (llamada.inmediata) {
    return { fila: await cerrarVozSincrona(conAviso, llamada.inmediata, aviso), enviado: true };
  }
  return { fila: conAviso, enviado: true };
}

/**
 * Qué hacer con un fallo de la llamada al proveedor. **Ninguna rama vuelve a la cola**: o no se sabe qué ha
 * pasado (`desconocido`, reserva retenida) o el proveedor ha rechazado la petición con una respuesta, y
 * entonces se sabe que no creó nada y el trabajo se cierra soltando la reserva.
 *
 * `previos` son los intentos que ya se hicieron contra otro proveedor: entran en el mensaje para que quien lo lea
 * sepa **qué se ha probado**, y no solo qué ha fallado lo último.
 */
/**
 * Qué se ha quedado sin hacer, por tipo de trabajo. Es la primera de las cuatro cosas que tiene que decir un
 * mensaje de fallo (norma de errores visibles, 2026-09-28): la avería sin su consecuencia no sirve de nada.
 */
const ENCABEZADO_DE_TRABAJO: Record<FilaTrabajo["kind"], string> = {
  fotograma: "No se ha podido generar el fotograma",
  animacion: "No se ha podido generar el clip",
  voz: "No se ha podido generar la voz",
};

async function tratarFalloDeLlamada(
  fila: FilaTrabajo,
  error: unknown,
  _h: Herramientas,
  previos: readonly IntentoDeVoz[] = [],
): Promise<FilaTrabajo> {
  // Solo se da por «no cobrado» lo que el proveedor ha **rechazado con una respuesta que lo prueba**
  // (`ErrorProveedor.rechazoProbado`: clave inválida, sin saldo, exceso de ritmo). Un 5xx, un 200 sin
  // identificador de tarea, una red caída o un tiempo agotado no prueban nada: pueden venir de un trabajo ya
  // aceptado, y decidir «no cobrado» por descarte es justo lo que provoca los dobles cobros.
  const esDeVoz = fila.kind === "voz";
  const codigo = error instanceof ErrorProveedor ? error.codigo : "respuesta-inesperada";
  if (error instanceof ErrorProveedor && error.rechazoProbado) {
    const mensaje = esDeVoz
      ? mensajeDeFalloDeVoz(
          [...previos, { proveedor: fila.provider, modelo: fila.model, codigo, cobro: "sin-cobro" }],
          sugerenciaDeReserva(previos.length > 0 || (await alternativaDeVoz(fila.userId, fila.provider)) !== null),
        )
      : mensajeDeFalloDeProveedor(
          ENCABEZADO_DE_TRABAJO[fila.kind],
          [
            {
              proveedor: PROVEEDORES_PUBLICOS[fila.provider].nombre,
              modelo: fila.model,
              codigo,
              cobro: "sin-cobro",
            },
          ],
        );
    return cerrarSinCoste(fila, error.motivo, mensaje);
  }
  const nombre = PROVEEDORES_PUBLICOS[fila.provider].nombre;
  if (!(error instanceof ErrorProveedor)) {
    console.error(`[cola] fallo tras llamar al proveedor en el trabajo ${fila.id}: ${detalle(error)}`);
  }
  /**
   * No se sabe si se ha cobrado, así que **no se cambia de proveedor y no se reenvía nada**. El mensaje lo dice
   * con esas palabras: es la diferencia entre «no te han cobrado» y «no sabemos si te han cobrado», y quien paga
   * necesita distinguirlas para decidir si mira su cuenta antes de volver a pedirlo.
   */
  const mensaje = esDeVoz
    ? mensajeDeFalloDeVoz(
        [...previos, { proveedor: fila.provider, modelo: fila.model, codigo, cobro: "se-desconoce" }],
        `Revisa el historial de tu cuenta en ${nombre} antes de volver a pedirlo.`,
      )
    : mensajeDeFalloDeProveedor(
        ENCABEZADO_DE_TRABAJO[fila.kind],
        [{ proveedor: nombre, modelo: fila.model, codigo, cobro: "se-desconoce" }],
        `No se reenviará solo: revisa el historial de tu cuenta en ${nombre} antes de pedirlo otra vez.`,
      );
  // Reserva retenida a propósito: quizá se ha pagado y todavía no lo sabemos.
  return marcar(fila.id, {
    state: "desconocido",
    failureReason: error instanceof ErrorProveedor ? error.motivo : "respuesta",
    errorMessage: mensaje,
    lockedBy: null,
    lockedUntil: null,
    finishedAt: new Date(),
  });
}

/** Cierra el trabajo como fallido y suelta su reserva: el proveedor no ha llegado a crear la tarea. */
async function cerrarSinCoste(fila: FilaTrabajo, motivo: MotivoFalloTrabajo, mensaje: string): Promise<FilaTrabajo> {
  // El cambio de estado y la liberación de la reserva van juntos: si el apunte fallara después del `UPDATE`, el
  // trabajo quedaría cerrado con su presupuesto apartado para siempre.
  const cerrada = await cerrarTrabajoYGasto(
    fila.id,
    undefined,
    {
      state: "fallido",
      failureReason: motivo,
      errorMessage: mensaje,
      finishedAt: new Date(),
      lockedBy: null,
      lockedUntil: null,
    },
    0,
    "El trabajo no ha llegado a enviarse al proveedor: no ha costado nada.",
  );
  if (!cerrada) throw new Error(`El trabajo ${fila.id} ha desaparecido mientras se despachaba.`);
  // Si producía una escena, la escena apunta por qué no salió. Sin coste y **sin reenviar nada** (0.19.0).
  await registrarFalloDeEscena(cerrada, mensaje);
  return cerrada;
}

async function marcar(id: string, cambios: Partial<typeof generationJobs.$inferInsert>): Promise<FilaTrabajo> {
  const [fila] = await db().update(generationJobs).set(cambios).where(eq(generationJobs.id, id)).returning();
  if (!fila) throw new Error(`El trabajo ${id} ha desaparecido mientras se despachaba.`);
  return fila;
}

async function filaDe(id: string): Promise<FilaTrabajo | null> {
  const [fila] = await db().select().from(generationJobs).where(eq(generationJobs.id, id)).limit(1);
  return fila ?? null;
}

/**
 * Duración que se le pidió al proveedor al encolar, tal como quedó en la entrada guardada; `null` en un trabajo
 * anterior a que la duración se eligiera, que se queda con la que declare su modelo.
 */
function segundosDe(fila: FilaTrabajo): number | null {
  const parametros = (fila.input as { parametros?: unknown }).parametros;
  if (!parametros || typeof parametros !== "object") return null;
  const segundos = (parametros as { segundos?: unknown }).segundos;
  return typeof segundos === "number" && segundos > 0 ? segundos : null;
}

/** Tope autorizado para el proveedor de reserva de una voz, tal como se guardó al encolar; `null` si no lo hubo. */
function reservaAutorizada(fila: FilaTrabajo): { proveedor: string; modelo: string; creditos: number } | null {
  const reserva = (fila.input as { reserva?: unknown }).reserva;
  if (!reserva || typeof reserva !== "object") return null;
  const { proveedor, modelo, creditos } = reserva as Record<string, unknown>;
  if (typeof proveedor !== "string" || typeof modelo !== "string" || typeof creditos !== "number") return null;
  return { proveedor, modelo, creditos };
}

/** Lo que dice el personaje, tal como se guardó al encolar. Lo usan el clip y la voz. */
function dialogoDe(fila: FilaTrabajo): string {
  const dialogo = (fila.input as { dialogo?: unknown }).dialogo;
  return typeof dialogo === "string" ? dialogo : "";
}

/**
 * Referencias del trabajo, en el orden en que se guardaron al encolar, **cruzadas con lo que sigue siendo
 * verdad**: se recortan al tope del modelo (el catálogo puede haber cambiado) y, si el trabajo lleva personaje,
 * se descarta lo que ya no sea referencia suya o esté en la papelera.
 *
 * Es la otra mitad de la revalidación: comprobar el consentimiento no basta si entre encolar y enviar el usuario
 * ha quitado fotos o las ha mandado a la papelera. Si quedan por debajo del mínimo, el trabajo se cierra sin
 * subir nada, igual que si el consentimiento se hubiera revocado.
 */
async function mediosDeReferencia(fila: FilaTrabajo, maximo = Number.POSITIVE_INFINITY): Promise<FilaMedio[]> {
  const guardadas = (fila.input as { referencias?: unknown }).referencias;
  let ids = Array.isArray(guardadas) ? guardadas.filter((id): id is string => typeof id === "string") : [];
  // Solo un **fotograma** envía las fotos del personaje. Un clip envía su fotograma aprobado, que no es una
  // referencia del personaje: filtrarlo contra ellas lo descartaba y ningún clip con personaje llegaba a salir.
  // El consentimiento del personaje del clip ya lo ha revisado la puerta de `preparar`.
  if (fila.characterId && fila.kind === "fotograma") {
    // Solo lo que sigue siendo referencia del personaje y fuera de la papelera, respetando el orden guardado.
    const referencias = await mediosDeReferenciaVigentes(fila.characterId);
    const vigentes = new Map(referencias.map((r) => [r.mediaId, r.origen]));
    ids = ids.filter((id) => vigentes.has(id));
    const { minimoReferenciasPersonaje: minimo } = await leerAjustes();
    // El mínimo lo sostienen solo las fotos originales: una vista generada se envía como guía, pero no
    // sustituye a una foto de la persona (0.14.0).
    if (ids.filter((id) => vigentes.get(id) === "foto_original").length < minimo) {
      throw new ErrorPersonajeNoUsable(
        `Las fotos de referencia del personaje han cambiado desde que pediste el trabajo y ya no llegan al mínimo de ${minimo}. No se ha enviado nada y no se te ha cobrado: añade más fotos y vuelve a pedirlo.`,
      );
    }
  }
  ids = ids.slice(0, maximo);
  if (ids.length === 0) {
    if (!fila.sourceMediaId) throw new Error("El trabajo no tiene imagen de referencia.");
    ids.push(fila.sourceMediaId);
  }
  // Un medio en la papelera no se envía nunca: su archivo puede desaparecer en cualquier momento.
  const filas = await db()
    .select()
    .from(media)
    .where(and(inArray(media.id, ids), isNull(media.deletedAt)));
  const porId = new Map(filas.map((m) => [m.id, m]));
  // Se respeta el orden guardado, no el que devuelva la consulta.
  const origenes = ids.flatMap((id) => {
    const medio = porId.get(id);
    return medio ? [medio] : [];
  });
  if (origenes.length === 0) throw new Error("Las imágenes de referencia ya no existen.");
  return origenes;
}

/**
 * Sube la referencia al proveedor, convirtiéndola antes si ese modelo no acepta el formato en que la guarda
 * la biblioteca (Kling v3 turbo solo admite JPEG o PNG y los fotogramas son WebP).
 */
async function subirReferencia(
  adaptador: Adaptador,
  clave: string,
  origen: FilaMedio,
  modelo: ModeloVista,
  h: Herramientas,
): Promise<string> {
  const archivo = await referenciaCompatible(await archivoDe(origen), modelo.parametros.formatosReferencia);
  return adaptador.subirReferencia({ clave, archivo, buscar: h.buscar });
}
