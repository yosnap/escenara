import { and, desc, eq, isNull } from "drizzle-orm";
import type { CodigoPrueba } from "@/lib/boveda";
import { mensajeDeFalloDeProveedor } from "@/lib/diagnostico-proveedor";
import {
  DESCRIPCION_PERSONAJE_OMNI_MAXIMA,
  DESCRIPCION_VOZ_OMNI_MAXIMA,
  EJEMPLO_VOZ_OMNI_MAXIMO,
  MODELOS_OMNI,
  NOMBRE_VOZ_OMNI_MAXIMO,
} from "@/lib/omni";
import { usarCredencialValida } from "../boveda/credenciales";
import { db } from "../db/cliente";
import {
  characterOmniRegistrations,
  type FilaMedio,
  type FilaPersonaje,
  type FilaRegistroOmni,
  type FilaVersionPersonaje,
  media,
} from "../db/esquema";
import { archivoDe } from "../generacion/comprobaciones";
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import { type EleccionDeTrabajo, elegirParaTipo } from "../generacion/precios";
import type { Actor } from "../media/servicio";
import { contextoParaGenerar } from "../personajes/contexto";
import { ErrorProveedor } from "../proveedores/contrato";
import { saldoCreditos } from "../proveedores/kie/cliente";
import { ErrorOmni } from "./errores";

/**
 * Registro en el proveedor de la **voz** de un proyecto y de la **identidad** de un personaje, que es lo que
 * hace posible el modo `omni` (RF02, RF06, RF08 y RF10, 0.22.0).
 *
 * Los dos registros son síncronos y **no cuestan créditos** (medido con dinero real el 2026-09-28: el proveedor
 * no cobró nada por ninguno de los dos), así que no pasan por la cola ni apartan presupuesto. Lo que sí hacen es
 * enviar la cara del personaje al proveedor y dejarla alojada allí, y por eso:
 *
 * - el consentimiento se comprueba **antes** de enviar nada, con la misma regla de siempre;
 * - cada registro queda escrito con su cuenta, su fecha y sus 0 créditos, que es lo que permite auditar que este
 *   camino no cobra en lugar de prometerlo;
 * - un fallo se cuenta con la norma de errores visibles: proveedor, modelo, causa, si se cobró y qué hacer.
 *
 * Este fichero **no decide de quién es el personaje ni si hay consentimiento**: eso lo deciden quienes llaman
 * (`personajes/omni.ts` y `voz/omni.ts`), que son los que tienen el actor y el motor de controles delante.
 */

/**
 * Modelo, adaptador y precio con los que se producen las escenas habladas: **el primero de `MODELOS_OMNI` que el
 * catálogo tenga utilizable y con precio**, que hoy es Gemini Omni 1.1 Flash.
 *
 * Sale del catálogo y no de una constante a propósito: retirar un modelo, cambiar su precio o validar otro es
 * una decisión de quien administra, y escribirlo a fuego aquí significaría que cambiarlo es cambiar el código.
 * Si ninguno está utilizable, se propaga el motivo del último intento y **no se produce nada**.
 */
export async function eleccionOmni(): Promise<EleccionDeTrabajo> {
  let ultimo: unknown = null;
  for (const modelo of MODELOS_OMNI) {
    try {
      return await elegirParaTipo("animacion", modelo);
    } catch (error) {
      ultimo = error;
    }
  }
  throw (
    ultimo ??
    new ErrorOmni(
      503,
      "Esta instalación no tiene ningún modelo de escenas habladas utilizable, así que no puede usar el modo Omni.",
    )
  );
}

/**
 * Clave del usuario en el proveedor de Omni. Un registro se hace **con la credencial de quien lo pide**, igual
 * que cualquier otro envío: no hay ninguna clave de la instalación detrás.
 */
