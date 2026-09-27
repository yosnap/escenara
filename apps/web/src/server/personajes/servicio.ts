import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { esVista, type Vista } from "@/lib/captura-personaje";
import { CAMPOS_FICHA, type CampoFicha, limpiarCampoFicha } from "@/lib/ficha-personaje";
import {
  DESCRIPCION_MAXIMA,
  ESPECIE_MAXIMA,
  esTipoPersonaje,
  MAXIMO_PERSONAJES,
  MAXIMO_REFERENCIAS,
  MOTIVO_CAMBIO_MAXIMO,
  NOMBRE_MAXIMO,
  type OrigenReferencia,
  type PersonajeVista,
  type ReferenciasAnadidas,
  type TipoPersonaje,
  VISTA_MAXIMA,
} from "@/lib/personajes";
import { db } from "../db/cliente";
import { characterReferences, characters, media } from "../db/esquema";
import { trabajosQueGeneraron } from "../generacion/trabajos";
import type { Actor } from "../media/servicio";
import {
  analizarReferencias,
  descartarDuplicadosTardios,
  exigirAlgoQueGuardar,
  motivosGuardables,
} from "./analisis-referencia";
import { esUuidPersonaje, filaPropia, recalcularEstado, siguienteOrden, vistaDePersonaje } from "./consulta";
import { ErrorPersonaje } from "./errores";
import {
  asegurarVersionVigente,
  referenciasParaVersionar,
  versionarEnTransaccion,
  versionarSiCambia,
} from "./versiones";
import { vistaSinteticaDe } from "./vista-sintetica";

/**
 * Alta y edición de personajes y de sus fotos de referencia (RF02). Todo pasa por el dueño: un personaje
 * ajeno responde 404 y una foto ajena tampoco se puede referenciar, aunque se conozca su identificador.
 *
 * Las referencias se añaden desde la biblioteca del usuario (la subida la hace `server/media/servicio.ts`,
 * que ya reduce las imágenes y las guarda en WebP): aquí solo se comprueba que el medio sea suyo, sea una
 * imagen y no esté en la papelera.
 */

export interface DatosPersonaje {
  nombre: unknown;
  tipo: unknown;
  especie?: unknown;
  descripcion?: unknown;
  /** Campos de la ficha de apariencia (0.15.0). Versionan: cambiarlos crea una versión nueva. */
  rasgos?: unknown;
  estilo?: unknown;
  vestuario?: unknown;
  personalidad?: unknown;
  voz?: unknown;
  /** Por qué se cambia. Se guarda en la versión que produce el cambio; no versiona por sí mismo. */
  motivo?: unknown;
}

/** Columna de la fila del personaje que guarda cada campo de la ficha. */
const COLUMNA_FICHA: Record<CampoFicha, "traits" | "style" | "wardrobe" | "personality" | "voice"> = {
  rasgos: "traits",
  estilo: "style",
  vestuario: "wardrobe",
  personalidad: "personality",
  voz: "voice",
};

function texto(valor: unknown, maximo: number, campo: string, obligatorio = false): string {
  if (valor === undefined || valor === null) {
    if (obligatorio) throw new ErrorPersonaje(400, `Falta ${campo}.`);
    return "";
  }
  if (typeof valor !== "string") throw new ErrorPersonaje(400, `${campo} tiene que ser texto.`);
  const limpio = valor.trim().replace(/\s+/g, " ");
  if (obligatorio && limpio === "") throw new ErrorPersonaje(400, `Falta ${campo}.`);
  if (limpio.length > maximo) throw new ErrorPersonaje(400, `${campo} admite hasta ${maximo} caracteres.`);
  return limpio;
}

/** La descripción sí conserva los saltos de línea: es un texto largo, no una etiqueta. */
function textoLargo(valor: unknown, maximo: number, campo: string): string {
  if (valor === undefined || valor === null) return "";
  if (typeof valor !== "string") throw new ErrorPersonaje(400, `${campo} tiene que ser texto.`);
  const limpio = valor.trim();
  if (limpio.length > maximo) throw new ErrorPersonaje(400, `${campo} admite hasta ${maximo} caracteres.`);
  return limpio;
}

