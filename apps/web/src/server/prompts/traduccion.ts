import { createHash } from "node:crypto";
import { and, eq, inArray, like, lt, sql } from "drizzle-orm";
import { INSTRUCCIONES_TRADUCCION, leerTraducciones, peticionDeTraduccion } from "@/lib/asistente";
import { esProveedor } from "@/lib/boveda";
import { leerAjustes } from "../ajustes";
import { cerrarGastoDeEjecucion, reservarEjecucion } from "../asistente/gasto";
import { eleccionDeTexto } from "../asistente/texto";
import { db, type Ejecutor } from "../db/cliente";
import { assistantRuns, translationCache } from "../db/esquema";
import { exigirCredencial } from "../generacion/comprobaciones";
import { ErrorGeneracion } from "../generacion/errores";
import type { Buscador } from "../proveedores/codigos";
import { ErrorCatalogo, ErrorProveedor } from "../proveedores/contrato";

/**
 * Traducción al inglés de lo que el usuario escribe en español, **en el servidor y antes de componer el prompt**
 * (decisión firme del propietario, 2026-09-27: los prompts que se envían a los modelos de imagen y vídeo van
 * siempre en inglés).
 *
 * Qué se traduce: la escena («lo que se ve»), los campos de la ficha del personaje y su descripción, y el texto
 * del guion. **El diálogo hablado no se traduce nunca**: es lo que dirá el personaje y tiene que salir en el
 * idioma en que se escribió.
 *
 * Es una **llamada de pago**, así que recorre el mismo control de dinero que todo lo demás:
 *
 * - **se cachea por huella del texto de origen** (`translation_cache`), por usuario: lo mismo no se paga dos
 *   veces. La caché es la dedupe de verdad; la clave de idempotencia de la ejecución serializa además dos
 *   peticiones simultáneas del mismo texto, para que solo una llame al proveedor;
 * - **reserva antes de llamar**, con su tope y su presupuesto, y cierra con los créditos que informa el
 *   proveedor (`assistant_runs` con `kind = 'traduccion'`);
 * - **lista blanca de rechazos**: solo se apunta «no ha costado nada» cuando el código prueba que el proveedor
 *   rechazó la petición sin ejecutarla; si no se sabe, se conserva la estimación como consumo;
 * - **ninguna ruta de lectura la dispara**: solo se llama desde el alta de un trabajo, que ya es un POST con
 *   confirmación, `Origin` y límite de ritmo;
 * - **si falla, no se envía la generación.** Enviar el texto en español cuando la instalación ha decidido que va
 *   en inglés sería pagar por un resultado peor sin decirlo.
 *
 * Mientras el modelo de texto esté `descubierto` en el catálogo, el ajuste `traducirPrompts` viene **apagado** y
 * se envía el texto original, como hasta la 0.16.x.
 */

/** Huella del texto de origen, ya normalizado. No permite reconstruirlo. */
export function huellaDeTexto(texto: string): string {
  return createHash("sha256").update(texto.trim().replace(/\s+/g, " ").toLowerCase(), "utf8").digest("hex");
}

export interface EstadoTraduccion {
  /** `true` si esta instalación traduce al inglés antes de componer el prompt. */
  activa: boolean;
  /** Créditos que cuesta una traducción, o 0 si no está activa. */
  creditos: number;
  /** Fecha (AAAA-MM-DD) del precio con el que se calculó; vacía si no está activa. */
  comprobado: string;
  sello: string;
  nombreModelo: string;
}

export const TRADUCCION_APAGADA: EstadoTraduccion = {
  activa: false,
  creditos: 0,
  comprobado: "",
  sello: "",
  nombreModelo: "",
};

/**
 * Estado de la traducción para la estimación: si está activa y cuánto costaría. Es una **lectura**: no llama a
 * ningún proveedor ni reserva nada.
 */