async function claveDe(usuarioId: string, proveedor: string, nombreProveedor: string): Promise<string> {
  const credencial = await usarCredencialValida(usuarioId, proveedor as Parameters<typeof usarCredencialValida>[1]);
  if (credencial.ok) return credencial.clave;
  const motivos: Record<typeof credencial.motivo, string> = {
    boveda: "Esta instalación aún no admite credenciales, así que no se puede registrar nada en el proveedor.",
    "sin-credencial": `No tienes ninguna clave de ${nombreProveedor} guardada. Añádela en «Tu cuenta».`,
    invalida: `Tu clave de ${nombreProveedor} está marcada como no válida. Pruébala o sustitúyela en «Tu cuenta».`,
    ilegible: "La clave guardada no se puede leer en esta instalación. Bórrala y vuelve a guardarla en «Tu cuenta».",
  };
  throw new ErrorOmni(409, `${motivos[credencial.motivo]} No se ha enviado nada y no se te ha cobrado.`);
}

/**
 * Traduce un fallo del proveedor al mensaje de la norma de errores visibles. El registro **es gratuito**, así
 * que el cobro que se declara es siempre `sin-cobro`: no es una suposición, es lo que se midió.
 */
function falloDeRegistro(
  error: unknown,
  nombreProveedor: string,
  modelo: string,
  que: string,
  sugerencia: string,
): ErrorOmni {
  if (!(error instanceof ErrorProveedor)) return new ErrorOmni(502, `${que}. ${sugerencia}`);
  return new ErrorOmni(
    502,
    mensajeDeFalloDeProveedor(
      que,
      [
        {
          proveedor: nombreProveedor,
          modelo,
          codigo: error.codigo as CodigoPrueba,
          // Los dos endpoints de registro no cobran nada (medido el 2026-09-28): tampoco cuando fallan.
          cobro: "sin-cobro",
        },
      ],
      sugerencia,
    ),
  );
}

/**
 * Créditos que el saldo de KIE ha bajado durante un registro. Los dos endpoints de registro **no cobran** (medido
 * el 2026-09-28), pero eso es un hecho de hoy, no una garantía: se mira el saldo antes y después para que un
 * cambio de tarifa del proveedor no pase inadvertido. Es una observación de buena fe —otro trabajo del mismo
 * usuario en paralelo también mueve el saldo— y si no se puede leer el saldo queda `null`, sin frenar el registro.
 */
async function conSaldoObservado<T>(
  proveedor: string,
  clave: string,
  buscar: Herramientas["buscar"],
  llamada: () => Promise<T>,
): Promise<{ valor: T; creditosObservados: number | null }> {
  const leer = async () => (proveedor === "kie" ? await saldoCreditos(clave, buscar).catch(() => null) : null);
  const antes = await leer();
  const valor = await llamada();
  const despues = await leer();
  const creditosObservados = antes === null || despues === null ? null : Math.max(0, antes - despues);
  if (creditosObservados !== null && creditosObservados > 0) {
    console.warn(`[omni] el saldo de ${proveedor} ha bajado ${creditosObservados} créditos durante un registro`);
  }
  return { valor, creditosObservados };
}

/**
 * Registra la voz del proyecto y devuelve su `audioId`. El nombre que se le da al proveedor es el del proyecto:
 * ahí dentro solo sirve para reconocerla, y mandar algo del personaje sería mandar un dato que no hace falta.
 */
export async function registrarVozEnProveedor(
  usuarioId: string,
  datos: { voz: string; nombre: string; descripcion: string; ejemplo: string },
  h: Herramientas = HERRAMIENTAS,
): Promise<{ audioId: string; eleccion: EleccionDeTrabajo }> {
  const eleccion = await eleccionOmni();
  const { modelo, adaptador } = eleccion;
  if (!adaptador.registrarVoz) {
    throw new ErrorOmni(
      503,
      `Esta instalación no sabe registrar voces en ${modelo.nombreProveedor}, así que no puede usar el modo Omni. Elige «Voz del clip» o «Pista de voz aparte».`,
    );
  }
  const clave = await claveDe(usuarioId, modelo.proveedor, modelo.nombreProveedor);
  try {
    const registrar = adaptador.registrarVoz;
    const { valor: audioId } = await conSaldoObservado(modelo.proveedor, clave, h.buscar, () =>
      registrar({
        clave,
        voz: datos.voz,
        nombre: datos.nombre.slice(0, NOMBRE_VOZ_OMNI_MAXIMO),
        descripcion: datos.descripcion.slice(0, DESCRIPCION_VOZ_OMNI_MAXIMA),
        ejemplo: datos.ejemplo.slice(0, EJEMPLO_VOZ_OMNI_MAXIMO),
        buscar: h.buscar,
      }),
    );
    return { audioId, eleccion };
  } catch (error) {
    throw falloDeRegistro(
      error,
      modelo.nombreProveedor,
      modelo.modelo,
      "No se ha podido registrar la voz de este proyecto, así que no se ha cambiado nada",
      "Vuelve a intentarlo: registrar una voz no cuesta créditos.",
    );
  }
}

