import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { AVISO_BOVEDA_USUARIO } from "@/lib/boveda";
import { COMPATIBLES_MAXIMOS, type CompatibleVista, modelosValidos, nombreValido } from "@/lib/compatible";
import { db } from "../db/cliente";
import { type FilaCompatible, openaiProviders } from "../db/esquema";
import { dentroDelLimite, type Limite } from "../limite";
import { ErrorCompatible, listarModelos, textoDeUrlBase, validarUrlBase } from "../proveedores/compatible/cliente";
import { bovedaDisponible, cifrar, descifrar, ErrorBoveda, pistaDe } from "./cifrado";
import { formatoValido } from "./proveedores";

/**
 * Servicios compatibles con la API de OpenAI que aporta cada usuario (0.21.1). A diferencia de la bóveda de
 * `credenciales.ts`, aquí puede haber **varios por persona** y cada uno trae su URL base y su lista ordenada de
 * modelos.
 *
 * Toda función recibe el `usuarioId` de la sesión ya comprobada y filtra por él: nadie puede leer, probar ni
 * borrar el proveedor de otra persona ni indicando su identificador. El secreto solo sale de aquí por
 * `usarCompatibles`, que se llama desde el servidor.
 */

/** Las pruebas salen a internet: se limitan por usuario para que nadie use la instalación como sonda. */
const LIMITE_PRUEBAS: Limite = { ventanaSegundos: 60 * 60, maximo: 20 };

const contexto = (usuarioId: string, id: string) => `compatible:${usuarioId}:${id}`;

const iso = (f: Date | null) => (f ? f.toISOString() : null);

export function aVista(fila: FilaCompatible): CompatibleVista {
  return {
    id: fila.id,
    nombre: fila.name,
    urlBase: fila.baseUrl,
    pista: fila.hint,
    modelos: fila.models,
    estado: fila.status,
    ultimoDetalle: fila.lastTestDetail,
    orden: fila.sortOrder,
    alta: fila.createdAt.toISOString(),
    ultimaPrueba: iso(fila.testedAt),
    ultimaRotacion: iso(fila.rotatedAt),
  };
}

export type ResultadoCompatible =
  | { ok: true; proveedores: CompatibleVista[]; mensaje: string }
  | { ok: false; error: string };

/** Proveedores compatibles del usuario, en el orden en que se prueban y sin secretos. */
export async function listarCompatibles(usuarioId: string): Promise<CompatibleVista[]> {
  const filas = await filasDe(usuarioId);
  return filas.map(aVista);
}

async function filasDe(usuarioId: string): Promise<FilaCompatible[]> {
  return db()
    .select()
    .from(openaiProviders)
    .where(eq(openaiProviders.userId, usuarioId))
    .orderBy(asc(openaiProviders.sortOrder), asc(openaiProviders.createdAt));
}

export interface DatosCompatible {
  nombre: unknown;
  urlBase: unknown;
  clave: unknown;
  modelos: unknown;
  /** Declaración del usuario: el servicio cobra por cuota de su plan, no por petición. */
  soloCuota?: unknown;
}

/**
 * Da de alta un servicio, o sustituye el que ya tuviera ese nombre. **Solo escribe si la prueba pasa**
 * (`GET {base}/models`, que no cuesta nada): lo que había sigue en su sitio si lo nuevo no vale.
 */
