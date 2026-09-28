import { eq } from "drizzle-orm";
import {
  ErrorFichaPropuesta,
  INSTRUCCIONES_FICHA_PERSONAJE,
  leerFichaPropuesta,
  type PropuestaDeFicha,
  peticionDeFicha,
} from "@/lib/asistente-personaje";
import { leerObjeto } from "../almacenamiento";
import { db } from "../db/cliente";
import { type FilaPersonaje, media } from "../db/esquema";
import { exigirClaveIdempotencia, exigirConfirmacion } from "../generacion/comprobaciones";
import { exigirSelloVigente } from "../generacion/precios";
import { dentroDelLimite, type Limite } from "../limite";
import {
  ErrorDeTexto,
  ErrorPeticionRepetida,
  type EstimacionDeTexto,
  estimarTextoPorMapa,
  pedirTextoPorMapa,
} from "../mapa/texto";
import { imagenParaModelo } from "../media/procesado";
import type { Actor } from "../media/servicio";
import type { Buscador } from "../proveedores/codigos";
import { ErrorCatalogo } from "../proveedores/contrato";
import { filaPropia } from "./consulta";
import { mejorReferenciaDe } from "./contexto";
import { ErrorPersonaje } from "./errores";
import { fichaDeFila } from "./ficha";
import { exigirTextoSinPersonasReales } from "./inventado";
import { motivosParaNoGenerar } from "./puede-generar";

/**
 * «Completar la ficha con IA» (0.22.1): el modelo de **texto del mapa** del usuario propone los campos de la
 * ficha a partir de la descripción del personaje y, si su modelo admite imágenes, de una imagen suya.
 *
 * Lo que hace que esto sea una ayuda y no un riesgo:
 *
 * - **no guarda nada**. Devuelve una propuesta que el usuario revisa campo a campo; guardar es la edición de
 *   ficha de siempre, con su versión y su motivo;
 * - **es la misma puerta de dinero** que el resto del texto: recorre el mapa con sus reservas, confirma el
 *   coste cuando lo hay y apunta 0 créditos cuando el proveedor cobra por cuota del plan;
 * - **exige consentimiento vigente**: de aquí sale la descripción de una persona —y a veces su cara— hacia un
 *   proveedor de texto. No se exige el mínimo de fotos: la ficha se rellena **antes** de tenerlas, y ese
 *   mínimo es la puerta de generar, no la de describir;
 * - en un personaje **inventado**, ni lo que entra ni lo que sale puede nombrar a una persona real.
 */

/** Ritmo por usuario: rellenar una ficha no es algo que se repita cincuenta veces en una hora. */
export const RITMO_ASISTENTE_FICHA: Limite = { ventanaSegundos: 60 * 60, maximo: 30 };

export interface PeticionFichaConIA {
  claveIdempotencia: unknown;
  /** Créditos que el usuario tenía delante. Solo se exige cuando la entrada principal cuesta créditos. */
  creditosConfirmados?: unknown;
  selloEstimacion?: unknown;
}

/**
 * Estimación de lo que costaría completar la ficha, con si el modelo elegido admite imágenes. Es una lectura:
 * no llama a ningún proveedor ni reserva nada.
 */
export async function estimacionDeFichaConIA(usuarioId: string): Promise<EstimacionDeTexto> {
  return estimarTextoPorMapa(usuarioId);
}

/**
 * Consentimiento vigente, y nada más. El mínimo de fotos no se exige a propósito: completar la ficha es justo
 * uno de los pasos que se hacen **antes** de tenerlas.
 */
async function exigirPersonajeDescribible(personaje: FilaPersonaje): Promise<void> {
  const motivos = await motivosParaNoGenerar(personaje.id, 0);
  if (motivos.length > 0) {
    throw new ErrorPersonaje(
      409,
      `No se puede describir a «${personaje.name}» con la IA todavía: su ficha saldría hacia un proveedor de texto. ${motivos.join(" ")}`,
    );
  }
}

/**
 * Imagen del personaje que acompaña a la petición: su mejor referencia (el retrato elegido en un inventado).
 * Devuelve el motivo cuando no hay ninguna o no se puede leer: nunca falla por esto, porque la propuesta con
 * solo la descripción sigue siendo útil y se dice que se hizo así.
 */
async function imagenDelPersonaje(
  personaje: FilaPersonaje,
): Promise<{ imagen: { mime: string; base64: string } | null; motivo: string }> {
  const medioId = await mejorReferenciaDe(personaje.id, personaje.kind);
  if (!medioId) {
    return {
      imagen: null,
      motivo:
        "Este personaje todavía no tiene ninguna imagen, así que la propuesta sale solo de su descripción. Con un retrato elegido, la ficha se ajusta mucho más.",
    };
  }
  const [fila] = await db().select().from(media).where(eq(media.id, medioId)).limit(1);
  if (!fila) return { imagen: null, motivo: "Su imagen de referencia ya no está en tu biblioteca." };
  try {
    return {
      imagen: await imagenParaModelo(new Uint8Array(await leerObjeto(fila.storageKey).arrayBuffer())),
      motivo: "",
    };
  } catch (error) {
    console.error(`[personajes] imagen ilegible al completar la ficha de ${personaje.id}: ${(error as Error).name}`);
    return {
      imagen: null,
      motivo: "No se ha podido leer su imagen, así que la propuesta sale solo de la descripción.",
    };
  }
}