/** Retrato y, si la hay, vista de cuerpo entero que se envían al registrar. Nunca más de dos imágenes. */
export interface ImagenesDelRegistro {
  retrato: FilaMedio;
  cuerpo: FilaMedio | null;
}

/**
 * Registra al personaje en el proveedor: sube su retrato (y su cuerpo entero si lo hay) al almacenamiento
 * temporal, crea la identidad citando la voz del proyecto y devuelve lo que el proveedor guarda.
 *
 * Las imágenes se suben con la misma llamada que usa la generación (`subirReferencia`), así que la URL que ve el
 * proveedor es temporal suya y no una URL nuestra: aquí no se publica nada.
 */
export async function registrarPersonajeEnProveedor(
  usuarioId: string,
  datos: { nombre: string; descripcion: string; audioId: string; imagenes: ImagenesDelRegistro },
  h: Herramientas = HERRAMIENTAS,
): Promise<{
  remoteCharacterId: string;
  imagenUrl: string;
  imagenCuerpoUrl: string;
  creditosObservados: number | null;
}> {
  const { modelo, adaptador } = await eleccionOmni();
  if (!adaptador.registrarPersonaje) {
    throw new ErrorOmni(
      503,
      `Esta instalación no sabe registrar personajes en ${modelo.nombreProveedor}, así que no puede usar el modo Omni. Elige otro modo de voz en el proyecto.`,
    );
  }
  const clave = await claveDe(usuarioId, modelo.proveedor, modelo.nombreProveedor);
  const archivos = [datos.imagenes.retrato, ...(datos.imagenes.cuerpo ? [datos.imagenes.cuerpo] : [])];
  try {
    const urls: string[] = [];
    for (const fila of archivos) {
      urls.push(await adaptador.subirReferencia({ clave, archivo: await archivoDe(fila), buscar: h.buscar }));
    }
    const registrar = adaptador.registrarPersonaje;
    const { valor: registrado, creditosObservados } = await conSaldoObservado(modelo.proveedor, clave, h.buscar, () =>
      registrar({
        clave,
        nombre: datos.nombre,
        descripcion: datos.descripcion.slice(0, DESCRIPCION_PERSONAJE_OMNI_MAXIMA),
        imagenes: urls,
        vocesRegistradas: [datos.audioId],
        buscar: h.buscar,
      }),
    );
    return {
      remoteCharacterId: registrado.id,
      imagenUrl: registrado.imagenUrl,
      imagenCuerpoUrl: registrado.imagenCuerpoUrl,
      creditosObservados,
    };
  } catch (error) {
    throw falloDeRegistro(
      error,
      modelo.nombreProveedor,
      modelo.modelo,
      "No se ha podido registrar este personaje para escenas habladas, así que no se ha generado nada",
      "Vuelve a intentarlo: registrar un personaje no cuesta créditos.",
    );
  }
}

// ── Lo que se guarda de cada registro ────────────────────────────────────────────────────────────────────────