/**
 * Créditos que hay que confirmar antes de generar: los del modelo **más los de la traducción**, si esta
 * instalación traduce los prompts al inglés (decisión provisional del propietario, 2026-09-27).
 *
 * Es un **máximo**: un texto que ya se tradujo antes no se vuelve a pagar, pero lo que se confirma no puede
 * depender de si hay caché o no, porque entonces la cifra cambiaría entre la pantalla y el botón. Y es la
 * misma cifra que miden los topes del motor de controles: el usuario paga las dos llamadas como un solo envío.
 */
export async function creditosDelEnvio(creditosDelModelo: number): Promise<number> {
  const traduccion = await estadoDeTraduccion();
  return creditosDelModelo + (traduccion.activa ? traduccion.creditos : 0);
}

export async function estadoDeTraduccion(): Promise<EstadoTraduccion> {
  const ajustes = await leerAjustes();
  if (!ajustes.traducirPrompts) return TRADUCCION_APAGADA;
  try {
    const { modelo, precio } = await eleccionDeTexto();
    return {
      activa: true,
      creditos: Math.ceil(precio.creditos),
      comprobado: precio.comprobado,
      sello: precio.sello,
      nombreModelo: modelo.nombre,
    };
  } catch (error) {
    // Traducción encendida sin modelo utilizable: se dice en la estimación en lugar de sorprender al confirmar.
    if (error instanceof ErrorCatalogo) return TRADUCCION_APAGADA;
    throw error;
  }
}

const MENSAJE_FALLO =
  "No se ha podido traducir tu texto al inglés, así que no se ha enviado nada a generar y no se te ha cobrado la generación. Vuelve a intentarlo en un momento.";

/**
 * Traduce los textos que hagan falta y devuelve, para cada original, su versión en inglés. Los textos vacíos y
 * los que ya están en la caché no cuestan nada.
 *
 * Con la traducción apagada devuelve los textos **tal cual**: es el camino de la 0.16.x y el que funciona en una
 * instalación recién migrada, donde el modelo de texto todavía es `descubierto`.
 */
export interface TextoATraducir {
  texto: string;
  /**
   * Personaje del que sale el texto (su ficha o su descripción); `null` en la escena y el guion. Con él, la
   * traducción **se borra al borrar el personaje**: su ficha lo describe a él (decisión provisional del
   * propietario, 2026-09-27).
   */
  personajeId?: string | null;
}

export async function traducirAlIngles(
  usuarioId: string,
  entradas: readonly TextoATraducir[],
  buscar: Buscador = fetch,
): Promise<Map<string, string>> {
  const resultado = new Map<string, string>();
  for (const { texto } of entradas) resultado.set(texto, texto);
  // Se deduplica por texto y se queda con el personaje que lo acompañe, si alguno lo trae.
  const utiles = new Map<string, string | null>();
  for (const { texto, personajeId } of entradas) {
    if (texto.trim() === "") continue;
    utiles.set(texto, personajeId ?? utiles.get(texto) ?? null);
  }
  const estado = await estadoDeTraduccion();
  if (!estado.activa || utiles.size === 0) return resultado;

  const huellas = new Map([...utiles.keys()].map((t) => [huellaDeTexto(t), t]));
  // Solo las huellas que hacen falta: leer la caché entera del usuario crece con cada texto que haya traducido.
  const guardadas = await db()
    .select({ huella: translationCache.sourceHash, target: translationCache.target })
    .from(translationCache)
    .where(and(eq(translationCache.userId, usuarioId), inArray(translationCache.sourceHash, [...huellas.keys()])));
  const porHuella = new Map(guardadas.map((f) => [f.huella, f.target]));
  const pendientes: TextoATraducir[] = [];
  for (const [huella, texto] of huellas) {
    const guardada = porHuella.get(huella);
    if (guardada === undefined) pendientes.push({ texto, personajeId: utiles.get(texto) ?? null });
    else resultado.set(texto, guardada);
  }
  if (porHuella.size > 0) await marcarUsadas(usuarioId, [...porHuella.keys()]);
  if (pendientes.length === 0) return resultado;

  const traducidas = await pedirTraduccion(usuarioId, pendientes, buscar);
  for (const [texto, ingles] of traducidas) resultado.set(texto, ingles);
  return resultado;
}

