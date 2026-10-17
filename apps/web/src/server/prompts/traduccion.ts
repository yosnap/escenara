import { createHash } from "node:crypto";
import { and, eq, inArray, like, lt, sql } from "drizzle-orm";
import { INSTRUCCIONES_TRADUCCION, leerTraducciones, peticionDeTraduccion } from "@/lib/asistente";
import { type IntentoProveedor, mensajeDeFalloDeProveedor } from "@/lib/diagnostico-proveedor";
import { leerAjustes } from "../ajustes";
import { eleccionDeTexto } from "../asistente/texto";
import { conCerrojosConsultivos, ErrorConexionCerrojo } from "../db/cerrojos-consultivos";
import { db, type Ejecutor } from "../db/cliente";
import { assistantRuns, translationCache } from "../db/esquema";
import { ErrorGeneracion } from "../generacion/errores";
import { ErrorDeTexto, ErrorPeticionRepetida, pedirTextoPorMapa, type TextoDelMapa } from "../mapa/texto";
import type { Buscador } from "../proveedores/codigos";
import { ErrorCatalogo } from "../proveedores/contrato";

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
 *   veces. La caché es la dedupe de verdad; un cerrojo consultivo por usuario y texto serializa además dos
 *   peticiones simultáneas que lo comparten, para que solo una lo pague;
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
  /** Identificador del modelo cuyo coste se enseña: es la reserva de pago que se puede usar sin volver a preguntar. */
  modelo: string;
  /** Proveedor que cobraría esa traducción: es con cuyo cambio se convierte a euros. */
  proveedor: string;
}

export const TRADUCCION_APAGADA: EstadoTraduccion = {
  activa: false,
  creditos: 0,
  comprobado: "",
  sello: "",
  nombreModelo: "",
  modelo: "",
  proveedor: "",
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
      modelo: modelo.modelo,
      proveedor: modelo.proveedor,
    };
  } catch (error) {
    // Traducción encendida sin modelo utilizable: se dice en la estimación en lugar de sorprender al confirmar.
    if (error instanceof ErrorCatalogo) return TRADUCCION_APAGADA;
    throw error;
  }
}

/**
 * Encabezado de los fallos de traducción: qué se ha quedado sin hacer y qué significa para el dinero. La causa
 * concreta la añade `mensajeDeFalloDeProveedor` con todos los intentos (norma de errores visibles, 2026-09-28).
 */
const ENCABEZADO_FALLO =
  "No se ha podido traducir tu texto al inglés, así que no se ha enviado nada a generar y no se te ha cobrado la generación";

/** Fallo de traducción con todos los intentos contados, para que quien lo lea sepa qué se probó y por qué. */
function falloDeTraduccion(intentos: readonly IntentoProveedor[], sugerencia: string): ErrorGeneracion {
  return new ErrorGeneracion(502, mensajeDeFalloDeProveedor(ENCABEZADO_FALLO, intentos, sugerencia));
}

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

/**
 * Cada original con su versión en inglés y, si la escribió una reserva de pago porque falló la principal, el aviso
 * que hay que enseñar con el trabajo (proveedor y coste). Vacío en el caso normal.
 */
export class Traducciones extends Map<string, string> {
  aviso = "";
}

