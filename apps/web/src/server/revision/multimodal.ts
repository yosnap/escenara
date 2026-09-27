import { eq } from "drizzle-orm";
import { esProveedor } from "@/lib/boveda";
import { REGLAS_VERSION } from "@/lib/controles";
import { leerAjustes } from "../ajustes";
import { urlTemporal } from "../almacenamiento";
import { escenaPropia } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { db } from "../db/cliente";
import { reviewResults } from "../db/esquema";
import { exigirAvisoUmbral, exigirConfirmacion, exigirCredencial } from "../generacion/comprobaciones";
import { exigirSelloVigente } from "../generacion/precios";
import type { Actor } from "../media/servicio";
import type { Buscador } from "../proveedores/codigos";
import type { Adaptador, PrecioModelo } from "../proveedores/contrato";
import { resolver } from "../proveedores/registro";
import { clipDeEscena } from "./ejecutar";
import { cerrarGastoDeRevision, crearRevisionReservada } from "./gasto";

/**
 * Revisión **multimodal de pago** de un clip (RF07): una opinión más, nunca un veredicto.
 *
 * Tres reglas que este fichero no negocia (decisión provisional del propietario, 2026-09-27):
 *
 * 1. **nunca se lanza sola**. No hay ningún camino que la dispare al terminar una escena, al abrir la pantalla ni
 *    al refrescar: siempre la pide una persona, escena a escena, con su estimación delante;
 * 2. **hace falta confirmación expresa del coste**: los créditos que se mostraron, el sello de ese precio y la
 *    clave con la que el navegador firma esa confirmación. Si el precio ha cambiado, el envío se rechaza en lugar
 *    de gastar con una estimación caducada; si la clave se repite, se devuelve lo que ya existe y no se vuelve a
 *    llamar al proveedor;
 * 3. **queda en el registro de gasto** con su reserva, su consumo y su liberación, igual que todo lo demás.
 *
 * Y una cuarta, de producto: su veredicto es **siempre `pendiente`**. Lo que un modelo diga de un clip no cierra
 * la revisión ni abre un crítico; la identidad la valida la
 * persona que mira, y eso no cambia porque haya pagado una opinión.
 *
 * **Hoy este camino está preparado y apagado**: el ajuste viene apagado de fábrica y ningún modelo del catálogo
 * declara la capacidad `multimodal_review`, así que la pantalla lo dice y no ofrece el botón.
 */

/** Lo que el navegador confirma para pedir una revisión multimodal. */
export interface ConfirmacionMultimodal {
  /** Créditos que el usuario tenía delante. */
  creditosConfirmados: number;
  /** Sello del precio que se mostró: si ha cambiado, el servidor rechaza el envío. */
  selloEstimacion: string;
  /**
   * Clave que firma el navegador. **Es la que impide pagar dos veces la misma opinión**: mientras no cambie lo que
   * se confirma, un doble clic o un reintento tras un error de red mandan la misma clave y el servidor devuelve la
   * revisión que ya existe sin reservar ni llamar a nadie.
   */
  claveIdempotencia: string;
  /** Casilla del aviso por gasto alto, cuando la instalación la exige. */
  avisoUmbralAceptado?: boolean;
}

/** Modelo con el que se revisa, su adaptador y su precio. Es lo que se inyecta en los tests. */
export interface EleccionDeRevision {
  proveedor: string;
  modelo: string;
  nombreModelo: string;
  adaptador: Pick<Adaptador, "revisarMedio">;
  precio: PrecioModelo;
}

/**
 * Tiempo máximo que se le da al modelo para mirar el clip: **120 s** (decisión provisional del propietario,
 * 2026-09-28). Mirar un vídeo tarda más que escribir un texto (el del asistente corta a los 90 s), y pasado ese
 * rato lo que hay no es una llamada lenta, es una llamada perdida cuya reserva no se puede soltar.
 */
export const MS_MAXIMO_REVISION = 120_000;

export interface HerramientasRevision {
  /** Elige el modelo de revisión del catálogo. Falla si no hay ninguno con la capacidad y con precio. */
  elegirModelo: () => Promise<EleccionDeRevision>;
  buscar: Buscador;
  /** Corte de tiempo de la llamada al proveedor. Se inyecta en los tests para no esperar dos minutos. */
  msMaximo?: number;
}

