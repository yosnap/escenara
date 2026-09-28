import { count, eq } from "drizzle-orm";
import { ETIQUETA_VISTA, esVista, promptDeVista, type Vista, vistasPorGenerar } from "@/lib/captura-personaje";
import type { TrabajoVista } from "@/lib/generacion";
import { MAXIMO_REFERENCIAS, type TipoPersonaje } from "@/lib/personajes";
import { leerObjeto } from "../almacenamiento";
import { filaDeLaConfirmacion } from "../cola/encolar";
import { db } from "../db/cliente";
import { characterReferences, characters, type FilaTrabajo, media } from "../db/esquema";
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import { crearFotograma } from "../generacion/servicio";
import { vistaDeFila } from "../generacion/trabajos";
import type { Actor } from "../media/servicio";
import { type AnalisisImagen, analizarImagen } from "./calidad";
import { coberturaDe, filaPropia, siguienteOrden } from "./consulta";
import { ErrorPersonaje } from "./errores";
import { versionarSiCambia } from "./versiones";

/**
 * Vistas sintéticas (decisión 3 de la fase 14): cuando a un personaje le falta una vista de la cobertura, se
 * puede **generar** con sus propias fotos. No es un camino aparte del dinero ni del consentimiento:
 *
 * - se encola como un fotograma normal (`generacion/servicio.ts`), así que pasa por las mismas puertas que
 *   «Crear» —consentimiento vigente, revisión de referencias, clave del usuario, reserva de presupuesto,
 *   confirmación del coste y tope de trabajos simultáneos—;
 * - la indicación la escribe **el servidor** a partir de la vista, para que no sea un hueco por el que colar
 *   cualquier texto junto a las fotos de una persona;
 * - solo se ofrece para una vista que **falta**: generar la quinta versión de algo que ya se tiene sería
 *   gastar créditos por gusto;
 * - el resultado nace marcado `vista_generada`, hereda el `character_id` del trabajo y **nunca** cuenta para
 *   el mínimo de fotos originales.
 */

export interface PeticionVistaSintetica {
  /** Vista que falta y que se quiere rellenar. */
  vista: unknown;
  /** Créditos que el usuario tenía delante al confirmar. */
  creditosConfirmados: unknown;
  derechos: unknown;
  /** Revisión de referencias (ADR-0009): en las fotos no aparece ningún tercero ni ningún menor. */
  sinTerceros: unknown;
  avisoUmbralAceptado?: unknown;
  claveIdempotencia: unknown;
  modelo?: unknown;
  selloEstimacion?: unknown;
  /** Claves de los avisos salvables que el usuario ha confirmado expresamente en «Antes de generar». */
  avisosConfirmados?: unknown;
}

/**
 * La vista tiene que ser del catálogo del personaje y **no tener ya una vista generada**. Hasta la 0.20.2
 * además tenía que faltar; desde el 2026-09-28 se puede generar también una vista que ya tiene fotos. Lo segundo y lo tercero son la misma promesa dicha en el docstring de arriba y en la guía
 * de usuario —«solo se ofrece una vez»—, y sin la tercera comprobación se podían encadenar vistas generadas de
 * la misma vista, gastando créditos cada vez, porque una generada no cubre la vista y `faltan` seguía
 * incluyéndola.
 *
 * La cobertura se lee con `coberturaDe`, que excluye la papelera: es **exactamente** la que ve el usuario en su
 * ficha, así que no puede pasar que la interfaz ofrezca una vista que el servidor rechaza (ni al contrario).
 */
async function vistaQueFalta(personajeId: string, tipo: TipoPersonaje, valor: unknown): Promise<Vista> {
  if (!esVista(valor)) throw new ErrorPersonaje(400, "Esa vista no existe.");
  const cobertura = await coberturaDe(personajeId, tipo);
  const estado = cobertura.vistas.find((v) => v.vista === valor);
  if (!estado) {
    throw new ErrorPersonaje(400, `«${ETIQUETA_VISTA[valor]}» no es una de las vistas que necesita este personaje.`);
  }
  // Una vista que ya tiene foto **sí** se puede generar (decisión del propietario, 2026-09-28): una foto de perfil
  // de cuerpo entero no siempre sirve como perfil de cara, y con buenas fotos se puede sacar una mejor. Lo que
  // no se encadena es la generada: una por vista, y para otra se quita la anterior.
  if (estado.generadas > 0) {
    throw new ErrorPersonaje(
      409,
      `Ya hay una vista generada de «${ETIQUETA_VISTA[valor].toLowerCase()}», así que no hace falta gastar créditos en otra. Quítala si no te sirve, o haz la foto de verdad: guía mucho mejor.`,
    );
  }
  return valor;
}

/**
 * Encola la generación de una vista que falta. Devuelve el trabajo tal como lo ve el navegador: se sigue con
 * el mismo seguimiento que cualquier otro, y la referencia aparece en la ficha cuando el trabajo termina.
 */