/** Guarda el registro con sus 0 créditos, su cuenta y su fecha. Es el historial de este camino. */
export async function guardarRegistro(datos: {
  actor: Actor;
  personaje: FilaPersonaje;
  version: FilaVersionPersonaje;
  audioId: string;
  remoteCharacterId: string;
  imagenUrl: string;
  imagenCuerpoUrl: string;
  imagenes: ImagenesDelRegistro;
  /** Lo que bajó el saldo durante el registro; `null` si no se pudo leer. Hoy debería ser 0. */
  creditosObservados?: number | null;
}): Promise<FilaRegistroOmni> {
  const [fila] = await db()
    .insert(characterOmniRegistrations)
    .values({
      characterId: datos.personaje.id,
      characterVersionId: datos.version.id,
      audioId: datos.audioId,
      remoteCharacterId: datos.remoteCharacterId,
      remoteImageUrl: datos.imagenUrl,
      remoteBodyImageUrl: datos.imagenCuerpoUrl,
      portraitMediaId: datos.imagenes.retrato.id,
      bodyMediaId: datos.imagenes.cuerpo?.id ?? null,
      // Los dos endpoints de registro son gratuitos (medido): se guarda lo que de verdad bajó el saldo, que debería
      // ser 0, para poder auditarlo si un día el proveedor empieza a cobrarlos.
      creditsSpent: datos.creditosObservados ?? 0,
      registeredBy: datos.actor.id,
    })
    .returning();
  if (!fila) throw new ErrorOmni(500, "No se ha podido guardar el registro del personaje. Vuelve a intentarlo.");
  return fila;
}

/**
 * Registro vigente de un personaje: el más reciente **de la versión que se le pasa y con la voz que se le pasa**,
 * y que no haya sido reemplazado.
 *
 * Las tres condiciones importan. Otra versión de la ficha es otra cara, otra voz es otro timbre y un registro
 * reemplazado es el que el proveedor ya ha rechazado; ninguno de los tres sirve para generar, y usarlos sería
 * pagar un clip que no es el que el proyecto pide.
 */
export async function registroVigente(
  personajeId: string,
  versionId: string,
  audioId: string,
): Promise<FilaRegistroOmni | null> {
  const [fila] = await db()
    .select()
    .from(characterOmniRegistrations)
    .where(
      and(
        eq(characterOmniRegistrations.characterId, personajeId),
        eq(characterOmniRegistrations.characterVersionId, versionId),
        eq(characterOmniRegistrations.audioId, audioId),
        isNull(characterOmniRegistrations.supersededAt),
      ),
    )
    .orderBy(desc(characterOmniRegistrations.registeredAt))
    .limit(1);
  return fila ?? null;
}

/** El último registro del personaje, valga o no: es lo que la ficha enseña para decir en qué estado está. */
export async function ultimoRegistro(personajeId: string): Promise<FilaRegistroOmni | null> {
  const [fila] = await db()
    .select()
    .from(characterOmniRegistrations)
    .where(eq(characterOmniRegistrations.characterId, personajeId))
    .orderBy(desc(characterOmniRegistrations.registeredAt))
    .limit(1);
  return fila ?? null;
}

/**
 * Marca un registro como reemplazado. Se usa cuando el proveedor rechaza su identificador por caducado: el
 * registro se conserva porque explica con qué identidad salió lo que ya se generó, y deja de ser el vigente.
 */
export async function marcarReemplazado(registroId: string, motivo: string): Promise<void> {
  await db()
    .update(characterOmniRegistrations)
    .set({ supersededAt: new Date(), supersededReason: motivo })
    .where(eq(characterOmniRegistrations.id, registroId));
}

/**
 * Imágenes que se envían al registrar: el mejor retrato del personaje y, si existe, su vista de cuerpo entero.
 *
 * El retrato sale de la **misma elección por cobertura** que usa la generación, así que es la foto que ya se
 * considera la mejor guía de identidad; no hay una segunda regla que pudiera elegir otra cara.
 */
export async function imagenesParaRegistrar(personaje: FilaPersonaje): Promise<ImagenesDelRegistro> {
  const { referencias } = await contextoParaGenerar(personaje, 7);
  const filas: FilaMedio[] = [];
  for (const id of referencias) {
    const [fila] = await db().select().from(media).where(eq(media.id, id)).limit(1);
    if (fila && fila.deletedAt === null) filas.push(fila);
  }
  const [retrato, cuerpo] = filas;
  if (!retrato) {
    throw new ErrorOmni(
      409,
      "Este personaje no tiene ninguna foto utilizable, así que no hay retrato que registrar. Añade sus fotos de referencia y vuelve a intentarlo.",
    );
  }
  return { retrato, cuerpo: cuerpo ?? null };
}
