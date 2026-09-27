import { and, eq } from "drizzle-orm";
import type { CodigoPrueba, CredencialVista, Proveedor } from "@/lib/boveda";
import { db } from "../db/cliente";
import { providerCredentials } from "../db/esquema";
import { dentroDelLimite, type Limite } from "../limite";
import { AVISO_BOVEDA_USUARIO, bovedaDisponible, cifrar, descifrar, ErrorBoveda, pistaDe } from "./cifrado";
import { type Buscador, probarClave } from "./proveedores";

/**
 * Credenciales de IA que aporta cada usuario (BYOK, RF01). Una por usuario y proveedor. El secreto solo
 * sale de aquí a través de `usarCredencial`, que se llama desde el servidor: ninguna función de este
 * módulo devuelve el valor en claro dentro de una vista.
 *
 * Toda función recibe el `usuarioId` de la sesión ya comprobada y filtra por él: nadie puede leer, probar,
 * rotar ni borrar la credencial de otra persona ni indicando su proveedor.
 */

/** Las pruebas salen a internet: se limitan por usuario para que nadie use la instalación como sonda. */
const LIMITE_PRUEBAS: Limite = { ventanaSegundos: 60 * 60, maximo: 20 };

export type MotivoFallo =
  | { motivo: "boveda"; mensaje: string }
  | { motivo: "limite"; mensaje: string }
  | { motivo: "prueba"; codigo: CodigoPrueba }
  | { motivo: "sin-credencial"; mensaje: string }
  | { motivo: "sustituida"; mensaje: string };

export type ResultadoCredencial = { ok: true; credencial: CredencialVista } | ({ ok: false } & MotivoFallo);

const contexto = (usuarioId: string, proveedor: Proveedor) => `credencial:${usuarioId}:${proveedor}`;

const iso = (f: Date | null) => (f ? f.toISOString() : null);

function aVista(fila: typeof providerCredentials.$inferSelect): CredencialVista {
  return {
    proveedor: fila.provider,
    pista: fila.hint,
    estado: fila.status,
    ultimoCodigo: (fila.lastTestCode as CodigoPrueba | null) ?? null,
    ultimoDetalle: fila.lastTestDetail,
    alta: fila.createdAt.toISOString(),
    ultimaPrueba: iso(fila.testedAt),
    ultimaRotacion: iso(fila.rotatedAt),
  };
}

/** Credenciales del usuario, sin secretos. */
export async function listarCredenciales(usuarioId: string): Promise<CredencialVista[]> {
  const filas = await db().select().from(providerCredentials).where(eq(providerCredentials.userId, usuarioId));
  return filas.map(aVista);
}

/**
 * Guarda una credencial nueva o sustituye la que hubiera. Solo escribe si la prueba pasa: la clave
 * anterior sigue en su sitio si la nueva no vale.
 */
export async function guardarCredencial(
  usuarioId: string,
  proveedor: Proveedor,
  secreto: string,
  buscar?: Buscador,
): Promise<ResultadoCredencial> {
  if (!bovedaDisponible()) return { ok: false, motivo: "boveda", mensaje: AVISO_BOVEDA_USUARIO };
  if (!(await dentroDelLimite(`boveda:prueba:${usuarioId}`, LIMITE_PRUEBAS))) {
    return { ok: false, motivo: "limite", mensaje: "Has probado demasiadas claves seguidas. Espera un rato." };
  }
  const resultado = await probarClave(proveedor, secreto, buscar);
  if (!resultado.ok) return { ok: false, motivo: "prueba", codigo: resultado.codigo };

  const ahora = new Date();
  const valores = {
    secret: cifrar(secreto, contexto(usuarioId, proveedor)),
    hint: pistaDe(secreto),
    status: "valida" as const,
    lastTestCode: resultado.codigo,
    lastTestDetail: resultado.detalle ?? null,
    testedAt: ahora,
  };
  const [fila] = await db()
    .insert(providerCredentials)
    .values({ userId: usuarioId, provider: proveedor, ...valores })
    .onConflictDoUpdate({
      target: [providerCredentials.userId, providerCredentials.provider],
      set: { ...valores, rotatedAt: ahora },
    })
    .returning();
  if (!fila) throw new Error("No se ha podido guardar la credencial.");
  // `rotatedAt` solo se rellena en el camino de conflicto: el alta queda en `createdAt`.
  return { ok: true, credencial: aVista(fila) };
}