export async function pedirVistaSintetica(
  actor: Actor,
  id: unknown,
  peticion: PeticionVistaSintetica,
  /** Lo que se necesita de fuera (saldo del proveedor). Se inyecta para que los tests no llamen a KIE. */
  h: Herramientas = HERRAMIENTAS,
): Promise<{ trabajo: TrabajoVista; nueva: boolean; vista: Vista }> {
  const personaje = await filaPropia(actor, id);

  // La idempotencia va **primero**: si esta misma confirmación ya se encoló, se devuelve su trabajo tal cual.
  // Si no, un reintento de algo que ya terminó chocaría con «esa vista ya la tienes» (409) y el usuario vería
  // un error por una petición que en realidad salió bien.
  const clave = peticion.claveIdempotencia;
  if (typeof clave === "string" && clave !== "") {
    const repetida = await filaDeLaConfirmacion(actor.id, clave);
    if (repetida) {
      const vistaPedida = vistaSinteticaDe(repetida);
      if (repetida.characterId === personaje.id && vistaPedida) {
        return { trabajo: await vistaDeFila(repetida), nueva: false, vista: vistaPedida };
      }
    }
  }

  const vista = await vistaQueFalta(personaje.id, personaje.kind, peticion.vista);

  // El tope de referencias se comprueba antes de gastar: generar una vista que no va a poder guardarse sería
  // pagar por nada.
  const [yaTiene] = await db()
    .select({ total: count() })
    .from(characterReferences)
    .where(eq(characterReferences.characterId, personaje.id));
  if ((yaTiene?.total ?? 0) >= MAXIMO_REFERENCIAS) {
    throw new ErrorPersonaje(
      409,
      `Este personaje ya tiene el máximo de ${MAXIMO_REFERENCIAS} fotos, así que la vista generada no se podría guardar. Quita alguna antes de generarla.`,
    );
  }

  const envio = await crearFotograma(
    actor,
    {
      prompt: promptDeVista(vista, personaje.kind),
      creditosConfirmados: peticion.creditosConfirmados as number,
      derechos: peticion.derechos === true,
      avisoUmbralAceptado: peticion.avisoUmbralAceptado === true,
      claveIdempotencia: peticion.claveIdempotencia as string,
      modelo: peticion.modelo as string | undefined,
      selloEstimacion: peticion.selloEstimacion as string | undefined,
      avisosConfirmados: Array.isArray(peticion.avisosConfirmados)
        ? peticion.avisosConfirmados.filter((a): a is string => typeof a === "string")
        : [],
      personajeId: personaje.id,
      sinTerceros: peticion.sinTerceros === true,
      vistaSintetica: vista,
    },
    h,
  );
  return { ...envio, vista };
}

/** Una vista que no se ha podido encargar, con el motivo por el que no. No se ha cobrado. */
export interface VistaNoEncolada {
  vista: Vista;
  etiqueta: string;
  motivo: string;
}

export interface VistasEncargadas {
  trabajos: TrabajoVista[];
  /** Vistas que sí se han encargado, en el orden en que se encolaron. */
  encoladas: Vista[];
  /** Las que no, con su motivo. Ninguna de estas se ha cobrado. */
  sinEncolar: VistaNoEncolada[];
}

/**
 * Encarga **de una vez todas las vistas que faltan** (0.22.1). No es un camino nuevo: cada vista pasa por
 * `pedirVistaSintetica`, así que cada una lleva su reserva, su confirmación de coste, su clave de idempotencia
 * y sus controles previos. Lo único que se hace aquí es recorrerlas.
 *
 * Qué falta lo decide el servidor con la **misma** función que usa la pantalla para enseñar el coste total
 * (`vistasPorGenerar`), así que el número de vistas que se confirma es el que se encarga.
 *
 * Si alguna no se puede encolar, **se dice cuál y por qué** y las demás siguen: parar todo porque la cuarta
 * chocó con el tope de trabajos simultáneos dejaría al usuario sin las tres que sí cabían. Ninguna de las que
 * no salen se cobra.
 */