function tipoValido(valor: unknown): TipoPersonaje {
  if (!esTipoPersonaje(valor)) throw new ErrorPersonaje(400, "Elige si es una persona o un animal.");
  return valor;
}

/**
 * Nombre repetido en la misma cuenta: se rechaza con un mensaje claro, no con un error de base de datos.
 *
 * Se recorre la cadena de causas porque Drizzle envuelve el error de PostgreSQL en un `DrizzleQueryError`: el
 * código de la violación de unicidad está en la causa, no en el error de fuera.
 */
function esNombreRepetido(error: unknown): boolean {
  for (let actual: unknown = error, salto = 0; actual && salto < 5; salto++) {
    const fallo = actual as { code?: unknown; errno?: unknown; message?: unknown; cause?: unknown };
    if (fallo.code === "23505" || fallo.errno === "23505") return true;
    if (String(fallo.message ?? "").includes("characters_propietario_nombre_uq")) return true;
    actual = fallo.cause;
  }
  return false;
}

export async function crearPersonaje(actor: Actor, datos: DatosPersonaje): Promise<PersonajeVista> {
  const nombre = texto(datos.nombre, NOMBRE_MAXIMO, "el nombre del personaje", true);
  const tipo = tipoValido(datos.tipo);
  const especie = texto(datos.especie, ESPECIE_MAXIMA, "la especie o las notas");
  const descripcion = textoLargo(datos.descripcion, DESCRIPCION_MAXIMA, "la descripción");

  try {
    // El recuento y el alta van en la misma transacción con la fila del usuario bloqueada: dos altas a la vez
    // leerían las dos el mismo total y se pasarían las dos del tope.
    const fila = await db().transaction(async (tx) => {
      await tx.execute(sql`select 1 from users where id = ${actor.id} for update`);
      const [conteo] = await tx.select({ total: count() }).from(characters).where(eq(characters.ownerId, actor.id));
      if ((conteo?.total ?? 0) >= MAXIMO_PERSONAJES) {
        throw new ErrorPersonaje(409, `Has llegado al máximo de ${MAXIMO_PERSONAJES} personajes.`);
      }
      const [creada] = await tx
        .insert(characters)
        .values({ ownerId: actor.id, name: nombre, kind: tipo, speciesNotes: especie, description: descripcion })
        .returning();
      if (!creada) throw new ErrorPersonaje(500, "No se ha podido crear el personaje.");
      return creada;
    });
    // Todo personaje nace con su versión 1: los trabajos citan una versión, y sin ella la primera generación
    // tendría que inventarse cuál. Crearla aquí es gratis y deja el historial completo desde el principio.
    await asegurarVersionVigente(fila);
    return vistaDePersonaje(fila, actor, { completa: true, conReferencias: true });
  } catch (error) {
    if (esNombreRepetido(error)) throw new ErrorPersonaje(409, "Ya tienes un personaje con ese nombre.");
    throw error;
  }
}

/**
 * Cambia los datos del personaje. Los campos de **apariencia** (ficha y descripción) crean una versión nueva
 * y invalidan las aprobaciones que dependían de la anterior; los **metadatos** (nombre, notas de especie) no
 * (decisión 1 de la fase 15).
 *
 * Guardar el mismo texto otra vez no crea versión: lo decide `versionarSiCambia` comparando con la anterior,
 * no la lista de campos que llegó en la petición. Eso es lo que evita la explosión de versiones por ediciones
 * triviales y permite guardar varias veces en la misma sesión sin gastar números.
 */