/** Marca las traducciones que se acaban de usar: es lo que decide qué purga el barrido por antigüedad. */
async function marcarUsadas(usuarioId: string, hashes: string[]): Promise<void> {
  await db()
    .update(translationCache)
    .set({ usedAt: new Date() })
    .where(and(eq(translationCache.userId, usuarioId), inArray(translationCache.sourceHash, hashes)));
}

/**
 * Borra las traducciones que no se usan desde hace más de lo configurado. La caché existe para no pagar dos veces
 * lo mismo, no para guardar el texto de alguien para siempre: con el ajuste a 0 no se guarda nada entre pasadas.
 *
 * Lo llama el worker en cada pasada, como el resto de los barridos.
 */
export async function purgarTraduccionesViejas(): Promise<number> {
  const { traduccionDiasCache } = await leerAjustes();
  const corte = new Date(Date.now() - traduccionDiasCache * 24 * 60 * 60 * 1000);
  const borradas = await db()
    .delete(translationCache)
    .where(lt(translationCache.usedAt, corte))
    .returning({ id: translationCache.id });
  return borradas.length;
}

/** Borra las traducciones de la ficha de un personaje. Lo llama su borrado, dentro de su transacción. */
export async function borrarTraduccionesDePersonaje(ejecutor: Ejecutor, personajeId: string): Promise<void> {
  await ejecutor.delete(translationCache).where(eq(translationCache.characterId, personajeId));
}

/** Llama al modelo con los textos que faltan, apuntando su gasto, y guarda el resultado en la caché. */
async function pedirTraduccion(
  usuarioId: string,
  pendientes: TextoATraducir[],
  buscar: Buscador,
): Promise<Map<string, string>> {
  const { modelo, adaptador, precio } = await eleccionConTexto();
  const generarTexto = adaptador.generarTexto;
  if (!generarTexto) throw new ErrorGeneracion(503, MENSAJE_FALLO);
  if (!esProveedor(modelo.proveedor)) throw new ErrorGeneracion(503, MENSAJE_FALLO);
  const proveedor = modelo.proveedor;
  const clave = await exigirCredencial(usuarioId, proveedor);
  const creditos = Math.ceil(precio.creditos);

  const { ejecucion, nueva } = await reservarEjecucion({
    usuarioId,
    proyectoId: null,
    kind: "traduccion",
    proveedor,
    modelo: modelo.modelo,
    claveIdempotencia: await claveDeTraduccion(usuarioId, pendientes),
    creditos,
    sello: precio.sello,
  });
  if (!nueva) {
    // Otra petición del mismo texto llegó primero. No se llama otra vez —sería pagar dos veces lo mismo—, pero sí
    // se vuelve a mirar la caché: si la otra ya terminó, están todas y esto puede seguir sin gastar nada.
    const yaTraducidas = await deLaCache(usuarioId, pendientes);
    if (yaTraducidas.size === pendientes.length) return yaTraducidas;
    // Y si no están, no se afirma nada sobre el cobro: no se sabe si la otra llamada ha terminado, ha fallado o
    // sigue en curso, y lo único seguro es que aquí no se ha enviado nada a generar.
    throw new ErrorGeneracion(
      409,
      "Tu texto se está traduciendo en otra petición que acabas de hacer. No se ha enviado nada a generar: espera unos segundos y vuelve a intentarlo.",
    );
  }

  let respuesta: { texto: string; creditos: number | null };
  try {
    respuesta = await generarTexto({
      clave,
      modelo: modelo.modelo,
      instrucciones: INSTRUCCIONES_TRADUCCION,
      entrada: peticionDeTraduccion(pendientes.map((p) => p.texto)),
      buscar,
    });
  } catch (error) {
    if (!(error instanceof ErrorProveedor)) {
      await cerrarGastoDeEjecucion(ejecucion.id, 0, "La llamada no salió de Escenara.", "fallido", 0, "Error interno.");
      throw error;
    }
    // Lista blanca: solo se apunta «no ha costado nada» cuando el código **prueba** que no hubo tarea.
    await cerrarGastoDeEjecucion(
      ejecucion.id,
      error.rechazoProbado ? 0 : null,
      error.rechazoProbado
        ? "El proveedor rechazó la traducción sin ejecutarla."
        : "El proveedor no confirmó la traducción.",
      "fallido",
      0,
      error.message,
    );
    throw new ErrorGeneracion(502, MENSAJE_FALLO);
  }

  const traducidas = leerTraducciones(
    respuesta.texto,
    pendientes.map((p) => p.texto),
  );
  if (traducidas.size !== pendientes.length) {
    await cerrarGastoDeEjecucion(
      ejecucion.id,
      respuesta.creditos,
      "La respuesta del modelo no se pudo usar como traducción.",
      "fallido",
      0,
      "Traducción ilegible.",
    );
    throw new ErrorGeneracion(502, MENSAJE_FALLO);
  }
  await guardarEnCache(usuarioId, modelo.modelo, pendientes, traducidas);
  await cerrarGastoDeEjecucion(
    ejecucion.id,
    respuesta.creditos,
    "Traducción al inglés del texto que escribió el usuario.",
    "listo",
    traducidas.size,
  );
  return traducidas;
}

