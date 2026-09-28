import { esProveedor, type Proveedor } from "@/lib/boveda";
import { duracionesConCoste, precioCaducado, segundosDeUnidad } from "@/lib/catalogo";
import type { Estimacion, TipoTrabajo } from "@/lib/generacion";
import { eurosPorCreditoDe, leerAjustes } from "../ajustes";
import { usarCredencial } from "../boveda/credenciales";
import { eleccionDeGeneracion, type ModoDeGeneracion } from "../mapa/generacion";
import { type EstadoTraduccion, estadoDeTraduccion } from "../prompts/traduccion";
import type { Buscador } from "../proveedores/codigos";
import { ErrorCatalogo, ErrorProveedor } from "../proveedores/contrato";
import { adaptadorDe } from "../proveedores/registro";
import type { EleccionDeTrabajo } from "./precios";

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
  /**
   * Cómo se va a generar (0.23.4): sin imagen de partida el modelo tiene que ser de **texto a imagen**, y la
   * duración elegida decide qué tarifa del modelo se cobra. Lo que se estima aquí es lo que se enviará: el
   * mismo modelo, la misma tarifa y el mismo sello.
   */
  modo: ModoDeGeneracion = {},
): Promise<Estimacion> {
  /**
   * Con qué se generaría **según el mapa de este usuario** (0.22.0), salvo que haya elegido modelo a mano en
   * «Crear»: entonces manda su elección. Es la misma resolución que usa la puerta al encolar, así que lo que se
   * estima es lo que se va a enviar.
   */
  const [{ elegida }, ajustes, traduccion] = await Promise.all([
    eleccionDeGeneracion(usuarioId, tipo, modelo, modo),
    leerAjustes(),
    estadoDeTraduccion(),
  ]);
  const eleccion = elegida.eleccion;
  const saldos = await saldoDe(usuarioId, buscar, [eleccion]);
  return conEleccion(eleccion, ajustes, saldos, tipo, traduccion, modo);
}

/**
 * Estimación de los dos tipos de trabajo leyendo el saldo una sola vez: la página de «Crear» necesita las
 * dos y no hay por qué preguntarle al proveedor dos veces lo mismo.
 */
export async function estimarTodo(
  usuarioId: string,
  buscar: Buscador = fetch,
  modelos: Partial<Record<TipoTrabajo, string>> = {},
  modos: Partial<Record<TipoTrabajo, ModoDeGeneracion>> = {},
): Promise<Record<TipoTrabajo, Estimacion>> {
  const [porFotograma, porAnimacion, ajustes, traduccion] = await Promise.all([
    eleccionDeGeneracion(usuarioId, "fotograma", modelos.fotograma, modos.fotograma ?? {}),
    eleccionDeGeneracion(usuarioId, "animacion", modelos.animacion, modos.animacion ?? {}),
    leerAjustes(),
    estadoDeTraduccion(),
  ]);
  const fotograma = porFotograma.elegida.eleccion;
  const animacion = porAnimacion.elegida.eleccion;
  const saldos = await saldoDe(usuarioId, buscar, [fotograma, animacion]);
  return {
    fotograma: conEleccion(fotograma, ajustes, saldos, "fotograma", traduccion, modos.fotograma ?? {}),
    animacion: conEleccion(animacion, ajustes, saldos, "animacion", traduccion, modos.animacion ?? {}),
  };
}

function conEleccion(
  eleccion: EleccionDeTrabajo,
  ajustes: Awaited<ReturnType<typeof leerAjustes>>,
  saldos: Map<string, number | null>,
  tipo: TipoTrabajo,
  traduccion: EstadoTraduccion,
  modo: ModoDeGeneracion,
): Estimacion {
  const { precio, modelo } = eleccion;
  const saldo = saldos.get(modelo.proveedor) ?? null;
  const creditos = Math.ceil(precio.creditos);
  // El umbral de aviso se mide sobre **lo que el usuario va a confirmar**, que incluye la traducción: si no, el
  // servidor pediría el aviso y la casilla no aparecería.
  const totales = creditos + (traduccion.activa ? traduccion.creditos : 0);
  return {
    tipo,
    modelo: precio.modelo,
    nombreModelo: modelo.nombre,
    conVoz: modelo.conVoz,
    unidad: precio.unidad,
    creditos,
    euros: creditos * eurosPorCreditoDe(ajustes, modelo.proveedor),
    saldo,
    // Solo se niega cuando se conoce el saldo y no llega.
    alcanza: saldo === null || saldo >= totales,
    superaUmbral: totales > ajustes.avisoCreditos,
    umbral: ajustes.avisoCreditos,
    fuente: precio.fuente,
    comprobado: precio.comprobado,
    precioAntiguo: precioCaducado(precio.comprobado),
    sello: precio.sello,
    // La traducción es un coste aparte del modelo de imagen o vídeo: se muestra como tal y **no** entra en los
    // créditos que se confirman, que son los del modelo. Su reserva es su propio apunte.
    /**
     * La duración estimada es la de la **tarifa que se ha leído**, no la que pidiera la pantalla: si el modelo
     * no tarifa esa duración, aquí se ve la que sí cobra y el envío la vuelve a comprobar antes de gastar.
     */
    segundos: segundosDeUnidad(precio.unidad) ?? modo.segundos ?? null,
    duraciones: duracionesConCoste(modelo),
    sinReferencia: modo.sinReferencia === true,
    traduccion: traduccion.activa
      ? {
          creditos: traduccion.creditos,
          euros: traduccion.creditos * eurosPorCreditoDe(ajustes, traduccion.proveedor),
          comprobado: traduccion.comprobado,
          nombreModelo: traduccion.nombreModelo,
        }
      : null,
  };
}