export async function actualizarPersonaje(
  actor: Actor,
  id: unknown,
  cambios: Partial<DatosPersonaje>,
): Promise<PersonajeVista> {
  const fila = await filaPropia(actor, id);
  // Tipado con la fila de verdad: un nombre de columna equivocado es un error de compilación, no un `update`
  // silencioso que no cambia nada.
  const valores: Partial<typeof characters.$inferInsert> = {};
  if (cambios.nombre !== undefined)
    valores.name = texto(cambios.nombre, NOMBRE_MAXIMO, "el nombre del personaje", true);
  if (cambios.tipo !== undefined) valores.kind = tipoValido(cambios.tipo);
  if (cambios.especie !== undefined)
    valores.speciesNotes = texto(cambios.especie, ESPECIE_MAXIMA, "la especie o las notas");
  if (cambios.descripcion !== undefined) {
    valores.description = textoLargo(cambios.descripcion, DESCRIPCION_MAXIMA, "la descripción");
  }
  // Los campos de la ficha se limpian con la **misma** función que compone el contexto: lo que se guarda es
  // exactamente lo que se va a enviar al proveedor, sin parámetros ni instrucciones colados dentro.
  for (const campo of CAMPOS_FICHA) {
    const valor = cambios[campo];
    if (valor === undefined) continue;
    if (valor !== null && typeof valor !== "string") throw new ErrorPersonaje(400, `${campo} tiene que ser texto.`);
    valores[COLUMNA_FICHA[campo]] = limpiarCampoFicha(valor);
  }
  const motivo = texto(cambios.motivo, MOTIVO_CAMBIO_MAXIMO, "el motivo del cambio");
  if (Object.keys(valores).length === 0) return vistaDePersonaje(fila, actor, { completa: true, conReferencias: true });
  // Las referencias se leen antes de abrir la transacción: no las cambia esta operación, y así la transacción
  // solo contiene lo que tiene que pasar de una vez.
  const referencias = await referenciasParaVersionar(fila.id);
  try {
    // Guardar, versionar e invalidar las aprobaciones pasan **en la misma transacción**, con la fila del
    // personaje bloqueada: no puede quedar una ficha nueva sin su versión, ni una aprobación viva apuntando a
    // una apariencia que ya cambió.
    const actualizada = await db().transaction(async (tx) => {
      await tx.execute(sql`select 1 from characters where id = ${fila.id} for update`);
      const [guardada] = await tx
        .update(characters)
        .set({ ...valores, updatedAt: new Date() })
        .where(eq(characters.id, fila.id))
        .returning();
      if (!guardada) throw new ErrorPersonaje(404, "El personaje no existe.");
      await versionarEnTransaccion(tx, guardada, referencias, actor.id, motivo);
      return guardada;
    });
    return vistaDePersonaje(actualizada, actor, { completa: true, conReferencias: true });
  } catch (error) {
    if (esNombreRepetido(error)) throw new ErrorPersonaje(409, "Ya tienes un personaje con ese nombre.");
    throw error;
  }
}

export interface ReferenciaPedida {
  medioId: unknown;
  origen?: unknown;
  vista?: unknown;
  /** Vista del catálogo de cobertura (0.14.0); la valida `analisis-referencia.ts`. */
  vistaClave?: unknown;
  /** Proporción de la cara medida en el navegador, 0–1. */
  caraRelativa?: unknown;
  /** El usuario acepta añadirla aunque el control de calidad la haya marcado. */
  usarDeTodasFormas?: unknown;
}

function idsDeReferencias(peticion: unknown): ReferenciaPedida[] {
  if (!Array.isArray(peticion) || peticion.length === 0) {
    throw new ErrorPersonaje(400, "Indica qué fotos quieres añadir.");
  }
  if (peticion.length > MAXIMO_REFERENCIAS) {
    throw new ErrorPersonaje(400, `Como máximo ${MAXIMO_REFERENCIAS} fotos a la vez.`);
  }
  return peticion.map((entrada) => {
    const objeto = (
      typeof entrada === "object" && entrada !== null ? entrada : { medioId: entrada }
    ) as ReferenciaPedida;
    if (!esUuidPersonaje(objeto.medioId)) throw new ErrorPersonaje(400, "Identificador de foto no válido.");
    return objeto;
  });
}