/** Traducciones de esos textos que ya estén en la caché de este usuario. */
async function deLaCache(usuarioId: string, entradas: readonly TextoATraducir[]): Promise<Map<string, string>> {
  const huellas = new Map(entradas.map((e) => [huellaDeTexto(e.texto), e.texto]));
  const filas = await db()
    .select({ huella: translationCache.sourceHash, target: translationCache.target })
    .from(translationCache)
    .where(and(eq(translationCache.userId, usuarioId), inArray(translationCache.sourceHash, [...huellas.keys()])));
  const traducidas = new Map<string, string>();
  for (const fila of filas) {
    const texto = huellas.get(fila.huella);
    if (texto !== undefined) traducidas.set(texto, fila.target);
  }
  return traducidas;
}

/** Elección del modelo de texto; si no hay ninguno utilizable, no se envía nada a generar. */
async function eleccionConTexto() {
  try {
    return await eleccionDeTexto();
  } catch (error) {
    if (error instanceof ErrorCatalogo) {
      throw new ErrorGeneracion(
        503,
        `${error.message} Esta instalación traduce los prompts al inglés antes de enviarlos, así que sin modelo de texto no se puede generar. Pídele a quien administra que lo revise.`,
      );
    }
    throw error;
  }
}

/**
 * Clave de idempotencia de la traducción: la huella del conjunto de textos más el número de intento.
 *
 * La huella serializa dos peticiones simultáneas del mismo texto (solo una llama al proveedor, la otra recibe
 * `nueva: false` y se detiene). El número de intento es lo que permite volver a intentarlo cuando el anterior
 * falló, sin que la clave quede quemada para siempre.
 */
async function claveDeTraduccion(usuarioId: string, pendientes: readonly TextoATraducir[]): Promise<string> {
  const huella = huellaDeTexto(
    pendientes
      .map((p) => huellaDeTexto(p.texto))
      .sort()
      .join("|"),
  );
  const prefijo = `traduccion:${huella}`;
  const [fila] = await db()
    .select({ total: sql<number>`count(*)::int` })
    .from(assistantRuns)
    .where(and(eq(assistantRuns.userId, usuarioId), like(assistantRuns.idempotencyKey, `${prefijo}%`)));
  return `${prefijo}:${(fila?.total ?? 0) + 1}`;
}

async function guardarEnCache(
  usuarioId: string,
  modelo: string,
  pendientes: readonly TextoATraducir[],
  traducidas: Map<string, string>,
): Promise<void> {
  const personajePorTexto = new Map(pendientes.map((p) => [p.texto, p.personajeId ?? null]));
  const filas = [...traducidas].map(([origen, ingles]) => ({
    userId: usuarioId,
    sourceHash: huellaDeTexto(origen),
    target: ingles,
    // Con personaje, la traducción se borra con él: su ficha lo describe a él.
    characterId: personajePorTexto.get(origen) ?? null,
    model: modelo,
  }));
  if (filas.length === 0) return;
  await db().insert(translationCache).values(filas).onConflictDoNothing();
}