/** Vuelve a probar la credencial guardada y actualiza su estado. */
export async function probarCredencial(
  usuarioId: string,
  proveedor: Proveedor,
  buscar?: Buscador,
): Promise<ResultadoCredencial> {
  if (!bovedaDisponible()) return { ok: false, motivo: "boveda", mensaje: AVISO_BOVEDA_USUARIO };
  if (!(await dentroDelLimite(`boveda:prueba:${usuarioId}`, LIMITE_PRUEBAS))) {
    return { ok: false, motivo: "limite", mensaje: "Has probado demasiadas claves seguidas. Espera un rato." };
  }
  const fila = await filaDe(usuarioId, proveedor);
  if (!fila) {
    return { ok: false, motivo: "sin-credencial", mensaje: "No tienes ninguna clave guardada para este proveedor." };
  }
  const secreto = descifrarFila(fila.secret, usuarioId, proveedor);
  if (!secreto) {
    // Hay fila, pero su valor no se puede leer (clave maestra cambiada sin recifrar): no es lo mismo que no
    // tener ninguna, y quien usa la aplicación necesita saber qué hacer.
    return {
      ok: false,
      motivo: "sin-credencial",
      mensaje: "La clave guardada no se puede leer en esta instalación. Bórrala y vuelve a guardarla.",
    };
  }
  const resultado = await probarClave(proveedor, secreto, buscar);
  // Se actualiza esa fila y solo si su valor sigue siendo el que se probó: si alguien la sustituyó
  // mientras tanto, el estado de la clave nueva no se pisa con el resultado de la vieja.
  const [actualizada] = await db()
    .update(providerCredentials)
    .set({
      status: resultado.ok ? "valida" : "invalida",
      lastTestCode: resultado.codigo,
      lastTestDetail: resultado.detalle ?? null,
      testedAt: new Date(),
    })
    .where(and(eq(providerCredentials.id, fila.id), eq(providerCredentials.secret, fila.secret)))
    .returning();
  if (!actualizada) {
    return {
      ok: false,
      motivo: "sustituida",
      mensaje: "La clave ha cambiado mientras se probaba. Vuelve a probar la que hay guardada ahora.",
    };
  }
  return resultado.ok
    ? { ok: true, credencial: aVista(actualizada) }
    : { ok: false, motivo: "prueba", codigo: resultado.codigo };
}

/** Borra la credencial del usuario. Devuelve `false` si no había ninguna. */
export async function borrarCredencial(usuarioId: string, proveedor: Proveedor): Promise<boolean> {
  const borradas = await db()
    .delete(providerCredentials)
    .where(and(eq(providerCredentials.userId, usuarioId), eq(providerCredentials.provider, proveedor)))
    .returning({ id: providerCredentials.id });
  return borradas.length > 0;
}

/**
 * Secreto en claro de una credencial, **solo para código de servidor** (los adaptadores de generación
 * desde la 0.10.0). Nunca se devuelve a una acción de servidor ni a una ruta de API tal cual.
 * `null` si no hay credencial; si el valor guardado no se puede descifrar, se devuelve `null` y se
 * registra el motivo sin el valor.
 */
export async function usarCredencial(usuarioId: string, proveedor: Proveedor): Promise<string | null> {
  if (!bovedaDisponible()) return null;
  const fila = await filaDe(usuarioId, proveedor);
  return fila ? descifrarFila(fila.secret, usuarioId, proveedor) : null;
}

/** Identificador y valor cifrado de la credencial del usuario, o `null` si no tiene ninguna. */
async function filaDe(usuarioId: string, proveedor: Proveedor) {
  const [fila] = await db()
    .select({ id: providerCredentials.id, secret: providerCredentials.secret })
    .from(providerCredentials)
    .where(and(eq(providerCredentials.userId, usuarioId), eq(providerCredentials.provider, proveedor)));
  return fila ?? null;
}

/** Descifra el valor guardado; `null` si no se puede, registrando el motivo y nunca el valor. */
function descifrarFila(valor: string, usuarioId: string, proveedor: Proveedor): string | null {
  try {
    return descifrar(valor, contexto(usuarioId, proveedor));
  } catch (error) {
    const motivo = error instanceof ErrorBoveda ? error.motivo : "desconocido";
    console.error(`[boveda] credencial ilegible (proveedor ${proveedor}): ${motivo}`);
    return null;
  }
}
