import { esProveedor, type Proveedor } from "@/lib/boveda";
import { precioCaducado } from "@/lib/catalogo";
import type { Estimacion, TipoTrabajo } from "@/lib/generacion";
import { leerAjustes } from "../ajustes";
import { usarCredencial } from "../boveda/credenciales";
import type { Buscador } from "../proveedores/codigos";
import { ErrorCatalogo, ErrorProveedor } from "../proveedores/contrato";
import { adaptadorDe } from "../proveedores/registro";
import { type EleccionDeTrabajo, elegirParaTipo } from "./precios";

/**
 * Coste estimado de un trabajo y si el saldo del usuario alcanza. Los créditos vienen del catálogo de
 * modelos (registro versionado de precios) y el saldo, de la cuenta del propio usuario en el proveedor:
 * nada de esto se adivina.
 *
 * El equivalente en euros es orientativo (cambio configurable en Admin › Ajustes) y en la interfaz
 * siempre va etiquetado como estimación: el importe real lo decide el proveedor.
 */

/**
 * Caché corta del saldo por usuario: cargar `/crear` y pedir una estimación consultan lo mismo, y el saldo
 * no cambia si no se gasta. Se olvida al enviar un trabajo, para que la siguiente estimación sea fresca.
 */
const VIGENCIA_SALDO_MS = 30_000;
const saldos = new Map<string, { saldo: number | null; hasta: number }>();

const llave = (usuarioId: string, proveedor: string) => `${usuarioId}:${proveedor}`;

/** Olvida el saldo cacheado del usuario en todos los proveedores (acaba de gastar en alguno). */
export function olvidarSaldo(usuarioId: string): void {
  for (const clave of saldos.keys()) {
    if (clave.startsWith(`${usuarioId}:`)) saldos.delete(clave);
  }
}

/** Vacía la caché entera (cambios de credencial y tests). */
export function olvidarSaldos(): void {
  saldos.clear();
}

/**
 * Saldo de créditos del usuario en un proveedor, o `null` si no tiene clave utilizable, si el proveedor no
 * contesta o si ese proveedor no tiene adaptador todavía.
 */
export async function saldoDelUsuario(
  usuarioId: string,
  buscar: Buscador = fetch,
  proveedor: Proveedor = "kie",
): Promise<number | null> {
  const guardado = saldos.get(llave(usuarioId, proveedor));
  if (guardado && guardado.hasta > Date.now()) return guardado.saldo;
  const saldo = await leerSaldo(usuarioId, proveedor, buscar);
  saldos.set(llave(usuarioId, proveedor), { saldo, hasta: Date.now() + VIGENCIA_SALDO_MS });
  return saldo;
}

async function leerSaldo(usuarioId: string, proveedor: Proveedor, buscar: Buscador): Promise<number | null> {
  const clave = await usarCredencial(usuarioId, proveedor);
  if (!clave) return null;
  try {
    return await adaptadorDe(proveedor).probarCredencial({ clave, buscar });
  } catch (error) {
    // Sin saldo conocido no se bloquea la generación: el proveedor rechazará el trabajo si no llega, y
    // eso es mejor que impedir generar porque su API de saldo falle. Un proveedor sin adaptador tampoco
    // impide nada: simplemente no se sabe su saldo.
    if (error instanceof ErrorCatalogo) return null;
    if (!(error instanceof ErrorProveedor)) throw error;
    console.error(`[generacion] no se ha podido leer el saldo de ${proveedor}: ${error.codigo}`);
    return null;
  }
}

/** Proveedor del modelo si además puede tener credencial del usuario; `null` si no (no hay saldo que leer). */
const proveedorConSaldo = (eleccion: EleccionDeTrabajo): Proveedor | null =>
  esProveedor(eleccion.modelo.proveedor) ? eleccion.modelo.proveedor : null;

/** Saldo del proveedor del modelo elegido: se pregunta una vez por proveedor, no una por estimación. */
async function saldoDe(
  usuarioId: string,
  buscar: Buscador,
  elecciones: EleccionDeTrabajo[],
): Promise<Map<string, number | null>> {
  const proveedores = [...new Set(elecciones.map(proveedorConSaldo).filter((p): p is Proveedor => p !== null))];
  const leidos = await Promise.all(proveedores.map((p) => saldoDelUsuario(usuarioId, buscar, p)));
  return new Map(proveedores.map((p, i) => [p, leidos[i] ?? null]));
}

export async function estimar(
  usuarioId: string,
  tipo: TipoTrabajo,
  buscar: Buscador = fetch,
  modelo?: string | null,
): Promise<Estimacion> {
  const [eleccion, ajustes] = await Promise.all([elegirParaTipo(tipo, modelo), leerAjustes()]);
  const saldos = await saldoDe(usuarioId, buscar, [eleccion]);
  return conEleccion(eleccion, ajustes, saldos, tipo);
}

/**
 * Estimación de los dos tipos de trabajo leyendo el saldo una sola vez: la página de «Crear» necesita las
 * dos y no hay por qué preguntarle al proveedor dos veces lo mismo.
 */
export async function estimarTodo(
  usuarioId: string,
  buscar: Buscador = fetch,
  modelos: Partial<Record<TipoTrabajo, string>> = {},
): Promise<Record<TipoTrabajo, Estimacion>> {
  const [fotograma, animacion, ajustes] = await Promise.all([
    elegirParaTipo("fotograma", modelos.fotograma),
    elegirParaTipo("animacion", modelos.animacion),
    leerAjustes(),
  ]);
  const saldos = await saldoDe(usuarioId, buscar, [fotograma, animacion]);
  return {
    fotograma: conEleccion(fotograma, ajustes, saldos, "fotograma"),
    animacion: conEleccion(animacion, ajustes, saldos, "animacion"),
  };
}

function conEleccion(
  eleccion: EleccionDeTrabajo,
  ajustes: Awaited<ReturnType<typeof leerAjustes>>,
  saldos: Map<string, number | null>,
  tipo: TipoTrabajo,
): Estimacion {
  const { precio, modelo } = eleccion;
  const saldo = saldos.get(modelo.proveedor) ?? null;
  const creditos = Math.ceil(precio.creditos);
  return {
    tipo,
    modelo: precio.modelo,
    nombreModelo: modelo.nombre,
    conVoz: modelo.conVoz,
    unidad: precio.unidad,
    creditos,
    euros: creditos * ajustes.eurosPorCredito,
    saldo,
    // Solo se niega cuando se conoce el saldo y no llega.
    alcanza: saldo === null || saldo >= creditos,
    superaUmbral: creditos > ajustes.avisoCreditos,
    umbral: ajustes.avisoCreditos,
    fuente: precio.fuente,
    comprobado: precio.comprobado,
    precioAntiguo: precioCaducado(precio.comprobado),
    sello: precio.sello,
  };
}