export async function pedirVistasQueFaltan(
  actor: Actor,
  id: unknown,
  peticion: Omit<PeticionVistaSintetica, "vista">,
  h: Herramientas = HERRAMIENTAS,
): Promise<VistasEncargadas> {
  const personaje = await filaPropia(actor, id);
  const faltan = vistasPorGenerar(await coberturaDe(personaje.id, personaje.kind));
  if (faltan.length === 0) {
    throw new ErrorPersonaje(409, "Este personaje ya tiene todas sus vistas: no hay ninguna que generar.");
  }
  const clave = typeof peticion.claveIdempotencia === "string" ? peticion.claveIdempotencia : "";
  if (clave === "") throw new ErrorPersonaje(400, "Falta la confirmación de este encargo. Vuelve a intentarlo.");

  const encargadas: VistasEncargadas = { trabajos: [], encoladas: [], sinEncolar: [] };
  for (const vista of faltan) {
    try {
      // Cada vista lleva **su propia** clave derivada de la confirmación: repetir el encargo entero devuelve
      // los mismos trabajos en lugar de encolar (y pagar) una segunda tanda.
      const envio = await pedirVistaSintetica(
        actor,
        personaje.id,
        { ...peticion, vista, claveIdempotencia: `${clave}:${vista}` },
        h,
      );
      encargadas.trabajos.push(envio.trabajo);
      encargadas.encoladas.push(vista);
    } catch (error) {
      encargadas.sinEncolar.push({
        vista,
        etiqueta: ETIQUETA_VISTA[vista],
        motivo: error instanceof Error && error.message !== "" ? error.message : "No se ha podido encolar.",
      });
    }
  }
  // Si no ha salido ni una, esto no es un encargo a medias: es un fallo, y se responde como tal con su motivo.
  if (encargadas.encoladas.length === 0) {
    const primera = encargadas.sinEncolar[0];
    throw new ErrorPersonaje(
      409,
      `No se ha encargado ninguna vista y no se te ha cobrado nada. ${primera?.motivo ?? ""}`.trim(),
    );
  }
  return encargadas;
}

/**
 * Medidas y huella de un medio ya guardado. Devuelve `null` si no se puede leer: una vista generada sin medidas
 * se guarda igual, porque perder la referencia por no poder medirla sería peor.
 */
export async function medidasDelMedio(medioId: string): Promise<AnalisisImagen | null> {
  const [fila] = await db().select().from(media).where(eq(media.id, medioId)).limit(1);
  if (!fila) return null;
  try {
    return await analizarImagen(new Uint8Array(await leerObjeto(fila.storageKey).arrayBuffer()));
  } catch {
    return null;
  }
}

/** Vista que pidió el trabajo, leída de su entrada guardada; `null` si no era una vista sintética. */
export function vistaSinteticaDe(fila: FilaTrabajo): Vista | null {
  const marca = (fila.input as { vistaSintetica?: unknown }).vistaSintetica;
  return esVista(marca) ? marca : null;
}

/**
 * Guarda el resultado de un trabajo de vista sintética como referencia **etiquetada** del personaje. Se llama
 * al cerrar el trabajo, una sola vez: la restricción de unicidad `(character_id, media_id)` hace el resto.
 *
 * Nunca lanza hacia fuera: si esto falla, el trabajo ya está pagado y guardado en la biblioteca, y perder el
 * cierre del trabajo por no poder escribir una relación sería mucho peor. Queda en el registro y el usuario
 * puede añadir la foto a mano desde la biblioteca.
 */
export async function adjuntarVistaGenerada(fila: FilaTrabajo, medioId: string): Promise<void> {
  const vista = vistaSinteticaDe(fila);
  if (!vista || !fila.characterId) return;
  try {
    const [yaTiene] = await db()
      .select({ total: count() })
      .from(characterReferences)
      .where(eq(characterReferences.characterId, fila.characterId));
    if ((yaTiene?.total ?? 0) >= MAXIMO_REFERENCIAS) {
      console.warn(`[personajes] vista generada sin adjuntar (tope de referencias) en el trabajo ${fila.id}`);
      return;
    }
    // Se mide igual que una foto, aunque no se rechace nada: sin huella, la misma vista generada dos veces no
    // se detectaría como repetida, y sin medidas la ficha no podría decir con qué se guardó.
    const analisis = await medidasDelMedio(medioId);
    await db()
      .insert(characterReferences)
      .values({
        characterId: fila.characterId,
        mediaId: medioId,
        origin: "vista_generada",
        viewKey: vista,
        declaredView: ETIQUETA_VISTA[vista],
        width: analisis?.metricas.ancho ?? null,
        height: analisis?.metricas.alto ?? null,
        sharpness: analisis?.metricas.nitidez ?? null,
        brightness: analisis?.metricas.luminosidad ?? null,
        phash: analisis?.huella ?? null,
        sortOrder: await siguienteOrden(fila.characterId),
      })
      .onConflictDoNothing();
    // Una referencia más cambia lo que se le envía al proveedor, así que crea versión igual que añadirla a
    // mano (0.15.0). Lo hace el worker, sin sesión: la versión se atribuye al dueño del personaje.
    const [personaje] = await db().select().from(characters).where(eq(characters.id, fila.characterId)).limit(1);
    if (personaje) {
      await versionarSiCambia(personaje, personaje.ownerId, `Se añadió la vista generada «${ETIQUETA_VISTA[vista]}».`);
    }
  } catch (error) {
    console.error(
      `[personajes] no se ha podido adjuntar la vista generada del trabajo ${fila.id}: ${(error as Error).name}`,
    );
  }
}