/**
 * Añade fotos de la biblioteca del usuario como referencias del personaje. Las que ya estuvieran se
 * ignoran, así que repetir la petición no falla ni duplica nada.
 *
 * Desde 0.14.0 cada foto pasa el **control de calidad** del servidor (resolución, nitidez, luz y duplicados)
 * antes de guardarse: lo que no lo pasa no se guarda, y si el motivo no es un mínimo técnico se puede volver
 * a pedir con `usarDeTodasFormas`.
 *
 * El origen **no lo decide el navegador**: lo decide el servidor comprobando si ese medio es el resultado de
 * un trabajo de generación de esta cuenta. Si lo es, entra como `vista_generada` —aunque se haya elegido desde
 * la biblioteca como una foto más—, porque es una imagen que hizo un modelo y no una foto de nadie; si no lo
 * es, entra como `foto_original`. Sin esta comprobación, reañadir una vista generada desde la biblioteca la
 * convertiría en una foto original y subiría el recuento que sostiene el mínimo del personaje.
 */
export async function anadirReferencias(actor: Actor, id: unknown, peticion: unknown): Promise<ReferenciasAnadidas> {
  const personaje = await filaPropia(actor, id);
  const pedidas = idsDeReferencias(peticion);
  const pedidos = [...new Set(pedidas.map((p) => p.medioId as string))];

  // Lo que ya es referencia de este personaje se ignora en silencio: repetir la petición (un doble clic, un
  // reintento) no es un error del usuario y no tiene nada que medir ni que guardar.
  const yaReferencia = new Set(
    (
      await db()
        .select({ mediaId: characterReferences.mediaId })
        .from(characterReferences)
        .where(and(eq(characterReferences.characterId, personaje.id), inArray(characterReferences.mediaId, pedidos)))
    ).map((f) => f.mediaId),
  );
  const ids = pedidos.filter((medioId) => !yaReferencia.has(medioId));
  if (ids.length === 0) return obtenerActualizado(actor, personaje.id);

  // Solo fotos propias, que sean imagen y no estén en la papelera: una referencia ajena o borrada no vale.
  const propias = await db()
    .select()
    .from(media)
    .where(and(inArray(media.id, ids), eq(media.ownerId, actor.id), isNull(media.deletedAt)));
  if (propias.length !== ids.length) throw new ErrorPersonaje(404, "Alguna de las fotos no existe.");
  if (propias.some((m) => m.kind !== "imagen")) {
    throw new ErrorPersonaje(400, "Las referencias de un personaje tienen que ser imágenes.");
  }
  // Un documento de consentimiento no es una foto del personaje: enviarlo al proveedor como referencia sería
  // mandarle un documento de identidad ajeno. Lo impide el servidor, no la interfaz.
  if (propias.some((m) => m.isDocument)) {
    throw new ErrorPersonaje(
      400,
      "Un documento de consentimiento no se puede usar como foto de referencia de un personaje.",
    );
  }

  const analisis = await analizarReferencias(
    personaje.id,
    pedidas
      .filter((p) => ids.includes(p.medioId as string))
      .map((p) => ({
        medioId: p.medioId as string,
        vistaClave: p.vistaClave,
        caraRelativa: p.caraRelativa,
        usarDeTodasFormas: p.usarDeTodasFormas,
      })),
    new Map(propias.map((m) => [m.id, m])),
  );
  exigirAlgoQueGuardar(analisis);
  // La vista libre de 0.13.0 se conserva, indexada por foto para no perderla al filtrar las rechazadas.
  const vistaLibre = new Map(pedidas.map((p) => [p.medioId as string, texto(p.vista, VISTA_MAXIMA, "la vista")]));
  // Qué medios de los pedidos son resultado de un trabajo: esos entran marcados como vista generada.
  const generados = await trabajosQueGeneraron(actor.id, ids);

  let guardadas = analisis;
  await db().transaction(async (tx) => {
    // El tope va con la fila del usuario bloqueada: dos peticiones a la vez leerían el mismo total.
    await tx.execute(sql`select 1 from users where id = ${actor.id} for update`);
    // Los duplicados se vuelven a comprobar aquí, ya con el bloqueo puesto: dos peticiones a la vez midieron
    // las dos contra el mismo estado anterior y sin esto guardarían la misma foto.
    guardadas = await descartarDuplicadosTardios(personaje.id, analisis, tx);
    if (guardadas.aceptadas.length === 0) return;
    const [yaTiene] = await tx
      .select({ total: count() })
      .from(characterReferences)
      .where(eq(characterReferences.characterId, personaje.id));
    if ((yaTiene?.total ?? 0) + guardadas.aceptadas.length > MAXIMO_REFERENCIAS) {
      throw new ErrorPersonaje(409, `Un personaje admite como máximo ${MAXIMO_REFERENCIAS} fotos de referencia.`);
    }
    let orden = await siguienteOrden(personaje.id, tx);
    await tx
      .insert(characterReferences)
      .values(
        guardadas.aceptadas.map((a) => {
          const trabajo = generados.get(a.medioId);
          return {
            characterId: personaje.id,
            mediaId: a.medioId,
            // Resultado de un trabajo = imagen generada, diga lo que diga el navegador.
            origin: (trabajo ? "vista_generada" : "foto_original") as OrigenReferencia,
            declaredView: vistaLibre.get(a.medioId) ?? "",
            // Si el trabajo pidió una vista concreta, esa manda sobre lo que declare quien la añade.
            viewKey: (trabajo ? vistaSinteticaDe(trabajo) : null) ?? a.vistaClave ?? "",
            width: a.metricas.ancho,
            height: a.metricas.alto,
            sharpness: a.metricas.nitidez,
            brightness: a.metricas.luminosidad,
            faceRatio: a.metricas.caraRelativa,
            phash: a.huella,
            rejectionReason: motivosGuardables(a.motivosMarcada),
            sortOrder: orden++,
          };
        }),
      )
      .onConflictDoNothing();
    await recalcularEstado(personaje.id, tx);
  });
  const vista = await obtenerActualizado(actor, personaje.id, "Se añadieron fotos de referencia.");
  // Las que se han quedado fuera se dicen: un 200 con una foto menos y sin explicación es un fallo silencioso.
  return guardadas.rechazadas.length > 0 ? { ...vista, rechazos: guardadas.rechazadas } : vista;
}

