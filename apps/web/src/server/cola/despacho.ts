import { and, eq, inArray, isNull } from "drizzle-orm";
import { PROVEEDORES_PUBLICOS } from "@/lib/boveda";
import { esVista, proporcionDeVista } from "@/lib/captura-personaje";
import { CAPACIDAD_DE_TIPO, type ModeloVista } from "@/lib/catalogo";
import { mensajeDeFalloDeProveedor } from "@/lib/diagnostico-proveedor";
import {
  type IntentoDeVoz,
  mensajeDeCambioDeProveedor,
  mensajeDeFalloDeVoz,
  sugerenciaDeReserva,
} from "@/lib/diagnostico-voz";
import { familiaDeVoz, type ParametrosVoz, parametrosVozDe } from "@/lib/voz";
import { eurosPorCreditoDe, leerAjustes } from "../ajustes";
import { usarCompatibles } from "../boveda/compatibles";
import { usarCredencialValida } from "../boveda/credenciales";
import { hechosDePersonajeCitado, parametrosDeControles } from "../controles/hechos";
import { evaluar, frenosQueGatean } from "../controles/motor";
import { mensajeDeFreno } from "../controles/puerta";
import { db } from "../db/cliente";
import { characters, type FilaMedio, type FilaTrabajo, generationJobs, media, usageLedger } from "../db/esquema";
import { archivoDe } from "../generacion/comprobaciones";
import { olvidarSaldo } from "../generacion/estimacion";
import type { Herramientas } from "../generacion/herramientas";
import type { EleccionDeTrabajo } from "../generacion/precios";
import { cerrarVozSincrona } from "../generacion/seguimiento";
import { opcionesDeGeneracion } from "../mapa/generacion";
import { opcionesDeVoz, type ReservaAutorizada } from "../mapa/voz";
import { referenciaCompatible } from "../media/conversion-referencia";
import { mediosDeReferenciaVigentes } from "../personajes/consulta";
import { cerrarTrabajoYGasto } from "../presupuesto/reserva";
import { registrarFalloDeEscena } from "../produccion/cierre";
import { type Adaptador, ErrorProveedor, type VozPedida } from "../proveedores/contrato";
import { resolver } from "../proveedores/registro";
import { creditosDeLaOpcion } from "../voz/eleccion";
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
    const reserva = await relevoDelMapa(fila, error, h);
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
        /**
         * Si la ficha del personaje ya no está, esto bloquea en lugar de dejar pasar. Y el **primer retrato de
         * un personaje inventado** (0.22.0) se revalida sin exigirle las fotos que todavía no tiene: es este
         * mismo trabajo el que se las va a dar, igual que al encolarlo.
         */
        personaje: await hechosDePersonajeCitado(
          fila.characterId,
          (fila.input as { retratoInventado?: unknown }).retratoInventado === true,
        ),
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
  const credencial = await claveDelTrabajo(fila);
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
      // Solo la usa el adaptador de los servicios compatibles: es la dirección que eligió el usuario.
      urlBaseCompatible: urlBaseDe(fila),
    });
    const callbackVoz = await prepararCallback(fila);
    return { adaptador, clave: credencial.clave, entrada: entradaVoz, ...callbackVoz };
  }
  /**
   * Escena hablada de un proyecto en modo `omni` (0.22.0). La identidad y la voz **son** el personaje registrado
   * en el proveedor, así que no hay ninguna imagen que subir: lo que se envía son los `character_ids` que
   * quedaron guardados al encolar, nunca los que el personaje tenga registrados ahora. Lo que se paga tiene que
   * ser lo que el usuario confirmó, y volver a leer el registro podría mandar otra cara.
   */
  const personajesOmni = personajesOmniDe(fila);
  if (personajesOmni.length > 0) {
    const segundosOmni = segundosDe(fila);
    const entradaOmni = adaptador.montarEntrada(modelo, {
      escena: fila.prompt,
      dialogo: dialogoDe(fila),
      urls: [],
      personajesOmni,
      ...(segundosOmni === null ? {} : { segundos: segundosOmni }),
    });
    const callbackOmni = await prepararCallback(fila);
    return { adaptador, clave: credencial.clave, entrada: entradaOmni, ...callbackOmni };
  }
  /**
   * Retrato candidato de un personaje inventado (0.22.0): nace de su descripción y no tiene ninguna foto que
   * subir. El modelo recibe el prompt sin referencias, que es lo que lo convierte en un retrato nuevo en lugar
   * de en la edición de una foto.
   */
  if ((fila.input as { retratoInventado?: unknown }).retratoInventado === true) {
    // Retrato de cabeza y hombros: 3:4, la misma proporción que las vistas de la cabeza.
    const entradaRetrato = adaptador.montarEntrada(modelo, {
      escena: fila.prompt,
      dialogo: "",
      urls: [],
      proporcion: proporcionDeVista("frontal"),
    });
    const callbackRetrato = await prepararCallback(fila);
    return { adaptador, clave: credencial.clave, entrada: entradaRetrato, ...callbackRetrato };
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
  /**
   * Audio de referencia de una escena hablada con un motor **de referencias** (MiniMax H3, 0.22.0): la muestra
   * ya pagada de la voz del proyecto. Se sube igual que una imagen —el almacenamiento temporal del proveedor
   * acepta cualquier archivo— y su URL caduca igual, así que tampoco se guarda nunca en el trabajo.
   */
  const audios: string[] = [];
  const audioId = audioDeReferenciaDe(fila);
  if (audioId) {
    const [audio] = await db()
      .select()
      .from(media)
      .where(and(eq(media.id, audioId), isNull(media.deletedAt)));
    if (!audio) {
      throw new ErrorSinCredencial(
        "La muestra de voz con la que se iba a generar esta escena ya no está en tu biblioteca, así que el clip no sonaría con la voz de este proyecto. Vuelve a oír esa voz en «Voz y subtítulos» y pide la escena otra vez.",
      );
    }
    audios.push(
      await adaptador.subirReferencia({ clave: credencial.clave, archivo: await archivoDe(audio), buscar: h.buscar }),
    );
  }
  const vistaPedida = (fila.input as { vistaSintetica?: unknown }).vistaSintetica;
  const entrada = adaptador.montarEntrada(modelo, {
    escena: fila.prompt,
    dialogo: dialogoDe(fila),
    urls,
    // Una vista del personaje sale con su proporción (cabeza 3:4, cuerpo 9:16); lo demás, con la del modelo.
    ...(fila.kind === "fotograma" && esVista(vistaPedida) ? { proporcion: proporcionDeVista(vistaPedida) } : {}),
    ...(audios.length > 0 ? { audiosDeReferencia: audios } : {}),
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
 * Intenta el trabajo de voz con **la siguiente reserva autorizada** tras un rechazo probado del anterior
 * (0.21.1: son N, en el orden del mapa de modelos del usuario). Devuelve `null` cuando no procede: no es un
 * trabajo de voz o el fallo no prueba que no se haya cobrado.
 *
 * Cambia el proveedor y el modelo **de la misma fila**, así que no hay un trabajo nuevo, ni una reserva nueva, ni
 * una confirmación nueva: es el mismo gasto que el usuario ya autorizó, encaminado a otro sitio.
 *
 * **El relevo solo puede ir a donde el usuario ya autorizó.** Al encolar se le enseñó, en la moneda de cada
 * reserva, cuánto costaría este diálogo allí, y esas cifras quedaron en la entrada del trabajo. Los créditos de
 * dos proveedores no se comparan entre sí, así que el tope de cada una es el suyo y solo el suyo:
 *
 * - si al encolar no había ninguna reserva (el usuario añadió la clave después), no se cambia;
 * - si esa reserva ya no se puede resolver (clave borrada, modelo retirado, sin precio), se salta;
 * - si lo que cuesta ahora el diálogo allí supera lo que vio, se salta;
 * - si su familia de voces no es la de la voz fijada, se salta: leería el diálogo con otro timbre.
 *
 * Cuando no queda ninguna, se falla sin coste diciendo **qué se podía haber probado y por qué no**.
 */
async function relevoDelMapa(fila: FilaTrabajo, error: unknown, h: Herramientas): Promise<Despachado | null> {
  if (!(error instanceof ErrorProveedor) || !error.rechazoProbado) return null;
  /**
   * Una reserva **del mismo proveedor** no sirve tras un rechazo probado, y por eso se descarta antes de nada:
   * los tres códigos que prueban que no hubo cobro son de la cuenta, no del modelo (la clave está rechazada, la
   * cuenta no tiene saldo o el proveedor ha pedido esperar). Probar otro modelo suyo sería repetir el mismo
   * rechazo y retrasar el mensaje al usuario.
   */
  const pendientes = reservasPendientes(fila).filter((r) => r.proveedor !== fila.provider);
  const intentos: IntentoDeVoz[] = [
    { proveedor: fila.provider, modelo: fila.model, codigo: error.codigo, cobro: "sin-cobro" },
  ];
  if (pendientes.length === 0) {
    /**
     * No hay ninguna reserva autorizada. Si **ahora** el usuario tiene otra opción utilizable (añadió la clave
     * después de encolar), eso hay que decirlo con todas las letras: no se cambia de proveedor sin que haya
     * visto lo que cuesta allí, y lo que no se puede es callarse que existía una alternativa.
     */
    const otras = (await opcionesDelTipo(fila)).filter((o) => o.eleccion.modelo.proveedor !== fila.provider);
    const otra = otras[0];
    if (!otra) return null;
    const nombre = otra.eleccion.modelo.nombreProveedor;
    return {
      fila: await cerrarSinCoste(
        fila,
        error.motivo,
        mensajeDeFalloDeVoz(
          intentos,
          `Se podía haber probado con ${nombre}, pero cuando pediste esta voz no lo tenías disponible y no autorizaste su coste: no se cambia de proveedor sin que lo hayas visto. Vuelve a pedir la voz de esta escena y se te mostrará lo que cuesta con ${nombre}.`,
        ),
      ),
      enviado: false,
    };
  }

  let actual = fila;
  const descartadas: string[] = [];
  for (const reserva of pendientes) {
    const motivo = await motivoParaNoRelevar(actual, reserva);
    if (motivo !== null) {
      descartadas.push(motivo);
      continue;
    }
    console.warn(`[cola] relevo en el trabajo ${actual.id}: ${actual.provider} → ${reserva.proveedor}`);
    const cambiada = await encaminarA(actual, reserva);
    if (!cambiada) return null;
    actual = cambiada;

    let preparado: Preparado;
    try {
      preparado = await preparar(actual, actual.lockedBy ?? "", h);
    } catch (segundoError) {
      if (esRechazoProbado(segundoError)) {
        intentos.push(intentoDe(actual, segundoError));
        continue;
      }
      return { fila: await tratarFalloDeLlamada(actual, segundoError, h, intentos), enviado: false };
    }
    let llamada: Llamada;
    try {
      llamada = await llamarAlProveedor(actual, preparado, h);
    } catch (segundoError) {
      if (esRechazoProbado(segundoError)) {
        intentos.push(intentoDe(actual, segundoError));
        continue;
      }
      return { fila: await tratarFalloDeLlamada(actual, segundoError, h, intentos), enviado: false };
    }
    olvidarSaldo(actual.userId);
    const guardada = await guardarTarea(actual, llamada.taskId, preparado.callbackTokenHash);
    if (!guardada) return { fila: await marcarTareaPerdida(actual, llamada.taskId), enviado: false };
    // Quien paga tiene derecho a saber en qué cuenta se ha gastado y por qué, aunque haya salido bien.
    const primero = intentos[0];
    const aviso = primero
      ? mensajeDeCambioDeProveedor(primero, {
          proveedor: reserva.proveedor as FilaTrabajo["provider"],
          modelo: reserva.modelo,
        })
      : "";
    await db().update(generationJobs).set({ errorMessage: aviso }).where(eq(generationJobs.id, guardada.id));
    const conAviso = { ...guardada, errorMessage: aviso };
    if (llamada.inmediata) {
      return { fila: await cerrarVozSincrona(conAviso, llamada.inmediata, aviso), enviado: true };
    }
    return { fila: conAviso, enviado: true };
  }

  // Se han acabado las reservas: se cierra sin coste contando todos los intentos y todo lo que se descartó.
  return {
    fila: await cerrarSinCoste(actual, error.motivo, mensajeDeFalloDeVoz(intentos, descartadas.join(" "))),
    enviado: false,
  };
}

const esRechazoProbado = (error: unknown) => error instanceof ErrorProveedor && error.rechazoProbado;

const intentoDe = (fila: FilaTrabajo, error: unknown): IntentoDeVoz => ({
  proveedor: fila.provider,
  modelo: fila.model,
  codigo: error instanceof ErrorProveedor ? error.codigo : "respuesta-inesperada",
  cobro: "sin-cobro",
});

/** Por qué esta reserva no se puede usar, o `null` si sí se puede. El motivo entra en el mensaje del usuario. */
async function motivoParaNoRelevar(fila: FilaTrabajo, reserva: ReservaAutorizada): Promise<string | null> {
  const nombre = await nombreDeLaReserva(fila.userId, reserva);
  /**
   * La familia de voces solo acota a la **voz**: los identificadores de ElevenLabs y los de kokoro no son los
   * mismos, así que una reserva de otra familia leería el diálogo con otro timbre. En imagen y vídeo no hay nada
   * equivalente: lo que acota ahí es el precio autorizado y que el modelo siga existiendo.
   */
  const voz = fila.kind === "voz" ? vozDe(fila) : null;
  if (voz && familiaDeVoz(voz.voz) !== null && familiaDeVoz(voz.voz) !== reserva.familia) {
    return `Se podía haber probado con ${nombre}, pero sus voces son otras y no incluyen la que tiene fijada este proyecto: generar ahí habría cambiado el timbre del personaje a mitad de proyecto.`;
  }
  const disponible = await reservaDisponible(fila, reserva);
  if (!disponible) {
    return `Se podía haber probado con ${nombre}, pero ahora mismo no está utilizable en tu cuenta: puede que falte su clave o que su modelo ya no tenga precio registrado en esta instalación.`;
  }
  const ahora =
    fila.kind === "voz" ? creditosDeLaOpcion(disponible, dialogoDe(fila)) : Math.ceil(disponible.precio.creditos);
  if (ahora > reserva.creditos) {
    return `Se podía haber probado con ${nombre}, pero generar este diálogo allí cuesta ahora ${ahora} créditos de ${nombre} y tú autorizaste ${reserva.creditos}: no se cambia de proveedor para gastar más de lo que viste. Vuelve a pedir la voz de esta escena y se te mostrará el coste actualizado.`;
  }
  return null;
}

/**
 * Opciones utilizables **del apartado del mapa que le toca a este trabajo**: voz para una pista de voz, imagen
 * para un fotograma y vídeo para un clip. Es la misma lectura que hizo la estimación al encolar, así que el
 * relevo solo puede ir a donde el usuario ya vio que se podía ir.
 */
type OpcionRelevable = { entrada: { compatibleId: string | null }; eleccion: EleccionDeTrabajo };

async function opcionesDelTipo(fila: FilaTrabajo): Promise<OpcionRelevable[]> {
  if (fila.kind === "voz") return opcionesDeVoz(fila.userId, dialogoDe(fila));
  return opcionesDeGeneracion(fila.userId, fila.kind);
}

/** La reserva, resuelta contra lo que hay ahora mismo: su modelo, su adaptador y su precio. `null` si ya no vale. */
async function reservaDisponible(fila: FilaTrabajo, reserva: ReservaAutorizada) {
  const opciones = await opcionesDelTipo(fila);
  const opcion = opciones.find(
    (o) =>
      o.eleccion.modelo.proveedor === reserva.proveedor &&
      o.eleccion.modelo.modelo === reserva.modelo &&
      o.entrada.compatibleId === reserva.compatibleId,
  );
  return opcion?.eleccion ?? null;
}

/** Nombre visible de una reserva: el del proveedor, o el que el usuario le puso a su servicio compatible. */
async function nombreDeLaReserva(usuarioId: string, reserva: ReservaAutorizada): Promise<string> {
  if (reserva.proveedor !== "compatible") {
    return PROVEEDORES_PUBLICOS[reserva.proveedor as FilaTrabajo["provider"]]?.nombre ?? reserva.proveedor;
  }
  const servicios = await usarCompatibles(usuarioId);
  return servicios.find((s) => s.id === reserva.compatibleId)?.nombre ?? "tu servicio compatible";
}

/**
 * Apunta la fila y su reserva de presupuesto al proveedor nuevo **y a su importe autorizado**, en su moneda: el
 * cierre copia proveedor, modelo e importe de la reserva, así que sin esto el usuario vería en su historial un
 * cobro de KIE que en realidad le hizo otro, o un tope expresado en la moneda equivocada.
 */
async function encaminarA(fila: FilaTrabajo, reserva: ReservaAutorizada): Promise<FilaTrabajo | null> {
  const [cambiada] = await db()
    .update(generationJobs)
    .set({
      provider: reserva.proveedor as FilaTrabajo["provider"],
      model: reserva.modelo,
      estimatedCredits: reserva.creditos,
      // La dirección del servicio viaja en la entrada: el adaptador de los compatibles no puede saberla.
      input: {
        ...(fila.input as Record<string, unknown>),
        urlBase: reserva.urlBase,
        compatibleId: reserva.compatibleId,
      },
    })
    .where(and(eq(generationJobs.id, fila.id), eq(generationJobs.state, "enviando"), isNull(generationJobs.taskId)))
    .returning();
  if (!cambiada) return null;
  await db()
    .update(usageLedger)
    .set({
      provider: reserva.proveedor as FilaTrabajo["provider"],
      model: reserva.modelo,
      credits: reserva.creditos,
      amountEur: reserva.creditos * eurosPorCreditoDe(await leerAjustes(), reserva.proveedor),
    })
    .where(and(eq(usageLedger.jobId, cambiada.id), eq(usageLedger.entryType, "reserva")));
  return cambiada;
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
          sugerenciaDeReserva(previos.length > 0 || reservasPendientes(fila).length > 0),
        )
      : mensajeDeFalloDeProveedor(ENCABEZADO_DE_TRABAJO[fila.kind], [
          {
            proveedor: PROVEEDORES_PUBLICOS[fila.provider].nombre,
            modelo: fila.model,
            codigo,
            cobro: "sin-cobro",
          },
        ]);
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

/**
 * Reservas autorizadas de una voz, **en orden**, tal como quedaron guardadas al encolar (0.21.1). Cada una trae
 * su tope en la moneda de su proveedor: es lo único a donde puede ir el relevo automático, porque es lo único
 * cuyo coste el usuario ha visto y ha autorizado.
 */
function reservasAutorizadas(fila: FilaTrabajo): ReservaAutorizada[] {
  const guardadas = (fila.input as { reservas?: unknown }).reservas;
  if (!Array.isArray(guardadas)) return [];
  const salida: ReservaAutorizada[] = [];
  for (const cruda of guardadas) {
    const r = cruda as Record<string, unknown>;
    if (typeof r?.proveedor !== "string" || typeof r.modelo !== "string" || typeof r.creditos !== "number") continue;
    salida.push({
      proveedor: r.proveedor,
      compatibleId: typeof r.compatibleId === "string" ? r.compatibleId : null,
      modelo: r.modelo,
      creditos: r.creditos,
      familia: r.familia === "kokoro" ? "kokoro" : "elevenlabs",
      urlBase: typeof r.urlBase === "string" ? r.urlBase : "",
    });
  }
  return salida;
}

/** Reservas de este trabajo que quedan por probar: las que van después del proveedor y modelo que acaban de fallar. */
function reservasPendientes(fila: FilaTrabajo): ReservaAutorizada[] {
  const todas = reservasAutorizadas(fila);
  const yaUsada = todas.findIndex((r) => r.proveedor === fila.provider && r.modelo === fila.model);
  return yaUsada === -1 ? todas : todas.slice(yaUsada + 1);
}

/**
 * Clave con la que se paga este trabajo.
 *
 * Los proveedores de la bóveda tienen una clave por usuario. Un servicio **compatible con la API de OpenAI** no:
 * el usuario puede tener varios, así que la suya se busca por el identificador que quedó guardado en el trabajo
 * al encolar. Si ya no está, no se envía nada y se dice qué hacer.
 */
async function claveDelTrabajo(fila: FilaTrabajo): Promise<{ clave: string }> {
  if (fila.provider === "compatible") {
    const id = compatibleIdDe(fila);
    const servicio = (await usarCompatibles(fila.userId)).find((s) => s.id === id || s.urlBase === urlBaseDe(fila));
    if (!servicio) {
      throw new ErrorSinCredencial(
        "El servicio compatible con el que se iba a generar esto ya no está guardado en tu cuenta, o su clave está marcada como no válida. Vuelve a añadirlo en «Tu cuenta» y pide el trabajo otra vez.",
      );
    }
    return { clave: servicio.clave };
  }
  const credencial = await usarCredencialValida(fila.userId, fila.provider);
  if (!credencial.ok) {
    const nombre = PROVEEDORES_PUBLICOS[fila.provider].nombre;
    throw new ErrorSinCredencial(
      `No hay una clave de ${nombre} utilizable en tu cuenta. Añádela en «Tu cuenta» y vuelve a pedir el trabajo.`,
    );
  }
  return { clave: credencial.clave };
}

/** Dirección base del servicio compatible que quedó guardada al encolar; vacía en los demás proveedores. */
function urlBaseDe(fila: FilaTrabajo): string {
  const url = (fila.input as { urlBase?: unknown }).urlBase;
  return typeof url === "string" ? url : "";
}

/** Muestra de voz que este trabajo usa como audio de referencia; vacío en todo lo que no la use. */
function audioDeReferenciaDe(fila: FilaTrabajo): string {
  const guardado = (fila.input as { audioDeReferencia?: unknown }).audioDeReferencia;
  return typeof guardado === "string" ? guardado : "";
}

/**
 * Personajes registrados en el proveedor que este trabajo tiene que citar (modo `omni`, 0.22.0), tal como
 * quedaron guardados al encolar. Vacío en todo lo demás, que es todo lo anterior a la 0.22.0.
 */
function personajesOmniDe(fila: FilaTrabajo): string[] {
  const guardados = (fila.input as { personajesOmni?: unknown }).personajesOmni;
  if (!Array.isArray(guardados)) return [];
  return guardados.filter((id): id is string => typeof id === "string" && id !== "");
}

/** Identificador del servicio compatible con el que se encoló, si lo hubo. */
function compatibleIdDe(fila: FilaTrabajo): string {
  const guardado = (fila.input as { compatibleId?: unknown }).compatibleId;
  if (typeof guardado === "string" && guardado !== "") return guardado;
  // Tras un relevo, el servicio es el de la reserva a la que se encaminó.
  const usada = reservasAutorizadas(fila).find((r) => r.proveedor === fila.provider && r.modelo === fila.model);
  return usada?.compatibleId ?? "";
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
    // sustituye a una foto de la persona (0.14.0). **Salvo en un personaje inventado**, que no tiene ni admite
    // fotos: ahí lo sostienen sus imágenes generadas, igual que en la ficha (`contarReferencias`).
    const [personaje] = await db()
      .select({ virtual: characters.virtual })
      .from(characters)
      .where(eq(characters.id, fila.characterId));
    const cuentan = personaje?.virtual ? ids.length : ids.filter((id) => vigentes.get(id) === "foto_original").length;
    if (cuentan < minimo) {
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