/** Elección real: el modelo predeterminado de la capacidad `multimodal_review` en el catálogo. */
async function elegirDelCatalogo(): Promise<EleccionDeRevision> {
  const { modelo, adaptador } = await resolver("multimodal_review");
  return {
    proveedor: modelo.proveedor,
    modelo: modelo.modelo,
    nombreModelo: modelo.nombre,
    adaptador,
    precio: await adaptador.estimar(modelo.modelo),
  };
}

export const HERRAMIENTAS_REVISION: HerramientasRevision = { elegirModelo: elegirDelCatalogo, buscar: fetch };

/** Disponibilidad de la revisión multimodal en esta instalación, con el motivo cuando no la hay. */
export interface DisponibilidadMultimodal {
  disponible: boolean;
  motivo: string;
  creditos: number;
  sello: string;
}

const APAGADA =
  "La revisión con modelo está apagada en esta instalación. Las comprobaciones técnicas no cuestan nada y se hacen igual; la identidad la validas tú mirando el clip.";

/**
 * Si se puede ofrecer la revisión multimodal y cuánto costaría. Es **lectura**: no reserva nada y no llama a
 * ningún endpoint de pago. Nunca devuelve `disponible` sin un precio con el que estimar.
 */
export async function disponibilidadMultimodal(
  h: HerramientasRevision = HERRAMIENTAS_REVISION,
): Promise<DisponibilidadMultimodal> {
  const { revisionMultimodalActiva } = await leerAjustes();
  if (!revisionMultimodalActiva) return { disponible: false, motivo: APAGADA, creditos: 0, sello: "" };
  try {
    const eleccion = await h.elegirModelo();
    if (typeof eleccion.adaptador.revisarMedio !== "function") {
      return {
        disponible: false,
        motivo: `El adaptador de ${eleccion.proveedor} todavía no sabe pedirle a un modelo que mire un clip.`,
        creditos: 0,
        sello: "",
      };
    }
    return {
      disponible: true,
      motivo: "",
      creditos: Math.ceil(eleccion.precio.creditos),
      sello: eleccion.precio.sello,
    };
  } catch {
    return {
      disponible: false,
      motivo:
        "Ningún modelo del catálogo sabe mirar un clip con precio registrado, así que no se puede ofrecer esa revisión. Pídeselo a quien administra.",
      creditos: 0,
      sello: "",
    };
  }
}

/** Instrucciones que compone **siempre el servidor**. No sale hacia el navegador (ADR-0022). */
const INSTRUCCIONES = [
  "You review one short generated clip from a vertical video project.",
  "Describe only what you can actually see: the subject's appearance, framing, lighting and any visible artefact.",
  "Do not guess the story, do not invent details and do not give a score.",
  "Answer in Spanish, in at most four sentences.",
].join(" ");

/**
 * Pide la opinión del modelo sobre el clip de una escena. Devuelve el resumen tal como lo dio, ya acotado.
 *
 * El orden importa y es a propósito: **primero todas las comprobaciones, después el dinero, y solo entonces la
 * llamada**. Nada se apunta en el registro de gasto hasta que la confirmación es válida, así que una petición sin
 * confirmar no deja ni un apunte.
 */