/** Quita referencias del personaje. Las fotos siguen en la biblioteca: lo que se borra es la relación. */
export async function quitarReferencias(actor: Actor, id: unknown, ids: unknown): Promise<PersonajeVista> {
  const personaje = await filaPropia(actor, id);
  if (!Array.isArray(ids) || ids.length === 0) throw new ErrorPersonaje(400, "Indica qué referencias quitar.");
  const validos = ids.filter(esUuidPersonaje);
  if (validos.length !== ids.length) throw new ErrorPersonaje(400, "Identificador de referencia no válido.");
  await db()
    .delete(characterReferences)
    .where(and(eq(characterReferences.characterId, personaje.id), inArray(characterReferences.id, validos)));
  await recalcularEstado(personaje.id);
  return obtenerActualizado(actor, personaje.id, "Se quitaron fotos de referencia.");
}

/** Una referencia y la vista que le asigna el usuario; `null` la deja sin clasificar. */
export interface VistaPedida {
  id: string;
  vistaClave: Vista | null;
}

/**
 * Valida la lista de `{ id, vistaClave }` que llega del navegador. Una clave que no está en el catálogo se
 * rechaza aquí: la cobertura cuenta por esa clave, así que un valor inventado sería una vista que nunca se
 * cubre y que nadie puede quitar.
 */