export async function guardarCompatible(
  usuarioId: string,
  datos: DatosCompatible,
  buscar?: Parameters<typeof listarModelos>[0]["buscar"],
): Promise<ResultadoCompatible> {
  if (!bovedaDisponible()) return { ok: false, error: AVISO_BOVEDA_USUARIO };
  const nombre = nombreValido(datos.nombre);
  if (!nombre) return { ok: false, error: "Ponle un nombre corto al servicio, sin saltos de línea." };
  const modelos = modelosValidos(datos.modelos);
  if (!modelos) {
    return { ok: false, error: "Indica al menos un modelo de texto y como mucho doce, uno por línea." };
  }
  if (typeof datos.clave !== "string" || !formatoValido(datos.clave.trim())) {
    return { ok: false, error: "Esa clave no tiene el aspecto esperado. Cópiala completa, sin espacios." };
  }
  if (datos.soloCuota !== true) {
    return {
      ok: false,
      error:
        "De momento Escenara solo usa servicios que cobran por cuota de tu plan y no por petición: sin una tarifa por petición no puede estimar ni confirmar lo que costaría cada llamada. Si este servicio es de cuota, márcalo en la casilla.",
    };
  }
  const clave = datos.clave.trim();
  let urlBase: string;
  try {
    urlBase = textoDeUrlBase(validarUrlBase(datos.urlBase));
  } catch (error) {
    const detalle = error instanceof ErrorCompatible && error.detalle !== "" ? ` (${error.detalle})` : "";
    return { ok: false, error: `La dirección del servicio no sirve${detalle}. Tiene que ser una https pública.` };
  }
  if (!(await dentroDelLimite(`boveda:prueba:${usuarioId}`, LIMITE_PRUEBAS))) {
    return { ok: false, error: "Has probado demasiadas claves seguidas. Espera un rato." };
  }

  const existentes = await filasDe(usuarioId);
  const previa = existentes.find((f) => f.name === nombre) ?? null;
  if (!previa && existentes.length >= COMPATIBLES_MAXIMOS) {
    return { ok: false, error: `No puedes tener más de ${COMPATIBLES_MAXIMOS} servicios compatibles a la vez.` };
  }

  let ofrecidos: string[];
  try {
    ofrecidos = await listarModelos({ urlBase, clave, buscar });
  } catch (error) {
    return { ok: false, error: mensajeDePrueba(nombre, error) };
  }
  // Aviso, no freno: un servicio puede no listar todos los modelos que de hecho atiende.
  const desconocidos = modelos.filter((m) => !ofrecidos.includes(m));

  const ahora = new Date();
  const id = previa?.id ?? randomUUID();
  const valores = {
    name: nombre,
    baseUrl: urlBase,
    secret: cifrar(clave, contexto(usuarioId, id)),
    hint: pistaDe(clave),
    models: modelos,
    quotaBilling: true,
    status: "valida" as const,
    lastTestCode: "ok",
    lastTestDetail: `${ofrecidos.length} modelos disponibles`,
    testedAt: ahora,
  };
  if (previa) {
    await db()
      .update(openaiProviders)
      .set({ ...valores, rotatedAt: ahora })
      .where(eq(openaiProviders.id, previa.id));
  } else {
    await db()
      .insert(openaiProviders)
      .values({ id, userId: usuarioId, sortOrder: existentes.length, ...valores });
  }
  const aviso =
    desconocidos.length === 0
      ? ""
      : ` Ojo: ${desconocidos.join(", ")} no ${desconocidos.length === 1 ? "aparece" : "aparecen"} en su lista de modelos, así que puede que no ${desconocidos.length === 1 ? "responda" : "respondan"}.`;
  return {
    ok: true,
    proveedores: await listarCompatibles(usuarioId),
    mensaje: `${nombre} responde y ofrece ${ofrecidos.length} modelos.${aviso}`,
  };
}

/** Vuelve a probar la clave guardada de ese servicio y actualiza su estado. */
export async function probarCompatible(
  usuarioId: string,
  id: string,
  buscar?: Parameters<typeof listarModelos>[0]["buscar"],
): Promise<ResultadoCompatible> {
  if (!bovedaDisponible()) return { ok: false, error: AVISO_BOVEDA_USUARIO };
  if (!(await dentroDelLimite(`boveda:prueba:${usuarioId}`, LIMITE_PRUEBAS))) {
    return { ok: false, error: "Has probado demasiadas claves seguidas. Espera un rato." };
  }
  const fila = await filaDe(usuarioId, id);
  if (!fila) return { ok: false, error: "No tienes ningún servicio guardado con ese identificador." };
  const clave = descifrarFila(fila);
  if (!clave) {
    return { ok: false, error: "La clave guardada no se puede leer en esta instalación. Bórrala y guárdala otra vez." };
  }
  try {
    const ofrecidos = await listarModelos({ urlBase: fila.baseUrl, clave, buscar });
    await db()
      .update(openaiProviders)
      .set({
        status: "valida",
        lastTestCode: "ok",
        lastTestDetail: `${ofrecidos.length} modelos disponibles`,
        testedAt: new Date(),
      })
      .where(eq(openaiProviders.id, fila.id));
    return {
      ok: true,
      proveedores: await listarCompatibles(usuarioId),
      mensaje: `${fila.name} responde y ofrece ${ofrecidos.length} modelos.`,
    };
  } catch (error) {
    await db()
      .update(openaiProviders)
      .set({
        status: "invalida",
        lastTestCode: error instanceof ErrorCompatible ? error.codigo : "respuesta-inesperada",
        lastTestDetail: null,
        testedAt: new Date(),
      })
      .where(eq(openaiProviders.id, fila.id));
    return { ok: false, error: mensajeDePrueba(fila.name, error) };
  }
}