/**
 * Propone los campos de la ficha. **No guarda nada**: lo que devuelve se revisa y se acepta (entero o campo a
 * campo) desde la pestaña «Ficha», y aceptarlo es una edición normal que crea versión.
 */
export async function proponerFichaConIA(
  actor: Actor,
  id: unknown,
  peticion: PeticionFichaConIA,
  buscar: Buscador = fetch,
): Promise<PropuestaDeFicha> {
  const personaje = await filaPropia(actor, id);
  if (personaje.ownerId !== actor.id) throw new ErrorPersonaje(404, "El personaje no existe.");
  const clave = exigirClaveIdempotencia(peticion.claveIdempotencia);
  await exigirPersonajeDescribible(personaje);
  if (personaje.description.trim() === "") {
    throw new ErrorPersonaje(
      400,
      "Escribe primero una descripción del personaje: es de lo que sale la propuesta de su ficha.",
    );
  }

  const estimacion = await estimarTextoPorMapa(actor.id);
  if (!estimacion.hayEntradas) throw new ErrorPersonaje(409, estimacion.motivo);
  // Solo se confirma lo que cuesta: una entrada que se paga por cuota del plan no tiene precio que confirmar,
  // y pedir una confirmación de 0 créditos sería un trámite que no protege de nada.
  if (!estimacion.porCuota) {
    exigirConfirmacion(peticion.creditosConfirmados, estimacion.creditos);
    exigirSelloVigente(peticion.selloEstimacion, estimacion.sello, true);
  }
  if (!(await dentroDelLimite(`personajes:ficha-ia:${actor.id}`, RITMO_ASISTENTE_FICHA))) {
    throw new ErrorPersonaje(429, "Has pedido demasiadas fichas seguidas. Espera un rato.");
  }

  // La imagen se prepara **antes** de reservar: leerla y reducirla puede fallar, y una reserva apartada por un
  // fallo nuestro le comería presupuesto al usuario hasta que el barrido la cerrara.
  const { imagen, motivo: motivoSinImagen } = estimacion.admiteImagen
    ? await imagenDelPersonaje(personaje)
    : {
        imagen: null,
        motivo: `${estimacion.nombreProveedor} (${estimacion.modelo}) no admite imágenes, así que la propuesta sale solo de la descripción. Puedes poner delante un servicio que sí las admita en tu mapa de modelos de texto.`,
      };

  let resultado: Awaited<ReturnType<typeof pedirTextoPorMapa>>;
  try {
    resultado = await pedirTextoPorMapa({
      usuarioId: actor.id,
      kind: "ficha_personaje",
      instrucciones: INSTRUCCIONES_FICHA_PERSONAJE,
      entrada: peticionDeFicha({
        nombre: personaje.name,
        descripcion: personaje.description,
        tipo: personaje.kind,
        ficha: fichaDeFila(personaje),
        conImagen: imagen !== null,
      }),
      claveIdempotencia: `ficha:${personaje.id}:${clave}`,
      buscar,
      ...(imagen ? { imagen } : {}),
    });
  } catch (error) {
    if (error instanceof ErrorDeTexto) {
      throw new ErrorPersonaje(
        502,
        error.mensaje("No se ha podido completar la ficha, así que no se ha cambiado nada del personaje"),
      );
    }
    if (error instanceof ErrorPeticionRepetida) {
      throw new ErrorPersonaje(
        409,
        "Esa misma petición ya está en marcha. No se ha llamado otra vez: espera unos segundos y vuelve a mirar.",
      );
    }
    if (error instanceof ErrorCatalogo) throw new ErrorPersonaje(error.estado, error.message);
    throw error;
  }

  let campos: PropuestaDeFicha["campos"];
  try {
    campos = leerFichaPropuesta(resultado.texto);
  } catch (error) {
    if (error instanceof ErrorFichaPropuesta) {
      // Ha contestado, así que si cobraba por petición ya ha cobrado: se dice **quién** y qué pasó.
      throw new ErrorPersonaje(
        502,
        `${resultado.nombreProveedor} (${resultado.modelo}) ha contestado, pero ${error.message}. No se ha cambiado nada del personaje.`,
      );
    }
    throw error;
  }
  // Un personaje inventado no puede describirse como alguien real, tampoco cuando lo escribe el modelo.
  if (personaje.virtual) exigirTextoSinPersonasReales(...Object.values(campos));

  return {
    campos,
    conImagen: resultado.conImagen,
    motivoSinImagen: resultado.conImagen ? "" : motivoSinImagen,
    nombreProveedor: resultado.nombreProveedor,
    modelo: resultado.modelo,
    deReserva: resultado.deReserva,
  };
}