function vistasPedidas(peticion: unknown): VistaPedida[] {
  if (!Array.isArray(peticion) || peticion.length === 0) {
    throw new ErrorPersonaje(400, "Indica qué vista es cada foto.");
  }
  if (peticion.length > MAXIMO_REFERENCIAS) {
    throw new ErrorPersonaje(400, `Como máximo ${MAXIMO_REFERENCIAS} fotos a la vez.`);
  }
  const pedidas = peticion.map((entrada) => {
    const objeto = (typeof entrada === "object" && entrada !== null ? entrada : {}) as Record<string, unknown>;
    if (!esUuidPersonaje(objeto.id)) throw new ErrorPersonaje(400, "Identificador de referencia no válido.");
    const clave = objeto.vistaClave;
    if (clave !== null && clave !== undefined && !esVista(clave)) {
      throw new ErrorPersonaje(400, "Esa vista no existe.");
    }
    return { id: objeto.id, vistaClave: esVista(clave) ? clave : null };
  });
  if (new Set(pedidas.map((p) => p.id)).size !== pedidas.length) {
    throw new ErrorPersonaje(400, "Cada foto solo puede llevar una vista.");
  }
  return pedidas;
}

/**
 * Asigna, cambia o quita la vista de referencias que **ya existen** en el personaje. Sin esto, una foto subida
 * desde la biblioteca se quedaba «sin clasificar» para siempre: no cubría ninguna vista y volver a añadirla por
 * la captura guiada la rechazaba por duplicada, así que la cobertura pedía fotos que el usuario ya tenía.
 *
 * Una **vista generada que ya trae su vista no se toca**: la pidió su trabajo y la escribió el servidor, así que
 * cambiarla convertiría el encuadre que se generó en otro distinto sin que nada lo respalde. En cambio una
 * imagen generada **sin vista** sí se puede clasificar: es lo que pasa al añadir desde la biblioteca el
 * resultado de un trabajo que no era «generar una vista» (uno de «Crear», por ejemplo). Antes no había salida
 * —la cobertura la contaba como sin clasificar, aquí se rechazaba y la interfaz no le ofrecía selector—, y la
 * única forma de salir del callejón era borrarla. Siga clasificada o no, **sigue siendo una vista generada**: no
 * cuenta como foto original ni cubre la vista.
 *
 * Versiona igual que añadir, quitar o reordenar: la elección de qué fotos se envían al proveedor se hace por
 * cobertura de vistas, así que cambiar una vista cambia lo que se envía. Si la vista es la que ya tenía, no se
 * escribe nada y no se gasta un número de versión.
 */
export async function asignarVistasDeReferencias(
  actor: Actor,
  id: unknown,
  peticion: unknown,
): Promise<PersonajeVista> {
  const personaje = await filaPropia(actor, id);
  const pedidas = vistasPedidas(peticion);
  const suyas = new Map(
    (
      await db()
        .select({
          id: characterReferences.id,
          origen: characterReferences.origin,
          viewKey: characterReferences.viewKey,
        })
        .from(characterReferences)
        .where(
          and(
            eq(characterReferences.characterId, personaje.id),
            inArray(
              characterReferences.id,
              pedidas.map((p) => p.id),
            ),
          ),
        )
    ).map((f) => [f.id, f]),
  );
  // Una referencia de otro personaje (o que ya no existe) no se distingue de una inexistente: 404, como todo
  // lo ajeno en personajes.
  if (suyas.size !== pedidas.length) throw new ErrorPersonaje(404, "Alguna de las fotos no es de este personaje.");
  if (
    pedidas.some((p) => {
      const fila = suyas.get(p.id);
      return fila?.origen === "vista_generada" && (fila.viewKey ?? "") !== "";
    })
  ) {
    throw new ErrorPersonaje(
      400,
      "Esa vista generada lleva la vista con la que se pidió: no se puede cambiar. Quítala si no te sirve.",
    );
  }

  const cambios = pedidas.filter((p) => (suyas.get(p.id)?.viewKey ?? "") !== (p.vistaClave ?? ""));
  if (cambios.length === 0) return obtenerActualizado(actor, personaje.id);
  await db().transaction(async (tx) => {
    for (const cambio of cambios) {
      await tx
        .update(characterReferences)
        .set({ viewKey: cambio.vistaClave ?? "" })
        .where(and(eq(characterReferences.characterId, personaje.id), eq(characterReferences.id, cambio.id)));
    }
  });
  // El estado del personaje no depende de la vista (depende del número de fotos originales y del
  // consentimiento), pero se recalcula igual que en las demás operaciones: es el servidor quien lo dice.
  await recalcularEstado(personaje.id);
  return obtenerActualizado(
    actor,
    personaje.id,
    cambios.length === 1
      ? "Se cambió la vista de una foto de referencia."
      : `Se cambió la vista de ${cambios.length} fotos de referencia.`,
  );
}