/** Borra el servicio del usuario. Devuelve `false` si no había ninguno con ese identificador. */
export async function borrarCompatible(usuarioId: string, id: string): Promise<boolean> {
  const borrados = await db()
    .delete(openaiProviders)
    .where(and(eq(openaiProviders.userId, usuarioId), eq(openaiProviders.id, id)))
    .returning({ id: openaiProviders.id });
  return borrados.length > 0;
}

/** Un servicio compatible con su clave en claro, listo para llamar. **Solo para código de servidor.** */
export interface CompatibleUtilizable {
  id: string;
  nombre: string;
  urlBase: string;
  clave: string;
  modelos: readonly string[];
}

/**
 * Servicios compatibles de este usuario que se pueden usar ahora mismo, **en el orden en que se prueban**: los
 * marcados como no válidos y los que no se pueden descifrar quedan fuera, porque llamar con ellos solo serviría
 * para repetir un rechazo que ya se conoce.
 */
export async function usarCompatibles(usuarioId: string): Promise<CompatibleUtilizable[]> {
  if (!bovedaDisponible()) return [];
  const filas = await filasDe(usuarioId);
  const utilizables: CompatibleUtilizable[] = [];
  for (const fila of filas) {
    // Sin la declaración de cuota no se usa: sus llamadas podrían cobrar por petición sin que nadie lo estimara.
    if (fila.status !== "valida" || fila.models.length === 0 || !fila.quotaBilling) continue;
    const clave = descifrarFila(fila);
    if (clave) utilizables.push({ id: fila.id, nombre: fila.name, urlBase: fila.baseUrl, clave, modelos: fila.models });
  }
  return utilizables;
}

/** Marca un servicio como no válido tras un rechazo de credencial durante una llamada real. */
export async function marcarCompatibleInvalido(id: string, codigo: string): Promise<void> {
  await db()
    .update(openaiProviders)
    .set({ status: "invalida", lastTestCode: codigo, testedAt: new Date() })
    .where(eq(openaiProviders.id, id));
}

async function filaDe(usuarioId: string, id: string): Promise<FilaCompatible | null> {
  const [fila] = await db()
    .select()
    .from(openaiProviders)
    .where(and(eq(openaiProviders.userId, usuarioId), eq(openaiProviders.id, id)));
  return fila ?? null;
}

/** Descifra el valor guardado; `null` si no se puede, registrando el motivo y nunca el valor. */
function descifrarFila(fila: FilaCompatible): string | null {
  try {
    return descifrar(fila.secret, contexto(fila.userId, fila.id));
  } catch (error) {
    const motivo = error instanceof ErrorBoveda ? error.motivo : "desconocido";
    console.error(`[boveda] clave ilegible de un servicio compatible: ${motivo}`);
    return null;
  }
}

/**
 * Mensaje de una prueba fallida: dice el servicio, la causa concreta y qué hacer. **Nunca la clave**: lo único
 * que sale del error ajeno es la precisión que haya sacado la lista blanca.
 */
function mensajeDePrueba(nombre: string, error: unknown): string {
  if (!(error instanceof ErrorCompatible)) {
    return `${nombre} no ha contestado algo que se entienda. Revisa la dirección del servicio.`;
  }
  const detalle = error.detalle === "" ? "" : ` (${error.detalle})`;
  const causa: Record<string, string> = {
    formato: "no admite esa dirección",
    rechazada: "ha rechazado la clave",
    "sin-credito": "dice que esa cuenta no tiene cuota",
    limite: "ha pedido esperar por exceso de peticiones",
    "error-proveedor": "ha devuelto un error interno suyo",
    "sin-red": "no ha contestado: no se ha podido contactar con él",
    "tiempo-agotado": "ha tardado demasiado en responder",
    "respuesta-inesperada": "ha contestado algo que no se entiende",
  };
  return `${nombre} ${causa[error.codigo] ?? "ha fallado"}${detalle}. No se ha guardado nada y la prueba no gasta cuota.`;
}