export async function traducirAlIngles(
  usuarioId: string,
  entradas: readonly TextoATraducir[],
  buscar: Buscador = fetch,
): Promise<Traducciones> {
  const resultado = new Traducciones();
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

  const { traducidas, aviso } = await pedirTraduccion(usuarioId, pendientes, estado.modelo, buscar);
  for (const [texto, ingles] of traducidas) resultado.set(texto, ingles);
  resultado.aviso = aviso;
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

/**
 * Traduce los textos que faltan, **con un solo traductor a la vez por usuario y texto**.
 *
 * Dos peticiones casi simultáneas que comparten un texto no pueden pagarlo dos veces: cada texto tiene su cerrojo
 * consultivo de PostgreSQL (por usuario y huella) y la petición toma los de todos sus textos. Si alguno lo tiene
 * otra, no llama a nadie: usa la caché si ya está todo, o recibe un 409. Y quien los toma **vuelve a mirar la
 * caché antes de llamar** y traduce solo lo que siga faltando: si otra petición terminó entre su primera lectura
 * y ahora, lo suyo ya está ahí y no se paga otra vez.
 *
 * Si el proceso muere a medias, PostgreSQL suelta los cerrojos con la sesión: una ejecución que se quede en
 * `reservado` no bloquea el texto (el barrido la cierra después, conservando su estimación). Tras un intento que
 * no sirvió —un fallo o una respuesta que no se pudo usar como traducción, que no deja nada en la caché— el
 * siguiente vuelve a llamar.
 *
 * Se exporta para poder comprobar con datos viejos (una caché leída antes de que otra petición terminara) que
 * no se vuelve a pagar.
 */
export async function pedirTraduccion(
  usuarioId: string,
  pendientes: TextoATraducir[],
  /** Modelo cuyo coste se enseñó y se confirmó al generar: puede hacer de reserva de pago, avisando. */
  modeloConfirmado: string,
  buscar: Buscador,
): Promise<{ traducidas: Map<string, string>; aviso: string }> {
  const cerrojos = pendientes.map((p) => `traduccion:${usuarioId}:${huellaDeTexto(p.texto)}`);
  let resultado: { traducidas: Map<string, string>; aviso: string } | null;
  try {
    resultado = await conCerrojosConsultivos(cerrojos, async () => {
      const traducidas = await deLaCache(usuarioId, pendientes);
      const faltan = pendientes.filter((p) => !traducidas.has(p.texto));
      if (faltan.length === 0) return { traducidas, aviso: "" };
      const clave = await claveDeTraduccion(usuarioId, `traduccion:${huellaDelConjunto(faltan)}`);
      const nuevas = await llamarAlTraductor(usuarioId, faltan, modeloConfirmado, buscar, clave);
      for (const [texto, ingles] of nuevas.traducidas) traducidas.set(texto, ingles);
      return { traducidas, aviso: nuevas.aviso };
    });
  } catch (error) {
    if (error instanceof ErrorConexionCerrojo) {
      throw new ErrorGeneracion(
        503,
        `No se ha podido preparar la traducción al inglés porque ${error.message}. No se ha enviado nada a generar ni se ha cobrado nada: vuelve a intentarlo en unos segundos.`,
      );
    }
    throw error;
  }
  return resultado ?? otraPeticionEnCurso(usuarioId, pendientes);
}

/**
 * Otra petición con alguno de estos textos llegó primero. No se llama otra vez —sería pagar dos veces lo mismo—,
 * pero sí se vuelve a mirar la caché: si la otra ya terminó y están todos, esto sigue sin gastar nada.
 */
async function otraPeticionEnCurso(
  usuarioId: string,
  pendientes: readonly TextoATraducir[],
): Promise<{ traducidas: Map<string, string>; aviso: string }> {
  const yaTraducidas = await deLaCache(usuarioId, pendientes);
  if (yaTraducidas.size === pendientes.length) return { traducidas: yaTraducidas, aviso: "" };
  // Y si no están, no se afirma nada sobre el cobro: no se sabe si la otra llamada ha terminado, ha fallado o
  // sigue en curso, y lo único seguro es que aquí no se ha enviado nada a generar.
  throw new ErrorGeneracion(
    409,
    "Tu texto se está traduciendo en otra petición que acabas de hacer. No se ha enviado nada a generar: espera unos segundos y vuelve a intentarlo.",
  );
}

/**
 * Traduce los textos que faltan **recorriendo el mapa de modelos de texto** del usuario (0.21.1): la entrada
 * principal primero y, si falla de forma que prueba que no cobró, la siguiente.
 *
 * **Sin doble cobro:** cada entrada cierra su propio gasto con la regla de lista blanca de siempre, y las que se
 * pagan por cuota del plan apuntan 0 créditos. Y si ninguna puede, el error dice **todas** las entradas probadas
 * con su causa concreta, nunca «vuelve a intentarlo».
 *
 * Lo que se confirmó antes de generar es el coste de la **entrada principal**, que es el techo: una reserva que
 * se pague por cuota cuesta menos, nunca más.
 */
async function llamarAlTraductor(
  usuarioId: string,
  pendientes: TextoATraducir[],
  modeloConfirmado: string,
  buscar: Buscador,
  claveIdempotencia: string,
): Promise<{ traducidas: Map<string, string>; aviso: string }> {
  const originales = pendientes.map((p) => p.texto);
  let resultado: TextoDelMapa;
  try {
    resultado = await pedirTextoPorMapa({
      usuarioId,
      kind: "traduccion",
      instrucciones: INSTRUCCIONES_TRADUCCION,
      entrada: peticionDeTraduccion(originales),
      claveIdempotencia,
      buscar,
      // El total que se confirmó al generar incluye la traducción **al precio de este modelo**: si la principal de
      // cuota falla, puede escribirla él, y se avisa con el trabajo (decisión del propietario, 2026-10-16).
      ...(modeloConfirmado === "" ? {} : { reservaConfirmada: modeloConfirmado }),
    });
  } catch (error) {
    if (error instanceof ErrorDeTexto) throw new ErrorGeneracion(502, error.mensaje(ENCABEZADO_FALLO));
    if (error instanceof ErrorPeticionRepetida) {
      // Red de seguridad: con los cerrojos tomados la clave no debería repetirse nunca. Si pasa, es un fallo
      // nuestro y se registra, pero tampoco se paga dos veces.
      console.error(
        `[traduccion] clave de idempotencia repetida con los cerrojos tomados (usuario ${usuarioId}, clave ${claveIdempotencia}): no se llama al proveedor`,
      );
      return otraPeticionEnCurso(usuarioId, pendientes);
    }
    if (error instanceof ErrorCatalogo) throw new ErrorGeneracion(error.estado, error.message);
    throw error;
  }

  const traducidas = leerTraducciones(resultado.texto, originales);
  if (traducidas.size !== originales.length) {
    throw falloDeTraduccion(
      [
        ...resultado.intentos,
        {
          proveedor: resultado.nombreProveedor,
          modelo: resultado.modelo,
          codigo: "respuesta-inesperada",
          // Ha contestado, así que si cobraba por petición ya ha cobrado: eso se dice.
          cobro: "cobrado",
          detalle: "contestó, pero su texto no se pudo usar como traducción",
        },
      ],
      "",
    );
  }
  await guardarEnCache(usuarioId, `${resultado.nombreProveedor}/${resultado.modelo}`, pendientes, traducidas);
  return { traducidas, aviso: resultado.aviso === "" ? "" : `Traducción al inglés: ${resultado.aviso}` };
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

/** Huella del conjunto de textos, sin importar el orden: es la que identifica una petición de traducción. */
function huellaDelConjunto(pendientes: readonly TextoATraducir[]): string {
  return huellaDeTexto(
    pendientes
      .map((p) => huellaDeTexto(p.texto))
      .sort()
      .join("|"),
  );
}

/**
 * Clave de idempotencia de un intento de traducción: el prefijo del conjunto que falta más el número de intento,
 * el mayor que haya con ese prefijo más uno.
 *
 * **Solo se calcula con los cerrojos de esos textos tomados**, así que nadie más inserta ejecuciones con este
 * prefijo mientras se calcula y la clave nunca choca. Lo que impide pagar dos veces lo mismo son los cerrojos más
 * la caché, no la clave: el número avanza con cada intento que llegó a apuntarse, sirviera o no.
 */
async function claveDeTraduccion(usuarioId: string, prefijo: string): Promise<string> {
  // Las claves son `<prefijo>:<intento>:<posición en el mapa>`: el intento es la tercera parte.
  const intento = sql`split_part(${assistantRuns.idempotencyKey}, ':', 3)`;
  const [fila] = await db()
    .select({ ultimo: sql<number>`coalesce(max(case when ${intento} ~ '^[0-9]+$' then ${intento}::int end), 0)::int` })
    .from(assistantRuns)
    .where(and(eq(assistantRuns.userId, usuarioId), like(assistantRuns.idempotencyKey, `${prefijo}:%`)));
  return `${prefijo}:${(fila?.ultimo ?? 0) + 1}`;
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