/** Cambia el orden de las referencias: la primera es la portada y la primera que se envía al proveedor. */
export async function ordenarReferencias(actor: Actor, id: unknown, ids: unknown): Promise<PersonajeVista> {
  const personaje = await filaPropia(actor, id);
  if (!Array.isArray(ids) || ids.length === 0) throw new ErrorPersonaje(400, "Indica el orden de las referencias.");
  const validos = ids.filter(esUuidPersonaje);
  if (validos.length !== ids.length || new Set(validos).size !== validos.length) {
    throw new ErrorPersonaje(400, "Orden de referencias no válido.");
  }
  await db().transaction(async (tx) => {
    // El orden tiene que traer **todas** las referencias del personaje y ninguna ajena. Con un orden parcial,
    // las que faltaran conservarían su posición anterior y dos referencias acabarían compartiendo sitio: la
    // portada (y la primera foto que se envía al proveedor) pasaría a depender del desempate de la consulta.
    const actuales = await tx
      .select({ id: characterReferences.id })
      .from(characterReferences)
      .where(eq(characterReferences.characterId, personaje.id));
    const suyas = new Set(actuales.map((r) => r.id));
    if (validos.length !== suyas.size || !validos.every((referenciaId) => suyas.has(referenciaId))) {
      throw new ErrorPersonaje(
        400,
        "El orden tiene que incluir todas las referencias del personaje, una sola vez. Recarga la página y vuelve a intentarlo.",
      );
    }
    for (const [posicion, referenciaId] of validos.entries()) {
      await tx
        .update(characterReferences)
        .set({ sortOrder: posicion })
        .where(and(eq(characterReferences.characterId, personaje.id), eq(characterReferences.id, referenciaId)));
    }
  });
  return obtenerActualizado(actor, personaje.id, "Se cambió el orden de las fotos de referencia.");
}

/**
 * Relee la fila y devuelve la ficha completa: el estado puede haber cambiado con la operación.
 *
 * Con `motivo` se versiona antes de leer: cambiar las referencias (añadir, quitar o reordenar) cambia lo que
 * se le envía al proveedor, así que es un cambio de apariencia y crea versión, igual que editar la ficha. Si
 * la lista acaba siendo la misma que la de la versión vigente, no se crea nada.
 */
async function obtenerActualizado(actor: Actor, id: string, motivo?: string): Promise<PersonajeVista> {
  const [fila] = await db().select().from(characters).where(eq(characters.id, id)).limit(1);
  if (!fila) throw new ErrorPersonaje(404, "El personaje no existe.");
  if (motivo !== undefined && fila.ownerId === actor.id) await versionarSiCambia(fila, actor.id, motivo);
  return vistaDePersonaje(fila, actor, { completa: true, conReferencias: fila.ownerId === actor.id });
}

export { obtenerActualizado as fichaDePersonaje };