export async function revisarConModelo(
  actor: Actor,
  escenaId: unknown,
  confirmacion: ConfirmacionMultimodal,
  h: HerramientasRevision = HERRAMIENTAS_REVISION,
): Promise<void> {
  const { escena } = await escenaPropia(actor, escenaId);
  const clip = await clipDeEscena(escena);

  const { revisionMultimodalActiva } = await leerAjustes();
  if (!revisionMultimodalActiva) throw new ErrorProyecto(409, APAGADA);

  const eleccion = await h.elegirModelo();
  const revisarMedio = eleccion.adaptador.revisarMedio;
  if (typeof revisarMedio !== "function") {
    throw new ErrorProyecto(
      503,
      `El adaptador de ${eleccion.proveedor} todavía no sabe pedirle a un modelo que mire un clip.`,
    );
  }
  if (!esProveedor(eleccion.proveedor)) {
    throw new ErrorProyecto(503, `Esta instalación aún no puede pagar revisiones en ${eleccion.proveedor}.`);
  }

  // La confirmación vale para el precio que se mostró y para ningún otro.
  const creditos = Math.ceil(eleccion.precio.creditos);
  exigirSelloVigente(confirmacion.selloEstimacion, eleccion.precio.sello, true);
  exigirConfirmacion(confirmacion.creditosConfirmados, creditos);
  await exigirAvisoUmbral(creditos, confirmacion.avisoUmbralAceptado);
  const clave = await exigirCredencial(actor.id, eleccion.proveedor);

  /**
   * La fila y su reserva nacen **en la misma transacción**, y con el corte de idempotencia dentro: si esta
   * confirmación ya se había ejecutado, se devuelve la revisión que ya existe y **no se llama al proveedor**. El
   * veredicto queda `pendiente`: la opinión de un modelo no acepta ni rechaza nada.
   */
  const { revision: fila, nueva } = await crearRevisionReservada(
    {
      escenaId: escena.id,
      trabajoId: escena.clipJobId,
      clipMedioId: clip.id,
      tipo: "multimodal",
      severidad: "informativa",
      veredicto: "pendiente",
      comprobaciones: [],
      revisorId: actor.id,
      claveIdempotencia: confirmacion.claveIdempotencia,
      notas: "",
      creditos: null,
      reglasVersion: REGLAS_VERSION,
    },
    {
      usuarioId: actor.id,
      proveedor: eleccion.proveedor,
      modelo: eleccion.modelo,
      creditos,
      sello: eleccion.precio.sello,
    },
  );
  // Confirmación repetida: ya se pagó (o se está pagando) esta misma opinión. No se llama otra vez.
  if (!nueva) return;

  let resumen = "";
  let informados: number | null = null;
  let motivo = `Revisión multimodal del clip de la escena ${escena.sortOrder} con ${eleccion.nombreModelo}.`;
  try {
    const respuesta = await revisarMedio({
      clave,
      modelo: eleccion.modelo,
      url: urlTemporal(clip.storageKey),
      instrucciones: INSTRUCCIONES,
      buscar: h.buscar,
      // El corte de tiempo lo pone quien pide la llamada, no el adaptador: sin él, un proveedor que no contesta
      // deja esta revisión colgada con su reserva apartada hasta que la barra el worker.
      senal: AbortSignal.timeout(h.msMaximo ?? MS_MAXIMO_REVISION),
    });
    resumen = respuesta.resumen.trim().slice(0, 1000);
    informados = respuesta.creditos;
  } catch (error) {
    /**
     * Un fallo **no libera la reserva**: no se sabe si el proveedor ejecutó la llamada, y soltar lo que quizá se ha
     * pagado sería mentir sobre el gasto. Se conserva la estimación como consumo, igual que con una llamada de
     * texto colgada (ADR-0016), y la fila queda diciendo qué pasó.
     *
     * Un corte por tiempo es exactamente el mismo caso, y el más claro de todos: se dejó de esperar, no se supo
     * nada. Se dice así en lugar de enseñar el mensaje del error, que en un `AbortError` no explica nada.
     */
    const agotado = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    const detalle = agotado
      ? `el modelo no ha contestado en ${Math.round((h.msMaximo ?? MS_MAXIMO_REVISION) / 1000)} s`
      : error instanceof Error
        ? error.message
        : "fallo del proveedor";
    resumen = `No se ha podido obtener la opinión del modelo: ${detalle}. Se conserva la estimación como gasto porque no se sabe si llegó a ejecutarse.`;
    motivo = "La revisión multimodal no llegó a completarse y no se sabe si el proveedor la ejecutó.";
  }
  const apuntados = await cerrarGastoDeRevision(fila.id, informados, motivo);
  await actualizarResumen(fila.id, resumen, apuntados);
}

/**
 * Deja el resumen y **lo que consta apuntado** en la fila de la revisión. Los créditos son los que devuelve el
 * cierre, que son los del registro de gasto: si otro cierre se adelantó (el barrido), manda el suyo, así que la
 * fila y el registro nunca cuentan importes distintos.
 */
async function actualizarResumen(revisionId: string, resumen: string, creditos: number): Promise<void> {
  await db().update(reviewResults).set({ notes: resumen, credits: creditos }).where(eq(reviewResults.id, revisionId));
}
