import type { Estimacion, TipoTrabajo } from "@/lib/generacion";
import { leerAjustes } from "../ajustes";
import { usarCredencial } from "../boveda/credenciales";
import type { Buscador } from "../proveedores/codigos";
import { ErrorKie, saldoCreditos } from "../proveedores/kie/cliente";
import { precioDe } from "./precios";

/**
 * Coste estimado de un trabajo y si el saldo del usuario alcanza. Los créditos vienen del registro de
 * precios y el saldo, de la cuenta del propio usuario en el proveedor: nada de esto se adivina.
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

export function olvidarSaldo(usuarioId: string): void {
  saldos.delete(usuarioId);
}

/** Vacía la caché entera (cambios de credencial y tests). */
export function olvidarSaldos(): void {
  saldos.clear();
}

/** Saldo de créditos del usuario, o `null` si no tiene clave o el proveedor no contesta. */
export async function saldoDelUsuario(usuarioId: string, buscar: Buscador = fetch): Promise<number | null> {
  const guardado = saldos.get(usuarioId);
  if (guardado && guardado.hasta > Date.now()) return guardado.saldo;
  const saldo = await leerSaldo(usuarioId, buscar);
  saldos.set(usuarioId, { saldo, hasta: Date.now() + VIGENCIA_SALDO_MS });
  return saldo;
}

async function leerSaldo(usuarioId: string, buscar: Buscador): Promise<number | null> {
  const clave = await usarCredencial(usuarioId, "kie");
  if (!clave) return null;
  try {
    return await saldoCreditos(clave, buscar);
  } catch (error) {
    // Sin saldo conocido no se bloquea la generación: el proveedor rechazará el trabajo si no llega, y
    // eso es mejor que impedir generar porque su API de saldo falle.
    if (!(error instanceof ErrorKie)) throw error;
    console.error(`[generacion] no se ha podido leer el saldo de KIE: ${error.codigo}`);
    return null;
  }
}

export async function estimar(usuarioId: string, tipo: TipoTrabajo, buscar: Buscador = fetch): Promise<Estimacion> {
  const [precio, ajustes, saldo] = await Promise.all([
    precioDe(tipo),
    leerAjustes(),
    saldoDelUsuario(usuarioId, buscar),
  ]);
  return conPrecio(precio, ajustes, saldo, tipo);
}

/**
 * Estimación de los dos tipos de trabajo leyendo el saldo una sola vez: la página de «Crear» necesita las
 * dos y no hay por qué preguntarle al proveedor dos veces lo mismo.
 */
export async function estimarTodo(
  usuarioId: string,
  buscar: Buscador = fetch,
): Promise<Record<TipoTrabajo, Estimacion>> {
  const [fotograma, animacion, ajustes, saldo] = await Promise.all([
    precioDe("fotograma"),
    precioDe("animacion"),
    leerAjustes(),
    saldoDelUsuario(usuarioId, buscar),
  ]);
  return {
    fotograma: conPrecio(fotograma, ajustes, saldo, "fotograma"),
    animacion: conPrecio(animacion, ajustes, saldo, "animacion"),
  };
}

function conPrecio(
  precio: Awaited<ReturnType<typeof precioDe>>,
  ajustes: Awaited<ReturnType<typeof leerAjustes>>,
  saldo: number | null,
  tipo: TipoTrabajo,
): Estimacion {
  const creditos = Math.ceil(precio.creditos);
  return {
    tipo,
    modelo: precio.modelo,
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
  };
}
